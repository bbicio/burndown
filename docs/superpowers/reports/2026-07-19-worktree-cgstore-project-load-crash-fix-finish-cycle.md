# Finish-cycle report — worktree-cgstore-project-load-crash-fix

**Date:** 2026-07-19
**Branch:** worktree-cgstore-project-load-crash-fix → main

## What was done

2 commits, merged with `--no-ff` (fast-forward was possible, `main` had not diverged):

- `ea05339` fix(api): resolve cg_id via JOIN in GET /api/projects
- `9a230c3` fix(frontend): _apiProjectToLocal reads cg_id from the API response

Fixes a severe, cross-page regression discovered via live manual testing (not caught by any static review or the vitest suite, which never exercises this code path against real data): `js/api-sync.js`'s `_apiProjectToLocal()` (called by `loadConfigFromApi()`, shared by every page) called `_resolveCgIdForVersion()`, which reads a global `_cgStore` declared only in `js/costgrid.js`. `portfolio.html` and `project-config.html` (both after their own 2026-07 Vue 3 migrations) don't load that script — `_cgStore` was genuinely undeclared there, so calling `_resolveCgIdForVersion` threw `ReferenceError` for any project with a `cg_version_id` (all 9 real projects in the live DB have one), aborting `loadConfigFromApi()`'s `.map()` and silently leaving `config.projects` empty on both pages. Symptoms: portfolio overview showed "No projects configured"; `project-config.html?projectId=<real-id>` showed "Project not found"; direct-link `portfolio.html?projectId=<id>` opened the dashboard with no name/status/KPIs (only the burndown chart, sourced from a separate `timesheetData` endpoint, still rendered).

Fix moves `cg_id` resolution server-side (`GET /api/projects` now returns it via a `LEFT JOIN` to `cost_grid_versions`), removing the client's dependency on `_cgStore` entirely for this purpose — a more robust fix than a defensive null-check, since (confirmed during the final whole-branch review) it also eliminates a latent init-order race on the pages that already worked: `cgSyncFromApi()` and `loadConfigFromApi()` run inside the same non-deterministic `Promise.all([...])`, so the old code could silently produce `cgId: null` even on `pipeline.html`/`planning.html`/`costgrid.html` if `loadConfigFromApi()` happened to win the race.

## Code review follow-ups

None outstanding.

- **Gate 3** (medium-effort code review, scoped `main..HEAD`): 0 findings. The diff (5 lines across 2 files) had already been independently verified twice — once per task (both task reviews confirmed clean against the live running stack via a self-minted JWT) and once in a whole-branch review (Opus model) that additionally traced the field name end-to-end (`cg_id` snake_case, confirmed identical on both the live HTTP response and the frontend read) and reasoned through the init-order-race backward-compatibility question above.
- One Minor, non-blocking finding surfaced twice (Task 2's review and the whole-branch review), not acted on: `_resolveCgIdForVersion` (`js/api-sync.js:203`) is now fully orphaned dead code — zero callers anywhere in the codebase (the plan's own stated rationale for keeping it, "used by `pipeline-board.js`/`planning.js`/the cost-grid editor," doesn't hold under inspection; those files consume `_cgStore` directly, never through this function). Left in place per the plan's explicit Global Constraint against touching `js/costgrid.js`/its callers in this fix — recorded here as a genuine future cleanup candidate, not a defect in this cycle's execution.

## Roadmap notes

- **`_resolveCgIdForVersion` orphaned dead code** (see above) — candidate for a future small cleanup pass, confirmed via two independent greps of the whole `js/` directory.
- **This bug was invisible to every prior review pass for `portfolio.html`'s own migration cycle** (8-angle code review, a dedicated empirical jsdom-mount test, an AST-based bare-global scan) because none of those exercised `GET /api/projects`'s *actual* response shape against the *actual* running backend with *real* project data that has a `cg_version_id` set — they either used fabricated/stubbed data in jsdom, or checked template-level bare-identifier resolution (a different, also-real bug class fixed in the previous cycle) without tracing into `_apiProjectToLocal`'s own JS-scope (non-template) dependency on `_cgStore`. Worth noting as a genuine blind spot: "does this page's script list provide every global every *shared* helper function might reach for" is a distinct check from "does this page's *template* reference any unresolvable bare global" — the previous cycle's empirical mount testing caught the latter class exhaustively but not the former.
- **This same class of bug (a shared helper in `js/api-sync.js`/`js/core.js` silently depending on a global declared in one specific page's optional script) could exist elsewhere** — this fix addresses the one confirmed instance; a broader audit was explicitly proposed and declined as out of scope for this cycle (see the Brief's "Explicitly excluded scope").
- **Operational note, not a code issue**: during this cycle, `pdash-api`'s running process ended up serving a "ghost" in-memory version of the fix (synced into the main checkout by Task 1's implementer to force a live-testing container restart, then reverted from disk afterward, but the running Node process was never restarted again) — meaning between Task 1's completion and this cycle's Gate 4 restart, the live stack was running code that existed nowhere in git. Caught by the whole-branch reviewer during its own live-verification step and corrected at Gate 4 (explicit `docker compose restart api`, confirmed healthy, re-verified the live endpoint reflects the actual committed code). Future cycles touching `api/` that need live-testing mid-implementation should have their implementer explicitly flag when they've synced a change into the main checkout for testing purposes, so the controller can track and clean up the resulting drift between disk state and running-process state.

## Sync-docs outcome

- **CLAUDE.md**: updated — `js/api-sync.js`'s file-structure entry now documents `costGridRef.cgId`'s correct, current resolution path (server-side `GET /api/projects` JOIN, not `_cgStore`) and notes the 2026-07 fix and what it corrected.
- **ARCHITECTURE.md**: updated — `api-sync.js`'s file-tree entry corrected (previously implied `_apiProjectToLocal` reads `_cgStore` directly; now accurately states `_cgStore` itself lives in `costgrid.js`, and `costGridRef.cgId` is server-resolved).
- **PRD.md**: evaluated, not touched. This bugfix restores already-correct, already-documented behavior (project loading, project resolution, pipeline-lock gating) — it doesn't change what any user-facing feature does, and PRD.md doesn't describe `cg_id`/`costGridRef`/`_cgStore` as an internal mechanism in the first place, so there was no inaccurate PRD claim to correct.
- **TEST_CASES.md / test-cases.html**: not touched — no new user-visible behavior, no changed existing test case; the plan explicitly noted no new automated test was warranted (a SQL JOIN + a one-line mapper change, not complex pure logic worth its own extraction/test module).
- **test-api.js**: not touched — no new endpoint, no auth-rule change; `GET /api/projects` gained one additional field, not a new route.
- **PROCESS.md gate**: none of the three trigger conditions applied (no process-skill change; no *new* recurring process exception introduced — the manual-verification-deferred-to-post-merge pattern and the worktree-cleanup pattern are both already-established conventions from prior cycles; no change to the 7-phase skeleton or scenario guardrails). PROCESS.md left untouched.
