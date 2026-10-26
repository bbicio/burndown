# Finish-cycle report — dates-c3-task-period

**Date:** 2026-10-26
**Branch:** dates-c3-task-period → main
**Execution started:** 2026-10-26 13:14  (pre-flight step 6)
**Merged at:** 2026-10-26 17:16  (Gate 4's merge commit)
**Gate durations:** Gate 1 7m · Gate 2 111m · Gate 3 72m · Gate 4 52m · Gate 5 unknown — total unknown
**Cycle counters:** subagent dispatches 24 · review rounds 3 · full test-suite runs 4
**Risk class:** high-risk (`docs/superpowers/plans/2026-10-26-dates-c3-task-period.md`) · review effort high
**Claims pre-check:** at Gate 1 it took about two minutes over the `TEST_CASES.md` and `docs/BACKLOG.md` lines and caught one defect (PC-31 described the derive confirm with words the page does not use), fixed in `9f2d4a2`; at the Gate 3 re-checks (rounds 1 and 2, about a minute each, B-150's cited lines re-grepped) it caught nothing; none of round 1's 14 findings was mechanical.
**Acceptance:** 10 Spec criteria and 7 `TEST_CASES.md` cases listed · pre-ticked from an automated run: criteria 1 and 2 (`scripts/run-tests.sh` 612/612, TD-01..TD-06), 3 and 10 (`npm test` 1741/1741 at `09c193e`, then 1742/1742 at `40c269a`) · verified by hand with a positive outcome: criteria 4, 5, 6, 7, 9 and CG-99..CG-102, PC-30..PC-32; criterion 8 verified after the merge on the main stack (`12 44` and `9 28`, not above the handoff's counts) · not verifiable here: none.

## What was done

13 commits (`git log main..HEAD --oneline` before the merge):

- `1c33907` feat(dates): taskPeriodError and picker bounds in the dates module
- `8336338` feat(api): refuse task dates outside the version/project period
- `5046b4e` test(api): TD- ids for the task-period cases, setup/unchanged asserts
- `06ff01a` feat(costgrid): task pickers and phasing bounded by the proposal period
- `a87377b` feat(costgrid): refuse copying out-of-period tasks into a project; DATE_RULE notice
- `6268092` feat(project-config): task pickers bounded by the project period, outside budget declared
- `78d047a` docs(test-cases): dates C3 manual cases
- `7057a4a` fix(dates-c3): final review — add-tasks check covers existing tasks, half-empty period texts, guards, docs
- `9f2d4a2` docs: PC-31 quotes the derive confirm text
- `09c193e` fix(costgrid): keep the Draft banner on v-else-if, out-of-period banner after it
- `40c269a` fix(dates): a twin date outside the period no longer locks the task picker
- `7530f42` fix(dates-c3): Gate 3 r1 — autosave retries the period after a DATE_RULE, generated period from all dates, twin label, bounds wording
- `649bdd7` fix(dates-c3): Gate 3 r2 — period check before program creation, no blind PATCH retry, outside hours in derive confirm

## Gate outcomes

- Gate 1: first run red (`js/lib/costgrid-viewer-guard.test.js`: the Draft banner had become `v-if="!isLocked && isDraft"`), fixed in `09c193e`, re-run from the top; then passed, frontend (`npm test`) and backend (`scripts/run-tests.sh`). Passed again after the Gate 2 fix (`40c269a`).
- Gate 2: ordinary cycle; acceptance list all verified; the browser answer came with a defect (an out-of-period task's start picker was fully disabled because the end date bounded it), handled as "fix now" in `40c269a`, re-checked by hand after a second Gate 1; branch stack reused, torn down after the user's "yes".
- Gate 3: round 1 = whole-branch review at `09c193e` plus a scoped review of `09c193e..40c269a` (the first scoped run died on a usage limit and was re-run), 14 findings: 1 by the frozen-Spec rule to Roadmap notes, 4 fixed (`7530f42`), 9 accepted as follow-up; round 2: 8 findings, 3 fixed (`649bdd7`), 5 accepted as follow-up (3 more resurfaced round-1 items dropped); round 3: no findings.
- Gate 4: merged (`e2b0bd9`, `--no-ff`, main had not advanced), backup `backups/pdash-backup-2026-10-26-171556.dump`, no migrations, pdash-api restarted and healthy at 2026-10-26T16:16:27Z, worktree and branch removed.
- Gate 5: sync-docs touched 12 files; 12 BACKLOG rows added (B-151..B-162).

## Code review follow-ups

- Round 1 — project `PATCH` and `PUT /tasks` period checks not serialised (`api/src/routes/projects.js` line 230) → B-151
- Round 1 — `deriveDistribution` ignores the outside share of tasks with a valid `monthlyDistribution` (`js/lib/config-form-calc.js` line 58) → B-152
- Round 1 — `_cgRuleNotified` never reset (`js/api-sync.js` line 156) → B-153
- Round 1 — `outOfPeriodMessage`/`periodTaskDates` duplicated across the two pages → B-154
- Round 1 — `isTaskOutOfPeriod` recomputes per task (`costgrid.html`) → B-155
- Round 1 — redundant `toIso` in project-config's `taskDateBounds` wrapper → B-156
- Round 1 — moving only the start of a fully out-of-period task gives start > end and the order error → B-157
- Round 1 — project-config distribution wiped by a transient start > end → B-158
- Round 1 — single save that moves a task inside and shrinks the period (project-config) → folded into B-150
- Round 2 — autosave that shifts the version period and moves a task into it is refused on both legs → folded into B-150
- Round 2 — strict flush (+ New version / Clone) not covered by the DATE_RULE retry (`js/api-sync.js` line 203) → B-159
- Round 2 — `cgOutOfPeriodNotice` wording on an inverted period, lists unmovable project tasks (`js/costgrid.js` line 81) → B-160
- Round 2 — banner "Changes … are not saved" overstates what is refused (Spec wording) → B-161
- Round 2 — project `PATCH` reads `project_tasks` even when the period is unchanged → B-162

## Roadmap notes

- Spec §2.1 (and acceptance criterion 4) describes the task-picker bounds as the intersection with the twin date; after `40c269a` a twin outside the period no longer narrows the picker. The Spec is frozen and was not edited (round 1 finding S3).
- The Plan's guard-finding command (`grep -rln "<file>?v=" js/lib scripts`) matches nothing, because the guards write the path as an escaped regex; the guards were named by hand in every dispatch.
- The Plan's mandated test ids TP-01..TP-06 collided with the Topics ids; they became TD-01..TD-06.
- `api/src/scripts/seed-planning-golden.js` would have been refused by the new rule (GOLD-B started after its earliest task); fixed in `7057a4a`.
- Deferred minors from the per-task reviews, triaged "can stay deferred" by the final whole-branch review: `minOf`/`maxOf` double guard in `js/lib/dates.js`; `periodChanged` decided from the pre-lock read in the version `PATCH`; the "next period" merge expression duplicated in the two routes; `restore-backup.js`/`migrate-backup.js` bypass the rule; `distributeTaskHours` with end < start; the B-144 watcher regexes in the two page guards catch only `outOfPeriod` watchers; `.catch(() => {})` in `js/lib/costgrid-copy-period.test.js`; repeated per-task setup in `deriveDistribution`; mixed newline styles in project-config's derive confirm.
- Visual deviations accepted at Gate 2: the costgrid picker error wraps inside the From/To row; project-config month labels still Italian (B-146).

## Sync-docs outcome

Updated: `ARCHITECTURE.md` (§5 rows of the versions `PATCH`, structure `PUT`, projects `PATCH`, projects tasks `PUT`: dated 2026-10-26 clauses), `CLAUDE.md` ("Dates": one rule bullet for `taskPeriodError`/`periodShrinkError` and the picker bounds), `docs/js/lib.md` (`dates.js` new functions, `distributeTaskHours`, `deriveDistribution` outside fields), `docs/api/lib.md` (`taskPeriodError` twin, server-only `periodShrinkError`, callers), `docs/js/api-sync.md` (DATE_RULE structure save + single retry, notice wording, B-150), `docs/js/costgrid.md` (`cgOutOfPeriodNotice`, `cgGenerationPlan`/`cgGenerationRefusal`, `cgGeneratedPeriod`), `docs/pages/costgrid.md` and `docs/pages/project-config.md` (dated C3 sections), `docs/prd/pipeline.md` and `docs/prd/project-config.md` (user-visible rule), `.claude/skills/operational-manual/SKILL.md` (two bullets, triggered by the two PRD area files), `TEST_CASES.md` (CG-102 reworded). PRD: updated (`docs/prd/pipeline.md`, `docs/prd/project-config.md`). PROCESS.md gate: none of the three conditions applies; not touched. `test-api.js` already carried the new cases.

## Memory outcome

`project_manual_test_findings_money_cleanup.md`: "C3 spec + plan committed … NEXT: create the worktree and execute the C3 plan" → "C3 MERGED 2026-10-26 (`e2b0bd9`) … cycle C (C1-C3) complete; NEXT among these findings: cycle A or B, user to choose". `MEMORY.md`: its line for that file changed the same way. `project_gate5_optimization_cycle.md`: "Product next cycle (dates C3) is independent" → "Dates C3 merged 2026-10-26 (`e2b0bd9`); the next product cycle (findings cycle A or B) is independent". No other memory file mentions this cycle (`grep -l "dates-c3|C3" *.md`).
