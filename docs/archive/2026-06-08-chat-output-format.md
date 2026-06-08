# Chat Output Format

Status: Done

## Problem

Итоговое сообщение бота нужно сделать более читабельным.

## Desired Behavior

Сообщение после `/review` должно быстро читаться: ключевые ссылки, дата встречи, forms, reminders и ошибки должны быть визуально разделены.

## Current Context

Финальные сообщения отправляются через Google Chat API. Нужно сохранить совместимость с текущим workflow и bot authentication.

## Plan

- Найти текущий формат итогового сообщения.
- Разделить вывод на логические блоки: folder, report, forms, calendar, reminders.
- Использовать формат Google Chat cards или простой markdown/text, если cards будут избыточны.
- Проверить отображение в Google Chat.

## Tests

- Итоговое сообщение содержит все ссылки.
- Сценарий без client form не показывает пустой блок.
- Ошибки отображаются понятно.

## Risks

- Google Chat formatting может отличаться от обычного markdown.
- Card payload может усложнить поддержку.

## Result

Итоговое сообщение `/review` переведено на простой текстовый шаблон:

```text
Performance Review — {fullName}

Дата ревью: {DD.MM.YYYY, HH:mm}

План:
{DD.MM} → Сбор отзывов
{DD.MM} → Проверка отзывов
{DD.MM} → Подготовка к встрече
{DD.MM} → Встреча

📁 Папка ревью
{folderUrl}

📅 Встреча
{calendarEventUrl}

📝 Форма обратной связи (fuse8)
{internalFormUrl}

📝 Форма обратной связи (клиенту)
{clientFormUrl}

📄 Отчёт
{reportUrl}
```

Если client form не нужен, блок `📝 Форма обратной связи (клиенту)` не выводится.
