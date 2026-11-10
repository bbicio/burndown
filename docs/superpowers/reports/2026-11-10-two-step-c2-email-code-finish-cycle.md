# Finish-cycle report — two-step-c2-email-code

**Date:** 2026-11-10
**Branch:** two-step-c2-email-code → main
**Execution started:** 17:08  (pre-flight step 6; plan execution itself began earlier in the same session)
**Merged at:** 17:53  (Gate 4's merge commit `9af9cd9`)
**Gate durations:** Gate 1 11m · Gate 2 13m · Gate 3 19m · Gate 4 4m (to the backend restart and cleanup; 2m to the merge) · Gate 5 (to report) 4m — total 51m
**Cycle counters:** subagent dispatches 3 (the three review rounds; Tasks 1-9 ran natively) · review rounds 3 · full test-suite runs 10 (2 × `npm test`, 8 × `scripts/run-tests.sh`)
**Gate 5 tests:** docs-only → `npx vitest run scripts/ js/lib/test-cases-parse.test.js` ×1 (green on first run)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-10-two-step-c2-email-code.md`: DB migration, authentication, shared files loaded by several pages) · review effort high
**Claims pre-check:** Gate 1 step 0 took about 3 minutes over three added markdown lines (the `B-414` row and the `docs/scripts/shoot.md` paragraph), re-checking the predicates by command (`requireAuth` has no query, `B-414` is unique, the device-removal sentence matches the revocation code) and catching nothing. The Gate 3 re-checks (one extra `B-415` row, predicates re-run) cost about 1 minute and caught nothing. Of round 1's four findings none was a mechanical-class defect.
**Acceptance:** 8 items pre-ticked from automated runs green at HEAD (second step required, attempts, expiry, resend, revocation, rate limiting, CLIs: `scripts/run-tests.sh` 826/826 then, and `js/lib/otp.test.js` 12/12 for the input logic); verified by the user with a positive outcome: Codice, Errore di invio, Input in browser, Dispositivo fidato, Profilo, Responsive; not verifiable here: the rectification email subject carries no HTML entities (no run asserts a mail's text; the mailer escapes the title, body and name itself and the subject uses the raw title).

## What was done

14 commits (main had advanced by one unrelated docs commit, so a merge commit):
- `feat(api): two-step pure rules and in-memory rate limiter` — `api/src/lib/two-step.js`, `rate-limit.js` with tests.
- `feat(api): migration 034, two-step service, login code email; escape inside the mailer (B-396, B-400)`.
- `feat(api): email code second step, trusted devices, rate limits, CLIs` — routes in `auth.js`, `trust-device.js`, `two-step-code.js`, `TS-01..TS-17`.
- `feat(ui): reusable six-box code input` — `js/otp-input.js`, `js/lib/otp.js`, `css/otp-input.css`.
- `feat(api): revoke two-step state on every credential change; guard; B-397, B-409` — `revokeTwoStepState` on every path, `credential-revocation-guard.test.js`, `TS-20..TS-28`, BACKLOG B-414.
- `feat(login): email code second step` — `login.html` code and locked views.
- `feat(profile): two-step and trusted devices sections` — `profile.html`, `setSubnavChip`, `deviceExpiry`.
- `feat(scripts): automated logins through a CLI-minted trusted device` (+ the `pdash_device` cookie in `shoot.mjs`).
- `fix(login,profile): send-error state disables the boxes, softer alert tints, one-line Security sub-nav item` (Gate 2 visual decisions).
- `docs: ARCHITECTURE §4.2/§5/§6 and migrations table for the two-step cycle` (red `architecture-guard` at Gate 1).
- Three Gate 3 fix commits (rounds 1, 2, 3).

## Gate outcomes

- Gate 1: red at step 1 once (`scripts/architecture-guard.test.js`: routes, tables and a column undocumented in `ARCHITECTURE.md`), fixed in a `docs:` commit, re-entered, then `npm test` and `scripts/run-tests.sh` passed (826/826 integration, 416 unit).
- Gate 2: ordinary cycle; branch stack reused and then torn down after the user's yes; all manual items but one verified, that one recorded as not verifiable; the send-error state, the alert tints and the sub-navigation wrap fixed now, the smaller deviations accepted and recorded in `docs/pages/login.md` and `docs/pages/profile.md`.
- Gate 3: 3 rounds at high effort (4, 3 and 1 findings; the Gate 3 rule for specs/plans took 0); all fixed except finding 2 (B-415); accepted at the 3-round cap by the user; final run 832/832 integration, 418 unit.
- Gate 4: merged (`9af9cd9`, a merge commit), backup `backups/pdash-backup-2026-11-10-175300.dump` taken first, migration 034 applied to `pdash-db`, `pdash-api` restarted and healthy (started 2026-11-10T16:54:04Z), worktree and branch removed.
- Gate 5: sync-docs touched `CLAUDE.md` (two Pages-table purposes), `TEST_CASES.md` (A-18…A-29, count pin 980 → 992), `docs/pages/login.md` (new), `docs/pages/profile.md`, `docs/js/lib.md`, `docs/js/shared-libs.md`, `docs/api/lib.md`, `docs/api/services.md`, `docs/api/users.md`, `docs/prd/access.md`, the `operational-manual` reference, `docs/BACKLOG.md` unchanged by sync (rows written on the branch).

## Code review follow-ups

- Round 1 #2 — `app.set('trust proxy', 1)` with `docker-compose.yml` still publishing the API on port 3000: a client reaching that port directly can forge `X-Forwarded-For` per request and dodge the per-IP login limit (the per-email limit holds). `docs/BACKLOG.md` B-415, verified `grep -n "trust proxy" api/src/index.js` and `grep -n '"3000:3000"' docker-compose.yml` → both present, 2026-11-10.
- Spec §3.4 (known, by design) — the `pdash_token` JWT stays valid up to 8 h after disable, anonymize or a password change: `docs/BACKLOG.md` B-414.

## Roadmap notes

- **Rulings made during execution (the SDD ledger was removed with the worktree):**
  - Tasks 3, 4, 5: tests were written together with the code, so no RED run was observed for them (the revocation guard, `setSubnavChip`, `deviceExpiry`, the limiter `refund` and the round-3 guard did go RED first); each TS asserts a specific status or code that a missing route cannot produce. Cost if wrong: a test that could never fail.
  - Task 3: resend in TS-08 accepts 200 or 502 (the stack's SMTP may be unreachable and the new code is stored either way); TS-07 sets `code_sent_at` by hand; `api/src/cli-env.js` is shared by the two CLIs instead of copying the `create-admin.js` bootstrap; `resetLatestCode` was added to the service; the mail transporter got timeouts because the login now awaits the mail.
  - Task 4: `exports.js` has three handlers reading `req.user.email`, not the plan's three line numbers; all go through `recipientOf(userId)`. The suite re-mints the admin's trusted device after the password round trip and after `AD-ED-02` (both correctly revoke it).
  - Task 6: the rate-limited copy says "1 minute." at n = 1; the compact logo applies to every view but `login`.
  - Task 7: trusted-device calls use the global `apiFetch` (no new `Api.auth` members, avoiding an `api.js` version bump across the pages); dates use the site's `formatDayText`; Remove all keeps the shared confirm modal's OK label.
- The TS ids in `test-api.js` (`TS-01`, `TS-02`) collide with two older timesheet labels; cosmetic.
- Gate 3 round 1 also observed `sendAdminNotificationEmail` putting its `url` into `href` unescaped (pre-existing, callers pass internal paths): no action taken.
- Session issuance on verify without `trustDevice` has no state guard (the JWT is not revocable anyway: B-414).
- Every Docker command of this cycle targeted the isolated stacks, except Gate 4's `backup-db.sh`, the migration apply and `docker compose restart api` (the named derogations).

## Sync-docs outcome

Scope pass: section 1 (`ARCHITECTURE.md`) yes, already done on the branch (§4.2, §5, §6, migrations line); 2 (`CLAUDE.md`) yes, Pages table only, the File Structure block untouched; 3 (`TEST_CASES.md`) yes; 4 (`test-api.js`) no, done on the branch; 5 (PRD) yes; 5b yes (triggered by `docs/prd/access.md`); 6 no; 7 yes. Updated: the files listed under Gate 5 above. Not updated: `PRD.md` itself (no page added or removed), `docs/api/exports.md` (the recipient now comes from the database; the route contract is unchanged).

## Memory outcome

`project_two_step_cycles.md`: "cycle 2 spec + plan committed, execution not started, user has not confirmed" → "cycle 2 MERGED 2026-11-10 (`9af9cd9`), migration 034 applied, three Gate 3 rounds, open B-414/B-415, user must mint a device for SHOOT_EMAIL"; its `MEMORY.md` line rewritten to match. Evaluated, no change: `feedback_shell_drops_backslashes.md` (it bit once more this cycle, in a test regex, and its rule already covers it).
