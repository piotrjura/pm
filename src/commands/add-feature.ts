import { addFeature } from '../lib/store.js'
import { parseFlag, hasFlag } from '../lib/args.js'

export function cmdAddFeature(args: string[]) {
  const title = args[0]
  if (!title) {
    console.error('Usage: pm add-feature <title> [--description "..."]')
    process.exit(1)
  }

  const description = parseFlag(args, '--description')
  const type = hasFlag(args, '--fix') ? 'fix' as const : 'feature' as const
  const feature = addFeature(title, description, type)
  console.log(`feature:${feature.id}`)
  console.log(`Created feature: ${feature.title}`)
  if (description) console.log(`Description: ${description}`)
  console.log()
  console.log(`Add phases:  pm add-phase ${feature.id} "Phase title"`)
}
