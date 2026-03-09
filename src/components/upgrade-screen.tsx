import React from 'react'
import { Box, Text, useInput } from 'ink'
import type { UpgradeInfo } from '../lib/init.js'
import { Logo } from './logo.js'

interface UpgradeScreenProps {
  info: UpgradeInfo
  onContinue: () => void
  onQuit: () => void
}

export function UpgradeScreen({ info, onContinue, onQuit }: UpgradeScreenProps) {
  useInput((input, key) => {
    if (key.return || input === ' ') onContinue()
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
          <Text bold>pm <Text dimColor>v{info.toVersion}</Text></Text>
          <Text dimColor>Project Manager for Claude Code</Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold color="green">Updated</Text>
        <Text dimColor>
          {info.fromVersion === '0.0.0' ? 'First tracked version' : `${info.fromVersion} → ${info.toVersion}`}
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>What changed:</Text>
        {info.updatedHooks && (
          <Text>  <Text color="green">{'✓'}</Text> Claude Code hooks updated</Text>
        )}
        {!info.updatedHooks && (
          <Text>  <Text color="green">{'✓'}</Text> Version tracked (no config changes needed)</Text>
        )}
        <Text>  <Text color="green">{'✓'}</Text> Version stamped in .pm/data.json</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press </Text>
        <Text bold color="cyan">Enter</Text>
        <Text dimColor> to continue</Text>
        <Text dimColor>{' · '}</Text>
        <Text bold color="cyan">q</Text>
        <Text dimColor> to quit</Text>
      </Box>
    </Box>
  )
}
