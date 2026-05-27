# Google Chat MVP test

## Prerequisites

- Google Cloud SDK installed locally.
- Google Cloud project selected.
- Billing enabled if Cloud Run deployment requires it.
- A manually created Google Drive root folder for review folders.
- OAuth client created as Web application.

## Required OAuth settings

OAuth consent screen:

- User type: Internal, if available.
- Scopes:
  - `openid`
  - `email`
  - `profile`
  - `https://www.googleapis.com/auth/drive`

OAuth client:

- Application type: Web application.
- Authorized redirect URI after first deploy:

```text
https://<cloud-run-url>/auth/google/callback
```

## Deploy

Export required values:

```bash
export GOOGLE_CLOUD_PROJECT="your-project-id"
export GOOGLE_CLIENT_ID="your-oauth-client-id"
export GOOGLE_CLIENT_SECRET="your-oauth-client-secret"
export REVIEWS_ROOT_FOLDER_ID="your-drive-folder-id"
```

First deploy:

```bash
bash scripts/deploy-cloud-run.sh
```

Copy the printed Cloud Run URL, add this redirect URI to the OAuth client:

```text
https://<cloud-run-url>/auth/google/callback
```

Final deploy:

```bash
export CLOUD_RUN_URL="https://<cloud-run-url>"
bash scripts/deploy-cloud-run.sh
```

## Configure Google Chat

In Google Chat API configuration:

- App URL: `https://<cloud-run-url>/google-chat/events`
- Slash command:
  - Name: `/review`
  - Command ID: `1`
  - Opens dialog: enabled
- Slash command:
  - Name: `/ping`
  - Command ID: `2`
  - Opens dialog: enabled, if this option is shown.

## Test

1. Open Google Chat.
2. Start direct message with the bot.
3. Send `/ping` and verify `hello world`.
4. Send `/review`.
4. Fill name, date, and client-form checkbox.
5. Submit.
6. Click “Подключить Google”.
7. Complete OAuth.
8. Send `/review` again and submit.
9. Verify that the bot returns a Drive folder link.
10. Verify that the folder name uses `{Имя Фамилия} // YYYY.MM`.
