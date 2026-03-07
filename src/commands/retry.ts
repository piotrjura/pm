import { markTaskRetry, getLog, loadStore } from '../lib/store.js'
import { updateClaudeMd } from '../lib/claude-md.js'
import { parseFlag } from '../lib/args.js'

function findTask(taskId: string) {
  const store = loadStore()
  for (const feature of store.features)
    for (const phase of feature.phases)
      for (const task of phase.tasks)
        if (task.id === taskId) return task
  return null
}

export function cmdRetry(args: string[]) {
  const taskId = args[0]
  if (!taskId) {
    console.error('Usage: pm retry <taskId> [--note "context"]')
    process.exit(1)
  }

  const note = parseFlag(args, '--note')

  const task = findTask(taskId)
  if (!task) {
    console.error(`Task ${taskId} not found`)
    process.exit(1)
  }

  const attempt = (task.attempt ?? 0) + 1
  const maxAttempts = task.maxAttempts ?? 3

  if (attempt >= maxAttempts) {
    console.error(`Task ${taskId} has reached max attempts (${maxAttempts})`)
    process.exit(1)
  }

  const log = getLog(100)
  const priorNotes = log
    .filter(e => e.taskId === taskId && e.action === 'error' && e.note)
    .slice(0, 3)
    .map(e => e.note!)

  const retriedTask = markTaskRetry(taskId, undefined, note)
  if (!retriedTask) {
    console.error(`Failed to retry task ${taskId}`)
    process.exit(1)
  }

  updateClaudeMd()

  console.log(`Retry: task ${taskId} (attempt ${attempt + 1} of ${maxAttempts})`)
  if (priorNotes.length > 0) {
    console.log(`Prior notes:`)
    priorNotes.forEach(n => console.log(`  - ${n}`))
  }
  if (note) console.log(`New note: ${note}`)
}
