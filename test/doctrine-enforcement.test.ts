import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createTestDir, cleanupTestDir, pm, createFullFeature } from './helpers.js'

const TSX = join(import.meta.dirname, '..', 'node_modules', '.bin', 'tsx')
const CLI = join(import.meta.dirname, '..', 'src', 'cli.tsx')

let cwd: string

beforeEach(() => { cwd = createTestDir() })
afterEach(() => { cleanupTestDir(cwd) })

function runHook(hookName: string, dir: string, stdin?: string) {
  return spawnSync(TSX, [CLI, 'hook', hookName], {
    input: stdin ?? '',
    encoding: 'utf-8',
    cwd: dir,
    env: { ...process.env as Record<string, string>, NO_COLOR: '1' },
    timeout: 10_000,
  })
}

function writeConfig(dir: string, config: Record<string, string>) {
  const pmDir = join(dir, '.pm')
  if (!existsSync(pmDir)) mkdirSync(pmDir, { recursive: true })
  writeFileSync(join(pmDir, 'config.json'), JSON.stringify(config, null, 2))
}

function readDoctrineSession(dir: string) {
  const path = join(dir, '.pm', 'doctrine-session.json')
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf-8'))
}

describe('doctrine pull tracking', () => {
  it('session-start hook resets doctrine-session.json with router pre-populated', () => {
    pm('init', cwd)

    runHook('session-start', cwd, '')

    const session = readDoctrineSession(cwd)
    expect(session).not.toBeNull()
    expect(session.pulled).toEqual(['router'])
    expect(session.sessionId).toBeTruthy()
  })

  it('pm doctrine <name> records the pull silently', () => {
    pm('init', cwd)
    runHook('session-start', cwd, '')

    const result = pm('doctrine planning', cwd)
    // Output is the doctrine content, NOT a confirmation footer
    expect(result.stdout).toContain('# pm doctrine: planning')
    expect(result.stdout).not.toContain('recorded')
    expect(result.stdout).not.toContain('acknowledged')

    const session = readDoctrineSession(cwd)
    expect(session.pulled).toContain('planning')
    expect(session.pulled).toContain('router')
  })

  it('pm doctrine listing (no args) does NOT record a pull', () => {
    pm('init', cwd)
    runHook('session-start', cwd, '')

    pm('doctrine', cwd)

    const session = readDoctrineSession(cwd)
    expect(session.pulled).toEqual(['router']) // unchanged
  })

  it('recordDoctrinePull is idempotent', () => {
    pm('init', cwd)
    runHook('session-start', cwd, '')

    pm('doctrine planning', cwd)
    pm('doctrine planning', cwd)
    pm('doctrine planning', cwd)

    const session = readDoctrineSession(cwd)
    const planningCount = session.pulled.filter((n: string) => n === 'planning').length
    expect(planningCount).toBe(1)
  })
})

describe('prompt-context doctrine nudges', () => {
  it('surfaces BLOCKING nudge for missing required doctrines at strongest settings', () => {
    pm('init', cwd)
    writeConfig(cwd, { planning: 'all', questions: 'thorough', followup: 'thorough' })
    runHook('session-start', cwd, '')

    const result = runHook('prompt-context', cwd, JSON.stringify({ prompt: 'hello' }))
    expect(result.stdout).toContain('BLOCKING')
    expect(result.stdout).toContain('pm doctrine planning')
    expect(result.stdout).toContain('pm doctrine questions')
    expect(result.stdout).toContain('pm doctrine followup')
    expect(result.stdout).toContain('pm doctrine decisions')
  })

  it('surfaces advisory nudge for medium settings', () => {
    pm('init', cwd)
    writeConfig(cwd, { planning: 'medium', questions: 'medium', followup: 'medium' })
    runHook('session-start', cwd, '')

    const result = runHook('prompt-context', cwd, JSON.stringify({ prompt: 'hello' }))
    expect(result.stdout).toContain('Advisory')
    expect(result.stdout).toContain('pm doctrine planning')
    // decisions is always-required regardless of setting
    expect(result.stdout).toContain('BLOCKING')
    expect(result.stdout).toContain('pm doctrine decisions')

    // Slice output into the BLOCKING and Advisory sections
    const blockingStart = result.stdout.indexOf('BLOCKING')
    const advisoryStart = result.stdout.indexOf('Advisory')
    const blockingSection = result.stdout.slice(blockingStart, advisoryStart)
    const advisorySection = result.stdout.slice(advisoryStart)

    // medium-level doctrines should be in Advisory, NOT in BLOCKING
    expect(blockingSection).not.toContain('pm doctrine planning')
    expect(blockingSection).not.toContain('pm doctrine questions')
    expect(blockingSection).not.toContain('pm doctrine followup')
    expect(advisorySection).toContain('pm doctrine planning')
    expect(advisorySection).toContain('pm doctrine questions')
    expect(advisorySection).toContain('pm doctrine followup')
  })

  it('does not nudge after the doctrine has been pulled', () => {
    pm('init', cwd)
    writeConfig(cwd, { planning: 'all', questions: 'thorough', followup: 'thorough' })
    runHook('session-start', cwd, '')

    pm('doctrine planning', cwd)
    pm('doctrine questions', cwd)
    pm('doctrine followup', cwd)
    pm('doctrine decisions', cwd)

    const result = runHook('prompt-context', cwd, JSON.stringify({ prompt: 'hello' }))
    expect(result.stdout).not.toContain('BLOCKING')
    expect(result.stdout).not.toContain('Advisory')
  })

  it('surfaces nudges in active-work branch too', () => {
    pm('init', cwd)
    writeConfig(cwd, { planning: 'all', questions: 'thorough', followup: 'thorough' })
    runHook('session-start', cwd, '')
    pm('add-issue "Test issue"', cwd)

    const result = runHook('prompt-context', cwd, JSON.stringify({ prompt: 'go' }))
    expect(result.stdout).toContain('[pm] Active work:')
    expect(result.stdout).toContain('BLOCKING')
    expect(result.stdout).toContain('pm doctrine planning')
  })
})

describe('pre-edit doctrine hard-block', () => {
  function preEditPayload(filePath: string) {
    return JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: filePath } })
  }

  it('hard-blocks when required doctrines are not pulled', () => {
    pm('init', cwd)
    writeConfig(cwd, { planning: 'all', questions: 'thorough', followup: 'thorough' })
    runHook('session-start', cwd, '')
    pm('add-issue "Test"', cwd)

    const result = runHook('pre-edit', cwd, preEditPayload(join(cwd, 'src/foo.ts')))
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('BLOCKED')
    expect(result.stderr).toContain('pm doctrine planning')
    expect(result.stderr).toContain('pm doctrine decisions')
  })

  it('allows edits once all required doctrines have been pulled', () => {
    pm('init', cwd)
    writeConfig(cwd, { planning: 'all', questions: 'thorough', followup: 'thorough' })
    runHook('session-start', cwd, '')
    pm('add-issue "Test"', cwd)

    pm('doctrine planning', cwd)
    pm('doctrine questions', cwd)
    pm('doctrine followup', cwd)
    pm('doctrine decisions', cwd)

    const result = runHook('pre-edit', cwd, preEditPayload(join(cwd, 'src/foo.ts')))
    expect(result.status).toBe(0)
  })

  it('only requires decisions doctrine at medium settings (no block on planning/questions/followup)', () => {
    pm('init', cwd)
    writeConfig(cwd, { planning: 'medium', questions: 'medium', followup: 'medium' })
    runHook('session-start', cwd, '')
    pm('add-issue "Test"', cwd)

    // Pull only decisions — should be enough to unblock
    pm('doctrine decisions', cwd)

    const result = runHook('pre-edit', cwd, preEditPayload(join(cwd, 'src/foo.ts')))
    expect(result.status).toBe(0)
  })

  it('blocks at medium settings if decisions doctrine not pulled (always-on)', () => {
    pm('init', cwd)
    writeConfig(cwd, { planning: 'medium', questions: 'medium', followup: 'medium' })
    runHook('session-start', cwd, '')
    pm('add-issue "Test"', cwd)

    const result = runHook('pre-edit', cwd, preEditPayload(join(cwd, 'src/foo.ts')))
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('pm doctrine decisions')
  })

  it('allows exempt paths even when doctrines are missing', () => {
    pm('init', cwd)
    writeConfig(cwd, { planning: 'all', questions: 'thorough', followup: 'thorough' })
    runHook('session-start', cwd, '')
    pm('add-issue "Test"', cwd)

    // .claude/ path
    const r1 = runHook('pre-edit', cwd, preEditPayload(join(cwd, '.claude/settings.json')))
    expect(r1.status).toBe(0)

    // CLAUDE.md
    const r2 = runHook('pre-edit', cwd, preEditPayload(join(cwd, 'CLAUDE.md')))
    expect(r2.status).toBe(0)

    // .pm/ path
    const r3 = runHook('pre-edit', cwd, preEditPayload(join(cwd, '.pm/config.json')))
    expect(r3.status).toBe(0)
  })

  it('lists all missing required doctrines in a single block message', () => {
    pm('init', cwd)
    writeConfig(cwd, { planning: 'all', questions: 'thorough', followup: 'thorough' })
    runHook('session-start', cwd, '')
    pm('add-issue "Test"', cwd)

    // Pull only one — others remain missing
    pm('doctrine planning', cwd)

    const result = runHook('pre-edit', cwd, preEditPayload(join(cwd, 'src/foo.ts')))
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('pm doctrine questions')
    expect(result.stderr).toContain('pm doctrine followup')
    expect(result.stderr).toContain('pm doctrine decisions')
    // planning was already pulled, should not appear in the missing list
    expect(result.stderr).not.toMatch(/pm doctrine planning/)
  })
})
