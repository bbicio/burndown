# Finish-cycle report — worktree-pipeline-vue-migration

**Date:** 2026-07-22
**Branch:** worktree-pipeline-vue-migration → main

## What was done

11 commits, migrating `pipeline.html` (the kanban pipeline board) from Vanilla JS to Vue 3 (CDN, no build step) — the third Tier 2 page in the roadmap, following `portfolio.html`/`project-config.html`'s pattern.

- `65d517f` — Extracted `pbGetVersionBudget`/`pbComputeColumnTotals`/`pbFmtMoney`/`pbFmtDate`/`pbFmtTaskDate`/`pbComputePotPercentages` into `js/lib/pipeline-calc.js` (TDD, 21 new tests).
- `cc86d2f` — Vue 3 skeleton, kanban board rendering, pipeline-year dropdown + page init.
- `a14da6c` — Detail panel: offer info, linked projects, phases/tasks.
- `8199046` — Fix: guard detail panel visibility on `selectedVersion`, not just `selectedCgId` (caught by task review).
- `0b727b0` — POT section, version tabs, action buttons, refresh-rate flow.
- `64650c3` — Fix: delete-proposal button threw `ReferenceError: renderPipelineBoard is not defined` (found via manual browser testing) — `cgConfirmDeleteGrid` gained an optional `onSuccess` param, mirroring `cgConfirmDeleteVersion`'s existing pattern.
- `4f2e621` — Bumped `js/costgrid.js`'s cache-bust version (`?v=2`→`?v=3` on pipeline.html/planning.html, `?v=24`→`?v=25` on costgrid.html) so the above fix reaches users without a hard refresh.
- `7bea3b0` — Fix: restored outside-click-to-close for the detail panel (an acceptance criterion from the brief, omitted from the implementation plan's Task 4 spec, found via manual testing).
- `9f0132b` — Fix: detail panel's Edit button navigated with `cgId=null&verId=null` (a `closeDetailPanel(); showCostGridEditorView(...)` sequencing bug — the first call nulled the reactive properties the second call then read).
- `cb554c8` — Fix: the new outside-click handler was firing for clicks inside modals spawned from the panel (Share/Clone/Confirm), since those modals live outside `#pbDetailPanel` in the DOM — found by the final whole-branch code review's line-by-line angle, confirming the exact anomaly reported during manual testing.
- `5a5cef5` — Fixed all 8 remaining whole-branch code-review findings: detail-panel loading spinner + explicit load-failure message (both dropped from the original `pbOpenDetailPanel`), replaced a native `alert()` with `showConfirm()` in the refresh-rate error path, restored the card hover box-shadow, deleted the now fully-orphaned `js/pipeline-board.js` (760 lines), guarded `cgImportAll()`'s `renderPipelineBoard()` call against the same footgun class already fixed for delete, and hoisted a duplicated `projsByRef` filter into its own computed.

## Code review follow-ups

None outstanding — every finding from the whole-branch code review (8 angles, run at medium effort) was fixed in this same cycle (commit `5a5cef5`), except one considered-and-rejected item: unifying `potFmtMoney` with `pbFmtMoney` was deliberately left alone, since the POT section's whole-euro/no-decimal/`en`-locale formatting is original pre-migration behavior (`js/pipeline-board.js:708`), not new duplication — merging it would be a visible, unrequested product change, not a safe refactor.

## Roadmap notes

- **Delete-the-only-version UX**: when a proposal has exactly one version, deleting it from the detail panel is blocked with "Cannot delete the only version of a Cost Grid. Delete the entire Cost Grid instead." (existing, unmodified business rule in `js/costgrid.js`, shared with `costgrid.html`/`planning.html`). User feedback during manual testing: since every proposal should always have at least a v1, this could instead auto-delete the whole proposal rather than blocking — a real product decision, not a migration bug, deferred to its own cycle (touches shared code used by two not-yet-migrated pages).
- **Version tabs always showing "V1"**: currently the version-tab row only renders when `cg.versions.length > 1` (matches the original design). User feedback: even a single-version proposal should show its "V1" label in the panel somewhere. Deferred as a UX enhancement, not part of this migration's 1:1-parity scope.
- **New Proposal flow doesn't work correctly**: reported during manual testing but explicitly deferred by the user to be investigated alongside the future `costgrid.html` migration cycle, since it likely involves the shared `cgCreateNewGrid()`/New Proposal modal flow.
- **Clone — `duplicate key value violates unique constraint "tasks_pkey"`**: reproduced when cloning a version whose phase/task structure was already loaded into memory (real task UUIDs present) via `cgCloneGrid()`'s `saveStructure` call. Confirmed pre-existing, shared code (`js/costgrid.js`, byte-for-byte unmodified by this branch) — likely a backend issue with how `saveStructure` handles task ID reuse on clone. Not investigated further per this cycle's scope; candidate for a dedicated bugfix cycle.
- **Publish — "Only Draft versions can be published"**: surfaced once during manual testing (native browser alert, from unmodified `js/costgrid.js`/backend validation), not reproduced/investigated in depth — flagged for awareness, not a confirmed bug.
- `js/pipeline-board.js` is deleted in this cycle (confirmed fully orphaned by 3 independent code-review angles) — no further action needed.

## Sync-docs outcome

- **ARCHITECTURE.md**: updated the `pipeline.html` file-tree entry (Vue 3, folds in the former `js/pipeline-board.js`), removed the dead `js/pipeline-board.js` entry, added `pipeline-calc.js` under `js/lib/`.
- **CLAUDE.md**: updated the Pages table, the file-structure list (`pipeline.html` entry rewritten, `js/pipeline-board.js` entry removed, `js/lib/pipeline-calc.js` entry added, `js/costgrid.js` entry's `cgConfirmDeleteGrid`/`cgImportAll` notes updated), "Pipeline stage: single source of truth", "Linked project resolution", "Cost grid editor ↔ pipeline board integration", "Detail panel" (rewritten for the Vue rewrite's loading/error states and the modal-click-through fix), and "Clone" sections.
- **TEST_CASES.md** / **test-cases.html**: added P-40 through P-45 covering the bugs found and fixed this cycle (delete-from-card, Edit null-params, outside-click-vs-modals, detail-panel loading/error states, refresh-rate error modal); updated P-38's wording to drop the now-removed `_pbOutsideClickHandler`/`pbOpenDetailPanel` symbol names.
- **test-api.js**: not touched — no API endpoint or auth changes in this cycle.
- **PRD.md**: not updated — this cycle is a 1:1 behavioral-parity migration (Vanilla JS → Vue 3), not a new user-facing feature; the bug fixes restore documented behavior rather than changing it.
- **PROCESS.md**: not updated — none of the three trigger conditions applied (no process-skill changes, no recurring exception introduced, no change to the 7-phase skeleton or scenario guardrails).
