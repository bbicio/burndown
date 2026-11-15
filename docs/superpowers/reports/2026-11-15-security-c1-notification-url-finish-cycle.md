# Finish-cycle report — security-c1-notification-url

**Date:** 2026-11-15
**Branch:** security-c1-notification-url → main
**Execution started:** 2026-11-15 12:00  (pre-flight step 6)
**Merged at:** 2026-11-15 12:28  (Gate 4's merge commit `6d0d155`)
**Gate durations:** Gate 1 10m · Gate 2 16m · Gate 3 2m · Gate 4 1m · Gate 5 (to report) 8m — total 37m
**Cycle counters:** subagent dispatches 1 · review rounds 1 · full test-suite runs 7 (`npm test` ×3; backend suite ×4, three of them inside `scripts/run-tests.sh`)
**Gate 5 tests:** docs-only → npx vitest run scripts/ js/lib/test-cases-parse.test.js ×1 (green on first run)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-15-security-c1-notification-url.md`) · review effort high
**Claims pre-check:** Gate 1 step 0 took about 1 minute over the two changed `.md` files (the Spec and the Plan) and found 0 defects (20 pages load `notifications.js`, 21 load the new module with `terms.html`, the 3203 test count matched). Gate 3 round 1 had 0 findings, so 0 mechanical ones, and no fixes needed the re-checks.
**Acceptance:** 6 items pre-ticked from automated runs at `cffbd72` (criteria 1, 2, 5 and the test half of 7 by `scripts/run-tests.sh` 993/993; criterion 3 by `npm test` 3203/3203, `notifications-ui.test.js`; criterion 4 by `node --test` 545/545, `email-notification-link.test.js`); 2 verified by hand with a positive outcome (criterion 6, `terms.html` `?next=`, and the second half of criterion 7, the final `/security-review`).
<!-- Wall-clock, human wait time included (pre-flight step 6). -->

## What was done

Seven commits on the branch, the Spec and Plan having been committed on `main` before it:

- `ddf4a79` feat(notifications): server-side notification-url rule
- `ad9b900` feat(notifications): browser twin of notification-url
- `b45c587` fix(notifications): reject a notification url outside the app origin (S-01)
- `efc23c4` fix(notifications): the notification email links only a valid url (S-01)
- `c3a407c` fix(notifications): the client follows only a valid notification url (S-01)
- `cf6dbfb` test(notifications): guard the notification-url consumers (S-01)
- `cffbd72` fix(terms): terms.html follows ?next= only through the notification-url rule (S-01, security-review finding)

## Gate outcomes

- Gate 1: passed first time (`npm test` 3203/3203; backend 545/545 and integration 993/993 through `scripts/run-tests.sh`).
- Gate 2: ordinary cycle; branch stack spun up on the user's yes and torn down on their "yes" to the browser question; both manual items ticked.
- Gate 3: round 1 (background review at high), no findings; no backend re-run needed since `cffbd72`.
- Gate 4: merged (fast-forwardable base, merge commit `6d0d155`), `scripts/backup-db.sh` ran first, no migration, `pdash-api` restarted and healthy (StartedAt `2026-11-15T11:28:38Z`), worktree and branch removed.
- Gate 5: sync-docs touched 11 files (below).

## Code review follow-ups

None.

## Roadmap notes

- Docker Desktop was off when Task 3 was written, so `testNotificationUrl` was committed before it had been seen to fail; the RED (route lines removed: 23 `NU-*` failures) and GREEN (993/993) runs were done afterwards and are in the cycle's ledger.
- The first `/security-review` found `terms.html`'s unvalidated `?next=` reachable through a valid path; the user chose to fix it inside this cycle. The Spec (decision 8, criterion 6, §3) and the Plan (Task 7, decision 6) were edited at that user's direction after execution had started.
- Candidate follow-up, not part of S-01: `api/src/routes/cost-grids.js:1035` builds a notification url from `process.env.APP_URL` without the `http://localhost` default the rest of the code uses.
- Candidate follow-up: the next security cycle is 2 (`xlsx`, S-02); the security process rules (a gate in `finish-cycle`, `npm audit`) stay a separate cycle after the fixes.
- `docs/js/notifications.md` still says the file loads on "10" pages; it is 20 now (pre-existing wording, not touched).
- The PROCESS.md gate (`/sync-docs` section 6): none of the three conditions applied.

## Sync-docs outcome

Updated: `CLAUDE.md` (Notifications bullet), `docs/js/lib.md` and `docs/api/lib.md` (the `notification-url.js` twins), `docs/js/notifications.md`, `docs/api/notifications.md`, `docs/api/services.md` (`renderAdminNotificationLink`), `docs/pages/terms.md` (`?next=`), `docs/prd/notifications.md` (the link rule), `handbook/public/manual.md` (Send Notification chapter), `handbook/restricted/TEST_CASES.md` (NT-25..NT-27; count pin in `js/lib/test-cases-parse.test.js` 1017 → 1020), `handbook/restricted/production-checklist.md` (`APP_URL` is also the origin of accepted notification links). Not touched: `ARCHITECTURE.md` (no route, table or migration), `PRD.md` itself, `test-api.js` (done on the branch), `PROCESS.md`.

## Memory outcome

- `project_security_review_series.md`: new — the six-cycle series, cycle 1 merged (`6d0d155`), `terms.html` added by the user's decision, next = cycle 2.
- `feedback_shell_drops_backslashes.md`: third surface appended (a quoted heredoc again lost one escape level; a unicode space escape written with Write arrived as a literal space).
- `MEMORY.md`: one new line for the series; the backslash line's hook mentions the third surface.
