# TODO: надёжная доставка результата /review в Google Chat

## Проблема

Google Chat Add-on имеет HTTP-таймаут ~8–9 секунд для интерактивных событий.
Drive-операции при создании папки ревью занимают ~8 секунд (6 последовательных
API-вызовов). Сейчас результат возвращается синхронно через `addOnTextResponse`,
что работает в большинстве случаев, но иногда обрывается по таймауту.

Дополнительно: `sendSubmitResultToChat` использует OAuth-токен ревьюера, у которого
нет scope `chat.messages`, поэтому доставка через Chat API тоже не работает.

## Правильное решение

### 1. Сервисный аккаунт для Chat API

Создать сервисный аккаунт в Google Cloud и использовать его credentials для
отправки сообщений от имени бота, а не токен ревьюера.

```env
# .env.local / .env
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=.data/service-account.json
```

В `config.ts` добавить:
```ts
chatServiceAccountKeyFile?: string;
```

В `google-chat.ts` заменить auth:
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

### 2. Асинхронный fire-and-forget

После получения сервисного аккаунта:

- В Add-on dialog submit (`isDialogSubmit && event.commonEventObject`) отвечать
  немедленно: `addOnTextResponse("Создаю папку ревью, ссылка появится в этом чате...")`
- Запускать `runDriveAndNotify(...)` в фоне (без `await`)
- `runDriveAndNotify` после завершения вызывает `sendChatMessage` через сервисный аккаунт

### 3. spaceName для Send

В Add-on событии `spaceName` находится в `event.chat.buttonClickedPayload.space.name`
(не в `event.chat.space.name`). Нужно добавить в `types.ts`:

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

## Что сделать

1. Создать сервисный аккаунт в Google Cloud Console → скачать JSON-ключ
2. Добавить `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` в `.env.local` / Cloud Run
3. Обновить `config.ts`, `google-chat.ts` (убрать `refreshToken` из параметров)
4. Обновить `types.ts` (добавить `space` в `buttonClickedPayload`)
5. Добавить `runDriveAndNotify` и async-форк в `handleReviewSubmit`
6. Обновить тесты в `chat.test.ts` — мок `sendChatMessage` больше не принимает `refreshToken`
