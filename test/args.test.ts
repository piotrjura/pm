import { describe, it, expect } from 'vitest'
import { parseFlag, hasFlag, parseListFlag, parseIntFlag } from '../src/lib/args.js'

describe('parseFlag', () => {
  it('returns value after flag', () => {
    expect(parseFlag(['--note', 'hello'], '--note')).toBe('hello')
  })

  it('returns undefined when flag is missing', () => {
    expect(parseFlag(['--other', 'val'], '--note')).toBeUndefined()
  })

  it('returns undefined when flag is last arg', () => {
    expect(parseFlag(['--note'], '--note')).toBeUndefined()
  })
})

describe('hasFlag', () => {
  it('returns true when present', () => {
    expect(hasFlag(['--fix', 'something'], '--fix')).toBe(true)
  })

  it('returns false when absent', () => {
    expect(hasFlag(['--other'], '--fix')).toBe(false)
  })
})

describe('parseListFlag', () => {
  it('splits comma-separated values', () => {
    expect(parseListFlag(['--files', 'a.ts, b.ts, c.ts'], '--files')).toEqual(['a.ts', 'b.ts', 'c.ts'])
  })

  it('filters empty entries', () => {
    expect(parseListFlag(['--files', 'a,,b,'], '--files')).toEqual(['a', 'b'])
  })

  it('returns undefined when flag is missing', () => {
    expect(parseListFlag([], '--files')).toBeUndefined()
  })
})

describe('parseIntFlag', () => {
  it('parses integer value', () => {
    expect(parseIntFlag(['--priority', '3'], '--priority')).toBe(3)
  })

  it('returns undefined for non-numeric', () => {
    expect(parseIntFlag(['--priority', 'abc'], '--priority')).toBeUndefined()
  })

  it('returns undefined when flag is missing', () => {
    expect(parseIntFlag([], '--priority')).toBeUndefined()
  })
})
