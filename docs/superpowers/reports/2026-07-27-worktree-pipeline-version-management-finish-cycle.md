# Finish-cycle report — worktree-pipeline-version-management

**Date:** 2026-07-27
**Branch:** worktree-pipeline-version-management → main

## What was done

6 commits, merged via `--no-ff` (main had not diverged since branch-off, so this was a fast-forward-eligible merge forced into a merge commit per process):

- `8e8ac2c` fix(costgrid): deleting a proposal's only version now deletes the whole proposal
- `985ec4b` fix(costgrid): show the version-tabs row even with only one version
- `acd1509` fix(costgrid): Publish failure shows a showConfirm() dialog instead of a native alert()
- `105c8f4` docs: add Task 4 to plan (Publish success reload) -- mid-cycle finding, user-approved
- `3b6ab8c` fix(costgrid): reload page after successful publish to ensure UI reflects new state
- `8ea77f8` fix(costgrid): remove now-dead renderCgEditor()/renderCgVersionTabs() calls before Publish reload

This is "Cycle C" of the `vue-migration-roadmap-cold-review`'s backlog. Of the 4 originally-listed items, "New Proposal flow doesn't work correctly" was investigated live by the user during Brief-drafting and confirmed working as expected — dropped from scope entirely, not carried into this cycle.

Three planned fixes: (1) `cgConfirmDeleteVersion()` now delegates to `cgConfirmDeleteGrid()` (deleting the whole proposal) instead of blocking with a native `alert()` when only one version remains; (2) the version-tabs row in both `costgrid.html` and `pipeline.html` is now always visible (`versions.length > 0` instead of `> 1`); (3) `cgPublishDraft()`'s failure path uses `showConfirm()` instead of a native `alert()`, fixing a real stale-state race (confirmed and root-caused during Brief-drafting: a local copy can remain stale relative to the backend, so a Publish attempt that's actually invalid can still reach the API, which correctly rejects it).

A 4th fix was added mid-cycle, during this cycle's own Gate 2 manual verification: the user reported that a successful Publish didn't visibly update the UI without a manual page reload. Investigated live and root-caused to a genuine Vue-reactivity gap — `_cgDraft.pipeline` is mutated via the raw global reference, bypassing Vue's proxy-based change detection, so the `isDraft` computed (driving Draft-only button visibility) never invalidates. Fixed by adding `window.location.reload()` to the success path (user-chosen "Option A" over a narrower reactive-write fix), with the now-superfluous `renderCgEditor()`/`renderCgVersionTabs(tabs)` calls removed in a Gate-3 follow-up commit once the reload made their output unobservable.

## Code review follow-ups

Gate 3 (full 8-angle review, since this diff has genuine new logic across 4 fixes) found 6 items. 1 was fixed in this cycle (commit `8ea77f8`); 5 were explicitly accepted as follow-up by the user:

- **Round 1, fixed:** `renderCgEditor()`/`renderCgVersionTabs(tabs)` calls immediately preceding the new `window.location.reload()` were confirmed dead work by 3 independent angles (Efficiency, Reuse, Altitude, Simplification) — their output is discarded before any repaint. Removed, leaving only the state mutation and the reload.
- **Round 1, accepted as follow-up:** the full-page reload is disproportionately expensive — it re-triggers `costgrid.html`'s entire `created()` init sequence (auth check, clients/programs/roles/currencies, all projects, all cost-grid metadata — roughly 7-8 HTTP round trips) to reflect a 2-field change (`pipeline`, `pipelineYear`) the success handler already has in hand.
- **Round 1, accepted as follow-up (unverified, needs investigation):** the Altitude angle raised a real question — whether the pre-existing `renderCgEditor()` → `_cgVueApp.resyncFromGlobals()` → `$forceUpdate()` mechanism (already used, per that angle's claim, by `cgDoGenerateProject`/`cgDeleteLinkedProject` for the identical "`_cgDraft` mutated via raw reference" bug class) would have fixed the Publish staleness without a reload. The controller could not verify empirically whether that mechanism genuinely re-evaluates a stale Vue `computed` (like `isDraft`) or whether the cited precedent functions carry the same latent bug, just never reported. Deferred to a future cycle if this is worth the investigation.
- **Round 1, accepted as follow-up (pre-existing, low-priority):** `showConfirm()`'s `onConfirm` fires synchronously and `modal.hide()` runs immediately after without awaiting the async callback — a failure-path `showConfirm()` call (the new Publish-failed dialog) could theoretically show while the outer "Publish to SIP?" modal is still mid-hide-transition. Confirmed this is a pre-existing characteristic of the shared `showConfirm()` utility (`js/core.js`), used identically by every other async-confirm flow in `js/costgrid.js` — not newly introduced by this diff, just newly exposed on this specific error path (which previously used `alert()`, an unrelated browser API with no dependency on Bootstrap's modal state).
- **Round 1, accepted as follow-up (narrow edge case):** failure-path asymmetry — if the `otherDrafts`-deletion loop partially succeeds and a later step fails, `_cgStore` may continue showing already-server-deleted drafts until a manual reload, inconsistent with the new self-healing success path.
- **Round 1, accepted as follow-up (doc-sync, already addressed in this same cycle's Gate 5, not a code fix):** `CLAUDE.md`'s prior wording documenting the old `versions.length > 1` threshold — corrected during this cycle's own sync-docs step.

## Roadmap notes

- A new finding surfaced live during this cycle's own Gate 2 (not from the original cold-review backlog): every Vue page in the app lacks `v-cloak` (confirmed via repo-wide grep — zero occurrences), so a full-page reload/load briefly shows raw, uncompiled template markup (a "flash of unstyled/uncompiled content," FOUC) before Vue mounts and evaluates its `v-if`/`v-else-if` directives. This was previously rarely visible (full reloads were rare in normal SPA-style usage) but is now more likely to surface given this cycle's own Task 4 (`window.location.reload()` after Publish). User explicitly asked for this to be isolated as its own future Brief, **scoped repo-wide** (not limited to `costgrid.html`), ideally with a centralized fix rather than a per-page patch — noted here as a candidate for a future cycle, not investigated further in this one.
- This closes "Cycle C" of the cold-review backlog (with its 4th original item dropped after live confirmation it works correctly). Remaining backlog, still unscheduled: Cycle D (phasing-panel rounding, Export XLS ExcelJS-missing — both already explicitly deferred by the user in their originating cycles) and the two Cycle B2 follow-ups (session-expiry race in Clone's structure-load warning, `showConfirm()` OK/Cancel affordance mismatch).
- During Gate 4's merge, a stray uncommitted change was found in the main checkout's working tree (`js/costgrid.js`, matching an early/partial version of this cycle's own Task 1 and Task 3 edits) — almost certainly left by a subagent that briefly edited the wrong checkout during dispatch (a recurring, previously-documented issue in this project). Confirmed safe to discard (no unique work — main's commit history was clean at the expected pre-flight commit, and the stray content was already fully and correctly captured in the feature branch's own commits) before proceeding with the merge.

## Sync-docs outcome

- **CLAUDE.md**: fixed the stale `cg.versions.length > 1` version-tabs description (now correctly `> 0`, always visible); extended the `js/costgrid.js` entry to document all 4 fixes from this cycle.
- **ARCHITECTURE.md**: no update needed — it doesn't independently describe these specific behaviors at the same granularity as `CLAUDE.md`.
- **PRD.md**: updated — the detail-panel header description previously said version tabs appear "when the cost grid has more than one version" (now inaccurate); corrected to describe the tabs as always visible, plus a new sentence documenting that deleting the only version deletes the whole proposal. No Publish-flow documentation exists in PRD.md at a comparable level of detail, so nothing else needed updating there.
- **TEST_CASES.md** / **test-cases.html**: added CG-45 through CG-48 covering all 4 fixes, mirrored exactly in both files.
- **test-api.js**: not touched — no API endpoint or auth changes.
- **PROCESS.md gate**: none of the three trigger conditions applied (no process-skill change; the full 8-angle Gate-3 review used here was a deliberate per-cycle choice given the diff's genuine new logic, not a *new* recurring exception; no change to the 7-phase skeleton or scenario guardrails). Not touched.
