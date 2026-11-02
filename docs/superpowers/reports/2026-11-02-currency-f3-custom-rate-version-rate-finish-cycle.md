# Finish-cycle report — currency-f3-custom-rate-version-rate

**Date:** 2026-11-02
**Branch:** currency-f3-custom-rate-version-rate → main
**Execution started:** 2026-11-02 12:57  (pre-flight step 6)
**Merged at:** 2026-11-02 13:29  (Gate 4's merge commit)
**Gate durations:** Gate 1 4m · Gate 2 7m · Gate 3 20m · Gate 4 2m · Gate 5 (to report) 4m — total 37m
**Cycle counters:** subagent dispatches 4 · review rounds 3 · full test-suite runs 6
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-02-currency-f3-custom-rate-and-version-rate.md`) · review effort high
**Claims pre-check:** at Gate 1 it took about 3 minutes and caught 2 defects in the branch's own docs — a stale line number in the B-213 row of `docs/BACKLOG.md` and an incomplete predicate in `docs/js/costgrid.md` (a failed save re-arms the currency-change flag), fixed in `402b7f1`. The Gate 3 re-checks took about 2 minutes after round 1 and 1 minute after round 2, and each caught one stale line number in that same B-213 row. None of round 1's 9 findings was mechanical.
**Acceptance:** 12 items listed (Spec criteria 1-11 plus `TEST_CASES.md` P-83).
- **Pre-ticked from an automated run (10):**
  - 1, 3, 4, 5, 6, 7, 8 and P-83 — `npm test` → 1933/1933 (`js/lib/api-sync-upsert.test.js`, `js/lib/costgrid-rate-sync.test.js`, `js/lib/costgrid-calc.test.js`, `js/lib/costgrid-version-rate.test.js`, `js/lib/proposal-modals-guard.test.js`);
  - 2 — `bash scripts/run-tests.sh` → 718/718 (CF-01..CF-04);
  - 11 — `npm test` 1933/1933, `node --test src/**/*.test.js` in `api/` 380/380, `scripts/run-tests.sh` 718/718.
- **Verified by hand with a positive outcome (2):** 10, the browser check on the branch stack (USD proposal "New proposal" v1, with migration 031 applied to the branch DB by hand); 9, the backlog closures.
- **Not verifiable here:** none.

## What was done

11 commits:
- `69cc316` feat(currency-f3): persist task_roles.rate_is_custom (B-195) — migration 031, structure `PUT`/`GET`/duplicate, `test-api.js` CF-01..CF-04
- `7b536b9` feat(currency-f3): reload the Custom flag from rate_is_custom (B-195)
- `e4cb4d0` feat(currency-f3): sync role rates only on an explicit ratecard change (F-01)
- `b2c11ce` fix(currency-f3): a custom 0 is never a missing rate (B-195)
- `10952c0` feat(currency-f3): adopt the version rate the server applied (B-213)
- `389c25c` fix(currency-f3): refresh-rate confirmation describes what changes (B-215)
- `8afa0fa` chore(currency-f3): cache-busting, docs, backlog closures
- `b91af9c` fix(currency-f3): a failed save after a currency change keeps the re-sync flag (final execution review)
- `402b7f1` docs: currency-f3 claims pre-check — line ref and re-armed flag
- `d55165c` fix(currency-f3): Gate 3 round 1 — re-synced rates in the same save, version-bound flag
- `a908a96` fix(currency-f3): Gate 3 round 2 — per-version currency-change marks, no stale roles in the store

## Gate outcomes

- **Gate 1:** passed — the claims pre-check fixed 2 defects (`402b7f1`); `npm test` 1933/1933; the diff touches `api/`, so `scripts/run-tests.sh` ran, 718/718.
- **Gate 2:** ordinary path. The cycle's `/code-review` was launched in the background at the gate's opening; neither the skip nor the scoped path applies in high-risk, because the final execution review was not a `/code-review` at high. The branch stack was spun up (yes) and migration 031 applied to its DB by hand. The Acceptance checklist had 10 items pre-ticked and 2 ticked by hand. Browser question: yes. Branch stack torn down.
- **Gate 3:** 3 rounds, at high effort. The disposition rules (frozen spec/plan, pre-existing prose) took 0 findings in every round.
  - Round 1, 9 findings: 1-6 fixed (`d55165c`), 8 and 9 accepted as follow-up, 7 no action (Spec decision 4).
  - Round 2, 10 findings: 2 and 3 fixed (`a908a96`); 1, 5, 8, 9 and 10 accepted as follow-up; 4 no action (Gate 4 already applies 031 before the restart); 6 and 7 no action (Spec decision 4). The user decided round 2 again, because round 1 had been decided finding by finding.
  - Round 3, 5 new findings, the other 5 restating already-decided points: the three-round limit fired, and the user chose (b), all remaining as follow-up.
  - The last tests over the changed code were green (318/318 at `a908a96`).
- **Gate 4:** merged with a merge commit `0f32059` (main had not diverged; `--no-ff`) and pushed. `scripts/backup-db.sh` → `backups/pdash-backup-2026-11-02-132927.dump` (120K; pruned the 2026-10-29 dump). Migration 031 applied to `pdash-db` (`ALTER TABLE`; the column checked present). `pdash-api` restarted and healthy at `2026-11-02T12:30:11Z`. Worktree removed with `--force`: tracked status was clean, only ignored files remained (`.env`, `node_modules`, the SDD ledger, copied out beforehand). Local branch deleted. Gate 5 pre-authorised.
- **Gate 5:** `/sync-docs` touched 4 files (below); 7 follow-up rows written to `docs/BACKLOG.md` (B-225..B-231).

## Code review follow-ups

Rows B-225..B-231 of `docs/BACKLOG.md` carry each one's command and result.
- **Rounds 2-3 and the final execution review → B-225.** The currency-change re-sync design: overlapping autosaves landing out of order (round 2 #1), a version switch before the `PATCH` answers (round 3 #2), the mark removed before `cgAutoSave`'s early returns (round 3 #1), a throwing `onServerRate` skipping the structure save, `onPatched` against a returned `{ ok, patched }` (round 2 #10). Suggested redesign (round 2 #9): `PATCH` the currency first, then price the roles, then save the structure. Location: `js/costgrid.js` lines 696-739, `js/api-sync.js` line 231.
- **Round 1 #8 → B-226.** The restore scripts do not carry `rate_is_custom`/`rate_override` (`api/src/restore-backup.js` line 154, `api/src/db/migrate-backup.js` line 168).
- **Round 1 #9 and round 2 #8 → B-227.** The refresh-rate confirmation promises a reset that exists only for Custom roles (`pipeline.html` line 975, `costgrid.html` line 341).
- **Round 2 #5 → B-228.** The XLS Rate Card sheet's custom detection ignores `rateIsCustom` (`js/costgrid.js` line 1651).
- **Round 3 #3 → B-229.** `rate_is_custom = true` is stored even with a null rate (`api/src/routes/cost-grids.js` line 752).
- **Round 3 #4 → B-230.** `hasOverride`/`rateUnsaved` comes from the first task row only (`js/api-sync.js` line 108).
- **Round 3 #5 → B-231.** A misplaced section comment in `test-api.js` (line 3672).

## Roadmap notes

- **Execution.** The plan ran natively (executing-plans, Opus, inline). The ledger was kept by hand, because `task-start`/`task-done` do not run on this host. The final whole-branch execution review (a fresh Opus reviewer) found 0 Critical, 0 Important and 5 Minor.
  - Minor 1 (a failed currency-change save lost the flag) was re-graded Important and fixed in `b91af9c`, as was Minor 4 (a false doc sentence).
  - Minors 2, 3 and 5 were deferred; 2 and 3 are now part of B-225.
- **Spec defects (frozen, not edited).**
  - Spec §1 names `onRateBlur` as the place where Custom is set; the code sets it in `onRateInput` (`costgrid.html` line 1638).
  - Spec §5's table says opening a version never syncs. Gate 3 round 1 #2 narrowed that, with the user's approval: a role with no saved rate (`rate_override` NULL) is priced on open, because it has no saved rate to keep.
- **Two plan details did not match the repo** (rulings in the ledger):
  - the integration ids RC-01..RC-04 collided with the existing ratecard tests and became CF-01..CF-04;
  - the plan's literal `?v=` grep could not see the regex-pinned versions in `js/lib/proposal-modals-guard.test.js`, which was bumped too. `TEST_CASES.md` P-83 was also updated to the new confirmation text.
- **Gate 3's three rounds (9 → 10 → 5) were mostly about the same mechanism** — a module-level currency-change mark plus a callback in the middle of the upsert. That design is what B-225 proposes to replace.
- **Migration 031 must be applied before the api restart on any stack**; `scripts/test-branch.sh up` skips migrations, so a branch stack needs it applied by hand.
- **Gate 5 wrote to the shared checkout through scripts.** The background-session isolation guard refuses direct file writes there, and Gate 5 runs on `main` after the merge by design, so its edits went through scripts written to the job's temp folder and then run, as Gate 5's own rule allows.

## Sync-docs outcome

Scope pass over `0f32059^1..0f32059`:
1. **ARCHITECTURE.md — no.** The §6 `task_roles.rate_is_custom` column was documented on the branch (`scripts/architecture-guard.test.js`). The file's own "Current migrations" list is the old one; the maintained index, `docs/db/migrations.md`, already has 031.
2. **CLAUDE.md — no.** No file was added or removed, and the "Rate consistency" paragraph is still accurate.
3. **TEST_CASES.md — yes.** Added the manual case CG-110 (Custom survives reload; only a rate card change re-prices); `js/lib/test-cases-parse.test.js`'s case count went from 884 to 885.
4. **test-api.js — no.** No endpoint or auth change; CF-01..CF-04 were added on the branch.
5. **PRD — yes, `docs/prd/pipeline.md` §4 role columns:** a dated bullet saying a saved version is never re-priced by itself, what re-prices it, and that a hand-typed rate stays Custom. `PRD.md` was not touched.
6. **5b — yes.** The `.claude/skills/operational-manual/SKILL.md` offer-editor reference was reconciled from `docs/prd/pipeline.md`.
7. **PROCESS.md — no:** none of the three conditions applies (no process skill, no recurring exception, no gate or `/sync-docs` output change).
8. **Memory — yes** (below).

## Memory outcome

- `project_manual_test_findings_money_cleanup.md`: "NEXT: f3 custom rate + version rate (evolution) → f4 rate card (evolution)." → "**f3 MERGED 2026-11-02 (`0f32059`, …migration 031 applied…)** … Gate 3 ran 3 rounds (9 → 10 → 5) … the structural follow-up is a 'PATCH the currency first …' redesign … NEXT: f4 rate card (evolution)."
- `MEMORY.md`: "f2 MERGED 2026-11-02 (`1b0f8c9`, …) NEXT: f3 custom rate (evolution) → f4 rate card (evolution)" → "… f3 MERGED 2026-11-02 (`0f32059`, persisted Custom flag + migration 031, server version rate adopted) NEXT: f4 rate card (evolution)".
