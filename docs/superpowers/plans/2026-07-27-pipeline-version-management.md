# Pipeline Board / Cost Grid Version-Management Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four small, independent issues in pipeline/cost-grid version management: deleting a proposal's only version now deletes the whole proposal instead of blocking; the version-tab row is always visible (even with one version); Publish's failure path uses the shared `showConfirm()` dialog instead of a native `alert()`; a successful Publish now reliably reflects in the UI without requiring a manual page reload (Task 4, added mid-cycle — a genuinely new finding discovered during this cycle's own Gate 2 manual verification, explicitly approved for inclusion by the user rather than isolated to a future cycle).

**Architecture:** Three self-contained changes across `js/costgrid.js` (two functions), `costgrid.html`, and `pipeline.html` (one template condition each). No shared code between the three items — each is independently testable.

**Tech Stack:** Vanilla JS (classic scripts, no build step), Vue 3 templates (`costgrid.html`/`pipeline.html`), the existing `showConfirm()` utility (`js/core.js:352`).

## Global Constraints

- No new UI pattern for the Publish fix — reuse `showConfirm()` exactly as already used elsewhere in `js/costgrid.js` (Brief, Constraints).
- Item 1 must reuse `cgConfirmDeleteGrid()`'s existing confirmation/delete flow, not duplicate it (Brief, Constraints).
- Item 2 is a pure template condition change — no JS logic change in either file (Brief, Constraints).
- Do not attempt to fix Item 3's underlying staleness (real-time re-sync of `_cgStore` across tabs/sessions) — explicitly out of scope (Brief, Item 3).
- Do not touch the other native `alert()` calls already present in `js/costgrid.js` (e.g. `cgConfirmDeleteGrid`'s and `cgConfirmDeleteVersion`'s own `catch` blocks) — only the specific Publish-flow `alert()` is in scope (Brief, Explicitly excluded scope).

---

### Task 1: Deleting the only version deletes the whole proposal

**Files:**
- Modify: `js/costgrid.js:281-287` (`cgConfirmDeleteVersion`)

**Interfaces:**
- Consumes: `cgConfirmDeleteGrid(cgId, name, onSuccess)` (already exists, `js/costgrid.js:263-279`, unchanged) — called with `cg.name` as the `name` argument.
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Replace the blocking `alert()` with a delegated call**

Current code (`js/costgrid.js:281-287`):

```js
function cgConfirmDeleteVersion(cgId, versionId, versionLabel, onSuccess) {
  const cg = cgLoad(cgId);
  if (!cg) return;
  if (cg.versions.length <= 1) {
    alert('Cannot delete the only version of a Cost Grid. Delete the entire Cost Grid instead.');
    return;
  }
```

Change to:

```js
function cgConfirmDeleteVersion(cgId, versionId, versionLabel, onSuccess) {
  const cg = cgLoad(cgId);
  if (!cg) return;
  if (cg.versions.length <= 1) {
    cgConfirmDeleteGrid(cgId, cg.name, onSuccess);
    return;
  }
```

Everything below this point in `cgConfirmDeleteVersion` (the multi-version delete flow) is unchanged.

- [ ] **Step 2: Run the test suite**

```bash
npm test
```

Expected: same pass count as before this task (neither function has existing automated test coverage — both are DOM/API-integration-heavy classic-script functions).

- [ ] **Step 3: Manual verification**

With the app running (`docker compose up`), open `costgrid.html` (or `pipeline.html`'s detail panel) for a cost grid that has exactly one version. Trigger the version-delete action (the same UI path that calls `cgConfirmDeleteVersion` — the "🗑 Delete version" button in the editor toolbar when the version is a Draft, per `costgrid.html:33`). Expected: the confirmation dialog shown is `cgConfirmDeleteGrid`'s own ("Delete Cost Grid "<name>"? ... All versions will be deleted."), not the old blocking alert. Confirming deletes the entire proposal (it disappears from the pipeline board / cost grid list).

Then repeat on a cost grid with 2+ versions and confirm the existing single-version-delete behavior (deleting one version, cost grid remains with the others) is unchanged.

- [ ] **Step 4: Commit**

```bash
git add js/costgrid.js
git commit -m "fix(costgrid): deleting a proposal's only version now deletes the whole proposal"
```

---

### Task 2: Version-tabs row always visible, even with one version

**Files:**
- Modify: `costgrid.html:43`
- Modify: `pipeline.html:123`

**Interfaces:** None — fully independent of Tasks 1 and 3.

- [ ] **Step 1: Update `costgrid.html`'s version-tabs condition**

Current (`costgrid.html:43`):

```html
    <div v-if="cg && cg.versions.length > 1" class="d-flex align-items-center gap-2 mb-3 flex-wrap">
```

Change to:

```html
    <div v-if="cg && cg.versions.length > 0" class="d-flex align-items-center gap-2 mb-3 flex-wrap">
```

Do not change anything else on this line or the markup below it (the `v-for` loop already handles any number of versions correctly).

- [ ] **Step 2: Update `pipeline.html`'s version-tabs condition**

Current (`pipeline.html:123`):

```html
    <div v-if="selectedCg.versions.length > 1" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 18px;border-bottom:1px solid var(--border-light);background:var(--surface-light);flex-shrink:0">
```

Change to:

```html
    <div v-if="selectedCg.versions.length > 0" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 18px;border-bottom:1px solid var(--border-light);background:var(--surface-light);flex-shrink:0">
```

- [ ] **Step 3: Run the test suite**

```bash
npm test
```

Expected: same pass count as before this task (no test covers either page's template rendering directly).

- [ ] **Step 4: Manual verification**

Open a cost grid with exactly one version in both `costgrid.html`'s editor and `pipeline.html`'s detail panel. Expected: a version tab/button is now visible in both (e.g. "v1"), where previously nothing was shown. Then open a cost grid with 2+ versions in both and confirm the tab row still renders all of them exactly as before (regression check).

- [ ] **Step 5: Commit**

```bash
git add costgrid.html pipeline.html
git commit -m "fix(costgrid): show the version-tabs row even with only one version"
```

---

### Task 3: Publish failure uses `showConfirm()` instead of a native `alert()`

**Files:**
- Modify: `js/costgrid.js:755-757` (`cgPublishDraft`'s `catch` block)

**Interfaces:** None — fully independent of Tasks 1 and 2.

- [ ] **Step 1: Replace the native `alert()` with `showConfirm()`**

Current code (`js/costgrid.js:755-757`):

```js
      } catch (e) {
        alert('Failed to publish: ' + e.message);
      }
```

Change to:

```js
      } catch (e) {
        showConfirm('Failed to publish: ' + e.message, null, null, '⚠️ Publish failed');
      }
```

`showConfirm(message, onConfirm, onCancel, title)` is the existing shared utility (`js/core.js:352`); passing `null`/`null` for `onConfirm`/`onCancel` makes it a non-blocking informational dialog, matching the same pattern already used in `js/ai.js:517-520` and the just-merged Clone-warning fix in this same file.

- [ ] **Step 2: Run the test suite**

```bash
npm test
```

Expected: same pass count as before this task.

- [ ] **Step 3: Manual verification**

Reproduce the stale-Publish scenario: open a cost grid's Draft version in `costgrid.html`, publish it successfully once. Without reloading the page, attempt to publish it again (or trigger the same button if it's still visible due to a stale local copy). Expected: a `showConfirm()`-style modal dialog appears with the message "Failed to publish: Only Draft versions can be published" and title "⚠️ Publish failed" — not a native browser `alert()` popup.

If the button is no longer visible/clickable after the first successful publish in your test session (since `isDraft` would normally update reactively after a successful publish in the SAME tab), you may need to force the stale-state scenario differently — e.g. by manually editing `_cgDraft.pipeline` back to `'Draft'` via the browser devtools console after a successful publish, then clicking Publish again. Either way, confirm the dialog (not a native alert) is what appears on the resulting `400` error.

- [ ] **Step 4: Commit**

```bash
git add js/costgrid.js
git commit -m "fix(costgrid): Publish failure shows a showConfirm() dialog instead of a native alert()"
```

---

### Task 4: Publish success reliably reflects in the UI without a manual reload

**Added mid-cycle** — discovered during this cycle's own Gate 2 manual verification of Task 3's Publish flow, and explicitly approved by the user for inclusion in this same cycle (option A: reload) rather than deferral to a future cycle.

**Root cause:** `cgPublishDraft()`'s success path (`js/costgrid.js:751`) mutates `_cgDraft.pipeline = 'SIP'` by writing directly to the raw global object, not through Vue's reactive proxy (`_cgVueApp.draft`). Since `this.draft` and `_cgDraft` are the same underlying object (a deliberate invariant — see `resyncFromGlobals()`'s own comment, `costgrid.html:830-838` — so `cgAutoSave()` always reads live data), writes made directly to `_cgDraft` bypass the Proxy `set` trap Vue's reactivity depends on to mark dependents dirty. The subsequent `renderCgEditor()` → `_cgVueApp.resyncFromGlobals()` call forces a re-render via `$forceUpdate()`, but `$forceUpdate()` does not invalidate cached `computed` values (like `isDraft`, `costgrid.html:650`) whose tracked dependency never fired a reactive trigger — so the Publish button and other Draft-only UI remain visible until a full page reload rebuilds the app from scratch.

**Files:**
- Modify: `js/costgrid.js:751-754` (`cgPublishDraft`'s success path)

**Interfaces:** None — fully independent of Tasks 1-3.

- [ ] **Step 1: Add a page reload after a successful publish**

Current code (`js/costgrid.js:751-754`):

```js
        if (_cgDraft) { _cgDraft.pipeline = 'SIP'; _cgDraft.pipelineYear = updated.pipeline_year || null; }
        renderCgEditor();
        const tabs = cgLoad(_cgActiveCgId);
        if (tabs) renderCgVersionTabs(tabs);
```

Change to:

```js
        if (_cgDraft) { _cgDraft.pipeline = 'SIP'; _cgDraft.pipelineYear = updated.pipeline_year || null; }
        renderCgEditor();
        const tabs = cgLoad(_cgActiveCgId);
        if (tabs) renderCgVersionTabs(tabs);
        window.location.reload();
```

This guarantees the page re-fetches fresh state from the API on every successful publish, sidestepping the reactivity-invalidation gap entirely — matching the same "reload to see the fresh state" pattern this project's own Clone-failure fix (from the just-merged `costgrid-silent-failures` cycle) already relies on for a related self-healing case. The existing `renderCgEditor()`/`renderCgVersionTabs(tabs)` calls are left in place (harmless — they run synchronously before the reload takes effect) rather than removed, to minimize the diff and avoid any risk of a subtle behavior change in the brief instant before reload.

- [ ] **Step 2: Run the test suite**

```bash
npm test
```

Expected: same pass count as before this task (no test covers this function).

- [ ] **Step 3: Manual verification**

Publish a Draft version to SIP in `costgrid.html`. Expected: immediately after confirming, the page reloads on its own, and the editor now correctly shows the version's SIP state (no Draft-only buttons/banner visible) — no manual reload needed.

- [ ] **Step 4: Commit**

```bash
git add js/costgrid.js
git commit -m "fix(costgrid): reload the page after a successful Publish so the UI reliably reflects the new state"
```
