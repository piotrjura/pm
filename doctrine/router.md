# pm doctrine router

pm is a persistent project manager. It tracks work across sessions so each conversation continues where the last left off — decisions, tasks, and rationale carry forward.

## The Rule

**Log work in pm before editing code. No exceptions.** Even a one-line fix gets logged first. If pm has no active work and you try to edit a file, the pre-edit hook will block you.

## How to discover commands

Run `pm help` whenever you need a command or flag. Never guess. **`pm help` is the single source of truth** — this doctrine never lists commands directly, only the situations in which to pull more guidance.

## Doctrine library

When you encounter one of these situations, **read the matching doctrine file** by running `pm doctrine <name>`. Don't try to operate from memory.

| Situation | Pull this doctrine |
|---|---|
| About to start ANY medium/large change | `pm doctrine planning` |
| Need to ask the user clarifying questions | `pm doctrine questions` |
| User answered initial questions, more uncertainty | `pm doctrine followup` |
| Made a choice, picked an approach, user gave direction | `pm doctrine decisions` |
| Issue feels like it's growing past 1-2 files | `pm doctrine scope` |
| Wrapping up a conversation or just finished a task | `pm doctrine sweep` |
| About to do 3+ reads, any broad grep, or open-ended exploration | `pm doctrine subagents` |
| Hit a blocked edit, stuck in-progress task, weird state | `pm doctrine recovery` |
| Need to size a request — issue or feature? | `pm doctrine sizing` |

You don't need every doctrine for every conversation. Pull on demand. Each one is short and focused.

## Settings

Per-project workflow depth is configured via `pm settings`. The prompt-context hook surfaces them on every prompt as `planning=X, questions=Y, followup=Z`. **These settings are binding** — follow them exactly unless the user's prompt explicitly overrides (skip signals like "quick fix" or deepen signals like "let's think this through" — see `pm doctrine planning` for details).

## Two-phase workflow

Every piece of work has two phases:

1. **Discovery** — pull context, ask questions, present approach. **No code, no task creation during Discovery.** Discovery ends when the user confirms the approach.
2. **Execution** — create tasks, write code, run tests. Work autonomously. Don't interrupt unless you hit a genuine blocker.

The depth of Discovery is governed by your settings. Pull `pm doctrine planning` before starting Discovery on any non-trivial change.

## Decisions are always on

There is no toggle for decisions. Run `pm why "<keyword>"` before proposing solutions and `pm decide` whenever you make a choice. See `pm doctrine decisions` for the full rules.
