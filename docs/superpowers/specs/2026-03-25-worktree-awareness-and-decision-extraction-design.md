# Worktree Awareness & Decision Extraction from Specs

**Date:** 2026-03-25
**Status:** Reviewed (v2 — addressed spec review findings)
**Scope:** pm CLI changes only

> **Decision:** Worktree path stripping is generic — not superpowers-specific
> **Why:** Any tool that uses git worktrees (superpowers, manual workflows, CI) should work. Hardcoding superpowers patterns would break for other use cases.
> **Action:** Detect `.worktrees/` and `worktrees/` prefixes in file paths, strip them to get project-relative paths.

> **Decision:** Decision extraction uses explicit markers, not heuristic parsing
> **Why:** Free-form markdown is ambiguous — heuristics would produce false positives. Explicit `> **Decision:**` markers are reliable, easy for spec authors (including Claude during brainstorming) to add, and trivial to parse.
> **Action:** Parse `> **Decision:**`, `> **Why:**`, `> **Action:**` blockquote lines from spec files.

> **Decision:** Spec import via `--spec` flag on `pm bridge`, not a separate command
> **Why:** Decisions belong to the feature created from the plan. A separate command would need to find/create the feature, adding complexity for no benefit.

---

## Problem

### Worktree Scope Corruption

pm's `recordEdit` function normalizes file paths relative to `cwd`. The hook handler sets `cwd` to `CLAUDE_PROJECT_DIR` (line 17 of `hook.ts`), which is always the **main project root** — not the worktree root. When Claude Code edits files in a worktree, the absolute path is like `/project/.worktrees/branch/src/foo.ts`. After `relative(cwd, filePath)`, this becomes `.worktrees/branch/src/foo.ts` — counted as a unique file in the main session tracker, inflating the scope count and triggering false violations.

### Decisions Lost in Spec Files

Superpowers stores design specs in `docs/superpowers/specs/`. These contain key decisions — design principles, approach choices, trade-offs — but they're locked in markdown files. pm's decision system (`pm decide`, `pm why`) can't surface them because they were never imported.

---

## Change 1: Worktree-Aware Path Normalization

**Files:** `src/lib/hooks.ts`, `src/commands/hook.ts`

### New Helper: `stripWorktreePath`

```
stripWorktreePath('.worktrees/feature-branch/src/lib/hooks.ts')
→ 'src/lib/hooks.ts'

stripWorktreePath('worktrees/my-branch/package.json')
→ 'package.json'

stripWorktreePath('src/lib/hooks.ts')
→ 'src/lib/hooks.ts'  (no worktree prefix, unchanged)
```

Detection: match path segments against `.worktrees/<name>/` or `worktrees/<name>/`. Strip the prefix (first 2 segments). If no match, return unchanged.

### Where to Apply

**Only in `recordEdit` in `hooks.ts`** — after relativizing the path (line 296), apply `stripWorktreePath` before storing in `session.files`. This is the only place where worktree paths cause problems.

The allowlist checks in `handlePreEdit` and `handlePostEdit` use `.includes()` on the absolute path (e.g., `filePath.includes('.pm/')`) — these work correctly regardless of worktree prefix because they're substring matches, not prefix matches. No changes needed there.

### Edge Cases

- Nested worktrees (`.worktrees/a/.worktrees/b/...`) — strip all worktree prefixes, not just the outermost. (Practically impossible, but handle correctly.)
- Windows backslash paths — normalize to forward slashes before matching (already done in `inferTitle`).
- Path is just `.worktrees/branch/` with no file — return empty string.
- `stripWorktreePath` operates on **already-relativized** paths (after `relative(cwd, filePath)`). It expects inputs like `.worktrees/branch/src/foo.ts`, not absolute paths.

---

## Change 2: Decision Extraction from Spec Files

**Files:** `src/commands/bridge.ts`, `src/lib/store.ts`

### Spec Decision Marker Format

```markdown
> **Decision:** Guide, don't auto-act — agents run commands themselves
> **Why:** Auto-creation risks wrong entries, removes user control
> **Action:** Every error message includes ready-to-run commands
```

Parsing rules:
- `> **Decision:**` starts a new decision block. Text after the colon is the `decision` field. **(Required)**
- `> **Why:**` on the next blockquote line is the `reasoning` field. **(Optional)**
- `> **Action:**` on the next blockquote line is the `action` field. **(Optional)**
- Continuation lines (blockquote lines that don't match `**Decision:**`, `**Why:**`, or `**Action:**`) are appended to the current field with a space.
- A decision block ends at the first line that doesn't start with `>`, or at the next `> **Decision:**` line.
- Multiple decision blocks per spec file are supported.
- Lines must start with `> **Decision:**` exactly (case-sensitive).

### New Function: `parseSpecDecisions`

```typescript
interface ParsedDecision {
  decision: string
  reasoning?: string
  action?: string
}

function parseSpecDecisions(content: string): ParsedDecision[]
```

### Integration with `pm bridge`

New flag: `--spec <path>`

```
pm bridge plan.md --spec spec.md --agent claude-code --model claude-opus-4-6[1m]
```

**Argument ordering:** The plan file path must be the first positional argument (before any flags). This matches the existing `cmdBridge` behavior where `args[0]` is the plan path. The `--spec` flag is parsed via `parseFlag` like other flags.

After creating the feature (existing behavior), if `--spec` is provided:
1. Read and parse the spec file
2. For each extracted decision, call `addDecision(featureId, decision, reasoning, action)`
3. Append to output:

```
Extracted 3 decisions from spec:
  - "Guide, don't auto-act" → feature muYvZOtA
  - "Test files always group first" → feature muYvZOtA
  - "Adaptive threshold for short prompts" → feature muYvZOtA
```

### Error Handling

- `--spec` without a file path → error: `"Missing spec file path after --spec"`
- Spec file not found → error: `"Spec file not found: <path>"`
- No `> **Decision:**` markers found → warning to stdout: `"No decisions found in spec. Mark decisions with '> **Decision:** text'"`
- Spec parsing errors (malformed markdown) → skip malformed blocks, extract what's valid

### Idempotency

When `pm bridge` detects an already-imported plan (by `planSource` or title match), it currently calls `process.exit(0)`. This exit happens before any `--spec` processing. This is correct — if the plan was already imported, decisions were already extracted too (or the user can re-run with just the spec flag on a fresh import).

**Decision dedup:** `addDecision` in `store.ts` does not deduplicate by text. To keep it simple, we don't add dedup — the idempotency check on the plan import path prevents double-import in the normal flow. Edge case of re-importing to a different feature is acceptable (decisions are cheap, and `pm forget` exists for cleanup).

---

## Testing Strategy

1. **`test/worktree-paths.test.ts`** — unit tests for `stripWorktreePath`: standard worktree paths, nested, no-op for normal paths, Windows paths, edge cases
2. **`test/bridge.test.ts`** (extend existing) — add tests for `--spec` flag: decision extraction, missing spec, no markers, idempotency with spec

---

## Files Changed Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/hooks.ts` | Modify | Add exported `stripWorktreePath`, apply in `recordEdit` after relativization |
| `src/commands/bridge.ts` | Modify | Add `--spec` flag, `parseSpecDecisions`, decision import after plan creation |
| `test/worktree-paths.test.ts` | New | Tests for worktree path stripping |
| `test/bridge.test.ts` | Modify | Tests for spec decision extraction |
