import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { DataStore } from './types.js'

const PM_DATA = (cwd: string) => join(cwd, '.pm', 'data.json')
const SESSION_FILE = (cwd: string) => join(cwd, '.pm', 'session.json')

// Scope warning thresholds
const SCOPE_WARN_FILES = 4 // warn when this many unique files edited under one task

interface EditSession {
  /** ID of the active task or issue when tracking started */
  activeId: string
  /** Unique file paths edited */
  files: string[]
  /** Total edit operations */
  editCount: number
}

interface HookConfig {
  matcher: string
  hooks: Array<{ type: string; command: string; timeout?: number }>
}

interface ClaudeSettings {
  permissions?: Record<string, unknown>
  hooks?: Record<string, HookConfig[]>
  [key: string]: unknown
}

/** Check if pm has any active work (in-progress task or non-done issue). */
export function hasActiveWork(cwd: string): { active: boolean; summary?: string } {
  const dataPath = PM_DATA(cwd)
  if (!existsSync(dataPath)) return { active: true } // pm not initialized, don't block

  let store: DataStore
  try {
    store = JSON.parse(readFileSync(dataPath, 'utf-8'))
  } catch {
    return { active: true } // can't read, don't block
  }

  // Check for in-progress tasks
  for (const feature of store.features) {
    for (const phase of feature.phases) {
      for (const task of phase.tasks) {
        if (task.status === 'in-progress') {
          return { active: true, summary: `task: ${task.title} (${feature.title})` }
        }
      }
    }
  }

  // Check for non-done issues (add-issue is the "log work" step)
  for (const issue of store.issues) {
    if (issue.status !== 'done') {
      return { active: true, summary: `issue: ${issue.title}` }
    }
  }

  return { active: false }
}

/** Get the current active task/issue ID, or null. */
function getActiveId(store: DataStore): { id: string; type: 'task' | 'issue' } | null {
  for (const feature of store.features) {
    for (const phase of feature.phases) {
      for (const task of phase.tasks) {
        if (task.status === 'in-progress') return { id: task.id, type: 'task' }
      }
    }
  }
  for (const issue of store.issues) {
    if (issue.status !== 'done') return { id: issue.id, type: 'issue' }
  }
  return null
}

/** Load the edit session tracker. */
export function loadSession(cwd: string): EditSession | null {
  const path = SESSION_FILE(cwd)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

/** Record a file edit in the session tracker. Resets if the active task changed. */
export function recordEdit(cwd: string, filePath: string): EditSession {
  const dataPath = PM_DATA(cwd)
  let activeId = ''
  if (existsSync(dataPath)) {
    try {
      const store: DataStore = JSON.parse(readFileSync(dataPath, 'utf-8'))
      const active = getActiveId(store)
      if (active) activeId = active.id
    } catch {}
  }

  let session = loadSession(cwd)

  // Reset if active task changed
  if (!session || session.activeId !== activeId) {
    session = { activeId, files: [], editCount: 0 }
  }

  // Normalize to relative path for readability
  const rel = filePath.startsWith(cwd) ? relative(cwd, filePath) : filePath
  if (!session.files.includes(rel)) {
    session.files.push(rel)
  }
  session.editCount++

  writeFileSync(SESSION_FILE(cwd), JSON.stringify(session, null, 2))
  return session
}

/** Get scope-aware status summary for prompt context injection. */
export function getStatusSummary(cwd: string): string {
  const dataPath = PM_DATA(cwd)
  if (!existsSync(dataPath)) return ''

  let store: DataStore
  try {
    store = JSON.parse(readFileSync(dataPath, 'utf-8'))
  } catch {
    return ''
  }

  const active = getActiveId(store)
  const session = loadSession(cwd)

  // === No active work — tell Claude to assess scope and log work itself ===
  if (!active) {
    return `[pm] No active work tracked. You MUST log work in pm before editing any code. Assess the scope of the user's request and run the appropriate commands yourself:

  Quick one-off fix (1-2 files, small change):
    Run: pm add-issue "description"

  Structured work (3+ files, multiple logical steps):
    Run: pm add-feature "title" --description "..."
    Then: pm add-phase, pm add-task, pm start <taskId>

  Scope rules:
  - Each task = focused unit, 1-3 files, one logical change
  - 4+ files = feature with multiple tasks, not a single issue
  - Distinct stages (design, implement, test) = separate phases
  - When in doubt, start with add-issue — upgrade later if scope grows`
  }

  // === Active work — show status + scope tracking ===
  const lines: string[] = []
  const decisions: Array<{ decision: string; reasoning?: string }> = []

  // Current work
  for (const feature of store.features) {
    for (const phase of feature.phases) {
      for (const task of phase.tasks) {
        if (task.status === 'in-progress') {
          const featureProgress = feature.phases.reduce(
            (acc, p) => {
              const done = p.tasks.filter(t => t.status === 'done').length
              return { done: acc.done + done, total: acc.total + p.tasks.length }
            },
            { done: 0, total: 0 },
          )
          lines.push(`  Task: "${task.title}" (${feature.title} > ${phase.title})`)
          lines.push(`  Progress: ${featureProgress.done}/${featureProgress.total} tasks done`)

          // Collect decisions from this task and its parent feature
          if (task.decisions?.length) decisions.push(...task.decisions)
          if (feature.decisions?.length) decisions.push(...feature.decisions)
        }
      }
    }
  }
  for (const issue of store.issues) {
    if (issue.status !== 'done') {
      lines.push(`  Issue: "${issue.title}" [${issue.priority}]`)
      if (issue.decisions?.length) decisions.push(...issue.decisions)
    }
  }

  // Relevant decisions
  if (decisions.length > 0) {
    lines.push('')
    lines.push('  Decisions:')
    for (const d of decisions) {
      lines.push(`  - ${d.decision}${d.reasoning ? ` — ${d.reasoning}` : ''}`)
    }
  }

  // Scope tracking
  if (session && session.activeId === active.id && session.files.length > 0) {
    lines.push(`  Files edited: ${session.files.length} (${session.editCount} operations)`)

    if (session.files.length >= SCOPE_WARN_FILES) {
      lines.push('')
      lines.push(`  ⚠ SCOPE CHECK: ${session.files.length} files under one ${active.type}. You should break this down.`)
      if (active.type === 'issue') {
        lines.push(`  Run: pm add-feature "..." to upgrade, then add phases/tasks for remaining work.`)
      } else {
        lines.push(`  Run: pm add-task to split remaining work into additional focused tasks.`)
      }
      lines.push(`  Files so far: ${session.files.join(', ')}`)
    }
  }

  return `[pm] Active work:\n${lines.join('\n')}`
}

/** Write hook configuration to .claude/settings.json in the project. */
export function ensureHooks(cwd: string): 'added' | 'updated' | 'exists' {
  const claudeDir = join(cwd, '.claude')
  const settingsPath = join(claudeDir, 'settings.json')

  if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true })

  let settings: ClaudeSettings = {}
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) } catch {}
  }

  const desiredHooks: Record<string, HookConfig[]> = {
    PreToolUse: [
      {
        matcher: 'Edit|Write',
        hooks: [{ type: 'command', command: 'pm hook pre-edit', timeout: 5 }],
      },
    ],
    PostToolUse: [
      {
        matcher: 'Edit|Write',
        hooks: [{ type: 'command', command: 'pm hook post-edit', timeout: 5 }],
      },
    ],
    UserPromptSubmit: [
      {
        matcher: '',
        hooks: [{ type: 'command', command: 'pm hook prompt-context', timeout: 5 }],
      },
    ],
    SessionStart: [
      {
        matcher: '',
        hooks: [{ type: 'command', command: 'pm hook session-start', timeout: 10 }],
      },
    ],
  }

  const existing = settings.hooks ?? {}
  const existingStr = JSON.stringify(existing)

  // Merge pm hooks with any existing non-pm hooks
  const merged = { ...existing }
  for (const [event, configs] of Object.entries(desiredHooks)) {
    const eventHooks = merged[event] ?? []
    // Remove any existing pm hooks
    const filtered = eventHooks.filter(
      (c: HookConfig) => !c.hooks.some(h => h.command.startsWith('pm hook'))
    )
    merged[event] = [...filtered, ...configs]
  }

  settings.hooks = merged
  const mergedStr = JSON.stringify(merged)

  if (existingStr === mergedStr) return 'exists'

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')
  return Object.keys(existing).length === 0 ? 'added' : 'updated'
}
