import { describe, it, expect } from 'vitest'
import { groupFilesByConcern, buildScopeErrorMessage } from '../src/commands/done.js'

describe('groupFilesByConcern', () => {
  it('puts test files in their own group regardless of directory', () => {
    const files = ['src/lib/hooks.ts', 'test/hooks.test.ts', 'test/store.test.ts']
    const groups = groupFilesByConcern(files)
    expect(groups.find(g => g.name === 'tests')?.files).toEqual(['test/hooks.test.ts', 'test/store.test.ts'])
    expect(groups.find(g => g.name !== 'tests')?.files).toContain('src/lib/hooks.ts')
  })

  it('groups non-test files by directory', () => {
    const files = ['src/lib/hooks.ts', 'src/lib/store.ts', 'src/commands/done.ts']
    const groups = groupFilesByConcern(files)
    const libGroup = groups.find(g => g.name === 'lib')
    const cmdsGroup = groups.find(g => g.name === 'commands')
    expect(libGroup?.files).toEqual(['src/lib/hooks.ts', 'src/lib/store.ts'])
    expect(cmdsGroup?.files).toEqual(['src/commands/done.ts'])
  })

  it('test files have highest priority — not grouped with source', () => {
    const files = ['src/lib/hooks.ts', 'test/hooks.test.ts']
    const groups = groupFilesByConcern(files)
    const testGroup = groups.find(g => g.name === 'tests')
    expect(testGroup?.files).toContain('test/hooks.test.ts')
    expect(testGroup?.files).not.toContain('src/lib/hooks.ts')
  })

  it('handles .spec. files as tests', () => {
    const files = ['src/foo.spec.ts', 'src/bar.ts']
    const groups = groupFilesByConcern(files)
    expect(groups.find(g => g.name === 'tests')?.files).toContain('src/foo.spec.ts')
  })

  it('handles __tests__ directory', () => {
    const files = ['src/__tests__/foo.ts', 'src/bar.ts']
    const groups = groupFilesByConcern(files)
    expect(groups.find(g => g.name === 'tests')?.files).toContain('src/__tests__/foo.ts')
  })

  it('returns single group when all files in same dir', () => {
    const files = ['src/lib/a.ts', 'src/lib/b.ts', 'src/lib/c.ts', 'src/lib/d.ts']
    const groups = groupFilesByConcern(files)
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('lib')
  })

  it('handles all test files', () => {
    const files = ['test/a.test.ts', 'test/b.test.ts', 'test/c.test.ts', 'test/d.test.ts']
    const groups = groupFilesByConcern(files)
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('tests')
  })
})

describe('buildScopeErrorMessage', () => {
  it('shows scope warning', () => {
    const msg = buildScopeErrorMessage('issue-abc', 'issue', ['src/lib/a.ts', 'src/lib/b.ts', 'src/lib/c.ts', 'src/lib/d.ts'])
    expect(msg).toContain('SCOPE WARNING')
    expect(msg).toContain('Update lib')
  })

  it('suggests splits by concern', () => {
    const files = ['src/lib/hooks.ts', 'src/lib/store.ts', 'test/hooks.test.ts', 'test/store.test.ts']
    const msg = buildScopeErrorMessage('task-xyz', 'task', files)
    expect(msg).toContain('Update lib')
    expect(msg).toContain('Add tests')
  })
})
