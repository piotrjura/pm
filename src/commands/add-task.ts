import { addTaskToPhase } from '../lib/store.js'
import { updateClaudeMd } from '../lib/claude-md.js'
import { parseFlag, parseListFlag, parseIntFlag } from '../lib/args.js'

export function cmdAddTask(args: string[]) {
  const featureId = args[0]
  const phaseId = args[1]
  const title = args[2]
  if (!featureId || !phaseId || !title) {
    console.error('Usage: pm add-task <featureId> <phaseId> <title> [--description "..."] [--files "a,b"] [--priority 1-5] [--depends-on "id1,id2"]')
    process.exit(1)
  }

  const description = parseFlag(args, '--description')
  const files = parseListFlag(args, '--files')
  const priority = parseIntFlag(args, '--priority')
  const dependsOn = parseListFlag(args, '--depends-on')

  const task = addTaskToPhase(featureId, phaseId, { title, description, files, priority, dependsOn })
  if (!task) {
    console.error(`Feature ${featureId} or phase ${phaseId} not found`)
    process.exit(1)
  }

  updateClaudeMd()

  console.log(`task:${task.id}`)
  console.log(`Created task: ${task.title}`)
  if (description) console.log(`Description: ${description}`)
  if (files?.length) console.log(`Files: ${files.join(', ')}`)
  if (priority) console.log(`Priority: ${priority}`)
  if (dependsOn?.length) console.log(`Depends on: ${dependsOn.join(', ')}`)
}
