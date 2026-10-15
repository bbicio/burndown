# Finish-cycle report — reporting-calc-followups

**Date:** 2026-10-15
**Branch:** reporting-calc-followups → main
**Execution started:** 2026-10-15 22:21  (pre-flight step 6; first attempt — Gate 1 failed and `/finish-cycle` was re-run from the top at 22:23)
**Merged at:** 2026-10-15 22:50  (Gate 4's merge commit)
**Gate durations:** Gate 1 3m · Gate 2 15m · Gate 3 9m · Gate 4 3m · Gate 5 3m — total 33m
**Cycle counters:** subagent dispatches 3 · review rounds 3 · full test-suite runs 4
**Risk class:** high-risk (`docs/superpowers/plans/2026-10-15-reporting-calc-followups.md`) · review effort high
**Claims pre-check:** at Gate 1 the branch changed no `*.md`, so there was nothing to check (0m); the Gate 3 fix rounds touched no `*.md` either, so no re-check ran; round 1 had 6 findings, none classified as mechanical (one — a code comment citing `computeKpis` with five arguments — is borderline and left out of the count).
<!-- Gate 1 includes the failed first run (a guard test colliding with the new note's copy), its fix commit
     and the re-run. Full suite runs: Gate 1 failed run, Gate 1 re-run, Gate 3 round 2 pre-commit run,
     Gate 5 step 3. Execution (Tasks 1-4) ran natively in this session; the 3 dispatches are the three
     review rounds. -->

## What was done

7 commits:
- `2633689` test: characterize future-dated hours and filtered € budget (B-080, B-081)
- `44133b2` feat: computeKpis reports hours dated after today (B-080)
- `24a7096` fix: filtered burndown tooltip uses the task's own € budget (B-081)
- `7ef861f` feat: show future-dated hours under the Hours tile (B-080)
- `4b0d383` test: narrow the PTC-wording guard to the old PTC form (B-080 note shares the 'incl.' prefix)
- `d829633` fix: Gate 3 round 1 review findings for reporting-calc follow-ups
- `b49524b` fix: Gate 3 round 2 — pipeline-guard pins pipeline-calc.js ?v=7

## Gate outcomes

- Gate 1: failed on the first run (`js/lib/portfolio-guard.test.js` forbade any `incl. {{`, which the new B-080 note matched); the guard was narrowed to the old PTC wording (`4b0d383`), then passed on re-run (1173/1173); frontend only, no backend suite.
- Gate 2: ordinary cycle; branch stack spun up; the user verified T1–T11 in the browser (B-080 via a console snippet that moves `reportToday` back, since the cloned data has no future-dated entries); stack torn down after the user's "yes".
- Gate 3: 3 rounds at high — round 1: 6 findings (2 fixed, 2 to follow-up, 2 no action); round 2: 1 finding (the round-1 `?v=7` bump broke `js/lib/pipeline-guard.test.js`), fixed; round 3: no findings.
- Gate 4: merged `--no-ff` (`6e5c320`, main had not diverged), pushed; no `api/` change, so no DB backup, no migration, no `pdash-api` restart; worktree removed, branch deleted.
- Gate 5: `/sync-docs` touched 7 files; backlog closed B-080/B-081 and added B-083/B-084.

## Code review follow-ups

- Round 1 — actuals dates are parsed as UTC midnight (`js/api-sync.js` line 368) while the report's today is local, so in a UTC+ zone between midnight and the offset today's entries count as after today (note, pill, burndown points); predates the branch, cross-cutting. → B-083
- Round 1 — `filteredTask` (`js/lib/portfolio-calc.js`) takes the first task of that name, non-billable ones included, with no whitespace normalisation, for both the hours and the € budget; predates the branch. → B-084
- Round 1, no action (decided): the Program Dashboard's `projectMetrics` and `kpiPace` still count future-dated hours (Spec ledger decision 4, Program Dashboard out of scope); the note does not refresh across midnight (`reportToday` is fixed when the view opens, as everywhere in the view).

## Roadmap notes

- The Spec (`docs/superpowers/specs/2026-10-15-reporting-calc-followups-design.md` §2) says `js/lib/pipeline-calc.js` and `js/lib/program-calc.js` call `computeKpis`; neither does (only `portfolio.html` does; `pipeline-calc.js` names it in a comment). Found by review round 3; no effect on the code.
- Executor rulings: no separate final whole-branch review in native execution (high-risk makes Gate 3 mandatory, §6.4); the Plan's Task 4 visual check moved to Gate 2 (§6.3).
- Lesson: a `?v=` bump must be followed by the full suite, not only the touched files' tests — guards pin versions (round 2's finding).
- In production Vue builds `__vue_app__._instance` is null from the console; `__vue_app__._container._vnode.component.proxy` reaches the root instance. Changing `reportToday` does not redraw the burndown until the interval changes.
- B-082 was left in the backlog by the user (rare: the upload already rejects such task names).

## Sync-docs outcome

- `docs/prd/reporting.md` (§6): Hours tile note, pill vs tile with future-dated entries, tooltip budget with a task filter — user-visible.
- `.claude/skills/operational-manual/SKILL.md` (§5b): Hours tile note and pill/tooltip wording, reconciled from `docs/prd/reporting.md`.
- `TEST_CASES.md`: new R-66 (B-080) and R-67 (B-081), R-58 points to R-66; `js/lib/test-cases-parse.test.js` count 820 → 822.
- `docs/js/lib.md`: `computeKpis`'s `today` parameter and `futureHours`; `totalBudgetEur` with a task filter.
- `docs/pages/portfolio.md`: new "Reporting calculations follow-ups" section; the calculations-fix bullet no longer says "accepted as follow-up".
- `docs/pages/pipeline.md`: `pipeline-calc.js?v=7`.
- Not updated: `ARCHITECTURE.md` and `CLAUDE.md` (no module, route, table or convention changed); `test-api.js` (no API change). PRD: updated (`docs/prd/reporting.md`), `PRD.md` itself not needed. PROCESS.md gate: none of the three conditions applies — not touched.

## Memory outcome

- `project_ui_redesign_cycles.md`: after the "Project reporting calculations fix — MERGED" entry, added "Reporting calc follow-ups — MERGED 2026-10-15 (`6e5c320`)" (B-080/B-081 closed, B-082 left open, B-083/B-084 new, the `?v=` full-suite lesson, the Vue console path).
- `MEMORY.md`: before "reporting calculations fix MERGED 2026-10-15 (`2d0264b`, B-071…B-077 closed, new B-080…B-082)"; after "… (`2d0264b`, B-071…B-077 closed); reporting calc follow-ups MERGED 2026-10-15 (`6e5c320`, B-080/B-081 closed, B-082 left open, new B-083/B-084)".
