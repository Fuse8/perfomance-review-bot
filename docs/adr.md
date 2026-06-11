# ADR

2026-06-08

- `docs/roadmap.md` = source of truth для текущего плана работ.
- Детали активных задач хранятся в `docs/tasks/`, чтобы roadmap оставался коротким.
- Завершенные задачи архивируются в `docs/archive/` с заполненным `Result`, чтобы история не смешивалась с backlog.

2026-06-09

- Internal feedback form: `emailCollectionType: VERIFIED` и доступ только для доменов `employeeEmailDomains`.
- Client feedback form: `emailCollectionType: DO_NOT_COLLECT` и публичный доступ `anyone`/`reader`/`published`.
- `description` форм не меняется workflow, чтобы шаблонный текст оставался управляемым в Google Forms.

2026-06-10

- Reviewer settings хранятся отдельно от `TokenStorage`.
- `/settings` задает root folder ID и параметры задач для конкретного ревьюера.
- `REVIEWS_ROOT_FOLDER_ID` не используется как runtime fallback, потому что root folder теперь пользовательская настройка.

2026-06-11

- Vercel background jobs запускаются через `waitUntil()`, локально используется fallback на `setImmediate`.
- Не использовать `void promise` для важных операций после HTTP response, потому что serverless runtime может остановить выполнение.
- Slash commands должны гарантировать первый важный ответ пользователю до завершения handler.
