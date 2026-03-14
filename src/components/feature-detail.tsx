import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import Spinner from 'ink-spinner'
import type { Feature, Task } from '../lib/types.js'
import { relativeDate, shortModel } from '../lib/format.js'

const TASK_COLOR: Record<Task['status'], string | undefined> = {
  pending: 'gray',
  'in-progress': 'yellow',
  review: 'cyan',
  done: 'green',
  error: 'red',
}

interface FeatureDetailProps {
  feature: Feature
  height: number
  width?: number
  focused: boolean
  onBack: () => void
}

export function FeatureDetail({ feature, height, width, focused, onBack }: FeatureDetailProps) {
  const allTasks = feature.phases.flatMap(p => p.tasks)
  const [cursor, setCursor] = useState(0)

  useInput((input, key) => {
    if (!focused) return
    if (key.upArrow) setCursor(c => Math.max(0, c - 1))
    else if (key.downArrow) setCursor(c => Math.min(allTasks.length - 1, c + 1))
    else if (key.escape || input === 'b') onBack()
  })

  const typeColor = feature.type === 'fix' ? 'red' : 'blue'
  const isDone = feature.status === 'done'

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} height={height} overflow="hidden">
      {/* Feature header */}
      <Box marginBottom={1} gap={1}>
        <Box flexShrink={0}>
          <Text color={typeColor}>[{feature.type}]</Text>
        </Box>
        <Box flexShrink={1} flexGrow={1}>
          <Text bold color={isDone ? 'green' : undefined}>{feature.title}</Text>
        </Box>
        {isDone && feature.doneAt && (
          <Box flexShrink={0}>
            <Text dimColor>· done {relativeDate(feature.doneAt)}</Text>
          </Box>
        )}
      </Box>

      {feature.description && (
        <Box flexDirection="column" marginBottom={1} paddingLeft={2}>
          {feature.description.split(/(?=\d+[\.\)]\s)/).map((chunk, i) => (
            <Text key={i} dimColor>{chunk.trim()}</Text>
          ))}
        </Box>
      )}

      {/* Feature-level decisions */}
      {feature.decisions && feature.decisions.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="magenta">  Decisions</Text>
          {feature.decisions.map((d, i) => (
            <Box key={i} paddingLeft={4} flexDirection="column" width={width ? width - 8 : undefined}>
              <Text wrap="wrap">• {d.decision}</Text>
              {d.reasoning && <Text dimColor wrap="wrap">  Why: {d.reasoning}</Text>}
            </Box>
          ))}
        </Box>
      )}

      {feature.phases.length === 0 ? (
        <Text dimColor>No phases yet. Use: pm add-phase {feature.id} "Phase name"</Text>
      ) : (
        feature.phases.map((phase) => {
          let taskIdx = allTasks.indexOf(phase.tasks[0] ?? null)
          return (
            <Box key={phase.id} flexDirection="column" marginBottom={1}>
              {/* Phase header */}
              <Box>
                <Text bold color="cyan">  {phase.title}</Text>
              </Box>

              {phase.tasks.length === 0 && (
                <Text dimColor>    (no tasks)</Text>
              )}

              {phase.tasks.map((task) => {
                const myIdx = taskIdx++
                const isCursor = focused && myIdx === cursor
                const isActive = task.status === 'in-progress'
                const isDoneTask = task.status === 'done'

                return (
                  <Box key={task.id} flexDirection="column" paddingLeft={4}>
                    {/* Task title row */}
                    <Box>
                      <Text color="cyan">{isCursor ? '›' : ' '}</Text>
                      <Text> </Text>
                      {isActive ? (
                        <Text color="yellow"><Spinner type="dots" /></Text>
                      ) : (
                        <Text color={TASK_COLOR[task.status]}>
                          {task.status === 'done' ? '✓' : task.status === 'error' ? '✗' : task.status === 'review' ? '◈' : '○'}
                        </Text>
                      )}
                      <Text> </Text>
                      <Text
                        bold={isCursor}
                        color={isCursor ? 'white' : isDoneTask ? 'gray' : undefined}
                        strikethrough={isDoneTask}
                      >
                        {task.title}
                      </Text>
                      {task.doneAt && (
                        <Text dimColor>  {relativeDate(task.doneAt)}</Text>
                      )}
                    </Box>

                    {/* Note row — shown always for done tasks, or when cursor is on it */}
                    {task.note && (isCursor || isDoneTask) && (
                      <Box paddingLeft={3} width={width ? width - 11 : undefined}>
                        <Text dimColor wrap="wrap">↳ {task.note}</Text>
                      </Box>
                    )}

                    {/* Files row — shown when cursor is on this task */}
                    {isCursor && task.files && task.files.length > 0 && (
                      <Box paddingLeft={3}>
                        <Text dimColor color="blue">files: {task.files.join(', ')}</Text>
                      </Box>
                    )}

                    {/* Task decisions — shown when cursor is on this task */}
                    {isCursor && task.decisions && task.decisions.length > 0 && (
                      <Box paddingLeft={3} flexDirection="column">
                        {task.decisions.map((d, i) => (
                          <Box key={i} flexDirection="column">
                            <Text color="magenta">decision: {d.decision}</Text>
                            {d.reasoning && <Text dimColor>  why: {d.reasoning}</Text>}
                          </Box>
                        ))}
                      </Box>
                    )}

                    {/* ID + agent/model row — shown when cursor is on this task */}
                    {isCursor && (
                      <Box paddingLeft={3} gap={2}>
                        <Text dimColor>id: {task.id}</Text>
                        {(task.agent || task.model) && (
                          <Text dimColor>{[task.agent, task.model && shortModel(task.model)].filter(Boolean).join('/')}</Text>
                        )}
                      </Box>
                    )}
                  </Box>
                )
              })}
            </Box>
          )
        })
      )}
    </Box>
  )
}
