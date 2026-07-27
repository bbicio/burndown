# Brief — Pipeline Board / Cost Grid Version-Management Fixes

**Source:** `docs/superpowers/reports/2026-07-27-vue-migration-roadmap-cold-review.md`, "Cycle C — pipeline/cost-grid product decisions." Three items, bundled into one cycle by explicit user decision despite differing in nature (noted per-item below, per `audit-to-brief`'s Scenario-mismatch guidance) — a 4th cold-review item ("New Proposal flow doesn't work") was investigated live during this Brief's drafting and confirmed working as expected; it is dropped from scope entirely, not carried forward.

**Mixed nature:** Items 1 and 2 are Scenario 2 (evolution) — the user has already made the product/UX decision; this Brief documents current behavior and the already-decided expected behavior, not open alternatives. Item 3 is Scenario 3 (audit-fix) — a genuine correctness bug plus a project-convention violation, newly investigated and confirmed real during this Brief's drafting (not merely "flagged for awareness" as the cold review left it).

## Item 1 — Deleting a proposal's only version should delete the whole proposal

**Current behavior:** `cgConfirmDeleteVersion(cgId, versionId, versionLabel, onSuccess)` (`js/costgrid.js:281-307`) blocks with a native `alert('Cannot delete the only version of a Cost Grid. Delete the entire Cost Grid instead.')` (line 285) and returns, whenever `cg.versions.length <= 1`. The user must separately find and use "Delete Cost Grid" (`cgConfirmDeleteGrid`, lines ~260-279) to achieve the same outcome.

**Decision (user-confirmed):** Deleting the only remaining version of a proposal should delete the entire proposal — since every proposal always has at least one version (v1), "delete the only version" and "delete the proposal" are the same user intent.

**Expected behavior:** When `cgConfirmDeleteVersion` is called on a cost grid with exactly one version, it should perform the same delete-the-whole-cost-grid flow as `cgConfirmDeleteGrid` (confirmation dialog reflecting that the entire proposal will be deleted, not just a version — reusing `cgConfirmDeleteGrid`'s own confirmation copy/flow rather than inventing new wording), instead of blocking with an `alert()`.

## Item 2 — Version tab (e.g. "V1") should always be visible, even with only one version

**Current behavior:** The version-tabs row is gated behind `versions.length > 1` in two places — `costgrid.html:43` (`v-if="cg && cg.versions.length > 1"`, the editor's own tab row) and `pipeline.html:123` (`v-if="selectedCg.versions.length > 1"`, the detail panel's tab row). With exactly one version, no tab/label is shown anywhere in either view.

**Decision (user-confirmed):** The version label should be visible from the start, not only once a second version exists — there's no reason to hide it just because there's currently only one.

**Expected behavior:** Both version-tab rows render whenever the cost grid has at least one version (i.e., always, since a cost grid can't exist with zero versions) — showing a single tab/button for the sole version exactly as today's multi-version case renders each one, just with one entry instead of several.

## Item 3 — Publish can fail with a stale-state race, surfaced via a native `alert()`

**Current behavior, investigated and confirmed during this Brief's drafting (not merely "flagged for awareness" as the cold review's own report left it):**

- `costgrid.html`'s "🚀 Publish to SIP →" button is gated behind `v-if="isDraft"` (`costgrid.html:34`), where `isDraft` is a computed reading `this.draft?.pipeline === 'Draft'` (`costgrid.html:650`).
- `cgPublishDraft()` (`js/costgrid.js:718-761`) re-derives the version from the same in-memory `_cgStore` (via `cgLoad()`) that `this.draft` is itself sourced from — so both the button's visibility check and the function's own internal guard (`if (!ver || ver.pipeline !== 'Draft') return;`, line 722) read the *same potentially-stale local copy*, not the backend's live state. `_cgStore` is populated once per page load (`cgSyncFromApi()`) and is never re-synced from another browser tab, another user's concurrent action, or any other out-of-band change to the version's pipeline stage.
- If the version's pipeline actually changed server-side since this page loaded (e.g., published from another tab/session, or a status change from an unrelated flow) while the local copy still shows `'Draft'`, the Publish button remains visible and clickable, `cgPublishDraft()`'s local guard passes (stale data agrees it's still Draft), and the request reaches the backend, which correctly rejects with `400 { error: 'Only Draft versions can be published' }` (`api/src/routes/cost-grids.js:479`).
- This rejection is caught by `cgPublishDraft()`'s own `catch (e) { alert('Failed to publish: ' + e.message); }` (`js/costgrid.js:756`) — a **native browser `alert()`**, which this project's established Vue-migration convention explicitly avoids in favor of the shared `showConfirm()` modal idiom (confirmed via `docs/superpowers/reports/*-finish-cycle.md` precedent across every Tier 1/Tier 2 migration cycle — no native `alert()`/`confirm()` is otherwise used in any migrated page's own code, only in a few not-yet-touched `js/costgrid.js`/`js/pipeline...`-era functions like this one and the sibling delete-flow `alert()`s noted in Item 1).

**Expected behavior:**
- The Publish error path no longer uses a native `alert()` — replace it with the shared `showConfirm()` idiom (an info-only dialog, `onConfirm`/`onCancel` both `null`, matching the precedent already established elsewhere in this same file and in `js/ai.js`), so the failure message is presented consistently with the rest of the app.
- This Brief does **not** require solving the underlying staleness (re-syncing `_cgStore` live, polling, websockets, etc.) — that would be a much larger architectural change out of proportion to this bug. The acceptance criterion is: when the backend legitimately rejects a stale-state Publish attempt, the user sees a clear, non-native error message via the established modal idiom, instead of a jarring native browser `alert()`. The race itself (stale local state momentarily allowing an invalid action to be attempted) remains — only the failure *presentation* changes.

## Constraints

- No new UI pattern for Item 3 — reuse `showConfirm()` exactly as already used elsewhere in `js/costgrid.js` (e.g. the pattern established in the just-merged `costgrid-silent-failures` cycle).
- Item 1's new behavior must reuse `cgConfirmDeleteGrid`'s existing confirmation/delete flow rather than duplicating its logic — call it (or extract a shared helper only if truly necessary) instead of copy-pasting its `showConfirm`/`cgDelete`/`onSuccess` handling.
- Item 2 is a pure template condition change — no JavaScript logic change needed in either file beyond the `v-if` condition itself.
- Do not attempt to fix the underlying staleness described in Item 3 (see above) — out of scope, disproportionate to this bug's actual impact.
- Both `pipeline.html` and `costgrid.html` must be manually verified for Item 2, since both have their own version-tabs row.

## Acceptance criteria

- [ ] Deleting the only version of a proposal (via the version-management UI, wherever `cgConfirmDeleteVersion` is invoked with a single-version cost grid) triggers the same confirmation and outcome as "Delete Cost Grid" — the entire proposal is deleted, not blocked.
- [ ] With a cost grid that has exactly one version, both `costgrid.html`'s editor and `pipeline.html`'s detail panel show a version tab/label for that single version (previously hidden).
- [ ] With a cost grid that has 2+ versions, both views' behavior is unchanged (still shows all tabs as today).
- [ ] Reproducing the stale-Publish scenario (e.g., publish a Draft version, then — without reloading — attempt to publish it again from a state where the local copy still shows Draft) shows a `showConfirm()`-style dialog instead of a native browser `alert()`.
- [ ] `npm test` passes with no regressions.
- [ ] Manual smoke check on both `pipeline.html` and `costgrid.html`: version tabs, single-version delete, and Publish still work correctly in their normal (non-stale, non-error) cases.

## Explicitly excluded scope

- **"New Proposal flow doesn't work correctly"** — the cold review's 4th Cycle C item. Investigated live during this Brief's drafting and confirmed working as expected. Dropped entirely, not carried into this cycle or any follow-up.
- **Solving Item 3's underlying staleness** (real-time re-sync of `_cgStore` across tabs/sessions) — explicitly out of scope, see Item 3's Expected behavior section.
- **The two Cycle B2 follow-ups** (a similar session-expiry race in Clone's structure-load warning, and the `showConfirm()` OK/Cancel affordance mismatch) — separate, already-tracked follow-ups from a prior cycle, not re-opened here.
- **Cycle D** (phasing-panel rounding, Export XLS ExcelJS-missing) and **Cycle B1** (`js/costgrid.js`'s architectural fate, already closed) — untouched.
- **The other native `alert()` calls already visible in the code read for this Brief** (e.g. `cgConfirmDeleteGrid`'s and `cgConfirmDeleteVersion`'s own `catch` blocks at `js/costgrid.js:274`/`302`, "Delete failed: ...") — not touched by this Brief; only the specific Publish-flow `alert()` described in Item 3 is in scope. A broader "remove all native alert() calls from js/costgrid.js" sweep, if ever wanted, is a separate future Brief.

## Required reminder (new-findings guard)

Any new finding discovered during this cycle's `/brainstorming` or execution — another stale-state race, another native `alert()` call, or anything else noticed while working on these three items — must be isolated and proposed as its own future Brief, never folded into this cycle's fix.

---

Brief ready. Next step: /brainstorming.
