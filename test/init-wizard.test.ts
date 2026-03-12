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
  it('renders logo and all three steps', () => {
    const inst = render(createElement(InitWizard))
    const f = lastFrame(inst)
    expect(f).toContain('pm')
    expect(f).toContain('project manager for agents')
    expect(f).toContain('Setup')
    expect(f).toContain('Initialize data store')
    expect(f).toContain('Set up Claude Code')
    expect(f).toContain('Set up OpenCode')
    inst.cleanup()
  })

  it('starts with cursor on data store step', () => {
    const inst = render(createElement(InitWizard))
    const f = lastFrame(inst)
    expect(f).toMatch(/›.*Initialize data store/)
    inst.cleanup()
  })

  it('step order: store → claude-code → opencode', () => {
    const inst = render(createElement(InitWizard))
    const f = lastFrame(inst)
    const idx1 = f.indexOf('Initialize data store')
    const idx2 = f.indexOf('Set up Claude Code')
    const idx3 = f.indexOf('Set up OpenCode')
    expect(idx1).toBeGreaterThan(-1)
    expect(idx1).toBeLessThan(idx2)
    expect(idx2).toBeLessThan(idx3)
    inst.cleanup()
  })

  it('confirm all steps with y — creates all files', async () => {
    const inst = render(createElement(InitWizard))

    // Step 1: Data store
    inst.stdin.write('y')
    await delay()
    expect(existsSync(join(cwd, '.pm', 'data.json'))).toBe(true)
    const data = JSON.parse(readFileSync(join(cwd, '.pm', 'data.json'), 'utf-8'))
    expect(data).toHaveProperty('features', [])
    expect(data).toHaveProperty('issues', [])
    expect(data).toHaveProperty('log', [])
    expect(lastFrame(inst)).toMatch(/›.*Set up Claude Code/)

    // Step 2: Claude Code
    inst.stdin.write('y')
    await delay()
    const settingsPath = join(cwd, '.claude', 'settings.json')
    expect(existsSync(settingsPath)).toBe(true)
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    expect(settings.permissions.allow).toContain('Bash(pm *)')
    expect(settings.hooks).toBeDefined()
    expect(settings.hooks.PreToolUse).toBeDefined()
    expect(lastFrame(inst)).toMatch(/›.*Set up OpenCode/)

    // Step 3: OpenCode
    inst.stdin.write('y')
    await delay()
    expect(existsSync(join(cwd, '.opencode', 'plugins', 'pm.ts'))).toBe(true)

    // Summary
    const f = lastFrame(inst)
    expect(f).toContain('Setup complete')
    expect(f).toContain('Press Enter to continue')
    inst.cleanup()
  })

  it('confirm all steps with Enter', async () => {
    const inst = render(createElement(InitWizard))

    inst.stdin.write('\r')
    await delay()
    expect(existsSync(join(cwd, '.pm', 'data.json'))).toBe(true)

    inst.stdin.write('\r')
    await delay()
    expect(existsSync(join(cwd, '.claude', 'settings.json'))).toBe(true)

    inst.stdin.write('\r')
    await delay()
    expect(existsSync(join(cwd, '.opencode', 'plugins', 'pm.ts'))).toBe(true)

    expect(lastFrame(inst)).toContain('Setup complete')
    inst.cleanup()
  })

  it('skip all steps with n — no files created', async () => {
    const inst = render(createElement(InitWizard))

    inst.stdin.write('n')
    await delay()
    inst.stdin.write('n')
    await delay()
    inst.stdin.write('n')
    await delay()

    expect(existsSync(join(cwd, '.pm', 'data.json'))).toBe(false)
    expect(existsSync(join(cwd, '.claude', 'settings.json'))).toBe(false)
    expect(existsSync(join(cwd, '.opencode', 'plugins', 'pm.ts'))).toBe(false)

    const f = lastFrame(inst)
    expect(f).toContain('Setup complete')
    expect(f).toContain('skipped')
    inst.cleanup()
  })

  it('quit with q — no files created, exits', () => {
    const inst = render(createElement(InitWizard))

    inst.stdin.write('q')

    expect(existsSync(join(cwd, '.pm', 'data.json'))).toBe(false)
    expect(existsSync(join(cwd, '.claude', 'settings.json'))).toBe(false)
    inst.cleanup()
  })

  it('already initialized — shows already status for all steps', async () => {
    // Pre-create all files
    mkdirSync(join(cwd, '.claude'), { recursive: true })
    writeFileSync(join(cwd, '.claude', 'settings.json'), JSON.stringify({
      permissions: { allow: ['Bash(pm *)'] },
      hooks: { PreToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'PM_AGENT=claude-code pm hook pre-edit' }] }] },
    }, null, 2))
    mkdirSync(join(cwd, '.pm'), { recursive: true })
    writeFileSync(join(cwd, '.pm', 'data.json'), JSON.stringify({ features: [], issues: [], log: [] }, null, 2))
    mkdirSync(join(cwd, '.opencode', 'plugins'), { recursive: true })
    // Write a dummy plugin file (exact content match not needed for detection)
    writeFileSync(join(cwd, '.opencode', 'plugins', 'pm.ts'), 'export const PmPlugin = async () => {}')

    const inst = render(createElement(InitWizard))

    // Step 1: store already
    expect(lastFrame(inst)).toContain('already exists')

    inst.stdin.write('\r')
    await delay()
    // Step 2: claude-code already
    expect(lastFrame(inst)).toContain('already configured')

    inst.stdin.write('\r')
    await delay()
    // Step 3: opencode already
    expect(lastFrame(inst)).toContain('already exists')

    inst.stdin.write('\r')
    await delay()
    const f = lastFrame(inst)
    expect(f).toContain('Setup complete')
    inst.cleanup()
  })

  it('n is ignored on already-done steps', async () => {
    // Pre-create data store so the first step is already done
    mkdirSync(join(cwd, '.pm'), { recursive: true })
    writeFileSync(join(cwd, '.pm', 'data.json'), JSON.stringify({ features: [], issues: [], log: [] }, null, 2))

    const inst = render(createElement(InitWizard))

    // n should be ignored for already-done step
    inst.stdin.write('n')
    await delay()
    // Should still be on step 1 (not advanced)
    expect(lastFrame(inst)).toMatch(/›.*Initialize data store/)

    // Enter should advance
    inst.stdin.write('\r')
    await delay()
    expect(lastFrame(inst)).toMatch(/›.*Set up Claude Code/)
    inst.cleanup()
  })

  it('mixed: skip some, confirm others', async () => {
    const inst = render(createElement(InitWizard))

    // Confirm store
    inst.stdin.write('y')
    await delay()
    expect(existsSync(join(cwd, '.pm', 'data.json'))).toBe(true)

    // Skip Claude Code
    inst.stdin.write('n')
    await delay()
    expect(existsSync(join(cwd, '.claude', 'settings.json'))).toBe(false)

    // Confirm OpenCode
    inst.stdin.write('y')
    await delay()
    expect(existsSync(join(cwd, '.opencode', 'plugins', 'pm.ts'))).toBe(true)

    const f = lastFrame(inst)
    expect(f).toContain('Setup complete')
    inst.cleanup()
  })

  it('summary shows result notes for each step', async () => {
    const inst = render(createElement(InitWizard))

    // Confirm store
    inst.stdin.write('y')
    await delay()
    // Skip Claude Code
    inst.stdin.write('n')
    await delay()
    // Confirm OpenCode
    inst.stdin.write('y')
    await delay()

    const f = lastFrame(inst)
    expect(f).toContain('created')     // store
    expect(f).toContain('skipped')     // claude-code
    expect(f).toContain('plugin added') // opencode
    inst.cleanup()
  })

  it('prompt shows confirm/skip for pending steps', () => {
    const inst = render(createElement(InitWizard))
    const f = lastFrame(inst)
    expect(f).toContain('y')
    expect(f).toContain('confirm')
    expect(f).toContain('n')
    expect(f).toContain('skip')
    inst.cleanup()
  })

  it('prompt shows only continue for already-done steps', () => {
    // Pre-create data store so the first step is already done
    mkdirSync(join(cwd, '.pm'), { recursive: true })
    writeFileSync(join(cwd, '.pm', 'data.json'), JSON.stringify({ features: [], issues: [], log: [] }, null, 2))

    const inst = render(createElement(InitWizard))
    const f = lastFrame(inst)
    expect(f).toContain('continue')
    expect(f).not.toContain('skip')
    inst.cleanup()
  })
})
