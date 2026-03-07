import React from 'react'
import { Box, Text, useInput } from 'ink'
import { basename } from 'node:path'
import type { ProjectStatus } from '../lib/init.js'

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
        <Box flexDirection="column" marginRight={3}>
          <Text>{'▐▛▀▀▜▌'}</Text>
          <Text>{'▐▌'}<Text color="green">{'✓'}</Text>{'•▐▌'}</Text>
          <Text>{'▝▜▄▄▛▘'}</Text>
        </Box>
        <Box flexDirection="column">
          <Text bold>pm <Text dimColor>v0.1.0</Text></Text>
          <Text dimColor>Project Manager for Claude Code</Text>
          <Text dimColor>{status.projectDir}</Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>Status:</Text>
        <Text>  {status.hasDataFile ? <Text color="green">{'✓'}</Text> : '○'} .pm/data.json   {status.hasDataFile ? <Text dimColor>exists</Text> : <Text color="yellow">will be created</Text>}</Text>
        <Text>  {status.hasPmSection ? <Text color="green">{'✓'}</Text> : '○'} CLAUDE.md       {status.hasPmSection ? <Text dimColor>PM section present</Text> : status.hasClaudeMd ? <Text color="yellow">PM section will be added</Text> : <Text color="yellow">will be created</Text>}</Text>
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
