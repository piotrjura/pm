import React from 'react'
import { Box, Text, useInput } from 'ink'
import { basename } from 'node:path'
import type { ProjectStatus } from '../lib/init.js'
import { PM_VERSION } from '../lib/version.js'
import { Logo } from './logo.js'

interface InitScreenProps {
  status: ProjectStatus
  onConfirm: () => void
  onQuit: () => void
}

export function InitScreen({ status, onConfirm, onQuit }: InitScreenProps) {
  const projectName = basename(status.projectDir)

  useInput((input, key) => {
    if (input === 'y' || key.return) onConfirm()
    if (input === 'q' || key.escape) onQuit()
  })

  return (
    <Box flexDirection="column" padding={2} gap={1}>
      {/* Logo header */}
      <Box>
        <Box marginRight={3}>
          <Logo />
        </Box>
        <Box flexDirection="column">
          <Text bold>pm <Text dimColor>v{PM_VERSION}</Text></Text>
          <Text dimColor>Project Manager for Claude Code</Text>
          <Text dimColor>{status.projectDir}</Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>Status:</Text>
        <Text>  {status.hasDataFile ? <Text color="green">{'✓'}</Text> : '○'} .pm/data.json   {status.hasDataFile ? <Text dimColor>exists</Text> : <Text color="yellow">will be created</Text>}</Text>
      </Box>

      <Box marginTop={1}>
        <Text>Initialize pm for <Text bold>{projectName}</Text>?</Text>
      </Box>
      <Box>
        <Text dimColor>Press </Text>
        <Text bold color="cyan">y</Text>
        <Text dimColor>/</Text>
        <Text bold color="cyan">Enter</Text>
        <Text dimColor> to confirm</Text>
        <Text dimColor>{' \u00b7 '}</Text>
        <Text bold color="cyan">q</Text>
        <Text dimColor> to quit</Text>
      </Box>
    </Box>
  )
}
