import React, { useState } from 'react'
import { Box, Text, useInput, useApp } from 'ink'
import { basename } from 'node:path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { ensureClaudePermission } from '../lib/init.js'
import { ensureHooks } from '../lib/hooks.js'
import { PM_VERSION } from '../lib/version.js'
import { Logo } from './logo.js'
const PERM_RULE = 'Bash(pm *)'

interface StepDef {
  id: string
  title: string
}

const STEPS: StepDef[] = [
  { id: 'permissions', title: 'Whitelist pm commands' },
  { id: 'hooks', title: 'Set up Claude Code hooks' },
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

    const dataExists = existsSync(dataFile)

    const hasPermission = (() => {
      try {
        const settingsPath = join(homedir(), '.claude', 'settings.json')
        const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
        return (settings.permissions?.allow ?? []).includes(PERM_RULE)
      } catch { return false }
    })()

    const hasHooks = (() => {
      try {
        const settingsPath = join(projectDir, '.claude', 'settings.json')
        const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
        const hooks = settings.hooks?.PreToolUse ?? []
        return hooks.some((c: { hooks?: Array<{ command?: string }> }) =>
          c.hooks?.some(h => h.command?.startsWith('pm hook'))
        )
      } catch { return false }
    })()

    return { pmDir, dataFile, dataExists, hasPermission, hasHooks }
  })

  function isAlreadyDone(stepId: string): boolean {
    switch (stepId) {
      case 'permissions': return initial.hasPermission
      case 'hooks': return initial.hasHooks
      case 'store': return initial.dataExists
      default: return false
    }
  }

  function executeStep(stepId: string): StepResult {
    switch (stepId) {
      case 'permissions': {
        const r = ensureClaudePermission()
        return r === 'exists'
          ? { status: 'already', note: 'already configured' }
          : { status: 'done', note: `added "${PERM_RULE}"` }
      }
      case 'hooks': {
        const r = ensureHooks(projectDir)
        return r === 'exists'
          ? { status: 'already', note: 'already configured' }
          : { status: 'done', note: `${r} hooks in .claude/settings.json` }
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
    if (input === 'q') { process.exitCode = 1; exit(); return }

    if (finished) {
      if (key.return) {
        // Signal success so cli.tsx can launch the TUI
        process.exitCode = 0
        exit()
      }
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
        <Box marginRight={3}>
          <Logo />
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
          <Box>
            <Text dimColor>Press </Text>
            <Text bold color="cyan">Enter</Text>
            <Text dimColor> to continue</Text>
            <Text dimColor>{' · '}</Text>
            <Text bold color="cyan">q</Text>
            <Text dimColor> to quit</Text>
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
    hasPermission: boolean
    dataExists: boolean
  }
}) {
  switch (stepId) {
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
