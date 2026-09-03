# Design — Timesheets (Actuals): Client/Project/Pipeline-year columns, Fee/Spent, XLSX export

Brief: `docs/superpowers/briefs/2026-09-03-timesheets-fee-pipeline-year-brief.md`

## 1. Backend

### `GET /api/timesheets` (summary endpoint)

Extends the existing aggregated query (`api/src/routes/timesheets.js:29-47`) with joins to resolve client, project name, and pipeline year, keeping the `GROUP BY project_code` aggregation:

```sql
SELECT t.project_code,
       COUNT(*)::int AS uploads,
       MAX(t.uploaded_at) AS last_uploaded,
       SUM(jsonb_array_length(t.data)) AS total_rows,
       c.name  AS client_name,
       p.name  AS project_name,
       cgv.pipeline_year AS pipeline_year
FROM timesheets t
LEFT JOIN projects p              ON p.code = t.project_code
LEFT JOIN clients c               ON c.id = p.client_id
LEFT JOIN cost_grid_versions cgv  ON cgv.id = p.cg_version_id
WHERE t.project_code = ANY($1::text[])
GROUP BY t.project_code, c.name, p.name, cgv.pipeline_year
ORDER BY t.project_code
```

Each row in the response already carries `client_name`, `project_name`, `pipeline_year` (`null` when unresolvable). Year/client/project filtering and sorting stay **client-side** (Vue) on top of this single call's result — no new query params, no extra round-trips.

### `POST /api/timesheets/upload` (fee snapshotting)

After grouping entries by `projectCode` (existing logic at `timesheets.js:132`), before the `INSERT`:

1. Resolve the involved projects by `project_code` → `projects.code` — one batch query for all distinct codes present in the uploaded file (not one query per row, to stay O(projects in file) not O(rows)).
2. Load `project_tasks.resources` for each resolved project.
3. For every entry, compute `fee` with the **same resolution logic as `findRate`** (`js/core.js:264-272`), ported to the backend as a pure function in a new `api/src/lib/rate-resolve.js` (mirrors the existing `js/lib/` → `api/src/lib/` pure-function convention, testable with `node:test`): case-insensitive match on `task.name` + `role` against `resources[].hourlyRate`, fallback to the task's first resource, otherwise `0`.
4. Store `fee` on the entry itself (`entry.fee = ...`) before `JSON.stringify` in the `INSERT`.

No change to the existing replace-per-`project_code` behavior (`DELETE` then `INSERT`). No rounding — `fee` keeps the raw decimal value of `hourlyRate`. A row whose project or task/role can't be resolved gets `fee: 0`; this never blocks the upload (matches the existing validator's philosophy of only rejecting on unparseable dates, `timesheets.js:109-119`).

## 2. Frontend — Summary table (`timesheets.html`)

### Vue state additions

```js
data() {
  return {
    rows: [],               // from the extended GET /api/timesheets (client_name, project_name, pipeline_year)
    pipelineYears: [],       // Api.pipelineYears.list()
    selectedYear: null,      // null = "All years"; otherwise a year number
    clientFilter: [],        // selected client_name values (empty = all)
    projectFilter: [],       // selected project_name values
    codeFilter: '',          // free-text project_code search
    sortBy: null,             // 'client_name' | 'project_name' | 'project_code' | null
    sortDir: 'asc',
    ...
  };
}
```

### Pipeline year

- Loaded via `Api.pipelineYears.list()` in `created()`, same point where `loadRows()` is called today.
- Default: current calendar year if present among active `pipelineYears`, otherwise the most recent available (`pipelineYears[0].year`, table indexed `year DESC`) — same resolution logic as `pipeline.html:710-716`, without query-string persistence (this is an admin utility page, no deep-link requirement).
- The year dropdown explicitly includes an **"All years"** option (`selectedYear = null`), which `pipeline.html`'s selector doesn't have.
- A row with `pipeline_year === null` (project with no `cg_version_id`) is excluded whenever `selectedYear` is a specific year, and included when `selectedYear === null`.

### Client / Project / Project code filters

- `clientOptions` / `projectOptions`: computed properties extracting the distinct non-null values from `rows` (independent of the selected year, per Brief).
- Bootstrap dropdown with checkboxes (approved pattern — no new component library): button label shows `Client (N)` when `N > 0` are selected, otherwise `Client`.
- `codeFilter`: free-text `<input>`, case-insensitive substring match on `project_code`.
- All filters combine with **AND**, and with the year filter, inside a single `filteredRows` computed.

### Sorting

- Clicking the `Client`/`Project`/`Project code` header sets `sortBy`/`sortDir` (toggle asc → desc → reset on repeated clicks on the same header), with a visual indicator (▲/▼) on the active header — no external library.
- Applied as the final step on `filteredRows`, after filtering, before render.

### Orphan rows (no linked project)

- `client_name`/`project_name` `null` → cell renders `—`. Orphan codes don't produce a spurious "—" entry in the Client/Project checkbox options (no empty-value option added), but the row itself still shows in the table (subject to the year filter, which hides it unless "All years" is selected).

## 3. Frontend — "View" grid (Fee/Spent) and XLSX export

### "View" grid

- `modal.rows` entries gain two derived values from `row.fee` (already present in the JSONB after upload, or `undefined` for legacy rows until re-upload):
  - `Fee` = `row.fee ?? 0`
  - `Spent` = `(row.fee ?? 0) * (row.hours ?? 0)`
- Two columns appended to the existing grid (`timesheets.html:124-140`): `Fee`, `Spent`, right-aligned like `Hours`, formatted with `fmtMoney(v, currencyCode)` (`js/core.js`) using the currency of the project resolved for that `project_code` (already available from the summary row passed into `viewRows(r)`).
- If the project can't be resolved (orphan code) or has no currency set: falls back to no symbol, plain number (same behavior as `fmtMoney` with an absent currency code today).

### XLSX export (`downloadXlsx()`, replaces `downloadCsv()`)

Replaces the existing function (`timesheets.html:229-248`) with an ExcelJS-based version, reusing the same Fee/Spent-enriched data:

```js
async downloadXlsx(r) {
  const code = r.project_code;
  try {
    const records = await Api.timesheets.get(code);
    const flat = records.flatMap(rec => rec.data || []);
    flat.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(code);
    const header = ['Date','Owner','Role','Task','Hours','Notes','Fee','Spent'];
    ws.addRow(header).font = { bold: true };
    flat.forEach(row => {
      const fee = row.fee ?? 0;
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
  } catch (e) { this.error = e.message || 'Export failed.'; }
},
```

- Minimal styling (bold header, fixed column widths, frozen header row) — consistent with the project's ExcelJS idiom but without `planning.html`'s multi-level color coding (not needed for a flat tabular export).
- `<script defer>` ExcelJS CDN tag added to `timesheets.html` (same pinned version already used in `planning.html`/`costgrid.html`, to be confirmed at implementation time).
- Button renamed `⬇ XLSX`; no CSV button remains.

## 4. Error handling and edge cases

- **Upload fee resolution**: an unresolvable project (orphan `project_code`) or a task/role with no matching resource resolves to `fee = 0` and never blocks the upload — consistent with the existing date-validation-only rejection policy. Resolution is batched by distinct project code, not per-row.
- **`GET /api/timesheets`**: the new `LEFT JOIN`s introduce no new error paths — same existing `try/catch → next(err)` (`timesheets.js:46`).
- **`Api.pipelineYears.list()` failure**: silent catch (same pattern as `pipeline.html:706`), `pipelineYears = []` → the year dropdown only shows "All years", page still functions.
- **Legacy rows with no `fee`** (pre-migration data, before the manual re-upload of the 7 existing projects): `row.fee` is `undefined` in the JSONB → `?? 0` handles both `Fee` and `Spent` as `0`, no rendering error.
- **XLSX export failure** (network, parsing): existing try/catch already surfaces `this.error`, no behavior change relative to today's `downloadCsv()`.

## 5. Testing

- **Backend unit (`node:test`)**: new `api/src/lib/rate-resolve.js` pure function, covered like `date-parse.test.js`: exact match, case-insensitive match, fallback to first resource, no match → `0`. No Express/DB dependency, runnable anywhere.
- **Backend manual verification**: upload a test file spanning multiple `project_code`s, confirm each saved entry in `timesheets.data` carries the correct `fee`; confirm `GET /api/timesheets` returns `client_name`/`project_name`/`pipeline_year` for a known project and `null` for a deliberately orphaned code.
- **Frontend manual verification in browser** (no automated coverage exists today for Vue pages beyond `js/lib/` pure functions, and this change doesn't extract new pure logic into `js/lib/` — filter/sort logic is simple and local to the component):
  - Summary table: Client/Project/Project code columns populate correctly; an orphan row shows `—`/`—`/code; Client/Project multi-select filters work and combine; Project code free-text filter works; sorting on all 3 columns (asc/desc/reset); year selector defaults to the current year, "All years" option present, projects with no `pipeline_year` show only under "All years".
  - "View" grid: Fee/Spent computed correctly per row with the right currency symbol; a row with unresolvable task/role shows `0`/`0`.
  - Export: `⬇ XLSX` button downloads an openable `.xlsx` file with the same columns as the "View" grid including Fee/Spent; no CSV button remains.
  - Manual re-upload of one of the 7 existing XLS files after deploy: confirms the old upload is replaced and new entries carry a resolved `fee`.

## Explicitly excluded scope

(Carried over from the Brief — see `docs/superpowers/briefs/2026-09-03-timesheets-fee-pipeline-year-brief.md` for full rationale.)

- No "Total Spent" aggregate column on the summary table.
- No change to `GET /api/timesheets/all-data` or its consumers (portfolio/planning).
- No multi-currency conversion — Fee/Spent stay in the project's own currency.
- No change to existing delete/upload permissions.
- No server-side pagination for either table/grid.
- No data migration script for historical entries — replaced by manual re-upload of the 7 existing projects.
- Client/Project dropdown options don't dynamically recompute based on the selected year.
