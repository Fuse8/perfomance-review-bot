# Roadmap

Актуальный рабочий план развития проекта. Детали каждой задачи лежат в `docs/tasks/`.

## Current baseline

MVP-сценарий реализован: `/review` запускает workflow Performance Review, создает Google Drive артефакты, календарную встречу и reminders, а бот отправляет итоговое сообщение в Google Chat.

Исторический MVP-план сохранен в [archive/2026-06-08-mvp-implementation-plan.md](archive/2026-06-08-mvp-implementation-plan.md).

## Planned improvements

| Priority | Status | Area | Task |
| --- | --- | --- | --- |
| P1 | Planned | Auth / Storage | [Auth storage lifecycle](tasks/auth-storage-lifecycle.md) |
| P1 | Planned | UX | [Form validation UX](tasks/form-validation-ux.md) |
| P2 | Planned | Chat UX | [Chat output format](tasks/chat-output-format.md) |
| P2 | Planned | Calendar | [Business days reminders](tasks/business-days-reminders.md) |
| P2 | Planned | TypeScript | [Google API types](tasks/google-types.md) |
| P2 | Planned | Data | [Data retention](tasks/data-retention.md) |

## Completed

| Date | Area | Task |
| --- | --- | --- |
| 2026-06-08 | Docs | [Documentation knowledge base](archive/2026-06-08-documentation-knowledge-base.md) |

## Правила обновления

- Обновлять здесь только статус, приоритет и ссылку на задачу.
- Не хранить длинные планы в roadmap.
- После завершения задачи заполнить `Result` и перенести task-файл в `archive/`.
