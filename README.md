# pm

**An operating discipline for AI coding agents — persistent memory, enforced workflow, recorded decisions.**

You install it. Claude lives inside it.

### Demo

https://github.com/user-attachments/assets/9c5899b6-7801-47f1-a975-eda3c97e3f10

---

pm is not a task tracker. It is a control layer that sits between your coding agent and your codebase. It enforces three things, all of them via Claude Code hooks the agent cannot ignore:

1. **Persistent memory.** Decisions, work history, and rationale survive across sessions. The agent runs `pm why` before deciding and `pm decide` when it makes a choice. Relevant decisions are injected into every prompt.
2. **Workflow discipline.** Configurable planning, questioning, and follow-up depth — enforced by prompt-context injection and, at the strongest settings, by hard-blocks on the pre-edit hook. The agent cannot edit code until it has read the doctrines you require.
3. **Scope and behavior guardrails.** Issues can't grow past 4 files. Edits can't happen without active work. Exploration triggers subagent delegation nudges. Stale state is auto-recovered. Sweeps clean up at the end.

The TUI is the human's window into what the agent has been doing. The agent's window is the hook output, surfaced on every prompt.

## Install

```bash
npm install -g @piotrjura/pm
```

Then in your project:

```bash
pm
```

The TUI launches. On first run in a new project, pm asks for confirmation before creating `.pm/`, installing five Claude Code hooks, and adding a `Bash(pm *)` permission. After confirming, you're in.

Every subsequent `pm` invocation re-verifies the hooks are still installed in `.claude/settings.json` and silently restores them if they were removed or changed. **pm is self-healing** — clone the repo, run any pm command, and you're set up.

## What a Claude session looks like with pm

1. **Session starts.** pm injects the doctrine router into context, briefs Claude on what's in progress, resets the doctrine pull tracker for the new session. Claude sees the active task, recent work, and 26 recorded decisions waiting to be searched.
2. **You give a prompt.** The prompt-context hook fires. Claude sees the active work, the workflow settings (`planning=all, questions=thorough, followup=thorough`), the relevant decisions matched against your prompt, and — if any required doctrines weren't pulled this session — a `BLOCKING` notice listing the exact `pm doctrine` commands to run.
3. **Claude pulls the required doctrines.** Each `pm doctrine <name>` call records the pull silently. Once all required doctrines are read, the pre-edit hook unblocks.
4. **Claude does Discovery.** Reads the planning doctrine, runs `pm recap`, runs `pm why "<keyword>"` against past decisions, presents an approach, asks clarifying questions per your `questions` setting, waits for your confirmation.
5. **Claude enters Execution.** Creates the feature/phases/tasks, `pm start`s the first task, then writes code. Each edit is allowed because there's active work. Each scope creep past 4 files is hard-blocked. Each Read/Grep is counted — past 3 read-equivalents, the prompt-context surfaces a nudge to delegate exploration to a Haiku/Sonnet subagent.
6. **Claude makes choices and records them** with `pm decide`. The next session will see them.
7. **Work ends.** `pm sweep` closes outstanding items. The project is clean.

## Persistent memory

When the agent makes a design choice, it records it with reasoning:

```bash
pm decide <id> "Use JSON storage instead of SQLite" \
  --reasoning "Single file, no native deps, portable" \
  --action "Never add a Postgres dependency to the auth module"
```

Before making new choices, the agent searches what was already decided:

```bash
pm why "storage"
```

The prompt-context hook also injects relevant decisions automatically — Claude rarely runs `pm why` proactively, so pm pushes them. Decisions matching keywords from your prompt are surfaced on every interaction. **Decisions are always on. There is no toggle.**

This is the core value. A five-session feature doesn't lose context — decisions, trade-offs, and rationale carry forward.

## Workflow discipline

pm enforces two-phase work: **Discovery** (no code, no task creation — only context-pulling, planning, and questions) followed by **Execution** (autonomous building, no interrupting unless blocked).

The depth of Discovery is configured per project:

```bash
pm settings  # cycle planning/questions/followup levels
```

| Setting | Levels | What it controls |
|---|---|---|
| `planning` | `none` / `medium` / `all` | How aggressively the agent must plan before any code |
| `questions` | `none` / `medium` / `thorough` | How many initial clarifying questions during Discovery |
| `followup` | `none` / `medium` / `thorough` | How deep the post-analysis follow-up conversation goes |

**At `medium`,** missing doctrines surface as advisory nudges in prompt-context. The agent should pull them but isn't blocked.

**At the strongest setting** (`planning=all`, `questions=thorough`, `followup=thorough`), the corresponding doctrines become hard-blocking. The agent cannot edit code until it has run the matching `pm doctrine <name>` commands. The pre-edit hook returns:

```
BLOCKED: Required doctrines not pulled this session.

Your settings require these doctrines to be read before any code edit:
  pm doctrine planning
  pm doctrine questions
  pm doctrine followup
  pm doctrine decisions

Run all of the above, then retry your edit.
```

The `decisions` doctrine is **always required** regardless of setting — it's the heart of pm.

## Guardrails

pm hard-blocks edits in three situations:

**No active work.** Try to edit a file with no logged task or issue, get blocked:
```
BLOCKED: No active work in pm.

Run this to start tracking:
  pm add-issue "Update auth middleware"
```

**Issue scope creep.** An issue is for 1-2 file fixes. Past 4 files or 10 edits, the pre-edit hook blocks and tells the agent to upgrade to a feature with multiple tasks:
```
BLOCKED: This issue has grown to 4 file(s) and 11 edit(s) — too large for an issue.

Run: pm upgrade <issueId>
```

**Subagent delegation nudges.** pm tracks Read and Grep calls per task. Past 3 read-equivalents (Read=1, Grep=2), the prompt-context hook surfaces:
```
💡 Subagents: 3 reads + 0 greps this task. For further exploration, delegate to
the Explore agent (Haiku/Sonnet — saves Opus tokens, keeps context lean).
Pull rules: pm doctrine subagents
```

This is a nudge, not a block — token optimization isn't a correctness rule. Subagents can run on Haiku or Sonnet instead of Opus, so every read you delegate is Opus tokens you don't burn and context you don't pollute.

**End-of-work sweep.** After conversations end, `pm sweep` auto-closes outstanding issues, stale tasks, and orphaned drafts. Every conversation leaves the project in a clean state.

## Doctrine system

pm ships with ten small, focused markdown files that define how Claude should approach work. These are NOT registered as Claude Code skills. They're injected directly via hooks (the SessionStart hook always loads the small router) and pulled on demand by Claude with `pm doctrine <name>`.

| Doctrine | When to pull |
|---|---|
| `router` | Always loaded — points at the rest |
| `planning` | Before any medium/large change |
| `questions` | When asking the user clarifying questions |
| `followup` | After initial answers, when more questions emerge |
| `decisions` | When making or recording a choice |
| `scope` | When an issue feels like it's growing past 1-2 files |
| `sizing` | Choosing between issue and feature |
| `sweep` | Wrapping up a conversation |
| `recovery` | Hit a stuck-state block |
| `subagents` | About to do 3+ reads or any broad grep |

Each pull is recorded silently in `.pm/doctrine-session.json` for the current Claude Code session. The pre-edit hook checks this file and hard-blocks if a required doctrine is missing. Resetting happens automatically on every new SessionStart.

You can read any doctrine yourself:

```bash
pm doctrine                # list all
pm doctrine planning       # print one
```

## Hooks

pm installs five hooks in `.claude/settings.json`:

| Hook | Matcher | What it does |
|---|---|---|
| **PreToolUse** | `Edit\|Write` | Blocks file edits without active work, scope creep, or unread required doctrines |
| **PreToolUse** | `Read\|Grep` | Counts exploration ops to drive subagent nudges |
| **PostToolUse** | `Edit\|Write` | Tracks files edited, updates scope counters |
| **UserPromptSubmit** | (all) | Injects active task, decisions, workflow settings, doctrine pull status |
| **SessionStart** | (all) | Reclaims genuinely-stale tasks, briefs Claude on state, injects router doctrine, resets doctrine pull tracker |

The hooks merge with any existing Claude Code hooks in your project. They are re-verified on every pm invocation and self-healed if missing.

## TUI

Run `pm` with no arguments to open the terminal UI — the human interface for seeing what your agent has been up to. Features, issues, phases, tasks, decisions, edit counters, settings.

**Navigation:** arrows to move, Enter to open, Esc to back, q to quit, `/` to search, `w` for the decisions view, `s` for settings.

## Common commands

The full reference lives in `pm help` — that's the single source of truth, never duplicated here. The most-used commands:

```bash
pm                       # open TUI
pm recap                 # session briefing — active work, decisions, next steps
pm add-issue "..."       # quick fix (1-2 files)
pm add-feature "..."     # structured work (3+ files, multiple tasks)
pm start <id>            # begin work
pm done <id> --note "…"  # finish
pm decide <id> "what" --reasoning "why"
pm why "search"          # find what was already decided
pm doctrine <name>       # read a doctrine (records the pull)
pm sweep                 # close everything outstanding
pm settings              # configure planning/questions/followup levels
pm help                  # full command reference
```

## Philosophy

pm is opinionated. These are the principles you're opting into:

- **Log work before code.** Every edit, every fix, every change. The pre-edit hook enforces this.
- **Decisions are always on.** Every choice future-you would benefit from knowing gets recorded. There is no toggle.
- **Settings are binding.** When you choose `planning=all`, the agent does full planning on every change — no exceptions, no judgment calls. Override per-prompt with skip signals like "quick fix" if you really mean it.
- **Push, don't pull.** Hooks inject context the agent cannot ignore. We don't trust the agent to remember to run `pm why` — we surface it for them.
- **`pm help` is the single source of truth.** The README, the doctrine files, and this list never duplicate command syntax. They reference `pm help`.
- **Self-heal everything.** Missing hooks, stale state, orphaned tasks — pm fixes them silently on every invocation. You should never have to think about whether pm is "set up correctly."

## Data storage

All state lives in `.pm/`:

| File | Contents |
|---|---|
| `.pm/data.json` | Features, issues, phases, tasks, decisions, log entries |
| `.pm/config.json` | Per-project workflow settings (`planning`/`questions`/`followup`) |
| `.pm/session.json` | Current edit/read tracking for the active task (resets per task) |
| `.pm/doctrine-session.json` | Which doctrines have been pulled this Claude session (resets per SessionStart) |

No database, no server, no network calls. Add `.pm/` to `.gitignore`.

## Changelog

### 0.5.0

- **Workflow settings always visible.** The `Workflow: planning=X, questions=Y, followup=Z` line now appears in every prompt-context injection, not just when no work is active. The agent can no longer drift away from your configured depth mid-feature.
- **Subagent delegation nudges.** New `PreToolUse: Read|Grep` hook tracks exploration calls per task. When Read + 2×Grep reaches 3, the prompt-context surfaces a persistent nudge directing the agent to delegate to the Explore agent (Haiku/Sonnet — saves Opus tokens, keeps context lean). The `subagents` doctrine and router language tightened to match the concrete trigger.
- **Doctrine pull tracking + hard-block.** New `.pm/doctrine-session.json` records which doctrines the agent has pulled this session. Settings-gated doctrines (`planning`, `questions`, `followup`) are required at their strongest levels (`all`/`thorough`); the always-on `decisions` doctrine is required at every level. The pre-edit hook hard-blocks edits when any required doctrine is unread, with a batched message listing all missing pulls. Medium-level settings get advisory nudges only.
- **0.4.0 users:** just run `pm` once after upgrading. The self-healing init installs the new `PreToolUse: Read|Grep` hook matcher silently.

### 0.4.0

- **CLI-first, plugin removed.** pm no longer ships as a Claude Code plugin or marketplace package. The npm CLI is the only install path. The `.claude-plugin/`, `hooks/` shell wrappers, and skill registration are gone. **Migration:** if you previously installed via marketplace, uninstall the plugin and run `npm install -g @piotrjura/pm` instead.
- **Doctrine system.** The monolithic workflow skill is replaced with 10 small focused markdown files (router, planning, questions, followup, decisions, scope, sizing, sweep, recovery, subagents). The router is always injected via SessionStart; the rest are pulled on-demand by Claude with `pm doctrine <name>`. Smaller base context, deeper guidance only when needed.
- **`pm doctrine` command.** New command to list and print doctrine files. Use `pm doctrine` to list, `pm doctrine <name>` to read.
- **Self-healing hooks.** Every `pm` invocation re-verifies `.claude/settings.json` hooks and silently restores them if missing. Clone a repo, run any pm command, and you're set up. No more "I don't have hooks installed" failures.
- **Robust stuck-work recovery.** `resetStuckTasks` no longer blindly resets all in-progress tasks at SessionStart. It now only resets tasks that are genuinely stale (>30 minutes idle, no recent edit activity), so SessionStart hooks fired during active work no longer blow away your in-progress task. Use `pm cleanup --force` to bypass the staleness check for explicit recovery.
- **First-run TUI confirmation.** Running `pm` in a fresh project shows a confirmation screen explaining what will be created (`.pm/`, hooks, permission) before any files are written. Press `y` to opt in, `n` to back out.
- **Single source of truth for CLI commands.** Doctrine files never list CLI commands directly — they reference `pm help`, which is now the only place CLI usage lives. No more drift between docs.

### 0.3.0

- **Claude Code focus** — removed multi-agent and OpenCode support. pm is built for Claude Code, with hooks and a workflow skill that enforce planning and decisions automatically.
- **Simplified init** — no more wizard. `pm` auto-configures hooks and opens the TUI. One command, no prompts.
- **`pm sweep`** — new command that auto-closes all outstanding work at the end of a conversation. Issues, tasks, stale features, empty drafts — all cleaned up.
- **Prescriptive workflow skill** — the bundled skill doesn't just suggest a workflow, it enforces it. Planning depth and question level are configurable per project.
- **Smaller bundle** — removed 1,400 lines of agent/model/identity tracking code. Leaner, simpler, faster.

### 0.2.1

- Plugin install instructions fix, marketplace sync

### 0.2.0

- Claude Code plugin packaging with marketplace distribution
- Prescriptive pm-workflow skill with configurable planning/questions
- Dual distribution: npm global + marketplace plugin

### 0.1.0

- Initial release: features, issues, phases, tasks, decisions
- Claude Code hooks (pre-edit, post-edit, prompt-context, session-start)
- Scope tracking, error recovery, plan bridge
- TUI with list, detail, and decisions views

## Requirements

- Node.js 18+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)

## License

MIT
