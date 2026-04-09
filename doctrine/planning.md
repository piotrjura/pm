# pm doctrine: planning

How and when to plan before writing code. Governed by the `planning` setting (`none` / `medium` / `all`).

## Prompt-level overrides

Settings define the **default** depth. The user's prompt always wins.

**Skip signals** — bypass planning regardless of settings:
- "quick fix", "quick change", "just do it", "no planning", "skip planning"
- "don't ask questions", "just build", "go ahead"
- Any clear urgency or triviality signal

**Deepen signals** — do full planning even at `planning: none`:
- "let's think about this", "plan this out", "what do you think"
- "I want to discuss", "help me figure out"
- Any clear "I want a conversation" signal

When you detect an override, briefly acknowledge it ("Skipping planning per your request" / "Going deep on this one") then follow the override.

**Default with no signal:** follow the settings exactly.

## `planning: none`

No mandatory planning. Size the request, log it (`pm doctrine sizing`), start coding.

## `planning: medium` (default)

**Small changes** (1-2 files, quick fix) — no mandatory planning. Log and go.

**Medium/large changes** (3+ files, multi-step, new feature) — **mandatory planning flow**:

1. **Pull context.** Run these and read the output:
   - `pm recap` — what's active, what was just done
   - `pm why "<keyword>"` — try 2-3 keywords related to the work
   - `pm list` — overall state
2. **Synthesize and present** — before creating any tasks, tell the user:
   - **Goal:** What are we building? (1-2 sentences)
   - **Prior context:** Relevant decisions, past work, constraints found in step 1
   - **Approach:** How you'll implement (bullet points)
   - **Conflicts:** Any contradictions with prior decisions
   - **Open questions:** What the user needs to decide
3. **Wait for confirmation.** You MUST NOT create tasks or edit code until the user confirms or adjusts your plan.
4. **Structure.** Create feature/phases/tasks (`pm doctrine sizing`).
5. **Record decisions.** Any choices from planning (`pm doctrine decisions`).

## `planning: all`

**Every change**, regardless of size, gets the full flow above. Even a one-file fix:
1. Pull context (`pm recap`, `pm why`, `pm list`)
2. Synthesize and present
3. Wait for confirmation

**You MUST NOT skip any step.** Do not judge that a change is "too small" for planning when `planning: all` is set. The user explicitly chose this rigor.

## Discovery vs Execution

Planning lives entirely in **Discovery** (phase 1 of the two-phase workflow). During Discovery you do not create tasks, do not edit files, do not run code-writing commands. Discovery ends when the user confirms the approach.

After confirmation, you enter **Execution**: create tasks, then work autonomously. Don't interrupt with questions unless you hit a genuine blocker that you cannot resolve yourself.

## Why this exists

Without mandatory planning, agents skip context-gathering and re-derive decisions that already exist. The whole point of pm is that decisions and prior work persist across sessions — but only if you actually pull them before deciding what to do next.
