import { readFileSync, existsSync } from 'node:fs'
import { basename } from 'node:path'
import { addFeature, updateFeature, addPhaseToFeature, addTaskToPhase, loadStore, addDecision } from '../lib/store.js'
import { parseFlag } from '../lib/args.js'

interface ParsedTask {
  title: string
  description?: string
  files?: string[]
}

interface ParsedPhase {
  title: string
  tasks: ParsedTask[]
}

interface ParsedPlan {
  title: string
  phases: ParsedPhase[]
}

/** Derive a readable title from a filename like "2026-03-25-my-feature.md" -> "My feature" */
function titleFromFilename(filename: string): string | undefined {
  const stem = basename(filename, '.md')
  // Strip leading date pattern (YYYY-MM-DD-)
  const stripped = stem.replace(/^\d{4}-\d{2}-\d{2}-/, '')
  if (!stripped) return undefined
  return stripped.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase())
}

/** Parse a superpowers plan markdown file into structured data. */
function parsePlan(content: string, filename: string): ParsedPlan | { error: string } {
  const lines = content.split('\n')

  // Extract title from first # heading (not ## or ###)
  let title: string | undefined
  for (const line of lines) {
    if (/^# [^#]/.test(line)) {
      title = line.slice(2).trim()
      break
    }
  }

  // Fallback: derive from filename
  if (!title) {
    title = titleFromFilename(filename)
  }

  if (!title) {
    return { error: 'Could not determine feature title. Add a # heading to the plan file.' }
  }

  const phases: ParsedPhase[] = []
  let currentPhase: ParsedPhase | null = null
  let currentTask: ParsedTask | null = null
  const descLines: string[] = []

  const flushTask = () => {
    if (currentTask && currentPhase) {
      if (descLines.length > 0) {
        currentTask.description = descLines.join('\n').trim() || undefined
      }
      currentPhase.tasks.push(currentTask)
      currentTask = null
      descLines.length = 0
    }
  }

  const flushPhase = () => {
    flushTask()
    if (currentPhase) phases.push(currentPhase)
    currentPhase = null
  }

  for (const line of lines) {
    // ## Phase N: Title  or  ## Step N: Title  or  ## Title
    if (/^## [^#]/.test(line)) {
      flushPhase()
      const raw = line.slice(3).trim()
      const phaseTitle = raw.replace(/^(Phase|Step)\s+\d+(\.\d+)*:\s*/i, '')
      currentPhase = { title: phaseTitle, tasks: [] }
      continue
    }

    // ### Task N.M: Title  or  ### Title
    if (/^### [^#]/.test(line)) {
      flushTask()
      const raw = line.slice(4).trim()
      const taskTitle = raw.replace(/^Task\s+[\d.]+:\s*/i, '')
      currentTask = { title: taskTitle }
      continue
    }

    if (currentTask) {
      // Extract files from **Files:** line
      if (/^\*\*Files:\*\*/.test(line)) {
        const filesStr = line.replace(/^\*\*Files:\*\*\s*/, '')
        currentTask.files = filesStr
          .split(',')
          .map(f => f.trim().replace(/^`|`$/g, ''))
          .filter(Boolean)
        continue
      }
      // Accumulate description (skip blank lines at start)
      if (line.trim() || descLines.length > 0) {
        descLines.push(line)
      }
    }
  }

  flushPhase()

  if (phases.length === 0 || phases.every(p => p.tasks.length === 0)) {
    return { error: 'Could not parse plan structure. Expected ## Phase and ### Task headings.' }
  }

  return { title, phases }
}

export interface ParsedDecision {
  decision: string
  reasoning?: string
  action?: string
}

/** Parse decision markers from a superpowers spec markdown file.
 *  Format: `> **Decision:** text`, optionally followed by `> **Why:**` and `> **Action:**` lines. */
export function parseSpecDecisions(content: string): ParsedDecision[] {
  const lines = content.split('\n')
  const decisions: ParsedDecision[] = []
  let current: ParsedDecision | null = null
  let currentField: 'decision' | 'reasoning' | 'action' = 'decision'

  const flush = () => {
    if (current) {
      current.decision = current.decision.trim()
      if (current.reasoning) current.reasoning = current.reasoning.trim()
      if (current.action) current.action = current.action.trim()
      decisions.push(current)
      current = null
    }
  }

  for (const line of lines) {
    if (line.startsWith('> **Decision:**')) {
      flush()
      current = { decision: line.replace('> **Decision:**', '').trim() }
      currentField = 'decision'
      continue
    }

    if (current && line.startsWith('>')) {
      const text = line.slice(1).trim()

      if (text.startsWith('**Why:**')) {
        current.reasoning = text.replace('**Why:**', '').trim()
        currentField = 'reasoning'
      } else if (text.startsWith('**Action:**')) {
        current.action = text.replace('**Action:**', '').trim()
        currentField = 'action'
      } else if (text) {
        if (currentField === 'decision') {
          current.decision += ' ' + text
        } else if (currentField === 'reasoning') {
          current.reasoning = (current.reasoning ?? '') + ' ' + text
        } else if (currentField === 'action') {
          current.action = (current.action ?? '') + ' ' + text
        }
      }
      continue
    }

    if (current) flush()
  }

  flush()
  return decisions
}

export function cmdBridge(args: string[]) {
  const planPath = args[0]
  if (!planPath) {
    console.error('Usage: pm bridge <plan-file> [--spec <spec-file>] [--agent <name>] [--model <name>]')
    process.exit(1)
  }

  if (!existsSync(planPath)) {
    console.error(`Plan file not found: ${planPath}`)
    process.exit(1)
  }

  const agent = parseFlag(args, '--agent')
  const model = parseFlag(args, '--model')

  const content = readFileSync(planPath, 'utf-8')
  const parsed = parsePlan(content, planPath)

  if ('error' in parsed) {
    console.error(parsed.error)
    process.exit(1)
  }

  // Idempotency: check if already imported by planSource or title
  const store = loadStore()
  const existing = store.features.find(f =>
    f.planSource === planPath || f.title === parsed.title
  )
  if (existing) {
    console.log(`Already imported. Use pm show ${existing.id} to view.`)
    process.exit(0)
  }

  // Create feature
  const feature = addFeature(parsed.title, undefined, 'feature')
  updateFeature(feature.id, { planSource: planPath })

  const lines: string[] = [`Created feature: "${parsed.title}" (${feature.id})`]
  let firstTaskId: string | undefined

  for (const phase of parsed.phases) {
    const createdPhase = addPhaseToFeature(feature.id, phase.title)
    if (!createdPhase) continue
    lines.push(`  Phase: ${phase.title} (${createdPhase.id})`)

    for (const task of phase.tasks) {
      const createdTask = addTaskToPhase(feature.id, createdPhase.id, {
        title: task.title,
        description: task.description,
        files: task.files,
        agent,
        model,
      })
      if (!createdTask) continue
      if (!firstTaskId) firstTaskId = createdTask.id
      lines.push(`    Task: ${task.title} (${createdTask.id})`)
    }
  }

  lines.push('')
  lines.push('Start work:')
  const idSuffix = [agent && `--agent ${agent}`, model && `--model ${model}`].filter(Boolean).join(' ')
  lines.push(`  pm start ${firstTaskId ?? '?'}${idSuffix ? ' ' + idSuffix : ''}`)

  // Handle --spec flag: extract decisions from spec file
  const hasSpec = args.includes('--spec')
  const specPath = parseFlag(args, '--spec')
  if (hasSpec && !specPath) {
    console.error('Missing spec file path after --spec')
    process.exit(1)
  }
  if (specPath) {
    if (!existsSync(specPath)) {
      console.error(`Spec file not found: ${specPath}`)
      process.exit(1)
    }

    const specContent = readFileSync(specPath, 'utf-8')
    const decisions = parseSpecDecisions(specContent)

    if (decisions.length === 0) {
      lines.push('')
      lines.push("No decisions found in spec. Mark decisions with '> **Decision:** text'")
    } else {
      lines.push('')
      lines.push(`Extracted ${decisions.length} decision${decisions.length === 1 ? '' : 's'} from spec:`)
      for (const d of decisions) {
        addDecision(feature.id, d.decision, d.reasoning, d.action)
        lines.push(`  - "${d.decision}" → feature ${feature.id}`)
      }
    }
  }

  console.log(lines.join('\n'))
}
