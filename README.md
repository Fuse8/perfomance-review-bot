# Performance Review Bot MVP

A Google Chat bot for managing a performance review workflow.

It's standalone chat bot, not add-on.

Basic flow: the `/review` command opens a form. After submission, the bot creates a Google Drive folder named `{First Name Last Name} // YYYY.MM` and returns a link to it.

## Tech Stack

- TypeScript
- Node.js
- Express
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
- Refresh token storage:
  - Local: `.data/storage.json`
  - Production: Prisma/Neon
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

## Google Cloud Setup

1. Create a Google Cloud project.
2. Enable the following APIs:
   - Google Chat API
   - Google Drive API
   - Google People API
   - Google People/OAuth userinfo (typically available through OAuth2 APIs)
3. Create an OAuth Client ID of type **Web application**.
4. Add the redirect URI:

```text
https://<cloud-run-url>/auth/google/callback
```

5. Create a root review folder in Google Drive and copy its ID.
6. Reviewer OAuth scopes must include access to Drive, Docs, Calendar, and the Google Workspace directory. The narrower `drive.file` scope is not suitable when using a pre-created root folder.
7. Final Google Chat messages are sent on behalf of the bot using a service account with the scope `https://www.googleapis.com/auth/chat.bot`. In Cloud Run, use an attached service account / ADC. **Locally**, without `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`, the final report will not be delivered to Google Chat. See [docs/local-google-chat-test.md](docs/local-google-chat-test.md).

After adding or modifying OAuth scopes, reviewers must complete the OAuth flow again so that their refresh token receives the new permissions.

## Environment Variables

Copy `.env.example` and fill in the required values:

```text
APP_BASE_URL=https://<app-url>
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://<app-url>/auth/google/callback
REVIEWS_ROOT_FOLDER_ID=...
STORAGE_DRIVER=local
LOCAL_STORAGE_PATH=.data/storage.json
DATABASE_URL=
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=
GOOGLE_SERVICE_ACCOUNT_CREDENTIALS=
PORT=8080
```

## Local Development

```bash
pnpm install
pnpm dev:local
```

For local Google Chat testing without billing, see [docs/local-google-chat-test.md](docs/local-google-chat-test.md).

For local development, keep:

```text
STORAGE_DRIVER=local
LOCAL_STORAGE_PATH=.data/storage.json
```

## Vercel + Neon

For Vercel deployments, use:

```text
STORAGE_DRIVER=prisma
DATABASE_URL=postgresql://...
GOOGLE_SERVICE_ACCOUNT_CREDENTIALS={"type":"service_account",...}
```

For detailed instructions, see [docs/vercel-neon-deploy.md](docs/vercel-neon-deploy.md).

## Commands

- Install: `pnpm install`
- Development: `pnpm dev:local`
- Test: `pnpm test`
- Prisma generate: `pnpm prisma:generate`
- Prisma migrate (development): `pnpm prisma:migrate:dev`
- Prisma migrate (production): `pnpm prisma:migrate:deploy`

## Google Chat App Configuration

For full setup instructions, see [docs/google-chat-bot-setup.md](docs/google-chat-bot-setup.md).

In Google Chat API settings:

- App URL: `https://<cloud-run-url>/google-chat/events`
- Slash command:
  - Name: `/review`
  - Command ID: `1`
  - Enable **Opens dialog** if available in the configuration UI.
- Info slash command:
  - Name: `/info`
  - Command ID: `2`
- Authentication debugging slash command:
  - Name: `/check-auth`
  - Command ID: `3`

## Verification

1. Open a chat with the bot.
2. Send `/info` and verify the response contains the bot version and `/review` command description.
3. Send `/review`.
4. Complete the form.
5. If the bot requests OAuth authorization, click **Connect Google**.
6. Run `/review` again.
7. Verify that a review folder has been created inside the root folder.
8. Verify the final Google Chat message and the log entry `submit.sendChatMessage.success`.

## Documentation

- Agent instructions: [AGENTS.md](AGENTS.md)
- Product specification: [docs/app.md](docs/app.md)
- Deployment guide: [docs/vercel-neon-deploy.md](docs/vercel-neon-deploy.md)
