import { loadStore, updateIssue, updateFeature } from '../lib/store.js'
import { parseFlag } from '../lib/args.js'

export function cmdUpdate(args: string[]) {
  const id = args[0]
  if (!id) {
    console.error('Usage: pm update <id> [--priority urgent|high|medium|low] [--title "..."] [--description "..."]')
    process.exit(1)
  }

  const priority = parseFlag(args, '--priority') as 'urgent' | 'high' | 'medium' | 'low' | undefined
  const title = parseFlag(args, '--title')
  const description = parseFlag(args, '--description')

  const store = loadStore()
  const issueId = id.startsWith('issue:') ? id.slice(6) : id

  const issue = store.issues.find(i => i.id === issueId)
  if (issue) {
    const updates: Record<string, string> = {}
    if (priority) updates.priority = priority
    if (title) updates.title = title
    if (description) updates.description = description

    if (Object.keys(updates).length === 0) {
      console.error('Nothing to update. Use --priority, --title, or --description.')
      process.exit(1)
    }

    updateIssue(issueId, updates)
    console.log(`Updated issue ${issueId}`)
    if (priority) console.log(`  priority: ${priority}`)
    if (title) console.log(`  title: ${title}`)
    return
  }

  const feature = store.features.find(f => f.id === id)
  if (feature) {
    const updates: Record<string, string> = {}
    if (title) updates.title = title
    if (description) updates.description = description

    if (Object.keys(updates).length === 0) {
      console.error('Nothing to update. Use --title or --description.')
      process.exit(1)
    }

    updateFeature(id, updates)
    console.log(`Updated feature ${id}`)
    if (title) console.log(`  title: ${title}`)
    return
  }

  console.error(`No issue or feature found with id: ${id}`)
  process.exit(1)
}
