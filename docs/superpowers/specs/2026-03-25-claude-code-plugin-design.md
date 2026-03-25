# PM as a Claude Code Plugin

**Date:** 2026-03-25
**Status:** Draft

## Problem

PM requires manual setup: `npm install -g @piotrjura/pm` followed by `pm init` to write hooks and permissions into `.claude/settings.json`. This friction discourages adoption. The CC plugin marketplace offers a one-step install that handles hooks, permissions, and skill discovery automatically.

## Decision

Package pm as a Claude Code plugin using the monorepo approach — plugin manifest, skills, and hook wrappers live alongside the existing CLI source. The npm distribution stays for power users and non-CC environments.

## Plugin Structure

New files added to the existing pm repo:

```
pm/
├── .claude-plugin/
│   └── plugin.json               # CC plugin manifest
├── skills/
│   └── pm-workflow/
│       └── SKILL.md              # workflow primer skill
├── hooks/
│   ├── hooks.json                # hook declarations for CC
│   ├── session-start             # bash wrapper
│   ├── pre-edit                  # bash wrapper
│   ├── post-edit                 # bash wrapper
│   └── prompt-context            # bash wrapper
├── dist/cli.js                   # existing bundled CLI (used by hook wrappers)
├── src/                          # existing CLI source
├── package.json                  # existing (updated files field)
```

## Plugin Manifest

`.claude-plugin/plugin.json`:

```json
{
  "name": "pm",
  "displayName": "PM — Project Manager for AI Agents",
  "description": "Persistent project tracking across sessions. Log work before coding, track scope, record decisions, bridge plans.",
  "version": "0.2.0",
  "author": { "name": "Piotr Jura" },
  "homepage": "https://github.com/piotrjura/pm",
  "repository": "https://github.com/piotrjura/pm",
  "license": "MIT",
  "skills": "../skills/",
  "hooks": "../hooks/hooks.json"
}
```

**Path resolution:** `skills` and `hooks` paths are relative to `plugin.json`'s location (inside `.claude-plugin/`), so they use `../` to reach the repo root.

## Hook Wrappers

Each hook is a bash script that delegates to the bundled CLI. `CLAUDE_PLUGIN_ROOT` is provided by CC at runtime and points to the plugin's installed directory.

**All four wrapper scripts:**

`hooks/session-start`:
```bash
#!/bin/bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" hook session-start --agent claude-code --instance $PPID "$@"
```

`hooks/pre-edit`:
```bash
#!/bin/bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" hook pre-edit --agent claude-code --instance $PPID "$@"
```

`hooks/post-edit`:
```bash
#!/bin/bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" hook post-edit --agent claude-code --instance $PPID "$@"
```

`hooks/prompt-context`:
```bash
#!/bin/bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" hook prompt-context --agent claude-code --instance $PPID "$@"
```

Stdin is inherited automatically by bash — CC pipes tool input JSON, the CLI reads it. `$PPID` gives the CC process PID (consistent with existing `pm init` hooks — same limitation: fragile if CC spawns through intermediate process managers).

Hook descriptions:
- `session-start` — briefing, identity capture, cleanup (timeout: 10s)
- `pre-edit` — block edits without active work (timeout: 5s, matcher: Edit|Write)
- `post-edit` — track edited files for scope (timeout: 5s, matcher: Edit|Write)
- `prompt-context` — inject status + blockers (timeout: 5s, no matcher)

`hooks/hooks.json`:
```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{ "type": "command", "command": "./hooks/session-start", "timeout": 10 }]
    }],
    "PreToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{ "type": "command", "command": "./hooks/pre-edit", "timeout": 5 }]
    }],
    "PostToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{ "type": "command", "command": "./hooks/post-edit", "timeout": 5 }]
    }],
    "UserPromptSubmit": [{
      "hooks": [{ "type": "command", "command": "./hooks/prompt-context", "timeout": 5 }]
    }]
  }
}
```

Matchers match the existing `ensureHooks()` values: `Edit|Write` for tool hooks, no matcher for SessionStart and UserPromptSubmit.

## Working Directory & Project Resolution

**Critical:** Hook wrappers rely on the working directory being the user's project root (where `.pm/` lives), not the plugin installation directory.

- `CLAUDE_PLUGIN_ROOT` — used only to locate the bundled CLI binary (`dist/cli.js`)
- `CLAUDE_PROJECT_DIR` / `process.cwd()` — used by the CLI to find `.pm/` data directory (existing behavior in `cmdHook()`)

CC is expected to run hook commands with cwd set to the project root. This matches CC's existing behavior for project-level hooks in `.claude/settings.json`.

## Lazy Init

No separate setup step. When a hook fires and `.pm/data.json` doesn't exist, `ensureStore()` auto-creates it with defaults:

```
.pm/
├── data.json     # { pmVersion: "0.2.0", features: [], issues: [], log: [] }
```

**Code change needed:** `config.json` is currently only created by `pm init` (via `saveConfig()`). For plugin users who skip `pm init`, lazy init must also create `config.json` with defaults when missing:

```json
{ "decisions": true, "agents": ["claude-code"] }
```

This requires adding a `ensureConfig()` call (or extending `ensureStore()`) to create `config.json` with defaults if it doesn't exist.

## Agent CLI Calls

Hooks use the bundled CLI (fast, no network): `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.js`.

When Claude needs to run pm commands directly (e.g., `pm add-issue`), it uses `npx @piotrjura/pm`. The plugin declares a permission for this: `Bash(npx @piotrjura/pm *)`. First call caches the package, subsequent calls are instant.

**Cold start:** The first `npx` call in a session downloads/caches the package (~164KB), which may take 3-5 seconds. Mitigation: the SessionStart hook already runs the bundled CLI, so it could warm the npx cache by running `npx @piotrjura/pm --version` in the background. However, this adds complexity — defer unless latency becomes a real problem.

The skill documents the `npx @piotrjura/pm` prefix for all commands.

## Session-Start Internal Commands

**Issue:** The existing `handleSessionStart` in `src/commands/hook.ts` calls `execSync('pm cleanup --quiet')` and `execSync('pm recap --brief')`. These require `pm` on `$PATH`, which plugin-only users won't have.

**Fix:** When `CLAUDE_PLUGIN_ROOT` is set, these internal calls must use `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.js` instead of bare `pm`. The hook command handler should check for the env var and construct the correct binary path. This is a required code change.

## PM Workflow Skill

Single skill at `skills/pm-workflow/SKILL.md`.

**Purpose:** Teach Claude how to use pm — commands, scope rules, decision tracking, lifecycle.

**Triggers on:** work tracking, task planning, "log work", "how do I use pm", or when hook context says to log work before coding.

**Content:**
- The Rule: log work before editing code
- Quick reference: add-issue vs add-feature decision tree
- Scope rules: 1-3 files per task, 4+ = feature with phases
- Command reference: full lifecycle (start, done, error, retry, review)
- Decision tracking: decide, why, forget
- Bridging superpowers plans: pm bridge usage
- All commands use `npx @piotrjura/pm` prefix

**Impact on hook output:** The UserPromptSubmit hook output slims down when running as a plugin. Instead of the current ~20-line instruction block:
```
[pm] No active work tracked. Log work before editing code.
Invoke pm-workflow skill for commands and guidance.
```

When running without the plugin (npm global install), the current verbose output stays.

## Changes to Existing Code

### Modified files:
1. **`package.json`** — add to `files` field: `".claude-plugin"`, `"skills"`, `"hooks"`
2. **`src/lib/hooks.ts`** (prompt-context output) — detect plugin context via `CLAUDE_PLUGIN_ROOT` env var; emit slim output when skill is available, verbose output otherwise
3. **`src/commands/hook.ts`** (session-start handler) — when `CLAUDE_PLUGIN_ROOT` is set, use `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.js` for internal `pm cleanup` and `pm recap` calls instead of bare `pm`
4. **`src/lib/store.ts`** (or new `ensureConfig()`) — create `config.json` with defaults when missing (for lazy init without `pm init`)

### New files:
1. `.claude-plugin/plugin.json` — plugin manifest
2. `skills/pm-workflow/SKILL.md` — workflow primer skill
3. `hooks/hooks.json` — hook declarations
4. `hooks/session-start` — bash wrapper
5. `hooks/pre-edit` — bash wrapper
6. `hooks/post-edit` — bash wrapper
7. `hooks/prompt-context` — bash wrapper

### Unchanged:
- CLI commands, data model, hook logic core
- OpenCode support and plugin
- npm publishing workflow
- `pm init` (still works for non-plugin users)
- Build step (`tsup` produces `dist/cli.js` as before)

## Detecting Plugin Context

The CLI detects plugin context by checking `process.env.CLAUDE_PLUGIN_ROOT`. When set:
- `pm init --claude-code` skips hook/permission installation (already handled by plugin)
- Prompt-context hook emits slim output (skill is available)
- Internal session-start commands use bundled CLI path instead of bare `pm`

## Version Sync

`plugin.json` version must match `package.json` version. Strategy: add a build step that reads version from `package.json` and writes it to `.claude-plugin/plugin.json` during `tsup` build (or a simple pre-publish script). This prevents drift between npm and plugin marketplace versions.

## Distribution

| Channel | Target | How |
|---------|--------|-----|
| CC Plugin Marketplace | Claude Code users | `/install pm` — hooks, skill, permissions, all automatic |
| npm (`@piotrjura/pm`) | Power users, OpenCode, terminal | `npm install -g` + `pm init` — unchanged |
| npx | Plugin agent calls | `npx @piotrjura/pm <command>` — cached after first run |

Both paths coexist. Plugin is the recommended path for CC users. If a user has both (ran `pm init` before installing plugin), the duplicate hooks/permissions are harmless — CC deduplicates or runs both, and pm commands are idempotent.

## User Experience

### Plugin user:
1. `/install pm` in Claude Code
2. Start a conversation — SessionStart fires, lazy-inits `.pm/` if needed, shows briefing
3. Ask Claude to do work — prompt-context says "log work first, use pm-workflow skill"
4. Claude invokes skill, learns commands, runs `npx @piotrjura/pm add-issue "..." --agent claude-code`
5. Work tracked, scope monitored, decisions persisted across sessions

### npm user (unchanged):
1. `npm install -g @piotrjura/pm`
2. `pm init` in project directory
3. Same hook behavior, same workflow

## Open Questions

1. **Marketplace registration** — how to register pm in the CC plugin marketplace? Need to understand the submission process.
2. **Permission declaration** — can plugin.json declare `Bash(npx @piotrjura/pm *)` permissions, or does the user need to approve these on first use?
3. **`CLAUDE_PLUGIN_ROOT` availability** — confirm this env var is passed to hook commands (observed in superpowers' hook scripts).
4. **Path resolution in hooks.json** — confirm CC resolves command paths in `hooks.json` relative to the `hooks.json` file itself (not relative to `plugin.json`).
