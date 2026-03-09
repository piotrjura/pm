import { searchDecisions } from '../lib/store.js'

export function cmdWhy(args: string[]) {
  const query = args.join(' ').trim()
  if (!query) {
    console.error('Usage: pm why "search term"')
    console.error('Searches all decisions across features, tasks, and issues.')
    process.exit(1)
  }

  const matches = searchDecisions(query)

  if (matches.length === 0) {
    console.log(`No decisions matching "${query}"`)
    process.exit(0)
  }

  console.log(`Found ${matches.length} decision${matches.length === 1 ? '' : 's'} matching "${query}":\n`)

  for (const m of matches) {
    const date = new Date(m.decision.at).toLocaleDateString()
    const src = m.source

    if (src.type === 'feature') {
      console.log(`[${src.featureId}] ${src.featureTitle}`)
    } else if (src.type === 'task') {
      console.log(`[${src.taskId}] ${src.featureTitle} > ${src.taskTitle}`)
    } else {
      console.log(`[${src.issueId}] ${src.issueTitle}`)
    }

    console.log(`  Decision: ${m.decision.decision}`)
    if (m.decision.reasoning) console.log(`  Why: ${m.decision.reasoning}`)
    console.log(`  (${date})`)
    console.log()
  }
}
