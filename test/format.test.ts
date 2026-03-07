import { describe, it, expect } from 'vitest'
import { relativeDate, progressBar, truncate } from '../src/lib/format.js'

describe('relativeDate', () => {
  it('shows minutes for recent times', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString()
    expect(relativeDate(fiveMinAgo)).toBe('5m ago')
  })

  it('shows hours', () => {
    const threeHrsAgo = new Date(Date.now() - 3 * 3600000).toISOString()
    expect(relativeDate(threeHrsAgo)).toBe('3h ago')
  })

  it('shows days', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString()
    expect(relativeDate(twoDaysAgo)).toBe('2d ago')
  })

  it('shows date for old entries', () => {
    const oldDate = new Date(Date.now() - 60 * 86400000).toISOString()
    const result = relativeDate(oldDate)
    expect(result).not.toContain('ago')
  })
})

describe('progressBar', () => {
  it('shows empty bar for zero total', () => {
    expect(progressBar(0, 0)).toBe('────────')
  })

  it('shows full bar when all done', () => {
    expect(progressBar(8, 8)).toBe('▰▰▰▰▰▰▰▰')
  })

  it('shows partial bar', () => {
    const bar = progressBar(4, 8)
    expect(bar).toBe('▰▰▰▰▱▱▱▱')
  })

  it('respects custom width', () => {
    expect(progressBar(0, 0, 4)).toBe('────')
  })
})

describe('truncate', () => {
  it('returns short strings unchanged', () => {
    expect(truncate('hi', 10)).toBe('hi')
  })

  it('truncates long strings with ellipsis', () => {
    expect(truncate('hello world', 5)).toBe('hell…')
  })

  it('handles very small maxWidth', () => {
    expect(truncate('hello', 1)).toBe('…')
  })
})
