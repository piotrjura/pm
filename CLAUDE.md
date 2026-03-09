<!-- PM:INSTRUCTIONS:START -->
## Task Tracking — pm

This project uses `pm` to plan and track all work. **You MUST log work in pm before starting. No exceptions.**

### Rules
- **Before ANY work — log it in pm first.** Every fix, feature, and change gets tracked. There is no "too small" — if you're editing code, log it first.
- **Workflow:** `pm add-feature` (any work with 2+ tasks) or `pm add-issue` (standalone one-off fix) → do the work → `pm done <id> --note "..."`
- **Features need phases and tasks.** After `add-feature`, always `add-phase` then `add-task` for each piece of work.
- **Record decisions:** When you make a design choice, pick between alternatives, or decide on an approach — run `pm decide <id> "what" --reasoning "why"`. Decisions are stored on features, tasks, or issues and survive across sessions.
- **Search decisions:** When you need to understand *why* something was built a certain way, run `pm why "search term"` — it searches all decisions across features, tasks, and issues. Use this before guessing or re-deciding something that may already have been decided.
- **When asked about recent work, features, or project status** — always check pm first (`pm list`, `pm log`, `pm show <featureId>`)
- **`pm` CLI is the only source of truth for tasks** — never store or read task state from CLAUDE.md
- **Run `pm help` before using any command** — do not guess command names or argument signatures
- **Fall back to git or other tools only if pm has no relevant info**
<!-- PM:INSTRUCTIONS:END -->

## What this project is

pm is a CLI project manager for AI coding agents. It gives Claude Code structure — enforced planning, scope tracking, decision logging — so multi-session work doesn't lose context.

**Stack:** TypeScript, React 19, Ink 6 (terminal UI), tsup (build), vitest (tests)

## Architecture

### Entry point and command routing

`src/cli.tsx` — parses `process.argv`, routes to command handlers via switch statement. No subcommand or unknown command opens the TUI. Each command file exports a single `cmdXxx(args: string[])` function.

### Command pattern

Every command follows the same structure:
1. Extract positional args, exit with usage on missing required args
2. Parse flags using helpers from `src/lib/args.ts` (`parseFlag`, `hasFlag`, `parseListFlag`, `parseIntFlag`)
3. Load store fresh via `loadStore()` — no shared state between commands
4. Mutate store, save
5. Print structured output (IDs first, then details)

### Data model (`src/lib/types.ts`)

```
DataStore
├── features: Feature[]
│   ├── type: feature | fix
│   ├── status: draft → planned → in-progress → done
│   ├── decisions: Decision[]
│   └── phases: Phase[]
│       └── tasks: Task[]
│           ├── status: pending → in-progress → done | error | review
│           ├── priority: 1-5 (lower = higher)
│           └── decisions: Decision[]
├── issues: Issue[]
│   ├── type: bug | change
│   ├── status: triage → backlog → todo → in-progress → done
│   ├── priority: urgent | high | medium | low
│   └── decisions: Decision[]
└── log: LogEntry[]  (append-only audit trail)
```

Feature status auto-promotes: draft → planned (phase added) → in-progress (task started) → done (all tasks done).

### Store (`src/lib/store.ts`)

Single JSON file at `.pm/data.json`. `loadStore()` reads, migrates if needed, returns typed `DataStore`. `saveStore()` writes with 2-space indent. Every command loads fresh — safe for concurrent access from hooks and CLI.

Key exports: `addFeature`, `addIssue`, `addPhaseToFeature`, `addTaskToPhase`, `markTaskStarted`, `markTaskDone`, `markTaskError`, `markTaskRetry`, `approveTask`, `rejectTask`, `addDecision`, `searchDecisions`, `appendLog`, `getLog`, `getNextTask`, `resetStuckTasks`, `deleteEmptyDraftFeatures`.

### Hooks (`src/lib/hooks.ts`)

Four Claude Code hooks that enforce the workflow:

| Hook | File command | Purpose |
|------|-------------|---------|
| PreToolUse (Edit/Write) | `pm hook pre-edit` | Blocks edits without active task/issue. Exempts `.pm/`, `.claude/`, `CLAUDE.md`, `/memory/` |
| PostToolUse (Edit/Write) | `pm hook post-edit` | Records file edits in `.pm/session.json`, warns at 4+ files (scope creep) |
| UserPromptSubmit | `pm hook prompt-context` | Injects active task context into every prompt |
| SessionStart | `pm cleanup --quiet && pm recap --brief` | Resets stuck tasks, briefs on current state |

Session tracking lives in `.pm/session.json` — tracks `activeId`, `files[]`, `editCount`. Resets when active task changes.

`ensureHooks(cwd)` writes hook config to `.claude/settings.json` in the project, merging with existing hooks.

### TUI (`src/app.tsx`)

React/Ink fullscreen app with three screens routed by `useNavigation()` hook:
- **UnifiedList** — merged features + issues, sorted by date, paginated, searchable
- **FeatureDetail** — phases, tasks, decisions, keyboard actions
- **IssueDetail** — issue details, decisions

`useStore()` watches `.pm/data.json` at 300ms intervals for live updates. `useNavigation()` manages screen stack and preserves list position on back navigation.

### Init and upgrades

`src/lib/init.ts` — `detectProjectStatus()` checks for `.pm/data.json`, `detectUpgrade()` compares stored `pmVersion` with running version. The TUI shows `InitScreen` → `InitWizard` for first run, `UpgradeScreen` for version changes.

`src/lib/version.ts` — reads `PM_VERSION` from package.json, handles both dev (tsx) and bundled (dist/) paths.

## Project structure

```
src/
  cli.tsx                — Entry, command routing
  app.tsx                — TUI root component
  commands/              — One file per CLI command (cmdXxx exports)
  components/            — Ink/React TUI components
  hooks/                 — useStore (file watching), useNavigation (screen routing)
  lib/
    store.ts             — All CRUD, load/save, migrations
    types.ts             — DataStore, Feature, Task, Issue, Decision, LogEntry
    hooks.ts             — Claude Code hook handlers, session tracking
    init.ts              — Init detection, upgrade check, permissions
    version.ts           — PM_VERSION from package.json
    args.ts              — CLI flag parsing helpers
    format.ts            — Relative dates, progress bars, status icons
test/
  helpers.ts             — createTestDir, pm() spawn helper, data utils
  *.test.ts              — Integration tests (spawn real CLI in temp dirs)
```

## Dev commands

```bash
npm run dev          # Run CLI via tsx (no build needed)
npm run build        # Bundle with tsup → dist/cli.js
npm test             # vitest run
npm run test:watch   # vitest watch mode
```

## Testing

Integration tests that spawn the real CLI in isolated temp directories. `test/helpers.ts` provides `pm(args, cwd)` to exec commands and capture stdout/stderr, plus `createTestDir()` for temp dir lifecycle.

Tests parse command output with regex to extract IDs, then chain commands to test full workflows (create → start → done → verify log).

## Conventions

- **No co-author lines in commits** — never add "Co-Authored-By" attribution
- **IDs are nanoid-generated**, 8 chars, printed first in command output so scripts can extract them
- **Commands never share in-memory state** — always load fresh from disk
- **Hooks exempt pm's own files** from edit blocking (`.pm/`, `.claude/`, `CLAUDE.md`)
- **Feature auto-promotion** — status advances automatically based on task completion, no manual status changes needed
