import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { hasActiveWork, getStatusSummary, recordEdit, recordRead, inferTitle, getPmCmd, checkScopeEscalation, checkUpgradeEnforcement, resetDoctrineSession, requiredDoctrines, hasPulledDoctrine } from '../lib/hooks.js'
import { readDoctrine } from './doctrine.js'

/**
 * Handle Claude Code hook callbacks.
 * Called by hooks configured in .claude/settings.json.
 * Reads JSON from stdin, outputs to stdout (context) or stderr (block reason).
 */
export function cmdHook(args: string[]) {
  const subcommand = args[0]
  // Use CLAUDE_PROJECT_DIR if available, fall back to cwd
  const cwd = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

  switch (subcommand) {
    case 'pre-edit':
      handlePreEdit(cwd)
      break
    case 'post-edit':
      handlePostEdit(cwd)
      break
    case 'pre-read':
      handlePreRead(cwd)
      break
    case 'prompt-context':
      handlePromptContext(cwd)
      break
    case 'session-start':
      handleSessionStart(cwd)
      break
    default:
      console.error(`Unknown hook: ${subcommand}`)
      console.error('Available: pre-edit, post-edit, pre-read, prompt-context, session-start')
      process.exit(1)
  }
}

function readStdin(): string {
  try {
    return readFileSync(0, 'utf-8')
  } catch {
    return ''
  }
}

/** PreToolUse hook — block Edit/Write if no active work is logged. */
function handlePreEdit(cwd: string) {
  const input = readStdin()

  try {
    const data = JSON.parse(input)
    const filePath: string = data?.tool_input?.file_path ?? ''

    // Allow edits to pm's own files and Claude config
    if (filePath.includes('.pm/') || filePath.includes('.claude/') || filePath.endsWith('CLAUDE.md')) {
      process.exit(0)
    }

    // Allow edits to memory files
    if (filePath.includes('/memory/')) {
      process.exit(0)
    }
  } catch {
    // Can't parse stdin, check active work anyway
  }

  const { active } = hasActiveWork(cwd)
  if (active) {
    // Check if an issue has grown beyond scope thresholds — hard block
    const escalation = checkScopeEscalation(cwd)
    if (escalation?.level === 'block') {
      process.stderr.write(escalation.message)
      process.exit(2)
    }
    // Check if an upgraded feature has enough tasks — hard block
    const upgradeCheck = checkUpgradeEnforcement(cwd)
    if (upgradeCheck) {
      process.stderr.write(upgradeCheck.message)
      process.exit(2)
    }
    // Doctrine enforcement — hard block when settings-gated doctrines weren't pulled
    const required = requiredDoctrines(cwd)
    const missing = required.filter(d => !hasPulledDoctrine(cwd, d))
    if (missing.length > 0) {
      const pmCmd = getPmCmd()
      process.stderr.write(
        `BLOCKED: Required doctrines not pulled this session.\n\n` +
        `Your settings require these doctrines to be read before any code edit:\n` +
        missing.map(d => `  ${pmCmd} doctrine ${d}`).join('\n') + `\n\n` +
        `Run all of the above, then retry your edit.\n` +
        `(Settings live at .pm/config.json — adjust with: ${pmCmd} settings)`,
      )
      process.exit(2)
    }
    process.exit(0) // allow
  }

  // Block — no active work. Build an actionable message with inferred title.
  let title: string | undefined
  try {
    const data = JSON.parse(input)
    const filePath: string = data?.tool_input?.file_path ?? ''
    title = inferTitle(filePath)
  } catch {
    // Can't parse stdin — no title inference
  }

  const titleArg = title ? `"${title}"` : '"describe your change"'
  const pmCmd = getPmCmd()

  process.stderr.write(
    `BLOCKED: No active work in pm.\n\n` +
    `Run this to start tracking:\n` +
    `  ${pmCmd} add-issue ${titleArg}\n\n` +
    `Or for larger work:\n` +
    `  ${pmCmd} add-feature "Feature title" --description "..."\n\n` +
    `Then retry your edit.`
  )
  process.exit(2) // block
}

/** PreToolUse hook for Read/Grep — count exploration ops to drive subagent nudges. */
function handlePreRead(cwd: string) {
  const input = readStdin()

  try {
    const data = JSON.parse(input)
    const toolName: string = data?.tool_name ?? ''

    // Only track Read and Grep — anything else is a no-op
    if (toolName === 'Read') {
      recordRead(cwd, 'Read')
    } else if (toolName === 'Grep') {
      recordRead(cwd, 'Grep')
    }
  } catch {
    // Can't parse, skip silently
  }

  process.exit(0)
}

/** PostToolUse hook — track files edited per task. */
function handlePostEdit(cwd: string) {
  const input = readStdin()

  try {
    const data = JSON.parse(input)
    const filePath: string = data?.tool_input?.file_path ?? ''

    // Skip pm/claude config files
    if (filePath.includes('.pm/') || filePath.includes('.claude/') || filePath.endsWith('CLAUDE.md') || filePath.includes('/memory/')) {
      process.exit(0)
    }

    if (filePath) {
      recordEdit(cwd, filePath)
    }
  } catch {
    // Can't parse, skip
  }

  process.exit(0)
}

/** UserPromptSubmit hook — inject scope-aware task context into every prompt. */
function handlePromptContext(cwd: string) {
  // Read user's prompt text from stdin (Claude Code sends {"prompt": "..."})
  const input = readStdin()
  let prompt: string | undefined
  try {
    const data = JSON.parse(input)
    prompt = data?.prompt
  } catch {
    // No valid JSON — proceed without prompt matching
  }

  const summary = getStatusSummary(cwd, prompt)
  if (summary) {
    process.stdout.write(summary)
  }
  process.exit(0)
}

/** SessionStart hook — reset stuck tasks, brief on prior work, inject router doctrine. */
function handleSessionStart(cwd: string) {
  const contextParts: string[] = []

  // 0. Reset the doctrine pull tracker — every fresh Claude session starts with router only
  try {
    resetDoctrineSession(cwd)
  } catch {
    // Non-pm directory or fs error, skip silently
  }

  // 1. Inject the router doctrine — small, always-on, points Claude at pm doctrine <name> for depth
  const router = readDoctrine('router')
  if (router) {
    contextParts.push(router)
  }

  // 2. Session briefing (cleanup + recap)
  const pmBin = getPmCmd()
  try {
    const cleanup = execSync(`${pmBin} cleanup --quiet`, { cwd, encoding: 'utf-8', timeout: 5000 })
    const recap = execSync(`${pmBin} recap --brief`, { cwd, encoding: 'utf-8', timeout: 5000 })
    const parts = [cleanup.trim(), recap.trim()].filter(Boolean)
    if (parts.length > 0) {
      contextParts.push(`## Session Briefing\n${parts.join('\n')}`)
    }
  } catch {
    // pm not available or no data, skip
  }

  // Output as additionalContext JSON
  if (contextParts.length > 0) {
    const context = contextParts.join('\n\n')
    const output = {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: context,
      },
    }
    process.stdout.write(JSON.stringify(output))
  }

  process.exit(0)
}
