# Finish-cycle report — dates-c1-shared-rule

**Date:** 2026-10-24
**Branch:** dates-c1-shared-rule → main
**Execution started:** 2026-10-24 15:57  (pre-flight step 6)
**Merged at:** 2026-10-24 19:41  (Gate 4's merge commit)
**Gate durations:** Gate 1 4m · Gate 2 198m · Gate 3 21m · Gate 4 2m · Gate 5 unknown (still running when this report was written) — total unknown
**Cycle counters:** subagent dispatches 20 Agent calls (19 for the subagent-driven plan execution, 1 background `/code-review` that died on a rate limit), plus 3 forked `/code-review` runs at Gate 3 · review rounds 3 · full test-suite runs 5 (frontend `npm test` twice during Task 8, once at Gate 1 and once at Gate 5; backend `api/` `npm test` once, in a throwaway `node:22` container)
**Risk class:** high-risk (`docs/superpowers/plans/2026-10-24-dates-c1-shared-rule.md`) · review effort high
**Claims pre-check:** At Gate 1 it took about 3 minutes and caught 1 defect, a false predicate: the CLAUDE.md "Dates" rule said every route that writes dates answers `DATE_RULE`, but the timesheet upload has its own row-numbered refusal. Fixed in `315ea4f`. Round 1 fixed no `*.md`, so there was nothing to re-check after it. Round 2 narrowed the "tolerated" rule in CLAUDE.md; re-checking it took about a minute (a grep of the `periodError` call sites) and found nothing. None of round 1's 10 findings was in the four mechanical classes. Round 2 did find one, a false predicate in the "Existing invalid data is tolerated" rule that Gate 1 had missed.
**Acceptance:** 11 items listed (Spec "Criteri di accettazione"), all 11 verified with a positive outcome. Criteria 1, 2, 3, 5, 10 and 11 rest on the automated runs; the user checked 4, 6, 7, 8 and 9 in the browser on the branch stack. No `TEST_CASES.md` case was changed on the branch.
<!-- Wall-clock, human wait time included (pre-flight step 6). Write `unknown` for a gate whose
     timestamp was not captured; a gate that self-skipped gets `0m (skipped)`.
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

14 commits (12 before Gate 3, then 2 Gate 3 fix commits), merged as `50790e2`:

- `eda5d22` feat(dates): js/lib/dates.js, the single browser date module
- `288d63a` feat(dates): server twin api/src/lib/dates.js + parity test
- `ed8b67c` feat(api): DATE_RULE on version, project and task date writes
- `990a3a0` fix(timesheets): reject impossible ISO dates
- `4370b37` fix(cg-date-picker): typed values and shortcuts honour min/max, inline error (B-030 part 3)
- `759b6a7` fix(dates): DATE_RULE notices, push reason, generated period, drop duplicate converters
- `193a9f8` fix(dates): DATE_RULE notices reuse the STRUCTURE_RULE sentence, no double period
- `3492031` chore: bump ?v= for the files touched by dates C1
- `2f4e21e` docs+test: Dates rule in CLAUDE.md, full dates guard
- `18a5553` test(api): DT coverage for every date route
- `2e2ed78` docs: correct dates module docs, backlog rows
- `315ea4f` docs: Dates rule names the timesheet upload's own refusal
- `82ef9e8` fix(dates): single-digit day/month accepted; picker leaves unedited fields unchecked
- `fe80f15` fix(cg-date-picker): a shown reason survives the blur after Enter; Dates rule scopes the tolerance

## Gate outcomes

- Gate 1: passed. The claims pre-check fixed 1 false predicate; frontend `npm test` 1663/1663; `scripts/run-tests.sh` 590/590.
- Gate 2: ordinary path. The branch stack was started, the Acceptance checklist came back 11/11, the user answered "yes" to the browser question, and the stack was torn down. The background `/code-review` launched at step 0 died on an API rate limit, so it was treated as not reviewed and re-run at Gate 3.
- Gate 3: 3 rounds at high. Round 1: 10 findings, 2 fixed (#1 a single-digit day/month typed in project-config was silently wiped; #6 the picker re-checked unedited fields, and Clear/Esc did not reset the error), 8 to follow-up. Round 2: 9 findings, 2 fixed (#6 a regression from round 1's fix: the reason vanished on the blur after Enter; plus narrowing the CLAUDE.md tolerance rule), 7 to follow-up. Round 3: 10 findings, none a new regression, all to follow-up at the user's choice. The frozen-file rule and the pre-existing-prose rule took 0 findings in every round.
- Gate 4: merged with a `--no-ff` merge commit (`50790e2`, main had not diverged) and pushed. Backup `backups/pdash-backup-2026-10-24-194130.dump` (120K) was written and one old dump pruned. No migrations. `pdash-api` restarted and healthy at 2026-10-24T17:41:59Z. Worktree removed and branch deleted.
- Gate 5: sync-docs touched 6 files (see below); `docs/BACKLOG.md` got 7 new rows (B-132..B-138) and 2 edited rows (B-030 merge SHA, B-129 extended).

## Code review follow-ups

- Round 1 #2-#3, round 2 #1 and #3, round 3 #1-#2: `api/src/routes/cost-grids.js` line 677 and `api/src/routes/projects.js` line 415 have no tolerance for a stored invalid or inverted task date; a stored non-ISO task date passes through `toInputDate` (`cost-grids.js` line 625), shows as blank and cannot be cleared. → B-132
- Round 1 #4, round 3 #6: one `_cgRuleNotified` Set for both codes. → already B-131
- Round 1 #5: a version-PATCH `DATE_RULE` shows the "reload … structure" sentence, and the early return skips the structure save (`js/api-sync.js` line 199). → B-133
- Round 1 #7-#9, round 2 #4 and #8-#9, round 3 #8-#9: date helpers duplicated outside the dates module (`cg-controls-calc.js`, `project-config.html`, `costgrid.js` `toYYYYMM`), and two month-length mechanisms in `api/src/lib/dates.js`. → B-134
- Round 1 #10, round 2 #7: the project PATCH reads the same row twice (`projects.js` line 220). → B-135
- Round 2 #2, round 3 #5: `cgDoAddTasksToProject`/`cgDoGenerateProject` swallow a refused tasks PUT, and `linkedProjects` still records the tasks. → B-136
- Round 2 #5: project-config's task Start/End text inputs have no `min`/`max` and do not use `parseDateInput`. → B-129 extended
- Round 3 #3: Clone proposal from a version whose own period is inverted is refused. Accepted by ruling during execution (spec §2.2 validates every version POST). Recorded under Roadmap notes, no row.
- Round 3 #4: Generate project from an inverted version. → already B-130
- Round 3 #7: the picker's `modelValue` watcher does not reset `error` (`js/cg-controls.js` line 151). → B-137
- Round 3 #10: when the project PATCH is refused, the summary says only "project was not saved" (`js/lib/project-push-result.js` line 16). → B-138

## Roadmap notes

- **Process change requested by the user at Gate 2 (to apply after this cycle, PROCESS.md §6.5):** in the Acceptance checklist, criteria already validated by an automated run must arrive already ticked, citing the command and result. Criteria that need a manual check must come with step-by-step instructions: page/URL on the branch stack, steps, expected outcome. A bare criterion label is cryptic, and the user had to ask how to verify each one. Recorded in project memory (`feedback_acceptance_checklist_format.md`). It goes in `.claude/commands/finish-cycle.md` ("Acceptance checklist") and PROCESS.md §6b, with its own `docs:` commit.
- **Rulings taken during subagent-driven execution (from the SDD ledger, in order):**
  1. The spec said `cg-controls-calc.js` imports `./dates.js`; the plan said no import and that the components read the `window` bridges. Followed the plan. Cost if wrong: one import line.
  2. The shortcut range check went into `dates.js` (`isWithin`), not `cg-controls-calc.js`, with static picker tests. Cost if wrong: one pure function to move.
  3. In `periodChangeError`, an explicit `null` in the body means "cleared". Cost if wrong: none in practice, because one empty side is always ordered.
  4. No tolerance for stored invalid task dates on the full-replace task endpoints. A read-only SELECT on the main DB found 0 bad rows in 44 `tasks` and 28 `project_tasks`. Cost if wrong: a visible `DATE_RULE` refusal until the date is fixed by hand (now B-132).
  5. Cloning a proposal whose version period is already inverted (e.g. `ce702b4c`, "TEST PROPOSAL — PerValter") is now refused by version POST. Accepted as intended. Cost if wrong: that one version's period must be fixed before cloning.
  6. `_pushProjectToApiDetailed` treats `DATE_RULE` as final, like `PROJECT_RULE`: no retry as a POST.
  7. The `DATE_RULE` notice reuses the `STRUCTURE_RULE` sentence verbatim, per spec §2.3. Cost if wrong: a wording change (now B-133).
  8. Task 7 (a pure `?v=` bump) was reviewed by a mechanical controller check: one version per file, symmetric numstat, no BOM.
  9. CLAUDE.md "Dates" rule "a field with a twin passes min/max": kept as written and logged as B-129 for C2.
  10. Final-review minors #2/#3 went to BACKLOG (B-130/B-131), per spec §4.
  11. The B-030 merge SHA is filled here, at Gate 5.
  12. Stale docs were fixed in the final fix wave rather than left to `/sync-docs`.
- **Deferred minors from the per-task reviews not covered by a BACKLOG row:**
  - `isWithin`/`parseDateInput` compare with `<`/`>` and assume the value and its limits share one format;
  - no `periodChangeError` test with `kind: 'day'`;
  - an untitled task's message reads `task ""`;
  - the task-date check is a loop separate from the sold-hours loop;
  - the picker tests are static source checks with no jsdom mount;
  - `cgGeneratedPeriod` copies a malformed side onto the other;
  - `dates-guard` check 4 accepts zero references, and check 2 matches only the single-quoted `require('../lib/dates')`;
  - `docs/js/api-sync.md` still carries `?v=22`/`?v=23` in older prose.
- **Pre-existing, outside this cycle:** `project-config.html`'s task date inputs show the Italian placeholder `gg/mm/aaaa`, against CLAUDE.md's "Language constraint". It belongs with C2's field replacement.
- **The background `/code-review` at Gate 2 step 0 died on an API session limit (HTTP 429).** Gate 3 therefore ran its round 1 in the foreground, after the browser check.

## Sync-docs outcome

- `ARCHITECTURE.md`: §5 API table. The rows for version POST/PATCH, `PUT …/structure`, project POST/PATCH and `PUT /api/projects/:id/tasks` now state the `400 { code: 'DATE_RULE' }` refusal and point to CLAUDE.md's "Dates". The file tree needs no change: `js/lib/` and `api/src/lib/` are listed collectively.
- `CLAUDE.md`: no further change. The "Dates" section landed on the branch.
- `TEST_CASES.md`: added CG-94..CG-97, PC-28, TS-21 and SEC-11. `js/lib/test-cases-parse.test.js`'s exact case count went from 839 to 846.
- `test-api.js`: no change; the `DT-01..DT-17` block landed on the branch.
- PRD: updated. `docs/prd/pipeline.md` (offer editor, version Start/End: typed format, limits, inline refusal, server rule and tolerance, autosave notice) and `docs/prd/project-config.md` (a save refused for its dates shows "Reason:"; single-digit day/month accepted). `PRD.md` was not touched: no page or navigation change.
- `.claude/skills/operational-manual/SKILL.md`: §4 Pipeline, "Saving in the offer editor", reconciled from `docs/prd/pipeline.md`.
- PROCESS.md gate: none of the three conditions applies. No process skill, recurring exception, gate or `/sync-docs` output changed in this cycle. The requested Acceptance-checklist change is deferred to its own commit (Roadmap notes).

## Memory outcome

- `project_manual_test_findings_money_cleanup.md`: the Cycle C bullet gained the status line "C1 MERGED 2026-10-24 (`50790e2`) … NEXT: C2 … then C3; items 3 and 5 still left out". `MEMORY.md` hook: "C1 spec+plan committed (`b529acb`), next: execute C1 subagent-driven" → "C1 MERGED 2026-10-24 (`50790e2`), next: C2 then C3".
- `project_costgrid_custom_form_controls_cycle.md`: "`commitTyped` does not apply `min`/`max`, which belongs to the cycle C dates item" → "~~…~~ CLOSED 2026-10-24 by dates C1 (merge `50790e2`)". `MEMORY.md` hook: "typed min/max = B-030" → "typed min/max CLOSED 2026-10-24 by dates C1 `50790e2`".
- New, written at Gate 2: `feedback_acceptance_checklist_format.md` and its `MEMORY.md` line (the process change above).
