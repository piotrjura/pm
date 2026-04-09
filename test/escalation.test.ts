import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createTestDir, cleanupTestDir, pm, loadData, createFullFeature, seedAllDoctrines } from './helpers.js'

const TSX = join(import.meta.dirname, '..', 'node_modules', '.bin', 'tsx')
const CLI = join(import.meta.dirname, '..', 'src', 'cli.tsx')

let cwd: string

beforeEach(() => { cwd = createTestDir() })
afterEach(() => { cleanupTestDir(cwd) })

function writeSession(dir: string, activeId: string, fileCount: number, editCount?: number) {
  const pmDir = join(dir, '.pm')
  if (!existsSync(pmDir)) mkdirSync(pmDir, { recursive: true })
  const files = Array.from({ length: fileCount }, (_, i) => `src/file-${i + 1}.ts`)
  writeFileSync(join(pmDir, 'session.json'), JSON.stringify({
    activeId,
    files,
    editCount: editCount ?? fileCount,
  }))
}

function runHook(hookName: string, dir: string, stdin?: string) {
  return spawnSync(TSX, [CLI, 'hook', hookName], {
    input: stdin ?? '',
    encoding: 'utf-8',
    cwd: dir,
    env: { ...process.env as Record<string, string>, NO_COLOR: '1' },
    timeout: 10_000,
  })
}

describe('scope escalation — nudge', () => {
  it('nudges after 3 edits on an issue', () => {
    pm('init', cwd)
    const issue = pm('add-issue "Small fix"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    writeSession(cwd, issueId, 2, 3) // 2 files, 3 edits

    const result = runHook('prompt-context', cwd, JSON.stringify({ prompt: 'continue' }))
    expect(result.stdout).toContain('Scope check')
    expect(result.stdout).toContain('3 edits')
    expect(result.stdout).toContain('upgrade')
  })

  it('does not nudge at 2 edits on an issue', () => {
    pm('init', cwd)
    const issue = pm('add-issue "Tiny fix"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    writeSession(cwd, issueId, 1, 2)

    const result = runHook('prompt-context', cwd, JSON.stringify({ prompt: 'continue' }))
    expect(result.stdout).not.toContain('Scope check')
    expect(result.stdout).not.toContain('upgrade')
  })
})

describe('scope escalation — block', () => {
  it('blocks pre-edit when issue reaches 4 files', () => {
    pm('init', cwd)
    const issue = pm('add-issue "Growing change"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    writeSession(cwd, issueId, 4, 4) // 4 files

    const stdin = JSON.stringify({ tool_input: { file_path: `${cwd}/src/new-file.ts` } })
    const result = runHook('pre-edit', cwd, stdin)

    expect(result.status).toBe(2) // blocked
    expect(result.stderr).toContain('BLOCKED')
    expect(result.stderr).toContain('upgrade')
    expect(result.stderr).toContain(issueId)
  })

  it('blocks pre-edit when issue reaches 10 edits', () => {
    pm('init', cwd)
    const issue = pm('add-issue "Many small edits"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    writeSession(cwd, issueId, 2, 10) // 2 files but 10 edits

    const stdin = JSON.stringify({ tool_input: { file_path: `${cwd}/src/file.ts` } })
    const result = runHook('pre-edit', cwd, stdin)

    expect(result.status).toBe(2)
    expect(result.stderr).toContain('BLOCKED')
    expect(result.stderr).toContain('upgrade')
  })

  it('shows block in prompt-context too', () => {
    pm('init', cwd)
    const issue = pm('add-issue "Big change"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    writeSession(cwd, issueId, 5, 12)

    const result = runHook('prompt-context', cwd, JSON.stringify({ prompt: 'fix the bug' }))
    expect(result.stdout).toContain('BLOCKED')
    expect(result.stdout).toContain('upgrade')
  })

  it('does not block tasks — only issues', () => {
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    seedAllDoctrines(cwd)

    writeSession(cwd, taskId, 6, 15) // over all thresholds

    const stdin = JSON.stringify({ tool_input: { file_path: `${cwd}/src/file.ts` } })
    const result = runHook('pre-edit', cwd, stdin)

    expect(result.status).toBe(0) // allowed
    expect(result.stderr).not.toContain('BLOCKED')
  })

  it('does not block edits to pm/claude config files even on blocked issues', () => {
    pm('init', cwd)
    const issue = pm('add-issue "Blocked issue"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    writeSession(cwd, issueId, 5, 12) // well over limit

    const stdin = JSON.stringify({ tool_input: { file_path: `${cwd}/.pm/data.json` } })
    const result = runHook('pre-edit', cwd, stdin)

    expect(result.status).toBe(0) // pm files always allowed
  })

  it('upgrade resolves the scope block but enforces task count', () => {
    pm('init', cwd)
    const issue = pm('add-issue "Growing work"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    writeSession(cwd, issueId, 5, 12)

    // Verify it's blocked by scope
    const stdin = JSON.stringify({ tool_input: { file_path: `${cwd}/src/file.ts` } })
    const blocked = runHook('pre-edit', cwd, stdin)
    expect(blocked.status).toBe(2)

    // Upgrade — creates retroactive task from session
    const upgrade = pm(`upgrade ${issueId}`, cwd)
    const featureId = upgrade.stdout.match(/^feature:(\S+)/m)![1]

    // Use the auto-created Implementation phase
    const data = loadData(cwd)
    const phaseId = data.features[0].phases[0].id

    // Add 2 tasks (minimum required) and start one
    const task1 = pm(`add-task ${featureId} ${phaseId} "Remaining work part 1"`, cwd)
    const task1Id = task1.stdout.match(/^task:(\S+)/m)![1]
    pm(`add-task ${featureId} ${phaseId} "Remaining work part 2"`, cwd)
    pm(`start ${task1Id}`, cwd)
    seedAllDoctrines(cwd)

    // Session resets because activeId changed — now unblocked
    const unblocked = runHook('pre-edit', cwd, stdin)
    expect(unblocked.status).toBe(0)
  })
})

describe('upgrade enforcement — task count', () => {
  it('blocks edits on upgraded feature with only 1 non-done task', () => {
    pm('init', cwd)
    const issue = pm('add-issue "Big change"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    writeSession(cwd, issueId, 4, 8)

    // Upgrade — creates retroactive done task
    const upgrade = pm(`upgrade ${issueId}`, cwd)
    const featureId = upgrade.stdout.match(/^feature:(\S+)/m)![1]

    const data = loadData(cwd)
    const phaseId = data.features[0].phases[0].id

    // Add only 1 task (below minimum) and start it
    const task = pm(`add-task ${featureId} ${phaseId} "Only task"`, cwd)
    const taskId = task.stdout.match(/^task:(\S+)/m)![1]
    pm(`start ${taskId}`, cwd)

    // Should be blocked — upgraded feature needs ≥2 non-done tasks
    const stdin = JSON.stringify({ tool_input: { file_path: `${cwd}/src/new.ts` } })
    const result = runHook('pre-edit', cwd, stdin)
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('BLOCKED')
    expect(result.stderr).toContain('upgraded from an issue')
    expect(result.stderr).toContain('at least 2')
  })

  it('allows edits on upgraded feature with 2+ non-done tasks', () => {
    pm('init', cwd)
    const issue = pm('add-issue "Multi-part work"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    writeSession(cwd, issueId, 4, 8)

    const upgrade = pm(`upgrade ${issueId}`, cwd)
    const featureId = upgrade.stdout.match(/^feature:(\S+)/m)![1]

    const data = loadData(cwd)
    const phaseId = data.features[0].phases[0].id

    // Add 2 tasks and start one
    const task1 = pm(`add-task ${featureId} ${phaseId} "Part 1"`, cwd)
    const task1Id = task1.stdout.match(/^task:(\S+)/m)![1]
    pm(`add-task ${featureId} ${phaseId} "Part 2"`, cwd)
    pm(`start ${task1Id}`, cwd)
    seedAllDoctrines(cwd)

    const stdin = JSON.stringify({ tool_input: { file_path: `${cwd}/src/new.ts` } })
    const result = runHook('pre-edit', cwd, stdin)
    expect(result.status).toBe(0)
  })

  it('does not enforce task count on non-upgraded features', () => {
    const { featureId, phaseId, taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    seedAllDoctrines(cwd)

    // Feature has only 1 task but was NOT upgraded — should be allowed
    const stdin = JSON.stringify({ tool_input: { file_path: `${cwd}/src/file.ts` } })
    const result = runHook('pre-edit', cwd, stdin)
    expect(result.status).toBe(0)
  })

  it('shows enforcement in prompt-context too', () => {
    pm('init', cwd)
    const issue = pm('add-issue "Growing scope"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    writeSession(cwd, issueId, 4, 8)

    const upgrade = pm(`upgrade ${issueId}`, cwd)
    const featureId = upgrade.stdout.match(/^feature:(\S+)/m)![1]

    const data = loadData(cwd)
    const phaseId = data.features[0].phases[0].id

    // Add only 1 task and start it
    const task = pm(`add-task ${featureId} ${phaseId} "Single task"`, cwd)
    const taskId = task.stdout.match(/^task:(\S+)/m)![1]
    pm(`start ${taskId}`, cwd)

    // Prompt-context should warn about insufficient tasks
    const result = runHook('prompt-context', cwd, JSON.stringify({ prompt: 'continue' }))
    expect(result.stdout).toContain('upgraded from an issue')
    expect(result.stdout).toContain('at least 2')
  })
})
