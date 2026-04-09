# pm doctrine: sizing

How to decide whether to log a request as an issue or a feature, and how to break a feature into phases and tasks.

For commands and flags, run `pm help`.

## Issue vs feature

| Size | Signal | What to create |
|---|---|---|
| **Small** | Quick fix, tweak, 1-2 files, one logical change | Issue |
| **Medium** | Feature work, 3+ files, multiple logical steps | Feature with phases and tasks |
| **Large** | System redesign, cross-cutting change, multi-day work | Feature with multiple phases |

**When in doubt, start with an issue.** It's faster and pm will force you to upgrade if scope grows past thresholds (`pm doctrine scope`).

## Phases vs tasks

A **phase** is a stage of work. A **task** is a focused unit within a phase.

Phases group tasks by purpose. Common patterns:

- Design → Implementation → Tests
- Data model → CLI → TUI → Tests
- Removal → Replacement → Migration → Verification

**Don't make phases for tiny features.** A feature with 3 tasks doesn't need 3 separate phases. Use phases when the work has genuinely distinct stages that you'd review or pause between.

## Task granularity

A good task is:

- **1-3 files** of changes
- **One logical concern** — "add the validation" not "add validation, write tests, update README"
- **Reviewable in isolation** — a senior reviewer could understand the change without context from other tasks
- **Complete-able in one sitting** without feeling rushed

A bad task is:

- "Refactor everything" (no boundary)
- "Phase 2" (not a task, that's a phase)
- 8 files spanning 3 concerns (split it)
- Something that takes longer to log than to do (downgrade to an issue)

## File hints

When creating a task with `--files`, list the files you expect to touch. This isn't a contract — it's a planning aid that pm uses for scope warnings. If you end up touching different files, that's fine. If you end up touching far more files than listed, that's a signal to split the task.

## Priorities

Tasks accept `--priority 1-5` (1 = highest). Issues accept `--priority urgent|high|medium|low`. Use these sparingly — most work is `medium`. Reserve `urgent` for actual blockers and `1` for the path-critical task in a feature.

## Past feedback

If you find yourself logging "implement everything" as a single task, you're doing it wrong. Multi-file features get multiple tasks, period. The user has explicit feedback recorded against monolithic tasks — break them down.
