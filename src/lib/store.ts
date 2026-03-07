import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { nanoid } from 'nanoid'
import type { DataStore, Feature, Phase, Issue, Task, LogEntry, NextTask } from './types.js'

const PM_DIR = join(process.cwd(), '.pm')
const DATA_FILE = join(PM_DIR, 'data.json')

function ensureDir() {
  if (!existsSync(PM_DIR)) {
    mkdirSync(PM_DIR, { recursive: true })
  }
}

export function loadStore(): DataStore {
  ensureDir()
  if (!existsSync(DATA_FILE)) {
    const empty: DataStore = { features: [], issues: [], log: [] }
    saveStore(empty)
    return empty
  }
  const raw = readFileSync(DATA_FILE, 'utf-8')
  const data = JSON.parse(raw) as DataStore & { cycles?: unknown }
  let migrated = false
  if (!data.log) { data.log = []; migrated = true }
  for (const f of data.features) {
    if (!f.type) { f.type = 'feature'; migrated = true }
  }
  for (const i of data.issues) {
    if (!i.type) { i.type = 'bug'; migrated = true }
  }
  if (data.cycles !== undefined) { delete data.cycles; migrated = true }
  if (migrated) saveStore(data)
  return data
}

function saveStore(store: DataStore) {
  ensureDir()
  writeFileSync(DATA_FILE, JSON.stringify(store, null, 2))
}

// Feature CRUD

export function addFeature(title: string, description?: string, type: Feature['type'] = 'feature'): Feature {
  const store = loadStore()
  const now = new Date().toISOString()
  const feature: Feature = {
    id: nanoid(8),
    type,
    title,
    description,
    status: 'draft',
    phases: [],
    createdAt: now,
    updatedAt: now,
  }
  store.features.push(feature)
  saveStore(store)
  return feature
}

export function updateFeature(id: string, updates: Partial<Omit<Feature, 'id' | 'createdAt'>>): Feature | null {
  const store = loadStore()
  const idx = store.features.findIndex(f => f.id === id)
  if (idx === -1) return null
  store.features[idx] = { ...store.features[idx], ...updates, updatedAt: new Date().toISOString() }
  saveStore(store)
  return store.features[idx]
}

export function deleteFeature(id: string) {
  const store = loadStore()
  store.features = store.features.filter(f => f.id !== id)
  saveStore(store)
}

export function setFeaturePhases(featureId: string, phases: Phase[]) {
  return updateFeature(featureId, { phases, status: 'planned' })
}

// Issue CRUD

export function addIssue(title: string, priority: Issue['priority'] = 'medium', description?: string, type: Issue['type'] = 'change'): Issue {
  const store = loadStore()
  const issue: Issue = {
    id: nanoid(8),
    type,
    title,
    description,
    status: 'triage',
    priority,
    createdAt: new Date().toISOString(),
  }
  store.issues.push(issue)
  saveStore(store)
  return issue
}

export function updateIssue(id: string, updates: Partial<Omit<Issue, 'id' | 'createdAt'>>): Issue | null {
  const store = loadStore()
  const idx = store.issues.findIndex(i => i.id === id)
  if (idx === -1) return null
  store.issues[idx] = { ...store.issues[idx], ...updates }
  saveStore(store)
  return store.issues[idx]
}

export function deleteIssue(id: string) {
  const store = loadStore()
  store.issues = store.issues.filter(i => i.id !== id)
  saveStore(store)
}

// Phase + Task creation (for CLI-driven agent workflow)

export function addPhaseToFeature(featureId: string, title: string): Phase | null {
  const store = loadStore()
  const feature = store.features.find(f => f.id === featureId)
  if (!feature) return null
  const phase: Phase = { id: nanoid(8), title, tasks: [] }
  feature.phases.push(phase)
  if (feature.status === 'draft') feature.status = 'planned'
  feature.updatedAt = new Date().toISOString()
  saveStore(store)
  return phase
}

export function addTaskToPhase(
  featureId: string,
  phaseId: string,
  task: Omit<Task, 'id' | 'status'>,
): Task | null {
  const store = loadStore()
  const feature = store.features.find(f => f.id === featureId)
  if (!feature) return null
  const phase = feature.phases.find(p => p.id === phaseId)
  if (!phase) return null
  const newTask: Task = { ...task, id: nanoid(8), status: 'pending' }
  phase.tasks.push(newTask)
  feature.updatedAt = new Date().toISOString()
  saveStore(store)
  return newTask
}

// Task CRUD (within features)

export function updateTask(featureId: string, taskId: string, updates: Partial<Omit<Task, 'id'>>): Task | null {
  const store = loadStore()
  const feature = store.features.find(f => f.id === featureId)
  if (!feature) return null
  for (const phase of feature.phases) {
    const idx = phase.tasks.findIndex(t => t.id === taskId)
    if (idx !== -1) {
      phase.tasks[idx] = { ...phase.tasks[idx], ...updates }
      feature.updatedAt = new Date().toISOString()
      saveStore(store)
      return phase.tasks[idx]
    }
  }
  return null
}

// Log

export function appendLog(entry: Omit<LogEntry, 'at'>): LogEntry {
  const store = loadStore()
  const full: LogEntry = { ...entry, at: new Date().toISOString() }
  store.log.push(full)
  saveStore(store)
  return full
}

export function getLog(limit = 50): LogEntry[] {
  const store = loadStore()
  return store.log.slice(-limit).reverse()
}

// Next task resolution — dep/priority-aware

export function getNextTask(): NextTask | null {
  const store = loadStore()
  for (const feature of store.features) {
    if (feature.status === 'done' || feature.status === 'draft') continue

    const doneIds = new Set<string>()
    for (const phase of feature.phases)
      for (const task of phase.tasks)
        if (task.status === 'done') doneIds.add(task.id)

    const eligible: Array<{ task: Task; phase: Phase; priority: number }> = []
    for (const phase of feature.phases) {
      for (const task of phase.tasks) {
        if (task.status !== 'pending') continue
        const deps = task.dependsOn ?? []
        if (deps.every(id => doneIds.has(id))) {
          eligible.push({ task, phase, priority: task.priority ?? 3 })
        }
      }
    }

    if (eligible.length > 0) {
      eligible.sort((a, b) => a.priority - b.priority)
      const { task, phase } = eligible[0]
      return {
        featureId: feature.id,
        featureTitle: feature.title,
        phaseId: phase.id,
        phaseTitle: phase.title,
        taskId: task.id,
        taskTitle: task.title,
        description: task.description,
        files: task.files,
      }
    }
  }
  return null
}

// Mark a task started — finds task by id across all features

export function markTaskStarted(taskId: string, agent?: string): { task: Task; next: NextTask } | null {
  const store = loadStore()
  for (const feature of store.features) {
    for (const phase of feature.phases) {
      const idx = phase.tasks.findIndex(t => t.id === taskId)
      if (idx !== -1) {
        phase.tasks[idx] = { ...phase.tasks[idx], status: 'in-progress', startedAt: new Date().toISOString() }
        if (feature.status === 'planned') {
          feature.status = 'in-progress'
        }
        feature.updatedAt = new Date().toISOString()
        saveStore(store)
        appendLog({
          taskId,
          taskTitle: phase.tasks[idx].title,
          phaseId: phase.id,
          phaseTitle: phase.title,
          featureId: feature.id,
          featureTitle: feature.title,
          action: 'started',
          agent,
        })
        return {
          task: phase.tasks[idx],
          next: {
            featureId: feature.id,
            featureTitle: feature.title,
            phaseId: phase.id,
            phaseTitle: phase.title,
            taskId,
            taskTitle: phase.tasks[idx].title,
            description: phase.tasks[idx].description,
            files: phase.tasks[idx].files,
          },
        }
      }
    }
  }
  return null
}

// Mark a task done — finds task by id across all features, auto-advances feature status

export function markTaskDone(taskId: string, agent?: string, note?: string, forceReview = false): NextTask | null {
  const store = loadStore()
  for (const feature of store.features) {
    for (const phase of feature.phases) {
      const idx = phase.tasks.findIndex(t => t.id === taskId)
      if (idx !== -1) {
        const task = phase.tasks[idx]

        if (forceReview || task.requiresReview) {
          return markTaskReview(taskId, agent)
        }

        const now = new Date().toISOString()
        phase.tasks[idx] = { ...task, status: 'done', attempt: 0, doneAt: now, note: note ?? task.note }
        feature.updatedAt = now

        // Check if entire feature is now done
        const allDone = feature.phases.every(p => p.tasks.every(t => t.status === 'done'))
        if (allDone) { feature.status = 'done'; feature.doneAt = now }
        else if (feature.status !== 'in-progress') feature.status = 'in-progress'

        saveStore(store)
        appendLog({
          taskId,
          taskTitle: task.title,
          phaseId: phase.id,
          phaseTitle: phase.title,
          featureId: feature.id,
          featureTitle: feature.title,
          action: 'completed',
          agent,
          note,
          files: task.files,
        })
        // Return the *new* next task (if any) so caller can update CLAUDE.md
        return getNextTask()
      }
    }
  }
  return null
}

// Mark task as error

export function markTaskError(taskId: string, agent?: string, note?: string): NextTask | null {
  const store = loadStore()
  for (const feature of store.features) {
    for (const phase of feature.phases) {
      const idx = phase.tasks.findIndex(t => t.id === taskId)
      if (idx !== -1) {
        phase.tasks[idx] = { ...phase.tasks[idx], status: 'error' }
        feature.updatedAt = new Date().toISOString()
        saveStore(store)
        appendLog({
          taskId,
          taskTitle: phase.tasks[idx].title,
          phaseId: phase.id,
          phaseTitle: phase.title,
          featureId: feature.id,
          featureTitle: feature.title,
          action: 'error',
          agent,
          note,
        })
        return getNextTask()
      }
    }
  }
  return null
}

// Re-queue failed/error task: increment attempt, set in-progress, return as NextTask

export function markTaskRetry(taskId: string, agent?: string, note?: string): NextTask | null {
  const store = loadStore()
  for (const feature of store.features) {
    for (const phase of feature.phases) {
      const idx = phase.tasks.findIndex(t => t.id === taskId)
      if (idx !== -1) {
        const task = phase.tasks[idx]
        const attempt = (task.attempt ?? 0) + 1
        phase.tasks[idx] = { ...task, status: 'in-progress', attempt }
        feature.updatedAt = new Date().toISOString()
        saveStore(store)
        appendLog({
          taskId,
          taskTitle: task.title,
          phaseId: phase.id,
          phaseTitle: phase.title,
          featureId: feature.id,
          featureTitle: feature.title,
          action: 'started',
          agent,
          note,
        })
        return {
          featureId: feature.id,
          featureTitle: feature.title,
          phaseId: phase.id,
          phaseTitle: phase.title,
          taskId,
          taskTitle: task.title,
          description: task.description,
          files: task.files,
        }
      }
    }
  }
  return null
}

// Move task to review status

export function markTaskReview(taskId: string, agent?: string): NextTask | null {
  const store = loadStore()
  for (const feature of store.features) {
    for (const phase of feature.phases) {
      const idx = phase.tasks.findIndex(t => t.id === taskId)
      if (idx !== -1) {
        phase.tasks[idx] = { ...phase.tasks[idx], status: 'review' }
        feature.updatedAt = new Date().toISOString()
        saveStore(store)
        appendLog({
          taskId,
          taskTitle: phase.tasks[idx].title,
          phaseId: phase.id,
          phaseTitle: phase.title,
          featureId: feature.id,
          featureTitle: feature.title,
          action: 'completed',
          agent,
          note: 'submitted for review',
        })
        return getNextTask()
      }
    }
  }
  return null
}

// Approve review task → done

export function approveTask(taskId: string): NextTask | null {
  const store = loadStore()
  for (const feature of store.features) {
    for (const phase of feature.phases) {
      const idx = phase.tasks.findIndex(t => t.id === taskId)
      if (idx !== -1) {
        const task = phase.tasks[idx]
        const now = new Date().toISOString()
        phase.tasks[idx] = { ...task, status: 'done', attempt: 0, doneAt: now }
        feature.updatedAt = now

        const allDone = feature.phases.every(p => p.tasks.every(t => t.status === 'done'))
        if (allDone) { feature.status = 'done'; feature.doneAt = now }
        else if (feature.status !== 'in-progress') feature.status = 'in-progress'

        saveStore(store)
        appendLog({
          taskId,
          taskTitle: task.title,
          phaseId: phase.id,
          phaseTitle: phase.title,
          featureId: feature.id,
          featureTitle: feature.title,
          action: 'completed',
          note: 'approved',
        })
        return getNextTask()
      }
    }
  }
  return null
}

// Reject review task → back to pending

export function rejectTask(taskId: string, note?: string): NextTask | null {
  const store = loadStore()
  for (const feature of store.features) {
    for (const phase of feature.phases) {
      const idx = phase.tasks.findIndex(t => t.id === taskId)
      if (idx !== -1) {
        const task = phase.tasks[idx]
        phase.tasks[idx] = { ...task, status: 'pending' }
        feature.updatedAt = new Date().toISOString()
        saveStore(store)
        appendLog({
          taskId,
          taskTitle: task.title,
          phaseId: phase.id,
          phaseTitle: phase.title,
          featureId: feature.id,
          featureTitle: feature.title,
          action: 'rejected',
          note,
        })
        // Return the rejected task itself as "next" so CLAUDE.md shows it
        return {
          featureId: feature.id,
          featureTitle: feature.title,
          phaseId: phase.id,
          phaseTitle: phase.title,
          taskId,
          taskTitle: task.title,
          description: task.description,
          files: task.files,
        }
      }
    }
  }
  return null
}

export function getFeatureProgress(feature: Feature): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const phase of feature.phases) {
    for (const task of phase.tasks) {
      total++
      if (task.status === 'done') done++
    }
  }
  return { done, total }
}

