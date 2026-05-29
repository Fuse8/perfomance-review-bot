import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import type { AppConfig } from "./config.js";

const CHAT_BOT_SCOPE = "https://www.googleapis.com/auth/chat.bot";

export function createChatBotAuth(config: AppConfig): GoogleAuth {
  return new GoogleAuth({
    ...(config.chatServiceAccountCredentials
      ? {
        credentials: JSON.parse(config.chatServiceAccountCredentials)
      }
      : {}),
    ...(config.chatServiceAccountKeyFile
      ? { keyFile: config.chatServiceAccountKeyFile }
      : {}),
    scopes: [CHAT_BOT_SCOPE]
  });
}

export async function sendChatMessage(
  config: AppConfig,
  spaceName: string,
  text: string
): Promise<void> {
  const auth = createChatBotAuth(config);

  const chat = google.chat({ version: "v1", auth });
  await chat.spaces.messages.create({
    parent: spaceName,
    requestBody: {
      text
    }
  });
}
