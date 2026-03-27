import { markTaskError } from '../lib/store.js'
import { parseFlag } from '../lib/args.js'

export function cmdError(args: string[]) {
  const taskId = args[0]
  if (!taskId) {
    console.error('Usage: pm error <taskId> [--note "reason"]')
    process.exit(1)
  }

  const note = parseFlag(args, '--note')

  markTaskError(taskId, note)

  console.log(`Error: task ${taskId}`)
  if (note) console.log(`Note : ${note}`)
  console.log()
  console.log(`Retry with: pm retry ${taskId}${note ? ` --note '${note}'` : ''}`)
}
