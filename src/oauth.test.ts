import assert from "node:assert/strict";
import test from "node:test";
import { OAUTH_SCOPES } from "./oauth.js";

test("OAuth scopes include Google Calendar events access", () => {
  assert.ok(OAUTH_SCOPES.includes("https://www.googleapis.com/auth/calendar.events"));
});

test("OAuth scopes include Google Workspace directory read access", () => {
  assert.ok(OAUTH_SCOPES.includes("https://www.googleapis.com/auth/directory.readonly"));
});
