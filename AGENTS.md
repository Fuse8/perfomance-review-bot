# AGENTS.md

## Project context

Core project information, technology stack, environment configuration, and available commands can be found in: [README.md](README.md)

## Engineering rules

- Prefer small scoped changes over broad refactors.
- Do not create a new git branch during development; work in the current branch.
- Do not commit real Google Drive, Docs, Forms, Calendar, or other external
  resource IDs into code, env examples, or docs; use placeholders instead.
- When starting a task, first create an explicit plan and wait for user approval before implementation.
- After all requested work is done and verified, ask the user before staging files. Create a git commit only after the user confirms, except when the task is already in review and the user says the task is ready.

## Task workflow

- Create new task files in `docs/tasks/active/` with the next available four-digit numeric prefix.
- Add every active task to `docs/tasks/roadmap.md`.
- New task files should include `Created: YYYY-MM-DD` and the sections `Цель`, `Что должно работать`, `Техническая реализация`, `Верификация`, and `Результат`.
- After finishing implementation, wait for user review. If review requests changes, implement them without archiving or committing the task.
- Do not move a task to the archive until the user explicitly says that the task is ready.
- When the user says that the task is ready, move it from `docs/tasks/active/` to `docs/tasks/archive/`, add `Completed: YYYY-MM-DD`, fill `Результат`, append its link to `docs/tasks/archive/README.md`, and remove it from `docs/tasks/roadmap.md`.
- After the user says that the task is ready, stage only files belonging to the task and create a Conventional Commit with the task number immediately after the type, for example `docs: 0030 organize task workflow`.
- When archiving a task, update `docs/adr.md` if the task introduced a durable technical or product decision.

## Change policy

- Before changing auth flow, inspect `src/oauth.ts`, `src/google-chat.ts`, `src/chat.ts`
- Before changing storage, keep `TokenStorage` contract stable
- Before changing deploy docs, treat Vercel as the primary path
- Keep local JSON mode working unless the user explicitly asks to remove it

## Testing expectations

- Use `pnpm test:quiet` for tests.
- If a test command fails, rerun the smallest relevant test or inspect the failure output before running the full suite again.
- After changes, run `pnpm format`, `pnpm eslint:fix`, then verify with `pnpm type-check`, `pnpm test:quiet`.
- If the user says the task is done after a fresh successful verification, do not rerun formatting, linting, type-check, or tests just for archival or commit steps.
