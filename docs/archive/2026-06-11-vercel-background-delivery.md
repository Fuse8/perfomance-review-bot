# Vercel Background Delivery

## Problem

На проде Vercel бот иногда не отправляет вторые сообщения после события Google Chat.
Проявления:

- после установки бот отвечает `/info`, но не всегда присылает ссылку OAuth;
- после submit `/review` иногда не приходит ни сообщение “Запустил подготовку PR”,
  ни финальный результат.

## Desired Behavior

- Install event стабильно дает пользователю ссылку авторизации.
- `/review` submit стабильно отправляет сообщение о запуске.
- Финальный результат workflow стабильно доставляется в чат или явно логируется как
  ошибка доставки.
- Локальное поведение и Google Chat dialog UX остаются рабочими.

## Current Context

Логи prod показывают, что `spaceName` есть, `submit.resultDelivery.start` и
`submit.workflow.start` срабатывают, но дальше нет `sendChatMessage.success`,
`sendChatMessage.failed`, `workflow.success` или `workflow.failed`.

В коде есть fire-and-forget участки:

- `handleAddedToSpace` вызывает `void sendInstallAuthLink(...)`;
- `startReviewWorkflowFromDialog` вызывает `void sendSubmitResultToChat(...)`;
- workflow запускается через `setImmediate(...)`.

На Vercel serverless выполнение после возврата HTTP response ненадежно.

## Plan

- Найти минимальный Vercel-compatible способ выполнять background work:
  `waitUntil`/runtime API или другой явный runner.
- Для install event убрать ненадежный fire-and-forget: либо вернуть auth link в
  первом response, либо await-ить отправку второго сообщения.
- Для `/review` submit гарантировать отправку ack-сообщения до закрытия dialog.
- Для основного workflow заменить обычный `setImmediate` на надежный background
  механизм или выполнить workflow в рамках request, если это укладывается в
  ограничения Google Chat/Vercel.
- Добавить логи, по которым видно, что background task зарегистрирован и завершен.

## Tests

- Install event не завершает handler до попытки отправить auth link.
- `/review` submit не завершает handler до попытки отправить “Запустил подготовку PR”.
- Workflow запускается через выбранный background runner.
- При отсутствии `spaceName` остается понятный skip-log.
- `pnpm test:quiet`.

## Risks

- Если выполнять workflow синхронно, Google Chat может получить timeout.
- Если использовать Vercel-specific API, нужно сохранить локальный dev fallback.
- Повторный submit может создать дубли, если Google Chat ретраит запрос после timeout.

## Result

Реализовано:

- `ADDED_TO_SPACE` теперь await-ит отправку OAuth-ссылки перед ответом.
- `/review` submit теперь await-ит ack-сообщение перед закрытием dialog.
- Длинный workflow регистрируется через injectable background runner; на Vercel
  используется `@vercel/functions.waitUntil`, локально остается `setImmediate`.
- Добавлены логи `backgroundTask.registered`, `backgroundTask.success`,
  `backgroundTask.failed`.
- Deploy docs описывают Vercel background delivery, ожидаемое поведение при
  10-100 одновременных пользователях и границу, когда нужна очередь/job runner.
- Проверки: `pnpm format`, `pnpm eslint:fix`, `pnpm type-check`,
  `pnpm test:quiet`.
