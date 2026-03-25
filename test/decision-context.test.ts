import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDir, cleanupTestDir, pm, loadData } from './helpers.js'

let cwd: string
beforeEach(() => { cwd = createTestDir() })
afterEach(() => { cleanupTestDir(cwd) })

describe('action field on decisions', () => {
  it('stores action field when --action flag provided', () => {
    const feat = pm('add-feature "Test feature"', cwd)
    const featureId = feat.stdout.match(/^feature:(\S+)/m)![1]
    pm(`decide ${featureId} "Use flags not env vars" --reasoning "env vars unreliable" --action "always pass --agent flag"`, cwd)

    const data = loadData(cwd)
    const decision = data.features[0].decisions[0]
    expect(decision.action).toBe('always pass --agent flag')
  })

  it('stores decision without action when --action not provided (backward compat)', () => {
    const feat = pm('add-feature "Test feature"', cwd)
    const featureId = feat.stdout.match(/^feature:(\S+)/m)![1]
    pm(`decide ${featureId} "Use flags" --reasoning "reliable"`, cwd)

    const data = loadData(cwd)
    const decision = data.features[0].decisions[0]
    expect(decision.action).toBeUndefined()
  })

  it('pm why output shows Action line when present', () => {
    const feat = pm('add-feature "Test feature"', cwd)
    const featureId = feat.stdout.match(/^feature:(\S+)/m)![1]
    pm(`decide ${featureId} "Use hooks" --reasoning "cleaner" --action "call pm hook in settings"`, cwd)

    const { stdout } = pm('why hooks', cwd)
    expect(stdout).toContain('Action: call pm hook in settings')
  })

  it('pm why output omits Action line when not present', () => {
    const feat = pm('add-feature "Test feature"', cwd)
    const featureId = feat.stdout.match(/^feature:(\S+)/m)![1]
    pm(`decide ${featureId} "Use hooks" --reasoning "cleaner"`, cwd)

    const { stdout } = pm('why hooks', cwd)
    expect(stdout).not.toContain('Action:')
  })
})

describe('adaptive short-prompt matching (unit)', () => {
  it('matches with 1 overlap for short prompts (1-2 meaningful tokens)', async () => {
    const { findRelevantDecisions } = await import('../src/lib/hooks.js')
    const decisions = [
      { decision: 'hooks are the right approach', reasoning: 'extensible', at: '2026-01-01' },
      { decision: 'use database not files', reasoning: 'reliable', at: '2026-01-01' },
    ].map(d => ({ ...d, source: 'test feature' }))

    const results = findRelevantDecisions('hooks', decisions)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].decision).toBe('hooks are the right approach')
  })

  it('limits short-prompt results to 3 (noise mitigation)', async () => {
    const { findRelevantDecisions } = await import('../src/lib/hooks.js')
    const decisions = Array.from({ length: 5 }, (_, i) => ({
      decision: `hook decision ${i}`,
      at: '2026-01-01',
      source: 'test',
    }))

    const results = findRelevantDecisions('hook', decisions)
    expect(results.length).toBeLessThanOrEqual(3)
  })

  it('still requires 2 overlaps for longer prompts', async () => {
    const { findRelevantDecisions } = await import('../src/lib/hooks.js')
    const decisions = [
      { decision: 'hooks are useful', at: '2026-01-01', source: 'test' },
      { decision: 'hooks fix patterns carefully', at: '2026-01-01', source: 'test' },
    ]

    const results = findRelevantDecisions('fix hooks carefully', decisions)
    expect(results.some(r => r.decision === 'hooks fix patterns carefully')).toBe(true)
  })
})
