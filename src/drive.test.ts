import assert from "node:assert/strict";
import test from "node:test";
import { createReviewFolderInDrive, normalizePersonName } from "./drive.js";

test("normalizePersonName trims, lowercases and collapses spaces", () => {
  assert.equal(normalizePersonName("  Ivan   PETROV  "), "ivan petrov");
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
      return {
        data: {
          id: "report-id",
          name: params.requestBody?.name,
          webViewLink: "https://docs.google.com/document/report-id"
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
    fullName: "Ivan Petrov",
    employeeEmail: "ivan.petrov@example.test",
    reviewerEmail: "reviewer@example.test",
    reviewDate: "2026-06-15",
    reviewMonth: "2026.06"
  });

  assert.equal(folder.name, "2026.06");
  assert.equal(folder.report?.webViewLink, "https://docs.google.com/document/report-id");
  assert.deepEqual(createdParents, [["employee-folder-id"]]);
  assert.deepEqual(copiedFiles, [
    {
      fileId: "report-template-id",
      name: "Ivan Petrov // Отчёт Performance Review // 2026-06",
      parents: ["month-folder-id"]
    }
  ]);
  assert.deepEqual(replacedTexts, [
    { containsText: "{{FULL_NAME}}", replaceText: "Ivan Petrov" },
    { containsText: "{{REVIEW_DATE}}", replaceText: "2026-06-15" },
    { containsText: "{{REVIEWER_EMAIL}}", replaceText: "reviewer@example.test" },
    { containsText: "{{REVIEW_FOLDER_URL}}", replaceText: "https://drive.google.com/month-folder" },
    { containsText: "{{PREVIOUS_REVIEW_URL}}", replaceText: "" }
  ]);
  assert.deepEqual(permissions, [
    {
      fileId: "month-folder-id",
      emailAddress: "ivan.petrov@example.test"
    }
  ]);
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

  await createReviewFolderInDrive({ files, permissions }, {
    rootFolderId: "root-folder-id",
    reviewReportTemplateId: "report-template-id",
    fullName: "Ivan Petrov",
    employeeEmail: "dmitry.berdnikov@fuse8.online",
    reviewerEmail: "dmitry.berdnikov@fuse8.online",
    reviewDate: "2026-06-15",
    reviewMonth: "2026.06"
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
        fullName: "Ivan Petrov",
        employeeEmail: "ivan.petrov@example.test",
        reviewerEmail: "reviewer@example.test",
        reviewDate: "2026-06-15",
        reviewMonth: "2026.06"
      }),
    /Папка сотрудника не найдена: Ivan Petrov/
  );
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
    async copy() {
      return {
        data: {
          id: "report-id",
          name: "Ivan Petrov // Отчёт Performance Review // 2026-06",
          webViewLink: "https://docs.google.com/document/report-id"
        }
      };
    }
  };
}
