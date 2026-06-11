# AGENTS.md

## Project context

Core project information, technology stack, environment configuration, and available commands can be found in: [README.md](README.md)

## Engineering rules

- Prefer small scoped changes over broad refactors.
- Do not create a new git branch during development; work in the current branch.
- Do not commit real Google Drive, Docs, Forms, Calendar, or other external
  resource IDs into code, env examples, or docs; use placeholders instead.
- When starting a task, first create an explicit plan and wait for user approval before implementation.
- After all requested work is done and verified, ask the user before staging files. Create a git commit only after the user confirms.

## Task workflow

- Active tasks live in `docs/tasks/` and must be linked from `docs/roadmap.md`.
- Task files should include Problem, Desired Behavior, Current Context, Plan, Tests, Risks, and Result.
- Keep `docs/roadmap.md` short: active task links in Planned improvements, completed task links in Completed.
- After finishing a task, wait for user review. If review requests changes, implement them.
- If the user says the task is done, fill `Result`, move the task document to `docs/archive/`, remove it from Planned improvements, and add it to Completed.
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
