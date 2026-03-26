# PM as a Claude Code Plugin

**Date:** 2026-03-25 (updated 2026-03-26)
**Status:** Draft

## Problem

Two problems, one plugin:

1. **Installation friction** — pm requires `npm install -g` + `pm init`. The CC plugin marketplace offers one-step install.

2. **Superpowers is too heavy** — brainstorming → spec → review loops → plan → review loops → execute burns 100k+ tokens and 30+ minutes before a line of code is written. That's fine for large team projects, but it blocks experimentation and kills velocity for solo developers and smaller changes. Most work doesn't need a 20-page spec — it needs *context from previous sessions* and *guardrails while building*.

## Vision

**pm plugin = lightweight alternative to superpowers.** Not a process — a safety net.

Superpowers says: "Invest in planning upfront → save time later."
pm says: "Claude already knows how to code. Give it memory of what you decided and why, track scope, get out of the way."

The plugin provides:
- **Automatic context** — decisions, recent work, and task state injected every session via hooks
- **Scope enforcement** — pre-edit blocking, scope warnings, task decomposition nudges
- **Optional depth** — a skill for when you *want* to think first, not forced ceremony
- **Configurable intensity** — TUI settings let users choose their workflow level
- **Persistence** — decisions survive across sessions, searchable, manageable via TUI

## Workflow Depth Levels (TUI-configurable)

| Level | What happens | Who it's for |
|-------|-------------|-------------|
| **Minimal** | Track work + scope warnings. Log before editing, `pm done` when finished. | Experienced developers who want tracking without process |
| **Guided** | Skill asks 2-3 quick questions before you start. Records decisions. Suggests task splits when scope grows. | Default for most users |
| **Thorough** | Design conversation, generates a brief spec, bridges into pm tasks. Closest to superpowers but still faster. | Large features, team handoffs, when you genuinely need to think first |

Users configure their preferred level in the TUI (`pm settings`). The plugin skill adapts its behavior based on the setting.

## What Makes This Different From Superpowers

| Aspect | Superpowers | pm plugin |
|--------|-----------|-----------|
| **Before coding** | Mandatory: brainstorm → spec → review → plan → review | Optional: skill asks a few questions if you want, or just `pm add-issue` and go |
| **Persistent memory** | None — each session starts cold | Decisions, tasks, work history survive across sessions |
| **Spec documents** | Always generated, multi-page, reviewed by subagent | Optional. If generated, brief. Can bridge into pm tasks |
| **Token cost** | 100k+ before first line of code | Near zero — hooks inject context automatically |
| **Time to first edit** | 30+ minutes for any non-trivial feature | Seconds (log work → start coding) |
| **Review loops** | Mandatory subagent dispatches | Optional `pm done --review` |
| **Visibility** | Heavy process, many steps | Almost invisible — hooks run silently, skill on demand |
| **Management** | No UI — specs and plans are markdown files | TUI shows everything, lets you manage decisions/tasks interactively |

## Plugin Architecture

### Structure

```
pm/
├── .claude-plugin/
│   └── plugin.json               # CC plugin manifest
├── skills/
│   └── pm-workflow/
│       └── SKILL.md              # workflow + optional design guidance
├── hooks/
│   ├── hooks.json                # hook declarations for CC
│   ├── session-start             # bash wrapper
│   ├── pre-edit                  # bash wrapper
│   ├── post-edit                 # bash wrapper
│   └── prompt-context            # bash wrapper
├── dist/cli.js                   # existing bundled CLI
├── src/                          # existing CLI source
├── package.json                  # existing (updated files field)
```

### Plugin Manifest

`.claude-plugin/plugin.json`:

```json
{
  "name": "pm",
  "displayName": "PM — Project Manager for AI Agents",
  "description": "Persistent project tracking across sessions. Log work before coding, track scope, record decisions. Lightweight alternative to heavy planning workflows.",
  "version": "0.2.0",
  "author": { "name": "Piotr Jura" },
  "homepage": "https://github.com/piotrjura/pm",
  "repository": "https://github.com/piotrjura/pm",
  "license": "MIT",
  "skills": "../skills/",
  "hooks": "../hooks/hooks.json"
}
```

**Path resolution:** paths relative to `plugin.json` location (inside `.claude-plugin/`).

### Hook Wrappers

Each hook delegates to the bundled CLI via `CLAUDE_PLUGIN_ROOT` (set by CC at runtime).

```bash
#!/bin/bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" hook <subcommand> --agent claude-code --instance $PPID "$@"
```

Four wrappers: `session-start`, `pre-edit`, `post-edit`, `prompt-context`. Stdin inherited (CC pipes tool input JSON). `$PPID` for instance identity (same as existing `pm init` hooks).

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

### Working Directory & Project Resolution

- `CLAUDE_PLUGIN_ROOT` — locates the bundled CLI binary only
- `CLAUDE_PROJECT_DIR` / `process.cwd()` — finds `.pm/` data directory (existing behavior)
- CC runs hook commands with cwd = project root

### Lazy Init

No setup step. First hook fire auto-creates `.pm/` with defaults:
- `data.json` — via existing `ensureStore()`
- `config.json` — **new:** `loadConfig()` persists defaults when file missing and `.pm/` dir exists

### Agent CLI Calls

- Hooks use bundled CLI: `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.js` (fast, no network)
- Agent-initiated commands use `npx @piotrjura/pm` (cached after first run)
- Plugin declares permission: `Bash(npx @piotrjura/pm *)`

### Session-Start Fix

Existing `handleSessionStart` calls `execSync('pm cleanup')` and `execSync('pm recap')` — requires `pm` on PATH. Fix: when `CLAUDE_PLUGIN_ROOT` is set, use `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.js` instead of bare `pm`.

## The PM Workflow Skill

Single skill at `skills/pm-workflow/SKILL.md`. This is the core differentiator from "just hooks."

### Philosophy

The skill is **not a process to follow.** It's a contextual advisor that adapts to the user's configured depth level and the current situation.

### What the Skill Does

1. **Always available context** — pm command reference, scope rules, decision tracking. Invocable on demand, not forced.

2. **Adaptive pre-work guidance** (based on TUI setting):
   - **Minimal:** No pre-work questions. Just reminds to log work.
   - **Guided:** Reads recent pm decisions and related work. Asks 2-3 quick questions: "What's the goal? Anything from past decisions that applies? Single issue or needs decomposition?" Records answers as decisions.
   - **Thorough:** Brief design conversation (5-10 minutes, not 30). Can output a short spec. Bridges into pm tasks via `pm bridge`.

3. **Context surfacing** — when invoked, the skill instructs Claude to:
   - Run `pm why "<relevant keywords>"` to find past decisions
   - Run `pm recap` to see recent work
   - Run `pm list` to see what's in progress
   - Use this context to inform the current work

4. **Scope guidance** — when hooks warn about scope creep (4+ files), the skill knows how to decompose: suggest `pm add-feature` with phases, split the current issue into multiple tasks.

### What the Skill Doesn't Do

- No mandatory review loops or subagent dispatches
- No spec document generation unless user asks for thorough mode
- No multi-step checklists that must be completed in order
- No blocking — everything is advisory except the pre-edit hook

## Changes to Existing Code

### Modified files:
1. **`package.json`** — add to `files` field: `".claude-plugin"`, `"skills"`, `"hooks"`
2. **`src/lib/hooks.ts`** — slim prompt-context output when `CLAUDE_PLUGIN_ROOT` set (skill available)
3. **`src/commands/hook.ts`** — use bundled CLI for internal commands in plugin context
4. **`src/lib/config.ts`** — lazy-create `config.json` with defaults when missing

### New files:
1. `.claude-plugin/plugin.json`
2. `skills/pm-workflow/SKILL.md`
3. `hooks/hooks.json`
4. `hooks/session-start`, `hooks/pre-edit`, `hooks/post-edit`, `hooks/prompt-context`
5. `scripts/sync-version.js` — keeps plugin.json version in sync with package.json

### Unchanged:
- CLI commands, data model, hook logic core
- OpenCode support, npm publishing, `pm init`
- Build step

## Future: TUI Workflow Settings

Not in this phase, but the next step: add a "workflow depth" setting to the TUI (`pm settings`):

```
Workflow depth:
  ○ Minimal  — track work + scope warnings only
  ● Guided   — quick questions before work, decisions recorded
  ○ Thorough — design conversation, optional spec, task decomposition
```

The skill reads this setting and adapts. The config key would be `workflowDepth: 'minimal' | 'guided' | 'thorough'` in `.pm/config.json`.

## Distribution

| Channel | Target | How |
|---------|--------|-----|
| CC Plugin Marketplace | Claude Code users | `/install pm` — one step |
| npm (`@piotrjura/pm`) | Power users, OpenCode | `npm install -g` + `pm init` |
| npx | Plugin agent calls | `npx @piotrjura/pm <command>` |

Both paths coexist.

## Open Questions

1. **Marketplace registration** — submission process for CC plugin marketplace?
2. **Permission declaration** — can plugin.json declare `Bash(npx @piotrjura/pm *)` permissions?
3. **`CLAUDE_PLUGIN_ROOT` availability** — confirm env var is passed to hook commands.
4. **Path resolution in hooks.json** — relative to hooks.json or plugin.json?
5. **Workflow depth default** — should new installs default to "guided" or "minimal"?
