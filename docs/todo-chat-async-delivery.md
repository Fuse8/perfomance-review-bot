# TODO: Auth и надёжная доставка результата /review в Google Chat

## Контекст

Сейчас `/review` уже умеет создавать Drive/Calendar артефакты и формировать финальный отчёт. Но доставка результата в Google Chat ненадёжна:

- Google Chat Add-on имеет HTTP-таймаут примерно 8-9 секунд для интерактивных событий.
- Drive/Calendar workflow может занимать дольше этого лимита.
- Финальное сообщение иногда не появляется в чате.
- `sendSubmitResultToChat` сейчас использует OAuth-токен ревьюера, но для отправки сообщений от имени бота нужен другой способ авторизации.

## Правильная модель авторизации

Нужна гибридная модель:

- **OAuth ревьюера оставить для Drive и Calendar.**
  - Папки, документы, формы и встречи создаются в контексте ревьюера.
  - Основная PR-встреча создаётся в календаре ревьюера.
  - Не нужно давать сервисному аккаунту широкий доступ к Drive/Calendar.
- **Service account использовать только для Google Chat delivery.**
  - Финальное сообщение должен отправлять бот, а не пользователь.
  - Не нужно добавлять ревьюеру лишние Chat scopes.
  - Для Chat API нужен scope `https://www.googleapis.com/auth/chat.bot`.

Не нужно переводить весь workflow на service account.

## Проблема 1: доставка финального сообщения

Текущая отправка через OAuth-токен ревьюера концептуально неправильная для Chat API. Нужен service account.

Новая env-настройка:

```env
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=.data/service-account.json
```

Ожидаемые изменения:

- В `config.ts` добавить `chatServiceAccountKeyFile?: string`.
- В `google-chat.ts` заменить auth на `GoogleAuth`:

```ts
import { GoogleAuth } from "google-auth-library";

export async function sendChatMessage(
  config: AppConfig,
  spaceName: string,
  text: string
): Promise<void> {
  const auth = new GoogleAuth({
    keyFile: config.chatServiceAccountKeyFile,
    scopes: ["https://www.googleapis.com/auth/chat.bot"]
  });
  const chat = google.chat({ version: "v1", auth });
  await chat.spaces.messages.create({ parent: spaceName, requestBody: { text } });
}
```

- Убрать `refreshToken` из параметров `sendChatMessage`.
- Обновить все вызовы и тестовые моки.

## Проблема 2: spaceName в Add-on событиях

В некоторых Add-on событиях `spaceName` лежит не в `event.chat.space.name`, а в `event.chat.buttonClickedPayload.space.name`.

Нужно обновить `types.ts`:

```ts
buttonClickedPayload?: {
  isDialogEvent?: boolean;
  dialogEventType?: string;
  space?: { name?: string };
};
```

И в `sendSubmitResultToChat`:

```ts
const spaceName =
  event.chat?.space?.name ?? event.chat?.buttonClickedPayload?.space?.name;
```

Если `spaceName` не найден, отправку пропускать и логировать `submit.sendChatMessage.skipped`.

## Проблема 3: старые или отозванные OAuth refresh tokens

Drive/Calendar всё ещё используют OAuth ревьюера. Нужно корректно обрабатывать битые токены:

- `Insufficient Permission` — refresh token живой, но был выдан до добавления нужного scope.
- `invalid_grant` — пользователь отозвал доступ, но старый token остался в storage.

Желаемое поведение:

- ловить `invalid_grant` и `Insufficient Permission` при Drive/Calendar вызовах;
- инвалидировать или удалить token из storage;
- отправить пользователю OAuth-ссылку;
- после повторного OAuth пользователь повторяет `/review`.

Это отдельная задача после починки Chat delivery.

## Диагностические логи

Пока доставка в Chat отлаживается, полезно логировать финальный результат.

Рекомендация:

- local/dev: можно логировать полный `successText`;
- prod: логировать только `spaceName`, длину текста, наличие основных ссылок и результат отправки.

Пример prod-лога:

```text
[chat] ... submit.resultMessage {"spaceName":"spaces/AAA","textLength":1234,"hasCalendar":true,"remindersCount":3}
```

## Порядок реализации

1. Добавить `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` и `chatServiceAccountKeyFile`.
2. Переделать `sendChatMessage` на service account + `chat.bot`.
3. Убрать `refreshToken` из `sendChatMessage` и всех вызовов.
4. Добавить fallback для `event.chat.buttonClickedPayload.space.name`.
5. Добавить диагностический лог финального результата.
6. Обновить тесты.
7. Отдельным следующим шагом реализовать восстановление при `invalid_grant` и `Insufficient Permission`.

## Test Plan

- Chat-тест: `sendChatMessage` вызывается без `refreshToken`.
- Chat-тест: `spaceName` берётся из `event.chat.space.name`.
- Chat-тест: `spaceName` берётся из `event.chat.buttonClickedPayload.space.name`.
- Chat-тест: при отсутствии `spaceName` отправка пропускается и workflow не падает.
- Unit/chat-тесты для будущего OAuth recovery:
  - `invalid_grant` приводит к auth-required response;
  - `Insufficient Permission` приводит к auth-required response;
  - token удаляется или инвалидируется.

## Manual Check

1. Создать service account в Google Cloud.
2. Скачать JSON key.
3. Указать `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` локально или в Cloud Run.
4. Проверить, что Google Chat API включён.
5. Выполнить `/review`.
6. Проверить:
   - Drive/Calendar объекты созданы как раньше;
   - финальное сообщение появилось в Google Chat;
   - в логах есть `submit.sendChatMessage.success`.
