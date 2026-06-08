import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "vitest";
import type { AppConfig } from "./config.js";
import { buildAuthCheckReport } from "./chat-auth-check.js";
import type { TokenStorage } from "./storage.js";

const baseConfig: AppConfig = {
  appBaseUrl: "https://example.test",
  googleClientId: "client-id",
  googleClientSecret: "client-secret",
  googleRedirectUri: "https://example.test/auth/google/callback",
  reviewsRootFolderId: "root-folder-id",
  chatServiceAccountKeyFile: undefined,
  reviewReportTemplateId: "report-template-id",
  internalReviewFormTemplateId: "internal-form-template-id",
  clientReviewFormTemplateId: "client-form-template-id",
  employeeEmailDomains: ["fuse8.online"],
  taskCollectDaysBefore: 14,
  taskCheckDaysBefore: 7,
  taskPrepareDaysBefore: 3,
  taskReminderTime: "12:00",
  databaseUrl: "postgresql://user:pass@localhost:5432/db",
  port: 8080
};

const storageWithToken: TokenStorage = {
  async get() {
    return {
      chatUserId: "users/123",
      googleUserEmail: "reviewer@example.test",
      refreshToken: "refresh-token-value",
      createdAt: "2026-05-27T00:00:00.000Z"
    };
  },
  async save() {},
  async delete() {},
  async saveOAuthState() {},
  async consumeOAuthState() {
    return null;
  }
};

test("buildAuthCheckReport reports missing service account key file", async () => {
  const report = await buildAuthCheckReport(baseConfig, storageWithToken, "users/123");

  assert.match(report, /GOOGLE_SERVICE_ACCOUNT_KEY_FILE is not set/);
  assert.match(report, /Application Default Credentials/);
  assert.match(report, /Google account: reviewer@example\.test/);
});

test("buildAuthCheckReport reports missing key file on disk", async () => {
  const report = await buildAuthCheckReport(
    { ...baseConfig, chatServiceAccountKeyFile: ".data/missing-service-account.json" },
    storageWithToken,
    "users/123"
  );

  assert.match(report, /Key file: MISSING on disk/);
  assert.match(report, /missing-service-account\.json/);
});

test("buildAuthCheckReport reads service account metadata from json", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "prb-auth-check-"));
  const keyPath = path.join(tempDir, "service-account.json");
  await writeFile(
    keyPath,
    JSON.stringify({
      type: "service_account",
      project_id: "test-project",
      client_email: "bot@test-project.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n"
    }),
    "utf8"
  );

  const report = await buildAuthCheckReport(
    { ...baseConfig, chatServiceAccountKeyFile: keyPath },
    storageWithToken,
    "users/123"
  );

  assert.match(report, /Key file: found/);
  assert.match(report, /bot@test-project\.iam\.gserviceaccount\.com/);
  assert.match(report, /Project ID: test-project/);
});

test("buildAuthCheckReport reports missing reviewer token", async () => {
  const emptyStorage: TokenStorage = {
    async get() {
      return null;
    },
    async save() {},
    async delete() {},
    async saveOAuthState() {},
    async consumeOAuthState() {
      return null;
    }
  };

  const report = await buildAuthCheckReport(baseConfig, emptyStorage, "users/456");

  assert.match(report, /Reviewer token: not saved/);
});
