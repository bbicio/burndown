# Planning model in the backend (Cycle A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute in an isolated worktree (`superpowers:using-git-worktrees`, suggested name `planning-model-backend`); the terminal step of the whole plan is `/finish-cycle` (never `finishing-a-development-branch`).

**Goal:** Move the hours/ownership calculation of `planning.html` (By Role, By Project, By Owner) from the browser into one backend service, `POST /api/planning/model`, so it becomes the single source of truth; the three views only render what the service returns. A second, isolated phase fixes the window-dependent normalisation of the monthly distribution.

**Architecture:** Three pure projection functions (`roleProjection`, `projectProjection`, `ownerProjection`) in `api/src/lib/planning-model.js` share primitives (`planning-calendar.js`, `planning-distribution.js`). A data service loads projects/tasks/actuals/resources (30 s in-process cache, cleared by one write-middleware) and a route validates the request, applies project visibility and returns one projection. `planning.html` fetches the projection for the active view, re-keys it with a small adapter (`js/lib/planning-model-ui.js`) into the shapes its existing render code already uses, and keeps all HTML/export code. Parity is proven mechanically: `exportRows` + `periodMeta` + an HTML hash of every view are captured in the browser with the OLD code (baseline) and compared after the migration; only then is the browser calculation deleted.

**Tech Stack:** Node.js/Express (CommonJS, `node:test`), PostgreSQL, Vue 3 via CDN (no build step), vitest + jsdom for `js/lib/*` modules.

**Spec:** `docs/superpowers/specs/2026-09-29-planning-model-backend-design.md` — **§14 (amendments) wins over §2/§5-§8** where they conflict (one endpoint, three projections, `teams` and the window are inputs, request is a `POST`). Read the whole spec before starting; §4 lists the per-view rule differences this plan reproduces on purpose.

## Global Constraints

- **Phase 1 = zero visible change.** Every difference between the old browser numbers and the new server numbers is a defect, except the "week-boundary" differences listed in Review Focus #1, which must be reported to the user, never silently accepted or "fixed".
- Keep the three views' different rules exactly as they are (spec §4): monthly distribution only in By Role; task-date fallback only in By Role/By Project; window-overlap skip only in By Role/By Project; owner-level task residual in By Owner. Do NOT unify them.
- No bundler, no build step for the runtime; `js/lib/*.js` are ES modules with a `window.<name> = <name>` bridge; classic scripts carry `defer`.
- Backend code is CommonJS; pure logic lives in `api/src/lib/` with a sibling `*.test.js` (`node:test`), runnable on the host from `api/` (`node --test src/lib/<file>.test.js`). Files that `require` Express/DB modules cannot run on the host unless `api/node_modules` exists — cover those through the isolated integration suite (`scripts/run-tests.sh`), not through the main stack's `pdash-api` container (its volume mount points at the MAIN checkout, not the worktree).
- The server never depends on its own time zone: a "calendar date" is a `Date` at 00:00 UTC; weeks are Monday–Sunday; `asOf` ("today") comes from the client.
- All user-facing text in English. No new dependencies. No DB migration.
- **Cache-busting:** every edit to a versioned file (`?v=N`) bumps every `?v=N` reference to it (grep the repo). New versioned file: `js/lib/planning-model-ui.js?v=1`.
- **Docker safety:** never run `docker compose` (`up`/`down`/`restart`/…) against the main stack (`pdash-*`, project `burndown`), never with `-v`; use only `scripts/test-branch.sh` and `scripts/run-tests.sh` (isolated stacks). Read-only `docker exec … psql -c "SELECT …"` on the main stack is fine.
- Real data (baselines, captures) is never committed: `backups/` is gitignored — store baselines under `backups/planning-golden/`.
- Windows dev machine: use the Bash tool (Git Bash) for the commands below; paths use forward slashes.

## Review Focus

Inputs/conditions the spec implies but the obvious tests would not exercise. Each has a pinning test in the owning task.

1. **Sunday actuals and week boundaries.** The browser parses `'YYYY-MM-DD'` as UTC midnight and compares it with local-midnight weeks, so in UTC+ time zones an actuals row dated on a **Sunday** falls outside every week in By Role/By Project (it still counts in "consumed"); By Owner normalises the time and includes it. The server uses calendar dates (Sunday belongs to its Mon–Sun week, in all views). Expect the Task 15 parity check to flag exactly this in By Role/By Project if the dataset has Sunday rows: STOP and report it to the user (Task 4/5 pin the server behaviour; Task 15 says what to do).
2. **Tasks with no dates at all** (no task dates and no project dates → end date year 9999): the future-week count loops ~400 000 weeks; it must stay fast (memoised counter) and must reproduce the tiny hours-per-week (Task 1 counter test, Task 4 no-dates test).
3. **Project ids the user cannot see, unknown ids, duplicates, empty list** in the request: silently ignored / de-duplicated (no information leak, no 404); empty result renders "No … data found" (Task 7/8 tests).
4. **Two projects sharing one `project_code`:** both projects receive the same actuals (as `GET /api/timesheets/all-data` does today), not just the oldest (Task 3 test).
5. **Out-of-order responses in the browser:** a slow response for an old window/filter arriving after a newer one must be discarded, and the view must show a loading state (never half-old data) while pending (Task 12).

---

## File Structure

| File | Responsibility |
|---|---|
| `api/src/lib/planning-calendar.js` (+ test) | UTC calendar helpers: `isoDate`, `parseTaskDate`, `getCalendarWeeks`, `countFutureTaskWeeks`, memoised counter |
| `api/src/lib/planning-distribution.js` (+ test) | Rule primitives: `matchesTaskRole`, `computeResidual`, `distributeFutureResidual`, `redistributeExcludingInactive`, `hasValidPhasing`, `phasedSeries` |
| `api/src/lib/planning-model.js` (+ test) | Actuals normalisation/grouping + the three projections + `buildProjection` |
| `api/src/lib/planning-request.js` (+ test) | Request validation (`parsePlanningRequest`) |
| `api/src/lib/match-resource.js` | + `resolveOwnerStatuses` (moved from `routes/resources.js`, re-exported there) |
| `api/src/services/planning-data.js` | Loads + caches projects/actuals/resources; `invalidatePlanningData`; `visibleProjectIds` |
| `api/src/routes/planning.js` | `POST /api/planning/model` |
| `api/src/index.js` | Mount route + write-invalidation middleware |
| `test-api.js`, `TEST_CASES.md` | Integration tests `PM-*` (section 25) |
| `api/src/scripts/seed-planning-golden.js` | Dev-only seeder of the parity dataset (isolated stacks only) |
| `scripts/planning-golden-capture.js` | Browser-console capture of `exportRows`/`periodMeta`/HTML hash for every view × combination |
| `api/src/scripts/bench-planning-model.js` | Synthetic payload/time benchmark |
| `js/lib/planning-model-ui.js` (+ test) | Client adapter: request builder, key re-mapping, shape adapters |
| `planning.html` | Loads the model, migrates the three views, drops browser calc + legacy loads |
| `js/lib/planning-calc.js` (+ test) | Remove the calc functions no longer used (Task 16) |
| `docs/api/planning-model.md` + updates | Documentation (Task 18) |

---

### Task 1: Calendar helpers

**Files:**
- Create: `api/src/lib/planning-calendar.js`
- Test: `api/src/lib/planning-calendar.test.js`

**Interfaces:**
- Produces (all exported): `MONTH_NAMES: string[]`, `utcDate(y, m0, d): Date`, `isoDate(str): Date|null`, `dateKey(d): 'YYYY-MM-DD'`, `addDays(d, n): Date`, `mondayOnOrBefore(d): Date`, `parseTaskDate(str, isEnd): Date`, `getCalendarWeeks(start, end, today): Week[]` where `Week = { key, weekStart, weekEnd, monthKey, isPast, isCurrent }`, `countFutureTaskWeeks(tStart, tEnd, today): number`, `makeFutureWeekCounter(today): (tStart, tEnd) => number` (memoised).

- [ ] **Step 1: Write the failing tests**

```js
// api/src/lib/planning-calendar.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  utcDate, isoDate, dateKey, addDays, mondayOnOrBefore, parseTaskDate,
  getCalendarWeeks, countFutureTaskWeeks, makeFutureWeekCounter,
} = require('./planning-calendar');

const D = (s) => isoDate(s);

test('isoDate: valid, invalid and rolled-over dates', () => {
  assert.equal(dateKey(D('2026-09-15')), '2026-09-15');
  assert.equal(dateKey(isoDate('2026-09-15T10:00:00Z')), '2026-09-15');
  assert.equal(isoDate('2026-02-31'), null);
  assert.equal(isoDate('15/09/2026'), null);
  assert.equal(isoDate(''), null);
  assert.equal(isoDate(null), null);
});

test('mondayOnOrBefore: Monday stays, Sunday goes back six days, midweek goes to Monday', () => {
  assert.equal(dateKey(mondayOnOrBefore(D('2026-09-14'))), '2026-09-14'); // Monday
  assert.equal(dateKey(mondayOnOrBefore(D('2026-09-20'))), '2026-09-14'); // Sunday
  assert.equal(dateKey(mondayOnOrBefore(D('2026-09-16'))), '2026-09-14'); // Wednesday
});

test('parseTaskDate: YYYYMMDD exact, YYYYMM start/end of month, empty -> sentinels', () => {
  assert.equal(dateKey(parseTaskDate('20260915', false)), '2026-09-15');
  assert.equal(dateKey(parseTaskDate('202609', false)), '2026-09-01');
  assert.equal(dateKey(parseTaskDate('202609', true)), '2026-09-30');
  assert.equal(dateKey(parseTaskDate('202602', true)), '2026-02-28');
  assert.equal(dateKey(parseTaskDate('', true)), '9999-12-31');
  assert.equal(dateKey(parseTaskDate(null, false)), '1970-01-01');
});

test('getCalendarWeeks: Monday-anchored weeks, past/current flags, month key of the week start', () => {
  const weeks = getCalendarWeeks(D('2026-09-01'), D('2026-09-30'), D('2026-09-15'));
  assert.deepEqual(weeks.map(w => w.key), ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
  assert.deepEqual(weeks.map(w => w.isPast), [true, true, false, false, false]);
  assert.deepEqual(weeks.map(w => w.isCurrent), [false, false, true, false, false]);
  assert.equal(weeks[0].monthKey, 'Aug 2026');
  assert.equal(weeks[1].monthKey, 'Sep 2026');
  assert.equal(dateKey(weeks[1].weekEnd), '2026-09-13');
});

test('countFutureTaskWeeks: task spanning today, task fully in the future, ended task', () => {
  const today = D('2026-09-15');
  assert.equal(countFutureTaskWeeks(D('2026-09-01'), D('2026-09-30'), today), 3);
  assert.equal(countFutureTaskWeeks(D('2026-10-05'), D('2026-10-25'), today), 3);
  assert.equal(countFutureTaskWeeks(D('2026-08-01'), D('2026-09-01'), today), 0);
  assert.equal(countFutureTaskWeeks(D('2026-09-01'), null, today), 0);
});

test('makeFutureWeekCounter: memoised, and an undated task (end year 9999) stays fast', () => {
  const counter = makeFutureWeekCounter(D('2026-09-15'));
  const t0 = Date.now();
  const a = counter(parseTaskDate('', false), parseTaskDate('', true));
  const b = counter(parseTaskDate('', false), parseTaskDate('', true));
  assert.equal(a, b);
  assert.ok(a > 100000, `expected a huge week count for an undated task, got ${a}`);
  assert.ok(Date.now() - t0 < 2000, 'undated task count must not take seconds');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd api && node --test src/lib/planning-calendar.test.js`
Expected: FAIL (`Cannot find module './planning-calendar'`).

- [ ] **Step 3: Implement**

```js
// api/src/lib/planning-calendar.js
'use strict';
// Calendar helpers for the planning model. A "calendar date" is a Date at 00:00 UTC, so nothing
// here depends on the server's time zone. Weeks are Monday-Sunday. Direct ports of the browser
// helpers (js/core.js parseTaskDate/buildMonthPeriods, js/lib/planning-calc.js) for parity.

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_MS = 86400000;

function utcDate(y, m0, d) { return new Date(Date.UTC(y, m0, d)); }

// 'YYYY-MM-DD…' -> calendar Date, or null when unparsable / impossible (e.g. Feb 31).
function isoDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str ?? ''));
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const date = utcDate(y, mo - 1, d);
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

function dateKey(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { return new Date(d.getTime() + n * DAY_MS); }

function mondayOnOrBefore(d) {
  const dow = d.getUTCDay();
  return addDays(d, -(dow === 0 ? 6 : dow - 1));
}

// Task date string (YYYYMMDD, or legacy YYYYMM: first/last day of the month) -> calendar Date.
function parseTaskDate(str, isEnd) {
  if (!str) return isEnd ? utcDate(9999, 11, 31) : new Date(0);
  if (str.length >= 8) return utcDate(parseInt(str.slice(0, 4), 10), parseInt(str.slice(4, 6), 10) - 1, parseInt(str.slice(6, 8), 10));
  const y = parseInt(str.slice(0, 4), 10), m = parseInt(str.slice(4, 6), 10);
  return isEnd ? utcDate(y, m, 0) : utcDate(y, m - 1, 1);
}

// Weeks (Mon-Sun) from the Monday on/before `start` to `end`. `key` is the Monday as YYYY-MM-DD;
// `monthKey` is derived from the week START ("Sep 2026"), exactly like the browser.
function getCalendarWeeks(start, end, today) {
  const weeks = [];
  for (let cur = mondayOnOrBefore(start); cur <= end; cur = addDays(cur, 7)) {
    const weekEnd = addDays(cur, 6);
    weeks.push({
      key: dateKey(cur),
      weekStart: cur,
      weekEnd,
      monthKey: `${MONTH_NAMES[cur.getUTCMonth()]} ${cur.getUTCFullYear()}`,
      isPast: weekEnd < today,
      isCurrent: cur <= today && weekEnd >= today,
    });
  }
  return weeks;
}

// Port of countFutureTaskWeeks (js/lib/planning-calc.js): weeks (Mon-based, weekEnd >= today)
// overlapping the task range, independent of any visible window.
function countFutureTaskWeeks(tStart, tEnd, today) {
  if (!tEnd || tEnd < today) return 0;
  const effectiveStart = (tStart && tStart > today) ? tStart : today;
  let count = 0;
  for (let d = mondayOnOrBefore(effectiveStart); d <= tEnd; d = addDays(d, 7)) {
    const wEnd = addDays(d, 6);
    if (wEnd >= today && (!tStart || wEnd >= tStart)) count++;
  }
  return count;
}

// A task with no dates anywhere ends in year 9999 (~400k weeks): memoise per (start, end).
function makeFutureWeekCounter(today) {
  const memo = new Map();
  return (tStart, tEnd) => {
    const key = `${tStart ? tStart.getTime() : 'n'}|${tEnd ? tEnd.getTime() : 'n'}`;
    if (!memo.has(key)) memo.set(key, countFutureTaskWeeks(tStart, tEnd, today));
    return memo.get(key);
  };
}

module.exports = {
  MONTH_NAMES, utcDate, isoDate, dateKey, addDays, mondayOnOrBefore,
  parseTaskDate, getCalendarWeeks, countFutureTaskWeeks, makeFutureWeekCounter,
};
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd api && node --test src/lib/planning-calendar.test.js`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/planning-calendar.js api/src/lib/planning-calendar.test.js
git commit -m "feat: planning calendar helpers (UTC calendar dates, weeks, future-week count)"
```

---

### Task 2: Distribution primitives

**Files:**
- Create: `api/src/lib/planning-distribution.js`
- Test: `api/src/lib/planning-distribution.test.js`

**Interfaces:**
- Consumes: Task 1 `Week` objects (`key`, `weekStart`, `monthKey`).
- Produces: `matchesTaskRole(record, taskName, role): boolean`, `computeResidual(sold, consumed): number`, `distributeFutureResidual(residualH, totalFutureWeeks, weeksByMonth, pulseEnabled): {key,hours,isPulse}[]` (`weeksByMonth = [{monthKey, weekKeys}]`), `redistributeExcludingInactive(ownerTotals, ownerStatus): {props, allInactive}`, `hasValidPhasing(pDist): boolean`, `phasedSeries({ residualH, pDist, futureWeeks, fallbackWeekCount }): {key,hours}[]` (`fallbackWeekCount` is a **function** returning a number; **Phase-1 semantics**: percentages normalised over the months of the *visible* future weeks — Task 17 changes this on purpose).

- [ ] **Step 1: Write the failing tests**

```js
// api/src/lib/planning-distribution.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  matchesTaskRole, computeResidual, distributeFutureResidual,
  redistributeExcludingInactive, hasValidPhasing, phasedSeries,
} = require('./planning-distribution');
const { isoDate, getCalendarWeeks } = require('./planning-calendar');

test('matchesTaskRole: case-insensitive; blank task name matches on role alone; missing fields do not throw', () => {
  assert.equal(matchesTaskRole({ role: 'developer', task: 'build api' }, 'Build API', 'Developer'), true);
  assert.equal(matchesTaskRole({ role: 'Developer', task: 'x' }, undefined, 'Developer'), true);
  assert.equal(matchesTaskRole({ role: 'Developer', task: undefined }, 'Build API', 'Developer'), false);
  assert.equal(matchesTaskRole({ role: undefined, task: 'Build API' }, 'Build API', 'Developer'), false);
  assert.equal(matchesTaskRole({ role: '', task: 'a' }, 'a', undefined), true); // undefined role == ''
});

test('computeResidual floors at zero', () => {
  assert.equal(computeResidual(100, 40), 60);
  assert.equal(computeResidual(20, 30), 0);
});

test('distributeFutureResidual: pulse from the canonical week count, first week of the month carries the hours', () => {
  const weeksByMonth = [{ monthKey: 'a', weekKeys: ['w1', 'w2', 'w3'] }];
  assert.deepEqual(distributeFutureResidual(5, 10, weeksByMonth, true), [{ key: 'w1', hours: 1.5, isPulse: true }]);
  assert.deepEqual(distributeFutureResidual(20, 10, [{ monthKey: 'a', weekKeys: ['w1', 'w2'] }], true).map(e => e.isPulse), [false, false]);
  assert.deepEqual(distributeFutureResidual(1, 10, [{ monthKey: 'a', weekKeys: ['w1', 'w2'] }], false),
    [{ key: 'w1', hours: 0.1, isPulse: false }, { key: 'w2', hours: 0.1, isPulse: false }]);
});

test('distributeFutureResidual: no future weeks at all falls back to the visible weeks; nothing to spread gives 0', () => {
  assert.deepEqual(distributeFutureResidual(6, 0, [{ monthKey: 'a', weekKeys: ['w1', 'w2', 'w3'] }], false).map(e => e.hours), [2, 2, 2]);
  assert.deepEqual(distributeFutureResidual(6, 0, [], false), []);
});

test('redistributeExcludingInactive: inactive share goes to the active owners in their ratio', () => {
  const r = redistributeExcludingInactive({ A: 6, B: 3, C: 1 }, { C: 'inactive' });
  assert.deepEqual(r, { props: { A: 6 / 9, B: 3 / 9 }, allInactive: false });
});

test('redistributeExcludingInactive: everyone inactive, no owners, or ~0 hours -> allInactive', () => {
  assert.deepEqual(redistributeExcludingInactive({ A: 5 }, { A: 'inactive' }), { props: {}, allInactive: true });
  assert.deepEqual(redistributeExcludingInactive({}, {}), { props: {}, allInactive: true });
  assert.equal(redistributeExcludingInactive({ A: 0.005 }, {}).allInactive, true);
  assert.equal(redistributeExcludingInactive({ A: 5 }, {}).allInactive, false); // unknown name = active
});

test('hasValidPhasing: sum must be 100 within 0.5', () => {
  assert.equal(hasValidPhasing({ '202610': 40, '202611': 60 }), true);
  assert.equal(hasValidPhasing({ '202610': 40, '202611': 59.6 }), true);
  assert.equal(hasValidPhasing({ '202610': 40, '202611': 50 }), false);
  assert.equal(hasValidPhasing(null), false);
  assert.equal(hasValidPhasing({ '202610': 'x' }), false);
});

// Phase-1 behaviour: percentages are re-normalised over the months of the VISIBLE future weeks.
test('phasedSeries (phase 1): 40/30/30 over three visible months, and 57/43 when only two are visible', () => {
  const today = isoDate('2026-09-15');
  const all = getCalendarWeeks(isoDate('2026-10-01'), isoDate('2026-12-31'), today);
  const pDist = { '202610': 40, '202611': 30, '202612': 30 };
  const monthOf = w => w.weekStart.getUTCMonth();               // 9 = Oct, 10 = Nov, 11 = Dec
  const oct = all.filter(w => monthOf(w) === 9), nov = all.filter(w => monthOf(w) === 10), dec = all.filter(w => monthOf(w) === 11);
  const total = (series, weeks) => series.filter(e => weeks.some(w => w.key === e.key)).reduce((s, e) => s + e.hours, 0);

  const full = phasedSeries({ residualH: 100, pDist, futureWeeks: all, fallbackWeekCount: () => 13 });
  assert.ok(Math.abs(total(full, oct) - 40) < 1e-9, `october should carry 40, got ${total(full, oct)}`);
  assert.ok(Math.abs(total(full, nov) - 30) < 1e-9);
  assert.ok(Math.abs(total(full, dec) - 30) < 1e-9);

  // Only October and November visible: the 100 h are re-normalised over 70% -> 57.14 / 42.86 (phase-1 anomaly).
  const partial = phasedSeries({ residualH: 100, pDist, futureWeeks: [...oct, ...nov], fallbackWeekCount: () => 13 });
  assert.ok(Math.abs(total(partial, oct) - 100 * 40 / 70) < 1e-9, `october share should be 57.14, got ${total(partial, oct)}`);
  assert.ok(Math.abs(total(partial, nov) - 100 * 30 / 70) < 1e-9);
});

test('phasedSeries: no percentage in the visible months falls back to an even split', () => {
  const today = isoDate('2026-09-15');
  const wk = getCalendarWeeks(isoDate('2026-09-15'), isoDate('2026-09-30'), today).filter(w => !w.isPast);
  const out = phasedSeries({ residualH: 30, pDist: { '202612': 100 }, futureWeeks: wk, fallbackWeekCount: () => 3 });
  assert.deepEqual(out.map(e => e.hours), wk.map(() => 10));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd api && node --test src/lib/planning-distribution.test.js`
Expected: FAIL (`Cannot find module './planning-distribution'`).

- [ ] **Step 3: Implement**

```js
// api/src/lib/planning-distribution.js
'use strict';
// Rule primitives of the planning model — ports of js/lib/planning-calc.js and of the inline
// logic of planning.html's three views. Keep behaviour identical (Phase 1 = zero visible change).

function matchesTaskRole(record, taskName, role) {
  const roleMatches = (record.role || '').toLowerCase() === (role || '').toLowerCase();
  const taskMatches = !taskName || (record.task || '').toLowerCase() === taskName.toLowerCase();
  return roleMatches && taskMatches;
}

function computeResidual(soldH, consumedH) { return Math.max(0, soldH - consumedH); }

// weeksByMonth: [{ monthKey, weekKeys: string[] }]. Uniform spread of the residual; pulse mode puts
// the whole month on its first week when the canonical hours/week is below 1.
function distributeFutureResidual(residualH, totalFutureWeeks, weeksByMonth, pulseEnabled) {
  const totalWeeks = weeksByMonth.reduce((s, m) => s + m.weekKeys.length, 0);
  const hPerWeek = totalFutureWeeks > 0 ? residualH / totalFutureWeeks
                 : (totalWeeks > 0 ? residualH / totalWeeks : 0);
  if (pulseEnabled && hPerWeek < 1) {
    return weeksByMonth.map(m => ({ key: m.weekKeys[0], hours: hPerWeek * m.weekKeys.length, isPulse: true }));
  }
  return weeksByMonth.flatMap(m => m.weekKeys.map(key => ({ key, hours: hPerWeek, isPulse: false })));
}

// ownerTotals: { name: actualsHours }; ownerStatus: { name: 'active'|'inactive' } (absent = active).
function redistributeExcludingInactive(ownerTotals, ownerStatus) {
  const eligible = Object.keys(ownerTotals).filter(n => (ownerStatus[n] || 'active') !== 'inactive');
  const eligibleTotal = eligible.reduce((s, n) => s + (ownerTotals[n] || 0), 0);
  if (eligible.length === 0 || eligibleTotal <= 0.01) return { props: {}, allInactive: true };
  const props = {};
  eligible.forEach(n => { props[n] = ownerTotals[n] / eligibleTotal; });
  return { props, allInactive: false };
}

// The task's own monthly distribution ({ 'YYYYMM': percent }) is used only when it sums to 100 (±0.5).
function hasValidPhasing(pDist) {
  if (!pDist) return false;
  const sum = Object.values(pDist).reduce((s, v) => s + v, 0);
  return Math.abs(sum - 100) < 0.5;
}

function ymOf(week) {
  return `${week.weekStart.getUTCFullYear()}${String(week.weekStart.getUTCMonth() + 1).padStart(2, '0')}`;
}

// PHASE 1 (parity): the percentages are normalised over the months of the *visible* future weeks
// (this is the browser's window-dependent behaviour; Task 17 replaces it on purpose).
// fallbackWeekCount: () => number (canonical future-week count of the task).
function phasedSeries({ residualH, pDist, futureWeeks, fallbackWeekCount }) {
  const byMonth = {};
  for (const w of futureWeeks) (byMonth[ymOf(w)] ||= []).push(w);
  const futureDistTotal = Object.keys(byMonth).reduce((s, ym) => s + (pDist[ym] || 0), 0);
  if (futureDistTotal < 0.01) {
    const count = fallbackWeekCount();
    const hPerWeek = count > 0 ? residualH / count : residualH / futureWeeks.length;
    return futureWeeks.map(w => ({ key: w.key, hours: hPerWeek }));
  }
  const out = [];
  for (const [ym, mWeeks] of Object.entries(byMonth)) {
    const mHours = residualH * ((pDist[ym] || 0) / futureDistTotal);
    const hPerWk = mHours / mWeeks.length;
    for (const w of mWeeks) out.push({ key: w.key, hours: hPerWk });
  }
  return out;
}

module.exports = {
  matchesTaskRole, computeResidual, distributeFutureResidual,
  redistributeExcludingInactive, hasValidPhasing, phasedSeries,
};
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd api && node --test src/lib/planning-distribution.test.js`
Expected: all PASS. (If the first assertion of the phase-1 test is too loose for your taste, tighten it — the october 57.14 assertion is the load-bearing one.)

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/planning-distribution.js api/src/lib/planning-distribution.test.js
git commit -m "feat: planning distribution primitives (residual, uniform/phased series, owner split)"
```

---

### Task 3: Actuals normalisation and grouping

**Files:**
- Create: `api/src/lib/planning-model.js` (first part), Test: `api/src/lib/planning-model.test.js`

**Interfaces:**
- Consumes: Task 1 `isoDate`.
- Produces: `PLACEHOLDER = '—'`, `normalizeActuals(rows): Rec[]` with `Rec = { date: Date|null, role, owner, task, hours }` (rows without a date or with hours ≤ 0 are dropped; an unparsable date keeps the row with `date: null` — it counts as consumed but never lands in a week), `groupActualsByProject(projects, sheets): Map<projectId, Rec[]>` (`sheets = [{ project_code, data }]`; **every** project with that code gets the rows), `uniqueOwnerNames(projects, actuals): string[]` (trimmed, non-empty), `inWeek(rec, week): boolean`, `ownerOf(rec): string`, `rolePassesTeams(teams: Set, role): boolean`.

- [ ] **Step 1: Write the failing tests**

```js
// api/src/lib/planning-model.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('./planning-model');
const { isoDate, getCalendarWeeks } = require('./planning-calendar');

test('normalizeActuals: drops rows without date or hours, keeps unparsable dates as null, coerces fields', () => {
  const rows = [
    { date: '2026-09-08', role: 'DEV', owner: ' Mario ', task: 'Build', hours: '4.5' },
    { date: '', role: 'DEV', hours: 3 },
    { date: '2026-09-09', hours: 0 },
    { date: '2026-09-09', hours: 'abc' },
    { date: 'garbage', role: 'DEV', task: 'Build', hours: 2 },
    null,
  ];
  const out = M.normalizeActuals(rows);
  assert.equal(out.length, 2);
  assert.equal(out[0].hours, 4.5);
  assert.equal(out[0].owner, ' Mario ');
  assert.equal(out[0].date.toISOString().slice(0, 10), '2026-09-08');
  assert.equal(out[1].date, null);
  assert.equal(out[1].hours, 2);
});

test('groupActualsByProject: two projects sharing a code both get the rows; no code -> nothing', () => {
  const projects = [{ id: 'p1', code: 'X1' }, { id: 'p2', code: 'X1' }, { id: 'p3', code: '' }, { id: 'p4', code: 'Z' }];
  const sheets = [{ project_code: 'X1', data: [{ date: '2026-09-09', hours: 1 }, { date: '2026-09-08', hours: 2 }] }];
  const map = M.groupActualsByProject(projects, sheets);
  assert.equal(map.get('p1').length, 2);
  assert.equal(map.get('p2').length, 2);
  assert.equal(map.get('p1')[0].date.toISOString().slice(0, 10), '2026-09-08'); // sorted by date
  assert.equal(map.has('p3'), false);
  assert.equal(map.has('p4'), false);
});

test('uniqueOwnerNames: trimmed, non-empty, distinct', () => {
  const projects = [{ id: 'p1' }];
  const actuals = new Map([['p1', [{ owner: ' A ' }, { owner: 'A' }, { owner: '  ' }, { owner: '' }, { owner: 'B' }]]]);
  assert.deepEqual(M.uniqueOwnerNames(projects, actuals).sort(), ['A', 'B']);
});

test('inWeek: Sunday belongs to its own Monday-Sunday week (calendar semantics)', () => {
  const [w] = getCalendarWeeks(isoDate('2026-09-07'), isoDate('2026-09-07'), isoDate('2026-09-30'));
  assert.equal(M.inWeek({ date: isoDate('2026-09-13') }, w), true);  // Sunday
  assert.equal(M.inWeek({ date: isoDate('2026-09-07') }, w), true);  // Monday
  assert.equal(M.inWeek({ date: isoDate('2026-09-14') }, w), false); // next Monday
  assert.equal(M.inWeek({ date: null }, w), false);
});

test('ownerOf and rolePassesTeams', () => {
  assert.equal(M.ownerOf({ owner: '  Ann ' }), 'Ann');
  assert.equal(M.ownerOf({ owner: '   ' }), M.PLACEHOLDER);
  assert.equal(M.ownerOf({ owner: '' }), M.PLACEHOLDER);
  assert.equal(M.rolePassesTeams(new Set(), 'ANY'), true);
  assert.equal(M.rolePassesTeams(new Set(['HWGDEV']), 'HWGDEV - DEVELOPER'), true);
  assert.equal(M.rolePassesTeams(new Set(['HWGDEV']), 'HWGQA - TESTER'), false);
  assert.equal(M.rolePassesTeams(new Set(['DEV']), 'DEV'), true);           // no " - ": the whole role is the team
  assert.equal(M.rolePassesTeams(new Set(['DEV']), undefined), false);      // missing role only passes with no filter
  assert.equal(M.rolePassesTeams(new Set(), undefined), true);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd api && node --test src/lib/planning-model.test.js`
Expected: FAIL (`Cannot find module './planning-model'`).

- [ ] **Step 3: Implement**

```js
// api/src/lib/planning-model.js
'use strict';
// Planning model (Cycle A): pure, DB-free projections of projects + actuals into what the three
// views of planning.html render. Ports of the calculation blocks of byRoleView / byProjectView /
// byOwnerView. The three views deliberately keep DIFFERENT rules (spec §4) — do not unify them.
const { isoDate, parseTaskDate, makeFutureWeekCounter } = require('./planning-calendar');
const {
  matchesTaskRole, computeResidual, distributeFutureResidual,
  redistributeExcludingInactive, hasValidPhasing, phasedSeries,
} = require('./planning-distribution');

const PLACEHOLDER = '—'; // "no owner" / TBD row

// Raw actuals rows -> slim records. A row needs a date value and hours > 0; an unparsable date
// keeps the row (it counts as consumed) with date null (it never falls in a week).
function normalizeActuals(rows) {
  const out = [];
  for (const r of rows || []) {
    if (!r || !r.date) continue;
    const hours = parseFloat(r.hours) || 0;
    if (!(hours > 0)) continue;
    out.push({ date: isoDate(r.date), role: r.role || '', owner: r.owner || '', task: r.task || '', hours });
  }
  return out;
}

// sheets: [{ project_code, data: rawRows[] }]. Every project with a code gets that code's rows
// (as GET /api/timesheets/all-data does), sorted by date string.
function groupActualsByProject(projects, sheets) {
  const rawByCode = new Map();
  for (const s of sheets || []) {
    if (!s || !s.project_code) continue;
    const list = rawByCode.get(s.project_code) || [];
    for (const r of Array.isArray(s.data) ? s.data : []) list.push(r);
    rawByCode.set(s.project_code, list);
  }
  const normByCode = new Map();
  const out = new Map();
  for (const p of projects || []) {
    if (!p.code || !rawByCode.has(p.code)) continue;
    if (!normByCode.has(p.code)) {
      const sorted = [...rawByCode.get(p.code)].sort((a, b) => {
        const x = String((a && a.date) ?? ''), y = String((b && b.date) ?? '');
        return x < y ? -1 : x > y ? 1 : 0;
      });
      normByCode.set(p.code, normalizeActuals(sorted));
    }
    out.set(p.id, normByCode.get(p.code));
  }
  return out;
}

function ownerOf(rec) { return (rec.owner || '').trim() || PLACEHOLDER; }

function uniqueOwnerNames(projects, actuals) {
  const names = new Set();
  for (const p of projects || []) {
    for (const r of actuals.get(p.id) || []) {
      const n = (r.owner || '').trim();
      if (n) names.add(n);
    }
  }
  return [...names];
}

function inWeek(rec, week) {
  return rec.date !== null && rec.date >= week.weekStart && rec.date <= week.weekEnd;
}

// Port of js/core.js rolePassesTeamFilter: the team is the role text before ' - '.
function rolePassesTeams(teams, role) {
  if (!teams || teams.size === 0) return true;
  const dash = role ? role.indexOf(' - ') : -1;
  const team = dash > 0 ? role.slice(0, dash).trim() : role || '';
  return teams.has(team);
}

module.exports = {
  PLACEHOLDER, normalizeActuals, groupActualsByProject, uniqueOwnerNames,
  inWeek, ownerOf, rolePassesTeams,
  // projections are appended by the next tasks
  _internals: { parseTaskDate, makeFutureWeekCounter, matchesTaskRole, computeResidual, distributeFutureResidual, redistributeExcludingInactive, hasValidPhasing, phasedSeries },
};
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd api && node --test src/lib/planning-model.test.js`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/planning-model.js api/src/lib/planning-model.test.js
git commit -m "feat: planning model actuals normalisation, grouping and helpers"
```

---

### Task 4: `roleProjection` (By Role)

**Files:**
- Modify: `api/src/lib/planning-model.js` (add function + export)
- Test: `api/src/lib/planning-model.test.js` (append)

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `roleProjection({ projects, actuals, weeks, today, pulse, teams }): { roles: RoleNode[] }` where `projects` are `{ id, name, startDate, endDate, tasks:[{ name, startDate, endDate, completed, monthlyDistribution, resources:[{role, soldHours}] }] }` (dates are the raw `YYYYMM`/`YYYYMMDD` strings), `actuals: Map<projectId, Rec[]>`, `weeks: Week[]` (the client's visible window), `today: Date`, `pulse: boolean`, `teams: Set<string>`; `RoleNode = { role, sold, actuals, children:[{project, task, sold, actual}], cells:{ [weekKey]: { hours, breakdown:[{project, task, hours}], isPast, isPulse } } }` (roles unsorted; children in insertion order).
- Rules (reproduce, do not "fix"): a task is skipped when completed or when no visible week overlaps it (`task.startDate||proj.startDate`, `task.endDate||proj.endDate`); a role entry is skipped without `role` or when it fails the team filter; **sold/actuals totals only include tasks that pass the overlap test**; past cells: weeks that overlap the task and are past, with `actualH >= 0.01`; future: skipped when no future week or `residual < 0.01`; the task's `monthlyDistribution` is used when `hasValidPhasing`, else uniform + pulse.

- [ ] **Step 1: Write the failing tests** (append to `planning-model.test.js`)

```js
const { getCalendarWeeks: weeksOf } = require('./planning-calendar');

const TODAY = isoDate('2026-09-15'); // a Tuesday
const WEEKS = weeksOf(isoDate('2026-09-01'), isoDate('2026-09-30'), TODAY); // Aug31 Sep7 Sep14 Sep21 Sep28
const rec = (date, owner, hours, role = 'DEV', task = 'Build') => ({ date: isoDate(date), owner, hours, role, task });
const PROJ = (over = {}) => ({
  id: 'p1', name: 'Alpha', startDate: '202609', endDate: '202612',
  tasks: [{ name: 'Build', startDate: '20260901', endDate: '20260930', completed: false,
            monthlyDistribution: null, resources: [{ role: 'DEV', soldHours: 100 }] }],
  ...over,
});
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('roleProjection: past actuals per week, residual spread uniformly over future weeks, totals and children', () => {
  const actuals = new Map([['p1', [rec('2026-09-08', 'Ann', 10)]]]);
  const { roles } = M.roleProjection({ projects: [PROJ()], actuals, weeks: WEEKS, today: TODAY, pulse: true, teams: new Set() });
  assert.equal(roles.length, 1);
  const dev = roles[0];
  assert.equal(dev.role, 'DEV');
  assert.equal(dev.sold, 100);
  assert.equal(dev.actuals, 10);
  assert.deepEqual(dev.children, [{ project: 'Alpha', task: 'Build', sold: 100, actual: 10 }]);
  assert.deepEqual(Object.keys(dev.cells), ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
  assert.deepEqual(dev.cells['2026-09-07'], { hours: 10, breakdown: [{ project: 'Alpha', task: 'Build', hours: 10 }], isPast: true, isPulse: false });
  near(dev.cells['2026-09-14'].hours, 30);
  assert.equal(dev.cells['2026-09-14'].isPast, false);
});

test('roleProjection: below 1 h/week and pulse on -> the whole month sits on the first future week', () => {
  const p = PROJ(); p.tasks[0].resources = [{ role: 'DEV', soldHours: 2 }];
  const { roles } = M.roleProjection({ projects: [p], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: true, teams: new Set() });
  assert.deepEqual(Object.keys(roles[0].cells), ['2026-09-14']);
  near(roles[0].cells['2026-09-14'].hours, 2);
  assert.equal(roles[0].cells['2026-09-14'].isPulse, true);
  const off = M.roleProjection({ projects: [p], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: false, teams: new Set() });
  assert.deepEqual(Object.keys(off.roles[0].cells), ['2026-09-14', '2026-09-21', '2026-09-28']);
});

test('roleProjection: a valid monthly distribution is used instead of the uniform spread', () => {
  const p = PROJ(); p.tasks[0].monthlyDistribution = { '202609': 100 };
  const { roles } = M.roleProjection({ projects: [p], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: true, teams: new Set() });
  near(roles[0].cells['2026-09-14'].hours, 100 / 3);
  assert.equal(roles[0].cells['2026-09-14'].isPulse, false);
});

test('roleProjection: completed tasks, tasks outside the window and roles outside the team filter are skipped', () => {
  const done = PROJ(); done.tasks[0].completed = true;
  assert.equal(M.roleProjection({ projects: [done], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: true, teams: new Set() }).roles.length, 0);
  const later = PROJ(); later.tasks[0].startDate = '20270101'; later.tasks[0].endDate = '20270131';
  assert.equal(M.roleProjection({ projects: [later], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: true, teams: new Set() }).roles.length, 0);
  const team = PROJ(); team.tasks[0].resources = [{ role: 'HWGDEV - DEVELOPER', soldHours: 10 }, { role: 'HWGQA - TESTER', soldHours: 10 }];
  const only = M.roleProjection({ projects: [team], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: true, teams: new Set(['HWGDEV']) });
  assert.deepEqual(only.roles.map(r => r.role), ['HWGDEV - DEVELOPER']);
});

test('roleProjection: a task falls back to the project dates; a role without a name is ignored', () => {
  const p = PROJ(); p.tasks[0].startDate = ''; p.tasks[0].endDate = '';
  p.tasks[0].resources = [{ role: '', soldHours: 5 }, { role: 'DEV', soldHours: 30 }];
  const { roles } = M.roleProjection({ projects: [p], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: true, teams: new Set() });
  assert.deepEqual(roles.map(r => r.role), ['DEV']);
});

test('roleProjection: a task with no dates anywhere yields a tiny hours/week and finishes fast (Review Focus #2)', () => {
  const p = { id: 'p1', name: 'Undated', startDate: '', endDate: '', tasks: [{ name: 'T', startDate: '', endDate: '', completed: false, resources: [{ role: 'DEV', soldHours: 100 }] }] };
  const t0 = Date.now();
  const { roles } = M.roleProjection({ projects: [p], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: true, teams: new Set() });
  assert.ok(Date.now() - t0 < 3000);
  assert.equal(Object.values(roles[0].cells).every(c => c.isPulse), true); // hours/week << 1 -> pulse
});

test('roleProjection: a Sunday actuals row is counted in its own week (Review Focus #1)', () => {
  const actuals = new Map([['p1', [rec('2026-09-13', 'Ann', 4)]]]); // Sunday of the week starting 2026-09-07
  const { roles } = M.roleProjection({ projects: [PROJ()], actuals, weeks: WEEKS, today: TODAY, pulse: true, teams: new Set() });
  near(roles[0].cells['2026-09-07'].hours, 4);
});

test('roleProjection: two projects sharing a role merge into one role node with two children', () => {
  const p2 = PROJ({ id: 'p2', name: 'Beta' });
  const { roles } = M.roleProjection({ projects: [PROJ(), p2], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: true, teams: new Set() });
  assert.equal(roles.length, 1);
  assert.equal(roles[0].sold, 200);
  assert.deepEqual(roles[0].children.map(c => c.project), ['Alpha', 'Beta']);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd api && node --test src/lib/planning-model.test.js`
Expected: FAIL (`M.roleProjection is not a function`).

- [ ] **Step 3: Implement** — insert before `module.exports` in `planning-model.js`, and add `roleProjection` to the exports:

```js
// ── By Role ───────────────────────────────────────────────────────────────────────────────
// Port of byRoleView's calculation block. Sold/Actuals totals only count tasks that overlap the
// visible window (weeks). Monthly distribution (task.monthlyDistribution) is honoured only here.
function roleProjection({ projects, actuals, weeks, today, pulse, teams }) {
  const countFw = makeFutureWeekCounter(today);
  const roleMap = {}, roleSoldMap = {}, roleActualsMap = {}, roleChildMap = {};

  for (const proj of projects) {
    const projData = actuals.get(proj.id) || [];
    const projLabel = proj.name || proj.id;

    for (const task of proj.tasks || []) {
      if (task.completed) continue;
      const tStart = parseTaskDate(task.startDate || proj.startDate, false);
      const tEnd   = parseTaskDate(task.endDate   || proj.endDate,   true);
      const overlapWeeks = weeks.filter(w => w.weekEnd >= tStart && w.weekStart <= tEnd);
      if (!overlapWeeks.length) continue;

      for (const res of task.resources || []) {
        if (!res.role) continue;
        if (!rolePassesTeams(teams, res.role)) continue;
        const soldH = res.soldHours || 0;
        const role = res.role;

        roleSoldMap[role] = (roleSoldMap[role] || 0) + soldH;
        const taskRoleRecs = projData.filter(r => matchesTaskRole(r, task.name, role));
        const consumedH = taskRoleRecs.reduce((s, r) => s + r.hours, 0);
        roleActualsMap[role] = (roleActualsMap[role] || 0) + consumedH;

        if (!roleChildMap[role]) roleChildMap[role] = {};
        const childKey = `${projLabel}::${task.name}`;
        if (!roleChildMap[role][childKey]) roleChildMap[role][childKey] = { project: projLabel, task: task.name, sold: 0, actual: 0 };
        roleChildMap[role][childKey].sold   += soldH;
        roleChildMap[role][childKey].actual += consumedH;

        const residualH = computeResidual(soldH, consumedH);
        if (!roleMap[role]) roleMap[role] = {};
        const cellOf = (key, isPast, isPulse) => (roleMap[role][key] ||= { hours: 0, breakdown: [], isPast, isPulse });

        for (const w of overlapWeeks.filter(w => w.isPast)) {
          const actualH = taskRoleRecs.filter(r => inWeek(r, w)).reduce((s, r) => s + r.hours, 0);
          if (actualH < 0.01) continue;
          const cell = cellOf(w.key, true, false);
          cell.hours += actualH;
          cell.breakdown.push({ project: projLabel, task: task.name, hours: actualH });
        }

        const futureWeeks = overlapWeeks.filter(w => !w.isPast);
        if (!futureWeeks.length || residualH < 0.01) continue;

        const pDist = task.monthlyDistribution;
        if (hasValidPhasing(pDist)) {
          for (const { key, hours } of phasedSeries({ residualH, pDist, futureWeeks, fallbackWeekCount: () => countFw(tStart, tEnd) })) {
            const cell = cellOf(key, false, false);
            cell.hours += hours;
            cell.breakdown.push({ project: projLabel, task: task.name, hours });
          }
        } else {
          const byMonth = {};
          for (const w of futureWeeks) (byMonth[w.monthKey] ||= []).push(w.key);
          const weeksByMonth = Object.entries(byMonth).map(([monthKey, weekKeys]) => ({ monthKey, weekKeys }));
          for (const entry of distributeFutureResidual(residualH, countFw(tStart, tEnd), weeksByMonth, pulse)) {
            const cell = cellOf(entry.key, false, entry.isPulse);
            if (entry.isPulse) cell.isPulse = true;
            cell.hours += entry.hours;
            cell.breakdown.push({ project: projLabel, task: task.name, hours: entry.hours });
          }
        }
      }
    }
  }

  return {
    roles: Object.keys(roleMap).map(role => ({
      role,
      sold: roleSoldMap[role] || 0,
      actuals: roleActualsMap[role] || 0,
      children: Object.values(roleChildMap[role] || {}),
      cells: roleMap[role],
    })),
  };
}
```

Also change the `module.exports` line to include `roleProjection` (keep `_internals` for now; remove it in Task 6 once all three exist).

- [ ] **Step 4: Run to verify they pass**

Run: `cd api && node --test src/lib/planning-model.test.js`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/planning-model.js api/src/lib/planning-model.test.js
git commit -m "feat: planning model By Role projection"
```

---

### Task 5: `projectProjection` (By Project)

**Files:**
- Modify: `api/src/lib/planning-model.js`, Test: `api/src/lib/planning-model.test.js` (append)

**Interfaces:**
- Consumes: Tasks 1–4 helpers; `ownerStatus: { [name]: 'active'|'inactive' }`.
- Produces: `projectProjection({ projects, actuals, weeks, today, pulse, teams, ownerStatus }): { projects: ProjectNode[] }`:
  - `ProjectNode = { id, sold, actuals, tbp, weekTotals: {[key]: number}, tasks: TaskNode[] }` (only projects with ≥ 1 rendered task, in request order)
  - `TaskNode = { name, startDate, endDate, sold, actuals, tbp, weekTotals, roles: RoleNode[] }` (raw `task.startDate`/`endDate` for the date badge; only tasks with ≥ 1 role)
  - `RoleNode = { role, sold, consumed, tbp, hasOwners, allOwnersInactive, weekData: {[key]: { total, byOwner: {[name]: h}, isPulse, isPast }}, owners: [{ name, isPlaceholder, actuals, tbp }] }`
- Rules: **uniform spread only** (no `monthlyDistribution`); role residual and owner split **per (task, role)**; future spread condition is `futureWeeks.length > 0 && residual > 0.01` (strict, unlike By Role); `distribute` sends hours to `'—'` when `!hasOwners || allOwnersInactive`; `roleTbp` = sum of non-past `weekData` totals; owner `tbp = roleTbp * ownerProp` with `ownerProp = 1` for the placeholder when `allOwnersInactive || totalOwnerH <= 0.01`, else `ownerFutureProps[name] || 0`; `displayOwners = hasOwners ? (allOwnersInactive ? ownerNames (+ '—' if absent) : ownerNames) : ['—']`; a task/project with no role node is skipped and contributes nothing to totals.

- [ ] **Step 1: Write the failing tests** (append)

```js
const TWO_ROLES = () => PROJ({ tasks: [{ name: 'Build', startDate: '20260901', endDate: '20260930', completed: false,
  monthlyDistribution: { '202609': 100 }, // ignored by By Project (uniform only)
  resources: [{ role: 'DEV', soldHours: 100 }] }] });

test('projectProjection: owner split by actuals, inactive owners excluded from the future share', () => {
  const actuals = new Map([['p1', [rec('2026-09-08', 'Mario Rossi', 6), rec('2026-09-09', 'Anna Bianchi', 4)]]]);
  const out = M.projectProjection({ projects: [TWO_ROLES()], actuals, weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(),
    ownerStatus: { 'Anna Bianchi': 'inactive' } });
  const role = out.projects[0].tasks[0].roles[0];
  assert.equal(role.sold, 100);
  assert.equal(role.consumed, 10);
  near(role.tbp, 90);
  assert.equal(role.hasOwners, true);
  assert.equal(role.allOwnersInactive, false);
  near(role.weekData['2026-09-14'].total, 30);                       // uniform, NOT the monthly distribution
  near(role.weekData['2026-09-14'].byOwner['Mario Rossi'], 30);
  assert.equal(role.weekData['2026-09-14'].byOwner['Anna Bianchi'], undefined);
  near(role.weekData['2026-09-07'].byOwner['Anna Bianchi'], 4);      // past week keeps the inactive person
  assert.deepEqual(role.owners.map(o => [o.name, o.actuals]), [['Mario Rossi', 6], ['Anna Bianchi', 4]]);
  near(role.owners[0].tbp, 90);
  near(role.owners[1].tbp, 0);
});

test('projectProjection: every owner inactive -> future hours go to the TBD row', () => {
  const actuals = new Map([['p1', [rec('2026-09-08', 'Anna Bianchi', 10)]]]);
  const out = M.projectProjection({ projects: [TWO_ROLES()], actuals, weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(),
    ownerStatus: { 'Anna Bianchi': 'inactive' } });
  const role = out.projects[0].tasks[0].roles[0];
  assert.equal(role.allOwnersInactive, true);
  assert.deepEqual(role.owners.map(o => o.name), ['Anna Bianchi', '—']);
  assert.equal(role.owners[1].isPlaceholder, true);
  near(role.owners[1].tbp, 90);
  near(role.weekData['2026-09-14'].byOwner['—'], 30);
});

test('projectProjection: no actuals -> a single TBD row; totals are summed up the tree', () => {
  const p = TWO_ROLES(); p.tasks.push({ name: 'Docs', startDate: '20260901', endDate: '20260930', completed: false, resources: [{ role: 'QA', soldHours: 30 }] });
  const out = M.projectProjection({ projects: [p], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(), ownerStatus: {} });
  const proj = out.projects[0];
  assert.equal(proj.tasks.length, 2);
  assert.equal(proj.tasks[0].roles[0].hasOwners, false);
  assert.deepEqual(proj.tasks[0].roles[0].owners.map(o => o.name), ['—']);
  assert.equal(proj.sold, 130);
  near(proj.tbp, 130);
  near(proj.weekTotals['2026-09-14'], 100 / 3 + 10);   // Build 100 h / 3 weeks + Docs 30 h / 3 weeks
});

test('projectProjection: a task with no matching role and a project with no tasks produce no nodes', () => {
  const p = TWO_ROLES();
  const out = M.projectProjection({ projects: [p], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(['NOPE']), ownerStatus: {} });
  assert.deepEqual(out.projects, []);
});

test('projectProjection: blank owner rows are attributed to the TBD placeholder owner', () => {
  const actuals = new Map([['p1', [rec('2026-09-08', '  ', 5)]]]);
  const out = M.projectProjection({ projects: [TWO_ROLES()], actuals, weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(), ownerStatus: {} });
  const role = out.projects[0].tasks[0].roles[0];
  assert.deepEqual(role.owners.map(o => o.name), ['—']);
  near(role.owners[0].actuals, 5);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd api && node --test src/lib/planning-model.test.js`
Expected: FAIL (`M.projectProjection is not a function`).

- [ ] **Step 3: Implement** — add before `module.exports`, export `projectProjection`:

```js
// ── By Project ────────────────────────────────────────────────────────────────────────────
// Port of byProjectView's calculation block. Residual and owner split are per (task, role);
// uniform spread only (no monthly distribution); dates fall back to the project's.
function projectProjection({ projects, actuals, weeks, today, pulse, teams, ownerStatus }) {
  const countFw = makeFutureWeekCounter(today);
  const weekByKey = new Map(weeks.map(w => [w.key, w]));
  const projectNodes = [];

  for (const proj of projects) {
    const projData = actuals.get(proj.id) || [];
    let projSold = 0, projActuals = 0, projTbp = 0;
    const projWeekTotals = {};
    const taskNodes = [];

    for (const task of proj.tasks || []) {
      if (task.completed) continue;
      const tStart = parseTaskDate(task.startDate || proj.startDate, false);
      const tEnd   = parseTaskDate(task.endDate   || proj.endDate,   true);
      const overlapWeeks = weeks.filter(w => w.weekEnd >= tStart && w.weekStart <= tEnd);
      if (!overlapWeeks.length) continue;

      let taskSold = 0, taskActuals = 0, taskTbp = 0;
      const taskWeekTotals = {};
      const roleNodes = [];

      for (const res of task.resources || []) {
        if (!res.role) continue;
        if (!rolePassesTeams(teams, res.role)) continue;
        const soldH = res.soldHours || 0;

        const taskRoleRecs = projData.filter(r => matchesTaskRole(r, task.name, res.role));
        const consumedH = taskRoleRecs.reduce((s, r) => s + r.hours, 0);
        const residualH = computeResidual(soldH, consumedH);

        const ownerTotals = {};
        for (const r of taskRoleRecs) { const o = ownerOf(r); ownerTotals[o] = (ownerTotals[o] || 0) + r.hours; }
        const totalOwnerH = Object.values(ownerTotals).reduce((s, v) => s + v, 0);
        const ownerNames = Object.keys(ownerTotals).sort((a, b) => ownerTotals[b] - ownerTotals[a]);
        const hasOwners = ownerNames.length > 0;

        const pastWeeks   = overlapWeeks.filter(w => w.isPast);
        const futureWeeks = overlapWeeks.filter(w => !w.isPast);
        const totalFw = countFw(tStart, tEnd);

        const roleWeekData = {};
        for (const w of pastWeeks) {
          const recs = taskRoleRecs.filter(r => inWeek(r, w));
          const tot = recs.reduce((s, r) => s + r.hours, 0);
          if (tot < 0.01) continue;
          const byOwner = {};
          for (const r of recs) { const o = ownerOf(r); byOwner[o] = (byOwner[o] || 0) + r.hours; }
          roleWeekData[w.key] = { total: tot, byOwner, isPulse: false, isPast: true };
        }

        const { props: ownerFutureProps, allInactive: allOwnersInactive } = redistributeExcludingInactive(ownerTotals, ownerStatus);
        const distribute = (byOwner, hours) => {
          if (hasOwners && !allOwnersInactive) {
            for (const [o, prop] of Object.entries(ownerFutureProps)) byOwner[o] = (byOwner[o] || 0) + hours * prop;
          } else {
            byOwner[PLACEHOLDER] = (byOwner[PLACEHOLDER] || 0) + hours;
          }
        };

        if (futureWeeks.length > 0 && residualH > 0.01) {
          const byMonth = {};
          for (const w of futureWeeks) (byMonth[w.monthKey] ||= []).push(w.key);
          const weeksByMonth = Object.entries(byMonth).map(([monthKey, weekKeys]) => ({ monthKey, weekKeys }));
          for (const entry of distributeFutureResidual(residualH, totalFw, weeksByMonth, pulse)) {
            if (!roleWeekData[entry.key]) roleWeekData[entry.key] = { total: 0, byOwner: {}, isPulse: entry.isPulse, isPast: false };
            roleWeekData[entry.key].total += entry.hours;
            if (entry.isPulse) roleWeekData[entry.key].isPulse = true;
            distribute(roleWeekData[entry.key].byOwner, entry.hours);
          }
        }

        const roleTbp = Object.entries(roleWeekData)
          .filter(([key]) => weekByKey.has(key) && !weekByKey.get(key).isPast)
          .reduce((s, [, d]) => s + d.total, 0);

        taskSold += soldH; taskActuals += consumedH; taskTbp += roleTbp;
        for (const [key, d] of Object.entries(roleWeekData)) taskWeekTotals[key] = (taskWeekTotals[key] || 0) + d.total;

        const displayOwners = hasOwners
          ? (allOwnersInactive ? (ownerNames.includes(PLACEHOLDER) ? ownerNames : [...ownerNames, PLACEHOLDER]) : ownerNames)
          : [PLACEHOLDER];
        const owners = displayOwners.map(name => {
          const isPlaceholder = name === PLACEHOLDER;
          const ownerProp = isPlaceholder && (allOwnersInactive || totalOwnerH <= 0.01) ? 1 : (ownerFutureProps[name] || 0);
          return { name, isPlaceholder, actuals: ownerTotals[name] || 0, tbp: roleTbp * ownerProp };
        });

        roleNodes.push({
          role: res.role, sold: soldH, consumed: consumedH, tbp: roleTbp,
          hasOwners, allOwnersInactive, weekData: roleWeekData, owners,
        });
      }

      if (!roleNodes.length) continue;
      projSold += taskSold; projActuals += taskActuals; projTbp += taskTbp;
      for (const [key, h] of Object.entries(taskWeekTotals)) projWeekTotals[key] = (projWeekTotals[key] || 0) + h;
      taskNodes.push({
        name: task.name, startDate: task.startDate, endDate: task.endDate,
        sold: taskSold, actuals: taskActuals, tbp: taskTbp, weekTotals: taskWeekTotals, roles: roleNodes,
      });
    }

    if (!taskNodes.length) continue;
    projectNodes.push({ id: proj.id, sold: projSold, actuals: projActuals, tbp: projTbp, weekTotals: projWeekTotals, tasks: taskNodes });
  }

  return { projects: projectNodes };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd api && node --test src/lib/planning-model.test.js`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/planning-model.js api/src/lib/planning-model.test.js
git commit -m "feat: planning model By Project projection"
```

---

### Task 6: `ownerProjection` (By Owner) and `buildProjection`

**Files:**
- Modify: `api/src/lib/planning-model.js`, Test: `api/src/lib/planning-model.test.js` (append)

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: `ownerProjection({ projects, actuals, weeks, today, pulse, teams, ownerStatus }): { ownerMap }` with `ownerMap = { [ownerName]: { sold, actuals, tbp, weekTotals: {[key]: {hours,isPulse,isPast}}, projects: { [projectId]: { name, sold, actuals, tbp, weekTotals, tasks: { [taskName]: { sold, actuals, tbp, weekData: {[key]: {hours,isPulse,isPast}} } } } } } }` (same shape the view uses today; the browser sorts owners/projects/tasks itself with `localeCompare`). And `buildProjection(view, input): object` dispatching `'role' | 'project' | 'owner'` (throws `Error('Unknown view')` otherwise).
- Rules: task dates **without** project fallback (`null` when absent → all future weeks of the window, count = number of window weeks); **no window-overlap skip**; resources = all roles passing the team filter (**no** `!res.role` check); residual is per **task** (`max(0, Σsold − Σconsumed)` over those resources), owners are aggregated over all of the task's matching records; task skipped when `sold < 0.01 && consumed < 0.01`; the future spread happens only when `taskTbp > 0.01`; owner list = owners with `> 0.01` actual hours; `ownerSold = soldH * actualsProp`; past weeks = **all** past window weeks (`weeks.filter(w => w.isPast)`, no task-date limit); cells with `< 0.001` hours are dropped.

- [ ] **Step 1: Write the failing tests** (append)

```js
const ROLES2 = () => PROJ({ tasks: [{ name: 'Build', startDate: '20260901', endDate: '20260930', completed: false,
  resources: [{ role: 'DEV', soldHours: 60 }, { role: 'QA', soldHours: 40 }] }] });

test('ownerProjection: task-level residual split among owners of ALL the task roles', () => {
  const actuals = new Map([['p1', [rec('2026-09-08', 'Mario', 20, 'DEV'), rec('2026-09-09', 'Anna', 10, 'QA')]]]);
  const { ownerMap } = M.ownerProjection({ projects: [ROLES2()], actuals, weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(), ownerStatus: {} });
  const mario = ownerMap.Mario, anna = ownerMap.Anna;
  near(mario.sold, 100 * (20 / 30));
  near(mario.actuals, 20);
  near(mario.tbp, 70 * (2 / 3));
  near(anna.tbp, 70 * (1 / 3));
  near(mario.weekTotals['2026-09-14'].hours, (70 / 3) * (2 / 3));
  assert.equal(mario.weekTotals['2026-09-07'].isPast, true);
  near(mario.projects.p1.tasks.Build.weekData['2026-09-14'].hours, (70 / 3) * (2 / 3));
  assert.equal(mario.projects.p1.name, 'Alpha');
});

test('ownerProjection: the team filter changes the task residual (max(0, sum) is not a sum of maxes)', () => {
  const actuals = new Map([['p1', [rec('2026-09-08', 'Mario', 70, 'HWGDEV - DEV')]]]);
  const p = PROJ({ tasks: [{ name: 'Build', startDate: '20260901', endDate: '20260930', completed: false,
    resources: [{ role: 'HWGDEV - DEV', soldHours: 60 }, { role: 'HWGQA - QA', soldHours: 40 }] }] });
  const all = M.ownerProjection({ projects: [p], actuals, weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(), ownerStatus: {} });
  near(all.ownerMap.Mario.tbp, 30);                         // 100 sold - 70 consumed
  const dev = M.ownerProjection({ projects: [p], actuals, weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(['HWGDEV']), ownerStatus: {} });
  near(dev.ownerMap.Mario.tbp, 0);                          // 60 sold - 70 consumed, floored
});

test('ownerProjection: inactive owners get no future share; nobody active -> TBD; no owners -> TBD', () => {
  const actuals = new Map([['p1', [rec('2026-09-08', 'Anna', 10, 'DEV')]]]);
  const inactive = M.ownerProjection({ projects: [ROLES2()], actuals, weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(), ownerStatus: { Anna: 'inactive' } });
  assert.deepEqual(Object.keys(inactive.ownerMap).sort(), ['Anna', '—']);
  near(inactive.ownerMap['—'].tbp, 90);
  near(inactive.ownerMap.Anna.tbp, 0);
  const none = M.ownerProjection({ projects: [ROLES2()], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(), ownerStatus: {} });
  assert.deepEqual(Object.keys(none.ownerMap), ['—']);
  near(none.ownerMap['—'].tbp, 100);
  near(none.ownerMap['—'].sold, 100);
});

test('ownerProjection: a task without dates spreads over all visible future weeks; tasks with nothing to plan are skipped', () => {
  const p = ROLES2(); p.tasks[0].startDate = ''; p.tasks[0].endDate = '';
  const { ownerMap } = M.ownerProjection({ projects: [p], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(), ownerStatus: {} });
  assert.deepEqual(Object.keys(ownerMap['—'].weekTotals), ['2026-09-14', '2026-09-21', '2026-09-28']);
  near(ownerMap['—'].weekTotals['2026-09-14'].hours, 100 / 3);
  const zero = ROLES2(); zero.tasks[0].resources = [{ role: 'DEV', soldHours: 0 }];
  assert.deepEqual(M.ownerProjection({ projects: [zero], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(), ownerStatus: {} }).ownerMap, {});
});

test('ownerProjection: same-named tasks in one project merge (keyed by task name)', () => {
  const p = ROLES2(); p.tasks.push({ ...p.tasks[0], resources: [{ role: 'DEV', soldHours: 10 }] });
  const { ownerMap } = M.ownerProjection({ projects: [p], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(), ownerStatus: {} });
  near(ownerMap['—'].projects.p1.tasks.Build.sold, 110);
});

test('buildProjection dispatches by view and rejects unknown views', () => {
  const input = { projects: [], actuals: new Map(), weeks: WEEKS, today: TODAY, pulse: false, teams: new Set(), ownerStatus: {} };
  assert.deepEqual(M.buildProjection('role', input), { roles: [] });
  assert.deepEqual(M.buildProjection('project', input), { projects: [] });
  assert.deepEqual(M.buildProjection('owner', input), { ownerMap: {} });
  assert.throws(() => M.buildProjection('nope', input), /Unknown view/);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd api && node --test src/lib/planning-model.test.js`
Expected: FAIL (`M.ownerProjection is not a function`).

- [ ] **Step 3: Implement** — add before `module.exports`; then replace the exports with the final list (drop `_internals`):

```js
// ── By Owner ──────────────────────────────────────────────────────────────────────────────
// Port of byOwnerView's calculation block. The residual is per TASK over the roles that pass the
// team filter; owners are aggregated over all those roles; no project-date fallback, no window skip.
function ownerProjection({ projects, actuals, weeks, today, pulse, teams, ownerStatus }) {
  const countFw = makeFutureWeekCounter(today);
  const ownerMap = {};

  for (const proj of projects) {
    const projData = actuals.get(proj.id) || [];
    for (const task of proj.tasks || []) {
      if (task.completed) continue;
      const tStart = task.startDate ? parseTaskDate(task.startDate, false) : null;
      const tEnd   = task.endDate   ? parseTaskDate(task.endDate,   true)  : null;

      const resources = (task.resources || []).filter(res => rolePassesTeams(teams, res.role));
      if (!resources.length) continue;
      const soldH = resources.reduce((s, res) => s + (res.soldHours || 0), 0);
      const taskRecs = projData.filter(r => resources.some(res => matchesTaskRole(r, task.name, res.role)));

      const taskWeekData = {};
      const ownerTotals = {};
      let totalOwnerH = 0;

      for (const w of weeks) {
        if (!w.isPast) continue;
        const recs = taskRecs.filter(r => inWeek(r, w));
        if (!recs.length) continue;
        const byOwner = {};
        for (const r of recs) { const o = ownerOf(r); byOwner[o] = (byOwner[o] || 0) + r.hours; }
        taskWeekData[w.key] = { total: recs.reduce((s, r) => s + r.hours, 0), byOwner, isPulse: false, isPast: true };
      }
      for (const r of taskRecs) { const o = ownerOf(r); ownerTotals[o] = (ownerTotals[o] || 0) + r.hours; }
      Object.values(ownerTotals).forEach(h => { totalOwnerH += h; });

      const consumedH = totalOwnerH;
      const taskTbp = computeResidual(soldH, consumedH);
      if (soldH < 0.01 && consumedH < 0.01) continue;

      const ownerNames = Object.entries(ownerTotals).filter(([, h]) => h > 0.01).sort((a, b) => b[1] - a[1]).map(([o]) => o);
      const hasOwners = ownerNames.length > 0;
      const ownerTotalsForSplit = Object.fromEntries(Object.entries(ownerTotals).filter(([, h]) => h > 0.01));
      const { props: ownerFutureProps, allInactive: allOwnersInactive } = redistributeExcludingInactive(ownerTotalsForSplit, ownerStatus);

      if (taskTbp > 0.01) {
        const futureWeeks = weeks.filter(w => !w.isPast);
        const taskWeeks = tStart && tEnd ? futureWeeks.filter(w => w.weekEnd >= tStart && w.weekStart <= tEnd) : futureWeeks;
        const totalTaskFw = (tStart && tEnd) ? countFw(tStart, tEnd) : taskWeeks.length;
        const distribute = (byOwner, hours) => {
          if (!allOwnersInactive) {
            for (const [o, prop] of Object.entries(ownerFutureProps)) byOwner[o] = (byOwner[o] || 0) + hours * prop;
          } else {
            byOwner[PLACEHOLDER] = (byOwner[PLACEHOLDER] || 0) + hours;
          }
        };
        const byMonth = {};
        for (const w of taskWeeks) (byMonth[w.monthKey] ||= []).push(w.key);
        const weeksByMonth = Object.entries(byMonth).map(([monthKey, weekKeys]) => ({ monthKey, weekKeys }));
        for (const entry of distributeFutureResidual(taskTbp, totalTaskFw, weeksByMonth, pulse)) {
          if (!taskWeekData[entry.key]) taskWeekData[entry.key] = { total: 0, byOwner: {}, isPulse: entry.isPulse, isPast: false };
          taskWeekData[entry.key].total += entry.hours;
          if (entry.isPulse) taskWeekData[entry.key].isPulse = true;
          distribute(taskWeekData[entry.key].byOwner, entry.hours);
        }
      }

      const displayOwners = hasOwners
        ? (allOwnersInactive ? (ownerNames.includes(PLACEHOLDER) ? ownerNames : [...ownerNames, PLACEHOLDER]) : ownerNames)
        : [PLACEHOLDER];
      for (const ownerName of displayOwners) {
        const isPlaceholder = ownerName === PLACEHOLDER;
        const ownerActualsProp = totalOwnerH > 0.01 ? (ownerTotals[ownerName] || 0) / totalOwnerH : (isPlaceholder ? 1 : 0);
        const ownerProp = isPlaceholder && (allOwnersInactive || totalOwnerH <= 0.01) ? 1 : (ownerFutureProps[ownerName] || 0);
        const ownerSold = soldH * ownerActualsProp;
        const ownerActuals = ownerTotals[ownerName] || 0;
        const ownerTbpH = taskTbp * ownerProp;

        const om = (ownerMap[ownerName] ||= { sold: 0, actuals: 0, tbp: 0, weekTotals: {}, projects: {} });
        om.sold += ownerSold; om.actuals += ownerActuals; om.tbp += ownerTbpH;
        const pm = (om.projects[proj.id] ||= { name: proj.name || proj.id, sold: 0, actuals: 0, tbp: 0, weekTotals: {}, tasks: {} });
        pm.sold += ownerSold; pm.actuals += ownerActuals; pm.tbp += ownerTbpH;
        const tm = (pm.tasks[task.name] ||= { sold: 0, actuals: 0, tbp: 0, weekData: {} });
        tm.sold += ownerSold; tm.actuals += ownerActuals; tm.tbp += ownerTbpH;

        for (const w of weeks) {
          const d = taskWeekData[w.key];
          if (!d) continue;
          const oh = d.byOwner[ownerName] || 0;
          if (oh < 0.001) continue;
          if (!tm.weekData[w.key]) tm.weekData[w.key] = { hours: 0, isPulse: d.isPulse, isPast: d.isPast };
          tm.weekData[w.key].hours += oh;
          if (!pm.weekTotals[w.key]) pm.weekTotals[w.key] = { hours: 0, isPulse: d.isPulse, isPast: d.isPast };
          pm.weekTotals[w.key].hours += oh;
          if (!om.weekTotals[w.key]) om.weekTotals[w.key] = { hours: 0, isPulse: d.isPulse, isPast: d.isPast };
          om.weekTotals[w.key].hours += oh;
        }
      }
    }
  }
  return { ownerMap };
}

function buildProjection(view, input) {
  if (view === 'role') return roleProjection(input);
  if (view === 'project') return projectProjection(input);
  if (view === 'owner') return ownerProjection(input);
  throw new Error('Unknown view');
}

module.exports = {
  PLACEHOLDER, normalizeActuals, groupActualsByProject, uniqueOwnerNames,
  inWeek, ownerOf, rolePassesTeams,
  roleProjection, projectProjection, ownerProjection, buildProjection,
};
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd api && node --test src/lib/planning-model.test.js src/lib/planning-calendar.test.js src/lib/planning-distribution.test.js`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/planning-model.js api/src/lib/planning-model.test.js
git commit -m "feat: planning model By Owner projection and view dispatcher"
```

---

### Task 7: Request validation

**Files:**
- Create: `api/src/lib/planning-request.js`, Test: `api/src/lib/planning-request.test.js`

**Interfaces:**
- Consumes: Task 1 `isoDate`.
- Produces: `parsePlanningRequest(body): { ok: true, value } | { ok: false, errors: { [field]: string } }` with `value = { view, projectIds: string[] (de-duplicated, order kept), teams: string[], from: Date, to: Date, asOf: Date, pulse: boolean }`. Limits: `projectIds` ≤ 2000 strings (each ≤ 64 chars), `teams` ≤ 500 strings, window ≤ 20 years, `from ≤ to`.

- [ ] **Step 1: Write the failing tests**

```js
// api/src/lib/planning-request.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePlanningRequest } = require('./planning-request');

const good = () => ({ view: 'role', projectIds: ['a', 'b', 'a'], teams: ['T'], from: '2026-09-01', to: '2026-12-31', asOf: '2026-09-15', pulse: true });

test('a valid request is normalised: dates parsed, ids de-duplicated in order', () => {
  const r = parsePlanningRequest(good());
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.projectIds, ['a', 'b']);
  assert.equal(r.value.from.toISOString().slice(0, 10), '2026-09-01');
  assert.equal(r.value.pulse, true);
  assert.deepEqual(r.value.teams, ['T']);
});

test('teams defaults to [], empty projectIds is valid', () => {
  const b = good(); delete b.teams; b.projectIds = [];
  const r = parsePlanningRequest(b);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.teams, []);
});

test('errors are reported per field', () => {
  const r = parsePlanningRequest({ view: 'x', projectIds: 'no', teams: [1], from: 'bad', to: '2026-01-01', asOf: '', pulse: 'yes' });
  assert.equal(r.ok, false);
  for (const f of ['view', 'projectIds', 'teams', 'from', 'asOf', 'pulse']) assert.ok(r.errors[f], `missing error for ${f}`);
});

test('from after to, and an over-long window, are rejected', () => {
  assert.ok(parsePlanningRequest({ ...good(), from: '2026-12-31', to: '2026-01-01' }).errors.to);
  assert.ok(parsePlanningRequest({ ...good(), from: '2000-01-01', to: '2026-01-01' }).errors.to);
});

test('size limits and non-object bodies', () => {
  assert.ok(parsePlanningRequest({ ...good(), projectIds: Array(2001).fill('x') }).errors.projectIds);
  assert.ok(parsePlanningRequest({ ...good(), projectIds: ['x'.repeat(65)] }).errors.projectIds);
  assert.equal(parsePlanningRequest(null).ok, false);
  assert.equal(parsePlanningRequest('nope').ok, false);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd api && node --test src/lib/planning-request.test.js`
Expected: FAIL (`Cannot find module './planning-request'`).

- [ ] **Step 3: Implement**

```js
// api/src/lib/planning-request.js
'use strict';
const { isoDate } = require('./planning-calendar');

const VIEWS = ['role', 'project', 'owner'];
const MAX_IDS = 2000, MAX_TEAMS = 500, MAX_WINDOW_DAYS = 20 * 366;

function stringList(v, max, maxLen) {
  if (!Array.isArray(v) || v.length > max) return null;
  if (!v.every(x => typeof x === 'string' && x.length <= maxLen)) return null;
  return v;
}

// Pure validation of POST /api/planning/model bodies (no Express dependency, unit-testable).
function parsePlanningRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, errors: { body: 'must be an object' } };
  const errors = {};

  if (!VIEWS.includes(body.view)) errors.view = `must be one of ${VIEWS.join(', ')}`;

  const ids = stringList(body.projectIds, MAX_IDS, 64);
  if (!ids) errors.projectIds = `must be an array of at most ${MAX_IDS} strings`;

  const teamsIn = body.teams === undefined ? [] : body.teams;
  const teams = stringList(teamsIn, MAX_TEAMS, 200);
  if (!teams) errors.teams = `must be an array of at most ${MAX_TEAMS} strings`;

  const from = isoDate(body.from), to = isoDate(body.to), asOf = isoDate(body.asOf);
  if (!from) errors.from = 'must be a YYYY-MM-DD date';
  if (!to) errors.to = 'must be a YYYY-MM-DD date';
  if (!asOf) errors.asOf = 'must be a YYYY-MM-DD date';
  if (from && to) {
    if (from > to) errors.to = 'must not be before from';
    else if ((to - from) / 86400000 > MAX_WINDOW_DAYS) errors.to = 'window is too long (max 20 years)';
  }
  if (typeof body.pulse !== 'boolean') errors.pulse = 'must be a boolean';

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { view: body.view, projectIds: [...new Set(ids)], teams, from, to, asOf, pulse: body.pulse } };
}

module.exports = { parsePlanningRequest };
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd api && node --test src/lib/planning-request.test.js`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/planning-request.js api/src/lib/planning-request.test.js
git commit -m "feat: planning model request validation"
```

---

### Task 8: Data service, route, invalidation, integration tests

**Files:**
- Modify: `api/src/lib/match-resource.js` (add `resolveOwnerStatuses`), `api/src/routes/resources.js` (import it, keep the re-export), `api/src/index.js`
- Create: `api/src/services/planning-data.js`, `api/src/routes/planning.js`
- Modify: `test-api.js` (register `testPlanningModel`), `TEST_CASES.md` (section 25)
- Test: `api/src/lib/match-resource.test.js` (append)

**Interfaces:**
- Consumes: Tasks 1–7; `query` from `../db/client`; `isAdminRole` from `../lib/is-admin`.
- Produces: `POST /api/planning/model` (`requireAuth`) → `{ view, ownerStatus, ...projection }`; `getPlanningData(): Promise<{ projects: Map<id, project>, actuals: Map<id, Rec[]>, resources, aliases }>` (30 s cache, single-flight); `invalidatePlanningData(): void`; `visibleProjectIds(user): Promise<Set<string>|null>` (`null` = all); `resolveOwnerStatuses(names, resources, aliases)` now exported from `lib/match-resource.js` (still re-exported by `routes/resources.js`).

- [ ] **Step 1: Move `resolveOwnerStatuses` (test first)**

Append to `api/src/lib/match-resource.test.js`:

```js
const { resolveOwnerStatuses } = require('./match-resource');

test('resolveOwnerStatuses (lib): active by default, inactive only for an unambiguous inactive match or alias', () => {
  const resources = [
    { id: 'r1', first_name: 'Jane', last_name: 'Doe', status: 'active' },
    { id: 'r2', first_name: 'John', last_name: 'Smith', status: 'inactive' },
  ];
  const aliases = [{ alias_normalized: 'jsmith', resource_id: 'r2' }];
  const out = resolveOwnerStatuses(['Jane Doe', 'John Smith', 'jsmith', 'Nobody Here'], resources, aliases);
  assert.deepEqual(out, { 'Jane Doe': 'active', 'John Smith': 'inactive', jsmith: 'inactive', 'Nobody Here': 'active' });
});
```

Run `cd api && node --test src/lib/match-resource.test.js` → FAIL (not exported). Then in `api/src/lib/match-resource.js` add before `module.exports` and export it:

```js
// names -> { [name]: 'active' | 'inactive' }: inactive only when the name resolves (alias or exact
// match) to an inactive resource; everything else — unmatched, ambiguous, ignored — counts as active.
function resolveOwnerStatuses(names, resources, aliases) {
  const ctx = buildMatchContext(resources, aliases);
  const statusById = new Map(resources.map(r => [r.id, r.status]));
  const result = {};
  for (const name of names) {
    const m = matchOwner(name, ctx);
    result[name] = ((m.kind === 'matched' || m.kind === 'alias') && statusById.get(m.resourceId) === 'inactive')
      ? 'inactive' : 'active';
  }
  return result;
}
```

`module.exports = { normalizeName, buildMatchContext, matchOwner, aggregateUnmatched, resolveOwnerStatuses };`

In `api/src/routes/resources.js`: delete the local `function resolveOwnerStatuses(...)` (lines 13-25 incl. its comment), add `resolveOwnerStatuses` to the `require('../lib/match-resource')` destructuring on line 5, and keep the final `module.exports.resolveOwnerStatuses = resolveOwnerStatuses;` line untouched (the existing `resources.test.js` keeps working).

Run: `cd api && node --test src/lib/match-resource.test.js` → PASS.

- [ ] **Step 2: Data service**

```js
// api/src/services/planning-data.js
'use strict';
// Loads everything the planning model needs (projects + tasks, actuals, resources/aliases) and
// caches the slim result in-process for CACHE_MS. One in-flight load is shared by concurrent
// callers. invalidatePlanningData() is called by a write-middleware (index.js) after any
// successful write under the project/timesheet/resource/reset routes; the TTL bounds staleness
// if a write path is ever missed.
const { query } = require('../db/client');
const { isAdminRole } = require('../lib/is-admin');
const { groupActualsByProject } = require('../lib/planning-model');

const CACHE_MS = 30_000;
let cache = null;      // { data, at }
let inflight = null;   // Promise<data>
let generation = 0;    // bumped on invalidate so a load that started before it is not cached

async function load() {
  const [projectsRes, sheetsRes, resourcesRes, aliasesRes] = await Promise.all([
    query(`SELECT p.id, p.code, p.name, p.start_date AS "startDate", p.end_date AS "endDate",
                  COALESCE((SELECT json_agg(json_build_object(
                      'name', pt.name, 'completed', pt.completed,
                      'startDate', pt.start_date, 'endDate', pt.end_date,
                      'monthlyDistribution', pt.monthly_distribution, 'resources', pt.resources
                    ) ORDER BY pt.sort_order)
                    FROM project_tasks pt WHERE pt.project_id = p.id), '[]'::json) AS tasks
           FROM projects p`),
    query('SELECT project_code, data FROM timesheets'),
    query('SELECT id, first_name, last_name, status FROM resources'),
    query('SELECT alias_normalized, resource_id FROM resource_aliases'),
  ]);
  const projects = new Map(projectsRes.rows.map(p => [p.id, { ...p, tasks: Array.isArray(p.tasks) ? p.tasks : [] }]));
  const actuals = groupActualsByProject(projectsRes.rows, sheetsRes.rows);
  return { projects, actuals, resources: resourcesRes.rows, aliases: aliasesRes.rows };
}

async function getPlanningData() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  if (inflight) return inflight;
  const startedAt = generation;
  inflight = load().then(data => {
    if (startedAt === generation) cache = { data, at: Date.now() };
    return data;
  }).finally(() => { inflight = null; });
  return inflight;
}

function invalidatePlanningData() {
  generation++;
  cache = null;
  inflight = null;
}

// Same visibility rule as GET /api/projects: admins/sysadmins see everything, others their own
// or shared projects. null = no restriction.
async function visibleProjectIds(user) {
  if (isAdminRole(user.role)) return null;
  const { rows } = await query(
    `SELECT p.id FROM projects p
     WHERE p.owner_id = $1 OR EXISTS(
       SELECT 1 FROM resource_shares rs
       WHERE rs.resource_type = 'project' AND rs.resource_id = p.id AND rs.user_id = $1)`,
    [user.id]
  );
  return new Set(rows.map(r => r.id));
}

module.exports = { getPlanningData, invalidatePlanningData, visibleProjectIds };
```

- [ ] **Step 3: Route**

```js
// api/src/routes/planning.js
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { parsePlanningRequest } = require('../lib/planning-request');
const { getCalendarWeeks } = require('../lib/planning-calendar');
const { uniqueOwnerNames, buildProjection } = require('../lib/planning-model');
const { resolveOwnerStatuses } = require('../lib/match-resource');
const { getPlanningData, visibleProjectIds } = require('../services/planning-data');

const router = express.Router();

// POST /api/planning/model — the calculation behind planning.html's three views (spec §14).
// Body: { view: 'role'|'project'|'owner', projectIds, teams?, from, to, asOf, pulse }.
// Unknown or not-visible project ids are ignored silently (no information leak).
router.post('/model', requireAuth, async (req, res, next) => {
  try {
    const parsed = parsePlanningRequest(req.body);
    if (!parsed.ok) return res.status(400).json({ error: 'Invalid request', fields: parsed.errors });
    const { view, projectIds, teams, from, to, asOf, pulse } = parsed.value;

    const [data, visible] = await Promise.all([getPlanningData(), visibleProjectIds(req.user)]);
    const projects = projectIds
      .filter(id => data.projects.has(id) && (!visible || visible.has(id)))
      .map(id => data.projects.get(id));

    const weeks = getCalendarWeeks(from, to, asOf);
    const ownerStatus = resolveOwnerStatuses(uniqueOwnerNames(projects, data.actuals), data.resources, data.aliases);
    const projection = buildProjection(view, {
      projects, actuals: data.actuals, weeks, today: asOf, pulse, teams: new Set(teams), ownerStatus,
    });
    res.json({ view, ownerStatus, ...projection });
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 4: Mount + invalidation middleware in `api/src/index.js`**

Add next to the other route requires: `const planningRoutes = require('./routes/planning');` and `const { invalidatePlanningData } = require('./services/planning-data');`. After `app.use(cookieParser());` add:

```js
// Any successful write under these prefixes may change what the planning model computes
// (projects/tasks, actuals, resources/aliases, bulk resets, cost-grid deletes that cascade to projects).
// One place instead of a call in every route; over-invalidating is harmless (30 s cache).
const PLANNING_WRITE_PREFIXES = ['/api/projects', '/api/timesheets', '/api/resources', '/api/admin/reset', '/api/cost-grids'];
app.use((req, res, next) => {
  if (req.method !== 'GET' && PLANNING_WRITE_PREFIXES.some(p => req.path.startsWith(p))) {
    res.on('finish', () => { if (res.statusCode < 400) invalidatePlanningData(); });
  }
  next();
});
```

and, before `app.use('/api', configRoutes);`, add `app.use('/api/planning', planningRoutes);`.

- [ ] **Step 5: Integration tests (`test-api.js`)**

Add this function next to the other `test*` functions and call `await testPlanningModel();` at the end of the `try` block in `main()` (after `testTopicExtraction()`); ids `PM-01…`:

```js
async function testPlanningModel() {
  section('Planning model');
  const ts = `${Date.now()}${++_fixtureSeq}`;
  const code = `TPLAN${ts}`;
  const body = (over = {}) => ({ view: 'role', projectIds: [], teams: [], from: '2099-01-01', to: '2099-03-31', asOf: '2099-01-10', pulse: false, ...over });

  ok((await api('POST', '/api/planning/model', body())).status === 401, 'PM-01 POST /api/planning/model without auth → 401');
  const bad = await api('POST', '/api/planning/model', { ...body(), view: 'nope', from: 'x' }, adminCookie);
  ok(bad.status === 400 && bad.data?.fields?.view && bad.data?.fields?.from, 'PM-02 invalid view/from → 400 with per-field errors');

  const rP = await api('POST', '/api/projects', { name: `__plan_${code}__`, code, startDate: '209901', endDate: '209903' }, adminCookie);
  const pid = rP.data?.id;
  if (!ok(!!pid, 'PM-setup project created')) return;
  later('DELETE', `/api/projects/${pid}`);
  await api('PUT', `/api/projects/${pid}/tasks`,
    [{ name: 'Analysis', startDate: '20990105', endDate: '20990329', resources: [{ role: 'Consultant', soldHours: 100 }] }], adminCookie);
  later('DELETE', `/api/timesheets/${code}`);
  const csv = ['projectId,date,task,role,owner,hours',
    `${code},2099-01-05,Analysis,Consultant,Plan Tester${ts},10`].join('\n');
  ok((await uploadCsv('/api/timesheets/upload', csv, adminCookie)).status === 201, 'PM-setup actuals uploaded');

  // PM-03: role view — actuals in the past week, residual spread over the future weeks
  const r = await api('POST', '/api/planning/model', body({ projectIds: [pid, pid, '00000000-0000-0000-0000-000000000000'] }), adminCookie);
  const role = r.data?.roles?.find(x => x.role === 'Consultant');
  ok(r.status === 200 && r.data?.view === 'role' && !!role, 'PM-03 role view returns the Consultant role (duplicate and unknown ids ignored)');
  ok(role?.sold === 100 && role?.actuals === 10, 'PM-03 sold 100, actuals 10');
  ok(Object.keys(role?.cells || {}).length > 1, 'PM-03 cells cover several weeks');
  const totalPlanned = Object.values(role?.cells || {}).filter(c => !c.isPast).reduce((s, c) => s + c.hours, 0);
  ok(Math.abs(totalPlanned - 90) < 1e-6, `PM-03 planned hours add up to the residual (got ${totalPlanned})`);

  // PM-04: project and owner views
  const rp = await api('POST', '/api/planning/model', body({ view: 'project', projectIds: [pid] }), adminCookie);
  ok(rp.status === 200 && rp.data?.projects?.[0]?.id === pid && rp.data.projects[0].tasks[0]?.roles?.[0]?.consumed === 10, 'PM-04 project view returns the task/role tree');
  const ro = await api('POST', '/api/planning/model', body({ view: 'owner', projectIds: [pid] }), adminCookie);
  ok(ro.status === 200 && !!ro.data?.ownerMap?.[`Plan Tester${ts}`], 'PM-04 owner view returns the owner map');
  ok(ro.data?.ownerStatus?.[`Plan Tester${ts}`] === 'active', 'PM-04 owner status is included (unmatched = active)');

  // PM-05: team filter is a server input
  const rt = await api('POST', '/api/planning/model', body({ teams: ['NoSuchTeam'], projectIds: [pid] }), adminCookie);
  ok(rt.status === 200 && (rt.data?.roles || []).length === 0, 'PM-05 a team filter that matches no role gives no roles');

  // PM-06: cache is invalidated by a write (new actuals appear immediately)
  const csv2 = ['projectId,date,task,role,owner,hours',
    `${code},2099-01-05,Analysis,Consultant,Plan Tester${ts},10`,
    `${code},2099-01-06,Analysis,Consultant,Plan Tester${ts},5`].join('\n');
  await uploadCsv(`/api/timesheets/upload?projectCode=${code}`, csv2, adminCookie);
  const r2 = await api('POST', '/api/planning/model', body({ projectIds: [pid] }), adminCookie);
  ok(r2.data?.roles?.find(x => x.role === 'Consultant')?.actuals === 15, 'PM-06 a new upload is visible right away (cache invalidated)');

  // PM-07: a non-admin who neither owns nor was shared the project gets an empty result, not an error
  // (covered by the visibility rule; the suite has no second regular user helper for projects)
}
```

Add to `TEST_CASES.md` a new `## 25. Planning model (2026-09-29)` section with rows `PM-01…PM-06` mirroring the labels above (follow the table format of section 24), plus a `PM-07` manual row: "As a non-admin user who is neither owner nor shared on a project, request the model with that project id → 200 with an empty projection".

- [ ] **Step 6: Run the pure suites and the isolated integration suite**

Run: `cd api && node --test src/lib/planning-calendar.test.js src/lib/planning-distribution.test.js src/lib/planning-model.test.js src/lib/planning-request.test.js src/lib/match-resource.test.js`
Expected: PASS.

Run (isolated stack; builds from the worktree): `scripts/run-tests.sh`
Expected: `PM-*` and all pre-existing sections pass.

- [ ] **Step 7: Commit**

```bash
git add api/src/lib/match-resource.js api/src/lib/match-resource.test.js api/src/routes/resources.js api/src/routes/planning.js api/src/services/planning-data.js api/src/index.js test-api.js TEST_CASES.md
git commit -m "feat: POST /api/planning/model with cached data service and write-invalidation"
```

---

### Task 9: Parity tooling and OLD-code baseline (Phase 0)

**Files:**
- Create: `api/src/scripts/seed-planning-golden.js`, `scripts/planning-golden-capture.js`
- Output (not committed): `backups/planning-golden/baseline-YYYYMMDD.json`

**Interfaces:**
- Produces: a seeded, reproducible dataset in an ISOLATED stack; a console script exposing `window.__planningGolden({ label }) → Promise<Capture>` where `Capture = { label, capturedAt, combos: [{ id, view, exportRows, periodMeta, htmlHash, htmlLength }] }`.
- **Runs against the isolated branch stack only** (`scripts/test-branch.sh up`, frontend on port 8081, API on 3001). The seeder REFUSES to run against `localhost` without an explicit non-80 port.

- [ ] **Step 1: Seeder** — write `api/src/scripts/seed-planning-golden.js`:

```js
#!/usr/bin/env node
'use strict';
// Seeds the Planning parity dataset through the public API. DEV TOOL — isolated stacks only.
//   SEED_URL=http://localhost:8081 SEED_EMAIL=... SEED_PASSWORD=... node seed-planning-golden.js [--remove]
// Everything is created with the GOLD- prefix and removed again by --remove.
const url = process.env.SEED_URL, email = process.env.SEED_EMAIL, password = process.env.SEED_PASSWORD;
if (!url || !email || !password) { console.error('Set SEED_URL, SEED_EMAIL, SEED_PASSWORD'); process.exit(2); }
const u = new URL(url);
if (!u.port || u.port === '80') { console.error('Refusing to seed: SEED_URL must be an isolated stack with an explicit non-80 port (never the main stack).'); process.exit(2); }

let cookie = '';
async function api(method, path, body) {
  const res = await fetch(`${url}${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
  const setCookie = res.headers.get('set-cookie'); if (setCookie) cookie = setCookie.split(';')[0];
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
async function upload(csv, code) {
  const form = new FormData(); form.append('file', new Blob([csv], { type: 'text/csv' }), 'ts.csv');
  const res = await fetch(`${url}/api/timesheets/upload?projectCode=${encodeURIComponent(code)}`, { method: 'POST', headers: { Cookie: cookie }, body: form });
  return res.status;
}

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const compact = d => ymd(d).replace(/-/g, '');
const ym = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}`;
const today = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));
const plus = n => new Date(today.getTime() + n * 86400000);
const nextMonths = (k) => Array.from({ length: k }, (_, i) => ym(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + i, 1))));

async function main() {
  const login = await api('POST', '/api/auth/login', { email, password });
  if (login.status !== 200) throw new Error(`login failed (${login.status})`);

  if (process.argv.includes('--remove')) {
    const projects = (await api('GET', '/api/projects')).data || [];
    for (const p of projects.filter(p => (p.code || '').startsWith('GOLD-') || (p.name || '').startsWith('GOLD '))) {
      await api('DELETE', `/api/timesheets/${p.code}`); await api('DELETE', `/api/projects/${p.id}`);
    }
    const resources = (await api('GET', '/api/resources')).data || [];
    for (const r of resources.filter(r => (r.last_name || r.lastName || '').startsWith('Golden'))) await api('DELETE', `/api/resources/${r.id}`);
    console.log('removed GOLD data'); return;
  }

  // Team roles (prefix before ' - ' is the team, used by the team filter).
  const roles = (await api('GET', '/api/roles')).data || [];
  let roleRow = roles[0];
  if (!roleRow) roleRow = (await api('POST', '/api/roles', { label: 'Golden seed role', code: 'GOLDSEED' })).data;
  if (!roleRow?.id) throw new Error('no role available for the golden resources');

  // Resources: one active, one inactive. Ann Golden / Bob Golden; 'Cy Unmatched' has no resource.
  const mk = async (first, last, status) => {
    const r = await api('POST', '/api/resources', { firstName: first, lastName: last, email: `${first}.${last}@golden.local`.toLowerCase(), roleId: roleRow.id });
    if (r.data?.id && status === 'inactive') await api('PATCH', `/api/resources/${r.data.id}`, { status: 'inactive' });
  };
  await mk('Ann', 'Golden', 'active'); await mk('Bob', 'Golden', 'inactive');

  const months = nextMonths(6);
  const dist = Object.fromEntries(months.slice(0, 4).map((m, i) => [m, [40, 30, 20, 10][i]]));
  const mkProject = async (code, name, start, end, tasks) => {
    const r = await api('POST', '/api/projects', { name, code, startDate: ym(start), endDate: ym(end), pipeline: 'Committed', status: 'Started' });
    if (!r.data?.id) throw new Error(`project ${code} not created (${r.status})`);
    const t = await api('PUT', `/api/projects/${r.data.id}/tasks`, tasks);
    if (t.status !== 200) throw new Error(`tasks of ${code} rejected (${t.status}): ${JSON.stringify(t.data)}`);
    return r.data.id;
  };

  await mkProject('GOLD-A', 'GOLD Alpha', plus(-70), plus(150), [
    { name: 'Build',  startDate: compact(plus(-45)), endDate: compact(plus(75)), monthlyDistribution: dist,
      resources: [{ role: 'GOLDT1 - DEV', soldHours: 200 }, { role: 'GOLDT2 - QA', soldHours: 80 }] },
    { name: 'Design', resources: [{ role: 'GOLDT1 - DEV', soldHours: 40 }] },                       // no task dates -> project dates
    { name: 'Docs',   startDate: compact(plus(10)), endDate: compact(plus(60)), resources: [{ role: 'GOLDT2 - QA', soldHours: 24 }] },  // tiny h/week -> pulse
    { name: 'Legacy', completed: true, resources: [{ role: 'GOLDT1 - DEV', soldHours: 10 }] },
  ]);
  await mkProject('GOLD-B', 'GOLD Beta', plus(-20), plus(120), [
    { name: 'Build', startDate: compact(plus(-10)), endDate: compact(plus(110)), monthlyDistribution: dist,
      resources: [{ role: 'GOLDT1 - DEV', soldHours: 120 }, { role: 'GOLDT3 - PM', soldHours: 30 }] },
    { name: 'Overrun', startDate: compact(plus(-30)), endDate: compact(plus(30)), resources: [{ role: 'GOLDT1 - DEV', soldHours: 5 }] }, // over-consumed
  ]);
  await mkProject('GOLD-C', 'GOLD Gamma one', plus(-10), plus(90), [
    { name: 'Shared', startDate: compact(plus(-5)), endDate: compact(plus(80)), resources: [{ role: 'GOLDT1 - DEV', soldHours: 60 }] },
  ]);
  await mkProject('GOLD-C', 'GOLD Gamma two', plus(-10), plus(90), [                                  // same code: both see the rows
    { name: 'Shared', startDate: compact(plus(-5)), endDate: compact(plus(80)), resources: [{ role: 'GOLDT1 - DEV', soldHours: 40 }] },
  ]);

  // Actuals over the last 8 weeks, including a Sunday row, blank owner, an unmatched owner, an inactive owner, tiny hours.
  const owners = ['Ann Golden', 'Bob Golden', 'Cy Unmatched', ''];
  const rows = (code, taskRoles) => {
    const out = ['projectId,date,task,role,owner,hours'];
    for (let d = -55, i = 0; d <= -1; d += 3, i++) {
      const date = plus(d);
      const [task, role] = taskRoles[i % taskRoles.length];
      out.push(`${code},${ymd(date)},${task},${role},${owners[i % owners.length]},${(i % 5) + 1.5}`);
    }
    const sunday = plus(-((today.getUTCDay() + 7) % 7) - 7 + 0); // a Sunday roughly a week back
    while (sunday.getUTCDay() !== 0) sunday.setUTCDate(sunday.getUTCDate() - 1);
    out.push(`${code},${ymd(sunday)},${taskRoles[0][0]},${taskRoles[0][1]},Ann Golden,3`);   // Sunday row
    out.push(`${code},${ymd(plus(-4))},${taskRoles[0][0]},${taskRoles[0][1]},Ann Golden,0.2`); // tiny hours
    return out.join('\n');
  };
  for (const [code, tr] of [
    ['GOLD-A', [['Build', 'GOLDT1 - DEV'], ['Build', 'GOLDT2 - QA'], ['Design', 'GOLDT1 - DEV']]],
    ['GOLD-B', [['Build', 'GOLDT1 - DEV'], ['Overrun', 'GOLDT1 - DEV'], ['Build', 'GOLDT3 - PM']]],
    ['GOLD-C', [['Shared', 'GOLDT1 - DEV']]],
  ]) console.log(code, 'upload →', await upload(rows(code, tr), code));
  console.log('seeded GOLD dataset');
}
main().catch(e => { console.error(e); process.exit(1); });
```

The CSV upload validates roles/tasks against each project's tasks: if a code's upload returns 400, read the response (`inconsistencies`) and adjust the `taskRoles` pairs to existing (task, role) pairs. Note `GOLD-C` has two projects with the same code (intentional, Review Focus #4).

- [ ] **Step 2: Capture script** — write `scripts/planning-golden-capture.js`:

```js
// Paste into the browser console on /planning.html (logged in), or load via the browser tool.
// Exposes window.__planningGolden({ label }): captures exportRows, periodMeta and an HTML hash of
// every view for a fixed set of combinations. Run it with the OLD code (baseline) and again after
// the migration; compare the two JSON files with a text/JSON diff.
(function () {
  const sha256 = async (s) => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  };
  const vmOf = () => document.querySelector('#planningApp').__vue_app__._instance.proxy;
  const settle = async (vm) => {
    for (let i = 0; i < 400; i++) {
      await vm.$nextTick(); await new Promise(r => setTimeout(r, 40));
      if (!vm.modelPending) { await vm.$nextTick(); if (!vm.modelPending) return; }   // undefined on the OLD code
    }
    throw new Error('model still pending');
  };
  const monthsFromNow = (vm, a, b) => {
    const n = new Date();
    return [new Date(n.getFullYear(), n.getMonth() + a, 1), new Date(n.getFullYear(), n.getMonth() + b + 1, 0)];
  };

  window.__planningGolden = async function ({ label = 'capture' } = {}) {
    const vm = vmOf();
    const views = ['byrole', 'byproject', 'byowner'];
    const windows = { full: monthsFromNow(vm, -3, 7), narrow: monthsFromNow(vm, 0, 1), past: monthsFromNow(vm, -3, -1) };
    const teamSets = { all: new Set(), dev: new Set(['GOLDT1']), qa: new Set(['GOLDT2']), devqa: new Set(['GOLDT1', 'GOLDT2']) };
    const combos = [];
    for (const view of views) for (const [wName, [ws, we]] of Object.entries(windows))
      for (const [tName, teams] of Object.entries(teamSets))
        for (const pulse of [true, false]) for (const interval of ['monthly', 'weekly']) {
          combos.push({ id: `${view}|${wName}|${tName}|pulse=${pulse}|${interval}`, view, ws, we, teams, pulse, interval });
        }
    const out = [];
    for (const c of combos) {
      vm.view = c.view; vm.windowStart = c.ws; vm.windowEnd = c.we; vm.teamFilters = c.teams;
      vm.monthlyPulse = c.pulse; vm.interval = c.interval; vm.roundHours = false;
      await settle(vm);
      const key = { byrole: 'byRoleView', byproject: 'byProjectView', byowner: 'byOwnerView' }[c.view];
      const r = vm[key];
      out.push({ id: c.id, view: c.view, exportRows: r.exportRows, periodMeta: r.periodMeta, htmlHash: await sha256(r.html), htmlLength: r.html.length });
    }
    return { label, capturedAt: new Date().toISOString(), combos: out };
  };
  console.log('window.__planningGolden ready');
})();
```

The projects shown are all eligible projects (no project filter); the seeded `GOLD-*` dataset plus any other data in the stack are part of the capture. If the stack has unrelated projects, that is fine as long as baseline and comparison run against the same data on the same calendar day.

- [ ] **Step 3: Bring up the isolated stack with seeded data and take the baseline (OLD code)**

1. `scripts/test-branch.sh up` (worktree). Note the frontend port (8081) and the test admin credentials it prints/uses (see `docs/scripts/test-branch.md`). If the API needs migrations `027`/`028` they are only relevant to topics; not needed here.
2. Seed: `SEED_URL=http://localhost:8081 SEED_EMAIL=<admin> SEED_PASSWORD=<pw> node api/src/scripts/seed-planning-golden.js` (from the repo root; Node ≥ 18 for `fetch`/`FormData`). Fix upload 400s as noted above.
3. In the browser (Claude in Chrome), open `http://localhost:8081/planning.html`, log in, wait for the page, load `scripts/planning-golden-capture.js` (paste its content via the javascript tool), then run `await window.__planningGolden({ label: 'baseline' })` and save the returned JSON to `backups/planning-golden/baseline-<YYYYMMDD>.json`.
4. **Sanity-check the baseline:** it must contain 3 views × 3 windows × 4 team sets × 2 pulse × 2 intervals = 144 combos, and `byowner|full|all|pulse=true|monthly` must show non-empty `exportRows` with `GOLD`-related rows.

If the page still runs the OLD code (this task must happen before Task 12), `vm.modelPending` is `undefined` and `settle` returns immediately — that is expected.

- [ ] **Step 4: Commit tooling (not the baseline)**

```bash
git add api/src/scripts/seed-planning-golden.js scripts/planning-golden-capture.js
git commit -m "chore: planning parity tooling (golden dataset seeder and browser capture)"
```

---

### Task 10: Payload and time benchmark

**Files:**
- Create: `api/src/scripts/bench-planning-model.js`

**Interfaces:**
- Consumes: Tasks 1–6 (`buildProjection`, `getCalendarWeeks`, `groupActualsByProject`).
- Produces: a script printing rows, response size (raw and gzip) and compute time per view for 200 projects / 150 owners / ~300 000 actuals rows over a 6-month window.

- [ ] **Step 1: Write the script**

```js
// api/src/scripts/bench-planning-model.js — node api/src/scripts/bench-planning-model.js
'use strict';
const zlib = require('zlib');
const { getCalendarWeeks, isoDate } = require('../lib/planning-calendar');
const { groupActualsByProject, buildProjection } = require('../lib/planning-model');

const P = 200, TASKS = 5, ROLES = ['T1 - DEV', 'T2 - QA'], OWNERS = 150, ROWS = 1500;
const today = isoDate('2026-09-15');
const projects = Array.from({ length: P }, (_, p) => ({
  id: `p${p}`, code: `C${p}`, name: `Project ${p}`, startDate: '202606', endDate: '202703',
  tasks: Array.from({ length: TASKS }, (_, t) => ({
    name: `T${t}`, startDate: '20260701', endDate: '20270228', completed: false,
    monthlyDistribution: t % 2 ? { '202610': 50, '202611': 50 } : null,
    resources: ROLES.map(r => ({ role: r, soldHours: 100 + t * 10 })),
  })),
}));
const sheets = projects.map((p, pi) => ({
  project_code: p.code,
  data: Array.from({ length: ROWS }, (_, i) => ({
    date: new Date(Date.UTC(2026, 5, 1 + ((i * 7 + pi) % 105))).toISOString().slice(0, 10),
    role: ROLES[i % 2], task: `T${i % TASKS}`, owner: `Person ${(pi * 7 + i) % OWNERS}`, hours: (i % 7) + 1,
  })),
}));
let t = Date.now();
const actuals = groupActualsByProject(projects, sheets);
console.log(`group+normalise ${sheets.length * ROWS} rows: ${Date.now() - t} ms`);

const weeks = getCalendarWeeks(isoDate('2026-07-01'), isoDate('2026-12-31'), today);
const ownerStatus = {};
for (const view of ['role', 'project', 'owner']) {
  t = Date.now();
  const out = buildProjection(view, { projects, actuals, weeks, today, pulse: true, teams: new Set(), ownerStatus });
  const ms = Date.now() - t;
  const json = JSON.stringify(out);
  console.log(`${view.padEnd(8)} compute ${String(ms).padStart(6)} ms | json ${(json.length / 1e6).toFixed(2)} MB | gzip ${(zlib.gzipSync(json).length / 1e6).toFixed(2)} MB`);
}
```

- [ ] **Step 2: Run and record**

Run: `node api/src/scripts/bench-planning-model.js`
Expected: prints one line per view. **Gate:** if any view's raw JSON exceeds ~10 MB or compute exceeds ~5 s, STOP and report the numbers to the user before continuing (the granularity of the response would need rethinking). Otherwise record the numbers in the commit message.

- [ ] **Step 3: Commit**

```bash
git add api/src/scripts/bench-planning-model.js
git commit -m "chore: benchmark for the planning model (payload and compute time)"
```

---

### Task 11: Client adapter module

**Files:**
- Create: `js/lib/planning-model-ui.js`, Test: `js/lib/planning-model-ui.test.js`

**Interfaces:**
- Produces (ES module, each also on `window`): `localYmd(date): 'YYYY-MM-DD'` (local getters), `buildKeyMap(weeks): Map<'YYYY-MM-DD', weekStart.toISOString()>` (`weeks` = the page's week objects with `weekStart: Date`), `remapKeys(obj, keyMap): object`, `adaptRoleModel(data, keyMap): { roleMap, roleSoldMap, roleActualsMap, roleChildMap }` (the four maps By Role's render code already uses; `roleChildMap[role]` is an object keyed by `project::task`), `adaptProjectModel(data, keyMap): { projects }` (same tree with `weekData`/`weekTotals` re-keyed), `adaptOwnerModel(data, keyMap): ownerMap` (same shape, all `weekTotals`/`weekData` re-keyed), `buildModelRequest({ view, projectIds, teams, windowStart, windowEnd, today, pulse }): object` (`view` is the page's `'byrole'|'byproject'|'byowner'`; the request uses `role|project|owner`, sorted `teams`, dates as local `YYYY-MM-DD`).

- [ ] **Step 1: Write the failing tests**

```js
// js/lib/planning-model-ui.test.js
import { describe, it, expect } from 'vitest';
import { localYmd, buildKeyMap, remapKeys, adaptRoleModel, adaptProjectModel, adaptOwnerModel, buildModelRequest } from './planning-model-ui.js';

const weeks = [{ weekStart: new Date(2026, 8, 7) }, { weekStart: new Date(2026, 8, 14) }];
const keyMap = buildKeyMap(weeks);

describe('planning-model-ui', () => {
  it('localYmd uses local date parts', () => {
    expect(localYmd(new Date(2026, 8, 7, 23, 30))).toBe('2026-09-07');
  });

  it('buildKeyMap maps calendar keys to the ISO string of the local week start', () => {
    expect(keyMap.get('2026-09-07')).toBe(new Date(2026, 8, 7).toISOString());
    expect([...keyMap.keys()]).toEqual(['2026-09-07', '2026-09-14']);
  });

  it('remapKeys renames known keys, keeps unknown ones', () => {
    expect(remapKeys({ '2026-09-07': 1, other: 2 }, keyMap)).toEqual({ [new Date(2026, 8, 7).toISOString()]: 1, other: 2 });
  });

  it('adaptRoleModel rebuilds the four maps of the By Role view', () => {
    const data = { roles: [{ role: 'DEV', sold: 100, actuals: 10,
      children: [{ project: 'A', task: 'T', sold: 100, actual: 10 }],
      cells: { '2026-09-07': { hours: 10, breakdown: [], isPast: true, isPulse: false } } }] };
    const m = adaptRoleModel(data, keyMap);
    expect(m.roleSoldMap).toEqual({ DEV: 100 });
    expect(m.roleActualsMap).toEqual({ DEV: 10 });
    expect(Object.values(m.roleChildMap.DEV)).toEqual([{ project: 'A', task: 'T', sold: 100, actual: 10 }]);
    expect(Object.keys(m.roleMap.DEV)).toEqual([new Date(2026, 8, 7).toISOString()]);
  });

  it('adaptProjectModel re-keys week maps at every level', () => {
    const data = { projects: [{ id: 'p', sold: 1, actuals: 0, tbp: 1, weekTotals: { '2026-09-14': 1 }, tasks: [{
      name: 'T', sold: 1, actuals: 0, tbp: 1, weekTotals: { '2026-09-14': 1 }, roles: [{
        role: 'R', weekData: { '2026-09-14': { total: 1, byOwner: {}, isPulse: false, isPast: false } }, owners: [] }] }] }] };
    const iso = new Date(2026, 8, 14).toISOString();
    const m = adaptProjectModel(data, keyMap);
    expect(Object.keys(m.projects[0].weekTotals)).toEqual([iso]);
    expect(Object.keys(m.projects[0].tasks[0].weekTotals)).toEqual([iso]);
    expect(Object.keys(m.projects[0].tasks[0].roles[0].weekData)).toEqual([iso]);
  });

  it('adaptOwnerModel re-keys owner, project and task week maps', () => {
    const cell = { hours: 1, isPulse: false, isPast: false };
    const data = { ownerMap: { A: { sold: 1, actuals: 0, tbp: 1, weekTotals: { '2026-09-07': cell },
      projects: { p: { name: 'P', sold: 1, actuals: 0, tbp: 1, weekTotals: { '2026-09-07': cell },
        tasks: { T: { sold: 1, actuals: 0, tbp: 1, weekData: { '2026-09-07': cell } } } } } } } };
    const iso = new Date(2026, 8, 7).toISOString();
    const m = adaptOwnerModel(data, keyMap);
    expect(Object.keys(m.A.weekTotals)).toEqual([iso]);
    expect(Object.keys(m.A.projects.p.weekTotals)).toEqual([iso]);
    expect(Object.keys(m.A.projects.p.tasks.T.weekData)).toEqual([iso]);
  });

  it('buildModelRequest maps the view, sorts teams and formats local dates', () => {
    const r = buildModelRequest({ view: 'byowner', projectIds: ['b', 'a'], teams: ['Z', 'A'],
      windowStart: new Date(2026, 8, 1), windowEnd: new Date(2026, 11, 31), today: new Date(2026, 8, 15, 18, 0), pulse: false });
    expect(r).toEqual({ view: 'owner', projectIds: ['b', 'a'], teams: ['A', 'Z'], from: '2026-09-01', to: '2026-12-31', asOf: '2026-09-15', pulse: false });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run js/lib/planning-model-ui.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```js
// js/lib/planning-model-ui.js
// Client side of the planning model (Cycle A): builds the POST /api/planning/model request and
// adapts the server's response (weeks keyed 'YYYY-MM-DD') into the shapes planning.html's render
// code already uses (weeks keyed by weekStart.toISOString()). Pure, DOM-free.

const pad = n => String(n).padStart(2, '0');
export function localYmd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export function buildKeyMap(weeks) {
  return new Map(weeks.map(w => [localYmd(w.weekStart), w.weekStart.toISOString()]));
}

export function remapKeys(obj, keyMap) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) out[keyMap.get(k) ?? k] = v;
  return out;
}

export function adaptRoleModel(data, keyMap) {
  const roleMap = {}, roleSoldMap = {}, roleActualsMap = {}, roleChildMap = {};
  for (const r of data.roles || []) {
    roleMap[r.role] = remapKeys(r.cells, keyMap);
    roleSoldMap[r.role] = r.sold;
    roleActualsMap[r.role] = r.actuals;
    roleChildMap[r.role] = {};
    for (const c of r.children) roleChildMap[r.role][`${c.project}::${c.task}`] = { ...c };
  }
  return { roleMap, roleSoldMap, roleActualsMap, roleChildMap };
}

export function adaptProjectModel(data, keyMap) {
  return {
    projects: (data.projects || []).map(p => ({
      ...p,
      weekTotals: remapKeys(p.weekTotals, keyMap),
      tasks: p.tasks.map(t => ({
        ...t,
        weekTotals: remapKeys(t.weekTotals, keyMap),
        roles: t.roles.map(r => ({ ...r, weekData: remapKeys(r.weekData, keyMap) })),
      })),
    })),
  };
}

export function adaptOwnerModel(data, keyMap) {
  const ownerMap = {};
  for (const [name, om] of Object.entries(data.ownerMap || {})) {
    const projects = {};
    for (const [pid, pm] of Object.entries(om.projects)) {
      const tasks = {};
      for (const [tn, tm] of Object.entries(pm.tasks)) tasks[tn] = { ...tm, weekData: remapKeys(tm.weekData, keyMap) };
      projects[pid] = { ...pm, weekTotals: remapKeys(pm.weekTotals, keyMap), tasks };
    }
    ownerMap[name] = { ...om, weekTotals: remapKeys(om.weekTotals, keyMap), projects };
  }
  return ownerMap;
}

const VIEW_NAMES = { byrole: 'role', byproject: 'project', byowner: 'owner' };

export function buildModelRequest({ view, projectIds, teams, windowStart, windowEnd, today, pulse }) {
  return {
    view: VIEW_NAMES[view],
    projectIds: [...projectIds],
    teams: [...teams].sort(),
    from: localYmd(windowStart),
    to: localYmd(windowEnd),
    asOf: localYmd(today),
    pulse: !!pulse,
  };
}

window.localYmd = localYmd;
window.buildKeyMap = buildKeyMap;
window.remapKeys = remapKeys;
window.adaptRoleModel = adaptRoleModel;
window.adaptProjectModel = adaptProjectModel;
window.adaptOwnerModel = adaptOwnerModel;
window.buildModelRequest = buildModelRequest;
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run js/lib/planning-model-ui.test.js`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add js/lib/planning-model-ui.js js/lib/planning-model-ui.test.js
git commit -m "feat: client adapter for the planning model"
```

---

### Task 12: `planning.html` plumbing and the By Role view

**Files:**
- Modify: `planning.html`

**Interfaces:**
- Consumes: Task 11 adapters (as `window` globals), Task 8 endpoint.
- Produces (Vue instance): data `model: null`, `modelPending: false`, `modelError: null`, `modelSeq: 0`; computed `modelRequest`; method `loadModel()`; a watcher on `modelRequest`. `byRoleView` reads `this.model` instead of computing.

- [ ] **Step 1: Load the adapter module** — in the `<script>` list of `planning.html` add, right after `<script type="module" src="js/lib/planning-calc.js?v=4"></script>`:

```html
<script type="module" src="js/lib/planning-model-ui.js?v=1"></script>
```

- [ ] **Step 2: Add state, request computed, watcher and loader.**

In `data()` add (after `ownerStatusMap`):

```js
model: null, modelPending: false, modelError: null, modelSeq: 0, // server projection of the active view (spec §14)
```

In `computed` add:

```js
modelRequest() {
  this.refreshTick; this.teamFilters; // reactive dependencies
  if (!this.windowStart || !this.windowEnd) return null;
  return buildModelRequest({
    view: this.view, projectIds: this.filteredProjects.map(p => p.id), teams: this.teamFilters,
    windowStart: this.windowStart, windowEnd: this.windowEnd, today: new Date(), pulse: this.monthlyPulse,
  });
},
```

In `watch` add (next to `teamFilters`):

```js
modelRequest() { this.loadModel(); },
```

In `methods` add:

```js
async loadModel() {
  const req = this.modelRequest;
  if (!req) return;
  const seq = ++this.modelSeq;
  this.modelPending = true; this.modelError = null;
  try {
    const res = await fetch('/api/planning/model', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (seq !== this.modelSeq) return;                       // a newer request superseded this one
    this.ownerStatusMap = data.ownerStatus || {};
    this.model = { view: data.view, data, keyMap: buildKeyMap(this.weeks) };
  } catch (err) {
    if (seq !== this.modelSeq) return;
    console.warn('[planning] model load failed:', err.message);
    this.modelError = err.message; this.model = null;
  } finally {
    if (seq === this.modelSeq) this.modelPending = false;
  }
},
modelPlaceholderHtml() {
  if (this.modelError) return `<div class="alert alert-danger mb-0">Could not load the planning data (${esc(this.modelError)}). Try reloading the page.</div>`;
  return '<div class="text-muted p-3">Loading planning data…</div>';
},
```

Note: `modelPending` is set synchronously by `loadModel()`, but the watcher fires after the next tick; between a filter change and that tick a computed may briefly render the old model — acceptable, and the golden capture's `settle()` waits two ticks.

- [ ] **Step 2b: Guard against the view/model mismatch.** `model.view` is `'role'|'project'|'owner'`. Each view computed must return `{ html: this.modelPlaceholderHtml(), exportRows: [], periodMeta: [] }` when `this.modelPending || !this.model || this.model.view !== '<its view>'`.

- [ ] **Step 3: Migrate `byRoleView`.** In `byRoleView()` after `const weeks = this.weeks;` add:

```js
if (this.modelPending || !this.model || this.model.view !== 'role') return { html: this.modelPlaceholderHtml(), exportRows: [], periodMeta: [] };
```

Then **delete** the calculation block that starts at the line `const roleMap = {};` and ends at the closing `});` of `projects.forEach(proj => {` (i.e. everything from `const roleMap = {};` down to and including the block that fills `roleMap`, `roleSoldMap`, `roleActualsMap`, `roleChildMap` — currently `planning.html` lines ~366–479, just before `const roles = Object.keys(roleMap).sort();`), and also the now-unused `const now = new Date(); const todayMidnight = …` two lines, and replace them with:

```js
const { roleMap, roleSoldMap, roleActualsMap, roleChildMap } = adaptRoleModel(this.model.data, this.model.keyMap);
```

Keep everything from `const roles = Object.keys(roleMap).sort();` onward **unchanged** (rendering, drill-down using `sumChildBreakdownHours`, export rows). `const projects = this.filteredProjects;` becomes unused in this view: delete it.

- [ ] **Step 4: Manual check (isolated stack)**

Restart nothing on the main stack. With the branch stack from Task 9 (`scripts/test-branch.sh up` again if it was torn down; it serves the worktree's frontend), open `/planning.html`, By Role view, and confirm: it shows "Loading planning data…" briefly then the table; changing the window/team/pulse refetches; `console` has no errors. (Numeric parity is proven in Task 15, not by eye.)

- [ ] **Step 5: Commit**

```bash
git add planning.html
git commit -m "feat: planning.html loads the planning model; By Role renders from it"
```

---

### Task 13: Migrate the By Project view

**Files:**
- Modify: `planning.html` (`byProjectView`)

**Interfaces:**
- Consumes: `adaptProjectModel`, `this.model` (`view: 'project'`), `ProjectNode/TaskNode/RoleNode` (Task 5).

- [ ] **Step 1: Guard + adapt.** After `const weeks = this.weeks;` in `byProjectView()` add:

```js
if (this.modelPending || !this.model || this.model.view !== 'project') return { html: this.modelPlaceholderHtml(), exportRows: [], periodMeta: [] };
const projectTree = adaptProjectModel(this.model.data, this.model.keyMap).projects;
```

- [ ] **Step 2: Restructure the loops, keeping every HTML/export line.** Replace the block from `projects.forEach(proj => {` (the outer loop right after `grandWeekTotals` initialisation, currently ~line 741) to the end of the outer loop (the `});` after `tbodyHtml += … ${projBodyHtml}\`;`) using the rule below. **Do not touch** the HTML template strings, `makePeriodCells`, `exportRows` pushes or `fmtPH`; only replace the *calculation* lines with aliases to the node fields, using exactly the variable names the template already uses.

Mapping (old calc → new alias, all inside the same loop nesting):

- Outer loop header: `projects.forEach(proj => {` → `projectTree.forEach(pNode => { const proj = (config.projects || []).find(p => p.id === pNode.id); if (!proj) return;` and delete `const projData = timesheetData.filter(...)`.
- Replace the `let projSold = 0, projActuals = 0, projTbp = 0;` + `projWeekTotals` init (`const projWeekTotals = {}; weeks.forEach(...)`) with:
  `const projSold = pNode.sold, projActuals = pNode.actuals, projTbp = pNode.tbp; const projWeekTotals = pNode.weekTotals;`
- Task loop header `(proj.tasks || []).forEach(task => {` → `pNode.tasks.forEach(tNode => { const task = { name: tNode.name, startDate: tNode.startDate, endDate: tNode.endDate };` and delete `if (task.completed) return;`, the `tStart/tEnd/overlapWeeks` lines and `if (!overlapWeeks.length) return;`.
- Replace the task accumulators (`let taskSold = 0, taskActuals = 0, taskTbp = 0;` + `taskWeekTotals` init) with:
  `const taskSold = tNode.sold, taskActuals = tNode.actuals, taskTbp = tNode.tbp; const taskWeekTotals = tNode.weekTotals;`
- Role loop header `(task.resources || []).forEach(res => {` → `tNode.roles.forEach(rNode => { const res = { role: rNode.role }; const soldH = rNode.sold, consumedH = rNode.consumed, roleTbp = rNode.tbp, hasOwners = rNode.hasOwners, allOwnersInactive = rNode.allOwnersInactive; const roleWeekData = rNode.weekData;` and **delete** everything between the old `if (!res.role) return; …` and the `const noOwnerBadge` line: `soldH`, `taskRoleRecs`, `consumedH`, `residualH`, `ownerTotals`, `totalOwnerH`, `ownerNames`, `hasOwners`, `pastWeeks/futureWeeks`, `_totalFw`, the `roleWeekData` build (past and future), `redistributeExcludingInactive`, `distribute`, `roleTbp`, and the three accumulation lines (`taskSold += soldH; taskActuals += consumedH; taskTbp += roleTbp; Object.entries(roleWeekData)…`).
- Owner loop: replace `displayOwners.forEach(ownerName => { const isPlaceholder = …; const ownerActualsH = …; const ownerProp = …; const ownerTbpH = …;` with `rNode.owners.forEach(o => { const ownerName = o.name, isPlaceholder = o.isPlaceholder, ownerActualsH = o.actuals, ownerTbpH = o.tbp;` and delete the old `const displayOwners = …` line.
- The lines after each loop that accumulate up the tree (`projSold += taskSold; …`, `Object.entries(taskWeekTotals).forEach(…projWeekTotals…)`, and `if (!taskBodyHtml) return;` / `if (!projBodyHtml) return;`) must go: totals now come from the nodes. **Keep** the grand-total accumulation (`grandSold += projSold; grandActuals += projActuals; grandTbp += projTbp; Object.entries(projWeekTotals).forEach(([key, h]) => { grandWeekTotals[key] = (grandWeekTotals[key] || 0) + h; });`) and the `grandWeekTotals` initialisation exactly as they are.

Keep `if (!tbodyHtml) { return { html: '<div class="alert alert-info mb-0">No resource data found …` unchanged.

- [ ] **Step 3: Grep the view for leftovers.** Within `byProjectView` none of these identifiers may remain: `timesheetData`, `projData`, `taskRoleRecs`, `computeResidual`, `distributeFutureResidual`, `redistributeExcludingInactive`, `countFutureTaskWeeks`, `matchesTaskRole`, `ownerFutureProps`, `overlapWeeks`.

Run: `grep -n "byProjectView" planning.html` to find the range, then grep that range for the identifiers above; expected: no matches.

- [ ] **Step 4: Manual check** as in Task 12 Step 4, By Project view.

- [ ] **Step 5: Commit**

```bash
git add planning.html
git commit -m "feat: By Project view renders from the planning model"
```

---

### Task 14: Migrate the By Owner view and remove the legacy loads

**Files:**
- Modify: `planning.html` (`byOwnerView`, `created`, `onFileInputChange`, `refreshOwnerStatuses`)

- [ ] **Step 1: By Owner.** In `byOwnerView()` after `const weeks = this.weeks;` add:

```js
if (this.modelPending || !this.model || this.model.view !== 'owner') return { html: this.modelPlaceholderHtml(), exportRows: [], periodMeta: [] };
```

Delete the calculation block from `const ownerMap = {};` through the end of `projects.forEach(proj => {…});` (currently ~lines 1038–1149, ending just before `if (Object.keys(ownerMap).length === 0) {`) and replace it with:

```js
const ownerMap = adaptOwnerModel(this.model.data, this.model.keyMap);
```

Delete the now-unused `const projects = this.filteredProjects;` at the top of the view. Everything from `if (Object.keys(ownerMap).length === 0)` onward stays unchanged (sorted rendering, badges via `this.ownerStatusMap`, exports).

- [ ] **Step 2: Remove the legacy loads.**
  - First check what else depends on the browser copy of the actuals: `grep -n "timesheetData" js/upload.js js/core.js js/api-sync.js planning.html`. If `readXLS()` in `js/upload.js` (used by "📂 Load XLS") reads `timesheetData`, keep the `refreshTimesheetDataFromApi()` call in `created()`; otherwise remove it.
  - In `created()` remove `await this.refreshOwnerStatuses();` (statuses now arrive with the model).
  - Delete the method `refreshOwnerStatuses()` entirely and change `onFileInputChange` to:

```js
async onFileInputChange(e) {
  const f = e.target.files[0];
  e.target.value = '';
  if (f) await readXLS(f, async () => { this.bumpRefresh(); });
},
```

  - The data comment on `ownerStatusMap` ("from POST /api/resources/match-owners") should now read "from POST /api/planning/model".

- [ ] **Step 3: Grep the whole page for leftovers.** `grep -n "computeResidual\|distributeFutureResidual\|redistributeExcludingInactive\|countFutureTaskWeeks\|matchesTaskRole\|refreshOwnerStatuses\|match-owners" planning.html` — expected: only the `matchesTaskRole`-free/`computeResidual` uses that By Role's drill-down still needs (`computeResidual(child.sold, child.actual)`), nothing else. If `matchesTaskRole` still appears, it is dead code from another block: investigate before deleting.

- [ ] **Step 4: Manual check**, By Owner view; then switch between the three views and change window/team/pulse: each change refetches, "Loading planning data…" shows while pending, no console errors.

- [ ] **Step 5: Commit**

```bash
git add planning.html
git commit -m "feat: By Owner view renders from the planning model; drop legacy owner-status and actuals loading"
```

---

### Task 15: Phase 1 parity gate

**Files:**
- Output (not committed): `backups/planning-golden/after-phase1-YYYYMMDD.json`

- [ ] **Step 1: Capture the migrated page.** Same stack, same data, **same calendar day** as the baseline (Task 9). Reload `/planning.html`, load `scripts/planning-golden-capture.js`, run `await window.__planningGolden({ label: 'after-phase1' })`, save to `backups/planning-golden/after-phase1-<YYYYMMDD>.json`.

- [ ] **Step 2: Compare.** Write and run this throwaway comparison (do not commit) — it prints every differing combo with the first differing `exportRows` row:

```bash
node -e '
const a = require("./backups/planning-golden/baseline-YYYYMMDD.json"), b = require("./backups/planning-golden/after-phase1-YYYYMMDD.json");
const A = new Map(a.combos.map(c => [c.id, c])); let diffs = 0;
for (const c of b.combos) {
  const o = A.get(c.id); if (!o) { console.log("MISSING in baseline", c.id); diffs++; continue; }
  const same = JSON.stringify(o.exportRows) === JSON.stringify(c.exportRows) && JSON.stringify(o.periodMeta) === JSON.stringify(c.periodMeta) && o.htmlHash === c.htmlHash;
  if (!same) { diffs++; const i = o.exportRows.findIndex((r, k) => JSON.stringify(r) !== JSON.stringify(c.exportRows[k]));
    console.log("DIFF", c.id, "row", i, JSON.stringify(o.exportRows[i]), "=>", JSON.stringify(c.exportRows[i]), o.htmlHash === c.htmlHash ? "" : "(html differs)"); }
}
console.log(diffs ? diffs + " differing combos" : "PARITY: 0 differences over " + b.combos.length + " combos");
'
```

- [ ] **Step 3: Decide.**
  - **0 differences** → continue to Task 16.
  - **Differences** → classify each. A difference is only acceptable if it comes from a Sunday actuals row in By Role/By Project (Review Focus #1: the old page dropped that row from the week grid). For those: **STOP and report to the user** (which combos, which rows, before/after numbers) and wait for their decision (replicate the old drop for parity, or keep the corrected behaviour and record it in `docs/pages/planning.md`). Any other difference is a defect: find it with `SEED`-independent unit tests in `planning-model.test.js` first (add a failing test reproducing the case), fix the projection, re-run the capture. Never adjust the baseline.

- [ ] **Step 4: Commit** nothing here (data stays local); record the outcome (number of combos, differences, decisions) in the commit message of Task 16.

---

### Task 16: Remove the dead browser calculation

**Files:**
- Modify: `js/lib/planning-calc.js`, `js/lib/planning-calc.test.js`, `planning.html` (`?v` bump)

- [ ] **Step 1: Find what is still used.** For each exported function of `js/lib/planning-calc.js`, grep the repo: `grep -rn "<name>" --include=*.html --include=*.js .` (excluding `node_modules`). Expected after Tasks 12–14: `distributeFutureResidual`, `redistributeExcludingInactive`, `countFutureTaskWeeks` are used only by `planning-calc.js` itself and its test; `matchesTaskRole` and `computeResidual` are still used by `js/ai.js` (removed in Cycle B) and `computeResidual` by By Role's drill-down; `getCalendarWeeks` by the `weeks` computed; `sumChildBreakdownHours` by By Role. Do **not** delete anything still referenced.

- [ ] **Step 2: Delete the unused functions** (their `window.` bridges too) from `planning-calc.js` and their `describe`/`it` blocks from `planning-calc.test.js` (the equivalent server-side tests exist in `planning-distribution.test.js` / `planning-calendar.test.js`). Leave a one-line comment at the top of `planning-calc.js` naming where the calculation now lives (`api/src/lib/planning-model.js`).

- [ ] **Step 3: Bump the cache-buster.** `js/lib/planning-calc.js?v=4` → `?v=5` in every reference (`grep -rn "planning-calc.js" *.html`).

- [ ] **Step 4: Run the frontend tests.** Run: `npx vitest run` — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/lib/planning-calc.js js/lib/planning-calc.test.js planning.html
git commit -m "refactor: remove browser-side planning calculation now served by the backend (Phase 1 parity: <N> combos, <D> differences, see report)"
```

---

### Task 17: Phase 2 — window-independent monthly distribution

**Files:**
- Modify: `api/src/lib/planning-distribution.js`, `api/src/lib/planning-model.js`, tests

**Interfaces:**
- Produces: `phasedSeries({ residualH, pDist, visibleFutureWeeks, allFutureWeeks, fallbackWeekCount })` (`allFutureWeeks` = all future weeks of the task within the months covered by `pDist`; the percentages are normalised over **all** those months and the hours-per-week use the **full** week count of each month; only weeks in `visibleFutureWeeks` are emitted). `taskFutureWeeks(tStart, tEnd, pDist, today): Week[]` exported from `planning-model.js`' internals via `planning-calendar.js`? — put it in `planning-distribution.js` (it needs `getCalendarWeeks` from `planning-calendar.js`).

- [ ] **Step 1: Write the failing tests** — replace the two Phase-1 `phasedSeries` tests in `planning-distribution.test.js` with:

```js
const { taskFutureWeeks } = require('./planning-distribution');

test('phasedSeries (phase 2): hours per cell do not depend on the visible window', () => {
  const today = isoDate('2026-09-15');
  const pDist = { '202610': 40, '202611': 30, '202612': 30 };
  const tStart = isoDate('2026-09-01'), tEnd = isoDate('2026-12-31');
  const all = taskFutureWeeks(tStart, tEnd, pDist, today);
  const window = (from, to) => all.filter(w => w.weekStart >= isoDate(from) && w.weekStart <= isoDate(to));
  const full = phasedSeries({ residualH: 100, pDist, visibleFutureWeeks: window('2026-09-14', '2026-12-28'), allFutureWeeks: all, fallbackWeekCount: () => all.length });
  const narrow = phasedSeries({ residualH: 100, pDist, visibleFutureWeeks: window('2026-10-01', '2026-11-30'), allFutureWeeks: all, fallbackWeekCount: () => all.length });
  const byKey = s => Object.fromEntries(s.map(e => [e.key, e.hours]));
  for (const [k, h] of Object.entries(byKey(narrow))) assert.ok(Math.abs(h - byKey(full)[k]) < 1e-9, `${k}: narrow ${h} vs full ${byKey(full)[k]}`);
  // October carries 40 of the 100 hours in both.
  const octH = s => s.filter(e => e.key.startsWith('2026-09-28') || e.key.startsWith('2026-10')).reduce((t, e) => t + e.hours, 0);
  assert.ok(octH(full) > 0);
});

test('taskFutureWeeks: only future weeks overlapping the task, capped at the last distribution month; empty distribution -> []', () => {
  const today = isoDate('2026-09-15');
  const weeks = taskFutureWeeks(isoDate('2026-09-01'), isoDate('9999-12-31'), { '202610': 100 }, today);
  assert.ok(weeks.length > 0 && weeks.length < 10, `undated task must be capped by the distribution, got ${weeks.length}`);
  assert.equal(weeks.every(w => !w.isPast), true);
  assert.deepEqual(taskFutureWeeks(isoDate('2026-09-01'), isoDate('2026-12-31'), {}, today), []);
});

test('phasedSeries (phase 2): no percentage in any future month falls back to an even split of the visible weeks', () => {
  const today = isoDate('2026-09-15');
  const wk = getCalendarWeeks(isoDate('2026-09-15'), isoDate('2026-09-30'), today).filter(w => !w.isPast);
  const out = phasedSeries({ residualH: 30, pDist: { '202612': 100 }, visibleFutureWeeks: wk, allFutureWeeks: [], fallbackWeekCount: () => 3 });
  assert.deepEqual(out.map(e => e.hours), wk.map(() => 10));
});
```

Add to `planning-model.test.js` a By Role test pinning the fix:

```js
test('roleProjection (phase 2): a valid monthly distribution gives the same hours whatever the window shows', () => {
  const p = PROJ(); p.tasks[0].monthlyDistribution = { '202609': 40, '202610': 30, '202611': 30 };
  p.tasks[0].endDate = '20261130'; p.endDate = '202611';
  const wide = weeksOf(isoDate('2026-09-01'), isoDate('2026-11-30'), TODAY);
  const narrow = weeksOf(isoDate('2026-09-01'), isoDate('2026-10-31'), TODAY);
  const a = M.roleProjection({ projects: [p], actuals: new Map(), weeks: wide, today: TODAY, pulse: false, teams: new Set() }).roles[0].cells;
  const b = M.roleProjection({ projects: [p], actuals: new Map(), weeks: narrow, today: TODAY, pulse: false, teams: new Set() }).roles[0].cells;
  for (const [k, c] of Object.entries(b)) near(c.hours, a[k].hours);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd api && node --test src/lib/planning-distribution.test.js src/lib/planning-model.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement.** In `planning-distribution.js` replace `phasedSeries` and add `taskFutureWeeks` (require `getCalendarWeeks`, `utcDate` from `./planning-calendar`):

```js
// Future weeks of a task inside the months its monthly distribution covers (independent of any
// visible window). An undated task (end year 9999) is capped at the last month of the distribution.
function taskFutureWeeks(tStart, tEnd, pDist, today) {
  const months = Object.keys(pDist || {}).filter(ym => /^\d{6}$/.test(ym)).sort();
  if (!months.length) return [];
  const last = months[months.length - 1];
  const distEnd = utcDate(parseInt(last.slice(0, 4), 10), parseInt(last.slice(4, 6), 10), 0); // last day of that month
  const end = tEnd < distEnd ? tEnd : distEnd;
  const start = tStart > today ? tStart : today;
  if (end < start) return [];
  return getCalendarWeeks(start, end, today).filter(w => !w.isPast && w.weekEnd >= tStart && w.weekStart <= tEnd);
}

// PHASE 2: percentages are normalised over ALL future months of the task and hours per week use the
// full week count of each month; the visible window only decides which cells are emitted.
function phasedSeries({ residualH, pDist, visibleFutureWeeks, allFutureWeeks, fallbackWeekCount }) {
  const byMonth = {};
  for (const w of allFutureWeeks) (byMonth[ymOf(w)] ||= []).push(w);
  const distTotal = Object.keys(byMonth).reduce((s, ym) => s + (pDist[ym] || 0), 0);
  if (distTotal < 0.01) {
    const count = fallbackWeekCount();
    const hPerWeek = count > 0 ? residualH / count : residualH / visibleFutureWeeks.length;
    return visibleFutureWeeks.map(w => ({ key: w.key, hours: hPerWeek }));
  }
  const visible = new Set(visibleFutureWeeks.map(w => w.key));
  const out = [];
  for (const [ym, mWeeks] of Object.entries(byMonth)) {
    const hPerWk = (residualH * ((pDist[ym] || 0) / distTotal)) / mWeeks.length;
    for (const w of mWeeks) if (visible.has(w.key)) out.push({ key: w.key, hours: hPerWk });
  }
  return out;
}
```

Export `taskFutureWeeks`. In `planning-model.js` (`roleProjection`, phased branch) replace the call with:

```js
for (const { key, hours } of phasedSeries({
  residualH, pDist, visibleFutureWeeks: futureWeeks,
  allFutureWeeks: taskFutureWeeks(tStart, tEnd, pDist, today),
  fallbackWeekCount: () => countFw(tStart, tEnd),
})) {
```

and add `taskFutureWeeks` to the destructured import from `./planning-distribution`. The existing Phase-1 test in `planning-model.test.js` ("a valid monthly distribution is used instead of the uniform spread") still holds (`{ '202609': 100 }` over three weeks → 100/3 each).

- [ ] **Step 4: Run to verify they pass**

Run: `cd api && node --test src/lib/planning-distribution.test.js src/lib/planning-model.test.js`
Expected: all PASS.

- [ ] **Step 5: Phase 2 capture and diff.** Restart the isolated stack so the API loads the change (`scripts/test-branch.sh down && scripts/test-branch.sh up` — isolated stack only; reseed if `down` removed the data; the seeder is idempotent only after `--remove`, so run `--remove` first if needed), capture `after-phase2` (same day/data caveat: if the day changed, recapture the Phase-1 file first from the pre-fix commit or accept a fresh baseline pair). Compare against `after-phase1` with the Task 15 script.
  - **Expected differences:** only `byrole|narrow|*` and `byrole|past|*`-style combos (window not covering all months of a distributed task), only in cells of tasks that have a valid `monthlyDistribution` (GOLD-A/GOLD-B `Build`), and never in `byproject`/`byowner`. `byrole|full|*` should show **no** change if the full window covers the tasks' remaining months.
  - Any other difference is a defect. Write the before/after example (one narrow-window cell) into the report for the user.

- [ ] **Step 6: Commit**

```bash
git add api/src/lib/planning-distribution.js api/src/lib/planning-model.js api/src/lib/planning-distribution.test.js api/src/lib/planning-model.test.js
git commit -m "fix: monthly distribution in By Role no longer depends on the visible window"
```

---

### Task 18: Documentation and closing checks

**Files:**
- Create: `docs/api/planning-model.md`
- Modify: `docs/pages/planning.md`, `docs/api/lib.md`, `docs/js/lib.md`, `CLAUDE.md`, `TEST_CASES.md`, `test-cases.html`

- [ ] **Step 1: `docs/api/planning-model.md`.** Document: the endpoint contract (request fields, limits, errors, the three response shapes as in Tasks 4–6), the per-view rule table from the spec §4 (with the note that the differences are intentional and preserved), the cache (30 s TTL, write-middleware in `index.js`, single-flight), visibility rule, the calendar-date semantics and the Sunday note (Review Focus #1 and the user's decision from Task 15), and the Phase 2 change (with the before/after example). Reference the spec and this plan.

- [ ] **Step 2: Update the other docs.**
  - `docs/pages/planning.md`: new "Planning model (Cycle A, 2026-09)" section — how the page loads the model (`modelRequest`, `loadModel`, stale-response guard, loading state), what stayed in the browser (filters, period aggregation, HTML, exports), removed pieces (`refreshOwnerStatuses`, browser calculation), and the Phase 2 behaviour change.
  - `docs/api/lib.md`: entries for `planning-calendar.js`, `planning-distribution.js`, `planning-model.js`, `planning-request.js` and the moved `resolveOwnerStatuses`; the note that the calculation now exists once (browser copy removed).
  - `docs/js/lib.md`: `planning-model-ui.js`; the trimmed `planning-calc.js`.
  - `CLAUDE.md`: File-structure entries (new lib/service/route/scripts/module), the `planning.html` row/description, `js/lib/` modules list, the `api/src/routes/` list (`planning`), the write-invalidation middleware in `api/src/index.js`, and the `?v` change for `planning-calc.js`.
  - `TEST_CASES.md` section 25 finalised; `test-cases.html`: add a PL entry for the parity procedure (baseline/after capture, Sunday decision) and mark the entries that describe removed browser functions as covered by the backend tests.

- [ ] **Step 3: Whole-suite verification.**
  - `cd api && node --test src/lib/*.test.js` → PASS
  - `npx vitest run` → PASS
  - `scripts/run-tests.sh` → PASS (all sections incl. `PM-*`)
  - Grep for stragglers: `grep -rn "match-owners" planning.html js/` (none in `planning.html`); `grep -rn "?v=" planning.html | grep planning-` shows `planning-calc.js?v=5` and `planning-model-ui.js?v=1`.
  - `git diff --stat main...HEAD` review: only intended files.

- [ ] **Step 4: Commit**

```bash
git add docs CLAUDE.md TEST_CASES.md test-cases.html
git commit -m "docs: planning model backend (Cycle A)"
```

- [ ] **Step 5: Hand off to `/finish-cycle`.** Report to the user: parity result (combos compared, differences, the Sunday decision), the Phase 2 diff with the before/after example, the benchmark numbers, and that the Gate 2 manual check should repeat the capture-and-compare on the branch stack. `/finish-cycle` is the only allowed way to merge; also remember the memory-sync verification requested in `project_team_ux_backlog` at its Gate 5.

---

## Self-Review Notes

- **Spec coverage:** §1–§3 → Tasks 3–8/12–14 (scope) ; §4 rule differences → Tasks 4–6 (each view keeps its own rules, tests pin them); §5/§6/§14 (services, endpoint, projections, `teams` and window as inputs) → Tasks 1–8; §7 cache + invalidation → Task 8 (middleware replaces per-route calls; TTL 30 s); §8 client migration → Tasks 11–14; §9 Phase 0/1 (benchmark, golden capture, parity) → Tasks 9, 10, 15; §10/§14.3 Phase 2 → Task 17; §11 tests → tests inside each task + Task 18; §12 docs → Task 18; §13 risks → Review Focus + Task 15 stop rule. Two deliberate deviations from the spec text, both consistent with §14: the cache stores loaded *data* (projections are computed per request, since they depend on view/teams/window), and `pulse` is a required request field.
- **Type consistency:** `Week` objects (`key`, `weekStart`, `weekEnd`, `monthKey`, `isPast`, `isCurrent`) are produced by Task 1 and consumed unchanged in Tasks 2–6/17; projection outputs in Tasks 4–6 match the adapters (Task 11) and the view rewrites (Tasks 12–14): `cells`/`children` (role), `weekData`/`weekTotals`/`owners` (project), `ownerMap` (owner); `phasedSeries` changes signature in Task 17 and its only caller (`roleProjection`) is updated in the same task.
- **Placeholders:** none intended. The only "read and adjust" instruction is the CSV `(task, role)` pairs in the seeder (Task 9), which depend on the upload validator's response and are flagged explicitly.
