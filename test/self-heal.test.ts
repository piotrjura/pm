import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createTestDir, cleanupTestDir, pm } from './helpers.js'

let cwd: string

beforeEach(() => { cwd = createTestDir() })
afterEach(() => { cleanupTestDir(cwd) })

function readSettings(cwd: string): { hooks?: Record<string, unknown[]> } {
  const path = join(cwd, '.claude', 'settings.json')
  if (!existsSync(path)) return {}
  return JSON.parse(readFileSync(path, 'utf-8'))
}

describe('self-heal hooks', () => {
  it('reinstalls hooks if .claude/settings.json was wiped', () => {
    pm('init', cwd)

    // Verify hooks were installed by init
    let settings = readSettings(cwd)
    expect(settings.hooks).toBeDefined()
    expect(Object.keys(settings.hooks ?? {}).length).toBeGreaterThan(0)

    // Wipe hooks
    writeFileSync(join(cwd, '.claude', 'settings.json'), '{}')

    // Run a non-init pm command — self-heal should restore hooks
    const result = pm('list', cwd)
    expect(result.stdout).toContain('Self-healed Claude Code hooks')

    settings = readSettings(cwd)
    expect(settings.hooks).toBeDefined()
    expect(Object.keys(settings.hooks ?? {}).length).toBeGreaterThan(0)
  })

  it('is silent on subsequent runs when hooks are already correct', () => {
    pm('init', cwd)
    pm('list', cwd) // first run, no drift, should be silent

    const result = pm('list', cwd)
    expect(result.stdout).not.toContain('Self-healed')
  })

  it('skips self-heal in directories that are not pm projects', () => {
    // Don't init pm in this directory
    const result = pm('list', cwd)

    // Should not write .claude/settings.json
    expect(existsSync(join(cwd, '.claude'))).toBe(false)
    // Should not say "self-healed"
    expect(result.stdout).not.toContain('Self-healed')
  })

  it('does not run self-heal during pm init (init owns hook installation)', () => {
    // Pre-create .pm/ to make it look like a pm project (forces self-heal gate to pass)
    mkdirSync(join(cwd, '.pm'), { recursive: true })

    const result = pm('init', cwd)
    // init's own message wins; self-heal does not duplicate it
    expect(result.stdout).not.toContain('Self-healed')
  })
})
