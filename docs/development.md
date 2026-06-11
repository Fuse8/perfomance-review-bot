# Development

1. Установить зависимости `pnpm install`
2. `pnpm tunnel`

3. Google Cloud / Chat app
   Подробная настройка отдельного локального Chat app: [google-chat-bot-setup.md](google-chat-bot-setup.md).

- OAuth redirect: `https://<tunnel>/auth/google/callback`
- Chat App URL: `https://<tunnel>/google-chat/events`
- Service Account key в `.data/service-account.json`;

5. Добавить `.env` на основе `.env.example`.
   Заполнить из ngrok `APP_BASE_URL` и `GOOGLE_REDIRECT_URI`.
   Нужен локальный `DATABASE_URL` и `GOOGLE_SERVICE_ACCOUNT_KEY_FILE=/absolute/path/to/service-account.json`.

6. Запуск

```bash
pnpm db:local     # один раз перед запуском
pnpm prisma:migrate:dev
pnpm dev    # терминал 1
```
