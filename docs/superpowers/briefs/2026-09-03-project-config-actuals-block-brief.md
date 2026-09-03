# Brief — project-config.html: Actuals block rework + Save redirect to project detail

## Current behavior

**"1. Project info" block** (`project-config.html:69-83`): includes a `🗑 Clear XLS data` button (line 77, `v-if="!isViewer"`) calling `onClearData()` (lines 594-600). This clears an in-memory-only cache via `clearProjectData(pid)` (`js/core.js:146-149`, deletes from `_timesheetProjectData` and filters `timesheetData` — **no server call**, no `DELETE` against `timesheets`), then redirects to bare `/portfolio.html`.

**"2. Actuals" block** (`project-config.html:85-99`):
- `⬆ Upload XLS` (label + hidden file input, lines 89-92, `v-if="project.code && !isViewer"`) → `onActualsFileChange()` (lines 540-556) → `Api.timesheets.upload(file, project.code)` → `loadActuals()`.
- `⬇ Export CSV` (line 93, `v-if="actuals.exportRows"`) → `exportActualsCsv()` (lines 523-539): builds a CSV Blob client-side from `actuals.exportRows` (columns: projectId, projectName, date, role, owner, task, hours, notes — no Fee/Spent), filename `actuals_<code>_<date>.csv`.
- `loadActuals()` (lines 503-522): calls `Api.timesheets.get(project.code)`, sets `actuals.info` (upload date/row count/size summary text) and `actuals.exportRows = row.data` (the first upload record's raw entry array — since the previous cycle, each entry already carries `fee`).
- No "View" action exists on this page today.

**`onSave()`** (lines 601-640): on success, `window.location.href = '/portfolio.html'` (line 635) — the bare portfolio list, losing the just-edited project's context.

**Reference precedents** (already implemented elsewhere, to mirror here):
- `timesheets.html` (previous cycle): `👁 View` opens a modal with Date/Owner/Role/Task/Hours/Notes/Fee/Spent (`Spent = Fee × Hours`, `fmtMoney`-formatted); `⬇ XLSX` exports the same 8 columns via ExcelJS (`4.4.0` CDN), filename `Client_Project_ProjectCode_YYYYMMDD.xlsx` (`sanitizeForFilename()`: spaces→`-`, unsafe chars stripped); `🗑 Delete all` calls `Api.timesheets.delete(projectCode)` — a real `DELETE FROM timesheets`.
- `portfolio.html:128,164`: `📂 Load Actuals` button (exact label/icon) triggers the same upload flow.
- `portfolio.html:130,166` + `878-884`: `📊 View Report →` calls `showDashboard(cfg.id)`; loading `portfolio.html?projectId=<id>` on `created()` does the same thing automatically (`urlProjectId` → `showDashboard(urlProjectId)`).

## Expected behavior

1. **Rename** `⬆ Upload XLS` → `📂 Load Actuals` (icon + label, exact match with `portfolio.html`). Upload mechanism unchanged.
2. **Add `👁 View`** button in the Actuals block, `v-if="actuals.exportRows"` (same gate as Download), visible to viewers too. Opens a modal listing `actuals.exportRows` with the same columns as `timesheets.html`'s View modal: Date, Owner, Role, Task, Hours, Notes, **Fee**, **Spent** (`fmtMoney`-formatted in the project's currency). No new API call — reuses the array `loadActuals()` already fetched.
3. **Rename** `⬇ Export CSV` → `⬇ Download actuals`; replace the CSV Blob generation with an ExcelJS `.xlsx` export (same 8 columns as the View modal), filename `Client_Project_ProjectCode_YYYYMMDD.xlsx` (client name via `getClientName(project.clientId)`, already loaded on this page). Visible to viewers too.
4. **Move + rename** `🗑 Clear XLS data` → `🗑 Delete actuals`, repositioned into the "2. Actuals" block as the **last** button (after Load Actuals, View, Download actuals). Behavior changes from local-cache-clear to a **real server-side delete**: `Api.timesheets.delete(project.code)`, behind a `showConfirm()` prompt (no native `confirm()`, matching this page's existing modal idiom). On success: **stay on `project-config.html`**, re-run `loadActuals()` to refresh the Actuals block state (no redirect). Hidden for viewers (`v-if="!isViewer"`, as today).
5. **`onSave()`**: change the post-save redirect from `/portfolio.html` to `/portfolio.html?projectId=' + this.project.id` — reproduces exactly what `📊 View Report` does, for both the edit and create-new-project flows (`project.id` is already the final id in both cases, per `_pushProjectToApi()`'s create-with-client-generated-id path).

## Constraints

- No native `alert()`/`confirm()` anywhere — use `showConfirm()`, matching this project's established Vue-migration convention.
- Reuse the ExcelJS `4.4.0` CDN pattern already established in `timesheets.html`/`planning.html`/`costgrid.html` — same pinned version, same `<script defer>` tag pattern.
- `View`/`Download actuals` are non-destructive → visible to viewers; `Load Actuals`/`Delete actuals` are mutating → hidden for viewers (`v-if="!isViewer"`), consistent with this page's existing viewer-mode pattern.
- `Delete actuals` requires no new backend authorization work — `DELETE /api/timesheets/:projectCode` already enforces owner/admin server-side.

## Acceptance criteria

- [ ] Actuals block button order: Load Actuals, View, Download actuals, Delete actuals.
- [ ] `📂 Load Actuals` label/icon matches `portfolio.html` exactly; upload behavior unchanged.
- [ ] `👁 View` opens a modal with the same 8 columns as `timesheets.html`'s View modal, Fee/Spent correctly formatted in the project's currency; only shown when actuals exist.
- [ ] `⬇ Download actuals` downloads an `.xlsx` (not `.csv`) with the same 8 columns, filename `Client_Project_ProjectCode_YYYYMMDD.xlsx`.
- [ ] `🗑 Delete actuals` is the last button in the Actuals block (no longer in "1. Project info"), performs a real `DELETE /api/timesheets/:projectCode` after confirmation, and refreshes the Actuals block in place (no redirect) on success.
- [ ] Viewer mode: View/Download visible; Load Actuals/Delete actuals hidden.
- [ ] Saving a project (new or existing) redirects to `/portfolio.html?projectId=<id>`, landing on that project's detail view — matching what clicking `📊 View Report` from the portfolio list produces.

## Explicitly excluded scope

- No change to the upload mechanism itself (column mapping, date parsing, fee snapshot logic) — reused as-is from the existing `POST /api/timesheets/upload`.
- No change to `js/core.js`'s `clearProjectData()`/in-memory cache mechanism — it stays available, this page's button simply stops calling it.
- No change to `timesheets.html` or `portfolio.html` in this cycle.
- No change to the Save button's validation logic (sold-hours check, empty-phasing warning) — only the post-success redirect target changes.

## Resolved during brainstorming

- View modal implementation follows this page's own established Bootstrap `.modal.fade` + `bootstrap.Modal.getOrCreateInstance()` pattern (matching `clientEditModal`/`programEditModal`), not `timesheets.html`'s `v-if="modal.show"` custom overlay.
- Currency formatting: `project.currency` (a symbol: `€`/`$`/`£`/`CHF`) can be passed directly to `fmtMoney(n, currencyCode)` — its fallback path uses an unmatched code as the displayed symbol verbatim, so no symbol→ISO-code conversion is needed.
- Delete-actuals confirmation message is count-aware, matching `timesheets.html`'s own wording style.
- After Delete actuals succeeds: stays on the page and refreshes the Actuals block (no redirect) — a single-project detail page benefits from staying in context, unlike `timesheets.html`'s summary-list delete where the row simply disappears.
