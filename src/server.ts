import express from "express";
import { loadConfig } from "./config.js";
import { handleChatEvent } from "./chat.js";
import { buildAuthUrl, completeOAuth } from "./oauth.js";
import { TokenStorage } from "./storage.js";

const config = loadConfig();
const storage = new TokenStorage();
const app = express();

app.use(express.json());

app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post("/google-chat/events", async (req, res, next) => {
  try {
    const response = await handleChatEvent(config, storage, req.body);
    res.json(response);
  } catch (error) {
    next(error);
  }
});

app.get("/auth/google/start", async (req, res, next) => {
  try {
    const chatUserId = String(req.query.chatUserId ?? "");
    if (!chatUserId) {
      res.status(400).send("Missing chatUserId");
      return;
    }

    res.redirect(await buildAuthUrl(config, storage, chatUserId));
  } catch (error) {
    next(error);
  }
});

app.get("/auth/google/callback", async (req, res, next) => {
  try {
    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");

    if (!code || !state) {
      res.status(400).send("Missing code or state");
      return;
    }

    const email = await completeOAuth(config, storage, code, state);
    res.type("html").send(`
      <!doctype html>
      <html lang="ru">
        <head><meta charset="utf-8"><title>Google подключен</title></head>
        <body>
          <h1>Google подключен</h1>
          <p>Аккаунт ${escapeHtml(email)} сохранен. Вернитесь в Google Chat и повторите запуск.</p>
        </body>
      </html>
    `);
  } catch (error) {
    next(error);
  }
});

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(error);
    res.status(500).json({ error: message });
  }
);

app.listen(config.port, () => {
  console.log(`Performance Review Bot listening on ${config.port}`);
});

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
