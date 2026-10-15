# Finish-cycle report — project-reporting-calc-fix

**Date:** 2026-10-15
**Branch:** project-reporting-calc-fix → main
**Execution started:** 2026-10-15 17:59  (pre-flight step 6)
**Merged at:** 2026-10-15 21:45  (Gate 4's merge commit)
**Gate durations:** Gate 1 1m · Gate 2 25m · Gate 3 200m · Gate 4 1m · Gate 5 6m — total 233m
**Cycle counters:** subagent dispatches 3 · review rounds 3 · full test-suite runs 2
**Risk class:** high-risk (`docs/superpowers/plans/2026-10-15-project-reporting-calculations-fix.md`) · review effort high
**Claims pre-check:** Gate 1 had nothing to check — the branch touched no `*.md`, so it cost nothing and caught nothing. The Gate 3 re-checks had nothing to check either, since none of the three fix rounds touched a `*.md`. None of round 1's 4 accepted findings is in the four mechanical classes: all four are code defects.
<!-- Gate 3's 200m is wall-clock and includes the time the three background reviews ran and the
     human answers between rounds. Full test-suite runs: Gate 1's `npm test` and Gate 5 step 3's;
     plan execution ran targeted files only (PROCESS.md §6.2). -->

## What was done

11 commits on the branch, plus the spec and plan committed on `main` before it:

- `864ab2f` characterization tests (burndown, program burndown, breakdown columns); By role / By area logic extracted to `roleColumns`/`areaColumns`
- `104887f` `computeBurndownPoints(…, today)` with `todayIndex`/`todayValue`, `remainingAsOf`, `feesLeft`, `planningData` removed (B-071, B-072, B-074)
- `53558d5` Breakdown Totals agree across views: unconfigured By role pairs, Ungrouped row, `areaTotalColumn`, `areaOverlap` (B-073)
- `f5a7d41` program burndown stops at today with today's remaining (B-071)
- `518fced` Today pill flips below the point and stays inside the canvas (B-077)
- `6d73a3f` pages: Budget tile on fees, burndown Today and tooltip "Planned" on both pages (B-071, B-072, B-074)
- `8bf9be4` pages: By area Total once + Ungrouped + overlap note, Monthly summary XLS from data, `--weight-regular` (B-073, B-075, B-076)
- `9cb4c3d` cache-bust: `portfolio-calc.js?v=7`, `program-calc.js?v=3`, `project-report-calc.js?v=2`, `chart-today.js?v=2`, `css/portfolio.css?v=4`
- `d53c548` Gate 3 round 1 fixes
- `8dd38f0` Gate 3 round 2 fixes
- `51e9a46` Gate 3 round 3 fixes

## Gate outcomes

- Gate 1: passed — `npm test` 1153/1153; no `api/` in the diff, backend suite not needed; claims pre-check had no `*.md` to read.
- Gate 2: ordinary cycle; Plan identified, high-risk → effort high; existing branch stack reused (started during Task 9); user verified in the browser; stack torn down after the "yes".
- Gate 3: 3 rounds. Round 1: 4 findings fixed. Round 2: 2 findings fixed. Round 3: 2 fixed, 2 accepted as follow-up. The user then chose (b) at the round limit, so no fourth round.
- Gate 4: merged `--no-ff` (main had not diverged), pushed `8a2e0b5..2d0264b`; no migration, no `api/` → no DB backup and no `pdash-api` restart; worktree removed, local branch deleted.
- Gate 5: `/sync-docs` touched `docs/prd/reporting.md`, `TEST_CASES.md` (+ the pinned count in `js/lib/test-cases-parse.test.js`), `.claude/skills/operational-manual/SKILL.md`, `docs/js/lib.md`, `docs/pages/portfolio.md`, `docs/pages/program.md`; `docs/BACKLOG.md` closed B-071…B-077 and added B-080…B-082.

## Code review follow-ups

- Round 3 — the burndown Today pill counts entries up to today, the Hours tile all of them; with entries dated after today the two disagree, though the spec says they coincide (`js/lib/portfolio-calc.js` `remainingAsOf`). → B-080
- Round 3 — with a task filter the tooltip's Budget section sums every task's budget (`js/lib/portfolio-calc.js` `totalBudgetEur`); predates the branch. → B-081

## Roadmap notes

- **Spec §5's isolated finding.** `billableData` collapses whitespace in task names, while `summaryByTask`/`findRate` compare lower-case only. Logged as B-082. Since round 1, the three Breakdown views share the By task rule (`reportRows`), so they agree with each other, but not with the Hours tile in that case.
- **Fixes producing defects.** Round 2's Ungrouped fix hid a configured role sold 0h; round 3 found it and it was fixed. This is the same "a round's fixes create the next round's findings" pattern PROCESS.md §6.4d describes.
- **Program burndown known gap 1 mitigated.** The undated-project "phantom tail" in `docs/pages/program.md` is mitigated as a side effect of round 2: after a project's last month, the program line now uses its remaining at the start of each month.
- **Screenshot artefact (Task 9).** `scripts/shoot.mjs` with `--settle 4000` caught Chart.js mid-animation (pill on the first point); `9000` was clean. This is not a code defect: the series dumped from the page was correct.
- **Ruling.** The plan execution's final whole-branch review was Gate 3's `/code-review` rather than a separate reviewer, so the same diff was not reviewed twice (PROCESS.md §6.4).

## Sync-docs outcome

- **ARCHITECTURE.md:** not updated — no new file, endpoint, table or migration; the `portfolio.html`/`program.html` entries in the directory tree already list the four modules.
- **CLAUDE.md:** not updated — no file added or removed, page purposes unchanged.
- **TEST_CASES.md:** R-03, R-22, R-58, R-59 and PG-12 updated; R-62…R-65 added; the exact count in `js/lib/test-cases-parse.test.js` raised 816 → 820.
- **test-api.js:** not applicable (no API change).
- **PRD:** updated — `docs/prd/reporting.md` §6.1 (Budget tile, Today/line cut, tooltip, Program burndown), §6.2 (Planned hours column, Export XLS), §6.3 (equal Totals, unconfigured By role rows, Ungrouped row and overlap note). `PRD.md` itself untouched.
- **operational-manual reference (5b):** updated from `docs/prd/reporting.md` — Budget tile, Today pill and tooltip, Breakdown Totals/Ungrouped/overlap.
- **Narratives:** `docs/js/lib.md` (`computeKpis`, `computeBurndownPoints` with `today`, `remainingAsOf`, `programBurndown`, `project-report-calc.js` additions, `chart-today.js` flip/clamp); `docs/pages/portfolio.md` and `docs/pages/program.md` gained a "Reporting calculations fix (2026-10-15)" section, and program.md's known gap 1 is marked mitigated.
- **PROCESS.md gate:** none of the three conditions applies (no process skill, no recurring exception, no skeleton or gate change) → untouched.

## Memory outcome

- `project_ui_redesign_cycles.md`: before, the 7.4 entry ended "candidati a un ciclo "calcoli del reporting" con spec propria (B-071…B-074), non a fix sparsi." After, it ends "chiusi dal ciclo "calcoli del reporting" qui sotto.", followed by a new entry "Project reporting calculations fix — MERGED 2026-10-15 (`2d0264b`)" (scope, spec/report paths, Gate 3 3 rounds, B-080…B-082, still open from 7.4: B-068, B-069, B-070, B-078, B-079).
- `MEMORY.md`: before, "Project reporting v2 (7.4) MERGED 2026-10-15 (`930881a`, 12 follow-ups B-068…B-079, reporting-calculations cycle candidate)". After, "… (`930881a`); reporting calculations fix MERGED 2026-10-15 (`2d0264b`, B-071…B-077 closed, new B-080…B-082)".
