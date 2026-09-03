# Timesheets: Client/Project/Pipeline-year columns, Fee/Spent, XLSX export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Client/Project/Project-code columns with filtering, sorting, and a pipeline-year selector to the Timesheets summary table; add per-row Fee/Spent to the "View" grid, snapshotted at upload time; replace the CSV export with an XLSX export carrying the same columns.

**Architecture:** Backend: extend `GET /api/timesheets` with `LEFT JOIN`s to `projects`/`clients`/`cost_grid_versions` for display metadata, and resolve+snapshot a `fee` value into every timesheet entry's JSONB at `POST /api/timesheets/upload` time using a new pure-function rate resolver (mirrors `js/core.js`'s `findRate`). Frontend: `timesheets.html`'s existing Vue instance gains new computed filters/sort over the already-loaded summary rows, a pipeline-year selector reusing `Api.pipelineYears.list()`, Fee/Spent columns in the "View" modal derived from the snapshotted `fee`, and an ExcelJS-based export replacing the CSV Blob export.

**Tech Stack:** Node/Express + PostgreSQL (backend), Vue 3 (CDN, no build step) + Bootstrap 5 (frontend), `node:test` for backend pure-function unit tests, ExcelJS (CDN) for XLSX generation.

## Global Constraints

- Page stays admin-only (`timesheets.html:184`, unchanged).
- No rounding of `fee` — stored and displayed as the raw decimal `hourlyRate` value.
- `fee` resolution source is exclusively `project_tasks.resources[].hourlyRate`, matched case-insensitively on task name + role, with fallback to the task's first resource, otherwise `0` — never `null`, never blocks the upload.
- No data-migration script for historical entries — legacy rows render `Fee`/`Spent` as `0` until the corresponding project's XLS is manually re-uploaded.
- ExcelJS pinned version: `4.4.0` (same CDN URL already used in `planning.html`/`costgrid.html`: `https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js`).
- CSV export button is replaced, not kept alongside XLSX.
- All new user-facing text in English (project-wide constraint, `CLAUDE.md`).
- Client/Project/Project-code filters and their sorting are client-side only — no new backend query params.
- Client/Project dropdown options are NOT recomputed when the pipeline-year filter changes (stay fixed on the full loaded dataset).

---

## File Structure

- **Create:** `api/src/lib/rate-resolve.js` — pure function resolving an hourly rate for a task+role pair against a project's task list. Mirrors `js/core.js:264-272`'s `findRate`, ported to the backend.
- **Create:** `api/src/lib/rate-resolve.test.js` — `node:test` unit tests for the above.
- **Modify:** `api/src/routes/timesheets.js` — extend `GET /` with the new joins; wire `resolveFee` into `POST /upload` to snapshot `fee` per entry.
- **Modify:** `timesheets.html` — summary table (new columns, filters, sorting, pipeline-year selector), "View" modal (Fee/Spent columns), export (ExcelJS XLSX replacing CSV Blob), new `<script>` tag for ExcelJS.

---

### Task 1: Backend — pure fee-resolution function

**Files:**
- Create: `api/src/lib/rate-resolve.js`
- Test: `api/src/lib/rate-resolve.test.js`

**Interfaces:**
- Produces: `resolveFee(tasks, taskName, role)` — `tasks: Array<{ name: string, resources: Array<{ role: string, hourlyRate: number }> }>`, `taskName: string|null`, `role: string|null` → `number` (never `null`, defaults to `0`). Consumed by Task 2.

- [ ] **Step 1: Write the failing tests**

Create `api/src/lib/rate-resolve.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveFee } = require('./rate-resolve');

test('resolveFee: exact task+role match returns that resource\'s hourlyRate', () => {
  const tasks = [
    { name: 'Design', resources: [{ role: 'Designer', hourlyRate: 50 }, { role: 'PM', hourlyRate: 80 }] },
  ];
  assert.equal(resolveFee(tasks, 'Design', 'PM'), 80);
});

test('resolveFee: task name match is case-insensitive', () => {
  const tasks = [{ name: 'Design', resources: [{ role: 'Designer', hourlyRate: 50 }] }];
  assert.equal(resolveFee(tasks, 'DESIGN', 'Designer'), 50);
});

test('resolveFee: role match is case-insensitive', () => {
  const tasks = [{ name: 'Design', resources: [{ role: 'Designer', hourlyRate: 50 }] }];
  assert.equal(resolveFee(tasks, 'Design', 'designer'), 50);
});

test('resolveFee: task matches but role does not — falls back to first resource', () => {
  const tasks = [{ name: 'Design', resources: [{ role: 'Designer', hourlyRate: 50 }, { role: 'PM', hourlyRate: 80 }] }];
  assert.equal(resolveFee(tasks, 'Design', 'QA'), 50);
});

test('resolveFee: no task name match returns 0', () => {
  const tasks = [{ name: 'Design', resources: [{ role: 'Designer', hourlyRate: 50 }] }];
  assert.equal(resolveFee(tasks, 'Development', 'Designer'), 0);
});

test('resolveFee: task matches but has no resources returns 0', () => {
  const tasks = [{ name: 'Design', resources: [] }];
  assert.equal(resolveFee(tasks, 'Design', 'Designer'), 0);
});

test('resolveFee: empty tasks array returns 0', () => {
  assert.equal(resolveFee([], 'Design', 'Designer'), 0);
});

test('resolveFee: null taskName never throws, returns 0', () => {
  const tasks = [{ name: 'Design', resources: [{ role: 'Designer', hourlyRate: 50 }] }];
  assert.equal(resolveFee(tasks, null, 'Designer'), 0);
});

test('resolveFee: null role never throws, falls back to first resource', () => {
  const tasks = [{ name: 'Design', resources: [{ role: 'Designer', hourlyRate: 50 }] }];
  assert.equal(resolveFee(tasks, 'Design', null), 50);
});

test('resolveFee: a matched resource with a falsy hourlyRate returns 0, not undefined', () => {
  const tasks = [{ name: 'Design', resources: [{ role: 'Designer', hourlyRate: 0 }] }];
  assert.equal(resolveFee(tasks, 'Design', 'Designer'), 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `api/`): `node --test src/lib/rate-resolve.test.js`
Expected: FAIL — `Cannot find module './rate-resolve'`

- [ ] **Step 3: Write the implementation**

Create `api/src/lib/rate-resolve.js`:

```js
// Resolves the hourly rate for a (taskName, role) pair against a project's task list.
// Mirrors js/core.js's findRate() so a snapshotted `fee` matches what the frontend
// would compute live from the same project configuration. Never throws, never
// returns null — an unresolved rate is 0, matching the "no data" display convention
// used for Fee/Spent throughout the Timesheets page.
function resolveFee(tasks, taskName, role) {
  const tName = (taskName || '').toLowerCase();
  const rName = (role || '').toLowerCase();
  for (const task of (tasks || [])) {
    if ((task.name || '').toLowerCase() !== tName) continue;
    const resources = task.resources || [];
    for (const res of resources) {
      if ((res.role || '').toLowerCase() === rName) return res.hourlyRate || 0;
    }
    if (resources.length) return resources[0].hourlyRate || 0;
  }
  return 0;
}

module.exports = { resolveFee };
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `api/`): `node --test src/lib/rate-resolve.test.js`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/rate-resolve.js api/src/lib/rate-resolve.test.js
git commit -m "$(cat <<'EOF'
feat: add pure fee-resolution helper for timesheet entries

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Czd2T16Y3TbXF4H5XCVRog
EOF
)"
```

---

### Task 2: Backend — snapshot `fee` on upload

**Files:**
- Modify: `api/src/routes/timesheets.js:87-165` (the `POST /upload` handler)

**Interfaces:**
- Consumes: `resolveFee(tasks, taskName, role)` from Task 1 (`require('../lib/rate-resolve')`).
- Produces: every entry inserted into `timesheets.data` now carries a `fee: number` field. Consumed by Task 4/5 (frontend display) — no other backend task depends on this.

- [ ] **Step 1: Add the require and a batch task-lookup helper**

In `api/src/routes/timesheets.js`, add near the top (after the existing `require`s, before `const router = ...`):

```js
const { resolveFee } = require('../lib/rate-resolve');
```

Add a new helper function near `trimRowKeys` (after it, before the `FIELD_CANDIDATES` section):

```js
// Batch-loads { name, resources } task lists for every given project code,
// keyed by project_code. One query for the whole upload, not one per row.
async function loadProjectTasksByCode(codes) {
  if (!codes.length) return {};
  const { rows } = await query(
    `SELECT p.code,
            COALESCE(
              (SELECT json_agg(json_build_object('name', pt.name, 'resources', pt.resources))
               FROM project_tasks pt WHERE pt.project_id = p.id),
              '[]'::json
            ) AS tasks
     FROM projects p
     WHERE p.code = ANY($1::text[])`,
    [codes]
  );
  const map = {};
  for (const row of rows) map[row.code] = row.tasks || [];
  return map;
}
```

- [ ] **Step 2: Wire fee resolution into the upload handler**

In `POST /upload` (`api/src/routes/timesheets.js`), the entries are grouped by `projectCode` and then filtered down to `codesToSave` (existing code, lines ~103-149). Immediately after the `codes` array is computed and validated (right after the `if (!codes.length) { ... }` block, before the `for (const code of codes) { ... }` save loop), add:

```js
    const projectTasksByCode = await loadProjectTasksByCode(codes);
    for (const code of codes) {
      const tasks = projectTasksByCode[code] || [];
      for (const entry of codesToSave[code]) {
        entry.fee = resolveFee(tasks, entry.task, entry.role);
      }
    }
```

This must run before the existing `for (const code of codes) { await query('DELETE FROM timesheets ...'); await query('INSERT INTO timesheets ...'); }` loop, since that loop is what serializes `codesToSave[code]` to JSON.

- [ ] **Step 3: Manual verification (no route-level test infra exists in this repo — `timesheets.test.js` covers pure helpers only, not DB-backed handlers)**

Start the branch-isolated stack and upload a test XLS:

```bash
scripts/test-branch.sh up
```

- Log in as an admin on the test-branch frontend port, go to a project that has at least one task with a resource `hourlyRate` set (Project Config page), note the task name, role, and hourly rate.
- Go to Project Reporting → "Load XLS" and upload a timesheet file for that project's code containing a row with that exact task/role.
- Run, against the test-branch DB port (see `.env`/`scripts/test-branch.sh` for the port):

```bash
docker exec pdash-db-branch psql -U pdash -d pdash -c "SELECT data FROM timesheets WHERE project_code = '<the project code>';"
```

(Adjust the container name to whatever `scripts/test-branch.sh up` printed for the DB container.)

- Confirm the returned `data` JSONB array has a `"fee"` key on each entry, and that the entry matching the known task/role has a `fee` equal to that resource's `hourlyRate`.
- Confirm a row whose task/role has no configured resource shows `"fee":0`.

- [ ] **Step 4: Commit**

```bash
git add api/src/routes/timesheets.js
git commit -m "$(cat <<'EOF'
feat: snapshot resolved fee onto each timesheet entry at upload time

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Czd2T16Y3TbXF4H5XCVRog
EOF
)"
```

---

### Task 3: Backend — extend `GET /api/timesheets` with client/project/pipeline-year/currency

**Files:**
- Modify: `api/src/routes/timesheets.js:29-47` (the `GET /` handler)

**Interfaces:**
- Produces: each row returned by `GET /api/timesheets` gains `client_name: string|null`, `project_name: string|null`, `pipeline_year: number|null`, `currency: string|null` (ISO code, e.g. `'EUR'`). Consumed by Task 4 (summary table) and Task 5 (currency for Fee/Spent formatting in the "View" modal).

- [ ] **Step 1: Extend the query**

Replace the query body in `GET /` (`api/src/routes/timesheets.js:34-44`):

```js
    const { rows } = await query(
      `SELECT t.project_code,
              COUNT(*)::int           AS uploads,
              MAX(t.uploaded_at)      AS last_uploaded,
              SUM(jsonb_array_length(t.data)) AS total_rows,
              c.name   AS client_name,
              p.name   AS project_name,
              p.currency AS currency,
              cgv.pipeline_year AS pipeline_year
       FROM timesheets t
       LEFT JOIN projects p             ON p.code = t.project_code
       LEFT JOIN clients c              ON c.id = p.client_id
       LEFT JOIN cost_grid_versions cgv ON cgv.id = p.cg_version_id
       WHERE t.project_code = ANY($1::text[])
       GROUP BY t.project_code, c.name, p.name, p.currency, cgv.pipeline_year
       ORDER BY t.project_code`,
      [codes]
    );
```

- [ ] **Step 2: Manual verification**

With `scripts/test-branch.sh up` still running (from Task 2) and the test upload already in place:

```bash
curl -s -b "<your session cookie>" http://localhost:<test-branch-frontend-port>/api/timesheets | python -m json.tool
```

(Or open the Network tab in the browser while on `/timesheets.html` and inspect the `GET /api/timesheets` response.)

- Confirm the row for the uploaded project's code carries the correct `client_name`, `project_name`, `currency`, and (if that project has a pipeline year set) `pipeline_year`.
- Confirm a `project_code` with no matching `projects` row (upload a second test file with a made-up, unused code) returns `client_name: null, project_name: null, currency: null, pipeline_year: null` and does not error.

- [ ] **Step 3: Commit**

```bash
git add api/src/routes/timesheets.js
git commit -m "$(cat <<'EOF'
feat: return client, project, currency and pipeline year on GET /api/timesheets

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Czd2T16Y3TbXF4H5XCVRog
EOF
)"
```

---

### Task 4: Frontend — summary table columns, filters, sorting, pipeline-year selector

**Files:**
- Modify: `timesheets.html` (template around lines 61-106, `data()`/`created()`/`methods` around lines 168-254)

**Interfaces:**
- Consumes: `GET /api/timesheets` rows now carrying `client_name`, `project_name`, `currency`, `pipeline_year` (Task 3); `Api.pipelineYears.list()` (`js/api.js:157-162`, unchanged); `Api.currencies.active()` (`js/api.js:176-182`, unchanged).
- Produces: `this.filteredRows` (computed) — the sorted/filtered row list consumed by the table `v-for` and, for currency lookups, by Task 5's `viewRows(r)`/export methods via the `r` object already carrying `currency`.

- [ ] **Step 1: Add table header/body markup for the 3 new columns + sort indicators**

Replace the `<thead>`/`<tbody>` block in `timesheets.html` (currently lines 64-99) with:

```html
        <table class="table table-hover" v-if="filteredRows.length">
          <thead>
            <tr>
              <th style="cursor:pointer" @click="toggleSort('client_name')">Client{{ sortIndicator('client_name') }}</th>
              <th style="cursor:pointer" @click="toggleSort('project_name')">Project{{ sortIndicator('project_name') }}</th>
              <th style="cursor:pointer" @click="toggleSort('project_code')">Project code{{ sortIndicator('project_code') }}</th>
              <th class="text-end">Uploads</th>
              <th class="text-end">Rows</th>
              <th>Last uploaded</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in filteredRows" :key="r.project_code">
              <td>{{ r.client_name || '—' }}</td>
              <td>{{ r.project_name || '—' }}</td>
              <td><code>{{ r.project_code }}</code></td>
              <td class="text-end text-muted">{{ r.uploads }}</td>
              <td class="text-end fw-semibold">{{ r.total_rows.toLocaleString() }}</td>
              <td class="text-muted">{{ fmtDate(r.last_uploaded) }}</td>
              <td class="text-end" style="white-space:nowrap">
                <button class="btn btn-outline-secondary btn-sm me-1" style="font-size:.78rem"
                        @click="viewRows(r)">
                  👁 View
                </button>
                <button class="btn btn-outline-primary btn-sm me-1" style="font-size:.78rem"
                        @click="downloadXlsx(r)">
                  ⬇ XLSX
                </button>
                <button class="btn btn-outline-danger btn-sm"
                        style="font-size:.78rem"
                        :disabled="r._loading"
                        @click="deleteCode(r)">
                  <span v-if="r._loading" class="spinner-border spinner-border-sm"></span>
                  <span v-else>🗑 Delete all</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="empty" v-else>
          <div style="font-size:2rem">📂</div>
          <p class="mt-2 mb-0">{{ rows.length ? 'No timesheets match the current filters.' : 'No timesheets uploaded yet.' }}</p>
          <p class="text-muted small" v-if="!rows.length">Use <strong>Load XLS</strong> in the Project Reporting view to import timesheets.</p>
        </div>
```

(Note: `⬇ CSV` → `⬇ XLSX` and `downloadCsv` → `downloadXlsx` here — the method itself is written in Task 5, but the button markup change belongs with this table pass since it's in the same block being replaced.)

- [ ] **Step 2: Add the filter bar above the table**

Insert this new block right before the `<!-- ── TABLE ─────... -->` comment (before line 62 in the original file):

```html
    <!-- ── FILTERS ───────────────────────────────────────────── -->
    <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
      <div class="dropdown">
        <button class="btn btn-outline-secondary btn-sm dropdown-toggle" type="button"
                data-bs-toggle="dropdown" aria-expanded="false">
          Client{{ clientFilter.length ? ' (' + clientFilter.length + ')' : '' }}
        </button>
        <ul class="dropdown-menu p-2" style="max-height:260px;overflow-y:auto">
          <li v-for="name in clientOptions" :key="name" class="form-check">
            <input class="form-check-input" type="checkbox" :id="'cf-' + name"
                   :value="name" v-model="clientFilter" @click.stop>
            <label class="form-check-label" :for="'cf-' + name" @click.stop>{{ name }}</label>
          </li>
          <li v-if="!clientOptions.length" class="text-muted small px-2">No data</li>
        </ul>
      </div>
      <div class="dropdown">
        <button class="btn btn-outline-secondary btn-sm dropdown-toggle" type="button"
                data-bs-toggle="dropdown" aria-expanded="false">
          Project{{ projectFilter.length ? ' (' + projectFilter.length + ')' : '' }}
        </button>
        <ul class="dropdown-menu p-2" style="max-height:260px;overflow-y:auto">
          <li v-for="name in projectOptions" :key="name" class="form-check">
            <input class="form-check-input" type="checkbox" :id="'pf-' + name"
                   :value="name" v-model="projectFilter" @click.stop>
            <label class="form-check-label" :for="'pf-' + name" @click.stop>{{ name }}</label>
          </li>
          <li v-if="!projectOptions.length" class="text-muted small px-2">No data</li>
        </ul>
      </div>
      <input type="text" class="form-control form-control-sm" style="width:200px"
             placeholder="Filter by project code…" v-model="codeFilter">
      <select class="form-select form-select-sm" style="width:auto" v-model.number="selectedYearOption">
        <option :value="0">All years</option>
        <option v-for="py in pipelineYears" :key="py.year" :value="py.year">Pipeline {{ py.year }}</option>
      </select>
      <button v-if="clientFilter.length || projectFilter.length || codeFilter || selectedYearOption !== 0"
              class="btn btn-outline-secondary btn-sm" @click="resetFilters">↺ Reset filters</button>
    </div>
```

(`selectedYearOption` uses `0` as the "All years" sentinel rather than `null`, because a native `<select v-model.number>` option value of `null` does not round-trip cleanly through the DOM as a selectable `<option>` value — `0` is never a valid pipeline year so it's an unambiguous sentinel.)

- [ ] **Step 3: Add the new `data()` fields**

In the `data()` function (`timesheets.html:169-176`), replace:

```js
    data() {
      return {
        ready: false,
        rows:  [],
        error: null,
        modal: { show: false, loading: false, code: '', rows: [] },
      };
    },
```

with:

```js
    data() {
      return {
        ready: false,
        rows:  [],
        error: null,
        modal: { show: false, loading: false, code: '', rows: [] },
        pipelineYears: [],
        selectedYearOption: 0, // 0 = "All years" sentinel
        clientFilter: [],
        projectFilter: [],
        codeFilter: '',
        sortBy: null,
        sortDir: 'asc',
      };
    },
```

- [ ] **Step 4: Add computed properties**

Add a `computed` block to the Vue instance (after `data()`, before `async created()`):

```js
    computed: {
      clientOptions() {
        return [...new Set(this.rows.map(r => r.client_name).filter(Boolean))].sort();
      },
      projectOptions() {
        return [...new Set(this.rows.map(r => r.project_name).filter(Boolean))].sort();
      },
      filteredRows() {
        let out = this.rows.filter(r => {
          if (this.selectedYearOption !== 0 && r.pipeline_year !== this.selectedYearOption) return false;
          if (this.clientFilter.length && !this.clientFilter.includes(r.client_name)) return false;
          if (this.projectFilter.length && !this.projectFilter.includes(r.project_name)) return false;
          if (this.codeFilter && !r.project_code.toLowerCase().includes(this.codeFilter.toLowerCase())) return false;
          return true;
        });
        if (this.sortBy) {
          const dir = this.sortDir === 'asc' ? 1 : -1;
          out = [...out].sort((a, b) => {
            const av = (a[this.sortBy] || '').toString().toLowerCase();
            const bv = (b[this.sortBy] || '').toString().toLowerCase();
            return av < bv ? -dir : av > bv ? dir : 0;
          });
        }
        return out;
      },
    },
```

- [ ] **Step 5: Add methods for sorting, filter reset, and pipeline-year default resolution**

In the `methods` block (`timesheets.html:189-254`), add:

```js
      toggleSort(field) {
        if (this.sortBy !== field) { this.sortBy = field; this.sortDir = 'asc'; return; }
        if (this.sortDir === 'asc') { this.sortDir = 'desc'; return; }
        this.sortBy = null; this.sortDir = 'asc';
      },
      sortIndicator(field) {
        if (this.sortBy !== field) return '';
        return this.sortDir === 'asc' ? ' ▲' : ' ▼';
      },
      resetFilters() {
        this.clientFilter = [];
        this.projectFilter = [];
        this.codeFilter = '';
        this.selectedYearOption = 0;
      },
```

- [ ] **Step 6: Load pipeline years and resolve the default selected year in `created()`**

Replace `created()` (`timesheets.html:178-187`):

```js
    async created() {
      const user = await initNav('timesheets', { breadcrumbs: [
        { label: 'Home', href: '/pipeline.html' },
        { label: 'Timesheets' },
      ]});
      if (!user) return;
      if (user.role !== 'admin') { window.location.href = '/pipeline.html'; return; }

      try { this.pipelineYears = await Api.pipelineYears.list(); } catch (e) { this.pipelineYears = []; }
      const currentYear = new Date().getFullYear();
      const hasCurrentYear = this.pipelineYears.some(py => py.year === currentYear);
      this.selectedYearOption = hasCurrentYear ? currentYear
        : (this.pipelineYears.length ? this.pipelineYears[0].year : 0);

      await this.loadRows();
      this.ready = true;
    },
```

(`pipelineYears` from the API is ordered `year DESC` per the `idx_pipeline_years_year` index used by `pipeline.html`'s identical resolution logic at `pipeline.html:705-716`, so `[0]` is the most recent year — matches the design's stated default.)

- [ ] **Step 7: Manual verification**

```bash
scripts/test-branch.sh up
```

- Open `/timesheets.html` as admin. Confirm the table shows Client/Project/Project code as the first 3 columns, followed by Uploads/Rows/Last uploaded.
- Confirm an orphan project code (one with no matching `projects` row) shows `—`/`—` for Client/Project and the raw code for Project code.
- Click the Client/Project/Project code headers: confirm asc → desc → unsorted cycling and the ▲/▼ indicator.
- Open the Client dropdown, check a couple of boxes: confirm the table filters to matching rows and the button label shows the count.
- Type in the Project code filter: confirm substring, case-insensitive filtering.
- Change the pipeline-year selector: confirm rows without a `pipeline_year` disappear when a specific year is selected and reappear under "All years"; confirm the default on page load is the current year (or the most recent available year if the current year isn't in `pipelineYears`).
- Click "Reset filters": confirm all filters clear and the year returns to "All years"... — **note:** confirm this matches intent, or whether Reset should restore the *default* year rather than "All years"; if the latter is preferred, change `resetFilters()`'s `this.selectedYearOption = 0` to recompute the same default as `created()`.

- [ ] **Step 8: Commit**

```bash
git add timesheets.html
git commit -m "$(cat <<'EOF'
feat: add client/project/pipeline-year columns, filters and sorting to Timesheets

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Czd2T16Y3TbXF4H5XCVRog
EOF
)"
```

---

### Task 5: Frontend — Fee/Spent in the "View" modal and XLSX export

**Files:**
- Modify: `timesheets.html` (modal template ~lines 109-144, `methods` block, head `<script>` tags)

**Interfaces:**
- Consumes: `r.currency` from each summary row (Task 3/4); `resolveFee`-derived `entry.fee` already present in `GET /api/timesheets/:projectCode` responses (Task 2, for new uploads) or absent/`undefined` for legacy rows.
- Produces: `downloadXlsx(r)` method (replaces `downloadCsv(r)`), referenced by Task 4's table markup.

- [ ] **Step 1: Add the currencies + ExcelJS script tags**

In the `<head>`/script section of `timesheets.html`, after the existing `<script defer src="js/api.js?v=3"></script>` line (`timesheets.html:156`), add:

```html
<script defer src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"></script>
```

(No new dependency on `js/api-sync.js` — currencies are loaded directly via `Api.currencies.active()` in `created()`, step 2 below, keeping this page's script surface minimal as it is today.)

- [ ] **Step 2: Load currencies once in `created()`**

In `created()` (already modified by Task 4), add a currency load before `await this.loadRows();`:

```js
      try { window.__currencies = await Api.currencies.active(); }
      catch (e) { window.__currencies = [{ code: 'EUR', symbol: '€', locale: 'it-IT' }]; }

      await this.loadRows();
```

(`fmtMoney()` in `js/core.js:288-295`, already loaded on this page, reads `window.__currencies` — this makes it work without loading `js/api-sync.js`.)

- [ ] **Step 3: Track the currency of the project currently open in the modal**

In `data()`, add one field to `modal`:

```js
        modal: { show: false, loading: false, code: '', rows: [], currency: null },
```

- [ ] **Step 4: Add Fee/Spent columns to the modal table**

Replace the modal table (`timesheets.html:124-140`):

```html
            <table v-else class="table table-sm table-hover mb-0" style="font-size:.78rem">
              <thead>
                <tr>
                  <th>Date</th><th>Owner</th><th>Role</th><th>Task</th><th class="text-end">Hours</th><th>Notes</th>
                  <th class="text-end">Fee</th><th class="text-end">Spent</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in modal.rows" :key="i">
                  <td style="white-space:nowrap">{{ row.date }}</td>
                  <td>{{ row.owner }}</td>
                  <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ row.role }}</td>
                  <td>{{ row.task }}</td>
                  <td class="text-end fw-semibold">{{ row.hours }}</td>
                  <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" :title="row.notes">{{ row.notes }}</td>
                  <td class="text-end">{{ fmtMoney(row.fee || 0, modal.currency) }}</td>
                  <td class="text-end fw-semibold">{{ fmtMoney((row.fee || 0) * (row.hours || 0), modal.currency) }}</td>
                </tr>
              </tbody>
            </table>
```

- [ ] **Step 5: Pass the row's currency into the modal when opening it**

Replace `viewRows(r)` (`timesheets.html:213-227`):

```js
      async viewRows(r) {
        this.modal = { show: true, loading: true, code: r.project_code, rows: [], currency: r.currency || null };
        try {
          const records = await Api.timesheets.get(r.project_code);
          // each record has a .data array; flatten all uploads
          const flat = records.flatMap(rec => rec.data || []);
          flat.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
          this.modal.rows = flat;
        } catch (e) {
          this.error = e.message || 'Failed to load rows.';
          this.modal.show = false;
        } finally {
          this.modal.loading = false;
        }
      },
```

- [ ] **Step 6: Replace `downloadCsv` with `downloadXlsx`**

Replace `downloadCsv(r)` (`timesheets.html:229-248`):

```js
      async downloadXlsx(r) {
        const code = r.project_code;
        try {
          const records = await Api.timesheets.get(code);
          const flat = records.flatMap(rec => rec.data || []);
          flat.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

          const wb = new ExcelJS.Workbook();
          const ws = wb.addWorksheet(code);
          const header = ['Date', 'Owner', 'Role', 'Task', 'Hours', 'Notes', 'Fee', 'Spent'];
          ws.addRow(header).font = { bold: true };
          flat.forEach(row => {
            const fee = row.fee || 0;
            ws.addRow([row.date, row.owner, row.role, row.task, row.hours,
                       row.notes, fee, fee * (row.hours || 0)]);
          });
          ws.columns = [
            { width: 12 }, { width: 20 }, { width: 18 }, { width: 24 },
            { width: 10 }, { width: 30 }, { width: 12 }, { width: 12 },
          ];
          ws.views = [{ state: 'frozen', ySplit: 1 }];

          const buffer = await wb.xlsx.writeBuffer();
          const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `${code}.xlsx`;
          a.click();
        } catch (e) {
          this.error = e.message || 'Export failed.';
        }
      },
```

(The `downloadXlsx` button binding was already added to the table markup in Task 4 step 1 — `@click="downloadXlsx(r)"`.)

- [ ] **Step 7: Add `fmtMoney` to the methods the template can call**

`fmtMoney` is a global function from `js/core.js` (not a Vue method), so it's already callable directly from the template (`{{ fmtMoney(...) }}`) exactly like `fmtDate` is today — no additional wiring needed. Confirm this by checking `timesheets.html`'s existing `fmtDate` usage in the template (`timesheets.html:79`) uses the same pattern (a plain global function, not `this.fmtDate`).

- [ ] **Step 8: Manual verification**

With `scripts/test-branch.sh up` still running:

- Open `/timesheets.html`, click `👁 View` on the project you uploaded a test file for in Task 2. Confirm the grid shows `Fee` and `Spent` as the last two columns, with the project's currency symbol, and that the row matching the known task/role shows the correct `Fee` and `Fee × Hours` as `Spent`.
- Confirm a row with an unresolved task/role shows `Fee = <symbol> 0.00` and `Spent = <symbol> 0.00`.
- Click `⬇ XLSX`: confirm a `.xlsx` file downloads, opens in a spreadsheet app, and contains the same 8 columns with correct values. Confirm no `⬇ CSV` button remains anywhere on the page.

- [ ] **Step 9: Commit**

```bash
git add timesheets.html
git commit -m "$(cat <<'EOF'
feat: add Fee/Spent to Timesheets View grid and replace CSV export with XLSX

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Czd2T16Y3TbXF4H5XCVRog
EOF
)"
```

---

### Task 6: Manual re-upload of existing project XLS files (operational, no code)

**Files:** none (operational step against the running main stack, or the test-branch stack, per user's choice).

- [ ] **Step 1: Tear down the test-branch stack used for Tasks 2-5**

```bash
scripts/test-branch.sh down
```

- [ ] **Step 2: After this plan's changes are merged and deployed, re-upload each of the 7 existing projects' XLS files**

Per the Brief's decision, no migration script is written — the 7 projects' timesheets, uploaded before this change, have no `fee` on their entries. Re-uploading each project's XLS through Project Reporting → "Load XLS" runs it through the now-fee-snapshotting `POST /api/timesheets/upload` path from Task 2, replacing the old data (existing replace-per-`project_code` behavior, unchanged) with entries that carry the resolved `fee`.

This step is **operational** — it uses the running application, not this plan's test infrastructure, and is for the user (or whoever owns the source XLS files) to perform after deploy. No commit associated with this task.

---

## Self-Review Notes

- **Spec coverage:** Backend join (Task 3) ✓, fee snapshot on upload (Task 2) ✓, pure resolver + tests (Task 1) ✓, summary table columns/filters/sort/year selector (Task 4) ✓, View grid Fee/Spent (Task 5 steps 3-5) ✓, XLSX export (Task 5 steps 6-9) ✓, re-upload of the 7 existing projects in place of a migration script (Task 6) ✓, all "Explicitly excluded scope" items from the Brief are respected (no Total Spent aggregate, no `all-data` changes, no multi-currency conversion, no permission changes, no pagination, no migration script, dropdown options not year-dependent).
- **Placeholder scan:** no TBD/TODO; Task 4 Step 7's verification note about `resetFilters()`'s year behavior is a deliberate, explicit either/or left for manual judgment during verification (not an unresolved implementation gap — the code as written is complete and correct either way, it's a UX nuance to confirm against the design's intent, which didn't specify "Reset" behavior explicitly).
- **Type consistency:** `resolveFee(tasks, taskName, role) → number` (Task 1) is the exact signature used in Task 2's `resolveFee(tasks, entry.task, entry.role)`. `r.currency`/`r.client_name`/`r.project_name`/`r.pipeline_year` (Task 3's SQL aliases) match the field names read in Task 4's computed properties and Task 5's `viewRows`. `modal.currency` (Task 5 Step 3) matches its usage in Step 4's template and Step 5's assignment.
