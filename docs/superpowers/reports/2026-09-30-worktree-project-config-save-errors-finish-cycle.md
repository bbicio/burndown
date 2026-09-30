# Finish-cycle report — worktree-project-config-save-errors

**Date:** 2026-09-30
**Branch:** worktree-project-config-save-errors → main (merge `67294cf`)

## What was done

- `108d12a` fix: `project-config.html` `onSave` no longer reports a failed save as success. New `_pushProjectToApiDetailed` (`js/api-sync.js`) returns `{ ok, failed }`; `summarizePushResult` (`js/lib/project-push-result.js`) builds the message; on failure the page stays put with an error in `jsonError`, `savedSnapshot` is untouched (leave-page prompt stays armed) and Save can be retried. `_pushProjectToApi` keeps its old contract for `costgrid.js`. New projects are replaced-or-pushed in `config.projects` so a retry cannot duplicate them.
- `6fab11f` fix: empty sub-resources (tasks/phasing/ptc/planning/groups) are pushed too, so clearing a section is saved (before, the old data stayed on the server). `js/api-sync.test.js` added (loads the classic script against a fake `Api`). `api-sync.js` bumped to `?v=18` on all five pages.
- Gate 1: `npm test` passed (281 tests), no `api/` changes so `run-tests.sh` skipped. Gate 2: verified by the user in the browser (twice: after the first commit, and again after the empty-sections fix). Gate 3: round 1 no findings; round 2 two low findings, both accepted as follow-ups. Gate 4: merged with a merge commit, pushed; no migrations, no `pdash-api` restart (no `api/` changes). DB backup taken (`backups/pdash-backup-2026-09-30-224448.dump`, written in the worktree's gitignored `backups/` folder, not the main checkout's).

## Code review follow-ups

- Round 2, `js/api-sync.js:283` (low): empty sections are now pushed, so callers such as `addTasksToProject` (`js/costgrid.js:1073`) could wipe server tasks from a stale in-memory project whose `tasks` is `[]`. Accepted.
- Round 2, `project-config.html:~841` (low): a new project is written to `config.projects` before the server save; if the save fails and the user navigates away, the in-memory copy lives only until the next page load. Already the case before this cycle. Accepted.

## Roadmap notes

- `GET /api/timesheets/:projectCode` answers 403 for a project code with no visible timesheets (`api/src/routes/timesheets.js:101-106`, `visibleCodes`), so `project-config.html` logs two 403s in the console on load (`updateReforecastVisibility`, `loadActuals`) for such projects. Seen by the user on the branch stack; cause not verified (probable: no uploaded actuals). Worth deciding whether "no actuals" should be an empty list instead.
- `PUT /api/projects/:id/tasks` is DELETE + INSERT outside a transaction: a failure mid-way can lose tasks server-side; a retry from the still-populated form repairs it. Unchanged.
- PA-M1 (real LLM, Team assistant) was run on the main stack the same day: the round trip works over three turns and follows the language typed, but the "why is X not among the best?" answer did not cite score components. PA-M3 was measured (36 ms cold, 23 ms warm) with only 1 active resource, so it says nothing about the 3 s target on ~150 people; PA-M2 not run. `TEST_CASES.md` was not updated with these outcomes.
- `test-cases.html` was missing PC-21/PC-22 (from the leave-page-prompt cycle); added together with PC-23..PC-27.

## Sync-docs outcome

- Updated: `CLAUDE.md` (api-sync table: `_pushProjectToApiDetailed` and the refined `_pushProjectToApi` row), `docs/js/api-sync.md` (new section + wrapper note), `docs/js/lib.md` (`project-push-result.js`), `TEST_CASES.md` (PC-27/PC-26 put in order; PC-23..27 were added in the branch), `test-cases.html` (mirrors PC-21..PC-27; PC-21/22 were a pre-existing gap), `docs/pages/project-config.md` (written in the branch, including the "Save errors are surfaced" section).
- Not updated: `ARCHITECTURE.md` (no reference to the changed functions), `test-api.js` (no API endpoint added or changed), `PRD.md` (evaluated: not necessary — the change restores the expected "a failed save does not look successful" behaviour, no new screen/flow; clearing a section now persisting restores documented behaviour), `docs/superpowers/PROCESS.md` (gate: none of the three conditions applied; the cycle executed the documented process).

## Memory outcome

- `project_next_cycle_ui_defects_consistency.md`: the `onSave` swallowed-errors finding "not in any cycle yet" → closed 2026-09-30 (`67294cf`, this report); the pending "real-LLM chat check (PA-M1..M3)" → PA-M1 run on a 1-resource stack, PA-M3 measured but not valid, PA-M2 not run.
- `MEMORY.md`: the UI-defects line ("open: `onSave` swallows push errors" → closed, `67294cf`) and the Planning Team Assistant line ("Gate 2 real-LLM chat check" → PA-M1 done on a 1-resource stack, PA-M2/M3 need real data).
- Unverified: the body of `project_planning_team_assistant_cycle4.md` still describes the real-LLM check as open; left untouched (not re-read in this run).
