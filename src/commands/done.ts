import { markTaskDone, updateIssue, loadStore } from '../lib/store.js'
import { updateClaudeMd } from '../lib/claude-md.js'
import { parseFlag, hasFlag } from '../lib/args.js'

export function cmdDone(args: string[]) {
  const id = args[0]
  if (!id) {
    console.error('Usage: pm done <taskId|issueId> [--agent <name>] [--note "what you did"]')
    process.exit(1)
  }

  const agent = parseFlag(args, '--agent')
  const note = parseFlag(args, '--note')
  const forceReview = hasFlag(args, '--review')

  const store = loadStore()
  const issueId = id.startsWith('issue:') ? id.slice(6) : id
  const issue = store.issues.find(i => i.id === issueId)
  if (issue) {
    updateIssue(issueId, { status: 'done' })
    updateClaudeMd()
    console.log(`Done: issue ${id}`)
    if (note) console.log(`Note : ${note}`)
    return
  }

  const nextTask = markTaskDone(id, agent, note, forceReview)

  updateClaudeMd()

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
