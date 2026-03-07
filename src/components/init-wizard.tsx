import React, { useState } from 'react'
import { Box, Text, useInput, useApp } from 'ink'
import { basename } from 'node:path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { updateClaudeMd } from '../lib/claude-md.js'
import { ensureClaudePermission } from '../lib/init.js'

const PM_VERSION = '0.1.0'
const PERM_RULE = 'Bash(pm *)'

interface StepDef {
  id: string
  title: string
}

const STEPS: StepDef[] = [
  { id: 'claude-md', title: 'Add CLAUDE.md instructions' },
  { id: 'permissions', title: 'Whitelist pm commands' },
  { id: 'store', title: 'Initialize data store' },
]

interface StepResult {
  status: 'done' | 'skipped' | 'already'
  note: string
}

export function InitWizard() {
  const { exit } = useApp()
  const projectDir = process.cwd()
  const projectName = basename(projectDir)

  const [currentStep, setCurrentStep] = useState(0)
  const [results, setResults] = useState<Map<string, StepResult>>(new Map())
  const [finished, setFinished] = useState(false)

  // Detect initial state once on mount
  const [initial] = useState(() => {
    const pmDir = join(projectDir, '.pm')
    const dataFile = join(pmDir, 'data.json')
    const claudeMdPath = join(projectDir, 'CLAUDE.md')

    const dataExists = existsSync(dataFile)
    const claudeMdExists = existsSync(claudeMdPath)
    const hasPmSection = claudeMdExists
      && readFileSync(claudeMdPath, 'utf-8').includes('<!-- PM:INSTRUCTIONS:START -->')

    const hasPermission = (() => {
      try {
        const settingsPath = join(homedir(), '.claude', 'settings.json')
        const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
        return (settings.permissions?.allow ?? []).includes(PERM_RULE)
      } catch { return false }
    })()

    return { pmDir, dataFile, claudeMdPath, dataExists, claudeMdExists, hasPmSection, hasPermission }
  })

  function isAlreadyDone(stepId: string): boolean {
    switch (stepId) {
      case 'claude-md': return initial.hasPmSection
      case 'permissions': return initial.hasPermission
      case 'store': return initial.dataExists
      default: return false
    }
  }

  function executeStep(stepId: string): StepResult {
    switch (stepId) {
      case 'claude-md':
        if (initial.hasPmSection) return { status: 'already', note: 'already configured' }
        updateClaudeMd(projectDir)
        return { status: 'done', note: initial.claudeMdExists ? 'updated' : 'created' }
      case 'permissions': {
        const r = ensureClaudePermission()
        return r === 'exists'
          ? { status: 'already', note: 'already configured' }
          : { status: 'done', note: `added "${PERM_RULE}"` }
      }
      case 'store':
        if (initial.dataExists) return { status: 'already', note: 'already exists' }
        if (!existsSync(initial.pmDir)) mkdirSync(initial.pmDir, { recursive: true })
        writeFileSync(initial.dataFile, JSON.stringify({ features: [], issues: [], log: [] }, null, 2))
        return { status: 'done', note: 'created' }
      default:
        return { status: 'done', note: '' }
    }
  }

  function advance(result: StepResult) {
    const step = STEPS[currentStep]
    const next = new Map(results)
    next.set(step.id, result)
    setResults(next)
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      setFinished(true)
    }
  }

  useInput((input, key) => {
    if (input === 'q') { exit(); return }

    if (finished) {
      if (key.return) exit()
      return
    }

    const step = STEPS[currentStep]
    const already = isAlreadyDone(step.id)

    if (input === 'y' || key.return) {
      advance(executeStep(step.id))
    } else if (input === 'n' && !already) {
      advance({ status: 'skipped', note: 'skipped' })
    }
  })

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* Logo header */}
      <Box marginBottom={1}>
        <Box flexDirection="column" marginRight={3}>
          <Text>{'▐▛▀▀▜▌'}</Text>
          <Text>{'▐▌'}<Text color="green">{'✓'}</Text>{'•▐▌'}</Text>
          <Text>{'▝▜▄▄▛▘'}</Text>
        </Box>
        <Box flexDirection="column">
          <Text bold>pm <Text dimColor>v{PM_VERSION}</Text></Text>
          <Text dimColor>Project Manager for Claude Code</Text>
          <Text dimColor>{projectDir}</Text>
        </Box>
      </Box>

      {/* Phase header — matches feature-detail style */}
      <Box>
        <Text bold color="cyan">{'  '}{finished ? 'Setup complete' : 'Setup'}</Text>
      </Box>

      {/* Steps — same layout as feature-detail tasks */}
      {STEPS.map((step, i) => {
        const result = results.get(step.id)
        const isCurrent = !finished && i === currentStep
        const already = isAlreadyDone(step.id)

        // Icon + color — match feature-detail task icons
        let icon: string
        let iconColor: string | undefined
        if (result) {
          icon = result.status === 'skipped' ? '·' : '✓'
          iconColor = result.status === 'skipped' ? 'gray' : 'green'
        } else if (isCurrent && already) {
          icon = '✓'
          iconColor = 'green'
        } else {
          icon = '○'
          iconColor = 'gray'
        }

        const isDone = !!result

        return (
          <Box key={step.id} flexDirection="column" paddingLeft={4}>
            {/* Task title row — matches feature-detail */}
            <Box>
              <Text color="cyan">{isCurrent ? '›' : ' '}</Text>
              <Text> </Text>
              <Text color={iconColor}>{icon}</Text>
              <Text> </Text>
              <Text
                bold={isCurrent}
                color={isCurrent ? 'white' : isDone && result.status !== 'skipped' ? 'gray' : isDone ? 'gray' : undefined}
                strikethrough={isDone && result.status !== 'skipped'}
              >
                {step.title}
              </Text>
              {/* Note inline for completed steps */}
              {isDone && (
                <Text dimColor>{'  '}{result.note}</Text>
              )}
            </Box>

            {/* Expanded detail for current step — matches feature-detail note style */}
            {isCurrent && (
              <StepDetail stepId={step.id} initial={initial} />
            )}
          </Box>
        )
      })}

      {/* Prompt — below the step list */}
      <Box marginTop={1} paddingLeft={4}>
        {finished ? (
          <Box flexDirection="column">
            <Box flexDirection="column" marginTop={1}>
              <Text dimColor>Next steps:</Text>
              <Text dimColor>{'  '}pm add-feature "My feature" --description "..."</Text>
              <Text dimColor>{'  '}pm next</Text>
            </Box>
            <Box marginTop={1}>
              <Text dimColor>Press </Text>
              <Text bold color="cyan">Enter</Text>
              <Text dimColor> to exit</Text>
            </Box>
          </Box>
        ) : (
          <StepPrompt already={isAlreadyDone(STEPS[currentStep].id)} />
        )}
      </Box>
    </Box>
  )
}

function StepDetail({ stepId, initial }: {
  stepId: string
  initial: {
    hasPmSection: boolean
    claudeMdExists: boolean
    hasPermission: boolean
    dataExists: boolean
  }
}) {
  switch (stepId) {
    case 'claude-md':
      return initial.hasPmSection ? (
        <Box paddingLeft={3}>
          <Text dimColor>{'↳'} PM section already present</Text>
        </Box>
      ) : (
        <Box flexDirection="column" paddingLeft={3}>
          <Text color="yellow">{'⚠'} Your CLAUDE.md will be modified</Text>
          <Text dimColor>pm will prepend task-tracking instructions wrapped in</Text>
          <Text dimColor>{'<!-- PM:INSTRUCTIONS:START/END -->'} comment markers.</Text>
        </Box>
      )

    case 'permissions':
      return initial.hasPermission ? (
        <Box paddingLeft={3}>
          <Text dimColor>{'↳'} Permission already present</Text>
        </Box>
      ) : (
        <Box flexDirection="column" paddingLeft={3}>
          <Text color="yellow">{'⚠'} ~/.claude/settings.json will be modified</Text>
          <Text dimColor>This adds <Text color="white">{`"${PERM_RULE}"`}</Text> to Claude Code permissions</Text>
          <Text dimColor>so pm commands run without manual approval.</Text>
        </Box>
      )

    case 'store':
      return initial.dataExists ? (
        <Box paddingLeft={3}>
          <Text dimColor>{'↳'} .pm/data.json already exists</Text>
        </Box>
      ) : (
        <Box paddingLeft={3}>
          <Text dimColor>{'↳'} .pm/data.json stores your features, tasks, and issues.</Text>
        </Box>
      )

    default:
      return null
  }
}

function StepPrompt({ already }: { already: boolean }) {
  return (
    <Box>
      {already ? (
        <>
          <Text dimColor>Press </Text>
          <Text bold color="cyan">Enter</Text>
          <Text dimColor> to continue</Text>
        </>
      ) : (
        <>
          <Text dimColor>Press </Text>
          <Text bold color="cyan">y</Text>
          <Text dimColor>/</Text>
          <Text bold color="cyan">Enter</Text>
          <Text dimColor> to confirm</Text>
          <Text dimColor>{' \u00b7 '}</Text>
          <Text bold color="cyan">n</Text>
          <Text dimColor> to skip</Text>
        </>
      )}
      <Text dimColor>{' \u00b7 '}</Text>
      <Text bold color="cyan">q</Text>
      <Text dimColor> to quit</Text>
    </Box>
  )
}
