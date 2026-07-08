---
name: domain-audit
description: Use when asked to audit a codebase/domain area for consistency, correctness, or divergent behavior (not a security vulnerability audit) — before reading any code for the audit.
---

# Domain Audit

## Overview

Guides a verification-only audit of a domain area (data correctness, business logic, UI/behavior consistency) to a report with cited, root-caused findings. Not a fixed taxonomy — each audit's finding categories and severities are its own call. Distinct from a security audit (vulnerabilities, credentials, injection): use the project's security-review skill for that instead.

## Step 1 — negotiate scope before reading any code

Before opening a single file, ask the user explicitly:

> "What's the scope — which files/areas, what counts as a finding here, anything explicitly out of bounds, and is there a ground truth (a spec, a doc, a prior audit) to check against, or is this open-ended?"

**Violating the letter of this rule is violating the spirit of it.** A request that already names a file or a "known divergence" is still not a scope — the user's mental scope and the literal text of the request are not the same thing, and only the user can close that gap.

No exceptions:
- Don't start reading code "just to see what's there" before this is answered — that's already doing audit work under an unconfirmed scope.
- Don't treat a vague tip ("check X, something seems off") as sufficient scope — ask what "off" means and how far to look.
- Don't skip this because the file/area is small — small scope still needs confirmed boundaries.

| Excuse | Reality |
|---|---|
| "They already named the file, scope is obvious" | Which functions, what counts as a finding, and what ground truth to check against still aren't. Ask. |
| "It's a quick look, not a full audit" | Every audit was a quick look until it produced 4 findings. Ask first, look after. |
| "I'll scope it myself and just state my assumption" | Stating an assumption isn't the same as getting it confirmed before work starts. |

**Red flag:** if you're reading a second file, or already forming a finding, before the user answered the scope question — stop and ask.

## Step 2 — evidence standard: no claim without a citation

Every finding and every "checked, no divergence" note must cite `file:line` (or a line range) for each claim about what the code does. Quote the actual code, not a paraphrase, when the claim is about specific behavior. If you haven't opened the file at that location in this session, you don't have a citation — go read it.

## Step 3 — root cause, not just symptom

Before classifying a finding, explain *why* the divergence exists, not only *what* it is. If you can't answer why, keep tracing (read the caller, the sibling implementation, the history) until you can, or state explicitly that the root cause wasn't identifiable and why.

## Step 4 — never fix during an audit

An audit produces a report, not a diff. When a finding looks like a one-line fix: describe the fix as part of the finding's write-up if useful, but do not apply it. This holds even for findings that feel obviously safe to fix in passing — "obviously safe" is a judgment for the fix cycle (with its own review/testing), not for the audit.

## Step 5 — isolate out-of-scope discoveries in their own section

An audit surfaces things beyond its negotiated scope (Step 1) — a second file with the same bug, an unrelated pattern that looks wrong. These go in a dedicated section of the report (e.g. "Out of scope / roadmap notes"), separate from the main findings list — not folded in as an extra finding, not labeled inline and left in place among the in-scope items. The report must have this section explicitly, even if it says "None."

## Report structure

Match the style already used in this repo's `docs/superpowers/audits/*.md`: a Scope note, a Method section, Findings (each with Type, Severity, Location, Evidence, Description — categories are this audit's own choice, not fixed), a "Ruled out" section for checked-but-not-divergent patterns, the dedicated out-of-scope/roadmap section from Step 5, and — as the last line of the report itself, not a separate message — Step 6's Next step line.

## Step 6 — REQUIRED: close with the Next step line

The report is not complete without this. The literal last line of every report produced by this skill, after the out-of-scope/roadmap section, with nothing after it:

`Report ready. Next step: audit-to-brief to translate the findings into fix cycles, or stop here if the audit doesn't call for immediate fixes.`

This is a fixed step, not optional trailing advice — treat it with the same weight as Steps 1-5, not as commentary appended after the "real" report is done. It applies to every audit this skill produces, unconditionally: unlike Step 1's scope negotiation, it does not depend on any upstream classification.

The line is a suggestion, not an action: state it and stop. Never invoke `audit-to-brief` yourself.

## Common mistakes

- Starting to read code before the user has confirmed scope (Step 1) — the most common failure; a named file or a vague tip is not a negotiated scope.
- Reporting a symptom without tracing to why it happens (Step 3).
- Fixing a "one-liner" while auditing instead of only describing it (Step 4).
- Labeling an out-of-scope discovery inline as "(informational)" inside the main findings instead of moving it to its own section (Step 5).
- Inventing a fixed severity/category schema up front instead of letting it fit the domain being audited.
- Ending the report without the standalone Next step line.
