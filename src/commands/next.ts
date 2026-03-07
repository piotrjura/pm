import { getNextTask } from '../lib/store.js'
import { updateClaudeMd } from '../lib/claude-md.js'

export function cmdNext() {
  const next = getNextTask()

  updateClaudeMd()

  if (!next) {
    console.log('No pending tasks. All done — or add features with: pm add-feature')
    return
  }

  console.log(`Feature : ${next.featureTitle}`)
  console.log(`Phase   : ${next.phaseTitle}`)
  console.log(`Task    : ${next.taskTitle}`)
  if (next.description) console.log(`Details : ${next.description}`)
  if (next.files?.length) console.log(`Files   : ${next.files.join(', ')}`)
  console.log()
  console.log(`Task ID : ${next.taskId}`)
  console.log()
  console.log(`Run when starting : pm start ${next.taskId}`)
  console.log(`Run when done     : pm done ${next.taskId} --note "what you did"`)
}
