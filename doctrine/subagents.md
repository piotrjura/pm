# pm doctrine: subagents

When and how to delegate exploration or implementation to a subagent. Subagents (Claude Code's `Agent` tool, Explore agent, Plan agent, etc.) keep your main context window clean and let you parallelize independent work.

This doctrine explains **when pm thinks you should delegate**. The mechanics of invoking a subagent are documented in your harness — pm doesn't dictate how to call them.

## Concrete trigger

pm tracks Read and Grep calls in the active task's session. When `reads + 2 × greps` reaches 3, the prompt-context hook surfaces a nudge. **That's the floor, not the ceiling** — if you can tell upfront that an investigation will take more than 2-3 tool calls, delegate before you start, not after the nudge fires.

Subagents can run on **Haiku or Sonnet** instead of Opus. Every read you delegate is Opus tokens you don't burn and context you don't pollute.

## When to delegate

**Yes, delegate** when:

- You're **about to make 3+ Reads** or **any broad Grep** for exploration. Spawn an Explore agent first, let it return a focused summary.
- You're investigating an **open-ended question** ("how does auth work in this app?", "where do we handle retries?") that would take 5+ tool calls to answer in the main context.
- You need to **plan a complex implementation** before writing code — spawn a Plan agent with the full problem statement and let it return a step-by-step strategy.
- Two or more **independent investigations** could run in parallel — spawn multiple agents in one message.
- The output of a search would otherwise **bloat your context** with raw file dumps you don't need to retain.

**No, do it directly** when:

- You know the exact file/path/symbol you need — read or grep it directly
- It's a one-shot lookup (one Read or one Grep)
- The result must be inspected before deciding the next step (don't delegate decision-making you should own)
- You're already inside Execution and just need to make a change

## Delegating during planning

Subagents are especially useful during the Discovery phase of planning (`pm doctrine planning`). When you're synthesizing context before presenting an approach, an Explore agent can do the heavy reading while you draft the plan structure. The agent returns a focused summary; you incorporate it into the synthesis the user sees.

This is the "superpowers but with control" angle — pm doesn't force you to spend the user's tokens on a giant exploration phase. You decide when to delegate and `pm settings` controls how aggressive planning is. Subagents are how you keep depth without bloat.

## Don't outsource synthesis

The agent does the **searching and reading**. You do the **deciding and synthesizing**. A prompt like "based on your findings, fix the bug" pushes the synthesis onto the agent — that's the wrong delegation. Instead: "find every place we read X, list the files and lines, return under 200 words." Then you read the report and decide.

## Don't delegate inside a tight loop

If you're going to make a series of dependent calls (read file A → decide → read file B based on A → decide), don't fire off subagents for each one. The overhead beats the benefit. Subagents shine when the work is independent or large.

## Recording the decision

If a subagent's report leads to a non-obvious finding or design choice, record it with `pm decide` (`pm doctrine decisions`). The next session won't have the agent's transcript — it will only have your decision record.
