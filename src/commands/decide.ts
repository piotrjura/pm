import { addDecision } from '../lib/store.js'
import { parseFlag } from '../lib/args.js'

export function cmdDecide(args: string[]) {
  const id = args[0]
  if (!id) {
    console.error('Usage: pm decide <featureId|taskId|issueId> "what was decided" [--reasoning "why"] [--action "do this"]')
    process.exit(1)
  }

  const decision = args[1]
  if (!decision) {
    console.error('Usage: pm decide <id> "what was decided" [--reasoning "why"] [--action "do this"]')
    process.exit(1)
  }

  const reasoning = parseFlag(args.slice(1), '--reasoning')
  const action = parseFlag(args.slice(1), '--action')

  const result = addDecision(id, decision, reasoning, action)
  if (!result) {
    console.error(`Not found: ${id}`)
    process.exit(1)
  }

  console.log(`Decision recorded on ${id}`)
  console.log(`  Decision : ${decision}`)
  if (reasoning) console.log(`  Reasoning: ${reasoning}`)
  if (action) console.log(`  Action   : ${action}`)
}
