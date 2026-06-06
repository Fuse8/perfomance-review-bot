import type { AppConfig } from "./config.js";
import { readFileSync } from "node:fs";
import {
  createCalendarEvent,
  createReviewerReminderEvents,
  type CreatedReviewerReminderEvent,
  type CreatedCalendarEvent
} from "./calendar.js";
import {
  createReviewFolder,
  findEmployeeFolder,
  findPreviousReviewReport,
  type CreatedFolder
} from "./drive.js";
import { buildAuthCheckReport } from "./chat-auth-check.js";
import { sendChatMessage } from "./google-chat.js";
import { formatAuthRequiredMessage, isOAuthAuthError } from "./oauth-errors.js";
import { buildAuthUrl } from "./oauth.js";
import { searchDirectoryEmployees } from "./people.js";
import type { TokenStorage } from "./storage.js";
import type { ChatEvent, ChatFormInput, ReviewRequest } from "./types.js";

const SUBMIT_FUNCTION = "submitReview";
const SELECT_EMPLOYEE_FUNCTION = "selectEmployee";
const CHECK_EMPLOYEE_FOLDER_FUNCTION = "checkEmployeeFolder";
const CONFIRM_WITHOUT_PREVIOUS_FUNCTION = "confirmReviewWithoutPrevious";
const ADDED_TO_SPACE_EVENT = "ADDED_TO_SPACE";
const REVIEW_COMMAND_ID = 1;
const INFO_COMMAND_ID = 2;
const CHECK_AUTH_COMMAND_ID = 3;
const REVIEW_WORKFLOW_ACK_MESSAGE = "Запустил подготовку PR. Результат пришлю сюда.";
const BOT_VERSION = readBotVersion();

type ReviewWorkflowParams = {
  config: AppConfig;
  storage: TokenStorage;
  chatUserId: string;
  event: ChatEvent;
  refreshToken: string;
  reviewerEmail: string;
  request: ReviewRequest;
  reviewMonth: string;
  previousReviewUrl: string;
};

type ReviewWorkflowResult = {
  textLength: number;
  remindersCount: number;
  hasCalendar: boolean;
};
const EMPLOYEE_SEARCH_NO_RESULTS_VALUE = "__no_results__";
const EMPLOYEE_SEARCH_NO_RESULTS_TEXT = "Сотрудник не найден";
const EMPLOYEE_SEARCH_NO_RESULTS_HINT = "Попробуйте поиск по другому параметру или на английском языке";
const TRANSLIT_REPLACEMENTS: Array<[string, string]> = [
  ["sch", "щ"],
  ["yo", "ё"],
  ["yu", "ю"],
  ["ya", "я"],
  ["ye", "е"],
  ["zh", "ж"],
  ["ch", "ч"],
  ["sh", "ш"],
  ["kh", "х"],
  ["lts", "льц"],
  ["ts", "ц"],
  ["ey", "ей"],
  ["ry", "рий"],
  ["iy", "ий"],
  ["a", "а"],
  ["b", "б"],
  ["v", "в"],
  ["g", "г"],
  ["d", "д"],
  ["e", "е"],
  ["z", "з"],
  ["i", "и"],
  ["y", "й"],
  ["k", "к"],
  ["l", "л"],
  ["m", "м"],
  ["n", "н"],
  ["o", "о"],
  ["p", "п"],
  ["r", "р"],
  ["s", "с"],
  ["t", "т"],
  ["u", "у"],
  ["f", "ф"],
  ["h", "х"],
  ["c", "к"],
  ["j", "дж"],
  ["w", "в"],
  ["x", "кс"],
  ["q", "к"]
];
const REVERSE_TRANSLIT_REPLACEMENTS = buildReverseTranslReplacements(TRANSLIT_REPLACEMENTS);

type ChatEventHandlerDeps = {
  createReviewFolder: typeof createReviewFolder;
  createCalendarEvent: typeof createCalendarEvent;
  createReviewerReminderEvents: typeof createReviewerReminderEvents;
  findEmployeeFolder: typeof findEmployeeFolder;
  findPreviousReviewReport: typeof findPreviousReviewReport;
  searchDirectoryEmployees: typeof searchDirectoryEmployees;
  buildAuthUrl: typeof buildAuthUrl;
  sendChatMessage: typeof sendChatMessage;
  buildAuthCheckReport: typeof buildAuthCheckReport;
};

const defaultDeps: ChatEventHandlerDeps = {
  createReviewFolder,
  createCalendarEvent,
  createReviewerReminderEvents,
  findEmployeeFolder,
  findPreviousReviewReport,
  searchDirectoryEmployees,
  buildAuthUrl,
  sendChatMessage,
  buildAuthCheckReport
};

export function createChatEventHandler(deps: Partial<ChatEventHandlerDeps> = {}) {
  const resolvedDeps = { ...defaultDeps, ...deps };

  return async function handleChatEventWithDeps(
    config: AppConfig,
    storage: TokenStorage,
    event: ChatEvent
  ): Promise<Record<string, unknown>> {
    const chatUserId = event.user?.name;
    const appCommandId = resolveAppCommandId(event);
    const invokedFunction = event.common?.invokedFunction;
    const actionName = resolveActionName(event);
    const formInputs = event.common?.formInputs ?? {};

    logChatEvent("received", {
      appCommandId,
      actionName,
      invokedFunction,
      hasChatUserId: Boolean(chatUserId),
      formInputKeys: Object.keys(formInputs),
      dialogEventType: event.dialogEventType,
      isDialogEvent: event.isDialogEvent,
      spaceName: resolveChatSpaceName(event)
    });

    if (event.type === ADDED_TO_SPACE_EVENT) {
      logChatEvent("route.addedToSpace");
      return handleAddedToSpace(config, storage, chatUserId, resolvedDeps);
    }

    if (isEmployeeSuggestionsEvent(config, event, invokedFunction)) {
      logChatEvent("route.employeeSuggestions");
      return handleEmployeeSuggestions(config, storage, chatUserId, event, resolvedDeps);
    }

    if (appCommandId === INFO_COMMAND_ID) {
      logChatEvent("route.info");
      return textResponse(buildInfoMessage());
    }

    if (appCommandId === CHECK_AUTH_COMMAND_ID) {
      logChatEvent("route.checkAuth");
      const report = await resolvedDeps.buildAuthCheckReport(config, storage, chatUserId);
      return textResponse(report);
    }

    if (!chatUserId) {
      logChatEvent("route.missingUser");
      return textResponse("Не удалось определить пользователя Google Chat.");
    }

    if (actionName === SUBMIT_FUNCTION) {
      logChatEvent("route.submit");
      return handleReviewSubmit(config, storage, chatUserId, event, resolvedDeps);
    }

    if (actionName === CHECK_EMPLOYEE_FOLDER_FUNCTION) {
      logChatEvent("route.checkEmployeeFolder");
      return handleEmployeeFolderCheck(config, storage, chatUserId, event, resolvedDeps);
    }

    if (actionName === SELECT_EMPLOYEE_FUNCTION) {
      logChatEvent("route.selectEmployee");
      return handleEmployeeSelect(config, event);
    }

    if (actionName === CONFIRM_WITHOUT_PREVIOUS_FUNCTION) {
      logChatEvent("route.confirmWithoutPrevious");
      return handleConfirmReviewWithoutPrevious(config, storage, chatUserId, event, resolvedDeps);
    }

    if (appCommandId === REVIEW_COMMAND_ID) {
      logChatEvent("route.reviewDialog");
      const token = await storage.get(chatUserId);
      if (!token) {
        return respondReviewerAuthRequired(config, storage, chatUserId, resolvedDeps, event, "dialog_card");
      }
      return dialogResponse(employeeLookupCard(config));
    }

    logChatEvent("route.unknownCommand", { appCommandId, actionName });
    return textResponse("Неизвестная команда Google Chat.");
  };
}

export const handleChatEvent = createChatEventHandler();

async function handleAddedToSpace(
  config: AppConfig,
  storage: TokenStorage,
  chatUserId: string | undefined,
  deps: ChatEventHandlerDeps
): Promise<Record<string, unknown>> {
  if (!chatUserId) {
    logChatEvent("addedToSpace.missingUser");
    return textResponse("Не удалось определить пользователя Google Chat.");
  }

  const authUrl = await deps.buildAuthUrl(config, storage, chatUserId);
  return actionResponseCard(welcomeCard(authUrl));
}

function buildInfoMessage(): string {
  return [
    "/info",
    "",
    `Version: ${BOT_VERSION}`,
    "",
    "Команды:",
    "- /review — открывает форму и запускает workflow performance review"
  ].join("\n");
}

function readBotVersion(): string {
  const packageJsonPath = new URL("../package.json", import.meta.url);
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: string };
  return packageJson.version ?? "unknown";
}

async function handleEmployeeSuggestions(
  config: AppConfig,
  storage: TokenStorage,
  chatUserId: string | undefined,
  event: ChatEvent,
  deps: ChatEventHandlerDeps
): Promise<Record<string, unknown>> {
  if (!chatUserId) {
    return employeeSuggestionsResponse([]);
  }

  const rawQuery = event.common?.parameters?.autocomplete_widget_query ?? "";
  if (!rawQuery.trim()) {
    logChatEvent("employeeSuggestions.emptyQuery");
    return employeeSuggestionsResponse([]);
  }

  const token = await storage.get(chatUserId);
  if (!token) {
    logChatEvent("employeeSuggestions.authRequired", { chatUserId });
    return respondReviewerAuthRequired(config, storage, chatUserId, deps, event, "employee_suggestions");
  }

  const query = getDirectorySearchQuery(rawQuery);
  let employees: Array<{ fullName: string; email: string }>;
  try {
    employees = await deps.searchDirectoryEmployees(config, token.refreshToken, query);
  } catch (error) {
    if (isOAuthAuthError(error)) {
      logChatEvent("employeeSuggestions.authFailed", {
        chatUserId,
        message: error instanceof Error ? error.message : String(error)
      });
      return respondReviewerAuthRequired(config, storage, chatUserId, deps, event, "employee_suggestions", {
        clearStaleToken: true
      });
    }
    throw error;
  }

  logChatEvent("employeeSuggestions.result", {
    query: rawQuery,
    searchQuery: query,
    count: employees.length
  });

  return employeeSuggestionsResponse(
    buildEmployeeSearchSuggestions(rawQuery, employees)
  );
}

function buildEmployeeSearchSuggestions(
  rawQuery: string,
  employees: Array<{ fullName: string; email: string }>
): Array<{ text: string; value: string; bottomText?: string }> {
  if (employees.length > 0) {
    return employees.map((employee) => ({
      text: `${employee.fullName} (${employee.email})`,
      value: encodeEmployeeSelection(employee.email, employee.fullName)
    }));
  }

  if (!rawQuery.trim()) {
    return [];
  }

  return [
    {
      text: EMPLOYEE_SEARCH_NO_RESULTS_TEXT,
      bottomText: EMPLOYEE_SEARCH_NO_RESULTS_HINT,
      value: EMPLOYEE_SEARCH_NO_RESULTS_VALUE
    }
  ];
}

async function handleEmployeeFolderCheck(
  config: AppConfig,
  storage: TokenStorage,
  chatUserId: string,
  event: ChatEvent,
  deps: ChatEventHandlerDeps
): Promise<Record<string, unknown>> {
  const isDialogSubmit = event.dialogEventType === "SUBMIT_DIALOG";
  const inputs = event.common?.formInputs ?? {};
  const manualFullName = getStringInput(inputs.manualFullName).trim();
  const employeeEmail = getStringInput(inputs.employeeEmail).trim().toLowerCase();

  if (!manualFullName) {
    return respondReviewMessage(
      isDialogSubmit,
      "Укажите имя и фамилию в поле «Имя и фамилия».",
      "INVALID_ARGUMENT"
    );
  }

  const token = await storage.get(chatUserId);
  if (!token) {
    logChatEvent("employeeCheck.authRequired", { chatUserId });
    return respondReviewerAuthRequired(config, storage, chatUserId, deps, event, "chat_message");
  }

  let folder;
  try {
    folder = await deps.findEmployeeFolder(config, token.refreshToken, manualFullName);
  } catch (error) {
    if (isOAuthAuthError(error)) {
      logChatEvent("employeeCheck.authFailed", {
        chatUserId,
        message: error instanceof Error ? error.message : String(error)
      });
      return respondReviewerAuthRequired(config, storage, chatUserId, deps, event, "chat_message", {
        clearStaleToken: true
      });
    }
    throw error;
  }
  if (!folder) {
    return respondReviewMessage(
      isDialogSubmit,
      `Папка сотрудника не найдена: ${manualFullName}`,
      "INVALID_ARGUMENT"
    );
  }

  return dialogResponse(
    reviewFormCard(config, {
      fullName: manualFullName,
      employeeEmail
    })
  );
}

function handleEmployeeSelect(
  config: AppConfig,
  event: ChatEvent
): Record<string, unknown> {
  const inputs = event.common?.formInputs ?? {};
  const selectedEmployee = parseEmployeeSelection(getLastStringInput(inputs.employeeFolder));

  if (!selectedEmployee) {
    return dialogResponse(employeeLookupCard(config));
  }

  return dialogResponse(
    employeeLookupCard(config, {
      fullName: selectedEmployee.name,
      email: selectedEmployee.id,
      selectedEmployeeValue: encodeEmployeeSelection(selectedEmployee.id, selectedEmployee.name)
    })
  );
}

async function handleReviewSubmit(
  config: AppConfig,
  storage: TokenStorage,
  chatUserId: string,
  event: ChatEvent,
  deps: ChatEventHandlerDeps
): Promise<Record<string, unknown>> {
  const isDialogSubmit = event.dialogEventType === "SUBMIT_DIALOG";
  const inputs = event.common?.formInputs ?? {};
  logChatEvent("submit.inputs", summarizeFormInputs(inputs));

  const parsed = parseReviewRequest(config, inputs);

  if (!parsed.ok) {
    logChatEvent("submit.validationFailed", { error: parsed.error });
    if (isDialogSubmit) {
      return dialogActionStatusResponse(parsed.error, "INVALID_ARGUMENT");
    }
    return actionResponseText(parsed.error);
  }

  const configError = validateReviewConfig(config, parsed.value);
  if (configError) {
    logChatEvent("submit.validationFailed", { error: configError });
    return respondReviewMessage(isDialogSubmit, configError, "INVALID_ARGUMENT");
  }

  const token = await storage.get(chatUserId);
  if (!token) {
    logChatEvent("submit.authRequired", { chatUserId });
    return respondReviewerAuthRequired(
      config,
      storage,
      chatUserId,
      deps,
      event,
      "dialog_card"
    );
  }

  const month = formatReviewMonth(parsed.value.reviewDate);

  let previousReviewUrl = "";
  try {
    const previousReview = await deps.findPreviousReviewReport(
      config,
      token.refreshToken,
      parsed.value.fullName,
      month
    );

    if (previousReview) {
      previousReviewUrl = previousReview.webViewLink;
      logChatEvent("submit.previousReview.found", {
        reportName: previousReview.name,
        webViewLink: previousReview.webViewLink
      });
    } else {
      logChatEvent("submit.previousReview.missing", { fullName: parsed.value.fullName, reviewMonth: month });
      await storage.savePendingReview({
        chatUserId,
        reviewMonth: month,
        createdAt: new Date().toISOString(),
        ...parsed.value
      });
      return respondReviewDialog(isDialogSubmit, confirmWithoutPreviousReviewCard(config));
    }
  } catch (error) {
    if (isOAuthAuthError(error)) {
      logChatEvent("submit.previousReview.authFailed", {
        chatUserId,
        message: error instanceof Error ? error.message : String(error)
      });
      return respondReviewerAuthRequired(
        config,
        storage,
        chatUserId,
        deps,
        event,
        "dialog_card",
        { clearStaleToken: true }
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    logChatEvent("submit.previousReview.failed", { message });
    const errorText = [
      "Не удалось найти предыдущее ревью.",
      `Ошибка Google Drive: ${message}`
    ].join("\n");
    return respondReviewMessage(isDialogSubmit, errorText, "INVALID_ARGUMENT");
  }

  return startReviewWorkflowFromDialog(
    {
      config,
      storage,
      chatUserId,
      event,
      refreshToken: token.refreshToken,
      reviewerEmail: token.googleUserEmail,
      request: parsed.value,
      reviewMonth: month,
      previousReviewUrl
    },
    deps
  );
}

async function handleConfirmReviewWithoutPrevious(
  config: AppConfig,
  storage: TokenStorage,
  chatUserId: string,
  event: ChatEvent,
  deps: ChatEventHandlerDeps
): Promise<Record<string, unknown>> {
  const isDialogSubmit = event.dialogEventType === "SUBMIT_DIALOG";
  const pending = await storage.consumePendingReview(chatUserId);

  if (!pending) {
    const errorText = "Нет сохранённого запроса. Повторите /review и отправьте форму заново.";
    return respondReviewMessage(isDialogSubmit, errorText, "INVALID_ARGUMENT");
  }

  const configError = validateReviewConfig(config, pending);
  if (configError) {
    return respondReviewMessage(isDialogSubmit, configError, "INVALID_ARGUMENT");
  }

  const token = await storage.get(chatUserId);
  if (!token) {
    logChatEvent("submit.authRequired", { chatUserId });
    return respondReviewerAuthRequired(
      config,
      storage,
      chatUserId,
      deps,
      event,
      "dialog_card"
    );
  }

  return startReviewWorkflowFromDialog(
    {
      config,
      storage,
      chatUserId,
      event,
      refreshToken: token.refreshToken,
      reviewerEmail: token.googleUserEmail,
      request: pending,
      reviewMonth: pending.reviewMonth,
      previousReviewUrl: ""
    },
    deps
  );
}

function startReviewWorkflowFromDialog(
  params: ReviewWorkflowParams,
  deps: ChatEventHandlerDeps
): Record<string, unknown> {
  void sendSubmitResultToChat(params.config, deps, params.event, REVIEW_WORKFLOW_ACK_MESSAGE);
  scheduleReviewWorkflow(params, deps);
  return respondDialogSubmitAck("OK");
}

function scheduleReviewWorkflow(params: ReviewWorkflowParams, deps: ChatEventHandlerDeps): void {
  logChatEvent("submit.workflow.start", {
    fullName: params.request.fullName,
    reviewMonth: params.reviewMonth,
    spaceName: resolveChatSpaceName(params.event)
  });

  setImmediate(() => {
    void runReviewWorkflow(params, deps)
      .then((result) => {
        logChatEvent("submit.workflow.success", {
          spaceName: resolveChatSpaceName(params.event),
          textLength: result.textLength,
          remindersCount: result.remindersCount,
          hasCalendar: result.hasCalendar
        });
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Unknown error";
        logChatEvent("submit.workflow.failed", { message });
      });
  });
}

async function runReviewWorkflow(
  params: ReviewWorkflowParams,
  deps: ChatEventHandlerDeps
): Promise<ReviewWorkflowResult> {
  const {
    config,
    event,
    refreshToken,
    reviewerEmail,
    request,
    reviewMonth,
    previousReviewUrl
  } = params;
  logChatEvent("submit.createFolder.start", {
    fullName: request.fullName,
    reviewMonth,
    needsClientForm: request.needsClientForm,
    hasPreviousReview: Boolean(previousReviewUrl)
  });
  let folder;
  try {
    folder = await deps.createReviewFolder(config, refreshToken, {
      fullName: request.fullName,
      employeeEmail: request.employeeEmail,
      reviewerEmail,
      reviewDate: request.reviewDate,
      meetingTime: request.meetingTime,
      reviewMonth,
      needsClientForm: request.needsClientForm,
      previousReviewUrl
    });
  } catch (error) {
    const authDelivered = await deliverWorkflowAuthRequired(error, params, deps, "createFolder");
    if (authDelivered) {
      return authDelivered;
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    logChatEvent("submit.createFolder.failed", { message });
    const errorText = [
      "Не удалось создать папку ревью.",
      `Ошибка Google Drive: ${message}`
    ].join("\n");

    await deliverWorkflowResultToChat(config, deps, event, errorText);
    return {
      textLength: errorText.length,
      remindersCount: 0,
      hasCalendar: false
    };
  }
  logChatEvent("submit.createFolder.success", {
    folderName: folder.name,
    hasLink: Boolean(folder.webViewLink)
  });

  let calendarEvent: CreatedCalendarEvent;
  const calendarRequest = {
    fullName: request.fullName,
    employeeEmail: request.employeeEmail,
    reviewerEmail,
    reviewDate: request.reviewDate,
    meetingTime: request.meetingTime,
    folderUrl: folder.webViewLink,
    reportUrl: folder.report?.webViewLink,
    internalFormUrl: folder.internalForm?.webViewLink,
    clientFormUrl: folder.clientForm?.webViewLink,
    previousReviewUrl
  };
  try {
    calendarEvent = await deps.createCalendarEvent(config, refreshToken, calendarRequest);
  } catch (error) {
    const authDelivered = await deliverWorkflowAuthRequired(error, params, deps, "createCalendarEvent");
    if (authDelivered) {
      return authDelivered;
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    logChatEvent("submit.createCalendarEvent.failed", { message });
    const errorText = [
      "Не удалось создать встречу ревью.",
      `Ошибка Google Calendar: ${message}`
    ].join("\n");

    await deliverWorkflowResultToChat(config, deps, event, errorText);
    return {
      textLength: errorText.length,
      remindersCount: 0,
      hasCalendar: false
    };
  }
  logChatEvent("submit.createCalendarEvent.success", {
    summary: calendarEvent.summary,
    hasLink: Boolean(calendarEvent.htmlLink)
  });

  let reminderEvents: CreatedReviewerReminderEvent[];
  try {
    reminderEvents = await deps.createReviewerReminderEvents(config, refreshToken, calendarRequest);
  } catch (error) {
    const authDelivered = await deliverWorkflowAuthRequired(
      error,
      params,
      deps,
      "createReviewerReminderEvents"
    );
    if (authDelivered) {
      return authDelivered;
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    logChatEvent("submit.createReviewerReminderEvents.failed", { message });
    const errorText = [
      "Не удалось создать reminder'ы ревьюера.",
      `Ошибка Google Calendar: ${message}`
    ].join("\n");

    await deliverWorkflowResultToChat(config, deps, event, errorText);
    return {
      textLength: errorText.length,
      remindersCount: 0,
      hasCalendar: false
    };
  }
  logChatEvent("submit.createReviewerReminderEvents.success", {
    count: reminderEvents.length
  });

  const successText = formatReviewSuccessMessage(
    request.fullName,
    folder,
    request.needsClientForm,
    previousReviewUrl,
    calendarEvent,
    reminderEvents
  );

  await deliverWorkflowResultToChat(config, deps, event, successText);
  return {
    textLength: successText.length,
    remindersCount: reminderEvents.length,
    hasCalendar: Boolean(calendarEvent)
  };
}

function validateReviewConfig(config: AppConfig, request: ReviewRequest): string | null {
  if (!config.reviewReportTemplateId) {
    return "Настройте REVIEW_REPORT_TEMPLATE_ID в .env или .env.";
  }
  if (!config.internalReviewFormTemplateId) {
    return "Настройте INTERNAL_REVIEW_FORM_TEMPLATE_ID в .env или .env.";
  }
  if (request.needsClientForm && !config.clientReviewFormTemplateId) {
    return "Настройте CLIENT_REVIEW_FORM_TEMPLATE_ID в .env или .env.";
  }
  return null;
}

function respondReviewMessage(
  isDialogSubmit: boolean,
  text: string,
  statusCode: "OK" | "INVALID_ARGUMENT"
): Record<string, unknown> {
  if (isDialogSubmit) {
    return dialogActionStatusResponse(text, statusCode);
  }
  return actionResponseText(text);
}

function respondReviewDialog(
  isDialogSubmit: boolean,
  card: Record<string, unknown>
): Record<string, unknown> {
  if (isDialogSubmit) {
    return dialogResponse(card);
  }
  return actionResponseCard(card);
}

function parseReviewRequest(
  config: AppConfig,
  inputs: Record<string, ChatFormInput>
):
  | { ok: true; value: ReviewRequest }
  | { ok: false; error: string } {
  const fullName = getStringInput(inputs.fullName).trim();
  const employeeEmail = getStringInput(inputs.employeeEmail).trim().toLowerCase();
  const reviewDate = getDateInput(inputs.reviewDate);
  const meetingTime = getStringInput(inputs.meetingTime).trim();
  const needsClientForm = getStringInput(inputs.needsClientForm) === "yes";

  if (!fullName) {
    return { ok: false, error: "Укажите имя и фамилию." };
  }

  if (!employeeEmail) {
    return { ok: false, error: "Укажите email сотрудника." };
  }

  if (config.employeeEmailDomains.length === 0) {
    return {
      ok: false,
      error: "Настройте EMPLOYEE_EMAIL_DOMAINS в .env.local или .env."
    };
  }

  if (!isEmailInDomains(employeeEmail, config.employeeEmailDomains)) {
    return {
      ok: false,
      error: `Email сотрудника должен быть в одном из доменов: ${config.employeeEmailDomains.join(", ")}.`
    };
  }

  if (!reviewDate) {
    return { ok: false, error: "Укажите дату ревью." };
  }

  if (!meetingTime) {
    return { ok: false, error: "Укажите время ревью." };
  }

  if (!isValidMeetingTime(meetingTime)) {
    return { ok: false, error: "Укажите время ревью в формате HH:mm." };
  }

  return {
    ok: true,
    value: {
      fullName,
      employeeEmail,
      reviewDate,
      meetingTime,
      needsClientForm
    }
  };
}

function getStringInput(input: ChatFormInput | undefined): string {
  return input?.stringInputs?.value?.[0] ?? "";
}

function getLastStringInput(input: ChatFormInput | undefined): string {
  const values = input?.stringInputs?.value ?? [];
  return values.at(-1) ?? "";
}

function getDateInput(input: ChatFormInput | undefined): string {
  const msSinceEpoch = input?.dateInput?.msSinceEpoch;
  if (!msSinceEpoch) {
    return "";
  }
  return new Date(Number(msSinceEpoch)).toISOString().slice(0, 10);
}

function logChatEvent(message: string, data?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[chat] ${timestamp} ${message}`, JSON.stringify(data));
    return;
  }
  console.log(`[chat] ${timestamp} ${message}`);
}

function summarizeFormInputs(inputs: Record<string, ChatFormInput>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(inputs).map(([key, value]) => [
      key,
      {
        hasStringInputs: Boolean(value.stringInputs?.value?.length),
        hasDateInput: Boolean(value.dateInput?.msSinceEpoch)
      }
    ])
  );
}

function formatReviewMonth(date: string): string {
  return date.slice(0, 7).replace("-", ".");
}

function formatReviewSuccessMessage(
  fullName: string,
  folder: CreatedFolder,
  needsClientForm: boolean,
  previousReviewUrl = "",
  calendarEvent?: CreatedCalendarEvent,
  reminderEvents: CreatedReviewerReminderEvent[] = []
): string {
  return [
    `Готово: Performance Review для ${fullName}`,
    `Папка ревью: ${folder.name} - ${folder.webViewLink}`,
    ...(folder.report?.webViewLink ? [`PR report: ${folder.report.webViewLink}`] : []),
    ...(previousReviewUrl ? [`Previous review: ${previousReviewUrl}`] : []),
    ...(folder.internalForm?.webViewLink
      ? [`Internal feedback form: ${folder.internalForm.webViewLink}`]
      : []),
    ...(needsClientForm && folder.clientForm?.webViewLink
      ? [`Client feedback form: ${folder.clientForm.webViewLink}`]
      : []),
    ...(calendarEvent
      ? [
        `Встреча: ${calendarEvent.summary} - ${calendarEvent.startDateTime} - ${calendarEvent.htmlLink}`
      ]
      : []),
    ...(reminderEvents.length
      ? [
        "Reminders:",
        ...reminderEvents.map((event) => `${event.summary} - ${event.startDateTime} - ${event.htmlLink}`)
      ]
      : [])
  ].join("\n");
}

function isEmailInDomains(email: string, domains: string[]): boolean {
  return domains.some((domain) => email.endsWith(`@${domain.toLowerCase()}`));
}

function isValidMeetingTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function resolveChatSpaceName(event: ChatEvent): string | undefined {
  return event.space?.name;
}

function isEmployeeSuggestionsEvent(
  config: AppConfig,
  event: ChatEvent,
  invokedFunction: string | undefined
): boolean {
  return (
    invokedFunction === `${config.appBaseUrl}/google-chat/events` &&
    event.common?.parameters?.autocomplete_widget_query !== undefined &&
    event.common?.parameters?.actionName === undefined &&
    event.dialogEventType !== "CANCEL_DIALOG"
  );
}

function resolveActionName(event: ChatEvent): string | undefined {
  return event.common?.parameters?.actionName ?? event.common?.invokedFunction;
}

function resolveAppCommandId(event: ChatEvent): number | undefined {
  const appCommandId = event.appCommandMetadata?.appCommandId;

  if (appCommandId !== undefined) {
    return appCommandId;
  }

  const slashCommandId = event.message?.slashCommand?.commandId;
  if (!slashCommandId) {
    return undefined;
  }

  const parsed = Number(slashCommandId);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isDialogContext(event: ChatEvent): boolean {
  return Boolean(event.isDialogEvent || event.dialogEventType);
}

async function deliverWorkflowResultToChat(
  config: AppConfig,
  deps: ChatEventHandlerDeps,
  event: ChatEvent,
  text: string
): Promise<void> {
  await sendSubmitResultToChat(config, deps, event, text);
}

async function deliverWorkflowAuthRequired(
  error: unknown,
  params: ReviewWorkflowParams,
  deps: ChatEventHandlerDeps,
  step: string
): Promise<ReviewWorkflowResult | null> {
  if (!isOAuthAuthError(error)) {
    return null;
  }

  const message = error instanceof Error ? error.message : String(error);
  logChatEvent(`submit.${step}.authRequired`, {
    chatUserId: params.chatUserId,
    message
  });

  await params.storage.delete(params.chatUserId);
  const authUrl = await deps.buildAuthUrl(params.config, params.storage, params.chatUserId);
  const errorText = formatAuthRequiredMessage(authUrl);
  await deliverWorkflowResultToChat(params.config, deps, params.event, errorText);

  return {
    textLength: errorText.length,
    remindersCount: 0,
    hasCalendar: false
  };
}

type AuthRequiredResponseKind = "chat_message" | "dialog_card" | "employee_suggestions";

async function respondReviewerAuthRequired(
  config: AppConfig,
  storage: TokenStorage,
  chatUserId: string,
  deps: ChatEventHandlerDeps,
  event: ChatEvent,
  kind: AuthRequiredResponseKind,
  options?: { clearStaleToken?: boolean }
): Promise<Record<string, unknown>> {
  if (options?.clearStaleToken) {
    await storage.delete(chatUserId);
  }

  const authUrl = await deps.buildAuthUrl(config, storage, chatUserId);
  logChatEvent("auth.required", {
    chatUserId,
    kind,
    clearStaleToken: Boolean(options?.clearStaleToken)
  });

  const message = formatAuthRequiredMessage(authUrl);

  if (kind === "dialog_card") {
    return dialogResponse(authRequiredCard(authUrl));
  }

  const spaceName = resolveChatSpaceName(event);
  const inDialog = isDialogContext(event);

  if (spaceName) {
    await sendSubmitResultToChat(config, deps, event, message);
    if (inDialog) {
      return dialogActionStatusResponse("", "OK");
    }
    return {};
  }

  logChatEvent("auth.required.fallback", { chatUserId, reason: "missingSpaceName" });
  return textResponse(message);
}

function respondDialogSubmitAck(
  statusCode: "OK" | "INVALID_ARGUMENT"
): Record<string, unknown> {
  return dialogActionStatusResponse("", statusCode);
}

async function sendSubmitResultToChat(
  config: AppConfig,
  deps: ChatEventHandlerDeps,
  event: ChatEvent,
  text: string
): Promise<void> {
  const spaceName = resolveChatSpaceName(event);
  if (!spaceName) {
    logChatEvent("submit.sendChatMessage.skipped", { reason: "missingSpaceName" });
    return;
  }

  logChatEvent("submit.resultDelivery.start", {
    spaceName,
    textLength: text.length,
    delivery: "bot"
  });

  try {
    await deps.sendChatMessage(config, spaceName, text);
    logChatEvent("submit.sendChatMessage.success", { spaceName });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logChatEvent("submit.sendChatMessage.failed", { spaceName, message });
  }
}

function textResponse(text: string): Record<string, unknown> {
  return { text };
}


function dialogActionStatusResponse(
  text: string,
  statusCode: "OK" | "INVALID_ARGUMENT"
): Record<string, unknown> {
  return {
    actionResponse: {
      type: "DIALOG",
      dialogAction: {
        actionStatus: {
          statusCode,
          userFacingMessage: text
        }
      }
    }
  };
}

function dialogResponse(card: Record<string, unknown>): Record<string, unknown> {
  return {
    actionResponse: {
      type: "DIALOG",
      dialogAction: {
        dialog: {
          body: card
        }
      }
    }
  };
}

function actionResponseText(text: string): Record<string, unknown> {
  return {
    actionResponse: {
      type: "NEW_MESSAGE"
    },
    text
  };
}

function actionResponseCard(card: Record<string, unknown>): Record<string, unknown> {
  return {
    actionResponse: {
      type: "NEW_MESSAGE"
    },
    cardsV2: [
      {
        cardId: "auth-required",
        card
      }
    ]
  };
}

function employeeSuggestionsResponse(
  suggestions: Array<{ text: string; value: string; bottomText?: string }>
): Record<string, unknown> {
  return {
    actionResponse: {
      type: "UPDATE_WIDGET",
      updatedWidget: {
        widget: "employeeFolder",
        suggestions: {
          items: suggestions
        }
      }
    }
  };
}

function encodeEmployeeSelection(id: string, name: string): string {
  return `${id}|${name}`;
}

function parseEmployeeSelection(value: string): { id: string; name: string } | null {
  const separatorIndex = value.indexOf("|");
  if (separatorIndex < 1) {
    return null;
  }

  const id = value.slice(0, separatorIndex).trim();
  const name = value.slice(separatorIndex + 1).trim();
  if (!id || !name) {
    return null;
  }

  return { id, name };
}

export function getDirectorySearchQuery(query: string): string {
  return query
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (containsCyrillic(word) ? reverseTransliterateWord(word) : word))
    .join(" ");
}

function containsCyrillic(text: string): boolean {
  return /[\u0400-\u04FF]/.test(text);
}

function buildReverseTranslReplacements(
  replacements: Array<[string, string]>
): Array<[string, string]> {
  const byCyrillic = new Map<string, string>();

  for (const [latin, cyrillic] of replacements) {
    const existing = byCyrillic.get(cyrillic);
    if (!existing || latin.length < existing.length) {
      byCyrillic.set(cyrillic, latin);
    }
  }

  return [...byCyrillic.entries()].sort((a, b) => b[0].length - a[0].length);
}

function reverseTransliterateWord(word: string): string {
  let rest = word.toLowerCase();
  let result = "";

  while (rest.length > 0) {
    const replacement = REVERSE_TRANSLIT_REPLACEMENTS.find(([cyrillic]) => rest.startsWith(cyrillic));
    if (!replacement) {
      result += rest[0];
      rest = rest.slice(1);
      continue;
    }

    const [cyrillic, latin] = replacement;
    result += latin;
    rest = rest.slice(cyrillic.length);
  }

  return result;
}

function confirmWithoutPreviousReviewCard(config: AppConfig): Record<string, unknown> {
  return {
    header: {
      title: "Предыдущее ревью не найдено"
    },
    sections: [
      {
        widgets: [
          {
            textParagraph: {
              text: "Предыдущее ревью не найдено. Продолжить без него?"
            }
          },
          {
            buttonList: {
              buttons: [
                {
                  text: "Продолжить без предыдущего ревью",
                  onClick: {
                    action: {
                      function: `${config.appBaseUrl}/google-chat/events`,
                      parameters: [
                        {
                          key: "actionName",
                          value: CONFIRM_WITHOUT_PREVIOUS_FUNCTION
                        }
                      ]
                    }
                  }
                }
              ]
            }
          }
        ]
      }
    ]
  };
}

function employeeLookupCard(
  config: AppConfig,
  selectedEmployee?: {
    fullName: string;
    email: string;
    selectedEmployeeValue: string;
  }
): Record<string, unknown> {
  return {
    header: {
      title: "Выбор сотрудника"
    },
    sections: [
      {
        widgets: [
          {
            selectionInput: {
              name: "employeeFolder",
              type: "MULTI_SELECT",
              label: "Имя, фамилия или email",
              multiSelectMaxSelectedItems: 1,
              multiSelectMinQueryLength: 1,
              ...(selectedEmployee
                ? {
                  items: [
                    {
                      text: `${selectedEmployee.fullName} (${selectedEmployee.email})`,
                      value: selectedEmployee.selectedEmployeeValue,
                      selected: true
                    }
                  ]
                }
                : {}),
              onChangeAction: {
                function: `${config.appBaseUrl}/google-chat/events`,
                parameters: [
                  {
                    key: "actionName",
                    value: SELECT_EMPLOYEE_FUNCTION
                  }
                ]
              },
              externalDataSource: {
                function: `${config.appBaseUrl}/google-chat/events`
              }
            }
          },
          ...(selectedEmployee
            ? [
              {
                textInput: {
                  name: "manualFullName",
                  label: "Имя и фамилия (название папки)",
                  type: "SINGLE_LINE",
                  value: selectedEmployee.fullName
                }
              },
              {
                textInput: {
                  name: "employeeEmail",
                  label: "Email",
                  type: "SINGLE_LINE",
                  value: selectedEmployee.email
                }
              },
              {
                buttonList: {
                  buttons: [
                    {
                      text: "Проверить папку",
                      onClick: {
                        action: {
                          function: `${config.appBaseUrl}/google-chat/events`,
                          parameters: [
                            {
                              key: "actionName",
                              value: CHECK_EMPLOYEE_FOLDER_FUNCTION
                            }
                          ]
                        }
                      }
                    }
                  ]
                }
              }
            ]
            : [])
        ]
      }
    ]
  };
}

function reviewFormCard(
  config: AppConfig,
  initialValues: {
    fullName?: string;
    employeeEmail?: string;
  } = {}
): Record<string, unknown> {
  return {
    header: {
      title: "Запуск Performance Review"
    },
    sections: [
      {
        widgets: [
          {
            textInput: {
              name: "fullName",
              label: "Имя и фамилия",
              ...(initialValues.fullName ? { value: initialValues.fullName } : {})
            }
          },
          {
            textInput: {
              name: "employeeEmail",
              label: "Email сотрудника",
              ...(initialValues.employeeEmail ? { value: initialValues.employeeEmail } : {})
            }
          },
          {
            dateTimePicker: {
              name: "reviewDate",
              label: "Дата ревью",
              type: "DATE_ONLY"
            }
          },
          {
            textInput: {
              name: "meetingTime",
              label: "Время ревью (HH:mm, Екатеринбург)"
            }
          },
          {
            selectionInput: {
              name: "needsClientForm",
              label: "Клиентская форма",
              type: "CHECK_BOX",
              items: [
                {
                  text: "Нужна",
                  value: "yes"
                }
              ]
            }
          },
          {
            buttonList: {
              buttons: [
                {
                  text: "Создать папку",
                  onClick: {
                    action: {
                      function: `${config.appBaseUrl}/google-chat/events`,
                      parameters: [
                        {
                          key: "actionName",
                          value: SUBMIT_FUNCTION
                        }
                      ]
                    }
                  }
                }
              ]
            }
          }
        ]
      }
    ]
  };
}

function authRequiredCard(authUrl: string): Record<string, unknown> {
  return authCard(
    "Нужно подключить Google",
    "Подключите Google-аккаунт ревьюера и повторите запуск.",
    authUrl
  );
}

function welcomeCard(authUrl: string): Record<string, unknown> {
  return authCard(
    "Performance Review Bot",
    [
      "Бот помогает подготовить performance review.",
      "",
      "Команды:",
      "/info — информация о боте",
      "/review — запуск подготовки performance review",
      "",
      "Перед запуском /review подключите Google-аккаунт ревьюера."
    ].join("<br>"),
    authUrl
  );
}

function authCard(title: string, text: string, authUrl: string): Record<string, unknown> {
  return {
    header: {
      title
    },
    sections: [
      {
        widgets: [
          {
            textParagraph: {
              text
            }
          },
          {
            buttonList: {
              buttons: [
                {
                  text: "Подключить Google",
                  onClick: {
                    openLink: {
                      url: authUrl
                    }
                  }
                }
              ]
            }
          }
        ]
      }
    ]
  };
}
