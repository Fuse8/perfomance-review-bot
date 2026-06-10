# Performance Review Bot

A Google Chat bot for managing a performance review workflow.

It's standalone chat bot, not add-on.

Basic flow: the `/review` command opens a form. After submission, the bot creates a Google Drive folder named `{First Name Last Name} // YYYY.MM` with files for performance review and returns a link to it. Also it creates meetings and tasks in Google Calendar.

## Tech Stack

- TypeScript
- Node.js
- Express (development)
- Google Chat API
- Google OAuth 2.0
- Google Drive / Docs / Calendar / People / Forms APIs
- Prisma
- Neon / PostgreSQL
- Vercel

## Implemented Features

- Express webhook for Google Chat: `POST /google-chat/events`
- Reviewer authentication via Google OAuth
- Sending messages to Google Chat on behalf of the bot using a service account
- Refresh token storage via Prisma/PostgreSQL
- Google Drive folder creation and document management via Drive / Docs APIs
- Calendar, People, and Forms API integrations
- Health check endpoint: `GET /healthz`
- Vercel entry point: `api/index.ts`

## Key Files

- `src/app.ts` — Express app and routes
- `src/server.ts` — Local server entry point
- `src/chat.ts` — Main Google Chat workflow
- `src/oauth.ts` — Reviewer OAuth flow
- `src/google-chat.ts` — Message delivery via bot authentication
- `src/drive.ts` — Drive / Docs / Forms logic
- `src/calendar.ts` — Calendar meetings and reminders
- `src/people.ts` — Employee lookup
- `src/storage.ts` — Storage abstraction and implementations
- `prisma/schema.prisma` — Database schema

## Commands

- Install: `pnpm install`
- Local database: `pnpm db:local`
- Development: `pnpm dev`
- Test: `pnpm test:quiet`
- Prisma generate: `pnpm prisma:generate`
- Prisma migrate (development): `pnpm prisma:migrate:dev`
- Prisma migrate (production): `pnpm prisma:migrate:deploy`

## Google Chat App Configuration

For full setup instructions, see [docs/google-chat-bot-setup.md](docs/google-chat-bot-setup.md).

In Google Chat API settings:

- App URL: `https://<url>/google-chat/events`
- Slash command:
  - Name: `/review`
  - Command ID: `1`
  - Enable **Opens dialog** if available in the configuration UI.
- Reviewer settings slash command:
  - Name: `/settings`
  - Command ID: `3`
  - Enable **Opens dialog** if available in the configuration UI.
- Info slash command:
  - Name: `/info`
  - Command ID: `2`

Each reviewer must run `/settings` and set a Google Drive root folder ID before `/review` can start.

## Documentation

- Documentation guide: [docs/README.md](docs/README.md)
- Roadmap: [docs/roadmap.md](docs/roadmap.md)
- Product specification: [docs/product-spec.md](docs/product-spec.md)
- Deployment guide: [docs/deploy.md](docs/deploy.md)
