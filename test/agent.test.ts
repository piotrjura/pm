import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTestDir, cleanupTestDir, pm, loadData, createFullFeature } from './helpers.js'

let cwd: string

beforeEach(() => { cwd = createTestDir() })
afterEach(() => { cleanupTestDir(cwd) })

describe('--agent flag', () => {
  it('start records agent on task via --agent flag', () => {
    pm('init', cwd)
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd, { agent: 'opencode' })

    const data = loadData(cwd)
    const task = data.features[0].phases[0].tasks[0]
    expect(task.agent).toBe('opencode')
    expect(task.status).toBe('in-progress')
  })

  it('done records agent on task via --agent flag', () => {
    pm('init', cwd)
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd, { agent: 'claude-code' })
    pm(`done ${taskId} --note "finished"`, cwd, { agent: 'claude-code' })

    const data = loadData(cwd)
    const task = data.features[0].phases[0].tasks[0]
    expect(task.agent).toBe('claude-code')
    expect(task.status).toBe('done')
  })

  it('agent recorded in log entries', () => {
    pm('init', cwd)
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd, { agent: 'opencode' })

    const data = loadData(cwd)
    const startEntry = data.log.find((e: { action: string }) => e.action === 'started')
    expect(startEntry.agent).toBe('opencode')
  })

  it('--agent flag passed directly in command works', () => {
    pm('init', cwd)
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId} --agent explicit-agent`, cwd)

    const data = loadData(cwd)
    const task = data.features[0].phases[0].tasks[0]
    expect(task.agent).toBe('explicit-agent')
  })

  it('issue tracks agent via --agent flag', () => {
    pm('init', cwd)
    const result = pm('add-issue "Fix bug"', cwd)
    const issueId = result.stdout.match(/^issue:(\S+)/m)![1]

    pm(`start ${issueId}`, cwd, { agent: 'opencode' })

    const data = loadData(cwd)
    const issue = data.issues[0]
    expect(issue.agent).toBe('opencode')
    expect(issue.status).toBe('in-progress')
  })

  it('done on issue preserves agent', () => {
    pm('init', cwd)
    const result = pm('add-issue "Fix bug"', cwd)
    const issueId = result.stdout.match(/^issue:(\S+)/m)![1]

    pm(`done ${issueId} --note "fixed"`, cwd, { agent: 'claude-code' })

    const data = loadData(cwd)
    const issue = data.issues[0]
    expect(issue.agent).toBe('claude-code')
    expect(issue.status).toBe('done')
  })

  it('different agents can work on different tasks', () => {
    pm('init', cwd)
    const feat = pm('add-feature "Multi-agent work"', cwd)
    const featureId = feat.stdout.match(/^feature:(\S+)/m)![1]

    const phase = pm(`add-phase ${featureId} Phase-1`, cwd)
    const phaseId = phase.stdout.match(/^phase:(\S+)/m)![1]

    const task1 = pm(`add-task ${featureId} ${phaseId} "Task for Claude"`, cwd)
    const task1Id = task1.stdout.match(/^task:(\S+)/m)![1]

    const task2 = pm(`add-task ${featureId} ${phaseId} "Task for OpenCode"`, cwd)
    const task2Id = task2.stdout.match(/^task:(\S+)/m)![1]

    // Claude starts task 1
    pm(`start ${task1Id}`, cwd, { agent: 'claude-code' })
    pm(`done ${task1Id} --note "done by claude"`, cwd, { agent: 'claude-code' })

    // OpenCode starts task 2
    pm(`start ${task2Id}`, cwd, { agent: 'opencode' })
    pm(`done ${task2Id} --note "done by opencode"`, cwd, { agent: 'opencode' })

    const data = loadData(cwd)
    const tasks = data.features[0].phases[0].tasks
    expect(tasks[0].agent).toBe('claude-code')
    expect(tasks[1].agent).toBe('opencode')

    // Check log has both agents
    const logAgents = data.log.map((e: { agent?: string }) => e.agent)
    expect(logAgents).toContain('claude-code')
    expect(logAgents).toContain('opencode')
  })

  it('log command shows agent labels', () => {
    pm('init', cwd)
    const { taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd, { agent: 'opencode' })
    pm(`done ${taskId} --note "done"`, cwd, { agent: 'opencode' })

    const result = pm('log', cwd)
    expect(result.stdout).toContain('[opencode]')
  })

  it('show command shows agent in task metadata', () => {
    pm('init', cwd)
    const { featureId, taskId } = createFullFeature(cwd)
    pm(`start ${taskId}`, cwd, { agent: 'claude-code' })
    pm(`done ${taskId} --note "done"`, cwd, { agent: 'claude-code' })

    const result = pm(`show ${featureId}`, cwd)
    expect(result.stdout).toContain('claude-code')
  })
})

describe('pm init --opencode', () => {
  it('creates OpenCode plugin file', () => {
    pm('init --opencode', cwd)
    const pluginPath = join(cwd, '.opencode', 'plugins', 'pm.ts')
    expect(existsSync(pluginPath)).toBe(true)

    const content = readFileSync(pluginPath, 'utf-8')
    expect(content).toContain('PmPlugin')
    expect(content).toContain('agent = "opencode"')
    expect(content).toContain('tool.execute.before')
    expect(content).toContain('tool.execute.after')
    expect(content).toContain('tui.prompt.append')
  })

  it('creates opencode.json with plugin registered', () => {
    pm('init --opencode', cwd)
    const configPath = join(cwd, 'opencode.json')
    expect(existsSync(configPath)).toBe(true)

    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(config.plugin).toContain('./.opencode/plugins/pm.ts')
  })

  it('preserves existing opencode.json fields', () => {
    const configPath = join(cwd, 'opencode.json')
    writeFileSync(configPath, JSON.stringify({ theme: 'dark', plugin: ['./other-plugin.ts'] }, null, 2))

    pm('init --opencode', cwd)

    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(config.theme).toBe('dark')
    expect(config.plugin).toContain('./other-plugin.ts')
    expect(config.plugin).toContain('./.opencode/plugins/pm.ts')
  })

  it('does not duplicate plugin entry on re-init', () => {
    pm('init --opencode', cwd)
    pm('init --opencode', cwd)

    const configPath = join(cwd, 'opencode.json')
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    const pmEntries = config.plugin.filter((p: string) => p === './.opencode/plugins/pm.ts')
    expect(pmEntries.length).toBe(1)
  })

  it('--opencode alone does not set up Claude Code', () => {
    pm('init --opencode', cwd)

    // Claude Code hooks should NOT be set up with --opencode alone
    const settingsPath = join(cwd, '.claude', 'settings.json')
    expect(existsSync(settingsPath)).toBe(false)
  })

  it('--opencode --claude-code sets up both', () => {
    pm('init --opencode --claude-code', cwd)

    // Both should be configured
    expect(existsSync(join(cwd, '.opencode', 'plugins', 'pm.ts'))).toBe(true)
    const settingsPath = join(cwd, '.claude', 'settings.json')
    expect(existsSync(settingsPath)).toBe(true)
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    expect(settings.hooks).toBeDefined()
  })

  it('init --opencode is idempotent', () => {
    pm('init --opencode', cwd)
    const first = readFileSync(join(cwd, '.opencode', 'plugins', 'pm.ts'), 'utf-8')

    pm('init --opencode', cwd)
    const second = readFileSync(join(cwd, '.opencode', 'plugins', 'pm.ts'), 'utf-8')

    expect(first).toBe(second)
  })

  it('data store is always created', () => {
    pm('init --opencode', cwd)
    expect(existsSync(join(cwd, '.pm', 'data.json'))).toBe(true)
  })
})

describe('Claude Code hooks pass agent identity', () => {
  it('hooks include --agent claude-code in commands', () => {
    pm('init', cwd)
    const settingsPath = join(cwd, '.claude', 'settings.json')
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))

    const preToolHook = settings.hooks.PreToolUse[0].hooks[0].command
    expect(preToolHook).toContain('--agent claude-code')
    expect(preToolHook).toContain('--instance $PPID')

    const promptHook = settings.hooks.UserPromptSubmit[0].hooks[0].command
    expect(promptHook).toContain('--agent claude-code')
  })
})
