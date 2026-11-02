# Finish-cycle report — backlog-fixes-b194-b222

**Date:** 2026-11-02
**Branch:** backlog-fixes-b194-b222 → main
**Execution started:** 2026-11-02 16:02  (pre-flight step 6)
**Merged at:** 2026-11-02 17:41  (Gate 4's merge commit `a87fa60`)
**Gate durations:** Gate 1 5m · Gate 2 69m · Gate 3 20m · Gate 4 6m · Gate 5 (to report) 3m — total 103m
**Cycle counters:** subagent dispatches 16 · review rounds 2 · full test-suite runs 3 (`npm test` at Gate 1, the backend `node:test` suite in the branch container, `scripts/run-tests.sh`; Gate 5's run is after this report)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-02-backlog-fixes-b194-b222.md`) · review effort high
**Claims pre-check:** at Gate 1 it cost about 3 minutes over the branch's `*.md` (BACKLOG rows, `docs/js/lib.md`, `docs/db/migrations.md`, `ARCHITECTURE.md`, Brief and handoff) and caught nothing; the Gate 3 re-check of the round-1 markdown fixes cost about 2 minutes and caught nothing. Of round 1's 10 `/code-review` findings, 1 was mechanical (a sentence in `docs/js/costgrid.md` made false by the change); an 11th, the reused test id POT-08, was caught by reading the `scripts/run-tests.sh` output at Gate 1, not by the pre-check.
**Acceptance:** 8 items. Pre-ticked from automated runs: 1 (`scripts/run-tests.sh` 721/721, POT-08 now POT-29), 3 and 5 (`npm test`: `js/lib/project-push-result.test.js`, `js/lib/costgrid-copy-period.test.js`), 6 (`grep -rn "parseMoney" js/ *.html --exclude=*.test.js` → none), 7 (the seven rows `closed 2026-11-02`), 8 (`npm test` 1940/1940, `scripts/run-tests.sh` 721/721, `api/` `node:test` 380/380). Verified by hand with a positive outcome: 2 (a "New Biz" POT created on `master-pipelines.html`, listed as General) and 4 (`project-config.html` Save shows `Reason: …` for a `MONEY_RULE` refusal, on a branch DB seeded with a string task rate). None left unverifiable.

## What was done

13 commits:
- `97405b6` docs(briefs): pre-redesign fix cycle — B-194, B-222, B-187, stale backlog rows
- `95accce` docs(specs): pre-redesign fix cycle — special POTs, refusal reasons, stale rows
- `235ca27` docs(specs): fix the parseMoney guard-test sentence
- `b547177` docs(plans): pre-redesign fix cycle — 5 tasks, high-risk
- `0b1d4e1` docs(briefs): handoff update — spec and plan ready, subagent-driven
- `6d8b511` fix(pots): migration 032 — special POT targets, unique per label and year (B-194)
- `2ebd165` fix(project-push-result): show MONEY_RULE reasons; summarizeGenerateResult for Generate project (B-222)
- `20db795` fix(costgrid): Generate project reports every part not saved, PTC included (B-222)
- `661fc88` refactor(money): remove the dead parseMoney export (B-012)
- `0c4fc24` test(costgrid): copy-period harness uses the real summarizeGenerateResult (B-222)
- `4af83f1` docs(backlog): close B-012, B-096, B-099, B-100, B-187, B-194, B-222
- `d605d47` fix: final-review follow-ups — B-194 row tense, stale ?v and comment, POT-08 cleanup
- `0202421` fix: Gate 3 round 1 — POT-29 id, de-CH apostrophe tests, costgrid.md Generate message

## Gate outcomes

- Gate 1: passed — claims pre-check clean, `npm test` 1940/1940, `scripts/run-tests.sh` 721/721 (migration 032 applied on the disposable DB).
- Gate 2: ordinary cycle; branch stack spun up, migration 032 applied to the branch DB by hand, backend `node:test` 380/380 in the branch container; acceptance items 2 and 4 verified by the user in the browser; stack torn down after the user's "yes".
- Gate 3: 2 rounds at high. Round 1: 11 findings — 3 fixed (de-CH apostrophe tests, `docs/js/costgrid.md` Generate section, test id POT-08 → POT-29), 6 accepted as follow-up, 2 no action (summarizeGenerateResult's reason only for rule codes is Spec §3; duplicated round-trip cases). Round 2: 3 new low findings — 1 follow-up, 2 no action; no fix, so no round 3. Targets: 0 findings on Spec/Plan, 0 on pre-existing prose outside the diff.
- Gate 4: merged with `--no-ff` (`a87fa60`, main had not diverged), pushed; `scripts/backup-db.sh` wrote `backups/pdash-backup-2026-11-02-174139.dump`; migration 032 applied on the main DB (`pots_target_one`, `idx_pots_special_year`); `pdash-api` restarted and healthy at 2026-11-02T16:42:33Z; worktree removed (`--force`, clean status, only gitignored files) and local branch deleted.
- Gate 5: `/sync-docs` touched `TEST_CASES.md` (PP-32 updated, CG-111 and PC-37 added) and `js/lib/test-cases-parse.test.js` (887 cases); 7 follow-up rows in `docs/BACKLOG.md`; memory updated.

## Code review follow-ups

- Round 1 — after a successful project push, a failed `linkedProjects.add` in `cgDoGenerateProject` still shows "Project created" (pre-existing). `js/costgrid.js` line 1406 → B-232.
- Round 1 — `cgDoAddTasksToProject` does not report a refused PTC or phasing part. `js/costgrid.js` line 1177 → B-233.
- Round 1 — a refused PTC stays in memory after Generate and is re-sent by later pushes. `js/costgrid.js` line 1404 → B-234.
- Round 1 (also final review #6) — special POTs never count proposals but add to the year target. `api/src/routes/pots.js` line 196 → B-235.
- Round 1 — `POST /api/pots` does not whitelist or trim `specialLabel` (pre-existing). `api/src/routes/pots.js` line 249 → B-236.
- Round 1 (also final review #4) — no "Open configuration?" shortcut after a partial Generate failure. `js/costgrid.js` line 1444 → B-237.
- Round 2 — one `Reason:` for a message listing several failed parts. `js/lib/project-push-result.js` line 14 → B-238.

## Roadmap notes

- **Deviation (PROCESS.md §3), not to be inherited:** this background session could not write to the shared checkout, so the Brief, Spec and Plan were committed on the cycle branch instead of on `main` before the worktree (§6.1b), and Gate 5's edits were made in a temporary worktree `gate5-backlog-fixes` off `main`, fast-forwarded into `main`.
- The Plan's step for the new POT test used id POT-08, which already existed (POT-08..POT-28); the Plan is frozen, the code uses POT-29.
- The Spec's criterion 1 and §6 name POT-08 for the same reason; the test is POT-29.
- SDD execution: Task 3 needed one fix round (a vitest harness pinned the old Generate message; found by Task 4's implementer, not by Task 3's review); Task 4 also bumped `js/lib/costgrid-calc.js` (its `money.js` import) and `proposal-modals-guard.test.js`, both outside the Plan's Files lists and recorded as rulings.
- Gate 4's out-of-scope check: the Plan has no "File Structure" section; against its tasks' Files lists, `js/lib/costgrid-calc.js`, `js/lib/proposal-modals-guard.test.js`, `js/lib/costgrid-copy-period.test.js` and `docs/js/costgrid.md` were outside.
- Five pages (`activate.html`, `index.html`, `login.html`, `reset-password.html`, `test-cases.html`) carry a UTF-8 BOM on `main`; not introduced by this cycle.

## Sync-docs outcome

- Scope pass: 1 ARCHITECTURE.md — no (§5/§6 updated on the branch, no other mention); 2 CLAUDE.md — no (nothing it states changed); 3 TEST_CASES.md — yes; 4 test-api.js — no (no new endpoint or auth change); 5 PRD — evaluated, not necessary (`docs/prd/master-data.md` already describes the two virtual POT scopes, so B-194 restores documented behaviour; the Generate message wording is not in the PRD); 5b — no (PRD untouched); 6 PROCESS.md gate — none of the three conditions (the cycle executed the process; its one deviation is recorded above as non-recurring); 7 memory — yes.
- `TEST_CASES.md`: PP-32 now covers the duplicate refusal and is ✓ (`POT-29`); new CG-111 (Generate names every part not saved, ✓ vitest) and PC-37 (Save shows the `MONEY_RULE` reason, ✓ vitest). `js/lib/test-cases-parse.test.js` case count 885 → 887.

## Memory outcome

- `project_manual_test_findings_money_cleanup.md`: "…Remove legacy restore scripts cycle also MERGED 2026-11-02 (`2f77155`, B-226 closed)." → the same, plus "Pre-redesign fix cycle MERGED 2026-11-02 (`a87fa60`, report …): migration 032 (special POTs, applied on main), MONEY_RULE reasons shown, Generate reports every part not saved, parseMoney removed; B-012/B-096/B-099/B-100/B-187/B-194/B-222 closed; new follow-ups in docs/BACKLOG.md … Next: the redesign cycle."
- `MEMORY.md`: "…currency series paused; rest of item 3 still open" → "…currency series paused; pre-redesign fix cycle MERGED 2026-11-02 (`a87fa60`, B-194/B-222/B-187 + stale rows, migration 032); next the redesign; rest of item 3 still open".
- Checked, no change: `project_ui_redesign_cycles.md`, `project_merged_process_backlog.md` (no line about this cycle). Unverified — needs the user: which redesign cycle comes next.
