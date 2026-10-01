# Project currency lock — design spec

Date: 2026-10-01 · Scenario 2 (evolution of existing behaviour) · Path: architectural

## 1. Problem

A project and the proposal (cost-grid version) it was generated from can end up in different currencies, and nothing keeps them aligned.

- "Generate project" copies `currency: v.currency` into the new project (`js/costgrid.js:1236`) and links it (`costGridRef`, `cg_version_projects` row, `projects.cg_version_id`). From then on the two are independent.
- The cost-grid Currency menu (`costgrid.html:104`) is disabled only when the version is locked (`isLocked`, `js/costgrid.js:87-108`: another version generated a project, or Committed with every task migrated). A version that generated a project stays editable, currency included; changing it never touches the projects (`PATCH /api/cost-grids/:id/versions/:vId` accepts `currency`/`currencyRate` with no check, `api/src/routes/cost-grids.js:396-404`).
- The project-config Currency menu (`project-config.html:80`) is disabled only for viewers; there is no exchange-rate or conversion logic in the page, and `projects` has no rate column. `PATCH /api/projects/:id` accepts `currency` unconditionally (`api/src/routes/projects.js:194-210`).
- `_pushProjectToApiDetailed` re-sends the whole project (currency, `cgVersionId`) on every save from an in-memory copy loaded when the page opened, so a stale tab can overwrite what another tab changed.
- Reporting converts a project's amounts to EUR with the **version's** rate (`reporting.js:336-371`, JOIN on `cg_version_id`), but labels them with the **project's** currency: a divergent pair shows wrong amounts (verified on a branch stack: version CHF @0.95, project EUR → Project Phasing showed € and ignored the rate).
- Projects created directly in project-config (no proposal) have no exchange-rate handling at all.
- Project deletion and unlinking exist only in the API (`DELETE /api/projects/:id`, `DELETE …/linked-projects/:projectId`, `PATCH` with `cgVersionId` null/empty). There is **no UI**: `cgDeleteLinkedProject` (`js/costgrid.js:1322`) has no caller, `_deleteProjectFromApi` (`js/api-sync.js:311`) has no caller, and the linked-project cards in `costgrid.html:144-162` only offer "Project Dashboard".
- Real data (main stack, 2026-10-01, read-only): 15 projects, all linked (`cg_version_id`), 15 `cg_version_projects` rows consistent with them, 0 currency divergences, everything in EUR. No data needs realigning.

## 2. Goal and invariant

**A project generated from a proposal gets the proposal's currency at generation, and from then on neither side can change it.** Everything that could break this (creating a project without a proposal, unlinking, deleting, changing a currency) is inhibited for everyone except a sysadmin. Exchange-rate handling and conversion for projects without a proposal are NOT built now (separate later cycle); creating such projects is switched off instead. Project deletion/unlinking gets its own later cycle; until then no path to them is exposed.

## 3. Decisions taken with the user

1. Cost-grid Currency menu locked once a project has been generated from the version, in every pipeline stage (the menu only; the rest of the proposal stays editable).
2. project-config Currency menu read-only for **all** projects (linked or not), until the conversion cycle. Sysadmin can still change it through the API.
3. Creating projects without a proposal is temporarily inhibited, in the UI **and** on the server, with a sysadmin exception. The feature stays in the code; one flag per side switches it back on.
4. Deleting a project and unlinking it from a proposal are inhibited the same way (UI has nothing to hide; the API refuses).
5. API enforcement with sysadmin exception for all of the above (a UI-only lock can be bypassed by stale tabs and direct calls); rejections are `400` with a message, like the existing business-rule refusals (`403` stays for permissions).
6. Messages approved (section 6).
7. "Linked" means **either** a `cg_version_projects` row **or** a project with `cg_version_id` pointing at the version (conservative; the two are consistent in real data).
8. No migration and no data realignment.
9. **Reversed at the code review (Gate 3, user decision "fix all 3"):** a project and the version it is linked to must have the same currency at link time (project POST with `cgVersionId`, project PATCH null → version, `POST …/linked-projects`); sysadmin exempt. A `cgVersionId` that points at no version is refused with `Proposal version not found` (it used to end in a foreign-key error). Initially left out, the review showed that without it the lock could be bypassed by linking a project of another currency.
10. Rule refusals carry `code: 'PROJECT_RULE'` in the response body, so that `js/api-sync.js` does not retry a refused `PATCH` as a `POST` (it used to retry after any failure, turning a refusal into a duplicate-key error).

## 4. Rules (server)

New pure module `api/src/lib/project-rules.js` (CommonJS, `node:test`), one function per rule, each returning an error message or `null`. `role` is the **live** role read from the DB (`liveRole`, added to `api/src/middleware/auth.js` and exported, same idea as `requireSysAdmin` and `routes/users.js`), never the JWT claim; `'sysadmin'` always passes.

| Function | Refuses (non-sysadmin) |
|---|---|
| `projectCreateError({ role, versionId })` | no `versionId` while `DIRECT_PROJECT_CREATION_ENABLED` is false |
| `linkCurrencyError({ role, projectCurrency, versionCurrency })` | linking a project to a version of a different currency (project POST with `cgVersionId`, project PATCH null → version, `POST …/linked-projects`); a missing currency counts as `EUR` |
| `projectCurrencyChangeError({ role, currentCurrency, newCurrency })` | any change of the stored currency (a re-sent identical value passes; a missing/empty value counts as `EUR`, the column default) |
| `projectLinkChangeError({ role, currentVersionId, newVersionId })` | clearing the link or pointing it at another version; linking an unlinked project (null → version) and re-sending the same `cgVersionId` pass |
| `versionCurrencyChangeError({ role, currentCurrency, newCurrency, hasProjects })` | changing the currency of a version that has projects (identical value passes) |
| `projectRemovalError({ role })`, `linkRemovalError({ role })` | always, while `PROJECT_REMOVAL_ENABLED` is false |
| `versionRemovalError({ role, hasProjects })` | deleting a version, or a proposal with any version, that has projects (`projects.cg_version_id` is `ON DELETE SET NULL`: it would unlink silently) |

Constants (`DIRECT_PROJECT_CREATION_ENABLED = false`, `PROJECT_REMOVAL_ENABLED = false`) are the single switch-back points on the server.

`hasProjects(versionId)` = `EXISTS (cg_version_projects WHERE cost_grid_version_id = $1) OR EXISTS (projects WHERE cg_version_id = $1)`; for deleting a proposal, any of its versions.

Enforcement points (each rule runs after the existing 404/403 checks, so error precedence does not change):

- `POST /api/projects` — `projectCreateError` (a `cgVersionId` that is not a valid UUID counts as missing, as the route already sanitises it); with a valid `cgVersionId` the version is read: unknown → `400 Proposal version not found`, else `linkCurrencyError` against the project's `currency` (default `EUR`). "Generate project" keeps working: its first `PATCH` fails (the project does not exist yet) and the fallback `POST` carries `cgVersionId` and the version's currency.
- `PATCH /api/projects/:id` — `projectCurrencyChangeError` when `currency` is in the body, `projectLinkChangeError` when `cgVersionId` is in the body (stored values read before the update).
- `DELETE /api/projects/:id` — `projectRemovalError`.
- `PATCH /api/cost-grids/:id/versions/:vId` — `versionCurrencyChangeError` when `currency` is in the body (`currencyRate` alone is not restricted; `refresh-rate` is unchanged).
- `DELETE /api/cost-grids/:id/versions/:vId` and `DELETE /api/cost-grids/:id` — `versionRemovalError`.
- `DELETE …/linked-projects/:projectId` — `linkRemovalError`; `POST …/linked-projects` — `linkCurrencyError` between the project's and the version's stored currencies.
- `PATCH /api/projects/:id` with a `cgVersionId` that is a new link (stored null, or any change that the removal rule lets through) also reads the version (`Proposal version not found`) and applies `linkCurrencyError` with the project's stored currency.
- Every refusal above answers `400 { error, code: 'PROJECT_RULE' }`.
- Sysadmin tools (`_db-reset.html`, `/api/admin/reset/*`) are untouched.

## 5. Client

New twin module `js/lib/project-rules.js` (ES module + `window.*` bridge, vitest): `DIRECT_PROJECT_CREATION_ENABLED = false`, `versionCurrencyLocked(linkedProjects)` (true when the list is non-empty) and the approved message strings. Server and client constants are kept in sync by hand (same convention as the money twin).

- **costgrid.html:** `#cgCurrency` is disabled when `isLocked || versionCurrencyLocked(draft.linkedProjects)`, with the tooltip (message 1); the lock applies immediately after "Generate project" (the linked list is already updated in memory) and survives reload.
- **project-config.html:** the Currency `<select>` is always disabled, with the hint under the field (message 2). The new-project branch of `resolveProject()` (`project-config.html:542-547`) redirects to `/portfolio.html` with message 3 when `DIRECT_PROJECT_CREATION_ENABLED` is false (the form code stays).
- **portfolio.html:** the `＋ New project` button (`:34`) is disabled with the tooltip (message 3) and the empty-state text (`:38`) no longer invites to use it.
- **No removal UI exists**, so nothing is hidden; the dead `cgDeleteLinkedProject` stays untouched (the server refuses anyway).

## 6. Messages (approved)

1. Costgrid menu tooltip: `Currency is locked: a project has already been generated from this proposal.`
2. project-config hint: `Currency cannot be changed here: amounts are not converted yet. Contact a sysadmin if it must be corrected.`
3. `＋ New project` tooltip and redirect message: `Projects are created from a proposal (Generate project). Creating a project directly is temporarily disabled.`
4. API: `Currency cannot be changed: projects are linked to this proposal` (version), `Currency cannot be changed: amounts are not converted yet` (project), `Projects must be created from a proposal`, `Deleting a project or unlinking it from its proposal is temporarily disabled`, `The project and the proposal must have the same currency`, `Proposal version not found`.

## 7. Tests

- `node:test` `api/src/lib/project-rules.test.js`: every rule, sysadmin pass, identical-value pass, empty-currency-as-EUR, both flags.
- vitest `js/lib/project-rules.test.js` (`versionCurrencyLocked`, messages) and a page guard that `costgrid.html`/`project-config.html`/`portfolio.html` use the module (same style as `money-guard`).
- `test-api.js`: new section (create without proposal as admin → 400 / sysadmin → 201 / with `cgVersionId` → 201; currency change on a project and on a version with projects; clearing/re-pointing `cgVersionId`; linking an unlinked project by PATCH still allowed; delete project, delete link, delete version/proposal with projects; identical re-sent values pass; the fallback `POST` of "Generate project"). **Existing tests to adapt:** the ~10 places that create a project with only a name (switch to the sysadmin cookie; the one that needs an admin-owned project is created linked to its version instead), the cleanup (runs as sysadmin) and the one direct `DELETE /api/projects` (sysadmin). PV-04/PV-05 (`cgVersionId` null/empty on an unlinked project) and VS-08 (cross-grid linked-projects delete: the 404 scope check still comes first) stay valid unchanged.
- Manual cases in `TEST_CASES.md`/`test-cases.html` (locked menus, disabled button, redirect) and a browser check on a branch stack.

## 8. Rollout

No migration. Backend changes: `pdash-api` must be restarted after the merge (Gate 4). Docs: `docs/api/lib.md`, `docs/js/lib.md`, page docs for costgrid/project-config/portfolio, `CLAUDE.md`, `PRD.md` (project Currency field, New project), `TEST_CASES.md`/`test-cases.html`.

## 9. Acceptance criteria

1. `#cgCurrency` is disabled for a version with at least one linked project, in every pipeline stage, immediately after "Generate project" and after reload; enabled otherwise.
2. The project-config Currency menu is disabled for every project and shows the hint.
3. `＋ New project` is disabled with the tooltip; opening `project-config.html` without `projectId` redirects with the message; "Generate project" still creates and links a project.
4. API (non-sysadmin): refusals with the section 6 messages for every row of the section 4 table; identical re-sent `currency`/`cgVersionId` values are accepted; sysadmin is allowed everywhere.
5. No removal UI is exposed; `DELETE /api/projects/:id`, `DELETE …/linked-projects/:projectId`, unlinking by PATCH and deleting a version/proposal with projects are refused.
6. A project can only be linked to a version of its own currency (non-sysadmin); an unknown `cgVersionId` is refused with `Proposal version not found`.
7. `js/api-sync.js` does not retry a refused `PATCH` as a `POST` (a `code: 'PROJECT_RULE'` refusal is final and its message is shown).
8. All unit tests and the adapted `test-api.js` pass; the isolated backend suite passes.
9. Verified in a browser on a branch stack.

## 10. Excluded scope

- Exchange rate and conversion logic for projects without a proposal (later cycle), and re-enabling direct creation.
- The project deletion/unlinking feature itself (later cycle with a fresh analysis).
- Realigning existing divergent data (none exists).
- Portfolio program totals with mixed currencies, EUR conversion in reports for unlinked projects.
- Number formatting (money cycle), wrapper cleanup, the "New version loses its phases" bug, sysadmin reset tools, a sysadmin UI for the exceptions.

## 11. Risks

- A stale tab that re-sends a project is not refused as long as the values are unchanged; a stale tab holding an old currency cannot exist for a locked pair.
- Switching `test-api.js` project creation and cleanup to the sysadmin cookie assumes the test profile always bootstraps the sysadmin account (documented in `CLAUDE.md`); tests that need it are skipped with an explicit message if it is missing.
- Server and client switch-back flags can drift (kept in sync by hand, like the money twin); the page guard test and the docs name both.
