# Hardening — open findings on cost-grid, project and timesheet routes — design

Date: 2026-09-30. Scenario 2 (evolution of existing features). Input: Brief from `/feature-brief` + brainstorming decisions. Closes the still-open tag-cycle findings (memory `project-known-findings-tag-cycle`), the 403 seen on `GET /api/timesheets/:projectCode`, and the two low code-review follow-ups of the `worktree-project-config-save-errors` cycle.

## Problem (current behavior, read 2026-09-30)

1. **Versions not scoped to their grid** — `api/src/routes/cost-grids.js`: `canEdit`/`canAccess` check the grid in `:id`, but the queries use only `:vId`. Nine handlers have no `cost_grid_id = :id` check: `PATCH /:id/versions/:vId` (l. 367, including its `locked` read), `DELETE /:id/versions/:vId` (l. 408, a Draft version of another grid can be deleted), `POST .../duplicate` (l. 428), `GET`/`PUT .../structure` (l. 504, 543), `GET`/`POST`/`DELETE .../linked-projects` (l. 658, 671, 690), `POST .../refresh-rate` (l. 893). `publish` (l. 484) and the tag routes (`versionInGrid`, l. 922) already check.
2. **`toggleTag` rollback race** — `costgrid.html` `toggleTag` (l. ~1129): the `catch` restores the pre-toggle snapshot without checking that `this.verId` is still the version the `PUT` was sent for; after a version switch it paints version A's tags on version B's screen (display only, DB untouched).
3. **`PATCH /api/projects/:id` input** — `api/src/routes/projects.js` (l. 182): `cgVersionId` and `clientId` go to the DB with `req.body[key] || null`, unvalidated; a non-UUID gives 500 (`POST` validates both, l. 154-156). `program_id` is `VARCHAR(100)` (`001_initial.sql`), so it must not be UUID-validated.
4. **Timesheets 403** — `api/src/routes/timesheets.js`: `visibleCodes` returns, for an admin, only the codes that have rows in `timesheets` (l. 29-33); `GET /:projectCode` (l. 101-106) answers 403 when the code is not in that list, so an admin opening `project-config.html` for a project with no actuals gets two 403s (`loadActuals`, `updateReforecastVisibility`). For a non-admin `visibleCodes` already lists every visible project, so they get `[]`.
5. **`addTasksToProject`** (`js/costgrid.js:1070-1073`) re-sends the whole in-memory project with `_pushProjectToApi`; since the save-errors cycle empty sections are pushed too, so a stale copy with empty phasing/PTC/planning/groups would wipe the server's.
6. **`config.projects` write-back** in `project-config.html` `onSave` happens before the server save, so a failed save leaves the copy in memory until the next page load (no server effect, no other consumer before a reload).

## Decisions

| # | Decision |
|---|---|
| D1 | One router-level middleware `router.use('/:id/versions/:vId', requireAuth, versionScope)` in `cost-grids.js`, registered before the routes. Covers the nine handlers and any future `:vId` route. Order for a request: 401 → 404 (version not in grid) → 403 (`canEdit`/`canAccess` in the handler). |
| D2 | `versionScope`: `:id` or `:vId` not a UUID, or no row with `id = :vId AND cost_grid_id = :id` → `404 { error: 'Version not found' }` (a malformed id must not reach Postgres and give 500). `versionInGrid` in the tag routes and the `publish` check stay (harmless redundancy). |
| D3 | `PATCH /api/projects/:id`: `cgVersionId`/`clientId`, when present, non-empty and not a UUID → `400 { error: '<field> must be a valid UUID' }`. `null` and `''` stay valid (they unlink). `programId` is not validated. |
| D4 | `GET /api/timesheets/:projectCode`: an admin/sysadmin is never denied; no rows → `200 []`. Non-admins keep the current rule (403 when the project is not visible to them). `GET /` and `DELETE` are untouched. A code unknown to any project answers `[]` for an admin (accepted). |
| D5 | `costgrid.html` `toggleTag`: capture `savingForVerId = this.verId` before the request; the `catch` restores the snapshot only if `this.verId === savingForVerId`. Inline Vue method: no `?v=` bump. |
| D6 | `_pushProjectToApiDetailed(project, { skipEmpty })` and `_pushProjectToApi(project, opts)` in `js/api-sync.js`: with `skipEmpty: true` empty sections are not pushed (behavior before the save-errors fix). Both `costgrid.js` callers pass it; `project-config.html` does not, so clearing a section there still works (PC-27). |
| D7 | `config.projects` after a failed save: no code change; documented as a page-level cache that a failed save does not roll back. |

## Out of scope

Redesign cycles; native `alert`/`confirm` and hex colours (point 2); navigation; other unvalidated inputs beyond `cgVersionId`/`clientId`; a transactional `PUT /tasks`; dead code in `planning.html`; Team assistant follow-ups; a generic dataset chat; changes to `canEdit`/`canAccess` semantics; removing `versionInGrid`.

## Files touched

- `api/src/routes/cost-grids.js` (middleware), `api/src/routes/projects.js` (PATCH validation), `api/src/routes/timesheets.js` (admin GET).
- `costgrid.html` (`toggleTag`), `js/api-sync.js` + `js/costgrid.js` (`skipEmpty`), every page referencing them gets its `?v=N` bumped (grep the whole repo before merge).
- Tests: `test-api.js` (integration), `js/api-sync.test.js` (vitest). Docs: `TEST_CASES.md` + `test-cases.html`, `docs/pages/costgrid.md`, `docs/pages/project-config.md`, `docs/js/api-sync.md`, the `docs/api/` notes for the three route files (create only if none exists for that file), finish-cycle report.

## Testing and verification

- **Integration (`test-api.js`, via `scripts/run-tests.sh`):** for each of the nine routes, `:vId` of another grid → 404 and no change in the DB (version still there, label/structure/links intact); correct version unchanged; malformed `:vId` → 404 not 500; `PATCH /projects` with non-UUID `cgVersionId`/`clientId` → 400, with a UUID or `null` unchanged; admin `GET /timesheets/:code` on a project without actuals → 200 `[]`; non-admin on a project they cannot see → 403.
- **Vitest (`js/api-sync.test.js`):** `skipEmpty: true` skips empty sections and still pushes non-empty ones; without it empty sections are pushed; wrapper contract unchanged.
- **Browser (isolated stack):** `toggleTag` race (delay then fail the tag `PUT` via a `fetch` override, switch version, check the version B screen keeps B's tags); regression walk of `costgrid.html` (open, switch versions, duplicate, link a project, delete a Draft, refresh rate, add tasks to a project, Generate project); `project-config.html` for a project without actuals → no 403 in the console.
- **Deploy:** `api/` changes need a `pdash-api` restart after merge (confirm-first per `/finish-cycle`); no migration.

## Risks

- D1: a front-end flow that calls a version route before the version exists on the server would now get 404 (`PATCH` on a missing version already answered 404; `_cgUpsertVersionToApi` creates before saving the structure). Covered by the regression walk.
- D4 makes `GET /timesheets/:code` return `[]` for codes no project uses, when an admin asks. Accepted.
