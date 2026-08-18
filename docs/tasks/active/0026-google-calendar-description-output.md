# Google Calendar Description Output

Created: 2026-06-09

## Problem

Нужно поменять описание в Google Calendar для встречи и заметок/reminders,
которые создаются workflow Performance Review.

## Desired Behavior

- Описание календарной встречи выводится в новом формате.
- Описание календарных заметок/reminders выводится в новом формате.
- Даты, время и ссылки остаются корректными.

## Current Context

Точный текст и формат будут добавлены позже. Перед реализацией нужно найти
формирование Google Calendar event description и reminder descriptions.

## Plan

- Найти создание календарной встречи.
- Найти создание calendar reminders/notes.
- Найти функцию, которая собирает description для Calendar API.
- После уточнения текста заменить описание встречи и reminders.
- Сохранить текущую timezone-логику и ссылки на созданные артефакты.

## Tests

- Calendar event получает описание в новом формате.
- Calendar reminders/notes получают описание в новом формате.
- Ссылки на папку, отчет и формы сохраняются.
- Timezone и дата/время события не меняются.

## Risks

- Можно случайно изменить timezone или длительность события.
- Один description helper может использоваться и для встречи, и для reminders.
- Точный формат пока не финализирован.

## Result

Заполнить после реализации.
