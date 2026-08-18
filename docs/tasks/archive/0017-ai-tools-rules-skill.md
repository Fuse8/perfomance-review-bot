# AI Tools Workflow Adapters

Completed: 2026-07-01

## Problem

Нужно унифицировать правила работы с разными AI-инструментами, чтобы Codex, другие ассистенты и люди следовали одинаковому workflow.

## Desired Behavior

В проекте зафиксирован единый источник workflow-правил и понятная схема адаптеров для AI-инструментов. Общие проектные правила остаются в `AGENTS.md`, reusable workflows хранятся как skills в `.agents/skills`, а tool-specific adapters только ссылаются на canonical source без дублирования тела инструкций.

## Current Context

В проекте уже есть `AGENTS.md` с task workflow и `.agents/skills` с reusable workflows. Также используется Cursor, для которого нужны короткие project rule adapters в `.cursor/rules`.

## Plan

- Считать `AGENTS.md` canonical source для project workflow.
- Считать `.agents/skills/*/SKILL.md` canonical source для reusable AI workflows.
- Создать Cursor adapters в `.cursor/rules/*.mdc`, которые ссылаются на соответствующие `.agents/skills/*/SKILL.md`.
- Не создавать отдельный `ai-tools-rules` skill и не дублировать тела инструкций между инструментами.
- Проверить, что adapters короткие, ссылаются на существующие canonical files и не конфликтуют с `AGENTS.md`.

## Tests

- `AGENTS.md` остается единственным источником project workflow.
- Каждый Cursor adapter содержит только native metadata и ссылку на canonical skill.
- Cursor adapters указывают на существующие файлы в `.agents/skills`.
- Не создаются новые инструкции или adapters для инструментов, которые не используются в проекте.

## Risks

- Можно случайно создать конфликт между AGENTS.md и новым скиллом.
- Можно случайно продублировать skill body в Cursor rules и получить drift.
- Cursor rule metadata может устареть при изменении формата `.mdc`.

## Result

Workflow для AI-инструментов зафиксирован через canonical source и adapters:

- `AGENTS.md` остается источником project workflow.
- `.agents/skills/*/SKILL.md` используются как canonical reusable workflows.
- `.cursor/rules/*.mdc` добавлены как короткие Cursor adapters, которые ссылаются на canonical skills без дублирования инструкций.
- Отдельный `ai-tools-rules` skill не создавался.

Проверки перед ревью прошли: `pnpm format`, `pnpm eslint:fix`, `pnpm type-check`, `pnpm test:quiet`.
