import { markTaskDone, markIssueDone, loadStore } from '../lib/store.js'
import { loadSession, SCOPE_WARN_FILES } from '../lib/hooks.js'
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

/** Check if the session file count exceeds the scope threshold.
 *  Returns an error message if over limit, null if OK. */
function checkScope(cwd: string, activeId: string, type: 'task' | 'issue'): string | null {
  const session = loadSession(cwd)
  if (!session || session.activeId !== activeId) return null
  if (session.files.length < SCOPE_WARN_FILES) return null

  const lines = [
    `SCOPE VIOLATION: ${session.files.length} files edited under one ${type} (limit: ${SCOPE_WARN_FILES - 1}).`,
    ``,
    `Files: ${session.files.join(', ')}`,
    ``,
    `This ${type} is too broad. Break remaining work into additional focused tasks:`,
  ]

  if (type === 'issue') {
    lines.push(`  1. Mark this issue done with --force and a note on what was completed`)
    lines.push(`  2. Run: pm add-feature "..." to upgrade, then add phases/tasks for remaining work`)
  } else {
    lines.push(`  1. Mark this task done with --force and a note on what was completed`)
    lines.push(`  2. Run: pm add-task to create additional focused tasks for remaining work`)
  }

  lines.push(``)
  lines.push(`Or if this is legitimately one change: pm done ${activeId} --force`)

  return lines.join('\n')
}
