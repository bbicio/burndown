# Planning Monthly Pulse By Owner Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `js/planning.js`'s by-owner Monthly Pulse logic, which independently reimplements by-role/by-project's already-correct pulse activation threshold, monthly-distribution formula, and cell-placement rule, and diverges on all three. Unify all three views onto one shared, tested implementation.

**Architecture:** Extract a pure function `distributeFutureResidual(residualH, totalFutureWeeks, weeksByMonth, pulseEnabled)` into the existing `js/lib/planning-calc.js` (created in the prior cycle for `matchesTaskRole`/`computeResidual`). Wire it into all three render functions in `js/planning.js`, replacing each view's own inline future-distribution/pulse block. By-role's and by-project's blocks are extracted verbatim (pure refactor, no behavior change); by-owner's block is replaced with corrected logic that reuses its already-computed canonical week count.

**Tech Stack:** Vanilla JS (frontend). `vitest` for the new pure-function characterization tests, appended to the existing `js/lib/planning-calc.test.js`.

## Global Constraints

- `distributeFutureResidual(residualH, totalFutureWeeks, weeksByMonth, pulseEnabled)`:
  - `hPerWeek = totalFutureWeeks > 0 ? residualH / totalFutureWeeks : (totalWeeks > 0 ? residualH / totalWeeks : 0)`, where `totalWeeks` is the sum of `weekKeys.length` across all `weeksByMonth` entries.
  - If `pulseEnabled && hPerWeek < 1`: return one entry per month, `{ key: weekKeys[0], hours: hPerWeek * weekKeys.length, isPulse: true }` — the month's **first** week, hours proportional to that month's week count.
  - Otherwise: return one entry per week, `{ key, hours: hPerWeek, isPulse: false }`.
- `weeksByMonth` is `[{ monthKey, weekKeys: [isoWeekStartString, ...] }]`, weeks in chronological order within each month group.
- By-role's and by-project's behavior must be byte-identical after the refactor — this is a verbatim extraction of their already-correct logic, not a rewrite.
- By-owner's per-owner proportional split (`distribute(byOwner, hours)`) is untouched — `distributeFutureResidual` only produces role-level per-week/per-month totals; owner-level splitting happens downstream exactly as before.
- No change to `matchesTaskRole`/`computeResidual` (prior cycle, unrelated).
- No change to `js/ai.js` (a separately-flagged, out-of-scope divergence).
- No broader redesign of by-owner's structure beyond aligning its pulse threshold, distribution formula, and cell placement to the shared implementation.

---

### Task 1: `distributeFutureResidual` — characterization tests then implementation

**Files:**
- Modify: `js/lib/planning-calc.js`
- Modify: `js/lib/planning-calc.test.js`

**Interfaces:**
- Produces: `distributeFutureResidual(residualH, totalFutureWeeks, weeksByMonth, pulseEnabled) => Array<{ key: string, hours: number, isPulse: boolean }>`, exported from `js/lib/planning-calc.js` and bridged to `window.distributeFutureResidual`. Consumed by Task 2 (wiring into `js/planning.js`'s three render functions).

- [ ] **Step 1: Write the failing characterization tests**

In `js/lib/planning-calc.test.js`, append this block at the end of the file:

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

  it('returns an empty array when weeksByMonth is empty', () => {
    expect(distributeFutureResidual(5, 10, [], true)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: `planning-calc.test.js` FAILS with an error like "distributeFutureResidual is not defined" or "is not a function." The pre-existing `matchesTaskRole`/`computeResidual` tests still pass.

- [ ] **Step 3: Implement `distributeFutureResidual`**

In `js/lib/planning-calc.js`, add this after the existing `computeResidual` function (before the `window.*` bridge lines):

```js
export function distributeFutureResidual(residualH, totalFutureWeeks, weeksByMonth, pulseEnabled) {
  const totalWeeks = weeksByMonth.reduce((s, m) => s + m.weekKeys.length, 0);
  const hPerWeek = totalFutureWeeks > 0 ? residualH / totalFutureWeeks
                 : (totalWeeks > 0 ? residualH / totalWeeks : 0);

  if (pulseEnabled && hPerWeek < 1) {
    return weeksByMonth.map(m => ({
      key: m.weekKeys[0],
      hours: hPerWeek * m.weekKeys.length,
      isPulse: true,
    }));
  }
  return weeksByMonth.flatMap(m => m.weekKeys.map(key => ({ key, hours: hPerWeek, isPulse: false })));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests in `js/lib/planning-calc.test.js` PASS, including the new `distributeFutureResidual` block (7 tests), with no change to any pre-existing test.

- [ ] **Step 5: Add the `window.*` bridge**

In `js/lib/planning-calc.js`, add this line alongside the existing bridge lines at the bottom of the file:

```js
window.distributeFutureResidual = distributeFutureResidual;
```

- [ ] **Step 6: Commit**

```bash
git add js/lib/planning-calc.js js/lib/planning-calc.test.js
git commit -m "feat(planning-calc): add distributeFutureResidual shared future-distribution helper"
```

---

### Task 2: Wire `distributeFutureResidual` into all three planning views

**Files:**
- Modify: `js/planning.js:105-112` (remove now-dead `countFutureTaskMonths` function)
- Modify: `js/planning.js:676-706` (by-role future-distribution block)
- Modify: `js/planning.js:1085-1107` (by-project future-distribution block, including removal of its now-dead `hPerWeek` variable at line 1063)
- Modify: `js/planning.js:1367-1400` (by-owner future-distribution block, including removal of its now-dead `totalTaskFm` variable at line 1374)

**Interfaces:**
- Consumes: `distributeFutureResidual(residualH, totalFutureWeeks, weeksByMonth, pulseEnabled)` from Task 1, via the `window.distributeFutureResidual` bridge (`js/planning.js` is a classic, non-module script; `planning-calc.js` is already loaded as a `type="module"` script on `planning.html`, before `js/planning.js`, per the prior cycle's setup — no new script tag needed this task).
- Produces: nothing new for later tasks — this is the plan's final task.

- [ ] **Step 1: No automated test for this step — manual code-trace verification only**

All three call sites are inside large, DOM-string-building render functions with no existing test harness — same reasoning as the prior cycle's wiring task. The underlying logic (`distributeFutureResidual`) is already fully unit-tested in Task 1. Proceed directly to the implementation steps; manual verification happens in Step 5 below.

- [ ] **Step 2: Remove the now-dead `countFutureTaskMonths` function**

In `js/planning.js`, find this block (currently lines 105-112):

```js
// Count distinct future calendar months that overlap the task range.
function countFutureTaskMonths(tStart, tEnd, todayMidnight) {
  if (!tEnd || tEnd < todayMidnight) return 0;
  const effectiveStart = (tStart && tStart > todayMidnight) ? tStart : todayMidnight;
  const sYM = effectiveStart.getFullYear() * 12 + effectiveStart.getMonth();
  const eYM = tEnd.getFullYear() * 12 + tEnd.getMonth();
  return Math.max(0, eYM - sYM + 1);
}
```

Delete it entirely (its only caller, by-owner's `totalTaskFm`, is removed in Step 5 below — after that removal this function has no remaining callers anywhere in the file).

- [ ] **Step 3: Wire the by-role view (`js/planning.js`)**

Find this block (currently lines 676-706):

```js
        } else {
        // Use total task future weeks (not just visible) so hPerWeek is stable as the axis range changes.
        const totalFutureWeeks = countFutureTaskWeeks(tStart, tEnd, todayMidnight);
        const hPerWeek = totalFutureWeeks > 0 ? residualH / totalFutureWeeks : residualH / futureWeeks.length;

        if (portfolioMonthlyPulse && hPerWeek < 1) {
          // Monthly pulse: aggregate by month, show in first week of each month
          const byMonth = {};
          futureWeeks.forEach(w => {
            if (!byMonth[w.monthKey]) byMonth[w.monthKey] = { weeks: [], hours: 0 };
            byMonth[w.monthKey].weeks.push(w);
            byMonth[w.monthKey].hours += hPerWeek;
          });
          Object.values(byMonth).forEach(m => {
            const firstWeek = m.weeks[0];
            const key = firstWeek.weekStart.toISOString();
            if (!roleMap[res.role][key]) roleMap[res.role][key] = { hours: 0, breakdown: [], isPast: false, isPulse: true };
            roleMap[res.role][key].isPulse = true;
            roleMap[res.role][key].hours += m.hours;
            roleMap[res.role][key].breakdown.push({ project: proj.name || proj.id, task: task.name, hours: m.hours });
          });
        } else {
          // Distribute evenly week by week (exact fractional values)
          futureWeeks.forEach(w => {
            const key = w.weekStart.toISOString();
            if (!roleMap[res.role][key]) roleMap[res.role][key] = { hours: 0, breakdown: [], isPast: false, isPulse: false };
            roleMap[res.role][key].hours += hPerWeek;
            roleMap[res.role][key].breakdown.push({ project: proj.name || proj.id, task: task.name, hours: hPerWeek });
          });
        }
        }
```

Replace it with:

```js
        } else {
        // Use total task future weeks (not just visible) so hPerWeek is stable as the axis range changes.
        const totalFutureWeeks = countFutureTaskWeeks(tStart, tEnd, todayMidnight);

        const byMonth = {};
        futureWeeks.forEach(w => {
          if (!byMonth[w.monthKey]) byMonth[w.monthKey] = [];
          byMonth[w.monthKey].push(w.weekStart.toISOString());
        });
        const weeksByMonth = Object.entries(byMonth).map(([monthKey, weekKeys]) => ({ monthKey, weekKeys }));

        distributeFutureResidual(residualH, totalFutureWeeks, weeksByMonth, portfolioMonthlyPulse).forEach(entry => {
          if (!roleMap[res.role][entry.key]) roleMap[res.role][entry.key] = { hours: 0, breakdown: [], isPast: false, isPulse: entry.isPulse };
          if (entry.isPulse) roleMap[res.role][entry.key].isPulse = true;
          roleMap[res.role][entry.key].hours += entry.hours;
          roleMap[res.role][entry.key].breakdown.push({ project: proj.name || proj.id, task: task.name, hours: entry.hours });
        });
        }
```

- [ ] **Step 4: Wire the by-project view (`js/planning.js`)**

Find this line (currently line 1063, immediately after the `_totalFw` declaration):

```js
        const hPerWeek = _totalFw > 0 ? residualH / _totalFw : (futureWeeks.length > 0 ? residualH / futureWeeks.length : 0);
```

Delete this line entirely — `distributeFutureResidual` computes `hPerWeek` internally, so this local variable becomes dead once the block below is replaced.

Then find this block (currently lines 1085-1107):

```js
        if (futureWeeks.length > 0 && residualH > 0.01) {
          if (portfolioMonthlyPulse && hPerWeek < 1) {
            const byMonth = {};
            futureWeeks.forEach(w => {
              if (!byMonth[w.monthKey]) byMonth[w.monthKey] = { firstWeek: w, hours: 0 };
              byMonth[w.monthKey].hours += hPerWeek;
            });
            Object.values(byMonth).forEach(m => {
              const key = m.firstWeek.weekStart.toISOString();
              if (!roleWeekData[key]) roleWeekData[key] = { total: 0, byOwner: {}, isPulse: true, isPast: false };
              roleWeekData[key].total += m.hours;
              roleWeekData[key].isPulse = true;
              distribute(roleWeekData[key].byOwner, m.hours);
            });
          } else {
            futureWeeks.forEach(w => {
              const key = w.weekStart.toISOString();
              if (!roleWeekData[key]) roleWeekData[key] = { total: 0, byOwner: {}, isPulse: false, isPast: false };
              roleWeekData[key].total += hPerWeek;
              distribute(roleWeekData[key].byOwner, hPerWeek);
            });
          }
        }
```

Replace it with:

```js
        if (futureWeeks.length > 0 && residualH > 0.01) {
          const byMonth = {};
          futureWeeks.forEach(w => {
            if (!byMonth[w.monthKey]) byMonth[w.monthKey] = [];
            byMonth[w.monthKey].push(w.weekStart.toISOString());
          });
          const weeksByMonth = Object.entries(byMonth).map(([monthKey, weekKeys]) => ({ monthKey, weekKeys }));

          distributeFutureResidual(residualH, _totalFw, weeksByMonth, portfolioMonthlyPulse).forEach(entry => {
            if (!roleWeekData[entry.key]) roleWeekData[entry.key] = { total: 0, byOwner: {}, isPulse: entry.isPulse, isPast: false };
            roleWeekData[entry.key].total += entry.hours;
            if (entry.isPulse) roleWeekData[entry.key].isPulse = true;
            distribute(roleWeekData[entry.key].byOwner, entry.hours);
          });
        }
```

- [ ] **Step 5: Wire the by-owner view (`js/planning.js`)**

Find this block (currently lines 1367-1400):

```js
        // Future week distribution
        if (roleTbp > 0.01) {
          const _owNow = new Date(); const _owTd = new Date(_owNow.getFullYear(), _owNow.getMonth(), _owNow.getDate());
          const futureWeeks = weeks.filter(w => !w.isPast);
          const taskWeeks   = tStart && tEnd ? futureWeeks.filter(w => w.weekEnd >= tStart && w.weekStart <= tEnd) : futureWeeks;
          // Compute canonical counts from task date range (stable regardless of view range)
          const totalTaskFw = (tStart && tEnd) ? countFutureTaskWeeks(tStart, tEnd, _owTd) : taskWeeks.length;
          const totalTaskFm = (tStart && tEnd) ? countFutureTaskMonths(tStart, tEnd, _owTd) : null;
          const distribute  = (byOwner, hours) => {
            if (totalOwnerH > 0.01) ownerNames.forEach(o => { byOwner[o] = (byOwner[o] || 0) + hours * (ownerTotals[o] / totalOwnerH); });
            else byOwner['—'] = (byOwner['—'] || 0) + hours;
          };
          if (portfolioMonthlyPulse && roleTbp < taskWeeks.length) {
            const monthMap = {};
            taskWeeks.forEach(w => { if (!monthMap[w.monthKey]) monthMap[w.monthKey] = []; monthMap[w.monthKey].push(w); });
            const mkKeys = Object.keys(monthMap);
            const mh     = roleTbp / (totalTaskFm || mkKeys.length || 1);
            mkKeys.forEach(mk => {
              const lastW = monthMap[mk][monthMap[mk].length - 1];
              const key   = lastW.weekStart.toISOString();
              if (!roleWeekData[key]) roleWeekData[key] = { total: 0, byOwner: {}, isPulse: true, isPast: false };
              roleWeekData[key].total += mh;
              distribute(roleWeekData[key].byOwner, mh);
            });
          } else {
            const hpw = totalTaskFw > 0 ? roleTbp / totalTaskFw : (taskWeeks.length > 0 ? roleTbp / taskWeeks.length : 0);
            taskWeeks.forEach(w => {
              const key = w.weekStart.toISOString();
              if (!roleWeekData[key]) roleWeekData[key] = { total: 0, byOwner: {}, isPulse: false, isPast: false };
              roleWeekData[key].total += hpw;
              distribute(roleWeekData[key].byOwner, hpw);
            });
          }
        }
```

Replace it with:

```js
        // Future week distribution
        if (roleTbp > 0.01) {
          const _owNow = new Date(); const _owTd = new Date(_owNow.getFullYear(), _owNow.getMonth(), _owNow.getDate());
          const futureWeeks = weeks.filter(w => !w.isPast);
          const taskWeeks   = tStart && tEnd ? futureWeeks.filter(w => w.weekEnd >= tStart && w.weekStart <= tEnd) : futureWeeks;
          // Compute canonical count from task date range (stable regardless of view range)
          const totalTaskFw = (tStart && tEnd) ? countFutureTaskWeeks(tStart, tEnd, _owTd) : taskWeeks.length;
          const distribute  = (byOwner, hours) => {
            if (totalOwnerH > 0.01) ownerNames.forEach(o => { byOwner[o] = (byOwner[o] || 0) + hours * (ownerTotals[o] / totalOwnerH); });
            else byOwner['—'] = (byOwner['—'] || 0) + hours;
          };

          const monthMap = {};
          taskWeeks.forEach(w => {
            if (!monthMap[w.monthKey]) monthMap[w.monthKey] = [];
            monthMap[w.monthKey].push(w.weekStart.toISOString());
          });
          const weeksByMonth = Object.entries(monthMap).map(([monthKey, weekKeys]) => ({ monthKey, weekKeys }));

          distributeFutureResidual(roleTbp, totalTaskFw, weeksByMonth, portfolioMonthlyPulse).forEach(entry => {
            if (!roleWeekData[entry.key]) roleWeekData[entry.key] = { total: 0, byOwner: {}, isPulse: entry.isPulse, isPast: false };
            roleWeekData[entry.key].total += entry.hours;
            if (entry.isPulse) roleWeekData[entry.key].isPulse = true;
            distribute(roleWeekData[entry.key].byOwner, entry.hours);
          });
        }
```

- [ ] **Step 6: Run the automated test suite**

Run: `npm test`
Expected: all tests PASS, unchanged from Task 1's result — this task's changes are inside `js/planning.js`, which vitest doesn't cover; this run just confirms no regression to `js/lib/planning-calc.test.js` or `js/lib/cfg-parse.test.js`.

- [ ] **Step 7: Manual code-trace verification (documented in the task report, not an automated test)**

Read through the four edited/removed blocks in `js/planning.js` (Steps 2-5 above) and confirm, for each:
1. **`countFutureTaskMonths` removal (Step 2):** search the whole file for any remaining reference to `countFutureTaskMonths` — there should be none after Step 5's `totalTaskFm` removal.
2. **By-role (Step 3):** the replacement calls `distributeFutureResidual` with `residualH`, `totalFutureWeeks` (unchanged declaration), the newly-built `weeksByMonth`, and `portfolioMonthlyPulse` — confirm no other logic in the surrounding lines (the `if (usePDist) {...} else { ... }` structure, the `residualH < 0.01` early return above it) was altered.
3. **By-project (Step 4):** confirm `_totalFw` (still declared above, unchanged) is passed correctly, and that `hPerWeek`'s removal doesn't break any other reference to `hPerWeek` later in the by-project render function — search the function body for any remaining `hPerWeek` reference outside the replaced block.
4. **By-owner (Step 5):** confirm `totalTaskFw` (still declared, unchanged) is passed correctly, `distribute()` (the per-owner proportional-split closure) is unchanged and still called with each entry's `hours`, and that `totalTaskFm`'s removal doesn't break any other reference — search the by-owner render function body for any remaining `totalTaskFm` reference.

Record confirmation of all four points in the task report.

- [ ] **Step 8: Commit**

```bash
git add js/planning.js
git commit -m "fix(planning): unify Monthly Pulse threshold, distribution, and placement across all three views"
```

---

## Self-Review Notes (completed by the plan author, not a task step)

**Spec coverage:** Finding 4 (threshold) is fixed by both by-role and by-project passing their canonical week-count variable (`totalFutureWeeks`/`_totalFw`) into the shared function, and by-owner switching from `roleTbp < taskWeeks.length` to the same canonical-count-based check inside `distributeFutureResidual` (Task 2, Steps 3-5). Finding 5 (distribution formula) and the placement divergence found during brainstorming (first vs. last week) are both fixed identically, since all three views now call the same function. The spec's required test suite (threshold independence from visible window, proportional-to-weeks distribution, first-week placement, non-pulse fallback, zero-canonical-weeks fallback) is present in Task 1 Step 1, plus one additional edge-case test (empty `weeksByMonth`) not explicitly requested by the spec but a natural boundary case for a function now called from three places. Out-of-scope items (Findings 1-3, `js/ai.js`, `matchesTaskRole`/`computeResidual`, by-role/by-project behavior changes) are untouched by both tasks.

**Placeholder scan:** no TBD/TODO; every step contains complete, runnable code, not a description of it.

**Type/reference consistency:** `distributeFutureResidual(residualH, totalFutureWeeks, weeksByMonth, pulseEnabled)`'s signature and return shape (`{ key, hours, isPulse }[]`) are defined once in Task 1 and consumed identically at all three call sites in Task 2 — each view passes its own existing canonical-week-count variable under its own existing name (`totalFutureWeeks`, `_totalFw`, `totalTaskFw`), builds its own `weeksByMonth` array from its own existing week-iteration variable (`futureWeeks`, `taskWeeks`), and feeds the returned entries into its own existing per-view accumulator (`roleMap[res.role][key]`, `roleWeekData[key]` ×2) — no renamed or mismatched variables introduced across the three call sites.
