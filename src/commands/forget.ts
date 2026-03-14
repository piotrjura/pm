import { removeDecision, searchDecisions } from '../lib/store.js'

export function cmdForget(args: string[]) {
  const query = args.join(' ').trim()
  if (!query) {
    console.error('Usage: pm forget "decision text or search term"')
    console.error('  Searches decisions and removes the first match.')
    process.exit(1)
  }

  // Try exact match first
  if (removeDecision(query)) {
    console.log(`Removed decision: "${query}"`)
    return
  }

  // Try search match
  const matches = searchDecisions(query)
  if (matches.length === 0) {
    console.error(`No decision matching "${query}"`)
    process.exit(1)
  }

  if (matches.length === 1) {
    const d = matches[0].decision
    if (removeDecision(d.decision)) {
      console.log(`Removed: "${d.decision}"`)
    }
    return
  }

  // Multiple matches — show them and ask to be more specific
  console.log(`Found ${matches.length} decisions matching "${query}". Be more specific:\n`)
  for (const m of matches) {
    console.log(`  • ${m.decision.decision}`)
  }
}
