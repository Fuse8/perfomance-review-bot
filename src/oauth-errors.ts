export function isOAuthAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  return (
    normalized.includes("invalid_grant") ||
    normalized.includes("insufficient permission") ||
    normalized.includes("insufficient authentication scopes") ||
    normalized.includes("request had insufficient authentication scopes")
  );
}

export function formatAuthRequiredMessage(authUrl: string): string {
  return [
    "Нужно подключить Google-аккаунт ревьюера.",
    "Откройте ссылку, пройдите OAuth и повторите /review:",
    authUrl
  ].join("\n");
}
