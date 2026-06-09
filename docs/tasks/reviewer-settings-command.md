# Reviewer Settings Command

## Problem

Часть настроек workflow сейчас задается глобально через env, но ревьюерам нужны
свои folder ID и параметры создания задач.

## Desired Behavior

- Команда `/settings` позволяет настроить параметры текущего ревьюера.
- Хранятся root folder ID, дни до задач и время задач.
- `/review` использует настройки ревьюера, а если их нет — env/default config.
- Контракт `TokenStorage` остается стабильным.

## Current Context

OAuth tokens уже хранятся по пользователю. Reminder settings сейчас приходят из
config, а `REVIEWS_ROOT_FOLDER_ID` глобальный.

## Plan

- Спроектировать отдельное хранение reviewer settings рядом с token storage.
- Добавить Google Chat команду `/settings` и dialog для редактирования.
- Валидировать folder ID и числовые параметры reminders.
- В `/review` объединять reviewer settings с env/default config.
- Обновить документацию по командам.

## Tests

- `pnpm test:quiet`
- `/settings` сохраняет и показывает настройки текущего ревьюера.
- `/review` использует reviewer root folder ID при наличии настройки.
- При отсутствии настроек сохраняется текущее поведение.
- `TokenStorage` API не меняется несовместимо.

## Risks

- Можно смешать настройки разных ревьюеров.
- Неверный folder ID может ломать создание review artifacts.
- Нужно аккуратно мигрировать storage без потери OAuth tokens.

## Result

Заполнить после реализации.
