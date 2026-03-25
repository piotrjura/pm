import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync } from 'node:fs'
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
    const { stdout } = pm(`bridge ${planPath} --agent claude-code --model my-model`, cwd)

    expect(stdout).toContain('pm start')
    expect(stdout).toContain('--agent claude-code')
  })
})
