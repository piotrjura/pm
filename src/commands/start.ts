import { markTaskStarted, markIssueStarted, loadStore } from '../lib/store.js'

export function cmdStart(args: string[]) {
  const id = args[0]
  if (!id) {
    console.error('Usage: pm start <taskId|issueId>')
    process.exit(1)
  }

  // Try as issue first
  const issueId = id.startsWith('issue:') ? id.slice(6) : id
  const store = loadStore()
  const issue = store.issues.find(i => i.id === issueId)
  if (issue) {
    const result = markIssueStarted(issueId)
    if (!result) {
      if (issue.status === 'done') {
        console.error(`Issue already done: ${issueId}`)
      } else {
        console.error(`Cannot start issue: ${issueId}`)
      }
      process.exit(1)
    }
    console.log(`Started: ${result.title}`)
    console.log()
    console.log(`When done: pm done ${issueId} --note "what you did"`)
    return
  }

  // Try as task
  const result = markTaskStarted(id)
  if (!result) {
    console.error(`Task or issue not found: ${id}`)
    process.exit(1)
  }

  console.log(`Started: ${result.task.title}`)
  console.log()
  console.log(`When done: pm done ${id} --note "what you did"`)
}
