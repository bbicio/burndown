# Finish-cycle report — currency-c3-ratecard

**Date:** 2026-10-30
**Branch:** currency-c3-ratecard → main
**Execution started:** 2026-10-30 12:40  (pre-flight step 6)
**Merged at:** 2026-10-30 15:11  (Gate 4's merge commit)
**Gate durations:** Gate 1 5m · Gate 2 95m · Gate 3 50m · Gate 4 2m · Gate 5 (to report) 4m — total 156m
**Cycle counters:** subagent dispatches 5 · review rounds 3 · full test-suite runs 13 (`npm test` 10, backend `node --test` 3; plus 7 runs of `scripts/run-tests.sh`)
**Risk class:** high-risk (`docs/superpowers/plans/2026-10-30-currency-c3-ratecard.md`) · review effort high
**Claims pre-check:** at Gate 1 it took about a minute and caught 3 defects in the branch's `*.md`: two false predicates (B-207 said `POST /api/ratecards/clone` can create a client-less rate card, but it requires `clientId`; `docs/pages/config.md` said a role with every field blank always loses its entry, which the hidden-override fix had made false) and one malformed row (B-207 had 4 of the table's 6 cells). At the Gate 3 re-checks (about a minute each, after rounds 1 and 2) it found nothing. Of round 1's 10 findings none was mechanical; round 2 had 1 of 7 (a false predicate in `docs/api/lib.md`), round 3 none of 5.
**Acceptance:** 6 criteria listed · 4 pre-ticked from automated runs (1 `npm test` 1862/1862 with `money-guard.test.js`; 2 `scripts/run-tests.sh` 700/700 RC-07 + `npm test` `cgRatecardMaps`; 3 `scripts/run-tests.sh` RC-10; 6 `npm test`, `scripts/run-tests.sh`, backend `node --test` 374/374 in the branch api container) · 2 verified by hand with a positive outcome (4 dead editor deleted, 5 column-currency format) · none left unverifiable. No `TEST_CASES.md` case was in the branch diff.
<!-- Wall-clock, human wait time included (pre-flight step 6). Gate 2 includes the wait for a usage
     limit to reset. Gate 5 is measured up to this report. -->

## What was done

8 commits:

- `cd1bb81` feat(ratecards): nullable EUR rate, entries PATCH replaces the set in a transaction
- `19cf270` refactor(costgrid): read the ratecard through the pure cgRatecardMaps
- `fa5a4d3` fix(master-clients): rate card fields under money.js, empty EUR means agency default
- `2c93514` chore(ratecards): delete the uncalled editor; money guard covers master-clients and ratecards.js
- `be88b89` fix(master-clients): saving the rate card keeps overrides in currencies with no column
- `96fd2fb` docs: B-207 row gets its six cells and a true clone predicate; rate card note covers kept hidden overrides
- `8d63f80` fix(ratecards): rate card modal writes only to its own state; entries PATCH 400/404 and locks the card; costgrid.js ?v=53; master-clients.html back to LF
- `04a526c` fix(ratecards): rate card rows from a fresh role list; an EUR key is not a currency override; lib.md entries predicate

## Gate outcomes

- Gate 1: passed — claims pre-check fixed 3 defects (`96fd2fb`); `npm test` 1862/1862; `scripts/run-tests.sh` 700/700.
- Gate 2: ordinary path; branch stack reused; acceptance checklist 4 pre-ticked + 2 verified by hand; browser question answered yes; branch stack torn down.
- Gate 3: 3 rounds at high. Round 1: 10 findings, 1-4 fixed (`8d63f80`), 5-10 to follow-up; the user's rule: correctness/data loss fixed, cleanup to follow-up. Round 2: 7 findings, 2-4 fixed under the rule (`04a526c`), 1 to follow-up by the user's decision (no backfill), 5-7 to follow-up under the rule. Round 3: 5 findings, all accepted as follow-up at the three-round cap (option b). Disposition by target: 0 findings on frozen Spec/Plan, 0 on pre-existing prose.
- Gate 4: merged `3e37f54` (`--no-ff`, main had not diverged), pushed; backup `backups/pdash-backup-2026-10-30-151104.dump` (120K); migration `029` applied on the main DB; pdash-api restarted and healthy at 2026-10-30T14:11:38Z; worktree removed, branch deleted.
- Gate 5: `/sync-docs` touched `ARCHITECTURE.md`, `TEST_CASES.md`, `docs/prd/master-data.md`, `js/lib/test-cases-parse.test.js`; 5 BACKLOG rows added.

## Code review follow-ups

- Round 1 #5 / round 2: `POST /api/ratecards/clone` copies `hourly_rate` (now possibly NULL) without `rate_overrides` — already B-207.
- Round 1 #7, #8 and round 3 #5: test hygiene — the RC skip branch hides RC-07..RC-13 when role creation fails; `ensureTestCurrencies()` is called a second time in `testRatecards`; `js/lib/master-clients-ratecard-guard.test.js` checks only the literal `this.rc.` and runs vacuously with no `await`. → B-211
- Round 1 #9, round 2 #5, #6 and round 3 #4: rate card modal polish — `onRcFocus` repeats `amountText`'s stored-0 rule (B-205 class); a stored override with more decimals than its currency is rounded on re-save (B-204 class); the 3-second success timer can clear a later save's message; the page-load `Api.roles.list()` in `loadAll` and `this.roles` no longer feed the modal. → B-210
- Round 1 #10, round 2 #7, execution review minor M3: API cleanup — one INSERT per entry instead of `unnest`; a fourth copy of `UUID_RE`; duplicate `roleId`s in the body are accepted, last wins. → B-212
- Round 2 #1 (user decision: follow-up, no backfill): rate cards saved before this cycle stored EUR 0 for override-only roles. → B-208
- Round 3 #1-#3: the full-replacement `PATCH` has no stale-copy detection (two admins), destroys data when sent by a cached old `master-clients.html`, and refuses the whole save when a role was deleted while the modal was open. → B-209

## Roadmap notes

- Spec §8 (frozen) says `POST /api/ratecards/clone` "can still create a rate card without a client"; the route requires `clientId` and copies the client-less card instead. The BACKLOG row (B-207) states the true predicate; the Spec is left as written.
- Spec §2 (frozen) says no consumer changes with nullable `hourly_rate`; it is silent on rows stored as 0 by the old save (B-208). The read-only count on the main DB at Gate 5 was 0.
- Execution: the SDD scripts (`task-start`/`task-done`) do not run on this host and `.superpowers/` is not gitignored, so the ledger lived in the session scratchpad. The execution-phase final review was a general-purpose agent, not `/code-review` at high, so Gate 3's skip and scoped paths could not apply in high-risk.
- The first background `/code-review` died on a usage limit with no readable output; it was treated as not reviewed and relaunched.
- Finding 2 of round 1 (the whole of `master-clients.html` committed with CRLF) came from the hidden-override fix (`be88b89`) re-writing the file through a CRLF working copy.
- Execution-review minors M1 (null role rate shown as € 0,00), M2 (malformed ids → 500) and M4 (concurrent PATCH) were closed by the round 1 and round 2 fixes.

## Sync-docs outcome

Scope pass on `git diff --stat 3e37f54^1 3e37f54` (24 files):
- §1 ARCHITECTURE.md — yes: `ratecard_entries.hourly_rate` no longer `NOT NULL` in the schema, the entries `PATCH` row rewritten (full replacement, 400/404), the cost-grid ratecard map now read through `cgRatecardMaps()`. The migrations list there is documented as lagging behind `docs/db/migrations.md` and was left as is.
- §2 CLAUDE.md — no: `js/ratecards.js` still exists and its one-line entry stays true.
- §3 TEST_CASES.md — yes: CF-10/CF-11 rewritten (agency default from the role, no client-less card), MD-11 and MD-12 added; the case count pinned in `js/lib/test-cases-parse.test.js` raised 875 → 877.
- §4 test-api.js — no: RC-06..RC-13 were added on the branch.
- §5 PRD — updated: `docs/prd/master-data.md` §7.2 (agency default from the role, text fields in the column's currency, blank EUR = agency default, clearing a role removes its custom rates).
- §5b operational-manual reference — evaluated, no change: its Clients bullet makes no claim about a global rate card and already says blank = use default.
- §6 PROCESS.md — gate answered no to all three conditions.
- §7 Memory — see below.

## Memory outcome

- `project_manual_test_findings_money_cleanup.md`: "NEXT among the currency cycles: c3 client rate card, then c4 (B-183)." → "c3 MERGED 2026-10-30 (`3e37f54`, … migration 029 …), report … NEXT among the currency cycles: c4 (B-183)."
- `MEMORY.md`: "…; NEXT: c3 client rate card, then c4" → "…; c3 MERGED 2026-10-30 (`3e37f54`, client rate card, migration 029); NEXT: c4 (B-183)".
