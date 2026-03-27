import React, { useState } from 'react'
import { Box, Text, useInput, useApp } from 'ink'
import { loadConfig } from '../lib/config.js'
import type { Config, PlanningLevel, QuestionsLevel } from '../lib/types.js'

const PLANNING_VALUES: PlanningLevel[] = ['none', 'medium', 'all']
const QUESTIONS_VALUES: QuestionsLevel[] = ['none', 'medium', 'thorough']

interface SettingsItem {
  key: string
  label: string
  values: string[]
}

const ITEMS: SettingsItem[] = [
  { key: 'planning', label: 'Planning depth', values: PLANNING_VALUES },
  { key: 'questions', label: 'Questions', values: QUESTIONS_VALUES },
]

function cycleValue(values: string[], current: string): string {
  const idx = values.indexOf(current)
  return values[(idx + 1) % values.length]
}

function getDisplayValue(item: SettingsItem, config: Config): string {
  if (item.key === 'planning') return config.planning
  if (item.key === 'questions') return config.questions
  return ''
}

interface SettingsScreenProps {
  onSave?: (config: Config) => void
  /** For embedded use in TUI — called instead of exit() */
  onDone?: (saved: boolean) => void
  inline?: boolean
}

export function SettingsScreen({ onSave, onDone, inline }: SettingsScreenProps) {
  const app = inline ? null : useApp()
  const [initialConfig] = useState(() => loadConfig())
  const [config, setConfig] = useState<Config>(() => ({ ...initialConfig }))
  const [cursor, setCursor] = useState(0)

  const quit = (saved: boolean) => {
    if (onDone) { onDone(saved); return }
    if (app) app.exit()
  }

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      quit(false)
      return
    }
    if (key.upArrow) setCursor(c => Math.max(0, c - 1))
    else if (key.downArrow) setCursor(c => Math.min(ITEMS.length - 1, c + 1))
    else if (input === ' ' || key.rightArrow) {
      const item = ITEMS[cursor]
      setConfig(prev => {
        if (item.key === 'planning') {
          return { ...prev, planning: cycleValue(PLANNING_VALUES, prev.planning) as PlanningLevel }
        }
        if (item.key === 'questions') {
          return { ...prev, questions: cycleValue(QUESTIONS_VALUES, prev.questions) as QuestionsLevel }
        }
        return prev
      })
    } else if (key.leftArrow) {
      const item = ITEMS[cursor]
      setConfig(prev => {
        if (item.key === 'planning') {
          const idx = PLANNING_VALUES.indexOf(prev.planning)
          const newIdx = (idx - 1 + PLANNING_VALUES.length) % PLANNING_VALUES.length
          return { ...prev, planning: PLANNING_VALUES[newIdx] }
        }
        if (item.key === 'questions') {
          const idx = QUESTIONS_VALUES.indexOf(prev.questions)
          const newIdx = (idx - 1 + QUESTIONS_VALUES.length) % QUESTIONS_VALUES.length
          return { ...prev, questions: QUESTIONS_VALUES[newIdx] }
        }
        return prev
      })
    } else if (key.return) {
      onSave?.(config)
      quit(true)
    }
  })

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box marginBottom={1} gap={2}>
        <Text bold color="cyan">settings</Text>
        <Text dimColor>{'<'}/{'>'} cycle · enter save · {inline ? 'esc' : 'q'} cancel</Text>
      </Box>

      {ITEMS.map((item, i) => {
        const isCursor = i === cursor
        const value = getDisplayValue(item, config)

        return (
          <Box key={item.key} paddingLeft={4}>
            <Text color="cyan">{isCursor ? '› ' : '  '}</Text>
            <Text bold={isCursor} color={isCursor ? 'white' : undefined}>{item.label}</Text>
            <Text>  </Text>
            <Text color="yellow">{'<'} {value} {'>'}</Text>
          </Box>
        )
      })}
    </Box>
  )
}
