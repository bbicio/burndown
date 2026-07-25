# Brief — `planning.html` Vue 3 Migration

**Scenario:** Evolution of existing functionality (Vanilla JS → Vue 3, CDN, no build step). Fifth and **last** Tier 2 page per `docs/superpowers/specs/2026-07-14-vue-migration-roadmap-design.md` — once this cycle completes, every page in the app is on Vue 3 except the 9-line `index.html` redirect (explicitly excluded from the roadmap).

## Current behavior

`planning.html` (379 lines) is the Resource Planning view: filters (project/team dropdowns), a view toggle (By Role / By Project / By Owner), an interval toggle (Monthly/Weekly), a sliding date-window navigator, a Monthly Pulse / Rounded-hours display toggle, an XLS export, an XLS upload ("Load XLS"), and an AI Planning Sidebar chat panel. All rendering is imperative, driven by `js/planning.js` (1558 lines).

**Page structure and init** (`planning.html:223-372`): on `DOMContentLoaded`, calls `initNav('planning', ...)`, loads clients/programs/roles/config/timesheets/pipeline-budgets from the API, then either `showPlanningView(urlProjectId)` (single-project Gantt view, if `?projectId=` is present) or `showPortfolioPlanningView()` (the default multi-project view). Wires ~15 `addEventListener` calls directly to DOM ids for view/interval toggles, window-navigation arrows, display-toggle checkboxes, filter-reset buttons, XLS export/upload, AI sidebar open/close/send, and the JSON viewer.

**`js/planning.js`'s structure** (1558 lines, no Vue):
- `getPlanningPeriods`, `buildPlanningBarCells`, `countFutureTaskWeeks`, `getCalendarWeeks`, `workingDaysInWeek`, `buildWeekAllocationTable` (`:2-182`) — shared date/Gantt-bar helpers used across every view.
- `renderPlanningView(projectId)` / `renderPlanningByTask` / `renderPlanningByRole` / `showPlanningView(projectId)` (`:183-395`) — the single-project Gantt/task view (reached via `?projectId=`, e.g. from `portfolio.html`'s "📅 Planning" button).
- `renderPortfolioPlanningView()` (`:396-865`) — the main multi-project entry point: filter chips, the sliding date window (`ppWindowStart`/`ppWindowEnd` and `getPpAxis()` — state/helper live in shared `js/core.js:25-26,88-105`), and, inline in this same function, the default **By Role** grouping/render logic (`:580-865`).
- `renderPortfolioPlanningByProjectContent` (`:930-1261`) and `renderPortfolioPlanningByOwnerContent` (`:1262-1536`) — the other two grouping views, each with their own inline filter/table/export logic.
- `buildStyledExcelExport` (`:867-928`) — async XLS export via `ExcelJS.Workbook()`, invoked identically from all three grouping views' export buttons (`:858,1257,1534`).
- `setupGroupToggle` (`:1539-1558`) — shared expand/collapse-group UI helper.
- Already-extracted, tested pure logic: `matchesTaskRole`/`computeResidual`/`distributeFutureResidual` (`js/lib/planning-calc.js:1,7,11`, `window`-bridged) are called from all three grouping views (`js/planning.js:605,609,678,617,1027,1029,1070,1311,1331,1356`). Everything else in the three grouping views (filter UI, week-bucket math, HTML-string building, Excel export, group-toggle) is still inline, not yet extracted.

**Confirmed dead code on this page:**
- `js/config-form.js` (`planning.html:183`, 1369 lines): no `#configModal` markup exists on this page, and its entry point `openConfigModal()` has no reachable caller from `planning.html`/`js/planning.js` (its only callers are the unloaded `js/main.js` and `js/costgrid.js:1193`, itself unreachable here — see below). Matches the pattern already found and removed on `project-config.html`/`portfolio.html`.
- `js/costgrid.js` (`planning.html:179`): loaded, but grep confirms zero genuine calls into it from `js/planning.js`. `planning.html` only neutralizes two of its functions with page-local overrides (`showCostGridEditorView` → a plain redirect, `cgHideAll` → a no-op), and references the shared `#cgAutoSaveToast` DOM id — but the function that targets that toast is never invoked from this page. Unlike on `costgrid.html`/`pipeline.html` (which genuinely depend on this file), `planning.html` has no runtime dependency on it at all.
- `getRoles()`/`getClients()`/`getPrograms()` and every Roles/Clients/Programs Registry CRUD-modal opener (`showRolesView`, `openRoleModal`, `showClientsModal`, `openClientEditModal`, `showProgramsModal`, `openProgramEditModal`, `cfgRefreshClientDropdown`, `cfgRefreshProgramDropdown`): zero calls from `planning.js`/`js/portfolio.js`. The `#rolesModal`/`#roleModal` markup itself was already confirmed dead and removed from `planning.html` in the just-completed `costgrid.html` migration cycle. `js/roles.js`/`js/clients.js`/`js/programs.js`'s `<script>` tags stay loaded regardless — `loadRolesFromApi()`/`loadClientsFromApi()`/`loadProgramsFromApi()` (`planning.html:235`) are genuinely called at init, and `getClientName()` (`js/clients.js:27`) is transitively reachable via `fmtProjectTitle()` (see below).
- `openJsonViewer()` (backing `#jsonViewerModal`, `planning.html:146`): defined in shared `js/core.js:190`, but its only callers repo-wide are `js/core.js` itself, the unloaded `js/main.js`, and `js/costgrid.js:253` (itself unreachable from this page per above) — not currently reachable from `planning.html`.

**Live cross-file dependencies (must keep working):**
- `js/portfolio.js`: exactly two exports used — `getMonthRangeFromCfg(cfg)` (`js/planning.js:3`) and `fmtProjectTitle(cfg)` (`js/planning.js:187,485`). `fmtProjectTitle` itself calls `getClientName()` (`js/clients.js:27`) internally (`js/portfolio.js:10`). No other `js/portfolio.js` export (`renderPortfolioView`, `buildProjectCard`, `buildProgramSummary`, etc. — all `portfolio.html`-overview-only) is used here.
- `js/ai.js` (573 lines, also loaded by `portfolio.html` with a *disjoint* entry point — `openAiAnalysis()`/Vue binding there vs. `aiPlanSend()` here): `planning.html` wires only `aiPlanSend()` (`planning.html:335,341`) and `updateAiButtonVisibility()` (`planning.html:226`) — the chat-turn handler that hits one of three hardcoded AI-provider endpoints directly via `fetch` (Anthropic/OpenAI/Gemini, `js/ai.js:118,133,151`) and calls `showConfirm()` (`js/core.js:352`) on a missing API key (`js/ai.js:101`) — this is the one path that makes `#confirmModal` genuinely reachable on this page today. `buildPlanningContext()` (`js/ai.js:4`) feeds `aiPlanSend`'s prompt.
- `js/upload.js` (38 lines, also loaded by `portfolio.html` with a *different* export — `readXLSForProject` there vs. `readXLS` here): `planning.html:320-325` wires `readXLS(file, onComplete)` (`js/upload.js:1`) to the "Load XLS" button/hidden file input.
- `#confirmModal`/`#jsonViewerModal` (`planning.html:132-162`): the same shared Vanilla utilities (`showConfirm()`/`openJsonViewer()`) used across every page, Vue-migrated or not — established convention to leave untouched.

## Expected behavior

- `planning.html` becomes a Vue 3 (CDN, no build step) page, matching the pattern used for `project-config.html`/`portfolio.html`/`pipeline.html`/`costgrid.html`.
- 1:1 behavioral parity for everything currently reachable: filters, view/interval toggles, the sliding date-window navigator, Monthly Pulse/Rounded-hours toggles, all three grouping views (By Role/By Project/By Owner) with their exact current math and layout, the single-project Gantt view (`?projectId=` entry point), XLS export, XLS upload, and the AI Planning Sidebar.
- `js/config-form.js` and `js/costgrid.js` `<script>` tags are dropped from `planning.html` (confirmed dead weight on this specific page — other pages that still need `js/costgrid.js` are unaffected, since the file itself is untouched).
- `js/roles.js`/`js/clients.js`/`js/programs.js` stay loaded (still needed for their `load*FromApi()` functions and the `getClientName()` transitive dependency).
- `js/ai.js`/`js/upload.js`/`js/portfolio.js` stay loaded as shared Vanilla utilities, called from the new Vue instance's methods exactly as they are today (no rewrite of their internals) — matching how `pipeline.html`'s Vue rewrite still calls `js/costgrid.js`'s functions as globals.
- `#confirmModal`/`#jsonViewerModal` stay untouched shared Vanilla markup/utilities.
- Pure, testable logic newly extracted from `js/planning.js`'s three grouping views (exact boundaries TBD in `/brainstorming` + `/writing-plans`) follows the established TDD extraction pattern, potentially extending the existing `js/lib/planning-calc.js`.

## Constraints

- No build step — Vue 3 via CDN only, matching every other Vue page.
- `js/roles.js`/`js/clients.js`/`js/programs.js`/`js/ai.js`/`js/upload.js`/`js/portfolio.js` remain shared library files — this migration must not change their exported function signatures/behavior, since `js/ai.js`/`js/upload.js`/`js/portfolio.js` are each still genuinely used by `portfolio.html` (with different entry points on that page) and `js/roles.js`/`js/clients.js`/`js/programs.js` are still loaded by `costgrid.html`.
- All user-facing text stays in English (`CLAUDE.md` "Language constraint") — note `js/ai.js:101`'s existing "no API key" confirm message is in Italian ("Nessuna API key configurata..."); this is pre-existing text in a file this cycle does not intend to rewrite, not something introduced by this migration — flagged for a scope decision in `/brainstorming`, not fixed here by default.
- `TEST_CASES.md`/`test-cases.html` must stay mirrored exactly.
- Cache-busting `?v=N` bumps on any modified shared script, on every page that loads it.
- `/finish-cycle` is the mandatory terminal step.

## Acceptance criteria

- [ ] `planning.html` renders entirely via Vue 3 (CDN), with no remaining imperative `innerHTML`-based rendering for filters/toggles/window-navigator/grouping views/Gantt view.
- [ ] All three grouping views (By Role, By Project, By Owner) behave identically to today, including their exact filter/date-window/pulse/rounding interactions.
- [ ] The single-project Gantt view (`?projectId=` entry point, reached from `portfolio.html`'s "📅 Planning" button) behaves identically to today.
- [ ] XLS export and XLS upload behave identically to today.
- [ ] The AI Planning Sidebar (open/close, send, clear, Enter-to-send) behaves identically to today, still calling the same shared `js/ai.js` functions.
- [ ] `js/config-form.js` and `js/costgrid.js` `<script>` tags are removed from `planning.html`.
- [ ] `portfolio.html` and `costgrid.html` continue to work unmodified against the shared files this cycle touches (`js/ai.js`, `js/upload.js`, `js/portfolio.js`, `js/roles.js`/`js/clients.js`/`js/programs.js`) — manual smoke check on both pages.
- [ ] `npm test` passes with no regressions.

## Explicitly excluded scope

- Migrating or rewriting `js/ai.js`, `js/upload.js`, or `js/portfolio.js`'s internal logic — they stay Vanilla utility files, called from the new Vue instance as globals, exactly as `pipeline.html` still calls `js/costgrid.js`.
- Resolving the roles/clients/programs/ratecards Vue-vs-Vanilla consolidation question — still deferred; no reachable entry point exists anywhere in the app for the Registry CRUD modals.
- Translating `js/ai.js:101`'s pre-existing Italian confirm-dialog string to English — out of scope unless the user decides otherwise in `/brainstorming` (this file isn't being rewritten by this cycle).
- Fixing `openPlanningAiAnalysis()` (`js/ai.js:515`) — confirmed to have zero callers anywhere in the repo, dead code independent of this migration; not this cycle's concern unless the user wants it removed as a drive-by cleanup.
- Any build-step introduction (Vite/SFC).
- Any backend/API change.
- Investigating or fixing any new bug reports discovered incidentally during this cycle's manual testing — per this project's Scenario 2 process, any such finding gets isolated and reported, not silently fixed in the same cycle (unless the user explicitly decides to bundle it, as happened with the two bugs bundled into the `costgrid.html` cycle).

## Open questions for `/brainstorming`

1. Component boundaries: single monolithic `Vue.createApp` (established precedent for every prior Tier 2 page, including the much larger `costgrid.html`) vs. any deviation — expect this to be confirmed, not re-litigated, but stated as an open item per the Brief template.
2. Extraction boundaries for the three grouping views' still-inline logic into `js/lib/planning-calc.js` (or a new sibling module) — which functions, TDD-driven, decided during planning.
3. Whether to decompose this migration into sub-cycles (e.g. multi-project grouping views first, single-project Gantt view + AI sidebar + XLS second) given `js/planning.js`'s size (1558 lines, comparable to `costgrid.js`'s own rendering complexity that motivated an 8-task plan) — or execute as one cycle like every prior Tier 2 page.
4. Whether the AI Planning Sidebar's chat UI markup (`#aiPlanSidebar`) becomes part of the Vue template (reactive open/closed state, message list) while still delegating to `js/ai.js`'s `aiPlanSend`/`buildPlanningContext`, matching how `portfolio.html`'s Vue rewrite kept `js/ai.js`'s logic untouched but wired its own UI to it.

Brief ready. Next step: /brainstorming.
