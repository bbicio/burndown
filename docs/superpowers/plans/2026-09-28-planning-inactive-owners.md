# planning.html inactive-owner handling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop giving inactive (former) resources a share of future "to be planned" hours in `planning.html`, while keeping their historical actuals untouched and visually flagged.

**Architecture:** One new `requireAuth`-only backend route (`POST /api/resources/match-owners`) resolves a batch of free-text owner names to `active`/`inactive` using the existing Cycle 3b matching primitives (`api/src/lib/match-resource.js`). One new pure function in `js/lib/planning-calc.js` (`redistributeExcludingInactive`) renormalizes each task+role's proportional owner split over active-or-unmatched owners only. `planning.html`'s Vue instance fetches the status map once per page load and both existing owner-breakdown code paths (By Project view/export, By Owner view/export) consume it in place of their current raw `ownerTotals[o]/totalOwnerH` math. A small inline badge marks inactive owner names wherever they're rendered.

**Tech Stack:** Node/Express (`api/src/routes/resources.js`), PostgreSQL (`resources`, `resource_aliases` — no new tables/migrations), Vue 3 CDN (no build step) in `planning.html`, `js/lib/planning-calc.js` (ES module, vitest-covered), Node's built-in `node:test` for backend tests, vitest for frontend tests.

**Spec:** `docs/superpowers/specs/2026-09-28-planning-inactive-owners-design.md`

## Global Constraints

- All user-facing text (help text, badge label) must be in English (CLAUDE.md's Language constraint).
- Past-actuals numbers (`ownerActualsH`/`ownerActuals`, all past-week `byOwner` cells) must never change — only the future/"to be planned" split is affected by this cycle.
- The new endpoint must be reachable by any authenticated user, not just admins (Planning is visible to all) — it must be declared **above** `resources.js`'s blanket `router.use(requireAuth, requireAdmin)` (currently line 11) with its own `requireAuth` only.
- Unmatched, ambiguous, ignored, or empty-name match outcomes all resolve to `active` (never `inactive`) — only an exact, unambiguous match to a currently-`inactive` resource yields `inactive`.
- Fail open: if the status-map fetch fails, every owner must behave exactly as it does today (i.e. `active`) — this feature must never be able to break Planning.
- Every `<script src="js/lib/planning-calc.js?v=N">` reference must have its `N` bumped together with any content change to that file (currently `?v=3` in `planning.html`; confirm current value at Task 2 time, in case another cycle bumped it since this plan was written).
- No bundler: `js/lib/planning-calc.js` stays a native ES module; the route file stays plain CommonJS matching every other file in `api/src/routes/`.

## Review Focus

- **Endpoint reachable by a non-admin user.** The whole point of moving this one route above `router.use(requireAuth, requireAdmin)` is that a non-admin, non-sysadmin authenticated user (any regular Planning viewer) can call it. A misplaced route declaration (below the `router.use` line) would silently 403 every non-admin user and Planning would just look like nothing changed (fail-open masks it) — easy to miss without an explicit non-admin check.
- **Empty/whitespace owner names in the `names` array.** Real actuals data uses `'—'` as the placeholder for a missing owner (see `ownerTotals` construction: `r.owner?.trim() || '—'`) — this placeholder must never be sent to the matching endpoint as a real name (it would spuriously "unmatch" against real resources, though harmlessly since unmatched → active, but it's still wasted/misleading matching work and worth excluding explicitly).
- **A task+role where every owner is inactive.** Must route 100% of future hours to the existing TBD placeholder row, not silently drop them or divide by zero (`totalOwnerH`/`eligibleTotal` guards already exist in the codebase's `> 0.01` pattern — the new function must follow the same convention).
- **Duplicate owner names across two different resources' aliases (ambiguous match).** Per the resolution table, `ambiguous` → `active`. A naive implementation might throw or pick an arbitrary resource's status instead of explicitly treating ambiguous as active.
- **XLS export must reflect the same status as the on-page view.** The export code paths (`taskExportRows`/`exportRows` pushes) run through the same JS objects as the HTML build in the same function — a badge added only to the HTML string and forgotten in the export's plain-value row would silently diverge between what's shown on screen and what's downloaded.

---

## Task 1: Backend — pure name→status resolver + route

**Files:**
- Modify: `api/src/routes/resources.js`
- Test: `api/src/routes/resources.test.js` (new)

**Interfaces:**
- Consumes: `normalizeName`, `buildMatchContext`, `matchOwner` from `api/src/lib/match-resource.js` (unchanged, already required by `resources.js` at line 5 — `buildMatchContext`/`matchOwner` need to be added to that existing `require`).
- Produces: `resolveOwnerStatuses(names, resources, aliases)` (exported from `resources.js` for the test file to import without a DB), returning `{ [name]: 'active' | 'inactive' }`. `POST /api/resources/match-owners` route, body `{ names: string[] }`, response `{ [name]: 'active' | 'inactive' }`, consumed by Task 3.

- [ ] **Step 1: Write the failing test for `resolveOwnerStatuses`**

Create `api/src/routes/resources.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveOwnerStatuses } = require('./resources');

const resources = [
  { id: 'r1', first_name: 'Jane', last_name: 'Doe', status: 'active' },
  { id: 'r2', first_name: 'John', last_name: 'Smith', status: 'inactive' },
  { id: 'r3', first_name: 'Jane', last_name: 'Doe', status: 'inactive' }, // ambiguous namesake, see below
];
const aliases = [];

test('resolveOwnerStatuses: exact match to an active resource resolves active', () => {
  const result = resolveOwnerStatuses(['Jane Doe'], [resources[0]], aliases);
  assert.equal(result['Jane Doe'], 'active');
});

test('resolveOwnerStatuses: exact unambiguous match to an inactive resource resolves inactive', () => {
  const result = resolveOwnerStatuses(['John Smith'], [resources[1]], aliases);
  assert.equal(result['John Smith'], 'inactive');
});

test('resolveOwnerStatuses: no match resolves active (fail-open, per agreed rule)', () => {
  const result = resolveOwnerStatuses(['Nobody Here'], resources, aliases);
  assert.equal(result['Nobody Here'], 'active');
});

test('resolveOwnerStatuses: ambiguous match (active + inactive namesakes) resolves active, not inactive', () => {
  // matchOwner prefers active candidates first; with one active + one inactive sharing the
  // normalized name "jane doe", the active one wins unambiguously — not actually ambiguous.
  // A genuinely ambiguous case is two *active* namesakes:
  const twoActive = [
    { id: 'a1', first_name: 'Jane', last_name: 'Doe', status: 'active' },
    { id: 'a2', first_name: 'Jane', last_name: 'Doe', status: 'active' },
  ];
  const result = resolveOwnerStatuses(['Jane Doe'], twoActive, aliases);
  assert.equal(result['Jane Doe'], 'active');
});

test('resolveOwnerStatuses: an alias explicitly marked ignore resolves active, not inactive', () => {
  const ignoredAlias = [{ alias_normalized: 'ghost name', resource_id: null }];
  const result = resolveOwnerStatuses(['Ghost Name'], resources, ignoredAlias);
  assert.equal(result['Ghost Name'], 'active');
});

test('resolveOwnerStatuses: an alias pointing at an inactive resource resolves inactive', () => {
  const aliasToInactive = [{ alias_normalized: 'jsmith', resource_id: 'r2' }];
  const result = resolveOwnerStatuses(['jsmith'], [resources[1]], aliasToInactive);
  assert.equal(result.jsmith, 'inactive');
});

test('resolveOwnerStatuses: only active-then-inactive fallback matters when the active candidate exists — active resource with the same name as an inactive one resolves active', () => {
  const activeAndInactiveSameName = [
    { id: 'x1', first_name: 'Sam', last_name: 'Lee', status: 'active' },
    { id: 'x2', first_name: 'Sam', last_name: 'Lee', status: 'inactive' },
  ];
  const result = resolveOwnerStatuses(['Sam Lee'], activeAndInactiveSameName, aliases);
  assert.equal(result['Sam Lee'], 'active');
});

test('resolveOwnerStatuses: handles an empty names array', () => {
  assert.deepEqual(resolveOwnerStatuses([], resources, aliases), {});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `api/`): `npm test -- --test-name-pattern resolveOwnerStatuses` (or if that flag isn't supported by the installed Node version, run the full suite: `npm test`)
Expected: FAIL — `resolveOwnerStatuses` is not exported from `./resources` (module doesn't export it yet; `resources.js` currently only does `module.exports = router`).

- [ ] **Step 3: Implement `resolveOwnerStatuses` and the route**

In `api/src/routes/resources.js`, update the top `require` (line 5) and add the new function + route. The new route must be declared **before** `router.use(requireAuth, requireAdmin)` (line 11):

```js
const { normalizeName, buildMatchContext, matchOwner } = require('../lib/match-resource');
```

Insert immediately after `const router = express.Router();` (before the existing `router.use(requireAuth, requireAdmin);` line):

```js
// resources: [{ id, first_name, last_name, status }]; aliases: [{ alias_normalized, resource_id }]
// Exported for unit testing (no DB access needed — see resources.test.js).
function resolveOwnerStatuses(names, resources, aliases) {
  const ctx = buildMatchContext(resources, aliases);
  const statusById = new Map(resources.map(r => [r.id, r.status]));
  const result = {};
  for (const name of names) {
    const m = matchOwner(name, ctx);
    result[name] = (m.kind === 'matched' && statusById.get(m.resourceId) === 'inactive')
      ? 'inactive' : 'active';
  }
  return result;
}

// POST /api/resources/match-owners — { names: string[] } -> { [name]: 'active' | 'inactive' }
// requireAuth only (not requireAdmin, unlike every other route in this file): planning.html is
// visible to every authenticated user, and this response carries no PII, only a status per name.
router.post('/match-owners', requireAuth, async (req, res, next) => {
  try {
    const { names } = req.body;
    if (!Array.isArray(names)) return res.status(400).json({ error: 'names must be an array' });
    if (names.length === 0) return res.json({});
    if (names.length > 2000) return res.status(400).json({ error: 'Too many names (max 2000)' });
    const [resourcesResult, aliasesResult] = await Promise.all([
      query('SELECT id, first_name, last_name, status FROM resources'),
      query('SELECT alias_normalized, resource_id FROM resource_aliases'),
    ]);
    res.json(resolveOwnerStatuses(names, resourcesResult.rows, aliasesResult.rows));
  } catch (err) { next(err); }
});
```

At the bottom of the file, change `module.exports = router;` to also export the pure function:

```js
module.exports = router;
module.exports.resolveOwnerStatuses = resolveOwnerStatuses;
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `api/`): `npm test`
Expected: PASS for all `resolveOwnerStatuses` tests; no other existing test broken.

- [ ] **Step 5: Manual check — non-admin reachability**

Since this route deliberately sits above the router's admin gate, verify it by hand once real code is up (via `scripts/test-branch.sh up`, not the main stack — see CLAUDE.md's Docker safety rules): log in as a non-admin user and confirm `POST /api/resources/match-owners` with a small `names` array returns 200 with a status map, not 403. Also confirm every other `/api/resources/*` route still 403s for that same non-admin user (the admin gate on the rest of the router is unaffected).

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/resources.js api/src/routes/resources.test.js
git commit -m "feat: add POST /api/resources/match-owners for planning.html inactive-owner detection

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Frontend — pure redistribution function

**Files:**
- Modify: `js/lib/planning-calc.js`
- Test: `js/lib/planning-calc.test.js`

**Interfaces:**
- Consumes: nothing new (pure function, no imports beyond existing module scope).
- Produces: `redistributeExcludingInactive(ownerTotals, ownerStatus)` → `{ props: { [name]: number }, allInactive: boolean }`, exported and bridged to `window.redistributeExcludingInactive`; consumed by Task 3/4.

- [ ] **Step 1: Write the failing tests**

Append to `js/lib/planning-calc.test.js` (add the import alongside the existing ones at the top):

```js
import { redistributeExcludingInactive } from './planning-calc.js';

describe('redistributeExcludingInactive', () => {
  it('all-active owners: unchanged from the raw proportional split (regression guard)', () => {
    const totals = { Alice: 60, Bob: 40 };
    const status = { Alice: 'active', Bob: 'active' };
    const { props, allInactive } = redistributeExcludingInactive(totals, status);
    expect(allInactive).toBe(false);
    expect(props.Alice).toBeCloseTo(0.6);
    expect(props.Bob).toBeCloseTo(0.4);
  });

  it('one inactive among several: renormalizes over the remaining actives, preserving their relative ratio', () => {
    const totals = { Alice: 30, Bob: 20, Carol: 50 }; // Carol inactive
    const status = { Alice: 'active', Bob: 'active', Carol: 'inactive' };
    const { props, allInactive } = redistributeExcludingInactive(totals, status);
    expect(allInactive).toBe(false);
    expect(props.Carol).toBeUndefined();
    expect(props.Alice).toBeCloseTo(0.6); // 30 / (30+20)
    expect(props.Bob).toBeCloseTo(0.4);   // 20 / (30+20)
  });

  it('every owner inactive: allInactive is true and props is empty (caller routes 100% to TBD)', () => {
    const totals = { Carol: 50 };
    const status = { Carol: 'inactive' };
    const { props, allInactive } = redistributeExcludingInactive(totals, status);
    expect(allInactive).toBe(true);
    expect(props).toEqual({});
  });

  it('an owner name absent from the status map is treated as active (fail-open)', () => {
    const totals = { Alice: 10 };
    const status = {}; // e.g. the API call failed, or Alice wasn't in the request batch
    const { props, allInactive } = redistributeExcludingInactive(totals, status);
    expect(allInactive).toBe(false);
    expect(props.Alice).toBeCloseTo(1);
  });

  it('a single eligible owner gets 100% even when an inactive owner also has actuals', () => {
    const totals = { Alice: 10, Bob: 90 }; // Bob inactive
    const status = { Alice: 'active', Bob: 'inactive' };
    const { props } = redistributeExcludingInactive(totals, status);
    expect(props.Alice).toBeCloseTo(1);
  });

  it('empty ownerTotals: allInactive is true (no eligible pool to distribute over)', () => {
    const { props, allInactive } = redistributeExcludingInactive({}, {});
    expect(allInactive).toBe(true);
    expect(props).toEqual({});
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test` (from the repo root, per CLAUDE.md's frontend test command)
Expected: FAIL — `redistributeExcludingInactive` is not exported from `./planning-calc.js`.

- [ ] **Step 3: Implement the function**

In `js/lib/planning-calc.js`, add near the other owner/residual helpers (after `computeResidual`, before the calendar-week helpers section comment):

```js
// ownerTotals: { [name]: actualsHours }; ownerStatus: { [name]: 'active' | 'inactive' } (a name
// absent from ownerStatus is treated as 'active' — fail-open if the status fetch failed or this
// name wasn't in the request batch). Renormalizes proportions over eligible (non-'inactive')
// owners only, so an inactive owner's future share is redistributed among the rest, preserving
// their relative ratio. allInactive: true means the caller should route 100% of future hours to
// the existing TBD placeholder row instead (mirrors the pre-existing "no owners at all" path).
export function redistributeExcludingInactive(ownerTotals, ownerStatus) {
  const eligible = Object.keys(ownerTotals).filter(n => (ownerStatus[n] || 'active') !== 'inactive');
  const eligibleTotal = eligible.reduce((s, n) => s + (ownerTotals[n] || 0), 0);
  if (eligible.length === 0 || eligibleTotal <= 0.01) {
    return { props: {}, allInactive: true };
  }
  const props = {};
  eligible.forEach(n => { props[n] = ownerTotals[n] / eligibleTotal; });
  return { props, allInactive: false };
}
```

Add the corresponding bridge line near the other `window.*` assignments at the bottom of the file:

```js
window.redistributeExcludingInactive = redistributeExcludingInactive;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS for all 6 new `redistributeExcludingInactive` tests; no other existing test broken.

- [ ] **Step 5: Commit**

```bash
git add js/lib/planning-calc.js js/lib/planning-calc.test.js
git commit -m "feat: add redistributeExcludingInactive pure function for planning-calc

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Wire the status fetch into `planning.html`'s Vue instance

**Files:**
- Modify: `planning.html`

**Interfaces:**
- Consumes: `POST /api/resources/match-owners` (Task 1), `redistributeExcludingInactive` (Task 2, available as a bare global inside `planning.html`'s classic `<script>` per this file's established pattern — see `getCalendarWeeks`/`computeResidual` already called bare, without a `window.` prefix, throughout the Vue instance methods/computeds).
- Produces: `this.ownerStatusMap` (Vue instance data field, `{ [name]: 'active' | 'inactive' }`), populated by a new `refreshOwnerStatuses()` method; consumed by Task 4.

- [ ] **Step 1: Add the `ownerStatusMap` data field**

In `planning.html`'s `data()` (starting at line 258), add a field to the returned object:

```js
        ownerStatusMap: {}, // { [ownerName]: 'active' | 'inactive' }, from POST /api/resources/match-owners;
                             // an absent name is treated as 'active' by redistributeExcludingInactive (fail-open)
```

- [ ] **Step 2: Add the `refreshOwnerStatuses()` method**

In the `methods: {` block (starting at line 1266), add a new method (placed near `bumpRefresh()` at line 1324, since both relate to keeping derived state in sync with `timesheetData`):

```js
      async refreshOwnerStatuses() {
        const names = [...new Set(
          timesheetData
            .map(r => r.owner?.trim())
            .filter(name => name) // drop empty/whitespace-only — the '—' placeholder is
                                   // synthesized client-side from a missing owner, never a
                                   // real name sent to the matching endpoint
        )];
        if (!names.length) { this.ownerStatusMap = {}; return; }
        try {
          const res = await fetch('/api/resources/match-owners', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ names }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          this.ownerStatusMap = await res.json();
        } catch (err) {
          console.warn('[planning] refreshOwnerStatuses failed, treating all owners as active:', err.message);
          this.ownerStatusMap = {};
        }
      },
```

- [ ] **Step 3: Call it from `created()` and after an XLS upload**

In `created()` (line 1491), after the existing data-loading `Promise.all` (line 1499), add the call so it runs once the owner names are known but before `this.loading = false`:

```js
      await Promise.all([loadConfigFromApi(), refreshTimesheetDataFromApi(), loadPipelineBudgetsFromApi()]);
      await this.refreshOwnerStatuses();
      this.initWindowIfNeeded();
```

In `onFileInputChange()` (line 1325), an XLS upload can introduce new owner names, so refresh statuses alongside the existing `bumpRefresh()` callback:

```js
      async onFileInputChange(e) {
        const f = e.target.files[0];
        e.target.value = '';
        if (f) await readXLS(f, async () => { await this.refreshOwnerStatuses(); this.bumpRefresh(); });
      },
```

- [ ] **Step 4: Manual smoke check**

Since this task has no automated test on its own (it's Vue wiring consumed by Task 4/5), verify manually once Task 4 is also in place — defer to Task 6's manual verification pass. For now, confirm via browser devtools (Network tab) on a branch test stack that `POST /api/resources/match-owners` fires once on page load with the expected `names` array and a 200 response.

- [ ] **Step 5: Commit**

```bash
git add planning.html
git commit -m "feat: fetch owner active/inactive status map on planning.html load

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Apply redistribution in By Project view/export

**Files:**
- Modify: `planning.html` (`byProjectView` computed, starting at line 666)

**Interfaces:**
- Consumes: `this.ownerStatusMap` (Task 3), `redistributeExcludingInactive` (Task 2).
- Produces: updated future-hours math in `byProjectView`'s HTML and `exportRows`; no change to its public shape (still `{ html, exportRows, periodMeta }`).

- [ ] **Step 1: Replace the `distribute` closure's raw proportional split**

At line 790-796, replace:

```js
              const distribute = (byOwner, hours) => {
                if (hasOwners && totalOwnerH > 0.01) {
                  ownerNames.forEach(o => { byOwner[o] = (byOwner[o] || 0) + hours * (ownerTotals[o] / totalOwnerH); });
                } else {
                  byOwner['—'] = (byOwner['—'] || 0) + hours;
                }
              };
```

with:

```js
              const { props: ownerFutureProps, allInactive: allOwnersInactive } =
                redistributeExcludingInactive(ownerTotals, this.ownerStatusMap);
              const distribute = (byOwner, hours) => {
                if (hasOwners && !allOwnersInactive) {
                  Object.entries(ownerFutureProps).forEach(([o, prop]) => { byOwner[o] = (byOwner[o] || 0) + hours * prop; });
                } else {
                  byOwner['—'] = (byOwner['—'] || 0) + hours;
                }
              };
```

(`redistributeExcludingInactive` is called once per role, right before `distribute` is defined, since both `ownerTotals` and `this.ownerStatusMap` are already in scope at that point — same placement as the closure it replaces.)

- [ ] **Step 2: Replace the `ownerProp` calc used for `ownerTbpH`**

At line 855, replace:

```js
                const ownerProp     = totalOwnerH > 0.01 ? (ownerTotals[ownerName] || 0) / totalOwnerH : (isPlaceholder ? 1 : 0);
```

with:

```js
                const ownerProp     = isPlaceholder ? (allOwnersInactive || totalOwnerH <= 0.01 ? 1 : 0) : (ownerFutureProps[ownerName] || 0);
```

(An inactive owner's own row still shows its own name with `ownerProp = 0` for future hours — it falls out of `ownerFutureProps` entirely, which is exactly the desired behavior: the row still displays past actuals via `ownerActualsH`, just no future share. The `'—'`/TBD placeholder row picks up 100% only when `allOwnersInactive` is true or there were no owners to begin with, matching the existing `hasOwners`-false path's meaning.)

- [ ] **Step 2b: Verify `hasOwners` still gates the placeholder correctly**

Re-read lines 851 (`const displayOwners = hasOwners ? ownerNames : ['—'];`) — this line is unchanged: `hasOwners` reflects "were there any owners in the actuals at all," which is a different question from "are all of them inactive." Both `distribute` (Step 1) and `ownerProp` (Step 2) now separately handle the `allOwnersInactive` case, so `displayOwners` still lists every owner name (including inactive ones, so their past actuals stay visible) — only their future/TBP numbers zero out. Confirm this by reading the full block once edited; no code change needed for this step, it's a correctness check before moving on.

- [ ] **Step 3: Manual verification against the existing vitest suite for regressions**

This task has no new automated test of its own (the math it now calls, `redistributeExcludingInactive`, is already covered by Task 2's tests; this task is glue code in a Vue computed that has no existing unit-test harness — consistent with the rest of `byProjectView`, which has always been verified manually per this project's established convention for Vue pages). Run the existing suite to confirm nothing else broke:

Run: `npm test`
Expected: PASS (all existing + Task 1/2 tests, none touched by this task).

- [ ] **Step 4: Commit**

```bash
git add planning.html
git commit -m "feat: exclude inactive owners from future-hours split in By Project view

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Apply redistribution in By Owner view/export, add badges, update help text and export text

**Files:**
- Modify: `planning.html` (`byOwnerView` computed, starting at line 988; owner-name render sites in both `byProjectView` and `byOwnerView`; both views' help-text `<div class="alert...">` blocks)

**Interfaces:**
- Consumes: `this.ownerStatusMap` (Task 3), `redistributeExcludingInactive` (Task 2).
- Produces: same redistribution fix applied to `byOwnerView`; a visible "inactive" badge next to every inactive owner's name in both views (HTML + XLS export text); updated in-page help text in both views.

- [ ] **Step 1: Replace `byOwnerView`'s `distribute` closure**

At line 1068-1071, replace:

```js
              const distribute  = (byOwner, hours) => {
                if (totalOwnerH > 0.01) ownerNames.forEach(o => { byOwner[o] = (byOwner[o] || 0) + hours * (ownerTotals[o] / totalOwnerH); });
                else byOwner['—'] = (byOwner['—'] || 0) + hours;
              };
```

with:

```js
              const { props: ownerFutureProps, allInactive: allOwnersInactive } =
                redistributeExcludingInactive(ownerTotals, this.ownerStatusMap);
              const distribute  = (byOwner, hours) => {
                if (!allOwnersInactive) Object.entries(ownerFutureProps).forEach(([o, prop]) => { byOwner[o] = (byOwner[o] || 0) + hours * prop; });
                else byOwner['—'] = (byOwner['—'] || 0) + hours;
              };
```

- [ ] **Step 2: Replace `byOwnerView`'s `ownerProp` calc**

At line 1091, replace:

```js
              const ownerProp    = totalOwnerH > 0.01 ? (ownerTotals[ownerName] || 0) / totalOwnerH : (isPlaceholder ? 1 : 0);
```

with:

```js
              const ownerProp    = isPlaceholder ? (allOwnersInactive || totalOwnerH <= 0.01 ? 1 : 0) : (ownerFutureProps[ownerName] || 0);
```

Note: `byOwnerView`'s `ownerProp` also scales `ownerSold` (line 1092, `soldH * ownerProp`) in addition to `ownerTbpH` (line 1094) — unlike `byProjectView`, which only used `ownerProp` for `ownerTbpH`. This is pre-existing behavior (sold-hours attribution was already proportional-to-actuals before this cycle) and is intentionally left as-is: this cycle only changes *which* owners share in the proportion, not which numbers the proportion applies to.

- [ ] **Step 3: Add the inactive badge — By Project view (HTML)**

At line 872, replace:

```js
                const ownerLabel = isPlaceholder ? '<span style="color:#aaa;font-style:italic">TBD</span>' : esc(ownerName);
```

with:

```js
                const inactiveBadge = (!isPlaceholder && this.ownerStatusMap[ownerName] === 'inactive')
                  ? ' <span style="font-size:var(--text-2xs);background:#f3f4f6;border:1px solid #d1d5db;border-radius:var(--radius-xs);padding:0 4px;color:#6b7280">inactive</span>' : '';
                const ownerLabel = isPlaceholder ? '<span style="color:#aaa;font-style:italic">TBD</span>' : esc(ownerName) + inactiveBadge;
```

- [ ] **Step 4: Add the inactive badge — By Project view (XLS export)**

At line 882-883, replace:

```js
                taskExportRows.push({ v: ['', '', res.role, isPlaceholder ? 'TBD' : ownerName, '', rnd(ownerActualsH), rnd(ownerTbpH),
```

with:

```js
                const ownerExportName = isPlaceholder ? 'TBD' : (ownerName + (this.ownerStatusMap[ownerName] === 'inactive' ? ' (inactive)' : ''));
                taskExportRows.push({ v: ['', '', res.role, ownerExportName, '', rnd(ownerActualsH), rnd(ownerTbpH),
```

- [ ] **Step 5: Add the inactive badge — By Owner view (HTML)**

At line 1161, replace:

```js
          const displayName = ownerName === '—' ? 'TBD' : ownerName;
```

with:

```js
          const isPlaceholder = ownerName === '—';
          const inactiveBadge = (!isPlaceholder && this.ownerStatusMap[ownerName] === 'inactive')
            ? ' <span style="font-size:var(--text-2xs);background:#f3f4f6;border:1px solid #d1d5db;border-radius:var(--radius-xs);padding:0 4px;color:#6b7280">inactive</span>' : '';
          const displayName = isPlaceholder ? 'TBD' : ownerName;
```

Then at line 1171 (the group header row), append the badge to the rendered name — replace:

```js
              <td style="${SB}left:0;background:var(--indigo-300);font-size:var(--text-md);padding:7px 8px 7px 10px;font-weight:700;border:1px solid var(--border-light);border-left:4px solid var(--indigo-500);white-space:nowrap"><span class="pp-toggle" style="display:inline-block;width:12px;margin-right:4px;font-size:var(--text-xs)">▼</span>👤 ${esc(displayName)}</td>
```

with:

```js
              <td style="${SB}left:0;background:var(--indigo-300);font-size:var(--text-md);padding:7px 8px 7px 10px;font-weight:700;border:1px solid var(--border-light);border-left:4px solid var(--indigo-500);white-space:nowrap"><span class="pp-toggle" style="display:inline-block;width:12px;margin-right:4px;font-size:var(--text-xs)">▼</span>👤 ${esc(displayName)}${inactiveBadge}</td>
```

- [ ] **Step 6: Add the inactive badge — By Owner view (XLS export)**

At line 1177, replace:

```js
          exportRows.push({ v: [displayName, '', '', rnd(om.sold), rnd(om.actuals), rnd(om.tbp),
```

with:

```js
          const ownerExportDisplayName = displayName + (!isPlaceholder && this.ownerStatusMap[ownerName] === 'inactive' ? ' (inactive)' : '');
          exportRows.push({ v: [ownerExportDisplayName, '', '', rnd(om.sold), rnd(om.actuals), rnd(om.tbp),
```

- [ ] **Step 7: Update the By Project help text**

At lines 958-966, replace the `<strong>Estimation logic (By Project):</strong>` block's body with an added sentence — replace:

```js
            <strong>Current and future weeks</strong> show <em>residual hours</em> (sold − consumed) distributed linearly across the remaining task duration,
            then split among owners <em>proportionally to their share of actuals</em>.
```

with:

```js
            <strong>Current and future weeks</strong> show <em>residual hours</em> (sold − consumed) distributed linearly across the remaining task duration,
            then split among owners <em>proportionally to their share of actuals</em> — an owner flagged <span style="font-size:var(--text-2xs);background:#f3f4f6;border:1px solid #d1d5db;border-radius:var(--radius-xs);padding:0 4px;color:#6b7280">inactive</span> no longer receives a future share; their past actuals are unaffected.
```

- [ ] **Step 8: Update the By Owner help text**

At line 1228, replace:

```js
            <strong>Future weeks</strong> show each owner's proportional share of remaining hours (sold − consumed).
            If no owner is found in the actuals, hours are assigned to a <em>TBD</em> placeholder.
```

with:

```js
            <strong>Future weeks</strong> show each owner's proportional share of remaining hours (sold − consumed), among owners who are not flagged <span style="font-size:var(--text-2xs);background:#f3f4f6;border:1px solid #d1d5db;border-radius:var(--radius-xs);padding:0 4px;color:#6b7280">inactive</span>.
            If no owner is found in the actuals, or every owner is inactive, hours are assigned to a <em>TBD</em> placeholder.
```

- [ ] **Step 9: Manual regression check via vitest**

Run: `npm test`
Expected: PASS (no vitest coverage exists for `byProjectView`/`byOwnerView` themselves — string-templated Vue computeds in this file have always been verified manually; this step only confirms Task 1/2's tests and everything else remain green).

- [ ] **Step 10: Commit**

```bash
git add planning.html
git commit -m "feat: exclude inactive owners from By Owner view, add inactive badges and help text

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Docs, cache-busting, and manual verification pass

**Files:**
- Modify: `planning.html` (cache-bust only)
- Modify: `docs/pages/planning.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks — this is the closing task.

- [ ] **Step 1: Bump the cache-busting version**

In `planning.html`, find the current `js/lib/planning-calc.js?v=N` reference (line 228, `?v=3` as of this plan's writing — re-check, since another cycle may have bumped it since) and increment `N` by 1. Confirm via grep that `planning.html` is still the only file referencing this path (re-run `grep -rn "planning-calc.js" .` from the repo root if unsure) — if so, no other file needs the bump.

- [ ] **Step 2: Update `docs/pages/planning.md`**

Add a new dated section at the end of the file, matching the existing "By Role project/task drill-down (2026-09)" section's narrative style:

```markdown

## Inactive-owner handling (2026-09)

Future ("to be planned") hours are no longer split with owners who are `inactive` in the `resources` registry — their share is redistributed proportionally among the remaining active (or unmatched/ambiguous, which count as active) owners on that task+role; if every owner on a task+role is inactive, its entire future share falls to the existing TBD placeholder row. Past actuals are never affected — an inactive owner's historical hours display exactly as before, with a small "inactive" badge next to their name (By Project drill-down, By Owner view, and both views' XLS exports).

Status resolution reuses Cycle 3b's `api/src/lib/match-resource.js` matching (`normalizeName`/`buildMatchContext`/`matchOwner`) via a new `POST /api/resources/match-owners` route — `requireAuth` only, not `requireAdmin` (deliberately declared above `resources.js`'s blanket admin gate), since Planning is visible to every authenticated user and the response carries no PII, just a name→status map. Only an exact, unambiguous match to a currently-inactive resource resolves to `inactive`; an unmatched, ambiguous, or explicitly-ignored name resolves to `active` (same "when in doubt, don't touch anything a person is actively counting on" posture as the rest of this feature).

The redistribution math itself is a new pure function, `redistributeExcludingInactive(ownerTotals, ownerStatus)` in `js/lib/planning-calc.js` (vitest-covered), consumed by both `byProjectView` and `byOwnerView`'s existing proportional-split code — replacing their previous raw `ownerTotals[o]/totalOwnerH` math in the `distribute` closures and `ownerProp` calcs. `planning.html` fetches the status map once per page load (`refreshOwnerStatuses()`, called from `created()` and again after an XLS upload) and fails open — treats every owner as active — if the fetch fails, so this is purely additive: it can only ever narrow which owners receive future hours, never break the page.

Cache-bust: `js/lib/planning-calc.js?v=N` (bumped this cycle; see the file itself for the current value).
```

(Replace `N` in the last line with the actual new version number from Step 1.)

- [ ] **Step 3: Commit docs + cache-bust**

```bash
git add planning.html docs/pages/planning.md
git commit -m "docs: sync planning.md and bump planning-calc.js cache-bust for inactive-owner cycle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Manual verification pass**

Per this project's established convention (no automated E2E for Vue pages), verify against a branch test stack (`scripts/test-branch.sh up` — never the main stack, per CLAUDE.md's Docker safety rules) with real or seeded data:

1. Create/seed at least one `resources` row with `status = 'inactive'` whose normalized name matches an owner name already present in uploaded actuals for a task that also has at least one other, active owner on the same task+role.
2. Open `planning.html`, By Project view: confirm the inactive owner's row still shows their past actuals unchanged, carries the "inactive" badge, and their "To be planned" / future-period cells are 0 — while the remaining active owner(s) on the same task+role now carry 100% (or their renormalized share) of the future hours that used to also include the inactive owner's cut.
3. Same check in By Owner view.
4. Create a second scenario where a task+role's *only* owner (by actuals) is inactive: confirm 100% of that task+role's future hours land on the TBD placeholder row, not on the inactive owner and not silently dropped.
5. Confirm an owner name with no resource/alias match at all still receives its normal future share (treated as active, no badge).
6. Run "Export XLS" from both By Project and By Owner views; open the file and confirm the "(inactive)" text suffix appears on the same rows the on-page badge appeared on, with the same (unchanged) past-actuals numbers.
7. As a **non-admin** user, confirm Planning still loads normally and the inactive badges/redistribution still work (validates Task 1's non-admin reachability in the full page context, not just the isolated endpoint check from Task 1 Step 5).
8. As a sanity check that nothing regressed for the common case, spot-check one task+role where all owners are active and confirm its numbers are identical to before this cycle (same total future hours, same per-owner split ratios).

No code changes expected from this step unless verification surfaces a bug — if it does, fix inline and re-run the relevant steps above before considering the cycle done.

---

## Self-Review Notes

**Spec coverage:** §1 (status resolution rule) → Task 1. §2 (backend endpoint) → Task 1. §3 (pure redistribution function) → Task 2. §4 (call-site changes) → Tasks 4 & 5 (corrected from the spec's assumed three call sites to the actual two — `byRoleView` was found during plan-writing to have no owner-level split of its own; only `byProjectView` and `byOwnerView` do). §5 (badge) → Task 5. §6 (data flow/caching/error handling) → Task 3. §7 (docs/cache-busting) → Task 6.

**Correction to the design spec:** the spec's §4 states "By Role export (shares the By Project export's owner-breakdown code path)" as a third call site. Re-reading `planning.html` while writing this plan found only two occurrences of the `ownerTotals`/`distribute`/`ownerProp` pattern in the entire file (`byProjectView` at ~767-883, `byOwnerView` at ~1041-1094) — `byRoleView` (351-665) has no owner-level split; its own per-child breakdown (documented in `docs/pages/planning.md`'s "By Role project/task drill-down" section) reads from `sumChildBreakdownHours` over role-level week data, which is unaffected by owner status. No task in this plan targets `byRoleView` for that reason — this is a deliberate, verified scope correction, not an omission.
