---
name: pm-workflow
description: Use when tracking work, planning tasks, logging issues, recording decisions, or when pm hook context says to log work before coding. Covers all pm commands, scope rules, decision tracking, and adaptive pre-work guidance based on workflow depth setting.
---

# PM Workflow

PM is a persistent project manager for AI coding agents. It tracks work across sessions so each conversation continues where the last left off.

**Philosophy:** Context over ceremony. You already know how to code. PM gives you memory of what was decided and why, tracks scope, and gets out of the way.

## Before You Start

Run these to understand the current context:

```bash
pm recap                    # What's active, recent work, decisions
pm why "<relevant keyword>" # Past decisions that might apply
pm list                     # All features/issues with progress
```

If there are relevant past decisions, **follow them** unless the user explicitly overrides.

## The Rule

**Log work in pm before editing code. No exceptions.**

## Quick Decision: Issue vs Feature

**Issue** — quick fix, 1-2 files, small change:
```bash
pm add-issue "description" --agent claude-code
```
Start working immediately — the issue is your active work.

**Feature** — 3+ files, multiple logical steps, distinct stages:
```bash
pm add-feature "title" --description "..."
pm add-phase <featureId> "Phase name"
pm add-task <featureId> <phaseId> "Task name"
pm start <taskId> --agent claude-code
```

**When in doubt, start with add-issue.** Upgrade to a feature later if scope grows.

## Scope Rules

- Each task = focused unit, **1-3 files**, one logical change
- 4+ files = this should be a feature with multiple tasks, not a single issue
- Distinct stages (design, implement, test) = separate phases
- PM warns at 4+ files per task — take the hint and split

## Task Lifecycle

| Command | What it does |
|---------|-------------|
| `pm start <id>` | Mark task/issue in-progress |
| `pm done <id> --note "what changed"` | Mark complete with summary |
| `pm error <id> --note "what failed"` | Mark as failed |
| `pm retry <id>` | Re-queue a failed task |
| `pm review <id>` | Submit for human review |

**Always pass `--agent claude-code`** on every pm command.

## Decisions

Record design decisions so future sessions don't re-litigate them:

```bash
pm decide <id> "What was decided" --reasoning "Why" --action "What to do"
```

Search past decisions before investigating:
```bash
pm why "keyword"
```

Remove outdated decisions:
```bash
pm forget "decision text"
```

**When you make a non-obvious choice** (architecture, library, approach), record it immediately with `pm decide`. Future sessions will thank you.

## Status & Context

| Command | What it shows |
|---------|--------------|
| `pm list` | All features/issues with progress |
| `pm show <id>` | Detail view of a feature/issue |
| `pm log` | Recent activity log |
| `pm recap` | Session briefing (active work, next steps, decisions) |
| `pm next` | Next pending task (priority-aware) |

## Bridging Plans

Import an existing spec or plan into pm's feature/phase/task structure:

```bash
pm bridge <plan-file.md>             # Import plan
pm bridge <plan-file.md> --spec      # Also extract decisions from spec
```

## Settings

```bash
pm settings                          # View/toggle settings via TUI
```

## Adaptive Pre-Work Guidance

When invoked before starting work, adapt your guidance to the situation:

**For small changes** (user asks for a quick fix or tweak):
- Just `pm add-issue`, check for relevant decisions, start coding
- Don't over-plan a one-file change

**For medium changes** (user describes a feature or multi-file change):
- Ask 2-3 quick questions to understand scope and constraints
- Check `pm why` for related past decisions
- Record any design choices as decisions
- Suggest feature/phase/task decomposition if needed

**For large changes** (user describes a significant feature or system redesign):
- Brief design conversation — 5 minutes, not 30
- Focus on: what's the goal, what are the constraints, what's the approach
- Record key decisions
- Decompose into feature with phases and tasks
- If there's an existing spec, use `pm bridge` to import it

**The user is always in control.** If they want to skip guidance and just build, let them. PM enforces logging work, not process.
