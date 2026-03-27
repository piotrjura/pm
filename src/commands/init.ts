import { loadStore } from '../lib/store.js'
import { ensureClaudePermission } from '../lib/init.js'
import { ensureHooks } from '../lib/hooks.js'
import { loadConfig, saveConfig } from '../lib/config.js'
import { hasFlag } from '../lib/args.js'
import type { Config } from '../lib/types.js'

export function cmdInit(args: string[] = []) {
  const cwd = process.cwd()
  const force = hasFlag(args, '--force')

  // Data store
  loadStore()

  // Claude Code hooks + permissions
  const permResult = ensureClaudePermission()
  const hookResult = ensureHooks(cwd, force)

  // Config
  const existingConfig = force ? loadConfig(cwd) : { planning: 'medium' as const, questions: 'medium' as const }
  const config: Config = {
    planning: existingConfig.planning ?? 'medium',
    questions: existingConfig.questions ?? 'medium',
  }
  saveConfig(config, cwd)

  console.log(`${force ? 'Reinitialized' : 'Initialized'} pm in ${cwd}`)
  console.log()
  console.log('Setup:')
  console.log(`  \u2713 .pm/data.json       ${force ? 'ok' : 'created'}`)
  console.log(`  \u2713 claude-code         ${permResult === 'added' ? 'permissions added' : 'permissions ok'}, hooks ${hookResult}`)
  console.log(`  \u2713 config              planning=${config.planning}, questions=${config.questions}`)

  if (!force) {
    console.log()
    console.log('Next steps:')
    console.log('  pm add-feature "My feature" --description "..."')
    console.log('  pm next')
  }
}
