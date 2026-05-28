import assert from "node:assert/strict";
import test from "node:test";
import {
  createReviewFolderInDrive,
  findEmployeeFolderInDrive,
  findPreviousReviewReportInDrive,
  isReviewMonthFolderName,
  listEmployeeFoldersInDrive,
  normalizePersonName
} from "./drive.js";

test("isReviewMonthFolderName matches YYYY.MM folders", () => {
  assert.equal(isReviewMonthFolderName("2026.06"), true);
  assert.equal(isReviewMonthFolderName("2026-06"), false);
});

test("normalizePersonName trims, lowercases and collapses spaces", () => {
  assert.equal(normalizePersonName("  Ivan   PETROV  "), "ivan petrov");
});

test("listEmployeeFoldersInDrive returns matching employee folders", async () => {
  const files = {
    async list(params: { q?: string; fields?: string; pageSize?: number }) {
      assert.match(params.q ?? "", /root-folder-id/);
      assert.equal(params.fields, "files(id,name)");
      assert.equal(params.pageSize, 100);
      return {
        data: {
          files: [
            { id: "ivan-folder-id", name: "Ivan Petrov" },
            { id: "petr-folder-id", name: "Petr Ivanov" },
            { id: "empty-name", name: "" },
            { id: null, name: "No Id" }
          ]
        }
      };
    }
  };

  const folders = await listEmployeeFoldersInDrive(files, "root-folder-id", "ivan");

  assert.deepEqual(folders, [
    { id: "ivan-folder-id", name: "Ivan Petrov" },
    { id: "petr-folder-id", name: "Petr Ivanov" }
  ]);
});

test("findEmployeeFolderInDrive finds employee by exact normalized folder name", async () => {
  const files = {
    async list() {
      return {
        data: {
          files: [
            { id: "wrong-folder-id", name: "Ivan Ivanov" },
            { id: "employee-folder-id", name: "  IVAN   petrov " }
          ]
        }
      };
    }
  };

  const folder = await findEmployeeFolderInDrive(files, "root-folder-id", "Ivan Petrov");

  assert.deepEqual(folder, {
    id: "employee-folder-id",
    name: "  IVAN   petrov "
  });
});

test("createReviewFolderInDrive creates review month folder inside matched employee folder", async () => {
  const createdParents: string[][] = [];
  const copiedFiles: Array<{ fileId: string; name?: string; parents?: string[] }> = [];
  const replacedTexts: Array<{ containsText?: string; replaceText?: string }> = [];
  const permissions: Array<{ fileId: string; emailAddress?: string }> = [];
  const files = {
    async get() {
      return {
        data: {
          mimeType: "application/vnd.google-apps.folder"
        }
      };
    },
    async list() {
      return {
        data: {
          files: [
            {
              id: "employee-folder-id",
              name: "  IVAN   petrov "
            }
          ]
        }
      };
    },
    async create(params: { requestBody?: { parents?: string[] } }) {
      createdParents.push(params.requestBody?.parents ?? []);
      return {
        data: {
          id: "month-folder-id",
          name: "2026.06",
          webViewLink: "https://drive.google.com/month-folder"
        }
      };
    },
    async copy(params: { fileId: string; requestBody?: { name?: string; parents?: string[] } }) {
      copiedFiles.push({
        fileId: params.fileId,
        name: params.requestBody?.name,
        parents: params.requestBody?.parents
      });
      const webViewLink =
        params.fileId === "internal-form-template-id"
          ? "https://docs.google.com/forms/internal-form-id"
          : params.fileId === "client-form-template-id"
            ? "https://docs.google.com/forms/client-form-id"
            : "https://docs.google.com/document/report-id";
      const id =
        params.fileId === "internal-form-template-id"
          ? "internal-form-id"
          : params.fileId === "client-form-template-id"
            ? "client-form-id"
            : "report-id";
      return {
        data: {
          id,
          name: params.requestBody?.name,
          webViewLink
        }
      };
    }
  };
  const documents = {
    async batchUpdate(params: {
      documentId: string;
      requestBody?: {
        requests?: Array<{
          replaceAllText?: {
            containsText?: { text?: string };
            replaceText?: string;
          };
        }>;
      };
    }) {
      assert.equal(params.documentId, "report-id");
      for (const request of params.requestBody?.requests ?? []) {
        replacedTexts.push({
          containsText: request.replaceAllText?.containsText?.text,
          replaceText: request.replaceAllText?.replaceText
        });
      }
      return { data: {} };
    }
  };
  const permissionsResource = {
    async create(params: { fileId: string; requestBody?: { emailAddress?: string } }) {
      permissions.push({
        fileId: params.fileId,
        emailAddress: params.requestBody?.emailAddress
      });
      return { data: {} };
    }
  };

  const folder = await createReviewFolderInDrive({ files, permissions: permissionsResource, documents }, {
    rootFolderId: "root-folder-id",
    reviewReportTemplateId: "report-template-id",
    internalReviewFormTemplateId: "internal-form-template-id",
    clientReviewFormTemplateId: "client-form-template-id",
    fullName: "Ivan Petrov",
    employeeEmail: "ivan.petrov@example.test",
    reviewerEmail: "reviewer@example.test",
    reviewDate: "2026-06-15",
    meetingTime: "14:30",
    reviewMonth: "2026.06",
    needsClientForm: true,
    previousReviewUrl: "https://docs.google.com/document/previous-report"
  });

  assert.equal(folder.name, "2026.06");
  assert.equal(folder.report?.webViewLink, "https://docs.google.com/document/report-id");
  assert.equal(folder.internalForm?.webViewLink, "https://docs.google.com/forms/internal-form-id");
  assert.equal(folder.clientForm?.webViewLink, "https://docs.google.com/forms/client-form-id");
  assert.deepEqual(createdParents, [["employee-folder-id"]]);
  assert.deepEqual(copiedFiles, [
    {
      fileId: "report-template-id",
      name: "Ivan Petrov // Отчёт Performance Review // 2026-06",
      parents: ["month-folder-id"]
    },
    {
      fileId: "internal-form-template-id",
      name: "Ivan Petrov // Internal Feedback Form // 2026-06",
      parents: ["month-folder-id"]
    },
    {
      fileId: "client-form-template-id",
      name: "Ivan Petrov // Client Feedback Form // 2026-06",
      parents: ["month-folder-id"]
    }
  ]);
  assert.deepEqual(replacedTexts, [
    { containsText: "{{FULL_NAME}}", replaceText: "Ivan Petrov" },
    { containsText: "{{REVIEW_DATE}}", replaceText: "2026-06-15" },
    { containsText: "{{REVIEWER_EMAIL}}", replaceText: "reviewer@example.test" },
    { containsText: "{{REVIEW_FOLDER_URL}}", replaceText: "https://drive.google.com/month-folder" },
    { containsText: "{{PREVIOUS_REVIEW_URL}}", replaceText: "https://docs.google.com/document/previous-report" }
  ]);
  assert.deepEqual(permissions, [
    {
      fileId: "month-folder-id",
      emailAddress: "ivan.petrov@example.test"
    },
    {
      fileId: "internal-form-id",
      emailAddress: "ivan.petrov@example.test"
    },
    {
      fileId: "client-form-id",
      emailAddress: "ivan.petrov@example.test"
    }
  ]);
});

test("createReviewFolderInDrive creates only internal form when client form is not needed", async () => {
  const copiedFiles: Array<{ fileId: string; name?: string; parents?: string[] }> = [];
  const files = {
    async get() {
      return {
        data: {
          mimeType: "application/vnd.google-apps.folder"
        }
      };
    },
    async list() {
      return {
        data: {
          files: [
            {
              id: "employee-folder-id",
              name: "Ivan Petrov"
            }
          ]
        }
      };
    },
    async create() {
      return {
        data: {
          id: "month-folder-id",
          name: "2026.06",
          webViewLink: "https://drive.google.com/month-folder"
        }
      };
    },
    async copy(params: { fileId: string; requestBody?: { name?: string; parents?: string[] } }) {
      copiedFiles.push({
        fileId: params.fileId,
        name: params.requestBody?.name,
        parents: params.requestBody?.parents
      });
      const webViewLink =
        params.fileId === "internal-form-template-id"
          ? "https://docs.google.com/forms/internal-form-id"
          : "https://docs.google.com/document/report-id";
      return {
        data: {
          id: params.fileId === "internal-form-template-id" ? "internal-form-id" : "report-id",
          name: params.requestBody?.name,
          webViewLink
        }
      };
    }
  };
  const documents = {
    async batchUpdate() {
      return { data: {} };
    }
  };

  const folder = await createReviewFolderInDrive({ files, documents }, {
    rootFolderId: "root-folder-id",
    reviewReportTemplateId: "report-template-id",
    internalReviewFormTemplateId: "internal-form-template-id",
    clientReviewFormTemplateId: "client-form-template-id",
    fullName: "Ivan Petrov",
    employeeEmail: "ivan.petrov@example.test",
    reviewerEmail: "reviewer@example.test",
    reviewDate: "2026-06-15",
    meetingTime: "14:30",
    reviewMonth: "2026.06",
    needsClientForm: false
  });

  assert.equal(folder.internalForm?.webViewLink, "https://docs.google.com/forms/internal-form-id");
  assert.equal(folder.clientForm, undefined);
  assert.deepEqual(
    copiedFiles.map((file) => file.fileId),
    ["report-template-id", "internal-form-template-id"]
  );
});

test("createReviewFolderInDrive skips permission grant when employee is the reviewer", async () => {
  let permissionCalls = 0;
  const files = createFilesStub();
  const permissions = {
    async create() {
      permissionCalls += 1;
      return { data: {} };
    }
  };

  await createReviewFolderInDrive({ files, permissions, documents: { async batchUpdate() { return { data: {} }; } } }, {
    rootFolderId: "root-folder-id",
    reviewReportTemplateId: "report-template-id",
    internalReviewFormTemplateId: "internal-form-template-id",
    clientReviewFormTemplateId: "client-form-template-id",
    fullName: "Ivan Petrov",
    employeeEmail: "dmitry.berdnikov@fuse8.online",
    reviewerEmail: "dmitry.berdnikov@fuse8.online",
    reviewDate: "2026-06-15",
    meetingTime: "14:30",
    reviewMonth: "2026.06",
    needsClientForm: false
  });

  assert.equal(permissionCalls, 0);
});

test("createReviewFolderInDrive fails when employee folder is missing", async () => {
  const files = {
    async get() {
      return {
        data: {
          mimeType: "application/vnd.google-apps.folder"
        }
      };
    },
    async list() {
      return {
        data: {
          files: []
        }
      };
    },
    async create() {
      throw new Error("should not create folder");
    },
    async copy() {
      throw new Error("should not copy report");
    }
  };

  await assert.rejects(
    () =>
      createReviewFolderInDrive({ files }, {
        rootFolderId: "root-folder-id",
        reviewReportTemplateId: "report-template-id",
        internalReviewFormTemplateId: "internal-form-template-id",
        clientReviewFormTemplateId: "client-form-template-id",
        fullName: "Ivan Petrov",
        employeeEmail: "ivan.petrov@example.test",
        reviewerEmail: "reviewer@example.test",
        reviewDate: "2026-06-15",
        meetingTime: "14:30",
        reviewMonth: "2026.06",
        needsClientForm: false
      }),
    /Папка сотрудника не найдена: Ivan Petrov/
  );
});

test("findPreviousReviewReportInDrive returns the newest previous report", async () => {
  const listCalls: string[] = [];
  const files = {
    async list(params: { q?: string; fields?: string }) {
      listCalls.push(params.q ?? "");

      if (params.q?.includes("root-folder-id")) {
        return {
          data: {
            files: [{ id: "employee-folder-id", name: "Ivan Petrov" }]
          }
        };
      }

      if (params.q?.includes("employee-folder-id") && params.fields === "files(id,name)") {
        return {
          data: {
            files: [
              { id: "month-2026-04", name: "2026.04" },
              { id: "month-2026-05", name: "2026.05" },
              { id: "month-2026-06", name: "2026.06" }
            ]
          }
        };
      }

      if (params.q?.includes("month-2026-05")) {
        return {
          data: {
            files: [
              {
                id: "report-2026-05",
                name: "Ivan Petrov // Отчёт Performance Review // 2026-05",
                webViewLink: "https://docs.google.com/document/report-2026-05"
              }
            ]
          }
        };
      }

      if (params.q?.includes("month-2026-04")) {
        return {
          data: {
            files: [
              {
                id: "report-2026-04",
                name: "Ivan Petrov // Отчёт Performance Review // 2026-04",
                webViewLink: "https://docs.google.com/document/report-2026-04"
              }
            ]
          }
        };
      }

      return { data: { files: [] } };
    }
  };

  const previous = await findPreviousReviewReportInDrive(
    { files: files as never },
    "root-folder-id",
    "Ivan Petrov",
    "2026.06"
  );

  assert.deepEqual(previous, {
    id: "report-2026-05",
    name: "Ivan Petrov // Отчёт Performance Review // 2026-05",
    webViewLink: "https://docs.google.com/document/report-2026-05"
  });
  assert.match(listCalls[2] ?? "", /month-2026-05/);
});

test("findPreviousReviewReportInDrive returns null when no previous report exists", async () => {
  const files = {
    async list(params: { q?: string; fields?: string }) {
      if (params.q?.includes("root-folder-id")) {
        return {
          data: {
            files: [{ id: "employee-folder-id", name: "Ivan Petrov" }]
          }
        };
      }

      if (params.q?.includes("employee-folder-id") && params.fields === "files(id,name)") {
        return {
          data: {
            files: [{ id: "month-2026-06", name: "2026.06" }]
          }
        };
      }

      return { data: { files: [] } };
    }
  };

  const previous = await findPreviousReviewReportInDrive(
    { files: files as never },
    "root-folder-id",
    "Ivan Petrov",
    "2026.06"
  );

  assert.equal(previous, null);
});

function createFilesStub() {
  return {
    async get() {
      return {
        data: {
          mimeType: "application/vnd.google-apps.folder"
        }
      };
    },
    async list() {
      return {
        data: {
          files: [
            {
              id: "employee-folder-id",
              name: "Ivan Petrov"
            }
          ]
        }
      };
    },
    async create() {
      return {
        data: {
          id: "month-folder-id",
          name: "2026.06",
          webViewLink: "https://drive.google.com/month-folder"
        }
      };
    },
    async copy(params: { fileId: string; requestBody?: { name?: string } }) {
      const webViewLink =
        params.fileId === "internal-form-template-id"
          ? "https://docs.google.com/forms/internal-form-id"
          : "https://docs.google.com/document/report-id";
      return {
        data: {
          id: params.fileId === "internal-form-template-id" ? "internal-form-id" : "report-id",
          name: params.requestBody?.name,
          webViewLink
        }
      };
    }
  };
}
