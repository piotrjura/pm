import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { DataStore, Decision } from './types.js'
import { loadConfig } from './config.js'

const PM_DATA = (cwd: string) => join(cwd, '.pm', 'data.json')
const SESSION_FILE = (cwd: string) => join(cwd, '.pm', 'session.json')
const DOCTRINE_SESSION_FILE = (cwd: string) => join(cwd, '.pm', 'doctrine-session.json')

// Scope thresholds
export const SCOPE_WARN_FILES = 4 // warn when this many unique files edited under one task
export const SCOPE_NUDGE_EDITS = 3 // nudge after this many edits on an issue
export const SCOPE_BLOCK_FILES = 4 // hard block issue at this many files
export const SCOPE_BLOCK_EDITS = 10 // hard block issue at this many edits

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
  /** Total Read tool calls */
  readCount?: number
  /** Total Grep tool calls (each weighted as 2 reads in nudge math) */
  grepCount?: number
}

/** Subagent nudge fires when readCount + 2*grepCount reaches this threshold. */
export const SUBAGENT_NUDGE_THRESHOLD = 3

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

/** Return the pm command string. CLI is the only install path. */
export function getPmCmd(): string {
  return 'pm'
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

/** Minimum number of non-done tasks required on an upgraded feature before edits are allowed. */
export const UPGRADE_MIN_TASKS = 2

export type EscalationLevel = 'none' | 'nudge' | 'block'

export interface ScopeEscalation {
  level: EscalationLevel
  issueId: string
  issueTitle: string
  files: number
  edits: number
  message: string
}

export interface UpgradeEnforcement {
  featureId: string
  featureTitle: string
  pendingTasks: number
  required: number
  message: string
}

/** Check if an active issue has exceeded scope thresholds.
 *  Returns escalation info, or null if no issue is active or no threshold hit. */
export function checkScopeEscalation(cwd: string): ScopeEscalation | null {
  const dataPath = PM_DATA(cwd)
  if (!existsSync(dataPath)) return null

  let store: DataStore
  try {
    store = JSON.parse(readFileSync(dataPath, 'utf-8'))
  } catch {
    return null
  }

  const active = getActiveId(store)
  if (!active || active.type !== 'issue') return null

  const session = loadSession(cwd)
  if (!session || session.activeId !== active.id) return null

  const issue = store.issues.find(i => i.id === active.id)
  if (!issue) return null

  const pmCmd = getPmCmd()
  const files = session.files.length
  const edits = session.editCount

  // Hard block: too many files or edits for an issue
  if (files >= SCOPE_BLOCK_FILES || edits >= SCOPE_BLOCK_EDITS) {
    return {
      level: 'block',
      issueId: active.id,
      issueTitle: issue.title,
      files,
      edits,
      message:
        `BLOCKED: This issue has grown to ${files} file(s) and ${edits} edit(s) — too large for an issue.\n\n` +
        `Run: ${pmCmd} upgrade ${active.id}\n\n` +
        `This converts the issue to a feature with a retroactive task for work already done.\n` +
        `You MUST then add at least ${UPGRADE_MIN_TASKS} tasks for the remaining work — edits will be blocked until you do.\n` +
        `  ${pmCmd} add-task <featureId> <phaseId> "First remaining task"\n` +
        `  ${pmCmd} add-task <featureId> <phaseId> "Second remaining task"\n` +
        `  ${pmCmd} start <taskId>`,
    }
  }

  // Nudge: edits are accumulating, scope might grow
  if (edits >= SCOPE_NUDGE_EDITS) {
    return {
      level: 'nudge',
      issueId: active.id,
      issueTitle: issue.title,
      files,
      edits,
      message:
        `⚠ Scope check: ${edits} edits across ${files} file(s) on issue "${issue.title}". ` +
        `If this is growing beyond a quick fix, upgrade to a feature with multiple tasks:\n` +
        `  ${pmCmd} upgrade ${active.id}`,
    }
  }

  return null
}

/** Check if an upgraded feature has enough tasks before allowing edits.
 *  Upgraded features must have at least UPGRADE_MIN_TASKS non-done tasks.
 *  Returns enforcement info, or null if not applicable or requirement is met. */
export function checkUpgradeEnforcement(cwd: string): UpgradeEnforcement | null {
  const dataPath = PM_DATA(cwd)
  if (!existsSync(dataPath)) return null

  let store: DataStore
  try {
    store = JSON.parse(readFileSync(dataPath, 'utf-8'))
  } catch {
    return null
  }

  // Find the active task's parent feature
  for (const feature of store.features) {
    if (!feature.upgradedFrom) continue // only check upgraded features

    const hasActiveTask = feature.phases.some(p =>
      p.tasks.some(t => t.status === 'in-progress')
    )
    if (!hasActiveTask) continue

    // Count non-done tasks (pending + in-progress + error + review)
    let nonDoneTasks = 0
    for (const phase of feature.phases) {
      for (const task of phase.tasks) {
        if (task.status !== 'done') nonDoneTasks++
      }
    }

    if (nonDoneTasks < UPGRADE_MIN_TASKS) {
      const pmCmd = getPmCmd()
      const phaseId = feature.phases[0]?.id
      const need = UPGRADE_MIN_TASKS - nonDoneTasks
      return {
        featureId: feature.id,
        featureTitle: feature.title,
        pendingTasks: nonDoneTasks,
        required: UPGRADE_MIN_TASKS,
        message:
          `BLOCKED: Feature "${feature.title}" was upgraded from an issue but only has ${nonDoneTasks} task(s).\n\n` +
          `Upgraded features require at least ${UPGRADE_MIN_TASKS} tasks (not counting completed retroactive work).\n` +
          `Add ${need} more task${need === 1 ? '' : 's'} to break down the remaining work:\n` +
          (phaseId
            ? `  ${pmCmd} add-task ${feature.id} ${phaseId} "Task description"\n`
            : `  ${pmCmd} add-phase ${feature.id} "Phase title"\n  ${pmCmd} add-task ${feature.id} <phaseId> "Task description"\n`),
      }
    }
  }

  return null
}

/** Per-Claude-Code-session record of which doctrines have been pulled.
 *  Resets on the SessionStart hook so a fresh Claude session forces re-pulling. */
interface DoctrineSession {
  /** Unique id (timestamp) for this Claude Code session */
  sessionId: string
  /** Names of doctrines that have been read this session */
  pulled: string[]
}

/** Load the doctrine pull tracker, or null if not yet initialized. */
export function loadDoctrineSession(cwd: string): DoctrineSession | null {
  const path = DOCTRINE_SESSION_FILE(cwd)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

/** Reset the doctrine pull tracker — called by the SessionStart hook.
 *  Pre-populates 'router' since session-start always injects it. */
export function resetDoctrineSession(cwd: string): DoctrineSession {
  const session: DoctrineSession = {
    sessionId: String(Date.now()),
    pulled: ['router'],
  }
  const pmDir = join(cwd, '.pm')
  if (!existsSync(pmDir)) mkdirSync(pmDir, { recursive: true })
  writeFileSync(DOCTRINE_SESSION_FILE(cwd), JSON.stringify(session, null, 2))
  return session
}

/** Record that Claude pulled a doctrine via `pm doctrine <name>`.
 *  Idempotent — duplicate pulls are no-ops. Silent — never prints. */
export function recordDoctrinePull(cwd: string, name: string): void {
  const pmDir = join(cwd, '.pm')
  if (!existsSync(pmDir)) return // pm not initialized, skip
  let session = loadDoctrineSession(cwd)
  if (!session) {
    // Lazy init — first pull in a session that hasn't seen session-start yet
    session = { sessionId: String(Date.now()), pulled: ['router'] }
  }
  if (!session.pulled.includes(name)) {
    session.pulled.push(name)
    writeFileSync(DOCTRINE_SESSION_FILE(cwd), JSON.stringify(session, null, 2))
  }
}

/** Has the named doctrine been pulled in the current session? */
export function hasPulledDoctrine(cwd: string, name: string): boolean {
  const session = loadDoctrineSession(cwd)
  if (!session) return false
  return session.pulled.includes(name)
}

/** Names of doctrines that are required for edits given the current settings.
 *  Settings-gated: planning, questions, followup at their strongest level.
 *  Always-on: decisions. */
export function requiredDoctrines(cwd: string): string[] {
  const config = loadConfig(cwd)
  const required: string[] = ['decisions'] // always-on
  if (config.planning === 'all') required.push('planning')
  if (config.questions === 'thorough') required.push('questions')
  if (config.followup === 'thorough') required.push('followup')
  return required
}

/** Doctrines that should be pulled at non-strongest settings (soft nudge only). */
export function nudgeDoctrines(cwd: string): string[] {
  const config = loadConfig(cwd)
  const nudge: string[] = []
  if (config.planning === 'medium') nudge.push('planning')
  if (config.questions === 'medium') nudge.push('questions')
  if (config.followup === 'medium') nudge.push('followup')
  return nudge
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

/** Record a Read or Grep call in the session tracker. Resets if the active task changed.
 *  Read increments readCount; Grep increments grepCount (weighted x2 in the nudge math). */
export function recordRead(cwd: string, kind: 'Read' | 'Grep'): EditSession {
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
    session = { activeId, files: [], editCount: 0, readCount: 0, grepCount: 0 }
  }

  if (kind === 'Read') {
    session.readCount = (session.readCount ?? 0) + 1
  } else {
    session.grepCount = (session.grepCount ?? 0) + 1
  }

  writeFileSync(SESSION_FILE(cwd), JSON.stringify(session, null, 2))
  return session
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

/** Build doctrine-pull nudge lines for prompt-context injection.
 *  Splits unpulled doctrines into BLOCKING (settings at strongest) and ADVISORY (medium settings). */
function buildDoctrineNudges(cwd: string): string[] {
  const lines: string[] = []
  const required = requiredDoctrines(cwd)
  const advisory = nudgeDoctrines(cwd)
  const pmCmd = getPmCmd()

  const missingRequired = required.filter(d => !hasPulledDoctrine(cwd, d))
  const missingAdvisory = advisory.filter(d => !hasPulledDoctrine(cwd, d))

  if (missingRequired.length > 0) {
    lines.push('')
    lines.push(`  ⚠ BLOCKING — these doctrines are required at your current settings but have NOT been pulled this session:`)
    for (const name of missingRequired) {
      lines.push(`    ${pmCmd} doctrine ${name}`)
    }
    lines.push(`  Edits will be hard-blocked until you pull them. Run all of the above before continuing.`)
  }

  if (missingAdvisory.length > 0) {
    lines.push('')
    lines.push(`  💡 Advisory — these doctrines match your current settings (medium) and should be pulled:`)
    for (const name of missingAdvisory) {
      lines.push(`    ${pmCmd} doctrine ${name}`)
    }
  }

  return lines
}

/** Get scope-aware status summary for prompt context injection.
 *  When `prompt` is provided, searches all decisions for relevance. */
export function getStatusSummary(cwd: string, prompt?: string): string {
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
  const allDecisions = collectAllDecisions(store)
  const config = loadConfig(cwd)

  // === No active work — tell Claude to assess scope and log work itself ===
  if (!active) {
    const pmCmd = getPmCmd()

    const parts = [`[pm] No active work tracked. You MUST log work in pm before editing any code. Assess the scope of the user's request and run the appropriate commands yourself:

  Quick one-off fix (1-2 files, small change):
    Run: ${pmCmd} add-issue "description"

  Structured work (3+ files, multiple logical steps):
    Run: ${pmCmd} add-feature "title" --description "..."
    Then: ${pmCmd} add-phase, ${pmCmd} add-task, ${pmCmd} start <taskId>

  Scope rules:
  - Each task = focused unit, 1-3 files, one logical change
  - 4+ files = feature with multiple tasks, not a single issue
  - Distinct stages (design, implement, test) = separate phases
  - When in doubt, start with add-issue — upgrade later if scope grows
  Workflow: planning=${config.planning}, questions=${config.questions}, followup=${config.followup}`]

    // Surface relevant decisions from past work (always on)
    const relevantFull = findRelevantDecisions(prompt ?? '', allDecisions)
    if (relevantFull.length > 0) {
      parts.push('')
      parts.push('  ⚠ DECISIONS — you MUST follow these unless the user explicitly overrides:')
      for (const d of relevantFull) {
        parts.push(`  - "${d.decision}"${d.reasoning ? ` (${d.reasoning})` : ''}`)
        if (d.action) parts.push(`    → ${d.action}`)
        parts.push(`    [from ${d.source}]`)
      }
    }

    // Surface doctrine pull status — applies in both no-active and active branches
    parts.push(...buildDoctrineNudges(cwd))

    return parts.join('\n')
  }

  // === Active work — show status + scope tracking ===
  const lines: string[] = []
  const taskDecisions: Array<{ decision: string; reasoning?: string }> = []

  // Workflow settings — surface on every prompt so Claude can't drift from configured depth
  lines.push(`  Workflow: planning=${config.planning}, questions=${config.questions}, followup=${config.followup}`)

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
          if (task.decisions?.length) taskDecisions.push(...task.decisions)
          if (feature.decisions?.length) taskDecisions.push(...feature.decisions)
        }
      }
    }
  }
  for (const issue of store.issues) {
    if (issue.status !== 'done') {
      lines.push(`  Issue: "${issue.title}" [${issue.priority}]`)
      if (issue.decisions?.length) taskDecisions.push(...issue.decisions)
    }
  }

  // Decisions — FIRST after status, most important context for the agent (always on)
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

  // Scope tracking + escalation for issues
  if (session && session.activeId === active.id) {
    if (session.files.length > 0) {
      lines.push(`  Files edited: ${session.files.length} (${session.editCount} operations)`)

      const escalation = checkScopeEscalation(cwd)
      if (escalation) {
        lines.push('')
        lines.push(`  ${escalation.message}`)
      } else if (active.type === 'task' && session.files.length >= SCOPE_WARN_FILES) {
        lines.push('')
        lines.push(`  ⚠ Scope note: ${session.files.length} files edited (guideline: ${SCOPE_WARN_FILES - 1}). Consider splitting into smaller tasks next time.`)
      }

      // Decision nudge — if work is underway but no decisions recorded on current item
      if (session.editCount >= SCOPE_NUDGE_EDITS && taskDecisions.length === 0) {
        const pmCmd = getPmCmd()
        lines.push('')
        lines.push(`  💡 No decisions recorded. If this work set direction (approach picked over alternatives, rules, scope cuts), record it. Otherwise skip — quality over quantity:`)
        lines.push(`    ${pmCmd} decide ${active.id} "What you decided" --reasoning "Why"`)
      }
    }

    // Subagent nudge — exploration adds up; delegate to keep Opus context lean.
    // Read counts as 1, Grep counts as 2 (broader op, signals exploration intent).
    const reads = session.readCount ?? 0
    const greps = session.grepCount ?? 0
    const score = reads + 2 * greps
    if (score >= SUBAGENT_NUDGE_THRESHOLD) {
      const pmCmd = getPmCmd()
      lines.push('')
      lines.push(`  💡 Subagents: ${reads} read${reads === 1 ? '' : 's'} + ${greps} grep${greps === 1 ? '' : 's'} this task. For further exploration, delegate to the Explore agent (Haiku/Sonnet — saves Opus tokens, keeps context lean). Pull rules: ${pmCmd} doctrine subagents`)
    }
  }

  // Upgrade enforcement — surface in prompt context so agent sees it before trying to edit
  const upgradeCheck = checkUpgradeEnforcement(cwd)
  if (upgradeCheck) {
    lines.push('')
    lines.push(`  ${upgradeCheck.message}`)
  }

  // Doctrine pull nudges — required (blocking) and advisory
  lines.push(...buildDoctrineNudges(cwd))

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
        hooks: [{ type: 'command', command: 'pm hook pre-edit', timeout: 5 }],
      },
      {
        matcher: 'Read|Grep',
        hooks: [{ type: 'command', command: 'pm hook pre-read', timeout: 5 }],
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
