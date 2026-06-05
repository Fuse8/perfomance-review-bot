---
name: debug
description: Use when the user asks to debug, investigate an error, find a root cause, or says "debug". First investigate without editing and produce a short fix plan. Implement only after the user explicitly asks.
---

# Debug

Use this skill for root-cause investigation and safe bug fixing.

## Rules

- Start with non-mutating investigation.
- Do not edit files or apply patches during the investigation phase.
- First find the failing boundary.
- Identify the root cause from evidence; if evidence is incomplete, say what is missing.
- Produce a short fix plan before implementation.
- Implement only after the user explicitly asks to apply the plan.
- When implementing, make the smallest fix that addresses the root cause.

## Workflow

1. Read the error/logs carefully.
2. Inspect the smallest relevant code path.
3. Trace the data flow across boundaries.
4. Compare expected behavior with actual behavior.
5. State the root cause or the strongest evidence-backed hypothesis.
6. Provide a minimal fix plan.
7. Include verification steps.
8. If the user asks to implement, follow the approved plan and verify.

## Response Format

For investigation:

```md
Root cause:
- ...

Evidence:
- ...

Fix plan:
- ...

Verification:
- ...
```

Keep the answer short and concrete.
