# Pipeline Board / Cost Grid Version-Management Fixes — Design Spec

**Source:** Brief `docs/superpowers/specs/2026-07-27-pipeline-version-management-brief.md`. Three items from the cold-review's Cycle C, bundled by explicit user decision. Items 1 and 2 are already-decided product/UX changes (Scenario 2); item 3 is a correctness bug + convention violation (Scenario 3), newly confirmed real during Brief-drafting.

## Problem

1. Deleting a proposal's only remaining version blocks with a native `alert()` instead of deleting the whole proposal.
2. The version-tab row is hidden whenever a cost grid has only one version, in both `costgrid.html` and `pipeline.html`.
3. `cgPublishDraft()`'s failure path uses a native `alert()` when a stale local copy allows an already-invalid Publish attempt to reach the backend, which correctly rejects it — a convention violation (this project's Vue-migration cycles established `showConfirm()` as the sole non-blocking-message idiom, no native `alert()`/`confirm()`).

## Architecture

Three small, independent, additive-or-corrective changes in already-identified locations. No new abstractions, no shared module. Each item is self-contained:

### Item 1 — `cgConfirmDeleteVersion()` delegates to `cgConfirmDeleteGrid()` when only one version remains

Current (`js/costgrid.js:281-287`):
```js
function cgConfirmDeleteVersion(cgId, versionId, versionLabel, onSuccess) {
  const cg = cgLoad(cgId);
  if (!cg) return;
  if (cg.versions.length <= 1) {
    alert('Cannot delete the only version of a Cost Grid. Delete the entire Cost Grid instead.');
    return;
  }
  ...
```

New: the `cg.versions.length <= 1` branch calls `cgConfirmDeleteGrid(cgId, cg.name, onSuccess)` instead of alerting and returning — reusing the exact same confirmation dialog, deletion call, and `onSuccess` callback handling that "Delete Cost Grid" already has (`js/costgrid.js:~260-279`), rather than duplicating any of that logic.

### Item 2 — Version-tabs row always renders when at least one version exists

Two template-only changes:
- `costgrid.html:43`: `v-if="cg && cg.versions.length > 1"` → `v-if="cg && cg.versions.length > 0"`
- `pipeline.html:123`: `v-if="selectedCg.versions.length > 1"` → `v-if="selectedCg.versions.length > 0"`

The `v-for` underneath each (`v-for="v in cg.versions"` / `v-for="ver in selectedCg.versions"`) already handles any number of entries correctly — with one version it renders one button, exactly as the multi-version case renders several today.

### Item 3 — Publish failure uses `showConfirm()` instead of a native `alert()`

Current (`js/costgrid.js:755-757`):
```js
      } catch (e) {
        alert('Failed to publish: ' + e.message);
      }
```

New:
```js
      } catch (e) {
        showConfirm('Failed to publish: ' + e.message, null, null, '⚠️ Publish failed');
      }
```

Non-blocking (`onConfirm`/`onCancel` both `null`), matching the established idiom (`js/costgrid.js`'s own Clone-warning fix from the just-merged `costgrid-silent-failures` cycle, and `js/ai.js:517-520`'s precedent). The underlying staleness (local `_cgStore` not reflecting an out-of-band pipeline change) is not addressed — only the failure's presentation changes, per the Brief's explicit scope limit.

## Data flow

No change. Item 1 reuses `cgConfirmDeleteGrid`'s existing API call (`cgDelete(cgId)`) and in-memory update path unchanged. Item 3 reuses the same `Api.costGrids.versions.publish()` call and catch block, only swapping the presentation call.

## Error handling

Item 3 *is* the error-handling fix for this cycle. Items 1 and 2 have no new error paths — Item 1 inherits whatever error handling `cgConfirmDeleteGrid` already has (its own `catch(e) { alert('Delete failed: ' + e.message); }`, at `js/costgrid.js:274` — explicitly out of scope per the Brief, not touched by this cycle).

## Backward compatibility

- Item 1: a cost grid with 2+ versions is unaffected — the existing single-version-delete path (`cgConfirmDeleteVersion`'s logic past the `<= 1` check) is untouched.
- Item 2: a cost grid with 2+ versions renders identically to today; only the 1-version case changes (previously hidden, now shows one tab).
- Item 3: the success path of Publish is completely unchanged; only the failure-path presentation changes.

## Testing

- Manual: create/use a cost grid with exactly one version; attempt to delete it via the version-delete UI; confirm the whole-proposal-delete confirmation appears and the proposal is fully deleted on confirm.
- Manual: same one-version cost grid; confirm a version tab/label is now visible in both `costgrid.html`'s editor and `pipeline.html`'s detail panel.
- Manual: a 2+-version cost grid; confirm both views' tab rows and delete-version flow behave exactly as before (regression check).
- Manual: reproduce the stale-Publish scenario (publish a Draft version, then attempt to publish it again without reloading, once the local copy no longer matches the backend's actual state) and confirm a `showConfirm()` dialog appears instead of a native `alert()`.
- `npm test` — run before/after as a sanity check; no test currently covers any of these three code paths (all are DOM/API-integration-heavy, not `js/lib/` pure functions), so no pass-count change is expected.

## Explicitly out of scope

(Carried forward verbatim from the Brief.)

- "New Proposal flow doesn't work correctly" — investigated live, confirmed working, dropped entirely.
- Solving Item 3's underlying staleness (real-time re-sync across tabs/sessions).
- The two Cycle B2 follow-ups (session-expiry race, `showConfirm()` OK/Cancel affordance mismatch) — separate, already-tracked.
- Cycle D and Cycle B1 — untouched.
- The other native `alert()` calls in `js/costgrid.js` (e.g. the delete-flow `catch` blocks) — not touched; a broader alert()-removal sweep would be its own future Brief.
