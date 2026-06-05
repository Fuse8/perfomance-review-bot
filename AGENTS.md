# AGENTS.md

## Project context

Core project information, technology stack, environment configuration, and available commands can be found in: [README.md](README.md)

## Engineering rules

- Prefer small scoped changes over broad refactors.

## Change policy

- Before changing auth flow, inspect `src/oauth.ts`, `src/google-chat.ts`, `src/chat.ts`
- Before changing storage, keep `TokenStorage` contract stable
- Before changing deploy docs, treat Vercel as the primary path
- Keep local JSON mode working unless the user explicitly asks to remove it

## Testing expectations

- Use `pnpm test:quiet` for tests.
- If a test command fails, rerun the smallest relevant test or inspect the failure output before running the full suite again.