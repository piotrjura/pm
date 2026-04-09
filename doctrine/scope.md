# pm doctrine: scope

How pm enforces scope discipline. The core rule: an issue is small, a feature is structured, and growing past thresholds means upgrading immediately.

## Scope rules

- **Each task = focused unit, 1-3 files, one logical change**
- **4+ files** = split into multiple tasks
- **Distinct stages** (design, implement, test) = separate phases
- pm warns at 4+ files per task — take the hint and split

## Issue scope thresholds

pm tracks edits per active issue via `.pm/session.json`. When an issue exceeds a threshold, pm steps in:

| Threshold | Behavior |
|---|---|
| 3 edits on an issue | **Nudge** in prompt-context: "is this still a quick fix?" |
| 4 files on an issue | **Hard block** at pre-edit hook — must upgrade |
| 10 edits on an issue | **Hard block** at pre-edit hook — must upgrade |

When blocked, run `pm upgrade <issueId>` (use `pm help` to see flags). This converts the issue into a feature, preserves the title/description/decisions, and creates a retroactive done task representing the work already finished. You then **must** add at least 2 more tasks for the remaining work — pm will keep blocking edits until you do.

## Don't wait for the block

If you realize mid-work that something is bigger than expected, **upgrade proactively**. An issue that has changed 3 files is already suspicious. The block is a safety net, not a checkpoint to push against.

## Upgraded features

A feature that was upgraded from an issue (`upgradedFrom` field set) has stricter requirements:

- Must have at least 2 non-done tasks (not counting the retroactive task that captured the original issue work)
- Edits will be blocked until that minimum is met
- This forces you to actually break down the remaining work into pieces, not just slap a "feature" label on a single big task

## Why this exists

Without enforcement, agents start with `pm add-issue "fix the thing"` and end with 12 files changed under one label. The next session has no idea what was actually done, decisions get lost, and the work history becomes useless. The block is annoying on purpose — it forces structure when it matters.

## Sizing on entry

For how to choose between issue and feature when starting work, see `pm doctrine sizing`.
