# Finish-cycle report — save-c6-master-data-pages

**Date:** 2026-11-19
**Branch:** save-c6-master-data-pages → main
**Execution started:** 2026-11-19 18:08
**Merged at:** 2026-11-19 23:19
**Gate durations:** Gate 1 52m · Gate 2 6m · Gate 3 13m · Gate 4 2m · Gate 5 (to report) 3m — total 315m
**Cycle counters:** subagent dispatches 21 · review rounds 3 · full test-suite runs: `npm test` 2 (the first unusable), `scripts/run-tests.sh` 5 (Task 1 ×3, Gate 1, Gate 3), backend `node --test` unknown (the implementers' runs were not all observed)
**Gate 5 tests:** docs-only → `npx vitest run scripts/ js/lib/test-cases-parse.test.js` ×1 (green on first run)
**Risk class:** high-risk (`docs/superpowers/plans/2026-11-19-save-c6-master-data-pages.md`) · review effort high
**Claims pre-check:** at Gate 1 it took about 10 minutes and caught one false predicate in `docs/pages/team.md` (every `unknown` write "reloads the lists"); the Gate 3 re-checks over the round-1 fix and the round-2 fix took a few minutes and caught nothing. Of round 1's 8 findings, 2 were mechanical (the same false sentence, already fixed by the pre-check, and an imprecise "only the unmatched queue" in the sentence the pre-check had rewritten).
**Security review:** ran — `security-scope` review, triggered by the routes, migration and pages of the diff · 0 findings; the commits after its HEAD `c4cc6a10` were `skip` for `security-scope` and were checked by the scoped reviews.
**Acceptance:** 11 criteria + 8 `TEST_CASES.md` cases · pre-ticked from an automated run: 4 (`run-tests.sh` 1247/1247, MDR-06), 8 (`scripts/save-contract-guard.test.js` in `npm test`), 9 (`npm test`, backend unit tests 639/639, `run-tests.sh` 1247/1247), 10 (`scripts/doc-paths-guard.test.js` in `npm test`), MDR-01..MDR-08 (`run-tests.sh` at `3d38dd93`) · verified by hand with a positive outcome: 1, 2, 3, 5, 6, 7 · 11 is done at Gate 5 step 2b.

## What was done

14 commits:

- `a0d63aea` feat(api): unique client and group names, refuse deleting a pipeline year with POTs
- `3264b908` test(api): share the generated POT client name across the POT tests
- `60f492e7` test(api): give the group POT test its own year so cleanup deletes the POT first
- `80ca421f` feat(save): saveAndReload tells a failed write from a failed reload
- `3979bb4f` feat(master-clients): client and group writes on the save contract
- `b3dbeffb` feat(master-pipelines): year and POT writes on the save contract
- `b255b4c9` feat(master-currencies): rate writes on the save contract
- `9a750107` feat(team): reads and writes through apiFetch and apiSave
- `10bf3972` test(api): strip UUID dashes without the date-guard pattern
- `c4cc6a10` feat(attribute-lists): writes through apiSave, reads through apiFetch
- `15c6ce16` docs(team): say which writes reload what after an unknown outcome
- `3d38dd93` test(test-cases): raise the case pins for the MDR cases
- `86f38e28` fix(master-data): Gate 3 round 1 — outcome handling after unknown writes and failed reloads
- `45bf5d87` fix(master-clients): no stale-list banner after a move that reloaded the groups

## Gate outcomes

- Gate 1: claims pre-check fixed one false predicate (`15c6ce16`). The first `npm test` was unusable (host overload: 71 vitest workers did not start) and had one real red, `js/lib/test-cases-parse.test.js` (case and section pins not raised for the MDR cases), fixed in `3d38dd93`. The second run had 130 files green; the 9 files that hit worker or 5 s timeouts were run alone, in sequence, green at the same HEAD. Backend unit tests 639/639, `run-tests.sh` 1247/1247 at `3d38dd93`. Site-export tests not needed; audit none.
- Gate 2: ordinary path, branch stack started at pre-flight (migration 038 applied to it by hand), acceptance checklist all positive, browser verification yes, stack torn down.
- Gate 3: round 1 = the plan's final review at `c4cc6a10` (7 Minor) + a scoped review of `c4cc6a10..3d38dd93` (1 Minor) + security review (0); user: "fix everything now" → fixed in `86f38e28` (F5 was already fixed in `15c6ce16`). Round 2 (scoped, `3d38dd93..86f38e28`): 1 Minor, fixed in `45bf5d87` under the same rule. Round 3 (scoped): 1 Minor; cap reached, user chose (b), follow-up. Disposition by target: 0 on specs/plans, 0 on pre-existing prose. Backend re-run: `run-tests.sh` green at `86f38e28` (1247/1247); no backend change after it.
- Gate 4: merged with a `--no-ff` merge commit `8d91fcd4` (main had not diverged), pushed; backup `backups/pdash-backup-2026-11-19-231913.dump`; migration 038 applied to `pdash-db` (no duplicates renamed, two indexes created); `pdash-api` restarted, healthy at 2026-11-19T22:20:04Z; worktree removed, branch deleted.
- Gate 5: `/sync-docs` updated 4 files not touched by the branch; one backlog row added, one closed.

## Code review follow-ups

- Round 3 — `moveTo` returns early when `client._moving` is already true, so `createGroup` after a failed group reload shows no banner and the client stays unmoved without a message (`js/pages/master-clients.js` line 292). → `docs/BACKLOG.md` B-565.

## Roadmap notes

- Rulings made during plan execution (SDD ledger, each with its cost if wrong):
  1. Task 1 ran `run-tests.sh` once at its green step, without the red run the plan asked for (PROCESS.md §6.2). Cost: the red evidence of the MDR cases is missing.
  2. Tasks 3-6 ran the touched and grep-found test files, not the whole `js/lib`. Cost: a missed file would surface at Gate 1 — none did, apart from the pin below.
  3. Task 7 ran no full suite (Gate 1 runs them). Cost: none.
  4. Task 5 adopts `res.data.rate` after `saveAndReload`, the row found again by code, before the `reloaded` check: the spec's "before the reload" is impossible because the reload runs inside the call. Cost: a successful reload's value is rewritten with the same value.
  5. `js/lib/dates-guard.test.js` was red on main since `save-c5-server-atomicity` (`test-api.js` stripped UUID dashes with `.replace(/-/g`); fixed here in `10bf3972` without touching the guard. Cost: an extra `run-tests.sh` at Gate 1.
- The plan's Task 1 added a `TEST_CASES.md` section without listing `js/lib/test-cases-parse.test.js`, whose exact pins every new case moves; it surfaced as Gate 1's red.
- Main's `dates-guard` red means `save-c5-server-atomicity` merged with a red `npm test` file, or ran it before that line landed.
- Deferred Minors from the task reviews, triaged "can wait" by the final review and not taken as Gate 3 follow-ups: fixed client fixture names `__test_pot_grp_c1__`/`c2__` in `test-api.js`; the `23505` handlers of `config.js`/`client-groups.js` not checking `err.constraint`; year 2093 queued twice for cleanup (a harmless 409 per run); an unused `e` in `saveAndReload`'s catch; `js/clients.js`'s modal and project-config's `saveClientModal` not reloading after an `unknown` outcome (a retry is safe: `NAME_TAKEN`/404); Review Focus 5 pinned by source order only; team's loaders may flash "Unauthorized" during a 401 redirect.
- The host was heavily loaded during Gate 1 (vitest environment setup 2000+ s across workers); worker-start timeouts are not test failures, but they cost a second full run.

## Sync-docs outcome

Scope pass: (1) ARCHITECTURE.md — yes, the API rows of clients, client groups and pipeline years and the schema note for migration 038; (2) CLAUDE.md — no, no file added/removed and no cross-cutting rule changed (the per-file narrative is in `docs/`); (3) TEST_CASES.md — already on branch (§34, MDR-01..08); (4) test-api.js — already on branch; (5) PRD — yes, `docs/prd/master-data.md`; (5c) manual — yes, `handbook/public/manual.md`; production checklist checked, nothing about this change; (6) PROCESS.md gate — none of the three conditions; (7) memory — yes.

Already on branch, checked against the code: `docs/api/config.md`, `docs/api/resources.md`, `docs/db/migrations.md`, `docs/js/lib.md`, `docs/pages/attribute-lists.md`, `docs/pages/config.md`, `docs/pages/project-config.md`, `docs/pages/team.md`, `handbook/restricted/TEST_CASES.md`.

Updated here:
- `handbook/restricted/ARCHITECTURE.md`: `NAME_TAKEN` on the client and client-group create/rename rows; `YEAR_IN_USE`/`YEAR_HAS_POTS` on the pipeline-year delete row; the two unique `lower(name)` indexes of migration 038 in the schema.
- `docs/prd/master-data.md`: group names are unique regardless of case (§7.3); a pipeline year with POT targets is refused by the server too (View A).
- `handbook/public/manual.md`: client and group names must be unique whatever the capitals.
- `docs/js/shared-libs.md`: the removed `Api.pipelineYears.create` note replaced by the removal of the master-data write methods.

## Memory outcome

- `project_save_contract_series.md`: description "…c5 server atomicity MERGED 2026-11-19 (`32437219`); next c6 master-data pages" → "…c6 master-data pages MERGED 2026-11-19 (`8d91fcd4`); next c7"; new c6 bullet (merge, migration 038, Gate 3 cap, dates-guard side fix, next c7).
- `MEMORY.md`: the Save-contract series line "next: c6 master-data pages" → "c6 master-data pages MERGED 2026-11-19 (`8d91fcd4`, migration 038 applied); next: c7 account/admin/rest".
