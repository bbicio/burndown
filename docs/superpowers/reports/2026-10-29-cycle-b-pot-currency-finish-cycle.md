# Finish-cycle report — cycle-b-pot-currency

**Date:** 2026-10-29
**Branch:** cycle-b-pot-currency → main
**Execution started:** 2026-10-29 11:49  (pre-flight step 6)
**Merged at:** 2026-10-29 13:59  (Gate 4's merge commit `ba82f99`)
**Gate durations:** Gate 1 7m · Gate 2 120m · Gate 3 2m · Gate 4 2m · Gate 5 (to report) 8m — total 139m
**Cycle counters:** subagent dispatches 1 · review rounds 1 · full test-suite runs 2 (`npm test`, red then green; the backend `node --test` ran over `api/src/lib/` only, not a full `api/` run)
**Risk class:** high-risk (`docs/superpowers/plans/2026-10-29-cycle-b-pot-currency.md`) · review effort high
**Claims pre-check:** Gate 1: about 2 minutes over the added `TEST_CASES.md` rows and B-174, 0 defects. Gate 3: no re-check ran, because no fix was applied. Round 1 had 8 findings, none of them in the four mechanical classes.
**Acceptance:** 24 items listed (the spec's 14 criteria plus the 10 `TEST_CASES.md` cases added or modified). 10 were pre-ticked from automated runs: criteria 1, 2, 4, 5, 6 and 7 plus PP-46 by `scripts/run-tests.sh` (649/649, POT-13..POT-17); criterion 12 by `node --test src/lib/pot-fee-sql.test.js` (4/4); criterion 13 by `npx vitest run js/lib/master-pipelines-pot-details.test.js` (green, also within `npm test` 1808/1808); criterion 14 by `npm test` 1808/1808, `api/src/lib` `node --test` 308/308 and `run-tests.sh` 649/649. The other 14 (criteria 3, 8, 9, 10, 11 and PP-21, PP-42..PP-45, PP-47, PP-48) were grouped into 7 checks, because each of the five criteria is the same check as one of the cases. You verified all 7 by hand with a positive outcome on the branch stack, using real data: the SIFI Group 2026 USD SIP proposal, and PP-48 with `currency_rate = 0` set via psql on that same proposal. Nothing was left "not verifiable here".

## What was done

5 commits:
- `de8b5a8` refactor(pots): one fee expression for every POT route, zero rate safe
- `dba0001` feat(pots): original currency and Expected/SIP totals in details, list and year totals
- `d91ef6e` feat(master-pipelines): Expected and SIP columns in the POT table and year row
- `d33424e` feat(master-pipelines): original currency and Expected/SIP line in POT Details, colours from tokens
- `593f801` test: TEST_CASES.md case count pin 859 → 863 (PP-45..PP-48 added)

Execution was native (`superpowers:executing-plans`), on Opus. The executor's rulings:
- Task 2: `testPotMasterDataFields()` is called from `testPots()` right after `testPotSummaryExtended()`, because the latter has early returns.
- Task 4: the "Not in total" line carries `mt-2` as well as `mb-4`.
- No separate executing-plans final review was run: in `high-risk`, Gate 3 runs a high-effort review anyway (PROCESS.md §6.4).

## Gate outcomes

- Gate 1: first run red. `js/lib/test-cases-parse.test.js` pins the exact case count, and this branch deliberately added PP-45..PP-48 (859 → 863). The pin was raised in `593f801` and the gate re-run from the top: `npm test` 1808/1808, `run-tests.sh` 649/649.
- Gate 2: ordinary path. The branch stack was spun up, all 7 manual checks were verified and the browser question answered "yes", then the stack was torn down.
- Gate 3: round 1 was launched in the background at Gate 2. It found 8 findings and no correctness defects, and all 8 were accepted as follow-up. Disposition rules took 0 findings: none targeted the frozen Spec/Plan, none was pre-existing prose.
- Gate 4: merged `--no-ff` (`ba82f99`; main had not diverged) and pushed. `scripts/backup-db.sh` wrote `backups/pdash-backup-2026-10-29-135923.dump` first. No migrations. `pdash-api` was restarted and healthy at 2026-10-29T12:59:54Z. The worktree and the branch were removed. Out-of-scope check: the Plan has no "File Structure" section, so I compared against its per-task Files lists. `js/lib/test-cases-parse.test.js` was outside them (the Gate 1 pin bump).
- Gate 5: `/sync-docs` touched 5 files; B-175..B-182 were added to `docs/BACKLOG.md`.

## Code review follow-ups

- Round 1, B-175: POT totals count every non-Draft version of a proposal instead of one display version (older bug, now also reaches E/S). `api/src/routes/pots.js`.
- Round 1, B-176: an EUR version can keep a stale `currency_rate`, and `feeEurSql` divides by it. `api/src/routes/cost-grids.js` line 450.
- Round 1, B-177: only active currencies are loaded, so an inactive-currency proposal uses the fallback locale. `master-pipelines.html` line 738/1008.
- Round 1, B-178: the raw currency code reaches `innerHTML` without `esc()` when its currency is not loaded (not exploitable). `master-pipelines.html` line 1008.
- Round 1, B-179: the POT table and the year row keep `#198754`/`#fd7e14`, while the modal uses the tokens. `master-pipelines.html` lines 166/168/353/354.
- Round 1, B-180: a year with E/S but no POT target hides the E/S amounts. `master-pipelines.html` line 160.
- Round 1, B-181: the stage badge builds the token name by hand instead of using `headerBadge('stage', …)`. `master-pipelines.html` line 1006.
- Round 1, B-182: quality points: the fee subquery runs twice per details row, it is repeated in `CASE` branches (`FILTER` would compute it once), the zero-totals object is written twice, and the guard is stricter than its rule. `api/src/routes/pots.js`.

## Roadmap notes

- PP-45 was written with CHF in mind, but CHF is inactive in the real data, so it was verified with an active currency (USD). With CHF it would show the B-177 fallback format.
- `docs/prd/master-data.md` §7.4 describes the stage card values as "days × 8 × rate". The fee SQL multiplies `task_roles.days` by the rate, so whether the stored "days" are really hours was not checked in this cycle.

## Sync-docs outcome

Scope pass: 1 yes, 2 yes (routing to `docs/`), 3 no (already done on the branch), 4 no (already done on the branch), 5 yes, 5b yes, 6 no, 7 yes.
- `ARCHITECTURE.md` §5: the `GET /api/pots`, `/year-totals` and `/:id/details` rows now list `expected_total`/`sip_total`, and per proposal `currency`/`value_original`.
- `docs/api/lib.md`: a new `pot-fee-sql.js` section.
- `docs/pages/config.md`: a new section, "POT original currency and Expected/SIP (2026-10-29, cycle B)".
- PRD: updated `docs/prd/master-data.md` §7.4 (POT table columns, year-row E/S, the modal's "Not in total" line and original currency).
- `.claude/skills/operational-manual/SKILL.md`: the POT walk-through (item 4) is aligned with that PRD area file.
- `CLAUDE.md` unchanged: its `api/src/lib/` entry already points to `docs/api/lib.md`.
- PROCESS.md gate: none of the three conditions applies, so it was left untouched.

## Memory outcome

- `project_manual_test_findings_money_cleanup.md`, the cycle B status line:
  - before: "Brief + Spec `426f1ec` + Plan `dd12bb7` committed on main (not pushed), execution NOT started … native execution proposed — the user had not yet confirmed"
  - after: "MERGED (`ba82f99`, pushed, pdash-api restarted) … follow-ups B-175..B-182 … items 3/5 still to be scheduled"
- `MEMORY.md`, the hook line:
  - before: "B POT cycle — Brief+Spec … execution not started"
  - after: "B POT cycle MERGED 2026-10-29 (`ba82f99`; follow-ups B-175..B-182, items 3/5 still open)"
