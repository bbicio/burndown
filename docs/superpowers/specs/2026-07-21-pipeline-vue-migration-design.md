# `pipeline.html` Vue 3 Migration — Design Spec

**Source:** Brief `docs/superpowers/specs/2026-07-21-pipeline-vue-migration-brief.md`. Third Tier 2 page per `docs/superpowers/specs/2026-07-14-vue-migration-roadmap-design.md`, following the pattern validated by `project-config.html`/`portfolio.html`.

## Problem

`pipeline.html` (369 lines) + `js/pipeline-board.js` (760 lines, confirmed exclusive to this page via repo-wide grep) implement the kanban pipeline board: 6 stage columns, a slide-in detail panel (offer info, POT progress, linked projects, phases/tasks), a pipeline-year dropdown, and 4 shared modals — all still Vanilla JS.

## Investigation findings (informing scope decisions below)

1. **`js/pipeline-board.js` is exclusive to `pipeline.html`** (confirmed via grep — no other page references it) — safe to fold its rendering logic entirely into the Vue rewrite, matching how `portfolio.html` folded in `js/portfolio.js`+`js/dashboard.js`.
2. **`js/costgrid.js`/`js/core.js`'s shared functions are NOT part of this cycle.** `cgLoad`, `cgGetIndex`, `cgCreateNewGrid`, `cgCloneGrid`, `cgConfirmDeleteGrid`, `cgConfirmDeleteVersion`, `cgComputeGrandTotals`/`cgComputePhaseTotals`/`cgComputeTaskTotals`, and `showConfirm()` all remain unmodified Vanilla globals, called from the new Vue instance's methods. `costgrid.html`/`planning.html` still depend on these functions as-is and are not part of this migration.
3. **The 4 shared modals (`#confirmModal`, `#cgNewGridModal`, `#cgCloneModal`, `#jsonViewerModal`) are duplicated static HTML** across `pipeline.html`, `costgrid.html`, and (2 of 4) `planning.html` (confirmed via grep) — driven by direct DOM manipulation (`document.getElementById(...).value`, `bootstrap.Modal.getOrCreateInstance(...)`) from the still-Vanilla `js/costgrid.js`/`js/core.js`. Converting them to Vue-managed components now was considered and explicitly rejected: `cgCreateNewGrid()`/`cgCloneGrid()`/`showConfirm()` read these DOM elements directly and are also called from `costgrid.html`/`planning.html` (still Vanilla) — making them Vue-reactive on this page alone would either require making those shared functions Vue-aware (breaking the other two still-Vanilla pages) or duplicating logic (a real risk of silent integration breakage). Deferred until all three consuming pages are on Vue.
4. **Confirmed dead code:** `showPipelineBoardView()` is defined twice — `js/pipeline-board.js:27-40` (references `portfolioSection`/`mainContent`/`uploadSection`/`costGridEditorSection`, none of which exist in `pipeline.html`'s DOM — vestigial from a pre-multi-page-split architecture) and `pipeline.html:200-202` (`function showPipelineBoardView() { renderPipelineBoard(); }`). Both are plain classic-script function declarations in the same global scope; the second (loaded later) always wins — the first never executes.
5. **`updateNavState(){}`/`cgHideAll(){}` (`pipeline.html:209-210`) are intentional no-op overrides**, not dead code — same established per-page-override pattern used elsewhere in this codebase.

## Architecture

Vue 3 rewrite (CDN, `Vue.createApp({...}).mount(...)`), same pattern as `project-config.html`/`portfolio.html`. `js/pipeline-board.js`'s rendering logic folds into the Vue instance's `data()`/`computed`/`methods`; the file itself is dropped from `pipeline.html`'s script list (untouched on disk — confirmed exclusive, so no other page is affected). `js/costgrid.js`/`js/core.js` stay loaded, unmodified, called as globals. The 4 shared modals stay static HTML, outside the Vue-managed template (same reasoning as `portfolio.html`'s `#fileInput`/`#aiModal`).

New module `js/lib/pipeline-calc.js` (pure functions, vitest-covered) extracts `pbComputeColumnTotals`/`pbGetBudget`/`pbFmtMoney`/`pbFmtDate`/POT percentage math — these are `pipeline-board.js`'s own aggregation/formatting logic (column-level totals across multiple cards, EUR-equivalent conversion, budget-fallback resolution when phases aren't loaded yet), distinct from `js/costgrid.js`'s per-version computation (`cgComputeGrandTotals` etc.), which they call into but don't duplicate.

## Components (single Vue instance, 4 rendering tasks + 1 extraction task)

**`data()`**: pipeline-year state (`selectedYear`, `pipelineYears`), the reactive equivalent of `_pbActiveCgId`/`_pbActiveVerid` (which cost grid/version the detail panel shows), `_pbClientGroups`/`_pbRatecards` caches (unchanged sources: `Api.clientGroups.list()`/`Api.ratecards.list()`).

**Task 1 — Kanban board + card rendering**: `computed` groups `cgGetIndex()`'s cost grids by stage (replacing `renderPipelineBoard()`'s manual grouping, `js/pipeline-board.js:96-147`), `v-for`-driven columns and cards replace `pbBuildCard()`'s string-building (`:257-316`). Card click → open detail panel; Edit/Clone/Share/Delete buttons keep their existing `cg.myPermission !== 'viewer'` gating.

**Task 2 — Detail panel**: reactive equivalent of `pbOpenDetailPanel()` (`:320-663`) — offer metadata, the 3-tier linked-project ID-resolution fallback (`:427-468`, unchanged logic, ported verbatim), phases/tasks breakdown via `cgComputePhaseTotals`/`cgComputeTaskTotals` (unmodified calls into `js/costgrid.js`).

**Task 3 — POT section + version tabs + action buttons**: `pbLoadPotSection()`'s async POT fetch/render (`:665-739`) as a Vue method/computed; version tabs (shown when `cg.versions.length > 1`, `:509-525`); the 4 action buttons (Delete Draft/Clone/Share/Edit) with existing visibility rules; the "Refresh rate" stale-exchange-rate flow (`:548-611`).

**Task 4 — Pipeline-year dropdown + page init**: year selection, URL sync (`pipeline.html:228-300`), "+ New Proposal" visibility tied to the selected year's `active` flag, outside-click-to-close for both the year dropdown and the detail panel (`_pbOutsideClickHandler`, `:749-752`, 200ms delayed registration).

**Task 5 — `js/lib/pipeline-calc.js`**: `computeColumnTotals`, `getVersionBudget` (or similarly named), `fmtMoney`/`fmtDate`, POT percentage helpers — extracted from `pbComputeColumnTotals`/`pbGetBudget`/`pbFmtMoney`/`pbFmtDate`, with vitest coverage.

**Final task — Empirical mount verification**: a dedicated task, after all 5 above, that mounts the assembled page in jsdom with the real `vue.global.js` build and realistic data (at least one multi-version proposal, one with linked projects, one Draft-only), verifying zero thrown errors — catching the class of bug (bare globals unreachable via Vue's runtime-compiled template scope) found repeatedly in the two prior migrations, which static review and `npm test` alone did not catch.

**Dropped entirely (confirmed dead, not ported):**
- `showPipelineBoardView()`'s first definition (`js/pipeline-board.js:27-40`) — never executes, shadowed by `pipeline.html`'s own override.
- `js/pipeline-board.js` script load itself (logic folded into Vue; file untouched on disk for potential future reference, though nothing will load it).

**Kept, called as globals (unchanged, not rewritten):** `cgLoad`, `cgGetIndex`, `cgCreateNewGrid`, `cgCloneGrid`, `cgConfirmDeleteGrid`, `cgConfirmDeleteVersion`, `cgComputeGrandTotals`/`cgComputePhaseTotals`/`cgComputeTaskTotals` (`js/costgrid.js`), `showConfirm()` (`js/core.js`), `getClientName`/`getPrograms` (`js/clients.js`/`js/programs.js`), `openShareModal` (`js/shares.js`), `getProjectPipeline`/`pipelineBadge`/`statusBadgeLarge`/`esc` (`js/core.js`).

## Data flow

No API contract changes. Same endpoints as today (`Api.costGrids`, `Api.pots.summary`, `Api.pipelineYears.list`, `Api.clientGroups.list`, `Api.ratecards.list`). `cgLoad`/`cgGetIndex` remain the data source (in-memory `_cgStore` populated by `cgSyncFromApi()`, unchanged).

## Error handling

Identical to today — no native dialogs exist here to convert (confirmed via grep in the Brief); `showConfirm()` (Vanilla, unchanged) continues to handle confirmation flows via the shared `#confirmModal`.

## Backward compatibility

Every reachable feature (6-column board, card actions, detail panel, POT section, version tabs, pipeline-year dropdown, all 4 modals) is a 1:1 port. The one dead-code removal (`showPipelineBoardView()`'s first, never-executed definition) has no observable effect. `js/costgrid.js`/`js/core.js`/`js/clients.js`/`js/programs.js`/`js/shares.js` themselves are untouched as files — `pipeline.html` simply stops loading `js/pipeline-board.js` (confirmed exclusive; no other page affected).

## Testing

`js/lib/pipeline-calc.js`'s extracted functions get vitest unit tests — new coverage this page never had, matching the `portfolio-calc.js` precedent. Everything else (rendering, panel interactions, modals) is verified via a dedicated empirical jsdom + real `vue.global.js` mount test (Task 6, using realistic data covering multi-version proposals and linked projects) before the final whole-branch review, plus manual post-merge browser verification per this roadmap's established convention.

## Explicitly out of scope

- `costgrid.html`, `planning.html` migrations — separate, future Tier 2 cycles.
- Rewriting or modifying `js/costgrid.js`/`js/core.js`'s shared functions.
- Converting the 4 shared modals to Vue-managed/reactive components — deferred until all three consuming pages (`pipeline.html`, `costgrid.html`, `planning.html`) are on Vue; explicitly discussed and rejected for this cycle (see Investigation finding 3).
- Deciding `js/costgrid.js`'s own eventual fate (rewrite vs. shared Vanilla service layer) — deferred to whenever the last of its three consuming pages is migrated.
- Resolving the roles/clients/programs Vue-vs-Vanilla consolidation question — still no Tier 2 page examined so far has a reachable need for the full CRUD UI.
- Any build-step introduction (Vite/SFC).
- Any backend/API change.
