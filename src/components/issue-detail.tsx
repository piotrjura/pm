import React from 'react'
import { Box, Text, useInput } from 'ink'
import type { Issue } from '../lib/types.js'
import { relativeDate, PRIORITY_COLOR } from '../lib/format.js'

interface IssueDetailProps {
  issue: Issue
  height: number
  onBack: () => void
}

export function IssueDetail({ issue, height, onBack }: IssueDetailProps) {
  const isDone = issue.status === 'done'
  const issueColor = (issue.type ?? 'bug') === 'change' ? 'cyan' : 'red'

  useInput((input, key) => {
    if (key.escape || input === 'b') onBack()
  })

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} height={height} overflow="hidden">
      {/* Header */}
      <Box marginBottom={1} gap={1}>
        <Box flexShrink={0}>
          <Text color={issueColor}>[{issue.type ?? 'bug'}]</Text>
        </Box>
        <Box flexShrink={1} flexGrow={1}>
          <Text bold color={isDone ? 'green' : undefined} wrap="truncate">{issue.title}</Text>
        </Box>
      </Box>

      {/* Metadata */}
      <Box marginBottom={1} gap={2}>
        <Text>
          <Text dimColor>status </Text>
          <Text color={isDone ? 'green' : 'yellow'}>{issue.status}</Text>
        </Text>
        <Text>
          <Text dimColor>priority </Text>
          <Text color={PRIORITY_COLOR[issue.priority]}>{issue.priority}</Text>
        </Text>
        <Text dimColor>created {relativeDate(issue.createdAt)}</Text>
      </Box>

      {/* Description */}
      {issue.description && (
        <Box flexDirection="column" marginBottom={1}>
          {issue.description.split(/(?=\d+[\.\)]\s)/).map((chunk, i) => (
            <Text key={i} dimColor>{chunk.trim()}</Text>
          ))}
        </Box>
      )}

      {/* Decisions */}
      {issue.decisions && issue.decisions.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Decisions</Text>
          {issue.decisions.map((d, i) => (
            <Box key={i} flexDirection="column" paddingLeft={2} marginTop={i > 0 ? 1 : 0}>
              <Text>• {d.decision}</Text>
              {d.reasoning && <Text dimColor>  Why: {d.reasoning}</Text>}
              <Text dimColor>  ({new Date(d.at).toLocaleDateString()})</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* ID */}
      <Box>
        <Text dimColor>id: {issue.id}</Text>
      </Box>
    </Box>
  )
}
