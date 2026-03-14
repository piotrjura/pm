import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDir, cleanupTestDir, pm, createFullFeature } from './helpers.js'

let cwd: string

beforeEach(() => { cwd = createTestDir() })
afterEach(() => { cleanupTestDir(cwd) })

describe('pm recap', { timeout: 30_000 }, () => {
  it('shows empty state when no work tracked', () => {
    pm('init', cwd)
    const { stdout } = pm('recap', cwd)
    expect(stdout).toContain('No tracked work yet')
  })

  it('shows in-progress feature tasks', () => {
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    const { stdout } = pm('recap', cwd)
    expect(stdout).toContain('## In Progress')
    expect(stdout).toContain('Test-feature')
    expect(stdout).toContain('Task-1')
  })

  it('shows in-progress issues', () => {
    const issue = pm('add-issue "Fix the widget" --agent claude-code', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]
    pm(`start ${issueId} --agent claude-code`, cwd)
    const { stdout } = pm('recap', cwd)
    expect(stdout).toContain('## In Progress')
    expect(stdout).toContain('Fix the widget')
  })

  it('shows recent activity with feature log entries', () => {
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    const { stdout } = pm('recap', cwd)
    expect(stdout).toContain('## Recent Activity')
    expect(stdout).toContain('Test-feature > Task-1')
  })

  it('shows recent activity with issue log entries (not undefined)', () => {
    const issue = pm('add-issue "Fix a bug" --agent claude-code', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]
    pm(`done ${issueId} --agent claude-code`, cwd)
    const { stdout } = pm('recap', cwd)
    expect(stdout).toContain('## Recent Activity')
    expect(stdout).toContain('Fix a bug')
    expect(stdout).not.toContain('undefined')
  })

  it('shows next up task', () => {
    createFullFeature(cwd)
    const { stdout } = pm('recap', cwd)
    expect(stdout).toContain('## Next Up')
    expect(stdout).toContain('Task-1')
  })

  it('shows decision count', () => {
    const { featureId } = createFullFeature(cwd)
    pm(`decide ${featureId} "Use REST not GraphQL" --reasoning "Simpler"`, cwd)
    const { stdout } = pm('recap', cwd)
    expect(stdout).toContain('## Decisions')
    expect(stdout).toContain('1 recorded decision')
  })

  it('shows features section', () => {
    createFullFeature(cwd)
    const { stdout } = pm('recap', cwd)
    expect(stdout).toContain('## Features')
    expect(stdout).toContain('Test-feature')
    expect(stdout).toContain('0/1')
  })
})

describe('pm recap --brief', { timeout: 30_000 }, () => {
  it('shows condensed output', () => {
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    pm(`done ${taskId} --note "All done"`, cwd)
    const { stdout } = pm('recap --brief', cwd)
    // Brief mode should not include notes after log entries
    expect(stdout).not.toContain('All done')
  })

  it('shows issue log entries correctly (not undefined)', () => {
    const issue = pm('add-issue "Broken button" --agent claude-code', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]
    pm(`done ${issueId} --agent claude-code`, cwd)
    const { stdout } = pm('recap --brief', cwd)
    expect(stdout).toContain('Broken button')
    expect(stdout).not.toContain('undefined > undefined')
    expect(stdout).not.toContain('undefined')
  })

  it('limits recent activity to 5 entries', () => {
    // Create 6 issues to generate 12 log entries (start + done each)
    for (let i = 1; i <= 6; i++) {
      const issue = pm(`add-issue "Issue-${i}"`, cwd)
      const id = issue.stdout.match(/^issue:(\S+)/m)![1]
      pm(`done ${id}`, cwd)
    }
    const { stdout } = pm('recap --brief', cwd)
    // Count activity lines (lines starting with action icons)
    const activityLines = stdout.split('\n').filter(l => /^\s+[✓▶✗↺←]/.test(l))
    expect(activityLines.length).toBeLessThanOrEqual(5)
  })

  it('hides completed features', () => {
    const { taskId } = createFullFeature(cwd, 'Done-feature')
    pm(`start ${taskId}`, cwd)
    pm(`done ${taskId}`, cwd)
    createFullFeature(cwd, 'Active-feature')

    const { stdout } = pm('recap --brief', cwd)
    // Brief hides done features from the Features section
    if (stdout.includes('## Features')) {
      expect(stdout).toContain('Active-feature')
      expect(stdout).not.toMatch(/\[DONE\].*Done-feature/)
    }
  })

  it('mixes feature and issue log entries without undefined', () => {
    const { taskId } = createFullFeature(cwd, 'My-feature')
    pm(`start ${taskId}`, cwd)
    pm(`done ${taskId}`, cwd)

    const issue = pm('add-issue "Quick fix"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]
    pm(`done ${issueId}`, cwd)

    const { stdout } = pm('recap --brief', cwd)
    expect(stdout).toContain('Quick fix')
    expect(stdout).toContain('My-feature')
    expect(stdout).not.toContain('undefined')
  })
})
