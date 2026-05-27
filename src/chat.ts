import type { AppConfig } from "./config.js";
import { createReviewFolder, type CreatedFolder } from "./drive.js";
import { sendChatMessage } from "./google-chat.js";
import { buildAuthUrl } from "./oauth.js";
import type { TokenStorage } from "./storage.js";
import type { ChatEvent, ChatFormInput, ReviewRequest } from "./types.js";

const SUBMIT_FUNCTION = "submitReview";
const REVIEW_COMMAND_ID = 1;
const HEALTH_COMMAND_ID = 2;

type ChatEventHandlerDeps = {
  createReviewFolder: typeof createReviewFolder;
  buildAuthUrl: typeof buildAuthUrl;
  sendChatMessage: typeof sendChatMessage;
};

const defaultDeps: ChatEventHandlerDeps = {
  createReviewFolder,
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

  if (appCommandId === REVIEW_COMMAND_ID) {
    logChatEvent("route.reviewDialog");
    return addOnDialogResponse(reviewFormCard(config));
  }

  logChatEvent("route.unknownCommand", { appCommandId, actionName });
  return textResponse("Неизвестная команда Google Chat.");
  };
}

export const handleChatEvent = createChatEventHandler();

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

  if (!config.reviewReportTemplateId) {
    const errorText = "Настройте REVIEW_REPORT_TEMPLATE_ID в .env.local или .env.";
    logChatEvent("submit.validationFailed", { error: errorText });
    if (isDialogSubmit) {
      if (event.commonEventObject) {
        return addOnTextResponse(errorText);
      }
      return dialogActionStatusResponse(errorText, "INVALID_ARGUMENT");
    }
    if (isAddOnEvent) {
      return addOnTextResponse(errorText);
    }
    return actionResponseText(errorText);
  }

  if (!config.internalReviewFormTemplateId) {
    const errorText = "Настройте INTERNAL_REVIEW_FORM_TEMPLATE_ID в .env.local или .env.";
    logChatEvent("submit.validationFailed", { error: errorText });
    if (isDialogSubmit) {
      if (event.commonEventObject) {
        return addOnTextResponse(errorText);
      }
      return dialogActionStatusResponse(errorText, "INVALID_ARGUMENT");
    }
    if (isAddOnEvent) {
      return addOnTextResponse(errorText);
    }
    return actionResponseText(errorText);
  }

  if (parsed.value.needsClientForm && !config.clientReviewFormTemplateId) {
    const errorText = "Настройте CLIENT_REVIEW_FORM_TEMPLATE_ID в .env.local или .env.";
    logChatEvent("submit.validationFailed", { error: errorText });
    if (isDialogSubmit) {
      if (event.commonEventObject) {
        return addOnTextResponse(errorText);
      }
      return dialogActionStatusResponse(errorText, "INVALID_ARGUMENT");
    }
    if (isAddOnEvent) {
      return addOnTextResponse(errorText);
    }
    return actionResponseText(errorText);
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

  logChatEvent("submit.createFolder.start", {
    fullName: parsed.value.fullName,
    reviewMonth: month,
    needsClientForm: parsed.value.needsClientForm
  });
  let folder;
  try {
    folder = await deps.createReviewFolder(config, token.refreshToken, {
      fullName: parsed.value.fullName,
      employeeEmail: parsed.value.employeeEmail,
      reviewerEmail: token.googleUserEmail,
      reviewDate: parsed.value.reviewDate,
      reviewMonth: month,
      needsClientForm: parsed.value.needsClientForm
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
      void sendSubmitResultToChat(config, deps, token.refreshToken, event, errorText);
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

  const successText = formatReviewSuccessMessage(folder, parsed.value.needsClientForm);

  if (isDialogSubmit) {
    if (event.commonEventObject) {
      return addOnTextResponse(successText);
    }
    void sendSubmitResultToChat(config, deps, token.refreshToken, event, successText);
    return dialogActionStatusResponse("Готово. Отчёт отправлен в чат.", "OK");
  }

  if (isAddOnEvent) {
    return addOnTextResponse(successText);
  }

  return actionResponseText(successText);
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

  return {
    ok: true,
    value: {
      fullName,
      employeeEmail,
      reviewDate,
      needsClientForm
    }
  };
}

function getStringInput(input: ChatFormInput | undefined): string {
  return input?.stringInputs?.value?.[0] ?? "";
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

function formatReviewSuccessMessage(folder: CreatedFolder, needsClientForm: boolean): string {
  return [
    `Создана папка ревью: ${folder.name}`,
    `Ссылка: ${folder.webViewLink}`,
    ...(folder.report?.webViewLink ? [`PR report: ${folder.report.webViewLink}`] : []),
    ...(folder.internalForm?.webViewLink
      ? [`Internal feedback form: ${folder.internalForm.webViewLink}`]
      : []),
    ...(needsClientForm && folder.clientForm?.webViewLink
      ? [`Client feedback form: ${folder.clientForm.webViewLink}`]
      : [])
  ].join("\n");
}

function isEmailInDomains(email: string, domains: string[]): boolean {
  return domains.some((domain) => email.endsWith(`@${domain.toLowerCase()}`));
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
