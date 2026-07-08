# Finish-cycle report — fix/planning-monthly-pulse

**Date:** 2026-07-08
**Branch:** fix/planning-monthly-pulse → main

## What was done

2 commits, merged fast-forward into main:

- `40eb6b3` — feat(planning-calc): add distributeFutureResidual shared future-distribution helper
- `1998998` — fix(planning): unify Monthly Pulse threshold, distribution, and placement across all three views

This is **Ciclo 3 of 3**, the final cycle of the Resource Planning audit. Fixed Findings 4 + 5, plus a third divergence found during brainstorming (not in the original audit brief): by-owner's Monthly Pulse mode reimplemented by-role/by-project's already-correct logic a third time and diverged on every axis —

- **Finding 4 (threshold):** by-role/by-project activate the pulse based on a canonical, task-stable future-week count; by-owner used the *visible* window's week count instead, so the threshold could flip as the user paged through the calendar.
- **Finding 5 (distribution formula):** by-role/by-project split a month's total proportional to how many calendar weeks fall in that month; by-owner divided equally across all future months regardless of week count.
- **Placement (found in brainstorming):** by-role/by-project place the aggregated cell on the month's first week (matching PRD.md's documented behavior); by-owner placed it on the last week.

Root cause turned out simpler than the audit brief anticipated: by-owner already computed the canonical week count and already used it correctly in its non-pulse branch — the pulse branch just never reused it. Rather than patch by-owner's three symptoms individually, extracted one shared, pure, fully-tested function `distributeFutureResidual(residualH, totalFutureWeeks, weeksByMonth, pulseEnabled)` into `js/lib/planning-calc.js`, and made all three views call it — eliminating the divergence class entirely rather than fixing three separate copies of the same bug pattern. The now-dead `countFutureTaskMonths()` helper and two now-dead local variables were removed as directly-adjacent cleanup.

## Code review follow-ups

None. This cycle ran under `subagent-driven-development` rather than `/finish-cycle`'s own Gate 3: both task reviews returned zero blocking findings (Task 1: zero findings at all; Task 2: one trivial cosmetic Minor — a leftover comment referencing a removed local variable by name, substantively still true, no functional impact), and a separate final whole-branch reviewer (opus) also returned zero Critical/Important findings, independently re-deriving the by-role/by-project preservation math by hand and confirming "Ready to merge: Yes."

## Roadmap notes

Two Minor, non-blocking observations from the final whole-branch review, carried forward:

1. **By-role's leftover comment** (already noted in Task 2's own review) still names the removed local `hPerWeek` — cosmetic only, the underlying rationale it describes is still accurate (now inside `distributeFutureResidual`).
2. **Dead duplicate logic in root `app.js`** (confirmed unreferenced by any HTML/`nginx.conf`, not served): still contains `countFutureTaskMonths` and the full divergent by-owner last-week/equal-split pulse block — the last physical copy of exactly the divergence this cycle eliminated across all three live cycles. Candidate for deletion in a future cleanup, not this branch's job.

**This closes the 3-cycle Resource Planning audit** (Ciclo 1: `timesheets.js` column mapping; Ciclo 2: `matchesTaskRole`/`computeResidual`; Ciclo 3: `distributeFutureResidual`). Two loose threads remain open across the whole audit, neither blocking this closure:

1. **`js/ai.js` planning-logic divergence** (flagged at the end of Ciclo 2): live code, used for AI-analysis context on `planning.html`/`portfolio.html`, independently reimplements task+role matching/residual logic — still case-sensitive, still crash-exposed on a missing task name. Deliberately untouched across all three cycles (spec scope was always the three `planning.js` render functions specifically). Real, previously-undetected risk; candidate for a future audit/fix cycle of its own.
2. **Dead `app.js`/`main.js` legacy monoliths**: confirmed across all three cycles to contain stale, unreferenced copies of the exact logic each cycle fixed (column mapping, matching/residual, and now Monthly Pulse). If confirmed fully retired, deleting them would remove the last place this entire bug class can hide and prevent future confusion for anyone grepping the codebase.

## Sync-docs outcome

- **PRD.md** — updated: §5.3 now describes the shared `distributeFutureResidual` helper (canonical week-count threshold, proportional-to-weeks distribution, first-week placement, no per-view divergence possible anymore), and all stale line references in that section were refreshed to match the post-refactor file (a consistent ~9-line shift from the removed `countFutureTaskMonths` function affecting every reference below it).
- **CLAUDE.md** — updated: extended the `planning-calc.js` file-structure entry with `distributeFutureResidual`'s behavior, what it replaced in by-owner, and the `countFutureTaskMonths()` removal.
- **ARCHITECTURE.md** — not updated: contains no `planning.js` implementation detail for this fix to touch (consistent with Ciclo 1 and Ciclo 2's sync-docs outcome).
- **TEST_CASES.md** / **test-cases.html** — updated: added PL-09 (threshold consistency independent of visible window), PL-10 (matching monthly totals), PL-11 (cell placement consistency).
- **test-api.js** — not updated: no new API endpoint, no auth-rule change.
