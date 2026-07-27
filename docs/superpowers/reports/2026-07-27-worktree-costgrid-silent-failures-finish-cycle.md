# Finish-cycle report — worktree-costgrid-silent-failures

**Date:** 2026-07-27
**Branch:** worktree-costgrid-silent-failures → main

## What was done

3 commits, merged via `--no-ff` (main had not diverged since branch-off, so this was a fast-forward-eligible merge forced into a merge commit per process):

- `305a88f` fix(costgrid): surface a non-blocking warning when Clone's structure fetch fails silently
- `6b12f33` fix(costgrid): warn when showCostGridEditorView/renderCgVersionTabs run before _cgVueApp is ready
- `32fd2a8` fix(costgrid): also check structure-load result for Clone's source version and its early-return guards (Gate-3 fix)

This is "Cycle B2" of the two-cycle split confirmed for the `vue-migration-roadmap-cold-review`'s Cycle B recommendation (findings #13/#14) — hardening two silent-failure paths in `js/costgrid.js`/`js/api-sync.js`. "Cycle B1" (the separate, design-natured question of `js/costgrid.js`'s eventual architectural fate) has not been started.

`cgLoadStructureFromApi()` (`js/api-sync.js`) now returns `true`/`false` instead of always `undefined`, so callers can detect a failed load. `cgCloneGrid()` (`js/costgrid.js`) is the only caller updated to act on this: its *destination*-side load (after the new cost grid/version already exist server-side) shows a non-blocking "⚠️ Clone incomplete" warning on failure — the editor still opens either way, self-healing on the next successful load; its *source*-side load (before anything is created server-side) now blocks the clone entirely with an inline error on failure, matching the existing "Source proposal not found" pattern. `showCostGridEditorView()`/`renderCgVersionTabs()` gain a `console.warn` in their previously-fully-silent no-op branch when the `_cgVueApp` bridge isn't set yet — a currently-unreachable path, purely diagnostic for any future regression.

## Code review follow-ups

Gate 3 (full 8-angle review, since this diff — unlike the prior dead-code-cleanup cycle — introduces genuine new control flow, not a pure deletion) found 4 items. 2 were fixed in this cycle (commit `32fd2a8`, independently re-verified by the controller); 2 were explicitly accepted as follow-up by the user, each because a clean fix conflicts with one of this cycle's own Brief constraints:

- **Round 1, fixed:** `cgCloneGrid()`'s *source*-side structure load also discarded the new return value (same bug class as the destination-side fix, one call earlier in the same function) — fixed by blocking the clone with an inline error, matching the pattern already used for "Source proposal not found."
- **Round 1, fixed:** `cgLoadStructureFromApi()`'s two early-return guards (`!cg`, `!ver`) returned bare `undefined` instead of participating in the new `true`/`false` contract — fixed with explicit `return false` plus a `console.warn`, matching the `catch` block's existing style.
- **Round 1, accepted as follow-up:** a session-expiry (401) race — if the structure fetch fails because the session expired, `apiFetch` begins a redirect to `/login.html` and throws `Unauthorized`; `cgLoadStructureFromApi` catches this like any other failure and returns `false`, so the new "Clone incomplete" dialog can flash confusingly for a moment before the browser navigates away. A clean fix requires either making `cgLoadStructureFromApi` selectively re-throw for this one error type (violating the Brief's explicit "must not throw" constraint) or adding a richer failure-signal type beyond a boolean (violating the Brief's "no new abstraction" constraint) — flagged to the user as a genuine tension with this cycle's own scope rather than silently picking a side; accepted as a follow-up for a future cycle with a deliberately wider scope.
- **Round 1, accepted as follow-up (informational, no code change applied):** the new "⚠️ Clone incomplete" dialog reuses the shared `showConfirm()` component, which renders an OK/Cancel button pair even though neither button does anything different (no real choice exists) — this matches the Brief's own explicit instruction to reuse the existing idiom rather than invent a new one, and replicates an already-existing quirk in the codebase (`js/ai.js:517-520`'s identical "API Key required" dialog has the same mismatch) — not a regression this cycle introduces, and fixing it "properly" would mean introducing a new single-button informational modal type, which the Brief disallows.

## Roadmap notes

- This closes out "Cycle B2." "Cycle B1" (deciding `js/costgrid.js`'s eventual architectural fate — permanent shared Vanilla service layer vs. folding into `pipeline.html`'s own Vue instance) remains unstarted, per the cold review's original recommendation.
- The session-expiry race and the `showConfirm()` OK/Cancel affordance mismatch (both above) are now open follow-up items — the affordance mismatch, being a pre-existing pattern shared with `js/ai.js`, may be worth a single future cycle addressing both occurrences together if it's ever prioritized, rather than two near-identical small fixes.
- Remaining backlog from the original cold review, still unscheduled: Cycle C (pipeline/cost-grid product decisions: "New Proposal" flow never reproduced, delete-only-version UX, single-version tab label, Publish validation message) and Cycle D (known display bugs: phasing-panel rounding, Export XLS ExcelJS-missing — both already explicitly deferred by the user in their originating cycles).

## Sync-docs outcome

- **ARCHITECTURE.md**: added a note to the `js/api-sync.js` file-tree entry describing `cgLoadStructureFromApi()`'s new `true`/`false` return contract.
- **CLAUDE.md**: extended the `js/costgrid.js` file-structure entry to document both Clone-side fixes and the two bridge-function diagnostic warnings.
- **TEST_CASES.md** / **test-cases.html**: added CG-43 (destination-load failure → non-blocking warning, self-heals) and CG-44 (source-load failure → blocks Clone with inline error), mirrored exactly in both files.
- **test-api.js**: not touched — no API endpoint or auth changes.
- **PRD.md**: evaluated, not necessary — PRD.md documents Clone as a feature button but not its internal error-handling detail at this granularity; this cycle adds robustness to a failure path, not a documented product behavior change.
- **PROCESS.md gate**: none of the three trigger conditions applied (no process-skill change; the Gate-3 full-review choice here — as opposed to the prior cycle's scaled-down single-pass review — was made explicitly per-cycle based on this diff's actual content, not a recurring exception; no change to the 7-phase skeleton or scenario guardrails). Not touched.
