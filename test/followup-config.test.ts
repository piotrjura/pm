import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createTestDir, cleanupTestDir, pm, loadData } from './helpers.js'

const TSX = join(import.meta.dirname, '..', 'node_modules', '.bin', 'tsx')
const CLI = join(import.meta.dirname, '..', 'src', 'cli.tsx')

let cwd: string

beforeEach(() => { cwd = createTestDir() })
afterEach(() => { cleanupTestDir(cwd) })

function readConfig(dir: string) {
  return JSON.parse(readFileSync(join(dir, '.pm', 'config.json'), 'utf-8'))
}

function writeConfig(dir: string, config: Record<string, string>) {
  const pmDir = join(dir, '.pm')
  if (!existsSync(pmDir)) mkdirSync(pmDir, { recursive: true })
  writeFileSync(join(pmDir, 'config.json'), JSON.stringify(config, null, 2))
}

function runHook(hookName: string, dir: string, stdin?: string) {
  return spawnSync(TSX, [CLI, 'hook', hookName], {
    input: stdin ?? '',
    encoding: 'utf-8',
    cwd: dir,
    env: { ...process.env as Record<string, string>, NO_COLOR: '1' },
    timeout: 10_000,
  })
}

describe('followup config', () => {
  it('init creates config with followup=medium default', () => {
    pm('init', cwd)
    const config = readConfig(cwd)
    expect(config.followup).toBe('medium')
  })

  it('loads followup from existing config', () => {
    pm('init', cwd)
    writeConfig(cwd, { planning: 'all', questions: 'thorough', followup: 'thorough' })

    // Non-TTY settings dumps JSON
    const result = pm('settings', cwd)
    expect(result.stdout).toContain('"followup": "thorough"')
  })

  it('defaults followup to medium when missing from old config', () => {
    pm('init', cwd)
    // Simulate old config without followup
    writeConfig(cwd, { planning: 'medium', questions: 'medium' })

    const result = pm('settings', cwd)
    expect(result.stdout).toContain('"followup": "medium"')
  })

  it('ignores invalid followup values', () => {
    pm('init', cwd)
    writeConfig(cwd, { planning: 'medium', questions: 'medium', followup: 'invalid' })

    const result = pm('settings', cwd)
    expect(result.stdout).toContain('"followup": "medium"')
  })
})

describe('followup in hook output', () => {
  it('surfaces followup setting in prompt-context when no active work', () => {
    pm('init', cwd)
    writeConfig(cwd, { planning: 'all', questions: 'thorough', followup: 'thorough' })

    const result = runHook('prompt-context', cwd, JSON.stringify({ prompt: 'hello' }))
    expect(result.stdout).toContain('followup=thorough')
  })

  it('surfaces workflow settings line in active work context', () => {
    pm('init', cwd)
    writeConfig(cwd, { planning: 'medium', questions: 'medium', followup: 'none' })
    pm('add-issue "Test issue"', cwd)

    const result = runHook('prompt-context', cwd, JSON.stringify({ prompt: 'continue' }))
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('[pm] Active work:')
    // Workflow line must appear on every prompt regardless of state
    expect(result.stdout).toContain('Workflow: planning=medium, questions=medium, followup=none')
  })

  it('surfaces workflow settings line in active work with strongest settings', () => {
    pm('init', cwd)
    writeConfig(cwd, { planning: 'all', questions: 'thorough', followup: 'thorough' })
    pm('add-issue "Test issue"', cwd)

    const result = runHook('prompt-context', cwd, JSON.stringify({ prompt: 'continue' }))
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Workflow: planning=all, questions=thorough, followup=thorough')
  })
})
