# pm

A project manager for AI coding agents. Not for you — for Claude.

pm gives your AI agent structure so it doesn't just dive into code and lose track of what it's doing. It enforces planning before editing, tracks scope so changes don't sprawl across dozens of files, and logs decisions so the next session doesn't redo work the last one already figured out.

You install it, run `pm` in your project, and the setup wizard handles the rest. From that point on, Claude Code manages itself — creating tasks, logging progress, recording why it chose approach A over approach B. You just tell it what to build.

### The problem

AI agents are productive but forgetful. Each session starts from zero. Without structure, they'll re-investigate decisions already made, let a "small fix" balloon into a 15-file refactor, or lose track of what was done halfway through a feature. pm solves this by giving the agent a persistent, enforced workflow — the same way a project manager keeps a team on track, except the team is an LLM.

### What carries over between sessions

Every session starts with a briefing. pm tells Claude what's in progress, what was done recently, and what decisions were made. Nothing gets lost.

- **`pm recap`** — the agent runs this automatically on session start. It sees active tasks, recent progress, and open issues.
- **`pm log`** — full history of everything done: which tasks were started, completed, failed, and what notes the agent left.
- **`pm why "search term"`** — searches all recorded decisions. Before the agent re-decides something, it checks if a previous session already settled it.
- **`pm show <id>`** — deep view of a feature with all phases, tasks, decisions, and timestamps.

This is the core value. A five-session feature doesn't lose context between sessions — the agent picks up where it left off.

## Install

```bash
npm install -g @piotrjura/pm
```

Or run without installing:

```bash
npx @piotrjura/pm
```

## Getting started

Navigate to your project and run:

```bash
pm
```

If this is a fresh project, pm detects that and launches the setup wizard. It walks through three steps:

1. **Whitelist pm commands** — adds `pm *` to Claude Code's allowed commands so it can call pm without asking permission every time
2. **Set up hooks** — installs Claude Code hooks that enforce the workflow (more on this below)
3. **Create data store** — initializes `.pm/data.json` in your project

Once setup is done, you're dropped straight into the TUI. Next time you run `pm`, it opens directly.

## How it works

pm enforces a simple rule: **log work before writing code.**

You don't need to run these commands yourself — Claude does. When it starts a session, pm briefs it on what's in progress. When it tries to edit a file without an active task, pm blocks it. When scope creeps beyond 3 files, pm warns about it. The agent learns the workflow on its first session and follows it from there.

There are two ways to track work:

**Issues** — for quick one-off fixes (1-2 files, one logical change):

```bash
pm add-issue "Fix pagination off-by-one" --type bug --priority high
# agent does the work
pm done <id> --note "Fixed fence post error in offset calc"
```

**Features** — for structured work (multiple files, multiple steps):

```bash
pm add-feature "Add user preferences" --description "Store and apply user prefs"
pm add-phase <featureId> "Implementation"
pm add-task <featureId> <phaseId> "Add preferences table" --files "schema.ts,migrations"
pm start <taskId>
# agent does the work
pm done <taskId> --note "Added prefs table with defaults"
```

Each task is a focused unit — one logical change across 1-3 files. If the agent touches more, pm warns it to break the work down further.

## Decision logging

When the agent makes a design choice, it records it:

```bash
pm decide <id> "Use JSON file storage instead of SQLite" \
  --reasoning "Single file, no native deps, portable across machines"
```

Decisions attach to features, tasks, or issues and persist across sessions. Search them later:

```bash
pm why "storage"
# Returns all decisions matching "storage" with context
```

This is what makes pm useful across sessions. Claude doesn't re-discover or re-decide things that were already settled — it checks first.

## Claude Code hooks

This is the enforcement layer. pm installs four hooks that run automatically — no action needed from you:

| Hook | Trigger | What it does |
|------|---------|-------------|
| **PreToolUse** | Before any file edit | Blocks edits without an active task or issue |
| **PostToolUse** | After any file edit | Tracks which files were edited, warns if scope exceeds 3 files |
| **UserPromptSubmit** | Every prompt | Injects active task context so Claude knows what it's working on |
| **SessionStart** | New session | Resets stuck tasks, briefs Claude on current state |

The hooks are non-destructive — they merge with any existing Claude Code hooks in your project.

## TUI

Run `pm` with no arguments to open the terminal UI. This is the human interface — while the agent uses CLI commands, you use the TUI to see what's going on.

**Navigation:** arrow keys or j/k to move, Enter to open, Esc to go back, q to quit.

**List view** shows all features and issues sorted by date, with progress bars, type badges, and priority levels. Use `/` to search, `[`/`]` to paginate, `n` to add a feature, `i` to add an issue.

**Detail view** shows phases, tasks, decisions, and status for a feature or issue.

## CLI reference

### Status

```
pm              Open TUI
pm next         Show the next pending task (priority-aware)
pm list         List all features and issues with progress
pm log [N]      Show last N log entries (default: 20)
pm recap        Session briefing: active work, next steps, recent decisions
```

### Track work

```
pm add-feature <title> [--description "..."]
pm add-phase <featureId> <title>
pm add-task <featureId> <phaseId> <title> [--description "..."] [--files "a,b"] [--priority 1-5]
pm add-issue <title> [--type bug|change] [--priority urgent|high|medium|low] [--description "..."]
```

### Task lifecycle

```
pm start <id>              Mark task as in-progress
pm done <id>               Mark as done [--note "..."] [--review]
pm error <id>              Mark as failed [--note "reason"]
pm retry <id>              Retry a failed task [--note "context"]
pm review <id>             Approve/reject [--approve|--reject] [--note "..."]
```

### Decisions

```
pm decide <id> "what" [--reasoning "why"]
pm why "search term"
```

### Management

```
pm show <featureId>        Feature detail with all IDs
pm update <id>             Update properties [--title "..."] [--description "..."] [--priority ...]
pm cleanup                 Reset stuck tasks [--errors] [--drafts] [--all] [--quiet]
pm init                    Initialize pm in current directory
pm hook <type>             Run a specific hook (used internally by Claude Code)
```

## Data storage

All data lives in `.pm/data.json` — a single JSON file in your project root. No database, no server, no network calls.

The file contains features (with phases and tasks), standalone issues, and an append-only log of all actions. Add `.pm/` to your `.gitignore` — task state is local to each developer.

Edit session tracking (which files were touched, scope warnings) is stored separately in `.pm/session.json` and resets between tasks.

## Requirements

- Node.js 18+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — pm is built specifically for Claude Code's hooks system

## License

MIT
