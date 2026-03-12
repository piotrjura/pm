import React from 'react'
import { Box, Text } from 'ink'

const GREEN = '#33ff00'

export function Logo() {
  return (
    <Box flexDirection="column">
      <Text color={GREEN}>{'█▀█ █▀▄▀█'}</Text>
      <Text color={GREEN}>{'█▀▀ █ ▀ █'}</Text>
      <Text color={GREEN}>{'▀   ▀   ▀'}</Text>
    </Box>
  )
}
