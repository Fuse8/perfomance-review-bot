# ADR

2026-06-08

Заменено решением от 2026-08-18 о структуре `docs/tasks/active/` и `docs/tasks/archive/`.

- `docs/roadmap.md` = source of truth для текущего плана работ.
- Детали активных задач хранятся в `docs/tasks/`, чтобы roadmap оставался коротким.
- Завершенные задачи архивируются в `docs/tasks/archive/` с заполненным `Result`, чтобы история оставалась рядом с задачами, но не смешивалась с backlog.

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

2026-07-01

- `AGENTS.md` остается canonical source для project workflow.
- Reusable AI workflows хранятся в `.agents/skills/*/SKILL.md`.
- Tool-specific adapters, например `.cursor/rules/*.mdc`, должны быть короткими и ссылаться на canonical skill без дублирования тела инструкций.
- README должен оставаться коротким входом в проект, а справочные детали должны жить в `docs/`.
- Корневой `README.md` является единственной входной точкой документации; отдельный `docs/README.md` не нужен.

2026-08-18

- `docs/tasks/roadmap.md` является source of truth для списка активных задач.
- Активные задачи хранятся в `docs/tasks/active/`, завершенные — в `docs/tasks/archive/`.
- Задачи используют сквозной четырехзначный номер, который сохраняется при переносе в архив.
- `docs/tasks/archive/README.md` является индексом завершенных задач.
