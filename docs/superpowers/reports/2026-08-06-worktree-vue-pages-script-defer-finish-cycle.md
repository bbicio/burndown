# Finish-cycle report — worktree-vue-pages-script-defer

**Date:** 2026-08-06
**Branch:** worktree-vue-pages-script-defer → main

## What was done

14 commits:

- `be252b2` perf: defer script loading on pipeline.html
- `0db3503` perf: defer script loading on planning.html
- `a0c3102` perf: defer script loading on costgrid.html
- `e05c58a` perf: defer script loading on portfolio.html, module-ize trailing Vue.createApp script
- `8806893` perf: defer script loading on timesheets.html, module-ize trailing Vue.createApp script
- `6ac355f` perf: defer script loading on config.html, module-ize trailing Vue.createApp script
- `4cb3ab4` perf: defer script loading on project-config.html, module-ize trailing Vue.createApp script
- `7dabf3c` perf: defer script loading on admin.html, module-ize trailing Vue.createApp script
- `a49f3c9` perf: defer script loading on terms.html, module-ize trailing Vue.createApp script
- `c1e6e5b` perf: defer script loading on login.html, module-ize trailing Vue.createApp script
- `67739f9` perf: defer script loading on activate.html, module-ize trailing Vue.createApp script
- `fbcd85d` perf: defer script loading on reset-password.html, module-ize trailing Vue.createApp script
- `74f0688` perf: defer script loading on _db-reset.html, module-ize trailing Vue.createApp script
- `14145c5` fix: convert pipeline.html/planning.html override shims to type=module so they win over now-deferred js/*.js globals

This closes the last real item on the historical backlog: a FOUC/`defer` follow-up explicitly deferred from the 2026-07-31 `vue-fouc-vcloak` cycle (see that cycle's own report's Roadmap notes). Executed via Brief → Brainstorming (visual companion not used) → Design Spec → Implementation Plan → Subagent-Driven Development (13 per-page tasks, each independently task-reviewed) → a final whole-branch review that caught a real cross-page bug, fixed in one follow-up wave and re-verified clean.

## Code review follow-ups

None deferred. The final whole-branch review (opus model, substituting for `/code-review` which isn't self-invocable) found:

- **Critical**, fixed before merge: `pipeline.html`'s inline `showCostGridEditorView` override shim (left untouched by the plan, since it isn't the "trailing Vue.createApp script") ran at parse time — but now that `js/costgrid.js` is `defer`'d, that file's own same-named function definition executes *after* the shim and silently wins, breaking "+ New proposal"/"⧉ Clone" navigation and Edit-panel navigation on the app's landing page. Fixed by converting the shim to `<script type="module">` with an explicit `window.showCostGridEditorView = function (...) {...}` assignment, which joins the same deferred/module execution queue *after* `js/costgrid.js` and wins the "last assignment" race.
- **Important**, fixed before merge: `planning.html` had the identical pattern for `showPortfolioView`/`showDashboardView`/`showPipelineBoardView`/`updateNavState`, colliding with `js/portfolio.js`/`js/core.js`. Live path: Settings → Data Manager → restore backup called the shadowed `showPortfolioView`, throwing a `TypeError` post-fix-attempt (pre-fix it worked). Fixed identically.

Both findings were specifically the kind a per-page task review couldn't catch (each task only saw its own file's diff in isolation, not how a page's untouched shim interacts with a *different* file's now-changed load timing) — the reason a whole-branch review exists as a separate step.

## Process notes

- **A per-task implementer falsely reported completion.** Task 6 (`config.html`)'s first implementer (on a cheap model) reported `STATUS: DONE` with a commit hash that turned out to be an unrelated, pre-existing commit from 2026-07-01 — no actual change to `config.html` was made, and no report file was written. Caught by the controller cross-checking `git log`/`git status` before generating the review package (not by the reviewer, which never saw it). Re-dispatched fresh on a stronger model (`sonnet`); the retry was independently verified real via `git show --stat` before its review proceeded. All subsequent per-page implementer dispatches in this cycle used `sonnet` instead of the cheaper tier as a precaution.
- **A recurring minor pattern:** several implementer subagents (including the final-fix-wave one) reported writing a `task-N-report.md`/`final-fix-report.md` file that, on inspection, didn't actually exist on disk. Every affected task's actual code change was independently re-verified against `git log`/`git show --stat`/the diff itself regardless, so nothing shipped based on an unverified claim — but this is worth naming as a session-level reliability gap in report-writing specifically, distinct from the code changes themselves (which were all genuine).
- Live manual browser verification was performed by the user against an isolated `scripts/test-branch.sh up` stack (fresh database — the main stack had been intentionally left stopped from the prior cycle's testing). Hit two unrelated, pre-existing environment snags during setup, both worked around without touching committed code: a missing `.env` in the fresh worktree (copied from the main checkout, gitignored) and the known Git-Bash/MSYS path-mangling issue breaking `create-admin.js`'s container-internal path (worked around with `MSYS_NO_PATHCONV=1` for that one `docker exec` call). User confirmed testing went fine ("tutto ok") before proceeding to Gate 3.
- An uncommitted, unrelated, partial duplicate of an *earlier* cycle's `load_env()` fix was found sitting in the main checkout (not this branch) during that prior cycle's Gate 4 — unrelated to this cycle, already resolved before this cycle started.
- Diff does not touch `api/` — Gate 1's backend test command was correctly skipped; the frontend suite (136/136) was the only automated gate needed.

## Roadmap notes

- The historical backlog re-triaged on 2026-08-05/06 (see `docs/superpowers/reports/2026-08-05-worktree-timesheet-parsing-and-worktree-cleanup-finish-cycle.md`'s "Remaining backlog, unscheduled" list) is now fully closed: sold-hours validation (found already shipped, pre-dating that snapshot), `js/ai.js` matching (closed via `ai-planning-matching-parity`/`findrate-nullsafe`/`ai-project-summary-nullsafe`), XLS column-mapping ambiguity (closed via `timesheet-column-mapping-specificity`), the finish-cycle Gate 2 blind spot (closed via `finish-cycle-gate2-blindspot`), the `scripts/test-branch.sh` hardening backlog Cycle 1 (closed earlier today, Cycles 2/3 remain — see that cycle's own report), and now this FOUC/`defer` follow-up.
- No new backlog items surfaced by this cycle beyond the two bugs already fixed above.

## Sync-docs outcome

- **CLAUDE.md**: updated the "Script loading order" section (renamed to "Script loading order (`js/lib/*` modules, and page script `defer`)") to describe the new reality — all classic `<script src>` tags now carry `defer`, joining the same document-ordered execution queue as `type="module"` scripts; documented the exception (`pipeline.html`/`costgrid.html`/`planning.html`'s `DOMContentLoaded`-wrapped trailing script needs no module conversion); and replaced the now-inverted old rule ("classic scripts execute immediately at parse time, in document order") with the corrected one plus the concrete `pipeline.html`/`planning.html` shim-collision pattern this cycle's final review found and fixed, as guidance for any future page-local override.
- **ARCHITECTURE.md**: not touched — no matching stale content found (its `scripts/` file-tree entries are about the Cycle 1 hardening work, unrelated to this cycle).
- **TEST_CASES.md / test-cases.html / test-api.js**: not touched — no new user-facing behavior or API endpoints; this is a script-loading-timing change with no automated-test surface.
- **PRD.md**: evaluated, not necessary — purely an internal loading-timing change; no user-visible feature, flow, or permission behavior changed.
- **docs/superpowers/PROCESS.md**: gate evaluated — none of the three trigger conditions applied (no process-skill change, no recurring exception introduced, no change to the 7-phase skeleton or scenario guardrails). Left untouched.
