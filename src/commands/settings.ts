import { loadConfig, saveConfig } from '../lib/config.js'
import { ensureHooks } from '../lib/hooks.js'
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
      ensureClaudePermission()
      ensureHooks(cwd)
    },
  }))
  await waitUntilExit()
}
