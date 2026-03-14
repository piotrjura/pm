import { loadConfig, saveConfig } from '../lib/config.js'
import { ensureHooks } from '../lib/hooks.js'
import { ensureOpenCodePlugin } from '../lib/opencode.js'
import { ensureClaudePermission } from '../lib/init.js'

export async function cmdSettings() {
  if (!process.stdin.isTTY) {
    // Non-TTY: dump config as JSON
    const config = loadConfig()
    console.log(JSON.stringify(config, null, 2))
    return
  }

  const { render } = await import('ink')
  const { createElement } = await import('react')
  const { SettingsScreen } = await import('../components/settings-screen.js')
  const { waitUntilExit } = render(createElement(SettingsScreen, {
    onSave: (config) => {
      const cwd = process.cwd()
      saveConfig(config, cwd)
      // If an agent was toggled ON, run its setup
      if (config.agents.includes('claude-code')) {
        ensureClaudePermission()
        ensureHooks(cwd)
      }
      if (config.agents.includes('opencode')) {
        ensureOpenCodePlugin(cwd)
      }
    },
  }))
  await waitUntilExit()
}
