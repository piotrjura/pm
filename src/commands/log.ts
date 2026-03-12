import { getLog } from '../lib/store.js'

export function cmdLog(args: string[]) {
  const limitArg = args.find(a => /^\d+$/.test(a))
  const limit = limitArg ? parseInt(limitArg, 10) : 20

  const entries = getLog(limit)

  if (entries.length === 0) {
    console.log('No log entries yet.')
    return
  }

  for (const entry of entries) {
    const time = new Date(entry.at).toLocaleString()
    const icon = entry.action === 'completed' ? '✓' : entry.action === 'started' ? '▶' : entry.action === 'reset' ? '↺' : '✗'
    const meta = [entry.agent, entry.model].filter(Boolean).join('/')
    const metaLabel = meta ? ` [${meta}]` : ''
    console.log(`${icon} ${time}${metaLabel}`)
    if (entry.issueTitle) {
      console.log(`  Issue: ${entry.issueTitle}`)
    } else {
      console.log(`  ${entry.featureTitle} › ${entry.phaseTitle} › ${entry.taskTitle}`)
    }
    if (entry.note) console.log(`  Note: ${entry.note}`)
    console.log()
  }
}
