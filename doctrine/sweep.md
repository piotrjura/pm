# pm doctrine: sweep

How to leave pm in a clean state at the end of a conversation. **This is not optional.**

## The rule

**After your last task or issue is done, you MUST run `pm sweep` before ending the conversation.**

`pm sweep` auto-closes everything outstanding:

- Non-done issues → done
- In-progress / pending / error tasks → done
- Features with all tasks done but stale status → done
- Empty draft features → deleted

If `pm sweep` prints "All clean" — you're done. If it prints items it swept, scan the output and verify the sweep makes sense (an error task being closed should have been genuinely abandoned, not needing a retry).

## Why this exists

Two reasons:

1. **Stuck work blocks future sessions.** A leftover in-progress task or non-done issue carries scope counters and edit history into the next conversation. The next session may then hit a hard scope block on work it didn't do.
2. **The session log is the project history.** A clean sweep at the end of every conversation makes `pm log` and `pm recap` honest. A messy sweep means future-you can't trust the logs.

## When to sweep

- **End of conversation** — always. If the user is wrapping up, sweep first.
- **Mid-conversation context switch** — if the user pivots to unrelated work, sweep the old work first.
- **After bridge import** — `pm bridge` can leave drafts; sweep them once you've structured the real work.

## What sweep does NOT do

- It doesn't run tests
- It doesn't commit code
- It doesn't push anything
- It doesn't make decisions for you — if a task is genuinely failed and needs human attention, leave it as `error` (don't sweep) and surface it to the user

## Combine with recovery if needed

If sweep can't close something because of weird state (orphaned counters, corrupt session.json), see `pm doctrine recovery` for the unstick procedure. Then run sweep again.

## Idempotent

Running `pm sweep` twice is safe. The second run will print "All clean". Use this to verify after a complex finish.
