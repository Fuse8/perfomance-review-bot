import { google } from "googleapis";
import type { AppConfig } from "./config.js";
import { createOAuthClient } from "./oauth.js";

export type CreatedFolder = {
  id: string;
  name: string;
  webViewLink: string;
};

export async function createReviewFolder(
  config: AppConfig,
  refreshToken: string,
  folderName: string
): Promise<CreatedFolder> {
  const auth = createOAuthClient(config);
  auth.setCredentials({ refresh_token: refreshToken });

  const drive = google.drive({ version: "v3", auth });

  const root = await drive.files.get({
    fileId: config.reviewsRootFolderId,
    fields: "id,name,mimeType"
  });

  if (root.data.mimeType !== "application/vnd.google-apps.folder") {
    throw new Error("REVIEWS_ROOT_FOLDER_ID is not a Google Drive folder");
  }

  const { data } = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [config.reviewsRootFolderId]
    },
    fields: "id,name,webViewLink"
  });

  if (!data.id || !data.name || !data.webViewLink) {
    throw new Error("Google Drive did not return created folder metadata");
  }

  return {
    id: data.id,
    name: data.name,
    webViewLink: data.webViewLink
  };
}
