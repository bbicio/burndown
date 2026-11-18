# Finish-cycle report — save-c3-project-program-writes

**Date:** 2026-11-18
**Branch:** save-c3-project-program-writes → main
**Execution started:** 2026-11-18 22:47
**Merged at:** 2026-11-18 23:38
**Gate durations:** Gate 1 8m · Gate 2 34m · Gate 3 8m · Gate 4 2m · Gate 5 (to report) 2m — total 55m
**Cycle counters:** subagent dispatches 4 · review rounds 2 · full test-suite runs 12 (`npm test` 3, backend `npm test` in `api/` 6, `scripts/run-tests.sh` 3)
**Gate 5 tests:** docs-only → `npx vitest run scripts/ js/lib/test-cases-parse.test.js` ×1 (green on first run)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-18-save-c3-project-program-writes.md`) · review effort high
**Claims pre-check:** Gate 1 cost about 2 minutes and caught 1 defect (`docs/api/config.md` said the program `PATCH` answer was unchanged; it now answers the snapshot), fixed in `63ab32e`; the Gate 3 re-check over the round-1 fixes cost about 1 minute and caught nothing; none of round 1's 7 findings was mechanical.
**Security review:** ran — `security-scope` review, triggered by `api/src/routes/projects.js`, `api/src/routes/cost-grids.js`, `api/src/routes/config.js`, `api/src/services/project-save.js` and the other backend and client paths it listed · 3 findings (HIGH program attach and MEDIUM linked-projects permission fixed in `02361b5`; LOW project-code copy to follow-up), all three pre-existing on main
**Acceptance:** 14 criteria and 4 `TEST_CASES.md` cases listed · pre-ticked from automated runs: criteria 1 (PSV-02, `api-sync-project-save.test.js`), 2 (`api-sync-project-save.test.js`), 4 (PSV-04), 6 (GP-02, LK-01, `costgrid-generate.test.js`, `costgrid-add-tasks.test.js`), 8 (GP-03, `save-contract-guard.test.js`), 9 (PSV-01/04/10, GP-01, ATK-05, PG-01/05), 10 (`project-draft.test.js`), 11 (`save-contract-guard.test.js` 28/28), 12 (`npm test` 3393/3393, backend 634/634, `run-tests.sh` 1178/1178 at `7438716`), 13 (doc guards in `npm test`) · verified by hand with a positive outcome on the branch stack: PC-48 (criterion 3), CG-119 (criterion 5), SH-22 (criterion 7), SH-20 · criterion 14 handled at Gate 5 (B-168, B-171, B-237, B-242 and the D6/D7 residuals closed in `docs/BACKLOG.md`)

## What was done

11 commits:

- `ccde2d4d` feat(save): project snapshot with tasks and links, program entity, share rank
- `c81bf359` feat(projects): one transactional versioned Save route; old header and section routes removed
- `6710262e` test(projects): route test pins the Save's answer order and lock order (replaces the PATCH /:id test)
- `3d1be9af` feat(project-config): pure project draft diff
- `8ceb5194` test(projects): the period-with-tasks checks go through the project Save shim too
- `c4b9d9f2` feat(cost-grids): atomic Generate and Add tasks routes; version-project link merges task lists
- `74387165` feat(programs): registered create and atomic share that never lowers a permission
- `95528faa` feat(project-config): versioned all-or-nothing Save; no POST fallback
- `bc87fa29` feat(costgrid): Generate and Add tasks wait for one server answer; program share reports kept access
- `63ab32ef` docs: program PATCH answers the snapshot (claims pre-check)
- `02361b52` fix(projects): a program is attached only by who may edit it; linking a project needs its edit permission (Gate 3 security findings)

## Gate outcomes

- Gate 1: passed — claims pre-check fixed 1 defect (`63ab32e`), `npm test` 3393/3393, site-export tests not needed, audit none, `run-tests.sh` skipped — green at `7438716`, no backend or harness change since.
- Gate 2: ordinary path; branch stack started at pre-flight and reused; acceptance checklist all positive; browser verification confirmed; stack torn down.
- Gate 3: 2 rounds. Round 1 (whole branch at `63ab32e`, plus `/security-review`): 7 findings — 2 Important (security, pre-existing) fixed in `02361b5`, 5 Minor to follow-up; 0 taken by the spec/plan or pre-existing-prose rules. Round 2 (scoped `63ab32e..02361b5`, also checking the security fixes): 2 Minor, to follow-up under the round-1 rule. Backend re-run: `run-tests.sh` 1181/1181 at `02361b5`.
- Gate 4: merged `95f69ce` (no divergence), pushed; no migration; DB backup `backups/pdash-backup-2026-11-18-233815.dump`; pdash-api restarted and healthy at 2026-11-18T22:39:02Z; worktree and branch removed.
- Gate 5: `/sync-docs` updated `docs/prd/project-config.md` and `docs/prd/access.md`; `docs/BACKLOG.md` gains 7 rows and closes 4 plus the D6/D7 note.

## Code review follow-ups

- Round 1 (C1): `PATCH /programs/:id` answers the full snapshot including `shares`, exposing who has access to projects the caller cannot open — `api/src/routes/config.js` (PATCH /programs/:id). B-556.
- Round 1 (C2): a nonexistent `programId` (FK) or a blank `header.name` (NOT NULL) gives a 500, shown by the client as "answer lost" though nothing was saved — `api/src/services/project-save.js`. B-557.
- Round 1 (C3): the program share message says "kept their higher access" also for rows left at an equal permission — `js/shares.js` (`_programShareMessage`). B-558.
- Round 1 (C4, pre-existing): Generate and Add tasks build from the unsaved `_cgDraft`, so a task added during selection can leave link ids absent from the saved version — `js/costgrid.js`. B-559.
- Round 1 (S3, security LOW, pre-existing, unconfirmed): a project can take another project's `code`, and actuals join on the code — `api/src/services/project-save.js`. B-560.
- Round 2 (R2-1): the new test ids `PA-01`/`PA-02` clash with the planning-assistant tests — `test-api.js`, `docs/api/config.md`. B-561.
- Round 2 (R2-2): the costgrid page doc's "Tests:" line and ARCHITECTURE's Generate row do not mention the program 403 or LK-03 — `docs/pages/costgrid.md`, `handbook/restricted/ARCHITECTURE.md`. B-562.

## Roadmap notes

- The plan's final whole-branch review (PROCESS.md §6.4), launched at `bc87fa2`, died on an API session limit: counted as not reviewed, and Gate 2 step 0 launched the whole-branch review and the security review instead.
- The cleanup line `DELETE /api/pipeline-years/… → 409` in `run-tests.sh` is pre-existing (named in earlier reports).
- Executor rulings (plan ledger):
  - Task 1: the project snapshot uses the task shape of `GET /api/projects` (spec §2.1), not `GET /:id/tasks`; `my_permission` stays out of it; `links` also carry `cgId`.
  - Task 2: the plan's codes `PS-*`/`AT-*` were taken — the new cases are `PSV-*`/`ATK-*`; route code written before the PSV tests (RED not observed for them); `api/src/routes/projects.test.js` pinned the removed `PATCH /:id` and was replaced by a route test of `PUT /:id`; TAG-19 accepts one 409 among two concurrent first-link saves; `DELETE /api/projects/:id` on a missing project still answers 200.
  - Tasks 3/4: one `run-tests.sh` covered Tasks 2 (helper fix), 3 and 4; the save-contract guard counts a step called from another step's body as inside (new self-test seen failing first).
  - Task 5 ran before Tasks 3-4, during Task 2's suite run.
  - Task 6: api-sync code written before its tests; `project-push-result.js` deleted whole in Task 7; an unchanged project goes back to the portfolio with no request; the adopted project keeps the viewer's `my_permission`.
  - Task 7: Add tasks' out-of-period notice checks the new tasks only (spec §3.4); `js/shares.js` gained `?v=1` and `save.js` was added to `portfolio.html`/`program.html`; the program share message drops the recipient name; the costgrid-copy-period D7 case was replaced by GP-02 and `costgrid-generate.test.js`.

## Sync-docs outcome

Scope pass: ARCHITECTURE (yes, already on branch), CLAUDE.md (yes, already on branch), TEST_CASES (yes, already on branch: PC-48, CG-119, SH-22, SH-20), test-api.js (yes, already on branch), PRD (yes — updated `docs/prd/project-config.md` §7.1 with the all-or-nothing Save, Reload and no recreation, and `docs/prd/access.md` §18 with the share that never lowers access, the new messages and the program-attach rule; `PRD.md` untouched), handbook (manual already on branch; production checklist checked, no change), PROCESS.md (gate: none of the three conditions), memory (yes).

## Memory outcome

`project_save_contract_series.md`: description "…next c3 project/program writes" → "…c3 project/program writes MERGED 2026-11-18 (`95f69ce`, pdash-api restarted, no migration); next c4 tags", plus a c3 cycle line; `MEMORY.md` line "…; next: c3 project/program writes" → "…; c3 project/program writes MERGED 2026-11-18 (`95f69ce`); next: c4 tags".
