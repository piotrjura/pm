import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { DataStore, Decision } from './types.js'
import { isDecisionsEnabled } from './config.js'

const PM_DATA = (cwd: string) => join(cwd, '.pm', 'data.json')
const SESSION_FILE = (cwd: string) => join(cwd, '.pm', 'session.json')
const IDENTITY_FILE = (cwd: string) => join(cwd, '.pm', 'identity.json')

// Scope warning thresholds
export const SCOPE_WARN_FILES = 4 // warn when this many unique files edited under one task

// Words to ignore when matching prompt text against decisions
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet',
  'if', 'then', 'than', 'that', 'this', 'it', 'its', 'i', 'we', 'you',
  'he', 'she', 'they', 'me', 'us', 'him', 'her', 'them', 'my', 'our',
  'your', 'his', 'their', 'what', 'which', 'who', 'when', 'where', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'only', 'same', 'just', 'also', 'very', 'use', 'run',
  'make', 'let', 'get', 'set', 'add', 'new', 'now', 'want', 'need',
  'like', 'change', 'don', 'doesn', 'didn', 'won', 'wouldn', 'shouldn',
])

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

/** Check if pm has any active work (in-progress task or non-done issue).
 *  When `agent` is provided, only considers work owned by that agent or unowned work.
 *  When `instance` is also provided, narrows to that specific instance. */
export function hasActiveWork(cwd: string, agent?: string, instance?: string): { active: boolean; summary?: string } {
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
        if (task.status === 'in-progress' && matchesIdentity(task, agent, instance)) {
          return { active: true, summary: `task: ${task.title} (${feature.title})` }
        }
      }
    }
  }

  // Check for non-done issues (add-issue is the "log work" step)
  for (const issue of store.issues) {
    if (issue.status !== 'done' && matchesIdentity(issue, agent, instance)) {
      return { active: true, summary: `issue: ${issue.title}` }
    }
  }

  return { active: false }
}

/** Check if a task/issue belongs to the given agent+instance.
 *  - No agent filter → matches all
 *  - Agent matches + no instance filter → matches
 *  - Agent matches + instance matches → matches
 *  - Unowned work (no agent on item) → matches any agent (backward compat) */
function matchesIdentity(item: { agent?: string; instance?: string }, agent?: string, instance?: string): boolean {
  if (!agent) return true                    // no filter
  if (!item.agent) return true               // unowned work — any agent can claim
  if (item.agent !== agent) return false      // different agent — reject
  if (!instance) return true                 // same agent, no instance filter
  if (!item.instance) return true            // same agent, item has no instance — allow
  return item.instance === instance          // same agent, match instance
}

/** Get the current active task/issue ID, or null.
 *  When `agent`/`instance` are provided, only considers matching work. */
function getActiveId(store: DataStore, agent?: string, instance?: string): { id: string; type: 'task' | 'issue' } | null {
  for (const feature of store.features) {
    for (const phase of feature.phases) {
      for (const task of phase.tasks) {
        if (task.status === 'in-progress' && matchesIdentity(task, agent, instance)) return { id: task.id, type: 'task' }
      }
    }
  }
  for (const issue of store.issues) {
    if (issue.status !== 'done' && matchesIdentity(issue, agent, instance)) return { id: issue.id, type: 'issue' }
  }
  return null
}

/** Tokenize text into meaningful words for matching. */
function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  )
}

/** Collect ALL decisions from the entire store. */
function collectAllDecisions(store: DataStore): Array<Decision & { source: string }> {
  const all: Array<Decision & { source: string }> = []
  for (const feature of store.features) {
    if (feature.decisions?.length) {
      for (const d of feature.decisions) {
        all.push({ ...d, source: `feature: ${feature.title}` })
      }
    }
    for (const phase of feature.phases) {
      for (const task of phase.tasks) {
        if (task.decisions?.length) {
          for (const d of task.decisions) {
            all.push({ ...d, source: `${feature.title} > ${task.title}` })
          }
        }
      }
    }
  }
  for (const issue of store.issues) {
    if (issue.decisions?.length) {
      for (const d of issue.decisions) {
        all.push({ ...d, source: `issue: ${issue.title}` })
      }
    }
  }
  return all
}

/** Find decisions whose text overlaps with the user's prompt.
 *  Adaptive threshold: short prompts (1-2 tokens) require 1 overlap; longer require 2.
 *  Noise mitigation: short-prompt matches capped at 3 results. */
export function findRelevantDecisions(
  prompt: string,
  allDecisions: Array<Decision & { source: string }>,
): Array<Decision & { source: string }> {
  if (!prompt || allDecisions.length === 0) return []

  const promptTokens = tokenize(prompt)
  if (promptTokens.size === 0) return []

  // Adaptive threshold
  const isShortPrompt = promptTokens.size <= 2
  const requiredOverlap = isShortPrompt ? 1 : 2
  const maxResults = isShortPrompt ? 3 : 5

  const matches: Array<Decision & { source: string; score: number }> = []
  for (const d of allDecisions) {
    const decisionText = `${d.decision} ${d.reasoning ?? ''}`
    const decisionTokens = tokenize(decisionText)
    let overlap = 0
    for (const token of decisionTokens) {
      if (promptTokens.has(token)) overlap++
    }
    if (overlap >= requiredOverlap) {
      matches.push({ ...d, score: overlap })
    }
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, maxResults)
}

interface AgentIdentity {
  agent?: string
  model?: string
  instance?: string
}

/** Save the agent identity for the current session so prompt-context can reference it. */
export function saveIdentity(cwd: string, identity: AgentIdentity): void {
  const pmDir = join(cwd, '.pm')
  if (!existsSync(pmDir)) mkdirSync(pmDir, { recursive: true })
  writeFileSync(IDENTITY_FILE(cwd), JSON.stringify(identity, null, 2))
}

/** Load the persisted agent identity. */
function loadIdentity(cwd: string): AgentIdentity | null {
  const path = IDENTITY_FILE(cwd)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

/** Generic filenames that need their parent dir for context. */
const GENERIC_NAMES = new Set(['types', 'index', 'utils', 'helpers', 'constants', 'config', 'schema', 'schemas'])
/** Config file extensions that have no meaningful stem. */
const CONFIG_EXTS = new Set(['.json', '.yaml', '.yml', '.toml', '.env'])

/** Infer a human-readable issue title from a file path.
 *  Returns undefined if no useful title can be derived. */
export function inferTitle(filePath: string | undefined): string | undefined {
  if (!filePath) return undefined
  const parts = filePath.replace(/\\/g, '/').split('/')
  const filename = parts[parts.length - 1]
  if (!filename) return undefined

  const dotIdx = filename.lastIndexOf('.')
  const ext = dotIdx !== -1 ? filename.slice(dotIdx) : ''
  const stem = dotIdx !== -1 ? filename.slice(0, dotIdx) : filename

  // Config files: use stem as label
  if (CONFIG_EXTS.has(ext) && stem) {
    return `Update ${stem} config`
  }

  if (!stem) return undefined

  // Generic stems: prefix with parent directory name
  if (GENERIC_NAMES.has(stem)) {
    const parent = parts[parts.length - 2]
    if (!parent) return undefined
    return `Update ${parent} ${stem}`
  }

  // Commands directory: append "command" suffix
  const parentDir = parts[parts.length - 2]
  if (parentDir === 'commands') {
    return `Update ${stem} command`
  }

  return `Update ${stem}`
}

/** Build identity flag string (e.g. "--agent claude-code --model 'claude-opus-4-6[1m]'")
 *  from the persisted identity file. Returns empty string if no identity saved. */
export function loadIdentityFlags(cwd: string): string {
  const identity = loadIdentity(cwd)
  if (!identity) return ''
  const parts: string[] = []
  if (identity.agent) parts.push(`--agent ${identity.agent}`)
  if (identity.model) {
    // Quote model values containing brackets (shell special chars)
    const model = identity.model.includes('[') ? `'${identity.model}'` : identity.model
    parts.push(`--model ${model}`)
  }
  return parts.join(' ')
}

/** Strip git worktree path prefixes from a relativized file path.
 *  `.worktrees/branch/src/foo.ts` → `src/foo.ts`
 *  `worktrees/branch/src/foo.ts` → `src/foo.ts`
 *  `src/foo.ts` → `src/foo.ts` (unchanged)
 *  Operates on already-relativized paths (after `relative(cwd, filePath)`). */
export function stripWorktreePath(relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/')
  let result = normalized
  while (/^\.?worktrees\/[^/]+\//.test(result)) {
    result = result.replace(/^\.?worktrees\/[^/]+\//, '')
  }
  return result
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

  // Normalize to relative path, strip worktree prefix
  const rawRel = filePath.startsWith(cwd) ? relative(cwd, filePath) : filePath
  const rel = stripWorktreePath(rawRel)
  if (!session.files.includes(rel)) {
    session.files.push(rel)
  }
  session.editCount++

  writeFileSync(SESSION_FILE(cwd), JSON.stringify(session, null, 2))
  return session
}

/** Get scope-aware status summary for prompt context injection.
 *  When `agent`/`instance` are provided, only shows matching work.
 *  When `prompt` is provided, searches all decisions for relevance. */
export function getStatusSummary(cwd: string, agent?: string, instance?: string, prompt?: string): string {
  const dataPath = PM_DATA(cwd)
  if (!existsSync(dataPath)) return ''

  let store: DataStore
  try {
    store = JSON.parse(readFileSync(dataPath, 'utf-8'))
  } catch {
    return ''
  }

  const active = getActiveId(store, agent, instance)
  const session = loadSession(cwd)
  const decisionsOn = isDecisionsEnabled(cwd)
  const allDecisions = decisionsOn ? collectAllDecisions(store) : []

  // Build identity flags string from persisted identity (saved at SessionStart)
  const identity = loadIdentity(cwd)
  const idFlags: string[] = []
  if (identity?.agent) idFlags.push(`--agent ${identity.agent}`)
  if (identity?.model) idFlags.push(`--model ${identity.model}`)
  const idSuffix = idFlags.length > 0 ? ' ' + idFlags.join(' ') : ''

  // === No active work — tell Claude to assess scope and log work itself ===
  if (!active) {
    const parts = [`[pm] No active work tracked. You MUST log work in pm before editing any code. Assess the scope of the user's request and run the appropriate commands yourself:

  Quick one-off fix (1-2 files, small change):
    Run: pm add-issue "description"${idSuffix}

  Structured work (3+ files, multiple logical steps):
    Run: pm add-feature "title" --description "..."
    Then: pm add-phase, pm add-task, pm start <taskId>${idSuffix}
${idSuffix ? `\n  IMPORTANT: Always pass ${idSuffix.trim()} on every pm command (add-issue, add-feature, start, done, decide, etc.) to record who did the work.` : ''}
  Scope rules:
  - Each task = focused unit, 1-3 files, one logical change
  - 4+ files = feature with multiple tasks, not a single issue
  - Distinct stages (design, implement, test) = separate phases
  - When in doubt, start with add-issue — upgrade later if scope grows`]

    // Surface relevant decisions from past work — BEFORE the instructions
    if (decisionsOn) {
      const relevant = findRelevantDecisions(prompt ?? '', allDecisions)
      if (relevant.length > 0) {
        parts.push('')
        parts.push('  ⚠ DECISIONS — you MUST follow these unless the user explicitly overrides:')
        for (const d of relevant) {
          parts.push(`  - "${d.decision}"${d.reasoning ? ` (${d.reasoning})` : ''}`)
          if (d.action) parts.push(`    → ${d.action}`)
          parts.push(`    [from ${d.source}]`)
        }
      }
    }

    return parts.join('\n')
  }

  // === Active work — show status + scope tracking ===
  const lines: string[] = []
  const taskDecisions: Array<{ decision: string; reasoning?: string }> = []

  // Current work
  for (const feature of store.features) {
    for (const phase of feature.phases) {
      for (const task of phase.tasks) {
        if (task.status === 'in-progress' && matchesIdentity(task, agent, instance)) {
          const featureProgress = feature.phases.reduce(
            (acc, p) => {
              const done = p.tasks.filter(t => t.status === 'done').length
              return { done: acc.done + done, total: acc.total + p.tasks.length }
            },
            { done: 0, total: 0 },
          )
          const agentLabel = task.agent ? ` [${task.agent}]` : ''
          lines.push(`  Task: "${task.title}" (${feature.title} > ${phase.title})${agentLabel}`)
          lines.push(`  Progress: ${featureProgress.done}/${featureProgress.total} tasks done`)

          // Collect decisions from this task and its parent feature
          if (task.decisions?.length) taskDecisions.push(...task.decisions)
          if (feature.decisions?.length) taskDecisions.push(...feature.decisions)
        }
      }
    }
  }
  for (const issue of store.issues) {
    if (issue.status !== 'done' && matchesIdentity(issue, agent, instance)) {
      const issueAgent = issue.agent ? ` [${issue.agent}]` : ''
      lines.push(`  Issue: "${issue.title}" [${issue.priority}]${issueAgent}`)
      if (issue.decisions?.length) taskDecisions.push(...issue.decisions)
    }
  }

  // Decisions — FIRST after status, most important context for the agent
  if (decisionsOn) {
    const allDecisionEntries: Array<{ decision: string; reasoning?: string; action?: string; source?: string }> = []

    // Current task/feature decisions (always relevant)
    for (const d of taskDecisions) {
      allDecisionEntries.push(d)
    }

    // Prompt-matched decisions from other work
    const relevant = findRelevantDecisions(prompt ?? '', allDecisions)
    const taskDecisionTexts = new Set(taskDecisions.map(d => d.decision))
    for (const d of relevant) {
      if (!taskDecisionTexts.has(d.decision)) {
        allDecisionEntries.push({ ...d, source: d.source })
      }
    }

    if (allDecisionEntries.length > 0) {
      lines.push('')
      lines.push('  ⚠ DECISIONS — you MUST follow these unless the user explicitly overrides:')
      for (const d of allDecisionEntries) {
        lines.push(`  - "${d.decision}"${d.reasoning ? ` (${d.reasoning})` : ''}`)
        if (d.action) lines.push(`    → ${d.action}`)
        if (d.source) lines.push(`    [from ${d.source}]`)
      }
    }
  }

  // Identity reminder
  if (idSuffix) {
    lines.push('')
    lines.push(`  Identity: always pass ${idSuffix.trim()} on pm commands (done, decide, add-issue, start, etc.)`)
  }

  // Scope tracking
  if (session && session.activeId === active.id && session.files.length > 0) {
    lines.push(`  Files edited: ${session.files.length} (${session.editCount} operations)`)

    if (session.files.length >= SCOPE_WARN_FILES) {
      lines.push('')
      lines.push(`  ⚠ Scope note: ${session.files.length} files edited (guideline: ${SCOPE_WARN_FILES - 1}). Consider splitting into smaller tasks next time.`)
    }
  }

  return `[pm] Active work:\n${lines.join('\n')}`
}

/** Check if Claude Code pm hooks are already installed. */
export function hasClaudeHooks(cwd: string): boolean {
  const settingsPath = join(cwd, '.claude', 'settings.json')
  if (!existsSync(settingsPath)) return false
  try {
    const settings: ClaudeSettings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    const hooks = settings.hooks?.PreToolUse ?? []
    return hooks.some(
      (c: HookConfig) => c.hooks.some(h => h.command.includes('pm hook'))
    )
  } catch { return false }
}

/** Write hook configuration to .claude/settings.json in the project.
 *  When `force` is true, always rewrite hooks even if content matches. */
export function ensureHooks(cwd: string, force = false): 'added' | 'updated' | 'exists' {
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
        hooks: [{ type: 'command', command: 'pm hook pre-edit --agent claude-code --instance $PPID', timeout: 5 }],
      },
    ],
    PostToolUse: [
      {
        matcher: 'Edit|Write',
        hooks: [{ type: 'command', command: 'pm hook post-edit --agent claude-code --instance $PPID', timeout: 5 }],
      },
    ],
    UserPromptSubmit: [
      {
        matcher: '',
        hooks: [{ type: 'command', command: 'pm hook prompt-context --agent claude-code --instance $PPID', timeout: 5 }],
      },
    ],
    SessionStart: [
      {
        matcher: '',
        hooks: [{ type: 'command', command: 'pm hook session-start --agent claude-code --instance $PPID', timeout: 10 }],
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
      (c: HookConfig) => !c.hooks.some(h => h.command.includes('pm hook'))
    )
    merged[event] = [...filtered, ...configs]
  }

  settings.hooks = merged
  const mergedStr = JSON.stringify(merged)

  if (!force && existingStr === mergedStr) return 'exists'

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')
  if (force && existingStr === mergedStr) return 'updated'
  return Object.keys(existing).length === 0 ? 'added' : 'updated'
}
