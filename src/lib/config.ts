import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Config } from './types.js'

const CONFIG_FILE = (cwd: string) => join(cwd, '.pm', 'config.json')

export function defaultConfig(): Config {
  return { decisions: true, agents: ['claude-code'] }
}

/** Load config from .pm/config.json, merging with defaults for missing keys. */
export function loadConfig(cwd = process.cwd()): Config {
  const defaults = defaultConfig()
  const path = CONFIG_FILE(cwd)
  if (!existsSync(path)) {
    // Lazy init: persist defaults if .pm/ dir already exists
    const pmDir = join(cwd, '.pm')
    if (existsSync(pmDir)) {
      writeFileSync(path, JSON.stringify(defaults, null, 2) + '\n')
    }
    return defaults
  }

  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    return {
      decisions: typeof raw.decisions === 'boolean' ? raw.decisions : defaults.decisions,
      agents: Array.isArray(raw.agents) ? raw.agents : defaults.agents,
    }
  } catch {
    return defaults
  }
}

/** Write config to .pm/config.json. */
export function saveConfig(config: Config, cwd = process.cwd()): void {
  const pmDir = join(cwd, '.pm')
  if (!existsSync(pmDir)) mkdirSync(pmDir, { recursive: true })
  writeFileSync(CONFIG_FILE(cwd), JSON.stringify(config, null, 2) + '\n')
}

/** Convenience: check if decisions are enabled. */
export function isDecisionsEnabled(cwd = process.cwd()): boolean {
  return loadConfig(cwd).decisions
}
