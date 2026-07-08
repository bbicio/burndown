# Planning Monthly Pulse By Owner Fix — Design Spec

**Source:** Resource Planning Audit, Finding 4 + Finding 5 (Ciclo 3 of 3)

## Problem

`js/planning.js` has Monthly Pulse logic (a display mode that aggregates a role's future residual hours into one cell per month, instead of one cell per week, when the hours-per-week would otherwise be a small fraction) in two of its three grouping views: by-role and by-project. Both are independently correct and identical in behavior: canonical `totalFutureWeeks`-based threshold, proportional-to-calendar-weeks monthly distribution, and placement on the month's first week. By-owner reimplements the same feature a third time, and diverges on every axis.

**Finding 4 — different activation threshold:**
- By-role/by-project activate the pulse when `hPerWeek < 1`, where `hPerWeek = residualH / totalFutureWeeks` and `totalFutureWeeks` is the task's own canonical remaining-weeks count (`countFutureTaskWeeks(tStart, tEnd, today)`, `js/planning.js:678`/`:1062`) — stable regardless of which date window is currently visible on screen.
- By-owner (`js/planning.js:1379`) activates when `roleTbp < taskWeeks.length` — but `taskWeeks` is the *visible* window's weeks, not the canonical count. `roleTbp < totalFutureWeeks` (the correct, equivalent condition to `hPerWeek < 1`) is not the same comparison as `roleTbp < taskWeeks.length`.

Effect: by-owner can activate/deactivate the pulse differently than by-role on identical data, and the threshold can flip as the user pages between months — violating the "stable regardless of view range" invariant the code comments declare elsewhere.

**Finding 5 — different distribution formula:**
- By-role/by-project: a month's aggregated total = `hPerWeek × (number of weeks of that month within the visible/task-overlap window)` — months with more calendar weeks get proportionally more hours.
- By-owner (`js/planning.js:1383`): a month's total = `roleTbp / totalTaskFm` — divided in equal shares across all future months, regardless of how many calendar weeks each one contains.

On identical input data, by-role and by-owner can show different monthly figures when the pulse is active — not from rounding, from a genuinely different distribution rule.

**Third divergence found during brainstorming, not in the original audit brief — placement:**
By-role/by-project place the pulse-aggregated cell on the month's **first** week (`js/planning.js:690` `firstWeek = m.weeks[0]`; `:1093` `m.firstWeek`) — this matches PRD.md's documented behavior ("aggregated into a single cell on the month's first visible week"). By-owner places it on the **last** week (`js/planning.js:1385`, `monthMap[mk][monthMap[mk].length - 1]`). Same root cause (by-owner independently reimplementing already-correct logic), same code block already being touched to fix Findings 4/5 — confirmed in scope for this cycle.

**Root cause is simpler than the audit anticipated:** by-owner already computes the canonical `totalTaskFw` (`js/planning.js:1373`, via the same `countFutureTaskWeeks()` by-role/by-project use) and already uses it correctly in its *non*-pulse (even-split) branch (`:1392`). The bug is that the pulse branch (`:1379-1390`) doesn't reuse it — no new canonical-week-counting capability needs to be added anywhere.

## Fix

New shared function in the existing `js/lib/planning-calc.js` (created in Ciclo 2 for `matchesTaskRole`/`computeResidual`):

```js
export function distributeFutureResidual(residualH, totalFutureWeeks, weeksByMonth, pulseEnabled) {
  const totalWeeks = weeksByMonth.reduce((s, m) => s + m.weekKeys.length, 0);
  const hPerWeek = totalFutureWeeks > 0 ? residualH / totalFutureWeeks
                 : (totalWeeks > 0 ? residualH / totalWeeks : 0);

  if (pulseEnabled && hPerWeek < 1) {
    return weeksByMonth.map(m => ({
      key: m.weekKeys[0],                   // month's first week, matching PRD-documented behavior
      hours: hPerWeek * m.weekKeys.length,   // proportional to calendar weeks in that month
      isPulse: true,
    }));
  }
  return weeksByMonth.flatMap(m => m.weekKeys.map(key => ({ key, hours: hPerWeek, isPulse: false })));
}
```

`weeksByMonth` is `[{ monthKey, weekKeys: [isoWeekStart, ...] }]` in chronological order — each caller groups its own weeks array by month before calling.

**By-role** (`js/planning.js:677-706`, the entire non-`monthlyDistribution` branch): replaced by grouping `futureWeeks` into `weeksByMonth`, calling `distributeFutureResidual(residualH, totalFutureWeeks, weeksByMonth, portfolioMonthlyPulse)`, then looping the returned entries into `roleMap[res.role][key]`. This is a pure extraction of already-correct code — verified behavior-identical via manual trace, not a behavior change.

**By-project** (`js/planning.js:1085-1105`, the equivalent branch): same replacement pattern. Also a pure extraction — by-project's existing logic is independently correct and identical in behavior to by-role's, confirmed during brainstorming (both use canonical `totalFutureWeeks`, first-week placement, and proportional-to-weeks distribution).

**By-owner** (`js/planning.js:1367-1400`): the `if (portfolioMonthlyPulse && roleTbp < taskWeeks.length) {...} else {...}` block is replaced by grouping `taskWeeks` into `weeksByMonth`, calling `distributeFutureResidual(roleTbp, totalTaskFw, weeksByMonth, portfolioMonthlyPulse)` (reusing the `totalTaskFw` already computed at `:1373`), then feeding each returned entry through the existing, untouched `distribute(roleWeekData[key].byOwner, hours)` per-owner proportional split. This fixes Findings 4, 5, and the placement divergence in one shared call. The now-unused `totalTaskFm` (`:1374`) is removed as directly-adjacent dead-code cleanup.

## Backward compatibility

- By-role and by-project's behavior is byte-identical after the refactor — the shared function is a verbatim extraction of their already-correct logic, not a rewrite.
- By-owner's behavior changes exactly as intended: pulse activation now uses the canonical week count (stable across the visible window, matching by-role/by-project), monthly totals are now proportional to calendar weeks (matching by-role/by-project), and the aggregated cell moves from the month's last week to its first (matching by-role/by-project and PRD.md).
- The per-owner proportional split (`distribute()` in by-owner, splitting each month/week's total hours across owners by their share of consumed actuals) is untouched — `distributeFutureResidual` only produces per-week/per-month *role*-level totals; owner-level splitting happens downstream exactly as before.

## Testing

New tests appended to the existing `js/lib/planning-calc.test.js` (vitest, no DOM needed — pure function):

```js
describe('distributeFutureResidual', () => {
  it('activates pulse based on canonical totalFutureWeeks, independent of the visible week window', () => {
    // residual 5h over 10 canonical future weeks = 0.5h/week (<1, pulse should activate)
    // even though the visible window (weeksByMonth) only covers 3 weeks total — this is
    // exactly the case the old by-owner bug (roleTbp < taskWeeks.length) got wrong:
    // 5 < 3 is false, so the old code would NOT have activated pulse here.
    const weeksByMonth = [{ monthKey: '202601', weekKeys: ['w1', 'w2', 'w3'] }];
    const result = distributeFutureResidual(5, 10, weeksByMonth, true);
    expect(result).toEqual([{ key: 'w1', hours: 1.5, isPulse: true }]); // 0.5 * 3 weeks
  });

  it('does not activate pulse when hPerWeek >= 1, regardless of visible window', () => {
    const weeksByMonth = [{ monthKey: '202601', weekKeys: ['w1', 'w2'] }];
    const result = distributeFutureResidual(20, 10, weeksByMonth, true); // hPerWeek = 2
    expect(result.every(r => !r.isPulse)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it('distributes proportional to calendar weeks per month, not equally per month', () => {
    // month1 has 2 weeks, month2 has 1 week — should NOT split 50/50
    const weeksByMonth = [
      { monthKey: '202601', weekKeys: ['w1', 'w2'] },
      { monthKey: '202602', weekKeys: ['w3'] },
    ];
    const result = distributeFutureResidual(1.5, 3, weeksByMonth, true); // hPerWeek = 0.5
    expect(result).toEqual([
      { key: 'w1', hours: 1.0, isPulse: true },  // 0.5 * 2 weeks
      { key: 'w3', hours: 0.5, isPulse: true },  // 0.5 * 1 week
    ]);
  });

  it('places the pulse-aggregated entry on the first week of the month, not the last', () => {
    const weeksByMonth = [{ monthKey: '202601', weekKeys: ['w1', 'w2', 'w3'] }];
    const result = distributeFutureResidual(1, 10, weeksByMonth, true);
    expect(result[0].key).toBe('w1');
  });

  it('falls back to even split across all weeks when pulseEnabled is false', () => {
    const weeksByMonth = [{ monthKey: '202601', weekKeys: ['w1', 'w2'] }];
    const result = distributeFutureResidual(1, 10, weeksByMonth, false); // hPerWeek = 0.1, but pulse disabled
    expect(result).toEqual([
      { key: 'w1', hours: 0.1, isPulse: false },
      { key: 'w2', hours: 0.1, isPulse: false },
    ]);
  });

  it('falls back to residual / visible-week-count when totalFutureWeeks is 0', () => {
    const weeksByMonth = [{ monthKey: '202601', weekKeys: ['w1', 'w2'] }];
    const result = distributeFutureResidual(4, 0, weeksByMonth, false);
    expect(result).toEqual([
      { key: 'w1', hours: 2, isPulse: false },
      { key: 'w2', hours: 2, isPulse: false },
    ]);
  });
});
```

This satisfies the brief's acceptance criteria: threshold consistency independent of the visible window (test 1 — using a visible window shorter than the canonical count, exactly reproducing the old by-owner bug's failure mode), matching monthly totals via the shared formula (test 3), and threshold invariance under paging — structural, since both by-role and by-owner call the same function with the same canonical `totalFutureWeeks`, the visible window can never affect the result. This suite *is* the "characterization test comparing pulse active/inactive across views" the brief asks for, expressed against the one shared function all three call sites use rather than against three separate DOM render passes.

**Not automated** (DOM-render call sites, same precedent as prior cycles' wiring tasks): the three call-site replacements in `js/planning.js`. Verified via manual code-trace confirming (a) by-role's and by-project's replacements produce output identical to their current inline logic — a pure refactor, not a behavior change — and (b) by-owner's replacement correctly reuses the already-computed `totalTaskFw`/`taskWeeks` and feeds `distributeFutureResidual`'s output through the existing, untouched per-owner proportional split.

## Explicitly out of scope

- Finding 1, 2, 3 (already closed, Ciclo 1 and Ciclo 2).
- The `js/ai.js` divergence flagged at the end of Ciclo 2 — remains an isolated, unresolved finding for a future decision, not touched here.
- `matchesTaskRole`/`computeResidual` (Ciclo 2) — unrelated to this fix, not modified.
- Any change to by-role's or by-project's *behavior* — both are extracted verbatim, not redesigned.
- Any broader redesign of by-owner's structure beyond aligning its pulse threshold, distribution formula, and cell placement to the shared, already-correct implementation.
