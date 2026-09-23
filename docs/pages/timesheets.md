# timesheets.html

Timesheet upload management (admin only).

This file holds the full implementation narrative for this page — cycle-by-cycle detail, methods involved, first-attempt bugs, and report references. `CLAUDE.md`'s Pages table keeps only a one-line purpose description; when working on this page, read this file, not that row, for the detail. See `/sync-docs`'s routing rule for where future changes to this page should be written.

## Summary table + filters (2026-09)

Summary table leads with Client/Project/Project code (Bootstrap checkbox multi-select filters on Client and Project, free-text on Project code, click-to-sort on all three — other columns unsortable) followed by the pre-existing Uploads/Rows/Last uploaded, all resolved server-side via `GET /api/timesheets`'s `LEFT JOIN LATERAL` (see `api/src/routes/timesheets.js`'s own entry in `CLAUDE.md`). A pipeline-year `<select>` (default: current calendar year if present in `Api.pipelineYears.list()`, else the most recent year — no client-side `active` filter, matching `pipeline.html`'s own default-year resolution exactly: an admin sees ALL pipeline years there too, active or not, and only `GET /api/pipeline-years`'s non-admin branch filters to active-only server-side, which never applies here since this page is admin-only; investigated and confirmed intentional, not a bug, 2026-09; plus an explicit "All years" option `pipeline.html` doesn't have) filters rows client-side by `pipeline_year` — a project with no linked cost-grid version has `pipeline_year: null` and shows only under "All years", by design (documented in `docs/superpowers/specs/2026-09-03-timesheets-fee-pipeline-year-design.md`).

"View" modal grid gained `Fee`/`Spent` as its last two columns (`Spent = Fee × Hours`, no rounding, `fmtMoney`-formatted in the project's own currency — `fmtMoney` is registered as a Vue `methods` shorthand here since this page's own `fmtDate` is a local method, not the `js/core.js` global, so template calls don't fall through to it automatically).

`⬇ CSV` was replaced (not kept alongside) by an XLSX export via ExcelJS `4.4.0` CDN (same pin as `planning.html`/`costgrid.html`), filename `Client_Project_ProjectCode_YYYYMMDD.xlsx` (`sanitizeForFilename()`: spaces→`-`, filesystem-unsafe characters stripped); that button's own label was further renamed `⬇ XLSX` → `⬇ Download actuals` and `🗑 Delete all` → `🗑 Delete actuals` (2026-09), aligning wording with `portfolio.html`'s "Load Actuals"/`project-config.html`'s Actuals-block buttons — labels only, `downloadXlsx(r)`/`deleteCode(r)` bindings and behavior unchanged; the native `confirm()` text inside `deleteCode()` ("Delete ALL timesheet data...", `timesheets.html:315`) still says "all" rather than "actuals" — deliberately left as-is, out of scope for that cycle.

`created()` fires `Api.pipelineYears.list()`/`Api.currencies.active()`/`loadRows()` together via one `Promise.allSettled` (each independent, each degrades to a safe default — `[]`/EUR fallback/`this.error` respectively — on its own failure) rather than sequential awaits.

## Blob-download revoke timing fix (2026-09)

`downloadXlsx()`'s `URL.revokeObjectURL(a.href)` is deferred one tick (`setTimeout(..., 0)`, cold-review fix) rather than called synchronously right after `a.click()` — on Safari and some older Firefox/Chromium builds the click-to-download hand-off is asynchronous, and a synchronous revoke can invalidate the blob before the download actually starts. The same unfixed pattern still exists at other export sites in the codebase (`js/costgrid.js`, `planning.html`, `js/settings.js`, `project-config.html`) and is a documented follow-up candidate, not yet applied there.
