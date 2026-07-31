# Clone Warning Modal Follow-Ups — Design Spec

**Source:** Brief `docs/superpowers/specs/2026-07-31-clone-warning-modal-followups-brief.md`. Two follow-ups from the `costgrid-silent-failures` cycle's Gate 3, grouped by user decision (same code path, shared root cause: limits of the existing `showConfirm()` modal). A third item (Item 3) was discovered and added mid-`/brainstorming`, with explicit user approval, per the Brief's own new-findings-isolation reminder.

## Problem

1. A session-expiry (401) during Clone's destination-side structure load shows a confusing "Clone incomplete" warning before the browser completes its redirect to `/login.html`.
2. `showConfirm()`'s two-button (OK/Cancel) affordance is misleading when used for a purely informational message (no real choice exists) — used this way today for Clone's incomplete-structure warning and `js/ai.js`'s "API Key required" dialogs.
3. **(New, discovered during `/brainstorming`)** `portfolio.html` loads `js/ai.js` and has a reachable call path to `openAiAnalysis()` (via the "🤖 AI Analysis" button), which calls `showConfirm()` — but `portfolio.html` has no `#confirmModal` markup at all (confirmed via grep: only `costgrid.html`/`pipeline.html`/`planning.html` have it). If that no-API-key branch is ever hit on `portfolio.html`, `showConfirm()` would fail (`document.getElementById('confirmModal')` returns `null`).

## Architecture

Three independent, additive changes:

### Item 1 — Shared redirect-in-progress flag

`js/api.js`'s `apiFetch()` sets a lightweight shared flag immediately before redirecting on a 401:

```js
if (res.status === 401) {
  window.__pdashAuthRedirecting = true;
  window.location.href = '/login.html';
  throw new Error('Unauthorized');
}
```

`cgCloneGrid()`'s destination-side structure-load check (`js/costgrid.js`, currently):

```js
const structureLoaded = await cgLoadStructureFromApi(cgId, verId);
if (!structureLoaded) {
  showConfirm(
    'The new proposal was created, but its structure may not have loaded correctly. Please reload the page to verify.',
    null, null, '⚠️ Clone incomplete'
  );
}
```

becomes:

```js
const structureLoaded = await cgLoadStructureFromApi(cgId, verId);
if (!structureLoaded && !window.__pdashAuthRedirecting) {
  showInfo(
    'The new proposal was created, but its structure may not have loaded correctly. Please reload the page to verify.',
    '⚠️ Clone incomplete'
  );
}
```

(Note: this snippet also reflects Item 2's rename from `showConfirm` to `showInfo` — the two changes land in the same edited line, no separate task needed.)

No change to `apiFetch()`'s or `cgLoadStructureFromApi()`'s return/throw contract — `__pdashAuthRedirecting` is a pure side-channel signal, opt-in for any caller that wants to check it (only `cgCloneGrid()` does, per this Brief's scope).

### Item 2 — `showInfo()`, a single-button informational variant

New function in `js/core.js`, placed immediately after `showConfirm()`:

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

Key design point: `cancelBtn.style.display = 'none'` is restored (`= ''`) in the `hidden.bs.modal` handler, since `#confirmModal` is a single shared DOM element also used by `showConfirm()` — without restoring it, a `showInfo()` call would permanently hide the Cancel button for every subsequent `showConfirm()` call on the same page.

Three call sites updated to use `showInfo(message, title)` instead of `showConfirm(message, null, null, title)`:
- `js/costgrid.js`'s Clone-incomplete warning (also touched by Item 1, see above).
- `js/ai.js:101` (`aiPlanSend()`'s "No API key configured..." dialog).
- `js/ai.js:380` (`openAiAnalysis()`'s "Nessuna API key AI configurata..." dialog).

`showConfirm()` itself is completely unchanged — every other call site in the app (Delete Grid, Delete Version, Publish-failed, etc.) keeps working exactly as today.

### Item 3 — Add `#confirmModal` markup to `portfolio.html`

Copy the exact markup already present on `costgrid.html`/`pipeline.html`/`planning.html` (verified identical across those three) into `portfolio.html`, so `showInfo()`/`showConfirm()` both function there:

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

## Data flow

No change to any data loading or API call. All three items are presentation/signaling changes layered on existing flows.

## Error handling

Item 1 *is* an error-handling-presentation fix (suppressing a redundant dialog during an already-handled 401 redirect). Item 2 changes only how an existing informational message is presented, not when it fires. Item 3 makes existing error handling (the no-API-key check in `openAiAnalysis()`) actually functional on `portfolio.html` instead of silently throwing.

## Backward compatibility

- `showConfirm()` is untouched — every real confirm/cancel flow in the app (Delete Grid, Delete Version, Publish-failed, etc.) is unaffected.
- Non-401 Clone structure-load failures still show the warning exactly as before (Item 1 only suppresses the 401 case).
- `js/ai.js`'s two API-key dialogs keep their exact message text and title — only the button affordance changes (one "OK" button instead of "Cancel"/"Confirm").
- `portfolio.html` gains inert markup (a `<div class="modal fade" id="confirmModal">` that stays hidden until `showConfirm()`/`showInfo()` is actually called) — no visible change to the page's current rendering.

## Testing

- Manual: reproduce the 401 race during Clone (e.g. expire the session/cookie right before the destination-side structure fetch) and confirm only the `/login.html` redirect is visible, no dialog flash.
- Manual: reproduce a non-401 Clone structure-load failure (e.g. network throttling) and confirm the "⚠️ Clone incomplete" warning still appears, now with a single "OK" button.
- Manual: trigger both `js/ai.js` no-API-key paths (`aiPlanSend()` on `planning.html`, `openAiAnalysis()` on `portfolio.html` — the latter requires temporarily forcing `hasAiKey()` to return `false` while still allowing the button to be clicked, e.g. via devtools, since the button is normally `v-if`-gated) and confirm both show a single-"OK"-button dialog, and that `portfolio.html`'s no longer throws a DOM error.
- Manual: trigger an ordinary `showConfirm()` flow (e.g. Delete Grid) immediately after a `showInfo()` call on the same page, to confirm the Cancel button correctly reappears (regression check for the shared-DOM-element restoration in `showInfo()`).
- `npm test` run as a sanity check; no existing test covers any of these three code paths.

## Explicitly out of scope

(Carried forward verbatim from the Brief, plus Item 3's own boundary.)

- Every other item from the broader backlog surfaced this session (sold-hours validation, `js/ai.js` matching-logic divergence, `_resolveCgIdForVersion()` dead code, XLS column-mapping ambiguity, the "To be planned" tooltip wording, the `/finish-cycle` Gate 2 blind spot, the unused `xlsx@0.18.5` CDN library).
- The FOUC/`v-cloak` Efficiency follow-up.
- Any change to `cgLoadStructureFromApi()`'s or `apiFetch()`'s shared error-handling contract beyond the one opt-in flag.
- Any other native `alert()` calls remaining in `js/costgrid.js`.
- Any further Italian-string translation in `js/ai.js` beyond what's already been done in prior cycles (the message text at both call sites stays as-is, only the button/affordance changes).
