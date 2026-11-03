# Finish-cycle report — breakdown-v2

**Date:** 2026-11-03
**Branch:** breakdown-v2 → main
**Execution started:** 2026-11-03 15:54  (pre-flight step 6)
**Merged at:** 2026-11-03 17:06  (Gate 4's merge commit)
**Gate durations:** Gate 1 3m · Gate 2 20m · Gate 3 33m · Gate 4 16m · Gate 5 (to report) 5m — total 77m
**Cycle counters:** subagent dispatches unknown · review rounds 3 · full test-suite runs unknown
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-03-breakdown-v2.md`) · review effort high
**Claims pre-check:** Gate 1 cost about 2 minutes and caught one false predicate in `docs/pages/portfolio.md` ("the Bootstrap dropdown is gone", while the page still has several), fixed in `4bfef19`. The Gate 3 re-checks cost about 2 minutes over the round 2 doc fixes and caught one overstated claim (a sheet "as tall as its content" ignored its `max-height`); round 1 touched no markdown and round 3 none either. None of round 1's ten findings fell in the four mechanical classes.
**Acceptance:** 11 criteria from the Spec plus R-54 and R-69…R-78 from `TEST_CASES.md`, listed as 2 pre-ticked and 13 manual items · pre-ticked: criterion 2 "Blocco unico" (`npm test` green at `4bfef19`, `js/lib/portfolio-guard.test.js`) and criterion 9 "Calcoli invariati" (`npm test`, `js/lib/project-report-calc.test.js` "Breakdown totals agree across views (B-073)") · verified by hand with a positive outcome: all 13 manual items (A1–A13) · not verifiable here: none.
<!-- Wall-clock, human wait time included (pre-flight step 6). Write `unknown` for a gate whose
     timestamp was not captured; a gate that self-skipped gets `0m (skipped)`. Gate 5 is measured
     up to this report; Gate 5 up to its commit is read from `node scripts/cycle-times.mjs`,
     column `merge→docs`.
     The claims pre-check line is Gate 1 step 0's own measurement (PROCESS.md §6.4d). It is prose,
     not slots: a cycle where part of it did not happen says so instead of writing a zero. Keep
     the Gate 1 and Gate 3 figures distinct.
     Cycle counters, from the start of plan execution to Gate 5: subagent dispatches = calls to the
     Agent tool; review rounds = Gate 3 rounds; full test-suite runs = complete runs of `npm test`
     or of the backend suite (`node --test` over `api/`), targeted single-file runs excluded. A
     counter the session did not observe in full is `unknown`.
     Risk class: the values Gate 2's identification step recorded.
     Acceptance: the outcome of Gate 2's Acceptance checklist. -->

## What was done

14 commits:

- `01d584c` feat(report): pure Entries block logic (months, filter, sort)
- `78893cf` feat(report): per-task columns inside a functional area
- `2297508` feat(portfolio): Period menu closes on outside click and Esc
- `cd1034a` feat(portfolio): shared Entries block with role filter and sorting (By task)
- `fcb1fd6` feat(portfolio): expandable By role rows and two-level By area
- `4787460` feat(portfolio): Breakdown v2 tablet and smartphone layouts
- `3172ddf` test(portfolio): dates guard counts the smartphone Period sheet pickers
- `18c8375` docs(portfolio): Breakdown v2 page notes and test cases
- `dc9f2f4` fix(portfolio): Entries header rule and bold filter value (boards 7.4e/7.4h); record the 1024px Remaining deviation
- `91b1c4b` fix(portfolio): aligned Entries columns across open months and full-height bottom sheets (boards 7.4f/7.4i); record accepted deviations
- `4bfef19` docs(portfolio): the Period menu, not every dropdown, left Bootstrap
- `cc42018` fix(portfolio): review round 1 — case-insensitive task lookup for logged-only By role pairs, one month open when the saved month is outside the Period, row hover only on the expand button, stale pickPeriod comment
- `117d384` fix(portfolio): review round 2 — prune Entries filters on a data reload, close a filter menu whose block collapses; page notes without justifications
- `f51b1c3` fix(portfolio): review round 3 — filter options and matching ignore case like the role sub-rows; close a filter menu under a collapsed area, on a view change and on a project switch

## Gate outcomes

- Gate 1: passed (frontend `npm test`, 88 files / 2145 tests); no `api/` path, `scripts/run-tests.sh` not run; claims pre-check fixed one false predicate (`4bfef19`).
- Gate 2: ordinary cycle; branch stack reused; acceptance checklist all positive (2 pre-ticked, 13 verified by hand); browser question answered yes; branch stack torn down. Code review launched in the background at the gate's opening.
- Gate 3: 3 rounds at high (10 → 5 → 6 findings). 8 fixed (round 1: 4, round 2: 2 plus the doc prose, round 3: 2), 1 judged unreachable (round 3 #3, area state keyed by index), the rest to follow-up; disposition rules: 0 findings on Spec/Plan, 0 on pre-existing prose. After round 3 the user chose option (b), accept everything remaining.
- Gate 4: merged with `--no-ff` (`0ff1611`, main had not diverged), pushed; no migration, no `api/` change so no DB backup and no `pdash-api` restart; worktree `.claude/worktrees/breakdown-v2` removed, branch deleted.
- Gate 5: sync-docs touched 6 files (see below); 12 BACKLOG rows added (B-251…B-262).

## Code review follow-ups

- Round 1 #2 — block key parsed by splitting on `:`/`|`; a role with `|` reads the wrong task (`portfolio.html` lines 1557-1585) → B-251
- Round 1 #4 — `areaTaskColumns` computed for collapsed areas (`portfolio.html` line 1347) → B-252
- Round 1 #5 — `blockEntries` returns a new array each render (`portfolio.html` line 653) → B-253
- Round 1 #7 — filter empty↔non-empty month reset written three times (`portfolio.html` lines 896, 1600, 1707) → B-254
- Round 1 #8 — `PrEntries.monthLabelLong` duplicates the page's (`portfolio.html` lines 869, 1799) → B-255
- Round 1 #9 — dead `div` branch of `:is` (`portfolio.html` line 576) → B-256
- Round 2 #3 — `blockState` writes reactive keys during render (`portfolio.html` line 1541) → B-257
- Round 2 #4 — `areaEntryClaims` thin wrapper re-normalising groups (`js/lib/project-report-calc.js` line 240) → B-258
- Round 3 #4 — "role (owner)" rule in three places (`portfolio.html` line 874, `js/lib/report-entries.js` line 42) → B-259
- Round 3 #5 — `groupSubtitle` unused in production (`js/lib/project-report-calc.js` line 89) → B-260
- Round 3 #6 — `area-task` row markup duplicated (`portfolio.html` line 593) → B-261
- Gate 3 option (b) — re-model the string-keyed `entriesState` registry (includes the latent round 3 #3) → B-262

## Roadmap notes

- Three review rounds in a row found correctness defects, all of them paths where the flat `entriesState` registry fell behind the rows; B-262 records the structural fix.
- `css/pipeline.css`'s `.pb-sheet` sets `height: auto` without `--bs-offcanvas-height: auto`, the same pattern that clipped `.pr-sheet` at 30vh; not checked whether the pipeline sheets are clipped.
- Board deviations accepted at Task 7 (filter menu cosmetics, smartphone header row) are recorded in `docs/pages/portfolio.md`.
- The Custom range calendar click (Review Focus 5) was first checked with synthetic mouse events in headless Chrome, then by hand in Gate 2 (A1).

## Sync-docs outcome

Scope pass: 1 ARCHITECTURE.md yes · 2 CLAUDE.md no (purpose unchanged, no per-module entries) · 3 TEST_CASES.md no (updated on the branch) · 4 test-api.js no (no API) · 5 PRD yes · 5b operational-manual yes · 6 PROCESS.md no · 7 memory yes.

- `ARCHITECTURE.md`: the `portfolio.html` tree entry lists `report-entries.js`.
- `docs/js/lib.md`: `areaTaskColumns`/`areaEntryClaims` added to `project-report-calc.js`; new `report-entries.js` section.
- `docs/pages/portfolio.md`: filter pruning also on a data reload and case-insensitive; filter menu closing rules from rounds 2–3.
- `docs/prd/reporting.md` §6.3: By task wording, By role and By area expansion, new **Entries** paragraph (user-visible: updated).
- `.claude/skills/operational-manual/SKILL.md`: the Breakdown card bullet reconciled from `docs/prd/reporting.md`.
- `CLAUDE.md`, `TEST_CASES.md`, `test-api.js`, `PROCESS.md`: not touched. PROCESS.md gate: none of the three conditions applied.

## Memory outcome

- `project_ui_redesign_cycles.md`: (no entry) → new "Breakdown v2 — MERGED 2026-11-03 (`0ff1611`)" paragraph with follow-ups B-251…B-262 and two lessons (the `entriesState` pattern; `--bs-offcanvas-height`).
- `MEMORY.md`: UI redesign line gains "Breakdown v2 (7.4e–j) MERGED 2026-11-03 (`0ff1611`…)"; Planning redesign line "…, cycle-2 minors; cycle 2 = smartphone, not started" → "…, cycle-2 minors" (cycle 2 merged as `be9d5eb`).
- Unverified: none.
