import { markTaskError } from '../lib/store.js'
import { parseFlag } from '../lib/args.js'

export function cmdError(args: string[]) {
  const taskId = args[0]
  if (!taskId) {
    console.error('Usage: pm error <taskId> [--agent <name>] [--model <name>] [--note "reason"]')
    process.exit(1)
  }

  const agent = parseFlag(args, '--agent')
  const model = parseFlag(args, '--model')
  const note = parseFlag(args, '--note')

  markTaskError(taskId, agent, note, model)

  console.log(`Error: task ${taskId}`)
  if (note) console.log(`Note : ${note}`)
  console.log()
  console.log(`Retry with: pm retry ${taskId}${note ? ` --note '${note}'` : ''}`)
}
