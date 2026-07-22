# `costgrid.html` Editor Vue 3 Migration — Design Spec

**Source:** Brief `docs/superpowers/specs/2026-07-23-costgrid-editor-vue-migration-brief.md`. Fourth Tier 2 page per `docs/superpowers/specs/2026-07-14-vue-migration-roadmap-design.md`, scoped as a sub-cycle: the cost grid **editor** only. Migrating/consolidating the shared Roles/Clients/Programs Registry modals is a separate, future sub-cycle.

## Problem

`costgrid.html` (510 lines) is the cost grid editor: toolbar, version tabs, a phase/task/role spreadsheet-like table, and a phasing panel. Its markup is a near-empty shell — rendering is entirely imperative, driven by `js/costgrid.js` (2864 lines), which `pipeline.html`/`planning.html` also depend on as a shared library. `renderCgEditor()` (`js/costgrid.js:367`–~`1000`) alone rebuilds the whole editor body's `innerHTML` on every change.

## Investigation findings (informing scope decisions below)

1. **Dead modals confirmed via repo-wide grep**: `#rolesModal`+`#roleModal`, `#programsModal`+`#programEditModal`, `#clientsModal`+`#clientEditModal` (`costgrid.html:152-267`) are unreachable — their only openers (`showRolesView`/`showClientsView`/`showProgramsView`) are wired exclusively in `js/main.js:160,206-207`, which no current HTML page loads (`grep -rn "main\.js" *.html` → no matches). Same confirmed independently on `planning.html` (no `btnRolesView`/`showRolesView`/`showClientsView`/`showProgramsView` match).
2. **`#cgRoleSelectModal` is real and reachable** (`costgrid.html:129-149`, driven by `js/costgrid.js:1490-1558`+) — a genuinely interactive Add/Change/Duplicate-role dialog with search + team filters. It is part of this cycle's scope, unlike the dead Registry modals above.
3. **`js/costgrid.js` stays the shared library for `pipeline.html`/`planning.html`.** Functions those two pages call as globals (`cgLoad`, `cgGetIndex`, `cgCreateNewGrid`, `cgCloneGrid`, `cgConfirmDeleteGrid`, `cgConfirmDeleteVersion`, `cgGetVersionLockState`, `cgComputeGrandTotals`/`cgComputePhaseTotals`/`cgComputeTaskTotals`, `showConfirm()`, `openJsonViewer()`) keep their current signatures and behavior. This migration converts `costgrid.html`'s own rendering (`renderCgEditor`, `renderCgVersionTabs`, the page's inline init script) to Vue; it does not touch the parts of `js/costgrid.js` that the other two pages rely on, except where the two bundled bug fixes require it (see below).
4. **Clone bug — root cause confirmed.** `cgCloneGrid()` (`js/costgrid.js:2261-2264`) passes the source version's `phases`/`roles` — including the source's real `taskId` UUIDs — straight to `saveStructure()` for the brand-new version. The backend (`api/src/routes/cost-grids.js:600-609`) reuses a supplied `taskId` as the new row's primary key when present (`INSERT INTO tasks (id, ...)`) — necessary for normal edits (task IDs must stay stable across saves of the *same* version, since linked-project task mappings reference them), but wrong for Clone, where the source version's tasks still exist in the DB under those same IDs. Result: `duplicate key value violates unique constraint "tasks_pkey"`. Fix is frontend-only: strip `taskId`/`phaseId` from the cloned structure before calling `saveStructure`, so the backend takes its ID-less `INSERT` branch and mints fresh UUIDs. No backend change needed.
5. **New Proposal bug — not yet root-caused.** `cgCreateNewGrid()` ends by calling `showCostGridEditorView(cgId, verId)`, which `pipeline.html` overrides (`pipeline.html:358-361`) as a plain redirect to `costgrid.html?cgId=...&verId=...` — apparently intentional (open the new proposal immediately for editing). The actual reported breakage is not yet confirmed; a candidate cause is a permissions/ownership gap on the newly-created grid when `costgrid.html` re-syncs from the API on cold load (`cgSyncFromApi()`, `costgrid.html:353`), but this is unconfirmed. Per this project's Scenario 2 process, the implementation plan must start with a characterization test/manual repro of the current flow before attempting a fix — no fix is designed against an unconfirmed cause.

## Architecture

`costgrid.html` becomes a single `Vue.createApp({...}).mount(...)` instance (CDN, no build step), same pattern as `project-config.html`/`portfolio.html`/`pipeline.html` — one monolithic component, no Vue sub-components (matches the precedent set by all three prior Tier 2 migrations; introducing multi-component structure now would be a new, unprecedented convention for this codebase). The Vue instance owns: toolbar state/visibility, version tabs, the phase/task/role table, and the phasing panel.

`js/costgrid.js` stays loaded, trimmed only of the now-dead-modal-specific code paths (see Components, Task 5), and continues to be called as a global library — both by this page's own Vue methods and, unchanged, by `pipeline.html`/`planning.html`. `js/core.js`, `js/api.js`, `js/api-sync.js`, `js/nav.js` stay loaded unchanged. `js/roles.js`/`js/clients.js`/`js/programs.js` stay loaded (still needed elsewhere on this page? — no: confirmed used only by the dead Registry modals on this page, see Task 5) — **dropped from `costgrid.html`'s script list** once their sole reachable consumers (the dead modals) are removed; `loadClientsFromApi()`/`loadProgramsFromApi()`/`loadRolesFromApi()` calls in the init script are unaffected since those population functions live in `js/api-sync.js`, not in the CRUD-modal files being dropped.

`js/lib/costgrid-calc.js` (existing) gains the rate-resolution and totals extraction (Task 6) plus the Clone-fix helper (Task 7).

## Components (single Vue instance, 7 tasks)

**`data()`**: `cgId`/`verId` (from URL), `draft` (reactive equivalent of `_cgDraft` — the working copy of the version: `roles`, `phases[].tasks[]`, header fields), `selectionMode`/`selectedTaskIds`, dialog state for the three page-owned modals (`roleSelectMode`/`roleSearch`/`activeTeamFilter` for `#cgRoleSelectModal`; `newVersionLabel`/`newVersionError` for `#cgNewVersionModal`; `cloneGridName`/`cloneError` for `#cgCloneModal`), `ratecardMap` (from `cgUpdateActiveRatecardMap()`), autosave timer handle.

**Task 1 — Toolbar + version tabs + page shell**: reactive equivalents of `showCostGridEditorView()`/`renderCgVersionTabs()` (`js/costgrid.js:184-201,333`) — page title, version tab row (shown when `draft.versions?.length > 1`, matching the existing rule), toolbar button visibility (`v-if` on `isDraft`/`isLocked`/`hasFreeTasks`, replacing the direct `style.display` toggles at `:382-389`), lock/draft banners (`:391-405`).

**Task 2 — Role columns**: header cells with move-left/right, change-role, duplicate-column, remove-role actions (`:448-475`), the editable rate row with 3-tier resolution and zero-rate/custom visual states (`:422-445`) — rate resolution itself calls into the new `js/lib/costgrid-calc.js` function from Task 6, not reimplemented inline.

**Task 3 — Task rows**: editable task name/description/dates/PTC/hours-per-role grid (`v-model` on `draft`, replacing the current `input`/`blur` event-delegation), delete button (hidden when assigned), multi-select checkboxes in selection mode (`:495-580`+), task-assignment locking (`cgGetAssignedTaskIds()`/`cgGetAssignedTaskNames()`, unchanged calls).

**Task 4 — Phasing panel + toolbar actions**: reactive equivalent of `renderCgPhasing()` (referenced `:2012`); Save/autosave (`cgAutoSave()`/`cgScheduleAutoSave()`, unchanged, triggered from Vue watchers or explicit `@input`/`@change` handlers instead of the current global-scope debounce trigger sites), New Version/Clone/Publish/Delete Version/Export XLS/Generate Project buttons — `#cgNewVersionModal` and `#cgCloneModal` become Vue-triggered (opened via Vue methods, still Bootstrap-modal-backed, matching how `pipeline.html` drives its own Clone modal). `#confirmModal` stays untouched Vanilla, called via `showConfirm()`.

**Task 5 — Role Selector + dead-modal removal**: `#cgRoleSelectModal` (Add/Change/Duplicate role flows, search + team filters) becomes Vue-triggered/reactive. In the same task: delete `#rolesModal`, `#roleModal`, `#programsModal`, `#programEditModal`, `#clientsModal`, `#clientEditModal` markup from `costgrid.html`, their dead wiring in the old inline init script, and the now-unneeded `js/roles.js`/`js/clients.js`/`js/programs.js` `<script>` tags from `costgrid.html`'s script list. Repeat the same grep-confirmed dead-modal removal on `planning.html` if independently verified there during this task (its own `loadRolesFromApi()`/`loadClientsFromApi()`/`loadProgramsFromApi()` calls are unaffected the same way).

**Task 6 — `js/lib/costgrid-calc.js` extraction**: rate-resolution (ratecard override → custom → ratecard/global default, from `:423-445`) and phase/task/column totals (`cgComputePhaseTotals`/`cgComputeTaskTotals`-equivalent pure logic currently entangled in `renderCgEditor()`), with vitest coverage — TDD, following the pattern of every prior Tier 2 cycle's extractions.

**Task 7 — Bug fixes**:
- Clone: a pure function (naming finalized in the implementation plan, working name `stripCloneTaskIds(phases)`) in `costgrid-calc.js`, vitest-covered, called from `cgCloneGrid()` before `saveStructure()`.
- New Proposal: characterization test/manual repro first (no code change until the actual cause is confirmed), then a targeted fix with its own regression check.

**Final task — Empirical mount verification**: mount the assembled page in jsdom with the real `vue.global.js` build and realistic data (a multi-role/multi-phase version, a locked/Committed version, a Draft with free tasks, one with linked projects), verifying zero thrown errors — the same safety net used in the `pipeline.html`/`portfolio.html` cycles to catch bare-global-unreachable-from-template-scope bugs that static review and `npm test` alone missed.

**Dropped (confirmed dead, not ported):** `#rolesModal`, `#roleModal`, `#programsModal`, `#programEditModal`, `#clientsModal`, `#clientEditModal` and their JS wiring; `js/roles.js`/`js/clients.js`/`js/programs.js` `<script>` loads on `costgrid.html` (and on `planning.html` if confirmed dead there too).

**Kept, called as globals (unchanged):** `cgLoad`, `cgGetIndex`, `cgSave`, `cgGetVersionLockState`, `cgComputeGrandTotals`/`cgComputePhaseTotals`/`cgComputeTaskTotals`, `cgGetAssignedTaskIds`/`cgGetAssignedTaskNames`, `cgCreateNewVersion`, `cgPublishDraft`, `cgExportXls`, `cgGenerateProject`, `cgAutoSave`/`cgScheduleAutoSave`, `showConfirm()`, `openJsonViewer()`, `loadRatecardsForDropdown()` (`js/ratecards.js`, cache helper only — no admin modal on this page).

## Data flow

No API contract changes except the Clone request payload (structure sent to `saveStructure` no longer includes the source version's `taskId`/`phaseId`). Same endpoints otherwise (`Api.costGrids`, `Api.costGrids.versions.*`). `_cgDraft`'s reactive replacement is populated the same way — a deep clone of the loaded version (`cgMigrateVersion(JSON.parse(JSON.stringify(version)))`, unchanged) — and synced back via the unchanged `cgAutoSave()`/`_cgUpsertVersionToApi()` path.

## Error handling

Adopt the loading/failure-state pattern already used by `pipeline.html`'s detail panel: a centered spinner while `cgLoadStructureFromApi()` is in flight, an explicit "Could not load cost grid" message (with a link back to Pipeline) if the version fails to resolve — replacing the current hardcoded `innerHTML` error strings (`costgrid.html:366-410`).

## Backward compatibility

Every reachable feature (toolbar actions, role columns, task rows, phasing panel, autosave, Role Selector, New Version, Clone, Publish, Delete Version, Export XLS, Generate Project) is a 1:1 port, plus the two bundled bug fixes. `pipeline.html`/`planning.html` are unaffected: `js/costgrid.js`'s shared functions keep their signatures; manual smoke test on both pages (open a proposal's detail panel on `pipeline.html`, open the Resource Planning Gantt on `planning.html`) is part of this cycle's manual verification, not deferred.

## Testing

`js/lib/costgrid-calc.js`'s new/extended functions (rate-resolution, totals, `stripCloneTaskIds`) get vitest unit tests. The New Proposal bug gets a characterization test of current behavior before any fix. Full page verified via the empirical jsdom + real `vue.global.js` mount test (final task), plus manual post-merge browser verification (editor itself, plus the `pipeline.html`/`planning.html` cross-page smoke checks) per this roadmap's established convention. `npm test` (frontend) always; backend `node --test` only if the New Proposal fix ends up requiring an `api/` change (undetermined until root-caused).

## Explicitly out of scope

- Migrating or consolidating the Roles Registry/Programs/Clients management UI (`js/roles.js`, `js/programs.js`, `js/clients.js`) — no reachable entry point exists anywhere in the app today (confirmed dead on both `costgrid.html` and `planning.html`), so this cycle deletes the dead markup rather than migrating functionality; a real migration cycle for these can only happen once/if a reachable entry point is (re)introduced.
- `js/ratecards.js`'s rate-card admin modal — not present on this page (lives only in `config.html`).
- Migrating `planning.html` itself — only its dead Roles/Clients/Programs markup (if confirmed) is touched.
- The roles/clients/programs/ratecards Vue-vs-Vanilla consolidation question — still deferred per the original roadmap design spec.
- "Delete-the-only-version should auto-delete the whole proposal" and "version tabs should show 'V1' even for a single version" — UX product decisions deferred from the `pipeline.html` cycle, not bundled here.
- The "Only Draft versions can be published" message — flagged as awareness-only in the `pipeline.html` cycle report, not a confirmed bug, not bundled here unless it resurfaces during this cycle's own manual testing.
- Any build-step introduction (Vite/SFC).
- Any backend/API change beyond what the New Proposal root-cause investigation might require (undetermined at spec time).
