# Локальный тест Google Chat (без Cloud Run billing)

Нужны: Node 24, pnpm, Docker, HTTPS tunnel (`pnpm tunnel` / cloudflared), OAuth client, Drive root folder, SA key для Chat.

## Env (`.env`)

```env
APP_BASE_URL=https://<tunnel-url>
GOOGLE_REDIRECT_URI=https://<tunnel-url>/auth/google/callback
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
REVIEWS_ROOT_FOLDER_ID=...
DATABASE_URL=postgresql://performance_review_bot:performance_review_bot@localhost:5432/performance_review_bot
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=.data/service-account.json
PORT=8080
```

Без `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` Drive/Calendar создадутся, но сообщения в Chat от бота — нет.

## Запуск

```bash
pnpm db:local     # один раз перед запуском
pnpm prisma:migrate:dev
pnpm dev:local    # терминал 1
pnpm tunnel       # терминал 2 → скопировать HTTPS URL
```

Обновить `APP_BASE_URL` и `GOOGLE_REDIRECT_URI` в `.env`, перезапустить `dev:local`.

## Google Cloud / Chat app

Подробная настройка отдельного локального Chat app: [google-chat-bot-setup.md](google-chat-bot-setup.md).

- OAuth redirect: `https://<tunnel>/auth/google/callback`
- Chat App URL: `https://<tunnel>/google-chat/events`
- Команды: `/review` (1), `/info` (2), `/check-auth` (3)
- Chat API включён; SA key в `.data/service-account.json`; бот в space

Ручной OAuth (пока нет `/auth`):

```text
https://<tunnel>/auth/google/start?chatUserId=<chat_user_id>
```

## Чеклист

1. `/info` → версия бота и описание команды `/review`
2. `/check-auth` → отчёт по SA и OAuth
3. `/review` → OAuth при необходимости → форма → submit
4. В чате сразу: «Запустил подготовку PR…»; через ~20 с — финал (папка, calendar, reminders)
5. Логи: `submit.workflow.start` → `submit.workflow.success` → `submit.sendChatMessage.success`
6. Без OAuth: `/review` — сообщение со ссылкой в чат; при вводе имени — карточка auth + кнопка «Закрыть» (autocomplete не закрывает диалог сам)

Токены и OAuth state хранятся в локальном Postgres через Prisma.
