# Finish-cycle report — backlog-b499-b500

**Date:** 2026-11-16
**Branch:** backlog-b499-b500 → main
**Execution started:** 2026-11-16 18:23  (pre-flight step 6)
**Merged at:** 2026-11-16 19:16  (Gate 4's merge commit)
**Gate durations:** Gate 1 10m · Gate 2 40m · Gate 3 1m · Gate 4 4m · Gate 5 (to report) 2m — total 57m
**Cycle counters:** subagent dispatches 2 · review rounds 1 · full test-suite runs 7
**Gate 5 tests:** docs-only → `npx vitest run scripts/ js/lib/test-cases-parse.test.js` ×1 (green on first run, 484/484)
**Risk class:** standard (`docs/superpowers/plans/2026-11-16-backlog-b499-b500.md`) · review effort medium
**Claims pre-check:** Gate 1 step 0 took about 1 minute over the four `docs/BACKLOG.md` rows and found no defect; no Gate 3 re-check ran (no fix round); round 1's single finding was not mechanical.
**Acceptance:** six Spec criteria. Pre-ticked from automated runs: 1 (`api/src/services/email-app-link.test.js` 1/1 + `grep -n "process.env.APP_URL" api/src/routes/cost-grids.js` → none), 2 (`test-api.js` UV-01..07), 3 (SEC-20/21 on `GET /api/cost-grids/not-a-uuid/shares`), 5 (`npm test` 3278/3278, `scripts/run-tests.sh` 583 + 1050). Verified by hand with a positive outcome: 4 (BACKLOG rows) and 6 (`/security-review`, no findings). None left unverifiable.
<!-- Wall-clock, human wait time included (pre-flight step 6). -->

## What was done

Four commits on the branch (the Brief, Spec and Plan were committed on `main` before the branch was cut, `f824a76`, `525c839`, `708345a`, `c043e59`):

- `d60d75e` fix(api): share links use APP_URL with its default (B-499)
- `6372b28` fix(api): non-UUID userId on share and notification routes answers 400 (B-500)
- `0bd28ec` test(api): SEC-20 triggers the generic 500 through a non-UUID :id
- `db68070` docs(backlog): close B-499/B-500, add B-501 share :id and B-502 program share

Brief written without `/feature-brief`, at the user's request. Executed natively (`superpowers:executing-plans`); `/security-review` ran on the branch before `/finish-cycle` and found nothing.

## Gate outcomes

- Gate 1: passed (`npm test` 3278/3278; `scripts/run-tests.sh` backend 583/583, integration 1050/1050) at `db68070`.
- Gate 2: ordinary path; branch stack spun up, acceptance checklist answered (two manual items verified), browser question answered yes, stack torn down.
- Gate 3: round 1 (background, whole branch, medium) one Minor finding; disposition rules took none; user: Critical/Important now, Minor as follow-up → B-503. Backend re-run: nothing under `api/` or `test-api.js` changed after `db68070`, so no run.
- Gate 4: merged `--no-ff` (`4b792ba`, main had not moved; the push also published the Brief, Spec and Plan commits), `backups/pdash-backup-2026-11-16-191644.dump` written, no migrations, `pdash-api` restarted, healthy at 2026-11-16T18:17:02Z; `git worktree remove` failed with "Permission denied", the leftover directory was removed with `rm -rf` and the branch deleted.
- Gate 5: sync-docs touched 4 files; one BACKLOG follow-up row (B-503).

## Code review follow-ups

- Round 1 — UV-08 checks `status !== 400` instead of the broadcast's 201 (`test-api.js` line 826) → B-503.

## Roadmap notes

- `POST /api/programs/:id/share` (`api/src/routes/config.js` line 126) has the same unvalidated `userId`/`:id`; found while writing the Plan and kept out of the cycle by the user → B-502.
- SEC-20 of `test-api.js` now depends on the non-UUID `:id` of the share routes (B-501): fixing B-501 needs another 500 trigger.
- `scripts/run-tests.sh` cleanup again printed a red `DELETE /api/pipeline-years/<id> → 409` in the Task 2 run, not counted in the results.

## Sync-docs outcome

Scope: 1 ARCHITECTURE no (no layer, route, table or flow changed) · 2 CLAUDE.md no edit to the file, routing targets yes · 3 TEST_CASES yes · 4 test-api no (done on the branch) · 5 PRD no (error bodies only) · 5c no · 6 PROCESS.md no (none of the three conditions) · 7 memory yes.

- `docs/api/services.md`: `appLink(path)` next to the `APP_URL` constant.
- `docs/api/notifications.md`: new "userId validated" section (also covers the share routes of `cost-grids.js`/`projects.js`, which have no `docs/api` file).
- `handbook/restricted/TEST_CASES.md`: SEC-20 (non-UUID `userId` refused, ✓).
- `js/lib/test-cases-parse.test.js`: case count 1031 → 1032.
- PRD (`PRD.md` and `docs/prd/`): evaluated, not necessary (internal validation).

## Memory outcome

- `project_security_review_series.md`: the cycle 6 line "Open: B-499 (…), B-500 (…), and the PDash_To_Prod deploy" → "B-499 + B-500 closed the same day by the mini-cycle `backlog-b499-b500` (merge `4b792ba` …); opened B-501 and B-502. Still open: the PDash_To_Prod deploy".
- `MEMORY.md`: Security review series line "(`98fdcb5`, api restarted, B-499/B-500 open)" → "(`98fdcb5`, api restarted); B-499/B-500 closed by `backlog-b499-b500` (`4b792ba`), B-501/B-502 open".
