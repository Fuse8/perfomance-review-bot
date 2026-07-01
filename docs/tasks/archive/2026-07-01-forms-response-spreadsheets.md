# Forms Response Spreadsheets

## Problem

Ответы Google Forms сейчас можно смотреть в Forms UI, но workflow должен
создавать и привязывать отдельные Google Sheets для обеих форм.

## Desired Behavior

- Для internal form создается или привязывается Google Sheets с ответами.
- Для client form создается или привязывается Google Sheets с ответами.
- Таблицы лежат в папке текущего review рядом с формами.
- Ссылки на таблицы доступны в результате создания Drive artifacts и, при
  необходимости, в итоговом сообщении бота.

## Current Context

Workflow уже копирует Google Forms в review folder. Нужно проверить доступный
API для создания response destination и перенос/создание spreadsheet в нужной
папке.

## Plan

- Исследовать Forms API для привязки response destination к Google Sheets.
- Создавать отдельные spreadsheets для internal и client forms.
- Размещать spreadsheets в review folder.
- Возвращать spreadsheet metadata из Drive creation flow.
- Добавить ссылки в итоговый вывод, если это не перегружает сообщение.

## Tests

- `pnpm test:quiet`
- Для internal form создается response spreadsheet.
- Для client form создается response spreadsheet.
- Spreadsheet files оказываются в папке текущего review.
- Workflow корректно работает, если client form не создается.

## Risks

- Forms API может иметь ограничения на создание response destination.
- Может потребоваться дополнительный OAuth scope.
- Итоговое сообщение можно перегрузить лишними ссылками.

## Result

Решили не реализовывать задачу. Для привязки response spreadsheets к Google Forms
недостаточно текущего набора API: потребовалось бы подключать Google Apps Script,
а также добавлять Google Sheets API. Для простой пользовательской фичи это
слишком большой рост интеграционной сложности и набора разрешений.
