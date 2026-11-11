# Finish-cycle report — backlog-auth-followups

**Date:** 2026-11-11
**Branch:** backlog-auth-followups → main
**Execution started:** 2026-11-11 10:04  (pre-flight step 6)
**Merged at:** 2026-11-11 10:37  (Gate 4's merge commit)
**Gate durations:** Gate 1 7m · Gate 2 5m · Gate 3 19m · Gate 4 2m · Gate 5 (to report) 2m — total 35m
**Cycle counters:** subagent dispatches 2 · review rounds 2 · full test-suite runs 6
**Gate 5 tests:** docs-only → `npx vitest run scripts/ js/lib/test-cases-parse.test.js` ×1 (green on first run)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-11-backlog-auth-followups.md`) · review effort high
**Claims pre-check:** Gate 1 step 0 had nothing to check: the branch changed no `*.md`. Round 1 had 9 findings, none mechanical. One claimed a false predicate in `CLAUDE.md` ("requireAdmin is JWT-cached"), but that text is no longer in `CLAUDE.md`, so it got no action and is not counted as mechanical. No Gate 3 re-check found anything, because round 1's fixes touched no `*.md`.
**Acceptance:** 7 Spec criteria listed · 6 pre-ticked: 1 and 4 by the backend unit tests in `scripts/run-tests.sh` (`api/src/middleware/auth.test.js`, `api/src/routes/auth.test.js`), 2 by `grep -rn "async function liveRole" api/src` plus AD-ED-06/AD-ED-11/SE-04 in `scripts/run-tests.sh`, 3 by SE-07 in `scripts/run-tests.sh`, 5 by `npm test` (`scripts/compose-api-port.test.js`), 6 by `grep -c` on `test-api.js` → 0 · 1 verified by hand: criterion 7 (suites green, with the 2 accepted Gmail-quota reds) · none left unverifiable.
<!-- Wall-clock, human wait time included (pre-flight step 6). Write `unknown` for a gate whose
     timestamp was not captured; a gate that self-skipped gets `0m (skipped)`. Gate 5 is measured
     up to this report; Gate 5 up to its commit is read from `node scripts/cycle-times.mjs`,
     column `merge→docs`.
     The claims pre-check line is Gate 1 step 0's own measurement (PROCESS.md §6.4d). It is prose,
     not slots: a cycle where part of it did not happen says so instead of writing a zero. Keep
     the Gate 1 and Gate 3 figures distinct.
     Cycle counters, from the start of plan execution to Gate 5: subagent dispatches = calls to the
     Agent tool; review rounds = Gate 3 rounds; full test-suite runs = complete runs of `npm test`
     or of the backend suite (`node --test` over `api/`), targeted single-file runs excluded. A
     counter the session did not observe in full is `unknown`.
     Gate 5 tests: filled in by step 3, after this file exists; the verdict is the first line of
     `node scripts/gate5-scope.mjs`, and ×N counts one run per entry into step 3. Verdict and command
     are those of the green run; if an earlier run had a different verdict, append
     `(first: <verdict> → <command>)`.
     Risk class: the values Gate 2's identification step recorded.
     Acceptance: the outcome of Gate 2's Acceptance checklist. -->

## What was done

7 commits, executed natively (`superpowers:executing-plans`):

- `8431c95` test(api): SE-07 reissued token carries the current email (red)
- `984b5e7` fix(auth): requireAuth routes an error of its success branch to next (B-419)
- `8cfafa4` fix(auth): the token reissued by change-password carries the current email (B-425)
- `8cbb5d9` fix(auth): a failed rectification request gives its rate-limit slot back (B-420)
- `6872fd5` refactor(users): use the one liveRole of the auth middleware (B-423)
- `0c9a69a` test: compose port pattern keeps its backslash; stale test-api comment (B-421, B-424)
- `87fc621` fix(auth): admin guards forward a failed session query; no slot refund once the request is written (Gate 3 round 1)

## Gate outcomes

- Gate 1: `npm test` green (2918/2918). `scripts/run-tests.sh` gave 835/837, backend unit tests 436/436. SE-07 and the role checks were green. The two reds, TS-26 and PY-13, failed on Gmail's daily quota (`550 5.4.5` in the test API log), and the user accepted them. `<gate1-green-HEAD>` = `0c9a69a`.
- Gate 2: ordinary cycle; branch stack spun up; acceptance 6 pre-ticked + 1 by hand; browser verification "yes"; stack torn down.
- Gate 3: 2 rounds.
  - Round 1 (background `/code-review` at high, HEAD unmoved) had 9 findings: 0 on Spec/Plan, 0 on pre-existing prose, and 1 wrong (the `CLAUDE.md` claim) with no action.
  - Under the rule "Critical/Important now, Minor as follow-up", the 2 Important findings were fixed test-first in `87fc621`: the admin guards crashed the API process on a DB error, and the slot was refunded after the request had been written. The 6 Minors went to follow-up.
  - Round 2 (scoped `0c9a69a..87fc621`, high) had no findings.
  - Backend re-run: 835/837, the same 2 Gmail-quota reds (73 `550 5.4.5` in the log), accepted by the user. Backend unit tests were 439/439.
- Gate 4: merged `--no-ff` (`b7179b3`), pushed together with the Spec/Plan commits (`705bd63`, `08560fb`) and `d522b00`.
  - `scripts/backup-db.sh` wrote `backups/pdash-backup-2026-11-11-103700.dump` (132K) and pruned the 2026-11-10 dump.
  - No migrations. `pdash-api` was restarted and is healthy (StartedAt 2026-11-11T09:37:33Z).
  - Worktree removed and local branch deleted.
- Gate 5: `/sync-docs` touched 2 files (one a test pin); `docs/BACKLOG.md` closed 6 rows and added B-426..B-431.

## Code review follow-ups

- Round 1 — `.catch(next)` can run a wrapper callback a second time (`api/src/middleware/auth.js` line 27) → B-426.
- Round 1 — middleware tests do not cover a wrapper whose 401/403 answer throws (`api/src/middleware/auth.test.js`) → B-427.
- Round 1 — rectification tests do not reach the 404 refund nor "201 keeps the slot" (`api/src/routes/auth.test.js`) → B-428.
- Round 1 — duplicate comment above `getPlainUser` (`test-api.js` lines 2918-2919) → B-429.
- Round 1 — `requireAuth` does not refresh `email` (`api/src/middleware/auth.js` line 18; out of scope by the Spec) → B-430.
- Round 1 — `change-password` builds the claims by hand instead of `sessionClaims(changed)` (`api/src/routes/auth.js` line 559) → B-431.

## Roadmap notes

- **The admin-guard crash (round 1 #1) was on `main` since cycle 1 (`1f59d94`).** Any DB error on a `requireAdmin`/`requireSysAdmin` route made the old `.then(ok, next)` call the wrapper callback with the error. That callback read `req.user.role` with `req.user` undefined, which raised an unhandled rejection and, with Node 24 and no `unhandledRejection` handler, crashed the API process. Fixed in `87fc621`, and closed for good on the main stack by this merge's restart.
- **Each `scripts/run-tests.sh` run sends dozens of real mails.** The Gmail quota reset early in the morning ran out again during the first integration run of this cycle. All three runs (Task 1, Gate 1, Gate 3) had TS-26/PY-13 red for that reason, and the red run of Task 1 already showed PY-13. This adds weight to B-416, the next cycle but one.
- **Execution rulings** (from the gitignored SDD ledger, copied before the worktree was removed): the Spec's "export `serviceBlock`" was not needed, because the function lives in the test file; the final whole-branch review of `executing-plans` was left to Gate 3 (PROCESS.md §6.4, native execution, high-risk).

## Sync-docs outcome

Scope pass (`git diff --stat b7179b3^1 b7179b3`, 7 files): 1 ARCHITECTURE.md no (no contract change) · 2 CLAUDE.md no (only test files added) · 3 TEST_CASES.md yes · 4 test-api.js no (done on the branch) · 5 PRD no (internal only: token email claim, slot refund on server errors, error forwarding) · 5b no · 6 PROCESS.md no · 7 memory yes.

- `TEST_CASES.md` — A-32 (password change after an admin changed the email, `SE-07`, ✓); `js/lib/test-cases-parse.test.js` case count 997 → 998.
- PRD: evaluated, not necessary (no user-visible change).
- PROCESS.md gate: none of the three conditions applies.

## Memory outcome

- `project_backlog_cycles_2026_11_10.md`: added "Mini-cycle auth follow-ups MERGED 2026-11-11 (`b7179b3`, report path, pdash-api restarted) …"; "Next … mini-cycle auth follow-ups …, then B-417" → "Next … B-417, then B-416, then cycle 2".
- `MEMORY.md`: "next: auth follow-ups mini-cycle → B-417 → B-416" → "auth follow-ups mini-cycle MERGED 2026-11-11 (`b7179b3`); next: B-417 → B-416".
- Unverified — needs the user: none.
