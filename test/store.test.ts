import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createTestDir, cleanupTestDir, pm, loadData } from './helpers.js'

let cwd: string

beforeEach(() => { cwd = createTestDir() })
afterEach(() => { cleanupTestDir(cwd) })

describe('loadStore', () => {
  it('returns empty store when initialized', () => {
    pm('init', cwd)
    const data = loadData(cwd)
    expect(data.features).toEqual([])
    expect(data.issues).toEqual([])
    expect(data.log).toEqual([])
  })

  it('migrates features without type field', () => {
    mkdirSync(join(cwd, '.pm'))
    writeFileSync(join(cwd, '.pm', 'data.json'), JSON.stringify({
      features: [{ id: 'f1', title: 'Test', status: 'draft', phases: [], createdAt: '', updatedAt: '' }],
      issues: [],
      log: [],
    }))
    // next triggers loadStore + saveStore via updateClaudeMd path
    pm('next', cwd)
    const data = loadData(cwd)
    expect(data.features[0].type).toBe('feature')
  })

  it('migrates issues without type field', () => {
    mkdirSync(join(cwd, '.pm'))
    writeFileSync(join(cwd, '.pm', 'data.json'), JSON.stringify({
      features: [],
      issues: [{ id: 'i1', title: 'Bug', status: 'triage', priority: 'medium', createdAt: '' }],
      log: [],
    }))
    // add-issue triggers saveStore, which writes back migrated data
    pm('add-issue Another', cwd)
    const data = loadData(cwd)
    const bug = data.issues.find((i: { id: string }) => i.id === 'i1')
    expect(bug.type).toBe('bug')
  })

  it('drops legacy cycles field', () => {
    mkdirSync(join(cwd, '.pm'))
    writeFileSync(join(cwd, '.pm', 'data.json'), JSON.stringify({
      features: [],
      issues: [],
      log: [],
      cycles: [{ id: 'old' }],
    }))
    pm('add-issue Migrate', cwd)
    const data = loadData(cwd)
    expect(data.cycles).toBeUndefined()
  })
})

describe('addFeature', () => {
  it('creates a feature with correct fields', () => {
    const { stdout } = pm('add-feature "Test feat" --description "A description" --fix', cwd)
    expect(stdout).toContain('Created feature: Test feat')
    const data = loadData(cwd)
    expect(data.features).toHaveLength(1)
    expect(data.features[0].title).toBe('Test feat')
    expect(data.features[0].description).toBe('A description')
    expect(data.features[0].type).toBe('fix')
    expect(data.features[0].status).toBe('draft')
    expect(data.features[0].id).toBeTruthy()
  })
})

describe('getNextTask', { timeout: 15_000 }, () => {
  it('returns highest priority pending task', () => {
    const feat = pm('add-feature F', cwd)
    const featureId = feat.stdout.match(/^feature:(\S+)/m)![1]
    const phase = pm(`add-phase ${featureId} P`, cwd)
    const phaseId = phase.stdout.match(/^phase:(\S+)/m)![1]
    pm(`add-task ${featureId} ${phaseId} Low --priority 5`, cwd)
    pm(`add-task ${featureId} ${phaseId} High --priority 1`, cwd)

    const { stdout } = pm('next', cwd)
    expect(stdout).toContain('High')
  })

  it('skips draft features', () => {
    pm('add-feature Draft', cwd)
    const { stdout } = pm('next', cwd)
    expect(stdout).toContain('No pending tasks')
  })
})

describe('task lifecycle', { timeout: 30_000 }, () => {
  it('start → done transitions', () => {
    const feat = pm('add-feature F', cwd)
    const featureId = feat.stdout.match(/^feature:(\S+)/m)![1]
    const phase = pm(`add-phase ${featureId} P`, cwd)
    const phaseId = phase.stdout.match(/^phase:(\S+)/m)![1]
    const t = pm(`add-task ${featureId} ${phaseId} T`, cwd)
    const taskId = t.stdout.match(/^task:(\S+)/m)![1]

    pm(`start ${taskId} --agent test-agent`, cwd)
    let data = loadData(cwd)
    expect(data.features[0].phases[0].tasks[0].status).toBe('in-progress')
    expect(data.features[0].status).toBe('in-progress')
    expect(data.log[0].agent).toBe('test-agent')

    pm(`done ${taskId} --note "All good"`, cwd)
    data = loadData(cwd)
    const task = data.features[0].phases[0].tasks[0]
    expect(task.status).toBe('done')
    expect(task.note).toBe('All good')
    expect(task.doneAt).toBeTruthy()
    expect(data.features[0].status).toBe('done')
  })

  it('error → retry → done', () => {
    const feat = pm('add-feature F', cwd)
    const featureId = feat.stdout.match(/^feature:(\S+)/m)![1]
    const phase = pm(`add-phase ${featureId} P`, cwd)
    const phaseId = phase.stdout.match(/^phase:(\S+)/m)![1]
    const t = pm(`add-task ${featureId} ${phaseId} T`, cwd)
    const taskId = t.stdout.match(/^task:(\S+)/m)![1]

    pm(`start ${taskId}`, cwd)
    pm(`error ${taskId} --note "Broke"`, cwd)
    let data = loadData(cwd)
    expect(data.features[0].phases[0].tasks[0].status).toBe('error')

    pm(`retry ${taskId}`, cwd)
    data = loadData(cwd)
    expect(data.features[0].phases[0].tasks[0].status).toBe('in-progress')
    expect(data.features[0].phases[0].tasks[0].attempt).toBe(1)

    pm(`done ${taskId}`, cwd)
    data = loadData(cwd)
    expect(data.features[0].phases[0].tasks[0].status).toBe('done')
  })

  it('review → approve', () => {
    const feat = pm('add-feature F', cwd)
    const featureId = feat.stdout.match(/^feature:(\S+)/m)![1]
    const phase = pm(`add-phase ${featureId} P`, cwd)
    const phaseId = phase.stdout.match(/^phase:(\S+)/m)![1]
    const t = pm(`add-task ${featureId} ${phaseId} T`, cwd)
    const taskId = t.stdout.match(/^task:(\S+)/m)![1]

    pm(`start ${taskId}`, cwd)
    pm(`done ${taskId} --review`, cwd)
    let data = loadData(cwd)
    expect(data.features[0].phases[0].tasks[0].status).toBe('review')

    pm(`review ${taskId} --approve`, cwd)
    data = loadData(cwd)
    expect(data.features[0].phases[0].tasks[0].status).toBe('done')
    expect(data.features[0].status).toBe('done')
  })

  it('review → reject returns to pending', () => {
    const feat = pm('add-feature F', cwd)
    const featureId = feat.stdout.match(/^feature:(\S+)/m)![1]
    const phase = pm(`add-phase ${featureId} P`, cwd)
    const phaseId = phase.stdout.match(/^phase:(\S+)/m)![1]
    const t = pm(`add-task ${featureId} ${phaseId} T`, cwd)
    const taskId = t.stdout.match(/^task:(\S+)/m)![1]

    pm(`start ${taskId}`, cwd)
    pm(`done ${taskId} --review`, cwd)
    pm(`review ${taskId} --reject --note "Needs work"`, cwd)

    const data = loadData(cwd)
    expect(data.features[0].phases[0].tasks[0].status).toBe('pending')
  })
})

describe('progress counting', { timeout: 15_000 }, () => {
  it('tracks done vs total tasks correctly', () => {
    const feat = pm('add-feature F', cwd)
    const featureId = feat.stdout.match(/^feature:(\S+)/m)![1]
    const phase = pm(`add-phase ${featureId} P`, cwd)
    const phaseId = phase.stdout.match(/^phase:(\S+)/m)![1]
    const t1 = pm(`add-task ${featureId} ${phaseId} T1`, cwd)
    const taskId1 = t1.stdout.match(/^task:(\S+)/m)![1]
    pm(`add-task ${featureId} ${phaseId} T2`, cwd)

    pm(`start ${taskId1}`, cwd)
    pm(`done ${taskId1}`, cwd)

    const data = loadData(cwd)
    const tasks = data.features[0].phases[0].tasks
    const done = tasks.filter((t: { status: string }) => t.status === 'done').length
    expect(done).toBe(1)
    expect(tasks.length).toBe(2)
  })
})

describe('log entries', { timeout: 15_000 }, () => {
  it('records start and done actions', () => {
    const feat = pm('add-feature F', cwd)
    const featureId = feat.stdout.match(/^feature:(\S+)/m)![1]
    const phase = pm(`add-phase ${featureId} P`, cwd)
    const phaseId = phase.stdout.match(/^phase:(\S+)/m)![1]
    const t = pm(`add-task ${featureId} ${phaseId} T`, cwd)
    const taskId = t.stdout.match(/^task:(\S+)/m)![1]

    pm(`start ${taskId}`, cwd)
    pm(`done ${taskId} --note "Did it"`, cwd)

    const data = loadData(cwd)
    expect(data.log).toHaveLength(2)
    expect(data.log[0].action).toBe('started')
    expect(data.log[1].action).toBe('completed')
    expect(data.log[1].note).toBe('Did it')
  })
})
