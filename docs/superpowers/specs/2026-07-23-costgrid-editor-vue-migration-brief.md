# Brief — `costgrid.html` Editor Vue 3 Migration

**Scenario:** Evolution of existing functionality (Vanilla JS → Vue 3, CDN, no build step). Fourth Tier 2 page per `docs/superpowers/specs/2026-07-14-vue-migration-roadmap-design.md`, but scoped to a sub-cycle: only the cost grid **editor** itself, not the shared Roles/Clients/Programs Registry modals (deferred — see Explicitly excluded scope).

## Current behavior

`costgrid.html` (510 lines) is the cost grid editor: a page-level toolbar, version tabs, a phase/task/role spreadsheet-like table, and a phasing panel below it. Unlike the three Tier 2 pages already migrated (`project-config.html`, `portfolio.html`, `pipeline.html`), this page's markup is a nearly-empty shell — almost all rendering is imperative, driven by `js/costgrid.js` (2864 lines), the same file already shared (unmodified) by `pipeline.html`/`planning.html` as a library.

**Page load** (`costgrid.html:329-416`): reads `cgId`/`verId` from the URL, calls `cgLoadStructureFromApi()` then `showCostGridEditorView(cgId, verId)` (`js/costgrid.js:184-201`), which sets module-level state (`_cgActiveCgId`, `_cgActiveVersionId`, `_cgDraft` — a deep-cloned working copy of the version), calls `renderCgVersionTabs()` (`:333`) and `renderCgEditor()` (`:367`).

**`renderCgEditor()`** (`js/costgrid.js:367` through ~`:1000+`) builds `#cgEditorBody`'s entire `innerHTML` on every re-render:
- Toolbar button visibility toggled by direct DOM lookup (`document.getElementById('btnCgGenerateProject').style.display = ...`, `:382-389`) based on lock state (`cgGetVersionLockState`), draft/published status, and whether free (unassigned) tasks remain.
- Lock/draft status banners (`:391-405`).
- A role-column header row with move-left/right, change-role, duplicate-column, remove-column buttons (`:448-475`), each wired via event delegation on re-render.
- An editable rate row per role, with 3-tier rate resolution (ratecard override → custom → ratecard/global default) and visual warnings for zero rates or custom overrides (`:422-445`).
- Phase/task body rows: editable task name/description/dates (textareas + text inputs), an hours-per-role input grid (`:498-505`), a PTC input, computed cost/hours cells, task-assignment locking (already-assigned tasks lose their delete button and selection checkbox, `:507-529`), and a multi-task selection mode (`:509-517`).
- A phasing panel rendered separately by `renderCgPhasing()` (referenced at `:2012`, called after structural changes).

**Modals used by the editor** (all in `costgrid.html`'s body):
- `#cgNewVersionModal` (`:87-104`) — page-local, wired via `cgCreateNewVersion` (`btnCgCreateVersion` click, `:450`).
- `#cgCloneModal` (`:106-127`) — page-local copy (pipeline.html has its own), wired via `cgCloneGrid()` (`js/costgrid.js:2218+`).
- `#cgRoleSelectModal` (`:129-149`) — real, reachable, interactive (search + team-filter buttons, `js/costgrid.js:1504-1558`), used for Add/Change/Duplicate-column role flows.
- `#confirmModal` (`:56-67`) and `#jsonViewerModal` (`:189-206`) — shared Vanilla utilities (`showConfirm()`, `openJsonViewer()`), used as-is by every page including the already-migrated Vue ones (established convention, `CLAUDE.md` "Cost grid editor ↔ pipeline board integration").

**Dead modals confirmed via repo-wide grep** — `#rolesModal` (`:152-171`) + `#roleModal` (`:174-187`), `#programsModal` (`:209-222`) + `#programEditModal` (`:225-237`), `#clientsModal` (`:240-253`) + `#clientEditModal` (`:256-267`): their only opener buttons (`btnRolesView`, equivalent client/program view triggers) are wired exclusively in `js/main.js:160,206-207`, and `js/main.js` is not `<script>`-loaded by any current HTML page (confirmed: `grep -rn "main\.js" *.html` → no matches). `openRoleModal()` (`js/roles.js:106`) is reachable only via `rolesModal`'s own edit-role buttons (`js/roles.js:90`) or `btnAddRole` (`costgrid.html:472`, itself inside the dead `rolesModal`) — so the whole `roleModal` edit flow is dead on this page too. Same dead-opener pattern independently confirmed on `planning.html` (`grep` for `btnRolesView`/`showRolesView`/`showClientsView`/`showProgramsView` → no matches).

**Auto-save**: `cgScheduleAutoSave()` (`js/costgrid.js:2033-2040`) debounces 2s then calls `cgAutoSave()` (`:2017-2029`, syncs `_cgDraft` into local state + `_cgUpsertVersionToApi`) and shows a Bootstrap toast. `btnCgSave` (`:2042-2046`) forces an immediate save with button-text feedback.

**Known bugs, both surfaced during the `pipeline.html` migration cycle** (`docs/superpowers/reports/2026-07-22-worktree-pipeline-vue-migration-finish-cycle.md`), not yet root-caused:
- **"New Proposal" flow broken**: `cgCreateNewGrid()` (`js/costgrid.js:2160-2214`), triggered from `pipeline.html`'s "+ New Proposal" button (`pipeline.html:50,681,734`), reported to not work correctly during manual testing. Not reproduced/diagnosed yet.
- **Clone duplicate-key error**: `cgCloneGrid()` (`js/costgrid.js:2218+`) reproduced a `duplicate key value violates unique constraint "tasks_pkey"` when cloning a version whose phase/task structure was already loaded into memory (real task UUIDs present) — suspected in how the clone's `saveStructure` call handles task ID reuse, not yet root-caused.

## Expected behavior

- `costgrid.html` becomes a Vue 3 (CDN, no build step) page, matching the pattern already used for `project-config.html`/`portfolio.html`/`pipeline.html`: a single reactive Vue app owning the editor's toolbar, version tabs, phase/task/role table, and phasing panel.
- Full reactive rewrite (not a Vue shell around the existing imperative `renderCgEditor()`): every editable cell, role column, task row, and toolbar-button visibility rule becomes Vue-driven (`v-model`/computed/methods), consistent with how the prior three Tier 2 pages were done.
- 1:1 behavioral parity with the current Vanilla implementation for everything in scope — same rate-resolution logic, same task-assignment locking, same selection mode, same auto-save debounce/toast, same lock-state banners.
- `#cgNewVersionModal`, `#cgCloneModal` (this page's own copy), and `#cgRoleSelectModal` become Vue-triggered (opened/driven by Vue methods and reactive state), matching how `pipeline.html` turned its own New Proposal/Clone modals into Vue-triggered dialogs while keeping them as Bootstrap modals.
- `#confirmModal` and `#jsonViewerModal` stay unmodified shared Vanilla utilities, called from Vue via their existing global functions (`showConfirm()`, `openJsonViewer()`) — unchanged convention.
- Dead modals (`#rolesModal`, `#roleModal`, `#programsModal`, `#programEditModal`, `#clientsModal`, `#clientEditModal`) and their now-orphaned wiring in `costgrid.html`'s inline script (`:470-476` roles-section listeners) are deleted from `costgrid.html`. The equivalent dead markup/wiring on `planning.html` is also removed in this cycle, once confirmed dead there by the same grep method used for `costgrid.html`.
- Both known bugs (New Proposal flow, Clone duplicate-key error) are investigated and fixed as part of this cycle, since both live in `js/costgrid.js`, which this cycle already touches in full.
- Pure, testable logic extracted from `renderCgEditor()`/related functions into `js/lib/costgrid-calc.js` (already exists, currently holds `versionHasFreeTasks`/`isVersionCommittedLocked`) or a new sibling `js/lib/*` module, following the TDD pattern used in every prior Tier 2 cycle — exact extraction boundaries to be decided in `/brainstorming` + `/writing-plans`, not here.

## Constraints

- No build step: Vue 3 via CDN only, same as every other Vue page in the project.
- `js/costgrid.js` remains the shared library for `pipeline.html`/`planning.html` (both call into it as globals for shared cost-grid business logic: `cgLoad`, `cgGetVersionLockState`, `cgComputeGrandTotals`, etc.) — this migration must not break those two pages' existing (unmodified) usage of it. Functions consumed cross-page must keep their current signatures/behavior.
- `js/ratecards.js` stays loaded on `costgrid.html` only for its `loadRatecardsForDropdown()` cache helper (`CLAUDE.md`) — no ratecard admin modal exists on this page and none is introduced by this cycle.
- All user-facing text stays in English (`CLAUDE.md` "Language constraint").
- `TEST_CASES.md`/`test-cases.html` must stay mirrored exactly (project convention).
- Cache-busting `?v=N` query params on modified shared scripts (`js/costgrid.js`, etc.) must be bumped, per the pattern already established in the `pipeline.html` cycle (commit `4f2e621`), so fixes reach users without a hard refresh.
- `/finish-cycle` is the mandatory terminal step (test gate → manual verification → `/code-review` → merge → `/sync-docs` + report) — never `superpowers:finishing-a-development-branch`.

## Acceptance criteria

- [ ] `costgrid.html` loads and renders the editor via Vue 3 (CDN), with no remaining imperative `innerHTML`-based rendering for the toolbar/version-tabs/table/phasing-panel.
- [ ] Every toolbar action (Save, New Version, Clone, Export XLS, Generate Project, Publish, Delete Version, Back) behaves identically to today, including all visibility rules (draft-only, locked, free-tasks-remaining).
- [ ] Role column operations (add, change, duplicate, remove, move left/right) and the rate-override/zero-rate visual states behave identically to today.
- [ ] Task row operations (edit name/description/dates/PTC/hours, delete, assignment-locking, multi-select mode) behave identically to today.
- [ ] Phasing panel behaves identically to today.
- [ ] Auto-save (2s debounce + toast) and manual Save behave identically to today.
- [ ] `#rolesModal`, `#roleModal`, `#programsModal`, `#programEditModal`, `#clientsModal`, `#clientEditModal` markup and their dead wiring are removed from `costgrid.html`; the same is done on `planning.html` if independently confirmed dead there.
- [ ] The "New Proposal" flow (`cgCreateNewGrid()`, triggered from `pipeline.html`) works correctly, with the root cause of the previously-reported breakage identified and fixed.
- [ ] Cloning a version whose structure is already loaded in memory no longer throws `duplicate key value violates unique constraint "tasks_pkey"`.
- [ ] `pipeline.html` and `planning.html` continue to work unmodified against the shared parts of `js/costgrid.js` (manual smoke check: open a proposal's detail panel on `pipeline.html`, open the Resource Planning Gantt on `planning.html`).
- [ ] `npm test` (frontend) and the backend `node --test` suite (if any `api/` changes are needed for the Clone bug) both pass.

## Explicitly excluded scope

- Migrating or consolidating the Roles Registry, Programs, or Clients management UI (`js/roles.js`, `js/programs.js`, `js/clients.js`) — deferred to their own future sub-cycle(s), once genuinely reachable entry points exist somewhere in the app (they don't today, hence deletion rather than migration here).
- Migrating or touching `js/ratecards.js`'s rate-card admin modal — not present on this page; lives only in `config.html`, out of scope.
- Migrating `planning.html` itself — only its dead Roles/Clients/Programs modal markup (if confirmed) is touched, as a byproduct of the same dead-code cleanup, not a page migration.
- Resolving the long-deferred roles/clients/programs/ratecards **consolidation** question between `config.html`'s Vue implementation and the Vanilla helpers — still deferred, per the original roadmap design spec, to whichever cycle actually migrates those shared modals.
- The other deferred product-decision items from the `pipeline.html` cycle report not related to `costgrid.html`'s own code: "delete-the-only-version auto-deletes the whole proposal" UX change, and "version tabs should show 'V1' even for a single version" UX change — both remain deferred, not bundled here (they're product decisions, not migration parity or the two specific bugs the user asked to bundle).
- The "Only Draft versions can be published" message flagged as "not reproduced, awareness only" in the pipeline cycle report — not a confirmed bug, not bundled here unless it resurfaces during this cycle's own manual testing.

## Open questions for `/brainstorming`

1. Exact Vue component boundaries inside the editor (single monolithic `Vue.createApp` matching the page, vs. sub-components for the role-header row / task-row / phasing-panel) — architecture decision, not fixed by this Brief.
2. Extraction boundaries for pure logic into `js/lib/` (which functions, which new/existing module) — TDD-driven, decided during planning.
3. Root cause and fix approach for both bundled bugs (New Proposal flow, Clone duplicate-key) — investigation is in scope, but the diagnosis itself hasn't happened yet.
4. Whether the Clone duplicate-key fix requires a backend (`api/`) change (task ID regeneration on structure save) or a frontend-only fix (stripping client-held task UUIDs before the clone's `saveStructure` call) — determines whether the backend `node --test` gate applies.

Brief ready. Next step: /brainstorming.
