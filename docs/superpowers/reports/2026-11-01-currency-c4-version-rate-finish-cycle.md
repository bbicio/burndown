# Finish-cycle report — currency-c4-version-rate

**Date:** 2026-11-01
**Branch:** currency-c4-version-rate → main
**Execution started:** 2026-11-01 18:48  (pre-flight step 6)
**Merged at:** 2026-11-01 19:14  (Gate 4's merge commit)
**Gate durations:** Gate 1 3m · Gate 2 5m · Gate 3 18m · Gate 4 1m · Gate 5 (to report) 3m — total 30m
**Cycle counters:** subagent dispatches 4 · review rounds 4 · full test-suite runs 4
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-01-currency-c4-b183-version-rate-baselines.md`) · review effort high
**Claims pre-check:** at Gate 1 it took about 2 minutes and caught 3 defects: a B-183 row with an extra table cell and a placeholder instead of a SHA, and two false "only" predicates (the live rate is also read by `onCurrencyChange`, not only by `cgPreviewRateChange`). The Gate 3 re-checks covered the two `docs/BACKLOG.md` commit-list fixes, took about a minute each and found nothing. None of round 1's 4 findings fell in the four mechanical classes.
**Acceptance:** 7 items listed · pre-ticked from Gate 1's `npm test` at `ac5fc2f` (1874/1874): 1 (`js/lib/costgrid-version-rate.test.js`), 2 (same file, the `current_rate` guard), 3 (`js/lib/costgrid-currency-change.test.js`), 4 (`js/lib/proposal-modals-guard.test.js`), 7 (`npm test`) · verified by hand with a positive outcome: 5 (browser check on the branch stack, live USD rate changed to 1.50 against a version at 1.30), 6 (B-183 row closed) · none left as not verifiable here.

## What was done

8 commits:
- `46584d5` fix(costgrid): role baseline sync uses the version's rate (B-183); costgrid.js ?v=54
- `61c9f5f` fix(costgrid): role baseline, badge and currency change use the version's rate (B-183)
- `ac5fc2f` docs: claims pre-check fixes (B-183 row, live-rate readers)
- `6e55295` fix(costgrid): an in-place clone carries the server's version rate; resolveRoleRate comment (B-183 review); costgrid-calc.js ?v=13
- `c885db6` fix(pipeline): the refresh-rate confirmation says role rates are recalculated at the new rate (B-183 review)
- `cfadd40` docs: B-183 row cites the review-fix commits
- `cd3443a` fix(pipeline): refresh-rate confirmation — amounts stay, the EUR equivalent and reset-to rates move (B-183 review round 3)
- `5315a6d` docs: B-183 row cites the round-3 fix commit

## Gate outcomes

- Gate 1: passed (frontend; no `api/` path, `scripts/run-tests.sh` not needed), after the claims pre-check's `docs:` commit.
- Gate 2: ordinary path; branch stack spun up and torn down after the user's "yes"; acceptance checklist complete (5 pre-ticked, 2 verified by hand).
- Gate 3: 4 rounds at high. Round 1: 4 findings, 2 fixed (in-place clone without `currencyRate`, stale `resolveRoleRate` comment), 2 to follow-up. Round 2: 2 findings, both fixed. Round 3: 1 finding (the round-2 dialog text was false), fixed; the user chose (a) another round at the cap. Round 4: 2 Low findings, both to follow-up. Disposition-by-target rules took 0 findings. A full `npm test` before the merge: 1876/1876.
- Gate 4: merged as `2704c47` (`--no-ff`, main had not moved), pushed; no backup, migration or API restart (no `api/` path); worktree removed, branch deleted.
- Gate 5: `/sync-docs` touched 6 repo files (see below) plus the project memory; 3 BACKLOG rows added.

## Code review follow-ups

- Round 1: `onCurrencyChange` takes the rate from the currencies loaded with the page, not from the server's `PATCH` response — `costgrid.html` lines 1859, 1932 → B-213.
- Round 1: the B-183 closing note cites line numbers that go stale — `docs/BACKLOG.md` row B-183 → B-214.
- Round 4: the refresh-rate text claims the "reset to" rates change, false for override-priced roles; label wording differs — `pipeline.html` line 975 → B-215.

## Roadmap notes

- **Spec decision 2 does not hold for saved versions** (Spec frozen, so not edited): the structure save snapshots `rate_override` for every role with hours and `cgLoadStructureFromApi` reloads them all as Custom, so the non-forced sync on open does not realign their rates. B-183 changes their reset value, the role selector's badge and roles added afterwards. Recorded in `docs/pages/costgrid.md`.
- Round 4 finding 1 ("Budget amounts remain" is false for a version with `task_roles` lacking `rate_override`) was accepted without a row: a read-only query on the main DB found no such row (`rate_override IS NULL`: 0 of 17 USD, 0 of 69 EUR).
- Two plan defects, both ruled during execution: the comment the Plan prescribed above `cgPreviewRateChange` contained the literal `current_rate` its own guard test forbids (reworded to "live rate"), and the Plan's Files lists missed the version pin in `js/lib/proposal-modals-guard.test.js`.
- Plan execution (`superpowers:executing-plans`) stopped before its own whole-branch final review at the user's request (model switch); Gate 3's rounds served as that review.

## Sync-docs outcome

Scope pass: 1 ARCHITECTURE.md no (no module, endpoint, schema or pattern changed) · 2 CLAUDE.md no (no file added; narrative routed to `docs/`) · 3 TEST_CASES.md yes · 4 test-api.js no · 5 PRD yes · 5b operational-manual yes · 6 PROCESS.md no · 7 memory yes.
- `TEST_CASES.md`: added P-83 (refresh-rate confirmation text) and CG-107 (baselines use the version's rate, including an in-place clone); `js/lib/test-cases-parse.test.js` count 877 → 879.
- `docs/prd/pipeline.md` §4: the fallback chain's last step is now "EUR rate × the version's own exchange rate", which used to read "currency exchange factor" without saying which rate.
- `.claude/skills/operational-manual/SKILL.md`: the offer-editor bullet's fallback chain reconciled from `docs/prd/pipeline.md`.
- `docs/js/costgrid.md`: `cgCloneGrid` seeds `currencyRate` from the version `POST`.
- `docs/pages/pipeline.md`: new section on the refresh-rate confirmation text.
- `docs/pages/costgrid.md`: a saved version reloads its roles as Custom.
- PROCESS.md gate: none of the three conditions.

## Memory outcome

- `project_manual_test_findings_money_cleanup.md`: "NEXT among the currency cycles: c4 (B-183)." → "c4 (B-183) MERGED 2026-11-01 (`2704c47`) … NEXT: cold review of c1-c4, then the open findings by theme", plus the saved-roles-reload-as-Custom lesson.
- `MEMORY.md`: "c4 (B-183) SPEC `eef6aed` + PLAN `cb25c42` committed … NEXT: execute c4 → cold review c1-c4" → "c4 (B-183) MERGED 2026-11-01 (`2704c47`), NEXT: cold review c1-c4".
