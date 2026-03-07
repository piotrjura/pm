import React, { useState, useCallback, useEffect } from 'react'
import { Box, useApp, useInput, useStdout } from 'ink'
import { StatusBar } from './components/status-bar.js'
import { UnifiedList } from './components/unified-list.js'
import { FeatureDetail } from './components/feature-detail.js'
import { IssueDetail } from './components/issue-detail.js'
import { InitScreen } from './components/init-screen.js'
import { useNavigation } from './hooks/use-navigation.js'
import { useStore } from './hooks/use-store.js'
import { detectProjectStatus, isInitialized, ensureClaudePermission } from './lib/init.js'
import { loadStore } from './lib/store.js'
import { updateClaudeMd } from './lib/claude-md.js'

export function App() {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const [dims, setDims] = useState({ rows: stdout?.rows ?? 24, cols: stdout?.columns ?? 80 })
  const { rows, cols } = dims

  useEffect(() => {
    if (!stdout) return
    const onResize = () => setDims({ rows: stdout.rows, cols: stdout.columns })
    stdout.on('resize', onResize)
    return () => { stdout.off('resize', onResize) }
  }, [stdout])

  const [initialized, setInitialized] = useState(() => isInitialized())
  const [projectStatus] = useState(() => detectProjectStatus())

  const nav = useNavigation()
  const store = useStore()

  useEffect(() => {
    if (initialized) updateClaudeMd()
  }, [initialized])

  const handleInit = useCallback(() => {
    loadStore()
    updateClaudeMd()
    ensureClaudePermission()
    setInitialized(true)
    store.refresh()
  }, [store])

  useInput((input, key) => {
    if (!initialized) return
    if (input === 'q') { exit(); return }
    if (key.escape) { nav.goBack(); return }
  })

  if (!initialized) {
    return (
      <InitScreen
        status={projectStatus}
        onConfirm={handleInit}
        onQuit={() => exit()}
      />
    )
  }

  const bodyHeight = rows - 1

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      <Box flexGrow={1} height={bodyHeight}>
        {nav.screen.type === 'list' ? (
          <UnifiedList
            features={store.store.features}
            issues={store.store.issues}
            height={bodyHeight}
            width={cols}
            featureProgress={store.featureProgress}
            onSelectFeature={(id, state) => nav.openFeature(id, state)}
            onSelectIssue={(id, state) => nav.openIssue(id, state)}
            initialCursor={nav.listState.cursor}
            initialPage={nav.listState.page}
            initialSearch={nav.listState.search}
            onAddFeature={(type) => store.createFeature('New ' + type, type)}
            onDeleteFeature={(id) => store.removeFeature(id)}
            onAddIssue={(title) => store.createIssue(title)}
            onDeleteIssue={(id) => store.removeIssue(id)}
          />
        ) : nav.screen.type === 'feature-detail' ? (
          (() => {
            const s = nav.screen as { type: 'feature-detail'; featureId: string }
            const feature = store.store.features.find(f => f.id === s.featureId)
            if (!feature) { nav.goBack(); return null }
            return (
              <FeatureDetail
                feature={feature}
                height={bodyHeight}
                focused={true}
                onBack={nav.goBack}
              />
            )
          })()
        ) : (
          (() => {
            const issue = store.store.issues.find(i => i.id === (nav.screen as { issueId: string }).issueId)
            if (!issue) { nav.goBack(); return null }
            return (
              <IssueDetail
                issue={issue}
                height={bodyHeight}
                onBack={nav.goBack}
              />
            )
          })()
        )}
      </Box>
      <StatusBar screen={nav.screen} width={cols} />
    </Box>
  )
}
