import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Config, PlanningLevel, QuestionsLevel } from './types.js'

const CONFIG_FILE = (cwd: string) => join(cwd, '.pm', 'config.json')

const PLANNING_VALUES: PlanningLevel[] = ['none', 'medium', 'all']
const QUESTIONS_VALUES: QuestionsLevel[] = ['none', 'medium', 'thorough']

export function defaultConfig(): Config {
  return { planning: 'medium', questions: 'medium' }
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

    // Migrate: old configs had `decisions: boolean` — drop it silently
    const planning = PLANNING_VALUES.includes(raw.planning) ? raw.planning : defaults.planning
    const questions = QUESTIONS_VALUES.includes(raw.questions) ? raw.questions : defaults.questions

    return {
      planning,
      questions,
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
