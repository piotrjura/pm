import { loadStore } from '../lib/store.js'
import { STATUS_ICON, PRIORITY_COLOR } from '../lib/format.js'
export function cmdShow(args: string[]) {
  const id = args[0]
  if (!id) {
    console.error('Usage: pm show <featureId|issueId>')
    process.exit(1)
  }

  const store = loadStore()

  // Try features first
  const feature = store.features.find(f => f.id === id)
  if (feature) {
    showFeature(feature)
    return
  }

  // Try issues
  const issue = store.issues.find(i => i.id === id)
  if (issue) {
    showIssue(issue)
    return
  }

  console.error(`Not found: ${id} (checked features and issues)`)
  process.exit(1)
}

function showFeature(feature: ReturnType<typeof loadStore>['features'][0]) {
  console.log(`[${feature.status.toUpperCase()}] ${feature.title}  [feature:${feature.id}]`)
  if (feature.description) console.log(`  ${feature.description}`)

  // Feature-level decisions (always shown)
  if (feature.decisions?.length) {
    console.log()
    console.log('  Decisions:')
    for (const d of feature.decisions) {
      console.log(`    • ${d.decision}`)
      if (d.reasoning) console.log(`      Why: ${d.reasoning}`)
    }
  }

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
      if ((task.attempt ?? 0) > 0) meta.push(`attempt ${task.attempt}`)
      if (task.doneAt) meta.push(`done ${task.doneAt.slice(0, 10)}`)
      const metaStr = meta.length > 0 ? `  ${meta.join(' ')}` : ''
      console.log(`    ${icon} ${task.title}  [task:${task.id}]${metaStr}`)
      if (task.description) console.log(`       desc: ${task.description}`)
      if (task.note) console.log(`       note: ${task.note}`)
      if (task.decisions?.length) {
        for (const d of task.decisions) {
          console.log(`       decision: ${d.decision}`)
          if (d.reasoning) console.log(`         why: ${d.reasoning}`)
        }
      }
      if (task.files?.length) console.log(`       files: ${task.files.join(', ')}`)
    }
    console.log()
  }
}

function showIssue(issue: ReturnType<typeof loadStore>['issues'][0]) {
  const typeLabel = issue.type === 'bug' ? 'BUG' : 'CHANGE'
  console.log(`[${typeLabel}] ${issue.title}  [issue:${issue.id}]`)
  console.log(`  Status: ${issue.status}  Priority: ${issue.priority}`)
  if (issue.description) console.log(`  ${issue.description}`)
  console.log(`  Created: ${issue.createdAt.slice(0, 10)}`)

  if (issue.decisions?.length) {
    console.log()
    console.log('  Decisions:')
    for (const d of issue.decisions) {
      console.log(`    • ${d.decision}`)
      if (d.reasoning) console.log(`      Why: ${d.reasoning}`)
    }
  }
}
