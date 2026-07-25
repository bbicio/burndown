# Finish-cycle report — worktree-costgrid-editor-vue-migration

**Date:** 2026-07-25
**Branch:** worktree-costgrid-editor-vue-migration → main

## What was done

16 commits (2 docs commits committed directly to `main` ahead of the branch, plus 14 commits + merge on the feature branch), migrating `costgrid.html` (the cost grid editor) from Vanilla JS to Vue 3 — the fourth Tier 2 page in the roadmap, following `project-config.html`/`portfolio.html`/`pipeline.html`'s pattern. Scoped to the editor itself; the Roles/Clients/Programs Registry modal migration was deferred (and their dead-code remnants deleted instead, since they had no reachable opener).

- `5cc4083` / `13598b2` — Brief, design spec, and 8-task implementation plan (docs-only, committed to `main` before the worktree/branch existed).
- `f25b30c` — Extracted `resolveRoleRate`/relocated `cgComputeTaskTotals`/`cgComputePhaseTotals`/`cgComputeGrandTotals`/`cgComputeColumnTotals` into `js/lib/costgrid-calc.js` (TDD, 16 new tests).
- `5ea0bdf` — Fix: `js/costgrid.js`'s own cache-bust bump missed + restored two pre-existing test blocks the extraction had silently deleted (task review finding).
- `4a0ee41` — Vue 3 skeleton, bridge functions (`renderCgEditor`/`renderCgVersionTabs`/`showCostGridEditorView` → delegate into the mounted Vue instance), toolbar, version tabs, offer-details form.
- `851c5ae` / `142c4df` — Fix: two page-specific nav-override functions and a `renderPipelineBoard()` fallback override, both dropped by Task 2's script rewrite, self-flagged by the implementer and restored.
- `75d9151` — Grid table shell + role column headers/rates.
- `c90bc2f` — Task/phase rows, selection mode, add-to-project bar.
- `ceba0a2` — Fix: Hours/PTC inputs wiped mid-keystroke for values starting with "0" (Vue's reactive `:value` binding forcing the DOM on every re-render) — both plan-mandated findings (this bug, plus an Italian "☑ liberi" button label) fixed per explicit user decision. New per-cell raw-string-while-editing pattern (`hoursEditing`/`ptcRaw`).
- `bd15b52` — Phasing panel, New Version/Clone modals, currency-change confirmation.
- `75693c2` — Vue-reactive Role Selector modal; deleted confirmed-dead `#rolesModal`/`#roleModal`/`#programsModal`/`#programEditModal` markup. Implementer found and corrected 3 factual errors in its own task brief (`#clientsModal`/`#clientEditModal` are actually live via `showClientsModal()`; `js/roles.js`/`js/clients.js`/`js/programs.js` define load functions the page's init still calls, not `js/api-sync.js`; `planning.html` had a dangling listener block) plus 1 real functional bug (`_cgRoleModalMode`/`_cgRoleModalSourceCode` not synced, would have made Change/Duplicate silently behave as Add) — all independently re-verified by the task reviewer.
- `dd1e558` — Fixed the Clone `duplicate key value violates unique constraint "tasks_pkey"` bug (TDD: `stripCloneTaskIds()` strips `taskId`/`phaseId` before `saveStructure()`, then re-fetches server-assigned IDs). Investigated the "New Proposal flow doesn't work" report a second time (live backend race-condition check, 5/5 clean; git-blame confirming the relevant code is untouched by this cycle) — still not reproduced/confirmed; correctly left unfixed per this project's process rule against fixing an unconfirmed cause.
- `70de48d` — Removed dead `cgPopulateRatecardDropdown()` (final-review cleanup; a paired suggestion to also drop `js/programs.js`'s script tag was investigated and correctly rejected — `loadProgramsFromApi()` lives there and is genuinely called on page init).
- `94e66fd` / `a3ac2ee` — Fixed 4 of 6 whole-branch code-review findings: **(Critical)** locked/Committed-version edit enforcement had been dropped entirely by the migration (no client-side disable, no server-side block) — restored across the grid table, the offer-details header form, and the role change/duplicate buttons, matching (and in one respect exceeding) the pre-migration `cgApplyEditorLock()`'s coverage, confirmed via a second review round; **(Important)** Client dropdown showed blank instead of "Unassigned" for a clientless grid (`null` vs `'__unassigned__'` mismatch) — fixed via a `clientIdInput` computed; **(Important)** the client list never refreshed after adding one via "+ New" — fixed via a `hidden.bs.modal` listener; **(Important)** `resolveRoleRate()` was extracted in Task 1 to deduplicate 3-tier rate logic but never actually adopted by `cgSyncRoleRatesToBaseline`/`cgPreviewRateChange` — now wired in.
- `12b9bce` — Merge to `main` (`--no-ff`), pushed.

## Code review follow-ups

Two `PLAUSIBLE` (not `CONFIRMED`) findings from the whole-branch code review were deliberately left as follow-up, not fixed in this cycle:
1. **Round 1** — `cgCloneGrid()` seeds the clone's in-memory `phases` as `[]` and depends on a follow-up `cgLoadStructureFromApi()` call that swallows its own errors (`console.warn` only); a transient fetch failure right after Clone could silently show an empty grid. Self-heals on page reload. `js/costgrid.js`, `cgCloneGrid()`.
2. **Round 1** — `showCostGridEditorView()`/`renderCgVersionTabs()` silently no-op if the `_cgVueApp` bridge reference isn't set yet, instead of erroring/queuing. No current caller triggers this (all real call sites run after Vue's `created()` hook completes), but it's a latent trap for any future caller that doesn't. `js/costgrid.js:174`.

## Roadmap notes

- **"New Proposal flow doesn't work correctly"**: still not reproduced or root-caused, after two full investigation rounds across two consecutive cycles (this one and the prior `pipeline.html` cycle). Static trace, a live 5-iteration backend race-condition check, and `git blame` on the relevant code (confirmed untouched by any commit in either cycle) all came back clean. This remains an open item — recommend a live-browser reproduction attempt (e.g. via `scripts/test-branch.sh up` + manual click-through, or Claude-in-Chrome against a running stack) in a future dedicated cycle if the report resurfaces, since neither migration cycle that investigated it could reproduce it from code alone.
- **Phasing panel hour rounding** (`Math.round(n*10)/10`, e.g. 0.25h displays as "0.3h"): confirmed via `git show` on the pre-migration source to be identical, pre-existing behavior — not a regression introduced by this migration. Deferred to its own future cycle at the user's explicit request (out of this cycle's Brief scope).
- **Roles/Clients/Programs Registry consolidation**: still deferred — no reachable entry point exists anywhere in the app today for the Roles Registry/Programs modals (confirmed dead a second time, independently, on both `costgrid.html` and `planning.html`). A real migration cycle for these can only happen if/when a reachable entry point is reintroduced.
- **`js/costgrid.js` still carries ~15 functions kept unchanged** for `pipeline.html`/`planning.html` compatibility (`cgPublishDraft`, `cgCreateNewVersion`, `cgCloneGrid`, `cgGenerateProject`, etc.) — this file's own eventual fate (full rewrite vs. permanent shared Vanilla service layer) remains deferred until `planning.html` (the last Vanilla consumer) is migrated.

## Sync-docs outcome

- **ARCHITECTURE.md**: updated the `costgrid.html`, `js/costgrid.js`, `planning.html`, and `js/lib/` file-tree entries for the Vue rewrite, the bridge pattern, the restored lock enforcement, the Clone fix, and `resolveRoleRate` adoption.
- **CLAUDE.md**: updated the Pages table, the `costgrid.html`/`js/costgrid.js`/`planning.html` file-structure entries, and the "Cost grid editor ↔ pipeline board integration", "Version tab switching", and "Clone" sections to reflect the Vue architecture and this cycle's fixes.
- **TEST_CASES.md** / **test-cases.html**: added CG-38 through CG-42 (Clone duplicate-key, Client dropdown "Unassigned" display, client-list refresh after "+ New", non-EUR custom-rate clear-to-restore, locked-version header-form enforcement) — mirrored exactly, 49 CG cases in both files.
- **test-api.js**: not touched — no API endpoint or auth changes in this cycle.
- **PRD.md**: not updated — every change in this cycle is either an internal Vue-migration refactor or a bugfix restoring previously-documented/intended behavior (Clone, locked-version enforcement, Client dropdown), not a new feature or changed user flow.
- **PROCESS.md**: not updated — none of the three trigger conditions applied (no process-skill changes, no recurring exception introduced, no change to the 7-phase skeleton or scenario guardrails).
