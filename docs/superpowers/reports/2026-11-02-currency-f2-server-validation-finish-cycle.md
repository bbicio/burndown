# Finish-cycle report — currency-f2-server-validation

**Date:** 2026-11-02
**Branch:** currency-f2-server-validation → main
**Execution started:** 2026-11-02 10:10  (pre-flight step 6)
**Merged at:** 2026-11-02 10:30  (Gate 4's merge commit)
**Gate durations:** Gate 1 6m · Gate 2 11m · Gate 3 3m · Gate 4 1m · Gate 5 (to report) 5m — total 26m
**Cycle counters:** subagent dispatches 17 · review rounds 1 · full test-suite runs 3
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-01-currency-f2-server-validation.md`) · review effort high
**Claims pre-check:** at Gate 1 it took about 2 minutes over the branch's markdown and caught 2 defects: a content line of `docs/js/lib.md` deleted by the final-review fix wave (an incomplete enumeration of the `dates.js` section), and stale closure/verification dates on the B-185/B-186/B-188/B-217 rows (2026-11-01 for work done 2026-11-02); fixed in `e974ab6` and `c410129`. No Gate 3 re-check ran, since no fix was applied there. None of round 1's 9 findings was in the four mechanical classes.
**Acceptance:** 8 criteria listed · 7 pre-ticked from automated runs (1, 2 — `scripts/run-tests.sh` 714/714 incl. MR-16..MR-19; 3 — `node --test src/lib/*.test.js` 337/337; 4 — `npm test` 1910/1910 incl. `config-form-calc.test.js`; 5 — the criterion's query on the branch DB clone `8|68` → `0|68` after 030, then on main `0` after Gate 4; 7 — the B-row commands re-run at Gate 1; 8 — `npm test`, `run-tests.sh` and backend `node --test` 380/380) · 1 verified by hand with a positive outcome (6 — Reforecast + Save on a project with actuals, console `PATCH …/phasing` with -1 → 400 `MONEY_RULE`) · none left unverifiable

## What was done

10 commits:
- `ad0b583` feat(currency-f2): column bound on amountError, PTC/phasing shape rules (B-188)
- `723d396` fix(currency-f2): structure PUT validates task PTC and the second body shape (B-185, B-186)
- `21a23d3` fix(currency-f2): project PTC and phasing PATCH validate amounts (B-185)
- `34f9cc3` fix(currency-f2): Derive and Reforecast round phasing to the currency decimals (B-217)
- `e063c61` feat(currency-f2): migration 030 rounds stored EUR phasing noise (B-217)
- `981e79c` docs(currency-f2): money-rules, config-form-calc, migration 030, close B-185/B-186/B-188/B-217
- `89b3eae` docs(currency-f2): fix review findings on money-rules bounds, B-185 command, config-form-calc note
- `0b02d47` fix(currency-f2): final review — amountError over-limit message in docs, whitespace
- `e974ab6` docs: finish-cycle claims pre-check — restore deleted dates.js line, closure dates
- `c410129` docs: verified dates on B-185/B-186/B-188 rows

## Gate outcomes

- Gate 1: passed — `npm test` 1910/1910, `scripts/run-tests.sh` 714/714 (api touched); claims pre-check fixed 2 defects.
- Gate 2: ordinary cycle; branch stack spun up, migration 030 applied to the branch DB by hand (`8|68` → `0|68`); acceptance checklist 7 pre-ticked + 1 manual verified; browser verification confirmed; stack torn down.
- Gate 3: round 1 at high (backgrounded from Gate 2, HEAD unchanged): 9 findings, 0 on frozen spec/plan files, 0 on pre-existing prose; all 9 accepted as follow-up by the user (3 of them needing no action: one already deferred, two spec decisions).
- Gate 4: merged `--no-ff` as `1b0f8c9` (main had not diverged), pushed; `pg_dump` backup `backups/pdash-backup-2026-11-02-103040.dump`; migration 030 applied on main (`UPDATE 1`, criterion 5 count `0`); pdash-api restarted and healthy at 2026-11-02T09:31:19Z; worktree removed, branch deleted.
- Gate 5: sync-docs touched `TEST_CASES.md` (+ its parse-test count), `docs/prd/project-config.md`, the operational-manual skill reference; `docs/BACKLOG.md` got 3 new rows and 3 updated.

## Code review follow-ups

- Round 1 — #1/#2/#6: stored data not matching the new rules (non-EUR phasing decimals, task PTC pushed by Generate project) can make a save fail; plus `MONEY_RULE` missing from `REASON_CODES` in `js/lib/project-push-result.js` (from the SDD final review) → B-222.
- Round 1 — #4: project PTC/phasing capped at `MAX_DECIMAL_10_2` though JSONB has no bound; large JPY plans refused → B-223.
- Round 1 — #7: currency read outside a lock in `PATCH /phasing` and `/ptc` → B-189 widened.
- Round 1 — #9: duplicate task walk and label/currency expressions in the structure `PUT` pre-check → B-224.
- Round 1 — #3 (non-numeric phasing aborts 030), #5 (`rateOverride: 0` stored as 0, the intended B-186 fix), #8 (`amountError` throws without `max`, spec decision 2): no action.
- SDD final review — nonexistent project id on `PATCH /phasing`/`/ptc` answers a 200 no-op → B-192 widened.

## Roadmap notes

- Subagent-driven execution: the final-review fix wave (on the cheapest model) deleted a real content line of `docs/js/lib.md` while "removing a double blank line"; caught only by Gate 1's claims pre-check. Mechanical whitespace fixes are not safe to delegate without a numstat check by the controller.
- The plan said rows close "2026-11-01"; the work ran on 2026-11-02 — a date written into a plan is a prediction, not a fact.
- Migration 030 was verified on a throwaway `postgres:16` container with sample rows during execution, because the disposable test DB has no projects.

## Sync-docs outcome

- Scope: ARCHITECTURE.md — no (no table, column, route or module added; §5/§6 unchanged). CLAUDE.md — no (the money bullet was already updated on the branch). TEST_CASES.md — yes: CG-109 (task PTC refused by the server) and PC-36 (server refuses PTC/phasing; Derive/Reforecast rounding) added, `js/lib/test-cases-parse.test.js` count 882 → 884. test-api.js — no (no new endpoint; MR-15..MR-19 already on the branch). PRD — yes: `docs/prd/project-config.md` (server refusal of PTC/phasing amounts; the Rounding row of Derive vs Reforecast now says every month rounds to the currency's decimals). 5b — yes: `.claude/skills/operational-manual/SKILL.md` money-fields bullet reconciled from `docs/prd/project-config.md`. PROCESS.md gate — none of the three conditions. Memory — yes (below).

## Memory outcome

- `project_manual_test_findings_money_cleanup.md`: "…accepted 4 as follow-up in docs/BACKLOG.md, none fixed. NEXT: f2 server validation (decide B-217 first) → f3 → f4." → adds "f2 MERGED 2026-11-02 (`1b0f8c9`, …, migration 030 applied, pdash-api restarted), report …; NEXT: f3 → f4".
- `MEMORY.md` index line: "f1 MERGED … NEXT: f2 server (decide B-217 first) → f3 … → f4 …" → "f1 MERGED …, f2 MERGED 2026-11-02 (`1b0f8c9`, server PTC/phasing validation + migration 030) NEXT: f3 … → f4 …".
