# Step 8: Reviewer Tasks / Reminders

## Что сделано

- После успешного создания основной PR-встречи бот создает 3 отдельных Google Calendar event в календаре ревьюера:
  - `Запустить сбор отзывов для PR {Имя Фамилия}`;
  - `Проверить отзывы для PR {Имя Фамилия}`;
  - `Подготовиться к проведению PR {Имя Фамилия}`.
- Reminder'ы создаются в primary calendar ревьюера.
- Используется timezone `Asia/Yekaterinburg`.
- Время старта по умолчанию: `12:00`.
- Длительность каждого reminder'а: 30 минут.
- Даты считаются назад от `reviewDate` по рабочим дням.
- Суббота и воскресенье пропускаются. Праздники не учитываются.
- Description reminder'ов содержит ссылки:
  - папка ревью;
  - PR report;
  - internal feedback form;
  - client feedback form, если нужна;
  - previous review, если найдено.
- Итоговое сообщение в Google Chat содержит блок `Reminders:` со списком созданных событий:
  - название;
  - дата и время;
  - ссылка на Calendar event.

## Env-настройки

Добавлены настройки с дефолтами:

```text
TASK_COLLECT_DAYS_BEFORE=14
TASK_CHECK_DAYS_BEFORE=7
TASK_PREPARE_DAYS_BEFORE=3
TASK_REMINDER_TIME=12:00
```

Если переменные не указаны, используются эти значения.

## OAuth

Новый OAuth scope не нужен.

Используется уже добавленный scope:

```text
https://www.googleapis.com/auth/calendar.events
```

## Проверка

После `/review` проверить в календаре ревьюера:

- создана основная PR-встреча;
- созданы 3 отдельных reminder-события;
- все reminder'ы стоят в `Asia/Yekaterinburg`;
- время `12:00-12:30`, если `TASK_REMINDER_TIME` не переопределен;
- даты reminder'ов не попали на субботу или воскресенье;
- description содержит ссылки на созданные материалы;
- финальное сообщение в Google Chat содержит блок `Reminders:` и ссылки на все 3 события.

## Автотесты

- Проверен расчет рабочих дней назад: `14/7/3` рабочих дня и переход через выходные.
- Проверено создание 3 Calendar events:
  - summary;
  - timezone;
  - start time;
  - duration;
  - description со ссылками.
- Проверен Chat flow: после `/review` создаются reminder'ы, а итоговое сообщение содержит все 3 события.
- `pnpm test` проходит: `30/30`.


## Plan

# План: асинхронная доставка результата `/review` без очередей

## Summary

Делаем простой in-process async: HTTP handler Google Chat быстро отвечает “запустил подготовку”, а Drive/Calendar workflow продолжает выполняться в фоне. Финальный результат и ошибки отправляются отдельным сообщением в Chat от имени бота через service account. Очереди/Cloud Tasks/PubSub не добавляем.

Ограничение: это best-effort. Если Cloud Run instance умрёт во время фоновой задачи, job может потеряться. Для текущего этапа это принимаем.

## Key Changes

- Разделить авторизацию:
  - OAuth ревьюера оставить для Drive/Docs/Calendar/People.
  - Google Chat delivery перевести на app auth/service account со scope `https://www.googleapis.com/auth/chat.bot`.
  - Убрать `https://www.googleapis.com/auth/chat.messages.create` из OAuth scopes ревьюера.

- Переделать `sendChatMessage`:
  - сигнатура: `sendChatMessage(config, spaceName, text)`.
  - без `refreshToken`.
  - auth через `GoogleAuth`.
  - В Cloud Run использовать attached service account / ADC.
  - `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` поддержать только как optional local fallback.

- Переделать submit flow:
  - На submit выполнить только быстрые проверки: form validation, config validation, наличие OAuth token.
  - Сразу вернуть в Chat dialog status: “Запустил подготовку PR. Результат пришлю сюда.”
  - После ответа запустить `void runReviewWorkflow(...)`.
  - В фоне выполнить текущую цепочку: поиск предыдущего ревью, создание Drive-артефактов, встреча, reminder-события, финальный текст.
  - Финальный текст отправить через `sendSubmitResultToChat`.

- Обработка “предыдущее ревью не найдено”:
  - В рамках этого упрощения оставить текущую confirmation-ветку синхронной, если она уже срабатывает до создания артефактов.
  - После подтверждения “продолжить без предыдущего ревью” запускать уже фоновый workflow.
  - То есть UX подтверждения не меняем, асинхронным становится тяжёлое создание Drive/Calendar и финальная доставка.

- `spaceName`:
  - брать из `event.chat.space.name`.
  - fallback: `event.chat.buttonClickedPayload.space.name`.
  - если не найден, workflow не падать, логировать `submit.sendChatMessage.skipped`.

- Диагностика:
  - логировать старт background workflow, success/failure Chat delivery.
  - prod-лог без полного текста: `spaceName`, `textLength`, наличие ссылок, count reminders.
  - ошибки Drive/Calendar отправлять пользователю отдельным Chat message.

## Test Plan

- Unit/chat:
  - submit сразу возвращает “запустил”, не ждёт `createReviewFolder/createCalendarEvent`.
  - background workflow вызывает Drive/Calendar deps и затем `sendChatMessage`.
  - `sendChatMessage` вызывается без `refreshToken`.
  - `spaceName` берётся из `event.chat.space.name`.
  - fallback на `event.chat.buttonClickedPayload.space.name`.
  - при отсутствии `spaceName` отправка пропускается без падения.
  - ошибка Drive/Calendar в фоне отправляет user-facing error message.

- Unit/google-chat:
  - `sendChatMessage` строит Chat client через `GoogleAuth`.
  - optional `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` прокидывается только если задан.

- Regression:
  - `pnpm test`.

## Assumptions

- Очереди сознательно не добавляем.
- Потеря фоновой задачи при рестарте instance допустима на этом этапе.
- Confirmation для отсутствующего предыдущего ревью остаётся текущей, чтобы не усложнять UX.
- Cloud Run service account будет иметь право вызывать Google Chat API с `chat.bot`, а Chat app будет добавлен в нужный space.
