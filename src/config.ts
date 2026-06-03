export type AppConfig = {
  appBaseUrl: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  reviewsRootFolderId: string;
  chatServiceAccountKeyFile?: string;
  chatServiceAccountCredentials?: string;
  reviewReportTemplateId: string;
  internalReviewFormTemplateId: string;
  clientReviewFormTemplateId: string;
  employeeEmailDomains: string[];
  taskCollectDaysBefore: number;
  taskCheckDaysBefore: number;
  taskPrepareDaysBefore: number;
  taskReminderTime: string;
  storageDriver: "local" | "prisma";
  localStoragePath: string;
  databaseUrl?: string;
  port: number;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function resolveStorageDriver(): AppConfig["storageDriver"] {
  const explicit = process.env.STORAGE_DRIVER?.trim().toLowerCase();
  if (explicit === "local") {
    return "local";
  }
  if (explicit === "prisma") {
    return "prisma";
  }

  return process.env.DATABASE_URL ? "prisma" : "local";
}

export function loadConfig(): AppConfig {
  const storageDriver = resolveStorageDriver();

  return {
    appBaseUrl: requiredEnv("APP_BASE_URL").replace(/\/$/, ""),
    googleClientId: requiredEnv("GOOGLE_CLIENT_ID"),
    googleClientSecret: requiredEnv("GOOGLE_CLIENT_SECRET"),
    googleRedirectUri: requiredEnv("GOOGLE_REDIRECT_URI"),
    reviewsRootFolderId: requiredEnv("REVIEWS_ROOT_FOLDER_ID"),
    chatServiceAccountKeyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || undefined,
    chatServiceAccountCredentials:
      process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS || undefined,
    reviewReportTemplateId: process.env.REVIEW_REPORT_TEMPLATE_ID ?? "",
    internalReviewFormTemplateId: process.env.INTERNAL_REVIEW_FORM_TEMPLATE_ID ?? "",
    clientReviewFormTemplateId: process.env.CLIENT_REVIEW_FORM_TEMPLATE_ID ?? "",
    employeeEmailDomains: normalizeOptionalDomains(
      process.env.EMPLOYEE_EMAIL_DOMAINS
    ),
    taskCollectDaysBefore: Number(process.env.TASK_COLLECT_DAYS_BEFORE ?? 14),
    taskCheckDaysBefore: Number(process.env.TASK_CHECK_DAYS_BEFORE ?? 7),
    taskPrepareDaysBefore: Number(process.env.TASK_PREPARE_DAYS_BEFORE ?? 3),
    taskReminderTime: process.env.TASK_REMINDER_TIME ?? "12:00",
    storageDriver,
    localStoragePath: process.env.LOCAL_STORAGE_PATH ?? ".data/storage.json",
    databaseUrl: process.env.DATABASE_URL || undefined,
    port: Number(process.env.PORT ?? 8080)
  };
}

function normalizeOptionalDomains(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((domain) => domain.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean);
}
