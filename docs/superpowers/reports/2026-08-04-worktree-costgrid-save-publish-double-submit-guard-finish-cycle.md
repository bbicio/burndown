# Finish-cycle report — worktree-costgrid-save-publish-double-submit-guard

**Date:** 2026-08-04
**Branch:** worktree-costgrid-save-publish-double-submit-guard → main

## What was done

1 commit:

- `b41de48` fix: guard `cgSaveVersion()` and `cgPublishDraft()` against rapid repeat clicks

Cycle 2 of the 5-cycle double-submit roadmap. Investigation before implementing surfaced more nuance than Cycle 1's clean 1:1 pattern match, confirmed with the user before coding:

- `cgSaveVersion()` (`js/costgrid.js`) was fire-and-forget: it called `cgAutoSave()` without awaiting it, then immediately showed "✓ Saved" regardless of whether the underlying API `PUT` had actually completed — not just a double-click gap but genuinely fake completion feedback. Made the function `async`, disabled `#btnCgSave` for the real duration of the save with a re-entry guard (`if (btn.disabled) return;`), and moved "✓ Saved" to appear only once `cgAutoSave()` actually resolves. `cgAutoSave()` never rejects (catches its own errors internally), so no `try/finally` was needed to guarantee re-enable.
- `cgPublishDraft()`'s confirm-callback had no protection at all. `showConfirm()` hides its modal synchronously right after invoking the callback, but the hide animation leaves a narrow window where a second click could re-enter before the local cache reflects the first call's in-progress pipeline change — risking a duplicate delete/publish attempt against the real backend. Added a module-level in-flight flag (`_cgPublishInFlight`, checked/set at the top of the callback, reset in a `finally`) since the callback has no direct reference to the clicked button to guard against directly.

Both fixes verified interactively against a real running stack, not just statically:
- `cgSaveVersion()`: an overlapping-calls race test (`Promise.all([cgSaveVersion(), cgSaveVersion()])`) confirmed the button synchronously disables on the first call, the second call is a no-op, and the button correctly re-enables with "✓ Saved" only once both resolve.
- `cgPublishDraft()`: rather than risk a real (irreversible) publish, `Api.costGrids.versions.publish` was temporarily stubbed to fail without touching the real backend, and the guard tested deterministically by forcing `_cgPublishInFlight = true` immediately before a real click on the dialog's Confirm button — the publish stub was never even called (`publishCallCount: 0`), proving the guard blocks entry on the real click path, not just in a synthetic direct-call test. Stubs were restored and the page reloaded to confirm the test proposal was left untouched (still Draft) before tearing down the branch stack.

## Code review follow-ups

None. One design point was surfaced and accepted as a reasonable trade-off, not treated as a defect: `_cgPublishInFlight` is a single module-level flag, not scoped per cost-grid-version. In the narrow window before a successful publish's `window.location.reload()` fires, attempting to publish a *different* version would also be blocked by the same flag. Given the reload wipes all JS state (including the flag) immediately after any successful publish, the actual exposure window is a few seconds at most, in an unlikely usage pattern (navigating away from an in-flight publish to publish something else). Same trade-off already accepted for Cycle 1's guards.

## Roadmap notes

This closes Cycle 2 of the 5-cycle roadmap:
1. ~~Legacy JS standalone functions~~ — done (previous cycle).
2. ~~`costgrid.html`'s `saveVersion`/`publishDraft`~~ — **done, this cycle.**
3. The shared `showConfirm()` modal (`js/core.js`) — still deferred, used by dozens of call sites across the app; needs its own broad verification pass.
4. Not-yet-confirmed candidates: `portfolio.html`'s Load Actuals trigger, `pipeline.html`'s New Proposal/Clone flow, `costgrid.html`'s Generate Project flow — still need investigation before it's known whether there's a real gap.
5. Closing `domain-audit` pass — still pending, to confirm no other submit/save/create/delete button anywhere in the app lacks feedback.

No new findings surfaced this cycle beyond the module-level-flag design trade-off already discussed above.

## Sync-docs outcome

- **CLAUDE.md** — updated: `js/costgrid.js`'s entry now documents both `cgSaveVersion()`'s and `cgPublishDraft()`'s new guards, placed next to the existing `cgPublishDraft()` note about its `window.location.reload()` success path for context continuity.
- **TEST_CASES.md** / **test-cases.html** — updated in lockstep: two new cases added, `CG-54` (Save button real-completion + repeat-click guard) and `CG-55` (Publish repeat-confirm guard).
- **ARCHITECTURE.md** — not touched. No DB/API/Docker-topology change.
- **test-api.js** — not touched. No API endpoints changed.
- **PRD.md** — evaluated, left untouched. Makes existing save/publish actions safer against a user-error pattern and fixes a feedback-timing bug; doesn't add, remove, or change any user-facing feature or flow the PRD describes.
- **docs/superpowers/PROCESS.md** — evaluated via the gate, left untouched. The lightweight process deviation (skipping Brief/Spec/Plan, replaced with an inline design discussion and explicit user confirmation before coding) was a one-off per §3, consistent with the prior two cycles; none of the three trigger conditions applied.
