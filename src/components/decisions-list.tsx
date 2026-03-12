import React, { useState, useMemo } from 'react'
import { Box, Text, useInput } from 'ink'
import type { DecisionMatch } from '../lib/store.js'
import { relativeDate, truncate } from '../lib/format.js'

interface DecisionsListProps {
  decisions: DecisionMatch[]
  height: number
  onBack: () => void
}

const SOURCE_COLOR: Record<string, string> = {
  feature: 'blue',
  task: 'yellow',
  issue: 'cyan',
}

function sourceLabel(source: DecisionMatch['source']): string {
  if (source.type === 'feature') return source.featureTitle
  if (source.type === 'task') return `${source.featureTitle} > ${source.taskTitle}`
  return source.issueTitle
}

export function DecisionsList({ decisions, height, onBack }: DecisionsListProps) {
  const [cursor, setCursor] = useState(0)
  const [search, setSearch] = useState('')
  const [searchMode, setSearchMode] = useState(false)

  const filtered = useMemo(() => {
    if (!search) return decisions
    const q = search.toLowerCase()
    return decisions.filter(m =>
      m.decision.decision.toLowerCase().includes(q) ||
      m.decision.reasoning?.toLowerCase().includes(q) ||
      sourceLabel(m.source).toLowerCase().includes(q)
    )
  }, [decisions, search])

  const clamp = (c: number) => Math.max(0, Math.min(filtered.length - 1, c))

  useInput((input, key) => {
    if (searchMode) {
      if (key.escape) { setSearch(''); setSearchMode(false) }
      else if (key.backspace || key.delete) setSearch(s => s.slice(0, -1))
      else if (key.return) setSearchMode(false)
      else if (input && !key.ctrl && !key.meta) { setSearch(s => s + input); setCursor(0) }
      return
    }
    if (key.upArrow) setCursor(c => clamp(c - 1))
    else if (key.downArrow) setCursor(c => clamp(c + 1))
    else if (input === '/') setSearchMode(true)
    else if (key.escape) {
      if (search) { setSearch(''); setCursor(0) }
      else onBack()
    }
    else if (input === 'b') onBack()
  })

  const showSearchBar = searchMode || !!search
  // Each decision takes 2-3 lines; calculate visible items
  const availableHeight = height - 4 - (showSearchBar ? 2 : 0)
  // Estimate ~3 lines per decision (source + decision + reasoning/spacing)
  const visibleCount = Math.max(1, Math.floor(availableHeight / 3))
  const scrollOffset = Math.max(0, cursor - visibleCount + 1)
  const visibleItems = filtered.slice(scrollOffset, scrollOffset + visibleCount)

  return (
    <Box flexDirection="column" width="100%" height={height}>
      <Box flexDirection="column" paddingX={3} paddingY={1} flexGrow={1} overflow="hidden">
        {/* Header */}
        <Box marginBottom={1} gap={2}>
          <Text bold color="magenta">decisions</Text>
          <Text dimColor>{filtered.length} recorded</Text>
          {search && filtered.length !== decisions.length && (
            <Text dimColor>(of {decisions.length})</Text>
          )}
        </Box>

        {filtered.length === 0 && !search && (
          <Box flexDirection="column" gap={1}>
            <Text dimColor>No decisions recorded yet.</Text>
            <Text dimColor>  pm decide {'<id>'} "what you decided" --reasoning "why"</Text>
          </Box>
        )}

        {filtered.length === 0 && search && (
          <Text dimColor>No decisions matching "{search}"</Text>
        )}

        {visibleItems.map((m, i) => {
          const realIdx = scrollOffset + i
          const isCursor = realIdx === cursor
          const src = m.source
          const age = relativeDate(m.decision.at)

          return (
            <Box key={realIdx} flexDirection="column" marginBottom={isCursor ? 1 : 0}>
              <Box>
                <Text color="cyan">{isCursor ? '› ' : '  '}</Text>
                <Text bold={isCursor} color={isCursor ? 'white' : undefined}>
                  {m.decision.decision}
                </Text>
                <Text dimColor>  {age}</Text>
              </Box>
              {isCursor && (
                <>
                  {m.decision.reasoning && (
                    <Box paddingLeft={4}>
                      <Text dimColor>why: {m.decision.reasoning}</Text>
                    </Box>
                  )}
                  <Box paddingLeft={4}>
                    <Text color={SOURCE_COLOR[src.type] ?? 'gray'}>
                      [{src.type}]
                    </Text>
                    <Text dimColor> {sourceLabel(src)}</Text>
                  </Box>
                </>
              )}
            </Box>
          )
        })}

        {filtered.length > visibleCount && (
          <Box marginTop={1}>
            <Text dimColor>
              {scrollOffset + 1}–{Math.min(scrollOffset + visibleCount, filtered.length)} of {filtered.length}
            </Text>
          </Box>
        )}
      </Box>

      {/* Search bar */}
      {showSearchBar && (
        <Box paddingX={3} paddingBottom={1}>
          <Text color="cyan">/ </Text>
          <Text>{search}</Text>
          {searchMode && <Text color="cyan">█</Text>}
          {!searchMode && search && (
            <Text dimColor>  {filtered.length} result{filtered.length !== 1 ? 's' : ''}  esc to clear</Text>
          )}
        </Box>
      )}
    </Box>
  )
}
