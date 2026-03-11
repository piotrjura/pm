import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDir, cleanupTestDir, pm, loadData, createFullFeature } from './helpers.js'

let cwd: string

beforeEach(() => { cwd = createTestDir() })
afterEach(() => { cleanupTestDir(cwd) })

describe('elastic issue transitions', () => {
  it('done on triage issue works (skipping start)', () => {
    const issue = pm('add-issue "Quick fix"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    const { stdout } = pm(`done ${issueId}`, cwd)
    expect(stdout).toContain(`Done: issue ${issueId}`)

    const data = loadData(cwd)
    expect(data.issues[0].status).toBe('done')
    // Should create a log entry
    expect(data.log.some((e: { issueId: string; action: string }) =>
      e.issueId === issueId && e.action === 'completed'
    )).toBe(true)
  })

  it('done on already-done issue is idempotent', () => {
    const issue = pm('add-issue "Fix it"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    pm(`done ${issueId}`, cwd)
    const { stdout } = pm(`done ${issueId}`, cwd)
    expect(stdout).toContain('Already done')

    const data = loadData(cwd)
    expect(data.issues[0].status).toBe('done')
  })

  it('start on triage issue transitions to in-progress', () => {
    const issue = pm('add-issue "Investigate bug"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    const { stdout } = pm(`start ${issueId}`, cwd)
    expect(stdout).toContain('Started: Investigate bug')

    const data = loadData(cwd)
    expect(data.issues[0].status).toBe('in-progress')
    // Should log start
    expect(data.log.some((e: { issueId: string; action: string }) =>
      e.issueId === issueId && e.action === 'started'
    )).toBe(true)
  })

  it('start then done on issue works (full flow)', () => {
    const issue = pm('add-issue "Full flow"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    pm(`start ${issueId}`, cwd)
    pm(`done ${issueId} --note "All good"`, cwd)

    const data = loadData(cwd)
    expect(data.issues[0].status).toBe('done')
    // Should have both log entries
    expect(data.log).toHaveLength(2)
    expect(data.log[0].action).toBe('started')
    expect(data.log[1].action).toBe('completed')
  })

  it('start on already in-progress issue is idempotent', () => {
    const issue = pm('add-issue "Idempotent start"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    pm(`start ${issueId}`, cwd)
    const { stdout } = pm(`start ${issueId}`, cwd)
    // Should still succeed (idempotent)
    expect(stdout).toContain('Started')

    const data = loadData(cwd)
    // Only one log entry (second start is a no-op in store)
    const startLogs = data.log.filter((e: { action: string }) => e.action === 'started')
    expect(startLogs).toHaveLength(1)
  })

  it('start on done issue fails gracefully', () => {
    const issue = pm('add-issue "Already done"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    pm(`done ${issueId}`, cwd)
    const { stdout, exitCode } = pm(`start ${issueId}`, cwd)
    expect(stdout).toContain('already done')
    expect(exitCode).toBe(1)
  })

  it('done with note on issue preserves note in log', () => {
    const issue = pm('add-issue "Note test"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    pm(`done ${issueId} --note "Fixed the thing"`, cwd)

    const data = loadData(cwd)
    const logEntry = data.log.find((e: { issueId: string }) => e.issueId === issueId)
    expect(logEntry.note).toBe('Fixed the thing')
  })
})

describe('elastic task transitions', () => {
  it('done on pending task auto-starts it (skipping explicit start)', () => {
    const { featureId, taskId } = createFullFeature(cwd)

    const { stdout } = pm(`done ${taskId} --note "Did it all at once"`, cwd)
    expect(stdout).toContain(`Done: task ${taskId}`)

    const data = loadData(cwd)
    const task = data.features.find((f: { id: string }) => f.id === featureId).phases[0].tasks[0]
    expect(task.status).toBe('done')
    expect(task.startedAt).toBeTruthy()
    expect(task.doneAt).toBeTruthy()
    expect(task.note).toBe('Did it all at once')
  })

  it('done on already-done task is idempotent', () => {
    const { taskId } = createFullFeature(cwd)

    pm(`start ${taskId}`, cwd)
    pm(`done ${taskId}`, cwd)
    // Second done should not crash
    const { stdout } = pm(`done ${taskId}`, cwd)
    expect(stdout).toContain(`Done: task ${taskId}`)
  })

  it('feature auto-completes when last task done without explicit start', () => {
    const { featureId, taskId } = createFullFeature(cwd)

    // Skip start, go directly to done
    pm(`done ${taskId}`, cwd)

    const data = loadData(cwd)
    const feat = data.features.find((f: { id: string }) => f.id === featureId)
    expect(feat.status).toBe('done')
    expect(feat.doneAt).toBeTruthy()
  })

  it('start on done task fails gracefully', () => {
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    pm(`done ${taskId}`, cwd)

    const { stdout, exitCode } = pm(`start ${taskId}`, cwd)
    expect(stdout).toContain('not found')
    expect(exitCode).toBe(1)
  })

  it('start on already in-progress task is idempotent', () => {
    const { featureId, taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    const { stdout, exitCode } = pm(`start ${taskId}`, cwd)
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Started')

    const data = loadData(cwd)
    const task = data.features.find((f: { id: string }) => f.id === featureId).phases[0].tasks[0]
    expect(task.status).toBe('in-progress')
  })
})
