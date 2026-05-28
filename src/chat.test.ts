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
  internalReviewFormTemplateId: "internal-form-template-id",
  clientReviewFormTemplateId: "client-form-template-id",
  employeeEmailDomains: ["fuse8.online", "byteminds.co.uk"],
  taskCollectDaysBefore: 14,
  taskCheckDaysBefore: 7,
  taskPrepareDaysBefore: 3,
  taskReminderTime: "12:00",
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
  },
  async savePendingReview() {},
  async consumePendingReview() {
    return null;
  }
};

function createHandler(overrides: Partial<{
  createReviewFolder: ChatEventHandlerDeps["createReviewFolder"];
  createCalendarEvent: ChatEventHandlerDeps["createCalendarEvent"];
  createReviewerReminderEvents: ChatEventHandlerDeps["createReviewerReminderEvents"];
  findPreviousReviewReport: ChatEventHandlerDeps["findPreviousReviewReport"];
  sendChatMessage: ChatEventHandlerDeps["sendChatMessage"];
}> = {}) {
  return createChatEventHandler({
    async findPreviousReviewReport() {
      return {
        id: "previous-report-id",
        name: "Ivan Petrov // Отчёт Performance Review // 2026-05",
        webViewLink: "https://docs.google.com/document/previous-report-id"
      };
    },
    async createCalendarEvent() {
      return {
        id: "calendar-event-id",
        summary: "Performance Review: Ivan Petrov",
        htmlLink: "https://calendar.google.com/event?eid=calendar-event-id",
        startDateTime: "2026-06-15T14:30:00+05:00"
      };
    },
    async createReviewerReminderEvents() {
      return [
        {
          id: "collect-reminder-id",
          summary: "Запустить сбор отзывов для PR Ivan Petrov",
          htmlLink: "https://calendar.google.com/event?eid=collect-reminder-id",
          startDateTime: "2026-05-26T12:00:00+05:00"
        },
        {
          id: "check-reminder-id",
          summary: "Проверить отзывы для PR Ivan Petrov",
          htmlLink: "https://calendar.google.com/event?eid=check-reminder-id",
          startDateTime: "2026-06-04T12:00:00+05:00"
        },
        {
          id: "prepare-reminder-id",
          summary: "Подготовиться к проведению PR Ivan Petrov",
          htmlLink: "https://calendar.google.com/event?eid=prepare-reminder-id",
          startDateTime: "2026-06-10T12:00:00+05:00"
        }
      ];
    },
    ...overrides
  });
}

type ChatEventHandlerDeps = {
  createReviewFolder: typeof import("./drive.js").createReviewFolder;
  createCalendarEvent: typeof import("./calendar.js").createCalendarEvent;
  createReviewerReminderEvents: typeof import("./calendar.js").createReviewerReminderEvents;
  findPreviousReviewReport: typeof import("./drive.js").findPreviousReviewReport;
  buildAuthUrl: typeof import("./oauth.js").buildAuthUrl;
  sendChatMessage: typeof import("./google-chat.js").sendChatMessage;
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
  const handleChatEvent = createHandler({
    async createReviewFolder(_config, refreshToken, request) {
      assert.equal(refreshToken, "refresh-token");
      assert.deepEqual(request, {
        fullName: "Ivan Petrov",
        employeeEmail: "iaroslav.zaiarnyi@byteminds.co.uk",
        reviewerEmail: "reviewer@example.test",
        reviewDate: "2026-06-15",
        meetingTime: "14:30",
        reviewMonth: "2026.06",
        needsClientForm: true,
        previousReviewUrl: "https://docs.google.com/document/previous-report-id"
      });
      return {
        id: "folder-id",
        name: "2026.06",
        webViewLink: "https://drive.google.com/folder",
        report: {
          id: "report-id",
          name: "Ivan Petrov // Отчёт Performance Review // 2026-06",
          webViewLink: "https://docs.google.com/document/report-id"
        },
        internalForm: {
          id: "internal-form-id",
          name: "Ivan Petrov // Internal Feedback Form // 2026-06",
          webViewLink: "https://docs.google.com/forms/internal-form-id"
        },
        clientForm: {
          id: "client-form-id",
          name: "Ivan Petrov // Client Feedback Form // 2026-06",
          webViewLink: "https://docs.google.com/forms/client-form-id"
        }
      };
    },
    async createCalendarEvent(_config, refreshToken, request) {
      assert.equal(refreshToken, "refresh-token");
      assert.deepEqual(request, {
        fullName: "Ivan Petrov",
        employeeEmail: "iaroslav.zaiarnyi@byteminds.co.uk",
        reviewerEmail: "reviewer@example.test",
        reviewDate: "2026-06-15",
        meetingTime: "14:30",
        folderUrl: "https://drive.google.com/folder",
        reportUrl: "https://docs.google.com/document/report-id",
        internalFormUrl: "https://docs.google.com/forms/internal-form-id",
        clientFormUrl: "https://docs.google.com/forms/client-form-id",
        previousReviewUrl: "https://docs.google.com/document/previous-report-id"
      });
      return {
        id: "calendar-event-id",
        summary: "Performance Review: Ivan Petrov",
        htmlLink: "https://calendar.google.com/event?eid=calendar-event-id",
        startDateTime: "2026-06-15T14:30:00+05:00"
      };
    },
    async createReviewerReminderEvents(_config, refreshToken, request) {
      assert.equal(refreshToken, "refresh-token");
      assert.deepEqual(request, {
        fullName: "Ivan Petrov",
        employeeEmail: "iaroslav.zaiarnyi@byteminds.co.uk",
        reviewerEmail: "reviewer@example.test",
        reviewDate: "2026-06-15",
        meetingTime: "14:30",
        folderUrl: "https://drive.google.com/folder",
        reportUrl: "https://docs.google.com/document/report-id",
        internalFormUrl: "https://docs.google.com/forms/internal-form-id",
        clientFormUrl: "https://docs.google.com/forms/client-form-id",
        previousReviewUrl: "https://docs.google.com/document/previous-report-id"
      });
      return [
        {
          id: "collect-reminder-id",
          summary: "Запустить сбор отзывов для PR Ivan Petrov",
          htmlLink: "https://calendar.google.com/event?eid=collect-reminder-id",
          startDateTime: "2026-05-26T12:00:00+05:00"
        },
        {
          id: "check-reminder-id",
          summary: "Проверить отзывы для PR Ivan Petrov",
          htmlLink: "https://calendar.google.com/event?eid=check-reminder-id",
          startDateTime: "2026-06-04T12:00:00+05:00"
        },
        {
          id: "prepare-reminder-id",
          summary: "Подготовиться к проведению PR Ivan Petrov",
          htmlLink: "https://calendar.google.com/event?eid=prepare-reminder-id",
          startDateTime: "2026-06-10T12:00:00+05:00"
        }
      ];
    },
    async sendChatMessage(_config, refreshToken, spaceName, text) {
      sentMessages.push({ refreshToken, spaceName, text });
    }
  });

  const response = await handleChatEvent(config, storage, reviewSubmitEvent());
  const statusText = getResponseText(response);
  const messageText = sentMessages[0]?.text ?? "";

  assert.match(messageText, /Готово: Performance Review для Ivan Petrov/);
  assert.match(messageText, /Папка ревью: 2026\.06 - https:\/\/drive\.google\.com\/folder/);
  assert.match(messageText, /PR report: https:\/\/docs\.google\.com\/document\/report-id/);
  assert.match(messageText, /Previous review: https:\/\/docs\.google\.com\/document\/previous-report-id/);
  assert.match(messageText, /Internal feedback form: https:\/\/docs\.google\.com\/forms\/internal-form-id/);
  assert.match(messageText, /Client feedback form: https:\/\/docs\.google\.com\/forms\/client-form-id/);
  assert.match(messageText, /Встреча: Performance Review: Ivan Petrov - 2026-06-15T14:30:00\+05:00 - https:\/\/calendar\.google\.com\/event\?eid=calendar-event-id/);
  assert.match(messageText, /Reminders:/);
  assert.match(messageText, /Запустить сбор отзывов для PR Ivan Petrov - 2026-05-26T12:00:00\+05:00 - https:\/\/calendar\.google\.com\/event\?eid=collect-reminder-id/);
  assert.match(messageText, /Проверить отзывы для PR Ivan Petrov - 2026-06-04T12:00:00\+05:00 - https:\/\/calendar\.google\.com\/event\?eid=check-reminder-id/);
  assert.match(messageText, /Подготовиться к проведению PR Ivan Petrov - 2026-06-10T12:00:00\+05:00 - https:\/\/calendar\.google\.com\/event\?eid=prepare-reminder-id/);
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
    const handleChatEvent = createHandler({
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
  const handleChatEvent = createHandler({
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
  const handleChatEvent = createHandler({
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
  const handleChatEvent = createHandler({
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

test("/review submit validates meeting time", async () => {
  const handleChatEvent = createHandler({
    async createReviewFolder() {
      throw new Error("should not create folder");
    }
  });

  const response = await handleChatEvent(
    config,
    storage,
    reviewSubmitEvent({ meetingTime: "" })
  );
  const text = getResponseText(response);

  assert.match(text, /Укажите время ревью/);
});

test("/review submit includes only internal form link when client form is not needed", async () => {
  const handleChatEvent = createHandler({
    async createReviewFolder(_config, _refreshToken, request) {
      assert.equal(request.needsClientForm, false);
      return {
        id: "folder-id",
        name: "2026.06",
        webViewLink: "https://drive.google.com/folder",
        internalForm: {
          id: "internal-form-id",
          name: "Ivan Petrov // Internal Feedback Form // 2026-06",
          webViewLink: "https://docs.google.com/forms/internal-form-id"
        }
      };
    }
  });

  const response = await handleChatEvent(
    config,
    storage,
    reviewSubmitEvent({ needsClientForm: false, commonEventObject: true })
  );
  const text = getResponseText(response);

  assert.match(text, /Internal feedback form: https:\/\/docs\.google\.com\/forms\/internal-form-id/);
  assert.doesNotMatch(text, /Client feedback form:/);
});

test("/review submit asks to configure internal form template when it is missing", async () => {
  const handleChatEvent = createHandler({
    async createReviewFolder() {
      throw new Error("should not create folder");
    }
  });

  const response = await handleChatEvent(
    { ...config, internalReviewFormTemplateId: "" },
    storage,
    reviewSubmitEvent({ commonEventObject: true })
  );
  const text = getResponseText(response);

  assert.match(text, /Настройте INTERNAL_REVIEW_FORM_TEMPLATE_ID/);
});

test("/review submit asks to configure client form template when checkbox is selected", async () => {
  const handleChatEvent = createHandler({
    async createReviewFolder() {
      throw new Error("should not create folder");
    }
  });

  const response = await handleChatEvent(
    { ...config, clientReviewFormTemplateId: "" },
    storage,
    reviewSubmitEvent({ commonEventObject: true })
  );
  const text = getResponseText(response);

  assert.match(text, /Настройте CLIENT_REVIEW_FORM_TEMPLATE_ID/);
});

test("/review submit asks to configure report template when it is missing", async () => {
  const handleChatEvent = createHandler({
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
  const handleChatEvent = createHandler({
    async findPreviousReviewReport() {
      throw new Error("Папка сотрудника не найдена: Ivan Petrov");
    },
    async createReviewFolder() {
      throw new Error("should not create folder");
    },
    async sendChatMessage(_config, _refreshToken, _spaceName, text) {
      sentMessages.push(text);
    }
  });

  const response = await handleChatEvent(config, storage, reviewSubmitEvent());
  const statusText = getResponseText(response);

  assert.match(statusText, /Не удалось найти предыдущее ревью/);
  assert.match(statusText, /Папка сотрудника не найдена: Ivan Petrov/);
  assert.equal(sentMessages.length, 0);
});

test("/review submit asks to confirm when previous review is missing", async () => {
  const savedPending: Array<Record<string, unknown>> = [];
  const pendingStorage: TokenStorage = {
    ...storage,
    async savePendingReview(request) {
      savedPending.push(request);
    }
  };
  const handleChatEvent = createHandler({
    async findPreviousReviewReport() {
      return null;
    },
    async createReviewFolder() {
      throw new Error("should not create folder");
    }
  });

  const response = await handleChatEvent(
    config,
    pendingStorage,
    reviewSubmitEvent({ commonEventObject: true })
  );

  assert.equal(savedPending.length, 1);
  assert.equal(savedPending[0]?.fullName, "Ivan Petrov");
  assert.equal(savedPending[0]?.reviewMonth, "2026.06");
  const action = response.action as {
    navigations?: Array<{ pushCard?: { header?: { title?: string } } }>;
  };
  assert.deepEqual(action.navigations?.[0]?.pushCard?.header, {
    title: "Предыдущее ревью не найдено"
  });
});

test("/review submit continues without previous review after confirmation", async () => {
  const pendingStorage: TokenStorage = {
    ...storage,
    async savePendingReview() {},
    async consumePendingReview() {
      return {
        chatUserId: "users/123",
        reviewMonth: "2026.06",
        createdAt: "2026-05-27T00:00:00.000Z",
        fullName: "Ivan Petrov",
        employeeEmail: "iaroslav.zaiarnyi@byteminds.co.uk",
        reviewDate: "2026-06-15",
        meetingTime: "14:30",
        needsClientForm: true
      };
    }
  };
  const handleChatEvent = createHandler({
    async createReviewFolder(_config, _refreshToken, request) {
      assert.equal(request.previousReviewUrl, "");
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
    }
  });

  const response = await handleChatEvent(
    config,
    pendingStorage,
    confirmWithoutPreviousEvent({ commonEventObject: true })
  );
  const text = getResponseText(response);

  assert.match(text, /Папка ревью: 2026\.06 - https:\/\/drive\.google\.com\/folder/);
  assert.doesNotMatch(text, /Previous review:/);
});

test("/review submit returns user-facing text when Drive folder creation fails", async () => {
  const handleChatEvent = createHandler({
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

function confirmWithoutPreviousEvent(
  overrides: { commonEventObject?: boolean } = {}
): ChatEvent {
  const event: ChatEvent = {
    user: {
      name: "users/123"
    },
    chat: {
      buttonClickedPayload: {
        isDialogEvent: true,
        dialogEventType: "SUBMIT_DIALOG"
      }
    },
    commonEventObject: {
      parameters: {
        actionName: "confirmReviewWithoutPrevious"
      }
    }
  };

  if (!overrides.commonEventObject) {
    delete event.commonEventObject;
    event.common = {
      invokedFunction: "confirmReviewWithoutPrevious"
    };
  }

  return event;
}

function reviewSubmitEvent(
  overrides: {
    employeeEmail?: string;
    meetingTime?: string;
    needsClientForm?: boolean;
    commonEventObject?: boolean;
  } = {}
): ChatEvent {
  const event: ChatEvent = {
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
        meetingTime: {
          stringInputs: {
            value: overrides.meetingTime === undefined ? ["14:30"] : [overrides.meetingTime]
          }
        },
        needsClientForm: {
          stringInputs: {
            value: overrides.needsClientForm === false ? [] : ["yes"]
          }
        }
      }
    }
  };

  if (overrides.commonEventObject) {
    event.commonEventObject = {
      formInputs: event.common?.formInputs,
      parameters: {
        actionName: "submitReview"
      }
    };
  }

  return event;
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
