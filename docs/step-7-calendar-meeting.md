# Step 7: Calendar Meeting

## Что сделано

- Добавлен OAuth scope для календаря:
  `https://www.googleapis.com/auth/calendar.events`
- После создания папки, PR report и форм бот создает встречу в Google Calendar.
- В форму `/review` добавлено обязательное поле времени: `HH:mm`.
- Встреча создается в timezone `Asia/Yekaterinburg`.
- Длительность встречи: 2.5 часа.
- Участники встречи: ревьюер и сотрудник.
- Description встречи содержит ссылки:
  - папка ревью;
  - PR report;
  - internal feedback form;
  - client feedback form, если нужна;
  - previous review, если найдено.
- Итоговое сообщение в Google Chat содержит summary и ссылку на Calendar event.

## Что нужно настроить в Google Cloud

1. Включить **Google Calendar API**:
   `APIs & Services` -> `Library` -> `Google Calendar API` -> `Enable`.
2. Добавить scope в OAuth consent screen:
   `OAuth consent screen` -> `Data Access` -> `Add or remove scopes`.
3. Выбрать scope:
   `.../auth/calendar.events`
4. Сохранить изменения.

## Переавторизация

После добавления нового scope старые refresh tokens не получают доступ к календарю автоматически.

Если ошибка:

- `Insufficient Permission` - токен старый, без Calendar scope.
- `invalid_grant` - доступ был отозван в Google, но старый токен остался в storage бота.

Что сделать:

1. Удалить старый токен ревьюера из storage бота:
   - local storage: удалить запись пользователя из `.data/storage.json` в `tokens`;
   - Firestore: удалить документ пользователя из коллекции `reviewer_tokens`.
2. Повторить `/review`.
3. Бот должен запросить OAuth заново.

Если OAuth не появился, открыть вручную:

```text
https://<APP_BASE_URL>/auth/google/start?chatUserId=<chat_user_id>
```

## Проверка

- `pnpm test` проходит: `27/27`.
- Проверено вручную: Calendar API возвращает успешное создание event.
