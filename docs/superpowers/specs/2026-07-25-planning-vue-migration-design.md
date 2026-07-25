# `planning.html` Vue 3 Migration — Design Spec

**Source:** Brief `docs/superpowers/specs/2026-07-25-planning-vue-migration-brief.md`. Fifth and **last** Tier 2 page per `docs/superpowers/specs/2026-07-14-vue-migration-roadmap-design.md` — once this cycle completes, every page in the app is on Vue 3 except the 9-line `index.html` redirect (excluded from the roadmap entirely).

## Problem

`planning.html` (379 lines) is the Resource Planning view: filters, a view toggle (By Role/By Project/By Owner), an interval toggle (Monthly/Weekly), a sliding date-window navigator, Monthly Pulse/Rounded-hours toggles, XLS export/upload, and an AI Planning Sidebar chat panel. All rendering is imperative, driven by `js/planning.js` (1558 lines, confirmed exclusive to this page via `grep -rn "js/planning.js" *.html`).

## Investigation findings (informing scope decisions below)

1. **`js/config-form.js` and `js/costgrid.js` are confirmed dead weight on this specific page.** `js/config-form.js` has no `#configModal` markup here and no reachable caller (`openConfigModal()`'s only callers are the unloaded `js/main.js` and `js/costgrid.js:1193`, itself unreachable from this page). `js/costgrid.js` is loaded but `js/planning.js` makes zero genuine calls into it — `planning.html` only neutralizes two of its functions with page-local overrides (`showCostGridEditorView` → plain redirect, `cgHideAll` → no-op). Both `<script>` tags are dropped from `planning.html`; the files themselves are untouched (`costgrid.html`/`pipeline.html` still need `js/costgrid.js`).
2. **`js/planning.js` is exclusive to this page** (confirmed via repo-wide grep) — safe to fold its rendering logic entirely into the Vue rewrite and delete the file, matching the precedent set by `js/pipeline-board.js` (deleted in the `pipeline.html` cycle) and `js/dashboard.js` (deleted in the `portfolio.html` cycle).
3. **`js/roles.js`/`js/clients.js`/`js/programs.js` stay loaded, unmodified.** Their CRUD-modal openers are confirmed dead here (matching the pattern already resolved on `costgrid.html`; the dead `#rolesModal`/`#roleModal` markup was already removed from `planning.html` in that same cycle), but `loadRolesFromApi()`/`loadClientsFromApi()`/`loadProgramsFromApi()` are genuinely called at init, and `getClientName()` (`js/clients.js:27`) is transitively reachable via `fmtProjectTitle()`.
4. **`js/ai.js`, `js/upload.js`, `js/portfolio.js` are shared, multi-page utility files with disjoint per-page entry points** — `portfolio.html` uses `openAiAnalysis()`/`readXLSForProject()`, `planning.html` uses `aiPlanSend()`/`readXLS()`; `js/portfolio.js` contributes exactly two exports here (`getMonthRangeFromCfg`, `fmtProjectTitle`). All three stay Vanilla, unmodified, called as globals from the new Vue instance — matching how `pipeline.html`'s Vue rewrite still calls `js/costgrid.js` as a global library.
5. **`#confirmModal` is reachable today only via `js/ai.js:101`**'s missing-API-key path (`aiPlanSend()`); `#jsonViewerModal`/`openJsonViewer()` is not currently reachable from this page at all (its only callers are `js/core.js`, the unloaded `js/main.js`, and unreachable `js/costgrid.js:253`). Both stay as untouched shared Vanilla markup/utilities regardless, per established convention — no change needed to keep them working.

## Architecture

`planning.html` becomes a single `Vue.createApp({...}).mount(...)` instance (CDN, no build step), same pattern as `costgrid.html`/`pipeline.html`. `js/planning.js`'s ~1558 lines fold entirely into the Vue instance's `data()`/`computed`/`methods`; the file itself is deleted from disk and its `<script>` tag removed. `js/roles.js`/`js/clients.js`/`js/programs.js`/`js/ai.js`/`js/upload.js`/`js/portfolio.js` stay loaded, unmodified, called as globals. `js/config-form.js`/`js/costgrid.js` `<script>` tags are dropped (files themselves untouched, still needed elsewhere). `#confirmModal`/`#jsonViewerModal` stay static Vanilla markup outside the Vue-managed template.

`js/lib/planning-calc.js` (existing — `matchesTaskRole`/`computeResidual`/`distributeFutureResidual`) gains `getCalendarWeeks`/`workingDaysInWeek`/`getPlanningPeriods`/`countFutureTaskWeeks` — pure date/week-bucketing helpers currently untested and shared across all views, extracted with TDD (vitest).

## Components (single Vue instance)

**`data()`**: filter state (selected projects/team), active grouping view (`byrole`/`byproject`/`byowner`), interval (`monthly`/`weekly`), sliding date window (`ppWindowStart`/`ppWindowEnd`), `portfolioMonthlyPulse`/`portfolioRoundHours` toggles, AI sidebar open/closed + message list, full-width toggle state.

**Task A — Filters, toggles, window navigator, page shell**: reactive equivalents of the project/team filter dropdowns, view/interval toggle button groups, the 4 window-navigation arrow buttons (`getPpAxis()`-clamped, `js/core.js:25-26,88-105`, unchanged), Monthly Pulse/Rounded-hours switches, full-width toggle.

**Task B — By Role grouping view**: `computed` deriving the default grouping table (currently inline in `renderPortfolioPlanningView()`, `js/planning.js:580-865`), reusing `matchesTaskRole`/`computeResidual`/`distributeFutureResidual` and the newly-extracted week-bucketing helpers.

**Task C — By Project grouping view**: `computed` port of `renderPortfolioPlanningByProjectContent` (`js/planning.js:930-1261`).

**Task D — By Owner grouping view**: `computed` port of `renderPortfolioPlanningByOwnerContent` (`js/planning.js:1262-1536`).

**Task E — Single-project Gantt view**: `v-if`-branched template section porting `renderPlanningView`/`renderPlanningByTask`/`renderPlanningByRole`/`showPlanningView` (`js/planning.js:183-395`), reached via `?projectId=`.

**Task F — XLS export/upload + AI Sidebar**: `buildStyledExcelExport` (`js/planning.js:867-928`) becomes a Vue method or a plain helper function retained in the page's own script, called identically from all three grouping views' export buttons. `readXLS` (`js/upload.js`, unchanged) wired to a Vue method for the "Load XLS" button. AI Sidebar markup/open-closed state/message list become Vue-reactive; `aiPlanSend()`/`buildPlanningContext()`/`updateAiButtonVisibility()` (`js/ai.js`, unchanged) called from Vue methods exactly as `portfolio.html` already does for its own AI entry point. `js/ai.js:101`'s hardcoded Italian confirm string ("Nessuna API key configurata...") is translated to English in this cycle (a small, explicitly-scoped exception to "don't rewrite `js/ai.js`" — only this one string changes, not the surrounding logic).

**Task G — `js/lib/planning-calc.js` extraction**: `getCalendarWeeks`, `workingDaysInWeek`, `getPlanningPeriods`, `countFutureTaskWeeks` extracted with vitest coverage, TDD.

**Final task — Empirical mount verification**: mount the assembled page in jsdom with the real `vue.global.js` build and realistic data (multi-project portfolio data covering all three grouping views, a single-project Gantt case, at least one task with future residual hours), verifying zero thrown errors — same safety net used in every prior Tier 2 cycle.

**Dropped (confirmed dead, not ported):** `js/config-form.js`, `js/costgrid.js` `<script>` tags on this page only (files untouched, still loaded elsewhere).

**Kept, called as globals (unchanged):** `getMonthRangeFromCfg`/`fmtProjectTitle` (`js/portfolio.js`), `getClientName` (`js/clients.js`), `loadRolesFromApi`/`loadClientsFromApi`/`loadProgramsFromApi` (`js/roles.js`/`js/clients.js`/`js/programs.js`), `aiPlanSend`/`buildPlanningContext`/`updateAiButtonVisibility`/`renderAiPlanMessages` (`js/ai.js`), `readXLS` (`js/upload.js`), `showConfirm`/`openJsonViewer` (`js/core.js`), `getPpAxis` and window-state helpers (`js/core.js`).

## Data flow

No API contract changes. Same endpoints as today (`loadConfigFromApi`, `refreshTimesheetDataFromApi`, `loadPipelineBudgetsFromApi`, `loadClientsFromApi`/`loadProgramsFromApi`/`loadRolesFromApi`). `config.projects`/`timesheetData` remain the in-memory data sources, unchanged.

## Error handling

Adopt the loading/failure-state pattern already used by `costgrid.html`/`pipeline.html`: a centered spinner while initial data loads, an explicit failure message if it doesn't — replacing any current ad-hoc error handling in the init script.

## Backward compatibility

Every reachable feature (filters, 3 grouping views, single-project Gantt, XLS export/upload, AI sidebar) is a 1:1 port. `portfolio.html`/`costgrid.html` are unaffected: `js/ai.js`/`js/upload.js`/`js/portfolio.js`/`js/roles.js`/`js/clients.js`/`js/programs.js` keep their exact signatures; manual smoke test on both pages (AI Analysis button on `portfolio.html`, cost grid editor on `costgrid.html`) is part of this cycle's manual verification.

## Testing

`js/lib/planning-calc.js`'s new extractions get vitest unit tests. Full page verified via the empirical jsdom + real `vue.global.js` mount test (final task), plus manual post-merge browser verification (this page itself, plus the `portfolio.html`/`costgrid.html` cross-page smoke checks) per this roadmap's established convention. `npm test` always.

## Explicitly out of scope

- Migrating or rewriting `js/ai.js`, `js/upload.js`, or `js/portfolio.js`'s internal logic — stay Vanilla utility files (except the one hardcoded string in `js/ai.js:101`, explicitly scoped above).
- Resolving the roles/clients/programs/ratecards Vue-vs-Vanilla consolidation question — still deferred, no reachable entry point exists anywhere in the app for the Registry CRUD modals.
- Removing `openPlanningAiAnalysis()` (`js/ai.js:515`, confirmed zero callers repo-wide) — dead code independent of this migration, not this cycle's concern.
- Any build-step introduction (Vite/SFC).
- Any backend/API change.
- Decomposing this migration into sub-cycles — executed as a single cycle, per user decision, matching every prior Tier 2 page including the larger `costgrid.html`.
