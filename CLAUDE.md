<!-- PM:INSTRUCTIONS:START -->
## Task Tracking — pm

This project uses `pm` to plan and track all work. **You MUST log work in pm before starting. No exceptions.**

### Rules
- **Before ANY work — log it in pm first.** Every fix, feature, and change gets tracked. There is no "too small" — if you're editing code, log it first.
- **Workflow:** `pm add-feature` (any work with 2+ tasks) or `pm add-issue` (standalone one-off fix) → do the work → `pm done <id> --note "..."`
- **Features need phases and tasks.** After `add-feature`, always `add-phase` then `add-task` for each piece of work.
- **When asked about recent work, features, or project status** — always check pm first (`pm list`, `pm log`, `pm show <featureId>`)
- **`pm` CLI is the only source of truth for tasks** — never store or read task state from CLAUDE.md
- **Run `pm help` before using any command** — do not guess command names or argument signatures
- **Fall back to git or other tools only if pm has no relevant info**
<!-- PM:INSTRUCTIONS:END -->
