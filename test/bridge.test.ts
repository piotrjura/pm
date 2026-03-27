import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTestDir, cleanupTestDir, pm, loadData } from './helpers.js'
import { parseSpecDecisions } from '../src/commands/bridge.js'

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
    expect(stdout).toContain('Error messages')
    expect(stdout).toContain('Update pre-edit hook')
    expect(stdout).toContain('Add identity flags')
    expect(stdout).toContain('Testing')
    expect(stdout).toContain('Write tests')

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

  it('creates tasks without agent/model fields', () => {
    const planPath = writePlan(cwd, SIMPLE_PLAN)
    pm(`bridge ${planPath}`, cwd)

    const data = loadData(cwd)
    const task = data.features[0].phases[0].tasks[0]
    expect(task.agent).toBeUndefined()
    expect(task.model).toBeUndefined()
  })
})

describe('pm bridge — idempotency', () => {
  it('skips creation if planSource already exists', () => {
    const planPath = writePlan(cwd, SIMPLE_PLAN)
    pm(`bridge ${planPath}`, cwd)
    const { stdout, exitCode } = pm(`bridge ${planPath}`, cwd)

    expect(exitCode).toBe(0)
    expect(stdout).toContain('Already imported')

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
    expect(stdout).toContain('My feature')
  })
})

describe('pm bridge — error handling', () => {
  it('errors on missing file', () => {
    const { stdout, exitCode } = pm('bridge /nonexistent/plan.md', cwd)
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
    const { stdout } = pm(`bridge ${planPath}`, cwd)

    expect(stdout).toContain('pm start')
  })
})

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

  it('errors when --spec flag has no value', () => {
    const planPath = writePlan(cwd, SIMPLE_PLAN)
    const { stdout, exitCode } = pm(`bridge ${planPath} --spec`, cwd)
    expect(exitCode).toBe(1)
    expect(stdout).toContain('Missing spec file path')
  })

  it('works without --spec flag (backward compat)', () => {
    const planPath = writePlan(cwd, SIMPLE_PLAN)
    const { stdout, exitCode } = pm(`bridge ${planPath}`, cwd)
    expect(exitCode).toBe(0)
    expect(stdout).not.toContain('Extracted')
  })
})
