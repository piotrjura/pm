import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { Box, useApp, useInput, useStdout } from 'ink'
import path from 'node:path'
import { StatusBar } from './components/status-bar.js'
import { UnifiedList } from './components/unified-list.js'
import { FeatureDetail } from './components/feature-detail.js'
import { IssueDetail } from './components/issue-detail.js'
import { DecisionsList } from './components/decisions-list.js'
import { SettingsScreen } from './components/settings-screen.js'
import { InitScreen } from './components/init-screen.js'
import { UpgradeScreen } from './components/upgrade-screen.js'
import { useNavigation } from './hooks/use-navigation.js'
import { useStore } from './hooks/use-store.js'
import { detectProjectStatus, isInitialized, ensureClaudePermission, detectUpgrade } from './lib/init.js'
import type { UpgradeInfo } from './lib/init.js'
import { loadStore, removeDecision } from './lib/store.js'
import type { DecisionMatch } from './lib/store.js'
import { ensureHooks, hasClaudeHooks } from './lib/hooks.js'
import { ensureOpenCodePlugin, hasOpenCodePlugin } from './lib/opencode.js'
import { loadConfig, saveConfig } from './lib/config.js'
import type { AgentUpgrade } from './lib/init.js'

function setTerminalTitle(title: string) {
  process.stdout.write(`\x1b]2;${title}\x07`)
}

const projectName = path.basename(process.cwd())

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
  const [config, setConfig] = useState(() => loadConfig())
  const [upgradeInfo, setUpgradeInfo] = useState<UpgradeInfo | null>(() => {
    if (!isInitialized()) return null
    const upgrade = detectUpgrade()
    if (!upgrade) return null
    // Perform the upgrade — update all configured agents
    const cwd = process.cwd()
    const agents: AgentUpgrade[] = []

    if (hasClaudeHooks(cwd)) {
      ensureClaudePermission()
      const r = ensureHooks(cwd)
      agents.push({ name: 'Claude Code', result: r === 'exists' ? 'exists' : 'updated' })
    }

    if (hasOpenCodePlugin(cwd)) {
      const r = ensureOpenCodePlugin(cwd)
      agents.push({ name: 'OpenCode', result: r === 'exists' ? 'exists' : 'updated' })
    }

    // loadStore will stamp the new version
    loadStore()
    return { ...upgrade, agents }
  })

  const nav = useNavigation()
  const store = useStore()

  const decisionsEnabled = config.decisions

  const handleInit = useCallback(() => {
    const cwd = process.cwd()
    loadStore()
    ensureClaudePermission()
    ensureHooks(cwd)
    setInitialized(true)
    setConfig(loadConfig())
    store.refresh()
  }, [store])

  const handleSettingsSave = useCallback((newConfig: typeof config) => {
    const cwd = process.cwd()
    saveConfig(newConfig, cwd)
    if (newConfig.agents.includes('claude-code')) {
      ensureClaudePermission()
      ensureHooks(cwd)
    }
    if (newConfig.agents.includes('opencode')) {
      ensureOpenCodePlugin(cwd)
    }
    setConfig(newConfig)
  }, [])

  // Update terminal tab title based on current view
  useEffect(() => {
    if (!initialized) return
    if (nav.screen.type === 'feature-detail') {
      const feature = store.store.features.find(f => f.id === (nav.screen as { featureId: string }).featureId)
      setTerminalTitle(`pm — ${projectName} — ${feature?.title ?? 'Feature'}`)
    } else if (nav.screen.type === 'issue-detail') {
      const issue = store.store.issues.find(i => i.id === (nav.screen as { issueId: string }).issueId)
      setTerminalTitle(`pm — ${projectName} — ${issue?.title ?? 'Issue'}`)
    } else if (nav.screen.type === 'decisions') {
      setTerminalTitle(`pm — ${projectName} — Decisions`)
    } else if (nav.screen.type === 'settings') {
      setTerminalTitle(`pm — ${projectName} — Settings`)
    } else {
      setTerminalTitle(`pm — ${projectName}`)
    }
  }, [initialized, nav.screen, store.store.features, store.store.issues])

  // Restore title on unmount
  useEffect(() => {
    return () => { setTerminalTitle('') }
  }, [])

  // Collect all decisions from store for the decisions screen
  const allDecisions = useMemo<DecisionMatch[]>(() => {
    if (!decisionsEnabled) return []
    const matches: DecisionMatch[] = []
    for (const feature of store.store.features) {
      for (const d of feature.decisions ?? []) {
        matches.push({ decision: d, source: { type: 'feature', featureId: feature.id, featureTitle: feature.title } })
      }
      for (const phase of feature.phases) {
        for (const task of phase.tasks) {
          for (const d of task.decisions ?? []) {
            matches.push({ decision: d, source: { type: 'task', featureId: feature.id, featureTitle: feature.title, taskId: task.id, taskTitle: task.title } })
          }
        }
      }
    }
    for (const issue of store.store.issues) {
      for (const d of issue.decisions ?? []) {
        matches.push({ decision: d, source: { type: 'issue', issueId: issue.id, issueTitle: issue.title } })
      }
    }
    matches.sort((a, b) => b.decision.at.localeCompare(a.decision.at))
    return matches
  }, [store.store.features, store.store.issues, decisionsEnabled])

  useInput((input, key) => {
    if (!initialized) return
    // Don't handle global keys when on settings screen (it handles its own input)
    if (nav.screen.type === 'settings') return
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

  if (upgradeInfo) {
    return (
      <UpgradeScreen
        info={upgradeInfo}
        onContinue={() => { setUpgradeInfo(null); store.refresh() }}
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
            onOpenDecisions={decisionsEnabled ? () => nav.openDecisions() : undefined}
            onOpenSettings={() => nav.openSettings()}
            initialCursor={nav.listState.cursor}
            initialPage={nav.listState.page}
            initialSearch={nav.listState.search}
            onAddFeature={(type) => store.createFeature('New ' + type, type)}
            onDeleteFeature={(id) => store.removeFeature(id)}
            onAddIssue={(title) => store.createIssue(title)}
            onDeleteIssue={(id) => store.removeIssue(id)}
            decisionsEnabled={decisionsEnabled}
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
                width={cols}
                focused={true}
                onBack={nav.goBack}
              />
            )
          })()
        ) : nav.screen.type === 'issue-detail' ? (
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
        ) : nav.screen.type === 'decisions' ? (
          <DecisionsList
            decisions={allDecisions}
            height={bodyHeight}
            onBack={nav.goBack}
            onDelete={(text) => { removeDecision(text); store.refresh() }}
          />
        ) : nav.screen.type === 'settings' ? (
          <SettingsScreen
            inline={true}
            onSave={handleSettingsSave}
            onDone={(saved) => {
              if (saved) store.refresh()
              nav.goBack()
            }}
          />
        ) : null}
      </Box>
      <StatusBar screen={nav.screen} width={cols} decisionsEnabled={decisionsEnabled} />
    </Box>
  )
}
