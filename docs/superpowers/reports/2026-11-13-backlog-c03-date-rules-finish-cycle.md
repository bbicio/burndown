# Finish-cycle report — backlog-c03-date-rules

**Date:** 2026-11-13
**Branch:** backlog-c03-date-rules → main
**Execution started:** 2026-11-13 16:09  (pre-flight step 6; plan execution itself began earlier, not timed)
**Merged at:** 2026-11-13 17:49  (Gate 4's merge commit `aa9391f`)
**Gate durations:** Gate 1 31m · Gate 2 56m · Gate 3 7m · Gate 4 7m · Gate 5 (to report) 12m — total 113m
**Cycle counters:** subagent dispatches 0 (native execution; the `code-review` skill ran 2 background agents) · review rounds 2 · full test-suite runs 7 (frontend: 1 during task 8, 2 at Gate 1; `scripts/run-tests.sh`: 1 at task 5, 2 at Gate 1, 1 after Gate 3)
**Gate 5 tests:** docs-only → npx vitest run scripts/ js/lib/test-cases-parse.test.js ×1 (green on first run)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-13-backlog-c03-date-period-rules.md`) · review effort high
**Claims pre-check:** Gate 1 step 0 had nothing to check: the branch changed no `*.md` file, so it cost no time and caught nothing. Gate 3 round fixes touched no `*.md` either, so the re-checks did not run. Round 1 had 7 findings, none in the four mechanical classes.
**Acceptance:** Spec criteria 1, 3, 5, 6 and 7 pre-ticked from automated runs at `10fc184` (`scripts/run-tests.sh` 958/958 with `DR-01..08`, backend unit 487/487, `npm test` 122 files / 3151 tests); criterion 2 pre-ticked for `DR-01`/`DR-02`, but "a task already saved outside its period does not block a save" is proved only by the `taskDatesError` unit tests (Plan decision 6, confirmed by the user). Verified by hand with a positive outcome on the branch stack: case 1 (proposal banner), case 3 (typed day forms), case 4 (save regression). Not verifiable here: case 2 (project banner on `project-config.html`), not ticked by the user, no reason given. Criterion 4 (project `PATCH` lock order) is read from the code, not tested: it went to Gate 3, which found the stale-read race and fixed it.

## What was done

Nine commits, on the Plan `docs/superpowers/plans/2026-11-13-backlog-c03-date-period-rules.md`:

- `18dfacc` one period merge and one task-date rule for the server (`mergePeriod`, `periodChanged`, `periodColumn`, `taskDatesError`, `monthKeysError`; `periodShrinkError` removed)
- `ce59692` a task linked by name only cannot be dropped (B-124)
- `5708d4c` version and structure routes use the shared period rule
- `db28b7a` project period checks under the row lock; month keys inside the project period
- `4f994c3` shared out-of-period banner, raw-twin picker bounds, wider day parsing
- `e85b9f3` costgrid period texts tolerate invalid dates and an inverted period
- `d807724` `DR-01..08` in `test-api.js`
- `10fc184` costgrid and project-config use the shared period functions; every `?v=` of `dates.js` (5), `costgrid.js` (60) and the four modules that import `dates.js`
- `863edd7` Gate 3 fixes: an id-linked task is kept only by its id; a project `PATCH` with a period decides on the locked row

## Gate outcomes

- Gate 1: red once under load (2 `fetch failed` in the two-step login tests of `scripts/run-tests.sh` and 2 timeouts in `scripts/site-export.test.js`, because both suites ran at the same time), re-run alone: `run-tests.sh` 958/958, `npm test` 122 files / 3151 tests, green at `10fc184`.
- Gate 2: ordinary cycle, test environment spun up and torn down after the user's "yes"; manual cases 1, 3, 4 verified, case 2 not verifiable here.
- Gate 3: round 1, 7 findings (2 Important fixed test-first, 5 Minor to follow-up); round 2 on `10fc184..HEAD`, 4 findings, all Minor, to follow-up. Backend re-run `scripts/run-tests.sh` green 958/958.
- Gate 4: merged (`--no-ff`, merge commit `aa9391f`; `main` had not advanced), `backups/pdash-backup-2026-11-13-174924.dump` taken first, no migration, `pdash-api` restarted and healthy (StartedAt 2026-11-13T16:49:55Z), worktree and branch removed.
- Gate 5: sync-docs updated `CLAUDE.md`, `docs/api/lib.md`, `docs/js/lib.md`, `docs/js/costgrid.md`, `docs/pages/costgrid.md`, `docs/pages/project-config.md`, `docs/prd/project-config.md`, `handbook/restricted/ARCHITECTURE.md`, `handbook/restricted/TEST_CASES.md` (+ the case-count pin) and `docs/BACKLOG.md`.

## Code review follow-ups

Each is a row of `docs/BACKLOG.md`, opened 2026-11-13 with its verifying command.

- Round 1 (Minor): `monthKeysError` treats an inverted stored period as a valid limit — B-478 (`grep -n "isMonth(ps)" api/src/lib/dates.js`).
- Round 1 (Minor): blank titles re-sent for an unchanged task never match the stored `New Task` — B-479 (`grep -n "New Task" api/src/routes/cost-grids.js`).
- Round 1 (Minor): `monthKeysError` does not validate the key format — B-480 (`grep -n "k < ps" api/src/lib/dates.js`).
- Round 1 (Minor): `cgOutOfPeriodNotice` matches the English error text — B-481 (`grep -n "is not valid" js/costgrid.js`).
- Round 1 (Minor): the version tasks are queried twice in one transaction — B-482 (`grep -n "FROM tasks t JOIN phases p" api/src/routes/cost-grids.js`).
- Round 2 (Minor): every project `PATCH` with a period locks the row — B-483 (`grep -n "periodPresent" api/src/routes/projects.js`).
- Round 2 (Minor): the period shape is validated twice in the project `PATCH` — B-484 (`grep -n "periodChangeError" api/src/routes/projects.js`).
- Round 2 (Minor): an id link plus a name link on one task is not pinned by a test — B-485 (`grep -n "linked.has" api/src/lib/structure-rules.js`).
- Round 2 (Minor): the lock path of the project `PATCH` has no test — B-486 (`grep -rn "periodPresent" api/src test-api.js`).

## Roadmap notes

- Plan decision 9 was kept: B-224 is half closed (label and currency once; the two task passes of the structure `PUT` stay so a request with both errors still sees the sold-hours one first). This deviates from the Spec's "one pass over the tasks"; B-224 in `docs/BACKLOG.md` carries the reason. The user delegated the choice and the recommendation was taken.
- Two items the Plan sent out of the cycle became rows: B-476 (stale month keys after a period narrowing) and B-477 (stored non-ISO task date the client cannot clear).
- `test-api.js` prefix `DR-` is shared with the reset checks `DR-10..DR-16`; `DR-01..DR-08` were free.
- The `cgOutOfPeriodNotice` check for an invalid period reads the error text of `outOfPeriodTasks` (ruling in the ledger; B-481), because the older tests stub `window` without `isMonth` and `js/lib/dates-guard.test.js` forbids date validation outside the two modules.
- `B-160` is closed for the invalid-period wording only; that the notice still lists the tasks the project already holds is unverified and needs a browser check.
- `scripts/cycle-times.mjs` did not finish within two minutes when run at the start of Gate 5, so no `merge→docs` figure is quoted here.
- Running `npm test` and `scripts/run-tests.sh` at the same time produced load-dependent failures (2 + 2); run them one after the other.

## Sync-docs outcome

Scope pass (`git diff --stat aa9391f^1 aa9391f`: 32 files, +623 / −197): section 1 yes (`handbook/restricted/ARCHITECTURE.md`: `periodShrinkError` → `taskDatesError`, three route rows), section 2 yes (`CLAUDE.md` "Dates" predicate, narrative to `docs/api/lib.md`, `docs/js/lib.md`, `docs/js/costgrid.md`, `docs/pages/costgrid.md`, `docs/pages/project-config.md`), section 3 yes (`CG-112`, `CG-113`; count pin 1014 → 1016), section 4 no (no endpoint added, the checks were written on the branch), section 5 yes (`docs/prd/project-config.md`: unchanged saved tasks tolerated, month keys inside the period, typed day forms; `PRD.md` untouched, nothing product-wide), section 5c no (no layer, route or table added; the user manual describes no changed screen), section 6 no, section 7 yes. The PRD (`PRD.md` and `docs/prd/`) was evaluated: updated in `docs/prd/project-config.md` only.

PROCESS.md gate: none of the three conditions applies (a cycle that executes the documented process), so `docs/superpowers/PROCESS.md` was left untouched.

## Memory outcome

- `project_backlog_cycles_2026_11_10.md`: "NEXT: cycle 3 of the index" → a cycle 3 bullet (merged 2026-11-13, `aa9391f`, this report, closed rows, B-476..B-486) and "NEXT: cycle 5 of the index (then 4 after the B-319/B-320 decision)".
- `MEMORY.md`: line "Backlog cycles 0-14": "next: cycle 3" → "cycle 3 dates/periods MERGED 2026-11-13 (`aa9391f`); next: cycle 5".
- Unverified, needs the user: whether cycle 5 is really next (taken from the order recorded in the memory, not re-read from the index file).
