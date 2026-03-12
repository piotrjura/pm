import React, { useState, useMemo } from 'react'
import { Box, Text, useInput } from 'ink'
import Spinner from 'ink-spinner'
import type { Feature, Issue } from '../lib/types.js'
import { relativeDate, progressBar, truncate, PRIORITY_COLOR, shortModel } from '../lib/format.js'

const PAGE_SIZE = 20

type ListItem =
  | { kind: 'feature'; feature: Feature }
  | { kind: 'issue'; issue: Issue }

function itemDate(item: ListItem): string {
  return item.kind === 'feature' ? item.feature.updatedAt : item.issue.createdAt
}

function matchesSearch(item: ListItem, query: string): boolean {
  const q = query.toLowerCase()
  if (item.kind === 'feature') {
    const f = item.feature
    if (f.title.toLowerCase().includes(q)) return true
    if (f.description?.toLowerCase().includes(q)) return true
    for (const phase of f.phases) {
      for (const task of phase.tasks) {
        if (task.title.toLowerCase().includes(q)) return true
        if (task.description?.toLowerCase().includes(q)) return true
        if (task.note?.toLowerCase().includes(q)) return true
      }
    }
    return false
  } else {
    const i = item.issue
    return i.title.toLowerCase().includes(q) || (i.description?.toLowerCase().includes(q) ?? false)
  }
}


interface UnifiedListProps {
  features: Feature[]
  issues: Issue[]
  height: number
  width: number
  featureProgress: (f: Feature) => { done: number; total: number }
  onSelectFeature: (id: string, state: { cursor: number; page: number; search: string }) => void
  onSelectIssue: (id: string, state: { cursor: number; page: number; search: string }) => void
  onAddFeature: (type: 'feature' | 'fix') => void
  onDeleteFeature: (id: string) => void
  onAddIssue: (title: string) => void
  onOpenDecisions: () => void
  onDeleteIssue: (id: string) => void
  initialCursor?: number
  initialPage?: number
  initialSearch?: string
}

export function UnifiedList({
  features,
  issues,
  height,
  width,
  featureProgress,
  onSelectFeature,
  onSelectIssue,
  onOpenDecisions,
  onDeleteFeature,
  onDeleteIssue,
  initialCursor = 0,
  initialPage = 0,
  initialSearch = '',
}: UnifiedListProps) {
  const [cursor, setCursor] = useState(initialCursor)
  const [page, setPage] = useState(initialPage)
  const [search, setSearch] = useState(initialSearch)
  const [searchMode, setSearchMode] = useState(false)

  const allItems: ListItem[] = useMemo(() => {
    const items: ListItem[] = [
      ...features.map(f => ({ kind: 'feature' as const, feature: f })),
      ...issues.map(i => ({ kind: 'issue' as const, issue: i })),
    ]
    return items.sort((a, b) => itemDate(b).localeCompare(itemDate(a)))
  }, [features, issues])

  const filteredItems = useMemo(() => {
    if (!search) return allItems
    return allItems.filter(item => matchesSearch(item, search))
  }, [allItems, search])

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const clampedPage = Math.min(page, totalPages - 1)
  const pageItems = filteredItems.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE)
  const clamp = (c: number) => Math.max(0, Math.min(pageItems.length - 1, c))

  useInput((input, key) => {
    if (searchMode) {
      if (key.escape) {
        setSearch('')
        setSearchMode(false)
      } else if (key.backspace || key.delete) {
        setSearch(s => s.slice(0, -1))
      } else if (key.return) {
        setSearchMode(false)
      } else if (input && !key.ctrl && !key.meta) {
        setSearch(s => s + input)
        setPage(0)
        setCursor(0)
      }
      return
    }
    if (key.upArrow) setCursor(c => clamp(c - 1))
    else if (key.downArrow) setCursor(c => clamp(c + 1))
    else if (input === '[' || key.pageUp) { setPage(p => Math.max(0, p - 1)); setCursor(0) }
    else if (input === ']' || key.pageDown) { setPage(p => Math.min(totalPages - 1, p + 1)); setCursor(0) }
    else if (input === '/') { setSearchMode(true) }
    else if (key.escape && search) { setSearch(''); setPage(0); setCursor(0) }
    else if (key.return && pageItems.length > 0) {
      const item = pageItems[cursor]
      const state = { cursor, page: clampedPage, search }
      if (item?.kind === 'feature') onSelectFeature(item.feature.id, state)
      else if (item?.kind === 'issue') onSelectIssue(item.issue.id, state)
    }
    else if (input === 'w') { onOpenDecisions() }
    else if (input === 'd' && pageItems.length > 0) {
      const item = pageItems[cursor]
      if (item?.kind === 'feature') {
        onDeleteFeature(item.feature.id)
        setCursor(c => clamp(c))
      } else if (item?.kind === 'issue') {
        onDeleteIssue(item.issue.id)
        setCursor(c => clamp(c))
      }
    }
  })

  // Available width for title text: total width minus padding(6) + cursor(2) + tag(9) + spaces(2) + icon(1)
  const titleWidth = width - 20

  const activeCount = features.filter(f => f.status === 'in-progress').length
  const doneCount = features.filter(f => f.status === 'done').length
  const doneIssues = issues.filter(i => i.status === 'done').length
  const openIssues = issues.filter(i => i.status !== 'done').length
  const totalIssues = issues.length
  const totalDecisions = features.reduce((sum, f) => {
    return sum + (f.decisions?.length ?? 0) +
      f.phases.reduce((s, p) => s + p.tasks.reduce((t, task) => t + (task.decisions?.length ?? 0), 0), 0)
  }, 0) + issues.reduce((sum, i) => sum + (i.decisions?.length ?? 0), 0)
  const showSearchBar = searchMode || !!search

  return (
    <Box flexDirection="column" width="100%" height={height}>
      <Box flexDirection="column" paddingX={3} paddingY={1} flexGrow={1} overflow="hidden">
        {/* Header */}
        <Box marginBottom={1} gap={2}>
          <Text bold color="cyan">pm</Text>
          <Text dimColor>
            {activeCount > 0 ? <Text color="yellow">{activeCount} active  </Text> : ''}
            {doneCount}/{features.length} features
            {totalIssues > 0 ? (
              openIssues > 0
                ? <Text>  {doneIssues}/{totalIssues} changes <Text color="red">({openIssues} open)</Text></Text>
                : <Text>  {doneIssues}/{totalIssues} changes</Text>
            ) : ''}
            {totalDecisions > 0 && (
              <Text color="magenta">  {totalDecisions} decisions</Text>
            )}
          </Text>
          {totalPages > 1 && (
            <Text dimColor>  pg {clampedPage + 1}/{totalPages}</Text>
          )}
        </Box>

        {allItems.length === 0 && (
          <Box flexDirection="column" gap={1}>
            <Text dimColor>Nothing tracked yet.</Text>
            <Text dimColor>  pm add-feature "title"   — new feature</Text>
            <Text dimColor>  pm add-feature "title" --fix  — bug fix</Text>
            <Text dimColor>  pm add-issue "title"     — issue</Text>
          </Box>
        )}

        {filteredItems.length === 0 && search && (
          <Text dimColor>No results for "{search}"</Text>
        )}

        {pageItems.map((item, i) => {
          const isCursor = i === cursor

          // Column layout (all item types share the same fixed columns):
          // col 0: cursor indicator (1 char)
          // col 1: space (1 char)
          // col 2-10: type tag padded to 9 chars — [feat]   , [fix]    , [change]
          // col 11: space (1 char)
          // col 12: status icon (1 char) — ✓ ○ spinner !
          // col 13: space (1 char)
          // col 14+: title
          // progress row indent = 14 (cursor + space + tag(9) + space + icon + space)

          if (item.kind === 'feature') {
            const f = item.feature
            const prog = featureProgress(f)
            const isActive = f.status === 'in-progress'
            const isDone = f.status === 'done'
            const typeColor = f.type === 'fix' ? 'red' : 'blue'
            const typeLabel = (f.type === 'fix' ? '[fix]' : '[feat]').padEnd(9)
            const decisionCount = (f.decisions?.length ?? 0) +
              f.phases.reduce((sum, p) => sum + p.tasks.reduce((s, t) => s + (t.decisions?.length ?? 0), 0), 0)
            const activeTask = isActive
              ? f.phases.flatMap(p => p.tasks).find(t => t.status === 'in-progress')
              : undefined

            // Fixed column widths (enforced by Box, not string padding):
            // col A: width=2  — cursor indicator + space
            // col B: width=9  — type tag [feat], [fix], [change]
            // col C: width=1  — space
            // col D: width=1  — status icon
            // col E: width=1  — space
            // col F: flexGrow — title (truncated)
            // progress row indent = 2+9+1+1+1 = 14

            return (
              <Box key={f.id} flexDirection="column">
                <Box>
                  <Box width={2}>
                    <Text color="cyan">{isCursor ? '›' : ' '}</Text>
                  </Box>
                  <Box width={9}>
                    <Text color={typeColor} dimColor={!isCursor}>[{f.type === 'fix' ? 'fix' : 'feat'}]</Text>
                  </Box>
                  <Box width={1}><Text> </Text></Box>
                  <Box width={1}>
                    {isActive ? (
                      <Text color="yellow"><Spinner type="dots" /></Text>
                    ) : (
                      <Text color={isDone ? 'green' : 'gray'}>{isDone ? '✓' : '○'}</Text>
                    )}
                  </Box>
                  <Box width={1}><Text> </Text></Box>
                  <Box flexGrow={1}>
                    <Text bold={isCursor} color={isDone ? 'gray' : isCursor ? 'white' : undefined} strikethrough={isDone} wrap="truncate">
                      {truncate(f.title + (isCursor ? '  ↵ open' : ''), titleWidth)}
                    </Text>
                  </Box>
                </Box>
                <Box paddingLeft={14}>
                  {prog.total > 0 ? (
                    <Text>
                      <Text color={isDone ? 'green' : isActive ? 'yellow' : 'gray'}>
                        {progressBar(prog.done, prog.total)}
                      </Text>
                      <Text dimColor>  {prog.done}/{prog.total}  </Text>
                      {isDone && f.doneAt
                        ? <Text dimColor>done {relativeDate(f.doneAt)}</Text>
                        : <Text dimColor>{relativeDate(f.updatedAt)}</Text>
                      }
                      {decisionCount > 0 && (
                        <Text color="magenta">  {decisionCount} decision{decisionCount !== 1 ? 's' : ''}</Text>
                      )}
                    </Text>
                  ) : (
                    <Text dimColor>no tasks  {relativeDate(f.updatedAt)}</Text>
                  )}
                </Box>
                {activeTask && (
                  <Box paddingLeft={14}>
                    <Text color="yellow"><Spinner type="dots" /></Text>
                    <Text color="yellow"> {truncate(activeTask.title, titleWidth - 2)}</Text>
                    {(activeTask.agent || activeTask.model) && (
                      <Text dimColor>  {[activeTask.agent, activeTask.model && shortModel(activeTask.model)].filter(Boolean).join('/')}</Text>
                    )}
                  </Box>
                )}
              </Box>
            )
          }

          // Issue
          const iss = item.issue
          const isIssueDone = iss.status === 'done'
          const prioColor = PRIORITY_COLOR[iss.priority]
          const issueType = iss.type ?? 'bug'
          const issueColor = issueType === 'change' ? 'cyan' : 'red'
          const issueDecisions = iss.decisions?.length ?? 0
          return (
            <Box key={iss.id} flexDirection="column">
              <Box>
                <Box width={2}>
                  <Text color="cyan">{isCursor ? '›' : ' '}</Text>
                </Box>
                <Box width={9}>
                  <Text color={issueColor} dimColor={!isCursor}>[{issueType}]</Text>
                </Box>
                <Box width={1}><Text> </Text></Box>
                <Box width={1}>
                  <Text color={isIssueDone ? 'green' : prioColor}>{isIssueDone ? '✓' : '!'}</Text>
                </Box>
                <Box width={1}><Text> </Text></Box>
                <Box flexGrow={1}>
                  <Text bold={isCursor} color={isIssueDone ? 'gray' : isCursor ? 'white' : undefined} strikethrough={isIssueDone} wrap="truncate">
                    {truncate(iss.title, titleWidth - iss.priority.length - relativeDate(iss.createdAt).length - (iss.agent ? iss.agent.length + 2 : 0) - (iss.model ? shortModel(iss.model).length + 1 : 0) - (issueDecisions > 0 ? 6 : 0) - 4)}
                  </Text>
                  <Text dimColor>  {iss.priority}</Text>
                  {(iss.agent || iss.model) && (
                    <Text dimColor>  {[iss.agent, iss.model && shortModel(iss.model)].filter(Boolean).join('/')}</Text>
                  )}
                  {issueDecisions > 0 && (
                    <Text color="magenta">  {issueDecisions}d</Text>
                  )}
                  <Text dimColor>  {relativeDate(iss.createdAt)}</Text>
                </Box>
              </Box>
            </Box>
          )
        })}
      </Box>

      {/* Search bar */}
      {showSearchBar && (
        <Box paddingX={3} paddingBottom={1}>
          <Text color="cyan">/ </Text>
          <Text>{search}</Text>
          {searchMode && <Text color="cyan">█</Text>}
          {!searchMode && search && (
            <Text dimColor>  {filteredItems.length} result{filteredItems.length !== 1 ? 's' : ''}  esc to clear</Text>
          )}
        </Box>
      )}
    </Box>
  )
}
