import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let cwd: string
let origCwd: string

beforeEach(() => {
  origCwd = process.cwd()
  cwd = mkdtempSync(join(tmpdir(), 'pm-claudemd-'))
  process.chdir(cwd)
})

afterEach(() => {
  process.chdir(origCwd)
  rmSync(cwd, { recursive: true, force: true })
})

async function freshModule() {
  return await import('../src/lib/claude-md.js')
}

describe('updateClaudeMd', () => {
  it('creates CLAUDE.md when none exists', async () => {
    const { updateClaudeMd } = await freshModule()
    updateClaudeMd(cwd)

    const content = readFileSync(join(cwd, 'CLAUDE.md'), 'utf-8')
    expect(content).toContain('PM:INSTRUCTIONS:START')
    expect(content).toContain('PM:INSTRUCTIONS:END')
    expect(content).toContain('pm add-issue')
  })

  it('prepends instructions to existing CLAUDE.md', async () => {
    writeFileSync(join(cwd, 'CLAUDE.md'), '# My Project\n\nCustom rules here.\n')
    const { updateClaudeMd } = await freshModule()
    updateClaudeMd(cwd)

    const content = readFileSync(join(cwd, 'CLAUDE.md'), 'utf-8')
    expect(content).toContain('PM:INSTRUCTIONS:START')
    expect(content).toContain('# My Project')
    expect(content).toContain('Custom rules here.')
  })

  it('replaces existing instructions block without duplication', async () => {
    const { updateClaudeMd } = await freshModule()
    updateClaudeMd(cwd)
    updateClaudeMd(cwd)
    updateClaudeMd(cwd)

    const content = readFileSync(join(cwd, 'CLAUDE.md'), 'utf-8')
    const count = content.split('PM:INSTRUCTIONS:START').length - 1
    expect(count).toBe(1)
  })

  it('preserves content outside the instructions block', async () => {
    writeFileSync(join(cwd, 'CLAUDE.md'), '# Header\n\nBefore.\n')
    const { updateClaudeMd } = await freshModule()
    updateClaudeMd(cwd)

    const content = readFileSync(join(cwd, 'CLAUDE.md'), 'utf-8')
    expect(content).toContain('# Header')
    expect(content).toContain('Before.')
  })

  it('removes legacy PM:START/PM:END block', async () => {
    writeFileSync(join(cwd, 'CLAUDE.md'), [
      '# Project',
      '',
      '<!-- PM:START -->',
      'Old dynamic content here',
      '<!-- PM:END -->',
      '',
      '# More stuff',
    ].join('\n'))

    const { updateClaudeMd } = await freshModule()
    updateClaudeMd(cwd)

    const content = readFileSync(join(cwd, 'CLAUDE.md'), 'utf-8')
    expect(content).not.toContain('PM:START')
    expect(content).not.toContain('Old dynamic content')
    expect(content).toContain('# Project')
    expect(content).toContain('# More stuff')
    expect(content).toContain('PM:INSTRUCTIONS:START')
  })
})
