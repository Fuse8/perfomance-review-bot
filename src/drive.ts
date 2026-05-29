import type { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import type { AppConfig } from "./config.js";
import { createOAuthClient } from "./oauth.js";

export type CreatedFolder = {
  id: string;
  name: string;
  webViewLink: string;
  report?: CreatedDriveFile;
  internalForm?: CreatedDriveFile;
  clientForm?: CreatedDriveFile;
};

export type CreatedDriveFile = {
  id: string;
  name: string;
  webViewLink: string;
};

export type EmployeeFolder = {
  id: string;
  name: string;
};

export type ReviewFolderRequest = {
  fullName: string;
  employeeEmail: string;
  reviewerEmail: string;
  reviewDate: string;
  meetingTime: string;
  reviewMonth: string;
  needsClientForm: boolean;
  previousReviewUrl?: string;
  /** Google Workspace domains that may respond to the internal feedback form. */
  internalFormResponderDomains?: string[];
};

type DriveListResource = {
  list(params: {
    q: string;
    fields: string;
    pageSize: number;
    supportsAllDrives: boolean;
    includeItemsFromAllDrives: boolean;
  }): Promise<{
    data: {
      files?: Array<{
        id?: string | null;
        name?: string | null;
        webViewLink?: string | null;
      }>;
    };
  }>;
};

type DriveFilesResource = DriveListResource & {
  get(params: {
    fileId: string;
    fields: string;
    supportsAllDrives: boolean;
  }): Promise<{
    data: {
      mimeType?: string | null;
    };
  }>;
  create(params: {
    requestBody: {
      name: string;
      mimeType: string;
      parents: string[];
    };
    fields: string;
    supportsAllDrives: boolean;
  }): Promise<{
    data: {
      id?: string | null;
      name?: string | null;
      webViewLink?: string | null;
    };
  }>;
  copy(params: {
    fileId: string;
    requestBody: {
      name: string;
      parents: string[];
    };
    fields: string;
    supportsAllDrives: boolean;
  }): Promise<{
    data: {
      id?: string | null;
      name?: string | null;
      webViewLink?: string | null;
    };
  }>;
};

type DrivePermissionRequestBody =
  | {
      type: "user";
      role: "writer";
      emailAddress: string;
    }
  | {
      type: "domain";
      role: "reader";
      domain: string;
      view: "published";
    };

type DrivePermissionsResource = {
  create(params: {
    fileId: string;
    requestBody: DrivePermissionRequestBody;
    fields: string;
    supportsAllDrives: boolean;
    sendNotificationEmail: boolean;
  }): Promise<unknown>;
};

type FormsPublishResource = {
  setPublishSettings(params: {
    formId: string;
    requestBody: {
      publishSettings: {
        publishState: {
          isPublished: boolean;
          isAcceptingResponses: boolean;
        };
      };
    };
  }): Promise<unknown>;
};

type DriveResource = {
  files: DriveFilesResource;
  permissions?: DrivePermissionsResource;
  forms?: FormsPublishResource;
  documents?: {
    batchUpdate(params: {
      documentId: string;
      requestBody: {
        requests: Array<{
          replaceAllText: {
            containsText: {
              text: string;
              matchCase: boolean;
            };
            replaceText: string;
          };
        }>;
      };
    }): Promise<unknown>;
  };
};

export async function findPreviousReviewReport(
  config: AppConfig,
  refreshToken: string,
  fullName: string,
  reviewMonth: string
): Promise<CreatedDriveFile | null> {
  const auth = createOAuthClient(config);
  auth.setCredentials({ refresh_token: refreshToken });

  const drive = google.drive({ version: "v3", auth });

  return findPreviousReviewReportInDrive(drive, config.reviewsRootFolderId, fullName, reviewMonth);
}

export async function listEmployeeFolders(
  config: AppConfig,
  refreshToken: string,
  query: string
): Promise<EmployeeFolder[]> {
  const auth = createOAuthClient(config);
  auth.setCredentials({ refresh_token: refreshToken });

  const drive = google.drive({ version: "v3", auth });

  return listEmployeeFoldersInDrive(drive.files, config.reviewsRootFolderId, query);
}

export async function findEmployeeFolder(
  config: AppConfig,
  refreshToken: string,
  fullName: string
): Promise<EmployeeFolder | null> {
  const auth = createOAuthClient(config);
  auth.setCredentials({ refresh_token: refreshToken });

  const drive = google.drive({ version: "v3", auth });

  return findEmployeeFolderInDrive(drive.files, config.reviewsRootFolderId, fullName);
}

export async function findPreviousReviewReportInDrive(
  drive: DriveResource,
  rootFolderId: string,
  fullName: string,
  reviewMonth: string
): Promise<CreatedDriveFile | null> {
  const employeeFolder = await findEmployeeFolderInDrive(drive.files, rootFolderId, fullName);
  if (!employeeFolder?.id) {
    throw new Error(`Папка сотрудника не найдена: ${fullName}`);
  }

  const escapedEmployeeFolderId = escapeDriveQueryValue(employeeFolder.id);
  const { data } = await drive.files.list({
    q: `'${escapedEmployeeFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id,name)",
    pageSize: 100,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });

  const monthFolders = (data.files ?? [])
    .filter((file) => file.id && file.name && isReviewMonthFolderName(file.name))
    .filter((file) => file.name! < reviewMonth)
    .sort((left, right) => right.name!.localeCompare(left.name!));

  const reportNamePrefix = buildReportNamePrefix(fullName);

  for (const monthFolder of monthFolders) {
    const escapedMonthFolderId = escapeDriveQueryValue(monthFolder.id!);
    const { data: reportList } = await drive.files.list({
      q: `'${escapedMonthFolderId}' in parents and mimeType = 'application/vnd.google-apps.document' and trashed = false`,
      fields: "files(id,name,webViewLink)",
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });

    const report = (reportList.files ?? []).find(
      (file) =>
        file.id &&
        file.name &&
        file.webViewLink &&
        file.name.startsWith(reportNamePrefix)
    );

    if (report?.id && report.name && report.webViewLink) {
      return {
        id: report.id,
        name: report.name,
        webViewLink: report.webViewLink
      };
    }
  }

  return null;
}

export function buildReportNamePrefix(fullName: string): string {
  return `${fullName} // Отчёт Performance Review // `;
}

export function isReviewMonthFolderName(name: string): boolean {
  return /^\d{4}\.\d{2}$/.test(name);
}

export async function createReviewFolder(
  config: AppConfig,
  refreshToken: string,
  request: ReviewFolderRequest
): Promise<CreatedFolder> {
  const auth = createOAuthClient(config);
  auth.setCredentials({ refresh_token: refreshToken });

  const drive = google.drive({ version: "v3", auth });
  const docs = google.docs({ version: "v1", auth });

  return createReviewFolderInDrive(
    { ...drive, documents: docs.documents, forms: createFormsPublishClient(auth) },
    {
      rootFolderId: config.reviewsRootFolderId,
      reviewReportTemplateId: config.reviewReportTemplateId,
      internalReviewFormTemplateId: config.internalReviewFormTemplateId,
      clientReviewFormTemplateId: config.clientReviewFormTemplateId,
      ...request,
      internalFormResponderDomains: config.employeeEmailDomains
    }
  );
}

export async function createReviewFolderInDrive(
  drive: DriveResource,
  request: ReviewFolderRequest & {
    rootFolderId: string;
    reviewReportTemplateId: string;
    internalReviewFormTemplateId: string;
    clientReviewFormTemplateId: string;
  }
): Promise<CreatedFolder> {
  const { files } = drive;

  await withDriveStep("Проверка доступа к корневой папке ревью", async () => {
    const root = await files.get({
      fileId: request.rootFolderId,
      fields: "id,name,mimeType",
      supportsAllDrives: true
    });

    if (root.data.mimeType !== "application/vnd.google-apps.folder") {
      throw new Error("REVIEWS_ROOT_FOLDER_ID is not a Google Drive folder");
    }
  });

  const employeeFolder = await withDriveStep(
    `Поиск папки сотрудника "${request.fullName}"`,
    async () => {
      const folder = await findEmployeeFolderInDrive(files, request.rootFolderId, request.fullName);
      if (!folder?.id) {
        throw new Error(`Папка сотрудника не найдена: ${request.fullName}`);
      }
      return folder;
    }
  );

  const { data } = await withDriveStep(
    `Создание папки месяца ${request.reviewMonth} в "${request.fullName}"`,
    async () =>
      files.create({
        requestBody: {
          name: request.reviewMonth,
          mimeType: "application/vnd.google-apps.folder",
          parents: [employeeFolder.id]
        },
        fields: "id,name,webViewLink",
        supportsAllDrives: true
      })
  );

  if (!data.id || !data.name || !data.webViewLink) {
    throw new Error("Google Drive did not return created folder metadata");
  }

  const folder = {
    id: data.id,
    name: data.name,
    webViewLink: data.webViewLink
  };

  await assertDriveFileAccessible(
    files,
    request.reviewReportTemplateId,
    "Проверка доступа к шаблону PR report (REVIEW_REPORT_TEMPLATE_ID)"
  );
  const report = await withDriveStep("Копирование PR report из шаблона", async () =>
    copyReportFromTemplate(
      drive,
      request,
      folder,
      request.previousReviewUrl ?? ""
    )
  );

  await assertDriveFileAccessible(
    files,
    request.internalReviewFormTemplateId,
    "Проверка доступа к шаблону internal form (INTERNAL_REVIEW_FORM_TEMPLATE_ID)"
  );
  const internalForm = await withDriveStep("Копирование internal feedback form из шаблона", async () =>
    copyFormFromTemplate(
      drive,
      request.internalReviewFormTemplateId,
      `${request.fullName} // Internal Feedback Form // ${request.reviewDate.slice(0, 7)}`,
      folder,
      { responderDomains: request.internalFormResponderDomains }
    )
  );

  const clientForm = request.needsClientForm
    ? await (async () => {
      await assertDriveFileAccessible(
        files,
        request.clientReviewFormTemplateId,
        "Проверка доступа к шаблону client form (CLIENT_REVIEW_FORM_TEMPLATE_ID)"
      );
      return withDriveStep("Копирование client feedback form из шаблона", async () =>
        copyFormFromTemplate(
          drive,
          request.clientReviewFormTemplateId,
          `${request.fullName} // Client Feedback Form // ${request.reviewDate.slice(0, 7)}`,
          folder
        )
      );
    })()
    : undefined;

  return {
    ...folder,
    report,
    internalForm,
    clientForm
  };
}

export function normalizePersonName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function listEmployeeFoldersInDrive(
  files: DriveListResource,
  rootFolderId: string,
  query: string
): Promise<EmployeeFolder[]> {
  const normalizedQuery = normalizePersonName(query);
  const folders = await listRootEmployeeFolders(files, rootFolderId);

  return folders.filter((folder) =>
    normalizedQuery ? normalizePersonName(folder.name).includes(normalizedQuery) : true
  );
}

export async function findEmployeeFolderInDrive(
  files: DriveListResource,
  rootFolderId: string,
  fullName: string
): Promise<EmployeeFolder | null> {
  const normalizedFullName = normalizePersonName(fullName);
  const folders = await listRootEmployeeFolders(files, rootFolderId);

  return folders.find(
    (folder) => normalizePersonName(folder.name) === normalizedFullName
  ) ?? null;
}

async function listRootEmployeeFolders(
  files: DriveListResource,
  rootFolderId: string
): Promise<EmployeeFolder[]> {
  const escapedRootFolderId = escapeDriveQueryValue(rootFolderId);
  const { data } = await files.list({
    q: `'${escapedRootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id,name)",
    pageSize: 100,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });

  return (data.files ?? [])
    .filter((file): file is { id: string; name: string } => Boolean(file.id && file.name))
    .map((file) => ({
      id: file.id,
      name: file.name
    }));
}

function escapeDriveQueryValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function withDriveStep<T>(step: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    throw new Error(formatDriveStepError(step, error));
  }
}

export function formatDriveStepError(step: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${step}: ${message}`;
}

async function assertDriveFileAccessible(
  files: DriveFilesResource,
  fileId: string,
  step: string
): Promise<void> {
  await withDriveStep(step, async () => {
    await files.get({
      fileId,
      fields: "id,name,mimeType",
      supportsAllDrives: true
    });
  });
}

async function copyReportFromTemplate(
  drive: DriveResource,
  request: ReviewFolderRequest & { reviewReportTemplateId: string },
  folder: CreatedDriveFile,
  previousReviewUrl: string
): Promise<CreatedDriveFile> {
  const reportName = `${buildReportNamePrefix(request.fullName)}${request.reviewDate.slice(0, 7)}`;
  const { data } = await drive.files.copy({
    fileId: request.reviewReportTemplateId,
    requestBody: {
      name: reportName,
      parents: [folder.id]
    },
    fields: "id,name,webViewLink",
    supportsAllDrives: true
  });

  if (!data.id || !data.name || !data.webViewLink) {
    throw new Error("Google Drive did not return copied report metadata");
  }

  await drive.documents?.batchUpdate({
    documentId: data.id,
    requestBody: {
      requests: [
        replaceText("{{FULL_NAME}}", request.fullName),
        replaceText("{{REVIEW_DATE}}", request.reviewDate),
        replaceText("{{REVIEWER_EMAIL}}", request.reviewerEmail),
        replaceText("{{REVIEW_FOLDER_URL}}", folder.webViewLink),
        replaceText("{{PREVIOUS_REVIEW_URL}}", previousReviewUrl)
      ]
    }
  });

  if (normalizeEmail(request.employeeEmail) !== normalizeEmail(request.reviewerEmail)) {
    await grantEmployeeWriterAccess(drive, data.id, request.employeeEmail);
  }

  return {
    id: data.id,
    name: data.name,
    webViewLink: data.webViewLink
  };
}

type CopyFormFromTemplateOptions = {
  responderDomains?: string[];
};

async function copyFormFromTemplate(
  drive: DriveResource,
  templateId: string,
  formName: string,
  folder: CreatedDriveFile,
  options?: CopyFormFromTemplateOptions
): Promise<CreatedDriveFile> {
  const { data } = await drive.files.copy({
    fileId: templateId,
    requestBody: {
      name: formName,
      parents: [folder.id]
    },
    fields: "id,name,webViewLink",
    supportsAllDrives: true
  });

  if (!data.id || !data.name || !data.webViewLink) {
    throw new Error("Google Drive did not return copied form metadata");
  }

  const copiedForm = {
    id: data.id,
    name: data.name,
    webViewLink: data.webViewLink
  };

  if (drive.forms) {
    await publishCopiedGoogleForm(drive.forms, copiedForm.id);
  }

  if (options?.responderDomains?.length) {
    await grantCompanyFormResponderAccess(drive, copiedForm.id, options.responderDomains);
  }

  return copiedForm;
}

export function createFormsPublishClient(auth: OAuth2Client): FormsPublishResource {
  return {
    async setPublishSettings(params) {
      await auth.request({
        url: `https://forms.googleapis.com/v1/forms/${encodeURIComponent(params.formId)}:setPublishSettings`,
        method: "POST",
        data: params.requestBody
      });
    }
  };
}

export async function grantCompanyFormResponderAccess(
  drive: DriveResource,
  formId: string,
  domains: string[]
): Promise<void> {
  const uniqueDomains = [
    ...new Set(domains.map((domain) => domain.trim().replace(/^@/, "").toLowerCase()).filter(Boolean))
  ];

  for (const domain of uniqueDomains) {
    await withDriveStep(`Доступ респондентов internal form для домена ${domain}`, async () => {
      await drive.permissions?.create({
        fileId: formId,
        requestBody: {
          type: "domain",
          role: "reader",
          domain,
          view: "published"
        },
        fields: "id",
        supportsAllDrives: true,
        sendNotificationEmail: false
      });
    });
  }
}

export async function publishCopiedGoogleForm(
  forms: FormsPublishResource,
  formId: string
): Promise<void> {
  await withDriveStep(`Публикация Google Form ${formId}`, async () => {
    await forms.setPublishSettings({
      formId,
      requestBody: {
        publishSettings: {
          publishState: {
            isPublished: true,
            isAcceptingResponses: true
          }
        }
      }
    });
  });
}

async function grantEmployeeWriterAccess(
  drive: DriveResource,
  fileId: string,
  employeeEmail: string
): Promise<void> {
  await withDriveStep(
    `Выдача доступа на PR report сотруднику ${employeeEmail}`,
    async () => {
      await drive.permissions?.create({
        fileId,
        requestBody: {
          type: "user",
          role: "writer",
          emailAddress: employeeEmail
        },
        fields: "id",
        supportsAllDrives: true,
        sendNotificationEmail: false
      });
    }
  );
}

function replaceText(text: string, replaceTextValue: string) {
  return {
    replaceAllText: {
      containsText: {
        text,
        matchCase: true
      },
      replaceText: replaceTextValue
    }
  };
}
