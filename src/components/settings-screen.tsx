import React, { useState } from 'react'
import { Box, Text, useInput, useApp } from 'ink'
import { loadConfig } from '../lib/config.js'
import type { Config, PlanningLevel, QuestionsLevel } from '../lib/types.js'

const PLANNING_VALUES: PlanningLevel[] = ['none', 'medium', 'all']
const QUESTIONS_VALUES: QuestionsLevel[] = ['none', 'medium', 'thorough']

interface SettingsItem {
  key: string
  label: string
  group: 'workflow' | 'agents'
  type: 'cycle' | 'toggle'
  values?: string[]
}

const ITEMS: SettingsItem[] = [
  { key: 'planning', label: 'Planning depth', group: 'workflow', type: 'cycle', values: PLANNING_VALUES },
  { key: 'questions', label: 'Questions', group: 'workflow', type: 'cycle', values: QUESTIONS_VALUES },
  { key: 'claude-code', label: 'Claude Code', group: 'agents', type: 'toggle' },
  { key: 'opencode', label: 'OpenCode', group: 'agents', type: 'toggle' },
]

interface SettingsState {
  planning: PlanningLevel
  questions: QuestionsLevel
  agents: Set<string>
}

function configToState(config: Config): SettingsState {
  return {
    planning: config.planning,
    questions: config.questions,
    agents: new Set(config.agents),
  }
}

function stateToConfig(state: SettingsState): Config {
  return {
    planning: state.planning,
    questions: state.questions,
    agents: ITEMS.filter(i => i.group === 'agents' && state.agents.has(i.key)).map(i => i.key),
  }
}

function cycleValue(values: string[], current: string): string {
  const idx = values.indexOf(current)
  return values[(idx + 1) % values.length]
}

function getDisplayValue(item: SettingsItem, state: SettingsState): string {
  if (item.type === 'toggle') {
    return state.agents.has(item.key) ? 'on' : 'off'
  }
  if (item.key === 'planning') return state.planning
  if (item.key === 'questions') return state.questions
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
  const [config] = useState(() => loadConfig())
  const [state, setState] = useState(() => configToState(config))
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
    else if (input === ' ' || key.rightArrow) {
      const item = ITEMS[cursor]
      setState(prev => {
        if (item.type === 'toggle') {
          const next = new Set(prev.agents)
          if (next.has(item.key)) next.delete(item.key)
          else next.add(item.key)
          return { ...prev, agents: next }
        }
        // Cycle through values
        if (item.key === 'planning') {
          return { ...prev, planning: cycleValue(PLANNING_VALUES, prev.planning) as PlanningLevel }
        }
        if (item.key === 'questions') {
          return { ...prev, questions: cycleValue(QUESTIONS_VALUES, prev.questions) as QuestionsLevel }
        }
        return prev
      })
    } else if (key.leftArrow) {
      // Cycle backwards
      const item = ITEMS[cursor]
      setState(prev => {
        if (item.type === 'toggle') {
          const next = new Set(prev.agents)
          if (next.has(item.key)) next.delete(item.key)
          else next.add(item.key)
          return { ...prev, agents: next }
        }
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
      const newConfig = stateToConfig(state)
      onSave?.(newConfig)
      quit(true)
    }
  })

  let lastGroup = ''

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box marginBottom={1} gap={2}>
        <Text bold color="cyan">settings</Text>
        <Text dimColor>{'<'}/{'>'} cycle · space toggle · enter save · {inline ? 'esc' : 'q'} cancel</Text>
      </Box>

      {ITEMS.map((item, i) => {
        const isCursor = i === cursor
        const value = getDisplayValue(item, state)
        const showGroup = item.group !== lastGroup
        lastGroup = item.group

        return (
          <Box key={item.key} flexDirection="column">
            {showGroup && (
              <Box paddingLeft={2} marginTop={i > 0 ? 1 : 0}>
                <Text dimColor bold>{item.group === 'workflow' ? 'Workflow' : 'Agents'}</Text>
              </Box>
            )}
            <Box paddingLeft={4}>
              <Text color="cyan">{isCursor ? '› ' : '  '}</Text>
              <Text bold={isCursor} color={isCursor ? 'white' : undefined}>{item.label}</Text>
              <Text>  </Text>
              {item.type === 'cycle' ? (
                <Text color="yellow">{'<'} {value} {'>'}</Text>
              ) : (
                <Text color={value === 'on' ? 'green' : 'gray'}>[{value === 'on' ? 'x' : ' '}]</Text>
              )}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}
