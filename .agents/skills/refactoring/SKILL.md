---
name: refactoring
description: Use when the user asks for refactoring, cleanup, improving readability, improving code practices, or says "refactor". First investigate without editing and produce a plan. Preserve business logic and behavior. Implement only after the user explicitly asks.
---

# Refactoring

Use this skill for safe refactoring focused on readability, structure, naming, boundaries, and code practices.

## Rules

- Start with non-mutating investigation.
- Do not edit files before understanding current behavior and dependencies.
- Do not change business logic or user-visible behavior.
- Prefer small scoped refactors over broad rewrites.
- Keep public APIs, data contracts, storage contracts, and auth flows stable unless the user explicitly asks otherwise.
- Separate refactoring from feature changes and bug fixes.
- If behavior change seems necessary, stop and call it out before planning implementation.
- Implement only after the user explicitly asks to apply the plan.

## Workflow

1. Inspect relevant files, tests, types, and current call flow.
2. Identify current behavior that must be preserved.
3. Find concrete refactoring opportunities:
   - duplicated logic
   - unclear naming
   - oversized functions
   - mixed responsibilities
   - weak boundaries
   - brittle tests
4. Prioritize the smallest useful changes.
5. Produce a short plan before any edits.
6. Include verification steps that prove behavior stayed the same.
7. If the user asks to implement, follow the approved plan and verify behavior did not change.

## Response Format

For planning:

```md
Current behavior to preserve:

- ...

Refactoring targets:

- ...

Plan:

- ...

Verification:

- ...
```

Keep the plan concrete and scoped.
