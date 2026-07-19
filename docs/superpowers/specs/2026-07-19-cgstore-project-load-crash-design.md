# Fix `_cgStore` ReferenceError breaking project loading — Design Spec

**Source:** Brief `docs/superpowers/specs/2026-07-19-cgstore-project-load-crash-brief.md`. Bugfix in already-merged, shared client/server code — not a continuation of either `portfolio.html`'s or `project-config.html`'s own migration cycles.

## Problem

`js/api-sync.js`'s `_apiProjectToLocal()` (called by `loadConfigFromApi()`, shared by every page) resolves a project's linked cost-grid ID via `_resolveCgIdForVersion()`, which reads the global `_cgStore` — a `Map` declared only in `js/costgrid.js`. `portfolio.html` and `project-config.html` (both after their 2026-07 Vue 3 migrations) no longer load `js/costgrid.js`. On both pages, `_cgStore` is genuinely undeclared, so `_resolveCgIdForVersion` throws `ReferenceError: _cgStore is not defined` for any project with a `cg_version_id` — currently all 9 existing projects. The exception aborts `loadConfigFromApi()`'s `.map()`, is silently swallowed by its `try/catch`, and leaves `config.projects` empty on both pages. Verified live: backend, DB, and nginx are all healthy (a manually-authenticated `curl` against `GET /api/projects` returns full correct data); the failure is entirely client-side.

## Architecture

Move `cg_id` resolution from a fragile client-side in-memory lookup to the backend, which already has the join available via a stable FK (`cost_grid_versions.cost_grid_id`). `GET /api/projects` returns `cg_id` directly; `_apiProjectToLocal` reads it as a plain field. `_resolveCgIdForVersion`/`_cgStore` are untouched and keep serving their original callers (the cost-grid editor, `pipeline-board.js`, `planning.js`), which all correctly load `js/costgrid.js` and are unaffected by this bug.

## Components

**`api/src/routes/projects.js`, `GET /api/projects` (lines 37-87):** add `LEFT JOIN cost_grid_versions cgv ON cgv.id = p.cg_version_id` to the existing `FROM projects p JOIN users u ... LEFT JOIN clients c ... LEFT JOIN programs pr ...` chain (alias `cgv`, matching the existing convention in `cost-grids.js:188`). Add `cgv.cost_grid_id AS cg_id` to the `SELECT` list. No change to the `WHERE`/visibility clause, `ORDER BY`, or the `tasks` subquery.

**`js/api-sync.js`, `_apiProjectToLocal()` (lines 212-234):** replace

```js
const versionId = p.cg_version_id || null;
const cgId      = versionId ? _resolveCgIdForVersion(versionId) : null;
```

with

```js
const versionId = p.cg_version_id || null;
const cgId      = p.cg_id || null;
```

`costGridRef: versionId ? { cgId, versionId } : null` (unchanged) now reflects the server-resolved value. No fallback to `_resolveCgIdForVersion` — single source of truth, per the confirmed decision to remove the client-side path entirely rather than keep a secondary fallback.

**`js/api-sync.js`, `_resolveCgIdForVersion()` / `js/costgrid.js`'s `_cgStore`:** unchanged. Still used by `pipeline-board.js`, `planning.js`, and the cost-grid editor itself, all of which correctly load `js/costgrid.js`.

## Data flow

No new endpoint, no new request. `GET /api/projects`'s existing response gains one field (`cg_id`) per row. `loadConfigFromApi()`'s call shape is unchanged; `_apiProjectToLocal()`'s output shape (`costGridRef: { cgId, versionId } | null`) is unchanged — only the *source* of `cgId` changes.

## Error handling

A project with no `cg_version_id` produces `cg_id: null` via the `LEFT JOIN` (no cost-grid link — expected, common case). A project whose `cg_version_id` doesn't match any row in `cost_grid_versions` (shouldn't occur given the FK, but the join tolerates it) also produces `cg_id: null` rather than an error — no special-casing needed, `LEFT JOIN` handles both uniformly. No behavior change for `cardData()`'s use of `costGridRef.versionId` (`portfolio.html:1025`) — that field is untouched, sourced directly from `p.cg_version_id` as before.

## Backward compatibility

- `pipeline.html`, `planning.html`, `costgrid.html` (all load `js/costgrid.js`): unaffected — they never called `loadConfigFromApi()`'s buggy path in a way that crashed (they have `_cgStore` available), and after this fix they get the same `cgId` values, now sourced from the backend instead of client-side resolution. No behavior change expected for these pages.
- `project-config.html`'s `pipelineLocked` computed (`project-config.html:371-372`) starts working correctly again for cost-grid-linked projects, restoring the "pipeline changes only via the cost-grid editor" rule this bug had silently disabled.
- `portfolio.html`'s overview and dashboard views load real project data again.

## Testing

No new `js/lib/*` module — this is a query change plus a mapper simplification, not complex pure logic worth its own extraction/test module. Verification:
1. Direct DB query confirming `cg_id` resolves correctly for all 9 currently-existing projects (both those with and without a `cg_version_id`).
2. `npm test` — full existing suite must still pass (no `js/lib/*` file is touched by this fix, so no existing test is expected to need updating).
3. Manual browser verification (post-merge, per this project's established convention): `portfolio.html` overview shows real projects; `project-config.html?projectId=<cost-grid-linked-project>` loads correctly with Pipeline locked; `portfolio.html?projectId=<id>` direct link shows full KPIs/name/status.

## Explicitly out of scope

(Carried from the Brief, confirmed)
- Building a "link to source cost grid" UI on `portfolio.html` — this fix only makes `cgId` reliably available; no new UI requested.
- Auditing other shared-global assumptions across `js/api-sync.js`/`js/core.js` beyond this one confirmed instance.
- Changing `GET /api/projects/:id` (confirmed unused by `_apiProjectToLocal`, which only runs off the list endpoint).
- Retrofitting `_resolveCgIdForVersion`/`_cgStore` for their original callers — unaffected, no change needed.
