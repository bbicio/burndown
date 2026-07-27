# Brief — Harden two silent-failure paths in `js/costgrid.js`

**Scenario:** Audit → fix (Scenario 3 per `docs/superpowers/PROCESS.md` §2). Source: `docs/superpowers/reports/2026-07-27-vue-migration-roadmap-cold-review.md`, items 13-14 (originally surfaced as PLAUSIBLE findings during the `costgrid.html` Vue migration cycle's whole-branch review, left as explicit follow-up rather than fixed at the time). This is "Cycle B2" of the two-cycle split confirmed with the user for the cold review's Cycle B recommendation — split from "Cycle B1" (the separate, design-natured question of `js/costgrid.js`'s eventual architectural fate), since these two findings are correctness/robustness gaps sharing one root cause, not a design decision.

This Brief does not re-derive whether these findings are real — re-verified directly against current `js/costgrid.js` while drafting this Brief (see citations below), consistent with both the original review and the cold review's confirmation.

## Problem

`js/costgrid.js` has two places where a failure or an unmet precondition is silently swallowed instead of surfaced, sharing one root cause: async/bridge functions in this file that don't propagate or report failure to the user or the caller.

- **Finding #13** — `cgCloneGrid()` (`js/costgrid.js:884-978`). After creating the new cost grid/version and copying structure, it seeds the in-memory clone with `phases: []` (line 956) and depends on a follow-up `await cgLoadStructureFromApi(cgId, verId)` (line 963) to populate the real structure with server-assigned IDs. `cgLoadStructureFromApi` (`js/api-sync.js:84-145`) wraps its entire body in its own `try { ... } catch (e) { console.warn('[sync] cgLoadStructureFromApi:', e.message); }` (lines 142-144) — it never re-throws. Because of this, a transient failure in that follow-up fetch is invisible to `cgCloneGrid()`'s own `try/catch` (lines 910-977): the outer catch's `errEl.textContent = 'Clone failed: ' + e.message` (line 976) never fires, and execution proceeds normally — closing the Clone modal (line 965) and opening the editor (line 966) on a grid whose `phases` array is still `[]`. The clone silently appears empty; reloading the page self-heals it (confirmed by the original review), but the user has no indication anything went wrong in the meantime.
- **Finding #14** — `showCostGridEditorView(cgId, versionId)` (`js/costgrid.js:174-178`) and `renderCgVersionTabs(cg)` (`js/costgrid.js:310-312`). Both are no-ops if the module-level `_cgVueApp` bridge reference (`js/costgrid.js:172`, `let _cgVueApp = null;`) hasn't been set yet — `if (_cgVueApp) { ... }` with no `else` branch, no warning, no queuing. Today this is genuinely unreachable (every real caller on `costgrid.html` runs after Vue's `mounted()`/`created()` hook sets `_cgVueApp`), but it's a latent trap: any future caller that runs before mount — a new async init path, a race introduced by an unrelated future change — would silently do nothing, with no error to point at the cause.

## Expected behavior

- **Finding #13**: if the post-clone structure fetch (`cgLoadStructureFromApi`) fails after a successful clone creation, the user sees an explicit error/warning (not necessarily the same modal-blocking error as validation failures, since the clone itself did succeed server-side — a non-blocking notice is appropriate) telling them the new proposal's structure may not have loaded correctly and to reload. The clone must not silently present as complete when its structure fetch actually failed.
- **Finding #14**: if `showCostGridEditorView()` or `renderCgVersionTabs()` is called before `_cgVueApp` is set, this is no longer a silent no-op — at minimum, a `console.warn` (or equivalent) identifies the call and its arguments, so a future regression that triggers this path is discoverable in the console instead of manifesting as "nothing happened" with zero diagnostic trail.

## Constraints

- **No behavior change to any currently-working path.** Both fixes are additive (an error signal where there was silence) — they must not change what happens when `cgLoadStructureFromApi` succeeds, or when `_cgVueApp` is already set at call time (today's only real-world case).
- **Do not fix by making `cgLoadStructureFromApi` throw instead of catching internally.** That function is a shared sync helper called from many places across the app (`api-sync.js`), not exclusive to the Clone flow; changing its own error-handling contract is out of scope and risks regressing every other caller. Fix `cgCloneGrid()`'s side of the interaction instead — e.g., check the resulting in-memory state after the call, or have `cgCloneGrid()` use its own explicit fetch-and-check rather than relying on `cgLoadStructureFromApi`'s silent-catch return.
- **Do not add a new dependency, new shared module, or new abstraction** for what are two narrow, independent additive fixes in one existing file — this is not a refactor of `js/costgrid.js`'s error-handling philosophy in general (that would need its own Brief if ever proposed).
- Match the existing error-surfacing idiom already used elsewhere in `js/costgrid.js` for non-fatal issues (e.g. `errEl`/inline text patterns already present in the same functions) rather than introducing a new UI pattern.
- `js/costgrid.js` is loaded unmodified by `pipeline.html` and by `costgrid.html`'s Vue rewrite via the bridge pattern (`CLAUDE.md`'s `js/costgrid.js` entry) — verify both pages still function correctly after this change, since it's a shared file with two active consumers.

## Acceptance criteria

- [ ] Reproducing finding #13 (e.g. temporarily forcing `cgLoadStructureFromApi`'s internal fetch to reject, or via a network-throttling test) shows a visible signal to the user that the clone's structure failed to load, distinct from silent success.
- [ ] The existing "self-heals on reload" behavior for finding #13 is preserved — this fix adds a signal, it does not change what happens on the next successful load.
- [ ] Reproducing finding #14 (calling `showCostGridEditorView()`/`renderCgVersionTabs()` with `_cgVueApp` still `null`, e.g. via a temporary test harness or a deliberately-early manual call in devtools) produces a console warning identifying which function was called and with what arguments, instead of silently doing nothing.
- [ ] `npm test` passes with no regressions.
- [ ] Manual smoke check: Clone flow on `costgrid.html` still works end-to-end in the success case (unchanged from today); `pipeline.html`'s cost-grid-editor entry points (which also load `js/costgrid.js`) still function normally.

## Explicitly excluded scope

- **The `js/costgrid.js` eventual-fate architecture question** (Cycle B1, item 12 of the cold review) — handled as its own, separately-scoped evolution-scenario Brief, not here.
- **Every other item from the cold-review report's backlog** (Cycle C — pipeline/cost-grid product decisions; Cycle D — phasing-panel rounding and Export-XLS-ExcelJS bugs; the `initNav()` no-error-banner gap; the static-file bind-mount documentation gap).
- **Any broader refactor of error handling across `js/costgrid.js` or `js/api-sync.js`** beyond these two specific call sites — see the Constraints section above.
- **Changing `cgLoadStructureFromApi`'s own error-handling contract** — explicitly ruled out in Constraints, since it's shared by many callers beyond Clone.

## Required reminder (Scenario 3 guard, per `audit-to-brief`)

Any new finding discovered during this cycle's `/brainstorming` or execution — another silent-failure path noticed in `js/costgrid.js` while working on these two, or an unrelated issue — must be isolated and proposed as its own future Brief. It must never be folded into this cycle's fix, even if it looks small, related, or trivially fixable at the same time.

---

Brief ready. Next step: /brainstorming.
