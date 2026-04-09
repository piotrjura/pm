import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { recordDoctrinePull } from '../lib/hooks.js'

/** Resolve the doctrine directory shipped with the npm package.
 *  Works in dev (tsx, src/commands/doctrine.ts) and bundled (dist/cli.js). */
function doctrineDir(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  // dev: src/commands → ../../doctrine
  // bundled: dist → ../doctrine
  for (const rel of ['../../doctrine', '../doctrine']) {
    const candidate = join(here, rel)
    if (existsSync(candidate)) return candidate
  }
  return join(here, '..', 'doctrine')
}

/** List of doctrine names (without .md extension), sorted with router first. */
export function listDoctrines(): string[] {
  const dir = doctrineDir()
  if (!existsSync(dir)) return []
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''))
  // Router first, rest alphabetical
  const router = files.filter(n => n === 'router')
  const rest = files.filter(n => n !== 'router').sort()
  return [...router, ...rest]
}

/** Read a doctrine file by name. Returns null if not found. */
export function readDoctrine(name: string): string | null {
  const path = join(doctrineDir(), `${name}.md`)
  if (!existsSync(path)) return null
  return readFileSync(path, 'utf-8')
}

/**
 * `pm doctrine`         → list available doctrines
 * `pm doctrine <name>`  → print the doctrine markdown
 */
export function cmdDoctrine(args: string[]) {
  const name = args[0]

  if (!name) {
    const names = listDoctrines()
    if (names.length === 0) {
      console.error('No doctrine files found.')
      process.exit(1)
    }
    console.log('Available doctrines:')
    for (const n of names) {
      console.log(`  pm doctrine ${n}`)
    }
    console.log()
    console.log('Start with: pm doctrine router')
    return
  }

  const content = readDoctrine(name)
  if (content === null) {
    console.error(`Unknown doctrine: ${name}`)
    console.error()
    console.error('Available:')
    for (const n of listDoctrines()) {
      console.error(`  ${n}`)
    }
    process.exit(1)
  }

  // Record this pull silently — feeds the prompt-context nudges and pre-edit hard-block
  try {
    recordDoctrinePull(process.cwd(), name)
  } catch {
    // Non-pm directory or fs error, skip silently
  }

  process.stdout.write(content)
}
