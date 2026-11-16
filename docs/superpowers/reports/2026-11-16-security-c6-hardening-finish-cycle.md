# Finish-cycle report — security-c6-hardening

**Date:** 2026-11-16
**Branch:** security-c6-hardening → main
**Execution started:** 2026-11-16 16:06  (pre-flight step 6)
**Merged at:** 2026-11-16 17:00  (Gate 4's merge commit)
**Gate durations:** Gate 1 11m · Gate 2 22m · Gate 3 18m · Gate 4 4m · Gate 5 (to report) 2m — total 57m
**Cycle counters:** subagent dispatches 4 · review rounds 3 · full test-suite runs 7
**Gate 5 tests:** docs-only → `npx vitest run scripts/ js/lib/test-cases-parse.test.js` ×1 (green on first run, 484/484)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-16-security-c6-hardening.md`) · review effort high
**Claims pre-check:** Gate 1 step 0 took about 1 minute over the two BACKLOG rows (B-499, B-500) and found no defect; the Gate 3 re-checks over the round-1 `*.md` fixes (production checklist line, B-500 row) took about 1 minute and found none; of round 1's nine findings, one was mechanical (the production checklist's cookie sentence, a predicate made false by the branch).
**Acceptance:** six Spec criteria. Pre-ticked from automated runs: 1 (response part, `test-api.js` SEC-20/21), 2 (SEC-22, DT-01.., `error-response.test.js` multer case), 3 (`jwt.test.js` + `grep -rn "NODE_ENV === 'production'" api/src` → none), 4 (`npm test` 3278/3278, `scripts/run-tests.sh` 573 + 1041), 5 (BACKLOG rows; S-05/S-10 recorded below). Verified by hand with a positive outcome: 1 (log part — `docker logs` of the branch api shows the PostgreSQL error) and 6 (`/security-review`, no findings). None left unverifiable.
<!-- Wall-clock, human wait time included (pre-flight step 6). -->

## What was done

Six commits before the merge:

- `472b4e1` fix(api): generic message for unexpected errors, multer errors are 400 (S-08)
- `f614900` fix(auth): cookies are Secure unless NODE_ENV=development (S-07)
- `6cfb36a` test(api): generic 500 on a database error, 400 kept for malformed JSON (S-08)
- `a09daaa` docs(backlog): B-499 APP_URL default in share links, B-500 userId validation
- `bd62848` fix(api): review round 1 — checklist cookie rule, headersSent, upload/JSON 400s, stored error text, shared cookie options (S-08, S-07)
- `c8b95ab` fix(api): review round 2 — stored error text keeps the SQLSTATE, hides socket errors; no double log after headers sent

Executed natively (`superpowers:executing-plans`); `/security-review` ran on the branch before `/finish-cycle` and found nothing.

## Gate outcomes

- Gate 1: passed (`npm test` 3278/3278; `scripts/run-tests.sh` backend 573/573, integration 1041/1041) at `a09daaa`.
- Gate 2: ordinary path; branch stack spun up, acceptance checklist answered (two manual items verified), browser question answered yes, stack torn down.
- Gate 3: round 1 (background, whole branch, high) nine findings — 1 Important, 8 Minor; disposition rules took none (no finding on frozen spec/plan files; the out-of-diff checklist line was treated as a finding on the branch, since the branch made it false). User: fix all, then a scoped review. Fixed in `bd62848`; round 2 (scoped `a09daaa..bd62848`) three Minor, fixed in `c8b95ab` under the same rule; round 3 (scoped `bd62848..c8b95ab`) no findings. Backend re-run: `scripts/run-tests.sh` at `c8b95ab` → 582/582, 1042/1042.
- Gate 4: merged `--no-ff` (`98fdcb5`, main had not moved), pushed; `backups/pdash-backup-2026-11-16-170027.dump` written; no migrations; `pdash-api` restarted, healthy at 2026-11-16T16:01:00Z; worktree and branch removed.
- Gate 5: sync-docs touched 4 files; no BACKLOG follow-up rows (every finding was fixed).

## Code review follow-ups

None.

## Roadmap notes

- S-05 (PostgreSQL/Adminer ports, Adminer `latest`) and S-10 (root container, `test` profile without a guard) were excluded by the user's decision: the repo's `docker-compose.yml` is not the production one.
- Round-1 finding 9 (the malformed-JSON 400 quoted the request body) was fixed at the user's request with a fixed `'Malformed JSON body'`, departing from the Plan's Global Constraint "a 4xx keeps `err.message`".
- Deployment: `PDash_To_Prod` (outside the repo) must serve HTTPS, or set `NODE_ENV=development` deliberately; otherwise the Secure cookies are dropped and login loops (`handbook/restricted/production-checklist.md`).
- The Spec's §4 test-api check "a `DATE_RULE` keeps message and `code`" was not added: the Plan replaced it with SEC-22, since `DATE_RULE` never reaches the handler; the existing `DT-*` checks cover it.
- `scripts/run-tests.sh` cleanup again printed a red `DELETE /api/pipeline-years/<id> → 409`, retried to 200 later in the same cleanup; not counted in the results.
- Next in the series: cycle 7, B-497 partial (`'unsafe-inline'` out of `script-src`), opened with `/feature-brief`.

## Sync-docs outcome

Scope: 1 ARCHITECTURE no (no layer, route, table or flow changed) · 2 CLAUDE.md no edit to the file, its routing targets yes · 3 TEST_CASES yes · 4 test-api no (done on the branch) · 5 PRD no · 5c no (`production-checklist.md` already fixed on the branch; ARCHITECTURE/PRD unchanged) · 6 PROCESS.md no (none of the three conditions) · 7 memory yes.

- `docs/api/lib.md`: new `error-response.js` section.
- `docs/api/services.md`: `jwt.js` gains `cookieSecure()`/`cookieOptions()`.
- `handbook/restricted/TEST_CASES.md`: SEC-17 (generic 500, ✓), SEC-18 (4xx without echo, ✓), SEC-19 (Secure cookies outside development, manual).
- `js/lib/test-cases-parse.test.js`: case count 1028 → 1031.
- PRD (`PRD.md` and `docs/prd/`): evaluated, not necessary (error bodies and a cookie flag, internal).

## Memory outcome

- `project_security_review_series.md`: description "Six-cycle … cycles 1-5 merged" → "… cycles 1-6 merged"; added the "Cycle 6 MERGED 2026-11-16" paragraph; "How to apply: next is cycle 6 …" → "next is cycle 7 — B-497 partial … `/feature-brief` …".
- `MEMORY.md`: the Security review series line "cycle 6 hardening next" → "cycle 6 S-08+S-07 MERGED 2026-11-16 (`98fdcb5`, api restarted, B-499/B-500 open); next cycle 7 (B-497 partial, needs /feature-brief)".
