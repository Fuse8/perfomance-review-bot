# Docs Task Archive Structure

## Problem

`docs/roadmap.md` смешивал актуальный план и длинный список завершенных задач.
Завершенные task-файлы лежали рядом с основной документацией в `docs/archive/`,
из-за чего структура `docs/` хуже отделяла текущие задачи от истории.

## Desired Behavior

- Активные задачи остаются в `docs/tasks/`.
- Завершенные задачи хранятся в `docs/tasks/archive/`.
- Список завершенных задач ведется отдельно от roadmap.
- `docs/roadmap.md` остается коротким входом в актуальный план.

## Current Context

Обсуждение началось с идеи разделить задачи и документацию. В итоге выбран
минимальный вариант без глубокой реорганизации справочных документов: перенести
архив задач внутрь `docs/tasks/` и вынести completed-таблицу в отдельный файл.

## Plan

- Перенести `docs/archive/` в `docs/tasks/archive/`.
- Обновить ссылки на архивные task-файлы.
- Создать `docs/tasks/completed.md`.
- Убрать completed-таблицу из `docs/roadmap.md`.
- Обновить правила в `AGENTS.md`, `docs/README.md`, `docs/tasks/README.md` и `docs/adr.md`.

## Tests

- `pnpm format`
- `pnpm eslint:fix`
- `pnpm type-check`
- `pnpm test:quiet`

## Risks

- Можно оставить старые ссылки на `docs/archive/`.
- Можно потерять историю завершенных задач при сокращении roadmap.

## Result

Готово:

- Архив завершенных задач перенесен в `docs/tasks/archive/`.
- Список завершенных задач вынесен в `docs/tasks/completed.md`.
- `docs/roadmap.md` теперь содержит только актуальный план, задачи на утверждении и короткие правила обновления.
- Документационные правила синхронизированы с новой структурой.
- Проверки прошли: `pnpm format`, `pnpm eslint:fix`, `pnpm type-check`, `pnpm test:quiet`.
