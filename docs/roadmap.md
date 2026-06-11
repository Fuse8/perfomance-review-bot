# Roadmap

Актуальный рабочий план развития проекта. Детали каждой задачи лежат в `docs/tasks/`.

## Current baseline

MVP-сценарий реализован: `/review` запускает workflow Performance Review, создает Google Drive артефакты, календарную встречу и reminders, а бот отправляет итоговое сообщение в Google Chat.

Исторический MVP-план сохранен в [archive/2026-06-08-mvp-implementation-plan.md](archive/2026-06-08-mvp-implementation-plan.md).

## Planned improvements

| Priority | Area           | Task                                                        |
| -------- | -------------- | ----------------------------------------------------------- |
| P1       | Auth / Storage | [Auth storage lifecycle](tasks/auth-storage-lifecycle.md)   |
| P2       | Chat UX        | [Chat output format](tasks/chat-output-format.md)           |
| P2       | Calendar       | [Business days reminders](tasks/business-days-reminders.md) |
| P2       | TypeScript     | [Google API types](tasks/google-types.md)                   |
| P2       | Data           | [Data retention](tasks/data-retention.md)                   |

## На утверждении

| Date       | Area  | Task                                                                | Branch                              | Status                                 |
| ---------- | ----- | ------------------------------------------------------------------- | ----------------------------------- | -------------------------------------- |
| 2026-06-10 | Forms | [Forms response spreadsheets](tasks/forms-response-spreadsheets.md) | `codex/forms-response-spreadsheets` | Сделано, зафиксировано, ожидает merge. |

## Completed

| Date       | Area     | Task                                                                                                        |
| ---------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| 2026-06-08 | Docs     | [Documentation knowledge base](archive/2026-06-08-documentation-knowledge-base.md)                          |
| 2026-06-08 | Tooling  | [ESLint, Prettier, EditorConfig, Tsconfig](archive/2026-06-08-tooling-eslint-prettier-tsconfig.md)          |
| 2026-06-08 | UX       | [Form validation UX](archive/2026-06-08-form-validation-ux.md)                                              |
| 2026-06-09 | Forms    | [Feedback form templates shared folder](archive/2026-06-09-feedback-form-templates-shared-folder.md)        |
| 2026-06-09 | Forms    | [Separate internal and client form access](archive/2026-06-09-client-form-public-access-template-values.md) |
| 2026-06-10 | Forms    | [Feedback form template env vars](archive/2026-06-10-feedback-form-template-env-vars.md)                    |
| 2026-06-10 | Drive    | [Previous review header prefill](archive/2026-06-10-previous-review-header-prefill.md)                      |
| 2026-06-10 | Drive    | [Review report template reviewer name](archive/2026-06-10-review-report-template-reviewer-name.md)          |
| 2026-06-10 | Settings | [Reviewer settings command](archive/2026-06-10-reviewer-settings-command.md)                                |
| 2026-06-11 | Runtime  | [Vercel background delivery](archive/2026-06-11-vercel-background-delivery.md)                              |
| 2026-06-11 | Chat UX  | [Review status command](archive/2026-06-11-review-status-command.md)                                        |
| 2026-06-11 | Docs     | [Development workflow document](archive/2026-06-11-development-workflow-document.md)                        |

## Правила обновления

- Обновлять здесь только приоритет и ссылку на задачу.
- Не хранить длинные планы в roadmap.
- После завершения задачи заполнить `Result` и перенести task-файл в `archive/`.
