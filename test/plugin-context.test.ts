import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTestDir, cleanupTestDir, pm } from './helpers.js'

const CLI = join(import.meta.dirname, '..', 'src', 'cli.tsx')
const TSX = join(import.meta.dirname, '..', 'node_modules', '.bin', 'tsx')

let cwd: string
beforeEach(() => { cwd = createTestDir() })
afterEach(() => { cleanupTestDir(cwd) })

describe('session-start in plugin context', () => {
  it('succeeds with CLAUDE_PLUGIN_ROOT set', () => {
    pm('add-issue "test issue"', cwd, { agent: 'claude-code' })

    const projectRoot = join(import.meta.dirname, '..')
    const result = spawnSync(TSX, [CLI, 'hook', 'session-start', '--agent', 'claude-code', '--instance', '12345'], {
      cwd,
      encoding: 'utf-8',
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: projectRoot, NO_COLOR: '1' },
      input: JSON.stringify({ model: 'test-model' }),
      timeout: 10_000,
    })

    expect(result.status).toBe(0)
  })

  it('still works without CLAUDE_PLUGIN_ROOT', () => {
    pm('add-issue "test issue"', cwd, { agent: 'claude-code' })

    const result = spawnSync(TSX, [CLI, 'hook', 'session-start', '--agent', 'claude-code', '--instance', '12345'], {
      cwd,
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1' },
      input: JSON.stringify({ model: 'test-model' }),
      timeout: 10_000,
    })

    expect(result.status).toBe(0)
  })
})

describe('lazy config init', () => {
  it('creates config.json with defaults on first pm command', () => {
    pm('add-issue "test"', cwd, { agent: 'claude-code' })

    const configPath = join(cwd, '.pm', 'config.json')
    expect(existsSync(configPath)).toBe(true)

    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(config.decisions).toBe(true)
    expect(config.agents).toContain('claude-code')
  })
})

describe('slim prompt-context in plugin mode', () => {
  it('mentions pm-workflow skill when CLAUDE_PLUGIN_ROOT is set and no active work', () => {
    // Initialize pm data so prompt-context has a store to read
    pm('add-issue "setup"', cwd, { agent: 'claude-code' })
    // Mark it done so there's no active work
    const data = JSON.parse(readFileSync(join(cwd, '.pm', 'data.json'), 'utf-8'))
    const issueId = data.issues[0]?.id
    if (issueId) pm(`done ${issueId} --note "done"`, cwd, { agent: 'claude-code' })

    const projectRoot = join(import.meta.dirname, '..')
    const result = spawnSync(TSX, [CLI, 'hook', 'prompt-context', '--agent', 'claude-code'], {
      cwd,
      encoding: 'utf-8',
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: projectRoot, NO_COLOR: '1' },
      input: JSON.stringify({ prompt: 'fix the button' }),
      timeout: 10_000,
    })

    const output = result.stdout ?? ''
    expect(output).toContain('pm-workflow')
    expect(output).not.toContain('Scope rules:')
  })

  it('shows full instructions without CLAUDE_PLUGIN_ROOT when no active work', () => {
    pm('add-issue "setup"', cwd, { agent: 'claude-code' })
    const data = JSON.parse(readFileSync(join(cwd, '.pm', 'data.json'), 'utf-8'))
    const issueId = data.issues[0]?.id
    if (issueId) pm(`done ${issueId} --note "done"`, cwd, { agent: 'claude-code' })

    const result = spawnSync(TSX, [CLI, 'hook', 'prompt-context', '--agent', 'claude-code'], {
      cwd,
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1' },
      input: JSON.stringify({ prompt: 'fix something' }),
      timeout: 10_000,
    })

    const output = result.stdout ?? ''
    expect(output).toContain('Scope rules:')
  })
})
