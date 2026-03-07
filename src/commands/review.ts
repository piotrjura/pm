import { approveTask, rejectTask } from '../lib/store.js'
import { updateClaudeMd } from '../lib/claude-md.js'

export function cmdReview(args: string[]) {
  const taskId = args[0]
  if (!taskId) {
    console.error('Usage: pm review <taskId> --approve | --reject [--note "..."]')
    process.exit(1)
  }

  const noteIdx = args.indexOf('--note')
  const note = noteIdx !== -1 ? args[noteIdx + 1] : undefined

  if (args.includes('--approve')) {
    const nextTask = approveTask(taskId)
    updateClaudeMd()
    console.log(`Approved: task ${taskId}`)
    if (nextTask) {
      console.log()
      console.log(`Next task ready:`)
      console.log(`  pm start ${nextTask.taskId}`)
    } else {
      console.log('All tasks complete!')
    }
  } else if (args.includes('--reject')) {
    const nextTask = rejectTask(taskId, note)
    updateClaudeMd()
    console.log(`Rejected: task ${taskId}`)
    if (note) console.log(`Note : ${note}`)
    console.log()
    console.log(`Task returned to pending. Fix and re-submit:`)
    console.log(`  pm start ${taskId}`)
  } else {
    console.error('Usage: pm review <taskId> --approve | --reject [--note "..."]')
    process.exit(1)
  }
}
