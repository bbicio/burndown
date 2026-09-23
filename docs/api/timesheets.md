# api/src/routes/timesheets.js

Timesheet upload, summary, and per-project actuals routes.

This file holds the full implementation narrative for `api/src/routes/timesheets.js` — route-by-route detail, cycle-by-cycle fixes, first-attempt bugs. `CLAUDE.md`'s File structure entry keeps only a one-line pointer; when working on this file, read this file, not that line, for the detail. See `/sync-docs`'s routing rule for where future changes to this file should be written.

## GET / summary (2026-09)

Returns one summary row per `project_code` plus `client_name`/`project_name`/`currency`/`pipeline_year`, resolved via `LEFT JOIN LATERAL` against `projects` (`ORDER BY created_at LIMIT 1` — `projects.code` has no uniqueness constraint, `012_project_code.sql`), then `clients`/`cost_grid_versions`.

## POST /upload

Additionally snapshots a `fee` onto every entry via `api/src/lib/rate-resolve.js`'s `resolveFee()` (batched one query per upload via `loadProjectTasksByCode()`, not one per row) before the existing replace-per-code `DELETE`+`INSERT`.

Both `LEFT JOIN LATERAL` uses above and `visibleCodes()`'s own non-admin filter share one `projectVisibilityPredicate(alias, userIdParam, isAdminExpr)` helper (owner or `resource_shares`) so a duplicate `project_code` across two projects with different visibility never leaks the inaccessible one's name, currency, or task rates to a user who can't see it — including at upload time, where the uploader's own visibility scopes which project's rates get snapshotted (a duplicate code with no project visible to the uploader resolves to `fee: 0`, the same as any other unresolvable rate, rather than ever drawing from a project they can't see). This is a narrower, correctness-focused helper than the `DELETE /:projectCode` handler's own visibility check just below it, which is intentionally different (owner/editor *permission*, not read visibility) and was not folded in.

## DELETE /:projectCode — non-admin column fix (2026-09)

That handler's own non-admin check now correctly matches `WHERE p.code = $2` against `req.params.projectCode` — it had compared against `p.name` instead (a stale copy-paste from before this route existed on any non-admin-reachable UI path), which 403'd every non-admin owner/editor attempting to delete their own project's timesheet data. Found by a cold-review pass after `project-config.html` shipped the first non-admin-reachable caller of this endpoint (`timesheets.html`'s own "Delete all" is admin-only). See `docs/pages/project-config.md`.

## Role/task validation gate (2026-09)

`findRoleTaskInconsistencies(entries, tasksByCode)` (pure, `node:test`-covered) runs in `POST /upload` right after `loadProjectTasksByCode()`, before the `resolveFee()` loop and before any `DELETE`/`INSERT`: for every row across every project code in the file, flags a task not found on that project, or a role (blank included) not exactly among that task's configured `resources[].role` — stricter than `resolveFee()`'s own fallback-to-first-resource leniency, which stays in place but is now effectively unreachable for uploads that pass this gate (accepted dead code, not removed).

Any inconsistency (deduplicated by `[projectCode, task, role]`) rejects the **entire upload** with `400 { error, inconsistencies: [...] }` — no partial writes, mirroring the pre-existing date-validation's all-or-nothing rejection.

`js/api.js`'s `apiFetch()` now attaches the response body to the thrown error as `err.data`; `js/core.js`'s `formatUploadInconsistencies(list)` (see `docs/js/core.md`) formats the list into a capped, bulleted message shown via a blocking modal at all three upload entry points — `project-config.html`'s own local `showConfirm(msg, {infoMode: true})` (single-button, no Cancel) and `js/upload.js`'s `readXLS()`/`readXLSForProject()` (used by `planning.html`'s "📂 Load XLS" and `portfolio.html`'s "Load Actuals" respectively) via the global `showInfo()`.

## resolveColumnMap

See `docs/api/lib.md`'s `api/src/lib/` entry for the column-header-resolution algorithm exported from this file for direct `node:test` coverage.
