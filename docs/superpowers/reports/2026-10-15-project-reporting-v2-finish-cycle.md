# Finish-cycle report — project-reporting-v2

**Date:** 2026-10-15
**Branch:** project-reporting-v2 → main
**Execution started:** 2026-10-15 15:12  (pre-flight step 6)
**Merged at:** 2026-10-15 16:13  (Gate 4's merge commit)
**Gate durations:** Gate 1 2m · Gate 2 3m · Gate 3 55m · Gate 4 2m · Gate 5 6m (to the report; commit pending) — total 68m
**Cycle counters:** subagent dispatches unknown (3 in this `/finish-cycle` session — the three Gate 3 review rounds; plan execution ran in an earlier session) · review rounds 3 · full test-suite runs unknown (1 in this session at Gate 1, plus Gate 5 step 3)
**Risk class:** high-risk (`docs/superpowers/plans/2026-10-15-project-reporting-redesign.md`) · review effort high
**Claims pre-check:** at Gate 1 it read the one changed `*.md` section (`docs/pages/portfolio.md`, "Project reporting redesign (7.4)") in about 3 minutes and caught nothing — its predicates (spec/board paths, `.pf-spent-warning` → `--color-warning`, the 1280px breakpoint, the pill-only Today helper, `fmtDate`/`statusBadgeLarge` usage) all held, and it carried no number, SHA or enumeration. The Gate 3 re-checks over the fix rounds' own `*.md` edits took about 1 minute (round 1: `docs/js/lib.md`, `docs/pages/portfolio.md`) and about 2 minutes (round 2: the 7.4 section's "replaced cards / cache-bust" paragraph) and found no defect in what was committed; in round 2 the check did change the draft before commit, since `git show` showed `program-calc.js` was not loaded by `portfolio.html` on `main`, so "`?v=1` → `?v=2` on both pages" was rewritten before it was written. Of round 1's 10 findings, none fell in the four mechanical classes (finding 10's stale `costgrid.html` comment is a false predicate in a code comment, left out as unclear).

## What was done

9 commits (`git log main..HEAD --oneline` before the merge):

- `8f0a91d` feat: project-report-calc module + summaryTotals characterization tests
- `5cb3df5` refactor: extract the Today chart label into js/lib/chart-today.js
- `14ad0f0` feat: project reporting header, sibling switch and KPI tiles (7.4)
- `9380773` feat: project reporting Progress card (burndown, monthly summary, pass-through)
- `94f586e` feat: project reporting Breakdown card with period filter (7.4)
- `4fc7b8c` feat: task expansion with monthly entries in the project Breakdown (7.4)
- `1ab7dc5` fix: visual fidelity pass against 7.4 boards
- `7ff2b8f` fix: Gate 3 round 1 review findings for project reporting (7.4)
- `270557d` fix: Gate 3 round 2 review findings for project reporting (7.4)

## Gate outcomes

- Gate 1: passed — claims pre-check clean, `npm test` 51 files / 1105 tests green; no `api/` path, so `scripts/run-tests.sh` was skipped.
- Gate 2: ordinary cycle; existing branch stack reused; the user answered "yes" to the browser question and the stack was torn down. The whole-branch review was launched in the background at `1ab7dc5`.
- Gate 3: three rounds at effort high. Round 1: 10 findings, all fixed (`7ff2b8f`). Round 2: 10 findings, 7 fixed (`270557d`), 3 accepted. Round 3: 9 findings — at the three-round cap the user chose (b), all accepted as follow-up. After each fix round the changed views were re-rendered with `scripts/shoot.mjs` on a branch stack brought back up for that purpose (no exception; switch rows, role sub-rows, Today pill, empty state, Monthly view and keyboard toggle checked).
- Gate 4: merged with `--no-ff` as `930881a` and pushed (main had not diverged, but the push also carried the two docs commits for the Brief/Spec and Plan that were local-only on `main`); no `api/` and no migration, so no DB backup, no migration apply and no `pdash-api` restart; worktree removed, branch deleted.
- Gate 5: `/sync-docs` touched 8 files (see below), 12 rows added to `docs/BACKLOG.md`.

## Code review follow-ups

- Round 2 — `roleSubRows()`/`taskEntries()` recompute on every re-render (template-called methods) — `portfolio.html` line 616 (B-068)
- Round 2 — `roleSubtitle` filters the whole timesheet per column — `js/lib/project-report-calc.js` line 66 (B-069)
- Round 2 — hard-coded `'#fd7e14'` in `kpiLeftColor()`, predates the branch — `portfolio.html` line 1602 (B-070)
- Round 3 — Today pill shows the remaining hours at the start of the interval, not today — `portfolio.html` line 1669 (B-071)
- Round 3 — `kpiBudgetPct` divides fees-only spend by fees + PTC — `portfolio.html` line 940 (B-072)
- Round 3 — Breakdown Total differs between By task / By role / By functional area — `portfolio.html` lines 1128, 1157 (B-073)
- Round 3 — tooltip "Estimated" reads `cfg.planning`, no longer drawn — `portfolio.html` line 1692 (B-074)
- Round 3 — Monthly summary XLS exports "Oct 2026current" and literal "—" — `portfolio.html` line 444 (B-075)
- Round 3 — `--weight-normal` is not a token (`--weight-regular` is) — `css/portfolio.css` lines 298, 627 (B-076)
- Round 3 — Today pill can be clipped at the top of the y-axis — `js/lib/chart-today.js` (B-077)
- Round 3 — the `findRate` rule applied by hand in three places — `portfolio.html` lines 1271, 1285, 1402 (B-078)
- Round 3 — Sold/Spent/Remaining cell markup triplicated — `portfolio.html` line 584 (B-079)

## Roadmap notes

- Round 3's correctness findings (B-071…B-074) sit in calculations the spec declared unchanged ("Nessun cambio di calcolo") and this cycle only re-presented. They change numbers users read, so they fit a dedicated "reporting calculations" cycle with its own spec rather than scattered fixes.
- Two deliberate departures from the plan's Review Focus, taken in round 1 at the user's "fix all": the entries of a role not configured on the task are priced with `findRate`'s fallback rate (the rule the task row always used), so they read "—" only when the task has no rate at all; and a role not sold on the task reads "—" for Sold/Remaining/% with no Over sold. Both are recorded in `TEST_CASES.md` R-55 and `docs/prd/reporting.md` §6.3.
- The branch test stack (`scripts/test-branch.sh`, :8081) was brought back up after Gate 2 for the post-fix render checks and is **still running**, now with its worktree mount removed; per the Gate 2 rule it was not torn down on the agent's own initiative.
- The plan had no "File Structure" section; Gate 4's out-of-scope check used the per-task "Files:" lists. Outside them: `costgrid.html`, `docs/js/lib.md`, `js/lib/portfolio-calc.js`, `js/lib/program-calc.js` (round 1 fix 10) and `js/lib/foundations-guard.test.js` (Task 4 ruling).

## Sync-docs outcome

- `docs/js/lib.md` — new sections for `project-report-calc.js` and `chart-today.js`; `program-calc.js` now also loaded by `portfolio.html` (the `summaryTotals` removal note landed on the branch).
- `docs/pages/program.md` — the Today marker is the shared `todayLabelPlugin`; entry points from the project view are the program line and the project-title menu (the in-page breadcrumb is gone).
- `CLAUDE.md` — Pages row for `portfolio.html`: the per-project view redesigned 2026-10-15 (7.4).
- `ARCHITECTURE.md` — directory-tree entries of `portfolio.html` and `program.html` list the modules they now load. §5/§6 unchanged (no endpoint, no table).
- `TEST_CASES.md` — R-03, R-05, R-15, R-17, R-19, R-21, R-22, R-23 rewritten for the new UI; R-26, R-27 marked OBSOLETE; R-52…R-61 added; `js/lib/test-cases-parse.test.js` count 806 → 816.
- `test-api.js` — not touched: no endpoint or auth change.
- PRD — **updated**: `docs/prd/reporting.md` §6.1 (KPI tiles, burndown, header and switch, actions, `‹ Project Portfolio`, Program Dashboard entry points), §6.2 (Progress card views, Monthly summary), §6.3 rewritten as the Breakdown card with the Period filter. `PRD.md` itself not touched (no page added or removed).
- `.claude/skills/operational-manual/SKILL.md` — §6 reference reconciled with `docs/prd/reporting.md` (tiles, header, Progress card, burndown, Breakdown; Program Dashboard entry points).
- `PROCESS.md` gate — none of the three conditions applied; not touched.

## Memory outcome

- `project_ui_redesign_cycles.md` — appended a "Project reporting v2 (tavola 7.4) — MERGED 2026-10-15 (`930881a`)" paragraph (scope, modules, review rounds, follow-ups B-068…B-079, the reporting-calculations cycle candidate).
- `MEMORY.md` — UI redesign cycles line: "…Program Dashboard MERGED 2026-10-08 (…); then other page-by-page cycles" → "…; Project reporting v2 (7.4) MERGED 2026-10-15 (`930881a`, 12 follow-ups B-068…B-079, reporting-calculations cycle candidate); then other page-by-page cycles".
- Checked, no change: `project_portfolio_redesign_cycles.md` (overview cycles 1/2, unaffected).
