# Planning Matching + Residual Discrepancy Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two related defects in `js/planning.js`'s three resource-planning views (by-role, by-project, by-owner): (1) each view reimplements task+role matching differently — by-role/by-project crash on a task with no name, by-owner is case-sensitive on both role and task; and (2) the "To be planned" column can silently exceed `Sold − Actuals` at an aggregate row due to a per-task residual floor, with no user-visible explanation.

**Architecture:** Extract two pure functions (`matchesTaskRole`, `computeResidual`) into a new `js/lib/planning-calc.js` module, following the same ES-module + `window`-bridge + vitest-test pattern already established by `js/lib/cfg-parse.js`. Wire the shared functions into all three render functions in `js/planning.js`, replacing their divergent inline logic. Add a static `title` tooltip to each view's "To be planned" column header explaining the accepted floor-related discrepancy — no calculation changes for Finding 2, only for the matching logic (Finding 3).

**Tech Stack:** Vanilla JS (frontend). `vitest` for the new pure-function characterization tests (new file, following the `js/lib/cfg-parse.test.js` convention).

## Global Constraints

- `matchesTaskRole(record, taskName, role)` is null-safe on `record.task`, `record.role`, and `taskName` (a missing/falsy `taskName` matches on role alone; never throws) and case-insensitive on both role and task name comparison.
- `computeResidual(soldH, consumedH)` is `Math.max(0, soldH - consumedH)`, extracted verbatim from the three existing inline expressions — no formula change.
- No change to the per-task residual floor itself, and no change to any future-week distribution logic (`monthlyDistribution`, even-split, Monthly Pulse) in any of the three views — that logic belongs to Findings 4/5 (Ciclo 3), explicitly out of scope.
- No modification to `api/src/routes/timesheets.js` (closed in Ciclo 1).
- No broader redesign of the three render functions beyond swapping in the two shared functions and adding the tooltip — the pre-existing duplication of the by-role/by-project filter (computed twice per view, once for the aggregate `consumedH` and once inside the `pastWeeks.forEach` loop) is left untouched, not further DRY'd.
- Tooltip text (identical in all three views): `"To be planned can exceed Sold − Actuals when a role has multiple tasks and one is over-consumed — hours over budget on one task aren't subtracted from another task's remaining budget."`

---

### Task 1: `matchesTaskRole` + `computeResidual` — characterization tests then implementation

**Files:**
- Create: `js/lib/planning-calc.js`
- Create: `js/lib/planning-calc.test.js`

**Interfaces:**
- Produces: `matchesTaskRole(record, taskName, role) => boolean` and `computeResidual(soldH, consumedH) => number`, exported from `js/lib/planning-calc.js` and bridged to `window.matchesTaskRole`/`window.computeResidual`. Consumed by Task 2 (wiring into `js/planning.js`'s three render functions).

- [ ] **Step 1: Write the failing characterization tests**

Create `js/lib/planning-calc.test.js`:

```js
import { describe, it, expect, test } from 'vitest';
import { matchesTaskRole, computeResidual } from './planning-calc.js';

describe('matchesTaskRole', () => {
  it('matches identical role and task name', () => {
    expect(matchesTaskRole({ role: 'Developer', task: 'Build API' }, 'Build API', 'Developer')).toBe(true);
  });
  it('is case-insensitive on role', () => {
    expect(matchesTaskRole({ role: 'developer', task: 'Build API' }, 'Build API', 'Developer')).toBe(true);
  });
  it('is case-insensitive on task name', () => {
    expect(matchesTaskRole({ role: 'Developer', task: 'build api' }, 'Build API', 'Developer')).toBe(true);
  });
  it('does not crash when taskName is missing, matches on role alone', () => {
    expect(matchesTaskRole({ role: 'Developer', task: 'Build API' }, undefined, 'Developer')).toBe(true);
  });
  it('does not crash when record.task is missing', () => {
    expect(matchesTaskRole({ role: 'Developer', task: undefined }, 'Build API', 'Developer')).toBe(false);
  });
  it('does not crash when record.role is missing', () => {
    expect(matchesTaskRole({ role: undefined, task: 'Build API' }, 'Build API', 'Developer')).toBe(false);
  });
  it('rejects a different role even with matching task', () => {
    expect(matchesTaskRole({ role: 'QA', task: 'Build API' }, 'Build API', 'Developer')).toBe(false);
  });
  it('rejects a different task name when taskName is provided', () => {
    expect(matchesTaskRole({ role: 'Developer', task: 'Write docs' }, 'Build API', 'Developer')).toBe(false);
  });
});

describe('computeResidual', () => {
  it('returns sold minus consumed when positive', () => {
    expect(computeResidual(100, 40)).toBe(60);
  });
  it('floors at zero when consumed exceeds sold (over-consumed task)', () => {
    expect(computeResidual(20, 30)).toBe(0);
  });
  it('returns zero when sold and consumed are equal', () => {
    expect(computeResidual(50, 50)).toBe(0);
  });
});

test('per-task floor can make aggregate To-be-planned exceed aggregate Sold-Actuals (accepted, documented behavior)', () => {
  // Role with 2 tasks: one under-consumed, one over-consumed — mirrors the
  // HWGDEV-DEVELOPER case from the audit (Sold 1236h, Actuals 44h, but
  // "To be planned" showed 1204h instead of 1192h).
  const taskA = { sold: 100, consumed: 40 };  // residual 60
  const taskB = { sold: 20,  consumed: 30 };  // over-consumed, residual floors to 0
  const aggregateTbp = computeResidual(taskA.sold, taskA.consumed) + computeResidual(taskB.sold, taskB.consumed);
  const aggregateSoldMinusActuals = (taskA.sold + taskB.sold) - (taskA.consumed + taskB.consumed);
  expect(aggregateTbp).toBe(60);
  expect(aggregateSoldMinusActuals).toBe(50);
  expect(aggregateTbp).toBeGreaterThan(aggregateSoldMinusActuals);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: `planning-calc.test.js` FAILS with an error like "Failed to resolve import ./planning-calc.js" (the module doesn't exist yet). The pre-existing `js/lib/cfg-parse.test.js` tests still pass.

- [ ] **Step 3: Implement `planning-calc.js`**

Create `js/lib/planning-calc.js`:

```js
export function matchesTaskRole(record, taskName, role) {
  const roleMatches = (record.role || '').toLowerCase() === (role || '').toLowerCase();
  const taskMatches = !taskName || (record.task || '').toLowerCase() === taskName.toLowerCase();
  return roleMatches && taskMatches;
}

export function computeResidual(soldH, consumedH) {
  return Math.max(0, soldH - consumedH);
}

window.matchesTaskRole = matchesTaskRole;
window.computeResidual = computeResidual;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests PASS — the pre-existing `js/lib/cfg-parse.test.js` suite plus the new `js/lib/planning-calc.test.js` suite (13 tests: 8 `matchesTaskRole` + 3 `computeResidual` + 1 aggregate-discrepancy test), with no change to any pre-existing test.

- [ ] **Step 5: Commit**

```bash
git add js/lib/planning-calc.js js/lib/planning-calc.test.js
git commit -m "feat(planning-calc): add matchesTaskRole and computeResidual shared helpers"
```

---

### Task 2: Wire `matchesTaskRole`/`computeResidual` into all three planning views

**Files:**
- Modify: `js/planning.js:614-616` (by-role, `consumedH` filter)
- Modify: `js/planning.js:619` (by-role, `residualH` calc)
- Modify: `js/planning.js:627-629` (by-role, `pastWeeks.forEach` `actualH` filter)
- Modify: `js/planning.js:1051-1054` (by-project, `taskRoleRecs` filter)
- Modify: `js/planning.js:1056` (by-project, `residualH` calc)
- Modify: `js/planning.js:1346` (by-owner, `roleRecs` filter)
- Modify: `js/planning.js:1366` (by-owner, `roleTbp` calc)
- Modify: `planning.html` (add script tag for `js/lib/planning-calc.js`)

**Interfaces:**
- Consumes: `matchesTaskRole(record, taskName, role)` and `computeResidual(soldH, consumedH)` from Task 1, via the `window.matchesTaskRole`/`window.computeResidual` bridge (`js/planning.js` is a classic, non-module script, per `CLAUDE.md`'s "Script loading order" section — `planning-calc.js` is loaded as a `type="module"` script that always executes before `DOMContentLoaded`, and all three render functions in `js/planning.js` are only invoked from event handlers/functions called after page load, so the bridged globals are always available).
- Produces: nothing new for later tasks.

- [ ] **Step 1: No automated test for this step — manual code-trace verification only**

All three call sites are inside large, DOM-string-building render functions with no existing test harness — same reasoning as the prior cycle's client-wiring task (a heavy jsdom harness would be disproportionate to the risk). The underlying logic (`matchesTaskRole`, `computeResidual`) is already fully unit-tested in Task 1. Proceed directly to the implementation steps; manual verification happens in Step 5 below.

- [ ] **Step 2: Add the `planning-calc.js` script tag to `planning.html`**

In `planning.html`, find this line:

```html
<script type="module" src="js/lib/cfg-parse.js?v=1"></script>
```

Immediately after it, add:

```html
<script type="module" src="js/lib/planning-calc.js?v=1"></script>
```

Both lines must remain before the existing `<script src="js/planning.js"></script>` tag further down the file.

- [ ] **Step 3: Wire the by-role view (`js/planning.js`)**

Find this block (currently lines 612-619):

```js
        // Consumed hours from actuals for this task+role
        const consumedH = projData
          .filter(r => r.task?.toLowerCase() === task.name.toLowerCase() &&
                       r.role?.toLowerCase() === res.role.toLowerCase())
          .reduce((s, r) => s + r.hours, 0);
        roleActualsMap[res.role] = (roleActualsMap[res.role] || 0) + consumedH;

        const residualH = Math.max(0, soldH - consumedH);
```

Replace it with:

```js
        // Consumed hours from actuals for this task+role
        const consumedH = projData
          .filter(r => matchesTaskRole(r, task.name, res.role))
          .reduce((s, r) => s + r.hours, 0);
        roleActualsMap[res.role] = (roleActualsMap[res.role] || 0) + consumedH;

        const residualH = computeResidual(soldH, consumedH);
```

Then find this block (currently lines 624-630, inside the same function, a few lines below):

```js
        const pastWeeks = overlapWeeks.filter(w => w.isPast);
        pastWeeks.forEach(w => {
          const actualH = projData
            .filter(r => r.task?.toLowerCase() === task.name.toLowerCase() &&
                         r.role?.toLowerCase() === res.role.toLowerCase() &&
                         r.date >= w.weekStart && r.date <= w.weekEnd)
            .reduce((s, r) => s + r.hours, 0);
```

Replace it with:

```js
        const pastWeeks = overlapWeeks.filter(w => w.isPast);
        pastWeeks.forEach(w => {
          const actualH = projData
            .filter(r => matchesTaskRole(r, task.name, res.role) &&
                         r.date >= w.weekStart && r.date <= w.weekEnd)
            .reduce((s, r) => s + r.hours, 0);
```

- [ ] **Step 4: Wire the by-project view (`js/planning.js`)**

Find this block (currently lines 1051-1056):

```js
        const taskRoleRecs = projData.filter(r =>
          r.task?.toLowerCase() === task.name.toLowerCase() &&
          r.role?.toLowerCase() === res.role.toLowerCase()
        );
        const consumedH = taskRoleRecs.reduce((s, r) => s + r.hours, 0);
        const residualH = Math.max(0, soldH - consumedH);
```

Replace it with:

```js
        const taskRoleRecs = projData.filter(r => matchesTaskRole(r, task.name, res.role));
        const consumedH = taskRoleRecs.reduce((s, r) => s + r.hours, 0);
        const residualH = computeResidual(soldH, consumedH);
```

- [ ] **Step 5: Wire the by-owner view (`js/planning.js`)**

Find this line (currently line 1346):

```js
        const roleRecs = projData.filter(r => r.role === res.role && (!task.name || r.task === task.name));
```

Replace it with:

```js
        const roleRecs = projData.filter(r => matchesTaskRole(r, task.name, res.role));
```

Then find this line (currently line 1366):

```js
        const roleTbp   = Math.max(0, soldH - consumedH);
```

Replace it with:

```js
        const roleTbp   = computeResidual(soldH, consumedH);
```

- [ ] **Step 6: Add the "To be planned" tooltip to all three view headers**

In `js/planning.js`, find this line (by-role header, currently line 846):

```js
          <th rowspan="${isMonthly ? 1 : 2}" style="position:sticky;left:330px;z-index:4;min-width:90px;background:var(--sand-200);font-size:var(--text-base);padding:8px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);text-align:center;white-space:nowrap">To be<br>planned</th>
```

Replace it with:

```js
          <th rowspan="${isMonthly ? 1 : 2}" title="To be planned can exceed Sold − Actuals when a role has multiple tasks and one is over-consumed — hours over budget on one task aren't subtracted from another task's remaining budget." style="position:sticky;left:330px;z-index:4;min-width:90px;background:var(--sand-200);font-size:var(--text-base);padding:8px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);text-align:center;white-space:nowrap">To be<br>planned</th>
```

Find this line (by-project header, currently line 1281):

```js
          <th rowspan="${rowspan}" style="${SH}left:345px;min-width:90px;background:var(--sand-200);font-size:var(--text-base);padding:8px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);text-align:center;white-space:nowrap">To be<br>planned</th>
```

Replace it with:

```js
          <th rowspan="${rowspan}" title="To be planned can exceed Sold − Actuals when a role has multiple tasks and one is over-consumed — hours over budget on one task aren't subtracted from another task's remaining budget." style="${SH}left:345px;min-width:90px;background:var(--sand-200);font-size:var(--text-base);padding:8px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);text-align:center;white-space:nowrap">To be<br>planned</th>
```

Find this line (by-owner header, currently line 1566):

```js
          <th rowspan="${rowspan}" style="${SH}left:345px;min-width:90px;background:var(--sand-200);font-size:var(--text-base);padding:8px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);text-align:center;white-space:nowrap">To be<br>planned</th>
```

Replace it with:

```js
          <th rowspan="${rowspan}" title="To be planned can exceed Sold − Actuals when a role has multiple tasks and one is over-consumed — hours over budget on one task aren't subtracted from another task's remaining budget." style="${SH}left:345px;min-width:90px;background:var(--sand-200);font-size:var(--text-base);padding:8px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);text-align:center;white-space:nowrap">To be<br>planned</th>
```

(Note: by-project and by-owner headers currently have byte-identical `style`/text content at these two lines — this is not a mistake in this plan, they are two genuinely separate `<th>` elements in two separate render functions in the same file.)

- [ ] **Step 7: Run the automated test suite**

Run: `npm test`
Expected: all tests PASS, unchanged from Task 1's result — this task's changes are inside `js/planning.js` and `planning.html`, neither of which vitest currently covers; this run just confirms no regression to `js/lib/planning-calc.test.js` or `js/lib/cfg-parse.test.js`.

- [ ] **Step 8: Manual code-trace verification (documented in the task report, not an automated test)**

Read through the six edited blocks in `js/planning.js` (Steps 3-6 above) and confirm, for each:
1. The replacement calls `matchesTaskRole`/`computeResidual` with the same effective arguments the old inline expression used (task name from `task.name`, role from `res.role`, sold/consumed in the same order).
2. No other logic in the surrounding lines was altered — only the filter predicate or residual-floor expression itself changed.
3. The three `title` attributes (Step 6) contain the exact tooltip text from the plan's Global Constraints, verbatim, in all three locations.

Record confirmation of all three points, per view, in the task report.

- [ ] **Step 9: Commit**

```bash
git add js/planning.js planning.html
git commit -m "fix(planning): unify task+role matching across all three views, add To-be-planned tooltip"
```

---

## Self-Review Notes (completed by the plan author, not a task step)

**Spec coverage:** Finding 3's unified matching function is implemented identically in Task 1 (pure function, fully tested) and wired into all three views in Task 2 Steps 3-5, replacing every divergent inline predicate identified in the spec (by-role's two occurrences, by-project's one, by-owner's one — including the previously-undocumented by-owner role-case-sensitivity gap the spec called out). Finding 2's decision (no formula change, static tooltip) is implemented via `computeResidual`'s verbatim extraction (Task 1) plus the three identical tooltip additions (Task 2 Step 6), with the exact tooltip text from the spec's Global Constraints. The spec's required characterization tests (HWGDEV-DEVELOPER-shaped discrepancy test, missing-task-name test) are both present in Task 1 Step 1. Out-of-scope items (Findings 1/4/5, `timesheets.js`, future-distribution logic, broader render-function redesign) are untouched by both tasks.

**Placeholder scan:** no TBD/TODO; every step contains complete, runnable code, not a description of it.

**Type/reference consistency:** `matchesTaskRole(record, taskName, role)` and `computeResidual(soldH, consumedH)`'s signatures are defined once in Task 1 and consumed identically (same parameter order, same argument sources) at all six call sites across Task 2's three views. The `window.*` bridge names (`window.matchesTaskRole`, `window.computeResidual`) match exactly what Task 2's classic-script call sites reference implicitly (bare function calls, resolved via the global `window` object per the project's established `js/lib/` convention).
