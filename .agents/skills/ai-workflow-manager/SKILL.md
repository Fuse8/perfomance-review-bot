---
name: ai-workflow-manager
description: Use when creating, editing, installing, moving, reviewing, auditing, or syncing any AI skill, agent rule, workflow file, adapter, assistant instruction, AGENTS.md, CLAUDE.md, .agents, .claude, .cursor, or .codex workflow across coding assistants.
---

# AI Workflow Manager

Manage project AI workflows with one canonical source and adapters for other tools.

## Rules

- Before creating or editing any AI skill or workflow file, inspect existing assistant workflow locations and detect the project primary tool.
- Use one primary AI tool per project.
- The primary tool owns the canonical workflow source.
- Secondary tools use adapters that point to the canonical source.
- Never duplicate full workflow bodies between tools.
- Keep adapters short: after native metadata, use only `Read and follow \`path/to/canonical/SKILL.md\`.`
- Create native workflow files only for tools used in the project or explicitly requested.
- Detect workflow files using current tool conventions, not fixed file names.
- Report one project-level primary tool. If evidence differs, report the ambiguity instead of multiple primary tools.
- Report workflow paths relative to the repository root, not as absolute machine-local paths.

## Mandatory Skill/Workflow Changes

Before creating or editing any skill, agent rule, workflow file, adapter, or assistant instruction:

1. Inspect existing workflow locations, including `.claude`, `.agents`, `.cursor`, `.codex`, `AGENTS.md`, and tool-specific rule folders when present.
2. Detect the primary tool and canonical source.
3. Put full workflow bodies only in the canonical source.
4. For other active tools, create or update short adapters that point to the canonical source.
5. Report the canonical file and adapters changed.

## Detect Primary Tool

1. Inspect AI workflow files.
2. Infer the primary tool from:
   - where complete workflows live;
   - which workflows are actively maintained;
   - where adapters point;
   - project conventions.
3. Assign confidence:
   - high — proceed and report the detected primary tool;
   - medium — perform read-only analysis; ask before structural changes;
   - low or conflicting — ask the user to confirm or specify the primary tool.

## Canonical Source Selection

When multiple candidates exist:

1. Prefer the primary tool's native convention.
2. Prefer actively maintained workflows.
3. Prefer broader workflow coverage.
4. Prefer locations already referenced by adapters.
5. If still ambiguous, ask the user.

## Audit

- Detect workflow locations.
- Classify each as canonical source, adapter, or unclear.
- Find duplicated workflows.
- Find broken or circular adapters.
- Find conflicting descriptions, triggers, or stale paths.
- Recommend fixes that preserve a single canonical source.

## Report Format

Include:

- primary tool, confidence, and evidence;
- canonical source;
- adapters;
- issues found;
- recommended fix plan.

Keep reports short, path-specific, use repository-relative paths, and omit empty sections.

## Setup Adapter

1. Confirm the primary tool and canonical source.
2. Confirm the target tool.
3. Create a tool-native adapter that:
   - contains only trigger, description, or globs;
   - points to the canonical source with `Read and follow \`path/to/canonical/SKILL.md\`.`;
   - never duplicates the workflow.

## Sync Workflows

1. Detect workflow changes.
2. Warn if the change bypasses the canonical source.
3. Update adapters for secondary tools.
4. Ensure adapters reference the canonical workflow without duplication.
