# Finish-cycle report — proposal-clone-followups

**Date:** 2026-10-16
**Branch:** proposal-clone-followups → main
**Execution started:** 2026-10-16 10:48  (pre-flight step 6)
**Merged at:** 2026-10-16 11:38  (Gate 4's merge commit)
**Gate durations:** Gate 1 3m · Gate 2 32m · Gate 3 14m · Gate 4 2m · Gate 5 ~8m — total ~59m
**Cycle counters:** subagent dispatches unknown (plan execution ran in an earlier session; this session: 3, all Gate 3 review rounds) · review rounds 3 · full test-suite runs unknown (this session: 2 — Gate 1 and Gate 5 step 3)
**Risk class:** high-risk (`docs/superpowers/plans/2026-10-16-proposal-clone-followups.md`) · review effort high
**Claims pre-check:** Gate 1 step 0 took about 1 minute over the only changed `.md` (`docs/BACKLOG.md`) and caught 1 mechanical defect (five closed rows lacked the `closed <date>` form the file uses). The Gate 3 re-checks cost about 2 minutes per fix round: they confirmed every predicate in round 1's doc fixes, but missed two defects that round 2's review then found — a false predicate born in round 1's own fix ("the retry could only fail") and a wrong identifier left in an edited sentence (`cgCreateNewVersion`). Round 1 had 7 findings, 2 of them mechanical (a false predicate, an incomplete caller list); round 2 had 5, 2 mechanical.

## What was done

8 commits:

- `283a484` fix: no POST fallback on a failed cost-grid upsert PATCH (B-004)
- `b32c680` feat: `cgCreateNewGrid`/`cgCloneGrid` return their outcome; pin clone order and payload (B-006)
- `b887dc0` fix: pipeline keeps New/Clone disabled until the page unloads after a success (B-003)
- `e9a0221` refactor: one `gridHasPublishedVersion` helper for both version-creation routes (B-005)
- `11e85d4` chore: drop dead clone data (B-001), bump `costgrid.js`/`api-sync.js`, close B-001/003/004/005/006, add B-085
- `96ed455` docs: BACKLOG closed rows carry their date (claims pre-check)
- `bbeeeeb` fix: Gate 3 round 1 — release `proposalBusy` on a bfcache restore; correct `costgrid.md`/`api-sync.md`
- `a7196d5` docs: Gate 3 round 2 — `api-sync.md` names `cgCreateNewVersionDirect` and states what the old POST retry did

## Gate outcomes

- Gate 1: claims pre-check fixed 1 defect; `npm test` passed (54 files / 1192 tests). `scripts/run-tests.sh` was not re-run: it passed 543/543 at `11e85d4` in the execution session, and the only commit since was `.md`-only.
- Gate 2: ordinary cycle; branch stack spun up; the user verified in the browser and answered yes. C2/D1/D2 (blocking a `PATCH` in DevTools) were not tried by hand — they rest on `js/lib/api-sync-upsert.test.js` and `js/lib/costgrid-clone.test.js`. Stack torn down after the yes.
- Gate 3: 3 rounds at high. Round 1: 7 findings, 3 fixed, 4 accepted as follow-up. Round 2: 5 findings, 2 fixed, 3 accepted as follow-up. Round 3: no findings — the reviewer's own manual check; the `/code-review` skill it started had not reported when it handed back, so round 3 is not a full skill run.
- Gate 4: `--no-ff` merge `517d773` (no divergence from main), pushed along with the 2 cycle-setup commits on main (`f94a50e` Brief+Spec, `5c0e0dc` Plan); DB backup `backups/pdash-backup-2026-10-16-113827.dump`; no migration; `pdash-api` restarted and healthy at 2026-10-16T09:39:08Z; worktree removed, branch deleted.
- Gate 5: sync-docs touched 4 repo files plus 7 BACKLOG rows; memory gained 1 file.

## Code review follow-ups

- Round 1 — orphan proposal when `versions.create` (create) or `saveStructure` (clone) fails after the grid exists, `js/costgrid.js` lines 857/971 → B-086
- Round 1 — "⚠️ Clone incomplete" warning wiped by the navigation on `pipeline.html`, `js/costgrid.js` lines 1006-1012 → B-087
- Round 1 — failed grid-name `PATCH` in autosave skips the version/structure save while the toast shows, `js/api-sync.js` line 163 → B-088
- Round 1 — minors: re-render on an unloading page, duplicated test extractor, serial awaits → B-089
- Round 2 — cancelled navigation leaves New/Clone disabled, `pipeline.html` lines 1012/1026 → B-090
- Round 2 — in-flight guards return `false` like a failure, `js/costgrid.js` lines 845/909 → B-091
- Round 2 — `DELETE /:id` inlines the non-Draft query with `!=`, `api/src/routes/cost-grids.js` line 340 → B-092

## Roadmap notes

- The Plan has no "File Structure" section, so Gate 4's out-of-scope check had nothing to compare against.
- `costgrid.html`'s `cloneProposal` still releases `proposalBusy` in a `finally`; round 1's reviewer judged it correct there, since the editor opens the clone in place rather than unloading. Documented in `docs/pages/costgrid.md`.
- Execution-session rulings (from the handoff): the SDD skill's `task-start`/`task-done` scripts do not run on this host, so the ledger was kept by hand; no Python on the host.

## Sync-docs outcome

- `TEST_CASES.md`: added P-79, P-80, CG-89, CG-90 (all `✓ (vitest)`); `js/lib/test-cases-parse.test.js` count raised 822 → 826.
- `docs/js/costgrid.md`: the `proposalBusy` sentence corrected; new section on the `Promise<boolean>` outcome of `cgCreateNewGrid`/`cgCloneGrid` (`?v=44`).
- `docs/pages/pipeline.md`: new section on New/Clone held after a success, the `pageshow` release and the uncovered cancelled-navigation case.
- `docs/js/api-sync.md` and `docs/pages/costgrid.md` were already updated on the branch (Gate 3 fixes).
- `ARCHITECTURE.md`: no change — no endpoint, table or architectural pattern changed (`gridHasPublishedVersion` is a private helper).
- `CLAUDE.md`: no change — the `_cgUpsertVersionToApi` row ("Write-through: pushes cost grid version to API") is still accurate.
- `test-api.js`: no change — no endpoint or auth change.
- PRD (`PRD.md` + `docs/prd/`): evaluated, not necessary — bug fixes restoring documented behaviour, no control added or removed.
- PROCESS.md gate: none of the three conditions applies; untouched.

## Memory outcome

- New: `project_sdd_scripts_windows_host.md` — the SDD `task-start`/`task-done` scripts do not run on this host and there is no Python; ledger by hand, edits via Edit/sed/node. `MEMORY.md` gained its index line.
- Evaluated, no change: `project_new_version_structure_copy_bug.md` (its "Clone proposal does not copy tags" item is untouched by this cycle), `project_ui_redesign_cycles.md`. No memory named this cycle; its open items live in `docs/BACKLOG.md` (B-085…B-092).
