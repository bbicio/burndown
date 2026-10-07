# Finish-cycle report — worktree-proposal-create-clone-direct

**Date:** 2026-10-07
**Branch:** worktree-proposal-create-clone-direct → main (merge `d0010a3`, `--no-ff`; main had not diverged)

## What was done

4 commits (New Proposal / Clone without modals, Clone "__unassigned__" bug fix, API version rule — brief `docs/superpowers/briefs/2026-10-07-proposal-create-clone-direct-brief.md`, spec `docs/superpowers/specs/2026-10-07-proposal-create-clone-direct-design.md`, plan `docs/superpowers/plans/2026-10-07-proposal-create-clone-direct.md`; executed inline on Sonnet 5, `superpowers:executing-plans`):

- `1f5c2cc` feat(api): refuse new versions on a published proposal (sysadmin exempt)
- `65e3dc4` feat(pipeline): New Proposal and Clone open the editor directly; clone sends a valid client id
- `ea4ed4c` docs: New Proposal / Clone without modals, version rule
- `4ba3315` fix(pipeline): skip the clone autosave flush for a viewer (final review fix)

Gates: Gate 1 passed (frontend `npm test` 695/695 native, backend `scripts/run-tests.sh` 543/543 — both re-run clean at `/finish-cycle` time too, after the final-review fix). Gate 2: isolated branch stack, user verified in the browser (the plan's 5-point checklist plus the viewer-clone fix), stack torn down after the user's "yes". Gate 3 skipped (see Roadmap notes). Gate 4: DB backup `backups/pdash-backup-2026-10-07-023943.dump` (116K), merged and pushed, no migration, `pdash-api` restarted and healthy (started 2026-10-07T00:43:34Z), worktree removed, local branch deleted.

## Code review follow-ups

From the final whole-branch review (Opus, `9ebb53a..ea4ed4c`), one Important finding was fixed before merge (see below); accepted as follow-up:

- Dead Vue data left in `costgrid.html` (`cloneGridName`, `cloneError`, `cloneSourceName`) from the removed modal.
- `CLAUDE.md`'s "Detail panel" section (line ~443, unrelated to this cycle's own doc edits) still describes Clone as opening `#cgCloneModal` via `openCloneModal` — stale, not fixed in this pass.
- A narrow double-click window in `pipeline.html`: `proposalBusy` resets to `false` as soon as `cgCreateNewGrid`/`cgCloneGrid` resolve, before `window.location.href`'s navigation actually unloads the page, so a click in that gap could start a second create/clone.
- On a transient upsert failure during the clone's autosave flush, the error shown can be "A published proposal cannot get a new version." (from the new API rule's fallback path) instead of the real cause.
- The `hasPublishedVersion` SQL is duplicated across the two `cost-grids.js` routes (`POST /:id/versions` and `.../duplicate`) — a small helper would prevent future drift.
- No broader behavioral test yet for the clone flow's ordering (flush → source load) beyond the new permission-branch test (`js/lib/costgrid-clone.test.js`); `cgApiClientId`'s wiring into the clone payload is unit-tested but not covered end-to-end.

## Roadmap notes

- **Gate 3 skipped (PROCESS.md §6.4):** the final whole-branch review at `ea4ed4c` covered `main...HEAD`; its one Important finding (see below) was fixed and verified with a new TDD test plus both full suites green, inline in the same session — no second review round needed per the `executing-plans` skill's final-review process.
- **Final-review fix (Important, found and fixed before merge):** cloning from `costgrid.html` as a **viewer** regressed — the new "flush the pending autosave before cloning the open version" step (added for Gate 2 item 4, carrying latest edits into the clone) tried to `PATCH`/`POST` the source grid on the viewer's behalf, which 403'd and aborted the whole clone (previously, before this flush existed, a viewer's clone worked fine). Fixed by skipping the flush when the source grid's `myPermission` is `'viewer'`; a new test (`js/lib/costgrid-clone.test.js`, extracting `cgCloneGrid` the same way the existing `costgrid-new-version.test.js` does) pins both the owner and viewer branches.
- **Process note:** this was the first cycle in this project explicitly executed **inline** (`superpowers:executing-plans`, no per-task subagent review) rather than subagent-driven, on a small 3-task plan, per PROCESS.md §6.1 — the user switched the session model to Sonnet 5 for implementation and back to Opus for the final review and this closeout.
- **Pre-existing, unaffected by this cycle:** the sentinel-cleanup pattern (`'__unassigned__'` → `null`) now exists in three places (`js/api-sync.js`'s project-save path, `js/lib/costgrid-calc.js`'s new `cgApiClientId`, and the version-metadata path inside `_cgUpsertVersionToApi`) — a future cleanup could consolidate them, but they are not call-compatible today without a larger refactor, so this was not attempted here.
- **Next:** no specific follow-up cycle was opened by this one; the memory note that tracked "clone bug + API version rule" as a pending item has been retired (see Memory outcome).

## Sync-docs outcome

- **TEST_CASES.md / test-cases.html:** P-08, P-09, P-28, P-42 updated (New Proposal/Clone act without a modal); CG-21, CG-22 (unchanged), CG-23 (reworded: the autosave flush is now intentional, not just "safe"), CG-56, CG-57, CG-44 updated (no modal, errors via the app's info modal). New cases: P-77 (focus=name flow), P-78 (clone with no client), CG-71 (API version rule, auto ✓ via test-api VR-01..VR-04), CG-72 (viewer-clone fix). Verified the inline script in `test-cases.html` still parses (`node --check`) after the edits.
- **PRD.md:** updated (user-visible) — §4.5 "+ New Proposal" button (no name prompt), §4.9 Clone bullet (no name prompt, names the copy, notes the autosave flush and what isn't copied). The API version rule is **not** documented in PRD — it has no UI-reachable path (Clone always creates a new grid, never a version on an existing one), so it is internal hardening, not user-visible behavior, per the PRD update criteria.
- **`.claude/skills/operational-manual/SKILL.md` (6b):** the Board toolbar and Editor toolbar bullets updated to match the PRD's New Proposal/Clone changes.
- **ARCHITECTURE.md:** no entries needed updating — it has no granular per-route detail for these endpoints or UI flows to go stale.
- **CLAUDE.md, docs/js/costgrid.md:** already updated inside the branch (Task 3); the detail-panel line noted stale above (deferred follow-up) was not touched in this branch, so not re-verified here.
- **test-api.js:** already extended inside the branch (VR-01..VR-04); no change.
- **PROCESS.md:** gate answered "none" — no process-skill change, no new recurring exception, no change to the 7-phase skeleton or a scenario's guardrails. This cycle's own execution-method choice (inline, per §6.1's existing small-cycle rule) is an application of an already-documented rule, not a new one.

## Memory outcome

- `project_clone_proposal_bug.md`: **deleted** — every item it tracked (the clone bug, the no-modal change, the API version rule) is now merged; nothing left pending. Its `MEMORY.md` index line removed accordingly.
- `project_ui_redesign_cycles.md`: the Pipeline cycle 2 paragraph's "server enforcement deferred to the clone-bug cycle, see [[project-clone-proposal-bug]]" → "server enforcement added 2026-10-07 in the clone-proposal-direct cycle, merge `d0010a3`" (the link target no longer exists, replaced with the fact itself).
- Unverified — needs the user: none surfaced by this cycle.
