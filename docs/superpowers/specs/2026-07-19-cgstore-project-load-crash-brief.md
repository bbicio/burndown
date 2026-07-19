# Brief — Fix `_cgStore` ReferenceError breaking project loading on `portfolio.html` / `project-config.html`

**Scenario:** Evolution of existing functionality (bugfix in existing, already-merged code).

## Current behavior

`js/api-sync.js:237-244`'s `loadConfigFromApi()` calls `Api.projects.list()` (→ `GET /api/projects`) and maps every row through `_apiProjectToLocal()`:

```js
async function loadConfigFromApi() {
  try {
    const projects = await Api.projects.list();
    config.projects = projects.map(_apiProjectToLocal);
  } catch (e) {
    console.warn('[sync] loadConfigFromApi:', e.message);
  }
}
```

`_apiProjectToLocal()` (`js/api-sync.js:212-234`) calls `_resolveCgIdForVersion(versionId)` for every project that has a `cg_version_id`:

```js
function _apiProjectToLocal(p) {
  const versionId = p.cg_version_id || null;
  const cgId      = versionId ? _resolveCgIdForVersion(versionId) : null;
  return {
    id: p.id, /* ... */
    costGridRef: versionId ? { cgId, versionId } : null,
    /* ... */
  };
}
```

`_resolveCgIdForVersion()` (`js/api-sync.js:202-209`) reads the bare global `_cgStore`:

```js
function _resolveCgIdForVersion(versionId) {
  if (!versionId) return null;
  for (const [cgId, cg] of _cgStore) {
    if ((cg.versions || []).some(v => v.versionId === versionId)) return cgId;
  }
  return null;
}
```

`_cgStore` is declared **only** in `js/costgrid.js:9` (`const _cgStore = new Map();`). It is populated by `cgSyncFromApi()`, called only on pages that need the full cost-grid editor.

Surveyed every page that loads `js/api.js`/`js/api-sync.js`: `portfolio.html` and `project-config.html` (both after their respective 2026-07 Vue 3 migrations) call `loadConfigFromApi()` but do **not** load `js/costgrid.js`. `pipeline.html`, `planning.html`, `costgrid.html` all load `js/costgrid.js` and are unaffected.

On `portfolio.html`/`project-config.html`, `_cgStore` is an undeclared identifier — not `undefined`, genuinely absent from scope. `for (const [cgId, cg] of _cgStore)` throws `ReferenceError: _cgStore is not defined` the moment any project with a `cg_version_id` is mapped. Verified against the live DB: **all 9 currently-existing projects have a `cg_version_id`** (confirmed via direct `psql` query), so this fires on the very first project processed, every time, on both pages.

Since `.map()` throws, `loadConfigFromApi()`'s `try/catch` swallows the exception (`console.warn` only) and `config.projects` is left at its initial value — an empty array. This has been confirmed live: a manually-minted valid JWT hitting `GET /api/projects` through nginx returns full, correct JSON (verified via `curl`, all 9 projects present with full data) — the backend, DB, and reverse proxy are all healthy. The failure is entirely client-side, inside `_apiProjectToLocal`.

**Observed symptoms** (screenshots reviewed): `portfolio.html`'s overview shows "No projects configured"; `project-config.html?projectId=<real-id>` shows "Project not found" (its `resolveProject()`, `project-config.html:427-445`, searches an empty `config.projects`); `portfolio.html?projectId=<real-id>` opens the dashboard view but with no project name/status/KPIs (all derived from `config.projects` via the `dashboardProject` computed) while the burndown chart still renders real data (it reads `timesheetData`, a separate data source unrelated to `config.projects`).

**Secondary, already-relied-upon effect if `cgId` is merely nulled defensively rather than fixed at the root:** `project-config.html:371-372`'s `pipelineLocked` computed (`return !!(this.project?.costGridRef?.cgId);`) gates whether the Pipeline `<select>` is disabled (pipeline stage should only change via the cost-grid editor for cost-grid-linked projects — see CLAUDE.md's "Pipeline stage: single source of truth"). If `cgId` is always `null`, this lock silently stops applying to every cost-grid-linked project on `project-config.html`, regardless of whether the crash itself is fixed.

`portfolio.html:1025`'s `cardData()` also reads `cfg.costGridRef` but only uses `.versionId` (not `.cgId`) to call `getPipelineBudget(cgRef.versionId)` — `versionId` comes directly from `p.cg_version_id` in the API response, not from `_resolveCgIdForVersion`, so this specific usage is unaffected by `cgId` being wrong.

## Expected behavior

- `GET /api/projects` (`api/src/routes/projects.js:37-87`) resolves `cg_id` **server-side** via a `LEFT JOIN` to `cost_grid_versions` (`cost_grid_versions.cost_grid_id` is a direct FK — confirmed via `\d cost_grid_versions`), returning it alongside the existing `cg_version_id` column.
- `_apiProjectToLocal()` uses the server-provided `cg_id` directly instead of calling `_resolveCgIdForVersion()`/reading `_cgStore` at all — removing the dependency entirely, not just guarding it.
- `config.projects` loads correctly (with an accurate `costGridRef.cgId`) on every page that calls `loadConfigFromApi()`, regardless of whether that page also loads `js/costgrid.js`.
- `project-config.html`'s `pipelineLocked` continues to work correctly for cost-grid-linked projects.
- This unblocks (but does not itself implement) a future "link to the source cost grid" UI on `portfolio.html`, since `cgId` becomes reliably available there.

## Constraints

- No DB schema change required — `cost_grid_versions.cost_grid_id` already exists.
- `js/lib/*` extraction/testing convention: this is a small, single-query change plus a small client-side simplification: no new `js/lib/*` module is warranted (this isn't a complex, independently-testable pure-function extraction — it's a JOIN + a field rename in one existing mapper).
- No build step; changes are to `api/src/routes/projects.js` and `js/api-sync.js` only, following the project's classic-script/no-bundler conventions.
- Must not change the shape of any field already consumed elsewhere by `costGridRef.versionId` (`portfolio.html:1025`) or `costGridRef.cgId` (`project-config.html:372`) — only the *source* of `cgId` changes (server-resolved vs. client-resolved via `_cgStore`), not its meaning or the object shape.
- `_resolveCgIdForVersion()` and `_cgStore` remain in `js/costgrid.js` for their original purpose (the cost-grid editor itself, `pipeline-board.js`, `planning.js`) — this fix does not touch or remove them there, it only removes `_apiProjectToLocal`'s dependency on them.
- The bug affects two already-merged, already-closed cycles (`portfolio.html`, `project-config.html`) — this is a shared-infrastructure fix, not a continuation of either prior cycle.

## Acceptance criteria

1. `GET /api/projects`'s response includes a `cg_id` field (or equivalent) for every project that has a `cg_version_id`, correctly resolved via SQL JOIN — verified against the live DB for at least the 9 currently-existing projects.
2. `_apiProjectToLocal()` no longer calls `_resolveCgIdForVersion()` or references `_cgStore`.
3. On `portfolio.html` (script list unchanged, still no `js/costgrid.js`): `config.projects` loads all visible projects with no thrown error; the overview shows real project cards; `?projectId=<id>` opens the dashboard with correct name/status/KPIs.
4. On `project-config.html` (script list unchanged, still no `js/costgrid.js`): `?projectId=<real-id>` resolves the project correctly (no "Project not found"); `pipelineLocked` correctly returns `true` for a project whose `cg_version_id` is set and reachable, `false` otherwise.
5. `pipeline.html`, `planning.html`, `costgrid.html` (which still load `js/costgrid.js`) continue to work unchanged — same `cgId` values as before this fix, sourced from either path.
6. `npm test` passes (existing suite; no new pure-function extraction expected, so no new test file is strictly required, but any touched logic should remain covered if a natural test seam exists).
7. Manual browser verification (post-merge, per this project's established convention): `portfolio.html` overview shows all real projects; `project-config.html?projectId=<real-id>` for a cost-grid-linked project loads correctly with Pipeline locked; direct-link `portfolio.html?projectId=<real-id>` shows full KPIs/name/status, not just the burndown chart.

## Explicitly excluded scope

Proposed for exclusion — confirm before treating as final:
- **Building the "link project to its cost grid" UI on `portfolio.html`** — this fix only makes `cgId` reliably available; the actual future display feature is separate, not requested yet.
- **Auditing every other page for similar "global declared in one script, relied on by a shared helper" fragility** — this fix addresses the one confirmed instance (`_cgStore` in `_apiProjectToLocal`); a broader audit of shared-global assumptions across `js/api-sync.js`/`js/core.js` is a separate, larger effort not requested here.
- **Changing `GET /api/projects/:id`** (the single-project detail endpoint) — confirmed unused by any current client flow (`_apiProjectToLocal` is only called from the list endpoint's `loadConfigFromApi()`); out of scope unless a future caller needs it.
- **Retrofitting `_resolveCgIdForVersion`/`_cgStore` itself** to be more defensive for its *original* callers (`pipeline-board.js`, `planning.js`, `costgrid.js`) — those pages all correctly load `js/costgrid.js` and are not affected by this bug; no change needed there.

## Open questions for /brainstorming

- Exact SQL: `LEFT JOIN cost_grid_versions cgv ON cgv.id = p.cg_version_id` then `SELECT ... cgv.cost_grid_id AS cg_id ...` — confirm column naming convention (snake_case `cg_id` vs. something else) and confirm no existing `cg_id` column-name collision elsewhere in the same query's other joins.
- Whether to keep `_resolveCgIdForVersion`/the `_cgStore` fallback as a *secondary* path in `_apiProjectToLocal` (e.g., prefer `p.cg_id` if present, fall back to `_resolveCgIdForVersion` if not) for defense-in-depth, or remove the client-side resolution path entirely now that the server provides it directly (simpler, single source of truth, but a bigger diff to `_apiProjectToLocal`).

Brief ready. Next step: /brainstorming.
