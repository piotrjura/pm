import { loadStore } from '../lib/store.js'
import { STATUS_ICON } from '../lib/format.js'

export function cmdShow(args: string[]) {
  const featureId = args[0]
  if (!featureId) {
    console.error('Usage: pm show <featureId>')
    process.exit(1)
  }

  const store = loadStore()
  const feature = store.features.find(f => f.id === featureId)
  if (!feature) {
    console.error(`Feature ${featureId} not found`)
    process.exit(1)
  }

  const doneIds = new Set<string>()
  for (const phase of feature.phases)
    for (const task of phase.tasks)
      if (task.status === 'done') doneIds.add(task.id)

  console.log(`[${feature.status.toUpperCase()}] ${feature.title}  [feature:${feature.id}]`)
  if (feature.description) console.log(`  ${feature.description}`)
  console.log()

  if (feature.phases.length === 0) {
    console.log('  No phases yet.')
    console.log(`  Add a phase: pm add-phase ${feature.id} "Phase title"`)
    return
  }

  for (const phase of feature.phases) {
    console.log(`  ${phase.title}  [phase:${phase.id}]`)
    for (const task of phase.tasks) {
      const icon = STATUS_ICON[task.status] ?? '?'
      const meta: string[] = []
      if (task.priority !== undefined && task.priority !== 3) meta.push(`P${task.priority}`)
      const unsatisfied = (task.dependsOn ?? []).filter(id => !doneIds.has(id))
      if (unsatisfied.length > 0) meta.push('[blocked]')
      if ((task.attempt ?? 0) > 0) meta.push(`attempt ${task.attempt}`)
      if (task.doneAt) meta.push(`done ${task.doneAt.slice(0, 10)}`)
      const metaStr = meta.length > 0 ? `  ${meta.join(' ')}` : ''
      console.log(`    ${icon} ${task.title}  [task:${task.id}]${metaStr}`)
      if (task.description) console.log(`       desc: ${task.description}`)
      if (task.note) console.log(`       note: ${task.note}`)
      if (task.files?.length) console.log(`       files: ${task.files.join(', ')}`)
    }
    console.log()
  }
}
