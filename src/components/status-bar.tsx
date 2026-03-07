import React from 'react'
import { Box, Text } from 'ink'
import type { Screen } from '../hooks/use-navigation.js'

interface StatusBarProps {
  screen: Screen
  width: number
}

// A hint where the key is embedded in the label.
// `keyLen` = how many chars from the start of `label` form the key (highlighted).
// For special keys (↑↓, enter, esc), `prefix` is shown before the label.
interface Hint {
  prefix?: string
  label: string
  keyLen: number
}

function getHints(screen: Screen): Hint[] {
  switch (screen.type) {
    case 'list':
      return [
        { prefix: '↑↓', label: 'navigate', keyLen: 0 },
        { prefix: '⏎', label: 'open', keyLen: 0 },
        { label: '/search', keyLen: 1 },
        { label: '[]page', keyLen: 2 },
        { label: 'delete', keyLen: 1 },
        { label: 'quit', keyLen: 1 },
      ]
    case 'feature-detail':
      return [
        { prefix: '↑↓', label: 'task', keyLen: 0 },
        { prefix: 'esc', label: 'back', keyLen: 0 },
        { label: 'quit', keyLen: 1 },
      ]
    case 'issue-detail':
      return [
        { prefix: 'esc', label: 'back', keyLen: 0 },
        { label: 'quit', keyLen: 1 },
      ]
  }
}

function hintWidth(h: Hint): number {
  return (h.prefix ? h.prefix.length + 1 : 0) + h.label.length
}

function compactWidth(h: Hint): number {
  if (h.prefix) return h.prefix.length
  return h.keyLen || 1
}

export function StatusBar({ screen, width }: StatusBarProps) {
  const hints = getHints(screen)
  const separator = '──'
  const paddingX = 2
  const gaps = (hints.length + 1) * 2 // gap=2 between each item
  const available = width - (paddingX * 2) - separator.length - gaps
  const fullWidth = hints.reduce((sum, h) => sum + hintWidth(h), 0)
  const compact = fullWidth > available

  return (
    <Box paddingX={paddingX} gap={2}>
      <Text dimColor>{separator}</Text>
      {hints.map((hint, i) => {
        if (compact) {
          // Compact: just show the key part
          const key = hint.prefix || hint.label.slice(0, hint.keyLen || 1)
          return <Text key={i} bold color="cyan">{key}</Text>
        }

        // Full: prefix (if any) then label with highlighted key portion
        return (
          <Text key={i}>
            {hint.prefix && (
              <>
                <Text bold color="cyan">{hint.prefix}</Text>
                <Text> </Text>
              </>
            )}
            {hint.keyLen > 0 ? (
              <>
                <Text bold color="white">{hint.label.slice(0, hint.keyLen)}</Text>
                <Text dimColor>{hint.label.slice(hint.keyLen)}</Text>
              </>
            ) : (
              <Text dimColor>{hint.label}</Text>
            )}
          </Text>
        )
      })}
    </Box>
  )
}
