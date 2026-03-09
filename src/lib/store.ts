import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { nanoid } from 'nanoid'
import type { DataStore, Feature, Phase, Issue, Task, LogEntry, NextTask, Decision } from './types.js'
import { PM_VERSION } from './version.js'

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
    const empty: DataStore = { pmVersion: PM_VERSION, features: [], issues: [], log: [] }
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
  if (data.pmVersion !== PM_VERSION) { data.pmVersion = PM_VERSION; migrated = true }
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

    const eligible: Array<{ task: Task; phase: Phase; priority: number }> = []
    for (const phase of feature.phases) {
      for (const task of phase.tasks) {
        if (task.status !== 'pending') continue
        eligible.push({ task, phase, priority: task.priority ?? 3 })
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

// Decision search

export interface DecisionMatch {
  decision: Decision
  /** Where this decision lives */
  source:
    | { type: 'feature'; featureId: string; featureTitle: string }
    | { type: 'task'; featureId: string; featureTitle: string; taskId: string; taskTitle: string }
    | { type: 'issue'; issueId: string; issueTitle: string }
}

/** Search all decisions across features, tasks, and issues. Case-insensitive substring match on decision text and reasoning. */
export function searchDecisions(query: string): DecisionMatch[] {
  const store = loadStore()
  const q = query.toLowerCase()
  const matches: DecisionMatch[] = []

  for (const feature of store.features) {
    // Feature-level decisions
    for (const d of feature.decisions ?? []) {
      if (matchesDecision(d, q)) {
        matches.push({ decision: d, source: { type: 'feature', featureId: feature.id, featureTitle: feature.title } })
      }
    }
    // Task-level decisions
    for (const phase of feature.phases) {
      for (const task of phase.tasks) {
        for (const d of task.decisions ?? []) {
          if (matchesDecision(d, q)) {
            matches.push({ decision: d, source: { type: 'task', featureId: feature.id, featureTitle: feature.title, taskId: task.id, taskTitle: task.title } })
          }
        }
      }
    }
  }

  // Issue-level decisions
  for (const issue of store.issues) {
    for (const d of issue.decisions ?? []) {
      if (matchesDecision(d, q)) {
        matches.push({ decision: d, source: { type: 'issue', issueId: issue.id, issueTitle: issue.title } })
      }
    }
  }

  // Sort newest first
  matches.sort((a, b) => b.decision.at.localeCompare(a.decision.at))
  return matches
}

// Cleanup — reset stuck/error tasks, delete empty drafts, get action items

export interface ResetResult {
  tasksReset: Array<{ taskId: string; taskTitle: string; featureTitle: string }>
  featuresReverted: Array<{ featureId: string; featureTitle: string }>
}

export interface ActionItems {
  errorTasks: Array<{ taskId: string; taskTitle: string; featureTitle: string }>
  emptyDrafts: Array<{ featureId: string; featureTitle: string }>
  openIssues: Array<{ issueId: string; issueTitle: string; priority: string }>
}

/** Reset all in-progress tasks to pending. Returns what was reset. */
export function resetStuckTasks(): ResetResult {
  const store = loadStore()
  const tasksReset: ResetResult['tasksReset'] = []
  const featuresReverted: ResetResult['featuresReverted'] = []

  for (const feature of store.features) {
    if (feature.status === 'done') continue

    let hadInProgress = false
    for (const phase of feature.phases) {
      for (const task of phase.tasks) {
        if (task.status === 'in-progress') {
          hadInProgress = true
          task.status = 'pending'
          task.startedAt = undefined
          tasksReset.push({ taskId: task.id, taskTitle: task.title, featureTitle: feature.title })
        }
      }
    }

    // Fix feature status if needed
    if (hadInProgress) {
      const hasDone = feature.phases.some(p => p.tasks.some(t => t.status === 'done'))
      const hasInProgress = feature.phases.some(p => p.tasks.some(t => t.status === 'in-progress'))
      if (!hasInProgress && !hasDone) {
        feature.status = 'planned'
        featuresReverted.push({ featureId: feature.id, featureTitle: feature.title })
      }
    }
  }

  if (tasksReset.length > 0) {
    saveStore(store)
    for (const t of tasksReset) {
      for (const feature of store.features) {
        for (const phase of feature.phases) {
          const task = phase.tasks.find(tk => tk.id === t.taskId)
          if (task) {
            appendLog({
              taskId: t.taskId,
              taskTitle: t.taskTitle,
              phaseId: phase.id,
              phaseTitle: phase.title,
              featureId: feature.id,
              featureTitle: feature.title,
              action: 'reset',
              note: 'auto-reset: previous session interrupted',
            })
          }
        }
      }
    }
  }

  return { tasksReset, featuresReverted }
}

/** Reset all error tasks to pending. Returns what was reset. */
export function resetErrorTasks(): ResetResult {
  const store = loadStore()
  const tasksReset: ResetResult['tasksReset'] = []
  const featuresReverted: ResetResult['featuresReverted'] = []

  for (const feature of store.features) {
    if (feature.status === 'done') continue

    for (const phase of feature.phases) {
      for (const task of phase.tasks) {
        if (task.status === 'error') {
          task.status = 'pending'
          tasksReset.push({ taskId: task.id, taskTitle: task.title, featureTitle: feature.title })
        }
      }
    }
  }

  if (tasksReset.length > 0) {
    saveStore(store)
    for (const t of tasksReset) {
      for (const feature of store.features) {
        for (const phase of feature.phases) {
          const task = phase.tasks.find(tk => tk.id === t.taskId)
          if (task) {
            appendLog({
              taskId: t.taskId,
              taskTitle: t.taskTitle,
              phaseId: phase.id,
              phaseTitle: phase.title,
              featureId: feature.id,
              featureTitle: feature.title,
              action: 'reset',
              note: 'reset: error task cleared',
            })
          }
        }
      }
    }
  }

  return { tasksReset, featuresReverted }
}

/** Delete features that are draft with no phases. Returns deleted features. */
export function deleteEmptyDraftFeatures(): Array<{ featureId: string; featureTitle: string }> {
  const store = loadStore()
  const deleted: Array<{ featureId: string; featureTitle: string }> = []

  store.features = store.features.filter(f => {
    if (f.status === 'draft' && f.phases.length === 0) {
      deleted.push({ featureId: f.id, featureTitle: f.title })
      return false
    }
    return true
  })

  if (deleted.length > 0) saveStore(store)
  return deleted
}

/** Get action items needing attention (read-only). */
export function getActionItems(): ActionItems {
  const store = loadStore()
  const errorTasks: ActionItems['errorTasks'] = []
  const emptyDrafts: ActionItems['emptyDrafts'] = []
  const openIssues: ActionItems['openIssues'] = []

  for (const feature of store.features) {
    if (feature.status === 'draft' && feature.phases.length === 0) {
      emptyDrafts.push({ featureId: feature.id, featureTitle: feature.title })
    }
    for (const phase of feature.phases) {
      for (const task of phase.tasks) {
        if (task.status === 'error') {
          errorTasks.push({ taskId: task.id, taskTitle: task.title, featureTitle: feature.title })
        }
      }
    }
  }

  for (const issue of store.issues) {
    if (issue.status !== 'done') {
      openIssues.push({ issueId: issue.id, issueTitle: issue.title, priority: issue.priority })
    }
  }

  return { errorTasks, emptyDrafts, openIssues }
}

function matchesDecision(d: Decision, q: string): boolean {
  return d.decision.toLowerCase().includes(q) || (d.reasoning?.toLowerCase().includes(q) ?? false)
}

// Decisions

/** Add a decision to a feature, task, or issue. Searches by ID across all entities. */
export function addDecision(id: string, decision: string, reasoning?: string): Decision | null {
  const store = loadStore()
  const entry: Decision = { decision, reasoning, at: new Date().toISOString() }

  // Try features
  for (const feature of store.features) {
    if (feature.id === id) {
      feature.decisions = [...(feature.decisions ?? []), entry]
      feature.updatedAt = new Date().toISOString()
      saveStore(store)
      return entry
    }
    // Try tasks within features
    for (const phase of feature.phases) {
      const task = phase.tasks.find(t => t.id === id)
      if (task) {
        task.decisions = [...(task.decisions ?? []), entry]
        feature.updatedAt = new Date().toISOString()
        saveStore(store)
        return entry
      }
    }
  }

  // Try issues
  for (const issue of store.issues) {
    if (issue.id === id) {
      issue.decisions = [...(issue.decisions ?? []), entry]
      saveStore(store)
      return entry
    }
  }

  return null
}

