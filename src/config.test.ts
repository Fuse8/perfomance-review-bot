import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "./config.js";

test("loadConfig allows missing EMPLOYEE_EMAIL_DOMAIN so the server can start", () => {
  const previousEnv = { ...process.env };

  try {
    process.env.APP_BASE_URL = "https://example.test";
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_REDIRECT_URI = "https://example.test/auth/google/callback";
    process.env.REVIEWS_ROOT_FOLDER_ID = "root-folder-id";
    delete process.env.REVIEW_REPORT_TEMPLATE_ID;
    delete process.env.EMPLOYEE_EMAIL_DOMAINS;

    const config = loadConfig();

    assert.deepEqual(config.employeeEmailDomains, []);
  } finally {
    process.env = previousEnv;
  }
});

test("loadConfig parses comma-separated employee email domains", () => {
  const previousEnv = { ...process.env };

  try {
    process.env.APP_BASE_URL = "https://example.test";
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_REDIRECT_URI = "https://example.test/auth/google/callback";
    process.env.REVIEWS_ROOT_FOLDER_ID = "root-folder-id";
    process.env.REVIEW_REPORT_TEMPLATE_ID = "report-template-id";
    process.env.EMPLOYEE_EMAIL_DOMAINS = "fuse8.online, byteminds.co.uk";

    const config = loadConfig();

    assert.deepEqual(config.employeeEmailDomains, ["fuse8.online", "byteminds.co.uk"]);
  } finally {
    process.env = previousEnv;
  }
});

test("loadConfig uses default reviewer task reminder settings", () => {
  const previousEnv = { ...process.env };

  try {
    process.env.APP_BASE_URL = "https://example.test";
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_REDIRECT_URI = "https://example.test/auth/google/callback";
    process.env.REVIEWS_ROOT_FOLDER_ID = "root-folder-id";
    delete process.env.TASK_COLLECT_DAYS_BEFORE;
    delete process.env.TASK_CHECK_DAYS_BEFORE;
    delete process.env.TASK_PREPARE_DAYS_BEFORE;
    delete process.env.TASK_REMINDER_TIME;

    const config = loadConfig();

    assert.equal(config.taskCollectDaysBefore, 14);
    assert.equal(config.taskCheckDaysBefore, 7);
    assert.equal(config.taskPrepareDaysBefore, 3);
    assert.equal(config.taskReminderTime, "12:00");
  } finally {
    process.env = previousEnv;
  }
});

test("loadConfig allows missing Google Chat service account key file", () => {
  const previousEnv = { ...process.env };

  try {
    process.env.APP_BASE_URL = "https://example.test";
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_REDIRECT_URI = "https://example.test/auth/google/callback";
    process.env.REVIEWS_ROOT_FOLDER_ID = "root-folder-id";
    delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;

    const config = loadConfig();

    assert.equal(config.chatServiceAccountKeyFile, undefined);
  } finally {
    process.env = previousEnv;
  }
});

test("loadConfig reads Google Chat service account key file", () => {
  const previousEnv = { ...process.env };

  try {
    process.env.APP_BASE_URL = "https://example.test";
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_REDIRECT_URI = "https://example.test/auth/google/callback";
    process.env.REVIEWS_ROOT_FOLDER_ID = "root-folder-id";
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE = ".data/service-account.json";

    const config = loadConfig();

    assert.equal(config.chatServiceAccountKeyFile, ".data/service-account.json");
  } finally {
    process.env = previousEnv;
  }
});
