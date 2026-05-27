import { google } from "googleapis";
import type { AppConfig } from "./config.js";
import { createOAuthClient } from "./oauth.js";

export async function sendChatMessage(
  config: AppConfig,
  refreshToken: string,
  spaceName: string,
  text: string
): Promise<void> {
  const auth = createOAuthClient(config);
  auth.setCredentials({ refresh_token: refreshToken });

  const chat = google.chat({ version: "v1", auth });
  await chat.spaces.messages.create({
    parent: spaceName,
    requestBody: {
      text
    }
  });
}
