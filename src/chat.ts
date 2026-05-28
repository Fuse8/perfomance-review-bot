import type { AppConfig } from "./config.js";
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
import { sendChatMessage } from "./google-chat.js";
import { buildAuthUrl } from "./oauth.js";
import { searchDirectoryEmployees } from "./people.js";
import type { TokenStorage } from "./storage.js";
import type { ChatEvent, ChatFormInput, ReviewRequest } from "./types.js";

const SUBMIT_FUNCTION = "submitReview";
const SELECT_EMPLOYEE_FUNCTION = "selectEmployee";
const CHECK_EMPLOYEE_FOLDER_FUNCTION = "checkEmployeeFolder";
const CONFIRM_WITHOUT_PREVIOUS_FUNCTION = "confirmReviewWithoutPrevious";
const REVIEW_COMMAND_ID = 1;
const HEALTH_COMMAND_ID = 2;
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
};

const defaultDeps: ChatEventHandlerDeps = {
  createReviewFolder,
  createCalendarEvent,
  createReviewerReminderEvents,
  findEmployeeFolder,
  findPreviousReviewReport,
  searchDirectoryEmployees,
  buildAuthUrl,
  sendChatMessage
};

export function createChatEventHandler(deps: Partial<ChatEventHandlerDeps> = {}) {
  const resolvedDeps = { ...defaultDeps, ...deps };

  return async function handleChatEventWithDeps(
    config: AppConfig,
    storage: TokenStorage,
    event: ChatEvent
  ): Promise<Record<string, unknown>> {
    const chatUserId = event.user?.name ?? event.chat?.user?.name;
    const appCommandId = event.chat?.appCommandPayload?.appCommandMetadata?.appCommandId;
    const actionName =
      event.common?.invokedFunction ?? event.commonEventObject?.parameters?.actionName;
    const formInputs = event.common?.formInputs ?? event.commonEventObject?.formInputs ?? {};

    logChatEvent("received", {
      appCommandId,
      actionName,
      hasChatUserId: Boolean(chatUserId),
      formInputKeys: Object.keys(formInputs),
      dialogEventType: event.chat?.buttonClickedPayload?.dialogEventType,
      isDialogEvent: event.chat?.buttonClickedPayload?.isDialogEvent
    });

    if (event.chat?.widgetUpdatedPayload) {
      logChatEvent("route.employeeSuggestions");
      return handleEmployeeSuggestions(config, storage, chatUserId, event, resolvedDeps);
    }

    if (appCommandId === HEALTH_COMMAND_ID) {
      logChatEvent("route.check");
      return addOnTextResponse("hello world");
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
    return addOnDialogResponse(employeeLookupCard(config));
  }

  logChatEvent("route.unknownCommand", { appCommandId, actionName });
  return textResponse("Неизвестная команда Google Chat.");
  };
}

export const handleChatEvent = createChatEventHandler();

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

  const token = await storage.get(chatUserId);
  if (!token) {
    logChatEvent("employeeSuggestions.authRequired", { chatUserId });
    return employeeSuggestionsResponse([]);
  }

  const rawQuery = event.commonEventObject?.parameters?.autocomplete_widget_query ?? "";
  const query = getDirectorySearchQuery(rawQuery);
  const employees = await deps.searchDirectoryEmployees(config, token.refreshToken, query);
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
  const isAddOnEvent = Boolean(event.chat?.buttonClickedPayload || event.commonEventObject);
  const isDialogSubmit = event.chat?.buttonClickedPayload?.dialogEventType === "SUBMIT_DIALOG";
  const inputs = event.common?.formInputs ?? event.commonEventObject?.formInputs ?? {};
  const manualFullName = getStringInput(inputs.manualFullName).trim();

  if (!manualFullName) {
    return respondReviewMessage(
      isDialogSubmit,
      isAddOnEvent,
      event,
      "Укажите имя и фамилию в поле «Имя и фамилия».",
      "INVALID_ARGUMENT"
    );
  }

  const token = await storage.get(chatUserId);
  if (!token) {
    logChatEvent("employeeCheck.authRequired", { chatUserId });
    const authUrl = await deps.buildAuthUrl(config, storage, chatUserId);
    return addOnTextResponse(
      [
        "Нужно подключить Google-аккаунт ревьюера.",
        "Откройте ссылку, пройдите OAuth и повторите /review:",
        authUrl
      ].join("\n")
    );
  }

  const folder = await deps.findEmployeeFolder(config, token.refreshToken, manualFullName);
  if (!folder) {
    return respondReviewMessage(
      isDialogSubmit,
      isAddOnEvent,
      event,
      `Папка сотрудника не найдена: ${manualFullName}`,
      "INVALID_ARGUMENT"
    );
  }

  return respondReviewMessage(
    isDialogSubmit,
    isAddOnEvent,
    event,
    `Папка найдена: ${folder.name}`,
    "OK"
  );
}

function handleEmployeeSelect(
  config: AppConfig,
  event: ChatEvent
): Record<string, unknown> {
  const inputs = event.common?.formInputs ?? event.commonEventObject?.formInputs ?? {};
  const selectedEmployee = parseEmployeeSelection(getLastStringInput(inputs.employeeFolder));

  if (!selectedEmployee) {
    return updateDialogCard(employeeLookupCard(config));
  }

  return updateDialogCard(
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
  const isAddOnEvent = Boolean(event.chat?.buttonClickedPayload || event.commonEventObject);
  const isDialogSubmit = event.chat?.buttonClickedPayload?.dialogEventType === "SUBMIT_DIALOG";
  const inputs = event.common?.formInputs ?? event.commonEventObject?.formInputs ?? {};
  logChatEvent("submit.inputs", summarizeFormInputs(inputs));

  const parsed = parseReviewRequest(config, inputs);

  if (!parsed.ok) {
    logChatEvent("submit.validationFailed", { error: parsed.error });
    if (isDialogSubmit) {
      if (event.commonEventObject) {
        return addOnTextResponse(parsed.error);
      }
      return dialogActionStatusResponse(parsed.error, "INVALID_ARGUMENT");
    }
    if (isAddOnEvent) {
      return addOnTextResponse(parsed.error);
    }
    return actionResponseText(parsed.error);
  }

  const configError = validateReviewConfig(config, parsed.value);
  if (configError) {
    logChatEvent("submit.validationFailed", { error: configError });
    return respondReviewMessage(isDialogSubmit, isAddOnEvent, event, configError, "INVALID_ARGUMENT");
  }

  const token = await storage.get(chatUserId);
  if (!token) {
    logChatEvent("submit.authRequired", { chatUserId });
    const authUrl = await deps.buildAuthUrl(config, storage, chatUserId);
    if (isAddOnEvent) {
      return addOnTextResponse(
        [
          "Нужно подключить Google-аккаунт ревьюера.",
          "Откройте ссылку, пройдите OAuth и повторите /review:",
          authUrl
        ].join("\n")
      );
    }
    return actionResponseCard(authRequiredCard(authUrl));
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
      return respondReviewDialog(
        isDialogSubmit,
        isAddOnEvent,
        event,
        confirmWithoutPreviousReviewCard(config)
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logChatEvent("submit.previousReview.failed", { message });
    const errorText = [
      "Не удалось найти предыдущее ревью.",
      `Ошибка Google Drive: ${message}`
    ].join("\n");
    return respondReviewMessage(isDialogSubmit, isAddOnEvent, event, errorText, "INVALID_ARGUMENT");
  }

  return executeReviewCreation(
    config,
    storage,
    chatUserId,
    event,
    deps,
    token.refreshToken,
    token.googleUserEmail,
    parsed.value,
    month,
    previousReviewUrl,
    isDialogSubmit,
    isAddOnEvent
  );
}

async function handleConfirmReviewWithoutPrevious(
  config: AppConfig,
  storage: TokenStorage,
  chatUserId: string,
  event: ChatEvent,
  deps: ChatEventHandlerDeps
): Promise<Record<string, unknown>> {
  const isAddOnEvent = Boolean(event.chat?.buttonClickedPayload || event.commonEventObject);
  const isDialogSubmit = event.chat?.buttonClickedPayload?.dialogEventType === "SUBMIT_DIALOG";
  const pending = await storage.consumePendingReview(chatUserId);

  if (!pending) {
    const errorText = "Нет сохранённого запроса. Повторите /review и отправьте форму заново.";
    return respondReviewMessage(isDialogSubmit, isAddOnEvent, event, errorText, "INVALID_ARGUMENT");
  }

  const configError = validateReviewConfig(config, pending);
  if (configError) {
    return respondReviewMessage(isDialogSubmit, isAddOnEvent, event, configError, "INVALID_ARGUMENT");
  }

  const token = await storage.get(chatUserId);
  if (!token) {
    logChatEvent("submit.authRequired", { chatUserId });
    const authUrl = await deps.buildAuthUrl(config, storage, chatUserId);
    if (isAddOnEvent) {
      return addOnTextResponse(
        [
          "Нужно подключить Google-аккаунт ревьюера.",
          "Откройте ссылку, пройдите OAuth и повторите /review:",
          authUrl
        ].join("\n")
      );
    }
    return actionResponseCard(authRequiredCard(authUrl));
  }

  return executeReviewCreation(
    config,
    storage,
    chatUserId,
    event,
    deps,
    token.refreshToken,
    token.googleUserEmail,
    pending,
    pending.reviewMonth,
    "",
    isDialogSubmit,
    isAddOnEvent
  );
}

async function executeReviewCreation(
  config: AppConfig,
  storage: TokenStorage,
  chatUserId: string,
  event: ChatEvent,
  deps: ChatEventHandlerDeps,
  refreshToken: string,
  reviewerEmail: string,
  request: ReviewRequest,
  reviewMonth: string,
  previousReviewUrl: string,
  isDialogSubmit: boolean,
  isAddOnEvent: boolean
): Promise<Record<string, unknown>> {
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
    const message = error instanceof Error ? error.message : "Unknown error";
    logChatEvent("submit.createFolder.failed", { message });
    const errorText = [
      "Не удалось создать папку ревью.",
      `Ошибка Google Drive: ${message}`
    ].join("\n");

    if (isDialogSubmit) {
      if (event.commonEventObject) {
        return addOnTextResponse(errorText);
      }
      void sendSubmitResultToChat(config, deps, refreshToken, event, errorText);
      return dialogActionStatusResponse(
        "Не удалось выполнить /review. Ошибка отправлена в чат.",
        "INVALID_ARGUMENT"
      );
    }

    if (isAddOnEvent) {
      return addOnTextResponse(errorText);
    }

    return actionResponseText(errorText);
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
    const message = error instanceof Error ? error.message : "Unknown error";
    logChatEvent("submit.createCalendarEvent.failed", { message });
    const errorText = [
      "Не удалось создать встречу ревью.",
      `Ошибка Google Calendar: ${message}`
    ].join("\n");

    if (isDialogSubmit) {
      if (event.commonEventObject) {
        return addOnTextResponse(errorText);
      }
      void sendSubmitResultToChat(config, deps, refreshToken, event, errorText);
      return dialogActionStatusResponse(
        "Не удалось выполнить /review. Ошибка отправлена в чат.",
        "INVALID_ARGUMENT"
      );
    }

    if (isAddOnEvent) {
      return addOnTextResponse(errorText);
    }

    return actionResponseText(errorText);
  }
  logChatEvent("submit.createCalendarEvent.success", {
    summary: calendarEvent.summary,
    hasLink: Boolean(calendarEvent.htmlLink)
  });

  let reminderEvents: CreatedReviewerReminderEvent[];
  try {
    reminderEvents = await deps.createReviewerReminderEvents(config, refreshToken, calendarRequest);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logChatEvent("submit.createReviewerReminderEvents.failed", { message });
    const errorText = [
      "Не удалось создать reminder'ы ревьюера.",
      `Ошибка Google Calendar: ${message}`
    ].join("\n");

    if (isDialogSubmit) {
      if (event.commonEventObject) {
        return addOnTextResponse(errorText);
      }
      void sendSubmitResultToChat(config, deps, refreshToken, event, errorText);
      return dialogActionStatusResponse(
        "Не удалось выполнить /review. Ошибка отправлена в чат.",
        "INVALID_ARGUMENT"
      );
    }

    if (isAddOnEvent) {
      return addOnTextResponse(errorText);
    }

    return actionResponseText(errorText);
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

  if (isDialogSubmit) {
    if (event.commonEventObject) {
      return addOnTextResponse(successText);
    }
    void sendSubmitResultToChat(config, deps, refreshToken, event, successText);
    return dialogActionStatusResponse("Готово. Отчёт отправлен в чат.", "OK");
  }

  if (isAddOnEvent) {
    return addOnTextResponse(successText);
  }

  return actionResponseText(successText);
}

function validateReviewConfig(config: AppConfig, request: ReviewRequest): string | null {
  if (!config.reviewReportTemplateId) {
    return "Настройте REVIEW_REPORT_TEMPLATE_ID в .env.local или .env.";
  }
  if (!config.internalReviewFormTemplateId) {
    return "Настройте INTERNAL_REVIEW_FORM_TEMPLATE_ID в .env.local или .env.";
  }
  if (request.needsClientForm && !config.clientReviewFormTemplateId) {
    return "Настройте CLIENT_REVIEW_FORM_TEMPLATE_ID в .env.local или .env.";
  }
  return null;
}

function respondReviewMessage(
  isDialogSubmit: boolean,
  isAddOnEvent: boolean,
  event: ChatEvent,
  text: string,
  statusCode: "OK" | "INVALID_ARGUMENT"
): Record<string, unknown> {
  if (isDialogSubmit) {
    if (event.commonEventObject) {
      return addOnTextResponse(text);
    }
    return dialogActionStatusResponse(text, statusCode);
  }
  if (isAddOnEvent) {
    return addOnTextResponse(text);
  }
  return actionResponseText(text);
}

function respondReviewDialog(
  isDialogSubmit: boolean,
  isAddOnEvent: boolean,
  event: ChatEvent,
  card: Record<string, unknown>
): Record<string, unknown> {
  if (isDialogSubmit && event.commonEventObject) {
    return addOnDialogResponse(card);
  }
  if (isDialogSubmit) {
    return dialogResponse(card);
  }
  if (isAddOnEvent) {
    return addOnDialogResponse(card);
  }
  return actionResponseCard(card);
}

function updateDialogCard(card: Record<string, unknown>): Record<string, unknown> {
  return {
    action: {
      navigations: [
        {
          updateCard: card
        }
      ]
    }
  };
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

async function sendSubmitResultToChat(
  config: AppConfig,
  deps: ChatEventHandlerDeps,
  refreshToken: string,
  event: ChatEvent,
  text: string
): Promise<void> {
  const spaceName = event.chat?.space?.name;
  if (!spaceName) {
    logChatEvent("submit.sendChatMessage.skipped", { reason: "missingSpaceName" });
    return;
  }

  try {
    await deps.sendChatMessage(config, refreshToken, spaceName, text);
    logChatEvent("submit.sendChatMessage.success", { spaceName });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logChatEvent("submit.sendChatMessage.failed", { spaceName, message });
  }
}

function textResponse(text: string): Record<string, unknown> {
  return { text };
}

function addOnTextResponse(text: string): Record<string, unknown> {
  return {
    hostAppDataAction: {
      chatDataAction: {
        createMessageAction: {
          message: {
            text
          }
        }
      }
    }
  };
}

function addOnDialogResponse(card: Record<string, unknown>): Record<string, unknown> {
  return {
    action: {
      navigations: [
        {
          pushCard: card
        }
      ]
    }
  };
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
    action: {
      modifyOperations: [
        {
          updateWidget: {
            selectionInputWidgetSuggestions: {
              suggestions
            }
          }
        }
      ]
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

function reviewFormCard(config: AppConfig): Record<string, unknown> {
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
              label: "Имя и фамилия"
            }
          },
          {
            textInput: {
              name: "employeeEmail",
              label: "Email сотрудника"
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
                  text: "Создать тестовую папку",
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
  return {
    header: {
      title: "Нужно подключить Google"
    },
    sections: [
      {
        widgets: [
          {
            textParagraph: {
              text: "Подключите Google-аккаунт ревьюера и повторите запуск."
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
