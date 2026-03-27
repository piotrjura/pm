import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createTestDir, cleanupTestDir } from './helpers.js'
import { inferTitle } from '../src/lib/hooks.js'

const TSX = join(import.meta.dirname, '..', 'node_modules', '.bin', 'tsx')
const CLI = join(import.meta.dirname, '..', 'src', 'cli.tsx')

describe('inferTitle', () => {
  it('extracts filename without extension', () => {
    expect(inferTitle('src/lib/hooks.ts')).toBe('Update hooks')
  })

  it('handles kebab-case', () => {
    expect(inferTitle('src/commands/add-feature.ts')).toBe('Update add-feature command')
  })

  it('uses parent dir for generic filenames', () => {
    expect(inferTitle('src/lib/types.ts')).toBe('Update lib types')
    expect(inferTitle('src/lib/index.ts')).toBe('Update lib index')
    expect(inferTitle('src/lib/utils.ts')).toBe('Update lib utils')
  })

  it('uses parent dir for config files', () => {
    expect(inferTitle('package.json')).toBe('Update package config')
    expect(inferTitle('tsconfig.json')).toBe('Update tsconfig config')
  })

  it('returns undefined for bare generic filename with no useful parent', () => {
    expect(inferTitle('index.ts')).toBeUndefined()
  })

  it('handles undefined/empty gracefully', () => {
    expect(inferTitle('')).toBeUndefined()
    expect(inferTitle(undefined)).toBeUndefined()
  })
})

describe('pre-edit hook block message', () => {
  let cwd: string
  beforeEach(() => { cwd = createTestDir() })
  afterEach(() => { cleanupTestDir(cwd) })

  function writeEmptyStore(dir: string) {
    const pmDir = join(dir, '.pm')
    mkdirSync(pmDir, { recursive: true })
    writeFileSync(join(pmDir, 'data.json'), JSON.stringify({ features: [], issues: [], log: [] }))
  }

  it('includes inferred title in block message', () => {
    writeEmptyStore(cwd)

    const stdin = JSON.stringify({ tool_input: { file_path: `${cwd}/src/lib/hooks.ts` } })
    const result = spawnSync(TSX, [CLI, 'hook', 'pre-edit'],
      { input: stdin, encoding: 'utf-8', cwd, env: { ...process.env, NO_COLOR: '1' } })

    expect(result.status).toBe(2) // blocked
    expect(result.stderr).toContain('BLOCKED: No active work in pm.')
    expect(result.stderr).toContain('Update hooks')
  })

  it('falls back to placeholder title when file path unavailable', () => {
    writeEmptyStore(cwd)

    const result = spawnSync(TSX, [CLI, 'hook', 'pre-edit'],
      { input: 'not-json', encoding: 'utf-8', cwd, env: { ...process.env, NO_COLOR: '1' } })

    expect(result.status).toBe(2)
    expect(result.stderr).toContain('"describe your change"')
  })
})
