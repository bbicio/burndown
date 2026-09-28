# Team UX polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add search/sort/paging to the Unmatched names queue, an expandable project-code list per unmatched name, and paging to the Team table in `team.html`.

**Architecture:** Two pure helpers (`paginate`, `sortUnmatched`) added to the existing `js/lib/team-ui.js` module, unit-tested with vitest; `team.html`'s Vue instance gets new state/computed/methods per tab, reusing the existing search/sort UI pattern already on the Team tab. One additive backend change: `GET /api/resources/unmatched` gains a `project_codes` array field.

**Tech Stack:** Vue 3 (CDN, no build step), vanilla `js/lib/*` ES modules bridged to `window.*`, vitest, Express/PostgreSQL (`api/src/routes/resources.js`), `test-api.js` (integration suite run via `scripts/run-tests.sh`).

**Spec:** `docs/superpowers/specs/2026-09-28-team-ux-polish-design.md`

## Global Constraints

- No bundler/build step; Vue loaded from CDN; keep `v-cloak` on the root mount element (already present, do not touch).
- All user-facing text stays in English.
- No native `alert`/`confirm`.
- `js/lib/team-ui.js` is a versioned file (`?v=N` cache-busting query string) — its single consumer, `team.html:344` (`<script type="module" src="js/lib/team-ui.js?v=2">`), must have its `?v=` bumped to `3` after this cycle's edit.
- `project_codes` is additive to `GET /api/resources/unmatched`'s response; the existing `projects` (count) field must stay numerically identical to today — do not change the aggregation that produces it.
- No changes to `css/*.css` or `js/api.js` — no other `?v=N` bump is needed.

## Review Focus

- **Unmatched queue with zero rows:** `paginate([], 1, 25)` must not throw or report `totalPages: 0` — the empty-state message (`No unmatched names.`) must still render, not a broken "Page 1 of 0".
- **Fewer than 25 rows (both tables):** pagination controls must not appear at all when everything fits on one page (spec doesn't say "hide it", but showing useless Prev/Next on 3 rows is a real usability regression to avoid).
- **Assign/Ignore removes the last row of the current (non-first) page:** after `loadUnmatched()` re-runs, the page index must not point past the new end of the list (e.g. was on page 2 of 2, page 2 no longer exists) — must clamp back, not show a blank page.
- **Sorting the unmatched queue by "Projects" or "Hours":** these are numbers arriving from JSON (`hours` may be a float, `projects` an int) — a string-comparison bug (e.g. `"9" > "10"`) would sort them wrong; the test must use values that would expose that (9 vs 10).
- **Search text matching only whitespace or empty after trim:** must behave like "no filter" (return everything), not throw or match nothing — mirrors the existing `filteredResources` behavior on the Team tab, must hold for the new `filteredUnmatched` too.

---

### Task 1: Backend — `project_codes` on `GET /api/resources/unmatched`

**Files:**
- Modify: `api/src/routes/resources.js:27-41`
- Modify: `test-api.js` (around line 1198-1200, the `unknownRow` assertion block)

**Interfaces:**
- Produces: `GET /api/resources/unmatched` response rows now include `project_codes: string[]` (alphabetically sorted) alongside the existing `projects: number` count. Consumed by Task 4 (`team.html`'s expandable project list).

- [ ] **Step 1: Edit the SQL query to add `project_codes`**

In `api/src/routes/resources.js`, replace the `router.get('/unmatched', ...)` handler's query:

```js
    const { rows } = await query(
      `SELECT name_normalized,
              (array_agg(display_name ORDER BY hours DESC))[1] AS display_name,
              ROUND(SUM(hours), 2)::float AS hours,
              COUNT(DISTINCT project_code)::int AS projects,
              array_agg(DISTINCT project_code ORDER BY project_code) AS project_codes,
              (array_agg(candidate_resource_ids))[1] AS candidate_resource_ids
       FROM profile_unmatched
       GROUP BY name_normalized
       ORDER BY SUM(hours) DESC, name_normalized`
    );
```

(Only the added `array_agg(DISTINCT project_code ORDER BY project_code) AS project_codes,` line changes; everything else in the handler is untouched.)

- [ ] **Step 2: Extend the integration test assertion**

In `test-api.js`, the existing line:

```js
  const unknownRow = un.find(u => u.name_normalized === unknownKey);
  ok(!!unknownRow && Number(unknownRow.hours) === 6 && unknownRow.projects === 1,
    'MA-05 unknown owner is queued with its hours and project count');
```

becomes:

```js
  const unknownRow = un.find(u => u.name_normalized === unknownKey);
  ok(!!unknownRow && Number(unknownRow.hours) === 6 && unknownRow.projects === 1,
    'MA-05 unknown owner is queued with its hours and project count');
  ok(!!unknownRow && Array.isArray(unknownRow.project_codes) && unknownRow.project_codes.length === 1
    && unknownRow.project_codes[0] === code,
    'MA-05b unmatched row carries its project_codes array');
```

- [ ] **Step 3: Verify the change is syntactically sound**

Run: `node -c api/src/routes/resources.js`
Expected: no output (exit code 0 — this only checks JS syntax; the query itself is exercised by the Docker-backed integration suite at `/finish-cycle` time, not here, since there is no local Postgres for this task).

- [ ] **Step 4: Commit**

```bash
git add api/src/routes/resources.js test-api.js
git commit -m "feat: add project_codes to GET /api/resources/unmatched"
```

---

### Task 2: `js/lib/team-ui.js` — `paginate()` and `sortUnmatched()`

**Files:**
- Modify: `js/lib/team-ui.js`
- Test: `js/lib/team-ui.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure module, no dependency on Task 1's API shape at the unit-test level — `sortUnmatched`'s tests use plain fixture objects).
- Produces:
  - `export function paginate(items, page, pageSize)` → `{ pageItems: T[], totalPages: number, page: number }`. `totalPages` is `Math.max(1, Math.ceil(items.length / pageSize))`; `page` in the input is clamped to `[1, totalPages]` before slicing; the returned `page` is the clamped value. Bridged as `window.paginate`.
  - `export function sortUnmatched(list, key, dir = 'asc')` → new array, keys `'name'` (by `display_name`, case/accent-insensitive), `'hours'`, `'projects'` (numeric ascending/descending per `dir`); unknown key falls back to `'hours'`; ties break by `display_name` ascending, then original index (stable). Bridged as `window.sortUnmatched`.

- [ ] **Step 1: Write the failing tests**

Append to `js/lib/team-ui.test.js` (after the existing `import` line, add `paginate, sortUnmatched` to the import list — the full new import line is `import { sortResources, filterComboOptions, buildProfileTree, paginate, sortUnmatched } from './team-ui.js';`), then add at the end of the file:

```js
describe('paginate', () => {
  it('returns everything on one page when it fits', () => {
    const items = [1, 2, 3];
    const r = paginate(items, 1, 25);
    expect(r).toEqual({ pageItems: [1, 2, 3], totalPages: 1, page: 1 });
  });

  it('slices the requested page', () => {
    const items = Array.from({ length: 30 }, (_, i) => i + 1);
    const r = paginate(items, 2, 25);
    expect(r.pageItems).toEqual([26, 27, 28, 29, 30]);
    expect(r.totalPages).toBe(2);
    expect(r.page).toBe(2);
  });

  it('clamps a page number below 1 up to 1', () => {
    const r = paginate([1, 2, 3], 0, 25);
    expect(r.page).toBe(1);
    expect(r.pageItems).toEqual([1, 2, 3]);
  });

  it('clamps a page number past the end back to the last page', () => {
    const items = Array.from({ length: 30 }, (_, i) => i + 1);
    const r = paginate(items, 99, 25);
    expect(r.page).toBe(2);
    expect(r.pageItems).toEqual([26, 27, 28, 29, 30]);
  });

  it('an empty list has exactly one (empty) page, never zero', () => {
    const r = paginate([], 1, 25);
    expect(r).toEqual({ pageItems: [], totalPages: 1, page: 1 });
  });
});

describe('sortUnmatched', () => {
  const rows = [
    { name_normalized: 'a', display_name: 'Bianchi Anna', hours: 9, projects: 2 },
    { name_normalized: 'b', display_name: 'alighieri dante', hours: 10, projects: 1 },
    { name_normalized: 'c', display_name: 'Verdi Carlo', hours: 3, projects: 10 },
  ];

  it('sorts by hours ascending, numerically not lexically (9 before 10)', () => {
    const sorted = sortUnmatched(rows, 'hours', 'asc');
    expect(sorted.map(r => r.hours)).toEqual([3, 9, 10]);
  });

  it('sorts by hours descending', () => {
    const sorted = sortUnmatched(rows, 'hours', 'desc');
    expect(sorted.map(r => r.hours)).toEqual([10, 9, 3]);
  });

  it('sorts by projects numerically (2 before 10, not "10" before "2")', () => {
    const sorted = sortUnmatched(rows, 'projects', 'asc');
    expect(sorted.map(r => r.projects)).toEqual([1, 2, 10]);
  });

  it('sorts by name, case/accent-insensitive', () => {
    const sorted = sortUnmatched(rows, 'name', 'asc');
    expect(sorted.map(r => r.display_name)).toEqual(['alighieri dante', 'Bianchi Anna', 'Verdi Carlo']);
  });

  it('does not mutate the input array', () => {
    const copy = rows.slice();
    sortUnmatched(rows, 'hours', 'asc');
    expect(rows).toEqual(copy);
  });

  it('falls back to hours ordering for an unknown key', () => {
    const sorted = sortUnmatched(rows, 'nonsense', 'asc');
    expect(sorted.map(r => r.hours)).toEqual([3, 9, 10]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `paginate`/`sortUnmatched` are not exported from `./team-ui.js` yet (import error or `undefined` calls).

- [ ] **Step 3: Implement `paginate` and `sortUnmatched`**

In `js/lib/team-ui.js`, add after the existing `sortResources` function (after its closing `}` and before the `function fold(s) {` block):

```js
// items: any array. Clamps `page` into [1, totalPages] (an empty list has exactly one, empty,
// page — never zero, so callers never divide by zero or show "Page 1 of 0"). Does not mutate.
export function paginate(items, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const start = (clampedPage - 1) * pageSize;
  return { pageItems: items.slice(start, start + pageSize), totalPages, page: clampedPage };
}

const UNMATCHED_COMPARATORS = {
  name: (a, b) => cmp(a.display_name, b.display_name),
  hours: (a, b) => (Number(a.hours) || 0) - (Number(b.hours) || 0),
  projects: (a, b) => (Number(a.projects) || 0) - (Number(b.projects) || 0),
};

// Same shape/stability contract as sortResources (new array, ties fall back to name ascending
// then original position), over the /api/resources/unmatched row shape instead of a resource.
export function sortUnmatched(list, key, dir = 'asc') {
  const sign = dir === 'desc' ? -1 : 1;
  const primary = UNMATCHED_COMPARATORS[key] || UNMATCHED_COMPARATORS.hours;
  return list
    .map((item, index) => ({ item, index }))
    .sort((x, y) => (primary(x.item, y.item) * sign) || cmp(x.item.display_name, y.item.display_name) || (x.index - y.index))
    .map(entry => entry.item);
}
```

Then, next to the existing bridge lines near the bottom of the file, add:

```js
window.paginate = paginate;
window.sortUnmatched = sortUnmatched;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all `team-ui.test.js` tests green, including the new `paginate`/`sortUnmatched` describe blocks.

- [ ] **Step 5: Commit**

```bash
git add js/lib/team-ui.js js/lib/team-ui.test.js
git commit -m "feat: add paginate() and sortUnmatched() to js/lib/team-ui.js"
```

---

### Task 3: `team.html` — Team tab pagination

**Files:**
- Modify: `team.html`

**Interfaces:**
- Consumes: `window.paginate` from Task 2.
- Produces: `teamPage` (data), `pagedResources` (computed), no new methods needed beyond a small watcher.

- [ ] **Step 1: Add `teamPage` to `data()`**

In `team.html`, the `data()` return object currently has (around line 376-382):

```js
          pageTab: 'team',
          sortKey: 'name',
          sortDir: 'asc',
```

Add `teamPage: 1,` right after `pageTab: 'team',`:

```js
          pageTab: 'team',
          teamPage: 1,
          sortKey: 'name',
          sortDir: 'asc',
```

- [ ] **Step 2: Add the `pagedResources` computed**

In the `computed` block, right after `sortedResources()` (currently at team.html:397-399):

```js
        sortedResources() {
          return window.sortResources(this.filteredResources, this.sortKey, this.sortDir);
        },
```

add:

```js
        pagedResources() {
          return window.paginate(this.sortedResources, this.teamPage, 25);
        },
```

- [ ] **Step 3: Reset `teamPage` to 1 when the filtered/sorted set changes**

In the `watch` block (team.html:411-420), add a new entry:

```js
        sortedResources() { this.teamPage = 1; },
```

(Watching the computed `sortedResources` — not `filteredResources` alone — so a sort-direction change also resets the page, matching the spec's "cambiare ricerca, 'Show inactive' o ordinamento riporta alla pagina 1".)

- [ ] **Step 4: Update the table body to iterate the paged slice**

Replace (team.html:66):

```html
              <tr v-for="r in sortedResources" :key="r.id" style="cursor:pointer"
```

with:

```html
              <tr v-for="r in pagedResources.pageItems" :key="r.id" style="cursor:pointer"
```

- [ ] **Step 5: Add pagination controls below the table**

After the closing `</table>` and its sibling `<div class="empty" v-else>...</div>` (team.html:85-86), i.e. right before the `</div></div>` that closes `.card-body`/`.card` (team.html:87-88), insert:

```html
          <div class="d-flex justify-content-between align-items-center mt-2" v-if="pagedResources.totalPages > 1">
            <button class="btn btn-outline-secondary btn-sm" :disabled="teamPage <= 1" @click="teamPage--">‹ Previous</button>
            <span class="text-muted small">Page {{ pagedResources.page }} of {{ pagedResources.totalPages }}</span>
            <button class="btn btn-outline-secondary btn-sm" :disabled="teamPage >= pagedResources.totalPages" @click="teamPage++">Next ›</button>
          </div>
```

- [ ] **Step 6: Manual smoke check**

This task has no automated test (Vue template logic, no `js/lib/` extraction needed — it's a thin wrapper over `paginate()`, already unit-tested in Task 2). Defer verification to Task 5's manual check, which exercises the whole page together with Task 4's changes.

- [ ] **Step 7: Commit**

```bash
git add team.html
git commit -m "feat: paginate the Team table (25 rows/page)"
```

---

### Task 4: `team.html` — Unmatched tab search, sort, paging, project list

**Files:**
- Modify: `team.html`

**Interfaces:**
- Consumes: `window.sortUnmatched`, `window.paginate` from Task 2; the new `project_codes` field on each `unmatched` row from Task 1.
- Produces: `unmatchedFilterText`, `unmatchedSortKey`, `unmatchedSortDir`, `unmatchedPage`, `expandedProjects` (data); `filteredUnmatched`, `sortedUnmatched`, `pagedUnmatched` (computed); `unmatchedSortBy(key)`, `unmatchedSortIndicator(key)`, `toggleProjects(u)` (methods).

- [ ] **Step 1: Add the new state to `data()`**

Right after `unmatchedError: null,` (team.html — see the `data()` block already touched in Task 3):

```js
          unmatchedError: null,
          unmatchedFilterText: '',
          unmatchedSortKey: 'hours',
          unmatchedSortDir: 'desc',
          unmatchedPage: 1,
          expandedProjects: new Set(),
```

- [ ] **Step 2: Add the three computed properties**

Right after `pagedResources()` (added in Task 3, Step 2), add:

```js
        filteredUnmatched() {
          const q = this.unmatchedFilterText.trim().toLowerCase();
          if (!q) return this.unmatched;
          return this.unmatched.filter(u => u.display_name.toLowerCase().includes(q));
        },
        sortedUnmatched() {
          return window.sortUnmatched(this.filteredUnmatched, this.unmatchedSortKey, this.unmatchedSortDir);
        },
        pagedUnmatched() {
          return window.paginate(this.sortedUnmatched, this.unmatchedPage, 25);
        },
```

- [ ] **Step 3: Reset `unmatchedPage` to 1 on filter/sort/list changes**

In the `watch` block, add:

```js
        sortedUnmatched() { this.unmatchedPage = 1; },
```

(Same reasoning as Task 3 Step 3: `sortedUnmatched` already reacts to `unmatchedFilterText`, `unmatchedSortKey`/`Dir`, and — because it derives from `filteredUnmatched` which derives from `this.unmatched` — to `loadUnmatched()` re-fetches after Assign/Ignore/Rescan too, satisfying the spec's page-reset list in one watcher.)

- [ ] **Step 4: Add the sort/toggle methods**

Right after the existing `sortIndicator(key) { ... }` method (team.html:508-510), add:

```js
        unmatchedSortBy(key) {
          if (this.unmatchedSortKey === key) this.unmatchedSortDir = this.unmatchedSortDir === 'asc' ? 'desc' : 'asc';
          else { this.unmatchedSortKey = key; this.unmatchedSortDir = 'asc'; }
        },
        unmatchedSortIndicator(key) {
          return this.unmatchedSortKey === key ? (this.unmatchedSortDir === 'asc' ? '▲' : '▼') : '';
        },
        toggleProjects(u) {
          const key = u.name_normalized;
          if (this.expandedProjects.has(key)) this.expandedProjects.delete(key);
          else this.expandedProjects.add(key);
        },
```

- [ ] **Step 5: Add a search box above the Unmatched table**

Before the `<p class="text-muted small mb-3">Names found...` line (team.html:100), insert:

```html
          <input v-model="unmatchedFilterText" type="text" class="form-control form-control-sm mb-2" style="max-width:280px"
                 placeholder="Search name…">
```

- [ ] **Step 6: Make the table headers sortable**

Replace (team.html:104):

```html
              <tr><th>Name in actuals</th><th class="text-end">Hours</th><th class="text-end">Projects</th><th>Assign to</th><th></th></tr>
```

with:

```html
              <tr>
                <th class="sortable-th" @click="unmatchedSortBy('name')">Name in actuals {{ unmatchedSortIndicator('name') }}</th>
                <th class="sortable-th text-end" @click="unmatchedSortBy('hours')">Hours {{ unmatchedSortIndicator('hours') }}</th>
                <th class="sortable-th text-end" @click="unmatchedSortBy('projects')">Projects {{ unmatchedSortIndicator('projects') }}</th>
                <th>Assign to</th><th></th>
              </tr>
```

- [ ] **Step 7: Switch the row loop to the paged slice, and make the Projects cell expandable**

Replace (team.html:107 and 112):

```html
              <tr v-for="u in unmatched" :key="u.name_normalized">
```

with:

```html
              <tr v-for="u in pagedUnmatched.pageItems" :key="u.name_normalized">
```

and replace:

```html
                <td class="text-end">{{ u.projects }}</td>
```

with:

```html
                <td class="text-end">
                  <a href="#" @click.prevent="toggleProjects(u)">{{ u.projects }}</a>
                  <div v-if="expandedProjects.has(u.name_normalized)" class="text-muted small mt-1">
                    {{ (u.project_codes || []).join(', ') }}
                  </div>
                </td>
```

- [ ] **Step 8: Add pagination controls below the Unmatched table**

Right after the closing `</table>` and its sibling `<div class="empty" v-else>No unmatched names.</div>` (team.html:123-124), insert:

```html
          <div class="d-flex justify-content-between align-items-center mt-2" v-if="pagedUnmatched.totalPages > 1">
            <button class="btn btn-outline-secondary btn-sm" :disabled="unmatchedPage <= 1" @click="unmatchedPage--">‹ Previous</button>
            <span class="text-muted small">Page {{ pagedUnmatched.page }} of {{ pagedUnmatched.totalPages }}</span>
            <button class="btn btn-outline-secondary btn-sm" :disabled="unmatchedPage >= pagedUnmatched.totalPages" @click="unmatchedPage++">Next ›</button>
          </div>
```

- [ ] **Step 9: Bump the `js/lib/team-ui.js` cache-buster**

Replace (team.html:344):

```html
    <script type="module" src="js/lib/team-ui.js?v=2"></script>
```

with:

```html
    <script type="module" src="js/lib/team-ui.js?v=3"></script>
```

(This is the file's only consumer — confirmed by `docs/js/lib.md`'s note "only `team.html` loads it" — so no other file needs its `?v=` bumped for this change.)

- [ ] **Step 10: Commit**

```bash
git add team.html
git commit -m "feat: search/sort/paging on the Unmatched names queue, expandable project list"
```

---

### Task 5: Manual verification and docs sync

**Files:**
- Modify: `TEST_CASES.md` (add manual cases)
- Modify: `docs/pages/team.md`
- Modify: `docs/api/resources.md`

**Interfaces:**
- Consumes: everything from Tasks 1-4 (this task verifies the finished feature, then documents it).

- [ ] **Step 1: Run the full frontend test suite**

Run: `npm test`
Expected: PASS — all vitest suites green, including `js/lib/team-ui.test.js`'s new tests from Task 2.

- [ ] **Step 2: Add manual test cases to `TEST_CASES.md`**

Find the section covering the Team UX cycle (search "Team UX" in `TEST_CASES.md`) and add, in the same numbering style as the surrounding cases:

```markdown
- [ ] TM-XX: Team tab with 26+ active resources shows "Page 1 of 2" and Previous/Next controls; Next shows the remaining rows; changing the search text or clicking a sortable header resets to page 1.
- [ ] TM-XX: Team tab with 25 or fewer resources shows no pagination controls.
- [ ] TM-XX: Unmatched names tab — typing in the search box filters rows by name (case/accent-insensitive); clearing it shows all rows again.
- [ ] TM-XX: Unmatched names tab — clicking the Name/Hours/Projects headers sorts ascending, a second click reverses it, with an arrow on the active header.
- [ ] TM-XX: Unmatched names tab — clicking a row's Projects count expands a list of the project codes that name appears in; clicking again collapses it.
- [ ] TM-XX: Unmatched names tab with 26+ rows shows pagination controls; assigning/ignoring a name that empties the last page returns to a valid page instead of a blank one.
```

(Replace `TM-XX` with the next free sequence number in the file when editing — do not leave it literally as `TM-XX`.)

- [ ] **Step 3: Perform the manual checks**

Per project convention (`docs/superpowers/PROCESS.md` §1, `/finish-cycle` gate), manual verification runs against the isolated branch stack (`scripts/test-branch.sh up`), not the main stack. This step is executed at `/finish-cycle` time, not here — leave the checkboxes in `TEST_CASES.md` unchecked; `/finish-cycle`'s manual-verification gate will check them off after running the app.

- [ ] **Step 4: Update `docs/pages/team.md`**

In the "## Team UX (2026-09-25)" section, replace the line:

```markdown
- **Still not done:** search/sort/height limit on the unmatched queue itself, candidate suggestion, projects per name, Team list paging, inline editing, a dedicated `resource.html`, `?resourceId=` deep link — all explicitly out of scope; the navigation-architecture audit (sidebar) is its own later cycle.
```

with:

```markdown
- **Still not done:** candidate suggestion, inline editing, a dedicated `resource.html`, `?resourceId=` deep link — out of scope. Search/sort/paging on the unmatched queue, Team list paging, and the expandable project-codes list were added in the "Team UX polish" cycle below.

## Team UX polish (2026-09-28)

Spec `docs/superpowers/specs/2026-09-28-team-ux-polish-design.md`, plan `docs/superpowers/plans/2026-09-28-team-ux-polish.md`. Frontend + one additive backend field.

- **Team tab paging:** `teamPage` state, `pagedResources` computed (`window.paginate(sortedResources, teamPage, 25)`), Previous/Next controls shown only when `totalPages > 1`; resets to page 1 whenever `sortedResources` changes (search, "Show inactive", or sort).
- **Unmatched names — search, sort, paging:** a search box (matches `display_name`, case/accent-insensitive) plus sortable Name/Hours/Projects headers (`window.sortUnmatched`, numeric-aware — `9` sorts before `10`), same paging pattern as the Team tab (`unmatchedPage`/`pagedUnmatched`, page size 25, resets on filter/sort/list change).
- **Project list per name:** the "Projects" cell's count is clickable and expands to the project codes that name appears in (`GET /api/resources/unmatched` now also returns `project_codes: string[]`, alongside the unchanged `projects` count).
- **Candidate suggestion (token-overlap) — explicitly parked, not built here:** see `project_team_ux_backlog.md` memory.
```

- [ ] **Step 5: Update `docs/api/resources.md`**

In the "## Actuals owner-name matching (Cycle 3b, 2026-09-25)" section, after the line describing `GET /api/resources/unmatched`'s response shape (or, if not explicitly listed there, add a new short paragraph), note:

```markdown
- **`project_codes` added (2026-09-28, Team UX polish cycle):** `GET /api/resources/unmatched` now also returns `project_codes: string[]` per row (alphabetically sorted `DISTINCT project_code`), alongside the unchanged `projects` count — backs `team.html`'s expandable "which projects does this name appear in" list. See `docs/pages/team.md`.
```

- [ ] **Step 6: Commit the docs**

```bash
git add TEST_CASES.md docs/pages/team.md docs/api/resources.md
git commit -m "docs: sync team.md/resources.md/TEST_CASES.md for the Team UX polish cycle"
```

---

## Self-Review Notes

**Spec coverage:** §2.1 (search) → Task 4 Step 5; §2.2 (sort) → Task 4 Steps 4/6; §2.3 (paging both tabs) → Tasks 3-4; §2.4 (Team paging) → Task 3; §2.5 (project list) → Task 4 Step 7. §3 API/design decisions → Task 1 (API), Task 2 (`paginate`/`sortUnmatched`). §4 out-of-scope items are not implemented anywhere in this plan (confirmed by grep of task list — no candidate-suggestion, no `resource.html`, no deep link). §5 constraints → Global Constraints section + Task 4 Step 9 (`?v=` bump). §6 acceptance criteria 1-4 → manual cases in Task 5 Step 2; criterion 5 (`npm test` green) → Task 2 Step 4 and Task 5 Step 1; criterion 6 (no regression on `projects` count) → Task 1's query only adds a column, doesn't touch the existing aggregation.

**Placeholder scan:** none — every step has literal code/markdown, no "TBD"/"similar to Task N".

**Type consistency:** `paginate`/`sortUnmatched` signatures match between Task 2's implementation and Tasks 3-4's call sites (`window.paginate(list, page, pageSize)`, `window.sortUnmatched(list, key, dir)`). `u.name_normalized` used consistently as the row key across `assignChoice`, `expandedProjects`, `:key`.

**Review Focus coverage:** empty unmatched list → Task 2 Step 1's `paginate([], 1, 25)` test; ≤25 rows hides controls → `v-if="totalPages > 1"` in Task 3 Step 5 / Task 4 Step 8, plus manual case in Task 5; page pointing past the end after a row leaves the list → Task 2 Step 1's "clamps a page number past the end" test covers the pure function, and Task 4 Step 3's watcher covers the Vue-level reset after `loadUnmatched()`; numeric sort correctness → Task 2 Step 1's `sortUnmatched` tests use 9-vs-10 fixtures specifically; blank/whitespace-only search → mirrors the existing `filteredResources` `.trim()` pattern, `filteredUnmatched` in Task 4 Step 2 uses the same `.trim().toLowerCase()` before checking emptiness.
