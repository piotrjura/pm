import React, { useState } from 'react'
import { Box, Text, useInput, useApp } from 'ink'
import { basename } from 'node:path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { ensureClaudePermission } from '../lib/init.js'
import { ensureHooks } from '../lib/hooks.js'
import { ensureOpenCodePlugin, hasOpenCodePlugin } from '../lib/opencode.js'
import { saveConfig } from '../lib/config.js'
import { PM_VERSION } from '../lib/version.js'
import { Logo } from './logo.js'
import type { Config } from '../lib/types.js'

const PERM_RULE = 'Bash(pm *)'

type WizardStep = 'store' | 'agents' | 'features' | 'execute'

interface SelectOption {
  key: string
  label: string
  detail?: string
}

const AGENT_OPTIONS: SelectOption[] = [
  { key: 'claude-code', label: 'Claude Code', detail: 'hooks for .claude/settings.json' },
  { key: 'opencode', label: 'OpenCode', detail: 'plugin at .opencode/plugins/pm.ts' },
]

const FEATURE_OPTIONS: SelectOption[] = [
  { key: 'decisions', label: 'Design decisions', detail: 'pm decide/why/forget, context injection' },
]

interface StepResult {
  status: 'done' | 'skipped' | 'already'
  note: string
}

export function InitWizard() {
  const { exit } = useApp()
  const projectDir = process.cwd()
  const projectName = basename(projectDir)

  const [step, setStep] = useState<WizardStep>('store')
  const [storeResult, setStoreResult] = useState<StepResult | null>(null)
  const [executeResults, setExecuteResults] = useState<Map<string, StepResult> | null>(null)
  const [finished, setFinished] = useState(false)

  // Multi-select state
  const [agentCursor, setAgentCursor] = useState(0)
  const [agentChecked, setAgentChecked] = useState<Set<string>>(() => new Set(['claude-code']))
  const [featureCursor, setFeatureCursor] = useState(0)
  const [featureChecked, setFeatureChecked] = useState<Set<string>>(() => new Set(['decisions']))

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
          c.hooks?.some(h => h.command?.startsWith('pm hook') || h.command?.startsWith('PM_AGENT='))
        )
      } catch { return false }
    })()

    const hasOpenCode = hasOpenCodePlugin(projectDir)

    return { pmDir, dataFile, dataExists, hasPermission, hasHooks, hasOpenCode }
  })

  function executeStore(): StepResult {
    if (initial.dataExists) return { status: 'already', note: 'already exists' }
    if (!existsSync(initial.pmDir)) mkdirSync(initial.pmDir, { recursive: true })
    writeFileSync(initial.dataFile, JSON.stringify({ features: [], issues: [], log: [] }, null, 2))
    return { status: 'done', note: 'created' }
  }

  function executeAll() {
    const results = new Map<string, StepResult>()

    // Set up selected agents
    if (agentChecked.has('claude-code')) {
      const permResult = ensureClaudePermission()
      const hookResult = ensureHooks(projectDir)
      if (permResult === 'exists' && hookResult === 'exists') {
        results.set('claude-code', { status: 'already', note: 'already configured' })
      } else {
        const parts: string[] = []
        if (permResult === 'added') parts.push('permissions')
        if (hookResult !== 'exists') parts.push('hooks')
        results.set('claude-code', { status: 'done', note: `${parts.join(' + ')} configured` })
      }
    }

    if (agentChecked.has('opencode')) {
      const r = ensureOpenCodePlugin(projectDir)
      results.set('opencode', r === 'exists'
        ? { status: 'already', note: 'already configured' }
        : { status: 'done', note: `plugin ${r} at .opencode/plugins/pm.ts` })
    }

    // Write config.json
    const config: Config = {
      decisions: featureChecked.has('decisions'),
      agents: Array.from(agentChecked),
    }
    saveConfig(config, projectDir)
    results.set('config', { status: 'done', note: 'saved' })

    return results
  }

  useInput((input, key) => {
    if (input === 'q') { process.exitCode = 1; exit(); return }

    if (finished) {
      if (key.return) { process.exitCode = 0; exit() }
      return
    }

    if (step === 'store') {
      const already = initial.dataExists
      if (input === 'y' || key.return) {
        setStoreResult(executeStore())
        setStep('agents')
      } else if (input === 'n' && !already) {
        setStoreResult({ status: 'skipped', note: 'skipped' })
        setStep('agents')
      }
      return
    }

    if (step === 'agents') {
      if (key.upArrow) setAgentCursor(c => Math.max(0, c - 1))
      else if (key.downArrow) setAgentCursor(c => Math.min(AGENT_OPTIONS.length - 1, c + 1))
      else if (input === ' ') {
        const item = AGENT_OPTIONS[agentCursor]
        setAgentChecked(prev => {
          const next = new Set(prev)
          if (next.has(item.key)) next.delete(item.key)
          else next.add(item.key)
          return next
        })
      } else if (key.return) {
        setStep('features')
      }
      return
    }

    if (step === 'features') {
      if (key.upArrow) setFeatureCursor(c => Math.max(0, c - 1))
      else if (key.downArrow) setFeatureCursor(c => Math.min(FEATURE_OPTIONS.length - 1, c + 1))
      else if (input === ' ') {
        const item = FEATURE_OPTIONS[featureCursor]
        setFeatureChecked(prev => {
          const next = new Set(prev)
          if (next.has(item.key)) next.delete(item.key)
          else next.add(item.key)
          return next
        })
      } else if (key.return) {
        setStep('execute')
        const results = executeAll()
        setExecuteResults(results)
        setFinished(true)
      }
      return
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
          <Text dimColor>project manager for agents</Text>
          <Text dimColor>{projectDir}</Text>
        </Box>
      </Box>

      {/* Phase header */}
      <Box>
        <Text bold color="cyan">{'  '}{finished ? 'Setup complete' : 'Setup'}</Text>
      </Box>

      {/* Step 1: Store */}
      <StoreStep
        result={storeResult}
        isCurrent={step === 'store'}
        initial={initial}
      />

      {/* Step 2: Agents multi-select */}
      <MultiSelectStep
        title="Select agents"
        options={AGENT_OPTIONS}
        checked={agentChecked}
        cursor={agentCursor}
        isCurrent={step === 'agents'}
        isDone={step === 'features' || step === 'execute'}
        doneNote={agentChecked.size > 0 ? Array.from(agentChecked).join(', ') : 'none'}
      />

      {/* Step 3: Features multi-select */}
      <MultiSelectStep
        title="Select features"
        options={FEATURE_OPTIONS}
        checked={featureChecked}
        cursor={featureCursor}
        isCurrent={step === 'features'}
        isDone={step === 'execute'}
        doneNote={featureChecked.size > 0 ? Array.from(featureChecked).join(', ') : 'none'}
      />

      {/* Step 4: Execute results */}
      {executeResults && (
        <Box flexDirection="column" paddingLeft={4}>
          {Array.from(executeResults.entries()).map(([key, result]) => (
            <Box key={key}>
              <Text color={result.status === 'skipped' ? 'gray' : 'green'}>
                {result.status === 'skipped' ? '·' : '✓'}
              </Text>
              <Text> </Text>
              <Text dimColor>{key}: {result.note}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Prompt */}
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
        ) : step === 'store' ? (
          <StepPrompt already={initial.dataExists} />
        ) : (
          <Box>
            <Text dimColor>Press </Text>
            <Text bold color="cyan">space</Text>
            <Text dimColor> to toggle</Text>
            <Text dimColor>{' · '}</Text>
            <Text bold color="cyan">Enter</Text>
            <Text dimColor> to confirm</Text>
            <Text dimColor>{' · '}</Text>
            <Text bold color="cyan">q</Text>
            <Text dimColor> to quit</Text>
          </Box>
        )}
      </Box>
    </Box>
  )
}

function StoreStep({ result, isCurrent, initial }: {
  result: StepResult | null
  isCurrent: boolean
  initial: { dataExists: boolean }
}) {
  const isDone = !!result
  const already = initial.dataExists
  let icon: string
  let iconColor: string | undefined
  if (isDone) {
    icon = result.status === 'skipped' ? '·' : '✓'
    iconColor = result.status === 'skipped' ? 'gray' : 'green'
  } else if (isCurrent && already) {
    icon = '✓'
    iconColor = 'green'
  } else {
    icon = '○'
    iconColor = 'gray'
  }

  return (
    <Box flexDirection="column" paddingLeft={4}>
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
          Initialize data store
        </Text>
        {isDone && <Text dimColor>{'  '}{result.note}</Text>}
      </Box>
      {isCurrent && (
        <Box paddingLeft={3}>
          <Text dimColor>{'↳'} {already ? '.pm/data.json already exists' : '.pm/data.json stores your features, tasks, and issues.'}</Text>
        </Box>
      )}
    </Box>
  )
}

function MultiSelectStep({ title, options, checked, cursor, isCurrent, isDone, doneNote }: {
  title: string
  options: SelectOption[]
  checked: Set<string>
  cursor: number
  isCurrent: boolean
  isDone: boolean
  doneNote: string
}) {
  let icon: string
  let iconColor: string | undefined
  if (isDone) {
    icon = '✓'
    iconColor = 'green'
  } else if (isCurrent) {
    icon = '○'
    iconColor = 'cyan'
  } else {
    icon = '○'
    iconColor = 'gray'
  }

  return (
    <Box flexDirection="column" paddingLeft={4}>
      <Box>
        <Text color="cyan">{isCurrent ? '›' : ' '}</Text>
        <Text> </Text>
        <Text color={iconColor}>{icon}</Text>
        <Text> </Text>
        <Text
          bold={isCurrent}
          color={isCurrent ? 'white' : isDone ? 'gray' : undefined}
          strikethrough={isDone}
        >
          {title}
        </Text>
        {isDone && <Text dimColor>{'  '}{doneNote}</Text>}
      </Box>
      {isCurrent && options.map((opt, i) => {
        const isChecked = checked.has(opt.key)
        const isCur = i === cursor
        return (
          <Box key={opt.key} paddingLeft={3}>
            <Text color="cyan">{isCur ? '› ' : '  '}</Text>
            <Text color={isChecked ? 'green' : 'gray'}>{isChecked ? '[x]' : '[ ]'}</Text>
            <Text> </Text>
            <Text bold={isCur} color={isCur ? 'white' : undefined}>{opt.label}</Text>
            {opt.detail && <Text dimColor>{'  '}{opt.detail}</Text>}
          </Box>
        )
      })}
    </Box>
  )
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
