import type { AppConfig } from "./config.js";
import { createReviewFolder } from "./drive.js";
import { buildAuthUrl } from "./oauth.js";
import type { TokenStorage } from "./storage.js";
import type { ChatEvent, ChatFormInput, ReviewRequest } from "./types.js";

const SUBMIT_FUNCTION = "submitReview";

export async function handleChatEvent(
  config: AppConfig,
  storage: TokenStorage,
  event: ChatEvent
): Promise<Record<string, unknown>> {
  const chatUserId = event.user?.name;

  if (!chatUserId) {
    return textResponse("Не удалось определить пользователя Google Chat.");
  }

  if (event.common?.invokedFunction === SUBMIT_FUNCTION) {
    return handleReviewSubmit(config, storage, chatUserId, event);
  }

  return dialogResponse(reviewFormCard());
}

async function handleReviewSubmit(
  config: AppConfig,
  storage: TokenStorage,
  chatUserId: string,
  event: ChatEvent
): Promise<Record<string, unknown>> {
  const parsed = parseReviewRequest(event.common?.formInputs ?? {});

  if (!parsed.ok) {
    return actionResponseText(parsed.error);
  }

  const token = await storage.get(chatUserId);
  if (!token) {
    const authUrl = await buildAuthUrl(config, storage, chatUserId);
    return actionResponseCard(authRequiredCard(authUrl));
  }

  const month = formatReviewMonth(parsed.value.reviewDate);
  const folderName = `${parsed.value.fullName} // ${month}`;
  const folder = await createReviewFolder(config, token.refreshToken, folderName);

  return actionResponseText(
    [
      `Создана тестовая папка PR: ${folder.name}`,
      `Ссылка: ${folder.webViewLink}`,
      `Клиентская форма: ${parsed.value.needsClientForm ? "нужна" : "не нужна"}`
    ].join("\n")
  );
}

function parseReviewRequest(inputs: Record<string, ChatFormInput>):
  | { ok: true; value: ReviewRequest }
  | { ok: false; error: string } {
  const fullName = getStringInput(inputs.fullName).trim();
  const reviewDate = getDateInput(inputs.reviewDate);
  const needsClientForm = getStringInput(inputs.needsClientForm) === "yes";

  if (!fullName) {
    return { ok: false, error: "Укажите имя и фамилию." };
  }

  if (!reviewDate) {
    return { ok: false, error: "Укажите дату ревью." };
  }

  return {
    ok: true,
    value: {
      fullName,
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

function formatReviewMonth(date: string): string {
  return date.slice(0, 7).replace("-", ".");
}

function textResponse(text: string): Record<string, unknown> {
  return { text };
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

function reviewFormCard(): Record<string, unknown> {
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
                      function: SUBMIT_FUNCTION
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
