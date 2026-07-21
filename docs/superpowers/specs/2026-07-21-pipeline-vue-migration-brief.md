# Brief — `pipeline.html` Vue 3 Migration

**Scenario:** Evolution of existing functionality (Vanilla JS → Vue 3, CDN, no build step). Third Tier 2 page per `docs/superpowers/specs/2026-07-14-vue-migration-roadmap-design.md`, following the same cycle as `project-config.html` and `portfolio.html`.

## Current behavior

`pipeline.html` (369 lines) is the kanban "Pipeline" board: 6 columns (`Draft`, `SIP`, `Expected`, `Anticipated`, `Committed`, `Canceled`, `js/pipeline-board.js:7`), one card per cost-grid proposal, a slide-in detail panel, a pipeline-year dropdown, and 4 modals (Confirm, New Proposal, Clone Proposal, JSON Viewer).

**Rendering** is entirely driven by `js/pipeline-board.js` (760 lines, confirmed via repo-wide grep to be loaded **only** by `pipeline.html` — no other page references it):
- `renderPipelineBoard()` (`js/pipeline-board.js:96-213`) groups cost grids by pipeline stage via `cgGetIndex()`/`cgLoad(cgId)` (from `js/costgrid.js`'s shared `_cgStore`), builds column HTML strings via `pbBuildCard()` (`:257-316`), and wires click handlers per card (open detail panel; Edit/Clone/Share/Delete buttons).
- `pbOpenDetailPanel(cgId, verId)` (`:320-663`) builds the two-column detail panel: left column (offer metadata, POT progress via `pbLoadPotSection()` at `:665-739`, linked-project chips with a 3-tier ID-resolution fallback at `:427-468`), right column (phases/tasks breakdown via `cgComputePhaseTotals`/`cgComputeTaskTotals` from `js/costgrid.js`). Version tabs shown when `cg.versions.length > 1` (`:509-525`). An outside-click handler (`_pbOutsideClickHandler`, `:749-752`) closes the panel, registered with a 200ms delay (`:333`) to avoid the same click that opened it immediately closing it.
- `pbLoadPotSection(v, stage)` (`:665-739`) is async, fetches `Api.pots.summary(...)`, shows a dual-segment (Committed/Anticipated) progress bar against a POT target.
- The pipeline-year dropdown, its menu rendering, and the "+ New Proposal" button's visibility are built inline in `pipeline.html:228-300` (not in `js/pipeline-board.js`).

**Shared infrastructure kept as Vanilla globals** (confirmed via grep: also loaded by `costgrid.html`/`planning.html`, not exclusive to this page):
- `js/costgrid.js` — `cgGetIndex()`, `cgLoad(cgId)`, `cgCreateNewGrid()` (`js/costgrid.js:2160`), `cgCloneGrid()` (`:2218`), `cgConfirmDeleteGrid(cgId, name)` (`:285`), `cgConfirmDeleteVersion(cgId, versionId, versionLabel, onSuccess)` (`:303`), `cgComputeGrandTotals`/`cgComputePhaseTotals`/`cgComputeTaskTotals`.
- `js/core.js`'s `showConfirm(message, onConfirm, onCancel, title)` (`js/core.js:352`) — operates via direct `document.getElementById('confirmModal')` manipulation, not Vue.
- The 4 modals (`#confirmModal`, `#cgNewGridModal`, `#cgCloneModal`, `#jsonViewerModal`) are static HTML **duplicated verbatim** across `pipeline.html`, `costgrid.html`, and (2 of the 4) `planning.html` — confirmed via grep. They are driven by direct DOM manipulation (`document.getElementById(...).value`, `bootstrap.Modal.getOrCreateInstance(...)`), not by any Vue instance.

**Confirmed dead code:** `showPipelineBoardView()` is defined twice — once in `js/pipeline-board.js:27-40` (references `portfolioSection`/`mainContent`/`uploadSection`/`costGridEditorSection` — none of which exist anywhere in `pipeline.html`'s DOM; clearly vestigial from a pre-multi-page-split architecture) and again in `pipeline.html:200-202` (`function showPipelineBoardView() { renderPipelineBoard(); }`). Both are plain classic-script `function` declarations in the same global scope, loaded in document order — the second (in `pipeline.html`'s own inline script, loaded after `js/pipeline-board.js`) always wins. The first definition never executes.

`updateNavState(){}` and `cgHideAll(){}` (`pipeline.html:209-210`) are **intentional** no-op overrides of real functions in `js/pipeline-board.js`/`js/costgrid.js` (own comments: "no-op: nav is static HTML" / "no-op: no other sections to hide on this page") — not dead code, a deliberate per-page override pattern already used elsewhere in this codebase.

## Expected behavior

Same pattern as `project-config.html`/`portfolio.html`: single Vue 3 instance (CDN, `Vue.createApp({...}).mount(...)`), 1:1 behavioral parity for every reachable feature. `js/pipeline-board.js`'s rendering logic (kanban columns, detail panel, POT section, pipeline-year dropdown) folds into the Vue instance's `data()`/`computed`/`methods`, matching how `portfolio.html` folded in `js/portfolio.js`+`js/dashboard.js`. `js/costgrid.js`/`js/core.js`'s shared functions (`cgLoad`, `cgCreateNewGrid`, `cgConfirmDeleteGrid`, `showConfirm`, etc.) stay Vanilla, called as globals from the new Vue instance's methods — **not** rewritten, since `costgrid.html`/`planning.html` still depend on them as Vanilla and are not part of this cycle. The 4 shared modals stay as static HTML outside the Vue-managed template (same reasoning as `portfolio.html`'s `#fileInput`/`#aiModal`).

## Constraints

- No build step; CDN Vue 3, matching every prior migration in this roadmap.
- `js/costgrid.js` and its exported functions are **not modified** in this cycle — `costgrid.html`/`planning.html` depend on them as-is.
- `#confirmModal`, `#cgNewGridModal`, `#cgCloneModal`, `#jsonViewerModal` must remain static HTML (not Vue-templated), since `showConfirm()`/`cgCreateNewGrid()`/`cgCloneGrid()` (all unchanged, in `js/costgrid.js`/`js/core.js`) manipulate them via direct `document.getElementById(...)` calls, not Vue reactivity.
- **Mandatory verification step, per the lesson from this same roadmap's last two cycles**: an empirical jsdom + real `vue.global.js` mount test (not just static code review) must be run against the actual assembled template before merge — every bare-global-in-template defect found in `portfolio.html`/`project-config.html` this month was invisible to code review and `npm test` alone, and was only caught by actually mounting the page with realistic data. This page's detail panel and card rendering call many global helpers (`getClientName`, `pipelineBadge`, `statusBadgeLarge`, `getProjectPipeline`, `esc`, `pbFmtMoney`, etc.) that must each be verified reachable from the Vue instance (via `methods:` exposure), not just assumed.
- No API/backend changes.

## Acceptance criteria

1. Every column/card/detail-panel feature currently reachable in `pipeline.html` behaves identically after the rewrite: 6-column kanban grouping, per-column currency totals, card click → detail panel, Edit/Clone/Share/Delete card buttons (respecting `cg.myPermission !== 'viewer'` gating), pipeline-year dropdown + URL sync, "+ New Proposal" visibility tied to the selected year's `active` flag.
2. Detail panel: offer metadata, POT progress bar (Committed/Anticipated split), linked-project chips (with the existing 3-tier ID-resolution fallback), phases/tasks breakdown, version tabs (when `cg.versions.length > 1`), outside-click-to-close, all 4 action buttons (Delete Draft/Clone/Share/Edit) with their existing visibility rules.
3. The "Refresh rate" flow (stale-exchange-rate detection + confirm modal + `Api.costGrids.versions.refreshRate`) works identically.
4. New Proposal / Clone Proposal / JSON Viewer modals continue to work exactly as today, calling the same unmodified `js/costgrid.js` functions.
5. `showPipelineBoardView()`'s dead first definition (`js/pipeline-board.js:27-40`) is not carried into the rewrite (confirmed dead, never executes).
6. `js/pipeline-board.js` is dropped from `pipeline.html`'s script list once its logic is folded into Vue (file itself untouched on disk — confirmed exclusive to this page, so no other page is affected).
7. An empirical jsdom+vue.global mount test (using realistic project/cost-grid data, including at least one multi-version proposal and one with linked projects) passes with zero thrown errors, run as part of this cycle's own verification — not deferred to post-merge browser testing alone.
8. `npm test` passes (existing suite; no `js/lib/*` extraction is obviously warranted here based on current reading, but this should be revisited in `/brainstorming` — `pbComputeColumnTotals`/`pbGetBudget`/date-formatting helpers are plausible pure-function candidates, similar to `portfolio-calc.js`).

## Explicitly excluded scope

Proposed for exclusion — confirm before treating as final:
- **Migrating `costgrid.html` or `planning.html`** — separate, future Tier 2 cycles.
- **Rewriting or modifying `js/costgrid.js`/`js/core.js`'s shared functions** — kept as unmodified Vanilla globals, called from the new Vue instance.
- **Converting the 4 shared modals (`#confirmModal`, `#cgNewGridModal`, `#cgCloneModal`, `#jsonViewerModal`) to Vue-managed/reactive components** — they stay static HTML, per the Constraints section; a future cycle could consolidate this across pages once every consumer page is migrated, but that's out of scope here.
- **Resolving the roles/clients/programs Vue-vs-Vanilla consolidation question** — still no Tier 2 page examined so far has a reachable need for the full CRUD UI (matching `portfolio.html`'s own finding); deferred until one does.
- **Any build-step introduction (Vite/SFC).**
- **Any backend/API change.**

## Open questions for /brainstorming

- Whether to extract any pure-function logic (`pbComputeColumnTotals`, `pbGetBudget`, `pbFmtMoney`/`pbFmtDate`, POT percentage math) into a new `js/lib/pipeline-calc.js` module with vitest coverage, matching the `portfolio-calc.js` precedent — or whether this page's logic is thin enough glue over `js/costgrid.js` that no extraction is warranted.
- How to scope the mandatory empirical mount-test step within the implementation plan — as its own task (like `project-config.html`'s eventual retrofit) or woven into each task's own verification step from the start.
- Task decomposition given the scale (760-line source file): candidate split points are (a) kanban board + card rendering, (b) detail panel (offer info + linked projects + tasks), (c) POT section + version tabs + action buttons, (d) pipeline-year dropdown + page init — to be resolved in `/brainstorming`.

Brief ready. Next step: /brainstorming.
