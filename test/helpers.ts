import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const CLI = join(import.meta.dirname, '..', 'src', 'cli.tsx')
const TSX = join(import.meta.dirname, '..', 'node_modules', '.bin', 'tsx')

export function createTestDir(): string {
  return mkdtempSync(join(tmpdir(), 'pm-test-'))
}

export function cleanupTestDir(dir: string) {
  rmSync(dir, { recursive: true, force: true })
}

/** Parse a command string into args, respecting quoted strings */
function parseArgs(input: string): string[] {
  const args: string[] = []
  let current = ''
  let inQuote = false
  let quoteChar = ''
  for (const ch of input) {
    if (inQuote) {
      if (ch === quoteChar) { inQuote = false }
      else { current += ch }
    } else if (ch === '"' || ch === "'") {
      inQuote = true
      quoteChar = ch
    } else if (ch === ' ' || ch === '\t') {
      if (current) { args.push(current); current = '' }
    } else {
      current += ch
    }
  }
  if (current) args.push(current)
  return args
}

export function pm(args: string, cwd: string): { stdout: string; exitCode: number } {
  const env: Record<string, string> = { ...process.env as Record<string, string>, NO_COLOR: '1' }
  const result = spawnSync(TSX, [CLI, ...parseArgs(args)], {
    cwd,
    encoding: 'utf-8',
    env,
    timeout: 10_000,
  })
  const stdout = (result.stdout ?? '') + (result.stderr ?? '')
  return { stdout, exitCode: result.status ?? 1 }
}

export function dataFileExists(cwd: string): boolean {
  return existsSync(join(cwd, '.pm', 'data.json'))
}

export function loadData(cwd: string) {
  const raw = readFileSync(join(cwd, '.pm', 'data.json'), 'utf-8')
  return JSON.parse(raw)
}


/** Run a full feature workflow and return all the IDs */
export function createFullFeature(cwd: string, title = 'Test-feature') {
  const feat = pm(`add-feature ${title}`, cwd)
  const featureId = feat.stdout.match(/^feature:(\S+)/m)![1]

  const phase = pm(`add-phase ${featureId} Phase-1`, cwd)
  const phaseId = phase.stdout.match(/^phase:(\S+)/m)![1]

  const task = pm(`add-task ${featureId} ${phaseId} Task-1`, cwd)
  const taskId = task.stdout.match(/^task:(\S+)/m)![1]

  return { featureId, phaseId, taskId }
}
