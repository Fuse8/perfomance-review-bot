# Google cloud console settings

## Полезные ссылки
- [https://developers.google.com/workspace/chat/api/reference](https://developers.google.com/workspace/chat/api/reference)
- [https://docs.cloud.google.com/docs/overview](https://docs.cloud.google.com/docs/overview)

## Summary
- Созданы два проекта в google cloud, один для разработки и доступа через ngrok, второй в публичном доступе на vercel
- Chat bot использует Google API's, основное это Google Chat API для самого бота и slash-команд.
- Google Auth Platform для OAuth. Настраиваем права, которые запросит бот для работы от имени пользователя.
- Service account для отправки сообщений от имени бота.
- Workspace Marketplace SDK для публикации внутри домена.
- Важно при создании сделать standalone, а не add-on конфигурацию, иначе придется пересоздавать проект

## Инструкция

1. Создать Google Cloud project в Google Cloud Console

2. Настроить Google Chat API
Перейти в APIs & Services -> Library. Найти Google Chat API и нажать enable:

Затем переходим в Configuration, основные моменты:

Отключаем Build this Chat app as a Workspace add-on. Так как это будет standalone приложение, workspace add-on нужен для интеграции чата в другие приложения по типу calendar и др.

Должно быть включено: Enable interactive features

Connection Settings Triggers указываем урл нашего апи

```text
https://<url>/google-chat/events
```

Slash commands:

```text
Name: /review
Command ID: 1
Opens dialog: enabled
```

```text
Name: /info
Command ID: 2
```

Visibility:

- ограничить с помощью email'ов или рабочей группой

На данный момент чат бота уже можно будет найти для выбранных пользователей. Если начать новый чат и ввести имя бота.

3. Добавляем API, которые нужны для работы бота. APIs & Services -> Library

- Google Drive API
- Google Docs API
- Google Calendar API
- Google Forms API
- Google People API (чтение сотрудников для селекта)

4. Настроить OAuth
Перейти в Google Auth Platform и нажать Get started. Заполнить форму. В основном это нужно, чтобы в OAuth авторизации показывалось, что за приложение запрашивает доступ, поэтому там поля email поддержки, название приложения, также выбираем Audience internal, так как публикуем в рамках компании.

Затем создаем OAuth client:

- Application Type: **Web application**
- Authorized redirect URI:

```text
https://<url>/auth/google/callback
```
Скопировать Client Id и Client Secret, добавить в переменные. Их можно посмотреть, если нажать на созданный OAuth client.

5. Настроить Data Access
В разделе Google Auth Platform открыть Data Access и добавить нужные на основании включенных API. Доступы openid, email, profile должны быть включены по умолчанию, но для наглядности их также можно добавить.

  - `openid`
  - `email`
  - `profile`
  - `https://www.googleapis.com/auth/drive`
  - `https://www.googleapis.com/auth/documents`
  - `https://www.googleapis.com/auth/calendar.events`
  - `https://www.googleapis.com/auth/directory.readonly`
  - `https://www.googleapis.com/auth/forms.body`

6. Создать Service Account
Перейти в IAM & Admin -> Service Accounts -> Create service account.
Роли можно не выбирать. После этого нужно создать key (не самый безопасный способ, но другие способы сложнее настраиваются и подходят больше, когда приложение разворачивается в google cloud).

Локально сохраняем ключ в .data/service-account.json (.gitignore обязательно).

Для Vercel этот ключ добавляется в sensative переменные.

7. Публикация

Добавить Google Workspace Marketplace SDK в APIs & Services

Затем сделать конфигурацию, основные моменты:

- App Integrations: Chat app
- OAuth Scopes убрать все кроме базовых (email, profile, openid), так как бот отдельно запрашивает OAuth при старте.

Дальше открыть Store Listing, заполнить поля, сохранить и опубликовать.

После этого бота можно будет найти во внутренних приложениях.
