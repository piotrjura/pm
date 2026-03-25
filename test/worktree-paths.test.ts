import { describe, it, expect } from 'vitest'
import { stripWorktreePath } from '../src/lib/hooks.js'

describe('stripWorktreePath', () => {
  it('strips .worktrees/<branch>/ prefix', () => {
    expect(stripWorktreePath('.worktrees/feature-branch/src/lib/hooks.ts'))
      .toBe('src/lib/hooks.ts')
  })

  it('strips worktrees/<branch>/ prefix (no dot)', () => {
    expect(stripWorktreePath('worktrees/my-branch/package.json'))
      .toBe('package.json')
  })

  it('returns normal paths unchanged', () => {
    expect(stripWorktreePath('src/lib/hooks.ts')).toBe('src/lib/hooks.ts')
  })

  it('handles root-level files in worktree', () => {
    expect(stripWorktreePath('.worktrees/branch/package.json'))
      .toBe('package.json')
  })

  it('handles nested worktrees by stripping all prefixes', () => {
    expect(stripWorktreePath('.worktrees/a/.worktrees/b/src/foo.ts'))
      .toBe('src/foo.ts')
  })

  it('handles worktree path with no file (trailing slash)', () => {
    expect(stripWorktreePath('.worktrees/branch/')).toBe('')
  })

  it('handles empty string', () => {
    expect(stripWorktreePath('')).toBe('')
  })

  it('handles backslash paths (Windows)', () => {
    expect(stripWorktreePath('.worktrees\\branch\\src\\foo.ts'))
      .toBe('src/foo.ts')
  })
})
