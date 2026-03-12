import { markTaskStarted, markIssueStarted, loadStore } from '../lib/store.js'
import { parseFlag } from '../lib/args.js'

export function cmdStart(args: string[]) {
  const id = args[0]
  if (!id) {
    console.error('Usage: pm start <taskId|issueId> [--agent <name>] [--instance <id>] [--model <name>]')
    process.exit(1)
  }

  const agent = parseFlag(args, '--agent')
  const instance = parseFlag(args, '--instance')
  const model = parseFlag(args, '--model')

  // Try as issue first
  const issueId = id.startsWith('issue:') ? id.slice(6) : id
  const store = loadStore()
  const issue = store.issues.find(i => i.id === issueId)
  if (issue) {
    const result = markIssueStarted(issueId, agent, model, instance)
    if (!result) {
      if (issue.status === 'done') {
        console.error(`Issue already done: ${issueId}`)
      } else {
        console.error(`Cannot start issue: ${issueId}`)
      }
      process.exit(1)
    }
    console.log(`Started: ${result.title}`)
    if (agent) console.log(`Agent  : ${agent}`)
    console.log()
    console.log(`When done: pm done ${issueId} --note "what you did"`)
    return
  }

  // Try as task
  const result = markTaskStarted(id, agent, model, instance)
  if (!result) {
    console.error(`Task or issue not found: ${id}`)
    process.exit(1)
  }

  console.log(`Started: ${result.task.title}`)
  if (agent) console.log(`Agent  : ${agent}`)
  console.log()
  console.log(`When done: pm done ${id} --note "what you did"`)
}
