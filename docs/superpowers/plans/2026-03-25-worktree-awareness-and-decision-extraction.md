# Worktree Awareness & Decision Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pm handle git worktree paths correctly in scope tracking, and extract decisions from superpowers spec files via `pm bridge --spec`.

**Architecture:** Two independent changes: (1) `stripWorktreePath` helper applied in `recordEdit` to normalize `.worktrees/branch/src/foo.ts` → `src/foo.ts`; (2) `parseSpecDecisions` function + `--spec` flag on `pm bridge` to extract `> **Decision:**` markers from spec markdown.

**Tech Stack:** TypeScript, Node.js, Vitest (run: `cd /Users/piotrjura/life/pm && npm test`)

---

## File Map

| File | Role | Change |
|------|------|--------|
| `src/lib/hooks.ts` | Hook logic | Add exported `stripWorktreePath`, apply in `recordEdit` |
| `src/commands/bridge.ts` | Plan import | Add `parseSpecDecisions`, `--spec` flag, decision import |
| `test/worktree-paths.test.ts` | **New** | Unit tests for `stripWorktreePath` |
| `test/bridge.test.ts` | Existing tests | Add tests for `--spec` flag |

---

## Task 1: Worktree Path Stripping

**Files:**
- Modify: `src/lib/hooks.ts`
- Create: `test/worktree-paths.test.ts`

- [ ] **Step 1.1: Write failing tests**

Create `test/worktree-paths.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { stripWorktreePath } from '../src/lib/hooks.js'

describe('stripWorktreePath', () => {
  it('strips .worktrees/<branch>/ prefix', () => {
    expect(stripWorktreePath('.worktrees/feature-branch/src/lib/hooks.ts'))
      .toBe('src/lib/hooks.ts')
  })

  it('strips worktrees/<branch>/ prefix (no dot)', () => {
    expect(stripWorktreePath('worktrees/my-branch/package.json'))
      .toBe('package.json')
  })

  it('returns normal paths unchanged', () => {
    expect(stripWorktreePath('src/lib/hooks.ts')).toBe('src/lib/hooks.ts')
  })

  it('handles root-level files in worktree', () => {
    expect(stripWorktreePath('.worktrees/branch/package.json'))
      .toBe('package.json')
  })

  it('handles nested worktrees by stripping all prefixes', () => {
    expect(stripWorktreePath('.worktrees/a/.worktrees/b/src/foo.ts'))
      .toBe('src/foo.ts')
  })

  it('handles worktree path with no file (trailing slash)', () => {
    expect(stripWorktreePath('.worktrees/branch/')).toBe('')
  })

  it('handles empty string', () => {
    expect(stripWorktreePath('')).toBe('')
  })

  it('handles backslash paths (Windows)', () => {
    expect(stripWorktreePath('.worktrees\\branch\\src\\foo.ts'))
      .toBe('src/foo.ts')
  })
})
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
cd /Users/piotrjura/life/pm && npm test -- test/worktree-paths.test.ts
```

Expected: FAIL — `stripWorktreePath` not exported from hooks.ts

- [ ] **Step 1.3: Implement `stripWorktreePath` in `src/lib/hooks.ts`**

Add after the `loadIdentityFlags` function (around line 263):

```typescript
/** Strip git worktree path prefixes from a relativized file path.
 *  `.worktrees/branch/src/foo.ts` → `src/foo.ts`
 *  `worktrees/branch/src/foo.ts` → `src/foo.ts`
 *  `src/foo.ts` → `src/foo.ts` (unchanged)
 *  Operates on already-relativized paths (after `relative(cwd, filePath)`). */
export function stripWorktreePath(relPath: string): string {
  // Normalize backslashes for Windows
  const normalized = relPath.replace(/\\/g, '/')
  // Repeatedly strip .worktrees/<name>/ or worktrees/<name>/ prefix
  let result = normalized
  while (/^\.?worktrees\/[^/]+\//.test(result)) {
    result = result.replace(/^\.?worktrees\/[^/]+\//, '')
  }
  return result
}
```

- [ ] **Step 1.4: Apply in `recordEdit`**

In `src/lib/hooks.ts`, modify line 296-298 of `recordEdit`:

Change:
```typescript
  const rel = filePath.startsWith(cwd) ? relative(cwd, filePath) : filePath
  if (!session.files.includes(rel)) {
    session.files.push(rel)
```

To:
```typescript
  const rawRel = filePath.startsWith(cwd) ? relative(cwd, filePath) : filePath
  const rel = stripWorktreePath(rawRel)
  if (!session.files.includes(rel)) {
    session.files.push(rel)
```

- [ ] **Step 1.5: Run tests**

```bash
cd /Users/piotrjura/life/pm && npm test -- test/worktree-paths.test.ts
```

Expected: All 8 PASS

- [ ] **Step 1.6: Run full test suite**

```bash
cd /Users/piotrjura/life/pm && npm test
```

Expected: All existing tests still pass

- [ ] **Step 1.7: Commit**

```bash
git add src/lib/hooks.ts test/worktree-paths.test.ts
git commit -m "feat: strip worktree path prefixes in scope tracking"
```

---

## Task 2: Decision Extraction from Spec Files

**Files:**
- Modify: `src/commands/bridge.ts`
- Modify: `test/bridge.test.ts`

- [ ] **Step 2.1: Write failing tests for `parseSpecDecisions`**

Add to the end of `test/bridge.test.ts`:

```typescript
import { parseSpecDecisions } from '../src/commands/bridge.js'

describe('parseSpecDecisions', () => {
  it('extracts decision with all fields', () => {
    const content = `# Spec
> **Decision:** Use explicit markers
> **Why:** Heuristics produce false positives
> **Action:** Parse blockquote markers

Some other text.
`
    const decisions = parseSpecDecisions(content)
    expect(decisions).toHaveLength(1)
    expect(decisions[0].decision).toBe('Use explicit markers')
    expect(decisions[0].reasoning).toBe('Heuristics produce false positives')
    expect(decisions[0].action).toBe('Parse blockquote markers')
  })

  it('extracts decision with only required field', () => {
    const content = `> **Decision:** Keep it simple\n\nMore text.`
    const decisions = parseSpecDecisions(content)
    expect(decisions).toHaveLength(1)
    expect(decisions[0].decision).toBe('Keep it simple')
    expect(decisions[0].reasoning).toBeUndefined()
    expect(decisions[0].action).toBeUndefined()
  })

  it('extracts multiple decisions', () => {
    const content = `> **Decision:** First choice
> **Why:** Reason one

> **Decision:** Second choice
> **Why:** Reason two
`
    const decisions = parseSpecDecisions(content)
    expect(decisions).toHaveLength(2)
    expect(decisions[0].decision).toBe('First choice')
    expect(decisions[1].decision).toBe('Second choice')
  })

  it('handles continuation lines in Why field', () => {
    const content = `> **Decision:** Use markers
> **Why:** Because free-form markdown is ambiguous
> and would produce false positives
> **Action:** Parse blockquotes
`
    const decisions = parseSpecDecisions(content)
    expect(decisions[0].reasoning).toBe('Because free-form markdown is ambiguous and would produce false positives')
    expect(decisions[0].action).toBe('Parse blockquotes')
  })

  it('returns empty array when no markers found', () => {
    const content = `# Just a spec\n\nNo decisions here.`
    expect(parseSpecDecisions(content)).toEqual([])
  })
})
```

- [ ] **Step 2.2: Run tests to verify they fail**

```bash
cd /Users/piotrjura/life/pm && npm test -- test/bridge.test.ts
```

Expected: FAIL — `parseSpecDecisions` not exported from bridge.ts

- [ ] **Step 2.3: Implement `parseSpecDecisions` in `src/commands/bridge.ts`**

Add before the `cmdBridge` function (around line 118), and export it:

```typescript
export interface ParsedDecision {
  decision: string
  reasoning?: string
  action?: string
}

/** Parse decision markers from a superpowers spec markdown file.
 *  Format: `> **Decision:** text`, optionally followed by `> **Why:**` and `> **Action:**` lines. */
export function parseSpecDecisions(content: string): ParsedDecision[] {
  const lines = content.split('\n')
  const decisions: ParsedDecision[] = []
  let current: ParsedDecision | null = null
  let currentField: 'decision' | 'reasoning' | 'action' = 'decision'

  const flush = () => {
    if (current) {
      // Trim all fields
      current.decision = current.decision.trim()
      if (current.reasoning) current.reasoning = current.reasoning.trim()
      if (current.action) current.action = current.action.trim()
      decisions.push(current)
      current = null
    }
  }

  for (const line of lines) {
    // New decision block
    if (line.startsWith('> **Decision:**')) {
      flush()
      current = { decision: line.replace('> **Decision:**', '').trim() }
      currentField = 'decision'
      continue
    }

    // Inside a decision block
    if (current && line.startsWith('>')) {
      const text = line.slice(1).trim()

      if (text.startsWith('**Why:**')) {
        current.reasoning = text.replace('**Why:**', '').trim()
        currentField = 'reasoning'
      } else if (text.startsWith('**Action:**')) {
        current.action = text.replace('**Action:**', '').trim()
        currentField = 'action'
      } else if (text) {
        // Continuation line — append to current field
        if (currentField === 'decision') {
          current.decision += ' ' + text
        } else if (currentField === 'reasoning') {
          current.reasoning = (current.reasoning ?? '') + ' ' + text
        } else if (currentField === 'action') {
          current.action = (current.action ?? '') + ' ' + text
        }
      }
      continue
    }

    // Non-blockquote line — end current block
    if (current) {
      flush()
    }
  }

  flush()
  return decisions
}
```

- [ ] **Step 2.4: Run parseSpecDecisions tests**

```bash
cd /Users/piotrjura/life/pm && npm test -- test/bridge.test.ts
```

Expected: All parseSpecDecisions tests PASS, existing bridge tests still PASS

- [ ] **Step 2.5: Write failing tests for `--spec` flag integration**

Add to `test/bridge.test.ts`:

```typescript
describe('pm bridge --spec flag', () => {
  it('extracts decisions from spec into feature', () => {
    const planPath = writePlan(cwd, SIMPLE_PLAN)
    const specContent = `# Spec
> **Decision:** Use hooks for tracking
> **Why:** Reliable and extensible
> **Action:** Always configure hooks on init
`
    const specPath = join(cwd, 'spec.md')
    writeFileSync(specPath, specContent)

    const { stdout, exitCode } = pm(`bridge ${planPath} --spec ${specPath}`, cwd)
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Extracted 1 decision')
    expect(stdout).toContain('Use hooks for tracking')

    const data = loadData(cwd)
    const decisions = data.features[0].decisions
    expect(decisions).toHaveLength(1)
    expect(decisions[0].decision).toBe('Use hooks for tracking')
    expect(decisions[0].reasoning).toBe('Reliable and extensible')
    expect(decisions[0].action).toBe('Always configure hooks on init')
  })

  it('warns when spec has no decision markers', () => {
    const planPath = writePlan(cwd, SIMPLE_PLAN)
    const specPath = join(cwd, 'empty-spec.md')
    writeFileSync(specPath, '# Just a title\n\nNo decisions.')

    const { stdout, exitCode } = pm(`bridge ${planPath} --spec ${specPath}`, cwd)
    expect(exitCode).toBe(0)
    expect(stdout).toContain('No decisions found in spec')
  })

  it('errors when spec file not found', () => {
    const planPath = writePlan(cwd, SIMPLE_PLAN)
    const { stdout, exitCode } = pm(`bridge ${planPath} --spec /nonexistent/spec.md`, cwd)
    expect(exitCode).toBe(1)
    expect(stdout).toContain('Spec file not found')
  })

  it('works without --spec flag (backward compat)', () => {
    const planPath = writePlan(cwd, SIMPLE_PLAN)
    const { stdout, exitCode } = pm(`bridge ${planPath}`, cwd)
    expect(exitCode).toBe(0)
    expect(stdout).not.toContain('decision')
    expect(stdout).not.toContain('Extracted')
  })
})
```

Note: `SIMPLE_PLAN`, `writePlan`, `writeFileSync`, and `join` are already available from the existing test file. Add `import { writeFileSync } from 'node:fs'` if not already imported (check — it's already imported in the existing bridge tests).

- [ ] **Step 2.6: Run tests to verify integration tests fail**

```bash
cd /Users/piotrjura/life/pm && npm test -- test/bridge.test.ts
```

Expected: parseSpecDecisions tests PASS, --spec integration tests FAIL

- [ ] **Step 2.7: Add `--spec` flag handling to `cmdBridge` in `src/commands/bridge.ts`**

Add `addDecision` to the imports from store.ts:

```typescript
import { addFeature, updateFeature, addPhaseToFeature, addTaskToPhase, loadStore, addDecision } from '../lib/store.js'
```

After the plan import output (after line 182 `lines.push(...)` for start command), add:

```typescript
  // Handle --spec flag: extract decisions from spec file
  const specPath = parseFlag(args, '--spec')
  if (specPath) {
    if (!existsSync(specPath)) {
      console.error(`Spec file not found: ${specPath}`)
      process.exit(1)
    }

    const specContent = readFileSync(specPath, 'utf-8')
    const decisions = parseSpecDecisions(specContent)

    if (decisions.length === 0) {
      lines.push('')
      lines.push("No decisions found in spec. Mark decisions with '> **Decision:** text'")
    } else {
      lines.push('')
      lines.push(`Extracted ${decisions.length} decision${decisions.length === 1 ? '' : 's'} from spec:`)
      for (const d of decisions) {
        addDecision(feature.id, d.decision, d.reasoning, d.action)
        lines.push(`  - "${d.decision}" → feature ${feature.id}`)
      }
    }
  }

  console.log(lines.join('\n'))
```

Also update the usage string to include `--spec`:

```typescript
    console.error('Usage: pm bridge <plan-file> [--spec <spec-file>] [--agent <name>] [--model <name>]')
```

**Important:** Move the `console.log(lines.join('\n'))` that's currently at line 184 to after the spec processing block. Remove the existing `console.log` at line 184 since the new code ends with it.

- [ ] **Step 2.8: Run all bridge tests**

```bash
cd /Users/piotrjura/life/pm && npm test -- test/bridge.test.ts
```

Expected: All PASS (existing + parseSpecDecisions + --spec integration)

- [ ] **Step 2.9: Run full test suite**

```bash
cd /Users/piotrjura/life/pm && npm test
```

Expected: All tests pass

- [ ] **Step 2.10: Commit**

```bash
git add src/commands/bridge.ts test/bridge.test.ts
git commit -m "feat: extract decisions from spec files via pm bridge --spec"
```

---

## Final: Build and Verify

- [ ] **Step 3.1: Build**

```bash
cd /Users/piotrjura/life/pm && npm run build
```

Expected: Clean build

- [ ] **Step 3.2: Smoke test — bridge with spec**

Test against our own spec file:

```bash
pm bridge docs/superpowers/plans/2026-03-25-worktree-awareness-and-decision-extraction.md --spec docs/superpowers/specs/2026-03-25-worktree-awareness-and-decision-extraction-design.md --agent claude-code --model 'claude-opus-4-6[1m]'
```

Expected: Feature created with 3 decisions extracted from the spec's `> **Decision:**` markers.

- [ ] **Step 3.3: Rebuild and link**

```bash
cd /Users/piotrjura/life/pm && npm run build && npm link
```
