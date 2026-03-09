import { loadStore } from '../lib/store.js'
import { ensureClaudePermission } from '../lib/init.js'
import { ensureHooks } from '../lib/hooks.js'

function cmdInitNonInteractive() {
  const cwd = process.cwd()
  // Step 1: Permissions
  const permResult = ensureClaudePermission()
  // Step 2: Hooks
  const hookResult = ensureHooks(cwd)
  // Step 3: Data store
  loadStore()

  console.log(`Initialized pm in ${cwd}`)
  console.log()
  console.log('Setup:')
  console.log(`  \u2713 permissions          ${permResult === 'added' ? 'added "Bash(pm *)"' : 'already allows "Bash(pm *)"'}`)
  console.log(`  \u2713 hooks                ${hookResult === 'exists' ? 'already configured' : hookResult === 'added' ? 'added to .claude/settings.json' : 'updated in .claude/settings.json'}`)
  console.log(`  \u2713 .pm/data.json       created`)
  console.log()
  console.log('Hooks:')
  console.log('  PreToolUse (Edit|Write) — blocks edits without active task/issue')
  console.log('  UserPromptSubmit        — injects active task context')
  console.log()
  console.log('Next steps:')
  console.log('  pm add-feature "My feature" --description "..."')
  console.log('  pm next')
}

export async function cmdInit() {
  // Interactive TUI wizard when running in a terminal
  if (process.stdin.isTTY) {
    const { render } = await import('ink')
    const { createElement } = await import('react')
    const { InitWizard } = await import('../components/init-wizard.js')
    const { waitUntilExit } = render(createElement(InitWizard))
    await waitUntilExit()
    return
  }

  // Non-interactive fallback (CI, tests, piped stdin)
  cmdInitNonInteractive()
}
