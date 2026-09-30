# Finish-cycle report — worktree-hardening-open-findings

**Date:** 2026-10-01
**Branch:** worktree-hardening-open-findings → main (merge `6949ec4`)

## What was done

Nine commits, executed with subagent-driven development from `docs/superpowers/plans/2026-09-30-hardening-open-findings.md` (spec `docs/superpowers/specs/2026-09-30-hardening-open-findings-design.md`, both committed on `main` first, `cde10ae` / `5418621`):
- `89414ee`, `6ff41f9` — one router-level guard `versionScope` in `api/src/routes/cost-grids.js` (`router.use('/:id/versions/:vId', requireAuth, versionScope)`): a version not in grid `:id`, or a non-UUID id, answers 404; covers 13 routes (PATCH, DELETE, duplicate, publish, structure GET/PUT, linked-projects GET/POST/DELETE, refresh-rate, tags GET/PUT). The second commit unmasked the test cases (the destructive cross-grid DELETE now runs last).
- `5bc855e` — `PATCH /api/projects/:id` answers 400 for a non-UUID `cgVersionId`/`clientId` (null and `''` still unlink; `programId` is `VARCHAR`).
- `525708c` — `GET /api/timesheets/:projectCode` never denies an admin/sysadmin: no actuals → `200 []`.
- `f8a1eb1` — `skipEmpty` option on `_pushProjectToApiDetailed`/`_pushProjectToApi`, passed only by the two `js/costgrid.js` callers (stale-copy wipe); `api-sync.js` `?v=19`, `costgrid.js` `?v=34`.
- `51068e3` — `costgrid.html` `toggleTag` rolls back only while the same version is open.
- `5d87d89`, `b139c0a`, `7037e54` — test cases (HD-01..HD-07), page/API docs and three review-driven doc/test fixes.

Gates: Gate 1 `npm test` 284/284 and `run-tests.sh` 456/456; Gate 2 manual checks HD-04..HD-07 confirmed by the user on the branch stack (HD-06 repeated in a controlled way, HD-07 "no problems apart from the two pre-existing bugs below"); Gate 3 round with no findings on `main...HEAD` (per-task and whole-branch reviews during execution found and fixed the items listed in the ledger); Gate 4 merged with a merge commit (main had 2 docs commits the branch lacked), pushed, DB backup taken (`backups/pdash-backup-2026-10-01-001849.dump`), no migrations, `pdash-api` restarted and healthy (StartedAt 2026-09-30T22:19:30Z).

## Code review follow-ups

- Final whole-branch review, deferred minors (none blocks): the UUID regex is duplicated (inline in `projects.js`, module const in `cost-grids.js`, `api-sync.js`, `topics.js`) — a shared helper in `api/src/lib` is a cosmetic candidate; `TS-01` does not assert that an admin still gets rows for a code WITH actuals; `PV-04` checks the status, not the stored `cg_version_id`; no test for `skipEmpty` with null/absent sections or the wrapper with non-empty tasks; `TS-02` fails instead of skipping when no plain-user cookie is available; `VS-07/14/15/16` pass without the guard (their handlers 404 on their own: defence in depth); `tagSaving` stays true for the old request after a version switch (pre-existing, benign).
- Residual, accepted by the spec (D6/D7): a stale `costgrid.js` copy holding an older NON-empty phasing/PTC/planning/groups, or the `tasks` list `addTasksToProject` always re-sends, is still last-writer-wins; `config.projects` in `project-config.html` is a page-level cache that a failed save does not roll back.

## Roadmap notes

Two pre-existing bugs found by the user while repeating the manual checks (both recorded as project memories, NOT in this cycle):
- **Money fields ×100 in `project-config.html`** (reproduced in the browser): phasing inputs show the raw number with a dot on focus and `parseMoney` reads it with the de-DE rule on blur (dot = thousands), so focus+blur without editing turns `350.28` into `35028`; saving writes it to the server. PTC amounts (l. 256-257) use the same pattern (inferred, not tested). `$`/`£` are unaffected; hours are safe. Also `costgrid.html` per-task PTC drops the decimals of a typed comma (`150,75` → `150`). The project `MEN 26 AURORA Platform Dev.-Creation graph.Assets` was altered on the branch test stack only (now torn down); the main stack keeps the original values.
- **"New version" in `costgrid.html` creates a version with no phases** (reproduced): `cgCreateNewVersion` copies the structure keeping the task ids, the server answers 500 `tasks_pkey` duplicate key, the error is swallowed by `.catch(console.warn)`, so the new version has no phase and no `+ task` button. `cgCloneGrid` already uses `stripCloneTaskIds()`. Existing versions created this way may be empty.
- Other: `PUT /api/projects/:id/tasks` is DELETE + INSERT outside a transaction (unchanged); a valid UUID `cgVersionId`/`clientId` that does not exist still gives 500 on `PATCH /projects` (FK), not 400; version-existence oracle via 403 vs 404 (accepted by the spec).

## Sync-docs outcome

- Updated: `ARCHITECTURE.md` (API reference: new `ANY /api/cost-grids/:id/versions/:vId/...` guard row, `PATCH /projects/:id` validation, new `GET /api/timesheets/:projectCode` row), `CLAUDE.md` (`_pushProjectToApiDetailed` row: `skipEmpty`, wrapper `opts`), `docs/js/api-sync.md` (`skipEmpty` paragraph replaces the "known follow-up" sentence). Already updated inside the branch: `TEST_CASES.md` (section 27, HD-01..HD-07), `test-cases.html` (same ids, section 28), `docs/pages/costgrid.md` ("Hardening (2026-09-30)" + the old deferred findings annotated closed), `docs/pages/project-config.md`, `docs/api/timesheets.md`.
- Not updated: `test-api.js` (already extended in the branch: `VS-*`, `PV-*`, `TS-*`), `PRD.md` (evaluated: not necessary — server-side hardening and restored expected behaviour, no new screen, button or flow; the 403-in-console and the 404 on mismatched ids are not documented user behaviour), `docs/superpowers/PROCESS.md` (gate: none of the three conditions; the cycle executed the documented process, with subagent-driven execution chosen by the user).

## Memory outcome

- `project_known_findings_tag_cycle.md`: rewritten — every item (version-route scope, `toggleTag` race, `PATCH /projects` UUID validation, `unnest`) → CLOSED by merge `6949ec4`; description updated.
- `MEMORY.md`: the Known Findings line → "ALL CLOSED"; the Team UX Backlog line → hardening DONE, next candidates now include the two new bug cycles.
- New (created during the cycle, recorded here because memory has no diff): `project_money_parse_x100_bug.md`, `project_new_version_structure_copy_bug.md`, plus their `MEMORY.md` lines.
- Unverified / left as is: `project_team_ux_backlog.md` body item 5 ("bundle into a one-off hardening cycle") was not re-read in full this run; the body of `project_planning_team_assistant_cycle4.md` (real-LLM check) also unchanged.
