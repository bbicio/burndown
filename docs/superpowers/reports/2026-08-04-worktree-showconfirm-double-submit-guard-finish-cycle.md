# Finish-cycle report — worktree-showconfirm-double-submit-guard

**Date:** 2026-08-04
**Branch:** worktree-showconfirm-double-submit-guard → main

## What was done

1 commit:

- `ab4b426` fix: guard `showConfirm()` against a fast repeat click, remove now-redundant local flag

Cycle 3 of the 5-cycle double-submit roadmap. Investigation before implementing found the fix was much smaller than the "wide blast radius" framing suggested: `showConfirm()`'s OK button had no protection at all against a fast repeat click — the click listener called `onConfirm()` and `modal.hide()` every time it fired, and Bootstrap's hide animation leaves a window where the same visible button can receive a second click before it actually disappears. Since every delete/publish/confirm flow in the app routes through this one shared function, this was a single root cause behind several call-site-specific double-submit risks — including the one `cgPublishDraft()` worked around locally in the previous cycle.

Fixed with a closure-scoped `clicked` flag inside `showConfirm()` (set on first click, checked before `onConfirm()` fires) — naturally scoped per invocation (a fresh closure each call), so it has no cross-call-site coordination problem the way a module-level flag would. Cancel's own path needed no change: `{ once: true }` on `hidden.bs.modal` already guaranteed `onCancel` fires at most once.

Per the user's confirmed choice, `cgPublishDraft()`'s `_cgPublishInFlight` flag (added last cycle as a call-site-local workaround for exactly this gap) was removed as now-redundant, rather than kept as belt-and-suspenders — the general fix in `showConfirm()` protects it automatically.

Verified interactively against a real running stack, more extensively than prior cycles given the change's reach:
- A synthetic dialog, 3 rapid real clicks on the actual DOM button → `onConfirm` invoked exactly once.
- Cancel/`onCancel` behavior reconfirmed unchanged (fires once, dialog closes correctly) after an initial confusing result traced to a browser-tab rendering/coordinate glitch unrelated to the code change (resolved by using `element.click()` calls instead of coordinate-based clicks).
- A real app flow end-to-end: created a throwaway test client, called the real `deleteClient()` (which routes through `showConfirm()`), clicked the real Confirm button 3 times rapidly — no error, client deleted exactly once.
- `cgPublishDraft()` re-verified *after* removing its local flag: stubbed `Api.costGrids.versions.publish` to fail without touching the real backend, 3 rapid clicks on the real Confirm button → the stub was called exactly once, confirming `showConfirm()`'s general guard alone is sufficient protection.

## Code review follow-ups

None. Small, clean diff (3 insertions, 9 deletions net) — the removed lines are dead code cleanup (the now-redundant flag), not a scope reduction of the fix itself.

## Roadmap notes

This closes Cycle 3 of the 5-cycle roadmap:
1. ~~Legacy JS standalone functions~~ — done.
2. ~~`costgrid.html`'s `saveVersion`/`publishDraft`~~ — done.
3. ~~The shared `showConfirm()` modal~~ — **done, this cycle.**
4. Not-yet-confirmed candidates: `portfolio.html`'s Load Actuals trigger, `pipeline.html`'s New Proposal/Clone flow, `costgrid.html`'s Generate Project flow — still need investigation before it's known whether there's a real gap.
5. Closing `domain-audit` pass — still pending.

No new findings surfaced this cycle. Worth noting for future sessions doing browser verification in this environment: a Chrome tab was observed rendering into a small, mis-scaled region of the viewport mid-session (coordinate-based clicks landed on the wrong elements as a result) — recovered fully after a page reload, and switching to `element.click()` via console sidestepped the issue entirely for the rest of the verification. Treated as a transient tooling/display glitch, not investigated further since it didn't recur.

## Sync-docs outcome

- **CLAUDE.md** — updated: added a `showConfirm()`-specific note (previously it had no direct entry, only being referenced from `showInfo()`'s description) documenting the new guard and why it protects every call site at once; corrected `cgPublishDraft()`'s entry, which (from last cycle's doc update) referenced the now-removed `_cgPublishInFlight` flag — now points to `showConfirm()`'s own guard instead.
- **TEST_CASES.md** / **test-cases.html** — updated in lockstep: added `REG-17`, a general cross-feature regression case in the Regression section (rather than a `costgrid.html`-specific one) since the fix applies to every `showConfirm()` call site app-wide, not just Cost Grid. `CG-55` (Publish repeat-click, added last cycle) needed no wording change — the user-observable behavior it describes is identical, only the underlying mechanism moved.
- **ARCHITECTURE.md** — not touched. No DB/API/Docker-topology change.
- **test-api.js** — not touched. No API endpoints changed.
- **PRD.md** — evaluated, left untouched. Makes existing confirm/delete/publish actions safer against a user-error pattern across the whole app; doesn't add, remove, or change any user-facing feature or flow the PRD describes.
- **docs/superpowers/PROCESS.md** — evaluated via the gate, left untouched. The lightweight process deviation (inline design discussion + explicit user confirmation before coding, no formal Brief/Spec/Plan) was a one-off per §3, consistent with the prior two cycles; none of the three trigger conditions applied.
