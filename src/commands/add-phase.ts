import { addPhaseToFeature } from '../lib/store.js'

export function cmdAddPhase(args: string[]) {
  const featureId = args[0]
  const title = args[1]
  if (!featureId || !title) {
    console.error('Usage: pm add-phase <featureId> <title>')
    process.exit(1)
  }

  const phase = addPhaseToFeature(featureId, title)
  if (!phase) {
    console.error(`Feature ${featureId} not found`)
    process.exit(1)
  }

  console.log(`phase:${phase.id}`)
  console.log(`Created phase: ${phase.title}`)
  console.log()
  console.log(`Add tasks:  pm add-task ${featureId} ${phase.id} "Task title"`)
}
