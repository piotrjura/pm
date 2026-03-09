import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { PM_VERSION } from './version.js'

const PM_DIR = join(process.cwd(), '.pm')
const DATA_FILE = join(PM_DIR, 'data.json')
const PERM_RULE = 'Bash(pm *)'

export interface ProjectStatus {
  hasDataFile: boolean
  projectDir: string
}

export interface UpgradeInfo {
  fromVersion: string
  toVersion: string
  updatedHooks: boolean
}

export function detectProjectStatus(): ProjectStatus {
  return {
    hasDataFile: existsSync(DATA_FILE),
    projectDir: process.cwd(),
  }
}

export function isInitialized(): boolean {
  return existsSync(DATA_FILE)
}

/** Check if the stored version differs from the running version. Returns upgrade info or null. */
export function detectUpgrade(): { fromVersion: string; toVersion: string } | null {
  if (!existsSync(DATA_FILE)) return null
  try {
    const data = JSON.parse(readFileSync(DATA_FILE, 'utf-8'))
    const stored = data.pmVersion ?? '0.0.0'
    if (stored !== PM_VERSION) return { fromVersion: stored, toVersion: PM_VERSION }
  } catch {}
  return null
}

/** Add "Bash(pm *)" to ~/.claude/settings.json if not already present. Returns whether it was added. */
export function ensureClaudePermission(): 'added' | 'exists' {
  const claudeDir = join(homedir(), '.claude')
  const settingsPath = join(claudeDir, 'settings.json')

  if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true })

  let settings: Record<string, unknown> = {}
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) } catch {}
  }

  const perms = (settings.permissions ?? {}) as Record<string, unknown>
  const allow = Array.isArray(perms.allow) ? perms.allow as string[] : []

  if (allow.includes(PERM_RULE)) return 'exists'

  settings.permissions = { ...perms, allow: [...allow, PERM_RULE] }
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')
  return 'added'
}
