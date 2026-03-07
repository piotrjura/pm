import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const INSTRUCTIONS_START = '<!-- PM:INSTRUCTIONS:START -->'
const INSTRUCTIONS_END = '<!-- PM:INSTRUCTIONS:END -->'

// Legacy dynamic block markers — removed on sight
const LEGACY_MARKER_START = '<!-- PM:START -->'
const LEGACY_MARKER_END = '<!-- PM:END -->'

const STATIC_INSTRUCTIONS = `${INSTRUCTIONS_START}
## Task Tracking — pm

This project uses \`pm\` to plan and track all work. **You MUST log work in pm before starting. No exceptions.**

### Rules
- **Before ANY work — log it in pm first.** Every fix, feature, and change gets tracked. There is no "too small" — if you're editing code, log it first.
- **Workflow:** \`pm add-feature\` (any work with 2+ tasks) or \`pm add-issue\` (standalone one-off fix) → do the work → \`pm done <id> --note "..."\`
- **Features need phases and tasks.** After \`add-feature\`, always \`add-phase\` then \`add-task\` for each piece of work.
- **When asked about recent work, features, or project status** — always check pm first (\`pm list\`, \`pm log\`, \`pm show <featureId>\`)
- **\`pm\` CLI is the only source of truth for tasks** — never store or read task state from CLAUDE.md
- **Run \`pm help\` before using any command** — do not guess command names or argument signatures
- **Fall back to git or other tools only if pm has no relevant info**
${INSTRUCTIONS_END}`

/** Check if CLAUDE.md has outdated PM instructions and update if needed. Returns true if updated. */
export function ensureInstructionsUpToDate(cwd = process.cwd()): boolean {
  const claudeMdPath = join(cwd, 'CLAUDE.md')
  if (!existsSync(claudeMdPath)) return false

  const content = readFileSync(claudeMdPath, 'utf-8')
  const startIdx = content.indexOf(INSTRUCTIONS_START)
  const endIdx = content.indexOf(INSTRUCTIONS_END)
  if (startIdx === -1 || endIdx === -1) return false

  const current = content.slice(startIdx, endIdx + INSTRUCTIONS_END.length)
  if (current === STATIC_INSTRUCTIONS) return false

  updateClaudeMd(cwd)
  return true
}

export function updateClaudeMd(cwd = process.cwd()) {
  const claudeMdPath = join(cwd, 'CLAUDE.md')

  if (!existsSync(claudeMdPath)) {
    writeFileSync(claudeMdPath, STATIC_INSTRUCTIONS + '\n')
    return
  }

  let content = readFileSync(claudeMdPath, 'utf-8')

  // Write or update static instructions block
  const existingStart = content.indexOf(INSTRUCTIONS_START)
  const existingEnd = content.indexOf(INSTRUCTIONS_END)
  if (existingStart !== -1 && existingEnd !== -1) {
    const before = content.slice(0, existingStart)
    const after = content.slice(existingEnd + INSTRUCTIONS_END.length)
    content = before + STATIC_INSTRUCTIONS + after
  } else {
    content = STATIC_INSTRUCTIONS + '\n\n' + content
  }

  // Remove legacy dynamic PM:START/PM:END block if present
  const startIdx = content.indexOf(LEGACY_MARKER_START)
  const endIdx = content.indexOf(LEGACY_MARKER_END)
  if (startIdx !== -1 && endIdx !== -1) {
    const before = content.slice(0, startIdx).trimEnd()
    const after = content.slice(endIdx + LEGACY_MARKER_END.length)
    content = before + (after.startsWith('\n') ? after : '\n' + after)
  }

  writeFileSync(claudeMdPath, content)
}
