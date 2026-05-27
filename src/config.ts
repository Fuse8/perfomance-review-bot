export type AppConfig = {
  appBaseUrl: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  reviewsRootFolderId: string;
  port: number;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function loadConfig(): AppConfig {
  return {
    appBaseUrl: requiredEnv("APP_BASE_URL").replace(/\/$/, ""),
    googleClientId: requiredEnv("GOOGLE_CLIENT_ID"),
    googleClientSecret: requiredEnv("GOOGLE_CLIENT_SECRET"),
    googleRedirectUri: requiredEnv("GOOGLE_REDIRECT_URI"),
    reviewsRootFolderId: requiredEnv("REVIEWS_ROOT_FOLDER_ID"),
    port: Number(process.env.PORT ?? 8080)
  };
}
