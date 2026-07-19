# Finish-cycle report — worktree-portfolio-vue-migration

**Date:** 2026-07-19
**Branch:** worktree-portfolio-vue-migration → main

## What was done

12 commits, merged with `--no-ff` (main had advanced 7 unrelated commits since divergence):

- `b039094` feat(portfolio): Vue 3 skeleton, portfolio overview view
- `ca2a9ca` fix(portfolio.html): add Vue 3 CDN script to resolve ReferenceError
- `0ff1082` feat(portfolio): extract KPI/burndown math into js/lib/portfolio-calc.js
- `9a716ee` feat(portfolio): dashboard header, sibling switcher, KPIs wired to js/lib/portfolio-calc.js
- `62b4fe6` feat(portfolio): burndown chart wired to js/lib/portfolio-calc.js
- `2edab51` feat(portfolio): monthly summary + PTC report tables, shared export-button component
- `b7ba4c5` feat(portfolio): date filter + summary-by-task/role/group tables
- `525b07f` feat(portfolio): task detail tables (flat/role/owner grouping, expand/collapse)
- `502ce4c` fix(portfolio): reset selectedProjectId global on overview, wire btnCopyAi for js/ai.js compatibility
- `65ce28c` chore(portfolio): remove stale Task-8 placeholder comment (no confirm modal needed)
- `04da1ce` fix(portfolio): trigger Vue re-render after mutating non-reactive globals (Load Actuals, Summary pin toggle); remove stale task-marker comments
- `58129fe` fix(portfolio): fix render-breaking bugs found by code review + empirical Vue mount testing

`portfolio.html` (Vanilla JS → single-file Vue 3, CDN, no build step) rewritten as the second Tier 2 page in the migration roadmap, folding in the former `js/portfolio.js` + `js/dashboard.js`. New `js/lib/portfolio-calc.js` extracts KPI/burndown math with vitest coverage. Dropped confirmed-dead code: unreachable `#configModal` + nested clients/programs/roles CRUD modals, unused `js/roles.js` load, dead `showPortfolioPlanningView` duplicate.

## Code review follow-ups

None outstanding — all findings from Gate 3 were fixed within this cycle, not deferred:

- **Round 1** (8-angle scan): 2 Critical (`v-for`+`v-if` same-element crash; cold-load `refreshTick` gap), 1 Important (`currentCfg` never set, breaking non-EUR currency display), 1 latent/plausible (dashboard computeds share the same un-bumped-`refreshTick` class), 2 Minor (hardcoded hex colors; `cardData(cfg)` called ~29×/row). All fixed in `04da1ce`... wait, corrected: all fixed together in `58129fe`, together with the discoveries below.
- **Empirical verification** (jsdom + the real `vue.global.js` build, since no prior review had actually mounted the app): found 3 additional, more severe Critical bugs invisible to static review and to `npm test` (which never renders this page's template):
  - A `v-html` element with fallback child content is a **fatal Vue 3 compile-time error** — since this app has no separate `template:` string (uses the DOM's own innerHTML), this aborted the entire app's mount, unconditionally, on every single page load.
  - Several globals (`fmtH`, `openAiAnalysis`, `openShareModal`, `portfolioSummaryProjects`) were referenced bare in template expressions. Vue 3's runtime-compiled template mode never falls through to `window` for non-whitelisted identifiers (`RuntimeCompiledPublicInstanceProxyHandlers.has()` unconditionally claims them) — these resolved to `undefined` and threw the moment the dashboard view rendered or the AI/Share button was clicked.
  - `portfolioSummaryProjects` specifically needed a wrapping method (`isPinnedSummary`) rather than a bare re-export, since `js/core.js`'s `loadSummarySelection()` reassigns that module-level binding to a new `Set` after the component's options object is already built — a bare re-export would have captured a stale reference.
- All fixes re-reviewed and confirmed via a dedicated re-review pass plus a full empirical mount test exercising the overview, program-group expansion, Budget Summary pinning, and dashboard views end-to-end with zero thrown errors, plus an AST-based scan (via acorn) confirming zero remaining unresolved bare-global template references.

## Roadmap notes

- **`js/dashboard.js` is now fully orphaned dead code** (no page loads it anymore) — file remains on disk, unreferenced, matching this project's established convention of not deleting unused files during migrations. Candidate for a future cleanup pass.
- **`js/portfolio.js` is NOT dead** — contrary to the original brief/design doc's investigation finding ("confirmed via grep — no other .html file references either"), `planning.html` still loads it and `js/planning.js` calls two of its exports (`getMonthRangeFromCfg`, `fmtProjectTitle`) directly. This was caught during doc-sync, not during the migration itself — the design doc's grep was evidently incomplete or the finding went stale. No functional impact (the file itself was never modified), but CLAUDE.md's file-structure description has been corrected.
- **`js/config-form.js`'s reachability on `planning.html` is an open question.** `planning.html` loads the script but has zero `#cfgStatus`/config-modal markup of its own — the script tag may be entirely vestigial there (unused import), inherited from whatever `planning.html`'s own history was. Not investigated as part of this cycle (out of scope); worth a future audit.
- **This is the first cycle where actually mounting the Vue app (rather than static code review + vitest) caught genuine, severe bugs** that 8 independent finder-agent passes plus every prior task-level review missed. Worth considering whether future Vue-migration cycles should budget for an empirical jsdom-mount smoke test as a standard step before merge, given `npm test`'s vitest suite structurally cannot exercise template rendering.

## Sync-docs outcome

- **CLAUDE.md**: updated — Pages table entry for `portfolio.html` now notes the Vue 3 rewrite; file-structure block entry rewritten to describe the fold-in of `js/portfolio.js`/`js/dashboard.js`, the dropped `js/roles.js`/`js/config-form.js` loads, and the new `js/lib/portfolio-calc.js`; added a full `portfolio-calc.js` description to the `js/lib/` block; corrected `js/core.js`'s stale claim that `cfgApplyPipelineRules` was still used via "`portfolio.html`'s own config modal" (that modal no longer exists — `js/config-form.js` is now only loaded by `planning.html`); corrected `js/portfolio.js`'s entry to reflect it's still loaded by `planning.html`, not orphaned; removed the now-fully-dead `js/dashboard.js` entry.
- **ARCHITECTURE.md**: updated — added a one-line annotation for `portfolio.html` in the file tree; corrected the `reforecast_snapshot_<projectId>` localStorage note, which previously described `portfolio.html`'s config modal as merely "orphaned" (it's now deleted, not just unreachable).
- **PRD.md**: updated (evaluated: yes, updated). Two categories of change: (1) the "Toolbar actions" list for §6.1 Portfolio Overview described "Clients"/"Programs" management modals as page-level toolbar actions — confirmed during this migration that both were only ever reachable through the unreachable `#configModal` (gated behind a `?configure=true` param nothing ever set), i.e. the PRD's own description was already inaccurate before this cycle, not a regression; corrected to describe the actual reachable toolbar/per-project-card actions. (2) Several `dashboard.js:NNN`/`portfolio.js:NNN` file:line citations were stale pointers into now-folded-in/deleted source locations; updated to reference the new Vue computed properties / `js/lib/portfolio-calc.js` exports. No user-visible feature description itself changed — every reachable feature is unchanged, 1:1 ported.
- **TEST_CASES.md / test-cases.html**: not touched — no new user-visible feature, no changed behavior for any existing test case (R-01 through R-09 in the Portfolio section remain accurate; two of them, R-01 and R-04, describe exactly the behavior the Gate-3 empirical-testing fixes restored, not introduced).
- **test-api.js**: not touched — no API/backend changes in this cycle (confirmed at Gate 1: diff touches only `portfolio.html`, `css/tokens.css`, `js/lib/portfolio-calc.js`).
- **PROCESS.md gate**: none of the three trigger conditions applied (no process-skill change; no *new* recurring process exception — deferring manual browser verification to post-merge because Docker/nginx only serves `main`'s working directory is an already-established convention from every prior Vue-migration cycle, not introduced here; no change to the 7-phase skeleton or scenario guardrails). PROCESS.md left untouched.
