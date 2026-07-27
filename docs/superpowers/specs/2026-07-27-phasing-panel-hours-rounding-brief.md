# Brief — Fix Phasing Panel Hour Rounding

**Scenario:** Audit → fix (Scenario 3 per `docs/superpowers/PROCESS.md` §2). Source: `docs/superpowers/reports/2026-07-27-vue-migration-roadmap-cold-review.md`, "Cycle D" (phasing-panel rounding item). First of the two-Brief split confirmed with the user for Cycle D — the second (Export XLS) is a separate Brief, unrelated root cause.

## Problem

`costgrid.html`'s phasing panel displays hour totals rounded to the nearest tenth of an hour, inconsistent with both existing hour-formatting conventions already present elsewhere in the codebase:

- `phasingFmtHours(n)` (`costgrid.html:1102`): `return (Math.round(n * 10) / 10) + ' h';` — e.g. 0.25h displays as "0.3 h".
- `fmtH(n)` (`js/core.js:297`, the generic app-wide hour formatter): `return (n !== null && n !== undefined) ? n.toFixed(2) + 'h' : '—';` — exact 2-decimal display, no rounding, e.g. 0.25h displays as "0.25h".
- `cfgFmtHours(n)` (`js/lib/cfg-parse.js:18-24`, used for XLS-imported actuals): snaps to the nearest quarter-hour via `roundToQuarterHour()`, since actuals are always in `.00`/`.25`/`.50`/`.75` increments.

Confirmed pre-existing (not a Vue-migration regression) via `git blame`/`git show` on the pre-migration source during the `costgrid.html` cycle's own report. Confirmed via user decision (this Brief): the phasing panel should match `fmtH()`'s exact-2-decimal convention, not `cfgFmtHours()`'s quarter-hour-snap convention — the phasing panel shows aggregated monthly totals (sums across multiple tasks/roles), which don't necessarily land on quarter-hour boundaries even when individual task entries do.

## Current behavior

`phasingFmtHours(n)` (`costgrid.html:1102`) is called from two template sites (`costgrid.html:338`, `356`) to display the phasing panel's total-hours summary line and each month's hours row. It rounds to the nearest tenth of an hour before appending `' h'` (with a leading space), e.g. `0.25` → `"0.3 h"`, `1.333` → `"1.3 h"`.

## Expected behavior

`phasingFmtHours(n)` displays hours with the same exact-2-decimal precision as the app-wide `fmtH()` function, with no rounding to tenths. Reuse `fmtH()` directly (already loaded globally via `js/core.js` on `costgrid.html`) rather than reimplementing its logic — e.g. `phasingFmtHours(n) { return fmtH(n); }`. This changes the displayed format from `"0.3 h"` (rounded, space before unit) to `"0.25h"` (exact, no space before unit) — matching `fmtH()`'s own established format exactly, including the lack of space, per the user's explicit choice to align with that convention rather than inventing a phasing-panel-specific variant.

## Constraints

- Reuse the existing global `fmtH()` (`js/core.js:297`) — do not reimplement 2-decimal formatting logic separately in `costgrid.html`.
- Do not change `phasingFmtAmount()` (the adjacent currency formatter, `costgrid.html:1101`) or any other phasing-panel formatter — only `phasingFmtHours()` is in scope.
- Do not touch `cfgFmtHours()` (`js/lib/cfg-parse.js`) or any of its callers — that function's quarter-hour-snapping behavior is correct for its own use case (XLS actuals) and is explicitly not being changed or applied here.
- `fmtH(n)` returns `'—'` for `null`/`undefined` input; confirm this fallback is acceptable for the phasing panel's call sites (both currently assume a numeric input, defaulting via `|| 0` at the call sites — `phasingByMonth.hours[mo] || 0` — so `n` is never actually `null`/`undefined` in practice, but the behavior should be verified, not assumed).

## Acceptance criteria

- [ ] `phasingFmtHours(0.25)` returns `"0.25h"` (not `"0.3 h"`).
- [ ] The phasing panel's total-hours summary line (`costgrid.html:338`) and each month's hours row (`costgrid.html:356`) both display exact 2-decimal hour values, matching `fmtH()`'s format.
- [ ] `npm test` passes with no regressions.
- [ ] Manual smoke check: open the Proposal Phasing panel on a cost grid with tasks that have fractional-hour totals (e.g. 0.25h, 1.333h aggregated) and confirm the displayed values are exact (2 decimals), not rounded to the nearest tenth.

## Explicitly excluded scope

- The Export XLS `ExcelJS is not defined` bug — a separate Brief (different root cause, different files).
- Every other item from the cold-review's backlog (Cycle B1/B2, already closed; Cycle C, already closed; the `initNav()` gap; the static-file documentation gap; the FOUC/`v-cloak` finding from the `pipeline-version-management` cycle).
- Any change to `cfgFmtHours()`, `fmtH()` itself, or any other hour-formatting function beyond `phasingFmtHours()`.

## Required reminder (new-findings guard)

Any new finding discovered during this cycle's `/brainstorming` or execution — another inconsistent hour-formatting call site, an unrelated display bug noticed in the phasing panel — must be isolated and proposed as its own future Brief, never folded into this cycle's fix.

---

Brief ready. Next step: /brainstorming.
