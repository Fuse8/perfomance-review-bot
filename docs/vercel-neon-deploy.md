# Vercel + Neon deploy

Текущий runtime для Vercel:

- HTTP handler: Vercel Node runtime
- storage: `STORAGE_DRIVER=prisma`
- БД: Neon/Postgres через Prisma
- локальный dev остаётся на `STORAGE_DRIVER=local`

## Шаг 1. Минимальный smoke deploy

Цель шага:

- `GET /healthz` отвечает `200`
- `POST /google-chat/events` reachable
- `GET /auth/google/start` делает redirect
- `GET /auth/google/callback` reachable

Что нужно:

1. Создать проект в Vercel и подключить репозиторий.
2. Добавить env:

```text
APP_BASE_URL=https://<your-vercel-domain>
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://<your-vercel-domain>/auth/google/callback
REVIEWS_ROOT_FOLDER_ID=...
STORAGE_DRIVER=local
LOCAL_STORAGE_PATH=.data/storage.json
```

Для smoke deploy на Vercel `STORAGE_DRIVER=local` нужен только чтобы handler стартовал. Для реальной работы так оставлять нельзя: файловое хранилище на Vercel эфемерное.

3. В Google OAuth client добавить redirect URI:

```text
https://<your-vercel-domain>/auth/google/callback
```

4. Задеплоить.

Проверка:

```text
GET https://<your-vercel-domain>/healthz
```

Ожидаемый ответ:

```json
{"ok":true}
```

## Шаг 2. Production storage через Neon

1. Создать Neon database.
2. Скопировать `DATABASE_URL`.
3. В Vercel env задать:

```text
STORAGE_DRIVER=prisma
DATABASE_URL=postgresql://...
```

4. Применить Prisma schema:

```bash
pnpm prisma:migrate:dev
```

Для production можно использовать `prisma migrate deploy`, если добавите миграции в репозиторий.

5. Перезапустить deploy в Vercel.

## Service account для Google Chat

На Vercel не рассчитывайте на `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`.

Используйте env:

```text
GOOGLE_SERVICE_ACCOUNT_CREDENTIALS={"type":"service_account",...}
```

Это полный JSON service account в одну строку.

Он нужен для `chat.bot`, то есть для отправки финальных сообщений от имени бота.

## Локальный dev

Локально оставляйте:

```text
STORAGE_DRIVER=local
LOCAL_STORAGE_PATH=.data/storage.json
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=/absolute/path/to/service-account.json
```

Это сохраняет текущий flow с tunnel и ручной переавторизацией без Neon.
