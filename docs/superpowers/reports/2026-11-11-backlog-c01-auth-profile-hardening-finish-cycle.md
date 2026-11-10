# Finish-cycle report — backlog-c01-auth-profile-hardening

**Date:** 2026-11-11
**Branch:** backlog-c01-auth-profile-hardening → main
**Execution started:** 2026-11-11 00:18  (pre-flight step 6)
**Merged at:** 2026-11-11 00:36  (Gate 4's merge commit)
**Gate durations:** Gate 1 7m · Gate 2 9m · Gate 3 1m · Gate 4 2m · Gate 5 (to report) 4m — total 23m
**Cycle counters:** subagent dispatches 1 · review rounds 1 · full test-suite runs 9
**Gate 5 tests:** docs-and-script-tests → `npx vitest run scripts/ js/lib/test-cases-parse.test.js` ×1 (green on first run)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-10-backlog-c01-auth-profile-hardening.md`) · review effort high
**Claims pre-check:** Gate 1 step 0 took about 6 minutes and caught 2 mechanical defects in the branch's own markdown: an incomplete enumeration (`requireSysAdmin` listed as gating only `reset.js` and `PUT /terms` in `ARCHITECTURE.md` and `CLAUDE.md`, while `app-settings.js` also uses it on `/terms/draft` and `/terms/versions[/:version]`) and a false citation (the checklist cited SE-01..SE-05 for a claim that SE-01..SE-03 pin), fixed in `1187b8a`. Round 1 had 10 findings, 2 of them mechanical (two false predicates: a stale comment in `test-api.js`, B-414/B-415 still `open` in `docs/BACKLOG.md`). No Gate 3 re-check ran, because no fix was made.
**Acceptance:** 11 items listed (10 Spec criteria + `TEST_CASES.md` AD-33) · 7 pre-ticked: criteria 1, 2, 4, 8 by `scripts/run-tests.sh` (SE-01..SE-04, RR-06, AD-ED-16), 3 by `npm test` (`scripts/compose-api-port.test.js`), 6 and 7 by the backend unit tests (`api/src/services/users.test.js`, `api/src/db/transaction.test.js`) · 4 verified by hand with a positive outcome: criterion 5 (drawer shows the NO_RECIPIENT message on the branch stack), 9 (terms comment), 10 (suites green, with the 2 accepted SMTP-quota reds), AD-33 · none left unverifiable.
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

7 commits, executed natively (`superpowers:executing-plans`) in the same session:

- `1faf710` test(api): session revocation, rectification limits, duplicate email race (red)
- `cb137ac` fix(auth): end open sessions on disable, anonymize and password change (B-414)
- `ef30c0b` fix(users): atomic anonymize, 409 on a concurrent duplicate email (B-403, B-406)
- `ded1a86` fix(auth): rectification request limit, no-recipient 409, one notifications insert (B-401, B-404, B-410)
- `aff97f8` fix(compose): do not publish the API port on the host (B-415)
- `d4f720b` docs: session revocation and closed API port; terms comment back above its route (B-407)
- `1187b8a` docs: name every requireSysAdmin route group; checklist cites SE-01..SE-03 (Gate 1 claims pre-check)

## Gate outcomes

- Gate 1: `npm test` green (2917/2917). `scripts/run-tests.sh` gave 834/836, backend unit tests 433/433. The two reds, TS-26 and PY-13, are 500s caused by Gmail's daily send quota (`550 5.4.5`, 73 refusals in the test API log), not by the code; the user chose "run now, accept 2 SMTP reds". `<gate1-green-HEAD>` = `1187b8a`.
- Gate 2: ordinary cycle; branch stack spun up, acceptance checklist 7 pre-ticked + 4 verified by hand, browser verification "yes", stack torn down.
- Gate 3: 1 round (background `/code-review` at high, launched at Gate 2 step 0, HEAD unmoved): 10 Minor findings, 0 on Spec/Plan, 1 (#9, B-414/B-415 still open) handled by Gate 5 step 2b, 9 accepted as follow-ups under the round-1 rule "Critical/Important now, Minor as follow-up". Backend re-run: `git diff --name-only 1187b8a..HEAD` empty, nothing re-run.
- Gate 4: merged `--no-ff` (`1f59d94`), pushed; `scripts/backup-db.sh` → `backups/pdash-backup-2026-11-11-003617.dump` (132K, pruned the 2026-11-09 dump); no migrations; `pdash-api` restarted and healthy at 2026-11-10T23:36:53Z; worktree removed, local branch deleted.
- Gate 5: `/sync-docs` touched 11 files, two of them test pins (see below); `docs/BACKLOG.md` closed 8 rows and added B-417..B-425.

## Code review follow-ups

- Round 1 — an SSE stream already open is not closed on revocation (`api/src/routes/notifications.js` line 38) → B-417.
- Round 1 — narrow 401 for a request sent with the old cookie during `change-password` (`api/src/routes/auth.js` line 549) → B-418.
- Round 1 — `.then(ok, next)` in `requireAuth` does not route a throw inside `ok` (`api/src/middleware/auth.js` line 27) → B-419.
- Round 1 — rectification slot not refunded on a 500/404 (`api/src/routes/auth.js` line 148) → B-420.
- Round 1 — lost backslash in `scripts/compose-api-port.test.js` line 9 (`\s` → `s`) → B-421.
- Round 1 — one extra users query per request; unreachable 404 branches (`api/src/routes/auth.js` lines 127, 152) → B-422.
- Round 1 — duplicate `liveRole` in `api/src/routes/users.js` line 24 → B-423.
- Round 1 — stale comment above `getPlainUser` and `const pj =await` typo (`test-api.js` lines 2906, 1655) → B-424.
- Round 1 — reissued token copies the old `email` claim (`api/src/routes/auth.js` line 549) → B-425.

## Roadmap notes

- **Manual step owed by the user:** the main stack still publishes port 3000 until the container is recreated: `docker compose up -d api`. Gate 4's restart exception does not cover it.
- **First deploy signs everyone out once**: tokens signed before this cycle have no `pwd` claim and are refused (Spec decision 2, recorded in `docs/ops/production-checklist.md`).
- **B-416 (new, found during Task 6):** share and export routes answer 500 when SMTP refuses the mail, after recording the share; `scripts/run-tests.sh` sends through the real Gmail of `.env`, so TS-26 and PY-13 go red once the daily quota is used up. Gate 1 was accepted with those two reds.
- **Execution rulings** (from the gitignored SDD ledger, copied before the worktree was removed): the race check is `AD-ED-16` (AD-ED-10 was taken); SE-03's reissued-cookie half was red too in Task 1 (correct, no cookie reissued yet); `notifyAdmins` casts `$1::uuid`/`$2::text`/`$3::text`; two now-false comments in `users.js` cut; `test-api.js`'s plain user became a throw-away role-user account, because the demoted-and-restored test admin's cookie is an admin's again once the role is read from the DB (15 reds in the first green run, POT-20 and PY-13 adjusted); `docs/api/users.md` and `TEST_CASES.md` AD-33 corrected outside the Plan's file list; the CLAUDE.md block pin moved 13,131 → 13,098 → 13,113 → 13,120 across the cycle, each move with its reason in the guard. The final whole-branch review of `executing-plans` was left to Gate 3 (PROCESS.md §6.4 for native execution).
- One `/sync-docs` append to `docs/api/lib.md` was written with a shell heredoc instead of the Edit tool (Gate 5's rule); the text has no backslash and was re-read.

## Sync-docs outcome

Scope pass (`git diff --stat 1f59d94^1 1f59d94`, 20 files): 1 ARCHITECTURE.md yes · 2 CLAUDE.md yes · 3 TEST_CASES.md yes · 4 test-api.js no (done on the branch) · 5 PRD yes · 5b operational-manual reference yes · 6 PROCESS.md no · 7 memory yes.

- `ARCHITECTURE.md` — §5 rows: rectification-request (one transaction, 429 `RATE_LIMITED`, 409 `NO_RECIPIENT`), `PATCH /api/users/:id` (409 also on a concurrent duplicate), anonymize (one transaction). The middleware paragraph and the Compose block were already updated on the branch.
- `CLAUDE.md` — the `api/src/services/` entry lists the new `users` service (+7 B; `scripts/claude-md-guard.test.js` pin 13,113 → 13,120 with its reason).
- `docs/api/lib.md` — new `session.js` section. `docs/api/services.md` — `users.js` in the index and its one-line entry (`anonymizeUser`, `notifyAdmins`, `withTransaction`). `docs/api/users.md` — the concurrent-duplicate 409 and the transactional anonymize.
- `docs/pages/profile.md` — the drawer's 429 and 409 messages.
- `TEST_CASES.md` — 5 new cases: A-30, A-31 (sessions), AD-52 (duplicate-email race), GD-13, GD-14 (rectification limit, no recipient), all ✓; `js/lib/test-cases-parse.test.js` case count 992 → 997.
- PRD: updated — `docs/prd/access.md` §15 (sessions end at the next action on disable/anonymize/password change; demoted role effective at once) and §17.2 (5 requests an hour; no-other-admin message). `PRD.md` itself not touched (no product-wide fact changed).
- `.claude/skills/operational-manual/SKILL.md` — reference reconciled from `docs/prd/access.md` §15 and §17.2.
- PROCESS.md gate: none of the three conditions applies — the cycle executed the process as documented; PROCESS.md untouched.

## Memory outcome

- `project_backlog_cycles_2026_11_10.md`: "Cycle 1 … execution NOT started …" → "Cycle 1 MERGED 2026-11-11 (`1f59d94`, report path, pdash-api restarted) … user owes `docker compose up -d api`"; added "Next: cycle 2" and the run-tests.sh Gmail-quota note (B-416).
- `project_two_step_cycles.md`: "Open follow-ups: B-414 …, B-415 …" → "B-414 and B-415 CLOSED 2026-11-11 by backlog cycle 1 (`1f59d94`) …".
- `MEMORY.md`: the two index lines updated to match (B-414/B-415 closed; cycle 1 merged, next cycle 2).
- Unverified — needs the user: none.
