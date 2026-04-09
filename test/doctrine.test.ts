import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDir, cleanupTestDir, pm } from './helpers.js'

let cwd: string

beforeEach(() => { cwd = createTestDir() })
afterEach(() => { cleanupTestDir(cwd) })

describe('pm doctrine', () => {
  it('lists all available doctrines with router first', () => {
    pm('init', cwd)
    const result = pm('doctrine', cwd)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Available doctrines:')
    expect(result.stdout).toContain('pm doctrine router')
    expect(result.stdout).toContain('pm doctrine planning')
    expect(result.stdout).toContain('pm doctrine decisions')
    expect(result.stdout).toContain('pm doctrine scope')
    expect(result.stdout).toContain('pm doctrine sweep')
    expect(result.stdout).toContain('pm doctrine recovery')

    // router should appear before any topical doctrine
    const routerIdx = result.stdout.indexOf('pm doctrine router')
    const planningIdx = result.stdout.indexOf('pm doctrine planning')
    expect(routerIdx).toBeLessThan(planningIdx)
  })

  it('prints router doctrine content', () => {
    pm('init', cwd)
    const result = pm('doctrine router', cwd)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('# pm doctrine router')
    expect(result.stdout).toContain('The Rule')
    expect(result.stdout).toContain('Doctrine library')
  })

  it('prints planning doctrine content', () => {
    pm('init', cwd)
    const result = pm('doctrine planning', cwd)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('# pm doctrine: planning')
    expect(result.stdout).toContain('planning: medium')
  })

  it('prints decisions doctrine content', () => {
    pm('init', cwd)
    const result = pm('doctrine decisions', cwd)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('# pm doctrine: decisions')
    expect(result.stdout).toContain('Decisions are always on')
  })

  it('errors with helpful message on unknown doctrine', () => {
    pm('init', cwd)
    const result = pm('doctrine nonexistent', cwd)

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('Unknown doctrine')
    expect(result.stdout).toContain('Available')
  })

  it('does not list any CLI commands directly (single source of truth = pm help)', () => {
    pm('init', cwd)
    const router = pm('doctrine router', cwd)

    // Router should reference pm help / pm doctrine but never inline CLI command listings
    expect(router.stdout).toContain('pm help')
    // It mentions pm doctrine and pm settings as routing instructions, but not e.g. add-feature flags
    expect(router.stdout).not.toContain('--description')
    expect(router.stdout).not.toContain('--priority')
  })
})
