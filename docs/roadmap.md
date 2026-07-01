# Roadmap

Актуальный рабочий план развития проекта. Детали каждой задачи лежат в `docs/tasks/`.
Завершенные задачи вынесены в [tasks/completed.md](tasks/completed.md).

## Current baseline

MVP-сценарий реализован: `/review` запускает workflow Performance Review, создает Google Drive артефакты, календарную встречу и reminders, а бот отправляет итоговое сообщение в Google Chat.

Исторический MVP-план сохранен в [tasks/archive/2026-06-08-mvp-implementation-plan.md](tasks/archive/2026-06-08-mvp-implementation-plan.md).

## Planned improvements

| Priority | Area           | Task                                                                |
| -------- | -------------- | ------------------------------------------------------------------- |
| P1       | Auth / Storage | [Auth storage lifecycle](tasks/auth-storage-lifecycle.md)           |
| P1       | Drive          | [Reviewer Drive folder link](tasks/reviewer-drive-folder-link.md)   |
| P1       | Drive          | [Employee folder auto create](tasks/employee-folder-auto-create.md) |
| P2       | Chat UX        | [Intuitive bot instructions](tasks/intuitive-bot-instructions.md)   |
| P2       | Chat UX        | [Chat output format](tasks/chat-output-format.md)                   |
| P2       | Code Quality   | [Codebase refactoring](tasks/codebase-refactoring.md)               |
| P2       | TypeScript     | [Google API types](tasks/google-types.md)                           |
| P2       | Data           | [Data retention](tasks/data-retention.md)                           |

## На утверждении

| Date       | Area  | Task                                                                | Branch                              | Status                                 |
| ---------- | ----- | ------------------------------------------------------------------- | ----------------------------------- | -------------------------------------- |
| 2026-06-10 | Forms | [Forms response spreadsheets](tasks/forms-response-spreadsheets.md) | `codex/forms-response-spreadsheets` | Сделано, зафиксировано, ожидает merge. |

## Правила обновления

- Обновлять здесь только приоритет и ссылку на задачу.
- Не хранить длинные планы в roadmap.
- После завершения задачи заполнить `Result`, перенести task-файл в `tasks/archive/` и добавить ссылку в `tasks/completed.md`.
