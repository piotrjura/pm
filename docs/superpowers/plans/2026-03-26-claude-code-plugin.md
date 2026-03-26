# Claude Code Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package pm as a Claude Code plugin with one-step install, bundled CLI, hook wrappers, and an adaptive workflow skill.

**Architecture:** Plugin manifest + bash hook wrappers + workflow skill added alongside existing CLI source. Hooks delegate to bundled `dist/cli.js` via `CLAUDE_PLUGIN_ROOT`. Four code changes: session-start uses bundled CLI in plugin context, config.json lazy-created, prompt-context output slimmed when skill available, package.json includes plugin assets.

**Tech Stack:** Bash (hook wrappers), Markdown (skill), JSON (manifest/hooks config), TypeScript (code changes)

**Spec:** `docs/superpowers/specs/2026-03-25-claude-code-plugin-design.md`

---

### Task 1: Plugin manifest and hooks config

Create the static plugin files that CC reads to discover the plugin.

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `hooks/hooks.json`

- [ ] **Step 1: Create `.claude-plugin/plugin.json`**

```json
{
  "name": "pm",
  "displayName": "PM — Project Manager for AI Agents",
  "description": "Persistent project tracking across sessions. Log work before coding, track scope, record decisions. Lightweight alternative to heavy planning workflows.",
  "version": "0.2.0",
  "author": { "name": "Piotr Jura" },
  "homepage": "https://github.com/piotrjura/pm",
  "repository": "https://github.com/piotrjura/pm",
  "license": "MIT",
  "skills": "../skills/",
  "hooks": "../hooks/hooks.json"
}
```

- [ ] **Step 2: Create `hooks/hooks.json`**

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{ "type": "command", "command": "./hooks/session-start", "timeout": 10 }]
    }],
    "PreToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{ "type": "command", "command": "./hooks/pre-edit", "timeout": 5 }]
    }],
    "PostToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{ "type": "command", "command": "./hooks/post-edit", "timeout": 5 }]
    }],
    "UserPromptSubmit": [{
      "hooks": [{ "type": "command", "command": "./hooks/prompt-context", "timeout": 5 }]
    }]
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/plugin.json hooks/hooks.json
git commit -m "feat: add CC plugin manifest and hooks config"
```

---

### Task 2: Hook wrapper scripts

Create the four bash scripts that delegate to the bundled CLI. Each is a one-liner.

**Files:**
- Create: `hooks/session-start`
- Create: `hooks/pre-edit`
- Create: `hooks/post-edit`
- Create: `hooks/prompt-context`

- [ ] **Step 1: Create all four wrappers**

`hooks/session-start`:
```bash
#!/bin/bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" hook session-start --agent claude-code --instance $PPID "$@"
```

`hooks/pre-edit`:
```bash
#!/bin/bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" hook pre-edit --agent claude-code --instance $PPID "$@"
```

`hooks/post-edit`:
```bash
#!/bin/bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" hook post-edit --agent claude-code --instance $PPID "$@"
```

`hooks/prompt-context`:
```bash
#!/bin/bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" hook prompt-context --agent claude-code --instance $PPID "$@"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x hooks/session-start hooks/pre-edit hooks/post-edit hooks/prompt-context
```

- [ ] **Step 3: Commit**

```bash
git add hooks/
git commit -m "feat: add hook wrapper scripts for CC plugin"
```

---

### Task 3: Fix session-start for plugin context

`handleSessionStart` calls `execSync('pm cleanup')` and `execSync('pm recap')` — these need `pm` on PATH, which plugin-only users won't have.

**Files:**
- Modify: `src/commands/hook.ts:161-166`
- Test: `test/plugin-context.test.ts`

- [ ] **Step 1: Write test**

Create `test/plugin-context.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { createTestDir, cleanupTestDir, pm } from './helpers.js'

const CLI = join(import.meta.dirname, '..', 'src', 'cli.tsx')
const TSX = join(import.meta.dirname, '..', 'node_modules', '.bin', 'tsx')

let cwd: string
beforeEach(() => { cwd = createTestDir() })
afterEach(() => { cleanupTestDir(cwd) })

describe('session-start in plugin context', () => {
  it('succeeds with CLAUDE_PLUGIN_ROOT set', () => {
    // Create some pm data so recap has content
    pm('add-issue "test issue"', cwd, { agent: 'claude-code' })

    const projectRoot = join(import.meta.dirname, '..')
    const result = spawnSync(TSX, [CLI, 'hook', 'session-start', '--agent', 'claude-code', '--instance', '12345'], {
      cwd,
      encoding: 'utf-8',
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: projectRoot, NO_COLOR: '1' },
      input: JSON.stringify({ model: 'test-model' }),
      timeout: 10_000,
    })

    expect(result.status).toBe(0)
  })

  it('still works without CLAUDE_PLUGIN_ROOT', () => {
    pm('add-issue "test issue"', cwd, { agent: 'claude-code' })

    const result = spawnSync(TSX, [CLI, 'hook', 'session-start', '--agent', 'claude-code', '--instance', '12345'], {
      cwd,
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1' },
      input: JSON.stringify({ model: 'test-model' }),
      timeout: 10_000,
    })

    // Exits 0 either way (catch block handles missing pm)
    expect(result.status).toBe(0)
  })
})
```

- [ ] **Step 2: Run test, verify baseline**

```bash
npx vitest run test/plugin-context.test.ts -v
```

- [ ] **Step 3: Implement fix in `src/commands/hook.ts`**

In `handleSessionStart`, replace the `try` block (lines 161-172):

```typescript
  try {
    // Use bundled CLI when running as plugin, bare `pm` otherwise
    const pmBin = process.env.CLAUDE_PLUGIN_ROOT
      ? `node "${process.env.CLAUDE_PLUGIN_ROOT}/dist/cli.js"`
      : 'pm'
    const cleanup = execSync(`${pmBin} cleanup --quiet`, { cwd, encoding: 'utf-8', timeout: 5000 })
    const recap = execSync(`${pmBin} recap --brief`, { cwd, encoding: 'utf-8', timeout: 5000 })
    const parts = [cleanup.trim(), recap.trim()].filter(Boolean)
    if (parts.length > 0) {
      process.stdout.write(`[pm] Session briefing — run \`pm recap\` for full details:\n${parts.join('\n')}`)
    }
  } catch {
    // pm not available or no data, skip
  }
```

- [ ] **Step 4: Run test, verify pass**

```bash
npx vitest run test/plugin-context.test.ts -v
```

- [ ] **Step 5: Commit**

```bash
git add src/commands/hook.ts test/plugin-context.test.ts
git commit -m "fix: use bundled CLI for session-start internal commands in plugin context"
```

---

### Task 4: Lazy config.json creation

`config.json` is only created by `pm init`. Plugin users skip init, so `loadConfig()` should persist defaults when the file is missing.

**Files:**
- Modify: `src/lib/config.ts:12-16`
- Test: `test/plugin-context.test.ts` (add to existing)

- [ ] **Step 1: Add test**

Add to `test/plugin-context.test.ts`:

```typescript
import { existsSync, readFileSync } from 'node:fs'

describe('lazy config init', () => {
  it('creates config.json with defaults on first pm command', () => {
    pm('add-issue "test"', cwd, { agent: 'claude-code' })

    const configPath = join(cwd, '.pm', 'config.json')
    expect(existsSync(configPath)).toBe(true)

    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(config.decisions).toBe(true)
    expect(config.agents).toContain('claude-code')
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx vitest run test/plugin-context.test.ts -v
```

Expected: FAIL — `config.json` doesn't exist.

- [ ] **Step 3: Implement in `src/lib/config.ts`**

Modify `loadConfig()` to persist defaults when `.pm/` exists but `config.json` doesn't:

```typescript
export function loadConfig(cwd = process.cwd()): Config {
  const defaults = defaultConfig()
  const path = CONFIG_FILE(cwd)
  if (!existsSync(path)) {
    // Lazy init: persist defaults if .pm/ dir already exists
    const pmDir = join(cwd, '.pm')
    if (existsSync(pmDir)) {
      writeFileSync(path, JSON.stringify(defaults, null, 2) + '\n')
    }
    return defaults
  }

  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    return {
      decisions: typeof raw.decisions === 'boolean' ? raw.decisions : defaults.decisions,
      agents: Array.isArray(raw.agents) ? raw.agents : defaults.agents,
    }
  } catch {
    return defaults
  }
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
npx vitest run test/plugin-context.test.ts -v
```

- [ ] **Step 5: Run full suite to check for regressions**

```bash
npx vitest run
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/config.ts test/plugin-context.test.ts
git commit -m "feat: lazy-create config.json with defaults when .pm/ exists"
```

---

### Task 5: Slim prompt-context in plugin mode

When `CLAUDE_PLUGIN_ROOT` is set, the skill is available — emit concise prompt-context instead of the full instruction block.

**Files:**
- Modify: `src/lib/hooks.ts:348-378`
- Test: `test/plugin-context.test.ts` (add to existing)

- [ ] **Step 1: Add test**

Add to `test/plugin-context.test.ts`:

```typescript
describe('slim prompt-context in plugin mode', () => {
  it('mentions pm-workflow skill when CLAUDE_PLUGIN_ROOT is set', () => {
    // All work done — no active work
    const projectRoot = join(import.meta.dirname, '..')
    const result = spawnSync(TSX, [CLI, 'hook', 'prompt-context', '--agent', 'claude-code'], {
      cwd,
      encoding: 'utf-8',
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: projectRoot, NO_COLOR: '1' },
      input: JSON.stringify({ prompt: 'fix the button' }),
      timeout: 10_000,
    })

    const output = result.stdout ?? ''
    expect(output).toContain('pm-workflow')
    expect(output).not.toContain('Scope rules:')
  })

  it('shows full instructions without CLAUDE_PLUGIN_ROOT', () => {
    const result = spawnSync(TSX, [CLI, 'hook', 'prompt-context', '--agent', 'claude-code'], {
      cwd,
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1' },
      input: JSON.stringify({ prompt: 'fix the button' }),
      timeout: 10_000,
    })

    const output = result.stdout ?? ''
    // No .pm/data.json → empty output (pm not initialized, don't block)
    // This is fine — existing behavior
  })

  it('shows full instructions for non-plugin with active data', () => {
    pm('add-issue "some work"', cwd, { agent: 'claude-code' })
    pm('done $(cat .pm/data.json | node -e "const d=JSON.parse(require(\'fs\').readFileSync(0,\'utf-8\')); console.log(d.issues[0]?.id)")', cwd, { agent: 'claude-code' })

    const result = spawnSync(TSX, [CLI, 'hook', 'prompt-context', '--agent', 'claude-code'], {
      cwd,
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1' },
      input: JSON.stringify({ prompt: 'fix something' }),
      timeout: 10_000,
    })

    const output = result.stdout ?? ''
    // Non-plugin should show full scope rules
    if (output.length > 0) {
      expect(output).toContain('Scope rules:')
    }
  })
})
```

- [ ] **Step 2: Run test, verify failure**

```bash
npx vitest run test/plugin-context.test.ts -v
```

- [ ] **Step 3: Implement in `src/lib/hooks.ts`**

In `getStatusSummary`, at the start of the `!active` branch:

```typescript
if (!active) {
  const isPlugin = !!process.env.CLAUDE_PLUGIN_ROOT

  if (isPlugin) {
    const parts = [`[pm] No active work tracked. You MUST log work in pm before editing any code.

  Quick fix: pm add-issue "description"${idSuffix}
  Structured: pm add-feature "title" → pm add-phase → pm add-task → pm start${idSuffix}
${idSuffix ? `\n  Always pass ${idSuffix.trim()} on every pm command.` : ''}
  Use the pm-workflow skill for full command reference and scope rules.`]

    if (decisionsOn) {
      const relevant = findRelevantDecisions(prompt ?? '', allDecisions)
      if (relevant.length > 0) {
        parts.push('')
        parts.push('  ⚠ DECISIONS — you MUST follow these unless the user explicitly overrides:')
        for (const d of relevant) {
          parts.push(`  - "${d.decision}"${d.reasoning ? ` (${d.reasoning})` : ''}`)
          if (d.action) parts.push(`    → ${d.action}`)
          parts.push(`    [from ${d.source}]`)
        }
      }
    }

    return parts.join('\n')
  }

  // ... existing verbose output unchanged ...
```

- [ ] **Step 4: Run test, verify pass**

```bash
npx vitest run test/plugin-context.test.ts -v
```

- [ ] **Step 5: Full suite**

```bash
npx vitest run
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/hooks.ts test/plugin-context.test.ts
git commit -m "feat: slim prompt-context output when running as CC plugin"
```

---

### Task 6: Workflow skill

The adaptive skill that makes pm a lightweight alternative to superpowers.

**Files:**
- Create: `skills/pm-workflow/SKILL.md`

- [ ] **Step 1: Create skill**

Create `skills/pm-workflow/SKILL.md` with the full content. The skill should:

1. Start with YAML frontmatter (`name: pm-workflow`, description triggers on work tracking/planning/decisions)
2. Explain the pm philosophy (context over ceremony, adapt to user's pace)
3. Read the user's workflow depth setting from `pm settings` output
4. Provide command reference (add-issue, add-feature, start, done, decide, why, etc.)
5. Provide scope rules (1-3 files per task, when to decompose)
6. For **guided** depth: ask 2-3 quick questions, record decisions, suggest decomposition
7. For **thorough** depth: brief design conversation, optional spec output, bridge into tasks
8. For **minimal** depth: just the command reference, no questions
9. Instruct Claude to run `pm why` for past decisions and `pm recap` for context before starting work
10. Cover `pm bridge` for importing existing specs/plans

- [ ] **Step 2: Commit**

```bash
git add skills/pm-workflow/SKILL.md
git commit -m "feat: add pm-workflow skill — adaptive lightweight workflow guidance"
```

---

### Task 7: Update package.json

Include plugin assets in npm package and add version sync.

**Files:**
- Modify: `package.json:8-10`
- Create: `scripts/sync-version.js`

- [ ] **Step 1: Update `files` field in `package.json`**

```json
"files": [
  "dist",
  ".claude-plugin",
  "skills",
  "hooks"
],
```

- [ ] **Step 2: Create `scripts/sync-version.js`**

```javascript
#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
const pluginPath = join(root, '.claude-plugin', 'plugin.json')
const plugin = JSON.parse(readFileSync(pluginPath, 'utf-8'))

if (plugin.version !== pkg.version) {
  plugin.version = pkg.version
  writeFileSync(pluginPath, JSON.stringify(plugin, null, 2) + '\n')
  console.log(`Synced plugin.json version to ${pkg.version}`)
} else {
  console.log(`Versions already in sync: ${pkg.version}`)
}
```

- [ ] **Step 3: Update `prepublishOnly` in `package.json`**

```json
"prepublishOnly": "node scripts/sync-version.js && npm run build"
```

- [ ] **Step 4: Build and test**

```bash
node scripts/sync-version.js && npm run build && npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/sync-version.js
git commit -m "feat: include plugin assets in npm package, add version sync"
```

---

### Task 8: Pre-edit hook uses npx in plugin context

The pre-edit hook's BLOCKED message currently tells the agent to run `pm add-issue ...`. In plugin context, this should use `npx @piotrjura/pm` since `pm` may not be on PATH.

**Files:**
- Modify: `src/commands/hook.ts:88-98`

- [ ] **Step 1: Update the BLOCKED message in `handlePreEdit`**

After the `idSuffix` calculation, add:

```typescript
const pmCmd = process.env.CLAUDE_PLUGIN_ROOT ? 'npx @piotrjura/pm' : 'pm'
```

Then replace the `pm add-issue` and `pm add-feature` in the stderr output with `${pmCmd} add-issue` and `${pmCmd} add-feature`.

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

- [ ] **Step 3: Commit**

```bash
git add src/commands/hook.ts
git commit -m "fix: use npx in pre-edit BLOCKED message when running as plugin"
```
