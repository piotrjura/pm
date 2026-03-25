# Agent-Friendly Error Recovery & Superpowers Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pm guide agents to success with actionable error messages and copy-paste commands instead of generic instructions.

**Architecture:** Four independent changes: (1) smarter pre-edit block messages with inferred titles and identity flags from `.pm/identity.json`; (2) scope violation errors that group files by concern and suggest exact recovery commands; (3) `action` field on decisions with adaptive short-prompt matching; (4) new `pm bridge` command to import superpowers plan files into pm's feature/phase/task structure.

**Tech Stack:** TypeScript, Node.js, Vitest (tests run with `npm test` in `/Users/piotrjura/life/pm`)

---

## File Map

| File | Role | Change |
|------|------|--------|
| `src/lib/types.ts` | Domain types | Add `action?` to `Decision`, `planSource?` to `Feature` |
| `src/lib/hooks.ts` | Hook logic | Add `inferTitle()`, `loadIdentityFlags()`, adaptive `findRelevantDecisions()` |
| `src/commands/hook.ts` | Hook handler | Use new helpers in `handlePreEdit` block message |
| `src/commands/done.ts` | Done command | Replace `checkScope` with file-grouping version |
| `src/lib/store.ts` | Data layer | Add `action` param to `addDecision()` |
| `src/commands/decide.ts` | Decide command | Add `--action` flag, pass to `addDecision` |
| `src/commands/why.ts` | Why command | Print `Action:` line when present |
| `src/commands/bridge.ts` | **NEW** | Plan import command |
| `src/cli.tsx` | CLI router | Register `bridge` command and update help text |
| `test/smart-errors.test.ts` | **NEW** | Tests for title inference and block message format |
| `test/scope-recovery.test.ts` | **NEW** | Tests for file grouping and recovery commands |
| `test/decision-context.test.ts` | **NEW** | Tests for action field and adaptive matching |
| `test/bridge.test.ts` | **NEW** | Tests for plan parsing and import |

---

## Task 1: Smart Pre-Edit Errors

**Files:**
- Modify: `src/lib/hooks.ts`
- Modify: `src/commands/hook.ts`
- Create: `test/smart-errors.test.ts`

### Step 1.1: Write failing tests for `inferTitle`

Create `test/smart-errors.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { inferTitle, loadIdentityFlags } from '../src/lib/hooks.js'

describe('inferTitle', () => {
  it('extracts filename without extension', () => {
    expect(inferTitle('src/lib/hooks.ts')).toBe('Update hooks')
  })

  it('handles kebab-case', () => {
    expect(inferTitle('src/commands/add-feature.ts')).toBe('Update add-feature command')
  })

  it('uses parent dir for generic filenames', () => {
    expect(inferTitle('src/lib/types.ts')).toBe('Update lib types')
    expect(inferTitle('src/lib/index.ts')).toBe('Update lib index')
    expect(inferTitle('src/lib/utils.ts')).toBe('Update lib utils')
  })

  it('uses parent dir for config files', () => {
    expect(inferTitle('package.json')).toBe('Update package config')
    expect(inferTitle('tsconfig.json')).toBe('Update tsconfig config')
  })

  it('returns undefined for deeply generic paths it cannot infer', () => {
    expect(inferTitle('index.ts')).toBeUndefined()
  })

  it('handles undefined/empty gracefully', () => {
    expect(inferTitle('')).toBeUndefined()
    expect(inferTitle(undefined)).toBeUndefined()
  })
})

describe('loadIdentityFlags', () => {
  it('returns empty string when no identity file', () => {
    expect(loadIdentityFlags('/nonexistent/path')).toBe('')
  })
})
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
cd /Users/piotrjura/life/pm && npm test -- test/smart-errors.test.ts 2>&1 | tail -20
```

Expected: FAIL — `inferTitle` and `loadIdentityFlags` not exported

- [ ] **Step 1.3: Add `inferTitle` and `loadIdentityFlags` to `src/lib/hooks.ts`**

Add these two exported functions after the `loadIdentity` function (around line 204):

```typescript
/** Generic filenames that need their parent dir for context. */
const GENERIC_NAMES = new Set(['types', 'index', 'utils', 'helpers', 'constants', 'config', 'schema', 'schemas'])
/** Config file extensions that have no meaningful stem. */
const CONFIG_EXTS = new Set(['.json', '.yaml', '.yml', '.toml', '.env'])

/** Infer a human-readable issue title from a file path.
 *  Returns undefined if no useful title can be derived. */
export function inferTitle(filePath: string | undefined): string | undefined {
  if (!filePath) return undefined
  const parts = filePath.replace(/\\/g, '/').split('/')
  const filename = parts[parts.length - 1]
  if (!filename) return undefined

  const ext = filename.slice(filename.lastIndexOf('.'))
  const stem = filename.slice(0, filename.lastIndexOf('.') || undefined)

  // Config files: use stem as label
  if (CONFIG_EXTS.has(ext) && stem) {
    return `Update ${stem} config`
  }

  if (!stem) return undefined

  // Generic stems: prefix with parent directory name
  if (GENERIC_NAMES.has(stem)) {
    const parent = parts[parts.length - 2]
    if (!parent) return undefined
    return `Update ${parent} ${stem}`
  }

  // Single-segment path with a generic stem already handled above
  // Multi-word stems from kebab filenames like "add-feature" -> "add-feature command"
  const lastSegment = parts[parts.length - 2]
  if (lastSegment === 'commands') {
    return `Update ${stem} command`
  }

  return `Update ${stem}`
}

/** Build identity flag string (e.g. "--agent claude-code --model 'claude-opus-4-6[1m]'")
 *  from the persisted identity file. Returns empty string if no identity saved. */
export function loadIdentityFlags(cwd: string): string {
  const identity = loadIdentity(cwd)
  if (!identity) return ''
  const parts: string[] = []
  if (identity.agent) parts.push(`--agent ${identity.agent}`)
  if (identity.model) {
    // Quote model values containing brackets (shell special chars)
    const model = identity.model.includes('[') ? `'${identity.model}'` : identity.model
    parts.push(`--model ${model}`)
  }
  return parts.join(' ')
}
```

- [ ] **Step 1.4: Run tests to verify `inferTitle` and `loadIdentityFlags` pass**

```bash
cd /Users/piotrjura/life/pm && npm test -- test/smart-errors.test.ts 2>&1 | tail -20
```

Expected: PASS for all inferTitle and loadIdentityFlags tests

- [ ] **Step 1.5: Update `handlePreEdit` in `src/commands/hook.ts`**

Replace the current block message (lines 77-84) with:

```typescript
  // Block — no active work
  let title: string | undefined
  try {
    const data = JSON.parse(input)
    const filePath: string = data?.tool_input?.file_path ?? ''
    title = inferTitle(filePath)
  } catch {
    // Can't parse stdin — no title inference
  }

  const idFlags = loadIdentityFlags(cwd)
  const idSuffix = idFlags ? ` ${idFlags}` : ''
  const titleArg = title ? `"${title}"` : '"describe your change"'

  process.stderr.write(
    `BLOCKED: No active work in pm.\n\n` +
    `Run this to start tracking:\n` +
    `  pm add-issue ${titleArg}${idSuffix}\n\n` +
    `Or for larger work:\n` +
    `  pm add-feature "Feature title" --description "..."\n\n` +
    `Then retry your edit.`
  )
  process.exit(2)
```

Also add the imports at the top of `hook.ts`:

```typescript
import { hasActiveWork, getStatusSummary, recordEdit, saveIdentity, inferTitle, loadIdentityFlags } from '../lib/hooks.js'
```

- [ ] **Step 1.6: Write integration test for new block message format**

**Replace the entire `test/smart-errors.test.ts`** with the full merged file (unit tests + integration tests together):

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createTestDir, cleanupTestDir } from './helpers.js'
import { inferTitle, loadIdentityFlags } from '../src/lib/hooks.js'

const TSX = join(import.meta.dirname, '..', 'node_modules', '.bin', 'tsx')
const CLI = join(import.meta.dirname, '..', 'src', 'cli.tsx')

describe('inferTitle', () => {
  it('extracts filename without extension', () => {
    expect(inferTitle('src/lib/hooks.ts')).toBe('Update hooks')
  })

  it('handles kebab-case', () => {
    expect(inferTitle('src/commands/add-feature.ts')).toBe('Update add-feature command')
  })

  it('uses parent dir for generic filenames', () => {
    expect(inferTitle('src/lib/types.ts')).toBe('Update lib types')
    expect(inferTitle('src/lib/index.ts')).toBe('Update lib index')
    expect(inferTitle('src/lib/utils.ts')).toBe('Update lib utils')
  })

  it('uses parent dir for config files', () => {
    expect(inferTitle('package.json')).toBe('Update package config')
    expect(inferTitle('tsconfig.json')).toBe('Update tsconfig config')
  })

  it('returns undefined for bare generic filename with no useful parent', () => {
    expect(inferTitle('index.ts')).toBeUndefined()
  })

  it('handles undefined/empty gracefully', () => {
    expect(inferTitle('')).toBeUndefined()
    expect(inferTitle(undefined)).toBeUndefined()
  })
})

describe('loadIdentityFlags', () => {
  it('returns empty string when no identity file', () => {
    expect(loadIdentityFlags('/nonexistent/path')).toBe('')
  })
})

describe('pre-edit hook block message', () => {
  let cwd: string
  beforeEach(() => { cwd = createTestDir() })
  afterEach(() => { cleanupTestDir(cwd) })

  function writeIdentity(dir: string, agent: string, model: string) {
    const pmDir = join(dir, '.pm')
    mkdirSync(pmDir, { recursive: true })
    writeFileSync(join(pmDir, 'identity.json'), JSON.stringify({ agent, model }))
  }

  function writeEmptyStore(dir: string) {
    const pmDir = join(dir, '.pm')
    mkdirSync(pmDir, { recursive: true })
    writeFileSync(join(pmDir, 'data.json'), JSON.stringify({ features: [], issues: [], log: [] }))
  }

  it('includes inferred title and identity flags in block message', () => {
    writeEmptyStore(cwd)
    writeIdentity(cwd, 'claude-code', 'claude-sonnet-4-6')

    const stdin = JSON.stringify({ tool_input: { file_path: `${cwd}/src/lib/hooks.ts` } })
    const result = spawnSync(TSX, [CLI, 'hook', 'pre-edit', '--agent', 'claude-code', '--instance', '999'],
      { input: stdin, encoding: 'utf-8', cwd, env: { ...process.env, NO_COLOR: '1' } })

    expect(result.status).toBe(2) // blocked
    expect(result.stderr).toContain('BLOCKED: No active work in pm.')
    expect(result.stderr).toContain('--agent claude-code')
    expect(result.stderr).toContain('Update hooks')
  })

  it('falls back to placeholder title when file path unavailable', () => {
    writeEmptyStore(cwd)

    const result = spawnSync(TSX, [CLI, 'hook', 'pre-edit'],
      { input: 'not-json', encoding: 'utf-8', cwd, env: { ...process.env, NO_COLOR: '1' } })

    expect(result.status).toBe(2)
    expect(result.stderr).toContain('"describe your change"')
  })
})
```

- [ ] **Step 1.7: Run all smart-errors tests**

```bash
cd /Users/piotrjura/life/pm && npm test -- test/smart-errors.test.ts 2>&1 | tail -30
```

Expected: All PASS

- [ ] **Step 1.8: Run full test suite to check for regressions**

```bash
cd /Users/piotrjura/life/pm && npm test 2>&1 | tail -20
```

Expected: All existing tests still pass

- [ ] **Step 1.9: Commit**

```bash
cd /Users/piotrjura/life/pm && git add src/lib/hooks.ts src/commands/hook.ts test/smart-errors.test.ts
git commit -m "feat: smart pre-edit errors with inferred title and identity flags"
```

---

## Task 2: Scope Violation Recovery

**Files:**
- Modify: `src/commands/done.ts`
- Create: `test/scope-recovery.test.ts`

- [ ] **Step 2.1: Write failing tests for file grouping**

Create `test/scope-recovery.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { groupFilesByConcern, buildScopeErrorMessage } from '../src/commands/done.js'

describe('groupFilesByConcern', () => {
  it('puts test files in their own group regardless of directory', () => {
    const files = ['src/lib/hooks.ts', 'test/hooks.test.ts', 'test/store.test.ts']
    const groups = groupFilesByConcern(files)
    expect(groups.find(g => g.name === 'tests')?.files).toEqual(['test/hooks.test.ts', 'test/store.test.ts'])
    expect(groups.find(g => g.name !== 'tests')?.files).toContain('src/lib/hooks.ts')
  })

  it('groups non-test files by directory', () => {
    const files = ['src/lib/hooks.ts', 'src/lib/store.ts', 'src/commands/done.ts']
    const groups = groupFilesByConcern(files)
    const libGroup = groups.find(g => g.name === 'lib')
    const cmdsGroup = groups.find(g => g.name === 'commands')
    expect(libGroup?.files).toEqual(['src/lib/hooks.ts', 'src/lib/store.ts'])
    expect(cmdsGroup?.files).toEqual(['src/commands/done.ts'])
  })

  it('test files have highest priority — not grouped with source', () => {
    // hooks.test.ts shares base name with hooks.ts but goes to tests group
    const files = ['src/lib/hooks.ts', 'test/hooks.test.ts']
    const groups = groupFilesByConcern(files)
    const testGroup = groups.find(g => g.name === 'tests')
    expect(testGroup?.files).toContain('test/hooks.test.ts')
    expect(testGroup?.files).not.toContain('src/lib/hooks.ts')
  })

  it('handles .spec. files as tests', () => {
    const files = ['src/foo.spec.ts', 'src/bar.ts']
    const groups = groupFilesByConcern(files)
    expect(groups.find(g => g.name === 'tests')?.files).toContain('src/foo.spec.ts')
  })

  it('handles __tests__ directory', () => {
    const files = ['src/__tests__/foo.ts', 'src/bar.ts']
    const groups = groupFilesByConcern(files)
    expect(groups.find(g => g.name === 'tests')?.files).toContain('src/__tests__/foo.ts')
  })

  it('returns single group when all files in same dir', () => {
    const files = ['src/lib/a.ts', 'src/lib/b.ts', 'src/lib/c.ts', 'src/lib/d.ts']
    const groups = groupFilesByConcern(files)
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('lib')
  })

  it('handles all test files', () => {
    const files = ['test/a.test.ts', 'test/b.test.ts', 'test/c.test.ts', 'test/d.test.ts']
    const groups = groupFilesByConcern(files)
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('tests')
  })
})

describe('buildScopeErrorMessage', () => {
  it('includes identity flags in suggested commands', () => {
    const msg = buildScopeErrorMessage('issue-abc', 'issue', ['src/lib/a.ts', 'src/lib/b.ts', 'src/lib/c.ts', 'src/lib/d.ts'], '--agent claude-code --model my-model')
    expect(msg).toContain('--agent claude-code')
    expect(msg).toContain('pm done issue-abc --force')
    expect(msg).toContain('pm add-issue')
  })

  it('includes files grouped by concern', () => {
    const files = ['src/lib/hooks.ts', 'src/lib/store.ts', 'test/hooks.test.ts', 'test/store.test.ts']
    const msg = buildScopeErrorMessage('task-xyz', 'task', files, '')
    expect(msg).toContain('tests:')
    expect(msg).toContain('lib:')
  })
})
```

- [ ] **Step 2.2: Run tests to verify they fail**

```bash
cd /Users/piotrjura/life/pm && npm test -- test/scope-recovery.test.ts 2>&1 | tail -20
```

Expected: FAIL — `groupFilesByConcern` and `buildScopeErrorMessage` not exported

- [ ] **Step 2.3: Refactor `checkScope` in `src/commands/done.ts`**

Export two new functions and update `checkScope` to use them. Replace the entire `checkScope` function (lines 81-106) with:

```typescript
export interface FileGroup {
  name: string
  files: string[]
}

/** Check if a path is a test file. */
function isTestFile(p: string): boolean {
  return p.includes('/test/') || p.includes('/__tests__/') || p.includes('.test.') || p.includes('.spec.')
}

/** Group files by concern. Test files first, then by directory name. */
export function groupFilesByConcern(files: string[]): FileGroup[] {
  const testFiles = files.filter(isTestFile)
  const sourceFiles = files.filter(f => !isTestFile(f))

  const groups: FileGroup[] = []

  // Group source files by immediate parent directory name
  const byDir = new Map<string, string[]>()
  for (const f of sourceFiles) {
    const parts = f.replace(/\\/g, '/').split('/')
    const dir = parts.length >= 2 ? parts[parts.length - 2] : 'root'
    const existing = byDir.get(dir) ?? []
    existing.push(f)
    byDir.set(dir, existing)
  }
  for (const [dir, dirFiles] of byDir) {
    groups.push({ name: dir, files: dirFiles })
  }

  // Test files always last
  if (testFiles.length > 0) {
    groups.push({ name: 'tests', files: testFiles })
  }

  return groups
}

/** Build the scope error message with grouped files and copy-paste recovery commands. */
export function buildScopeErrorMessage(
  activeId: string,
  type: 'task' | 'issue',
  files: string[],
  idFlags: string,
): string {
  const groups = groupFilesByConcern(files)
  const idSuffix = idFlags ? ` ${idFlags}` : ''

  const lines: string[] = [
    `SCOPE: ${files.length} files edited under one ${type} (limit: ${SCOPE_WARN_FILES - 1}).`,
    ``,
    `Files by concern:`,
  ]

  for (const g of groups) {
    lines.push(`  ${g.name}: ${g.files.join(', ')}`)
  }

  lines.push(``)
  lines.push(`To complete this work:`)
  lines.push(`  1. pm done ${activeId} --force --note "what was completed"`)

  let step = 2
  for (const g of groups) {
    if (g.name === 'tests') {
      lines.push(`  ${step}. pm add-issue "Add tests"${idSuffix}`)
    } else {
      lines.push(`  ${step}. pm add-issue "Update ${g.name}"${idSuffix}`)
    }
    step++
  }

  lines.push(``)
  lines.push(`Or if this is legitimately one change:`)
  lines.push(`  pm done ${activeId} --force`)

  return lines.join('\n')
}

/** Check if the session file count exceeds the scope threshold.
 *  Returns an error message if over limit, null if OK. */
function checkScope(cwd: string, activeId: string, type: 'task' | 'issue'): string | null {
  const session = loadSession(cwd)
  if (!session || session.activeId !== activeId) return null
  if (session.files.length < SCOPE_WARN_FILES) return null

  const idFlags = loadIdentityFlags(cwd)
  return buildScopeErrorMessage(activeId, type, session.files, idFlags)
}
```

Also add the import for `loadIdentityFlags` at the top of `done.ts`:

```typescript
import { loadSession, SCOPE_WARN_FILES, loadIdentityFlags } from '../lib/hooks.js'
```

- [ ] **Step 2.4: Run scope recovery tests**

```bash
cd /Users/piotrjura/life/pm && npm test -- test/scope-recovery.test.ts 2>&1 | tail -30
```

Expected: All PASS

- [ ] **Step 2.5: Run full test suite including existing scope tests**

```bash
cd /Users/piotrjura/life/pm && npm test 2>&1 | tail -20
```

Expected: All tests pass. Note: `test/scope.test.ts` checks for `'SCOPE VIOLATION'` — update the string check in `buildScopeErrorMessage` if needed. The new message says `'SCOPE:'` not `'SCOPE VIOLATION'`. Update the existing tests to match:

In `test/scope.test.ts`, change:
```typescript
expect(stdout).toContain('SCOPE VIOLATION')
```
to:
```typescript
expect(stdout).toContain('SCOPE:')
```

(There are 3 occurrences — lines 41, 80, 112)

- [ ] **Step 2.6: Commit**

```bash
cd /Users/piotrjura/life/pm && git add src/commands/done.ts test/scope-recovery.test.ts test/scope.test.ts
git commit -m "feat: scope violation recovery with file grouping and exact commands"
```

---

## Task 3: Decision Context Improvements

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/store.ts`
- Modify: `src/commands/decide.ts`
- Modify: `src/commands/why.ts`
- Modify: `src/lib/hooks.ts`
- Create: `test/decision-context.test.ts`

- [ ] **Step 3.1: Write failing tests**

Create `test/decision-context.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDir, cleanupTestDir, pm, loadData } from './helpers.js'

let cwd: string
beforeEach(() => { cwd = createTestDir() })
afterEach(() => { cleanupTestDir(cwd) })

describe('action field on decisions', () => {
  it('stores action field when --action flag provided', () => {
    const feat = pm('add-feature "Test feature"', cwd)
    const featureId = feat.stdout.match(/^feature:(\S+)/m)![1]
    pm(`decide ${featureId} "Use flags not env vars" --reasoning "env vars unreliable" --action "always pass --agent flag"`, cwd)

    const data = loadData(cwd)
    const decision = data.features[0].decisions[0]
    expect(decision.action).toBe('always pass --agent flag')
  })

  it('stores decision without action when --action not provided (backward compat)', () => {
    const feat = pm('add-feature "Test feature"', cwd)
    const featureId = feat.stdout.match(/^feature:(\S+)/m)![1]
    pm(`decide ${featureId} "Use flags" --reasoning "reliable"`, cwd)

    const data = loadData(cwd)
    const decision = data.features[0].decisions[0]
    expect(decision.action).toBeUndefined()
  })

  it('pm why output shows Action line when present', () => {
    const feat = pm('add-feature "Test feature"', cwd)
    const featureId = feat.stdout.match(/^feature:(\S+)/m)![1]
    pm(`decide ${featureId} "Use hooks" --reasoning "cleaner" --action "call pm hook in settings"`, cwd)

    const { stdout } = pm('why hooks', cwd)
    expect(stdout).toContain('Action: call pm hook in settings')
  })

  it('pm why output omits Action line when not present', () => {
    const feat = pm('add-feature "Test feature"', cwd)
    const featureId = feat.stdout.match(/^feature:(\S+)/m)![1]
    pm(`decide ${featureId} "Use hooks" --reasoning "cleaner"`, cwd)

    const { stdout } = pm('why hooks', cwd)
    expect(stdout).not.toContain('Action:')
  })
})

describe('adaptive short-prompt matching (unit)', () => {
  // findRelevantDecisions is a private function in hooks.ts used by getStatusSummary
  // (the prompt-context hook). Test it by exporting it from hooks.ts and importing directly.
  // NOTE: Step 3.7 must export findRelevantDecisions before this test can pass.
  it('matches with 1 overlap for short prompts (1-2 meaningful tokens)', async () => {
    // Import the function after Step 3.7 exports it
    const { findRelevantDecisions } = await import('../src/lib/hooks.js')
    const decisions = [
      { decision: 'hooks are the right approach', reasoning: 'extensible', at: '2026-01-01' },
      { decision: 'use database not files', reasoning: 'reliable', at: '2026-01-01' },
    ].map(d => ({ ...d, source: 'test feature' }))

    // 1-token prompt: "hooks" — should match with threshold=1
    const results = findRelevantDecisions('hooks', decisions)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].decision).toBe('hooks are the right approach')
  })

  it('limits short-prompt results to 3 (noise mitigation)', async () => {
    const { findRelevantDecisions } = await import('../src/lib/hooks.js')
    // Create 5 decisions all containing "hook"
    const decisions = Array.from({ length: 5 }, (_, i) => ({
      decision: `hook decision ${i}`,
      at: '2026-01-01',
      source: 'test',
    }))

    const results = findRelevantDecisions('hook', decisions)
    expect(results.length).toBeLessThanOrEqual(3)
  })

  it('still requires 2 overlaps for longer prompts', async () => {
    const { findRelevantDecisions } = await import('../src/lib/hooks.js')
    const decisions = [
      { decision: 'hooks are useful', at: '2026-01-01', source: 'test' }, // 1 overlap with "fix hooks carefully"
      { decision: 'hooks fix patterns carefully', at: '2026-01-01', source: 'test' }, // 3 overlaps
    ]

    const results = findRelevantDecisions('fix hooks carefully', decisions)
    // Only the second decision should match (needs 2+ overlaps for 3-token prompt)
    expect(results.some(r => r.decision === 'hooks fix patterns carefully')).toBe(true)
  })
})
```

- [ ] **Step 3.2: Run tests to verify they fail**

```bash
cd /Users/piotrjura/life/pm && npm test -- test/decision-context.test.ts 2>&1 | tail -20
```

Expected: FAIL — `--action` flag not yet supported, `Action:` not in output

- [ ] **Step 3.3: Add `action` field to `Decision` in `src/lib/types.ts`**

```typescript
export interface Decision {
  /** What was decided */
  decision: string
  /** Why — context, reasoning, alternatives considered */
  reasoning?: string
  /** Concrete action directive for agents */
  action?: string
  /** When */
  at: string
}
```

- [ ] **Step 3.4: Update `addDecision` in `src/lib/store.ts` to accept `action`**

Change the function signature and entry creation:

```typescript
export function addDecision(id: string, decision: string, reasoning?: string, action?: string): Decision | null {
  const store = loadStore()
  const entry: Decision = { decision, reasoning, action, at: new Date().toISOString() }
  // rest unchanged ...
```

- [ ] **Step 3.5: Add `--action` flag to `src/commands/decide.ts`**

```typescript
import { addDecision } from '../lib/store.js'
import { parseFlag } from '../lib/args.js'

export function cmdDecide(args: string[]) {
  const id = args[0]
  if (!id) {
    console.error('Usage: pm decide <featureId|taskId|issueId> "what was decided" [--reasoning "why"] [--action "do this"]')
    process.exit(1)
  }

  const decision = args[1]
  if (!decision) {
    console.error('Usage: pm decide <id> "what was decided" [--reasoning "why"] [--action "do this"]')
    process.exit(1)
  }

  const reasoning = parseFlag(args.slice(1), '--reasoning')
  const action = parseFlag(args.slice(1), '--action')

  const result = addDecision(id, decision, reasoning, action)
  if (!result) {
    console.error(`Not found: ${id}`)
    process.exit(1)
  }

  console.log(`Decision recorded on ${id}`)
  console.log(`  Decision : ${decision}`)
  if (reasoning) console.log(`  Reasoning: ${reasoning}`)
  if (action) console.log(`  Action   : ${action}`)
}
```

- [ ] **Step 3.6: Update `printDecisions` in `src/commands/why.ts` to show `Action:` line**

```typescript
function printDecisions(matches: DecisionMatch[]) {
  for (const m of matches) {
    const date = new Date(m.decision.at).toLocaleDateString()
    const src = m.source

    if (src.type === 'feature') {
      console.log(`[${src.featureId}] ${src.featureTitle}`)
    } else if (src.type === 'task') {
      console.log(`[${src.taskId}] ${src.featureTitle} > ${src.taskTitle}`)
    } else {
      console.log(`[${src.issueId}] ${src.issueTitle}`)
    }

    console.log(`  Decision: ${m.decision.decision}`)
    if (m.decision.reasoning) console.log(`  Why: ${m.decision.reasoning}`)
    if (m.decision.action) console.log(`  Action: ${m.decision.action}`)
    console.log(`  (${date})`)
    console.log()
  }
}
```

- [ ] **Step 3.7: Update `findRelevantDecisions` in `src/lib/hooks.ts` for adaptive threshold and export it**

Replace the existing `findRelevantDecisions` function (lines 154-180) — **change `function` to `export function`** so the unit tests can import it directly:

```typescript
/** Find decisions whose text overlaps with the user's prompt.
 *  Adaptive threshold: short prompts (1-2 tokens) require 1 overlap; longer require 2.
 *  Noise mitigation: short-prompt matches capped at 3 results. */
export function findRelevantDecisions(
  prompt: string,
  allDecisions: Array<Decision & { source: string }>,
): Array<Decision & { source: string }> {
  if (!prompt || allDecisions.length === 0) return []

  const promptTokens = tokenize(prompt)
  if (promptTokens.size === 0) return []

  // Adaptive threshold
  const isShortPrompt = promptTokens.size <= 2
  const requiredOverlap = isShortPrompt ? 1 : 2
  const maxResults = isShortPrompt ? 3 : 5

  const matches: Array<Decision & { source: string; score: number }> = []
  for (const d of allDecisions) {
    const decisionText = `${d.decision} ${d.reasoning ?? ''}`
    const decisionTokens = tokenize(decisionText)
    let overlap = 0
    for (const token of decisionTokens) {
      if (promptTokens.has(token)) overlap++
    }
    if (overlap >= requiredOverlap) {
      matches.push({ ...d, score: overlap })
    }
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, maxResults)
}
```

- [ ] **Step 3.8: Run decision context tests**

```bash
cd /Users/piotrjura/life/pm && npm test -- test/decision-context.test.ts 2>&1 | tail -30
```

Expected: All PASS

- [ ] **Step 3.9: Run full test suite**

```bash
cd /Users/piotrjura/life/pm && npm test 2>&1 | tail -20
```

Expected: All pass

- [ ] **Step 3.10: Commit**

```bash
cd /Users/piotrjura/life/pm && git add src/lib/types.ts src/lib/store.ts src/commands/decide.ts src/commands/why.ts src/lib/hooks.ts test/decision-context.test.ts
git commit -m "feat: action field on decisions, --action flag, adaptive short-prompt matching"
```

---

## Task 4: `pm bridge` Command

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/store.ts`
- Create: `src/commands/bridge.ts`
- Modify: `src/cli.tsx`
- Create: `test/bridge.test.ts`

- [ ] **Step 4.1: Write failing tests**

Create `test/bridge.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createTestDir, cleanupTestDir, pm, loadData } from './helpers.js'

let cwd: string
beforeEach(() => { cwd = createTestDir() })
afterEach(() => { cleanupTestDir(cwd) })

function writePlan(dir: string, content: string, filename = 'plan.md'): string {
  const path = join(dir, filename)
  writeFileSync(path, content)
  return path
}

const SIMPLE_PLAN = `# Hook Improvements

## Phase 1: Error messages
### Task 1.1: Update pre-edit hook
Fix the block message.
**Files:** \`src/commands/hook.ts\`

### Task 1.2: Add identity flags
Include --agent in output.
**Files:** \`src/lib/hooks.ts\`, \`src/commands/hook.ts\`

## Phase 2: Testing
### Task 2.1: Write tests
Add test coverage.
**Files:** \`test/smart-errors.test.ts\`
`

describe('pm bridge — basic import', () => {
  it('creates feature, phases, and tasks from plan', () => {
    const planPath = writePlan(cwd, SIMPLE_PLAN)
    const { stdout, exitCode } = pm(`bridge ${planPath}`, cwd)

    expect(exitCode).toBe(0)
    expect(stdout).toContain('Created feature: "Hook Improvements"')
    expect(stdout).toContain('Phase 1: Error messages')
    expect(stdout).toContain('Task 1.1: Update pre-edit hook')
    expect(stdout).toContain('Task 1.2: Add identity flags')
    expect(stdout).toContain('Phase 2: Testing')
    expect(stdout).toContain('Task 2.1: Write tests')

    const data = loadData(cwd)
    expect(data.features).toHaveLength(1)
    expect(data.features[0].title).toBe('Hook Improvements')
    expect(data.features[0].phases).toHaveLength(2)
    expect(data.features[0].phases[0].tasks).toHaveLength(2)
    expect(data.features[0].phases[1].tasks).toHaveLength(1)
  })

  it('extracts file lists into task files field', () => {
    const planPath = writePlan(cwd, SIMPLE_PLAN)
    pm(`bridge ${planPath}`, cwd)

    const data = loadData(cwd)
    const task1 = data.features[0].phases[0].tasks[0]
    expect(task1.files).toContain('src/commands/hook.ts')
  })

  it('stores planSource on the feature', () => {
    const planPath = writePlan(cwd, SIMPLE_PLAN)
    pm(`bridge ${planPath}`, cwd)

    const data = loadData(cwd)
    expect(data.features[0].planSource).toBe(planPath)
  })

  it('attaches agent and model to tasks when flags provided', () => {
    const planPath = writePlan(cwd, SIMPLE_PLAN)
    pm(`bridge ${planPath} --agent claude-code --model my-model`, cwd)

    const data = loadData(cwd)
    const task = data.features[0].phases[0].tasks[0]
    expect(task.agent).toBe('claude-code')
    expect(task.model).toBe('my-model')
  })
})

describe('pm bridge — idempotency', () => {
  it('skips creation if planSource already exists', () => {
    const planPath = writePlan(cwd, SIMPLE_PLAN)
    pm(`bridge ${planPath}`, cwd)
    const { stdout, exitCode } = pm(`bridge ${planPath}`, cwd)

    expect(exitCode).toBe(0)
    expect(stdout).toContain('Already imported')

    // Still only one feature
    const data = loadData(cwd)
    expect(data.features).toHaveLength(1)
  })
})

describe('pm bridge — title fallback', () => {
  it('derives title from filename when no # heading', () => {
    const content = `## Phase 1: Core\n### Task 1.1: Do thing\nDesc.\n`
    const planPath = writePlan(cwd, content, '2026-03-25-my-feature.md')
    const { stdout, exitCode } = pm(`bridge ${planPath}`, cwd)

    expect(exitCode).toBe(0)
    expect(stdout).toContain('my feature') // derived from filename
  })
})

describe('pm bridge — error handling', () => {
  it('errors on missing file', () => {
    const { stdout, exitCode } = pm(`bridge /nonexistent/plan.md`, cwd)
    expect(exitCode).toBe(1)
    expect(stdout).toContain('not found')
  })

  it('errors when no phases or tasks found', () => {
    const planPath = writePlan(cwd, '# Just a title\n\nNo phases here.')
    const { stdout, exitCode } = pm(`bridge ${planPath}`, cwd)
    expect(exitCode).toBe(1)
    expect(stdout).toContain('Could not parse plan structure')
  })
})

describe('pm bridge — output includes start command', () => {
  it('shows pm start command for first task', () => {
    const planPath = writePlan(cwd, SIMPLE_PLAN)
    const { stdout } = pm(`bridge ${planPath} --agent claude-code --model my-model`, cwd)

    expect(stdout).toContain('pm start')
    expect(stdout).toContain('--agent claude-code')
  })
})
```

- [ ] **Step 4.2: Run tests to verify they fail**

```bash
cd /Users/piotrjura/life/pm && npm test -- test/bridge.test.ts 2>&1 | tail -20
```

Expected: FAIL — `bridge` command not found

- [ ] **Step 4.3: Add `planSource` to `Feature` in `src/lib/types.ts`**

```typescript
export interface Feature {
  id: string
  type: 'feature' | 'fix'
  title: string
  description?: string
  status: 'draft' | 'planned' | 'in-progress' | 'done'
  phases: Phase[]
  decisions?: Decision[]
  /** Path to superpowers plan file this feature was imported from */
  planSource?: string
  createdAt: string
  updatedAt: string
  doneAt?: string
}
```

- [ ] **Step 4.4: Create `src/commands/bridge.ts`**

```typescript
import { readFileSync, existsSync } from 'node:fs'
import { basename } from 'node:path'
import { addFeature, updateFeature, addPhaseToFeature, addTaskToPhase, loadStore } from '../lib/store.js'
import { parseFlag } from '../lib/args.js'

interface ParsedTask {
  title: string
  description?: string
  files?: string[]
}

interface ParsedPhase {
  title: string
  tasks: ParsedTask[]
}

interface ParsedPlan {
  title: string
  phases: ParsedPhase[]
}

/** Derive a readable title from a filename like "2026-03-25-my-feature.md" -> "My feature" */
function titleFromFilename(filename: string): string | undefined {
  const stem = basename(filename, '.md')
  // Strip leading date pattern (YYYY-MM-DD-)
  const stripped = stem.replace(/^\d{4}-\d{2}-\d{2}-/, '')
  if (!stripped) return undefined
  // Replace hyphens with spaces, capitalize first letter
  return stripped.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase())
}

/** Parse a superpowers plan markdown file into structured data. */
function parsePlan(content: string, filename: string): ParsedPlan | { error: string } {
  const lines = content.split('\n')

  // Extract title from first # heading
  let title: string | undefined
  for (const line of lines) {
    if (line.startsWith('# ')) {
      title = line.slice(2).trim()
      break
    }
  }

  // Fallback: derive from filename
  if (!title) {
    title = titleFromFilename(filename)
  }

  if (!title) {
    return { error: 'Could not determine feature title. Add a # heading to the plan file.' }
  }

  const phases: ParsedPhase[] = []
  let currentPhase: ParsedPhase | null = null
  let currentTask: ParsedTask | null = null
  const descLines: string[] = []

  const flushTask = () => {
    if (currentTask && currentPhase) {
      if (descLines.length > 0) {
        currentTask.description = descLines.join('\n').trim() || undefined
      }
      currentPhase.tasks.push(currentTask)
      currentTask = null
      descLines.length = 0
    }
  }

  const flushPhase = () => {
    flushTask()
    if (currentPhase) phases.push(currentPhase)
    currentPhase = null
  }

  for (const line of lines) {
    // ## Phase N: Title  or  ## Step N: Title  or  ## Title
    if (/^## /.test(line)) {
      flushPhase()
      const raw = line.slice(3).trim()
      // Strip "Phase N: " or "Step N: " prefix
      const phaseTitle = raw.replace(/^(Phase|Step)\s+\d+(\.\d+)*:\s*/i, '')
      currentPhase = { title: phaseTitle, tasks: [] }
      continue
    }

    // ### Task N.M: Title  or  ### Title
    if (/^### /.test(line)) {
      flushTask()
      const raw = line.slice(4).trim()
      const taskTitle = raw.replace(/^Task\s+[\d.]+:\s*/i, '')
      currentTask = { title: taskTitle }
      continue
    }

    if (currentTask) {
      // Extract files from **Files:** line
      if (/^\*\*Files:\*\*/.test(line)) {
        const filesStr = line.replace(/^\*\*Files:\*\*\s*/, '')
        currentTask.files = filesStr
          .split(',')
          .map(f => f.trim().replace(/^`|`$/g, ''))
          .filter(Boolean)
        continue
      }
      // Accumulate description (skip blank lines at start)
      if (line.trim() || descLines.length > 0) {
        descLines.push(line)
      }
    }
  }

  flushPhase()

  if (phases.length === 0 || phases.every(p => p.tasks.length === 0)) {
    return { error: 'Could not parse plan structure. Expected ## Phase and ### Task headings.' }
  }

  return { title, phases }
}

export function cmdBridge(args: string[]) {
  const planPath = args[0]
  if (!planPath) {
    console.error('Usage: pm bridge <plan-file> [--agent <name>] [--model <name>]')
    process.exit(1)
  }

  if (!existsSync(planPath)) {
    console.error(`Plan file not found: ${planPath}`)
    process.exit(1)
  }

  const agent = parseFlag(args, '--agent')
  const model = parseFlag(args, '--model')

  const content = readFileSync(planPath, 'utf-8')
  const parsed = parsePlan(content, planPath)

  if ('error' in parsed) {
    console.error(parsed.error)
    process.exit(1)
  }

  // Idempotency: check if already imported by planSource or title
  const store = loadStore()
  const existing = store.features.find(f =>
    f.planSource === planPath || f.title === parsed.title
  )
  if (existing) {
    console.log(`Already imported. Use pm show ${existing.id} to view.`)
    process.exit(0)
  }

  // Create feature
  const feature = addFeature(parsed.title, undefined, 'feature')
  updateFeature(feature.id, { planSource: planPath })

  const lines: string[] = [`Created feature: "${parsed.title}" (${feature.id})`]
  let firstTaskId: string | undefined

  for (const phase of parsed.phases) {
    const createdPhase = addPhaseToFeature(feature.id, phase.title)
    if (!createdPhase) continue
    lines.push(`  Phase: ${phase.title} (${createdPhase.id})`)

    for (const task of phase.tasks) {
      const createdTask = addTaskToPhase(feature.id, createdPhase.id, {
        title: task.title,
        description: task.description,
        files: task.files,
        agent,
        model,
      })
      if (!createdTask) continue
      if (!firstTaskId) firstTaskId = createdTask.id
      lines.push(`    Task: ${task.title} (${createdTask.id})`)
    }
  }

  lines.push('')
  lines.push('Start work:')
  const idSuffix = [agent && `--agent ${agent}`, model && `--model ${model}`].filter(Boolean).join(' ')
  lines.push(`  pm start ${firstTaskId ?? '?'}${idSuffix ? ' ' + idSuffix : ''}`)

  console.log(lines.join('\n'))
}
```

- [ ] **Step 4.5: Register `bridge` in `src/cli.tsx`**

Add the import after the existing imports:

```typescript
import { cmdBridge } from './commands/bridge.js'
```

Add the case in the switch block (after the `settings` case, before `help`):

```typescript
  case 'bridge':
    cmdBridge(rest)
    break
```

Update the help text to include:
```
  pm bridge <plan-file>  Import a superpowers plan into pm feature/phase/task structure
```

- [ ] **Step 4.6: Run bridge tests**

```bash
cd /Users/piotrjura/life/pm && npm test -- test/bridge.test.ts 2>&1 | tail -40
```

Expected: All PASS

- [ ] **Step 4.7: Run full test suite**

```bash
cd /Users/piotrjura/life/pm && npm test 2>&1 | tail -20
```

Expected: All tests pass

- [ ] **Step 4.8: Commit**

```bash
cd /Users/piotrjura/life/pm && git add src/lib/types.ts src/lib/store.ts src/commands/bridge.ts src/cli.tsx test/bridge.test.ts
git commit -m "feat: pm bridge command to import superpowers plan files"
```

---

## Final: Build and Verify

- [ ] **Step 5.1: Build the package**

```bash
cd /Users/piotrjura/life/pm && npm run build 2>&1 | tail -20
```

Expected: Clean build, no TypeScript errors

- [ ] **Step 5.2: Smoke test bridge command end-to-end**

```bash
pm bridge docs/superpowers/plans/2026-03-25-agent-friendly-error-recovery.md --agent claude-code --model 'claude-sonnet-4-6'
```

Expected: Feature created with phases and tasks matching the plan file

- [ ] **Step 5.3: Final commit**

```bash
cd /Users/piotrjura/life/pm && git add -p && git commit -m "build: compile agent-friendly error recovery changes"
```
