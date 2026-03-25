import { markTaskDone, markIssueDone, loadStore } from '../lib/store.js'
import { loadSession, SCOPE_WARN_FILES, loadIdentityFlags } from '../lib/hooks.js'
import { parseFlag, hasFlag } from '../lib/args.js'

export function cmdDone(args: string[]) {
  const id = args[0]
  if (!id) {
    console.error('Usage: pm done <taskId|issueId> [--agent <name>] [--instance <id>] [--model <name>] [--note "what you did"] [--force]')
    process.exit(1)
  }

  const agent = parseFlag(args, '--agent')
  const instance = parseFlag(args, '--instance')
  const model = parseFlag(args, '--model')
  const note = parseFlag(args, '--note')
  const forceReview = hasFlag(args, '--review')
  const force = hasFlag(args, '--force')

  const cwd = process.cwd()

  // Try as issue first (with or without issue: prefix)
  const issueId = id.startsWith('issue:') ? id.slice(6) : id
  const store = loadStore()
  const issue = store.issues.find(i => i.id === issueId)
  if (issue) {
    // Scope check — block if too many files edited under one issue
    if (!force) {
      const scopeError = checkScope(cwd, issueId, 'issue')
      if (scopeError) {
        console.error(scopeError)
        process.exit(1)
      }
    }

    const result = markIssueDone(issueId, agent, note, model, instance)
    if (result && result.status === 'done' && issue.status === 'done') {
      console.log(`Already done: issue ${issueId}`)
    } else {
      console.log(`Done: issue ${issueId}`)
    }
    if (note) console.log(`Note : ${note}`)
    return
  }

  // Scope check — block if too many files edited under one task
  if (!force) {
    const scopeError = checkScope(cwd, id, 'task')
    if (scopeError) {
      console.error(scopeError)
      process.exit(1)
    }
  }

  const nextTask = markTaskDone(id, agent, note, forceReview, model, instance)

  if (forceReview) {
    console.log(`Submitted for review: task ${id}`)
    console.log(`  pm review ${id} --approve | --reject`)
    return
  }

  console.log(`Done: task ${id}`)
  if (agent) console.log(`Agent: ${agent}`)
  if (note) console.log(`Note : ${note}`)
  console.log()

  if (nextTask) {
    console.log(`Next task ready:`)
    console.log(`  Feature : ${nextTask.featureTitle}`)
    console.log(`  Phase   : ${nextTask.phaseTitle}`)
    console.log(`  Task    : ${nextTask.taskTitle}`)
    console.log()
    console.log(`  pm start ${nextTask.taskId}`)
  } else {
    console.log('All tasks complete!')
  }
}

export interface FileGroup {
  name: string
  files: string[]
}

/** Check if a path is a test file. */
function isTestFile(p: string): boolean {
  return p.includes('/test/') || p.includes('/__tests__/') || p.includes('.test.') || p.includes('.spec.')
}

/** Group files by concern. Test files go to their own group (highest priority), then by directory name. */
export function groupFilesByConcern(files: string[]): FileGroup[] {
  const testFiles = files.filter(isTestFile)
  const sourceFiles = files.filter(f => !isTestFile(f))

  const groups: FileGroup[] = []

  // Group source files by immediate parent directory name
  const byDir = new Map<string, string[]>()
  for (const f of sourceFiles) {
    const parts = f.replace(/\\/g, '/').split('/')
    const dir = parts.length >= 2 ? parts[parts.length - 2] : 'root'
    const existing = byDir.get(dir) ?? []
    existing.push(f)
    byDir.set(dir, existing)
  }
  for (const [dir, dirFiles] of byDir) {
    groups.push({ name: dir, files: dirFiles })
  }

  // Test files always last
  if (testFiles.length > 0) {
    groups.push({ name: 'tests', files: testFiles })
  }

  return groups
}

/** Build the scope error message with grouped files and copy-paste recovery commands. */
export function buildScopeErrorMessage(
  activeId: string,
  type: 'task' | 'issue',
  files: string[],
  idFlags: string,
): string {
  const groups = groupFilesByConcern(files)
  const idSuffix = idFlags ? ` ${idFlags}` : ''

  const lines: string[] = [
    `SCOPE: ${files.length} files edited under one ${type} (limit: ${SCOPE_WARN_FILES - 1}).`,
    ``,
    `Files by concern:`,
  ]

  for (const g of groups) {
    lines.push(`  ${g.name}: ${g.files.join(', ')}`)
  }

  lines.push(``)
  lines.push(`To complete this work:`)
  lines.push(`  1. pm done ${activeId} --force --note "what was completed"`)

  let step = 2
  for (const g of groups) {
    if (g.name === 'tests') {
      lines.push(`  ${step}. pm add-issue "Add tests"${idSuffix}`)
    } else {
      lines.push(`  ${step}. pm add-issue "Update ${g.name}"${idSuffix}`)
    }
    step++
  }

  lines.push(``)
  lines.push(`Or if this is legitimately one change:`)
  lines.push(`  pm done ${activeId} --force`)

  return lines.join('\n')
}

/** Check if the session file count exceeds the scope threshold.
 *  Returns an error message if over limit, null if OK. */
function checkScope(cwd: string, activeId: string, type: 'task' | 'issue'): string | null {
  const session = loadSession(cwd)
  if (!session || session.activeId !== activeId) return null
  if (session.files.length < SCOPE_WARN_FILES) return null

  const idFlags = loadIdentityFlags(cwd)
  return buildScopeErrorMessage(activeId, type, session.files, idFlags)
}
