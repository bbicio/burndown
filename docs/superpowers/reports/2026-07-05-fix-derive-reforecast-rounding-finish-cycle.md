# Finish-cycle report — fix/derive-reforecast-rounding

**Date:** 2026-07-05
**Branch:** fix/derive-reforecast-rounding → main

## What was done

6 commits on the branch, merged via merge commit `3c5151c`:
- `1e98b03` feat(cfg-parse): add distributeHoursExact for exact-sum largest-remainder rounding
- `75df2cc` fix(config-form): Reforecast uses distributeHoursExact, no more per-month drift
- `44f52b0` fix(config-form): Derive uses distributeHoursExact, no more modal/save divergence
- `86c1229` fix(config-form): correct distributeHoursExact total mismatch in Derive, modal display in Reforecast
- `84980c9` fix(config-form): Reforecast distributes to rawFuturePlanning's own total
- `e5e11d2` refactor(config-form): rename rawFuturePlanning to futureRawHours

Deliverable: `distributeHoursExact(total, rawValues, grid=0.25)` in `js/lib/cfg-parse.js`, a largest-remainder rounding function guaranteeing the returned values always sum to exactly `roundToQuarterHour(total)`. Wired into both `cfgDerivePhasing` and `cfgReforecast` in `js/config-form.js`, eliminating the date/hours/rate consistency audit's F2-2 (Derive confirmation modal disagreeing with what actually gets saved) and F2-3 (Reforecast's per-month independent rounding causing a 7.4h→7.5h cumulative drift).

Code review (Gate 3, medium effort, 8 finder angles) caught a real regression before merge: Reforecast's original wiring passed an independently-computed `remainingHours` as the distribution target, which could diverge from what actually accumulated into future months by more than the function's 0.05h validation threshold — for ordinary cases (a task whose actuals exceed its sold hours, or any `monthlyDistribution` task landing in the already-accepted 99.5–100.5% tolerance band), not a rare edge case. This caused an uncaught throw that would have silently broken Reforecast for common real-world projects. Fixed by targeting the distribution's own accumulated total instead — the same "single source of truth" pattern already applied to Derive.

## Code review follow-ups

Round 1 (8 finder angles) found 1 blocking finding (fixed and re-verified, see above) and 5 Minor findings. Of those, one (`rawFuturePlanning` naming, confusable with `cfgDerivePhasing`'s differently-guaranteed `rawPlanning`) was fixed immediately (commit `e5e11d2`). The remaining four were explicitly accepted as follow-up, with no correctness risk (verified: all are same-formula/same-data duplication, not divergence-prone like the finding that was fixed):

- Round 1: `distributeHoursExact` performs 4 internal passes over its input plus a sort where fewer passes would suffice — cosmetic, arrays are ≤36 items and calls are click-driven, not a hot path.
- Round 1: the caller and `distributeHoursExact` each independently recompute the same sum (`rawPlanningTotal`/`futureRawHoursTotal` vs. the function's internal `rawSum`) — redundant but mathematically guaranteed identical (same object, no intervening mutation), zero divergence risk.
- Round 1: `distributedRemainingHours`/`distributedFuture`'s total is recomputed by the caller via a fresh reduce over the object `distributeHoursExact` just returned — same reasoning, redundant but safe.
- Round 1: the 0.05h divergence epsilon in `distributeHoursExact` is a hardcoded absolute value, not scaled to `grid` — harmless today since both call sites use the default `grid=0.25`, but would need revisiting if the function is ever reused with a different grid (e.g. currency cents) without reconsidering the constant.

A fifth Round 1 finding — budget/phasing (currency) rounding not unified onto `distributeHoursExact` alongside hours — was confirmed as an intentional scope boundary, not a defect: the audit found no drift in the budget/phasing path, so it was left untouched by design, consistent with this cycle's stated out-of-scope list.

## Roadmap notes

- Gate 2's spec/plan search mechanism again found zero candidates in this branch — the design spec and plan for this fix were committed to `main` before the feature branch was opened (same known blind spot already flagged in the previous cycle's report). Still not blocking (the gate correctly asked for explicit manual-verification confirmation regardless), but reinforces the case for a future `/finish-cycle` refinement to also search `docs/superpowers/specs/`/`docs/superpowers/plans/` by date, not just by branch membership.
- The other two findings from the original date/hours/rate consistency audit — the XLS date-parser validation gap (`timesheets.js:193-194`) and the missing sold-hours input-set validation (no technical constraint enforcing {integers, 0.25, 0.4, 0.75}) — remain untouched, as explicitly scoped out of this cycle from the start.
- `app.js` at the repo root was reconfirmed dead code during this cycle's code review (contains near-identical, unloaded copies of `cfgDerivePhasing`/`cfgReforecast`) — already flagged as a cleanup candidate in an earlier session, not re-actioned here since it was out of scope.

## Sync-docs outcome

- **ARCHITECTURE.md** — updated: added `distributeHoursExact` to the `cfg-parse.js` description, noting the modal-vs-save consistency guarantee.
- **CLAUDE.md** — updated: same addition, with the algorithm detail (largest-remainder, divergence threshold, tie-break) for readers of the file-structure section.
- **TEST_CASES.md** — updated: REG-14 corrected (it previously described `roundToQuarterHour` as if it were the Reforecast distribution mechanism itself, rather than the low-level primitive `distributeHoursExact` now builds on); added REG-15/REG-16 for the two fixed bugs, using the same IDs already present in `js/lib/cfg-parse.test.js`.
- **test-cases.html** — updated to mirror TEST_CASES.md exactly (same REG-14/15/16 content); script syntax verified with `node --check`.
- **test-api.js** — not updated: no new API endpoints or auth changes in this cycle.
- **PRD.md** — evaluated explicitly, updated: §7.1's "Rounding" row said Derive's rounding was "None specified," which was already inaccurate and became clearly so once Derive started explicitly rounding via `distributeHoursExact`; also updated Reforecast's row to state the exact-sum guarantee. This falls under "update if the PRD's description was itself inaccurate," not "restore already-documented behavior."
