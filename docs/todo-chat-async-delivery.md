# Техдолг и backlog

## Модель auth

- **OAuth ревьюера** — Drive, Docs, Calendar, Directory, Forms (`forms.body`).
- **Service account (`chat.bot`)** — только доставка сообщений в Chat.

Локально: `GOOGLE_SERVICE_ACCOUNT_KEY_FILE=.data/service-account.json`. В Cloud Run — ADC / attached SA.

## Сделано

- Async submit: ack в чат → workflow в фоне (`setImmediate`) → финал ботом.
- `spaceName` из `chat.space`, `appCommandPayload.space`, `buttonClickedPayload.space`, `widgetUpdatedPayload.space`.
- OAuth recovery: `invalid_grant` / `Insufficient Permission` → удаление token + ссылка в чат.
- `/check-auth` (Command ID 3).
- Автопубликация скопированных Google Forms (`forms.setPublishSettings`).
- Internal form: доступ респондентам по доменам из `EMPLOYEE_EMAIL_DOMAINS` (Drive `view: published`).

## Осталось

- Slash-команда `/auth` (отдельный Command ID; сейчас fallback: `/auth/google/start?chatUserId=...`).
- Очередь для Cloud Run (Cloud Tasks / PubSub), если нужна гарантия доставки после рестарта instance.

## Проверка submit

В логах: `submit.workflow.start` → `submit.workflow.success` → `submit.sendChatMessage.success`.

Подробнее: [local-google-chat-test.md](local-google-chat-test.md).
