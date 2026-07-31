# Clone Warning Modal Follow-Ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix a session-expiry race that shows a confusing dialog during Clone; replace `showConfirm()`'s misleading two-button affordance with a proper single-button `showInfo()` variant for purely informational messages; and fix a latent bug where `portfolio.html` lacks the shared modal markup its own `js/ai.js` call path depends on.

**Architecture:** Three independent tasks. Task 1 adds a shared redirect-in-progress flag and one guard check. Task 2 adds a new function to `js/core.js` and updates 3 call sites to use it. Task 3 adds static HTML markup to one page. No task depends on another.

**Tech Stack:** Vanilla JS (classic scripts, no build step), Bootstrap 5 modals (existing `#confirmModal` component).

## Global Constraints

- Do not change `apiFetch()`'s or `cgLoadStructureFromApi()`'s return/throw contract — only add an opt-in side-channel flag (Brief, Constraints).
- Do not touch any other native `alert()` calls remaining in `js/costgrid.js` (Brief, Constraints).
- `showConfirm()` itself must remain completely unchanged — every other call site in the app must keep working exactly as today (design spec, Item 2).
- Do not attempt to fix why `cgLoadStructureFromApi()` can fail in the first place — these fixes are about presentation of an already-occurring failure/state, not preventing it (Brief, Constraints).

---

### Task 1: Suppress the Clone-incomplete warning during a session-expiry (401) race

**Files:**
- Modify: `js/api.js:27-30` (`apiFetch`'s 401 branch)
- Modify: `js/costgrid.js:971-976` (`cgCloneGrid`'s destination-side structure-load check)

**Interfaces:**
- Produces: `window.__pdashAuthRedirecting` (boolean, `true` once set, never reset — a full page navigation to `/login.html` is already in flight once this is set, so no reset is needed). Consumed by Task 1's own `cgCloneGrid()` check only; no other task depends on it.

- [ ] **Step 1: Set the flag in `apiFetch()`'s 401 branch**

Current code (`js/api.js:27-30`):

```js
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('Unauthorized');
  }
```

Change to:

```js
  if (res.status === 401) {
    window.__pdashAuthRedirecting = true;
    window.location.href = '/login.html';
    throw new Error('Unauthorized');
  }
```

- [ ] **Step 2: Guard `cgCloneGrid()`'s warning with the flag**

Current code (`js/costgrid.js:971-976`):

```js
    const structureLoaded = await cgLoadStructureFromApi(cgId, verId);
    if (!structureLoaded) {
      showConfirm(
        'The new proposal was created, but its structure may not have loaded correctly. Please reload the page to verify.',
        null, null, '⚠️ Clone incomplete'
      );
    }
```

Change to (this also renames `showConfirm` to `showInfo` and drops the two now-unused `null` arguments — the `showInfo` function itself is created in Task 2; this task's own test/verification only needs the `!window.__pdashAuthRedirecting` guard to be present, whether the call uses `showConfirm(...,null,null,...)` or `showInfo(...)` at the moment this task lands — if Task 2 hasn't been done yet when this task is implemented, keep the call as `showConfirm(message, null, null, title)` for now; Task 2 will rename it):

```js
    const structureLoaded = await cgLoadStructureFromApi(cgId, verId);
    if (!structureLoaded && !window.__pdashAuthRedirecting) {
      showConfirm(
        'The new proposal was created, but its structure may not have loaded correctly. Please reload the page to verify.',
        null, null, '⚠️ Clone incomplete'
      );
    }
```

- [ ] **Step 3: Run the test suite**

```bash
npm test
```

Expected: same pass count as before this task (136 tests — neither function has existing automated coverage).

- [ ] **Step 4: Manual verification**

With the app running, force a 401 to occur during Clone's destination-side structure load — e.g., open `costgrid.html`, start a Clone, and right after the new cost grid/version are created server-side (before the structure re-fetch completes), invalidate your session (clear the auth cookie via devtools, or wait for token expiry if testing in a short-lived-session environment) so the structure-fetch itself gets a 401. Expected: you are redirected to `/login.html` with no "⚠️ Clone incomplete" dialog appearing first.

Then repeat a Clone under a normal (non-401) structure-load failure (e.g., network-throttle/block just the structure request without expiring the session) and confirm the "⚠️ Clone incomplete" dialog still appears as before — this guard must only suppress the 401 case, not all failures.

- [ ] **Step 5: Commit**

```bash
git add js/api.js js/costgrid.js
git commit -m "fix(costgrid): suppress Clone-incomplete warning during a session-expiry race"
```

---

### Task 2: Add `showInfo()` — a single-button informational variant of `showConfirm()`

**Files:**
- Modify: `js/core.js` (add `showInfo` immediately after `showConfirm`, currently ending around line 384)
- Modify: `js/costgrid.js:972-975` (Clone-incomplete warning — rename `showConfirm` call to `showInfo`)
- Modify: `js/ai.js:101` (`aiPlanSend`'s API-key dialog — rename `showConfirm` call to `showInfo`)
- Modify: `js/ai.js:379-382` (`openAiAnalysis`'s API-key dialog — rename `showConfirm` call to `showInfo`)

**Interfaces:**
- Produces: `showInfo(message, title = 'ℹ️ Info')` — global function, no return value. Consumed by this task's own 3 call-site updates; no other task depends on it, but Task 1's `cgCloneGrid()` call site (touched in Task 1 Step 2) should end up calling `showInfo` once both tasks are complete (see the note in Task 1 Step 2).

- [ ] **Step 1: Add `showInfo()` to `js/core.js`**

Add this new function immediately after `showConfirm()`'s closing `}` (currently around line 384, right before the blank line that precedes the next function):

```js
function showInfo(message, title = 'ℹ️ Info') {
  const modalEl = document.getElementById('confirmModal');
  document.getElementById('confirmModalTitle').textContent  = title;
  document.getElementById('confirmModalMessage').textContent = message;

  const cancelBtn = document.getElementById('confirmModalCancel');
  const okOld = document.getElementById('confirmModalOk');
  const okBtn = okOld.cloneNode(true);
  okOld.replaceWith(okBtn);
  okBtn.textContent = 'OK';

  cancelBtn.style.display = 'none';

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

  okBtn.addEventListener('click', () => modal.hide());
  modalEl.addEventListener('hidden.bs.modal', () => {
    modalEl.style.zIndex = '';
    cancelBtn.style.display = ''; // restore for the next showConfirm() call
  }, { once: true });

  modalEl.addEventListener('shown.bs.modal', () => {
    modalEl.style.zIndex = '1200';
    const backdrops = document.querySelectorAll('.modal-backdrop');
    if (backdrops.length > 0)
      backdrops[backdrops.length - 1].style.zIndex = '1190';
  }, { once: true });

  modal.show();
}
```

- [ ] **Step 2: Update `js/costgrid.js`'s Clone-incomplete warning to use `showInfo`**

Current code (after Task 1 lands, `js/costgrid.js:972-975`):

```js
      showConfirm(
        'The new proposal was created, but its structure may not have loaded correctly. Please reload the page to verify.',
        null, null, '⚠️ Clone incomplete'
      );
```

Change to:

```js
      showInfo(
        'The new proposal was created, but its structure may not have loaded correctly. Please reload the page to verify.',
        '⚠️ Clone incomplete'
      );
```

- [ ] **Step 3: Update `js/ai.js:101`'s API-key dialog to use `showInfo`**

Current code:

```js
    showConfirm(`No API key configured for ${names[provider] || provider}.\n\nOpen ⚙ Settings → API & Integrations.`, null, null, 'ℹ️ API Key required');
```

Change to:

```js
    showInfo(`No API key configured for ${names[provider] || provider}.\n\nOpen ⚙ Settings → API & Integrations.`, 'ℹ️ API Key required');
```

- [ ] **Step 4: Update `js/ai.js:379-382`'s API-key dialog to use `showInfo`**

Current code:

```js
    showConfirm(
      'Nessuna API key AI configurata.\n\nApri ⚙️ Configura Budget → sezione AI Assistant.',
      null, null, 'ℹ️ API Key richiesta'
    );
```

Change to:

```js
    showInfo(
      'Nessuna API key AI configurata.\n\nApri ⚙️ Configura Budget → sezione AI Assistant.',
      'ℹ️ API Key richiesta'
    );
```

- [ ] **Step 5: Run the test suite**

```bash
npm test
```

Expected: same pass count as before this task (136 tests).

- [ ] **Step 6: Manual verification**

On `planning.html`, trigger the AI Sidebar's send action with no AI API key configured (clear it via ⚙ Settings first). Expected: a dialog titled "ℹ️ API Key required" appears with a single "OK" button (no "Cancel" button visible).

On `costgrid.html`, trigger a Clone with a non-401 structure-load failure (network-throttle just that request). Expected: the "⚠️ Clone incomplete" dialog shows a single "OK" button.

Immediately after either of the above, trigger an ordinary `showConfirm()`-based flow on the same page (e.g., "🗑 Delete version" on a Draft version in `costgrid.html`). Expected: this dialog shows BOTH "Cancel" and the real action button (e.g. "Confirm"/"Delete Version") — confirming `showInfo()`'s temporary hiding of the Cancel button was correctly restored and doesn't leak into subsequent `showConfirm()` calls on the same page.

- [ ] **Step 7: Commit**

```bash
git add js/core.js js/costgrid.js js/ai.js
git commit -m "feat(core): add showInfo() single-button dialog variant, use it for Clone-incomplete and API-key-required messages"
```

---

### Task 3: Add `#confirmModal` markup to `portfolio.html`

**Files:**
- Modify: `portfolio.html` (add static modal markup, e.g. immediately after the existing `#aiModal` block, currently ending around line 476)

**Interfaces:** None — fully independent of Tasks 1 and 2. This task only adds DOM markup; `showConfirm()`/`showInfo()` themselves are unchanged and already look up `#confirmModal` by ID, so once this markup exists, both functions work correctly when called from `portfolio.html`.

- [ ] **Step 1: Add the `#confirmModal` markup**

Insert this markup immediately after the existing `#aiModal` block's closing `</div>` (currently at `portfolio.html:476`, right before the blank line and the `<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/...">` tag):

```html

<div class="modal fade" id="confirmModal" tabindex="-1" data-bs-backdrop="static">
  <div class="modal-dialog modal-dialog-centered" style="max-width:460px">
    <div class="modal-content shadow-lg">
      <div class="modal-header border-0 pb-1"><h6 class="modal-title fw-bold" id="confirmModalTitle">⚠️ Confirm</h6></div>
      <div class="modal-body pt-1"><p id="confirmModalMessage" class="mb-0" style="white-space:pre-line;font-size:.92rem"></p></div>
      <div class="modal-footer border-0 pt-2">
        <button class="btn btn-secondary" id="confirmModalCancel" data-bs-dismiss="modal">Cancel</button>
        <button class="btn btn-danger" id="confirmModalOk">Confirm</button>
      </div>
    </div>
  </div>
</div>
```

This is copied verbatim from `costgrid.html`'s existing `#confirmModal` markup (confirmed identical across `costgrid.html`/`pipeline.html`/`planning.html`) — no adaptation needed.

- [ ] **Step 2: Run the test suite**

```bash
npm test
```

Expected: same pass count as before this task (136 tests).

- [ ] **Step 3: Manual verification**

On `portfolio.html`, open the browser console and manually invoke `showInfo('test message', 'Test Title')` (this exercises the exact function `openAiAnalysis()`'s no-API-key branch calls, once Task 2 has landed — if Task 2 hasn't landed yet in your working state, use `showConfirm('test message', null, null, 'Test Title')` instead). Expected: the dialog appears correctly (previously this would have thrown, since `document.getElementById('confirmModal')` would have returned `null`).

Then confirm `portfolio.html`'s normal rendering (KPI cards, project list, AI Analysis button visibility) is unaffected — the new markup is a hidden Bootstrap modal until explicitly shown, so it should have zero visible effect on the page's default appearance.

- [ ] **Step 4: Commit**

```bash
git add portfolio.html
git commit -m "fix(portfolio): add missing #confirmModal markup so showConfirm()/showInfo() work on this page"
```
