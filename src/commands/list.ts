import { loadStore } from '../lib/store.js'
import { STATUS_ICON } from '../lib/format.js'

export function cmdList() {
  const store = loadStore()

  if (store.features.length === 0) {
    console.log('No features yet. Run `pm` to open the TUI and add some.')
    return
  }

  for (const feature of store.features) {
    const totalTasks = feature.phases.reduce((n, p) => n + p.tasks.length, 0)
    const doneTasks = feature.phases.reduce((n, p) => n + p.tasks.filter(t => t.status === 'done').length, 0)
    console.log(`\n[${feature.status.toUpperCase()}] ${feature.title}  (${doneTasks}/${totalTasks} tasks)`)

    for (const phase of feature.phases) {
      console.log(`  ${phase.title}  [${phase.id}]`)
      for (const task of phase.tasks) {
        const icon = STATUS_ICON[task.status] ?? '?'
        const id = task.status !== 'done' ? `  [${task.id}]` : ''
        const meta: string[] = []
        if (task.priority !== undefined && task.priority !== 3) meta.push(`P${task.priority}`)
        const suffix = meta.length > 0 ? `  ${meta.join(' ')}` : ''
        console.log(`    ${icon} ${task.title}${id}${suffix}`)
      }
    }
  }
}
