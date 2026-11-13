# Finish-cycle report — backlog-c03-followups

**Date:** 2026-11-13
**Branch:** backlog-c03-followups → main
**Execution started:** 2026-11-13 19:06  (pre-flight step 6; plan execution itself began earlier, not timed)
**Merged at:** 2026-11-13 21:23  (Gate 4's merge commit `5c34f05`)
**Gate durations:** Gate 1 10m · Gate 2 29m · Gate 3 82m · Gate 4 17m · Gate 5 (to report) 4m — total 142m
**Cycle counters:** subagent dispatches 0 (native execution; the `code-review` skill ran 3 background agents) · review rounds 3 · full test-suite runs 4 (`npm test`: 1 at Gate 1; `scripts/run-tests.sh`: 1 at task 4, 1 at Gate 1, 1 after Gate 3)
**Gate 5 tests:** docs-only → npx vitest run scripts/ js/lib/test-cases-parse.test.js ×1 (green on first run)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-13-backlog-c03-followups.md`) · review effort high
**Claims pre-check:** Gate 1 step 0 had nothing to check: the branch changed no `*.md`, so it cost no time and caught nothing; the Gate 3 fix rounds touched no `*.md` either, so their re-checks did not run. Round 1 had 8 findings, none in the four mechanical classes. Round 2 had 7, 3 of them in the mechanical class "false predicate": prose of `docs/js/costgrid.md`, `docs/js/lib.md` and a `docs/BACKLOG.md` row, made false by this diff, which Gate 5's sync-docs rewrote.
**Acceptance:** Spec criteria 1-7 and 10 pre-ticked from automated runs at `0718f1a` and re-run after the fixes (`scripts/run-tests.sh` 962/962 with `DR-01..09`; backend unit tests 508; `npm test` 122 files / 3159 tests at Gate 1, and the files the fixes touched after it); criterion 5's claim that the route test fails without the lock branch was checked by mutation (3 of 10 fail) at Gate 2 and again at Gate 5. Verified by hand with a positive outcome on the branch stack: case A (criterion 8, B-476: narrowing the period leaves no false imbalance) and case B (`PATCH` regression: rename without touching the period, then lengthen it). Criterion 9 (B-477) is closed at Gate 5 with the SELECT run on the main DB (0 and 0). Nothing not verifiable.

## What was done

Eleven commits, on the Plan `docs/superpowers/plans/2026-11-13-backlog-c03-followups.md`:

- `f5732ac` `monthKeysError` ignores an inverted period and checks the key format (B-478, B-480)
- `3dff5fb` one task title rule for the save and the unchanged-task match (B-479, B-485)
- `086cff2` the structure `PUT` reads the version tasks once and shares the title rule (B-479, B-482)
- `adf999c` an unchanged period is neither locked nor written; route test with a fake DB (B-483, B-484, B-486)
- `545db03` `outOfPeriodTasks` flags the period; `cgOutOfPeriodNotice` no longer reads an error text (B-481); every `?v=` of `dates.js`, `costgrid.js` and the modules that import `dates.js`
- `0718f1a` the phasing and planning sums count only the project months (B-476)
- `9734013`, `4325aaf`, `1d40307`, `f522681` Gate 3 round 1 fixes: no check under the lock for a period that is not written; key format also without a period; the date-only answer read again; `periodState` instead of per-row fields (with a new `?v=` bump)
- `5f7bf6d` Gate 3 round 2 fixes: `periodState` as the single source in the client, the guard list and the comment

## Gate outcomes

- Gate 1: passed first time, `npm test` 122 files / 3159 tests, then `scripts/run-tests.sh` 961/961 (run one after the other).
- Gate 2: ordinary cycle, test environment up and torn down after the user's "yes"; cases A and B verified by hand, nothing left unverified.
- Gate 3: round 1, 8 findings: 4 fixed test-first (the user chose "fix everything"), 1 left as a design consequence (B-487), 3 judged no defect; round 2, 7 findings: 3 fixed, 3 stale docs left to Gate 5, 1 no change; round 3, 1 Minor finding, accepted as follow-up (B-488) at the user's choice of option (b) at the round cap. Backend re-run `scripts/run-tests.sh` green 962/962.
- Gate 4: merged (`--no-ff`, `5c34f05`; `main` had not advanced), `backups/pdash-backup-2026-11-13-212340.dump` taken first, no migration, `pdash-api` restarted and healthy (StartedAt 2026-11-13T20:24:14Z), worktree and branch removed.
- Gate 5: sync-docs updated `docs/api/lib.md`, `docs/js/lib.md`, `docs/js/costgrid.md`, `docs/pages/costgrid.md`, `docs/pages/project-config.md`, `docs/prd/project-config.md`, `handbook/restricted/ARCHITECTURE.md`, `handbook/restricted/TEST_CASES.md` (+ the case-count pin) and `docs/BACKLOG.md`.

## Code review follow-ups

Each is a row of `docs/BACKLOG.md`, opened 2026-11-13 with its verifying command.

- Round 1 (Minor, the consequence of the user's option A for B-476): month keys left outside the period after a narrowing are hidden by the form but still counted by the server and the portfolio — B-487 (`grep -n "sumWithinMonths" project-config.html`).
- Round 3 (Minor): the server states "period invalid or inverted" twice — B-488 (`grep -n "ps > pe" api/src/lib/dates.js`).

## Roadmap notes

- Findings judged "no defect" in round 1, with the reasons: the pre-read deciding whether the period is written equals the serial order "save, then narrow"; `taskKey` collapses spaces on both sides and the `INSERT` always trimmed, so a stored title cannot differ from `taskTitle` by whitespace; an id-linked task kept only by its id is the cycle 3 round 1 fix, kept on purpose. Round 2: the extra `SELECT` of the date-only answer replaces a transaction and an `UPDATE` with one primary-key read.
- `api/node_modules` does not exist in the main checkout (the backend runs in Docker): the route test `api/src/routes/projects.test.js` needs `npm ci` in `api/`, which Gate 5 ran once there.
- `scripts/cycle-times.mjs` was not run for a `merge→docs` figure.
- Running `npm test` and `scripts/run-tests.sh` one after the other, as agreed after cycle 3, gave no load-dependent failures this time.

## Sync-docs outcome

Scope pass (`git diff --stat 961164d 5c34f05`: 35 files, +377 / −78): section 1 yes (`handbook/restricted/ARCHITECTURE.md`: the three project rows now say "not `YYYYMM` or outside the period"), section 2 yes (narrative in `docs/api/lib.md`, `docs/js/lib.md`, `docs/js/costgrid.md`, `docs/pages/costgrid.md`, `docs/pages/project-config.md`; `CLAUDE.md` unchanged: its "Dates" rule already names `taskDatesError`), section 3 yes (`PC-47`; count pin 1016 → 1017), section 4 no (no endpoint added, `DR-09` was written on the branch), section 5 yes (`docs/prd/project-config.md`: the totals the form checks count only the project's months; `PRD.md` untouched), section 5c no (no layer, route or table added), section 6 no, section 7 yes. The PRD (`PRD.md` and `docs/prd/`) was evaluated: updated in `docs/prd/project-config.md` only.

PROCESS.md gate: none of the three conditions applies (a cycle that executes the documented process), so `docs/superpowers/PROCESS.md` was left untouched.

## Memory outcome

- `project_backlog_cycles_2026_11_10.md`: added a bullet for the cycle 3 follow-ups (merged 2026-11-13 `5c34f05`, this report, the 11 rows closed, B-487 and B-488 open) and kept "NEXT is still cycle 5 of the index".
- `MEMORY.md`: line "Backlog cycles 0-14": "cycle 3 dates/periods MERGED 2026-11-13 (`aa9391f`)" → "… and its follow-ups B-476..B-486 (`5c34f05`)".
- Unverified, needs the user: whether cycle 5 is really next (taken from the order recorded in the memory, not re-read from the index file).
