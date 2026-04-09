# pm doctrine: recovery

When pm gets into a stuck state — usually because a previous session was killed mid-work, leaving counters or in-progress tasks behind — this is how you unstick it.

## Symptoms of stuck state

- pre-edit hook blocks edits even though you just started
- "Issue has grown to N files" block when you haven't touched anything yet
- "Feature was upgraded but only has 0 tasks" block on a feature you didn't create in this session
- `pm next` returns a task you don't recognize
- `pm recap` shows in-progress work you didn't start

These are all symptoms of leftover state from a prior session that was interrupted.

## First step: pull context

Before resetting anything, understand what's there:

```
pm recap
pm list
pm log 20
```

If the leftover work is genuinely from a prior session and you're now doing unrelated work, you can safely close it. If it looks like work-in-progress that the user might want to continue, **ask the user first**.

## Closing leftover work

The cleanest path: `pm sweep`. This closes everything outstanding (see `pm doctrine sweep`). Use this when you're confident the prior session's work is done or abandoned.

If `pm sweep` doesn't fully clear the block, use `pm cleanup` (run `pm help` for flags). Cleanup is more aggressive — it can reset stuck error tasks and orphan drafts.

## Resetting scope counters

Scope counters live in `.pm/session.json`. If the file is stale (the active task it references was closed by sweep/cleanup), the next pre-edit will reset it automatically. If it isn't resetting, you can delete `.pm/session.json` directly — pm will recreate it on the next edit.

**Don't delete `.pm/data.json`.** That's the project history. Only `.pm/session.json` is safe to wipe.

## Upgraded-feature blocks

If you hit "BLOCKED: Feature was upgraded but only has N tasks", the feature was previously upgraded from an issue and the agent that did the upgrade didn't add enough follow-up tasks. To unstick:

1. Check whether the work is genuinely incomplete. If yes, add the missing tasks (run `pm help` to see `pm add-task`).
2. If the work was actually finished and the upgrade was bookkeeping noise, sweep the feature done.

## When to surface to the user

Recover silently when:
- The leftover state is clearly from a killed prior session
- The current work is unrelated
- Sweep/cleanup resolves it cleanly

Surface to the user when:
- The leftover work looks like an in-progress feature they care about
- You don't understand what state pm is in
- Recovery requires deleting decisions or modifying `data.json`

## After recovery

Once you've unstuck the state, **log your current work properly** before continuing edits. Don't recover-and-edit in one motion. The pre-edit hook still blocks edits without active work — recovery doesn't bypass that, it just clears stale state so you can re-log fresh.
