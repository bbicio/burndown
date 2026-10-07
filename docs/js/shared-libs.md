# js/ — the shared classic scripts

The non-Vue `js/*.js` files loaded as globals by the Vue pages, other than the ones large enough to have their own file ([core.md](core.md), [api-sync.md](api-sync.md), [costgrid.md](costgrid.md), [nav.md](nav.md), [notifications.md](notifications.md), [lib.md](lib.md), [cg-controls.md](cg-controls.md)).

`CLAUDE.md`'s File structure entries keep a one-line summary plus a pointer here. See `/sync-docs`'s routing rule for where future changes belong.

## js/api.js

The `Api.*` namespace and the `apiFetch` wrapper. On a 401 it redirects to the login page and sets `window.__pdashAuthRedirecting`. On any `!res.ok` it attaches the parsed response body to the thrown `Error` as `err.data` (2026-09), so callers can act on a structured error payload — e.g. the timesheet upload's `inconsistencies`, see [docs/api/timesheets.md](../api/timesheets.md).

`Api.costGrids.versions.tags.{list,replace}` and `Api.projects.tags.{list,replace}` (2026-09, Cycle 2) are thin wrappers over the tag routes; `replace` sends `{ itemIds }` for a full replace-all.

## js/shares.js

The share modal, for both `cost_grid` and `project`. Loads active users that are **neither admin nor sysadmin** from `GET /api/users/active-list` into a searchable in-memory dropdown (2026-09: the exclusion was widened from `role !== 'admin'` to `!['admin','sysadmin'].includes(role)`). It supports both adding new shares and editing the permission (editor/viewer) of existing ones through the same upsert API.

Module state: `_shareAllUsers` is the immutable source list; `_shareUserList` is that list minus the already-shared users.

## js/share-list-component.js

`window.ShareListComponent` (2026-09), a reusable Vue component (props `resource-type`, `resource-id`, `can-manage`) showing a "👥 Shared with" list with a per-row ✕ remove button — hidden for the owner row and whenever `can-manage` is false.

Reads `GET /api/{cost-grids|projects}/:id/shares`, removes via `DELETE .../:id/shares/:userId`: the same endpoints `js/shares.js` already used, so no new API surface. It deliberately does **not** add the ability to create a new share — that stays exclusive to `js/shares.js`'s `#shareModal`.

Registered via `app.component('share-list', window.ShareListComponent)` on both `pipeline.html`'s and `costgrid.html`'s Vue apps.

## js/clients.js

Client CRUD helpers. `saveClientFromModal()` guards `#clientSaveBtn` (the id was added in 2026-08; the button previously had none) against a fast repeat click — `if (saveBtn.disabled) return;` before the `await`, re-enabled in a `finally`. A double-click during the network round trip could previously create two clients from one submission.

`js/programs.js` and `js/roles.js` had the structurally identical gap in their own save functions, but those functions — along with the rest of both files' unreachable modal-editing UI — were deleted entirely in the 2026-08 dead-code cleanup (see below).

## js/roles.js

`loadRolesFromApi` / `saveRoles` (no-op) / `getRoles` only. `loadRolesFromApi` maps `rateOverrides: r.rate_overrides || {}` on each role; the role shape is `{ id, label, code, rate, rateOverrides }`.

Its modal-editing UI (`showRolesView`/`hideRolesView`/`renderRolesTable`/`extractTeam`/`openRoleModal`/`saveRoleFromModal`/`showRoleError`/`deleteRole`/`exportRoles`/`importRoles`) was confirmed unreachable from any page — verified by repo-wide grep, the only same-named hits being unrelated Vue component methods on `config.html`/`costgrid.html` — and deleted in 2026-08.

## js/programs.js

`loadProgramsFromApi` / `savePrograms` (no-op) / `getPrograms` only. Its modal-editing UI (`showProgramsModal`/`renderProgramsTable`/`openProgramEditModal`/`saveProgramFromModal`/`showProgramError`/`deleteProgram`/`cfgRefreshProgramDropdown`) was likewise confirmed unreachable — the only same-named hit, `deleteProgram` in `config.html`, is an unrelated Vue component method — and deleted in 2026-08.

## js/ratecards.js

The rate cards admin modal, plus the `loadRatecardsForDropdown()` cache used by `costgrid.js`. Client-specific rate editing is **not** here: it goes through `openClientRatecard()`, a Vue method on `master-clients.html`.

`_rcRenderEntries` pre-populates the non-EUR column placeholders with the agency default from `_rcRoles[rid].rate_overrides[currency]`; `_rcSaveEntries` collects the `.rc-override-rate` inputs and sends `rateOverrides` per role.

## js/upload.js

Excel timesheet parsing. `readXLS()` (`planning.html`'s "📂 Load XLS") and `readXLSForProject()` (`portfolio.html`'s "Load Actuals") both check `e.data && e.data.inconsistencies` in their catch block (2026-09) and show `formatUploadInconsistencies(e.data.inconsistencies)` via `js/core.js`'s `showInfo()`, before falling back to the pre-existing `#fileStatus` text flash. The backend validation this surfaces: [docs/api/timesheets.md](../api/timesheets.md).

Its `.stg-admin-only` sections are gated on `['admin','sysadmin'].includes(role)` (2026-09, was admin-only).

## js/tags.js

`loadActiveAttributeListsForTagging()` (2026-09, Cycle 2), loaded only by `costgrid.html`/`project-config.html`. It talks to `/api/attribute-lists` and `/api/attribute-lists/:id/items` directly via `fetch()` rather than the `Api.*` wrapper — matching `attribute-lists.html`'s own established call style for these two endpoints — fetches them in parallel (`Promise.all`) and filters each list to `status === 'active'` items only.

Not cached: each consumer page calls it once per page load. The UI it feeds: [docs/pages/costgrid.md](../pages/costgrid.md)'s "Tags" section. The API: [docs/api/attribute-lists.md](../api/attribute-lists.md).

## js/portfolio.js

No longer loaded by `portfolio.html` (its rendering logic was folded into that page's Vue rewrite). It is still loaded by `planning.html`, which relies on exactly two of its exports — `getMonthRangeFromCfg(cfg)` and `fmtProjectTitle(cfg)` — consumed directly by that page's Vue instance (formerly by `js/planning.js`, now deleted).

The rest of the file (`renderPortfolioSummary`, `buildProjectCard`, `buildProgramSummary`, `renderPortfolioView`, `showPortfolioView`, `showDashboardView`, and the dead duplicate `showPortfolioPlanningView`) is unreachable now that no page's script list wires it up.
