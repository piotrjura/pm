import { resetStuckTasks, resetErrorTasks, deleteEmptyDraftFeatures, getActionItems } from '../lib/store.js'
import { hasFlag } from '../lib/args.js'

export function cmdCleanup(args: string[]) {
  const doErrors = hasFlag(args, '--errors') || hasFlag(args, '--all')
  const doDrafts = hasFlag(args, '--drafts') || hasFlag(args, '--all')
  const quiet = hasFlag(args, '--quiet')

  // Always reset stuck in-progress tasks
  const stuck = resetStuckTasks()

  // Optionally reset error tasks
  const errors = doErrors ? resetErrorTasks() : { tasksReset: [], featuresReverted: [] }

  // Optionally delete empty drafts
  const drafts = doDrafts ? deleteEmptyDraftFeatures() : []

  // Get remaining action items
  const items = getActionItems()

  if (quiet) {
    printQuiet(stuck, errors, drafts, items)
  } else {
    printVerbose(stuck, errors, drafts, items, { doErrors, doDrafts })
  }
}

function printQuiet(
  stuck: ReturnType<typeof resetStuckTasks>,
  errors: ReturnType<typeof resetErrorTasks>,
  drafts: ReturnType<typeof deleteEmptyDraftFeatures>,
  items: ReturnType<typeof getActionItems>,
) {
  const lines: string[] = []

  if (stuck.tasksReset.length > 0) {
    lines.push(`[pm] Reset ${stuck.tasksReset.length} stuck task${stuck.tasksReset.length === 1 ? '' : 's'}:`)
    for (const t of stuck.tasksReset) {
      lines.push(`[pm]   ↺ "${t.taskTitle}" (${t.featureTitle})`)
    }
  }

  if (errors.tasksReset.length > 0) {
    lines.push(`[pm] Reset ${errors.tasksReset.length} error task${errors.tasksReset.length === 1 ? '' : 's'}:`)
    for (const t of errors.tasksReset) {
      lines.push(`[pm]   ↺ "${t.taskTitle}" (${t.featureTitle})`)
    }
  }

  if (drafts.length > 0) {
    lines.push(`[pm] Deleted ${drafts.length} empty draft${drafts.length === 1 ? '' : 's'}:`)
    for (const d of drafts) {
      lines.push(`[pm]   ✕ "${d.featureTitle}"`)
    }
  }

  // Report remaining action items
  const hasItems = items.errorTasks.length > 0 || items.emptyDrafts.length > 0
  if (hasItems) {
    lines.push(`[pm] Items needing attention:`)
    for (const t of items.errorTasks) {
      lines.push(`[pm]   ✗ Error: "${t.taskTitle}" (${t.featureTitle}) — retry with: pm retry ${t.taskId}`)
    }
    for (const d of items.emptyDrafts) {
      lines.push(`[pm]   ○ Empty draft: "${d.featureTitle}" — add phases or delete`)
    }
    lines.push(`[pm] Ask the user what to do with the items above before proceeding.`)
  }

  if (lines.length > 0) {
    console.log(lines.join('\n'))
  }
}

function printVerbose(
  stuck: ReturnType<typeof resetStuckTasks>,
  errors: ReturnType<typeof resetErrorTasks>,
  drafts: ReturnType<typeof deleteEmptyDraftFeatures>,
  items: ReturnType<typeof getActionItems>,
  flags: { doErrors: boolean; doDrafts: boolean },
) {
  const didAnything = stuck.tasksReset.length > 0 || errors.tasksReset.length > 0 || drafts.length > 0

  if (stuck.tasksReset.length > 0) {
    console.log(`Reset ${stuck.tasksReset.length} stuck task${stuck.tasksReset.length === 1 ? '' : 's'}:`)
    for (const t of stuck.tasksReset) {
      console.log(`  ↺ "${t.taskTitle}" (${t.featureTitle})`)
    }
    if (stuck.featuresReverted.length > 0) {
      console.log(`  Reverted ${stuck.featuresReverted.length} feature${stuck.featuresReverted.length === 1 ? '' : 's'} to planned`)
    }
    console.log()
  }

  if (errors.tasksReset.length > 0) {
    console.log(`Reset ${errors.tasksReset.length} error task${errors.tasksReset.length === 1 ? '' : 's'}:`)
    for (const t of errors.tasksReset) {
      console.log(`  ↺ "${t.taskTitle}" (${t.featureTitle})`)
    }
    console.log()
  }

  if (drafts.length > 0) {
    console.log(`Deleted ${drafts.length} empty draft${drafts.length === 1 ? '' : 's'}:`)
    for (const d of drafts) {
      console.log(`  ✕ "${d.featureTitle}"`)
    }
    console.log()
  }

  if (!didAnything) {
    console.log('Nothing to clean up.')
  }

  // Show remaining action items with hints
  const hints: string[] = []
  if (!flags.doErrors && items.errorTasks.length > 0) {
    hints.push(`  ${items.errorTasks.length} error task${items.errorTasks.length === 1 ? '' : 's'} — use --errors to reset`)
    for (const t of items.errorTasks) {
      hints.push(`    ✗ "${t.taskTitle}" (${t.featureTitle})`)
    }
  }
  if (!flags.doDrafts && items.emptyDrafts.length > 0) {
    hints.push(`  ${items.emptyDrafts.length} empty draft${items.emptyDrafts.length === 1 ? '' : 's'} — use --drafts to delete`)
    for (const d of items.emptyDrafts) {
      hints.push(`    ○ "${d.featureTitle}"`)
    }
  }

  if (hints.length > 0) {
    console.log('Remaining items:')
    for (const h of hints) console.log(h)
  }
}
