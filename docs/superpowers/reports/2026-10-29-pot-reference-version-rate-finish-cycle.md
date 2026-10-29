# Finish-cycle report — pot-reference-version-rate

**Date:** 2026-10-29
**Branch:** pot-reference-version-rate → main
**Execution started:** 2026-10-29 17:10  (pre-flight step 6)
**Merged at:** 2026-10-29 17:55  (Gate 4's merge commit)
**Gate durations:** Gate 1 6m · Gate 2 17m · Gate 3 21m · Gate 4 2m · Gate 5 (to report) 4m — total 50m
**Cycle counters:** subagent dispatches 3 · review rounds 3 · full test-suite runs 7
**Risk class:** high-risk (`docs/superpowers/plans/2026-10-29-pot-reference-version-and-version-rate.md`) · review effort high
**Claims pre-check:** at Gate 1, about 1 minute over the two added `TEST_CASES.md` rows (PP-49, PP-50), 0 defects; at the Gate 3 re-checks, about 1 minute over round 1's markdown fixes (P-82, PP-50's test range), 0 defects, and round 2's fixes touched no markdown; round 1 had 6 findings, none mechanical; round 2 had 1 mechanical finding (a false predicate in the frozen Spec, see Roadmap notes).
**Acceptance:** 13 items listed · 11 pre-ticked from automated runs (criteria 1, 2, 4, 7, 8, PP-50 by `scripts/run-tests.sh` → 671/671; criteria 3, 10 by `node --test src/lib/*.test.js` → 317/317; criterion 6 by `npm test` → 1810/1810; criterion 11 by all three) · 2 verified by hand on the branch stack with a positive outcome (criterion 9 / PP-49: POT Details of SIFI Group with USD deactivated; criterion 5: autosave on the USD version with USD deactivated kept 1.300000) · none left unverifiable.
<!-- Wall-clock, human wait time included (pre-flight step 6). Gate 3 includes the bounce at Gate 4
     (17:35): the merge question was answered "fix all the issues before continuing with merge", which
     reopened Gate 3 for two more fix rounds before the merge was confirmed at 17:54. -->

## What was done

11 commits:

- `844f311` feat(api): versionRate rule for the version exchange rate
- `c64b991` feat(api): reference-version and POT-version CTEs
- `df68b5b` fix(api): POT routes count each proposal once through its reference version (B-175, B-174, B-182)
- `5487086` fix(api): pipeline-years offers use the shared reference-version rule
- `9971aa1` fix(api): the version exchange rate is set only by the server (B-176)
- `edde6e1` fix(api-sync): autosave no longer sends the version rate (B-176)
- `66f5c70` fix(master-pipelines): format inactive currencies with their own locale (B-177)
- `76f0199` test(api): POT reference version and server-owned rate (POT-18..POT-26)
- `b922aa1` test: pin js/api-sync.js at ?v=29 in the proposal-modals guard
- `3a74860` fix: review round 1 — refresh-rate on versionRate, reference-version tie-breaker, clone hint, rate-path tests
- `d828b1c` fix: review round 2 — refresh-rate under the version lock, resilient direct-SQL test helper

## Gate outcomes

- Gate 1: first run red (`js/lib/proposal-modals-guard.test.js` pinned `js/api-sync.js?v=28`); pin fixed in `b922aa1`, re-run from the top: `npm test` 1810/1810, `scripts/run-tests.sh` 671/671.
- Gate 2: ordinary cycle; branch stack spun up, acceptance checklist 11 pre-ticked + 2 verified by hand, browser question answered yes, stack torn down.
- Gate 3: 3 rounds at high. Round 1 (background, on `b922aa1`): 6 Minor findings; first answered "all follow-up", then at Gate 4 the user asked to fix all of them before merging — fixed in `3a74860` (finding 1 not reproducible, pinned by POT-28). Round 2: 4 Minor + 1 mechanical (Spec, frozen → Roadmap notes), fixed under the same rule in `d828b1c` (finding 3 closed by measurement). Round 3: no findings. 0 findings went to `docs/BACKLOG.md` as pre-existing prose.
- Gate 4: merged with `--no-ff` (`bed463c`, main had not moved), pushed; DB backup `backups/pdash-backup-2026-10-29-175507.dump`; no migration; `pdash-api` restarted and healthy at 2026-10-29T16:55:39Z; worktree removed, branch deleted.
- Gate 5: sync-docs touched 7 files; `docs/BACKLOG.md` closed B-174, B-175, B-176, B-177, B-182.

## Code review follow-ups

None.

## Roadmap notes

- **Spec frozen, now partly false.** Spec §5 says `refresh-rate` keeps answering 404 for an inactive currency; at the user's request (fix every finding) it now answers `400 CURRENCY_RULE` through `versionRate`, under the version lock. The Plan's open decision 2 (no direct SQL from `test-api.js`) was also reversed: `test-api.js` has a `sql()` helper (the compose `test` service already carries `pg` and `DATABASE_URL`) used by POT-25b, POT-26b and POT-27. Neither frozen file was edited.
- **Plan defects found while executing** (each a ledgered ruling): Task 6 named only `nav-shell-guard` while `proposal-modals-guard` pins the same `?v=` (Gate 1 red); Task 8's new ND-05 setup broke ND-04's `currency === 'EUR'` (now `USD`); a body with only `currencyRate` gets the pre-existing `400 Nothing to update`, so POT-22 asserts the rate, not 200; POT-26 moves the live USD rate to tell "kept" from "recomputed".
- **Round-1 finding 1 was not a defect:** `versionScope` answers 404 for an unknown version before the `PATCH` handler runs; POT-28 pins it.
- **Round-2 finding 3 closed by measurement:** `SELECT … FROM cost_grid_versions WHERE currency = 'EUR' AND currency_rate IS DISTINCT FROM 1` → 0 rows on the main DB; no write path can create one now, so no backfill migration.
- **Clone in an inactive currency** is now refused (Spec decision 4 applies to `POST /versions`); the notice says how to clone again (`TEST_CASES.md` P-82).
- Spec criterion 3 (year of the reference version) stays proven by shape tests only, as the Plan's open decision 1 says.

## Sync-docs outcome

Scope pass: §1 ARCHITECTURE yes · §2 CLAUDE.md/docs yes · §3 TEST_CASES yes · §4 test-api no (no new endpoint) · §5 PRD yes · §5b yes · §6 PROCESS no · §7 Memory yes.

- `ARCHITECTURE.md` — version `POST`/`PATCH`/`refresh-rate` rows (server-owned rate, `CURRENCY_RULE`), `GET /api/pipeline-years` row, a one-line rule under "POT Targets", `/:id/details` row (reference version, Canceled excluded).
- `docs/api/lib.md` — `pot-fee-sql.js` rewritten for `referenceVersionsCte`/`potVersionsCte`; new `version-rate.js` section.
- `docs/pages/config.md` — B-177 and the reference-version counting on `master-pipelines.html`; test references updated.
- `docs/js/api-sync.md`, `docs/js/costgrid.md` — autosave without `currencyRate` and the `CURRENCY_RULE` notice; the clone hint.
- `TEST_CASES.md` — PP-24 no longer says "Canceled included".
- PRD: updated, `docs/prd/master-data.md` (§7.4 counting and Proposals list, §7.7 when an offer's rate changes and the inactive-currency refusals; the old "no refresh rate action" sentence was false and is gone).
- `.claude/skills/operational-manual/SKILL.md` — Currencies and POT bullets reconciled with `docs/prd/master-data.md` §7.4 and §7.7.
- `CLAUDE.md` — evaluated, unchanged (its `pipeline-years.js` entry is still accurate; `api/src/lib/` points to `docs/api/lib.md`).
- PROCESS.md gate: none of the three conditions.

## Memory outcome

- `project_manual_test_findings_money_cleanup.md`: added "Step (1) DONE: POT reference version + server-owned version rate MERGED 2026-10-29 (`bed463c`) … NEXT is step (2): `/domain-audit` on forms incl. item 5" above the NEXT line.
- `MEMORY.md`: "NEXT per handoff `1231875`: B-175+B-176 cycle, then /domain-audit on forms incl. item 5" → "B-175+B-176 cycle MERGED 2026-10-29 (`bed463c`, also B-174/B-177/B-182); NEXT: /domain-audit on forms incl. item 5".
