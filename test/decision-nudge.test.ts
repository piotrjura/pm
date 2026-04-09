import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTestDir, cleanupTestDir, pm, createFullFeature } from './helpers.js'

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

describe('decision nudge in prompt-context', () => {
  it('nudges when issue has edits but no decisions', () => {
    pm('init', cwd)
    const issue = pm('add-issue "Refactor config"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    writeSession(cwd, issueId, 2, 3) // 3 edits, no decisions

    const result = runHook('prompt-context', cwd, JSON.stringify({ prompt: 'continue' }))
    expect(result.stdout).toContain('No decisions recorded')
    expect(result.stdout).toContain('pm decide')
    expect(result.stdout).toContain(issueId)
  })

  it('nudges when task has edits but no decisions', () => {
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)

    writeSession(cwd, taskId, 2, 3)

    const result = runHook('prompt-context', cwd, JSON.stringify({ prompt: 'next step' }))
    expect(result.stdout).toContain('No decisions recorded')
    expect(result.stdout).toContain('pm decide')
  })

  it('does not nudge when decisions exist on the current item', () => {
    pm('init', cwd)
    const issue = pm('add-issue "Config rework"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    pm(`decide ${issueId} "Use JSON format" --reasoning "Simpler"`, cwd)
    writeSession(cwd, issueId, 2, 3)

    const result = runHook('prompt-context', cwd, JSON.stringify({ prompt: 'continue' }))
    expect(result.stdout).not.toContain('No decisions recorded')
  })

  it('does not nudge when edits are below threshold', () => {
    pm('init', cwd)
    const issue = pm('add-issue "Tiny tweak"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    writeSession(cwd, issueId, 1, 2) // only 2 edits

    const result = runHook('prompt-context', cwd, JSON.stringify({ prompt: 'go' }))
    expect(result.stdout).not.toContain('No decisions recorded')
  })

  it('does not nudge when feature has decisions (even if task has none)', () => {
    const { featureId, taskId } = createFullFeature(cwd)
    pm(`decide ${featureId} "Use event sourcing" --reasoning "Audit trail"`, cwd)
    pm(`start ${taskId}`, cwd)

    writeSession(cwd, taskId, 2, 4)

    const result = runHook('prompt-context', cwd, JSON.stringify({ prompt: 'go' }))
    expect(result.stdout).not.toContain('No decisions recorded')
  })
})

function writeReadSession(dir: string, activeId: string, readCount: number, grepCount: number) {
  const pmDir = join(dir, '.pm')
  if (!existsSync(pmDir)) mkdirSync(pmDir, { recursive: true })
  writeFileSync(join(pmDir, 'session.json'), JSON.stringify({
    activeId,
    files: [],
    editCount: 0,
    readCount,
    grepCount,
  }))
}

describe('subagent nudge in prompt-context', () => {
  it('pre-read hook increments readCount when tool is Read', () => {
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)

    runHook('pre-read', cwd, JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '/some/file.ts' } }))
    runHook('pre-read', cwd, JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '/other/file.ts' } }))

    const session = JSON.parse(
      readFileSync(join(cwd, '.pm', 'session.json'), 'utf-8'),
    )
    expect(session.readCount).toBe(2)
    expect(session.grepCount ?? 0).toBe(0)
  })

  it('pre-read hook increments grepCount when tool is Grep', () => {
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)

    runHook('pre-read', cwd, JSON.stringify({ tool_name: 'Grep', tool_input: { pattern: 'foo' } }))

    const session = JSON.parse(
      readFileSync(join(cwd, '.pm', 'session.json'), 'utf-8'),
    )
    expect(session.grepCount).toBe(1)
    expect(session.readCount ?? 0).toBe(0)
  })

  it('pre-read hook ignores other tools', () => {
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)

    runHook('pre-read', cwd, JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' } }))

    // No session file should have been written, or if it was it has zero counts
    const sessionPath = join(cwd, '.pm', 'session.json')
    if (existsSync(sessionPath)) {
      const session = JSON.parse(readFileSync(sessionPath, 'utf-8'))
      expect(session.readCount ?? 0).toBe(0)
      expect(session.grepCount ?? 0).toBe(0)
    }
  })

  it('nudges at threshold of 3 reads', () => {
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    writeReadSession(cwd, taskId, 3, 0)

    const result = runHook('prompt-context', cwd, JSON.stringify({ prompt: 'go' }))
    expect(result.stdout).toContain('Subagents:')
    expect(result.stdout).toContain('3 reads')
    expect(result.stdout).toContain('Explore agent')
  })

  it('grep counts as 2 — single grep + single read triggers the nudge', () => {
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    writeReadSession(cwd, taskId, 1, 1) // 1 + 2*1 = 3

    const result = runHook('prompt-context', cwd, JSON.stringify({ prompt: 'go' }))
    expect(result.stdout).toContain('Subagents:')
    expect(result.stdout).toContain('1 read')
    expect(result.stdout).toContain('1 grep')
  })

  it('two greps alone trigger the nudge', () => {
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    writeReadSession(cwd, taskId, 0, 2) // 0 + 2*2 = 4

    const result = runHook('prompt-context', cwd, JSON.stringify({ prompt: 'go' }))
    expect(result.stdout).toContain('Subagents:')
    expect(result.stdout).toContain('2 greps')
  })

  it('does not nudge below threshold', () => {
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    writeReadSession(cwd, taskId, 2, 0) // 2 < 3

    const result = runHook('prompt-context', cwd, JSON.stringify({ prompt: 'go' }))
    expect(result.stdout).not.toContain('Subagents:')
  })

  it('nudge persists across prompts until task changes', () => {
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    writeReadSession(cwd, taskId, 4, 0)

    const r1 = runHook('prompt-context', cwd, JSON.stringify({ prompt: 'first' }))
    const r2 = runHook('prompt-context', cwd, JSON.stringify({ prompt: 'second' }))
    expect(r1.stdout).toContain('Subagents:')
    expect(r2.stdout).toContain('Subagents:')
  })
})
