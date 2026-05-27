export type AppConfig = {
  appBaseUrl: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  reviewsRootFolderId: string;
  reviewReportTemplateId: string;
  employeeEmailDomains: string[];
  storageDriver: "firestore" | "local";
  localStoragePath: string;
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
  const storageDriver = process.env.STORAGE_DRIVER === "local" ? "local" : "firestore";

  return {
    appBaseUrl: requiredEnv("APP_BASE_URL").replace(/\/$/, ""),
    googleClientId: requiredEnv("GOOGLE_CLIENT_ID"),
    googleClientSecret: requiredEnv("GOOGLE_CLIENT_SECRET"),
    googleRedirectUri: requiredEnv("GOOGLE_REDIRECT_URI"),
    reviewsRootFolderId: requiredEnv("REVIEWS_ROOT_FOLDER_ID"),
    reviewReportTemplateId: process.env.REVIEW_REPORT_TEMPLATE_ID ?? "",
    employeeEmailDomains: normalizeOptionalDomains(
      process.env.EMPLOYEE_EMAIL_DOMAINS
    ),
    storageDriver,
    localStoragePath: process.env.LOCAL_STORAGE_PATH ?? ".data/storage.json",
    port: Number(process.env.PORT ?? 8080)
  };
}

function normalizeOptionalDomains(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((domain) => domain.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean);
}
