# Fix Phasing Panel Hour Rounding — Design Spec

**Source:** Brief `docs/superpowers/specs/2026-07-27-phasing-panel-hours-rounding-brief.md`. First of the two-Brief split for the cold-review's Cycle D ("phasing-panel rounding" item) — the second (Export XLS) is a separate, unrelated Brief.

## Problem

`phasingFmtHours(n)` (`costgrid.html:1102`) rounds hour totals to the nearest tenth (`Math.round(n * 10) / 10`), inconsistent with the app-wide `fmtH()` (`js/core.js:297`), which displays exact 2-decimal values with no rounding. User decided (during `/brainstorming`) to align with `fmtH()`'s convention rather than `cfgFmtHours()`'s quarter-hour-snapping convention, since the phasing panel shows aggregated monthly totals that don't necessarily land on quarter-hour boundaries.

## Architecture

No architectural change — a single-line reuse of an existing global function.

## Components

`phasingFmtHours(n)` (`costgrid.html:1102`) changes from:

```js
phasingFmtHours(n) { return (Math.round(n * 10) / 10) + ' h'; }
```

to:

```js
phasingFmtHours(n) { return fmtH(n); }
```

`fmtH` (`js/core.js:297`, `(n !== null && n !== undefined) ? n.toFixed(2) + 'h' : '—'`) is already loaded globally on `costgrid.html` via `js/core.js`'s `<script>` tag — no new import or dependency needed.

**Verified before writing this spec**: both call sites (`costgrid.html:338`, `356`) pass `phasingByMonth.hours[mo] || 0` or `phasingTotals.totalH`, both already-numeric (never `null`/`undefined` in practice, guarded by `|| 0`), so `fmtH`'s `'—'` fallback branch is unreachable here — no behavior change beyond the precision/rounding fix itself.

## Data flow

No change. Same inputs, same call sites, only the formatting output changes (exact 2-decimal instead of rounded-to-tenth, and no leading space before the unit — matching `fmtH()`'s own format exactly).

## Error handling

None needed — `fmtH()`'s existing null-safety is already appropriate and unreachable-but-harmless at these call sites.

## Backward compatibility

The only visible change is the displayed hour precision/format in the phasing panel's total-hours summary line and monthly hours row. No data, calculation, or API behavior changes — this is a pure display-formatting fix.

## Testing

Manual: open the Proposal Phasing panel on a cost grid with fractional-hour totals (e.g. a task with 0.25h, or an aggregated monthly total like 1.333h) and confirm exact 2-decimal display (e.g. "0.25h", "1.33h"), not rounded to the nearest tenth. `npm test` run as a sanity check — no existing test covers this function, so no pass-count change is expected.

## Explicitly out of scope

- The Export XLS `ExcelJS is not defined` bug — separate Brief, unrelated root cause.
- Every other item from the cold-review's backlog (already-closed Cycles B1/B2/C, the `initNav()` gap, the static-file documentation gap, the FOUC/`v-cloak` finding).
- Any change to `cfgFmtHours()`, `fmtH()` itself, or `phasingFmtAmount()`.
