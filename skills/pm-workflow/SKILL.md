---
name: pm-workflow
description: Use when tracking work, planning tasks, logging issues, recording decisions, or when pm hook context says to log work before coding. Enforces planning depth and question asking based on per-project settings. Decisions are always active.
---

# PM Workflow

PM is a persistent project manager for AI coding agents. It tracks work across sessions so each conversation continues where the last left off.

**Philosophy:** Context over ceremony — but context is mandatory. You already know how to code. PM ensures you think before you build, using what was already decided and done.

## The Rule

**Log work in pm before editing code. No exceptions.**

## Read Project Settings

The prompt-context hook surfaces the current settings as `planning=X, questions=Y`. If not visible, read them:

```bash
pm settings
```

This returns JSON with two workflow keys:

| Setting | Values | What it controls |
|---------|--------|-----------------|
| `planning` | `none` / `medium` / `all` | When mandatory planning kicks in |
| `questions` | `none` / `medium` / `thorough` | How many clarifying questions to ask |

These settings are **binding**. Follow them exactly.

---

## Planning Enforcement

### `planning: none`

No mandatory planning. Just track work:
1. Size the request → `pm add-issue` or `pm add-feature`
2. Start coding.

### `planning: medium` (default)

**Small changes** (quick fix, 1-2 files) — no planning required. Log and go.

**Medium/large changes** (3+ files, multi-step, new feature) — mandatory planning:

1. **Pull context** — run these and read the output:
   ```bash
   pm recap
   pm why "<keyword>"    # Try 2-3 keywords related to the work
   pm list
   ```
2. **Synthesize and present** — tell the user what you understand before creating any tasks:
   - **Goal:** What are we building? (1-2 sentences)
   - **Prior context:** Relevant decisions, past work, constraints
   - **Approach:** How you'll implement (bullet points)
   - **Conflicts:** Any contradictions with prior decisions
   - **Open questions:** What the user needs to decide
3. **Wait for confirmation** — do not create tasks until the user confirms or adjusts.
4. **Structure** — create feature/phases/tasks.
5. **Record decisions** — any non-obvious choices from planning.

### `planning: all`

**Every change**, regardless of size, gets the full planning flow above. Even a one-file fix gets context pull + synthesize + confirm before you start.

---

## Questions Enforcement

### `questions: none`

Do not ask clarifying questions. Infer intent from the request and prior context. Make decisions, record them with `pm decide`, and proceed.

### `questions: medium` (default)

Ask clarifying questions scaled to change size:
- **Small changes:** 0-1 questions (only if genuinely ambiguous)
- **Medium changes:** 1-2 questions (scope, constraints)
- **Large changes:** 2-3 questions (approach, priorities, tradeoffs)

### `questions: thorough`

Ask more questions to ensure deep alignment:
- **Small changes:** 1-2 questions
- **Medium changes:** 2-4 questions
- **Large changes:** 3-5 questions covering goals, constraints, approach, tradeoffs, and priorities

---

## Decisions

Decisions are **always active**. There is no toggle. If a decision is wrong, remove it with `pm forget`.

### You MUST:
- Run `pm why "<keyword>"` before proposing solutions — check what was already decided
- Follow existing decisions unless the user explicitly overrides
- Record new decisions when you make non-obvious choices:
  ```bash
  pm decide <id> "What was decided" --reasoning "Why" --action "What to do"
  ```

### Conflict resolution:
1. Surface the conflict: "You previously decided X because Y. This new request would change that."
2. Let the user decide.
3. If overridden: `pm forget "old decision"`, then `pm decide` the new one.

---

## Sizing the Work

| Size | Signal | Action |
|------|--------|--------|
| **Small** | Quick fix, tweak, 1-2 files | `pm add-issue` |
| **Medium** | Feature, 3+ files, multiple steps | `pm add-feature` with phases/tasks |
| **Large** | System redesign, cross-cutting | `pm add-feature` with multiple phases |

**When in doubt, start with add-issue.** Upgrade if scope grows.

## Scope Rules

- Each task = focused unit, **1-3 files**, one logical change
- 4+ files = split into multiple tasks
- Distinct stages (design, implement, test) = separate phases
- PM warns at 4+ files per task — take the hint and split

## Task Lifecycle

```bash
pm start <id>
# ... do the work ...
pm done <id> --note "what changed"
```

Other lifecycle commands:
- `pm error <id> --note "what failed"` — mark failed
- `pm retry <id>` — re-queue failed task
- `pm review <id>` — submit for human review

## Status Commands

| Command | What it shows |
|---------|--------------|
| `pm list` | All features/issues with progress |
| `pm show <id>` | Detail view with decisions |
| `pm log` | Recent activity log |
| `pm recap` | Session briefing |
| `pm next` | Next pending task |

## Bridging External Plans

```bash
pm bridge <plan-file.md>             # Import plan
pm bridge <plan-file.md> --spec      # Also extract decisions
```

## Finishing Clean

**After your last task or issue is done, you MUST run `pm sweep` before ending the conversation.**

`pm sweep` auto-closes everything outstanding:
- Non-done issues → done
- In-progress/pending/error tasks → done
- Features with all tasks done but stale status → done
- Empty draft features → deleted

```bash
pm sweep
```

If it prints "All clean" — you're done. If it prints items it swept, verify the output makes sense (e.g. error tasks being closed should have been genuinely abandoned, not needing a retry).

**This is not optional.** Every conversation must leave pm in a clean state.

## Settings

```bash
pm settings                          # TUI: cycle planning/questions
```
