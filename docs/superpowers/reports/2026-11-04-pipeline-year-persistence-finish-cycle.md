# Finish-cycle report — pipeline-year-persistence

**Date:** 2026-11-04
**Branch:** pipeline-year-persistence → main
**Execution started:** 2026-11-04 18:51  (pre-flight step 6)
**Merged at:** 2026-11-04 19:56  (Gate 4's merge commit `408f892`)
**Gate durations:** Gate 1 17m · Gate 2 35m · Gate 3 9m · Gate 4 5m · Gate 5 (to report) 3m — total 69m
**Cycle counters:** subagent dispatches 2 · review rounds 2 · full test-suite runs unknown (this /finish-cycle: `npm test` 2, `scripts/run-tests.sh` 2; the runs during plan execution precede a context compaction and are not counted here)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-04-pipeline-year-persistence.md`) · review effort high
**Claims pre-check:** Gate 1 step 0 took about 3 minutes and caught 2 defects: one false predicate (P-84 claimed Portfolio and Planning list the proposal under its year; neither reads the pipeline year) and one incomplete enumeration (the localStorage key lists in `CLAUDE.md` and `ARCHITECTURE.md` lacked keys `js/core.js` keeps), fixed in `8d725cd`. The Gate 3 re-check over round 1's doc fix took about 2 minutes and caught 1 defect of its own (my first rewording of the cache-busting bullet named a guard for `js/lib/pipeline-year.js` that does not pin it). Of round 1's 8 findings, none was in the four mechanical classes.
**Acceptance:** 10 criteria + 3 `TEST_CASES.md` cases (P-84, P-85, P-86) · pre-ticked from an automated run: 3, 5 (`scripts/run-tests.sh` PYP-05, PYP-04, 742/742), 4 (PYP-02 + `api/src/lib/pipeline-year.test.js`), 6 (PYP-06), 8, 9 (`js/lib/pipeline-year.test.js`, `npm test` 2329/2329), 10 (`js/lib/foundations-guard.test.js`, `js/lib/nav-shell-guard.test.js`) · verified by hand with a positive outcome on the branch stack: 1 = P-84, 2 = P-85, 7 = P-86 · none left unverifiable.

## What was done

9 commits on top of main (`git log main..HEAD --oneline` before the merge):

- `df5121c` fix(pipeline): review round 1 — year only when active and listed, new-version store year, mkYear reuse, no ?v= numbers in prose
- `bf8934f` fix(tests): make a master-pipelines guard assertion line-ending agnostic
- `8d725cd` docs: claims pre-check — drop false P-84 report clause, complete localStorage key lists
- `b5e71b6` Merge branch 'main' into pipeline-year-persistence
- `f7a0c13` docs(pipeline): pipeline year on the Draft and remembered year
- `8019b78` fix(pipeline): create and clone proposals in the year being viewed
- `86d88da` feat(pipeline): remember the selected pipeline year in localStorage
- `81c727a` fix(api): keep the pipeline year chosen at creation through publish
- `c939dbc` feat(api): pipeline year validation helpers

## Gate outcomes

- Gate 1: main had advanced 15 commits and touched the same pinned lines, so main was merged into the branch first (`b5e71b6`, version-pin conflicts resolved, case count 940). Claims pre-check fixed 2 defects. The first `npm test` was red on `js/lib/master-data-guard.test.js` (a master-pipelines assertion expecting LF, red on main too on this CRLF checkout); fixed at the user's request (`bf8934f`). Then passed: frontend 2329/2329, backend `scripts/run-tests.sh` 742/742.
- Gate 2: ordinary cycle; branch stack spun up, checklist answered (3 manual items verified, 7 pre-ticked), browser verification confirmed, stack torn down.
- Gate 3: round 1 (background, high) 8 findings, mix chosen by the user with a rule — 4 fixed (`df5121c`), 4 to follow-up; round 2 (high) 3 new findings, all to follow-up under that rule. Disposition by target: 0 on frozen files, 0 on pre-existing prose.
- Gate 4: merge into main conflicted on `js/lib/master-data-guard.test.js` (main's `531a7c3` had fixed the same assertion with `\s+`); resolved with main's version at the user's request; merge commit `408f892` pushed (`ee3010b..408f892`); backup `backups/pdash-backup-2026-11-04-195531.dump`; no migration; pdash-api restarted and healthy at 2026-11-04T18:57:40Z; worktree and branch removed.
- Gate 5: sync-docs touched 3 files (`ARCHITECTURE.md`, `docs/prd/pipeline.md`, `.claude/skills/operational-manual/SKILL.md`) plus 1 memory file; 7 rows added to `docs/BACKLOG.md` (B-293…B-299).

## Code review follow-ups

- Round 1 — publish keeps a Draft's year that was deactivated meanwhile (`api/src/routes/cost-grids.js` line 640) → B-293
- Round 1 — an admin's remembered closed year sticks (`js/lib/pipeline-year.js` line 10) → B-294
- Round 1 — a year reached through `?year=` is not remembered (`pipeline.html` line 889) → B-295
- Round 1 — 2000–2100 bound and year checks duplicated (`api/src/routes/pipeline-years.js`, `master-pipelines.html`) → B-296
- Round 2 — a year with only Drafts: Delete offered, server 409, Drafts not findable by the admin (`api/src/routes/pipeline-years.js` line 84) → B-297
- Round 2 — editor Clone carries no year while "+ New version" does (`costgrid.html` line 1870) → B-298
- Round 2 — "active, listed year" expression written twice (`pipeline.html`) → B-299

## Roadmap notes

- Main moved twice during this closeout (the master-pipelines merge, then its Gate 5 `531a7c3` and the Roles & rates spec `ee3010b`); both times the overlap was a test or a version pin, resolved by hand.
- `js/lib/master-data-guard.test.js` was red on main on a CRLF checkout until `531a7c3`; the branch fixed it independently in `bf8934f` and the merge kept main's form.
- Proposals published in the wrong year before this cycle are not corrected; Drafts created before it carry no year.
- An untracked `docs/superpowers/plans/2026-11-04-master-data-roles-rates.md` (another session's work) was in the main checkout and was left untouched.

## Sync-docs outcome

- 1 ARCHITECTURE.md — yes: §5 rows for version create (`pipelineYear`, 400), duplicate (year from a Draft source) and publish (keeps the Draft's year, else the current one) were stale; updated.
- 2 CLAUDE.md — no: the localStorage key list and the `js/lib/` index were already updated on the branch.
- 3 TEST_CASES.md — no: P-84…P-86 added on the branch, P-84 corrected at Gate 1.
- 4 test-api.js — no: PYP-01…PYP-06 added on the branch.
- 5 PRD — yes, updated `docs/prd/pipeline.md` (§4): remembered year, New Proposal in the year shown, "+ New version" copies a Draft's year, board Clone in an open year vs editor Clone. `PRD.md` itself untouched (no product-wide change).
- 5b operational-manual reference — yes: the Board toolbar bullet now names the year of New/Clone and the remembered year, reconciled from `docs/prd/pipeline.md`.
- 6 PROCESS.md — gate answer no: none of the three conditions applies.
- 7 Memory — yes, see below.

## Memory outcome

- `project_new_version_structure_copy_bug.md`: "always Draft, no pipeline year, unlocked, no project links" → "always Draft, unlocked, no project links; pipeline year copied only from a Draft source since 2026-11-04 (`408f892`)".
- Checked, no change: `feature_state.md`, `project_ui_redesign_cycles.md`, `project_portfolio_redesign_cycles.md`, `project_stack.md`, `project_planning_team_assistant_cycle4.md`.
