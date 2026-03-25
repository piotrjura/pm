# Agent-Friendly Error Recovery & Superpowers Integration

**Date:** 2026-03-25
**Status:** Reviewed (v2 — addressed spec review findings)
**Scope:** pm CLI changes only (no superpowers plugin modifications)

## Problem

pm's hook system blocks agent edits and rejects `done` commands when scope rules are violated, but the error messages are instructional rather than actionable. Agents get stuck, loop, or fail instead of recovering.

### Pain Points

1. **Pre-edit block with no recovery path** — agent tries to edit, pm says "log work first" with generic instructions, agent doesn't know what command to run
2. **Scope violation at `done` time** — superpowers task legitimately touches 4+ files, `pm done` rejects, agent is stuck with no clear next step
3. **Decisions not surfaced** — agents skip `pm why` even when prior decisions are relevant to their brainstorming/planning

### Non-Problem: Subagent Identity

Subagents dispatched by superpowers share the parent's Claude Code process, so `$PPID` resolves identically. With `--agent claude-code` in the hook config, subagents see the parent's active work via `matchesIdentity`. Subagents are only blocked when there's genuinely no active work — which is addressed by Change 1 (smarter pre-edit errors).

### Design Principle

**Guide, don't auto-act.** Every error message includes ready-to-run commands with correct identity flags and inferred context. The agent runs the commands — pm never auto-creates work items or auto-completes tasks.

---

## Change 1: Smart Pre-Edit Errors

**Files:** `src/commands/hook.ts`, `src/lib/hooks.ts`

### Current Behavior

`handlePreEdit` blocks with:
```
No active task in pm. Log work before editing code.

Quick fix: run pm add-issue "description"
Structured work: run pm add-feature "title", then add-phase, add-task, start

Do this yourself — pm commands are whitelisted. Then retry the edit.
```

### New Behavior

Read the file path from tool input and the identity from the session identity file. Construct a ready-to-run command:

```
BLOCKED: No active work in pm.

Run this to start tracking:
  pm add-issue "Update hooks logic" --agent claude-code --model claude-opus-4-6[1m]

Or for larger work:
  pm add-feature "Hooks refactor" --description "..."

Then retry your edit.
```

### Implementation Details

- **Title inference:** Extract filename without extension, convert kebab/camelCase to words, capitalize. `src/lib/hooks.ts` -> `"Update hooks"`. `src/commands/add-feature.ts` -> `"Update add-feature command"`. For generic filenames (`types.ts`, `index.ts`, `utils.ts`) or config files (`package.json`, `tsconfig.json`), use parent directory for context: `src/lib/types.ts` -> `"Update lib types"`. If no useful title can be inferred, omit the title and let the agent fill it in: `pm add-issue "describe your change"`.
- **Identity flags:** Read from `.pm/identity.json` (already written by SessionStart hook). Include `--agent` and `--model` in suggested commands. Quote model values containing brackets (e.g., `'claude-opus-4-6[1m]'`).
- **Stdin parse failure:** If tool input JSON can't be parsed (no file path available), fall back to the generic form without an inferred title.
- **Short message:** Max 6 lines. Agents parse short messages better than walls of text.

---

## Change 2: Scope Violation Recovery

**Files:** `src/commands/done.ts`

### Current Behavior

`checkScope` returns a generic error listing files and telling the agent to split work, without concrete commands.

### New Behavior

Group edited files by concern using heuristics, then suggest specific `add-issue` or `add-task` commands:

```
SCOPE: 6 files edited under one issue (limit: 3).

Files by concern:
  hooks: src/lib/hooks.ts, src/commands/hook.ts
  store: src/lib/store.ts, src/lib/types.ts
  tests: test/hooks.test.ts, test/store.test.ts

To complete this work:
  1. pm done issue-abc --force --note "completed hooks refactor"
  2. pm add-issue "Update store and types" --agent claude-code --model claude-opus-4-6[1m]
  3. pm add-issue "Add tests for hooks and store" --agent claude-code --model claude-opus-4-6[1m]

Or if this is legitimately one change:
  pm done issue-abc --force
```

### File Grouping Heuristics

Applied in priority order (a file is assigned to the first matching group):

1. **Test files** (highest priority) — any path containing `test/`, `__tests__/`, `.test.`, `.spec.` -> group as "tests"
2. **Directory grouping** — remaining (non-test) files in the same directory -> group by directory name
3. **Fallback** — files that don't fit any group get individual suggestions

Title generation: use the group name + action verb. Tests -> "Add tests for X" (where X is derived from the non-test files' groups). Same directory -> "Update X" where X is directory name.

Note: rule 3 from the original design ("shared prefix") was removed because it conflicts with rule 1 in the most common case (editing a file and its test). Rule 1 always wins — test files go to the "tests" group.

### Recovery sequencing

After `pm done --force`, the agent has no active work and will be blocked by pre-edit if it tries to edit. The suggested `pm add-issue` commands are CLI commands (not edits), so they're whitelisted and work fine. The agent runs the add-issue commands, then can resume editing. This is safe because pm hooks only block Edit/Write tool calls, not Bash commands.

### Identity in suggestions

Read from `.pm/identity.json` same as Change 1. Every suggested command includes `--agent` and `--model` flags. Quote model values containing brackets.

---

## Change 3: Decision Context Improvements

**Files:** `src/commands/why.ts`, `src/lib/hooks.ts`, `src/commands/decide.ts`, `src/lib/types.ts`

### 3a: Action Lines on Decisions

**Current:** `pm why` output shows decision text and reasoning.

**New:** Add an optional `action` field to decisions. When present, `pm why` output includes it:

```
Prior decisions relevant to "hooks":
- "Agent identity via --agent/--model flags, NOT env vars"
  Why: env vars don't persist reliably
  Action: when writing hook commands, always use flags
```

The `action` field is optional — existing decisions without it display as before. New decisions can include it via `pm decide <id> "what" --reasoning "why" --action "do this"`.

### 3b: Better Short-Prompt Matching

**Current:** `findRelevantDecisions` requires 2+ token overlap. Short prompts (1-2 meaningful words) rarely match.

**New:** Adaptive threshold:
- Prompt has 1-2 meaningful tokens -> require 1 overlap
- Prompt has 3+ meaningful tokens -> require 2 overlaps (current behavior)

This ensures focused queries like "fix hooks" or "update auth" find relevant decisions.

**Noise mitigation:** When using the reduced threshold (1 overlap), limit results to top 3 instead of top 5 to reduce false positives from common terms.

### Schema Change

Add optional `action?: string` to the `Decision` type in `src/lib/types.ts`. Add `--action` flag to `pm decide` in `src/commands/decide.ts`.

---

## Change 4: `pm bridge` Command (Plan Import)

**Files:** `src/commands/bridge.ts` (new), `src/cli.tsx`

### Purpose

Read a superpowers plan markdown file and create the corresponding pm feature/phase/task structure, so agents can `pm start` tasks that map 1:1 to plan tasks.

### Usage

```
pm bridge <plan-file> [--agent <name>] [--model <name>]
```

### Plan Format (superpowers convention)

Superpowers plans use consistent markdown structure:
```markdown
# Feature Title

## Phase 1: Phase Name
### Task 1.1: Task Name
Description text...
**Files:** `src/foo.ts`, `src/bar.ts`

### Task 1.2: Task Name
...

## Phase 2: Phase Name
### Task 2.1: Task Name
...
```

### Parsing Rules

1. `# Title` -> feature title. **Fallback:** if no `#` heading found, derive title from filename: `2026-03-25-hook-improvements.md` -> `"Hook improvements"`. If that also fails, error: "Could not determine feature title. Add a # heading to the plan file."
2. `## Phase N: Name` -> phase title (strip "Phase N: " prefix, also handles `## Step N:` and bare `##` headings)
3. `### Task N.M: Name` -> task title (strip "Task N.M: " prefix)
4. `**Files:**` line -> extract file list for task `--files` parameter
5. Everything between task heading and next heading -> task description

### Output

```
Created feature: "Hook improvements" (feature-abc)
  Phase 1: Smart error messages (phase-1)
    Task 1.1: Update pre-edit hook error output (task-1)
    Task 1.2: Add identity flag injection (task-2)
  Phase 2: Scope recovery (phase-2)
    Task 2.1: File grouping heuristics (task-3)
    Task 2.2: Update done command errors (task-4)

Start work:
  pm start task-1 --agent claude-code --model claude-opus-4-6[1m]
```

### Identity Flags

The `--agent` and `--model` flags are used in two places:
- **Created tasks:** Tasks are created with the agent/model identity so `pm start` and `pm done` work correctly. The `addTaskToPhase` function already accepts these fields via `Omit<Task, 'id' | 'status'>`.
- **Output suggestions:** The `pm start` command shown in output includes these flags for copy-paste convenience.

Features and phases don't have agent/model fields — this is correct since they're organizational containers, not work items.

### Idempotency

- Store the plan file path in feature metadata (`planSource` field). **Schema change:** add optional `planSource?: string` to the `Feature` type in `src/lib/types.ts`.
- On re-run, detect existing feature by `planSource` match. Secondary check: also match by feature title in case the plan file was moved.
- If found, skip creation and show existing structure with a note: "Already imported. Use pm show <id> to view."

### Error Handling

- File not found -> clear error with path
- Parse failure (no phases/tasks found) -> "Could not parse plan structure. Expected ## Phase and ### Task headings."
- Plan file outside project -> warn but allow (might be in a worktree)

---

## Testing Strategy

Each change gets its own test file:

1. **`test/smart-errors.test.ts`** — title inference from file paths (including generic filenames, config files, stdin parse failure), identity flag injection, message format
2. **`test/scope-recovery.test.ts`** — file grouping heuristics (priority ordering, test files always group first), suggested command generation, edge cases (1 file per group, all files in same dir, all test files)
3. **`test/decision-context.test.ts`** — action field in decisions, adaptive matching threshold (1-token and 2-token prompts), noise mitigation (top 3 vs top 5), short prompt matching
4. **`test/bridge.test.ts`** — plan parsing (with and without # title, filename fallback), feature/phase/task creation, idempotency (by planSource and by title), identity on created tasks, error cases (no file, no phases, no title)

---

## Files Changed Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/commands/hook.ts` | Modify | Smart pre-edit errors with inferred titles and identity flags |
| `src/lib/hooks.ts` | Modify | Title inference helper, identity reading for error messages, adaptive decision matching |
| `src/commands/done.ts` | Modify | File grouping heuristics, suggested split commands with identity |
| `src/commands/why.ts` | Modify | Action line display in decision output |
| `src/commands/decide.ts` | Modify | `--action` flag |
| `src/lib/types.ts` | Modify | `action` field on Decision, `planSource` field on Feature |
| `src/commands/bridge.ts` | New | Plan import command |
| `src/cli.tsx` | Modify | Register `bridge` command |
| `test/smart-errors.test.ts` | New | Tests for Change 1 |
| `test/scope-recovery.test.ts` | New | Tests for Change 2 |
| `test/decision-context.test.ts` | New | Tests for Change 3 |
| `test/bridge.test.ts` | New | Tests for Change 4 |
