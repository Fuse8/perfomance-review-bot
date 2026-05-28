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

export type ReviewFolderRequest = {
  fullName: string;
  employeeEmail: string;
  reviewerEmail: string;
  reviewDate: string;
  reviewMonth: string;
  needsClientForm: boolean;
  previousReviewUrl?: string;
};

type DriveFilesResource = {
  get(params: {
    fileId: string;
    fields: string;
    supportsAllDrives: boolean;
  }): Promise<{
    data: {
      mimeType?: string | null;
    };
  }>;
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

type DrivePermissionsResource = {
  create(params: {
    fileId: string;
    requestBody: {
      type: "user";
      role: "writer";
      emailAddress: string;
    };
    fields: string;
    supportsAllDrives: boolean;
    sendNotificationEmail: boolean;
  }): Promise<unknown>;
};

type DriveResource = {
  files: DriveFilesResource;
  permissions?: DrivePermissionsResource;
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

export async function findPreviousReviewReportInDrive(
  drive: DriveResource,
  rootFolderId: string,
  fullName: string,
  reviewMonth: string
): Promise<CreatedDriveFile | null> {
  const employeeFolder = await findEmployeeFolder(drive.files, rootFolderId, fullName);
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

  return createReviewFolderInDrive({ ...drive, documents: docs.documents }, {
    rootFolderId: config.reviewsRootFolderId,
    reviewReportTemplateId: config.reviewReportTemplateId,
    internalReviewFormTemplateId: config.internalReviewFormTemplateId,
    clientReviewFormTemplateId: config.clientReviewFormTemplateId,
    ...request
  });
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
  const root = await files.get({
    fileId: request.rootFolderId,
    fields: "id,name,mimeType",
    supportsAllDrives: true
  });

  if (root.data.mimeType !== "application/vnd.google-apps.folder") {
    throw new Error("REVIEWS_ROOT_FOLDER_ID is not a Google Drive folder");
  }

  const employeeFolder = await findEmployeeFolder(files, request.rootFolderId, request.fullName);
  if (!employeeFolder?.id) {
    throw new Error(`Папка сотрудника не найдена: ${request.fullName}`);
  }

  const { data } = await files.create({
    requestBody: {
      name: request.reviewMonth,
      mimeType: "application/vnd.google-apps.folder",
      parents: [employeeFolder.id]
    },
    fields: "id,name,webViewLink",
    supportsAllDrives: true
  });

  if (!data.id || !data.name || !data.webViewLink) {
    throw new Error("Google Drive did not return created folder metadata");
  }

  if (normalizeEmail(request.employeeEmail) !== normalizeEmail(request.reviewerEmail)) {
    await grantEmployeeWriterAccess(drive, data.id, request.employeeEmail);
  }

  const folder = {
    id: data.id,
    name: data.name,
    webViewLink: data.webViewLink
  };

  const report = await copyReportFromTemplate(
    drive,
    request,
    folder,
    request.previousReviewUrl ?? ""
  );
  const internalForm = await copyFormFromTemplate(
    drive,
    request.internalReviewFormTemplateId,
    `${request.fullName} // Internal Feedback Form // ${request.reviewDate.slice(0, 7)}`,
    folder,
    request.employeeEmail,
    request.reviewerEmail
  );
  const clientForm = request.needsClientForm
    ? await copyFormFromTemplate(
        drive,
        request.clientReviewFormTemplateId,
        `${request.fullName} // Client Feedback Form // ${request.reviewDate.slice(0, 7)}`,
        folder,
        request.employeeEmail,
        request.reviewerEmail
      )
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

async function findEmployeeFolder(
  files: DriveFilesResource,
  rootFolderId: string,
  fullName: string
): Promise<{ id: string; name: string } | null> {
  const normalizedFullName = normalizePersonName(fullName);
  const escapedRootFolderId = escapeDriveQueryValue(rootFolderId);
  const { data } = await files.list({
    q: `'${escapedRootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id,name)",
    pageSize: 100,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });

  const folder = data.files?.find(
    (file) => file.id && file.name && normalizePersonName(file.name) === normalizedFullName
  );

  if (!folder?.id || !folder.name) {
    return null;
  }

  return {
    id: folder.id,
    name: folder.name
  };
}

function escapeDriveQueryValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
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

  return {
    id: data.id,
    name: data.name,
    webViewLink: data.webViewLink
  };
}

async function copyFormFromTemplate(
  drive: DriveResource,
  templateId: string,
  formName: string,
  folder: CreatedDriveFile,
  employeeEmail: string,
  reviewerEmail: string
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

  if (normalizeEmail(employeeEmail) !== normalizeEmail(reviewerEmail)) {
    await grantEmployeeWriterAccess(drive, data.id, employeeEmail);
  }

  return {
    id: data.id,
    name: data.name,
    webViewLink: data.webViewLink
  };
}

async function grantEmployeeWriterAccess(
  drive: DriveResource,
  fileId: string,
  employeeEmail: string
): Promise<void> {
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
