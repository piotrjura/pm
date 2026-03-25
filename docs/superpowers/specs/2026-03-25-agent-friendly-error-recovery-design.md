# Agent-Friendly Error Recovery & Superpowers Integration

**Date:** 2026-03-25
**Status:** Draft
**Scope:** pm CLI changes only (no superpowers plugin modifications)

## Problem

pm's hook system blocks agent edits and rejects `done` commands when scope rules are violated, but the error messages are instructional rather than actionable. Agents get stuck, loop, or fail instead of recovering. This is especially bad when superpowers dispatches subagents that have zero pm context.

### Pain Points

1. **Pre-edit block with no recovery path** — agent tries to edit, pm says "log work first" with generic instructions, agent doesn't know what command to run
2. **Scope violation at `done` time** — superpowers task legitimately touches 4+ files, `pm done` rejects, agent is stuck with no clear next step
3. **Subagent blindness** — dispatched subagents have no pm context, hit hooks blind, get blocked with no understanding of project state
4. **Decisions not surfaced** — agents skip `pm why` even when prior decisions are relevant to their brainstorming/planning

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

- **Title inference:** Extract filename without extension, convert kebab/camelCase to words, capitalize. `src/lib/hooks.ts` -> `"Update hooks"`. `src/commands/add-feature.ts` -> `"Update add-feature command"`.
- **Identity flags:** Read from `.pm/identity.json` (already written by SessionStart hook). Include `--agent` and `--model` in suggested commands.
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

1. **Test files** — any path containing `test/`, `__tests__/`, `.test.`, `.spec.` -> group as "tests"
2. **Directory grouping** — files in the same directory -> group by directory name
3. **Shared prefix** — files with the same base name across directories (e.g., `hooks.ts` and `hooks.test.ts`) -> group together
4. **Fallback** — ungrouped files get individual suggestions

Title generation: use the group name + action verb. Tests -> "Add tests for X". Same directory -> "Update X" where X is directory name.

### Identity in suggestions

Read from `.pm/identity.json` same as Change 1. Every suggested command includes `--agent` and `--model` flags.

---

## Change 3: Subagent Awareness

**Files:** `src/commands/hook.ts`, `src/lib/hooks.ts`

### Current Behavior

When an unidentified agent (no `--agent` flag) hits pre-edit with no matching active work, it gets the same generic block message.

### New Behavior

Before blocking, check if ANY agent has active work in the project. If yes, show that context:

```
BLOCKED: No active work for this agent.

Active work exists in this project:
  - task "Implement hook improvements" [claude-code] — in-progress
  - issue "Fix type exports" [claude-code] — open

To claim existing work:
  pm start task-xyz --agent claude-code --model claude-opus-4-6[1m]

Or start new tracking:
  pm add-issue "description" --agent claude-code --model claude-opus-4-6[1m]
```

### Implementation Details

- **New function: `getAllActiveWork(cwd)`** — returns all in-progress tasks and non-done issues regardless of agent identity. Used only in the error path (not for gating).
- **Identity suggestion:** If identity.json exists, use those flags in suggested commands. If not, omit flags (agent can add them).
- **No auto-claim:** The message tells the agent what exists and how to join — it must run the command itself.

---

## Change 4: Decision Context Improvements

**Files:** `src/commands/why.ts`, `src/lib/hooks.ts`, `src/commands/decide.ts`, `src/lib/types.ts`

### 4a: Action Lines on Decisions

**Current:** `pm why` output shows decision text and reasoning.

**New:** Add an optional `action` field to decisions. When present, `pm why` output includes it:

```
Prior decisions relevant to "hooks":
- "Agent identity via --agent/--model flags, NOT env vars"
  Why: env vars don't persist reliably
  Action: when writing hook commands, always use flags
```

The `action` field is optional — existing decisions without it display as before. New decisions can include it via `pm decide <id> "what" --reasoning "why" --action "do this"`.

### 4b: Better Short-Prompt Matching

**Current:** `findRelevantDecisions` requires 2+ token overlap. Short prompts (1-2 meaningful words) rarely match.

**New:** Adaptive threshold:
- Prompt has 1-2 meaningful tokens -> require 1 overlap
- Prompt has 3+ meaningful tokens -> require 2 overlaps (current behavior)

This ensures focused queries like "fix hooks" or "update auth" find relevant decisions.

### Schema Change

Add optional `action?: string` to the `Decision` type in `src/lib/types.ts`. Add `--action` flag to `pm decide` in `src/commands/decide.ts`.

---

## Change 5: `pm bridge` Command (Plan Import)

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

1. `# Title` -> feature title
2. `## Phase N: Name` -> phase title (strip "Phase N: " prefix)
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

### Idempotency

- Store the plan file path in feature metadata (`planSource` field)
- On re-run, detect existing feature by `planSource` match
- If found, skip creation and show existing structure with a note: "Already imported. Use pm show <id> to view."

### Error Handling

- File not found -> clear error with path
- Parse failure (no phases/tasks found) -> "Could not parse plan structure. Expected ## Phase and ### Task headings."
- Plan file outside project -> warn but allow (might be in a worktree)

---

## Testing Strategy

Each change gets its own test file:

1. **`test/smart-errors.test.ts`** — title inference from file paths, identity flag injection, message format
2. **`test/scope-recovery.test.ts`** — file grouping heuristics, suggested command generation, edge cases (1 file per group, all files in same dir)
3. **`test/subagent-awareness.test.ts`** — `getAllActiveWork`, error message with active work context, no active work fallback
4. **`test/decision-context.test.ts`** — action field in decisions, adaptive matching threshold, short prompt matching
5. **`test/bridge.test.ts`** — plan parsing, feature/phase/task creation, idempotency, error cases

---

## Files Changed Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/commands/hook.ts` | Modify | Smart pre-edit errors, subagent awareness |
| `src/lib/hooks.ts` | Modify | Title inference, identity reading, `getAllActiveWork`, adaptive decision matching |
| `src/commands/done.ts` | Modify | File grouping heuristics, suggested split commands |
| `src/commands/why.ts` | Modify | Action line display |
| `src/commands/decide.ts` | Modify | `--action` flag |
| `src/lib/types.ts` | Modify | `action` field on Decision type |
| `src/commands/bridge.ts` | New | Plan import command |
| `src/cli.tsx` | Modify | Register `bridge` command |
| `test/smart-errors.test.ts` | New | Tests for Change 1 |
| `test/scope-recovery.test.ts` | New | Tests for Change 2 |
| `test/subagent-awareness.test.ts` | New | Tests for Change 3 |
| `test/decision-context.test.ts` | New | Tests for Change 4 |
| `test/bridge.test.ts` | New | Tests for Change 5 |
