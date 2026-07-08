# Finish-cycle report — fix/planning-matching-residual

**Date:** 2026-07-08
**Branch:** fix/planning-matching-residual → main

## What was done

2 commits, merged fast-forward into main:

- `6ece0df` — feat(planning-calc): add matchesTaskRole and computeResidual shared helpers
- `76625f8` — fix(planning): unify task+role matching across all three views, add To-be-planned tooltip

Two related defects from the Resource Planning audit (Findings 2 + 3) fixed in `js/planning.js`'s three grouping views (by-role, by-project, by-owner):

- **Finding 3 (matching inconsistency):** by-role and by-project used to crash (`TypeError`) on a task with no `name`; by-owner tolerated a missing name but compared both role *and* task name case-sensitively — a second divergence beyond what the original audit brief described (the brief only flagged task-name case-sensitivity, not role). Unified into a single, pure, tested `matchesTaskRole(record, taskName, role)` in a new `js/lib/planning-calc.js`, consumed identically by all three views: case-insensitive on both fields, null-safe on a missing task name (matches on role alone instead of throwing).
- **Finding 2 (aggregate residual-floor discrepancy):** the per-task residual floor (`Math.max(0, soldH - consumedH)`) can make an aggregate row's "To be planned" exceed "Sold − Actuals" when one task among several for a role is over-consumed. Decided during brainstorming, and documented in the spec, not to change the formula — reconciling it at the aggregate level would require touching future-week distribution logic that's out of scope until Ciclo 3. Instead: the formula was extracted verbatim into `computeResidual(soldH, consumedH)` (zero behavior change) and a static, always-present tooltip was added to all three views' "To be planned" column header explaining the discrepancy.

## Code review follow-ups

None. This cycle ran under `subagent-driven-development` rather than `/finish-cycle`'s own Gate 3: task reviewers approved both tasks with zero blocking findings, and a separate final whole-branch reviewer (opus) also returned zero Critical/Important findings, confirming "Ready to merge: Yes." No fixes were deferred as follow-up from that process.

## Roadmap notes

Three Minor, non-blocking observations surfaced by the final whole-branch reviewer, worth carrying into a future cycle:

1. **`js/ai.js` now diverges from the fixed planning views.** It's live (used on `planning.html`/`portfolio.html` for AI-analysis context) and independently reimplements the same task+role matching/residual logic — still case-sensitive, still crash-exposed on a missing task name. It was deliberately not touched this cycle (the spec named only the three `planning.js` render functions), but now produces different consumed/to-be-planned numbers than the on-screen planning tables for any project with case-mismatched actuals. Real, previously-undetected risk; candidate for a future audit finding.
2. **Dead-code copy in root `app.js`** (lines 3088–4059): a full pre-refactor copy of all three views' old matching/residual logic. Confirmed unreferenced by any HTML/JS, not served — a stale duplicate that could mislead future greps, not a runtime risk.
3. **Empty-string `task.name` behavior shift (theoretical):** for by-role/by-project, an empty-string task name previously required a literal `''` match; now `!taskName` treats it as missing and matches on role alone. This is the intended "missing name" semantics and effectively harmless (an empty task name is not meaningfully different from a missing one), noted for completeness only.

This is Ciclo 2 of 3 from the Resource Planning audit. Finding 4 and 5 (Monthly Pulse) remain for Ciclo 3.

## Sync-docs outcome

- **PRD.md** — updated: §5.3 now describes the shared `matchesTaskRole`/`computeResidual` helpers (case-insensitive, null-safe, used identically by all three views), refreshed line references, and documents the accepted aggregate "To be planned can exceed Sold − Actuals" discrepancy plus the new explanatory tooltip.
- **CLAUDE.md** — updated: added a `planning-calc.js` entry to the `js/lib/` file-structure block, matching the existing `cfg-parse.js` entry's style.
- **ARCHITECTURE.md** — not updated: it contains no `planning.js` implementation detail for this fix to touch.
- **TEST_CASES.md** — updated: added PL-06 (nameless task doesn't crash), PL-07 (cross-view case-insensitive matching), PL-08 (tooltip).
- **test-cases.html** — updated: mirrored PL-06/07/08.
- **test-api.js** — not updated: no new API endpoint, no auth-rule change.
