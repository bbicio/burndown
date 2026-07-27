# Harden Two Silent-Failure Paths in `js/costgrid.js` — Design Spec

**Source:** Brief `docs/superpowers/specs/2026-07-27-costgrid-silent-failures-brief.md`. "Cycle B2" of the cold-review Cycle B split (`docs/superpowers/reports/2026-07-27-vue-migration-roadmap-cold-review.md`, items 13-14) — a correctness/robustness fix, distinct from "Cycle B1" (`js/costgrid.js`'s architectural fate, a separate design-natured question not covered here).

## Problem

`js/costgrid.js` has two places where a failure or an unmet precondition is silently swallowed instead of surfaced (Brief, Problem section, findings #13 and #14). Both share one root cause: async/bridge functions in this file that don't propagate or report failure.

## Architecture

No new module, no new abstraction — two narrow, additive fixes in existing functions, reusing an existing shared utility (`showConfirm()`, `js/core.js:352`) for the one user-facing signal needed.

**Key finding from investigation:** the codebase has no "toast"/non-blocking-notification pattern (confirmed via repo-wide grep for `toast`/`showToast`). The only existing mechanism for informing the user without halting the calling function's execution is `showConfirm(message, onConfirm, onCancel, title)` — already used this way elsewhere (`js/ai.js:517-520`, the "API Key required" dialog, called with `onConfirm`/`onCancel` both `null`, functioning as a pure informational alert since the calling code doesn't `await` it and continues past the call).

## Components

### Fix #13 — `cgCloneGrid()` / `cgLoadStructureFromApi()`

`cgLoadStructureFromApi()` (`js/api-sync.js:84-145`) currently has no explicit `return` — every path (success or its internal `catch`, lines 142-144) implicitly returns `undefined`. Verified via grep that all 4 existing call sites (`costgrid.html:853`, `pipeline.html:582`, `js/costgrid.js:901`, `js/costgrid.js:963`) discard the return value today, so adding one is purely additive:

- `cgLoadStructureFromApi()` gains an explicit `return true;` at the end of its `try` block (after the existing `cgSave(cg);` on line 141) and `return false;` inside its `catch` block (alongside the existing `console.warn(...)`, line 143) — the internal catch-and-log behavior is unchanged, only a status flag is added.
- `cgCloneGrid()` (`js/costgrid.js:884-978`) captures this at its call site (currently line 963, `await cgLoadStructureFromApi(cgId, verId);`): `const structureLoaded = await cgLoadStructureFromApi(cgId, verId);`.
- If `structureLoaded` is `false`, call `showConfirm('The new proposal was created, but its structure may not have loaded correctly. Please reload the page to verify.', null, null, '⚠️ Clone incomplete')` — non-blocking, fire-and-forget (no `await`, matching the `js/ai.js:517-520` precedent). Execution continues exactly as today: `bootstrap.Modal.getInstance(...).hide()` and `showCostGridEditorView(cgId, verId)` still run unconditionally right after, preserving the existing "self-heals on reload" behavior — this fix only adds a signal, it does not change the flow's outcome in either the success or failure case.
- The other 3 call sites of `cgLoadStructureFromApi` are untouched — they already discard the return value, and continuing to do so is valid (this Brief doesn't require every caller to react to the new signal, only `cgCloneGrid()`, per its Acceptance Criteria).

### Fix #14 — `showCostGridEditorView()` / `renderCgVersionTabs()`

Both currently have an `if (_cgVueApp) { ... }` guard with no `else` (`js/costgrid.js:174-178` and `310-312`). Add a `console.warn` in the implicit no-op path of each, identifying the function and its arguments:

- `showCostGridEditorView(cgId, versionId)`: `else { console.warn('[costgrid] showCostGridEditorView called before _cgVueApp is ready', cgId, versionId); }`
- `renderCgVersionTabs(cg)`: `else { console.warn('[costgrid] renderCgVersionTabs called before _cgVueApp is ready', cg); }`

No behavior change to the real-world case (bridge always ready today) — purely a diagnostic addition for a currently-unreachable path.

## Data flow

No change. `cgLoadStructureFromApi`'s existing side effects (`cgSave(cg)` on success) are unchanged; the new return value is a pure status signal layered on top, read by exactly one caller (`cgCloneGrid`).

## Error handling

This *is* the error-handling fix — see Components above. No change to `cgLoadStructureFromApi`'s own error-handling contract (it still catches internally and logs via `console.warn`, per the Brief's explicit constraint against making it throw) — only a return value is added on top.

## Backward compatibility

- `cgLoadStructureFromApi`'s 3 other call sites continue to work unchanged (they ignore the new return value, exactly as they ignored the old `undefined`).
- `pipeline.html` and `costgrid.html` (the two live consumers of `js/costgrid.js`) are unaffected outside the Clone flow and the two now-diagnostic-only bridge functions.
- The Clone flow's success-path behavior (the overwhelming majority case) is byte-identical to today.

## Testing

- Manual reproduction of finding #13: temporarily force `Api.costGrids.versions.structure()` to reject (e.g. via devtools network throttling/offline toggle at the right moment, or a temporary code-level fault injection removed before commit) and confirm the `showConfirm` dialog appears with the expected message, while the clone still completes and opens the editor.
- Manual reproduction of finding #14: call `showCostGridEditorView()`/`renderCgVersionTabs()` from the browser console with `_cgVueApp` still `null` (e.g. immediately on `costgrid.html` load, before Vue mounts) and confirm the `console.warn` fires with the expected identifying text.
- `npm test` — no existing test covers either function directly (both are DOM/API-integration-heavy, not pure `js/lib/` functions), so no new automated test is added; this matches the Brief's Acceptance Criteria, which call for manual verification of both fixes.
- Smoke check: Clone flow on `costgrid.html` end-to-end in the success case; `pipeline.html`'s cost-grid entry points still load structure normally.

## Explicitly out of scope

(Carried forward verbatim from the Brief.)

- The `js/costgrid.js` eventual-fate architecture question (Cycle B1) — separate Brief.
- Every other item from the cold-review report's backlog (Cycle C, Cycle D, the `initNav()` gap, the static-file documentation gap).
- Any broader refactor of error handling across `js/costgrid.js` or `js/api-sync.js` beyond these two call sites.
- Changing `cgLoadStructureFromApi`'s own error-handling contract beyond adding the two `return` statements described above.
