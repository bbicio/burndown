# Finish-cycle report — security-c3-auth-tokens

**Date:** 2026-11-15
**Branch:** security-c3-auth-tokens → main
**Execution started:** 19:38  (pre-flight step 6)
**Merged at:** 20:32  (Gate 4's merge commit `0a167bb`)
**Gate durations:** Gate 1 10m · Gate 2 22m · Gate 3 21m · Gate 4 1m · Gate 5 (to report) 9m — total 63m
**Cycle counters:** subagent dispatches 5 · review rounds 3 · full test-suite runs 7
**Gate 5 tests:** docs-only → npx vitest run scripts/ js/lib/test-cases-parse.test.js ×1 (green on first run)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-15-security-c3-auth-tokens.md`, migration and authentication) · review effort high
**Claims pre-check:** Gate 1 step 0 took about 1 minute over the one `.md` the branch changed (`ARCHITECTURE.md`, four lines) and caught nothing; it found one stale reference, `docs/api/users.md`, left to this gate. The Gate 3 re-checks over the round fixes touched no `.md`. Round 1 returned 6 findings, none mechanical.
**Acceptance:** criteria 1-5 and 7 proven by `scripts/run-tests.sh` (1036/1036 at HEAD, `AT-01`..`AT-05`, `TS-21`, `AD-ED-12/14`) and by `node --test` for `auth-tokens`; criterion 6 (migration on cloned data) verified by hand on the branch stack with a positive outcome, plus the user's own end-to-end checks of invite, resend, reset, burst and malformed input; criterion 7 (`/security-review`, no finding at confidence 8 or above) confirmed by the user.

## What was done

- `55b6bbe` pure helpers `auth-tokens.js` (`isStr`, `emailKey`, cooldown)
- `ed3fd7a` migration 036: token hashes replace the plaintext columns; `ARCHITECTURE.md` schema
- `eadc540` routes and services store and look up `hashToken(token)`; non-string input refused
- `111ff66` `forgot-password` limited per address and IP, cooldown on a pending reset
- `503f598` comment states the timing gap that is not closed
- `4683f43` atomic cooldown in the `UPDATE`, unique indexes on the hashes (review round 1)
- `a814e55`, `2ea2d6b`, `021663d` ceiling slack and test fixes (rounds 2 and 3)

## Gate outcomes

- Gate 1: passed (`npm test` 3207/3207, `scripts/run-tests.sh` 1029/1029).
- Gate 2: branch stack up, migration 036 applied by hand on cloned data (one pending invite carried over, reapplication a no-op); 7 criteria checked; stack torn down after the user's yes.
- Gate 3: round 1 high, 1 Important and 5 Minor, all fixed; round 2, 4 Minor, fixed; round 3, 3 Minor, fixed; the user accepted the round cap, nothing left open; `run-tests.sh` green at 1036/1036.
- Gate 4: backup taken, merged and pushed, migration 036 applied on the main stack, `pdash-api` restarted and healthy at 2026-11-15T19:33:08Z; worktree and branch removed.
- Gate 5: sync-docs touched 10 files (docs, handbook, `docs/BACKLOG.md`) and one test count.

## Code review follow-ups

- Round-up of the cycle: B-489 (response time of `forgot-password`), B-490 (token consumption race), B-491 (retry after a refused mail within the cooldown). Each carries its command in `docs/BACKLOG.md`.

## Roadmap notes

- The `scripts/run-tests.sh` cleanup prints one red `DELETE /api/pipeline-years/<id> → 409` line that is not counted in the totals; unrelated to authentication, to be proposed as its own Brief.
- The Gate 4 migration and the restart ran back to back, as the final review asked.
- The login limiter key does not trim the address while the `forgot-password` one does; left unchanged on purpose.

## Sync-docs outcome

Updated: `docs/db/migrations.md`, `docs/api/users.md`, `docs/api/lib.md`, `handbook/restricted/ARCHITECTURE.md` (route table), `handbook/restricted/TEST_CASES.md` (A-34, A-35) with the pinned count in `js/lib/test-cases-parse.test.js`, `docs/prd/access.md`, `handbook/public/manual.md`, `handbook/restricted/production-checklist.md`, `docs/BACKLOG.md`. Not touched: `CLAUDE.md` (no file added to its index, the lib entry already points to `docs/api/lib.md`), `PROCESS.md` (no condition applies).

## Memory outcome

See the sync-docs Memory line: `project_security_review_series.md` updated (cycle 3 merged).
