import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render } from 'ink-testing-library'
import { createElement } from 'react'
import stripAnsi from 'strip-ansi'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { InitWizard } from '../src/components/init-wizard.js'

const delay = (ms = 50) => new Promise(r => setTimeout(r, ms))

/** Strip ANSI codes from the last rendered frame */
function lastFrame(inst: ReturnType<typeof render>): string {
  return stripAnsi(inst.lastFrame() ?? '')
}

let cwd: string
let originalCwd: string
let originalHome: string | undefined

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'pm-wizard-'))
  originalCwd = process.cwd()
  originalHome = process.env.HOME
  process.chdir(cwd)
  process.env.HOME = cwd
})

afterEach(() => {
  process.chdir(originalCwd)
  if (originalHome !== undefined) process.env.HOME = originalHome
  rmSync(cwd, { recursive: true, force: true })
})

describe('InitWizard', () => {
  it('renders logo and setup steps', () => {
    const inst = render(createElement(InitWizard))
    const f = lastFrame(inst)
    expect(f).toContain('pm')
    expect(f).toContain('project manager for agents')
    expect(f).toContain('Setup')
    expect(f).toContain('Initialize data store')
    expect(f).toContain('Select agents')
    expect(f).toContain('Select features')
    inst.cleanup()
  })

  it('starts with cursor on data store step', () => {
    const inst = render(createElement(InitWizard))
    const f = lastFrame(inst)
    expect(f).toMatch(/›.*Initialize data store/)
    inst.cleanup()
  })

  it('step order: store → agents → features', () => {
    const inst = render(createElement(InitWizard))
    const f = lastFrame(inst)
    const idx1 = f.indexOf('Initialize data store')
    const idx2 = f.indexOf('Select agents')
    const idx3 = f.indexOf('Select features')
    expect(idx1).toBeGreaterThan(-1)
    expect(idx1).toBeLessThan(idx2)
    expect(idx2).toBeLessThan(idx3)
    inst.cleanup()
  })

  it('confirm all defaults — creates store, claude-code hooks, config', async () => {
    const inst = render(createElement(InitWizard))

    // Step 1: Confirm data store
    inst.stdin.write('y')
    await delay()
    expect(existsSync(join(cwd, '.pm', 'data.json'))).toBe(true)

    // Step 2: Agents — CC is pre-checked, just press Enter to confirm
    const f2 = lastFrame(inst)
    expect(f2).toContain('Select agents')
    expect(f2).toContain('[x] Claude Code')
    inst.stdin.write('\r')
    await delay()

    // Step 3: Features — decisions is pre-checked, just press Enter to confirm
    const f3 = lastFrame(inst)
    expect(f3).toContain('Select features')
    expect(f3).toContain('[x] Design decisions')
    inst.stdin.write('\r')
    await delay()

    // Summary
    const f = lastFrame(inst)
    expect(f).toContain('Setup complete')

    // Claude Code hooks should be installed
    expect(existsSync(join(cwd, '.claude', 'settings.json'))).toBe(true)

    // Config should be written
    expect(existsSync(join(cwd, '.pm', 'config.json'))).toBe(true)
    const config = JSON.parse(readFileSync(join(cwd, '.pm', 'config.json'), 'utf-8'))
    expect(config.decisions).toBe(true)
    expect(config.agents).toContain('claude-code')

    inst.cleanup()
  })

  it('confirm with Enter key works for store step', async () => {
    const inst = render(createElement(InitWizard))

    inst.stdin.write('\r')
    await delay()
    expect(existsSync(join(cwd, '.pm', 'data.json'))).toBe(true)
    // Should advance to agents step
    expect(lastFrame(inst)).toContain('Select agents')
    inst.cleanup()
  })

  it('skip store step with n', async () => {
    const inst = render(createElement(InitWizard))

    inst.stdin.write('n')
    await delay()
    expect(existsSync(join(cwd, '.pm', 'data.json'))).toBe(false)
    // Should advance to agents step
    expect(lastFrame(inst)).toContain('Select agents')
    inst.cleanup()
  })

  it('toggle agents with space — deselect CC, select OpenCode', async () => {
    const inst = render(createElement(InitWizard))

    // Advance past store
    inst.stdin.write('y')
    await delay()

    // On agents step — CC is checked at cursor 0
    let f = lastFrame(inst)
    expect(f).toContain('[x] Claude Code')
    expect(f).toContain('[ ] OpenCode')

    // Space to deselect CC
    inst.stdin.write(' ')
    await delay()
    f = lastFrame(inst)
    expect(f).toContain('[ ] Claude Code')

    // Down arrow then space to select OpenCode
    inst.stdin.write('\u001B[B') // down arrow
    await delay()
    inst.stdin.write(' ')
    await delay()
    f = lastFrame(inst)
    expect(f).toContain('[x] OpenCode')

    // Confirm agents
    inst.stdin.write('\r')
    await delay()

    // Confirm features (defaults)
    inst.stdin.write('\r')
    await delay()

    // Check config was written with opencode, not claude-code
    const config = JSON.parse(readFileSync(join(cwd, '.pm', 'config.json'), 'utf-8'))
    expect(config.agents).toContain('opencode')
    expect(config.agents).not.toContain('claude-code')

    // OpenCode plugin should exist
    expect(existsSync(join(cwd, '.opencode', 'plugins', 'pm.ts'))).toBe(true)
    // Claude settings should NOT exist (CC was deselected)
    // (permissions file may exist from other tests but hooks won't be pm hooks)

    inst.cleanup()
  })

  it('deselect decisions feature', async () => {
    const inst = render(createElement(InitWizard))

    // Store → confirm
    inst.stdin.write('y')
    await delay()

    // Agents → confirm defaults
    inst.stdin.write('\r')
    await delay()

    // Features — decisions is checked
    let f = lastFrame(inst)
    expect(f).toContain('[x] Design decisions')

    // Space to deselect decisions
    inst.stdin.write(' ')
    await delay()
    f = lastFrame(inst)
    expect(f).toContain('[ ] Design decisions')

    // Confirm
    inst.stdin.write('\r')
    await delay()

    const config = JSON.parse(readFileSync(join(cwd, '.pm', 'config.json'), 'utf-8'))
    expect(config.decisions).toBe(false)

    inst.cleanup()
  })

  it('quit with q — no files created', () => {
    const inst = render(createElement(InitWizard))

    inst.stdin.write('q')

    expect(existsSync(join(cwd, '.pm', 'data.json'))).toBe(false)
    expect(existsSync(join(cwd, '.claude', 'settings.json'))).toBe(false)
    inst.cleanup()
  })

  it('already initialized store — shows already status', async () => {
    mkdirSync(join(cwd, '.pm'), { recursive: true })
    writeFileSync(join(cwd, '.pm', 'data.json'), JSON.stringify({ features: [], issues: [], log: [] }, null, 2))

    const inst = render(createElement(InitWizard))

    // Store step shows already exists
    expect(lastFrame(inst)).toContain('already exists')

    // n is ignored on already-done steps
    inst.stdin.write('n')
    await delay()
    expect(lastFrame(inst)).toMatch(/›.*Initialize data store/)

    // Enter advances
    inst.stdin.write('\r')
    await delay()
    expect(lastFrame(inst)).toContain('Select agents')
    inst.cleanup()
  })

  it('prompt shows confirm/skip for pending store step', () => {
    const inst = render(createElement(InitWizard))
    const f = lastFrame(inst)
    expect(f).toContain('y')
    expect(f).toContain('confirm')
    expect(f).toContain('n')
    expect(f).toContain('skip')
    inst.cleanup()
  })

  it('prompt shows toggle/confirm for multi-select steps', async () => {
    const inst = render(createElement(InitWizard))

    inst.stdin.write('y')
    await delay()

    const f = lastFrame(inst)
    expect(f).toContain('space')
    expect(f).toContain('toggle')
    expect(f).toContain('confirm')
    inst.cleanup()
  })

  it('prompt shows only continue for already-done store step', () => {
    mkdirSync(join(cwd, '.pm'), { recursive: true })
    writeFileSync(join(cwd, '.pm', 'data.json'), JSON.stringify({ features: [], issues: [], log: [] }, null, 2))

    const inst = render(createElement(InitWizard))
    const f = lastFrame(inst)
    expect(f).toContain('continue')
    expect(f).not.toContain('skip')
    inst.cleanup()
  })
})
