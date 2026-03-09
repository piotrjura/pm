import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDir, cleanupTestDir, pm, loadData, dataFileExists, createFullFeature } from './helpers.js'

let cwd: string

beforeEach(() => { cwd = createTestDir() })
afterEach(() => { cleanupTestDir(cwd) })

describe('pm help', () => {
  it('prints usage', () => {
    const { stdout } = pm('help', cwd)
    expect(stdout).toContain('pm — project manager')
    expect(stdout).toContain('add-feature')
    expect(stdout).toContain('add-phase')
    expect(stdout).toContain('add-task')
    expect(stdout).toContain('done')
  })
})

describe('pm init', () => {
  it('creates .pm dir and data file', () => {
    const { stdout } = pm('init', cwd)
    expect(stdout).toContain('Initialized pm')
    expect(dataFileExists(cwd)).toBe(true)
  })
})

describe('pm add-feature', () => {
  it('creates a feature and prints its id', () => {
    const { stdout } = pm('add-feature "My feature"', cwd)
    expect(stdout).toMatch(/^feature:\S+/m)
    expect(stdout).toContain('Created feature: My feature')
    const data = loadData(cwd)
    expect(data.features).toHaveLength(1)
    expect(data.features[0].title).toBe('My feature')
    expect(data.features[0].status).toBe('draft')
    expect(data.features[0].type).toBe('feature')
  })

  it('supports --description', () => {
    pm('add-feature Feat --description "Some desc"', cwd)
    const data = loadData(cwd)
    expect(data.features[0].description).toBe('Some desc')
  })

  it('supports --fix type', () => {
    pm('add-feature Bugfix --fix', cwd)
    const data = loadData(cwd)
    expect(data.features[0].type).toBe('fix')
  })

  it('prints usage when no title given', () => {
    const { stdout } = pm('add-feature', cwd)
    expect(stdout).toContain('Usage:')
  })
})

describe('pm add-phase', () => {
  it('adds a phase to a feature', () => {
    const { featureId } = createFullFeature(cwd)
    const data = loadData(cwd)
    const feat = data.features.find((f: { id: string }) => f.id === featureId)
    expect(feat.phases).toHaveLength(1)
    expect(feat.phases[0].title).toBe('Phase-1')
    expect(feat.status).toBe('planned')
  })

  it('prints error for unknown feature', () => {
    pm('init', cwd)
    const { stdout } = pm('add-phase NOPE Phase', cwd)
    expect(stdout).toContain('not found')
  })
})

describe('pm add-task', () => {
  it('adds a task to a phase', () => {
    const { featureId, phaseId } = createFullFeature(cwd)
    const data = loadData(cwd)
    const feat = data.features.find((f: { id: string }) => f.id === featureId)
    const phase = feat.phases.find((p: { id: string }) => p.id === phaseId)
    expect(phase.tasks).toHaveLength(1)
    expect(phase.tasks[0].title).toBe('Task-1')
    expect(phase.tasks[0].status).toBe('pending')
  })

  it('supports --description --files --priority', () => {
    const feat = pm('add-feature F', cwd)
    const featureId = feat.stdout.match(/^feature:(\S+)/m)![1]
    const phase = pm(`add-phase ${featureId} P`, cwd)
    const phaseId = phase.stdout.match(/^phase:(\S+)/m)![1]

    pm(`add-task ${featureId} ${phaseId} T --description Desc --files a.ts,b.ts --priority 1`, cwd)

    const data = loadData(cwd)
    const task = data.features[0].phases[0].tasks[0]
    expect(task.description).toBe('Desc')
    expect(task.files).toEqual(['a.ts', 'b.ts'])
    expect(task.priority).toBe(1)
  })
})

describe('pm add-issue', () => {
  it('creates an issue with defaults', () => {
    const { stdout } = pm('add-issue "Fix bug"', cwd)
    expect(stdout).toMatch(/^issue:\S+/m)
    expect(stdout).toContain('Created [change]: Fix bug')
    const data = loadData(cwd)
    expect(data.issues).toHaveLength(1)
    expect(data.issues[0].priority).toBe('medium')
    expect(data.issues[0].type).toBe('change')
  })

  it('supports --type and --priority', () => {
    pm('add-issue Bug --type bug --priority urgent', cwd)
    const data = loadData(cwd)
    expect(data.issues[0].type).toBe('bug')
    expect(data.issues[0].priority).toBe('urgent')
  })

  it('rejects invalid priority', () => {
    const { stdout } = pm('add-issue Bug --priority nonsense', cwd)
    expect(stdout).toContain('Invalid priority')
  })

  it('rejects invalid type', () => {
    const { stdout } = pm('add-issue Bug --type nonsense', cwd)
    expect(stdout).toContain('Invalid type')
  })
})

describe('pm next', { timeout: 15_000 }, () => {
  it('shows next pending task', () => {
    const { taskId } = createFullFeature(cwd)
    const { stdout } = pm('next', cwd)
    expect(stdout).toContain('Task-1')
    expect(stdout).toContain(taskId)
  })

  it('shows "all done" when no tasks', () => {
    pm('init', cwd)
    const { stdout } = pm('next', cwd)
    expect(stdout).toContain('No pending tasks')
  })
})

describe('pm start', () => {
  it('marks task as in-progress', () => {
    const { featureId, taskId } = createFullFeature(cwd)
    const { stdout } = pm(`start ${taskId}`, cwd)
    expect(stdout).toContain('Started: Task-1')

    const data = loadData(cwd)
    const feat = data.features.find((f: { id: string }) => f.id === featureId)
    const task = feat.phases[0].tasks[0]
    expect(task.status).toBe('in-progress')
    expect(task.startedAt).toBeTruthy()
    expect(feat.status).toBe('in-progress')
  })

  it('creates a log entry', () => {
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    const data = loadData(cwd)
    expect(data.log).toHaveLength(1)
    expect(data.log[0].action).toBe('started')
    expect(data.log[0].taskId).toBe(taskId)
  })

  it('prints error for unknown task', () => {
    pm('init', cwd)
    const { stdout } = pm('start NOPE', cwd)
    expect(stdout).toContain('not found')
  })
})

describe('pm done', { timeout: 15_000 }, () => {
  it('marks task as done', () => {
    const { featureId, taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    const { stdout } = pm(`done ${taskId} --note "Finished it"`, cwd)
    expect(stdout).toContain(`Done: task ${taskId}`)
    expect(stdout).toContain('Note : Finished it')

    const data = loadData(cwd)
    const feat = data.features.find((f: { id: string }) => f.id === featureId)
    const task = feat.phases[0].tasks[0]
    expect(task.status).toBe('done')
    expect(task.note).toBe('Finished it')
    expect(task.doneAt).toBeTruthy()
  })

  it('auto-completes feature when all tasks done', () => {
    const { featureId, taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    pm(`done ${taskId}`, cwd)

    const data = loadData(cwd)
    const feat = data.features.find((f: { id: string }) => f.id === featureId)
    expect(feat.status).toBe('done')
    expect(feat.doneAt).toBeTruthy()
  })

  it('shows next task after done', () => {
    const feat = pm('add-feature F', cwd)
    const featureId = feat.stdout.match(/^feature:(\S+)/m)![1]
    const phase = pm(`add-phase ${featureId} P`, cwd)
    const phaseId = phase.stdout.match(/^phase:(\S+)/m)![1]
    const t1 = pm(`add-task ${featureId} ${phaseId} T1`, cwd)
    const taskId1 = t1.stdout.match(/^task:(\S+)/m)![1]
    pm(`add-task ${featureId} ${phaseId} T2`, cwd)

    pm(`start ${taskId1}`, cwd)
    const { stdout } = pm(`done ${taskId1}`, cwd)
    expect(stdout).toContain('Next task ready:')
    expect(stdout).toContain('T2')
  })

  it('prints "All tasks complete" when last task done', () => {
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    const { stdout } = pm(`done ${taskId}`, cwd)
    expect(stdout).toContain('All tasks complete!')
  })

  it('can mark an issue as done', () => {
    const issue = pm('add-issue "Fix it"', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]
    const { stdout } = pm(`done ${issueId}`, cwd)
    expect(stdout).toContain(`Done: issue ${issueId}`)
    const data = loadData(cwd)
    expect(data.issues[0].status).toBe('done')
  })
})

describe('pm error + retry', () => {
  it('marks task as error', () => {
    const { featureId, taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    const { stdout } = pm(`error ${taskId} --note "Something broke"`, cwd)
    expect(stdout).toContain(`Error: task ${taskId}`)

    const data = loadData(cwd)
    const task = data.features.find((f: { id: string }) => f.id === featureId).phases[0].tasks[0]
    expect(task.status).toBe('error')
  })

  it('retries an errored task', () => {
    const { featureId, taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    pm(`error ${taskId}`, cwd)
    const { stdout } = pm(`retry ${taskId}`, cwd)
    expect(stdout).toContain(`Retry: task ${taskId}`)
    expect(stdout).toContain('attempt 2 of 3')

    const data = loadData(cwd)
    const task = data.features.find((f: { id: string }) => f.id === featureId).phases[0].tasks[0]
    expect(task.status).toBe('in-progress')
    expect(task.attempt).toBe(1)
  })

  it('refuses retry at max attempts', { timeout: 15_000 }, () => {
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    pm(`error ${taskId}`, cwd)
    pm(`retry ${taskId}`, cwd)  // attempt 1 → in-progress
    pm(`error ${taskId}`, cwd)
    pm(`retry ${taskId}`, cwd)  // attempt 2 → in-progress
    pm(`error ${taskId}`, cwd)
    const { stdout } = pm(`retry ${taskId}`, cwd)  // attempt 3 → blocked (max 3)
    expect(stdout).toContain('max attempts')
  })
})

describe('pm review', { timeout: 15_000 }, () => {
  it('done --review submits for review, approve completes', () => {
    const { featureId, taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    const doneResult = pm(`done ${taskId} --review`, cwd)
    expect(doneResult.stdout).toContain('Submitted for review')

    const data1 = loadData(cwd)
    const task1 = data1.features.find((f: { id: string }) => f.id === featureId).phases[0].tasks[0]
    expect(task1.status).toBe('review')

    const approveResult = pm(`review ${taskId} --approve`, cwd)
    expect(approveResult.stdout).toContain(`Approved: task ${taskId}`)

    const data2 = loadData(cwd)
    const task2 = data2.features.find((f: { id: string }) => f.id === featureId).phases[0].tasks[0]
    expect(task2.status).toBe('done')
  })

  it('reject returns task to pending', () => {
    const { featureId, taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    pm(`done ${taskId} --review`, cwd)
    const { stdout } = pm(`review ${taskId} --reject --note "Needs work"`, cwd)
    expect(stdout).toContain(`Rejected: task ${taskId}`)

    const data = loadData(cwd)
    const task = data.features.find((f: { id: string }) => f.id === featureId).phases[0].tasks[0]
    expect(task.status).toBe('pending')
  })
})

describe('pm list', { timeout: 30_000 }, () => {
  it('shows features with task counts', () => {
    createFullFeature(cwd)
    const { stdout } = pm('list', cwd)
    expect(stdout).toContain('[PLANNED]')
    expect(stdout).toContain('Test-feature')
    expect(stdout).toContain('0/1 tasks')
    expect(stdout).toContain('Phase-1')
    expect(stdout).toContain('Task-1')
  })

  it('shows empty state', () => {
    pm('init', cwd)
    const { stdout } = pm('list', cwd)
    expect(stdout).toContain('No features yet')
  })

  it('lists multiple features with different statuses', () => {
    const { featureId: f1, taskId: t1 } = createFullFeature(cwd, 'Alpha-feature')
    createFullFeature(cwd, 'Beta-feature')
    createFullFeature(cwd, 'Gamma-feature')

    // Complete first feature to get mixed statuses
    pm(`start ${t1}`, cwd)
    pm(`done ${t1} --note "done"`, cwd)

    const { stdout } = pm('list', cwd)
    expect(stdout).toContain('Alpha-feature')
    expect(stdout).toContain('Beta-feature')
    expect(stdout).toContain('Gamma-feature')
    expect(stdout).toContain('[DONE]')
    expect(stdout).toContain('[PLANNED]')
  })

  it('lists features with multiple phases and tasks', () => {
    const feat = pm('add-feature Multi-phase', cwd)
    const featureId = feat.stdout.match(/^feature:(\S+)/m)![1]

    const p1 = pm(`add-phase ${featureId} Design`, cwd)
    const phaseId1 = p1.stdout.match(/^phase:(\S+)/m)![1]
    pm(`add-task ${featureId} ${phaseId1} Wireframes`, cwd)
    pm(`add-task ${featureId} ${phaseId1} Mockups`, cwd)

    const p2 = pm(`add-phase ${featureId} Implementation`, cwd)
    const phaseId2 = p2.stdout.match(/^phase:(\S+)/m)![1]
    pm(`add-task ${featureId} ${phaseId2} Build-UI`, cwd)
    pm(`add-task ${featureId} ${phaseId2} Write-tests`, cwd)
    pm(`add-task ${featureId} ${phaseId2} Deploy`, cwd)

    const { stdout } = pm('list', cwd)
    expect(stdout).toContain('Multi-phase')
    expect(stdout).toContain('0/5 tasks')
    expect(stdout).toContain('Design')
    expect(stdout).toContain('Implementation')
    expect(stdout).toContain('Wireframes')
    expect(stdout).toContain('Deploy')
  })
})

describe('pm show', () => {
  it('shows feature detail with ids', () => {
    const { featureId, phaseId, taskId } = createFullFeature(cwd)
    const { stdout } = pm(`show ${featureId}`, cwd)
    expect(stdout).toContain(`feature:${featureId}`)
    expect(stdout).toContain(`phase:${phaseId}`)
    expect(stdout).toContain(`task:${taskId}`)
    expect(stdout).toContain('Task-1')
  })
})

describe('pm log', () => {
  it('shows log entries after start/done', () => {
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    pm(`done ${taskId} --note "Did it"`, cwd)
    const { stdout } = pm('log', cwd)
    expect(stdout).toContain('Test-feature')
    expect(stdout).toContain('Note: Did it')
  })

  it('shows empty state', () => {
    pm('init', cwd)
    const { stdout } = pm('log', cwd)
    expect(stdout).toContain('No log entries')
  })
})

describe('pm update', () => {
  it('updates issue priority', () => {
    const issue = pm('add-issue Fix', cwd)
    const issueId = issue.stdout.match(/^issue:(\S+)/m)![1]
    const { stdout } = pm(`update ${issueId} --priority urgent`, cwd)
    expect(stdout).toContain(`Updated issue ${issueId}`)
    const data = loadData(cwd)
    expect(data.issues[0].priority).toBe('urgent')
  })

  it('updates feature title', () => {
    const feat = pm('add-feature Old', cwd)
    const featureId = feat.stdout.match(/^feature:(\S+)/m)![1]
    pm(`update ${featureId} --title New`, cwd)
    const data = loadData(cwd)
    expect(data.features[0].title).toBe('New')
  })
})


describe('full workflow', { timeout: 30_000 }, () => {
  it('feature lifecycle: create → plan → start → done', () => {
    const feat = pm('add-feature "Auth system"', cwd)
    const featureId = feat.stdout.match(/^feature:(\S+)/m)![1]

    const p1 = pm(`add-phase ${featureId} Design`, cwd)
    const phaseId1 = p1.stdout.match(/^phase:(\S+)/m)![1]
    const p2 = pm(`add-phase ${featureId} Implement`, cwd)
    const phaseId2 = p2.stdout.match(/^phase:(\S+)/m)![1]

    const t1 = pm(`add-task ${featureId} ${phaseId1} "Write spec"`, cwd)
    const taskId1 = t1.stdout.match(/^task:(\S+)/m)![1]
    const t2 = pm(`add-task ${featureId} ${phaseId2} "Build login"`, cwd)
    const taskId2 = t2.stdout.match(/^task:(\S+)/m)![1]

    // Next should show first task (highest priority / first added)
    const next1 = pm('next', cwd)
    expect(next1.stdout).toContain('Write spec')

    // Start and complete first task
    pm(`start ${taskId1}`, cwd)
    pm(`done ${taskId1} --note "Spec written"`, cwd)

    // Second task now next
    const next2 = pm('next', cwd)
    expect(next2.stdout).toContain('Build login')

    // Complete second task
    pm(`start ${taskId2}`, cwd)
    pm(`done ${taskId2} --note "Login built"`, cwd)

    // Feature should be done
    const data = loadData(cwd)
    const feature = data.features.find((f: { id: string }) => f.id === featureId)
    expect(feature.status).toBe('done')

    // Log should have 4 entries (2 starts + 2 dones)
    expect(data.log).toHaveLength(4)

    // Next should show nothing
    const next3 = pm('next', cwd)
    expect(next3.stdout).toContain('No pending tasks')
  })

  it('error → retry → done lifecycle', () => {
    const { featureId, taskId } = createFullFeature(cwd)

    pm(`start ${taskId}`, cwd)
    pm(`error ${taskId} --note "Failed first try"`, cwd)
    pm(`retry ${taskId} --note "Trying again"`, cwd)
    pm(`done ${taskId} --note Fixed`, cwd)

    const data = loadData(cwd)
    const task = data.features.find((f: { id: string }) => f.id === featureId).phases[0].tasks[0]
    expect(task.status).toBe('done')
    expect(task.note).toBe('Fixed')
  })
})
