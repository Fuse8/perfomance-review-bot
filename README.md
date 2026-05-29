# Performance Review Bot MVP

Минимальный Google Chat-бот для тестового сценария: `/review` открывает форму, после отправки бот создает папку `{Имя Фамилия} // YYYY.MM` в Google Drive и возвращает ссылку.

## Что реализовано

- Express webhook для Google Chat: `POST /google-chat/events`
- OAuth ревьюера через Google
- Firestore-хранилище refresh token
- Создание папки в Google Drive через Drive API
- Healthcheck: `GET /healthz`
- Dockerfile для Cloud Run

## Настройка Google Cloud

1. Создать Google Cloud project.
2. Включить API:
   - Google Chat API
   - Google Drive API
   - Google People API
   - Firestore API
   - Google People/OAuth userinfo обычно доступен через OAuth2 API
3. Создать OAuth Client ID типа Web application.
4. Добавить redirect URI:

```text
https://<cloud-run-url>/auth/google/callback
```

5. Создать Firestore database в Native mode.
6. Создать root-папку ревью в Google Drive и скопировать ее id.
7. OAuth scopes ревьюера включают доступ к Drive, Docs, Calendar и Google Workspace directory. Более узкий `drive.file` не подходит для заранее созданной root-папки.
8. Финальные сообщения в Google Chat отправляются от имени бота через service account со scope `https://www.googleapis.com/auth/chat.bot`. В Cloud Run используйте attached service account / ADC. **Локально** без `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` финальный отчёт в чат не уйдёт — см. [docs/local-google-chat-test.md](docs/local-google-chat-test.md).

После добавления или изменения OAuth scopes ревьюерам нужно заново пройти OAuth, чтобы refresh token получил новые права.

## Env

Скопировать `.env.example` и заполнить:

```text
APP_BASE_URL=https://<cloud-run-url>
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://<cloud-run-url>/auth/google/callback
REVIEWS_ROOT_FOLDER_ID=...
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=
GOOGLE_CLOUD_PROJECT=...
PORT=8080
```

## Локальный запуск

```bash
pnpm install
pnpm dev:local
```

Для локального теста Google Chat без billing см. [docs/local-google-chat-test.md](docs/local-google-chat-test.md).

## Cloud Run

Быстрый путь описан в [docs/google-chat-mvp-test.md](docs/google-chat-mvp-test.md).

```bash
gcloud run deploy performance-review-bot \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --set-env-vars APP_BASE_URL=https://<cloud-run-url> \
  --set-env-vars GOOGLE_CLIENT_ID=<id> \
  --set-env-vars GOOGLE_CLIENT_SECRET=<secret> \
  --set-env-vars GOOGLE_REDIRECT_URI=https://<cloud-run-url>/auth/google/callback \
  --set-env-vars REVIEWS_ROOT_FOLDER_ID=<folder-id>
```

После первого деплоя Cloud Run URL станет известен. Его нужно добавить в OAuth redirect URI и в `APP_BASE_URL`, затем задеплоить еще раз.

## Настройка Google Chat app

В Google Chat API:

- App URL: `https://<cloud-run-url>/google-chat/events`
- Slash command:
  - Name: `/review`
  - Command ID: `1`
  - Opens dialog: включить, если доступно в интерфейсе настройки.
- Slash command для проверки:
  - Name: `/ping`
  - Command ID: `2`
- Slash command для отладки auth:
  - Name: `/check-auth`
  - Command ID: `3`

## Проверка

1. Открыть чат с ботом.
2. Написать `/ping` и проверить ответ `hello world`.
3. Написать `/review`.
4. Заполнить форму.
5. Если бот попросил OAuth, нажать “Подключить Google”.
6. Повторить `/review`.
7. Проверить, что в root-папке появилась папка ревью.
8. Проверить финальное сообщение в Google Chat и лог `submit.sendChatMessage.success`.
