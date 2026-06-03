import assert from "node:assert/strict";
import test from "node:test";
import type { AppConfig } from "./config.js";
import { createChatEventHandler, getDirectorySearchQuery } from "./chat.js";
import type { TokenStorage } from "./storage.js";
import type { ChatEvent } from "./types.js";

const config: AppConfig = {
  appBaseUrl: "https://example.test",
  googleClientId: "client-id",
  googleClientSecret: "client-secret",
  googleRedirectUri: "https://example.test/auth/google/callback",
  reviewsRootFolderId: "root-folder-id",
  chatServiceAccountKeyFile: undefined,
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

const REVIEW_WORKFLOW_ACK_MESSAGE = "Запустил подготовку PR. Результат пришлю сюда.";

async function flushBackgroundTasks(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

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
  async delete() {},
  async saveOAuthState() {},
  async consumeOAuthState() {
    return null;
  },
  async savePendingReview() {},
  async consumePendingReview() {
    return null;
  }
};

function createHandler(overrides: Partial<ChatEventHandlerDeps> = {}) {
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
  findEmployeeFolder: typeof import("./drive.js").findEmployeeFolder;
  searchDirectoryEmployees: typeof import("./people.js").searchDirectoryEmployees;
  buildAuthUrl: typeof import("./oauth.js").buildAuthUrl;
  sendChatMessage: typeof import("./google-chat.js").sendChatMessage;
};

test("/info returns bot version and review command help", async () => {
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

  const text = getResponseText(response);
  assert.match(text, /^\/info/m);
  assert.match(text, /Version: 0\.1\.0/);
  assert.match(text, /Available commands:/);
  assert.match(text, /\/review/);
  assert.match(text, /opens a form|открывает форму/i);
});

test("/check-auth returns auth diagnostics report", async () => {
  const handleChatEvent = createChatEventHandler({
    async buildAuthCheckReport() {
      return "Auth check (/check-auth)\n\n- Chat token probe: OK";
    }
  });

  const response = await handleChatEvent(config, storage, {
    user: {
      name: "users/123"
    },
    chat: {
      appCommandPayload: {
        appCommandMetadata: {
          appCommandId: 3
        }
      }
    }
  });

  const text = getResponseText(response);
  assert.match(text, /Auth check/);
  assert.match(text, /Chat token probe: OK/);
});

test("/review opens employee lookup card", async () => {
  const handleChatEvent = createChatEventHandler();

  const response = await handleChatEvent(config, storage, {
    user: {
      name: "users/123"
    },
    chat: {
      appCommandPayload: {
        appCommandMetadata: {
          appCommandId: 1
        }
      }
    }
  });

  const card = getFirstCard(response);
  const widgets = card.sections?.[0]?.widgets ?? [];

  assert.equal(card.header?.title, "Выбор сотрудника");
  assert.deepEqual(widgets[0], {
    selectionInput: {
      name: "employeeFolder",
      type: "MULTI_SELECT",
      label: "Имя, фамилия или email",
      multiSelectMaxSelectedItems: 1,
      multiSelectMinQueryLength: 1,
      onChangeAction: {
        function: "https://example.test/google-chat/events",
        parameters: [
          {
            key: "actionName",
            value: "selectEmployee"
          }
        ]
      },
      externalDataSource: {
        function: "https://example.test/google-chat/events"
      }
    }
  });
  assert.equal(widgets.length, 1);
});

test("/review sends auth message without closing dialog when reviewer token is missing", async () => {
  const emptyStorage: TokenStorage = {
    ...storage,
    async get() {
      return null;
    }
  };
  const sentMessages: string[] = [];
  const handleChatEvent = createChatEventHandler({
    async buildAuthUrl() {
      return "https://example.test/auth/start";
    },
    async sendChatMessage(_config, spaceName, text) {
      assert.equal(spaceName, "spaces/AAA");
      sentMessages.push(text);
    }
  });

  const response = await handleChatEvent(config, emptyStorage, reviewCommandEvent());

  assert.deepEqual(response, {});
  assert.match(sentMessages[0] ?? "", /https:\/\/example\.test\/auth\/start/);
  assert.match(sentMessages[0] ?? "", /подключить Google-аккаунт ревьюера/i);
});

test("resolveChatSpaceName reads space from appCommandPayload", async () => {
  const emptyStorage: TokenStorage = {
    ...storage,
    async get() {
      return null;
    }
  };
  const sentSpaces: string[] = [];
  const handleChatEvent = createChatEventHandler({
    async buildAuthUrl() {
      return "https://example.test/oauth";
    },
    async sendChatMessage(_config, spaceName) {
      sentSpaces.push(spaceName);
    }
  });

  await handleChatEvent(config, emptyStorage, {
    user: { name: "users/123" },
    chat: {
      appCommandPayload: {
        appCommandMetadata: { appCommandId: 1 },
        space: { name: "spaces/from-command" }
      }
    },
    commonEventObject: {}
  });

  assert.deepEqual(sentSpaces, ["spaces/from-command"]);
});

test("/review employee suggestions close dialog and send auth message when token is missing", async () => {
  const emptyStorage: TokenStorage = {
    ...storage,
    async get() {
      return null;
    }
  };
  const sentMessages: string[] = [];
  const handleChatEvent = createHandler({
    async buildAuthUrl() {
      return "https://example.test/oauth";
    },
    async sendChatMessage(_config, _spaceName, text) {
      sentMessages.push(text);
    }
  });

  const response = await handleChatEvent(
    config,
    emptyStorage,
    employeeSuggestionsEvent("ivan", { spaceName: "spaces/AAA" })
  );

  const action = response.action as {
    navigations?: Array<{ endNavigation?: { action?: string } }>;
  };
  assert.equal(action.navigations?.[0]?.endNavigation?.action, "CLOSE_DIALOG");
  assert.match(sentMessages[0] ?? "", /https:\/\/example\.test\/oauth/);
});

test("/review employee suggestions close dialog and send auth message on invalid_grant", async () => {
  let deleted = false;
  const trackingStorage: TokenStorage = {
    ...storage,
    async delete(chatUserId) {
      deleted = true;
      assert.equal(chatUserId, "users/123");
    }
  };
  const sentMessages: string[] = [];
  const handleChatEvent = createHandler({
    async searchDirectoryEmployees() {
      throw new Error('{"error":"invalid_grant","error_description":"Token has been expired or revoked."}');
    },
    async buildAuthUrl() {
      return "https://example.test/oauth";
    },
    async sendChatMessage(_config, _spaceName, text) {
      sentMessages.push(text);
    }
  });

  const response = await handleChatEvent(
    config,
    trackingStorage,
    employeeSuggestionsEvent("ivan", { spaceName: "spaces/AAA" })
  );

  assert.equal(deleted, true);
  const action = response.action as {
    navigations?: Array<{ endNavigation?: { action?: string } }>;
  };
  assert.equal(action.navigations?.[0]?.endNavigation?.action, "CLOSE_DIALOG");
  assert.match(sentMessages[0] ?? "", /https:\/\/example\.test\/oauth/);
});

test("/review submit sends auth link to chat when workflow fails with invalid_grant", async () => {
  let deleted = false;
  const trackingStorage: TokenStorage = {
    ...storage,
    async delete() {
      deleted = true;
    }
  };
  const sentMessages: string[] = [];
  const handleChatEvent = createHandler({
    async createReviewFolder() {
      throw new Error("invalid_grant");
    },
    async buildAuthUrl() {
      return "https://example.test/oauth";
    },
    async sendChatMessage(_config, _spaceName, text) {
      sentMessages.push(text);
    }
  });

  await handleChatEvent(config, trackingStorage, reviewSubmitEvent());
  await flushBackgroundTasks();

  assert.equal(deleted, true);
  assert.equal(sentMessages.length, 2);
  assert.match(sentMessages[1] ?? "", /https:\/\/example\.test\/oauth/);
  assert.match(sentMessages[1] ?? "", /подключить Google-аккаунт ревьюера/i);
});

test("/review submit closes dialog and sends auth message when previous review lookup fails with invalid_grant", async () => {
  let deleted = false;
  const trackingStorage: TokenStorage = {
    ...storage,
    async delete() {
      deleted = true;
    }
  };
  const sentMessages: string[] = [];
  const handleChatEvent = createHandler({
    async findPreviousReviewReport() {
      throw new Error("invalid_grant");
    },
    async buildAuthUrl() {
      return "https://example.test/oauth";
    },
    async sendChatMessage(_config, _spaceName, text) {
      sentMessages.push(text);
    }
  });

  const response = await handleChatEvent(
    config,
    trackingStorage,
    reviewSubmitEvent({ commonEventObject: true })
  );

  assert.equal(deleted, true);
  const action = response.action as {
    navigations?: Array<{ endNavigation?: { action?: string } }>;
  };
  assert.equal(action.navigations?.[0]?.endNavigation?.action, "CLOSE_DIALOG");
  assert.match(sentMessages[0] ?? "", /https:\/\/example\.test\/oauth/);
  assert.match(sentMessages[0] ?? "", /подключить Google-аккаунт ревьюера/i);
});

test("/review employee suggestions return matching directory employees", async () => {
  const handleChatEvent = createHandler({
    async searchDirectoryEmployees(_config, refreshToken, query) {
      assert.equal(refreshToken, "refresh-token");
      assert.equal(query, "ivan");
      return [
        {
          fullName: "Ivan Petrov",
          email: "ivan.petrov@fuse8.online",
          resourceName: "people/c123"
        }
      ];
    }
  });

  const response = await handleChatEvent(config, storage, employeeSuggestionsEvent("ivan"));

  assert.deepEqual(response, {
    action: {
      modifyOperations: [
        {
          updateWidget: {
            selectionInputWidgetSuggestions: {
              suggestions: [
                {
                  text: "Ivan Petrov (ivan.petrov@fuse8.online)",
                  value: "ivan.petrov@fuse8.online|Ivan Petrov"
                }
              ]
            }
          }
        }
      ]
    }
  });
});

test("/review employee suggestions show empty-state message when nothing matches", async () => {
  const handleChatEvent = createHandler({
    async searchDirectoryEmployees() {
      return [];
    }
  });

  const response = await handleChatEvent(config, storage, employeeSuggestionsEvent("unknown"));

  assert.deepEqual(response, {
    action: {
      modifyOperations: [
        {
          updateWidget: {
            selectionInputWidgetSuggestions: {
              suggestions: [
                {
                  text: "Сотрудник не найден",
                  bottomText: "Попробуйте поиск по другому параметру или на английском языке",
                  value: "__no_results__"
                }
              ]
            }
          }
        }
      ]
    }
  });
});

test("getDirectorySearchQuery keeps latin queries unchanged", () => {
  assert.equal(getDirectorySearchQuery("ivan"), "ivan");
  assert.equal(getDirectorySearchQuery("Andrey Stepanov"), "Andrey Stepanov");
});

test("getDirectorySearchQuery transliterates cyrillic queries to latin for directory search", () => {
  assert.equal(getDirectorySearchQuery("иван"), "ivan");
  assert.equal(getDirectorySearchQuery("Андрей"), "andrey");
  assert.equal(getDirectorySearchQuery("Андрей Степанов"), "andrey stepanov");
});

test("/review employee suggestions transliterate cyrillic query before directory search", async () => {
  const handleChatEvent = createHandler({
    async searchDirectoryEmployees(_config, refreshToken, query) {
      assert.equal(refreshToken, "refresh-token");
      assert.equal(query, "andrey");
      return [
        {
          fullName: "Andrey Stepanov",
          email: "andrey.stepanov@fuse8.online",
          resourceName: "people/c456"
        }
      ];
    }
  });

  const response = await handleChatEvent(config, storage, employeeSuggestionsEvent("Андрей"));

  assert.deepEqual(response, {
    action: {
      modifyOperations: [
        {
          updateWidget: {
            selectionInputWidgetSuggestions: {
              suggestions: [
                {
                  text: "Andrey Stepanov (andrey.stepanov@fuse8.online)",
                  value: "andrey.stepanov@fuse8.online|Andrey Stepanov"
                }
              ]
            }
          }
        }
      ]
    }
  });
});

test("/review employee selection updates card with full name and email inputs", async () => {
  const handleChatEvent = createHandler();

  const response = await handleChatEvent(
    config,
    storage,
    employeeSelectEvent("ivan.petrov@fuse8.online|Ivan Petrov")
  );

  const card = getUpdatedCard(response);
  const widgets = card.sections?.[0]?.widgets ?? [];

  assert.deepEqual(widgets[1], {
    textInput: {
      name: "manualFullName",
      label: "Имя и фамилия (название папки)",
      type: "SINGLE_LINE",
      value: "Ivan Petrov"
    }
  });
  assert.deepEqual(widgets[2], {
    textInput: {
      name: "employeeEmail",
      label: "Email",
      type: "SINGLE_LINE",
      value: "ivan.petrov@fuse8.online"
    }
  });
});

test("/review employee selection uses the latest selected employee value", async () => {
  const handleChatEvent = createHandler();

  const response = await handleChatEvent(
    config,
    storage,
    employeeSelectEvent([
      "andrey.stepanov@fuse8.online|Andrey Stepanov",
      "anton.permyakov@byteminds.co.uk|Anton Permyakov"
    ])
  );

  const card = getUpdatedCard(response);
  const widgets = card.sections?.[0]?.widgets ?? [];

  assert.deepEqual(widgets[1], {
    textInput: {
      name: "manualFullName",
      label: "Имя и фамилия (название папки)",
      type: "SINGLE_LINE",
      value: "Anton Permyakov"
    }
  });
  assert.deepEqual(widgets[2], {
    textInput: {
      name: "employeeEmail",
      label: "Email",
      type: "SINGLE_LINE",
      value: "anton.permyakov@byteminds.co.uk"
    }
  });
});

test("/review employee selection ignores stale persisted name and email fields", async () => {
  const handleChatEvent = createHandler();

  const response = await handleChatEvent(
    config,
    storage,
    employeeSelectEvent("andrey.stepanov@fuse8.online|Andrey Stepanov", {
      manualFullName: "Anton Permyakov",
      employeeEmail: "anton.permyakov@byteminds.co.uk"
    })
  );

  const card = getUpdatedCard(response);
  const widgets = card.sections?.[0]?.widgets ?? [];

  assert.deepEqual(widgets[1], {
    textInput: {
      name: "manualFullName",
      label: "Имя и фамилия (название папки)",
      type: "SINGLE_LINE",
      value: "Andrey Stepanov"
    }
  });
  assert.deepEqual(widgets[2], {
    textInput: {
      name: "employeeEmail",
      label: "Email",
      type: "SINGLE_LINE",
      value: "andrey.stepanov@fuse8.online"
    }
  });
});

test("/review employee selection keeps directory English name in full name input", async () => {
  const handleChatEvent = createHandler();

  const response = await handleChatEvent(
    config,
    storage,
    employeeSelectEvent("andrey.stepanov@fuse8.online|Andrey Stepanov")
  );
  const card = getUpdatedCard(response);
  const widgets = card.sections?.[0]?.widgets ?? [];

  assert.deepEqual(widgets[1], {
    textInput: {
      name: "manualFullName",
      label: "Имя и фамилия (название папки)",
      type: "SINGLE_LINE",
      value: "Andrey Stepanov"
    }
  });
});

test("/review employee check opens review form when Drive folder exists", async () => {
  const handleChatEvent = createHandler({
    async findEmployeeFolder(_config, refreshToken, fullName) {
      assert.equal(refreshToken, "refresh-token");
      assert.equal(fullName, "Ivan Petrov");
      return { id: "employee-folder-id", name: "Ivan Petrov" };
    }
  });

  const response = await handleChatEvent(
    config,
    storage,
    employeeCheckEvent({ manualFullName: "Ivan Petrov" })
  );

  const card = getUpdatedCard(response);
  const widgets = card.sections?.[0]?.widgets ?? [];

  assert.equal(card.header?.title, "Запуск Performance Review");
  assert.deepEqual(widgets[0], {
    textInput: {
      name: "fullName",
      label: "Имя и фамилия",
      value: "Ivan Petrov"
    }
  });
  assert.deepEqual(widgets[1], {
    textInput: {
      name: "employeeEmail",
      label: "Email сотрудника",
      value: "iaroslav.zaiarnyi@byteminds.co.uk"
    }
  });
});

test("/review employee check returns clear text when selected directory employee has no Drive folder", async () => {
  const handleChatEvent = createHandler({
    async findEmployeeFolder() {
      return null;
    }
  });

  const response = await handleChatEvent(
    config,
    storage,
    employeeCheckEvent({ manualFullName: "Ivan Petrov" })
  );

  assert.match(getResponseText(response), /Папка сотрудника не найдена: Ivan Petrov/);
});

test("/review employee check validates manual full name against Drive folder", async () => {
  const handleChatEvent = createHandler({
    async findEmployeeFolder(_config, refreshToken, fullName) {
      assert.equal(refreshToken, "refresh-token");
      assert.equal(fullName, "Ivan Petrov");
      return { id: "employee-folder-id", name: "Ivan Petrov" };
    }
  });

  const response = await handleChatEvent(
    config,
    storage,
    employeeCheckEvent({ manualFullName: "Ivan Petrov" })
  );

  const card = getUpdatedCard(response);

  assert.equal(card.header?.title, "Запуск Performance Review");
});

test("/review submit creates a test folder and returns its link", async () => {
  const sentMessages: Array<{ spaceName: string; text: string }> = [];
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
    async sendChatMessage(_config, spaceName, text) {
      sentMessages.push({ spaceName, text });
    }
  });

  const response = await handleChatEvent(config, storage, reviewSubmitEvent());

  await flushBackgroundTasks();

  assert.equal(sentMessages.length, 2);
  assert.equal(sentMessages[0]?.text, REVIEW_WORKFLOW_ACK_MESSAGE);

  const messageText = sentMessages[1]?.text ?? "";

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
  assert.deepEqual(response.actionResponse, {
    type: "DIALOG",
    dialogAction: {
      actionStatus: {
        statusCode: "OK",
        userFacingMessage: ""
      }
    }
  });
  assert.deepEqual(sentMessages, [
    {
      spaceName: "spaces/AAA",
      text: REVIEW_WORKFLOW_ACK_MESSAGE
    },
    {
      spaceName: "spaces/AAA",
      text: messageText
    }
  ]);
});

test("/review submit sends result to buttonClickedPayload space when chat space is missing", async () => {
  const sentMessages: Array<{ spaceName: string; text: string }> = [];
  const handleChatEvent = createHandler({
    async createReviewFolder() {
      return {
        id: "folder-id",
        name: "2026.06",
        webViewLink: "https://drive.google.com/folder"
      };
    },
    async sendChatMessage(_config, spaceName, text) {
      sentMessages.push({ spaceName, text });
    }
  });

  await handleChatEvent(
    config,
    storage,
    reviewSubmitEvent({ chatSpaceName: null, buttonClickedPayloadSpaceName: "spaces/FALLBACK" })
  );

  await flushBackgroundTasks();

  assert.equal(sentMessages.length, 2);
  assert.equal(sentMessages[0]?.text, REVIEW_WORKFLOW_ACK_MESSAGE);
  assert.equal(sentMessages[1]?.spaceName, "spaces/FALLBACK");
});

test("/review submit skips result delivery when space name is missing", async () => {
  let sendCalled = false;
  const handleChatEvent = createHandler({
    async createReviewFolder() {
      return {
        id: "folder-id",
        name: "2026.06",
        webViewLink: "https://drive.google.com/folder"
      };
    },
    async sendChatMessage() {
      sendCalled = true;
    }
  });

  const response = await handleChatEvent(
    config,
    storage,
    reviewSubmitEvent({ chatSpaceName: null })
  );

  assert.equal(sendCalled, false);
  assert.deepEqual(response.actionResponse, {
    type: "DIALOG",
    dialogAction: {
      actionStatus: {
        statusCode: "OK",
        userFacingMessage: ""
      }
    }
  });

  await flushBackgroundTasks();
  assert.equal(sendCalled, false);
});

test("/review submit returns ack before background workflow runs", async () => {
  let createFolderCalled = false;
  const sentMessages: string[] = [];
  const handleChatEvent = createHandler({
    async createReviewFolder() {
      createFolderCalled = true;
      return {
        id: "folder-id",
        name: "2026.06",
        webViewLink: "https://drive.google.com/folder"
      };
    },
    async sendChatMessage(_config, _spaceName, text) {
      sentMessages.push(text);
    }
  });

  await handleChatEvent(config, storage, reviewSubmitEvent());

  assert.equal(createFolderCalled, false);
  assert.equal(sentMessages[0], REVIEW_WORKFLOW_ACK_MESSAGE);

  await flushBackgroundTasks();
  assert.equal(createFolderCalled, true);
  assert.equal(sentMessages.length, 2);
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
  await flushBackgroundTasks();
  await handleChatEvent(config, storage, reviewSubmitEvent({ employeeEmail: "iaroslav.zaiarnyi@byteminds.co.uk" }));
  await flushBackgroundTasks();

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
  const sentMessages: string[] = [];
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
    },
    async sendChatMessage(_config, _spaceName, text) {
      sentMessages.push(text);
    }
  });

  const response = await handleChatEvent(
    config,
    storage,
    reviewSubmitEvent({ needsClientForm: false, commonEventObject: true })
  );
  await flushBackgroundTasks();

  assert.equal(sentMessages[0], REVIEW_WORKFLOW_ACK_MESSAGE);

  const messageText = sentMessages[1] ?? "";

  assert.match(messageText, /Internal feedback form: https:\/\/docs\.google\.com\/forms\/internal-form-id/);
  assert.doesNotMatch(messageText, /Client feedback form:/);
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
    async sendChatMessage(_config, _spaceName, text) {
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
  const sentMessages: string[] = [];
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
    },
    async sendChatMessage(_config, _spaceName, text) {
      sentMessages.push(text);
    }
  });

  const response = await handleChatEvent(
    config,
    pendingStorage,
    confirmWithoutPreviousEvent({ commonEventObject: true })
  );
  const action = response.action as {
    navigations?: Array<{ endNavigation?: { action?: string } }>;
    notification?: { text?: string };
  };
  assert.equal(action.navigations?.[0]?.endNavigation?.action, "CLOSE_DIALOG");
  assert.equal(action.notification?.text, undefined);
  assert.equal((response as { actionResponse?: unknown }).actionResponse, undefined);

  await flushBackgroundTasks();

  assert.equal(sentMessages[0], REVIEW_WORKFLOW_ACK_MESSAGE);

  const messageText = sentMessages[1] ?? "";

  assert.match(messageText, /Папка ревью: 2026\.06 - https:\/\/drive\.google\.com\/folder/);
  assert.doesNotMatch(messageText, /Previous review:/);
  assert.equal(sentMessages.length, 2);
});

test("/review submit sends Drive error to Chat via bot when commonEventObject is present", async () => {
  const sentMessages: string[] = [];
  const handleChatEvent = createHandler({
    async createReviewFolder() {
      throw new Error("Drive API has not been used in project");
    },
    async sendChatMessage(_config, _spaceName, text) {
      sentMessages.push(text);
    }
  });

  const response = await handleChatEvent(
    config,
    storage,
    reviewSubmitEvent({ commonEventObject: true })
  );
  await flushBackgroundTasks();

  assert.equal(sentMessages.length, 2);
  assert.equal(sentMessages[0], REVIEW_WORKFLOW_ACK_MESSAGE);
  assert.match(sentMessages[1] ?? "", /Не удалось создать папку ревью/);
  assert.match(sentMessages[1] ?? "", /Drive API has not been used in project/);
});

test("/review submit returns user-facing text when Drive folder creation fails", async () => {
  const sentMessages: string[] = [];
  const handleChatEvent = createHandler({
    async createReviewFolder() {
      throw new Error("Drive API has not been used in project");
    },
    async sendChatMessage(_config, _spaceName, text) {
      sentMessages.push(text);
    }
  });

  await handleChatEvent(config, storage, reviewSubmitEvent());

  await flushBackgroundTasks();

  assert.equal(sentMessages[0], REVIEW_WORKFLOW_ACK_MESSAGE);
  assert.match(sentMessages[1] ?? "", /Не удалось создать папку ревью/);
  assert.match(sentMessages[1] ?? "", /Drive API has not been used in project/);
});

function confirmWithoutPreviousEvent(
  overrides: { commonEventObject?: boolean; chatSpaceName?: string | null } = {}
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

  if (overrides.chatSpaceName !== null) {
    event.chat!.space = {
      name: overrides.chatSpaceName ?? "spaces/AAA"
    };
  }

  return event;
}

function reviewCommandEvent(spaceName = "spaces/AAA"): ChatEvent {
  return {
    user: {
      name: "users/123"
    },
    commonEventObject: {},
    chat: {
      appCommandPayload: {
        appCommandMetadata: {
          appCommandId: 1
        },
        space: {
          name: spaceName
        }
      }
    }
  };
}

function employeeSuggestionsEvent(
  query: string,
  overrides: { spaceName?: string } = {}
): ChatEvent {
  return {
    user: {
      name: "users/123"
    },
    chat: {
      widgetUpdatedPayload: overrides.spaceName
        ? { space: { name: overrides.spaceName } }
        : {}
    },
    commonEventObject: {
      parameters: {
        autocomplete_widget_query: query
      }
    }
  };
}

function employeeSelectEvent(
  selectedEmployee: string | string[],
  staleInputs: { manualFullName?: string; employeeEmail?: string } = {}
): ChatEvent {
  return {
    user: {
      name: "users/123"
    },
    chat: {
      buttonClickedPayload: {
        isDialogEvent: true
      }
    },
    commonEventObject: {
      parameters: {
        actionName: "selectEmployee"
      },
      formInputs: {
        employeeFolder: {
          stringInputs: {
            value: Array.isArray(selectedEmployee) ? selectedEmployee : [selectedEmployee]
          }
        },
        ...(staleInputs.manualFullName
          ? {
            manualFullName: {
              stringInputs: {
                value: [staleInputs.manualFullName]
              }
            }
          }
          : {}),
        ...(staleInputs.employeeEmail
          ? {
            employeeEmail: {
              stringInputs: {
                value: [staleInputs.employeeEmail]
              }
            }
          }
          : {})
      }
    }
  };
}

function employeeCheckEvent(
  overrides: {
    selectedEmployee?: string;
    manualFullName?: string;
    employeeEmail?: string;
  } = {}
): ChatEvent {
  return {
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
        actionName: "checkEmployeeFolder"
      },
      formInputs: {
        employeeFolder: {
          stringInputs: {
            value: overrides.selectedEmployee ? [overrides.selectedEmployee] : []
          }
        },
        manualFullName: {
          stringInputs: {
            value: overrides.manualFullName ? [overrides.manualFullName] : []
          }
        },
        employeeEmail: {
          stringInputs: {
            value: [overrides.employeeEmail ?? "iaroslav.zaiarnyi@byteminds.co.uk"]
          }
        }
      }
    }
  };
}

function reviewSubmitEvent(
  overrides: {
    employeeEmail?: string;
    meetingTime?: string;
    needsClientForm?: boolean;
    commonEventObject?: boolean;
    chatSpaceName?: string | null;
    buttonClickedPayloadSpaceName?: string;
  } = {}
): ChatEvent {
  const event: ChatEvent = {
    user: {
      name: "users/123"
    },
    chat: {
      buttonClickedPayload: {
        isDialogEvent: true,
        dialogEventType: "SUBMIT_DIALOG",
        ...(overrides.buttonClickedPayloadSpaceName
          ? {
            space: {
              name: overrides.buttonClickedPayloadSpaceName
            }
          }
          : {})
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

  if (overrides.chatSpaceName !== null) {
    event.chat!.space = {
      name: overrides.chatSpaceName ?? "spaces/AAA"
    };
  }

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

function getUpdatedCard(response: Record<string, unknown>): {
  header?: { title?: string };
  sections?: Array<{ widgets?: unknown[] }>;
} {
  const action = response.action as {
    navigations?: Array<{ updateCard?: { header?: { title?: string }; sections?: Array<{ widgets?: unknown[] }> } }>;
  };
  return action?.navigations?.[0]?.updateCard ?? {};
}

function getFirstCard(response: Record<string, unknown>): {
  header?: { title?: string };
  sections?: Array<{ widgets?: unknown[] }>;
} {
  const action = response.action as {
    navigations?: Array<{ pushCard?: { header?: { title?: string }; sections?: Array<{ widgets?: unknown[] }> } }>;
  };
  if (action?.navigations?.[0]?.pushCard) {
    return action.navigations[0].pushCard;
  }

  const actionResponse = response.actionResponse as {
    dialogAction?: {
      dialog?: {
        body?: { header?: { title?: string }; sections?: Array<{ widgets?: unknown[] }> };
      };
    };
  };
  return actionResponse?.dialogAction?.dialog?.body ?? {};
}

function getResponseText(response: Record<string, unknown>): string {
  if (typeof response.text === "string") {
    return response.text;
  }

  const action = response.action as {
    notification?: { text?: string };
  };
  if (action?.notification?.text) {
    return action.notification.text;
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

  const hostAppDataAction = response.hostAppDataAction as {
    chatDataAction?: {
      dialogAction?: {
        actionStatus?: {
          userFacingMessage?: string;
        };
      };
      createMessageAction?: {
        message?: {
          text?: string;
        };
      };
    };
  };

  if (hostAppDataAction?.chatDataAction?.dialogAction?.actionStatus?.userFacingMessage) {
    return hostAppDataAction.chatDataAction.dialogAction.actionStatus.userFacingMessage;
  }

  return hostAppDataAction?.chatDataAction?.createMessageAction?.message?.text ?? "";
}
