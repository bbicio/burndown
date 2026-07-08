---
name: audit-to-brief
description: Use when translating a closed, verification-only audit report into fix Briefs for /brainstorming — grouping findings into work cycles before writing any Brief content.
---

# Audit To Brief

## Overview

Takes a closed audit report (findings already verified, cited, root-caused — see the domain-audit skill) and turns it into one or more fix Briefs, one per work cycle. Does not re-audit: the findings are given, not re-derived from code. Distinct from feature-brief (raw request → Brief) — this skill's input is always an existing audit report.

## Step 1 — do not re-audit

Take the report's findings as closed input. Don't reopen "Ruled out" items, don't add new findings by reading code yourself, don't second-guess a finding's evidence — that's the domain-audit skill's job, already done. The only thing you re-derive is *grouping*, in Step 2.

## Step 2 — re-derive shared root cause yourself, per finding pair

Before grouping, go through the findings and independently ask, for every pair: do they share a root cause, or touch the same file/function? Do this even when the audit report already grouped or numbered them in a way that looks like an answer — the audit may have missed a connection, or grouped by discovery order rather than cause. Also classify each finding's *nature*: a correctness/consistency divergence (fits the audit-fix Scenario) versus something that reads more like a missing/new design decision (fits an evolution Scenario instead, per PROCESS.md §2's Scenario 2). Note this classification per finding — it drives which Brief template Step 4 uses.

## Step 3 — propose the grouping, then stop for confirmation

Present the proposed cycles as a numbered list, each with: which findings it covers, and the explicit reason (shared root cause / same file-function / distinct nature requiring separate treatment). Then ask the user to confirm, adjust, or merge before writing a single full Brief.

**Violating the letter of this rule is violating the spirit of it.** Writing a well-reasoned grouping is not the same as getting it confirmed — a grouping you find obviously correct is still a proposal, not a decision, until the user says so.

No exceptions:
- Don't write any full Brief (Problema/Comportamento/Vincoli/etc.) before the grouping is confirmed — a proposal with reasoning attached is not a substitute for stopping.
- Don't fold the confirmation question into the Briefs themselves ("here are the 3 Briefs, let me know if you'd prefer different grouping") — confirm the grouping first, then write.
- Don't skip confirmation because the grouping mirrors the audit's own structure — mirroring the source doesn't make it agreed.

| Excuse | Reality |
|---|---|
| "The grouping is obviously correct, given the evidence" | Obviously correct to you isn't confirmed. Propose, then stop. |
| "I already explained my reasoning inline" | Reasoning isn't confirmation. The user still has to answer. |
| "Writing all the Briefs is more efficient in one pass" | Efficiency for you isn't the point — a wrong grouping means rewriting every Brief in the batch. |

**Red flag:** if you're writing a second Brief's "Problema" section before the user has responded to the grouping proposal — stop.

## Step 4 — one Brief per confirmed cycle

For each confirmed cycle, produce a full Brief in the project's standard format (Problema, Comportamento attuale/atteso, Vincoli, Criteri di accettazione, Scope escluso esplicitamente), citing the specific finding IDs it covers.

- **Scenario mismatch:** if Step 2 classified a finding as design-natured rather than a correctness/consistency divergence, don't force it into the same audit-fix shape as the others — write that cycle's Brief using the evolution-scenario structure instead (read current behavior, propose alternatives rather than a single mechanical fix, flag the open design decision for `/brainstorming` to resolve). State explicitly, at the top of that Brief, why it differs in nature from the others.
- **REQUIRED section in every Brief:** an explicit reminder that any new finding discovered during this cycle's `/brainstorming` or execution must be isolated and proposed as its own future Brief, never folded into this cycle's fix — this is PROCESS.md's Scenario 3 guard, restated in each Brief rather than assumed.

## Common mistakes

- Deciding the grouping and writing all Briefs in one uninterrupted pass instead of stopping after the proposal (Step 3) — the most common failure, even when the reasoning behind the grouping is sound.
- Copying the audit report's own finding grouping/numbering as the cycle grouping without independently checking shared cause (Step 2).
- Writing a design-natured finding (e.g. a false-positive from a design choice, not a matching/consistency gap) into the same mechanical audit-fix template as the rest, instead of flagging it and using the evolution-scenario shape.
- Omitting the new-findings-isolation reminder from a Brief because "it's already in PROCESS.md" — it must be restated in the Brief itself.
- Re-opening or re-evaluating findings the audit already closed, instead of treating the report as fixed input.
