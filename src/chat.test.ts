import assert from "node:assert/strict";
import test from "node:test";
import type { AppConfig } from "./config.js";
import { createChatEventHandler } from "./chat.js";
import type { TokenStorage } from "./storage.js";
import type { ChatEvent } from "./types.js";

const config: AppConfig = {
  appBaseUrl: "https://example.test",
  googleClientId: "client-id",
  googleClientSecret: "client-secret",
  googleRedirectUri: "https://example.test/auth/google/callback",
  reviewsRootFolderId: "root-folder-id",
  reviewReportTemplateId: "report-template-id",
  employeeEmailDomains: ["fuse8.online", "byteminds.co.uk"],
  storageDriver: "local",
  localStoragePath: ".data/storage.json",
  port: 8080
};

const storage: TokenStorage = {
  async get() {
    return {
      chatUserId: "users/123",
      googleUserEmail: "reviewer@example.test",
      refreshToken: "refresh-token",
      createdAt: "2026-05-27T00:00:00.000Z"
    };
  },
  async save() {},
  async saveOAuthState() {},
  async consumeOAuthState() {
    return null;
  }
};

test("/check returns smoke-test response", async () => {
  const handleChatEvent = createChatEventHandler();

  const response = await handleChatEvent(config, storage, {
    chat: {
      appCommandPayload: {
        appCommandMetadata: {
          appCommandId: 2
        }
      }
    }
  });

  assert.deepEqual(response, {
    hostAppDataAction: {
      chatDataAction: {
        createMessageAction: {
          message: {
            text: "hello world"
          }
        }
      }
    }
  });
});

test("/review submit creates a test folder and returns its link", async () => {
  const sentMessages: Array<{ refreshToken: string; spaceName: string; text: string }> = [];
  const handleChatEvent = createChatEventHandler({
    async createReviewFolder(_config, refreshToken, request) {
      assert.equal(refreshToken, "refresh-token");
      assert.deepEqual(request, {
        fullName: "Ivan Petrov",
        employeeEmail: "iaroslav.zaiarnyi@byteminds.co.uk",
        reviewerEmail: "reviewer@example.test",
        reviewDate: "2026-06-15",
        reviewMonth: "2026.06"
      });
      return {
        id: "folder-id",
        name: "2026.06",
        webViewLink: "https://drive.google.com/folder",
        report: {
          id: "report-id",
          name: "Ivan Petrov // Отчёт Performance Review // 2026-06",
          webViewLink: "https://docs.google.com/document/report-id"
        }
      };
    },
    async sendChatMessage(_config, refreshToken, spaceName, text) {
      sentMessages.push({ refreshToken, spaceName, text });
    }
  });

  const response = await handleChatEvent(config, storage, reviewSubmitEvent());
  const statusText = getResponseText(response);
  const messageText = sentMessages[0]?.text ?? "";

  assert.match(messageText, /Создана папка ревью: 2026\.06/);
  assert.match(messageText, /Ссылка: https:\/\/drive\.google\.com\/folder/);
  assert.match(messageText, /PR report: https:\/\/docs\.google\.com\/document\/report-id/);
  assert.match(messageText, /Клиентская форма: нужна/);
  assert.equal(statusText, "Готово. Отчёт отправлен в чат.");
  assert.deepEqual(response.actionResponse, {
    type: "DIALOG",
    dialogAction: {
      actionStatus: {
        statusCode: "OK",
        userFacingMessage: "Готово. Отчёт отправлен в чат."
      }
    }
  });
  assert.deepEqual(sentMessages, [
    {
      refreshToken: "refresh-token",
      spaceName: "spaces/AAA",
      text: messageText
    }
  ]);
});

test("/review submit does not wait for Chat API message delivery", async () => {
  let resolveSend!: () => void;
  let responsePromise!: Promise<Record<string, unknown>>;
  const sendStarted = new Promise<void>((resolve) => {
    const handleChatEvent = createChatEventHandler({
      async createReviewFolder() {
        return {
          id: "folder-id",
          name: "2026.06",
          webViewLink: "https://drive.google.com/folder"
        };
      },
      async sendChatMessage() {
        resolve();
        await new Promise<void>((sendResolve) => {
          resolveSend = sendResolve;
        });
      }
    });

    responsePromise = handleChatEvent(config, storage, reviewSubmitEvent());
  });

  await sendStarted;
  const response = await responsePromise;
  assert.deepEqual(response.actionResponse, {
    type: "DIALOG",
    dialogAction: {
      actionStatus: {
        statusCode: "OK",
        userFacingMessage: "Готово. Отчёт отправлен в чат."
      }
    }
  });
  resolveSend();
});

test("/review submit validates employee email domain", async () => {
  const handleChatEvent = createChatEventHandler({
    async createReviewFolder() {
      throw new Error("should not create folder");
    }
  });

  const response = await handleChatEvent(
    config,
    storage,
    reviewSubmitEvent({ employeeEmail: "ivan.petrov@other.test" })
  );
  const text = getResponseText(response);

  assert.match(text, /Email сотрудника должен быть в одном из доменов: fuse8\.online, byteminds\.co\.uk/);
});

test("/review submit accepts employee email from any configured domain", async () => {
  const acceptedEmails: string[] = [];
  const handleChatEvent = createChatEventHandler({
    async createReviewFolder(_config, _refreshToken, request) {
      acceptedEmails.push(request.employeeEmail);
      return {
        id: "folder-id",
        name: "2026.06",
        webViewLink: "https://drive.google.com/folder"
      };
    },
    async sendChatMessage() {
    }
  });

  await handleChatEvent(config, storage, reviewSubmitEvent({ employeeEmail: "bair.ochirov@fuse8.online" }));
  await handleChatEvent(config, storage, reviewSubmitEvent({ employeeEmail: "iaroslav.zaiarnyi@byteminds.co.uk" }));

  assert.deepEqual(acceptedEmails, [
    "bair.ochirov@fuse8.online",
    "iaroslav.zaiarnyi@byteminds.co.uk"
  ]);
});

test("/review submit asks to configure employee email domain when it is missing", async () => {
  const handleChatEvent = createChatEventHandler({
    async createReviewFolder() {
      throw new Error("should not create folder");
    }
  });

  const response = await handleChatEvent(
    { ...config, employeeEmailDomains: [] },
    storage,
    reviewSubmitEvent()
  );
  const text = getResponseText(response);

  assert.match(text, /Настройте EMPLOYEE_EMAIL_DOMAINS/);
});

test("/review submit asks to configure report template when it is missing", async () => {
  const handleChatEvent = createChatEventHandler({
    async createReviewFolder() {
      throw new Error("should not create folder");
    }
  });

  const response = await handleChatEvent(
    { ...config, reviewReportTemplateId: "" },
    storage,
    reviewSubmitEvent()
  );
  const text = getResponseText(response);

  assert.match(text, /Настройте REVIEW_REPORT_TEMPLATE_ID/);
});

test("/review submit returns clear text when employee folder is missing", async () => {
  const sentMessages: string[] = [];
  const handleChatEvent = createChatEventHandler({
    async createReviewFolder() {
      throw new Error("Папка сотрудника не найдена: Ivan Petrov");
    },
    async sendChatMessage(_config, _refreshToken, _spaceName, text) {
      sentMessages.push(text);
    }
  });

  const response = await handleChatEvent(config, storage, reviewSubmitEvent());
  const statusText = getResponseText(response);

  assert.equal(statusText, "Не удалось выполнить /review. Ошибка отправлена в чат.");
  assert.deepEqual(response.actionResponse, {
    type: "DIALOG",
    dialogAction: {
      actionStatus: {
        statusCode: "INVALID_ARGUMENT",
        userFacingMessage: "Не удалось выполнить /review. Ошибка отправлена в чат."
      }
    }
  });
  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0], /Папка сотрудника не найдена: Ivan Petrov/);
});

test("/review submit returns user-facing text when Drive folder creation fails", async () => {
  const handleChatEvent = createChatEventHandler({
    async createReviewFolder() {
      throw new Error("Drive API has not been used in project");
    },
    async sendChatMessage() {
    }
  });

  const response = await handleChatEvent(config, storage, reviewSubmitEvent());
  const text = getResponseText(response);

  assert.match(text, /Не удалось выполнить \/review/);
});

function reviewSubmitEvent(overrides: { employeeEmail?: string } = {}): ChatEvent {
  return {
    user: {
      name: "users/123"
    },
    chat: {
      space: {
        name: "spaces/AAA"
      },
      buttonClickedPayload: {
        isDialogEvent: true,
        dialogEventType: "SUBMIT_DIALOG"
      }
    },
    common: {
      invokedFunction: "submitReview",
      formInputs: {
        fullName: {
          stringInputs: {
            value: ["Ivan Petrov"]
          }
        },
        employeeEmail: {
          stringInputs: {
            value: [overrides.employeeEmail ?? "iaroslav.zaiarnyi@byteminds.co.uk"]
          }
        },
        reviewDate: {
          dateInput: {
            msSinceEpoch: String(Date.UTC(2026, 5, 15))
          }
        },
        needsClientForm: {
          stringInputs: {
            value: ["yes"]
          }
        }
      }
    }
  };
}

function getResponseText(response: Record<string, unknown>): string {
  if (typeof response.text === "string") {
    return response.text;
  }

  const actionResponse = response.actionResponse as {
    dialogAction?: {
      actionStatus?: {
        userFacingMessage?: string;
      };
    };
  };

  if (actionResponse?.dialogAction?.actionStatus?.userFacingMessage) {
    return actionResponse.dialogAction.actionStatus.userFacingMessage;
  }

  const message = response.hostAppDataAction as {
    chatDataAction?: {
      createMessageAction?: {
        message?: {
          text?: string;
        };
      };
    };
  };

  return message.chatDataAction?.createMessageAction?.message?.text ?? "";
}
