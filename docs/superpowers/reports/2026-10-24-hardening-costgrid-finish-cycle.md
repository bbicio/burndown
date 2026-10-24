# Finish-cycle report — hardening-costgrid

**Date:** 2026-10-24
**Branch:** hardening-costgrid → main
**Execution started:** 2026-10-23 17:17  (pre-flight step 6)
**Merged at:** 2026-10-24 12:52  (Gate 4's merge commit `20a8232`)
**Gate durations:** Gate 1 57m · Gate 2 28m · Gate 3 1071m · Gate 4 21m · Gate 5 7m — total 1184m
**Cycle counters:** subagent dispatches unknown (this session: 3) · review rounds 3 · full test-suite runs unknown (this session: 4 `npm test`, Gate 5 included, + 3 `scripts/run-tests.sh`)
**Risk class:** high-risk (`docs/superpowers/plans/2026-10-23-hardening-costgrid.md`) · review effort high
**Claims pre-check:** at Gate 1 it took about 2 minutes and caught 1 defect, an incomplete enumeration: B-092's closing cell named two callers of `gridHasPublishedVersion` and there are three. The Gate 3 re-checks took about 3 minutes in round 1 and caught 1 defect before commit, a false predicate: a B-089 cell credited test-api VR-01 with covering the duplicate route, but VR-01 does not exercise it. Round 2 changed no `*.md`, so it had nothing to re-check. Of round 1's 11 findings, 3 were mechanical: the false B-089 closing claim, `docs/js/costgrid.md` naming deleted functions, and B-029's closing grep being blind to `v-else-if`.
**Acceptance:** 16 Spec criteria listed (no `TEST_CASES.md` case added or modified on the branch) · all 16 reported verified with a positive outcome by the user. Criteria 1, 2, 8 and 9 were checked in the browser on the branch stack. The others were ticked on the basis of the green suites, which the user accepted. Criterion 11 had been suggested as not verifiable in the UI, but the user reported it passed.

## What was done

16 commits:

- `4868f7f` test: one shared source extractor for the classic-script tests (B-089)
- `b972150` test: characterize PUT structure saves with a linked task
- `f3288ae` feat(api): refuse a structure save that drops a linked task (B-043)
- `c659c74` refactor: one task-assigned predicate; deleteTask refuses an assigned task (B-047, B-043)
- `2134eea` fix(costgrid): hide and guard structural controls for viewers (B-029)
- `5ae5b07` fix(nav): build Send Notification recipients as text, not markup (B-051)
- `c680de5` fix(costgrid): reset role menu on version switch, refresh share summary, unique version label, one selection helper (B-044..B-048)
- `473379c` fix(pipeline): no orphan proposal on a failed create/clone, readable clone warning, busy state released (B-086, B-087, B-089, B-090, B-091)
- `1379ae4` fix(costgrid): a failed name save no longer skips the version save; toast only on success (B-088)
- `e0a3325` refactor(api): reuse gridHasPublishedVersion, parallel checks on version create (B-089, B-092)
- `372e6ba` test: pin the published-proposal DELETE refusal (B-092)
- `8ff249a` chore: bump versioned assets, close B-029/B-043/B-044..B-048/B-051/B-086..B-092
- `afe42b1` docs: B-092 closing cell names all three gridHasPublishedVersion callers
- `638f287` test: follow the asset bump and the isReadOnly gate in proposal-modals-guard
- `cc71f14` fix: Gate 3 round 1 — viewer Generate project, STRUCTURE_RULE notice, honest Save label
- `ddbea15` fix: Gate 3 round 2 — editor Clone honours the in-flight null, drop a dead modal guard

## Gate outcomes

- **Gate 1:** passed on the second attempt.
  - The first run was red. `js/lib/proposal-modals-guard.test.js` pinned `?v=` values from before `8ff249a`, and a regex that did not accept the new `isReadOnly` gate.
  - Fixed in `638f287`, then `/finish-cycle` was restarted from the top.
  - Result: 1588/1588 vitest, 555/555 `scripts/run-tests.sh`.
- **Gate 2:** ordinary cycle.
  - The branch stack was spun up at the user's request. The user ticked all 16 acceptance criteria and answered "yes" to the browser question, and the stack was then torn down.
  - The background `/code-review` was launched at step 0.
- **Gate 3:** 3 rounds at high effort.
  - **Round 1:** 11 findings. 7 were fixed (`cc71f14`), 4 accepted as follow-up, no frozen-file disposition.
  - **Round 2:** 3 findings. 2 were fixed (`ddbea15`). One of them withdrew round 1's fix 5, which was dead code. 1 accepted as follow-up.
  - **Round 3:** 2 findings, both accepted as follow-up. The `docs/api/lib.md` gap was routed to `/sync-docs`.
  - No fix was applied after round 3, so the cap question did not arise.
- **Gate 4:**
  - Merged with a `--no-ff` merge commit `20a8232`; main had not diverged.
  - Backup taken: `backups/pdash-backup-2026-10-24-125211.dump`.
  - Pushed. The push also carried the brief/spec/plan commits `2b18d1c`, `6766235` and `b061357`, which were local only until then.
  - No migrations.
  - pdash-api restarted and healthy at `2026-10-24T10:52:49.919147048Z`.
  - Worktree removed, branch deleted.
  - The out-of-scope check was skipped: the Plan has no "File Structure" section (files are declared per task).
- **Gate 5:** `/sync-docs` updated 13 files, including the operational-manual reference. 5 BACKLOG rows were added (B-124..B-128).

## Code review follow-ups

- Round 1 — the `STRUCTURE_RULE` server check ignores name-only links (`task_names_direct`); the Spec chose ids only. `api/src/routes/cost-grids.js` line 685 → B-124.
- Round 1 — the 5 s `PB_PROPOSAL_FALLBACK_MS` can re-enable New/Clone during a slow navigation, allowing a duplicate proposal. `pipeline.html` lines 1015, 1031 → B-125.
- Round 1 — `cgIsTaskAssigned` uses a linear scan instead of Sets (efficiency nit). `js/lib/costgrid-calc.js` line 4 → B-126.
- Round 1 — `extractBlock` counts raw braces, so it is confused by string or regex literals. `scripts/lib/extract-source.mjs` → B-127.
- Round 2 — `_cgStructureRuleNotified` is never cleared, so a second refusal of the same version shows no notice. `js/api-sync.js` line 156 → B-128.
- Round 3 — `docs/api/lib.md` had no `structure-rules.js` entry, and its `version-lock.js` paragraph did not list the structure PUT. Resolved by this cycle's `/sync-docs`, so no BACKLOG row.
- Round 3 — `extractBlock` does not check for a missing `)` after `head`. `scripts/lib/extract-source.mjs` line 7 → merged into B-127.

## Roadmap notes

- **The SDD ledger was lost.** `.superpowers/sdd/2026-10-23-hardening-costgrid/progress.md` (deferred minors and rulings from Task 0-10) lived only in the worktree. It is gitignored, and `git worktree remove` at Gate 4 step 8 deleted it before this report could copy it. Any minor it deferred is therefore not in this report or in `docs/BACKLOG.md`. The lesson is recorded in memory (read the ledger before removing the worktree).
- **The task-by-task verification did not run the full suite after the asset bump.** Gate 1's first red came from `proposal-modals-guard.test.js`, a guard that `8ff249a` should have updated.
- **A round-1 finding was not a real defect.** Round 1's finding 5 (missing `#confirmModal` null check) led to a dead guard plus a test that passed only because `showInfo` was stubbed. `showInfo` dereferences the modal first. Round 2 removed both.
- **The Spec has a gap (frozen, not edited).** `docs/superpowers/specs/2026-10-23-hardening-costgrid-design.md` did not require a `STRUCTURE_RULE` refusal to be shown to the user. Round 1 found it and the fix added the notice.

## Sync-docs outcome

Updated:
- `ARCHITECTURE.md`: §5 structure route notes the `STRUCTURE_RULE` 400; the directory tree gains `scripts/lib/extract-source.mjs`.
- `docs/api/lib.md`: new `structure-rules.js` section; the `version-lock.js` paragraph now lists the structure PUT as a lock taker.
- `docs/js/lib.md`: `cgIsTaskAssigned`/`cgFreeTasksOf`.
- `docs/js/costgrid.md`: hardening section; the stale "in-flight returns false / costgrid.html ignores it" sentence corrected.
- `docs/js/api-sync.md`: name save no longer blocks; STRUCTURE_RULE notice.
- `docs/js/nav.md`: recipients built as text.
- `docs/pages/costgrid.md`: viewers, linked tasks, editor follow-ups.
- `docs/pages/pipeline.md`: fallback timer and null answer; the stale "Not handled" sentence corrected.
- `TEST_CASES.md`: CG-88 updated (the known gap is closed); CG-91..CG-93 and NT-24 added.
- `js/lib/test-cases-parse.test.js`: count pin 835 → 839.
- `docs/prd/access.md`: §18.4 gains a proposal-editor row.
- `docs/prd/pipeline.md`: Save/toast outcome, STRUCTURE_RULE notice, unique default version label.
- `.claude/skills/operational-manual/SKILL.md`: reconciled from `docs/prd/pipeline.md` and `docs/prd/access.md` §18.4.

Not updated:
- `CLAUDE.md`: no route or file whose index entry changed. `scripts/lib/extract-source.mjs` is a dev test helper, listed in ARCHITECTURE's tree rather than growing the pinned File Structure block.
- `test-api.js`: SR-01..SR-06 and VR-02b already added on the branch.

Gates:
- **PRD:** updated (`docs/prd/access.md`, `docs/prd/pipeline.md`); user-visible because the viewer controls are hidden and there is a new notice and button state.
- **PROCESS.md gate:** none of the three conditions applies, so it was not touched.

## Memory outcome

- `project_costgrid_custom_form_controls_cycle.md`: "a viewer can still trigger the structural controls…" → struck through, marked CLOSED 2026-10-24 as B-029 by hardening-costgrid (`20a8232`); the remaining items are labelled B-030.
- `project_ui_redesign_cycles.md`: "possible stored XSS (pre-existing): … separate hardening item" → "CLOSED 2026-10-24 by hardening-costgrid (merge `20a8232`)".
- `feedback_worktree_removal.md`: added the lesson to read the gitignored SDD ledger before `git worktree remove`.
- `MEMORY.md`: updated the hooks for the custom-form-controls line (viewer item closed) and the Worktree Removal line.
- Unverified: none.
