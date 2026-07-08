---
name: feature-brief
description: Use when turning a raw, natural-language feature request into a structured Brief for /brainstorming — before scoping a new feature or a change to existing behavior, especially when the request is vague or its scope isn't obvious.
---

# Feature Brief

## Overview

Converts a raw request into a structured Brief with fixed sections, so nothing gets forgotten — especially excluded scope, the main guard against scope creep. The Brief is the *input* to `/brainstorming`, not a replacement for it: alternatives, trade-offs, and open-question resolution stay in `/brainstorming`.

## Step 1 is always the classification question — never inferred

Before reading code, before writing a single section, ask the user explicitly:

> "What kind of request is this — a new feature, an evolution of an existing feature, or something else (e.g. an audit finding)?"

**Violating the letter of this rule is violating the spirit of it.** A request that *looks* unambiguous is still the user's call, not yours — classification determines which sections the Brief needs (see below), and guessing wrong means rewriting the Brief later.

No exceptions:
- Don't classify it yourself because the wording "clearly" describes one case.
- Don't classify it yourself to "save a round-trip."
- Don't classify it yourself and mention the classification as a statement — it must be a question the user answers, not a decision you announce.
- Don't start reading existing code before this question is answered — reading code is itself scenario-dependent work.

| Excuse | Reality |
|---|---|
| "The request obviously describes a new feature" | Obvious to you isn't confirmed by the user. Ask anyway. |
| "This is clearly an edit to existing code" | Requests can span both, or the user may know context you don't. They confirm, not you. |
| "Asking feels redundant here" | One question prevents producing the wrong Brief shape and redoing it. |
| "I'll classify it and just mention what I picked" | Stating a classification isn't asking. The user must answer before content is written. |

**Red flags — stop and ask instead:**
- You're about to write "current behavior" (or skip it) without having asked.
- You're reading source files to characterize existing behavior before the user answered.
- You've written a scenario label in the output before the user confirmed it.

If the answer is ambiguous, "I don't know," or doesn't map to one of the two scenarios below: ask again, this time offering concrete examples of what a Scenario 1 vs. Scenario 2 request looks like. Do not proceed on a guess.

If the answer is a third kind of request (e.g., a fix driven by an audit report's findings): stop. State that this falls outside this skill's scope and name the process that should handle it instead, if one exists. Do not produce a Brief. Close with the Next step line for this case (see Next step, below).

## Step 2 — sections by scenario

| Section | Scenario 1 (new feature) | Scenario 2 (evolution) |
|---|:---:|:---:|
| Current behavior | — | ✅ (read code first) |
| Expected behavior | ✅ | ✅ |
| Constraints | ✅ | ✅ |
| Acceptance criteria | ✅ | ✅ |
| Explicitly excluded scope | ✅ | ✅ |

**Scenario 2 only:** read the actual current implementation before writing "Current behavior" — cite concrete locations (file/function/line) for every claim. Never describe existing behavior from memory or inference; if you haven't read the relevant code yet, read it now.

## Step 3 — filling each section without inventing content

- **Current behavior** (Scenario 2): grounded in code just read, with citations. If the code doesn't answer a question the Brief needs, ask the user rather than guessing.
- **Expected behavior**: if the raw request doesn't specify enough to fill this in, ask targeted clarifying questions. Do not write plausible-sounding behavior the user never stated.
- **Constraints**: technical, process, or product constraints relevant to this change. Ask if none are apparent from context.
- **Acceptance criteria**: concrete and independently verifiable — each one should be checkable as done/not-done without further interpretation.
- **Explicitly excluded scope**: propose candidates based on what's adjacent to the request but not asked for — then get explicit user confirmation before treating any of them as final. Proposing is yours to do; deciding is not.

## Output

Fixed sections, operational tone, no narrative or filler prose. Section set depends on scenario (Step 2). End with any open questions intended for `/brainstorming` to resolve — the Brief surfaces them, it doesn't resolve them. Then the Next step line (below).

## Next step

Every response this skill produces ends with one explicit, standalone line naming what comes next — never left implicit inside a prose note or a section title.

- **Brief completed** (Scenario 1 or 2): `Brief ready. Next step: /brainstorming.`
- **Out-of-scope request** (Step 1's third case): `Next step: this falls outside feature-brief's scope — use audit-to-brief, starting from a closed audit report.`

This line is a suggestion, not an action: state it and stop. Never invoke `/brainstorming` or `audit-to-brief` — the skill's job ends at producing the line.

## Common mistakes

- Skipping the classification question because the request "obviously" fits one scenario — see the rationalization table above.
- Writing "Current behavior" from assumption instead of reading code.
- Deciding excluded scope unilaterally instead of proposing and confirming.
- Treating this skill as also doing `/brainstorming`'s job (exploring alternatives, resolving trade-offs) — it doesn't; it stops at a confirmed Brief.
- Mentioning `/brainstorming` only inline in a section title or closing note instead of the standalone Next step line.
