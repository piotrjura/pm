# Worktree Awareness & Decision Extraction from Specs

**Date:** 2026-03-25
**Status:** Draft
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

pm's `recordEdit` function normalizes file paths relative to `cwd`. When Claude Code works in a git worktree (e.g., `.worktrees/feature-branch/`), edits produce paths like `.worktrees/feature-branch/src/lib/hooks.ts`. These are counted as unique files in the main session tracker, inflating the scope count and triggering false violations.

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

1. **`recordEdit` in `hooks.ts`** — after relativizing the path (line 296), apply `stripWorktreePath` before storing in session.files
2. **`handlePostEdit` in `hook.ts`** — before calling `recordEdit`, strip the worktree prefix from the file path so the allowlist checks (`.pm/`, `.claude/`, `CLAUDE.md`, `/memory/`) work correctly for worktree paths
3. **`handlePreEdit` in `hook.ts`** — same allowlist check needs worktree-stripped paths

### Edge Cases

- Nested worktrees (`.worktrees/a/.worktrees/b/...`) — strip only the outermost prefix. This is extremely unlikely but the regex should handle it gracefully.
- Windows backslash paths — normalize to forward slashes before matching (already done in `inferTitle`).
- Path is just `.worktrees/branch/` with no file — return empty string, same as current behavior for empty paths.

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
- A decision block ends at the first line that doesn't start with `>`
- Multiple decision blocks per spec file are supported
- Lines must start with `> **Decision:**` exactly (case-sensitive) — no variants like `> Decision:` or `> **Decided:**`

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

When `pm bridge` detects an already-imported plan (by `planSource` or title match), it skips plan import. For `--spec`, it should also skip decision extraction — log: `"Already imported. Use pm show <id> to view."`

---

## Testing Strategy

1. **`test/worktree-paths.test.ts`** — unit tests for `stripWorktreePath`: standard worktree paths, nested, no-op for normal paths, Windows paths, edge cases
2. **`test/bridge.test.ts`** (extend existing) — add tests for `--spec` flag: decision extraction, missing spec, no markers, idempotency with spec

---

## Files Changed Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/hooks.ts` | Modify | Add `stripWorktreePath`, apply in `recordEdit` |
| `src/commands/hook.ts` | Modify | Strip worktree paths before allowlist checks and `recordEdit` |
| `src/commands/bridge.ts` | Modify | Add `--spec` flag, `parseSpecDecisions`, decision import |
| `test/worktree-paths.test.ts` | New | Tests for worktree path stripping |
| `test/bridge.test.ts` | Modify | Tests for spec decision extraction |
