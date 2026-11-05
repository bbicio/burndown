# Finish-cycle report — reforecast-net-remaining

**Date:** 2026-11-05
**Branch:** reforecast-net-remaining → main
**Execution started:** 2026-11-05 10:16  (pre-flight step 6)
**Merged at:** 2026-11-05 15:02  (Gate 4's merge commit)
**Gate durations:** Gate 1 3m · Gate 2 155m · Gate 3 100m · Gate 4 28m · Gate 5 (to report) 3m — total 289m
**Cycle counters:** subagent dispatches 5 · review rounds 3 · full test-suite runs 2
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-05-reforecast-net-remaining.md`) · review effort high
**Claims pre-check:** Gate 1 took about a minute over the one changed `*.md` line (PC-46) and caught nothing. The Gate 3 re-checks took a few minutes and caught 1 defect, a false predicate in my own manual fix in round 3 ("stay empty" with current-month actuals); round 1's PC-46 fix had none. Of round 1's 10 findings, 1 was mechanical (#2, PC-46's "87.25 h" against the message's one-decimal display).
**Acceptance:** 10 criteria + PC-46 listed.
- **Pre-ticked from automated runs.** Seven criteria: 1, 2, 3, 5, 7 and 8 by `npm test` → 2380/2380 and `npx vitest run js/lib/config-form-calc.test.js` → 42/42, and 10 by `grep -rn "config-form-calc.js?v=" --include=*.html .` → one line, `?v=7`.
- **Verified by hand, positive, on the branch stack.** Criterion 4 (SIFI 26 AKANTIOR overrun), 6 (message against the grid), 9 (BERMITS) and PC-46.
- **Not verifiable here:** none.
<!-- Wall-clock, human wait time included. Gate 2 includes the wait for another session's branch stack to free the ports and a usage-limit pause; Gate 3 includes a second usage-limit pause that killed one round-3 run. Full test-suite runs: npm test in plan execution (fix pass) and at Gate 1; Gate 5's run comes after this report. -->

## What was done

7 commits:
- `68a68ad` test(reforecast): characterization of the no-overrun case
- `aadaa78` fix(reforecast): true actuals in the past, project net remaining in open months
- `11acc90` feat(project-config): Reforecast message shows the net remaining and project overrun
- `b7bcc4d` fix(reforecast): net correction rows per month; Remaining hours is the net remaining
- `db17d4b` fix(reforecast): carry negative month nets onto earlier months; no-open-month message
- `52e986d` fix(reforecast): compare overruns at currency decimals and 0.01 h
- `2fb1ea1` docs(manual): Reforecast writes true actuals and distributes the net remaining

## Gate outcomes

- **Gate 1:** passed (frontend `npm test` 2380/2380). Nothing under `api/` changed, so `run-tests.sh` was skipped.
- **Gate 2:** ordinary path.
  - The first `test-branch.sh up` failed because another session's branch stack held ports 5433/3001/8081/8082. It succeeded on retry once that stack was freed.
  - Acceptance: 7 items pre-ticked and 4 verified by hand, positive.
  - Browser question answered yes, then the branch stack was torn down.
  - The background `/code-review` (high) was launched at the start of Gate 2.
- **Gate 3:** 3 rounds at high, all on the whole branch. No finding hit a spec or plan file or pre-existing prose.
  - **Round 1:** 10 findings, 4 fixed (#1, #2, #3, #6), 6 to follow-up.
  - **Round 2:** 6 findings, 1 fixed (R2-3), 5 to follow-up.
  - **Round 3:** the first run was killed by a usage limit and re-run. 3 new findings, 1 fixed (R3-1), 2 to follow-up.
  - Past the cap, the user chose (b): accept the rest as follow-up.
- **Gate 4:** merged with `--no-ff` as a merge commit `8990c7d` (main had moved 15 commits) and pushed. No `api/` change, so no backup, migration or restart. Worktree removed and branch deleted.
- **Gate 5:** sync-docs touched 4 files; 14 rows written to `docs/BACKLOG.md`. This report.

## Code review follow-ups

- Round 1 #4: even spread over all open project months when every open task is out of margin (`js/lib/config-form-calc.js` line 172) → B-313
- Round 1 #5: open-month actuals re-rounded to 0.25 h (`js/lib/config-form-calc.js` line 187) → B-314
- Round 1 #7: duplicate normalised task names share consumed/rate (`js/lib/config-form-calc.js` line 152) → B-315
- Round 1 #8: `findRate` normalisation differs from Reforecast's (`js/core.js` line 173) → B-316
- Round 1 #9: out-of-period actuals lower the remainder with no message line (`js/lib/config-form-calc.js` line 116) → B-317
- Round 1 #10: `distError` always null, `pastMonths` unread (`project-config.html` line 1462) → B-318
- Round 2 R2-1: negative carry moves hours and money separately (`js/lib/config-form-calc.js` line 122) → B-319
- Round 2 R2-2: unabsorbed negative net dropped or inflates the remainder (`js/lib/config-form-calc.js` line 142) → B-320
- Round 2 R2-4: past-month hours unrounded (`js/lib/config-form-calc.js` line 117) → B-321
- Round 2 R2-5: PC-46 depends on the run month and live data (`TEST_CASES.md`) → B-322
- Round 2 R2-6: distribution count in the message can be wrong (`project-config.html` line 1467) → B-323
- Round 3 R3-2: money and hours shared by different keys in open months (`js/lib/config-form-calc.js` line 176) → B-324
- Round 3 R3-3: per-month rounding loses the cent (`js/lib/config-form-calc.js` line 179) → B-325
- Final review M-4 (plan execution, deferred minor): empty-role resource not in the role map (`js/lib/config-form-calc.js` line 99) → B-326

## Roadmap notes

- **Spec conflict.** Spec §3 (message lines) and acceptance criterion 6 (message equals the grid) cannot both hold once the current month has actuals. Plan execution ruled that both message lines show the net remaining. The spec is frozen and was not edited.
- **Rulings taken during plan execution:**
  - the date chosen for the `Empty/x` fixture row;
  - "ignores rows without a date" kept as a guard even though it was green before the rewrite;
  - `js/lib/test-cases-parse.test.js` count pin raised 941 → 942, a file outside the plan's lists;
  - PC-46 figures written in the plan's format.
- **Outside the plan's declared file lists:** `js/lib/test-cases-parse.test.js` and `docs/OPERATIONAL_MANUAL.html` (fix R3-1).
- **Negative timesheet corrections** (B-319, B-320, and with them B-324) are a design topic for their own cycle. Whether D365 exports such rows is unverified.
- **Pre-existing table defect in `docs/BACKLOG.md`:** rows B-302, B-305, B-307, B-308, B-309, B-310, B-311 and B-312, from the master-pipelines-form-drawer cycle, have 5 cells instead of 6 (no `State` cell). Not changed here.

## Sync-docs outcome

Scope pass:
1. ARCHITECTURE.md: no (no module, API or schema change; its Reforecast mention is still true).
2. CLAUDE.md: no edit; narrative routed to `docs/js/lib.md` and `docs/pages/project-config.md`.
3. TEST_CASES.md: no (PC-46 added on the branch; PC-36 and REG-15 still accurate).
4. test-api.js: no.
5. PRD: yes.
- 5b. Operational-manual reference: yes.
6. PROCESS.md: no.
7. Memory: yes.

Updated:
- `docs/prd/project-config.md` (§7.1). The Reforecast rows Data source, What it touches, Past months, Future months and Confirmation are rewritten. The "Blocking error case" paragraph is replaced by "No blocking error".
- `docs/js/lib.md`: new paragraph on `reforecastDistribution`'s algorithm and return fields.
- `docs/pages/project-config.md`: new section "Reforecast net remaining (2026-11-05)".
- `.claude/skills/operational-manual/SKILL.md`: the "Derive vs. Reforecast" reference bullet, triggered by `docs/prd/project-config.md`.
- `docs/OPERATIONAL_MANUAL.html` was already fixed on the branch.

PRD: updated, `docs/prd/project-config.md`. PROCESS.md gate: none of the three conditions applied.

## Memory outcome

Memory: new `project_branch_stack_fixed_ports.md`. `scripts/test-branch.sh` binds fixed ports, so only one branch stack can run at a time across sessions, and another session's stack is never torn down. Its line was added to `MEMORY.md`. Checked with no change: `project_manual_test_findings_money_cleanup.md`, `project_next_cycle_ui_defects_consistency.md`, `project_ui_redesign_cycles.md` (their Reforecast mentions are incidental).
