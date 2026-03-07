import { addIssue } from '../lib/store.js'
import { parseFlag } from '../lib/args.js'
import type { Issue } from '../lib/types.js'

const VALID_PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const
const VALID_TYPES = ['bug', 'change'] as const

export function cmdAddIssue(args: string[]) {
  const title = args[0]
  if (!title) {
    console.error('Usage: pm add-issue <title> [--type bug|change] [--priority urgent|high|medium|low] [--description "..."]')
    process.exit(1)
  }

  const priorityRaw = parseFlag(args, '--priority') ?? 'medium'
  if (!VALID_PRIORITIES.includes(priorityRaw as Issue['priority'])) {
    console.error(`Invalid priority "${priorityRaw}". Use: urgent|high|medium|low`)
    process.exit(1)
  }
  const priority = priorityRaw as Issue['priority']

  const typeRaw = parseFlag(args, '--type') ?? 'change'
  if (!VALID_TYPES.includes(typeRaw as Issue['type'])) {
    console.error(`Invalid type "${typeRaw}". Use: bug|change`)
    process.exit(1)
  }
  const type = typeRaw as Issue['type']

  const description = parseFlag(args, '--description')

  const issue = addIssue(title, priority, description, type)
  console.log(`issue:${issue.id}`)
  console.log(`Created [${issue.type}]: ${issue.title}`)
  console.log(`Priority: ${issue.priority}`)
  if (description) console.log(`Description: ${description}`)
}
