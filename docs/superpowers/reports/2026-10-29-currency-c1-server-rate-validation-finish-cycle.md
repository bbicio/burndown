# Finish-cycle report — currency-c1-server-rate-validation

**Date:** 2026-10-29
**Branch:** currency-c1-server-rate-validation → main
**Execution started:** 2026-10-29 21:51  (pre-flight step 6)
**Merged at:** 2026-10-29 22:11  (Gate 4's merge commit)
**Gate durations:** Gate 1 3m · Gate 2 10m · Gate 3 3m · Gate 4 5m · Gate 5 (to report) 4m — total 25m
**Cycle counters:** subagent dispatches 16 · review rounds 1 · full test-suite runs 3
**Risk class:** high-risk (`docs/superpowers/plans/2026-10-29-currency-c1-server-rate-validation.md`, "money o valute") · review effort high
**Claims pre-check:** Gate 1 step 0 cost about 2 minutes over the one changed `*.md` line (the B-186 row in `docs/BACKLOG.md`) and caught nothing: its grep returned one hit at line 844, and "used by no client, only `test-api.js`" held (`js/api-sync.js` line 105 reads `rate_override` from a response, it does not send the shape). Round 1 had 8 findings, none of them in the four mechanical classes; no Gate 3 re-check ran because no fix was applied.
**Acceptance:** 8 Spec criteria. 7 pre-ticked from automated runs green at `fb9bb4c`: 1 (`cd api && node --test src/lib/*.test.js`, 328/328), 2, 3, 4, 5, 7 (`scripts/run-tests.sh`, 692/692, MR-01..MR-14), 8 (`npm test` 1814/1814, `scripts/run-tests.sh` 692/692, `node --test src/**/*.test.js` in the branch API container 371/371). 1 verified by hand with a positive outcome: 6 (a role created on `master-roles.html` with a USD override shows it after a reload). Nothing left unverifiable.

## What was done

7 commits:
- `d0048c5` feat(api): money-rules module — amounts ≥ 0 with the currency's decimals
- `2fdca82` fix(api): structure PUT validates role rates; a rate of 0 is stored as 0 (M-04, M-05)
- `57c0919` fix(costgrid): autosave shows a MONEY_RULE refusal of the structure
- `f2ecb36` fix(api): project tasks PUT validates resource rates; a blank rate is saved as 0
- `ef8a2b7` fix(api): roles and ratecard entries validate rates; role create keeps its rate overrides (M-05, M-07)
- `7c0abb0` fix(api): POT amounts refused with MONEY_RULE instead of a 500
- `fb9bb4c` fix(costgrid): role rates from the registry are numbers, not NUMERIC strings

Executed subagent-driven (implementers on Sonnet, task reviews on Sonnet, final whole-branch review on Opus). All six task reviews were clean on the first pass. The final review found one Critical regression (`fb9bb4c`'s fix), re-reviewed as addressed.

## Gate outcomes

- Gate 1: passed — claims pre-check clean, `npm test` 1814/1814, `scripts/run-tests.sh` 692/692.
- Gate 2: ordinary cycle; branch stack created, acceptance checklist 7 pre-ticked + 1 verified by hand, browser verified by the user, stack torn down.
- Gate 3: background `/code-review` at high (`main...fb9bb4c`, HEAD unchanged at collection), 8 findings; disposition rules took 0; all 8 accepted as follow-up by the user (one is the existing B-186).
- Gate 4: merged with `--no-ff` (`5d2c1bc`), pushed; `scripts/backup-db.sh` wrote `backups/pdash-backup-2026-10-29-221110.dump`; no migration; `pdash-api` restarted and healthy at 2026-10-29T21:11:36Z; worktree removed, branch deleted.
- Gate 5: `/sync-docs` touched 9 files (ARCHITECTURE.md, CLAUDE.md, TEST_CASES.md, `js/lib/test-cases-parse.test.js`, `docs/api/lib.md`, `docs/js/api-sync.md`, `docs/js/shared-libs.md`, `docs/prd/pipeline.md`, `.claude/skills/operational-manual/SKILL.md`); 8 rows added to `docs/BACKLOG.md` (B-187..B-194).

## Code review follow-ups

- Round 1 — tasks `PUT` refuses legacy string `hourlyRate` from projects generated before the `js/roles.js` fix (`api/src/routes/projects.js` line 439) → B-187.
- Round 1 — no upper bound in `amountError`: column overflow gives a 500, not `MONEY_RULE` (`api/src/lib/money-rules.js`) → B-188.
- Round 1 — currency read outside the version/project lock (`api/src/routes/cost-grids.js` line 683, `api/src/routes/projects.js` line 433) → B-189.
- Round 1 — 0-decimal currencies: converted rates rounded to 2 decimals are refused (`js/lib/costgrid-calc.js` line 100; Spec decision 3) → B-190.
- Round 1 — a `null` resource entry gets a misleading message (`api/src/routes/projects.js` line 436) → B-191.
- Round 1 — nonexistent version/project id answers "…for undefined." instead of 404 → B-192.
- Round 1 — legacy `tasks[].roles[].rateOverride` shape unvalidated (`api/src/routes/cost-grids.js` line 844) → already B-186, no new row.
- Round 1 — NUMERIC-as-string fixed in one consumer only (`js/roles.js`); a type parser would fix every reader → B-193.

## Roadmap notes

- **Spec §4 / decision 4 was false for one path** ("every client already sends numbers"): `js/roles.js` passed pg's NUMERIC `hourly_rate` string through to `role.rate`, which the new rule refused on reset-rate, currency switch to EUR, ratecard selection and NULL-rate reload, and in Generate project. Caught by the SDD final review, fixed in `fb9bb4c` (`Number()` at the source, `js/roles.js?v=2` on the three pages that load it — the file had no `?v=` before). The Spec stays frozen; recorded here.
- **The plan's Task 6 fixture could not be created** (a POT with `specialLabel`): ruled during execution to use a client-target POT. It surfaced a pre-existing, user-reachable defect: `specialLabel` POTs always answer 500 (`pots_target_xor`, confirmed on the main DB) → B-194.
- **Task 3 bumped `js/api-sync.js` to `?v=30` but missed the pin in `js/lib/proposal-modals-guard.test.js`**; the plan's Task 3 test list did not include that guard. Fixed in `fb9bb4c`.
- The `api/src/routes/*.test.js` files are run by neither Gate 1 command on a host without `api/node_modules`; criterion 8 was proven by running them in the branch API container.
- Gate 5: the `docs/api/lib.md` entry was appended with a shell heredoc, not the Edit tool as Gate 5 requires; the content was checked afterwards (UTF-8, 12 lines added, intact).
- For the c2 brief: B-190 (JPY), and "Missing rate" shown for an intentional 0 (Spec decision 9).

## Sync-docs outcome

Scope pass (`git diff --stat 5d2c1bc^1 5d2c1bc`, 22 files):
1. ARCHITECTURE.md — yes: the structure `PUT`, project tasks `PUT`, roles `POST`/`PATCH`, ratecard entries `PATCH` and POT rows now note the `MONEY_RULE` refusal (no new endpoint or migration).
2. CLAUDE.md — yes: one rule added to "Money formatting and parsing" (server `amountError` → `MONEY_RULE`, clients send numbers, never pg NUMERIC strings) and the `money-rules.js` pointer; narrative routed to `docs/api/lib.md` (new `money-rules.js` section), `docs/js/api-sync.md` (MONEY_RULE notice, `?v=30`) and `docs/js/shared-libs.md` (`js/roles.js` number conversion, `?v=2`).
3. TEST_CASES.md — yes: CG-104, RL-06, RL-07, PP-51 added; `js/lib/test-cases-parse.test.js` case count 866 → 870.
4. test-api.js — no: no new endpoint or auth change (MR-01..MR-14 were written during the cycle).
5. PRD — updated `docs/prd/pipeline.md` (Role columns: 0 is a rate, refused rates and the once-per-version notice); `docs/prd/master-data.md` not changed (role overrides at creation were already documented; the cycle restored that behaviour).
5b. Operational-manual reference — yes: the "Saving in the offer editor" bullet gained the rates sentence, reconciled from `docs/prd/pipeline.md`.
6. PROCESS.md gate — no: none of the three conditions applies; the cycle executed the documented process.
7. Memory — yes, see below.

## Memory outcome

- `project_manual_test_findings_money_cleanup.md`: "NEXT: /brainstorming on c1." → "c1 MERGED 2026-10-29 (`5d2c1bc`, …) … Input for the c2 brief: JPY … 'Missing rate' for an intentional 0 … NEXT: /brainstorming on c2."
- `MEMORY.md`: "NEXT: /brainstorming on c1" → "c1 MERGED 2026-10-29 (`5d2c1bc`, MONEY_RULE server validation); NEXT: /brainstorming on c2".
