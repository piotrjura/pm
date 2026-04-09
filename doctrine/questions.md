# pm doctrine: questions

How many initial clarifying questions to ask before starting work. Governed by the `questions` setting (`none` / `medium` / `thorough`).

These rules cover the **first round** of questions, asked during Discovery (before any code or tasks). For follow-up questions after initial answers, see `pm doctrine followup`.

## `questions: none`

Do not ask clarifying questions. Infer intent from the request and prior context (`pm recap`, `pm why`). When you have to make a judgment call, make it, record it with `pm decide`, and proceed.

## `questions: medium` (default)

Ask clarifying questions scaled to change size:

| Size | Questions |
|---|---|
| Small (1-2 files) | 0-1 questions, only if genuinely ambiguous |
| Medium (3+ files) | 1-2 questions covering scope and constraints |
| Large (cross-cutting) | 2-3 questions covering approach, priorities, tradeoffs |

## `questions: thorough`

Ask more questions to ensure deep alignment:

| Size | Questions |
|---|---|
| Small | 1-2 questions |
| Medium | 2-4 questions |
| Large | 3-5 questions covering goals, constraints, approach, tradeoffs, priorities |

## What makes a good question

- **Actionable** — the answer changes what you build
- **Specific** — not "what do you want?" but "should errors retry or fail loud?"
- **Single-issue** — don't pack three decisions into one sentence
- **Honest about defaults** — if you have a strong default, state it: "I'd default to X — does that work, or do you want Y?"

## What makes a bad question

- Asking things you can find in `pm why`
- Asking the user to make decisions about implementation details that don't affect the outcome
- Asking permission to do something the user already asked for
- Long preambles before the actual question

## When in doubt

Err toward the setting. If `questions: medium` and the request is ambiguous, ask 1 question. If `questions: thorough` and the request is crystal clear, you can ask 0 — but say so explicitly: "This looks straightforward, no questions from me — proceeding."
