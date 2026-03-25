import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createTestDir, cleanupTestDir, pm, loadData, createFullFeature } from './helpers.js'

let cwd: string

beforeEach(() => { cwd = createTestDir() })
afterEach(() => { cleanupTestDir(cwd) })

/** Write a fake session file simulating N files edited under a given task/issue ID. */
function writeSession(dir: string, activeId: string, fileCount: number) {
  const pmDir = join(dir, '.pm')
  if (!existsSync(pmDir)) mkdirSync(pmDir, { recursive: true })
  const files = Array.from({ length: fileCount }, (_, i) => `src/file-${i + 1}.ts`)
  writeFileSync(join(pmDir, 'session.json'), JSON.stringify({
    activeId,
    files,
    editCount: fileCount * 2,
  }))
}

describe('scope warnings on pm done (tasks)', () => {
  it('allows done when files < threshold (no warning)', () => {
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    writeSession(cwd, taskId, 3) // under limit

    const { stdout, exitCode } = pm(`done ${taskId} --note "small change"`, cwd)
    expect(exitCode).toBe(0)
    expect(stdout).toContain(`Done: task ${taskId}`)
    expect(stdout).not.toContain('SCOPE')
  })

  it('warns but still completes when files >= threshold', () => {
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    writeSession(cwd, taskId, 5) // over limit

    const { stdout, exitCode } = pm(`done ${taskId}`, cwd)
    expect(exitCode).toBe(0)
    expect(stdout).toContain('SCOPE WARNING')
    expect(stdout).toContain('5 files edited')
    expect(stdout).toContain(`Done: task ${taskId}`)

    // Task should be done — not stuck
    const data = loadData(cwd)
    const task = data.features[0].phases[0].tasks[0]
    expect(task.status).toBe('done')
  })

  it('allows done with --force (suppresses warning)', () => {
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    writeSession(cwd, taskId, 6)

    const { stdout, exitCode } = pm(`done ${taskId} --force --note "legitimately big"`, cwd)
    expect(exitCode).toBe(0)
    expect(stdout).toContain(`Done: task ${taskId}`)
    expect(stdout).not.toContain('SCOPE')
  })

  it('allows done when no session file exists', () => {
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)

    const { stdout, exitCode } = pm(`done ${taskId}`, cwd)
    expect(exitCode).toBe(0)
    expect(stdout).toContain(`Done: task ${taskId}`)
  })

  it('warns at exact threshold boundary (4 files)', () => {
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    writeSession(cwd, taskId, 4) // exactly at SCOPE_WARN_FILES

    const { stdout, exitCode } = pm(`done ${taskId}`, cwd)
    expect(exitCode).toBe(0)
    expect(stdout).toContain('SCOPE WARNING')
    expect(stdout).toContain(`Done: task ${taskId}`)
  })

  it('allows done when session belongs to different task', () => {
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    writeSession(cwd, 'some-other-task', 10) // session from different task

    const { stdout, exitCode } = pm(`done ${taskId}`, cwd)
    expect(exitCode).toBe(0)
    expect(stdout).toContain(`Done: task ${taskId}`)
  })
})

describe('scope warnings on pm done (issues)', () => {
  it('allows issue done when files < threshold', () => {
    const issue = pm('add-issue "Small fix"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]
    writeSession(cwd, issueId, 2)

    const { stdout, exitCode } = pm(`done ${issueId}`, cwd)
    expect(exitCode).toBe(0)
    expect(stdout).toContain(`Done: issue ${issueId}`)
  })

  it('warns but still completes issue when files >= threshold', () => {
    const issue = pm('add-issue "Grew too big"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]
    writeSession(cwd, issueId, 5)

    const { stdout, exitCode } = pm(`done ${issueId}`, cwd)
    expect(exitCode).toBe(0)
    expect(stdout).toContain('SCOPE WARNING')
    expect(stdout).toContain(`Done: issue ${issueId}`)

    // Issue should be done — not stuck
    const data = loadData(cwd)
    expect(data.issues[0].status).toBe('done')
  })

  it('allows issue done with --force (suppresses warning)', () => {
    const issue = pm('add-issue "Big rename"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]
    writeSession(cwd, issueId, 7)

    const { stdout, exitCode } = pm(`done ${issueId} --force`, cwd)
    expect(exitCode).toBe(0)
    expect(stdout).toContain(`Done: issue ${issueId}`)
    expect(stdout).not.toContain('SCOPE')
  })
})
