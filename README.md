# Performance Review Bot

Google Chat бот для автоматизации создания документов и встреч performance review.

## Требования

- Node.js `24.x`
- pnpm `11.5.1`
- Docker для локального PostgreSQL
- ngrok или другой HTTPS tunnel для локальной проверки Google Chat

## Быстрый старт

1. Установить зависимости:

```bash
pnpm install
```

2. Создать `.env` на основе `.env.example` и заполнить локальные значения.

3. Запустить локальную БД и применить миграции:

```bash
pnpm db:local
pnpm prisma:migrate:dev
```

4. Запустить приложение:

```bash
pnpm dev
```

Подробная локальная настройка описана в [docs/development.md](docs/development.md).
Настройка Google Chat app описана в
[docs/google-chat-bot-setup.md](docs/google-chat-bot-setup.md).

## Стек

- TypeScript, Node.js, Express
- Google Chat API, OAuth 2.0, Drive, Docs, Forms, Calendar, People APIs
- Prisma, PostgreSQL, Neon
- Vercel

## Основные команды

- `pnpm dev` - запустить локальный сервер
- `pnpm db:local` - поднять локальный PostgreSQL
- `pnpm tunnel` - запустить ngrok tunnel на `8080`
- `pnpm prisma:migrate:dev` - применить локальные миграции
- `pnpm prisma:migrate:deploy` - применить production-миграции
- `pnpm format` - отформатировать проект
- `pnpm eslint:fix` - исправить lint-ошибки
- `pnpm type-check` - проверить TypeScript
- `pnpm test:quiet` - запустить тесты

## Документация

- [docs/architecture.md](docs/architecture.md) - архитектура и ключевые модули
- [docs/development.md](docs/development.md) - локальная разработка
- [docs/deploy.md](docs/deploy.md) - деплой на Vercel + Neon
- [docs/testing.md](docs/testing.md) - проверки и тесты
- [docs/product-spec.md](docs/product-spec.md) - продуктовая спецификация
- [docs/roadmap.md](docs/roadmap.md) - активные задачи
