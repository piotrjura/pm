# pm doctrine: decisions

Decisions are the heart of pm. They are how **project direction** survives across sessions — the strategic choices, constraints, and tradeoffs a future session would otherwise re-derive or violate. **Decisions are always on — there is no toggle.**

If a decision turns out wrong, remove it with `pm forget`. The granularity is per-decision, not system-wide.

## You MUST

- **Run `pm why "<keyword>"` before proposing solutions.** Check what was already decided before re-deriving it. Try 2-3 keywords related to the task — don't search once and give up.
- **Follow existing decisions** unless the user explicitly overrides.
- **Record decisions when they shape future work** — not every pick you make while coding.

## What qualifies as a decision

A decision is a choice that a **future session would need to know to act correctly**. The test: if a new session didn't know this, would it likely do the wrong thing?

Record on `pm decide` when:

- **You picked an approach or architecture over a real alternative.** There was more than one reasonable path; you took one. The other could resurface next session.
- **The user gave direction that isn't written in the code.** Strategy, positioning, constraints, "always do X" or "never do Y" rules. Especially if terse — record verbatim.
- **You made a tradeoff with stakes.** Speed vs correctness, simplicity vs flexibility, scope cuts. Not "I used a for-loop instead of map."
- **You decided what NOT to do.** Ruling options out is as load-bearing as ruling them in — and much easier to forget.
- **A constraint or convention was established.** "Never depend on X in this module." "All Y must go through Z." Rules that future work must respect.

## What does NOT qualify

Don't record these, even if the nudge fires:

- **Implementation picks with one obvious right answer.** Naming, file locations, library APIs you used as intended. The code is the record.
- **Task-local mechanics.** "I added this function to that file." That's a `--note` on `pm done`, not a decision.
- **Restatements of the task description.** If the issue says "add X," don't record "decided to add X."
- **Choices the user never weighed in on and had no real alternative.** If you'd make the same call 10/10 times and no future session would question it, it's not a decision.

When in doubt: **would a future session, not knowing this, plausibly do something different or wrong?** If no, skip it.

## Decision checkpoints

Run through this list at these moments:

- **After planning:** Record strategic choices that came out of Discovery — approach, scope boundaries, rejected alternatives.
- **After the user gives direction:** If they told you *how* or *why* something should work, record it — especially the terse, opinionated ones.
- **Before marking work done:** Ask — did this work establish a rule, cut scope, or rule something out that a future session would need to know? If yes, record it. If the work was just executing the plan, don't.
- **When the prompt-context hook nudges you:** It fires at 3+ edits with no decisions recorded. That's a prompt to *check*, not to record reflexively. If there's genuinely nothing strategic on this item, it's fine to leave it at zero.

## What makes a good decision record

A decision has three parts: **what**, **why**, **action**.

- **What** (`pm decide <id> "..."`): the choice itself, terse and concrete. Not "we'll use a database" but "use SQLite over Postgres for the local cache". Past-tense, declarative.
- **Why** (`--reasoning "..."`): the rationale. What tradeoff did you make? What were the alternatives? What constraint forced this? Future-you will not remember.
- **Action** (`--action "..."`): what future sessions should DO as a result. "Always use the SQLite cache for token lookups" or "Never add a Postgres dependency to the auth module." Optional but high-leverage.

A decision without a `--reasoning` is half-useful. A decision without an `--action` is harder to apply but still worth recording.

## Conflict resolution

When the user asks for something that contradicts a recorded decision:

1. **Surface the conflict.** "You previously decided X because Y. This new request would change that — is that intentional?"
2. **Let the user decide.** Don't quietly override the past decision. Don't quietly ignore the new request.
3. **If overridden:** `pm forget "<old decision text>"`, then `pm decide` the new one with the new reasoning.
4. **If preserved:** find another way to satisfy the request that doesn't violate the decision, or surface that you can't.

## Why this is the heart of pm

Without decisions, every session re-derives the same architecture, violates the same constraints, and forgets why things were built a certain way. A decision record that captures one load-bearing choice saves hours. A record that captures a trivial pick adds noise and makes the load-bearing ones harder to find. **Quality over quantity. Record the direction, not the drumbeat.**
