# Feedback Form Templates Shared Folder

Completed: 2026-06-09

## Problem

Шаблоны форм отзывов определены, но их нужно перенести в общую папку и
зафиксировать как источник для workflow.

## Desired Behavior

- Internal/fuse8 form создается из template
  `1lgdN4oL5oqkaLXYJbC0I6nVhsKH6rHNPfoRVU8cp_6w`.
- Client form создается из template
  `1y034hq830IB1DBrulh9tKNRegGaJEnlI0nkNzl7B3nE`.
- Оба шаблона лежат в общей папке с доступом, достаточным для копирования.
- `src/config.ts` и docs содержат актуальные template IDs.

## Current Context

Form template IDs должны быть частью config, так как это не секреты и
не per-environment настройки. Перед кодовыми изменениями нужно вручную
проверить доступы к исходным Google Forms.

## Plan

- Перенести оба Google Forms template в общую папку.
- Проверить, что аккаунт ревьюера может копировать оба шаблона.
- Убрать form template IDs из env.
- Добавить form template IDs в config.
- Обновить документацию с финальными IDs.
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

Form template IDs перенесены из env в `src/config.ts`.
`.env.example` больше не содержит `INTERNAL_REVIEW_FORM_TEMPLATE_ID` и
`CLIENT_REVIEW_FORM_TEMPLATE_ID`. Документация фиксирует встроенные template IDs
и требование хранить оба Google Forms template в общей папке с доступом для
копирования.
