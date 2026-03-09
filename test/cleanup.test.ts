import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDir, cleanupTestDir, pm, loadData, createFullFeature } from './helpers.js'

let cwd: string

beforeEach(() => { cwd = createTestDir() })
afterEach(() => { cleanupTestDir(cwd) })

describe('pm cleanup', () => {
  it('resets in-progress tasks to pending', () => {
    pm('init', cwd)
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)

    // Verify task is in-progress
    let data = loadData(cwd)
    const task = data.features[0].phases[0].tasks[0]
    expect(task.status).toBe('in-progress')

    const result = pm('cleanup', cwd)
    expect(result.stdout).toContain('Reset 1 stuck task')

    data = loadData(cwd)
    expect(data.features[0].phases[0].tasks[0].status).toBe('pending')
  })

  it('reverts feature to planned when no done tasks', () => {
    pm('init', cwd)
    const { featureId, taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)

    let data = loadData(cwd)
    expect(data.features[0].status).toBe('in-progress')

    pm('cleanup', cwd)

    data = loadData(cwd)
    expect(data.features[0].status).toBe('planned')
  })

  it('keeps feature in-progress when it has done tasks', () => {
    pm('init', cwd)
    const { featureId, phaseId, taskId } = createFullFeature(cwd)

    // Add a second task, complete it, then start the first
    const task2 = pm(`add-task ${featureId} ${phaseId} Task-2`, cwd)
    const task2Id = task2.stdout.match(/^task:(\S+)/m)![1]
    pm(`start ${task2Id}`, cwd)
    pm(`done ${task2Id}`, cwd)
    pm(`start ${taskId}`, cwd)

    // Feature is in-progress with one done + one in-progress
    let data = loadData(cwd)
    expect(data.features[0].status).toBe('in-progress')

    pm('cleanup', cwd)

    data = loadData(cwd)
    // Should stay in-progress because task2 is done
    expect(data.features[0].status).toBe('in-progress')
    expect(data.features[0].phases[0].tasks[0].status).toBe('pending')
    expect(data.features[0].phases[0].tasks[1].status).toBe('done')
  })

  it('logs reset entries', () => {
    pm('init', cwd)
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    pm('cleanup', cwd)

    const data = loadData(cwd)
    const resetEntries = data.log.filter((e: { action: string }) => e.action === 'reset')
    expect(resetEntries.length).toBe(1)
    expect(resetEntries[0].note).toContain('auto-reset')
  })

  it('--errors resets error tasks', () => {
    pm('init', cwd)
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)
    pm(`error ${taskId} --note "something broke"`, cwd)

    let data = loadData(cwd)
    expect(data.features[0].phases[0].tasks[0].status).toBe('error')

    const result = pm('cleanup --errors', cwd)
    expect(result.stdout).toContain('Reset 1 error task')

    data = loadData(cwd)
    expect(data.features[0].phases[0].tasks[0].status).toBe('pending')
  })

  it('--drafts deletes empty draft features', () => {
    pm('init', cwd)
    pm('add-feature "Empty Draft"', cwd)

    let data = loadData(cwd)
    expect(data.features.length).toBe(1)
    expect(data.features[0].status).toBe('draft')

    const result = pm('cleanup --drafts', cwd)
    expect(result.stdout).toContain('Deleted 1 empty draft')

    data = loadData(cwd)
    expect(data.features.length).toBe(0)
  })

  it('--all does everything', () => {
    pm('init', cwd)

    // Create a stuck in-progress task
    const { featureId, phaseId, taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)

    // Create an error task
    const task2 = pm(`add-task ${featureId} ${phaseId} Task-err`, cwd)
    const task2Id = task2.stdout.match(/^task:(\S+)/m)![1]
    pm(`start ${task2Id}`, cwd)
    pm(`error ${task2Id}`, cwd)

    // Create an empty draft
    pm('add-feature "Abandoned"', cwd)

    const result = pm('cleanup --all', cwd)
    expect(result.stdout).toContain('Reset 1 stuck task')
    expect(result.stdout).toContain('Reset 1 error task')
    expect(result.stdout).toContain('Deleted 1 empty draft')
  })

  it('shows "Nothing to clean up" when nothing is stuck', () => {
    pm('init', cwd)
    const result = pm('cleanup', cwd)
    expect(result.stdout).toContain('Nothing to clean up')
  })

  it('--quiet outputs concise format for hooks', () => {
    pm('init', cwd)
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd)

    const result = pm('cleanup --quiet', cwd)
    expect(result.stdout).toContain('[pm]')
    expect(result.stdout).toContain('Reset 1 stuck task')
  })
})
