import assert from "node:assert/strict";
import test from "node:test";
import { formatAuthRequiredMessage, isOAuthAuthError } from "./oauth-errors.js";

test("isOAuthAuthError detects invalid_grant", () => {
  assert.equal(isOAuthAuthError(new Error('{"error":"invalid_grant"}')), true);
});

test("isOAuthAuthError detects insufficient permission", () => {
  assert.equal(
    isOAuthAuthError(new Error("Insufficient Permission: Request had insufficient authentication scopes")),
    true
  );
});

test("isOAuthAuthError ignores unrelated errors", () => {
  assert.equal(isOAuthAuthError(new Error("File not found")), false);
});

test("formatAuthRequiredMessage includes auth url", () => {
  const message = formatAuthRequiredMessage("https://example.test/oauth");
  assert.match(message, /https:\/\/example\.test\/oauth/);
  assert.match(message, /повторите \/review/);
});
