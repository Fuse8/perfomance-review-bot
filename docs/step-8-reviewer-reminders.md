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
