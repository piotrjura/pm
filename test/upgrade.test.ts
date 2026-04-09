import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createTestDir, cleanupTestDir, pm, loadData } from './helpers.js'

let cwd: string

beforeEach(() => { cwd = createTestDir() })
afterEach(() => { cleanupTestDir(cwd) })

function writeSession(dir: string, activeId: string, files: string[], editCount?: number) {
  const pmDir = join(dir, '.pm')
  if (!existsSync(pmDir)) mkdirSync(pmDir, { recursive: true })
  writeFileSync(join(pmDir, 'session.json'), JSON.stringify({
    activeId,
    files,
    editCount: editCount ?? files.length,
  }))
}

describe('pm upgrade', () => {
  it('converts an issue to a feature', () => {
    pm('init', cwd)
    const issue = pm('add-issue "Refactor config"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    const result = pm(`upgrade ${issueId}`, cwd)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Upgraded issue to feature')
    expect(result.stdout).toContain('Refactor config')

    // Feature exists, issue gone
    const data = loadData(cwd)
    expect(data.issues).toHaveLength(0)
    expect(data.features).toHaveLength(1)
    expect(data.features[0].title).toBe('Refactor config')
    expect(data.features[0].upgradedFrom).toBe(issueId)
  })

  it('preserves decisions from the issue', () => {
    pm('init', cwd)
    const issue = pm('add-issue "Config format"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    pm(`decide ${issueId} "Use JSON over YAML" --reasoning "No extra dependency"`, cwd)
    pm(`decide ${issueId} "Flat structure" --reasoning "Simpler to parse"`, cwd)

    const result = pm(`upgrade ${issueId}`, cwd)
    expect(result.stdout).toContain('Preserved 2 decision(s)')

    const data = loadData(cwd)
    expect(data.features[0].decisions).toHaveLength(2)
    expect(data.features[0].decisions[0].decision).toBe('Use JSON over YAML')
    expect(data.features[0].decisions[1].decision).toBe('Flat structure')
  })

  it('maps bug type to fix', () => {
    pm('init', cwd)
    const issue = pm('add-issue "Broken parser" --type bug', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    pm(`upgrade ${issueId}`, cwd)

    const data = loadData(cwd)
    expect(data.features[0].type).toBe('fix')
  })

  it('maps change type to feature', () => {
    pm('init', cwd)
    const issue = pm('add-issue "Add logging" --type change', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    pm(`upgrade ${issueId}`, cwd)

    const data = loadData(cwd)
    expect(data.features[0].type).toBe('feature')
  })

  it('preserves description', () => {
    pm('init', cwd)
    const issue = pm('add-issue "Rework auth" --description "Need OAuth support"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    pm(`upgrade ${issueId}`, cwd)

    const data = loadData(cwd)
    expect(data.features[0].description).toBe('Need OAuth support')
  })

  it('logs the upgrade in activity log', () => {
    pm('init', cwd)
    const issue = pm('add-issue "Migrate DB"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    pm(`upgrade ${issueId}`, cwd)

    const data = loadData(cwd)
    const logEntry = data.log.find((l: { note?: string }) => l.note?.includes('upgraded'))
    expect(logEntry).toBeDefined()
    expect(logEntry.issueId).toBe(issueId)
    expect(logEntry.featureId).toBeDefined()
  })

  it('decisions remain searchable via pm why after upgrade', () => {
    pm('init', cwd)
    const issue = pm('add-issue "API design"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    pm(`decide ${issueId} "REST over GraphQL" --reasoning "Simpler for MVP"`, cwd)
    pm(`upgrade ${issueId}`, cwd)

    const why = pm('why "REST"', cwd)
    expect(why.stdout).toContain('REST over GraphQL')
    expect(why.stdout).toContain('API design')
  })

  it('fails for nonexistent issue', () => {
    pm('init', cwd)
    const result = pm('upgrade nonexistent', cwd)
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('not found')
  })

  it('shows next steps with task requirement warning', () => {
    pm('init', cwd)
    const issue = pm('add-issue "Refactor"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    const result = pm(`upgrade ${issueId}`, cwd)
    expect(result.stdout).toContain('at least 2 tasks')
    expect(result.stdout).toContain('BLOCKED')
  })
})

describe('pm upgrade — retroactive task from session', () => {
  it('creates retroactive done task from session data', () => {
    pm('init', cwd)
    const issue = pm('add-issue "Growing change"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    // Simulate edits tracked in session
    writeSession(cwd, issueId, ['src/config.ts', 'src/utils.ts', 'src/types.ts'], 7)

    const result = pm(`upgrade ${issueId}`, cwd)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('retroactive task')
    expect(result.stdout).toContain('3 files')
    expect(result.stdout).toContain('7 edits')

    const data = loadData(cwd)
    const feature = data.features[0]

    // Should have an Implementation phase with 1 done task
    expect(feature.phases).toHaveLength(1)
    expect(feature.phases[0].title).toBe('Implementation')

    const retroTask = feature.phases[0].tasks[0]
    expect(retroTask.status).toBe('done')
    expect(retroTask.files).toEqual(['src/config.ts', 'src/utils.ts', 'src/types.ts'])
    expect(retroTask.note).toContain('Retroactive')
    expect(retroTask.doneAt).toBeDefined()
  })

  it('sets feature status to planned when retroactive phase exists', () => {
    pm('init', cwd)
    const issue = pm('add-issue "Multi-file change"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    writeSession(cwd, issueId, ['src/a.ts', 'src/b.ts'], 4)
    pm(`upgrade ${issueId}`, cwd)

    const data = loadData(cwd)
    expect(data.features[0].status).toBe('planned')
  })

  it('creates draft feature when no session exists', () => {
    pm('init', cwd)
    const issue = pm('add-issue "No session"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    // No writeSession — no session.json
    pm(`upgrade ${issueId}`, cwd)

    const data = loadData(cwd)
    expect(data.features[0].status).toBe('draft')
    expect(data.features[0].phases).toHaveLength(0)
  })

  it('ignores session if activeId does not match issue', () => {
    pm('init', cwd)
    const issue = pm('add-issue "My issue"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    // Session belongs to a different issue
    writeSession(cwd, 'some-other-id', ['src/wrong.ts'], 5)
    pm(`upgrade ${issueId}`, cwd)

    const data = loadData(cwd)
    expect(data.features[0].phases).toHaveLength(0)
    expect(data.features[0].status).toBe('draft')
  })

  it('output shows phase ID for adding more tasks', () => {
    pm('init', cwd)
    const issue = pm('add-issue "Big change"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    writeSession(cwd, issueId, ['src/x.ts'], 3)

    const result = pm(`upgrade ${issueId}`, cwd)
    const featureId = result.stdout.match(/^feature:(\S+)/m)![1]

    // Should show add-task command with the auto-created phase ID
    const data = loadData(cwd)
    const phaseId = data.features[0].phases[0].id
    expect(result.stdout).toContain(`pm add-task ${featureId} ${phaseId}`)
  })

  it('sets upgradedFrom to original issue ID', () => {
    pm('init', cwd)
    const issue = pm('add-issue "Track origin"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]

    pm(`upgrade ${issueId}`, cwd)

    const data = loadData(cwd)
    expect(data.features[0].upgradedFrom).toBe(issueId)
  })
})
