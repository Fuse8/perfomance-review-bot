# Feedback Form Templates Shared Folder

## Problem

Шаблоны форм отзывов определены, но их нужно перенести в общую папку и
зафиксировать как источник для workflow.

## Desired Behavior

- Internal/fuse8 form создается из template
  `1lgdN4oL5oqkaLXYJbC0I6nVhsKH6rHNPfoRVU8cp_6w`.
- Client form создается из template
  `1y034hq830IB1DBrulh9tKNRegGaJEnlI0nkNzl7B3nE`.
- Оба шаблона лежат в общей папке с доступом, достаточным для копирования.
- `.env.example` и docs содержат актуальные template IDs.

## Current Context

В проекте уже есть `INTERNAL_REVIEW_FORM_TEMPLATE_ID` и
`CLIENT_REVIEW_FORM_TEMPLATE_ID`. Перед кодовыми изменениями нужно вручную
проверить доступы к исходным Google Forms.

## Plan

- Перенести оба Google Forms template в общую папку.
- Проверить, что аккаунт ревьюера может копировать оба шаблона.
- Обновить `.env.example` и документацию с финальными IDs.
- Проверить, что workflow использует правильный template для каждой формы.

## Tests

- `pnpm test:quiet`
- Internal form копируется из fuse8 template.
- Client form копируется из client template.
- Ошибка доступа к шаблону явно показывает, какой template недоступен.

## Risks

- Если шаблоны останутся в личной папке, workflow будет падать по access denied.
- Можно перепутать internal и client template IDs.

## Result

Заполнить после реализации.
