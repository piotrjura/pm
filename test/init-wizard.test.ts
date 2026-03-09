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
    expect(f).toContain('Project Manager for Claude Code')
    expect(f).toContain('Setup')
    expect(f).toContain('Whitelist pm commands')
    expect(f).toContain('Set up Claude Code hooks')
    expect(f).toContain('Initialize data store')
    inst.cleanup()
  })

  it('starts with cursor on permissions step', () => {
    const inst = render(createElement(InitWizard))
    const f = lastFrame(inst)
    expect(f).toMatch(/›.*Whitelist pm/)
    inst.cleanup()
  })

  it('step order: permissions → hooks → store', () => {
    const inst = render(createElement(InitWizard))
    const f = lastFrame(inst)
    const idx1 = f.indexOf('Whitelist pm')
    const idx2 = f.indexOf('Set up Claude Code hooks')
    const idx3 = f.indexOf('Initialize data')
    expect(idx1).toBeGreaterThan(-1)
    expect(idx1).toBeLessThan(idx2)
    expect(idx2).toBeLessThan(idx3)
    inst.cleanup()
  })

  it('confirm all steps with y — creates all files', async () => {
    const inst = render(createElement(InitWizard))

    // Step 1: Permissions
    inst.stdin.write('y')
    await delay()
    const settingsPath = join(cwd, '.claude', 'settings.json')
    expect(existsSync(settingsPath)).toBe(true)
    expect(JSON.parse(readFileSync(settingsPath, 'utf-8')).permissions.allow).toContain('Bash(pm *)')
    expect(lastFrame(inst)).toMatch(/›.*Set up Claude Code hooks/)

    // Step 2: Hooks
    inst.stdin.write('y')
    await delay()
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    expect(settings.hooks).toBeDefined()
    expect(settings.hooks.PreToolUse).toBeDefined()
    expect(lastFrame(inst)).toMatch(/›.*Initialize data/)

    // Step 3: Data store
    inst.stdin.write('y')
    await delay()
    expect(existsSync(join(cwd, '.pm', 'data.json'))).toBe(true)
    const data = JSON.parse(readFileSync(join(cwd, '.pm', 'data.json'), 'utf-8'))
    expect(data).toHaveProperty('features', [])
    expect(data).toHaveProperty('issues', [])
    expect(data).toHaveProperty('log', [])

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
    expect(existsSync(join(cwd, '.claude', 'settings.json'))).toBe(true)

    inst.stdin.write('\r')
    await delay()
    const settings = JSON.parse(readFileSync(join(cwd, '.claude', 'settings.json'), 'utf-8'))
    expect(settings.hooks).toBeDefined()

    inst.stdin.write('\r')
    await delay()
    expect(existsSync(join(cwd, '.pm', 'data.json'))).toBe(true)

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

    expect(existsSync(join(cwd, '.claude', 'settings.json'))).toBe(false)
    expect(existsSync(join(cwd, '.pm', 'data.json'))).toBe(false)

    const f = lastFrame(inst)
    expect(f).toContain('Setup complete')
    expect(f).toContain('skipped')
    inst.cleanup()
  })

  it('quit with q — no files created, exits', () => {
    const inst = render(createElement(InitWizard))

    inst.stdin.write('q')

    expect(existsSync(join(cwd, '.claude', 'settings.json'))).toBe(false)
    expect(existsSync(join(cwd, '.pm', 'data.json'))).toBe(false)
    inst.cleanup()
  })

  it('already initialized — shows already status for all steps', async () => {
    // Pre-create all files including hooks
    mkdirSync(join(cwd, '.claude'), { recursive: true })
    writeFileSync(join(cwd, '.claude', 'settings.json'), JSON.stringify({
      permissions: { allow: ['Bash(pm *)'] },
      hooks: { PreToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'pm hook pre-edit' }] }] },
    }, null, 2))
    mkdirSync(join(cwd, '.pm'), { recursive: true })
    writeFileSync(join(cwd, '.pm', 'data.json'), JSON.stringify({ features: [], issues: [], log: [] }, null, 2))

    const inst = render(createElement(InitWizard))

    // Step 1: permissions already
    expect(lastFrame(inst)).toContain('Permission already present')

    inst.stdin.write('\r')
    await delay()
    // Step 2: hooks already
    expect(lastFrame(inst)).toContain('already configured')

    inst.stdin.write('\r')
    await delay()
    // Step 3: store already
    expect(lastFrame(inst)).toContain('already exists')

    inst.stdin.write('\r')
    await delay()
    const f = lastFrame(inst)
    expect(f).toContain('Setup complete')
    expect(f).toContain('already configured')
    inst.cleanup()
  })

  it('n is ignored on already-done steps', async () => {
    // Pre-create permissions
    mkdirSync(join(cwd, '.claude'), { recursive: true })
    writeFileSync(join(cwd, '.claude', 'settings.json'), JSON.stringify({
      permissions: { allow: ['Bash(pm *)'] },
    }, null, 2))

    const inst = render(createElement(InitWizard))

    // n should be ignored for already-done step
    inst.stdin.write('n')
    await delay()
    // Should still be on step 1 (not advanced)
    expect(lastFrame(inst)).toMatch(/›.*Whitelist pm/)

    // Enter should advance
    inst.stdin.write('\r')
    await delay()
    expect(lastFrame(inst)).toMatch(/›.*Set up Claude Code hooks/)
    inst.cleanup()
  })

  it('mixed: skip some, confirm others', async () => {
    const inst = render(createElement(InitWizard))

    // Skip permissions
    inst.stdin.write('n')
    await delay()

    // Confirm hooks
    inst.stdin.write('y')
    await delay()
    const settings = JSON.parse(readFileSync(join(cwd, '.claude', 'settings.json'), 'utf-8'))
    expect(settings.hooks).toBeDefined()

    // Skip store
    inst.stdin.write('n')
    await delay()
    expect(existsSync(join(cwd, '.pm', 'data.json'))).toBe(false)

    const f = lastFrame(inst)
    expect(f).toContain('Setup complete')
    inst.cleanup()
  })

  it('summary shows result notes for each step', async () => {
    const inst = render(createElement(InitWizard))

    inst.stdin.write('n')
    await delay()
    inst.stdin.write('y')
    await delay()
    inst.stdin.write('y')
    await delay()

    const f = lastFrame(inst)
    expect(f).toContain('skipped')    // permissions
    expect(f).toContain('created')    // store
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
    // Pre-create permissions so the first step is already done
    mkdirSync(join(cwd, '.claude'), { recursive: true })
    writeFileSync(join(cwd, '.claude', 'settings.json'), JSON.stringify({
      permissions: { allow: ['Bash(pm *)'] },
    }, null, 2))

    const inst = render(createElement(InitWizard))
    const f = lastFrame(inst)
    expect(f).toContain('continue')
    expect(f).not.toContain('skip')
    inst.cleanup()
  })
})
