# pm doctrine: decisions

Decisions are the heart of pm. They are how context survives across sessions. **Decisions are always on — there is no toggle.**

If a decision turns out wrong, remove it with `pm forget`. The granularity is per-decision, not system-wide.

## You MUST

- **Run `pm why "<keyword>"` before proposing solutions.** Check what was already decided before re-deriving it. Try 2-3 keywords related to the task — don't search once and give up.
- **Follow existing decisions** unless the user explicitly overrides.
- **Record decisions proactively.** Not just "non-obvious" ones — any choice that a future session would benefit from knowing.

## When to record a decision

Record on `pm decide` when any of these happen:

- You chose approach A over approach B
- The user gave direction on how something should work
- You picked a library, pattern, or architecture
- You decided what NOT to do (and why)
- You made a tradeoff (speed vs correctness, simplicity vs flexibility, X vs Y)
- The user confirmed an approach ("yes, do it that way")
- You set a convention or constraint that future work should respect

## Decision checkpoints

Run through this list at these moments:

- **After planning:** Record any approach/architecture decisions from the discovery phase
- **After the user gives direction:** Record what they said and why — verbatim if it's terse
- **Before marking a task done:** Ask yourself — did I make any choices here that future-me wouldn't remember? Record them.
- **When the prompt-context hook nudges you:** It will surface a reminder if you're 3+ edits into work with zero decisions on the current item. Don't ignore it.

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

Without decisions, every session re-derives the same architecture, makes the same tradeoffs, and forgets why things were built a certain way. Decisions are 5-line records that save hours of rediscovery. They are cheap to write and expensive to lose. **Record more than you think you should.**
