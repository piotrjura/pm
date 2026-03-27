# pm

### Demo

https://github.com/user-attachments/assets/9c5899b6-7801-47f1-a975-eda3c97e3f10

A project manager for AI coding agents. Not for you — for Claude.

pm gives your AI agent persistent memory across sessions. It knows what was decided, what was done, and what's next — so every conversation picks up where the last one left off instead of starting from zero.

The agent manages itself: planning work, tracking scope, recording decisions, and cleaning up when it's done. You just tell it what to build.

## Install

### As a Claude Code plugin (recommended)

Register the marketplace and install:

```
/plugin marketplace add piotrjura/pm
/plugin install pm@pm-marketplace
```

That's it. The plugin is self-contained — hooks, workflow skill, and CLI are all bundled. Start a new conversation and pm is active.

### As a global CLI

For the full TUI and terminal commands:

```bash
npm install -g @piotrjura/pm
```

Then in your project:

```bash
pm
```

pm auto-configures Claude Code hooks and initializes the data store. Both install paths work together — if you have the plugin and later add the global CLI, pm detects it and uses the richer terminal output.

## What it does

pm enforces one rule: **log work before writing code.** Everything else flows from that.

When Claude starts a session, pm briefs it on what's in progress. When it tries to edit a file without tracking work, pm blocks the edit. When scope creeps beyond 3 files, pm warns. When a decision gets made, pm records why — so the next session doesn't re-decide it.

### Planning that scales to the task

pm adapts to the size of the work. A quick bug fix gets logged and done in seconds. A multi-file feature gets structured into phases and tasks with mandatory context checks. Configure how much ceremony you want:

```bash
pm settings  # cycle planning depth (none/medium/all) and question level (none/medium/thorough)
```

### Decisions that persist

When the agent makes a design choice, it records it with reasoning:

```bash
pm decide <id> "Use JSON storage instead of SQLite" \
  --reasoning "Single file, no native deps, portable"
```

Before making new choices, the agent checks what was already decided:

```bash
pm why "storage"
```

This is the core value. A five-session feature doesn't lose context — decisions, trade-offs, and rationale carry forward.

### Clean finishes

After work is done, `pm sweep` auto-closes everything outstanding — open issues, stale tasks, orphaned drafts. Every conversation leaves the project in a clean state.

## Claude Code hooks

pm installs four hooks that run automatically:

| Hook | What it does |
|------|-------------|
| **PreToolUse** | Blocks file edits without an active task or issue |
| **PostToolUse** | Tracks files edited, warns when scope exceeds 3 files |
| **UserPromptSubmit** | Injects active task context and relevant decisions into every prompt |
| **SessionStart** | Resets stuck tasks, briefs Claude on current state, loads workflow skill |

The hooks merge with any existing Claude Code hooks in your project.

## TUI

Run `pm` with no arguments to open the terminal UI — the human interface for seeing what your agent has been up to.

**Navigation:** arrows to move, Enter to open, Esc to back, q to quit, `/` to search, `w` for decisions view.

## CLI reference

### Status

```
pm              Open TUI
pm next         Next pending task (priority-aware)
pm list         All features and issues with progress
pm log [N]      Last N log entries (default: 20)
pm recap        Session briefing: active work, decisions, next steps
pm show <id>    Detail view with phases, tasks, decisions
```

### Track work

```
pm add-feature <title> [--description "..."]
pm add-phase <featureId> <title>
pm add-task <featureId> <phaseId> <title> [--files "a,b"] [--priority 1-5]
pm add-issue <title> [--type bug|change] [--priority urgent|high|medium|low]
```

### Lifecycle

```
pm start <id>       Start task or issue
pm done <id>        Complete [--note "..."]
pm error <id>       Mark failed [--note "reason"]
pm retry <id>       Re-queue failed task
pm sweep            Close all outstanding items
```

### Decisions

```
pm decide <id> "what" [--reasoning "why"] [--action "do this"]
pm why "search"     Search all decisions
pm forget "text"    Remove a decision
```

### Management

```
pm update <id>      Update properties [--title/--priority/--description]
pm cleanup          Reset stuck tasks [--errors] [--drafts] [--all]
pm settings         Configure planning and questions depth
pm bridge <file>    Import external plan [--spec to extract decisions]
pm init [--force]   Initialize or re-initialize hooks
```

## Data storage

All data lives in `.pm/data.json` — a single JSON file in your project. No database, no server, no network calls. Add `.pm/` to `.gitignore`.

## Changelog

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
