import { searchDecisions, loadStore } from '../lib/store.js'
import type { DecisionMatch } from '../lib/store.js'

export function cmdWhy(args: string[]) {
  const query = args.join(' ').trim()

  // No query — list all decisions
  if (!query) {
    listAllDecisions()
    return
  }

  const matches = searchDecisions(query)

  if (matches.length === 0) {
    console.log(`No decisions matching "${query}"`)
    process.exit(0)
  }

  console.log(`Found ${matches.length} decision${matches.length === 1 ? '' : 's'} matching "${query}":\n`)
  printDecisions(matches)
}

function listAllDecisions() {
  const store = loadStore()
  const all: DecisionMatch[] = []

  for (const feature of store.features) {
    for (const d of feature.decisions ?? []) {
      all.push({ decision: d, source: { type: 'feature', featureId: feature.id, featureTitle: feature.title } })
    }
    for (const phase of feature.phases) {
      for (const task of phase.tasks) {
        for (const d of task.decisions ?? []) {
          all.push({ decision: d, source: { type: 'task', featureId: feature.id, featureTitle: feature.title, taskId: task.id, taskTitle: task.title } })
        }
      }
    }
  }

  for (const issue of store.issues) {
    for (const d of issue.decisions ?? []) {
      all.push({ decision: d, source: { type: 'issue', issueId: issue.id, issueTitle: issue.title } })
    }
  }

  if (all.length === 0) {
    console.log('No decisions recorded yet.')
    console.log('Record one: pm decide <id> "what you decided" --reasoning "why"')
    return
  }

  // Sort newest first
  all.sort((a, b) => b.decision.at.localeCompare(a.decision.at))

  console.log(`${all.length} decision${all.length === 1 ? '' : 's'}:\n`)
  printDecisions(all)
}

function printDecisions(matches: DecisionMatch[]) {
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
    if (m.decision.action) console.log(`  Action: ${m.decision.action}`)
    console.log(`  (${date})`)
    console.log()
  }
}
