# Finish-cycle report — currency-f1-client-money-fields

**Date:** 2026-11-01
**Branch:** currency-f1-client-money-fields → main
**Execution started:** 2026-11-01 21:05  (pre-flight step 6)
**Merged at:** 2026-11-01 21:24  (Gate 4's merge commit)
**Gate durations:** Gate 1 2m · Gate 2 14m · Gate 3 2m · Gate 4 2m · Gate 5 (to report) 6m — total 26m
**Cycle counters:** subagent dispatches 18 · review rounds 1 · full test-suite runs 4
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-01-currency-f1-client-money-fields.md`) · review effort high
**Claims pre-check:** at Gate 1 it took about 2 minutes over the four changed `*.md` files and caught 1 false predicate (`CLAUDE.md` said every field reopening a stored amount passes `{ stored }`, but `costgrid.html` writes on input and passes none; fixed in `3ca9de7`); Gate 3 fixed nothing, so no re-check ran; none of round 1's 9 findings was in the four mechanical classes.
**Acceptance:** 8 items listed · 6 pre-ticked from `npm test` green at `3ca9de7` (1 round-trip, 2 refusals, 3 untouched value, 4 zero rule, 5 PTC and phasing — `js/lib/money.test.js`, the `master-*`, `costgrid-*` and `project-config-*` guards — and 8 suite) · 2 verified by hand with a positive outcome (6 browser check on the branch stack; 7 backlog rows, after the user first read `main`'s copy and then the branch's) · none left unverifiable

## What was done

13 commits:

- `fd4c5f2` fix(money): strict readMoneyInput, stored value kept, keepZero (B-196, B-197)
- `6d779da` fix(money): round stored with Intl, not toFixed, in readMoneyInput
- `24cedb9` fix(master): stored 0 and untouched amounts via money.js, rate card message timer (B-204, B-205, B-210)
- `eefe987` test(master): master-data guard follows the removed clients roles load
- `733dccb` test(master): master-data guard expects the clients-only load
- `24470bb` test(master): restore regex escapes in the zero-rule guards
- `471b2d5` fix(project-config): PTC and phasing read via readMoneyInput, stored amounts kept (B-204, B-216)
- `093d7bc` fix(costgrid): task PTC read via readMoneyInput, rate stored-0 via keepZero (B-205, B-216)
- `ba27214` chore(money): bump money.js and costgrid-calc.js versions, docs, close B-196, B-197, B-204, B-205, B-216
- `db02377` docs(backlog): close B-210
- `4e86a67` docs: refresh B-200, tighten B-210 probe range, drop stale versions in costgrid.md
- `e493e90` fix(currency-f1): final-review fixes — live backlog greps, rf.stored initial, lib.md wording
- `3ca9de7` docs: CLAUDE.md stored rule names the fields that write on blur or Save

## Gate outcomes

- Gate 1: claims pre-check fixed 1 false predicate; `npm test` passed (84 files, 1908 tests); no `api/` path, so `scripts/run-tests.sh` did not run.
- Gate 2: ordinary cycle; branch stack spun up, acceptance checklist 6 pre-ticked + 2 by hand (item 7 first answered "fix now", resolved when the user re-read the branch's `docs/BACKLOG.md`), browser question answered yes, stack torn down.
- Gate 3: round 1 was the background `/code-review` at high launched at Gate 2 (the first launch died on the Opus session limit and was relaunched on Sonnet at the same effort); 9 findings, 0 to frozen files, 0 to pre-existing prose; the user chose "as recommended": 4 accepted as follow-up, 4 rejected (2 false on a probe, 5 and half of 4 by Spec, 6 unreachable), 1 already B-200; no fix, no round 2.
- Gate 4: merged with `--no-ff` as `96b67eb` (main had not diverged; the push also carried the four unpushed spec/plan/handoff commits), no migration, no `api/` change so no backup and no restart, worktree removed, branch deleted.
- Gate 5: sync-docs touched 10 files; 4 follow-up rows B-218..B-221 added. The first docs-only test run was red: the new cost-grid case reused id CG-106, so it was renumbered CG-108 and the run passed. The red run voided Gate 4's pre-authorisation, so the commit was asked for.

## Code review follow-ups

- Round 1: `costgrid.html` `onPtcBlur`/`onRateBlur` restore the focus-time value when the final text is invalid, losing a valid value autosaved earlier in the same focus (B-218).
- Round 1: `js/lib/money.js` `readMoneyInput` rebuilds `Intl` formatters and regexes on every keystroke (B-219).
- Round 1: `project-config.html` phasing/PTC inputs are `:readonly` for viewers, so blur handlers still run (B-220).
- Round 1: `js/lib/money.js` `secondaryGroupSize` falls back to 3 with no test for that path (B-221).

## Roadmap notes

- Execution rulings (subagent-driven ledger):
  - `stored` is rounded with Intl, not the Plan's `toFixed` formula (Spec §4 governs).
  - All 12 `money.js` pages were bumped, not the Plan's "11".
  - The page pins live in per-page guards, not `money-guard.test.js`.
  - B-210 was closed with a probe scoped to `loadAll`.
  - B-200 stays open.
- Two plan imprecisions surfaced:
  - Task 5's B-210 probe (`grep "Api.roles.list()"`) also hits the deliberate per-open read in `openClientRatecard`.
  - The Plan has no "File Structure" section, so Gate 4's out-of-scope check had nothing to compare against. Three files sat outside the per-task lists, each justified in the ledger: `js/lib/master-data-guard.test.js`, `js/lib/proposal-modals-guard.test.js`, `docs/pages/costgrid.md`.
- An implementer ran a stale script from the shared `%TEMP%` that rewrote `js/lib/dates.js`. It was reverted before any commit, and later dispatches forbade it.
- Gate 3's rejected findings are recorded here, not in the backlog:
  - 2: false, CHF has symbol = code and `CHF 5` reads 5.
  - 4: the deliberate edit back to the rounded value is Spec decision 1.
  - 5: spaces refused, Spec §2.
  - 6: `project` is replaced only at page load.

## Sync-docs outcome

Scope pass:
- 1 `ARCHITECTURE.md`: no — no module, endpoint or schema change.
- 2 `CLAUDE.md`: no — updated on the branch.
- 3 `TEST_CASES.md`: yes — new user-visible refusals.
- 4 `test-api.js`: no — no endpoint.
- 5 PRD: yes.
- 5b operational-manual reference: yes, because the PRD changed.
- 6 `PROCESS.md`: no — none of the three conditions.
- 7 memory: yes.

Files updated:
- `TEST_CASES.md`: PC-35 (project-config PTC/phasing refusal), CG-108 (cost-grid task PTC revert), RL-08 (INR Indian grouping). `js/lib/test-cases-parse.test.js` count 879 → 882.
- PRD:
  - `docs/prd/project-config.md`: PTC/phasing refusal and Save block.
  - `docs/prd/pipeline.md`: task PTC refusal and revert.
  - `docs/prd/master-data.md`: the number-format paragraph no longer says PTC/phasing guess the other convention or that INR grouping is refused; it states the end-only symbol rule and the space rule.
- `.claude/skills/operational-manual/SKILL.md`: §7 money fields and the offer-editor saving bullet, reconciled from `docs/prd/project-config.md` and `docs/prd/pipeline.md`.
- `docs/pages/costgrid.md` and `docs/pages/project-config.md`: the PTC/phasing implementation narrative.

## Memory outcome

- `project_manual_test_findings_money_cleanup.md`:
  - Before: "NEXT: execute f1 (handoff section …)".
  - After: "f1 MERGED 2026-11-01 (`96b67eb`) … NEXT: f2 server validation (decide B-217 first) → f3 → f4".
- `MEMORY.md` hook:
  - Before: "f1 spec … NEXT: execute f1, then f2 server".
  - After: "f1 MERGED 2026-11-01 (`96b67eb`, client money fields) NEXT: f2 server (decide B-217 first)".
- `project_sdd_scripts_windows_host.md`: added the stale-`%TEMP%`-script incident and the dispatch rule that stopped it.
