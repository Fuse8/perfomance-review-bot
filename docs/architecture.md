# Architecture

Локально сервис запускается как Express app, в production используется Vercel entrypoint.

## Основной поток

1. Google Chat отправляет события в `POST /google-chat/events`.
2. `/review` открывает форму performance review.
3. После submit бот создает Google Drive артефакты, формы, календарные события и
   задачи.
4. Итоговое сообщение отправляется в Google Chat от имени бота.

## Ключевые модули

- `src/app.ts` - Express app и routes.
- `src/server.ts` - локальный server entrypoint.
- `api/index.ts` - Vercel entrypoint.
- `src/chat.ts` - основной Google Chat workflow.
- `src/oauth.ts` - OAuth flow для reviewer.
- `src/google-chat.ts` - отправка сообщений через bot authentication.
- `src/drive.ts` - Drive, Docs и Forms операции.
- `src/calendar.ts` - Calendar встречи и reminders.
- `src/people.ts` - поиск сотрудников.
- `src/storage.ts` - storage contract и реализации.
- `prisma/schema.prisma` - схема БД.

## Storage

Reviewer refresh tokens хранятся через Prisma/PostgreSQL. Контракт
`TokenStorage` остается стабильной границей между workflow и storage
реализациями.

OAuth `state` не хранится в базе: бот включает в него `chatUserId`, email и срок
действия, кодирует payload через Base64URL и подписывает HMAC-SHA256. Ссылка
действует 10 минут и создаётся только из события Google Chat с идентификатором и
email пользователя.
