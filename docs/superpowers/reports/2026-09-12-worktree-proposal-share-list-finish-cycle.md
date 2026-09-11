# Finish-cycle report — worktree-proposal-share-list

**Date:** 2026-09-12
**Branch:** worktree-proposal-share-list → main

## What was done

2 commits (bounded-path implementation, no plan document):

- `b2b2e89` feat: inline shared share-list component in pipeline detail panel and costgrid editor
- `7a33b4c` fix: register openShareModal as a Vue method on costgrid.html

Adds `js/share-list-component.js` (`window.ShareListComponent`), a reusable Vue component showing a "who has access" list for a proposal with a remove-share action, reusing the existing `GET /api/cost-grids/:id/shares` / `DELETE /api/cost-grids/:id/shares/:userId` endpoints — no backend changes. It is registered on both `pipeline.html`'s sliding detail panel and `costgrid.html`'s full-page editor (`costgrid.html` previously had zero sharing UI at all — no Share button, no owner name, no share list). Both pages also now show the proposal owner's name (previously only shown on the pipeline board's kanban cards). Adding a new share stays exclusive to the existing `#shareModal` (`js/shares.js`), unmodified. Both apps listen for `#shareModal`'s `hidden.bs.modal` event to force the inline list to refetch after a change made through the modal.

Investigation this cycle (before implementation) also confirmed, and is now documented: sharing a cost grid does not grant access to its linked project — `resource_shares` scopes `cost_grid`/`project` shares independently, with no cascade in either `cost-grids.js` or `projects.js`.

## Code review follow-ups

Round 1 (`general-purpose` subagent, medium effort, scoped to `main..HEAD`): 0 Critical, 0 Important, 2 Minor — both accepted as follow-up, not fixed this cycle:

1. `js/share-list-component.js:65` — `removeShare()`'s failure path uses a native `alert()` rather than this project's `showConfirm`/`showInfo` modal idiom. Not a new inconsistency — `js/shares.js:314`/`:330` (pre-existing, unmodified) already use the identical pattern for the same failure case. If that file is ever migrated to `showInfo()`, update this component's `removeShare()` at the same time.
2. `costgrid.html`'s new "Sharing" section isn't gated on `!isDraft`, unlike the Share button next to it. Harmless (shows owner-only / "not shared yet" for a Draft), just an asymmetry worth normalizing if anyone touches this section again.

## Roadmap notes

- **A real bug was found and fixed by manual browser verification, not by the code review.** `costgrid.html`'s new Share button called `openShareModal(...)` as a bare global reference inside its `@click` handler — this Vue build does not reliably fall back to `window` globals from inside compiled template click handlers (confirmed empirically: `window.openShareModal` was a real function, yet `_ctx.openShareModal` resolved to `undefined` inside the template's `with()` scope, most likely because Vue's render-context proxy resolves and caches every identifier's access type rather than ever falling through to the outer/global scope for a `with`-block miss). `pipeline.html`'s own pre-existing Share button already worked around this by declaring `openShareModal` in its `methods: {}` block — documented there as "Global Constraint 5" — and this fix applies the identical pattern to `costgrid.html`. **This is worth remembering as a standing rule for this codebase: any page-global function referenced only by bare name inside a Vue `@click`/template expression must be added to that page's own `methods: {}` block — it cannot be relied on to resolve via global/`window` fallback**, regardless of script-load-order correctness. The code review's own scan for this exact bug class (run after the fix) found no further instances.
- Browser-automation coordinate clicks were unreliable against `costgrid.html`'s toolbar during manual verification (screenshot-space vs. CSS-pixel-space mismatch after a window resize) — worked around by dispatching real DOM `.click()` calls via the JS tool instead, which is a legitimate click path (not a workaround of the bug itself, verified separately with zero console errors). Not a product issue, just a note for future sessions using the same tooling on a resized window.

## Sync-docs outcome

- **ARCHITECTURE.md** — updated: §3.3 "Ownership and Sharing" gained an "Inline share visibility (2026-09)" bullet describing the new component and reconfirming the cost-grid/project share independence.
- **CLAUDE.md** — updated: "Sharing" section describes `js/share-list-component.js`'s contract and refresh mechanism; "Detail panel" section's left-column description now mentions owner name + inline share list; `pipeline.html`'s and `costgrid.html`'s file-structure entries both gained notes on the new UI (including the `openShareModal` methods-registration fix and its rationale); `costgrid.html`'s "single monolithic Vue.createApp, no sub-components" claim corrected to note its one registered sub-component; new `js/share-list-component.js` entry added to the file-structure list, next to `js/shares.js`.
- **TEST_CASES.md** + **test-cases.html** — updated in lockstep: added SH-11 through SH-14 to the existing "15. Sharing" section (inline list visibility, inline remove, modal-to-inline-list sync, costgrid.html's new Share button + Sharing section). `test-cases.html`'s embedded script re-validated with `node -e "new Function(...)"` after editing.
- **test-api.js** — not touched: no new/changed API endpoints (feature reuses existing routes only).
- **PRD.md** — **updated** (evaluated: user-visible change — new UI capability, previously-absent sharing controls on `costgrid.html`). §18 gained a new "18.3 Inline Share Visibility (2026-09)" subsection; existing §18.3 "Viewer Enforcement" renumbered to §18.4.
- **PROCESS.md gate** — none of the three conditions applied (no process skill touched; no recurring process exception introduced; no change to the 7-phase skeleton or scenario guardrails) → `PROCESS.md` left untouched.
