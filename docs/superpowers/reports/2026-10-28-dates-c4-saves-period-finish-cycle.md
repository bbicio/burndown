# Finish-cycle report — dates-c4-saves-period

**Date:** 2026-10-28
**Branch:** dates-c4-saves-period → main
**Execution started:** 2026-10-28 11:33  (pre-flight step 6)
**Merged at:** 2026-10-28 13:52  (Gate 4's merge commit)
**Gate durations:** Gate 1 13m · Gate 2 43m · Gate 3 82m · Gate 4 2m · Gate 5 7m — total 147m
**Cycle counters:** subagent dispatches unknown · review rounds 2 · full test-suite runs unknown
**Risk class:** high-risk (`docs/superpowers/plans/2026-10-26-dates-c4-saves-after-period-rule.md`) · review effort high
**Claims pre-check:** Gate 1: the branch changed no `*.md`, so there was nothing to check and it cost no time. Gate 3: the round-1 fixes touched no `*.md`, so no re-check ran. None of round 1's 10 findings was mechanical.
**Acceptance:** 15 criteria listed. 13 pre-ticked from automated runs: criteria 1, 5, 7, 8, 9, 10, 12, 13 and the vitest half of 6 from `npm test` (1778/1778); criteria 2, 3, 4, 11 from `scripts/run-tests.sh` (639/639); criterion 15 from the handoff's two read-only queries on the main stack (`12 44`, `9 28`). Verified by hand on the branch stack with a positive outcome: criterion 14 and the manual half of 6, in project-config (project `f6541ba7-1fc1-4229-81f8-5918a60ee042`) and in costgrid (version `fdf9b203-1ea7-4088-ac80-556bca2e09e2`). The first attempt failed because my instructions gave the wrong order; with the order the pickers require (task end, then task start, then period start) both passed. No item was left unverifiable.

## What was done

10 commits:
- `a51b00e` feat(dates-c4): structure PUT carries the version period
- `7a16b7a` feat(dates-c4): project tasks PUT carries the project period, in one transaction
- `5311ce0` feat(dates-c4): version period travels with the structure; notices per code and message
- `b51ef01` fix(dates-c4): forget notices on reload; PATCH refusal keeps its own sentence
- `7e05126` feat(dates-c4): project period travels with the tasks; save message names untried sections
- `8beed4e` feat(dates-c4): costgrid banner, Generate refuses an invalid period, Add tasks reports a refused task save
- `0009e7d` fix(dates-c4): Add tasks rolls back only on a refused task or project save
- `4945bf8` fix(dates-c4): an inverted task range keeps the monthly distribution
- `48deb7a` fix(dates-c4): Generate with refused tasks keeps the project without them
- `c408225` fix(dates-c4): notices name the tasks, a cleared task date resets the distribution

## Gate outcomes

- Gate 1: passed, frontend and backend. `npm test` was 1778/1778 on the third run (see Roadmap notes for the first). `scripts/run-tests.sh` was 639/639.
- Gate 2: ordinary path. The branch stack was spun up and the Acceptance checklist completed. The user answered yes to the browser question, and the stack was then torn down.
- Gate 3: two rounds at high.
  - Rules: no finding fell under the spec/plan rule or the pre-existing-prose rule.
  - Round 1: 10 findings, decided finding by finding. Findings 1, 2 and 8 were fixed in `c408225` and verified by the vitest files covering them plus `node --check`. Finding 7 (the CLAUDE.md "Dates" sentence) was fixed by `/sync-docs`. The other 6 were accepted as follow-up.
  - Round 2: confirmed the three fixes and found 3 new findings, all accepted as follow-up.
- Gate 4: merged and pushed as `8e9b76d`. It is a `--no-ff` merge commit, though `main` had not diverged. The backup `backups/pdash-backup-2026-10-28-135215.dump` was taken first. No migration. `pdash-api` was restarted and healthy at 2026-10-28T12:52:51Z. The worktree and the branch were removed.
- Gate 5: `/sync-docs` updated 13 files. `docs/BACKLOG.md` closed 10 rows and added B-163..B-172.

## Code review follow-ups

- Round 1: Generate pushes PTC rows for tasks the server refused (`js/costgrid.js` line 1357). → B-163
- Round 1: a structure failure other than `DATE_RULE`/`STRUCTURE_RULE` loses a version period change silently (`js/api-sync.js` line 213). → B-164
- Round 1: the notice key includes the server message, so stepping the period picker re-opens a notice (`js/api-sync.js` line 174). → B-165
- Round 1: a refused version `PATCH` other than `DATE_RULE` no longer stops the structure save and shows no notice (`js/api-sync.js` line 214). → B-166
- Round 1: the period-merge rule and the column normaliser are duplicated in `api/src/routes/cost-grids.js` and `api/src/routes/projects.js`. → B-167
- Round 1: `withPeriod: true` is always set (`js/api-sync.js` line 344). → B-168
- Round 2: a period change from the `PATCH` uses `periodShrinkError`, while the same change from the editor checks every task (`api/src/routes/cost-grids.js` line 717). → B-169
- Round 2: the period `UPDATE` runs on every structure or task save even when the period is unchanged (`api/src/routes/cost-grids.js` line 756). → B-170
- Round 2: `_pushProjectToApi` has no production caller, yet the comment in `js/core.js` still names it as the write-through path. → B-171

## Roadmap notes

- **Isolated red in Gate 1.** The first `npm test` run failed one test in `scripts/decision-ledger-guard.test.js` ("every in-scope spec and spec-less plan carries a criteria section"). The file passed on its own (50/50), and the next two full runs were green. The failure message was not captured, so the cause is unknown; it may be a timeout under load, since that run took 184 s against 156 s.
- **Picker order at Gate 2.** The period and task pickers apply the dates C3 bounds, so a combined move has to be done in this order:
  1. the task's end;
  2. the task's start;
  3. the period start that would otherwise leave the task out.

  The user found the intuitive order (period first) blocked. The server accepts the combined save, which is what C4 delivers. The forced order is a C3 picker rule, a candidate for a later UX cycle; it is not filed as a defect.
- **Wording deviations from the Spec.** The Spec is frozen, so these are recorded here and in `docs/pages/costgrid.md`:
  - A refused version `PATCH` keeps the pre-C4 sentence. This was decided during execution.
  - The Spec's §3.1/§3.2 "Task dates and the period …" became "Tasks and the period …" at Gate 3 round 1, because a refused structure or task list drops every task edit.
- **`keepDistribution` and criterion 10.** The function now takes an `inverted` flag. Criterion 10 still holds for the inverted case it names (B-158), but a bare empty month list now resets the distribution.
- **Execution-time rulings.** Thirteen rulings are in the SDD ledger (git-ignored, deleted with the worktree; copied to the session scratchpad before removal). The two that changed behaviour are listed above. The deferred browser checks ran at Gate 2.

## Sync-docs outcome

- `docs/js/api-sync.md`: new section "The period travels with the tasks (dates C4)". It covers:
  - structure `PUT` with `period`, the `PATCH` without it, and the C3 retry removed;
  - notice keys and `_cgForgetRuleNotices`, and both notice sentences with their deviation;
  - `saveTasks` with the period and `withPeriod`;
  - `_pushProjectToApi` having no production caller.
- `docs/js/costgrid.md`: the Generate paragraph now names `_pushProjectToApiDetailed`. New section on Generate and Add tasks after a refused save.
- `docs/js/lib.md`: the §3.3 texts of `project-push-result.js` (`?v=3`), and `keepDistribution` with its `inverted` flag (`config-form-calc.js ?v=4`).
- `docs/api/lib.md`: the consumers line corrected, and a C4 bullet:
  - the `period` body and the order of the checks;
  - a refusal leaves both unchanged;
  - no `periodShrinkError`, plus the row lock in `PUT /:id/tasks`.
- `docs/pages/costgrid.md`: the C3 Save line now gives current `?v=` values and points to C4. New C4 subsection, including the wording deviations and CG-103.
- `docs/pages/project-config.md`: the C3 B-150 sentence marked as fixed, and the `?v=` values updated. New C4 section covering Save, messages and distribution, and PC-33.
- `CLAUDE.md`, "Dates": a period change travelling with the tasks is checked with `taskPeriodError` against the new period. In the data-strategy table, `_pushProjectToApi` is marked as having no production caller.
- `ARCHITECTURE.md` §5: the structure `PUT` and `PUT /api/projects/:id/tasks` rows mention the `period` body.
- `TEST_CASES.md`: CG-101 and PC-32 now use the new texts. CG-103 and PC-33 added; `js/lib/test-cases-parse.test.js` count 856 → 858.
- PRD: updated `docs/prd/pipeline.md` (§4: the save wording, the combined autosave, and Generate/Add tasks on a refused save) and `docs/prd/project-config.md` (§7.1: one Save can shrink or shift the period with the tasks).
- `.claude/skills/operational-manual/SKILL.md`: the inlined reference was reconciled from `docs/prd/pipeline.md` and `docs/prd/project-config.md`.
- `test-api.js`: not touched, because no endpoint or auth rule was added; the `PS-*` cases came with the branch.
- `PROCESS.md` gate: none of the three conditions applies, so the file was not touched.

## Memory outcome

- `project_manual_test_findings_money_cleanup.md`: "Open follow-ups in docs/BACKLOG.md (B-150 …). **Cycle C (C1-C3) is complete.**" → "**C4 … MERGED 2026-10-28 (`8e9b76d`, pdash-api restarted)** … B-150 closed … the pickers still impose an order … **Cycle C (C1-C4) is complete.**"
- `MEMORY.md`: the line for that file now reads "… C3 MERGED 2026-10-26 (`e2b0bd9`, block out-of-period saves), C4 MERGED 2026-10-28 (`8e9b76d`, period travels with the tasks, B-150 closed; cycle C complete) …"
