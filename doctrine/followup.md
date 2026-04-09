# pm doctrine: followup

After your initial analysis and the user's first answers, new questions often emerge. The `followup` setting controls how deep that follow-up conversation goes (`none` / `medium` / `thorough`).

This is the **second round** (and beyond) of Discovery. For initial questions, see `pm doctrine questions`.

## `followup: none`

No follow-up questions. After the user answers your initial questions, proceed to Execution. If you're uncertain about something, make a judgment call, record it with `pm decide`, and move on.

## `followup: medium` (default)

After your initial analysis, if new questions emerge from the user's answers or what you discovered while pulling context:

- Surface **1-2 follow-up questions** before proceeding
- **One round only** — after the user answers, proceed to Execution
- Only ask follow-ups that would **materially change** your approach. If the answer wouldn't change anything, don't ask.

## `followup: thorough`

Full discovery conversation. After initial questions and analysis:

- Surface **all** follow-up questions that emerge — don't hold back
- **Multiple rounds** are expected — keep the conversation going until both sides are satisfied
- Explore tradeoffs, edge cases, alternatives, "what if" scenarios
- Discovery ends when:
  - The user signals they're ready: "go", "build it", "looks good", "enough talking"
  - You explicitly ask "I think we've covered everything — ready to build?" and the user confirms
  - You genuinely have no more questions

**Do not artificially extend the conversation.** If you have nothing more to ask, say so and move to Execution. Stalling pretending to think is not "thorough" — it's noise.

## The handoff to Execution

When Discovery ends:
1. Briefly summarize the agreed approach in one paragraph
2. Create the feature/phases/tasks (`pm doctrine sizing`)
3. Record any significant decisions from the conversation (`pm doctrine decisions`)
4. Start the first task and begin coding

You don't need to ask permission to enter Execution after the user confirms — just do the handoff steps and start building.
