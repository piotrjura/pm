import { loadStore } from '../lib/store.js'
import { updateClaudeMd } from '../lib/claude-md.js'
import { ensureClaudePermission } from '../lib/init.js'

function cmdInitNonInteractive() {
  // Step 1: CLAUDE.md
  updateClaudeMd()
  // Step 2: Permissions
  const permResult = ensureClaudePermission()
  // Step 3: Data store
  loadStore()

  console.log(`Initialized pm in ${process.cwd()}`)
  console.log()
  console.log('Setup:')
  console.log(`  \u2713 CLAUDE.md            updated with pm instructions`)
  console.log(`  \u2713 permissions          ${permResult === 'added' ? 'added "Bash(pm *)"' : 'already allows "Bash(pm *)"'}`)
  console.log(`  \u2713 .pm/data.json       created`)
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
