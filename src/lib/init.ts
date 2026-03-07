import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const PM_DIR = join(process.cwd(), '.pm')
const DATA_FILE = join(PM_DIR, 'data.json')
const CLAUDE_MD = join(process.cwd(), 'CLAUDE.md')
const PM_MARKER = '<!-- PM:INSTRUCTIONS:START -->'
const PERM_RULE = 'Bash(pm *)'

export interface ProjectStatus {
  hasDataFile: boolean
  hasClaudeMd: boolean
  hasPmSection: boolean
  projectDir: string
}

export function detectProjectStatus(): ProjectStatus {
  const hasDataFile = existsSync(DATA_FILE)
  const hasClaudeMd = existsSync(CLAUDE_MD)
  const hasPmSection = hasClaudeMd
    ? readFileSync(CLAUDE_MD, 'utf-8').includes(PM_MARKER)
    : false

  return {
    hasDataFile,
    hasClaudeMd,
    hasPmSection,
    projectDir: process.cwd(),
  }
}

export function isInitialized(): boolean {
  return existsSync(DATA_FILE)
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
