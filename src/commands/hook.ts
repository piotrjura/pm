import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { hasActiveWork, getStatusSummary, recordEdit, saveIdentity, inferTitle, loadIdentityFlags } from '../lib/hooks.js'
import { parseFlag } from '../lib/args.js'

/**
 * Handle Claude Code hook callbacks.
 * Called by hooks configured in .claude/settings.json.
 * Reads JSON from stdin, outputs to stdout (context) or stderr (block reason).
 *
 * Identity is passed as --agent/--instance flags (not env var prefixes)
 * so the command starts with `pm` and stays whitelisted.
 */
export function cmdHook(args: string[]) {
  const subcommand = args[0]
  // Use CLAUDE_PROJECT_DIR if available, fall back to cwd
  const cwd = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

  // Identity comes from flags only — no env var fallbacks
  const agent = parseFlag(args, '--agent')
  const instance = parseFlag(args, '--instance')

  switch (subcommand) {
    case 'pre-edit':
      handlePreEdit(cwd, agent, instance)
      break
    case 'post-edit':
      handlePostEdit(cwd)
      break
    case 'prompt-context':
      handlePromptContext(cwd, agent, instance)
      break
    case 'session-start':
      handleSessionStart(cwd, agent, instance)
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
function handlePreEdit(cwd: string, agent?: string, instance?: string) {
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

  const { active } = hasActiveWork(cwd, agent, instance)
  if (active) {
    process.exit(0) // allow
  }

  // Block — no active work. Build an actionable message with inferred title + identity flags.
  let title: string | undefined
  try {
    const data = JSON.parse(input)
    const filePath: string = data?.tool_input?.file_path ?? ''
    title = inferTitle(filePath)
  } catch {
    // Can't parse stdin — no title inference
  }

  const idFlags = loadIdentityFlags(cwd)
  const idSuffix = idFlags ? ` ${idFlags}` : ''
  const titleArg = title ? `"${title}"` : '"describe your change"'

  process.stderr.write(
    `BLOCKED: No active work in pm.\n\n` +
    `Run this to start tracking:\n` +
    `  pm add-issue ${titleArg}${idSuffix}\n\n` +
    `Or for larger work:\n` +
    `  pm add-feature "Feature title" --description "..."\n\n` +
    `Then retry your edit.`
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
function handlePromptContext(cwd: string, agent?: string, instance?: string) {
  // Read user's prompt text from stdin (Claude Code sends {"prompt": "..."})
  const input = readStdin()
  let prompt: string | undefined
  try {
    const data = JSON.parse(input)
    prompt = data?.prompt
  } catch {
    // No valid JSON — proceed without prompt matching
  }

  const summary = getStatusSummary(cwd, agent, instance, prompt)
  if (summary) {
    process.stdout.write(summary)
  }
  process.exit(0)
}

/** SessionStart hook — persist identity, capture model, reset stuck tasks, brief on prior work. */
function handleSessionStart(cwd: string, agent?: string, instance?: string) {
  // Parse model from hook input (Claude Code sends {"model": "claude-opus-4-6"} on stdin)
  const input = readStdin()
  let model: string | undefined
  try {
    const data = JSON.parse(input)
    model = data?.model
  } catch {
    // No valid JSON — skip
  }

  // Persist agent/model so prompt-context can tell the agent what flags to pass
  if (agent || model || instance) {
    saveIdentity(cwd, { agent, model, instance })
  }

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
