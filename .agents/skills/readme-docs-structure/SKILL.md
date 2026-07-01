---
name: readme-docs-structure
description: Use when creating, reviewing, or refactoring README.md or docs/*.md project documentation.
---

# README Docs Structure

Goal: README gives a new developer the first 5 minutes; detailed reference lives in `docs/`.

## Rules

- Keep README short; do not make it a handbook.
- Keep one source of truth; avoid duplicated instructions.
- Use one language consistently across all project documentation.
- In Russian docs, prefer infinitive wording: `скопировать`, not `скопируйте`.
- Use one style for commands, paths, tools, and package names.
- Keep docs consistent in voice and detail level, as if written by one person.
- Do not expose real external URLs, DSNs, tokens, credentials, or secrets. Localhost URLs and obvious placeholders (e.g. `https://api.example.com`) are allowed.
- Prefer package scripts over raw underlying commands.

## Workflow

1. Read README, AGENTS, and current docs.
2. Check available command sources (package scripts, Makefile, etc.) and identify required env files. Do not read secret values from `.env*` files.
3. Keep first-5-minutes content in README; move reference details to `docs/`.
4. Update README and documentation using the required structure.
5. Verify links, language, style, env setup, deployment docs, and security.

## Required README

- Project name and short product description.
- Requirements: runtime and package manager versions.
- Quick Start: env setup (if needed), install, run.
- Stack.
- Main Commands.
- Documentation links (when applicable):
  - Architecture: required for applications and services; optional for small libraries.
  - Deployment: required when the project is deployed.
  - Testing: required when the project has tests.
  - Conventions / code style: optional.
  - Other useful docs: optional.

## Docs Split

Typical candidates (create only those that apply):

- Architecture → `docs/architecture.md`
- Deployment → `docs/deployment.md`
- Development / environment setup → `docs/development.md`
- Local Docker → `docs/docker-local.md`
- Conventions → `docs/conventions.md`
- Testing → `docs/testing.md`
- Storybook → `docs/storybook.md` (frontend)
- i18n → `docs/i18n.md` (frontend)

Deployment documentation should answer:

- Where deployment happens.
- How deployment works.
- How environment variables are managed.

## Checklist

Verify that:

- README contains all required sections.
- Applicable documentation links are present.
- Commands match the project and prefer package scripts when available.
- Environment setup is documented when required for local development.
- Deployment documentation explains where deployment happens, how it works, and how environment variables are managed.
- Relative links resolve.
- Each document has a single clear responsibility.
- Russian documentation uses infinitive wording.
- Documentation follows one consistent language, style, and command format.
- No duplicated content, broken links, secrets, credentials, or unnecessary filler remain.
