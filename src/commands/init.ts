import { loadStore } from '../lib/store.js'
import { ensureClaudePermission } from '../lib/init.js'
import { ensureHooks, hasClaudeHooks } from '../lib/hooks.js'
import { ensureOpenCodePlugin, hasOpenCodePlugin } from '../lib/opencode.js'
import { hasFlag } from '../lib/args.js'

function cmdInitNonInteractive(args: string[]) {
  const cwd = process.cwd()
  const force = hasFlag(args, '--force')
  const explicitClaudeCode = hasFlag(args, '--claude-code')
  const explicitOpenCode = hasFlag(args, '--opencode')
  const hasExplicitAgent = explicitClaudeCode || explicitOpenCode

  // When --force without explicit agent flags, auto-detect configured agents
  const setupClaudeCode = hasExplicitAgent ? (!explicitOpenCode || explicitClaudeCode) : (force ? hasClaudeHooks(cwd) || true : true)
  const setupOpenCode = explicitOpenCode || (force && !hasExplicitAgent && hasOpenCodePlugin(cwd))

  // Step 1: Data store (always)
  loadStore()

  // Step 2: Claude Code
  let permResult: 'added' | 'exists' | undefined
  let hookResult: 'added' | 'updated' | 'exists' | undefined

  if (setupClaudeCode) {
    permResult = ensureClaudePermission()
    hookResult = ensureHooks(cwd, force)
  }

  // Step 3: OpenCode
  let pluginResult: 'added' | 'updated' | 'exists' | undefined
  if (setupOpenCode) {
    pluginResult = ensureOpenCodePlugin(cwd, force)
  }

  console.log(`${force ? 'Reinitialized' : 'Initialized'} pm in ${cwd}`)
  console.log()
  console.log('Setup:')
  console.log(`  \u2713 .pm/data.json       ${force ? 'ok' : 'created'}`)

  if (setupClaudeCode) {
    console.log(`  \u2713 claude-code         ${permResult === 'added' ? 'permissions added' : 'permissions ok'}, hooks ${hookResult}`)
  }

  if (setupOpenCode) {
    console.log(`  \u2713 opencode            plugin ${pluginResult}`)
  }

  console.log()
  if (!force) {
    console.log('Next steps:')
    console.log('  pm add-feature "My feature" --description "..."')
    console.log('  pm next')
  }
}

export async function cmdInit(args: string[] = []) {
  const force = hasFlag(args, '--force')

  // --force skips the wizard — direct non-interactive overwrite
  if (force) {
    cmdInitNonInteractive(args)
    return
  }

  // Interactive TUI wizard when running in a terminal
  if (process.stdin.isTTY && !hasFlag(args, '--opencode') && !hasFlag(args, '--claude-code')) {
    const { render } = await import('ink')
    const { createElement } = await import('react')
    const { InitWizard } = await import('../components/init-wizard.js')
    const { waitUntilExit } = render(createElement(InitWizard))
    await waitUntilExit()
    return
  }

  // Non-interactive (CI, tests, piped stdin, or explicit flags)
  cmdInitNonInteractive(args)
}
