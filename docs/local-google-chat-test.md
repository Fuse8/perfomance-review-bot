# Local Google Chat MVP test

Этот вариант не использует Cloud Run, Cloud Build, Artifact Registry и Firestore. Billing в Google Cloud не нужен.

## Что нужно

- Node.js 22
- pnpm
- `cloudflared` или другой HTTPS tunnel
- Google Cloud project для OAuth client и Drive API
- Google Drive root-папка для тестовых папок

## Настройка

Создай `.env.local`:

```bash
cp .env.local.example .env.local
```

Заполни:

```env
STORAGE_DRIVER=local
LOCAL_STORAGE_PATH=.data/storage.json
APP_BASE_URL=https://your-tunnel-url.trycloudflare.com
GOOGLE_REDIRECT_URI=https://your-tunnel-url.trycloudflare.com/auth/google/callback
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
REVIEWS_ROOT_FOLDER_ID=...
PORT=8080
```

## Запуск

В первом терминале:

```bash
pnpm dev:local
```

Во втором терминале:

```bash
pnpm tunnel
```

Скопируй HTTPS URL от `cloudflared`.

Обнови в `.env.local`:

```env
APP_BASE_URL=https://<tunnel-url>
GOOGLE_REDIRECT_URI=https://<tunnel-url>/auth/google/callback
```

Перезапусти `pnpm dev:local`.

## Google OAuth client

В OAuth client добавь redirect URI:

```text
https://<tunnel-url>/auth/google/callback
```

## Google Chat app

В Google Chat API configuration поставь App URL:

```text
https://<tunnel-url>/google-chat/events
```

Slash command:

```text
/review, Command ID 1
/ping, Command ID 2
```

## Проверка

1. Открой Google Chat.
2. Напиши боту `/ping` и проверь ответ `hello world`.
3. Напиши боту `/review`.
4. Заполни форму.
5. Нажми “Подключить Google”.
6. Пройди OAuth.
7. Повтори `/review`.
8. Проверь, что бот вернул ссылку на папку в Drive.

Токены локально сохраняются в `.data/storage.json`.
