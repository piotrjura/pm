import { markTaskStarted } from '../lib/store.js'
import { parseFlag } from '../lib/args.js'

export function cmdStart(args: string[]) {
  const taskId = args[0]
  if (!taskId) {
    console.error('Usage: pm start <taskId> [--agent <name>]')
    process.exit(1)
  }

  const agent = parseFlag(args, '--agent')

  const result = markTaskStarted(taskId, agent)
  if (!result) {
    console.error(`Task not found: ${taskId}`)
    process.exit(1)
  }

  console.log(`Started: ${result.task.title}`)
  if (agent) console.log(`Agent  : ${agent}`)
  console.log()
  console.log(`When done: pm done ${taskId} --note "what you did"`)
}
