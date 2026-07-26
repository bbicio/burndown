# `planning.html` Vue 3 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `planning.html` (currently driven imperatively by `js/planning.js`'s ~1558 lines of `innerHTML`-based rendering) as a single Vue 3 instance (CDN, no build step), 1:1 behavioral parity for every reachable feature — filters, view/interval toggles, sliding date-window navigator, Monthly Pulse/Rounded-hours toggles, all three grouping views (By Role/By Project/By Owner), the `?projectId=` single-project entry point, XLS export/upload, and the AI Planning Sidebar — following the pattern validated by `project-config.html`/`portfolio.html`/`pipeline.html`/`costgrid.html`. This is the fifth and last Tier 2 page in the Vue migration roadmap.

**Correction to the design spec's assumed scope (found during pre-implementation source reading, before any code was written):** the design spec and brief both describe a "single-project Gantt view" backed by `renderPlanningView(projectId)`/`renderPlanningByTask`/`renderPlanningByRole` (`js/planning.js:183-395`), reached via `?projectId=`. Reading `planning.html`'s actual init script (`:240-246`) shows the `?projectId=` branch calls `showPlanningView(urlProjectId)` (`js/planning.js:388-394`), whose entire body is:
```js
function showPlanningView(projectId) {
  planningProjectId = projectId;
  planningReturnToBurndown = true;
  portfolioProjectFilters.clear();
  portfolioProjectFilters.add(projectId);
  showPortfolioPlanningView();
}
```
This does **not** call `renderPlanningView` at all — it only pre-seeds the project filter to one project and sets a title-text flag, then renders the exact same By Role/By Project/By Owner grouping tables `showPortfolioPlanningView()` always renders. Confirmed by `grep`: the only files referencing `renderPlanningView`/`renderPlanningByTask`/`renderPlanningByRole`/`#planningGanttContainer`/`#planningProjectName`/`#planningViewToggle` repo-wide are `js/planning.js` itself and the legacy, unloaded `app.js` (a pre-multi-page-split monolith, not referenced by any current `<script>` tag in any `*.html` file) — `planning.html` itself defines no `#planningGanttContainer`/`#planningProjectName`/`#planningViewToggle` elements at all. **`renderPlanningView`/`renderPlanningByTask`/`renderPlanningByRole`/`buildPlanningBarCells`/`buildWeekAllocationTable` (`js/planning.js:34-386`) are therefore confirmed dead code on this page** — unreachable from any entry point, orphaned since some earlier restructuring. This plan does not port them (they are deleted along with the rest of `js/planning.js` in Task 7, with no Vue equivalent — there is no functionality to preserve). The real `?projectId=` behavior — pre-select one project in the filter, adjust the title, still render the three normal grouping tables — is folded into Task 2's filter/title state, since it is a 3-line special case of state already being built there, not a separate view.

**Architecture:** Single `Vue.createApp({...}).mount('#planningApp')` instance (a new wrapping `<div>` introduced in Task 6 to also cover the AI Planning Sidebar and XLS file input, which sit outside the original `#portfolioPlanningSection` container) owns all filter/toggle/window-navigator state and the three grouping-view renderings. `js/planning.js`'s ~1558 lines fold entirely into the Vue instance's `data()`/`computed`/`methods`; the file itself is **deleted from disk** and its `<script>` tag removed from `planning.html` (matching the `js/pipeline-board.js`/`js/dashboard.js` precedent from prior cycles — confirmed exclusive to this page via `grep -rn "js/planning.js" *.html`). Because each grouping view's original renderer builds a deeply-nested, heavily inline-styled HTML table (sticky columns, tooltips, expand/collapse rows, rowspan/colspan headers) as a single string assigned to `container.innerHTML`, this migration keeps that exact string-building logic as `computed` properties returning a `tableHtml` string, bound via `v-html` — the same escape hatch already used in this codebase's other Vue pages for pre-built HTML fragments (e.g. `v-html="pipelineBadge(...)"` in `pipeline.html`/`costgrid.html`). This preserves exact pixel-for-pixel output (colors, tooltips, sticky positions) while making every input to that string-building (filters, window range, toggles) fully Vue-reactive — only the *inputs* move to Vue state; the *table-body string assembly* is ported near-verbatim as a `methods` function invoked by the `computed`. Interactive affordances inside the rendered HTML that the original wired via `addEventListener` after an `innerHTML` assignment (group expand/collapse rows, Bootstrap tooltips) are re-wired identically via a `$nextTick` callback after the reactive HTML updates, using the exact same DOM APIs (`querySelectorAll`, `addEventListener`) — this is not new DOM-manipulation code, it is the same code moved from a manual `renderX()` call site to a Vue update hook. `js/roles.js`/`js/clients.js`/`js/programs.js`/`js/ai.js`/`js/upload.js`/`js/portfolio.js` stay loaded, unmodified, called as globals from the new Vue instance's methods — matching how `pipeline.html`'s Vue rewrite still calls `js/costgrid.js` as a global library. `js/config-form.js`/`js/costgrid.js` `<script>` tags are dropped from `planning.html` (confirmed dead weight on this page; the files themselves are untouched, still needed by `costgrid.html`/`pipeline.html`/`project-config.html`). `js/lib/planning-calc.js` (existing — `matchesTaskRole`/`computeResidual`/`distributeFutureResidual`) gains `getCalendarWeeks`/`workingDaysInWeek`/`getPlanningPeriods`/`countFutureTaskWeeks`, extracted with TDD (vitest) — these are pure date/week-bucketing helpers, untested today, shared across every view.

**Tech Stack:** Vue 3 (CDN, `vue.global.prod.js`), vanilla JS, vitest (for the `js/lib/planning-calc.js` extensions).

## Global Constraints

1. No build step — Vue 3 via CDN only, matching every other Vue page.
2. `js/roles.js`/`js/clients.js`/`js/programs.js`/`js/ai.js`/`js/upload.js`/`js/portfolio.js` remain shared library files — this migration must not change their exported function signatures/behavior, since `js/ai.js`/`js/upload.js`/`js/portfolio.js` are each still genuinely used by `portfolio.html` (with different entry points on that page) and `js/roles.js`/`js/clients.js`/`js/programs.js` are still loaded by `costgrid.html`.
3. All user-facing text stays in English (`CLAUDE.md` "Language constraint") — `js/ai.js:101`'s existing "no API key" confirm message is in Italian ("Nessuna API key configurata..."); this is pre-existing text in a file this cycle does not otherwise rewrite, but is explicitly in scope to translate this cycle (scoped exception — only this one string in `js/ai.js` changes, nothing else in that file's logic).
4. `js/config-form.js` and `js/costgrid.js` `<script>` tags are dropped from `planning.html` (confirmed dead weight on this specific page — other pages that still need `js/costgrid.js` are unaffected, since the file itself is untouched).
5. `TEST_CASES.md`/`test-cases.html` must stay mirrored exactly.
6. Cache-busting `?v=N` bumps on any modified shared script, on every page that loads it.
7. `/finish-cycle` is the mandatory terminal step (test gate → manual verification → `/code-review` → merge → `/sync-docs` + report) — never `superpowers:finishing-a-development-branch`.
8. A dedicated empirical jsdom + real `vue.global.js` mount test (final task) is mandatory before the final whole-branch review — not optional, not deferred to post-merge browser testing alone.
9. Not in scope: migrating or rewriting `js/ai.js`'s (beyond the one string), `js/upload.js`'s, or `js/portfolio.js`'s internal logic; resolving the roles/clients/programs/ratecards Vue-vs-Vanilla consolidation question; removing `openPlanningAiAnalysis()` (`js/ai.js:515`, confirmed zero callers repo-wide); any build-step introduction; any backend/API change.

---

## File Structure

- Modify: `planning.html` (full rewrite — adds Vue 3 CDN script; replaces the static toolbar/filter/container markup with a Vue template; drops the old inline init script's ~150 lines of `addEventListener` DOM-wiring; removes `js/config-form.js`/`js/costgrid.js` `<script>` tags; keeps `#confirmModal`/`#jsonViewerModal` as untouched static Vanilla markup outside the Vue mount root; keeps the placeholder `<div>`s referenced by `js/portfolio.js`/`js/costgrid.js` globals)
- Delete: `js/planning.js` (1558 lines — folded entirely into `planning.html`'s Vue instance)
- Modify: `js/lib/planning-calc.js` (adds `getCalendarWeeks`, `workingDaysInWeek`, `getPlanningPeriods`, `countFutureTaskWeeks`, all vitest-covered, `window`-bridged)
- Modify: `js/lib/planning-calc.test.js` (existing file — already covers `matchesTaskRole`/`computeResidual`/`distributeFutureResidual`; adds new `describe` blocks for the 4 newly-extracted functions)
- Modify: `js/ai.js:101` (translate the one hardcoded Italian confirm string to English — no other change in this file; also gains its first-ever `?v=` cache-bust query param)
- Modify: `portfolio.html` (cache-bust bump only, on `js/ai.js`'s `<script>` tag — that page also loads the file this cycle modifies, per Global Constraint 6)

---

### Task 1: `js/lib/planning-calc.js` — extract week/period helpers (TDD)

**Files:**
- Modify: `js/lib/planning-calc.js` (existing file — currently holds `matchesTaskRole`/`computeResidual`/`distributeFutureResidual` and their `window.*` bridges, untouched; only additions)
- Modify: `js/lib/planning-calc.test.js` (existing file — new `describe` blocks appended)
- Modify: `js/planning.js:2-181` (deletes the 4 now-relocated function bodies; no other change in this task — the file itself is deleted wholesale in Task 8, but this task's deletion keeps `js/planning.js` from defining these names twice while the migration is in progress and other tasks still reference it as a porting source)
- Modify: `planning.html` (bump `?v=` on `js/lib/planning-calc.js`)

**Interfaces:**
- Consumes: nothing from earlier tasks (this is the first task).
- Produces: `getCalendarWeeks(startDate, endDate)` → `Array<{ weekStart: Date, weekEnd: Date, label: string, monthKey: string }>`; `workingDaysInWeek(week, taskStart, taskEnd)` → `number`; `getPlanningPeriods(cfg, interval)` → `Array<{ key, label, start: Date, end: Date }>` (monthly) or weekly-shaped periods; `countFutureTaskWeeks(tStart, tEnd, todayMidnight)` → `number`. All four are consumed by Tasks 3-6's Vue computed properties and remain callable as `window.*` globals for any other unmodified caller.

- [ ] **Step 1: Write the failing tests**

Read the existing `js/lib/planning-calc.test.js` first (it already imports `matchesTaskRole`/`computeResidual`/`distributeFutureResidual` from `./planning-calc.js` — keep that import line, add a second import line below it), then append:

```js
import { getCalendarWeeks, workingDaysInWeek, getPlanningPeriods, countFutureTaskWeeks } from './planning-calc.js';

describe('getCalendarWeeks', () => {
  it('anchors the first week to the Monday on or before startDate', () => {
    // 2026-01-07 is a Wednesday; the Monday on/before it is 2026-01-05
    const weeks = getCalendarWeeks(new Date(2026, 0, 7), new Date(2026, 0, 7));
    expect(weeks).toHaveLength(1);
    expect(weeks[0].weekStart).toEqual(new Date(2026, 0, 5));
    expect(weeks[0].weekEnd).toEqual(new Date(2026, 0, 11));
  });

  it('anchors correctly when startDate is itself a Monday', () => {
    const weeks = getCalendarWeeks(new Date(2026, 0, 5), new Date(2026, 0, 5));
    expect(weeks[0].weekStart).toEqual(new Date(2026, 0, 5));
  });

  it('anchors correctly when startDate is a Sunday (dow=0 wraps back 6 days)', () => {
    // 2026-01-11 is a Sunday; Monday on/before is 2026-01-05
    const weeks = getCalendarWeeks(new Date(2026, 0, 11), new Date(2026, 0, 11));
    expect(weeks[0].weekStart).toEqual(new Date(2026, 0, 5));
  });

  it('enumerates one week per 7-day span, inclusive of endDate', () => {
    const weeks = getCalendarWeeks(new Date(2026, 0, 5), new Date(2026, 0, 18));
    expect(weeks).toHaveLength(2);
    expect(weeks[1].weekStart).toEqual(new Date(2026, 0, 12));
    expect(weeks[1].weekEnd).toEqual(new Date(2026, 0, 18));
  });

  it('labels a single-month week as "DD-DD Mon"', () => {
    const weeks = getCalendarWeeks(new Date(2026, 0, 5), new Date(2026, 0, 5));
    expect(weeks[0].label).toBe('05-11 Jan');
  });

  it('labels a week spanning two months as "DD Mon-DD Mon"', () => {
    // Week of 2026-01-26 (Mon) to 2026-02-01 (Sun) spans January into February
    const weeks = getCalendarWeeks(new Date(2026, 0, 26), new Date(2026, 0, 26));
    expect(weeks[0].label).toBe('26 Jan-01 Feb');
  });

  it('sets monthKey from the week\'s start date', () => {
    const weeks = getCalendarWeeks(new Date(2026, 0, 5), new Date(2026, 0, 5));
    expect(weeks[0].monthKey).toBe('Jan 2026');
  });
});

describe('workingDaysInWeek', () => {
  it('counts Mon-Fri days that fall within both the week and the task range', () => {
    const week = { weekStart: new Date(2026, 0, 5), weekEnd: new Date(2026, 0, 11) }; // Mon 5 - Sun 11
    const count = workingDaysInWeek(week, new Date(2026, 0, 5), new Date(2026, 0, 11));
    expect(count).toBe(5); // Mon-Fri, weekend excluded
  });

  it('excludes days before the task start', () => {
    const week = { weekStart: new Date(2026, 0, 5), weekEnd: new Date(2026, 0, 11) };
    const count = workingDaysInWeek(week, new Date(2026, 0, 8), new Date(2026, 0, 11)); // task starts Thu
    expect(count).toBe(2); // Thu, Fri only
  });

  it('excludes days after the task end', () => {
    const week = { weekStart: new Date(2026, 0, 5), weekEnd: new Date(2026, 0, 11) };
    const count = workingDaysInWeek(week, new Date(2026, 0, 5), new Date(2026, 0, 7)); // task ends Wed
    expect(count).toBe(3); // Mon, Tue, Wed
  });

  it('returns 0 when the task range does not overlap any weekday of the week', () => {
    const week = { weekStart: new Date(2026, 0, 5), weekEnd: new Date(2026, 0, 11) };
    const count = workingDaysInWeek(week, new Date(2026, 0, 10), new Date(2026, 0, 11)); // Sat-Sun only
    expect(count).toBe(0);
  });
});

describe('getPlanningPeriods', () => {
  it('returns monthly periods keyed YYYYMM, one per month in the config\'s date range, when interval is monthly', () => {
    const cfg = { startDate: '20260101', endDate: '20260301' };
    // getPlanningPeriods relies on the global getMonthRangeFromCfg (js/portfolio.js) — the real
    // function is loaded as a page global, not imported, so this test stubs it directly on
    // globalThis exactly like the existing distributeFutureResidual tests stub no globals (this
    // is the first planning-calc function with an external global dependency).
    globalThis.getMonthRangeFromCfg = c => ['202601', '202602', '202603'];
    const periods = getPlanningPeriods(cfg, 'monthly');
    expect(periods).toHaveLength(3);
    expect(periods[0]).toMatchObject({ key: '202601' });
    expect(periods[0].start).toEqual(new Date(2026, 0, 1));
    expect(periods[0].end).toEqual(new Date(2026, 0, 31));
    delete globalThis.getMonthRangeFromCfg;
  });

  it('returns an empty array when the config has no resolvable month range', () => {
    globalThis.getMonthRangeFromCfg = () => [];
    expect(getPlanningPeriods({}, 'monthly')).toEqual([]);
    delete globalThis.getMonthRangeFromCfg;
  });

  it('returns one weekly period per calendar week spanning the full month range, when interval is weekly', () => {
    globalThis.getMonthRangeFromCfg = () => ['202601'];
    const periods = getPlanningPeriods({}, 'weekly');
    // January 2026: 1st is a Thursday, so the anchor Monday is 2025-12-29; last day is 2026-01-31 (Saturday)
    expect(periods[0].start).toEqual(new Date(2025, 11, 29));
    expect(periods[periods.length - 1].end.getMonth()).toBe(0); // still within/around January
    delete globalThis.getMonthRangeFromCfg;
  });
});

describe('countFutureTaskWeeks', () => {
  const today = new Date(2026, 0, 5); // Monday

  it('returns 0 when the task already ended before today', () => {
    expect(countFutureTaskWeeks(new Date(2025, 11, 1), new Date(2025, 11, 20), today)).toBe(0);
  });

  it('counts weeks from today\'s Monday through the task end when the task started in the past', () => {
    // Task ends 2026-01-18 (Sunday) — 2 full weeks from today's Monday (5th-11th, 12th-18th)
    const count = countFutureTaskWeeks(new Date(2025, 11, 1), new Date(2026, 0, 18), today);
    expect(count).toBe(2);
  });

  it('anchors to the task\'s own start when it starts in the future, not to today', () => {
    // Task starts 2026-02-02 (Monday), ends 2026-02-08 (Sunday) — exactly 1 week
    const count = countFutureTaskWeeks(new Date(2026, 1, 2), new Date(2026, 1, 8), today);
    expect(count).toBe(1);
  });

  it('returns 0 when tEnd is null/undefined', () => {
    expect(countFutureTaskWeeks(today, null, today)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- planning-calc`
Expected: FAIL — `getCalendarWeeks`/`workingDaysInWeek`/`getPlanningPeriods`/`countFutureTaskWeeks` are not exported from `./planning-calc.js` yet.

- [ ] **Step 3: Add the implementation to `js/lib/planning-calc.js`**

Read the existing file first (it must keep `matchesTaskRole`/`computeResidual`/`distributeFutureResidual` and their `window.*` bridges unchanged), then append (relocated verbatim from `js/planning.js:92-148`, with a `getMonthRangeFromCfg` global lookup for `getPlanningPeriods` since that dependency is a page global from `js/portfolio.js`, not another `js/lib/` module):

```js
// ── CALENDAR WEEK HELPERS (relocated verbatim from js/planning.js:92-148) ────

// Count future weeks (Mon-based, weekEnd >= todayMidnight) that overlap the task range.
// Used to compute hPerWeek independently of the visible axis range so that
// adding/removing months from the view doesn't change per-period values.
export function countFutureTaskWeeks(tStart, tEnd, todayMidnight) {
  if (!tEnd || tEnd < todayMidnight) return 0;
  const effectiveStart = (tStart && tStart > todayMidnight) ? tStart : todayMidnight;
  const mon = new Date(effectiveStart);
  mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  let count = 0;
  for (let d = new Date(mon); d <= tEnd; d.setDate(d.getDate() + 7)) {
    const wEnd = new Date(d); wEnd.setDate(wEnd.getDate() + 6);
    if (wEnd >= todayMidnight && (!tStart || wEnd >= tStart)) count++;
  }
  return count;
}

export function getCalendarWeeks(startDate, endDate) {
  // Find the Monday on or before startDate
  const anchor = new Date(startDate);
  const dow = anchor.getDay();
  anchor.setDate(anchor.getDate() - (dow === 0 ? 6 : dow - 1));

  const weeks = [];
  const cur = new Date(anchor);
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  while (cur <= endDate) {
    const weekStart = new Date(cur);
    const weekEnd   = new Date(cur); weekEnd.setDate(weekEnd.getDate() + 6);

    const sDay = weekStart.getDate();
    const eDay = weekEnd.getDate();
    const sMon = weekStart.getMonth();
    const eMon = weekEnd.getMonth();

    let label;
    if (sMon === eMon) {
      label = `${String(sDay).padStart(2,'0')}-${String(eDay).padStart(2,'0')} ${monthNames[sMon]}`;
    } else {
      label = `${String(sDay).padStart(2,'0')} ${monthNames[sMon]}-${String(eDay).padStart(2,'0')} ${monthNames[eMon]}`;
    }

    const monthKey = `${monthNames[weekStart.getMonth()]} ${weekStart.getFullYear()}`;

    weeks.push({ weekStart: new Date(weekStart), weekEnd: new Date(weekEnd), label, monthKey });
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

export function workingDaysInWeek(week, taskStart, taskEnd) {
  let count = 0;
  const d = new Date(week.weekStart);
  while (d <= week.weekEnd) {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5 && d >= taskStart && d <= taskEnd) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// getMonthRangeFromCfg is a page global defined in js/portfolio.js (unchanged by this
// migration) — read via globalThis rather than imported, since js/portfolio.js is a
// classic (non-module) script and js/lib/ modules only import from sibling js/lib/
// modules, never from classic globals, per this codebase's established convention.
export function getPlanningPeriods(cfg, interval) {
  const months = globalThis.getMonthRangeFromCfg(cfg);
  if (!months.length) return [];

  if (interval === 'monthly') {
    return months.map(ym => {
      const y = parseInt(ym.slice(0,4)), m = parseInt(ym.slice(4,6));
      return { key: ym,
        label: new Date(y, m-1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        start: new Date(y, m-1, 1), end: new Date(y, m, 0) };
    });
  }

  // Weekly: enumerate Mondays from the week containing project start to project end
  const [fy, fm] = [parseInt(months[0].slice(0,4)), parseInt(months[0].slice(4,6))];
  const [ly, lm] = [parseInt(months[months.length-1].slice(0,4)), parseInt(months[months.length-1].slice(4,6))];
  const anchor = new Date(fy, fm-1, 1);
  const dow = anchor.getDay();
  anchor.setDate(anchor.getDate() - (dow === 0 ? 6 : dow - 1)); // back to Monday
  const projectEnd = new Date(ly, lm, 0);
  const weeks = [];
  const cur = new Date(anchor);
  while (cur <= projectEnd) {
    const we = new Date(cur); we.setDate(we.getDate() + 6);
    weeks.push({ key: `${cur.getFullYear()}${String(cur.getMonth()+1).padStart(2,'0')}${String(cur.getDate()).padStart(2,'0')}`,
      label: cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      start: new Date(cur), end: new Date(we) });
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

window.getCalendarWeeks = getCalendarWeeks;
window.workingDaysInWeek = workingDaysInWeek;
window.getPlanningPeriods = getPlanningPeriods;
window.countFutureTaskWeeks = countFutureTaskWeeks;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- planning-calc`
Expected: PASS (all new tests, plus no regression on the existing `matchesTaskRole`/`computeResidual`/`distributeFutureResidual` tests in the same file, plus no regression on any other test file in the repo).

- [ ] **Step 5: Delete the now-relocated functions from `js/planning.js`**

In `js/planning.js`, delete lines 2-32 (`getPlanningPeriods`) and lines 87-148 (`countFutureTaskWeeks`, `getCalendarWeeks`, `workingDaysInWeek`) — the `window.*` bridge from Step 3 now supplies these same names as globals. Leave `buildPlanningBarCells` (`:34-85`) and `buildWeekAllocationTable` (`:150-181`) in place for now — they are ported into Vue methods in Task 6, not this task, and deleting them now would remove reference material other tasks still need to read from this file before it's wholesale-deleted in Task 8.

- [ ] **Step 6: Confirm no other file defines these names, then run the full test suite**

```bash
grep -n "^function getCalendarWeeks\|^function workingDaysInWeek\|^function getPlanningPeriods\|^function countFutureTaskWeeks" js/planning.js
```
Expected: no matches (all four deleted from `js/planning.js` in Step 5; they now live only in `js/lib/planning-calc.js`, bridged onto the same `window.*` names).

```bash
npm test
```
Expected: PASS (all files).

- [ ] **Step 7: Bump the cache-busting version on `js/lib/planning-calc.js`**

In `planning.html`, find:
```html
<script type="module" src="js/lib/planning-calc.js?v=1"></script>
```
Replace with:
```html
<script type="module" src="js/lib/planning-calc.js?v=2"></script>
```
(confirmed via `grep -rn "js/lib/planning-calc.js" *.html` that `planning.html` is the only page loading this module today — no other page needs the bump.)

- [ ] **Step 8: Commit**

```bash
git add js/lib/planning-calc.js js/lib/planning-calc.test.js js/planning.js planning.html
git commit -m "feat(planning): extract getCalendarWeeks/workingDaysInWeek/getPlanningPeriods/countFutureTaskWeeks into js/lib/planning-calc.js"
```

---

### Task 2: Vue skeleton, page shell, filters/toggles, window navigator, init, `?projectId=` entry

**Files:**
- Modify: `planning.html` (full file — adds Vue 3 CDN script; replaces the static toolbar/filter/container markup (`:52-118`) with a Vue template; drops the entire bottom inline `<script>` block (`:193-373`) and replaces it with a `Vue.createApp({...})` block; the 3 placeholder `<div>`s at `:123-127` and the `#confirmModal`/`#jsonViewerModal`/toast markup at `:129-169` stay untouched, outside the Vue mount root)
- Modify: `js/planning.js` (reference only in this task — no further deletions yet; Tasks 3-6 delete the remaining functions as they port them, Task 7 deletes the file itself)

**Interfaces:**
- Consumes: `js/lib/planning-calc.js`'s nothing directly yet (Tasks 3-6 do); global functions from `js/core.js`/`js/api-sync.js`/`js/clients.js`/`js/programs.js`/`js/roles.js`: `esc`, `getPpAxis`, `rolePassesTeamFilter`, `getProjectPipeline`, `pipelineBadge`, `statusBadge`, `loadClientsFromApi`, `loadProgramsFromApi`, `loadRolesFromApi`, `loadConfigFromApi`, `refreshTimesheetDataFromApi`, `loadPipelineBudgetsFromApi`, `initNav`, `loadSettings`, `refreshTimesheetData`, `updateAiButtonVisibility`; global `config` object.
- Produces: `data().view`/`interval`/`pipelineFilters`/`projectFilters`/`teamFilters`/`windowStart`/`windowEnd`/`monthlyPulse`/`roundHours`/`fullWidth`/`loading`/`loadError`/`returnToBurndown`/`refreshTick` (consumed by every later task); `computed.eligibleProjects`/`filteredProjects`/`allTeams`/`allPipelines`/`weeks`/`planningTitle` (consumed by Tasks 3-5's grouping-view computeds); `methods.toggleProjectFilter`/`toggleTeamFilter`/`togglePipelineFilter`/`selectAllProjects`/`selectAllTeams`/`resetProjectFilters`/`resetTeamFilters`/`expandLeft`/`shrinkLeft`/`expandRight`/`shrinkRight`/`bumpRefresh` (the last consumed by Task 6's XLS-upload completion callback).

- [ ] **Step 1: Add the Vue 3 CDN script and drop `js/config-form.js`/`js/costgrid.js`**

In `planning.html`, find the current script list (`:172-191`):

```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<script src="js/api.js?v=3"></script>
<script src="js/core.js?v=3"></script>
<script src="js/settings.js"></script>
<script src="js/notifications.js"></script>
<script src="js/roles.js"></script>
<script src="js/costgrid.js?v=5"></script>
<script type="module" src="js/lib/cfg-parse.js?v=1"></script>
<script type="module" src="js/lib/costgrid-calc.js?v=3"></script>
<script type="module" src="js/lib/planning-calc.js?v=1"></script>
<script src="js/config-form.js?v=11"></script>
<script src="js/clients.js"></script>
<script src="js/programs.js"></script>
<script src="js/portfolio.js"></script>
<script src="js/planning.js"></script>
<script src="js/upload.js"></script>
<script src="js/ai.js"></script>
<script src="js/api-sync.js?v=14"></script>
<script src="js/nav.js?v=4"></script>
```

Replace with (adds Vue CDN; drops `js/costgrid.js` and `js/config-form.js` — confirmed dead weight on this page per the design spec's Investigation findings 1; drops `js/lib/cfg-parse.js` and `js/lib/costgrid-calc.js`, which were only ever needed transitively by `js/config-form.js`/`js/costgrid.js`; bumps `js/lib/planning-calc.js` to `?v=2` per Task 1, Step 7; `js/planning.js` stays loaded for now — Tasks 3-6 still port logic out of it before Task 7 deletes it and its `<script>` tag):

```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script src="js/api.js?v=3"></script>
<script src="js/core.js?v=3"></script>
<script src="js/settings.js"></script>
<script src="js/notifications.js"></script>
<script src="js/roles.js"></script>
<script type="module" src="js/lib/planning-calc.js?v=2"></script>
<script src="js/clients.js"></script>
<script src="js/programs.js"></script>
<script src="js/portfolio.js"></script>
<script src="js/planning.js"></script>
<script src="js/upload.js"></script>
<script src="js/ai.js"></script>
<script src="js/api-sync.js?v=14"></script>
<script src="js/nav.js?v=4"></script>
```

- [ ] **Step 2: Replace the static toolbar/filter/container markup with the Vue template**

In `planning.html`, find (`:52-118`):

```html
  <!-- Resource Planning section (main content on this page) -->
  <div id="portfolioPlanningSection">
    <div class="page-title-bar">
      <h4 class="fw-bold mb-0" id="portfolioPlanningTitle">📅 Resource Planning</h4>
      <p class="text-muted small mb-0 mt-1">Hours distribution by role, project or owner — based on sold hours and actuals consumed</p>
    </div>
    <div class="page-toolbar">
      <div class="page-toolbar-left">
        <!-- Row 1: filters + view/interval toggles -->
        <div class="d-flex align-items-center gap-3 flex-wrap">
          <div class="d-flex align-items-center gap-2 flex-wrap" id="portfolioPlanningFilters"></div>
          <div class="vr" style="opacity:.3;align-self:stretch"></div>
          <div class="dropdown">
            <button class="btn btn-sm btn-outline-secondary dropdown-toggle" id="btnProjectFilter" data-bs-toggle="dropdown" data-bs-auto-close="outside">
              Projects <span class="badge bg-secondary ms-1" id="projectFilterBadge" style="display:none"></span>
            </button>
            <ul class="dropdown-menu shadow" id="projectFilterMenu" style="min-width:280px;max-height:320px;overflow-y:auto;padding:6px 0"></ul>
          </div>
          <button class="btn btn-sm btn-outline-danger" id="btnResetProjectFilter" style="display:none">✕ Projects</button>
          <div class="dropdown">
            <button class="btn btn-sm btn-outline-secondary dropdown-toggle" id="btnTeamFilter" data-bs-toggle="dropdown" data-bs-auto-close="outside">
              Team <span class="badge bg-secondary ms-1" id="teamFilterBadge" style="display:none"></span>
            </button>
            <ul class="dropdown-menu shadow" id="teamFilterMenu" style="min-width:240px;max-height:280px;overflow-y:auto;padding:6px 0"></ul>
          </div>
          <button class="btn btn-sm btn-outline-danger" id="btnResetTeamFilter" style="display:none">✕ Team</button>
          <div class="vr" style="opacity:.3;align-self:stretch"></div>
          <div class="btn-group btn-group-sm" id="ppViewToggle">
            <button class="btn btn-outline-secondary active" data-ppview="byrole">By Role</button>
            <button class="btn btn-outline-secondary" data-ppview="byproject">By Project</button>
            <button class="btn btn-outline-secondary" data-ppview="byowner">By Owner</button>
          </div>
          <div class="btn-group btn-group-sm" id="ppIntervalToggle">
            <button class="btn btn-outline-secondary active" data-ppinterval="monthly">Monthly</button>
            <button class="btn btn-outline-secondary" data-ppinterval="weekly">Weekly</button>
          </div>
        </div>
        <!-- Row 2: window navigation + display toggles -->
        <div class="d-flex align-items-center gap-3 flex-wrap mt-1">
          <div class="d-flex align-items-center gap-1">
            <button class="btn btn-sm btn-outline-secondary" id="btnPpExpandLeft" title="Add previous month" style="padding:2px 7px;line-height:1.4" disabled>◀+</button>
            <button class="btn btn-sm btn-outline-secondary" id="btnPpShrinkLeft" title="Hide previous month" style="padding:2px 7px;line-height:1.4" disabled>−▷</button>
            <span class="small text-muted px-2" id="ppWindowLabel" style="white-space:nowrap;min-width:130px;text-align:center">...</span>
            <button class="btn btn-sm btn-outline-secondary" id="btnPpShrinkRight" title="Hide next month" style="padding:2px 7px;line-height:1.4" disabled>◁−</button>
            <button class="btn btn-sm btn-outline-secondary" id="btnPpExpandRight" title="Add next month" style="padding:2px 7px;line-height:1.4" disabled>+▶</button>
          </div>
          <div class="vr" style="opacity:.3;align-self:stretch"></div>
          <div class="form-check form-switch mb-0 d-flex align-items-center gap-2">
            <input class="form-check-input" type="checkbox" id="chkMonthlyPulse" checked style="cursor:pointer">
            <label class="form-check-label small text-muted" for="chkMonthlyPulse">Monthly pulse</label>
          </div>
          <div class="form-check form-switch mb-0 d-flex align-items-center gap-2">
            <input class="form-check-input" type="checkbox" id="chkRoundHours" checked style="cursor:pointer">
            <label class="form-check-label small text-muted" for="chkRoundHours">Rounded</label>
          </div>
        </div>
      </div>
      <div class="page-toolbar-right">
        <button class="btn btn-outline-secondary btn-sm" id="btnLoadXls">📂 Load XLS</button>
        <button class="btn btn-outline-secondary btn-sm" id="btnToggleAiSidebar" title="Ask questions about resource availability, allocations and planning">🤖 AI Chat</button>
        <button class="btn btn-outline-secondary btn-sm" id="btnPPFullWidth" title="Toggle full browser width">⊡ Compact</button>
        <button class="btn btn-sm btn-outline-secondary" id="btnExportResourcePlan">⬇ Export XLS</button>
      </div>
    </div>
    <div class="section-card">
      <div id="portfolioPlanningContainer" style="overflow-x:auto"></div>
    </div>
  </div>
```

Replace with:

```html
  <!-- Resource Planning section (main content on this page) -->
  <div id="portfolioPlanningSection">
    <div v-if="loading" class="d-flex justify-content-center align-items-center" style="height:60vh">
      <div class="spinner-border text-secondary"></div>
    </div>
    <div v-else-if="loadError" class="alert alert-danger m-4">{{ loadError }}</div>
    <template v-else>
    <div class="page-title-bar">
      <h4 class="fw-bold mb-0">{{ planningTitle }}</h4>
      <p class="text-muted small mb-0 mt-1">Hours distribution by role, project or owner — based on sold hours and actuals consumed</p>
    </div>
    <div class="page-toolbar">
      <div class="page-toolbar-left">
        <!-- Row 1: filters + view/interval toggles -->
        <div class="d-flex align-items-center gap-3 flex-wrap">
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <span class="small text-muted me-1">Pipeline:</span>
            <button v-for="p in allPipelines" :key="p" class="btn btn-sm" :class="isPipelineActive(p) ? 'btn-primary' : 'btn-outline-secondary'" @click="togglePipelineFilter(p)">{{ p }}</button>
          </div>
          <div class="vr" style="opacity:.3;align-self:stretch"></div>
          <div class="dropdown">
            <button class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown" data-bs-auto-close="outside">
              Projects <span v-if="projectFilters.size" class="badge bg-secondary ms-1">{{ projectFilters.size }}</span>
            </button>
            <ul class="dropdown-menu shadow" style="min-width:280px;max-height:320px;overflow-y:auto;padding:6px 0">
              <li v-for="p in eligibleProjects" :key="p.id">
                <label class="dropdown-item d-flex align-items-center gap-2 py-1" style="cursor:pointer;font-size:var(--text-base)">
                  <input type="checkbox" class="flex-shrink-0" :checked="isProjectChecked(p.id)" @change="onProjectFilterToggle(p.id)">
                  <span class="text-truncate" :title="fmtProjectTitle(p)">{{ fmtProjectTitle(p) }}</span>
                  <span v-if="p.pipeline" class="badge bg-light text-dark border ms-auto" style="font-size:var(--text-2xs)">{{ p.pipeline }}</span>
                </label>
              </li>
              <template v-if="eligibleProjects.length">
                <li><hr class="dropdown-divider my-1"></li>
                <li><button class="dropdown-item small text-primary" @click="selectAllProjects">Select all</button></li>
              </template>
            </ul>
          </div>
          <button v-if="projectFilters.size" class="btn btn-sm btn-outline-danger" @click="resetProjectFilters">✕ Projects</button>
          <div class="dropdown">
            <button class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown" data-bs-auto-close="outside">
              Team <span v-if="teamFilters.size" class="badge bg-secondary ms-1">{{ teamFilters.size }}</span>
            </button>
            <ul class="dropdown-menu shadow" style="min-width:240px;max-height:280px;overflow-y:auto;padding:6px 0">
              <li v-for="t in allTeams" :key="t">
                <label class="dropdown-item d-flex align-items-center gap-2 py-1" style="cursor:pointer;font-size:var(--text-base)">
                  <input type="checkbox" class="flex-shrink-0" :checked="isTeamChecked(t)" @change="onTeamFilterToggle(t)">
                  <span class="text-truncate">{{ t }}</span>
                </label>
              </li>
              <template v-if="allTeams.length">
                <li><hr class="dropdown-divider my-1"></li>
                <li><button class="dropdown-item small text-primary" @click="selectAllTeams">Select all</button></li>
              </template>
            </ul>
          </div>
          <button v-if="teamFilters.size" class="btn btn-sm btn-outline-danger" @click="resetTeamFilters">✕ Team</button>
          <div class="vr" style="opacity:.3;align-self:stretch"></div>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary" :class="{active: view==='byrole'}" @click="view='byrole'">By Role</button>
            <button class="btn btn-outline-secondary" :class="{active: view==='byproject'}" @click="view='byproject'">By Project</button>
            <button class="btn btn-outline-secondary" :class="{active: view==='byowner'}" @click="view='byowner'">By Owner</button>
          </div>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary" :class="{active: interval==='monthly'}" @click="interval='monthly'">Monthly</button>
            <button class="btn btn-outline-secondary" :class="{active: interval==='weekly'}" @click="interval='weekly'">Weekly</button>
          </div>
        </div>
        <!-- Row 2: window navigation + display toggles -->
        <div class="d-flex align-items-center gap-3 flex-wrap mt-1">
          <div class="d-flex align-items-center gap-1">
            <button class="btn btn-sm btn-outline-secondary" title="Add previous month" style="padding:2px 7px;line-height:1.4" :disabled="atLeftLimit" @click="expandLeft">◀+</button>
            <button class="btn btn-sm btn-outline-secondary" title="Hide previous month" style="padding:2px 7px;line-height:1.4" :disabled="atMinWidth" @click="shrinkLeft">−▷</button>
            <span class="small text-muted px-2" style="white-space:nowrap;min-width:130px;text-align:center">{{ windowLabel }}</span>
            <button class="btn btn-sm btn-outline-secondary" title="Hide next month" style="padding:2px 7px;line-height:1.4" :disabled="atMinWidth" @click="shrinkRight">◁−</button>
            <button class="btn btn-sm btn-outline-secondary" title="Add next month" style="padding:2px 7px;line-height:1.4" :disabled="atRightLimit" @click="expandRight">+▶</button>
          </div>
          <div class="vr" style="opacity:.3;align-self:stretch"></div>
          <div class="form-check form-switch mb-0 d-flex align-items-center gap-2">
            <input class="form-check-input" type="checkbox" id="chkMonthlyPulse" v-model="monthlyPulse" style="cursor:pointer">
            <label class="form-check-label small text-muted" for="chkMonthlyPulse">Monthly pulse</label>
          </div>
          <div class="form-check form-switch mb-0 d-flex align-items-center gap-2">
            <input class="form-check-input" type="checkbox" id="chkRoundHours" v-model="roundHours" style="cursor:pointer">
            <label class="form-check-label small text-muted" for="chkRoundHours">Rounded</label>
          </div>
        </div>
      </div>
      <div class="page-toolbar-right">
        <button class="btn btn-outline-secondary btn-sm" @click="$refs.fileInput.click()">📂 Load XLS</button>
        <button class="btn btn-outline-secondary btn-sm" title="Ask questions about resource availability, allocations and planning" @click="aiSidebarOpen = !aiSidebarOpen">🤖 AI Chat</button>
        <button class="btn btn-outline-secondary btn-sm" title="Toggle full browser width" @click="toggleFullWidth">{{ fullWidth ? '⊡ Compact' : '⛶ Full width' }}</button>
        <button class="btn btn-sm btn-outline-secondary" @click="exportCurrentView">⬇ Export XLS</button>
      </div>
    </div>
    <div class="section-card">
      <div ref="planningContainer" v-html="activeViewHtml" style="overflow-x:auto"></div>
    </div>
    </template>
  </div>
```

Note: `activeViewHtml` (a `computed` switching on `this.view`, returning the pre-built HTML string for whichever grouping view is active) is added in Task 3 (`byRoleHtml`), extended in Tasks 4-5 (`byProjectHtml`/`byOwnerHtml`) — this task only establishes the `v-html`-bound container `ref` and the surrounding reactive shell; until Task 3 lands, `activeViewHtml` doesn't exist yet and the container renders empty (acceptable — Step 5's manual verification below only checks the shell, not table content). `exportCurrentView` and the AI sidebar's markup/state are implemented in Task 6; this task's toolbar wires the buttons that call them (forward references, resolved in Task 6). `fmtProjectTitle` is `js/portfolio.js`'s existing global, called unchanged (per Global Constraint 2) — added to `methods` in Step 4 below as a bare passthrough so the template can call it.

- [ ] **Step 3: Update the file-input/AI-sidebar DOM ids the inline script previously wired imperatively**

`planning.html`'s `#fileInput`/`#fileStatus` (`:18-19`) stay as plain (non-Vue) elements — `js/upload.js`'s `readXLS()` reads `#fileStatus` by id directly (Global Constraint 2: do not change this file), so both ids must remain exactly as-is outside the Vue template. Add a Vue `ref` to the file input so Step 2's `$refs.fileInput.click()` works:

Find (`planning.html:18`):
```html
<input type="file" id="fileInput" accept=".xls,.xlsx" style="display:none">
```
Replace with:
```html
<input type="file" id="fileInput" ref="fileInput" accept=".xls,.xlsx" style="display:none" @change="onFileInputChange">
```
(`onFileInputChange` is implemented in Task 6, which also owns the rest of the XLS upload flow — this step only wires the DOM hook so Task 6 has something to attach to.)

- [ ] **Step 4: Write the Vue app skeleton**

Find the existing bottom inline `<script>` block (`planning.html:193-373`) and replace its **entire contents** with:

```html
<script>
function showPortfolioView() {
  window.location.href = '/portfolio.html';
}
function showDashboardView(pid) {
  window.location.href = '/portfolio.html?projectId=' + encodeURIComponent(pid);
}
function showPipelineBoardView() {
  window.location.href = '/pipeline.html';
}
function updateNavState() {}

document.addEventListener('DOMContentLoaded', async () => {
  loadConfig();
  loadSettings();
  updateAiButtonVisibility();
  refreshTimesheetData();

  const app = Vue.createApp({
    data() {
      return {
        loading: true, loadError: null,
        view: 'byrole', interval: 'monthly',
        pipelineFilters: new Set(), projectFilters: new Set(), teamFilters: new Set(),
        windowStart: null, windowEnd: null,
        monthlyPulse: true, roundHours: true,
        fullWidth: true,
        aiSidebarOpen: false,
        returnToBurndown: false, singleProjectId: null,
        refreshTick: 0, // bumped after an XLS upload to force grouping-view computeds to
                        // recompute — timesheetData/config.projects are plain globals mutated
                        // in place by refreshTimesheetDataFromApi(), not Vue-reactive on their own
      };
    },
    computed: {
      allPipelines() {
        this.refreshTick; // reactive dependency
        return [...new Set((config.projects || []).map(p => p.pipeline || '').filter(p => p && p !== 'Canceled'))].sort();
      },
      eligibleProjects() {
        this.refreshTick;
        return (config.projects || []).filter(p => {
          const pipe = p.pipeline || '';
          if (pipe === 'Canceled') return false;
          if (p.status === 'Completed') return false;
          if (this.pipelineFilters.size > 0 && !this.pipelineFilters.has(pipe)) return false;
          return true;
        });
      },
      allTeams() {
        return [...new Set(
          this.eligibleProjects.flatMap(p =>
            (p.tasks || []).flatMap(t =>
              (t.resources || []).map(r => {
                const dash = r.role ? r.role.indexOf(' - ') : -1;
                return dash > 0 ? r.role.slice(0, dash).trim() : r.role || '';
              })
            )
          ).filter(Boolean)
        )].sort();
      },
      filteredProjects() {
        return this.eligibleProjects.filter(p => this.projectFilters.size === 0 || this.projectFilters.has(p.id));
      },
      planningTitle() {
        if (this.returnToBurndown) {
          const projName = this.projectFilters.size === 1
            ? (this.eligibleProjects.find(p => this.projectFilters.has(p.id))?.name || [...this.projectFilters][0])
            : '';
          return `📅 Resource Planning${projName ? ' — ' + projName : ''}`;
        }
        return '📅 Resource Planning — All Projects';
      },
      weeks() {
        // Populated fully in Task 3 (adds week annotation: wNum/wLabel/dateTitle/isPast/isCurrent/
        // isLastOfMonth, ported from renderPortfolioPlanningView, js/planning.js:432-446) — this
        // task only establishes the window-clamped raw week list every grouping view shares.
        if (!this.windowStart || !this.windowEnd) return [];
        return getCalendarWeeks(this.windowStart, this.windowEnd);
      },
      atLeftLimit()  { return !this.windowStart || this.windowStart <= getPpAxis().axisStart; },
      atRightLimit() { return !this.windowEnd   || this.windowEnd   >= getPpAxis().axisEnd; },
      atMinWidth() {
        if (!this.windowStart || !this.windowEnd) return true;
        const nextStart = new Date(this.windowStart.getFullYear(), this.windowStart.getMonth() + 1, 1);
        const prevEnd   = new Date(this.windowEnd.getFullYear(),   this.windowEnd.getMonth(),       0);
        return nextStart > prevEnd;
      },
      windowLabel() {
        if (!this.windowStart || !this.windowEnd) return '...';
        const mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return `${mn[this.windowStart.getMonth()]} ${this.windowStart.getFullYear()} – ${mn[this.windowEnd.getMonth()]} ${this.windowEnd.getFullYear()}`;
        // NOTE: the pre-migration equivalent, js/core.js's updatePpWindowWidget(), used Italian
        // month abbreviations ('Gen','Feb',...) — a pre-existing bug that violated this project's
        // English-only rule (CLAUDE.md). Since this label is freshly written Vue code (that
        // function is not called from planning.html post-migration), it uses English abbreviations
        // here, consistent with getCalendarWeeks' own month names. js/core.js itself is untouched —
        // out of scope for this cycle, since no other page calls updatePpWindowWidget with this label.
      },
    },
    methods: {
      esc, fmtProjectTitle,
      isPipelineActive(p) { return this.pipelineFilters.size === 0 || this.pipelineFilters.has(p); },
      togglePipelineFilter(p) {
        const next = new Set(this.pipelineFilters);
        if (next.has(p)) next.delete(p); else next.add(p);
        this.pipelineFilters = next;
      },
      isProjectChecked(pid) { return this.projectFilters.size === 0 || this.projectFilters.has(pid); },
      onProjectFilterToggle(pid) {
        const checked = new Set(this.eligibleProjects.filter(p => this.isProjectChecked(p.id)).map(p => p.id));
        if (checked.has(pid)) checked.delete(pid); else checked.add(pid);
        this.projectFilters = checked.size === this.eligibleProjects.length ? new Set() : checked;
      },
      selectAllProjects() { this.projectFilters = new Set(); },
      resetProjectFilters() { this.projectFilters = new Set(); },
      isTeamChecked(t) { return this.teamFilters.size === 0 || this.teamFilters.has(t); },
      onTeamFilterToggle(t) {
        const checked = new Set(this.allTeams.filter(tt => this.isTeamChecked(tt)));
        if (checked.has(t)) checked.delete(t); else checked.add(t);
        this.teamFilters = checked.size === this.allTeams.length ? new Set() : checked;
      },
      selectAllTeams() { this.teamFilters = new Set(); },
      resetTeamFilters() { this.teamFilters = new Set(); },
      clampWindow() {
        const { axisStart, axisEnd } = getPpAxis();
        if (this.windowStart < axisStart) this.windowStart = new Date(axisStart);
        if (this.windowEnd   > axisEnd)   this.windowEnd   = new Date(axisEnd);
      },
      initWindowIfNeeded() {
        if (this.windowStart && this.windowEnd) { this.clampWindow(); return; }
        const now = new Date();
        this.windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
        this.windowEnd   = new Date(now.getFullYear(), now.getMonth() + 4, 0);
        this.clampWindow();
      },
      expandLeft() {
        const { axisStart } = getPpAxis();
        const ns = new Date(this.windowStart.getFullYear(), this.windowStart.getMonth() - 1, 1);
        this.windowStart = ns < axisStart ? new Date(axisStart.getFullYear(), axisStart.getMonth(), 1) : ns;
      },
      shrinkLeft() {
        const ns = new Date(this.windowStart.getFullYear(), this.windowStart.getMonth() + 1, 1);
        if (ns <= this.windowEnd) this.windowStart = ns;
      },
      expandRight() {
        const { axisEnd } = getPpAxis();
        const ne = new Date(this.windowEnd.getFullYear(), this.windowEnd.getMonth() + 2, 0);
        this.windowEnd = ne > axisEnd ? new Date(axisEnd.getFullYear(), axisEnd.getMonth() + 1, 0) : ne;
      },
      shrinkRight() {
        const ne = new Date(this.windowEnd.getFullYear(), this.windowEnd.getMonth(), 0);
        if (ne >= this.windowStart) this.windowEnd = ne;
      },
      toggleFullWidth() {
        this.fullWidth = !this.fullWidth;
        document.body.classList.toggle('pp-fullwidth', this.fullWidth);
      },
      bumpRefresh() { this.refreshTick++; },
      // exportCurrentView, onFileInputChange: implemented in Task 6.
      // aiPlanSend/aiPlanMessages wiring: implemented in Task 6.
    },
    watch: {
      // js/core.js's rolePassesTeamFilter(role) (unchanged, called as a global by Tasks 3-5's
      // ported grouping-view logic) reads the module-level `portfolioTeamFilters` Set directly —
      // it has no Vue awareness. Mirroring this.teamFilters into that global on every change
      // keeps rolePassesTeamFilter's behavior correct without reimplementing its logic in Vue
      // or modifying js/core.js (out of scope — shared by every page).
      teamFilters: { handler(v) { portfolioTeamFilters = v; }, immediate: true },
    },
    async created() {
      await Promise.all([loadClientsFromApi(), loadProgramsFromApi(), loadRolesFromApi()]);
      await Promise.all([loadConfigFromApi(), refreshTimesheetDataFromApi(), loadPipelineBudgetsFromApi()]);
      this.initWindowIfNeeded();

      const urlProjectId = new URLSearchParams(window.location.search).get('projectId');
      if (urlProjectId) {
        // Real behavior of the pre-migration showPlanningView(projectId) (js/planning.js:388-394) —
        // see this plan's header "Correction to the design spec's assumed scope" note. It does NOT
        // render a distinct Gantt view; it only pre-filters to one project and flags the title.
        this.singleProjectId = urlProjectId;
        this.returnToBurndown = true;
        this.projectFilters = new Set([urlProjectId]);
      }

      this.loading = false;
    },
  });

  app.mount('#portfolioPlanningSection');

  document.getElementById('btnJsonCopy').addEventListener('click', () => {
    navigator.clipboard.writeText(document.getElementById('jsonViewerContent').value).catch(() => {});
  });
  document.getElementById('btnJsonExport').addEventListener('click', () => {
    const blob = new Blob([document.getElementById('jsonViewerContent').value], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = _jsonViewerFilename; a.click(); URL.revokeObjectURL(url);
  });
  document.getElementById('btnJsonImport').addEventListener('click', () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
    inp.onchange = e => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try { JSON.parse(ev.target.result); document.getElementById('jsonViewerContent').value = ev.target.result; document.getElementById('jsonViewerError').classList.add('d-none'); }
        catch(err) { const el = document.getElementById('jsonViewerError'); el.textContent = 'Invalid JSON: ' + err.message; el.classList.remove('d-none'); }
      };
      reader.readAsText(file);
    };
    inp.click();
  });
  document.getElementById('btnJsonApply').addEventListener('click', () => {
    const errEl = document.getElementById('jsonViewerError');
    try { const parsed = JSON.parse(document.getElementById('jsonViewerContent').value); if (_jsonViewerOnSave) _jsonViewerOnSave(parsed); bootstrap.Modal.getInstance(document.getElementById('jsonViewerModal'))?.hide(); errEl.classList.add('d-none'); }
    catch(err) { errEl.textContent = 'Invalid JSON: ' + err.message; errEl.classList.remove('d-none'); }
  });

  // initNav() itself renders the shared navbar/footer and gates on auth — its own async
  // resolution doesn't block anything above, matching how every other Vue page on this
  // roadmap (portfolio.html, pipeline.html, project-config.html) calls it: fire, then await
  // separately for the user object before any user-scoped UI is shown. Since this page's
  // Vue app doesn't render anything user-scoped beyond the standard authenticated shell,
  // it's awaited here purely to preserve the original 401-redirect gate's ordering.
  const user = await initNav('planning', { breadcrumbs: [
    { label: 'Home', href: '/pipeline.html' },
    { label: 'Resource Planning' },
  ]});
  if (!user) return;
});
</script>
```

Note: the JSON-viewer wiring block (`btnJsonCopy`/`btnJsonExport`/`btnJsonImport`/`btnJsonApply`) is copied verbatim from the original inline script (`planning.html:345-370`) — `#jsonViewerModal` stays static Vanilla markup outside the Vue mount root (per the design spec's Investigation finding 5), so this wiring is unrelated to the Vue migration and is preserved as-is, just relocated to run before `initNav()` instead of inside its `DOMContentLoaded` callback (harmless — none of it depends on the authenticated user).

- [ ] **Step 5: Manually verify the shell renders**

This step has no automated test (Vue templates aren't covered by `npm test`; the mandatory jsdom mount test is Task 8). Open `planning.html` in a browser (via `docker compose up`, `http://localhost/planning.html`) and confirm: the page loads without a stuck spinner, the pipeline filter chips render, the Projects/Team dropdowns list real projects, the By Role/By Project/By Owner and Monthly/Weekly toggles change their `active` class on click, the window-navigator arrows are enabled/disabled correctly at the axis extremes, and the Monthly Pulse/Rounded toggles reflect their checked state. The `portfolioPlanningContainer` area is expected to be empty at this point — Tasks 3-5 fill it in.

- [ ] **Step 6: Run the full test suite (regression check — this task changes no `js/lib/` files)**

```bash
npm test
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add planning.html
git commit -m "feat(planning): Vue 3 skeleton — page shell, filters, view/interval toggles, window navigator"
```

---

### Task 3: By Role grouping view

**Files:**
- Modify: `planning.html` (adds `weeks` annotation, `byRoleView`/`activeViewHtml` computeds, `initTooltipsAndToggles` method, and `mounted()`/`updated()` lifecycle hooks that call it after every DOM patch, to the Vue app block written in Task 2)
- Modify: `js/planning.js` (deletes the now-ported `renderPortfolioPlanningView` function body, `js/planning.js:396-862` — this is the only task that ports this specific function, so its deletion happens here, not deferred to Task 7)

**Interfaces:**
- Consumes: `js/lib/planning-calc.js`'s `getCalendarWeeks` (Task 1, already used by Task 2's raw `weeks` computed), `countFutureTaskWeeks`, `distributeFutureResidual`, `matchesTaskRole`, `computeResidual`; Task 2's `data().windowStart`/`windowEnd`/`monthlyPulse`/`roundHours`/`interval`/`view`; Task 2's `computed.filteredProjects`; global functions `buildMonthPeriods`, `parseTaskDate`, `rolePassesTeamFilter`, `esc` (`js/core.js`, unchanged); global `timesheetData` array.
- Produces: `computed.weeks` (extended with per-week annotation fields `wNum`/`wLabel`/`dateTitle`/`isPast`/`isCurrent`/`isLastOfMonth`, consumed identically by Tasks 4-5); `computed.byRoleView` → `{ html: string, exportRows: Array, periodMeta: Array }` (consumed by Task 6's `exportCurrentView`); `computed.activeViewHtml` (extended in Tasks 4-5 with the `byproject`/`byowner` branches); `methods.initTooltipsAndToggles()` (reused identically by Tasks 4-5).

- [ ] **Step 1: Extend the `weeks` computed with per-week annotation**

In the Vue app block written in Task 2, find:

```js
      weeks() {
        // Populated fully in Task 3 (adds week annotation: wNum/wLabel/dateTitle/isPast/isCurrent/
        // isLastOfMonth, ported from renderPortfolioPlanningView, js/planning.js:432-446) — this
        // task only establishes the window-clamped raw week list every grouping view shares.
        if (!this.windowStart || !this.windowEnd) return [];
        return getCalendarWeeks(this.windowStart, this.windowEnd);
      },
```

Replace with (ported verbatim from `js/planning.js:432-446`):

```js
      weeks() {
        if (!this.windowStart || !this.windowEnd) return [];
        const weeks = getCalendarWeeks(this.windowStart, this.windowEnd);
        const now = new Date();
        const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        weeks.forEach(w => {
          w.wNum      = Math.min(5, Math.ceil(w.weekStart.getDate() / 7));
          w.wLabel    = `W${w.wNum}`;
          w.dateTitle = `${String(w.weekStart.getDate()).padStart(2,'0')} ${monthNames[w.weekStart.getMonth()]} – ${String(w.weekEnd.getDate()).padStart(2,'0')} ${monthNames[w.weekEnd.getMonth()]}`;
          w.isPast    = w.weekEnd < todayMidnight;
          w.isCurrent = w.weekStart <= todayMidnight && w.weekEnd >= todayMidnight;
          w.isLastOfMonth = false;
        });
        for (let i = 0; i < weeks.length; i++) {
          weeks[i].isLastOfMonth = (i === weeks.length - 1) || (weeks[i].monthKey !== weeks[i + 1].monthKey);
        }
        return weeks;
      },
```

- [ ] **Step 2: Add the `byRoleView` computed**

In the same Vue app block's `computed` section, add (ported verbatim from `js/planning.js:580-861`, with `projects`/`weeks` read from `this.filteredProjects`/`this.weeks`, `portfolioMonthlyPulse`/`portfolioRoundHours`/`ppViewInterval` read from `this.monthlyPulse`/`this.roundHours`/`this.interval`, and `container.innerHTML = ...` replaced by a returned object):

```js
      byRoleView() {
        const projects = this.filteredProjects;
        const weeks    = this.weeks;
        const now = new Date();
        const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const roleMap = {};
        const roleSoldMap = {};
        const roleActualsMap = {};

        projects.forEach(proj => {
          const projData = timesheetData.filter(r => r.projectId === proj.id);

          (proj.tasks || []).forEach(task => {
            if (task.completed) return;
            const tStart = parseTaskDate(task.startDate || proj.startDate, false);
            const tEnd   = parseTaskDate(task.endDate   || proj.endDate,   true);
            const overlapWeeks = weeks.filter(w => w.weekEnd >= tStart && w.weekStart <= tEnd);
            if (!overlapWeeks.length) return;

            (task.resources || []).forEach(res => {
              if (!res.role) return;
              if (!rolePassesTeamFilter(res.role)) return;
              const soldH = res.soldHours || 0;

              roleSoldMap[res.role] = (roleSoldMap[res.role] || 0) + soldH;

              const consumedH = projData
                .filter(r => matchesTaskRole(r, task.name, res.role))
                .reduce((s, r) => s + r.hours, 0);
              roleActualsMap[res.role] = (roleActualsMap[res.role] || 0) + consumedH;

              const residualH = computeResidual(soldH, consumedH);

              if (!roleMap[res.role]) roleMap[res.role] = {};

              const pastWeeks = overlapWeeks.filter(w => w.isPast);
              pastWeeks.forEach(w => {
                const actualH = projData
                  .filter(r => matchesTaskRole(r, task.name, res.role) &&
                               r.date >= w.weekStart && r.date <= w.weekEnd)
                  .reduce((s, r) => s + r.hours, 0);
                if (actualH < 0.01) return;
                const key = w.weekStart.toISOString();
                if (!roleMap[res.role][key]) roleMap[res.role][key] = { hours: 0, breakdown: [], isPast: true, isPulse: false };
                roleMap[res.role][key].hours += actualH;
                roleMap[res.role][key].breakdown.push({ project: proj.name || proj.id, task: task.name, hours: actualH });
              });

              const futureWeeks = overlapWeeks.filter(w => !w.isPast);
              if (!futureWeeks.length || residualH < 0.01) return;

              const pDist    = task.monthlyDistribution;
              const pDistSum = pDist ? Object.values(pDist).reduce((s, v) => s + v, 0) : 0;
              const usePDist = pDist && Math.abs(pDistSum - 100) < 0.5;

              if (usePDist) {
                const futureMthWks = {};
                futureWeeks.forEach(w => {
                  const ym = `${w.weekStart.getFullYear()}${String(w.weekStart.getMonth()+1).padStart(2,'0')}`;
                  if (!futureMthWks[ym]) futureMthWks[ym] = [];
                  futureMthWks[ym].push(w);
                });
                const futureDistTotal = Object.keys(futureMthWks).reduce((s, ym) => s + (pDist[ym] || 0), 0);
                if (futureDistTotal < 0.01) {
                  const totalFutureWeeks = countFutureTaskWeeks(tStart, tEnd, todayMidnight);
                  const hPerWeek = totalFutureWeeks > 0 ? residualH / totalFutureWeeks : residualH / futureWeeks.length;
                  futureWeeks.forEach(w => {
                    const key = w.weekStart.toISOString();
                    if (!roleMap[res.role][key]) roleMap[res.role][key] = { hours: 0, breakdown: [], isPast: false, isPulse: false };
                    roleMap[res.role][key].hours += hPerWeek;
                    roleMap[res.role][key].breakdown.push({ project: proj.name || proj.id, task: task.name, hours: hPerWeek });
                  });
                } else {
                  Object.entries(futureMthWks).forEach(([ym, mWeeks]) => {
                    const mPct   = (pDist[ym] || 0) / futureDistTotal;
                    const mHours = residualH * mPct;
                    const hPerWk = mHours / mWeeks.length;
                    mWeeks.forEach(w => {
                      const key = w.weekStart.toISOString();
                      if (!roleMap[res.role][key]) roleMap[res.role][key] = { hours: 0, breakdown: [], isPast: false, isPulse: false };
                      roleMap[res.role][key].hours += hPerWk;
                      roleMap[res.role][key].breakdown.push({ project: proj.name || proj.id, task: task.name, hours: hPerWk });
                    });
                  });
                }
              } else {
                const totalFutureWeeks = countFutureTaskWeeks(tStart, tEnd, todayMidnight);
                const byMonth = {};
                futureWeeks.forEach(w => {
                  if (!byMonth[w.monthKey]) byMonth[w.monthKey] = [];
                  byMonth[w.monthKey].push(w.weekStart.toISOString());
                });
                const weeksByMonth = Object.entries(byMonth).map(([monthKey, weekKeys]) => ({ monthKey, weekKeys }));

                distributeFutureResidual(residualH, totalFutureWeeks, weeksByMonth, this.monthlyPulse).forEach(entry => {
                  if (!roleMap[res.role][entry.key]) roleMap[res.role][entry.key] = { hours: 0, breakdown: [], isPast: false, isPulse: entry.isPulse };
                  if (entry.isPulse) roleMap[res.role][entry.key].isPulse = true;
                  roleMap[res.role][entry.key].hours += entry.hours;
                  roleMap[res.role][entry.key].breakdown.push({ project: proj.name || proj.id, task: task.name, hours: entry.hours });
                });
              }
            });
          });
        });

        const roles = Object.keys(roleMap).sort();
        const fmtPH = v => v > 0.005 ? (this.roundHours ? Math.round(v) : v.toFixed(2)) + 'h' : '';

        if (!roles.length) {
          return { html: '<div class="alert alert-info mb-0">No resource data found for the selected filters and date range.</div>', exportRows: [], periodMeta: [] };
        }

        const monthGroups = [];
        weeks.forEach(w => {
          const last = monthGroups[monthGroups.length - 1];
          if (last && last.key === w.monthKey) last.count++;
          else monthGroups.push({ key: w.monthKey, count: 1, allPast: w.isPast });
        });
        weeks.forEach(w => {
          const mg = monthGroups.find(m => m.key === w.monthKey);
          if (mg && !w.isPast) mg.allPast = false;
        });

        const isMonthly = this.interval === 'monthly';
        const periods   = isMonthly ? buildMonthPeriods(weeks) : weeks;

        let periodHeaderHtml, subHeaderHtml = '';
        if (isMonthly) {
          periodHeaderHtml = periods.map(p => {
            const bg = p.isPast ? '#e9ebec' : p.isCurrent ? '#4dabf7' : 'var(--indigo-100)';
            const fw = p.isCurrent ? 'font-weight:bold;color:#fff;' : '';
            return `<th style="min-width:70px;text-align:center;background:${bg};font-size:var(--text-sm);padding:4px 3px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);${fw}">${p.label}</th>`;
          }).join('');
        } else {
          periodHeaderHtml = monthGroups.map(mg => {
            const bg = mg.allPast ? '#e9ebec' : 'var(--indigo-100)';
            return `<th colspan="${mg.count}" style="text-align:center;background:${bg};font-size:var(--text-sm);padding:4px 3px;border:1px solid var(--border-light);">${mg.key}</th>`;
          }).join('');
          subHeaderHtml = weeks.map(w => {
            const bg = w.isCurrent ? '#4dabf7' : w.isPast ? '#e8eaec' : '#f0f2ff';
            const borderR = w.isLastOfMonth ? '3px solid var(--text-muted)' : '1px solid var(--border-light)';
            const fw = w.isCurrent ? 'font-weight:bold;color:#fff;' : '';
            return `<th title="${w.dateTitle}" style="min-width:42px;max-width:52px;font-size:var(--text-xs);text-align:center;background:${bg};border:1px solid var(--border-light);border-right:${borderR};padding:3px 2px;white-space:nowrap;${fw}">${w.wLabel}</th>`;
          }).join('');
        }

        const pKey = p => isMonthly ? p.key : p.weekStart.toISOString();
        const colTotals = {}, colFutureTotals = {};
        periods.forEach(p => { colTotals[pKey(p)] = 0; colFutureTotals[pKey(p)] = 0; });

        let tbodyHtml = '';
        roles.forEach(role => {
          let rowToBePlanned = 0;
          const cells = periods.map(p => {
            const borderR = isMonthly ? '3px solid var(--text-muted)' : (p.isLastOfMonth ? '3px solid var(--text-muted)' : '1px solid var(--border-light)');
            const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()];
            let h = 0, hFuture = 0, hasPulse = false, hasBreakdown = [];
            keys.forEach(key => {
              const cell = roleMap[role]?.[key];
              if (cell) {
                h += cell.hours;
                if (!cell.isPast) hFuture += cell.hours;
                if (cell.isPulse) hasPulse = true;
                hasBreakdown.push(...(cell.breakdown || []));
              }
            });
            const emptyBg = p.isPast ? '#f4f5f6' : 'transparent';
            if (h < 0.01) return `<td style="background:${emptyBg};border:1px solid var(--border-light);border-right:${borderR}"></td>`;

            colTotals[pKey(p)]       = (colTotals[pKey(p)]       || 0) + h;
            colFutureTotals[pKey(p)] = (colFutureTotals[pKey(p)] || 0) + hFuture;
            if (!p.isPast) rowToBePlanned += hFuture;
            const bg = p.isPast ? '#e5e8ea' : hasPulse ? 'var(--violet-100)' : (h > 30 ? 'var(--color-danger-bg)' : h > 24 ? 'var(--color-warning-bg)' : 'white');
            const tipLines = hasBreakdown.sort((a, b) => b.hours - a.hours)
              .map(b => `<div><b>${esc(b.project)}</b><br><span style="padding-left:8px">${esc(b.task)}: ${b.hours.toFixed(2)}h</span></div>`)
              .join('');
            const tipHtml = `<div style="font-size:var(--text-xs);line-height:1.5;text-align:left">${p.isPast ? '<em style="color:#888">actual</em><br>' : hasPulse ? '<em style="color:var(--violet-400)">monthly aggregate</em><br>' : ''}${tipLines}</div>`;
            const displayVal = hasPulse ? `<span style="font-style:italic;color:var(--violet-600)">~${fmtPH(h)}</span>`
              : h < 1 && this.roundHours ? `<span style="color:#888;font-size:var(--text-xs)">${h.toFixed(2)}h</span>` : fmtPH(h);

            return `<td data-bs-toggle="tooltip" data-bs-html="true" data-bs-title="${tipHtml.replace(/"/g,'&quot;')}" style="background:${bg};border:1px solid var(--border-light);border-right:${borderR};text-align:center;font-size:var(--text-xs);padding:2px 3px;cursor:default">${displayVal}</td>`;
          }).join('');

          const rSold    = roleSoldMap[role]    || 0;
          const rActuals = roleActualsMap[role] || 0;
          const soldCell = `<td style="position:sticky;left:185px;z-index:2;text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);background:var(--sand-50)">${fmtPH(rSold)}</td>`;
          const actCell  = `<td style="position:sticky;left:250px;z-index:2;text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);background:var(--sand-50)">${fmtPH(rActuals)}</td>`;
          const tbpCell  = `<td style="position:sticky;left:330px;z-index:2;text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);background:var(--sand-50)">${fmtPH(rowToBePlanned)}</td>`;

          tbodyHtml += `
            <tr>
              <td style="position:sticky;left:0;z-index:2;background:white;font-size:var(--text-base);padding:6px 8px;font-weight:500;border:1px solid var(--border-light);white-space:nowrap">${esc(role)}</td>
              ${soldCell}${actCell}${tbpCell}${cells}
            </tr>`;
        });

        const totalCells = periods.map(p => {
          const t = colTotals[pKey(p)] || 0;
          const borderR = isMonthly ? '3px solid var(--text-muted)' : (p.isLastOfMonth ? '3px solid var(--text-muted)' : '1px solid var(--border-light)');
          const bg = p.isPast ? '#e5e8ea' : p.isCurrent ? '#c8e6ff' : '#f0f2ff';
          return `<td style="background:${bg};border:1px solid var(--border-light);border-right:${borderR};text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 3px">${fmtPH(t)}</td>`;
        }).join('');
        const grandSold    = Object.values(roleSoldMap).reduce((s, v) => s + v, 0);
        const grandActuals = Object.values(roleActualsMap).reduce((s, v) => s + v, 0);
        const grandTbp     = periods.filter(p => !p.isPast).reduce((s, p) => s + (colFutureTotals[pKey(p)] || 0), 0);
        tbodyHtml += `
          <tr style="background:var(--indigo-50)">
            <td style="position:sticky;left:0;z-index:2;font-size:var(--text-base);padding:6px 8px;font-weight:bold;border:1px solid var(--border-light);border-top:3px solid var(--text-muted);background:var(--indigo-50)">Total</td>
            <td style="position:sticky;left:185px;z-index:2;text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);border-top:3px solid var(--text-muted);background:var(--sand-400)">${fmtPH(grandSold)}</td>
            <td style="position:sticky;left:250px;z-index:2;text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);border-top:3px solid var(--text-muted);background:var(--sand-400)">${fmtPH(grandActuals)}</td>
            <td style="position:sticky;left:330px;z-index:2;text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);border-top:3px solid var(--text-muted);background:var(--sand-400)">${fmtPH(grandTbp)}</td>
            ${totalCells}
          </tr>`;

        const html = `
          <div class="alert alert-light border mb-3" style="font-size:var(--text-base);color:#444;line-height:1.7">
            <strong>Estimation logic:</strong>
            <strong>Past weeks</strong> (grey background) show <em>actual hours</em> from loaded timesheets.
            <strong>Current and future weeks</strong> show <em>residual hours</em> (sold − consumed) distributed linearly across the remaining task duration.
            When the average falls below 1h/week, hours are <strong>aggregated monthly</strong> and shown in the first week of each month —
            these cells are displayed in <span style="background:var(--violet-100);padding:1px 5px;border-radius:var(--radius-xs);font-style:italic;color:var(--violet-600)">~italic lavender</span> with the label <em>"monthly aggregate"</em> in the tooltip.
            <span style="background:var(--color-warning-bg);padding:1px 5px;border-radius:var(--radius-xs)">Yellow</span> = load &gt; 24h/week &nbsp;·&nbsp;
            <span style="background:var(--color-danger-bg);padding:1px 5px;border-radius:var(--radius-xs)">Red</span> = load &gt; 30h/week (overallocation) &nbsp;·&nbsp;
            <span style="background:#c8e6ff;padding:1px 5px;border-radius:var(--radius-xs)">Blue</span> = current week / month.
          </div>
          <table class="gantt-table" style="border-collapse:collapse;width:100%">
            <thead>
              <tr>
                <th rowspan="${isMonthly ? 1 : 2}" style="position:sticky;left:0;z-index:4;min-width:185px;background:var(--sand-200);font-size:var(--text-base);padding:8px 10px;border:1px solid var(--border-light);white-space:nowrap">Role</th>
                <th rowspan="${isMonthly ? 1 : 2}" style="position:sticky;left:185px;z-index:4;min-width:65px;background:var(--sand-200);font-size:var(--text-base);padding:8px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);text-align:center;white-space:nowrap">Sold</th>
                <th rowspan="${isMonthly ? 1 : 2}" style="position:sticky;left:250px;z-index:4;min-width:80px;background:var(--sand-200);font-size:var(--text-base);padding:8px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);text-align:center;white-space:nowrap">From<br>actuals</th>
                <th rowspan="${isMonthly ? 1 : 2}" title="To be planned can exceed Sold − Actuals when a role has multiple tasks and one is over-consumed — hours over budget on one task aren't subtracted from another task's remaining budget." style="position:sticky;left:330px;z-index:4;min-width:90px;background:var(--sand-200);font-size:var(--text-base);padding:8px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);text-align:center;white-space:nowrap">To be<br>planned</th>
                ${periodHeaderHtml}
              </tr>
              ${isMonthly ? '' : `<tr>${subHeaderHtml}</tr>`}
            </thead>
            <tbody>${tbodyHtml}</tbody>
          </table>`;

        const periodLabels = periods.map(p => isMonthly ? p.label : p.dateTitle);
        const periodMeta   = periods.map(p => ({ isPast: p.isPast, isCurrent: p.isCurrent ?? false }));
        const exportRows = [{ v: ['Role', 'Sold', 'From actuals', 'To be planned', ...periodLabels], level: 'header' }];
        const rnd = v => Math.round(v * 10) / 10;
        roles.forEach(role => {
          const rowTbp = Object.values(roleMap[role] || {}).reduce((s, c) => s + (c.isPast ? 0 : c.hours), 0);
          const pVals  = periods.map(p => {
            const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()];
            const h = keys.reduce((s, k) => s + (roleMap[role]?.[k]?.hours || 0), 0);
            return h > 0.01 ? rnd(h) : '';
          });
          exportRows.push({ v: [role, rnd(roleSoldMap[role] || 0), rnd(roleActualsMap[role] || 0), rnd(rowTbp), ...pVals], level: 'role' });
        });
        const totPVals = periods.map(p => {
          const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()];
          const h = keys.reduce((s, k) => roles.reduce((rs, r) => rs + (roleMap[r]?.[k]?.hours || 0), s), 0);
          return h > 0.01 ? rnd(h) : '';
        });
        exportRows.push({ v: ['Total', rnd(grandSold), rnd(grandActuals), rnd(grandTbp), ...totPVals], level: 'total' });

        return { html, exportRows, periodMeta };
      },
      activeViewHtml() {
        if (this.view === 'byrole') return this.byRoleView.html;
        return ''; // 'byproject'/'byowner' branches added in Tasks 4-5
      },
```

Note: this computed is intentionally read-only and side-effect-free (per Vue's own contract for `computed`) — the Bootstrap `Tooltip` instantiation the original inline code did right after assigning `container.innerHTML` (`js/planning.js:830-832`) is **not** done here; it is wired in Step 3 below via `mounted()`/`updated()` lifecycle hooks, since attaching tooltips is a DOM side effect that must run after Vue has patched the real DOM, not while computing the string.

- [ ] **Step 3: Wire tooltip/group-toggle initialization after each render**

In the same Vue app block, add a `methods.initTooltipsAndToggles()` and `mounted()`/`updated()` lifecycle hooks that invoke it after every DOM patch:

```js
      initTooltipsAndToggles() {
        const container = this.$refs.planningContainer;
        if (!container) return;
        container.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
          bootstrap.Tooltip.getInstance(el)?.dispose();
          new bootstrap.Tooltip(el, { trigger: 'hover', placement: 'top', customClass: 'pp-tooltip' });
        });
        // Group expand/collapse (By Project/By Owner views, added in Tasks 4-5) — ported
        // verbatim from setupGroupToggle (js/planning.js:1539-1558).
        const groups = new Map();
        container.querySelectorAll('tr[data-group-id]').forEach(hRow => {
          const gid = hRow.dataset.groupId;
          const childRows = [...container.querySelectorAll(`tr[data-parent-group="${gid}"]`)];
          groups.set(gid, { hRow, childRows, collapsed: false });
          hRow.style.cursor = 'pointer';
          hRow.addEventListener('click', () => {
            const g = groups.get(gid);
            g.collapsed = !g.collapsed;
            g.childRows.forEach(r => r.style.display = g.collapsed ? 'none' : '');
            const btn = hRow.querySelector('.pp-toggle');
            if (btn) btn.textContent = g.collapsed ? '▶' : '▼';
          });
        });
        const expandAll   = container.querySelector('.pp-expand-all');
        const collapseAll = container.querySelector('.pp-collapse-all');
        if (expandAll)   expandAll.addEventListener('click',  e => { e.stopPropagation(); groups.forEach(g => { g.collapsed = false; g.childRows.forEach(r => r.style.display = '');     const b = g.hRow.querySelector('.pp-toggle'); if (b) b.textContent = '▼'; }); });
        if (collapseAll) collapseAll.addEventListener('click', e => { e.stopPropagation(); groups.forEach(g => { g.collapsed = true;  g.childRows.forEach(r => r.style.display = 'none'); const b = g.hRow.querySelector('.pp-toggle'); if (b) b.textContent = '▶'; }); });
      },
```

Add to the Vue app options object, alongside `data`/`computed`/`methods`/`watch`/`created`:

```js
    updated() {
      this.$nextTick(() => this.initTooltipsAndToggles());
    },
    mounted() {
      this.$nextTick(() => this.initTooltipsAndToggles());
    },
```

(`updated()` fires after every reactive re-render that changes the mounted DOM — including every `activeViewHtml` change — so this single lifecycle hook covers all three grouping views without a per-view `watch`; `mounted()` covers the very first render once `loading` flips to `false` and the `v-else` branch first appears in the DOM.)

- [ ] **Step 4: Delete the now-ported function from `js/planning.js`**

In `js/planning.js`, delete `renderPortfolioPlanningView` in its entirety (`js/planning.js:396-862` as of Task 1's edits — verify the exact current line range by searching for `function renderPortfolioPlanningView()` before deleting, since Task 1's deletions shifted line numbers). Leave `renderPortfolioPlanningByProjectContent`/`renderPortfolioPlanningByOwnerContent`/`buildStyledExcelExport`/`setupGroupToggle` in place — Tasks 4-6 port those.

- [ ] **Step 5: Manually verify**

Open `planning.html` in a browser with at least one project that has timesheet data loaded (via `docker compose up`). Confirm: the By Role table renders with Sold/From actuals/To be planned sticky columns, past weeks show grey actual hours, future weeks show blue/yellow/red residual-load coloring, hovering a future-week cell shows the project/task breakdown tooltip, and toggling Monthly Pulse/Rounded/Monthly-Weekly/window-navigator arrows all correctly re-render the table.

- [ ] **Step 6: Run the full test suite (regression check — this task changes no `js/lib/` files)**

```bash
npm test
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add planning.html js/planning.js
git commit -m "feat(planning): port By Role grouping view to Vue"
```

---

### Task 4: By Project grouping view

**Files:**
- Modify: `planning.html` (adds `byProjectView` computed and extends `activeViewHtml`'s `if`/`else` chain)
- Modify: `js/planning.js` (deletes the now-ported `renderPortfolioPlanningByProjectContent` function body)

**Interfaces:**
- Consumes: Task 2's `computed.weeks`/`filteredProjects`/`interval`/`roundHours`/`monthlyPulse`; `js/lib/planning-calc.js`'s `matchesTaskRole`/`computeResidual`/`distributeFutureResidual`/`countFutureTaskWeeks`; global `buildMonthPeriods`/`rolePassesTeamFilter`/`esc` (unchanged); global `timesheetData`.
- Produces: `computed.byProjectView` → `{ html, exportRows, periodMeta }` (consumed by Task 6's `exportCurrentView`); extends `activeViewHtml`'s `byproject` branch.

- [ ] **Step 1: Add the `byProjectView` computed**

In the Vue app block, add (ported verbatim from `renderPortfolioPlanningByProjectContent`, `js/planning.js:930-1259`, with `container`/`projects`/`weeks` parameters replaced by `this.filteredProjects`/`this.weeks`, and the trailing `setupGroupToggle(container)`/export-button-wiring lines dropped — those become Step 2/3 of Task 3 (already-added `initTooltipsAndToggles`, reused) and Task 6 respectively):

```js
      byProjectView() {
        const projects = this.filteredProjects;
        const weeks    = this.weeks;
        const fmtPH = v => v > 0.005 ? (this.roundHours ? Math.round(v) : v.toFixed(2)) + 'h' : '';
        const fmtDate = str => {
          if (!str) return '';
          const mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          if (str.length >= 8) return `${parseInt(str.slice(6,8))} ${mn[parseInt(str.slice(4,6))-1]} ${str.slice(0,4)}`;
          return `${mn[parseInt(str.slice(4,6))-1]} ${str.slice(0,4)}`;
        };
        const dateBadge = (s, e) => {
          const parts = [s && fmtDate(s), e && fmtDate(e)].filter(Boolean);
          return parts.length ? ` <span style="font-size:var(--text-2xs);color:var(--text-muted);font-weight:400">${parts.join(' → ')}</span>` : '';
        };

        const SH = 'position:sticky;z-index:4;';
        const SB = 'position:sticky;z-index:2;';
        const rnd = v => Math.round(v * 10) / 10;

        const isMonthly = this.interval === 'monthly';
        const periods   = isMonthly ? buildMonthPeriods(weeks) : weeks;

        let periodHeaderHtml, subHeaderHtml = '';
        if (isMonthly) {
          periodHeaderHtml = periods.map(p => {
            const bg = p.isPast ? '#e9ebec' : p.isCurrent ? '#4dabf7' : 'var(--indigo-100)';
            const fw = p.isCurrent ? 'font-weight:bold;color:#fff;' : '';
            return `<th style="min-width:70px;text-align:center;background:${bg};font-size:var(--text-sm);padding:4px 3px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);${fw}">${p.label}</th>`;
          }).join('');
        } else {
          const monthGroups = [];
          weeks.forEach(w => {
            const last = monthGroups[monthGroups.length - 1];
            if (last && last.key === w.monthKey) last.count++;
            else monthGroups.push({ key: w.monthKey, count: 1, allPast: w.isPast });
          });
          weeks.forEach(w => { const mg = monthGroups.find(m => m.key === w.monthKey); if (mg && !w.isPast) mg.allPast = false; });
          periodHeaderHtml = monthGroups.map(mg => {
            const bg = mg.allPast ? '#e9ebec' : 'var(--indigo-100)';
            return `<th colspan="${mg.count}" style="text-align:center;background:${bg};font-size:var(--text-sm);padding:4px 3px;border:1px solid var(--border-light);">${mg.key}</th>`;
          }).join('');
          subHeaderHtml = weeks.map(w => {
            const bg = w.isCurrent ? '#4dabf7' : w.isPast ? '#e8eaec' : '#f0f2ff';
            const borderR = w.isLastOfMonth ? '3px solid var(--text-muted)' : '1px solid var(--border-light)';
            const fw = w.isCurrent ? 'font-weight:bold;color:#fff;' : '';
            return `<th title="${w.dateTitle}" style="min-width:42px;max-width:52px;font-size:var(--text-xs);text-align:center;background:${bg};border:1px solid var(--border-light);border-right:${borderR};padding:3px 2px;white-space:nowrap;${fw}">${w.wLabel}</th>`;
          }).join('');
        }

        const makePeriodCells = (weekTotals, bgFn) => periods.map(p => {
          const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()];
          const h = keys.reduce((s, k) => s + (weekTotals[k] || 0), 0);
          const borderR = isMonthly ? '3px solid var(--text-muted)' : (p.isLastOfMonth ? '3px solid var(--text-muted)' : '1px solid var(--border-light)');
          if (h < 0.01) return `<td style="background:${p.isPast ? '#f4f5f6' : 'transparent'};border:1px solid var(--border-light);border-right:${borderR}"></td>`;
          return `<td style="background:${bgFn(p)};border:1px solid var(--border-light);border-right:${borderR};text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 3px">${fmtPH(h)}</td>`;
        }).join('');

        const periodLabels = periods.map(p => isMonthly ? p.label : p.dateTitle);
        const periodMeta   = periods.map(p => ({ isPast: p.isPast, isCurrent: p.isCurrent ?? false }));
        const exportRows = [{ v: ['Project', 'Task', 'Role', 'Owner', 'Sold', 'From actuals', 'To be planned', ...periodLabels], level: 'header' }];

        let tbodyHtml = '';
        let projGroupIdx = 0;
        let grandSold = 0, grandActuals = 0, grandTbp = 0;
        const grandWeekTotals = {};
        weeks.forEach(w => { grandWeekTotals[w.weekStart.toISOString()] = 0; });

        projects.forEach(proj => {
          const gid = `proj-${projGroupIdx++}`;
          const projData = timesheetData.filter(r => r.projectId === proj.id);
          let projSold = 0, projActuals = 0, projTbp = 0;
          const projWeekTotals = {};
          weeks.forEach(w => { projWeekTotals[w.weekStart.toISOString()] = 0; });

          let projBodyHtml = '';
          const projExportRows = [];

          (proj.tasks || []).forEach(task => {
            if (task.completed) return;
            const tStart = parseTaskDate(task.startDate || proj.startDate, false);
            const tEnd   = parseTaskDate(task.endDate   || proj.endDate,   true);
            const overlapWeeks = weeks.filter(w => w.weekEnd >= tStart && w.weekStart <= tEnd);
            if (!overlapWeeks.length) return;

            let taskSold = 0, taskActuals = 0, taskTbp = 0;
            const taskWeekTotals = {};
            weeks.forEach(w => { taskWeekTotals[w.weekStart.toISOString()] = 0; });

            let taskBodyHtml = '';
            const taskExportRows = [];

            (task.resources || []).forEach(res => {
              if (!res.role) return;
              if (!rolePassesTeamFilter(res.role)) return;
              const soldH = res.soldHours || 0;

              const taskRoleRecs = projData.filter(r => matchesTaskRole(r, task.name, res.role));
              const consumedH = taskRoleRecs.reduce((s, r) => s + r.hours, 0);
              const residualH = computeResidual(soldH, consumedH);

              const ownerTotals = {};
              taskRoleRecs.forEach(r => { const o = r.owner?.trim() || '—'; ownerTotals[o] = (ownerTotals[o] || 0) + r.hours; });
              const totalOwnerH = Object.values(ownerTotals).reduce((s, v) => s + v, 0);
              const ownerNames = Object.keys(ownerTotals).sort((a, b) => ownerTotals[b] - ownerTotals[a]);
              const hasOwners = ownerNames.length > 0;

              const pastWeeks   = overlapWeeks.filter(w => w.isPast);
              const futureWeeks = overlapWeeks.filter(w => !w.isPast);
              const _now = new Date(); const _td = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate());
              const _totalFw = countFutureTaskWeeks(tStart, tEnd, _td);

              const roleWeekData = {};

              pastWeeks.forEach(w => {
                const key  = w.weekStart.toISOString();
                const recs = taskRoleRecs.filter(r => r.date >= w.weekStart && r.date <= w.weekEnd);
                const tot  = recs.reduce((s, r) => s + r.hours, 0);
                if (tot < 0.01) return;
                const byOwner = {};
                recs.forEach(r => { const o = r.owner?.trim() || '—'; byOwner[o] = (byOwner[o] || 0) + r.hours; });
                roleWeekData[key] = { total: tot, byOwner, isPulse: false, isPast: true };
              });

              const distribute = (byOwner, hours) => {
                if (hasOwners && totalOwnerH > 0.01) {
                  ownerNames.forEach(o => { byOwner[o] = (byOwner[o] || 0) + hours * (ownerTotals[o] / totalOwnerH); });
                } else {
                  byOwner['—'] = (byOwner['—'] || 0) + hours;
                }
              };

              if (futureWeeks.length > 0 && residualH > 0.01) {
                const byMonth = {};
                futureWeeks.forEach(w => {
                  if (!byMonth[w.monthKey]) byMonth[w.monthKey] = [];
                  byMonth[w.monthKey].push(w.weekStart.toISOString());
                });
                const weeksByMonth = Object.entries(byMonth).map(([monthKey, weekKeys]) => ({ monthKey, weekKeys }));

                distributeFutureResidual(residualH, _totalFw, weeksByMonth, this.monthlyPulse).forEach(entry => {
                  if (!roleWeekData[entry.key]) roleWeekData[entry.key] = { total: 0, byOwner: {}, isPulse: entry.isPulse, isPast: false };
                  roleWeekData[entry.key].total += entry.hours;
                  if (entry.isPulse) roleWeekData[entry.key].isPulse = true;
                  distribute(roleWeekData[entry.key].byOwner, entry.hours);
                });
              }

              const roleTbp = Object.entries(roleWeekData)
                .filter(([key]) => weeks.find(w => w.weekStart.toISOString() === key && !w.isPast))
                .reduce((s, [, d]) => s + d.total, 0);

              taskSold    += soldH;
              taskActuals += consumedH;
              taskTbp     += roleTbp;
              Object.entries(roleWeekData).forEach(([key, d]) => { taskWeekTotals[key] = (taskWeekTotals[key] || 0) + d.total; });

              const noOwnerBadge = !hasOwners ? ' <span style="font-size:var(--text-2xs);background:var(--color-warning-bg);border:1px solid #ffc107;border-radius:var(--radius-xs);padding:0 4px;color:var(--color-warning-text)">no owner</span>' : '';
              const roleStyle    = !hasOwners ? 'color:#dc6500;font-style:italic;' : '';

              const rolePeriodCells = periods.map(p => {
                const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()];
                let h = 0, isPulse = false;
                keys.forEach(key => { const d = roleWeekData[key]; if (d) { h += d.total; if (d.isPulse) isPulse = true; } });
                const borderR = isMonthly ? '3px solid var(--text-muted)' : (p.isLastOfMonth ? '3px solid var(--text-muted)' : '1px solid var(--border-light)');
                if (h < 0.01) return `<td style="background:${p.isPast ? '#f4f5f6' : 'transparent'};border:1px solid var(--border-light);border-right:${borderR}"></td>`;
                const bg = p.isPast ? '#e5e8ea' : isPulse ? 'var(--violet-100)' : (h > 30 ? 'var(--color-danger-bg)' : h > 24 ? 'var(--color-warning-bg)' : 'white');
                const dv = isPulse ? `<span style="font-style:italic;color:var(--violet-600)">~${fmtPH(h)}</span>`
                  : h < 1 && this.roundHours ? `<span style="color:#888;font-size:var(--text-xs)">${h.toFixed(2)}h</span>`
                  : fmtPH(h);
                return `<td style="background:${bg};border:1px solid var(--border-light);border-right:${borderR};text-align:center;font-size:var(--text-xs);padding:2px 3px">${dv}</td>`;
              }).join('');

              taskBodyHtml += `
                <tr data-parent-group="${gid}">
                  <td style="${SB}left:0;background:#fff;font-size:var(--text-sm);padding:4px 8px 4px 30px;border:1px solid var(--border-light);white-space:nowrap;font-weight:600;${roleStyle}">${esc(res.role)}${noOwnerBadge}</td>
                  <td style="${SB}left:200px;background:var(--sand-50);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled)">${fmtPH(soldH)}</td>
                  <td style="${SB}left:265px;background:var(--sand-50);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled)">${fmtPH(consumedH)}</td>
                  <td style="${SB}left:345px;background:var(--sand-50);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted)">${fmtPH(roleTbp)}</td>
                  ${rolePeriodCells}
                </tr>`;

              taskExportRows.push({ v: ['', '', res.role, '', rnd(soldH), rnd(consumedH), rnd(roleTbp),
                ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (roleWeekData[k]?.total || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'role' });

              const displayOwners = hasOwners ? ownerNames : ['—'];
              displayOwners.forEach(ownerName => {
                const isPlaceholder = ownerName === '—';
                const ownerActualsH = ownerTotals[ownerName] || 0;
                const ownerProp     = totalOwnerH > 0.01 ? (ownerTotals[ownerName] || 0) / totalOwnerH : (isPlaceholder ? 1 : 0);
                const ownerTbpH     = roleTbp * ownerProp;

                const ownerPeriodCells = periods.map(p => {
                  const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()];
                  let oh = 0, isPulse = false;
                  keys.forEach(key => { const d = roleWeekData[key]; if (d) { oh += (d.byOwner[ownerName] || 0); if (d.isPulse) isPulse = true; } });
                  const borderR = isMonthly ? '3px solid var(--text-muted)' : (p.isLastOfMonth ? '3px solid var(--text-muted)' : '1px solid var(--border-light)');
                  const emptyBg = p.isPast ? '#f4f5f6' : 'transparent';
                  if (oh < 0.01) return `<td style="background:${emptyBg};border:1px solid var(--border-light);border-right:${borderR}"></td>`;
                  const bg = p.isPast ? '#e8eaec' : isPulse ? '#f3effe' : '#fafafa';
                  const dv = isPulse ? `<span style="font-style:italic;color:var(--violet-400);font-size:var(--text-xs)">~${fmtPH(oh)}</span>`
                    : oh < 1 && this.roundHours ? `<span style="color:#888;font-size:var(--text-2xs)">${oh.toFixed(2)}h</span>`
                    : `<span style="font-size:var(--text-xs)">${fmtPH(oh)}</span>`;
                  return `<td style="background:${bg};border:1px solid var(--border-light);border-right:${borderR};text-align:center;padding:2px 3px">${dv}</td>`;
                }).join('');

                const ownerLabel = isPlaceholder ? '<span style="color:#aaa;font-style:italic">TBD</span>' : esc(ownerName);
                taskBodyHtml += `
                  <tr data-parent-group="${gid}" style="background:#fafafa">
                    <td style="${SB}left:0;background:#fafafa;font-size:var(--text-xs);padding:3px 8px 3px 52px;border:1px solid var(--border-light);color:#444;white-space:nowrap">${ownerLabel}</td>
                    <td style="${SB}left:200px;background:#f5f6f7;text-align:center;font-size:var(--text-xs);padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);color:#aaa">—</td>
                    <td style="${SB}left:265px;background:#f5f6f7;text-align:center;font-size:var(--text-xs);padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);color:#555">${fmtPH(ownerActualsH)}</td>
                    <td style="${SB}left:345px;background:#f5f6f7;text-align:center;font-size:var(--text-xs);padding:2px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);color:#555">${fmtPH(ownerTbpH)}</td>
                    ${ownerPeriodCells}
                  </tr>`;

                taskExportRows.push({ v: ['', '', res.role, isPlaceholder ? 'TBD' : ownerName, '', rnd(ownerActualsH), rnd(ownerTbpH),
                  ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const oh = keys.reduce((s, k) => s + ((roleWeekData[k]?.byOwner[ownerName]) || 0), 0); return oh > 0.01 ? rnd(oh) : ''; })], level: 'owner' });
              });
            });

            if (!taskBodyHtml) return;

            projSold    += taskSold;
            projActuals += taskActuals;
            projTbp     += taskTbp;
            Object.entries(taskWeekTotals).forEach(([key, h]) => { projWeekTotals[key] = (projWeekTotals[key] || 0) + h; });

            projExportRows.push(
              { v: ['', task.name, '', '', rnd(taskSold), rnd(taskActuals), rnd(taskTbp),
                ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (taskWeekTotals[k] || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'task' },
              ...taskExportRows
            );

            projBodyHtml += `
              <tr data-parent-group="${gid}" style="background:#e8ecff;border-top:2px solid #8899dd">
                <td style="${SB}left:0;background:#e8ecff;font-size:var(--text-sm);padding:5px 8px 5px 18px;font-weight:600;border:1px solid var(--border-light);border-left:3px solid #8899dd;white-space:nowrap">📋 ${esc(task.name)}${dateBadge(task.startDate, task.endDate)}</td>
                <td style="${SB}left:200px;background:var(--sand-200);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled)">${fmtPH(taskSold)}</td>
                <td style="${SB}left:265px;background:var(--sand-200);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled)">${fmtPH(taskActuals)}</td>
                <td style="${SB}left:345px;background:var(--sand-200);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted)">${fmtPH(taskTbp)}</td>
                ${makePeriodCells(taskWeekTotals, p => p.isPast ? '#e5e8ea' : p.isCurrent ? '#c8e6ff' : '#f0f2ff')}
              </tr>
              ${taskBodyHtml}`;
          });

          if (!projBodyHtml) return;

          grandSold    += projSold;
          grandActuals += projActuals;
          grandTbp     += projTbp;
          Object.entries(projWeekTotals).forEach(([key, h]) => { grandWeekTotals[key] = (grandWeekTotals[key] || 0) + h; });

          const pipeBadge = proj.pipeline ? ' ' + pipelineBadge(proj.pipeline) : '';
          const statBadge = proj.status  ? ' ' + statusBadge(proj.status)     : '';

          exportRows.push(
            { v: [proj.name || proj.id, '', '', '', rnd(projSold), rnd(projActuals), rnd(projTbp),
              ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (projWeekTotals[k] || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'project' },
            ...projExportRows
          );

          tbodyHtml += `
            <tr data-group-id="${gid}" style="background:var(--indigo-300);border-top:3px solid var(--indigo-500);border-bottom:1px solid var(--indigo-500)">
              <td style="${SB}left:0;background:var(--indigo-300);font-size:var(--text-base);padding:7px 8px 7px 10px;font-weight:700;border:1px solid var(--border-light);border-left:4px solid var(--indigo-500);white-space:nowrap"><span class="pp-toggle" style="display:inline-block;width:12px;margin-right:4px;font-size:var(--text-xs)">▼</span>🏢 ${esc(proj.name || proj.id)}${pipeBadge}${statBadge}${dateBadge(proj.startDate, proj.endDate)}</td>
              <td style="${SB}left:200px;background:var(--sand-300);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled)">${fmtPH(projSold)}</td>
              <td style="${SB}left:265px;background:var(--sand-300);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled)">${fmtPH(projActuals)}</td>
              <td style="${SB}left:345px;background:var(--sand-300);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted)">${fmtPH(projTbp)}</td>
              ${makePeriodCells(projWeekTotals, p => p.isPast ? '#bec3c8' : p.isCurrent ? '#90c8f0' : '#c8d0f5')}
            </tr>
            ${projBodyHtml}`;
        });

        if (!tbodyHtml) {
          return { html: '<div class="alert alert-info mb-0">No resource data found for the selected filters and date range.</div>', exportRows: [], periodMeta: [] };
        }

        tbodyHtml += `
          <tr style="background:var(--indigo-50);border-top:3px solid var(--text-muted)">
            <td style="${SB}left:0;background:var(--indigo-50);font-size:var(--text-base);padding:6px 8px;font-weight:bold;border:1px solid var(--border-light);border-top:3px solid var(--text-muted)">Total</td>
            <td style="${SB}left:200px;background:var(--sand-400);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);border-top:3px solid var(--text-muted)">${fmtPH(grandSold)}</td>
            <td style="${SB}left:265px;background:var(--sand-400);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);border-top:3px solid var(--text-muted)">${fmtPH(grandActuals)}</td>
            <td style="${SB}left:345px;background:var(--sand-400);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);border-top:3px solid var(--text-muted)">${fmtPH(grandTbp)}</td>
            ${makePeriodCells(grandWeekTotals, p => p.isPast ? '#e5e8ea' : p.isCurrent ? '#c8e6ff' : '#f0f2ff')}
          </tr>`;

        exportRows.push(
          { v: ['Total', '', '', '', rnd(grandSold), rnd(grandActuals), rnd(grandTbp),
            ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (grandWeekTotals[k] || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'total' }
        );

        const rowspan = isMonthly ? '1' : '2';
        const html = `
          <div class="alert alert-light border mb-3" style="font-size:var(--text-base);color:#444;line-height:1.7">
            <strong>Estimation logic (By Project):</strong>
            The table is structured as <strong>Project → Task → Role → Owner</strong>.
            <strong>Past weeks</strong> (grey) show <em>actual hours</em> from timesheets, broken down by owner.
            <strong>Current and future weeks</strong> show <em>residual hours</em> (sold − consumed) distributed linearly across the remaining task duration,
            then split among owners <em>proportionally to their share of actuals</em>.
            When residual falls below 1h/week per role, hours are <strong>aggregated monthly</strong> —
            shown in <span style="background:var(--violet-100);padding:1px 5px;border-radius:var(--radius-xs);font-style:italic;color:var(--violet-600)">~italic lavender</span>.
            <span style="background:#c8e6ff;padding:1px 5px;border-radius:var(--radius-xs)">Blue</span> = current week / month.
          </div>
          <div class="d-flex justify-content-end gap-1 mb-2">
            <button class="btn btn-outline-secondary pp-expand-all" style="font-size:var(--text-xs);padding:2px 8px">⊞ Expand all</button>
            <button class="btn btn-outline-secondary pp-collapse-all" style="font-size:var(--text-xs);padding:2px 8px">⊟ Collapse all</button>
          </div>
          <table class="gantt-table" style="border-collapse:collapse;width:100%">
            <thead>
              <tr>
                <th rowspan="${rowspan}" style="${SH}left:0;min-width:200px;background:#d8dff7;font-size:var(--text-base);padding:8px 10px;border:1px solid var(--border-light);white-space:nowrap">Project / Task / Role / Owner</th>
                <th rowspan="${rowspan}" style="${SH}left:200px;min-width:65px;background:var(--sand-200);font-size:var(--text-base);padding:8px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);text-align:center;white-space:nowrap">Sold</th>
                <th rowspan="${rowspan}" style="${SH}left:265px;min-width:80px;background:var(--sand-200);font-size:var(--text-base);padding:8px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);text-align:center;white-space:nowrap">From<br>actuals</th>
                <th rowspan="${rowspan}" title="To be planned can exceed Sold − Actuals when a role has multiple tasks and one is over-consumed — hours over budget on one task aren't subtracted from another task's remaining budget." style="${SH}left:345px;min-width:90px;background:var(--sand-200);font-size:var(--text-base);padding:8px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);text-align:center;white-space:nowrap">To be<br>planned</th>
                ${periodHeaderHtml}
              </tr>
              ${isMonthly ? '' : `<tr>${subHeaderHtml}</tr>`}
            </thead>
            <tbody>${tbodyHtml}</tbody>
          </table>`;

        return { html, exportRows, periodMeta };
      },
```

- [ ] **Step 2: Extend `activeViewHtml` with the `byproject` branch**

Find:
```js
      activeViewHtml() {
        if (this.view === 'byrole') return this.byRoleView.html;
        return ''; // 'byproject'/'byowner' branches added in Tasks 4-5
      },
```
Replace with:
```js
      activeViewHtml() {
        if (this.view === 'byrole') return this.byRoleView.html;
        if (this.view === 'byproject') return this.byProjectView.html;
        return ''; // 'byowner' branch added in Task 5
      },
```

- [ ] **Step 3: Delete the now-ported function from `js/planning.js`**

Delete `renderPortfolioPlanningByProjectContent` in its entirety from `js/planning.js` (search for `function renderPortfolioPlanningByProjectContent` — its exact line range shifted after Task 3's deletion). Leave `renderPortfolioPlanningByOwnerContent`/`buildStyledExcelExport`/`setupGroupToggle` in place — Task 5/6 port those.

- [ ] **Step 4: Manually verify**

Switch to the "By Project" toggle in the browser. Confirm: the Project → Task → Role → Owner hierarchy renders with sticky project/task rows, the ▼/▶ group-collapse toggle works on both project and task-group header rows, "Expand all"/"Collapse all" buttons work, and owner rows correctly proportion residual hours by each owner's historical share of actuals.

- [ ] **Step 5: Run the full test suite (regression check)**

```bash
npm test
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add planning.html js/planning.js
git commit -m "feat(planning): port By Project grouping view to Vue"
```

---

### Task 5: By Owner grouping view

**Files:**
- Modify: `planning.html` (adds `byOwnerView` computed and extends `activeViewHtml`'s `if`/`else` chain)
- Modify: `js/planning.js` (deletes the now-ported `renderPortfolioPlanningByOwnerContent` and `setupGroupToggle` function bodies — the latter is now fully superseded by Task 3's `initTooltipsAndToggles`, which every grouping view relies on)

**Interfaces:**
- Consumes: Task 2's `computed.weeks`/`filteredProjects`/`interval`/`roundHours`/`monthlyPulse`; `js/lib/planning-calc.js`'s `matchesTaskRole`/`computeResidual`/`distributeFutureResidual`/`countFutureTaskWeeks`; global `buildMonthPeriods`/`rolePassesTeamFilter`/`esc`/`pipelineBadge`/`statusBadge` (unchanged); global `timesheetData`/`config`.
- Produces: `computed.byOwnerView` → `{ html, exportRows, periodMeta }` (consumed by Task 6's `exportCurrentView`); completes `activeViewHtml`'s `if`/`else` chain (all three views now handled).

- [ ] **Step 1: Add the `byOwnerView` computed**

In the Vue app block, add (ported verbatim from `renderPortfolioPlanningByOwnerContent`, `js/planning.js:1262-1536`, with `container`/`projects`/`weeks` parameters replaced by `this.filteredProjects`/`this.weeks`):

```js
      byOwnerView() {
        const projects = this.filteredProjects;
        const weeks    = this.weeks;
        const fmtPH = v => v > 0.005 ? (this.roundHours ? Math.round(v) : v.toFixed(2)) + 'h' : '';
        const rnd   = v => Math.round(v * 10) / 10;
        const SH = 'position:sticky;z-index:4;';
        const SB = 'position:sticky;z-index:2;';

        const isMonthly = this.interval === 'monthly';
        const periods   = isMonthly ? buildMonthPeriods(weeks) : weeks;

        let periodHeaderHtml, subHeaderHtml = '';
        if (isMonthly) {
          periodHeaderHtml = periods.map(p => {
            const bg = p.isPast ? '#e9ebec' : p.isCurrent ? '#4dabf7' : 'var(--indigo-100)';
            const fw = p.isCurrent ? 'font-weight:bold;color:#fff;' : '';
            return `<th style="min-width:70px;text-align:center;background:${bg};font-size:var(--text-sm);padding:4px 3px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);${fw}">${p.label}</th>`;
          }).join('');
        } else {
          const monthGroups = [];
          weeks.forEach(w => {
            const last = monthGroups[monthGroups.length - 1];
            if (last && last.key === w.monthKey) last.count++;
            else monthGroups.push({ key: w.monthKey, count: 1, allPast: w.isPast });
          });
          weeks.forEach(w => { const mg = monthGroups.find(m => m.key === w.monthKey); if (mg && !w.isPast) mg.allPast = false; });
          periodHeaderHtml = monthGroups.map(mg => {
            const bg = mg.allPast ? '#e9ebec' : 'var(--indigo-100)';
            return `<th colspan="${mg.count}" style="text-align:center;background:${bg};font-size:var(--text-sm);padding:4px 3px;border:1px solid var(--border-light);">${mg.key}</th>`;
          }).join('');
          subHeaderHtml = weeks.map(w => {
            const bg = w.isCurrent ? '#4dabf7' : w.isPast ? '#e8eaec' : '#f0f2ff';
            const borderR = w.isLastOfMonth ? '3px solid var(--text-muted)' : '1px solid var(--border-light)';
            return `<th title="${w.dateTitle}" style="min-width:42px;max-width:52px;font-size:var(--text-xs);text-align:center;background:${bg};border:1px solid var(--border-light);border-right:${borderR};padding:3px 2px;white-space:nowrap;${w.isCurrent ? 'font-weight:bold;color:#fff;' : ''}">${w.wLabel}</th>`;
          }).join('');
        }

        const ownerMap = {};

        projects.forEach(proj => {
          const projData = timesheetData.filter(r => r.projectId === proj.id);
          (proj.tasks || []).forEach(task => {
            if (task.completed) return;
            const tStart = task.startDate ? parseTaskDate(task.startDate, false) : null;
            const tEnd   = task.endDate   ? parseTaskDate(task.endDate,   true)  : null;

            const resources = (task.resources || []).filter(res => rolePassesTeamFilter(res.role));
            if (!resources.length) return;
            const soldH    = resources.reduce((s, res) => s + (res.soldHours || 0), 0);
            const taskRecs = projData.filter(r => resources.some(res => matchesTaskRole(r, task.name, res.role)));

            const taskWeekData = {};
            const ownerTotals  = {};
            let totalOwnerH    = 0;

            weeks.forEach(w => {
              if (!w.isPast) return;
              const key  = w.weekStart.toISOString();
              const recs = taskRecs.filter(r => { const d = new Date(r.date); d.setHours(0,0,0,0); return d >= w.weekStart && d <= w.weekEnd; });
              if (!recs.length) return;
              const byOwner = {};
              recs.forEach(r => { const o = r.owner?.trim() || '—'; byOwner[o] = (byOwner[o] || 0) + r.hours; });
              taskWeekData[key] = { total: recs.reduce((s, r) => s + r.hours, 0), byOwner, isPulse: false, isPast: true };
            });
            taskRecs.forEach(r => { const o = r.owner?.trim() || '—'; ownerTotals[o] = (ownerTotals[o] || 0) + r.hours; });
            Object.values(ownerTotals).forEach(h => { totalOwnerH += h; });

            const consumedH = totalOwnerH;
            const taskTbp   = computeResidual(soldH, consumedH);
            if (soldH < 0.01 && consumedH < 0.01) return;

            const ownerNames = Object.entries(ownerTotals).filter(([, h]) => h > 0.01).sort((a, b) => b[1] - a[1]).map(([o]) => o);
            const hasOwners  = ownerNames.length > 0;

            if (taskTbp > 0.01) {
              const _owNow = new Date(); const _owTd = new Date(_owNow.getFullYear(), _owNow.getMonth(), _owNow.getDate());
              const futureWeeks = weeks.filter(w => !w.isPast);
              const taskWeeks   = tStart && tEnd ? futureWeeks.filter(w => w.weekEnd >= tStart && w.weekStart <= tEnd) : futureWeeks;
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

              distributeFutureResidual(taskTbp, totalTaskFw, weeksByMonth, this.monthlyPulse).forEach(entry => {
                if (!taskWeekData[entry.key]) taskWeekData[entry.key] = { total: 0, byOwner: {}, isPulse: entry.isPulse, isPast: false };
                taskWeekData[entry.key].total += entry.hours;
                if (entry.isPulse) taskWeekData[entry.key].isPulse = true;
                distribute(taskWeekData[entry.key].byOwner, entry.hours);
              });
            }

            const displayOwners = hasOwners ? ownerNames : ['—'];
            displayOwners.forEach(ownerName => {
              const isPlaceholder = ownerName === '—';
              const ownerProp    = totalOwnerH > 0.01 ? (ownerTotals[ownerName] || 0) / totalOwnerH : (isPlaceholder ? 1 : 0);
              const ownerSold    = soldH * ownerProp;
              const ownerActuals = ownerTotals[ownerName] || 0;
              const ownerTbpH    = taskTbp * ownerProp;

              if (!ownerMap[ownerName]) ownerMap[ownerName] = { sold: 0, actuals: 0, tbp: 0, weekTotals: {}, projects: {} };
              const om = ownerMap[ownerName];
              om.sold += ownerSold; om.actuals += ownerActuals; om.tbp += ownerTbpH;

              if (!om.projects[proj.id]) om.projects[proj.id] = { name: proj.name || proj.id, sold: 0, actuals: 0, tbp: 0, weekTotals: {}, tasks: {} };
              const pm = om.projects[proj.id];
              pm.sold += ownerSold; pm.actuals += ownerActuals; pm.tbp += ownerTbpH;

              if (!pm.tasks[task.name]) pm.tasks[task.name] = { sold: 0, actuals: 0, tbp: 0, weekData: {} };
              const tm = pm.tasks[task.name];
              tm.sold += ownerSold; tm.actuals += ownerActuals; tm.tbp += ownerTbpH;

              weeks.forEach(w => {
                const key = w.weekStart.toISOString();
                const d   = taskWeekData[key];
                if (!d) return;
                const oh = d.byOwner[ownerName] || 0;
                if (oh < 0.001) return;
                if (!tm.weekData[key]) tm.weekData[key] = { hours: 0, isPulse: d.isPulse, isPast: d.isPast };
                tm.weekData[key].hours += oh;
                if (!pm.weekTotals[key]) pm.weekTotals[key] = { hours: 0, isPulse: d.isPulse, isPast: d.isPast };
                pm.weekTotals[key].hours += oh;
                if (!om.weekTotals[key]) om.weekTotals[key] = { hours: 0, isPulse: d.isPulse, isPast: d.isPast };
                om.weekTotals[key].hours += oh;
              });
            });
          });
        });

        if (Object.keys(ownerMap).length === 0) {
          return { html: '<div class="alert alert-info mb-0">No owner data found for the selected filters.</div>', exportRows: [], periodMeta: [] };
        }

        const makePeriodCells = (weekDataMap, bgFn, small = false) => periods.map(p => {
          const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()];
          let h = 0, isPulse = false;
          keys.forEach(key => { const d = weekDataMap[key]; if (d) { h += d.hours; if (d.isPulse) isPulse = true; } });
          const borderR = isMonthly ? '3px solid var(--text-muted)' : (p.isLastOfMonth ? '3px solid var(--text-muted)' : '1px solid var(--border-light)');
          if (h < 0.01) return `<td style="background:${p.isPast ? '#f4f5f6' : 'transparent'};border:1px solid var(--border-light);border-right:${borderR}"></td>`;
          const bg = bgFn ? bgFn(p, h, isPulse) : (p.isPast ? (small ? '#e8eaec' : '#e5e8ea') : isPulse ? (small ? '#f3effe' : 'var(--violet-100)') : p.isCurrent ? '#c8e6ff' : small ? '#fafafa' : 'white');
          const dv = isPulse
            ? `<span style="font-style:italic;color:${small ? 'var(--violet-400)' : 'var(--violet-600)'};font-size:${small ? '.7rem' : '.75rem'}">~${fmtPH(h)}</span>`
            : (h < 1 && this.roundHours ? `<span style="color:#888;font-size:var(--text-2xs)">${h.toFixed(2)}h</span>` : `<span style="font-size:${small ? '.72rem' : '.75rem'}">${fmtPH(h)}</span>`);
          return `<td style="background:${bg};border:1px solid var(--border-light);border-right:${borderR};text-align:center;padding:2px 3px">${dv}</td>`;
        }).join('');

        const makeGrandCells = weekTotals => periods.map(p => {
          const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()];
          const h = keys.reduce((s, k) => s + (weekTotals[k] || 0), 0);
          const borderR = isMonthly ? '3px solid var(--text-muted)' : (p.isLastOfMonth ? '3px solid var(--text-muted)' : '1px solid var(--border-light)');
          if (h < 0.01) return `<td style="background:${p.isPast ? '#f4f5f6' : 'transparent'};border:1px solid var(--border-light);border-right:${borderR}"></td>`;
          const bg = p.isPast ? '#e5e8ea' : p.isCurrent ? '#c8e6ff' : '#f0f2ff';
          return `<td style="background:${bg};border:1px solid var(--border-light);border-right:${borderR};text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 3px">${fmtPH(h)}</td>`;
        }).join('');

        const periodLabels = periods.map(p => isMonthly ? p.label : p.dateTitle);
        const periodMeta   = periods.map(p => ({ isPast: p.isPast, isCurrent: p.isCurrent ?? false }));
        const exportRows = [{ v: ['Owner', 'Project', 'Task', 'Sold', 'From actuals', 'To be planned', ...periodLabels], level: 'header' }];
        let tbodyHtml = '';
        let ownerGroupIdx = 0;
        let grandSold = 0, grandActuals = 0, grandTbp = 0;
        const grandWeekTotals = {};

        Object.entries(ownerMap).sort((a, b) => a[0].localeCompare(b[0])).forEach(([ownerName, om]) => {
          const oid = `owner-${ownerGroupIdx++}`;
          const displayName = ownerName === '—' ? 'TBD' : ownerName;
          grandSold += om.sold; grandActuals += om.actuals; grandTbp += om.tbp;

          weeks.forEach(w => {
            const key = w.weekStart.toISOString();
            grandWeekTotals[key] = (grandWeekTotals[key] || 0) + (om.weekTotals[key]?.hours || 0);
          });

          tbodyHtml += `
            <tr data-group-id="${oid}" style="background:var(--indigo-300);border-top:3px solid var(--indigo-500);border-bottom:1px solid var(--indigo-500)">
              <td style="${SB}left:0;background:var(--indigo-300);font-size:var(--text-md);padding:7px 8px 7px 10px;font-weight:700;border:1px solid var(--border-light);border-left:4px solid var(--indigo-500);white-space:nowrap"><span class="pp-toggle" style="display:inline-block;width:12px;margin-right:4px;font-size:var(--text-xs)">▼</span>👤 ${esc(displayName)}</td>
              <td style="${SB}left:200px;background:var(--sand-300);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled)">${fmtPH(om.sold)}</td>
              <td style="${SB}left:265px;background:var(--sand-300);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled)">${fmtPH(om.actuals)}</td>
              <td style="${SB}left:345px;background:var(--sand-300);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted)">${fmtPH(om.tbp)}</td>
              ${makePeriodCells(om.weekTotals, null)}
            </tr>`;
          exportRows.push({ v: [displayName, '', '', rnd(om.sold), rnd(om.actuals), rnd(om.tbp),
            ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (om.weekTotals[k]?.hours || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'project' });

          Object.entries(om.projects).sort((a, b) => a[1].name.localeCompare(b[1].name)).forEach(([projId, pm]) => {
            const projCfg = (config.projects || []).find(p => p.id === projId);
            const pmPipe  = projCfg ? pipelineBadge(projCfg.pipeline) : '';
            const pmStat  = projCfg ? statusBadge(projCfg.status)     : '';
            tbodyHtml += `
              <tr data-parent-group="${oid}" style="background:#e8ecff;border-top:2px solid #8899dd">
                <td style="${SB}left:0;background:#e8ecff;font-size:var(--text-sm);padding:5px 8px 5px 22px;font-weight:600;border:1px solid var(--border-light);border-left:3px solid #8899dd;white-space:nowrap">🏢 ${esc(pm.name)} ${pmPipe} ${pmStat}</td>
                <td style="${SB}left:200px;background:var(--sand-200);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled)">${fmtPH(pm.sold)}</td>
                <td style="${SB}left:265px;background:var(--sand-200);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled)">${fmtPH(pm.actuals)}</td>
                <td style="${SB}left:345px;background:var(--sand-200);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted)">${fmtPH(pm.tbp)}</td>
                ${makePeriodCells(pm.weekTotals, null)}
              </tr>`;
            exportRows.push({ v: ['', pm.name, '', rnd(pm.sold), rnd(pm.actuals), rnd(pm.tbp),
              ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (pm.weekTotals[k]?.hours || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'task' });

            Object.entries(pm.tasks).sort((a, b) => a[0].localeCompare(b[0])).forEach(([taskName, tm]) => {
              tbodyHtml += `
                <tr data-parent-group="${oid}" style="background:#fafafa">
                  <td style="${SB}left:0;background:#fafafa;font-size:var(--text-sm);padding:4px 8px 4px 38px;font-weight:600;border:1px solid var(--border-light);white-space:nowrap;color:#444">${esc(taskName)}</td>
                  <td style="${SB}left:200px;background:var(--sand-50);text-align:center;font-size:var(--text-xs);padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);color:var(--text-muted)">${fmtPH(tm.sold)}</td>
                  <td style="${SB}left:265px;background:var(--sand-50);text-align:center;font-size:var(--text-xs);padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);color:#555">${fmtPH(tm.actuals)}</td>
                  <td style="${SB}left:345px;background:var(--sand-50);text-align:center;font-size:var(--text-xs);padding:2px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);color:#555">${fmtPH(tm.tbp)}</td>
                  ${makePeriodCells(tm.weekData, null, true)}
                </tr>`;
              exportRows.push({ v: ['', '', taskName, rnd(tm.sold), rnd(tm.actuals), rnd(tm.tbp),
                ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (tm.weekData[k]?.hours || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'role' });
            });
          });
        });

        tbodyHtml += `
          <tr style="background:var(--indigo-50);border-top:3px solid var(--text-muted)">
            <td style="${SB}left:0;background:var(--indigo-50);font-size:var(--text-base);padding:6px 8px;font-weight:bold;border:1px solid var(--border-light);border-top:3px solid var(--text-muted)">Total</td>
            <td style="${SB}left:200px;background:var(--sand-400);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);border-top:3px solid var(--text-muted)">${fmtPH(grandSold)}</td>
            <td style="${SB}left:265px;background:var(--sand-400);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);border-top:3px solid var(--text-muted)">${fmtPH(grandActuals)}</td>
            <td style="${SB}left:345px;background:var(--sand-400);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);border-top:3px solid var(--text-muted)">${fmtPH(grandTbp)}</td>
            ${makeGrandCells(grandWeekTotals)}
          </tr>`;

        exportRows.push({ v: ['Total', '', '', rnd(grandSold), rnd(grandActuals), rnd(grandTbp),
          ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (grandWeekTotals[k] || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'total' });

        const rowspan = isMonthly ? '1' : '2';
        const html = `
          <div class="alert alert-light border mb-3" style="font-size:var(--text-base);color:#444;line-height:1.7">
            <strong>Estimation logic (By Owner):</strong>
            The table is structured as <strong>Owner → Project → Task</strong>.
            <strong>Past weeks</strong> show <em>actual</em> hours from timesheets.
            <strong>Future weeks</strong> show each owner's proportional share of remaining hours (sold − consumed).
            If no owner is found in the actuals, hours are assigned to a <em>TBD</em> placeholder.
          </div>
          <div class="d-flex justify-content-end gap-1 mb-2">
            <button class="btn btn-outline-secondary pp-expand-all" style="font-size:var(--text-xs);padding:2px 8px">⊞ Expand all</button>
            <button class="btn btn-outline-secondary pp-collapse-all" style="font-size:var(--text-xs);padding:2px 8px">⊟ Collapse all</button>
          </div>
          <table class="gantt-table" style="border-collapse:collapse;width:100%">
            <thead>
              <tr>
                <th rowspan="${rowspan}" style="${SH}left:0;min-width:200px;background:#d8dff7;font-size:var(--text-base);padding:8px 10px;border:1px solid var(--border-light);white-space:nowrap">Owner / Project / Task</th>
                <th rowspan="${rowspan}" style="${SH}left:200px;min-width:65px;background:var(--sand-200);font-size:var(--text-base);padding:8px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);text-align:center;white-space:nowrap">Sold</th>
                <th rowspan="${rowspan}" style="${SH}left:265px;min-width:80px;background:var(--sand-200);font-size:var(--text-base);padding:8px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);text-align:center;white-space:nowrap">From<br>actuals</th>
                <th rowspan="${rowspan}" title="To be planned can exceed Sold − Actuals when a role has multiple tasks and one is over-consumed — hours over budget on one task aren't subtracted from another task's remaining budget." style="${SH}left:345px;min-width:90px;background:var(--sand-200);font-size:var(--text-base);padding:8px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);text-align:center;white-space:nowrap">To be<br>planned</th>
                ${periodHeaderHtml}
              </tr>
              ${isMonthly ? '' : `<tr>${subHeaderHtml}</tr>`}
            </thead>
            <tbody>${tbodyHtml}</tbody>
          </table>`;

        return { html, exportRows, periodMeta };
      },
```

- [ ] **Step 2: Complete `activeViewHtml`'s `if`/`else` chain**

Find:
```js
      activeViewHtml() {
        if (this.view === 'byrole') return this.byRoleView.html;
        if (this.view === 'byproject') return this.byProjectView.html;
        return ''; // 'byowner' branch added in Task 5
      },
```
Replace with:
```js
      activeViewHtml() {
        if (this.view === 'byrole') return this.byRoleView.html;
        if (this.view === 'byproject') return this.byProjectView.html;
        return this.byOwnerView.html;
      },
```

- [ ] **Step 3: Delete the now-ported/now-superseded functions from `js/planning.js`**

Delete `renderPortfolioPlanningByOwnerContent` and `setupGroupToggle` in their entirety from `js/planning.js` (search for `function renderPortfolioPlanningByOwnerContent` / `function setupGroupToggle` — exact line ranges have shifted after Tasks 3-4's deletions). At this point `js/planning.js` should contain only `buildPlanningBarCells`, `renderPlanningView`/`renderPlanningByTask`/`renderPlanningByRole`/`showPlanningView` (confirmed dead code, per this plan's header), `buildWeekAllocationTable`, and `buildStyledExcelExport` — all removed wholesale in Task 6/7.

- [ ] **Step 4: Manually verify**

Switch to the "By Owner" toggle. Confirm: the Owner → Project → Task hierarchy renders, group-collapse works identically to the By Project view, and an owner with no name in the actuals shows as "TBD".

- [ ] **Step 5: Run the full test suite (regression check)**

```bash
npm test
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add planning.html js/planning.js
git commit -m "feat(planning): port By Owner grouping view to Vue"
```

---

### Task 6: XLS export/upload, AI Sidebar, `js/ai.js:101` translation fix

**Files:**
- Modify: `planning.html` (wraps the mount root so it also covers `#aiPlanSidebar`/`#fileInput`/`#fileStatus`; makes the AI sidebar markup Vue-reactive; adds `exportCurrentView`/`buildStyledExcelExport`/`onFileInputChange`/`sendAiMessage`/`clearAiMessages` methods; adds `aiMessages` to `data()`)
- Modify: `js/ai.js:101` (translate the one hardcoded Italian confirm string to English — no other change in this file)
- Modify: `js/planning.js` (deletes the now-ported `buildStyledExcelExport`)

**Interfaces:**
- Consumes: Task 3/4/5's `byRoleView`/`byProjectView`/`byOwnerView` (each `{ html, exportRows, periodMeta }`); Task 2's `data().view`/`refreshTick`/`methods.bumpRefresh`; global `js/ai.js` functions `buildPlanningContext()`, `updateAiButtonVisibility()` (unchanged); global `js/upload.js` function `readXLS(file, onComplete)` (unchanged); global `appSettings`/`AI_MODELS`/`hasAiKey`/`showConfirm` (`js/core.js`, unchanged); global `ExcelJS` (CDN).
- Produces: `methods.exportCurrentView()` (wired to the toolbar's "⬇ Export XLS" button from Task 2); `data().aiMessages` (replaces the module-level `aiPlanMessages` array from `js/ai.js` — this task keeps `js/ai.js`'s own `aiPlanSend()`/`buildPlanningContext()` unchanged per Global Constraint 2, so `aiMessages` and the still-existing global `aiPlanMessages` are kept in sync by delegating through a thin wrapper, detailed in Step 3).

- [ ] **Step 1: Wrap the mount root to cover the AI sidebar and file input**

The AI sidebar (`#aiPlanSidebar`) and the XLS file input (`#fileInput`/`#fileStatus`) currently sit as siblings *before* `<div class="app-container">` (`planning.html:17-47`), outside the `#portfolioPlanningSection` div the Vue app mounts on (Task 2, Step 4: `app.mount('#portfolioPlanningSection')`). For the sidebar to be Vue-reactive (open/closed state, message list) it must be inside the same mounted app. Wrap all of them in a new `<div id="planningApp">`:

Find (`planning.html:17-50`, current state after Task 2's edits — the file input/status/AI sidebar markup is unchanged from the original since Task 2 only added `ref`/`@change` to `#fileInput`, per Task 2 Step 3):

```html
<!-- Hidden file input for XLS upload -->
<input type="file" id="fileInput" ref="fileInput" accept=".xls,.xlsx" style="display:none" @change="onFileInputChange">
<span id="fileStatus" style="display:none;font-size:var(--text-xs);margin-right:8px"></span>

<!-- AI Planning Sidebar -->
<div id="aiPlanSidebar">
  <div style="padding:12px 16px;border-bottom:1px solid #dee2e6;background:#0B1840;color:white;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
    <span style="font-weight:600;font-size:.95rem">🤖 AI Planning Assistant</span>
    <button id="btnCloseAiSidebar" class="btn-close btn-close-white btn-sm"></button>
  </div>
  <div style="padding:5px 14px;background:#f0f1f3;border-bottom:1px solid #dee2e6;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
    <span id="aiProviderBadge" style="font-size:.78rem;color:#495057;font-weight:500"></span>
    <button onclick="openSettingsModal()" class="btn btn-link btn-sm p-0" style="font-size:.75rem;color:#6c757d;text-decoration:none" title="Configure AI provider">⚙️ Settings</button>
  </div>
  <div id="aiPlanMessages">
    <div style="background:#f0f4ff;border-radius:8px;padding:10px 12px;font-size:.82rem;color:#444;border-left:3px solid #6c757d">
      Hello! I'm your planning assistant. You can ask me, for example:<br>
      • <em>Who is available in the next 2 months?</em><br>
      • <em>How many hours has [name] allocated to [month]?</em><br>
      • <em>Which project has the most remaining hours?</em>
    </div>
  </div>
  <div style="padding:10px 12px;border-top:1px solid #dee2e6;display:flex;gap:8px;align-items:flex-end;flex-shrink:0">
    <textarea id="aiPlanInput" class="form-control form-control-sm" rows="2"
      placeholder="Ask a question about planning..." style="resize:none;font-size:.83rem"></textarea>
    <div class="d-flex flex-column gap-1">
      <button id="btnAiPlanSend" class="btn btn-primary btn-sm" style="white-space:nowrap;min-width:64px">Send</button>
      <button id="btnAiPlanClear" class="btn btn-outline-secondary btn-sm" style="font-size:.72rem">Clear</button>
    </div>
  </div>
</div>

<div class="app-container">
```

Replace with:

```html
<div id="planningApp">

<!-- Hidden file input for XLS upload -->
<input type="file" id="fileInput" ref="fileInput" accept=".xls,.xlsx" style="display:none" @change="onFileInputChange">
<span id="fileStatus" style="display:none;font-size:var(--text-xs);margin-right:8px"></span>

<!-- AI Planning Sidebar -->
<div id="aiPlanSidebar" :class="{ open: aiSidebarOpen }">
  <div style="padding:12px 16px;border-bottom:1px solid #dee2e6;background:#0B1840;color:white;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
    <span style="font-weight:600;font-size:.95rem">🤖 AI Planning Assistant</span>
    <button class="btn-close btn-close-white btn-sm" @click="aiSidebarOpen = false"></button>
  </div>
  <div style="padding:5px 14px;background:#f0f1f3;border-bottom:1px solid #dee2e6;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
    <span style="font-size:.78rem;color:#495057;font-weight:500">{{ aiProviderBadgeText }}</span>
    <button onclick="openSettingsModal()" class="btn btn-link btn-sm p-0" style="font-size:.75rem;color:#6c757d;text-decoration:none" title="Configure AI provider">⚙️ Settings</button>
  </div>
  <div ref="aiMessagesEl">
    <div style="background:#f0f4ff;border-radius:8px;padding:10px 12px;font-size:.82rem;color:#444;border-left:3px solid #6c757d">
      Hello! I'm your planning assistant. You can ask me, for example:<br>
      • <em>Who is available in the next 2 months?</em><br>
      • <em>How many hours has [name] allocated to [month]?</em><br>
      • <em>Which project has the most remaining hours?</em>
    </div>
    <div v-for="(m, i) in aiMessages" :key="i"
      :style="m.role === 'user'
        ? 'align-self:flex-end;max-width:85%;background:#0d6efd;color:white;border-radius:12px 12px 2px 12px;padding:8px 12px;font-size:.85rem'
        : 'align-self:flex-start;max-width:90%;background:#f1f3f5;border-radius:2px 12px 12px 12px;padding:8px 12px;font-size:.85rem;color:#212529'"
      v-html="m.role === 'user' ? esc(m.content) : m.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')">
    </div>
  </div>
  <div style="padding:10px 12px;border-top:1px solid #dee2e6;display:flex;gap:8px;align-items:flex-end;flex-shrink:0">
    <textarea v-model="aiInput" class="form-control form-control-sm" rows="2"
      placeholder="Ask a question about planning..." style="resize:none;font-size:.83rem"
      @keydown.enter.exact.prevent="sendAiMessage"></textarea>
    <div class="d-flex flex-column gap-1">
      <button class="btn btn-primary btn-sm" style="white-space:nowrap;min-width:64px" :disabled="aiSending" @click="sendAiMessage">{{ aiSending ? '…' : 'Send' }}</button>
      <button class="btn btn-outline-secondary btn-sm" style="font-size:.72rem" @click="clearAiMessages">Clear</button>
    </div>
  </div>
</div>

<div class="app-container">
```

Then find the closing `</div><!-- /app-container -->` (`planning.html:120`) and the template's `v-else-if`/`</template>` close from Task 2 — add one more closing `</div>` immediately after `</div><!-- /app-container -->` to close the new `#planningApp` wrapper:

```html
</div><!-- /app-container -->
```
Replace with:
```html
</div><!-- /app-container -->
</div><!-- /planningApp -->
```

Finally, update the mount call (Task 2, Step 4):
```js
  app.mount('#portfolioPlanningSection');
```
Replace with:
```js
  app.mount('#planningApp');
```

- [ ] **Step 2: Add `aiMessages`/`aiInput`/`aiSending` to `data()` and the AI provider badge computed**

In `data()`, add three fields:
```js
        aiMessages: [], aiInput: '', aiSending: false,
```

In `computed`, add (ported verbatim from `js/core.js`'s `updateAiProviderBadge()`, `:226-236` — that function directly writes `#aiProviderBadge.textContent`; this computed produces the same string reactively instead):
```js
      aiProviderBadgeText() {
        const provider = appSettings.aiProvider || 'anthropic';
        const model    = appSettings.aiModel    || '';
        const icons  = { anthropic: '🟣', openai: '🟢', gemini: '🔵' };
        const names  = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Gemini' };
        const models = AI_MODELS[provider] || [];
        const modelLabel = (models.find(m => m.id === model)?.label || model || models[0]?.label || '').replace(/ \(.*\)/, '');
        return `${icons[provider] || '🤖'} ${names[provider] || provider} · ${modelLabel}`;
      },
```

- [ ] **Step 3: Add `sendAiMessage`/`clearAiMessages` — thin wrappers around `js/ai.js`'s unchanged `aiPlanSend()`/`buildPlanningContext()`**

`js/ai.js`'s `aiPlanSend()` (Global Constraint 2: kept unchanged) reads/writes the module-level `aiPlanMessages` array and several DOM ids (`#aiPlanInput`, `#btnAiPlanSend`, `#aiPlanMessages`) directly — none of which exist anymore as classic DOM targets once the sidebar is Vue-templated (Step 1 removed `id="aiPlanInput"`/`id="btnAiPlanSend"`/`id="aiPlanMessages"` in favor of `v-model="aiInput"`/`:disabled="aiSending"`/`ref="aiMessagesEl"`). Rather than rewrite `aiPlanSend()` (out of scope — `js/ai.js`'s internal logic stays untouched per Global Constraint 2, and `portfolio.html`/other future callers are not part of this migration), this task keeps three tiny compatibility shims so `aiPlanSend()` still finds what it expects, while the visible UI stays Vue-owned:

Add to `methods`:
```js
      async sendAiMessage() {
        const msg = this.aiInput.trim();
        if (!msg) return;
        this.aiInput = '';
        // aiPlanSend() (js/ai.js, unchanged) reads document.getElementById('aiPlanInput').value
        // and the module-level aiPlanMessages array directly, and toggles #btnAiPlanSend's
        // disabled/textContent while in flight. Rather than duplicate its provider-dispatch/fetch
        // logic here, this shim feeds it what it expects via the hidden compatibility elements
        // added in Step 4 below, then copies its result back into this.aiMessages once it resolves.
        aiPlanMessages = [...this.aiMessages];
        document.getElementById('aiPlanInput').value = msg;
        this.aiSending = true;
        try {
          await aiPlanSend();
        } finally {
          this.aiMessages = [...aiPlanMessages];
          this.aiSending = false;
          this.$nextTick(() => { const el = this.$refs.aiMessagesEl; if (el) el.scrollTop = el.scrollHeight; });
        }
      },
      clearAiMessages() {
        aiPlanMessages = [];
        this.aiMessages = [];
      },
```

Add three hidden compatibility elements right after the `#planningApp` opening tag from Step 1 (these exist solely so `js/ai.js`'s unmodified `aiPlanSend()`/`renderAiPlanMessages()` can keep calling `document.getElementById(...)` without throwing — they are never shown, and `renderAiPlanMessages()`'s writes to `#aiPlanMessages` land on a detached, invisible node that nothing displays; the real, visible message list is the `v-for` in Step 1's template, fed by `this.aiMessages` in the `finally` block above):

```html
<div id="planningApp">
<div style="display:none">
  <textarea id="aiPlanInput"></textarea>
  <button id="btnAiPlanSend"></button>
  <div id="aiPlanMessages"></div>
</div>
```

- [ ] **Step 4: Translate `js/ai.js:101`'s hardcoded Italian confirm string to English**

Find (`js/ai.js:99-103`):
```js
  if (!apiKey) {
    const names = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Google Gemini' };
    showConfirm(`Nessuna API key configurata per ${names[provider] || provider}.\n\nApri ⚙ Settings → API & Integrations.`, null, null, 'ℹ️ API Key richiesta');
    return;
  }
```
Replace with:
```js
  if (!apiKey) {
    const names = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Google Gemini' };
    showConfirm(`No API key configured for ${names[provider] || provider}.\n\nOpen ⚙ Settings → API & Integrations.`, null, null, 'ℹ️ API Key required');
    return;
  }
```
(per Global Constraint 3 — this is the only line changed in `js/ai.js`; every other Italian string in this file, e.g. `openAiAnalysis()`'s own confirm at `:381`, `renderAiPlanMessages()`'s intro text at `:180-183`, and the reply fallbacks like `'Nessuna risposta ricevuta.'`, is pre-existing text outside this task's scope and is left untouched — they are not reachable via `planning.html`'s own `aiPlanSend()` entry point except `renderAiPlanMessages()`'s intro, which this task's Step 1 already replaced with its own English intro block in the Vue template, so it's moot for this page; `portfolio.html` doesn't call any of these `js/ai.js` functions either, per the design spec's Investigation finding 4).

- [ ] **Step 5: Add `exportCurrentView`/`buildStyledExcelExport`/`onFileInputChange`**

Add to `methods` (ported verbatim from `js/planning.js:867-927`'s `buildStyledExcelExport`, plus a new `exportCurrentView` dispatcher replacing the original's three separate `exportBtn._ppExport` assignments, and `onFileInputChange` replacing `planning.html`'s original inline `fileInput.addEventListener('change', ...)`):

```js
      async onFileInputChange(e) {
        const f = e.target.files[0];
        e.target.value = '';
        if (f) await readXLS(f, () => this.bumpRefresh());
      },
      async exportCurrentView() {
        const rnd = v => Math.round(v * 10) / 10;
        if (this.view === 'byrole') {
          const { exportRows, periodMeta } = this.byRoleView;
          await this.buildStyledExcelExport({ exportRows, periodMeta, nameCount: 1, sheetName: 'Resource Planning', filename: `resource_planning_${new Date().toISOString().slice(0,10)}.xlsx` });
        } else if (this.view === 'byproject') {
          const { exportRows, periodMeta } = this.byProjectView;
          await this.buildStyledExcelExport({ exportRows, periodMeta, nameCount: 4, sheetName: 'Planning By Project', filename: 'planning_by_project.xlsx' });
        } else {
          const { exportRows, periodMeta } = this.byOwnerView;
          await this.buildStyledExcelExport({ exportRows, periodMeta, nameCount: 3, sheetName: 'Planning By Owner', filename: 'planning_by_owner.xlsx' });
        }
      },
      // exportRows: [{ v: [...values], level: 'header'|'project'|'task'|'role'|'owner'|'total' }]
      // periodMeta: [{ isPast, isCurrent }] — one entry per period column (after name + 3 metric cols)
      async buildStyledExcelExport({ exportRows, periodMeta, nameCount, sheetName, filename }) {
        const metricCount = 3;
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet(sheetName);

        const lvlFill = {
          header:  { name: 'FFD8DFF7', metric: 'FFE0E1E3' },
          project: { name: 'FFC5CEF7', metric: 'FFD8D9DB' },
          task:    { name: 'FFE8ECFF', metric: 'FFE0E1E3' },
          role:    { name: 'FFFFFFFF', metric: 'FFF0F1F2' },
          owner:   { name: 'FFFAFAFA', metric: 'FFF5F6F7' },
          total:   { name: 'FFEEF1FF', metric: 'FFC8CACC' },
        };
        const periodFill = (pm, isHeader) => {
          if (isHeader) return pm.isCurrent ? 'FF4DABF7' : pm.isPast ? 'FFDDE0E3' : 'FFE8EAFF';
          return pm.isCurrent ? 'FFC8E6FF' : pm.isPast ? 'FFD6D9DC' : 'FFF0F2FF';
        };

        exportRows.forEach(({ v: values, level }) => {
          const wsRow = ws.addRow(values);
          const lc    = lvlFill[level] || lvlFill.role;
          const isBold = ['header', 'project', 'task', 'total'].includes(level);
          wsRow.eachCell({ includeEmpty: true }, (cell, colIdx) => {
            let fgColor, fontColor = 'FF000000';
            if (colIdx <= nameCount) {
              fgColor = lc.name;
            } else if (colIdx <= nameCount + metricCount) {
              fgColor = lc.metric;
            } else {
              const pm = periodMeta[colIdx - nameCount - metricCount - 1];
              if (pm) {
                fgColor = periodFill(pm, level === 'header');
                if (level === 'header' && pm.isCurrent) fontColor = 'FFFFFFFF';
              }
            }
            if (fgColor) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fgColor } };
            cell.font = { name: 'Calibri', size: 9, bold: isBold, color: { argb: fontColor } };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFBFC4CA' } }, left: { style: 'thin', color: { argb: 'FFBFC4CA' } },
              bottom: { style: 'thin', color: { argb: 'FFBFC4CA' } }, right: { style: 'thin', color: { argb: 'FFBFC4CA' } },
            };
            cell.alignment = { vertical: 'middle', horizontal: colIdx <= nameCount ? 'left' : 'center' };
          });
          wsRow.height = 15;
        });

        ws.columns = [
          ...Array(nameCount).fill(null).map(() => ({ width: 28 })),
          ...Array(metricCount).fill(null).map(() => ({ width: 12 })),
          ...periodMeta.map(() => ({ width: 11 })),
        ];
        ws.views = [{ state: 'frozen', xSplit: nameCount + metricCount, ySplit: 1 }];

        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
```

Update the toolbar's export button (added in Task 2, Step 2) — it already reads `@click="exportCurrentView"`, so no further template change is needed here.

- [ ] **Step 6: Delete the now-ported function from `js/planning.js`**

Delete `buildStyledExcelExport` in its entirety from `js/planning.js` (search for `function buildStyledExcelExport` — its exact line range has shifted after Tasks 3-5's deletions). After this step, `js/planning.js` contains only the confirmed-dead `buildPlanningBarCells`/`renderPlanningView`/`renderPlanningByTask`/`renderPlanningByRole`/`showPlanningView`/`buildWeekAllocationTable` (per this plan's header correction) — the entire file is deleted in Task 7.

- [ ] **Step 7: Manually verify**

1. Click "⬇ Export XLS" on each of the three grouping views — confirm a correctly-named, correctly-colored `.xlsx` downloads each time (Resource Planning / Planning By Project / Planning By Owner sheet names, past/current/future period coloring visible in Excel).
2. Click "📂 Load XLS", pick a valid timesheet file — confirm the upload status text appears next to the button, and the active grouping view's data refreshes once the upload completes.
3. Click "🤖 AI Chat" — confirm the sidebar slides open, showing the intro message and the provider badge. With no AI key configured (`⚙ Settings → API & Integrations` empty), send a message — confirm the "No API key configured for ..." confirm dialog now appears **in English** (Step 4's fix). With a real key configured, send a question — confirm the assistant's reply appears in the message list, Enter sends (Shift+Enter does not), and "Clear" empties the conversation.

- [ ] **Step 8: Add cache-busting to `js/ai.js`'s `<script>` tag on every page that loads it**

`js/ai.js` has never carried a `?v=` query param on either page that loads it — this task is the first to modify the file, so Global Constraint 6 requires introducing one now. In `planning.html`, find:
```html
<script src="js/ai.js"></script>
```
Replace with:
```html
<script src="js/ai.js?v=1"></script>
```
In `portfolio.html`, find the same line (`:488`) and apply the identical change (`portfolio.html` also loads this file, unmodified by this migration otherwise, per Global Constraint 2 — the version bump must still apply there so it doesn't serve a stale cached copy missing Step 4's translated string).

- [ ] **Step 9: Run the full test suite (regression check)**

```bash
npm test
```
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add planning.html portfolio.html js/ai.js js/planning.js
git commit -m "feat(planning): port XLS export/upload and AI Sidebar to Vue; translate js/ai.js:101 to English"
```

---

### Task 7: Delete `js/planning.js`; confirm dead-weight script removal

**Files:**
- Delete: `js/planning.js` (everything remaining in it after Tasks 1/3/4/5/6's deletions is confirmed dead code — see Step 1)
- Modify: `planning.html` (removes `js/planning.js`'s `<script>` tag)

**Interfaces:**
- Consumes: nothing new — this task is pure cleanup once Tasks 1-6 have ported every live piece of `js/planning.js`'s functionality.
- Produces: nothing new.

- [ ] **Step 1: Confirm nothing live remains in `js/planning.js`**

```bash
grep -n "^function" js/planning.js
```
Expected output: only `buildPlanningBarCells`, `renderPlanningView`, `renderPlanningByTask`, `renderPlanningByRole`, `showPlanningView`, `buildWeekAllocationTable` — all confirmed dead code per this plan's header "Correction to the design spec's assumed scope" (unreachable from any entry point in `planning.html`, `#planningGanttContainer`/`#planningProjectName`/`#planningViewToggle` don't exist in the page). If any other function name appears, STOP — it means an earlier task's deletion step was skipped; go back and port/delete it properly before proceeding.

- [ ] **Step 2: Confirm no other file references any of these six function names**

```bash
grep -rn "renderPlanningView\|renderPlanningByTask\|renderPlanningByRole\|buildPlanningBarCells\|buildWeekAllocationTable\|showPlanningView" --include=*.html --include=*.js .
```
Expected: matches only inside `js/planning.js` itself and the legacy, unloaded `app.js` (not referenced by any current `<script>` tag) — confirming these six functions are safe to delete along with the rest of the file.

- [ ] **Step 3: Delete the file**

```bash
rm js/planning.js
```

- [ ] **Step 4: Remove its `<script>` tag from `planning.html`**

Find:
```html
<script src="js/planning.js"></script>
```
Delete this line entirely.

- [ ] **Step 5: Grep-confirm no other page loads it**

```bash
grep -rn "js/planning.js" *.html
```
Expected: no matches (this was already confirmed exclusive to `planning.html` per the design spec's Investigation finding 2 — this is a final belt-and-suspenders check before the file is gone for good).

- [ ] **Step 6: Run the full test suite**

```bash
npm test
```
Expected: PASS.

- [ ] **Step 7: Manual full-page smoke test**

Open `planning.html` fresh (hard-refresh to bypass any stale cache) and re-run through every feature once more end-to-end: filters, view/interval toggles, window navigator, Monthly Pulse/Rounded toggles, all three grouping views, `?projectId=` entry (open `planning.html?projectId=<a-real-project-id>` directly and confirm the title shows the project name and only that project's rows appear), XLS export/upload, AI sidebar. Confirm zero console errors.

Also smoke-test the two pages this cycle's shared-file changes could affect, per this plan's Global Constraint 2 and the design spec's backward-compatibility requirement:
- `portfolio.html`: click "🤖 AI Analysis" on a project's dashboard — confirm it still works (uses `js/ai.js`'s `openAiAnalysis()`, untouched except Task 6's cache-bust bump).
- `costgrid.html`/`pipeline.html`: confirm both still load and function normally — neither loads `js/planning.js`/`js/lib/planning-calc.js`, and `js/roles.js`/`js/clients.js`/`js/programs.js` (still loaded by `costgrid.html`) are unmodified by this cycle.

- [ ] **Step 8: Commit**

```bash
git add -A js/planning.js planning.html
git commit -m "chore(planning): delete js/planning.js — fully folded into planning.html's Vue instance"
```

---

### Task 8: Empirical mount verification (mandatory, per Global Constraint 8)

**Files:** None — verification only, using a throwaway Node script (not committed; delete before the final whole-branch review).

**Interfaces:**
- Consumes: the fully-assembled `planning.html` from Tasks 1-7.
- Produces: a pass/fail verdict gating the final whole-branch review — no code artifact.

- [ ] **Step 1: Install throwaway test dependencies**

```bash
npm install --no-save vue@3 jsdom
```

- [ ] **Step 2: Write the mount-test script**

Create a temporary file `scratch_planning_mount_test.js` in the repo root — **do not commit it**:

```js
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  runScripts: 'outside-only',
  url: 'http://localhost/planning.html',
});
const { window } = dom;
global.window = window; global.document = window.document; global.navigator = window.navigator;
global.localStorage = { getItem: () => null, setItem: () => {} };
window.localStorage = global.localStorage;

const vueSrc = fs.readFileSync(require.resolve('vue/dist/vue.global.prod.js'), 'utf8');
window.eval(vueSrc);
window.eval(fs.readFileSync('js/core.js', 'utf8'));
// js/lib/planning-calc.js is an ES module (`<script type="module">` on the real page — excluded
// below by the `:not([type="module"])` selector, since jsdom's runScripts:'outside-only' mode
// doesn't execute module scripts at all). Its `export function ...` + trailing `window.x = x`
// bridge lines mean the only change needed to run it as a plain classic script is stripping the
// `export ` keyword — this eval's the REAL Task 1 implementation, not a hand-rolled stub, so
// getCalendarWeeks/workingDaysInWeek/getPlanningPeriods/countFutureTaskWeeks/matchesTaskRole/
// computeResidual/distributeFutureResidual all behave exactly as they do in production.
window.eval(fs.readFileSync('js/lib/planning-calc.js', 'utf8').replace(/^export /gm, ''));

// Realistic data: two eligible projects (Committed + Expected), each with a task overlapping
// the default window (current month + 3 future months), sold/consumed hours split across two
// roles, one owner present in actuals and one task-role with NO owner at all (exercises the
// "no owner" TBD path in By Project/By Owner), and a low-residual task (<1h/week) to exercise
// the Monthly Pulse aggregation branch in distributeFutureResidual. A third, Canceled project
// is included to verify it's excluded from every view.
const now = new Date();
const ym = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}01`;
const pastDate = new Date(now.getFullYear(), now.getMonth(), 1);

const seedProjects = [
  {
    id: 'p1', name: 'Acme Renewal', clientId: 'c1', pipeline: 'Committed', status: 'Started',
    startDate: ym(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    endDate:   ym(new Date(now.getFullYear(), now.getMonth() + 3, 1)),
    tasks: [
      {
        name: 'Build', completed: false, billable: true,
        startDate: ym(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        endDate:   ym(new Date(now.getFullYear(), now.getMonth() + 3, 1)),
        resources: [
          { role: 'Backend - Developer', soldHours: 400 },
          { role: 'Design - UX', soldHours: 20 }, // small residual -> exercises Monthly Pulse
        ],
      },
    ],
  },
  {
    id: 'p2', name: 'Beta Discovery', clientId: 'c2', pipeline: 'Expected', status: 'Not started yet',
    startDate: ym(new Date(now.getFullYear(), now.getMonth(), 1)),
    endDate:   ym(new Date(now.getFullYear(), now.getMonth() + 2, 1)),
    tasks: [
      {
        name: 'Discovery', completed: false, billable: true,
        startDate: ym(new Date(now.getFullYear(), now.getMonth(), 1)),
        endDate:   ym(new Date(now.getFullYear(), now.getMonth() + 2, 1)),
        resources: [{ role: 'Backend - Developer', soldHours: 80 }], // no owner in actuals -> TBD path
      },
    ],
  },
  { id: 'p3', name: 'Cancelled Co', pipeline: 'Canceled', status: 'Not started yet', tasks: [] },
];
const seedTimesheetData = [
  { projectId: 'p1', task: 'Build', role: 'Backend - Developer', owner: 'Alice', hours: 40, date: pastDate },
];

// `config`/`timesheetData` are declared with `let` at the top level of js/core.js (already
// window.eval'd above). A top-level `let`/`const` from one window.eval call lives in the
// realm's shared global lexical environment, which every subsequent window.eval call in the
// same realm can read AND write by bare name — but simply assigning `window.config = {...}`
// from outside that realm would create a same-named property on the window OBJECT instead,
// which is a *different* binding from the lexical `config` the app's own code (and every
// global function in core.js) actually resolves when it reads the bare identifier `config`.
// So the seed data is injected via a window.eval'd statement that mutates the real lexical
// bindings in place, not via an external property assignment.
//
// timesheetData itself is NOT set directly, on purpose: planning.html's own init script (evaluated
// below, unmodified from Task 2) calls the real refreshTimesheetData() (js/core.js), which
// unconditionally rebuilds `timesheetData = []` from the `_timesheetProjectData` Map before the
// Vue app mounts — a direct `timesheetData = [...]` assignment here would be silently wiped out
// by that call. Seeding through the real saveProjectData(pid, rows) (js/core.js), which populates
// that same Map, is what refreshTimesheetData() is designed to read from, so this reproduces the
// real production data path instead of racing it.
window.__seedProjects = seedProjects;
window.__seedTimesheetData = seedTimesheetData;
window.eval(`
  config.projects = window.__seedProjects;
  saveProjectData('p1', window.__seedTimesheetData.map(r => ({ ...r, date: new Date(r.date) })));
`);

// Stub the page globals this Vue app calls but does not itself define, matching this plan's
// "kept unchanged, called as global" set (Global Constraint 2) plus js/core.js functions that
// depend on real project data already seeded above (getPpAxis, rolePassesTeamFilter — left as
// the REAL js/core.js implementations, since core.js was window.eval'd above and both are pure
// given the seeded config/portfolioTeamFilters).
Object.assign(window, {
  getMonthRangeFromCfg: cfg => {
    if (!cfg?.startDate || !cfg?.endDate) return [];
    const sy = parseInt(cfg.startDate.slice(0,4)), sm = parseInt(cfg.startDate.slice(4,6));
    const ey = parseInt(cfg.endDate.slice(0,4)),   em = parseInt(cfg.endDate.slice(4,6));
    const months = []; let cy = sy, cm = sm;
    while (cy < ey || (cy === ey && cm <= em)) { months.push(`${cy}${String(cm).padStart(2,'0')}`); cm++; if (cm > 12) { cm = 1; cy++; } }
    return months;
  },
  fmtProjectTitle: cfg => cfg.name || cfg.id,
  getClientName: () => 'Test Client',
  loadClientsFromApi: async () => {}, loadProgramsFromApi: async () => {}, loadRolesFromApi: async () => {},
  loadConfigFromApi: async () => {}, refreshTimesheetDataFromApi: async () => {}, loadPipelineBudgetsFromApi: async () => {},
  initNav: async () => ({ id: 'u1', role: 'admin' }),
  readXLS: async () => {}, aiPlanSend: async () => {}, updateAiButtonVisibility: () => {},
  openSettingsModal: () => {},
  ExcelJS: { Workbook: function () { this.addWorksheet = () => ({ addRow: () => ({ eachCell: () => {} }), columns: [], views: [] }); this.xlsx = { writeBuffer: async () => new Uint8Array() }; } },
});
function StubTooltip() {}
StubTooltip.getInstance = () => null;
window.bootstrap = { Tooltip: StubTooltip, Modal: { getInstance: () => null, getOrCreateInstance: () => ({ show(){}, hide(){} }) } };

const html = fs.readFileSync('planning.html', 'utf8');
document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];

const scripts = [...document.querySelectorAll('script:not([type="module"]):not([src])')];
let errors = [];
scripts.forEach(s => {
  try { window.eval(s.textContent); } catch (e) { errors.push(e); }
});

// Declared at module (top) scope, not inside the setTimeout below, because Step 4 appends a
// second, later setTimeout that also needs to read `section` — a callback-local `const` would
// go out of scope between the two.
const section = document.getElementById('planningApp');

setTimeout(async () => {
  console.log('Inline script eval errors:', errors.map(e => e.stack));
  console.log('MOUNT RESULT length:', section ? section.innerHTML.length : 'NOT FOUND');
  console.log('Contains "Acme Renewal"?', section?.innerHTML.includes('Acme Renewal'));
  console.log('Contains "Beta Discovery"?', section?.innerHTML.includes('Beta Discovery'));
  console.log('Contains "Cancelled Co"?  (expect false — Canceled must be excluded)', section?.innerHTML.includes('Cancelled Co'));
  console.log('Contains "Backend - Developer" role?', section?.innerHTML.includes('Backend - Developer'));
}, 300);
```

- [ ] **Step 3: Run it and interpret the result**

```bash
node scratch_planning_mount_test.js
```

Expected: `Inline script eval errors: []`, `MOUNT RESULT length` > 0, `Contains "Acme Renewal"?` → `true`, `Contains "Beta Discovery"?` → `true`, `Contains "Cancelled Co"?` → `false`, `Contains "Backend - Developer" role?` → `true` (the default view is By Role — this confirms the role column renders). If any error appears, it names the exact bare-global or reactivity gap to fix — fix in the task that introduced the gap (do not add a new task for it), then re-run this script until clean.

- [ ] **Step 4: Exercise the By Project and By Owner views, and the `?projectId=` single-project entry, via the mounted app instance**

Since this script parses raw HTML and re-evaluates the inline `<script>` tags (rather than calling `Vue.createApp(opts).mount(...)` directly and keeping the returned instance), the cleanest way to reach the mounted app for interaction-simulation is to temporarily add, in `planning.html`'s own inline script for the duration of this manual verification only (revert before Step 6's cleanup — **do not commit this line**):

Find (Task 6, Step 1's mount call):
```js
  app.mount('#planningApp');
```
Temporarily change to:
```js
  window.__PP_TEST_APP__ = app.mount('#planningApp');
```

Then extend the script's `setTimeout` block:
```js
setTimeout(async () => {
  await window.__PP_TEST_APP__.$nextTick();
  window.__PP_TEST_APP__.view = 'byproject';
  await window.__PP_TEST_APP__.$nextTick();
  console.log('By Project — contains "Discovery" task?', section.innerHTML.includes('Discovery'));
  console.log('By Project — contains "no owner" badge (Beta Discovery has none)?', section.innerHTML.includes('no owner'));

  window.__PP_TEST_APP__.view = 'byowner';
  await window.__PP_TEST_APP__.$nextTick();
  console.log('By Owner — contains "Alice"?', section.innerHTML.includes('Alice'));
  console.log('By Owner — contains "TBD" (Beta Discovery has no owner in actuals)?', section.innerHTML.includes('TBD'));

  window.__PP_TEST_APP__.view = 'byrole';
  window.__PP_TEST_APP__.interval = 'weekly';
  await window.__PP_TEST_APP__.$nextTick();
  console.log('Weekly interval — table still renders?', section.innerHTML.includes('gantt-table'));

  console.log('Monthly Pulse low-residual role (Design - UX, 20h sold) shows "~" aggregate marker?', section.innerHTML.includes('monthly aggregate') || section.innerHTML.includes('~'));
}, 600);
```

Run again: `node scratch_planning_mount_test.js`. Expected: every logged assertion → `true`.

To verify the `?projectId=` entry separately, change the `JSDOM(...)` constructor's `url` option to `'http://localhost/planning.html?projectId=p1'`, re-run, and confirm the logged `MOUNT RESULT length` output additionally satisfies: `section.innerHTML.includes('Acme Renewal')` → `true` (title shows the project name) and `section.innerHTML.includes('Beta Discovery')` → `false` (the other project is filtered out).

- [ ] **Step 5: Revert the temporary `window.__PP_TEST_APP__` capture line**

```bash
git diff --stat planning.html
```
Expected: no diff (Step 4's temporary capture line must be reverted — it was for local interaction-testing only, never committed).

- [ ] **Step 6: Delete the scratch script**

```bash
rm -f scratch_planning_mount_test.js
git status --short
```
Expected: clean (nothing to commit from this task — it produced no permanent artifact).

---

## Self-Review Notes

**Spec coverage:** every section of the design doc's Components list maps to a task, with one confirmed correction — the design's "Task A" (filters/toggles/window navigator/page shell) → this plan's Task 2, which also absorbs the design's assumed "Task E" (single-project Gantt view), since source-reading before writing any task revealed that view is dead code (see the plan header's "Correction to the design spec's assumed scope"); the real `?projectId=` behavior is a 3-line special case of filter state, folded into Task 2. Design's "Task B" (By Role) → Task 3, "Task C" (By Project) → Task 4, "Task D" (By Owner) → Task 5, "Task F" (XLS export/upload + AI Sidebar + `js/ai.js:101` fix) → Task 6, "Task G" (`js/lib/planning-calc.js` extraction) → this plan's Task 1 (reordered first, per the task-ordering instruction, since Tasks 3-5 depend on its exports). The design's explicit Data flow/Error handling/Backward-compatibility sections are covered: no API contract change; the loading-spinner/explicit-error-message pattern from `pipeline.html`/`costgrid.html` is replicated in Task 2, Step 2 (`v-if="loading"` / `v-else-if="loadError"`); the `portfolio.html`/`costgrid.html`/`pipeline.html` cross-page smoke checks are called out explicitly in Task 7, Step 7 (matching the brief's Acceptance Criteria, which lists this as a manual check, not an automated one). The Brief's Acceptance Criteria checklist is covered item-by-item: no remaining `innerHTML`-based imperative rendering (Tasks 2-6 replace every DOM-write with Vue reactivity — the one exception, `v-html`-bound computed strings for the three grouping tables, is a deliberate, documented architectural choice, not leftover imperative code); all three grouping views behave identically (Tasks 3-5, ported verbatim); `?projectId=` entry (Task 2's `created()`); XLS export/upload (Task 6); AI Sidebar open/close/send/clear/Enter-to-send (Task 6); `js/config-form.js`/`js/costgrid.js` `<script>` tag removal (Task 2, Step 1); shared-file backward compatibility (Global Constraint 2, exercised in Task 7's Step 7 smoke test); `npm test` passes (every task's own regression-check step, plus Task 1's TDD steps).

**Placeholder scan:** no `TBD`/`TODO`/"add appropriate error handling"/"similar to Task N" language found (grep-verified). The one legitimate appearance of the literal string "TBD" (in Tasks 4/5/8) is real, pre-existing business-domain text — the owner-placeholder label shown when a task-role has no owner in the actuals — not a plan placeholder. Forward references are used deliberately and are each explicitly flagged at the point they're introduced, with the exact task number where the implementation lands: Task 2's toolbar template calls `exportCurrentView`/`onFileInputChange` before Task 6 implements them; Task 3's `computed.activeViewHtml` has a `byproject`/`byowner`-branch stub explicitly commented as "added in Tasks 4-5" before those tasks complete it, mirroring the exact pattern the `costgrid.html` plan used for its own `openNewVersionModal`/`openCloneModal` forward references.

**Type/signature consistency:** `byRoleView`/`byProjectView`/`byOwnerView` (Tasks 3/4/5) all return the identically-shaped `{ html, exportRows, periodMeta }`, verified by grep against every consumer — `activeViewHtml`'s three-way branch (Tasks 3/4/5) and `exportCurrentView`'s three-way dispatch (Task 6) both destructure the same three fields with the same names. `getCalendarWeeks`/`workingDaysInWeek`/`getPlanningPeriods`/`countFutureTaskWeeks` (Task 1) are called with the same argument order and count everywhere they're consumed (Tasks 3-5's `weeks`/`byXView` computeds). `data().windowStart`/`windowEnd`/`monthlyPulse`/`roundHours`/`interval`/`view`/`pipelineFilters`/`projectFilters`/`teamFilters`/`aiMessages`/`aiInput`/`aiSending`/`aiSidebarOpen`/`refreshTick` are declared once in Task 2 (plus `aiMessages`/`aiInput`/`aiSending` added in Task 6) and read/written with consistent names through every later task — checked directly against the source, not just against each task's own prose.

**Three real bugs found and fixed during this self-review pass (not left for Task 8 to discover):**
1. **Mount target mismatch.** The Goal/Architecture section originally described `Vue.createApp({...}).mount('#portfolioPlanningSection')`, matching Task 2's own initial mount call — but Task 6 (AI Sidebar) necessarily changes the mount root to a new wrapping `#planningApp` div, since the AI sidebar and XLS file input sit outside `#portfolioPlanningSection` in the original markup and must be inside the same mounted app to be Vue-reactive. Task 6 already updated the mount call correctly via its own Find/Replace step; the Architecture prose and File Structure section had not been updated to match. Fixed by rewriting the Architecture paragraph to describe the `#planningApp` wrapper explicitly.
2. **`let`-shadowing bug in the Task 8 mount-test script.** The initial draft seeded test data via `global.config = {...}; window.config = global.config;` — but `js/core.js` declares `config`/`timesheetData` with top-level `let`, so a later `window.config = ...` property assignment creates a *different* binding than the one bare `config` references resolve to inside the app's own eval'd code; the seeded data would silently never be visible to the mounted app (every grouping view would render its "no data" empty state, and the mount test's assertions would all fail in a way that looks like a real app bug rather than a test-harness bug). Fixed by injecting the seed data through a `window.eval()`'d statement that mutates the real lexical bindings in place. A related second issue in the same script: `refreshTimesheetData()` (called by `planning.html`'s own unmodified init script, which the test re-evaluates) unconditionally rebuilds `timesheetData` from the `_timesheetProjectData` Map — a direct `timesheetData = [...]` seed would have been silently wiped out by that call moments later. Fixed by seeding through the real `saveProjectData()` helper instead, which populates the Map `refreshTimesheetData()` actually reads from — this also means the mount test now exercises the real production data-loading path, not a shortcut around it.
3. **`bootstrap.Tooltip.getInstance` stub targeted the wrong object.** The initial draft wrote `Object.assign(Object.getPrototypeOf(window.bootstrap.Tooltip), { getInstance: ... })`, which patches `Tooltip.prototype`, not the static `Tooltip.getInstance` method `initTooltipsAndToggles()` (Task 3) actually calls (`bootstrap.Tooltip.getInstance(el)`). Fixed by assigning `getInstance` directly onto the `Tooltip` stub function itself.

**Known, accepted trade-off (not a bug, documented for the reviewer):** every grouping view's table body is a `computed` returning a large pre-built HTML string, bound via `v-html` on a single `ref`-ed container. This is the plan's central architectural choice (see the Architecture section) — an explicit, deliberate divergence from "everything is `v-for`/`v-bind`," justified by the sheer density of inline-styled, sticky-positioned, rowspan/colspan table markup these three views produce, which would otherwise require thousands of individually-bound template expressions with no behavioral benefit over the original string-building approach. The trade-off: Vue's reactivity system cannot diff individual cells within a `v-html` block, so every state change that affects a grouping view (filter toggle, window navigation, pulse/rounding toggle) triggers a full string rebuild and full innerHTML replacement of that view's table — functionally identical to the original's `container.innerHTML = ...` re-render on every state change, so this is not a performance regression relative to today's behavior, just not an improvement either. A future cycle could decompose one grouping view into real Vue components with fine-grained reactivity, but that is explicitly out of scope here (not listed in the Brief's or design's scope, and would risk introducing new bugs in logic that today is a faithful, verified port).

**Line-number staleness (documented, not fixed as a "bug" — inherent to any multi-task plan touching the same file repeatedly):** Tasks 3-7's function-deletion steps in `js/planning.js` each note that exact line ranges shift after every prior task's deletions, and instruct locating the target function by its `function` signature via `grep`/search rather than trusting a stale line number — the same mitigation the `costgrid.html` plan used for its own equivalent cleanup task. Every task's own "add this code" steps show the full code being added or the exact surrounding text being found-and-replaced (not a bare line number), which is inherently robust to this same drift.
