import React from 'react'
import path from 'node:path'
import { Box, Text, useInput } from 'ink'
import { Logo } from './logo.js'
import { PM_VERSION } from '../lib/version.js'

interface InitConfirmScreenProps {
  onConfirm: () => void
  onCancel: () => void
}

/**
 * First-run confirmation screen.
 * Shown when pm is launched in a directory that has no .pm/ data store.
 * Explains what pm will do and asks for explicit user confirmation.
 */
export function InitConfirmScreen({ onConfirm, onCancel }: InitConfirmScreenProps) {
  const projectName = path.basename(process.cwd())

  useInput((input, key) => {
    if (key.return || input === ' ' || input === 'y' || input === 'Y') onConfirm()
    if (input === 'q' || input === 'n' || input === 'N' || key.escape) onCancel()
  })

  return (
    <Box flexDirection="column" padding={2} gap={1}>
      <Box>
        <Box marginRight={3}>
          <Logo />
        </Box>
        <Box flexDirection="column">
          <Text bold>pm <Text dimColor>v{PM_VERSION}</Text></Text>
          <Text dimColor>project manager for agents</Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold color="cyan">Initialize pm in this project?</Text>
        <Text dimColor>{projectName}</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>This will create:</Text>
        <Text>  <Text color="green">{'•'}</Text> .pm/data.json — task and decision storage</Text>
        <Text>  <Text color="green">{'•'}</Text> .pm/config.json — workflow settings</Text>
        <Text>  <Text color="green">{'•'}</Text> .claude/settings.json — pm hooks for Claude Code</Text>
        <Text>  <Text color="green">{'•'}</Text> Bash(pm *) permission in ~/.claude/settings.json</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>pm tracks work, decisions, and scope across sessions so</Text>
        <Text dimColor>your AI agent can pick up where the last conversation left off.</Text>
      </Box>

      <Box marginTop={1}>
        <Text bold color="green">y</Text>
        <Text dimColor> / </Text>
        <Text bold color="green">Enter</Text>
        <Text dimColor> initialize</Text>
        <Text dimColor>{'   ·   '}</Text>
        <Text bold color="red">n</Text>
        <Text dimColor> / </Text>
        <Text bold color="red">Esc</Text>
        <Text dimColor> cancel</Text>
      </Box>
    </Box>
  )
}
