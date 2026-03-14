import React, { useState } from 'react'
import { Box, Text, useInput, useApp } from 'ink'
import { loadConfig } from '../lib/config.js'
import type { Config } from '../lib/types.js'

interface SettingsItem {
  key: string
  label: string
  group: 'features' | 'agents'
}

const ITEMS: SettingsItem[] = [
  { key: 'decisions', label: 'Design decisions', group: 'features' },
  { key: 'claude-code', label: 'Claude Code', group: 'agents' },
  { key: 'opencode', label: 'OpenCode', group: 'agents' },
]

function configToChecked(config: Config): Set<string> {
  const checked = new Set<string>()
  if (config.decisions) checked.add('decisions')
  for (const agent of config.agents) checked.add(agent)
  return checked
}

function checkedToConfig(checked: Set<string>): Config {
  return {
    decisions: checked.has('decisions'),
    agents: ITEMS.filter(i => i.group === 'agents' && checked.has(i.key)).map(i => i.key),
  }
}

interface SettingsScreenProps {
  onSave?: (config: Config) => void
  /** For embedded use in TUI — called instead of exit() */
  onDone?: (saved: boolean) => void
  inline?: boolean
}

export function SettingsScreen({ onSave, onDone, inline }: SettingsScreenProps) {
  const app = inline ? null : useApp()
  const [config] = useState(() => loadConfig())
  const [checked, setChecked] = useState(() => configToChecked(config))
  const [cursor, setCursor] = useState(0)

  const quit = (saved: boolean) => {
    if (onDone) { onDone(saved); return }
    if (app) app.exit()
  }

  useInput((input, key) => {
    if (input === 'q' || (key.escape && !inline)) {
      quit(false)
      return
    }
    if (key.escape && inline) {
      quit(false)
      return
    }
    if (key.upArrow) setCursor(c => Math.max(0, c - 1))
    else if (key.downArrow) setCursor(c => Math.min(ITEMS.length - 1, c + 1))
    else if (input === ' ') {
      const item = ITEMS[cursor]
      setChecked(prev => {
        const next = new Set(prev)
        if (next.has(item.key)) next.delete(item.key)
        else next.add(item.key)
        return next
      })
    } else if (key.return) {
      const newConfig = checkedToConfig(checked)
      onSave?.(newConfig)
      quit(true)
    }
  })

  let lastGroup = ''

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box marginBottom={1} gap={2}>
        <Text bold color="cyan">settings</Text>
        <Text dimColor>space toggle · enter save · {inline ? 'esc' : 'q'} cancel</Text>
      </Box>

      {ITEMS.map((item, i) => {
        const isCursor = i === cursor
        const isChecked = checked.has(item.key)
        const showGroup = item.group !== lastGroup
        lastGroup = item.group

        return (
          <Box key={item.key} flexDirection="column">
            {showGroup && (
              <Box paddingLeft={2} marginTop={i > 0 ? 1 : 0}>
                <Text dimColor bold>{item.group === 'features' ? 'Features' : 'Agents'}</Text>
              </Box>
            )}
            <Box paddingLeft={4}>
              <Text color="cyan">{isCursor ? '› ' : '  '}</Text>
              <Text color={isChecked ? 'green' : 'gray'}>{isChecked ? '[x]' : '[ ]'}</Text>
              <Text> </Text>
              <Text bold={isCursor} color={isCursor ? 'white' : undefined}>{item.label}</Text>
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}
