# Deploy

Vercel + Neon deploy

Текущий runtime для Vercel:

- HTTP handler: `api/index.ts` (Node auto-detected; не задавайте `"runtime": "@vercel/node"` в `vercel.json` — невалидный формат)
- маршрутизация: `vercel.json` → rewrite на `/api/index`
- БД: Neon/Postgres через Prisma
- локальный dev использует Docker Postgres через Prisma

## Шаг 1. Минимальный smoke deploy

Цель шага:

- `GET /healthz` отвечает `200`
- `POST /google-chat/events` reachable
- `GET /auth/google/start` делает redirect
- `GET /auth/google/callback` reachable

Что нужно:

1. Создать проект в Vercel и подключить репозиторий.
2. Добавить переменные

Если `/healthz` отвечает `503` с `error`, в теле будет текст вроде `Missing required env var: ...` — добавьте переменные в Vercel → Settings → Environment Variables и redeploy.

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
{ "ok": true }
```

## Шаг 2. Production storage через Neon

1. Создать Neon database.
2. Скопировать `DATABASE_URL`.
3. В Vercel env задать:

```text
DATABASE_URL=postgresql://...
```

4. Применить миграции к Neon (один раз локально или на каждом deploy через Vercel build):

```bash
# локально, с DATABASE_URL из Neon в .env
pnpm prisma:migrate:deploy
```

В репозитории есть `prisma/migrations/` — при deploy Vercel выполняет `prisma migrate deploy`, если `DATABASE_URL` задан в env проекта (нужен для build).

Ошибка `The table public.ReviewerToken does not exist` — миграции ещё не применены к этой БД.

5. Перезапустить deploy в Vercel.

## Service account для Google Chat

```text
GOOGLE_SERVICE_ACCOUNT_CREDENTIALS={"type":"service_account",...}
```

Это полный JSON service account в одну строку.

Он нужен для `chat.bot`, то есть для отправки финальных сообщений от имени бота.
