import { upgradeIssueToFeature } from '../lib/store.js'
import { loadSession } from '../lib/hooks.js'

export function cmdUpgrade(args: string[]) {
  const issueId = args[0]
  if (!issueId) {
    console.error('Usage: pm upgrade <issueId>')
    console.error('Converts an issue to a feature with phases and tasks.')
    process.exit(1)
  }

  // Load session to create retroactive task from files already edited
  const cwd = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
  const session = loadSession(cwd)
  const upgradeSession = session?.activeId === issueId && session.files.length > 0
    ? { files: session.files, editCount: session.editCount }
    : undefined

  const feature = upgradeIssueToFeature(issueId, upgradeSession)
  if (!feature) {
    console.error(`Issue "${issueId}" not found.`)
    process.exit(1)
  }

  console.log(`feature:${feature.id}`)
  console.log(`Upgraded issue to feature: ${feature.title}`)
  if (feature.decisions?.length) {
    console.log(`Preserved ${feature.decisions.length} decision(s)`)
  }

  // Show retroactive task info
  if (feature.phases.length > 0) {
    const retroPhase = feature.phases[0]
    const retroTask = retroPhase.tasks[0]
    console.log()
    console.log(`Created retroactive task for work already done:`)
    console.log(`  Phase: ${retroPhase.title} (${retroPhase.id})`)
    console.log(`  Task:  ${retroTask.title} [done]`)
    if (retroTask.files?.length) {
      console.log(`  Files: ${retroTask.files.join(', ')}`)
    }
  }

  console.log()
  console.log(`⚠ You MUST add at least 2 tasks for the remaining work before editing code.`)
  console.log(`  Edits will be BLOCKED until 2+ pending tasks exist.`)

  const phaseId = feature.phases[0]?.id
  if (phaseId) {
    console.log()
    console.log(`Add tasks to the existing phase:`)
    console.log(`  pm add-task ${feature.id} ${phaseId} "Task title"`)
    console.log(`  pm add-task ${feature.id} ${phaseId} "Another task"`)
    console.log(`  pm start <taskId>`)
  } else {
    console.log()
    console.log(`Next steps:`)
    console.log(`  pm add-phase ${feature.id} "Phase title"`)
    console.log(`  pm add-task ${feature.id} <phaseId> "Task 1"`)
    console.log(`  pm add-task ${feature.id} <phaseId> "Task 2"`)
    console.log(`  pm start <taskId>`)
  }
}
