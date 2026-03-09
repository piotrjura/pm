import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { hasActiveWork, getStatusSummary, recordEdit } from '../lib/hooks.js'

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
    case 'prompt-context':
      handlePromptContext(cwd)
      break
    case 'session-start':
      handleSessionStart(cwd)
      break
    default:
      console.error(`Unknown hook: ${subcommand}`)
      console.error('Available: pre-edit, post-edit, prompt-context, session-start')
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
    process.exit(0) // allow
  }

  // Block — no active work
  process.stderr.write(
    `No active task in pm. Log work before editing code.\n\n` +
    `Quick fix: run pm add-issue "description"\n` +
    `Structured work: run pm add-feature "title", then add-phase, add-task, start\n\n` +
    `Do this yourself — pm commands are whitelisted. Then retry the edit.`
  )
  process.exit(2) // block
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
  const summary = getStatusSummary(cwd)
  if (summary) {
    process.stdout.write(summary)
  }
  process.exit(0)
}

/** SessionStart hook — reset stuck tasks, then brief Claude on prior work. */
function handleSessionStart(cwd: string) {
  try {
    // Reset stuck tasks first
    const cleanup = execSync('pm cleanup --quiet', { cwd, encoding: 'utf-8', timeout: 5000 })
    // Then get the briefing
    const recap = execSync('pm recap --brief', { cwd, encoding: 'utf-8', timeout: 5000 })
    const parts = [cleanup.trim(), recap.trim()].filter(Boolean)
    if (parts.length > 0) {
      process.stdout.write(`[pm] Session briefing — run \`pm recap\` for full details:\n${parts.join('\n')}`)
    }
  } catch {
    // pm not available or no data, skip
  }
  process.exit(0)
}
