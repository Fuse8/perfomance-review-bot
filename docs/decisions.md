# Decisions

## 2026-06-08 - Documentation structure

Decision: использовать `docs/roadmap.md` как актуальный вход в план работ, а детали хранить в отдельных файлах `docs/tasks/*.md`.

Why: один большой `PLAN.md` быстро устаревает и смешивает историю, текущий backlog и детали реализации.

Consequences:

- старый `PLAN.md` перенесен в `docs/archive/`;
- новые задачи должны ссылаться из `docs/roadmap.md`;
- завершенные задачи переносятся в `docs/archive/` с заполненным `Result`.
