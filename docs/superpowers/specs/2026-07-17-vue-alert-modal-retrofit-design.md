# Retrofit `_db-reset.html`/`project-config.html`: no native alert/confirm, one modal idiom — Design Spec

**Source:** Brief `docs/superpowers/specs/2026-07-17-vue-alert-modal-retrofit-brief.md`. Follow-up cleanup from the cold cross-cycle review recorded in `docs/superpowers/reports/2026-07-16-worktree-project-config-vue-migration-finish-cycle.md` and project memory `feedback_vue_migration_conventions.md`.

## Problem

`_db-reset.html` (2 sites) and `project-config.html` (9 sites) fell back to native `alert()`/`window.confirm()` for error/validation/confirmation messaging during their Vue migrations, diverging from the reactive-inline pattern already proven in `terms.html`/`admin.html`. `_db-reset.html` also pre-instantiates its Bootstrap modal in `mounted()`, diverging from `project-config.html`'s per-call `getOrCreateInstance()` idiom. Both drift points are confirmed-safe-today but risk compounding across the 5 remaining Tier 2 pages if not corrected now.

## Architecture

Presentation-layer retrofit only — no new infrastructure, no API changes. Every native dialog becomes either (a) reactive inline state rendered near the control that triggered it, or (b) a call into the already-existing shared confirm modal. `_db-reset.html` switches its modal instantiation from `mounted()`-time `new bootstrap.Modal(el)` to the per-call `bootstrap.Modal.getOrCreateInstance(...)` idiom already used in `project-config.html`. `_db-reset.html`'s `confirmDelete()`/`pendingScope`/`pendingCgId` dispatcher logic (a previously-reviewed, approved pattern) is untouched — only how the modal instance is obtained/released changes, not the dispatch logic itself.

## Components

### `_db-reset.html`

- **New reactive field `scopeErrorMsg`** (string, `''` = no error), rendered in a shared message area above the 7 scope-delete cards (one area for all 7, not per-card — confirmed: a single delete operation is in flight at a time via the shared confirm modal, so a shared slot is sufficient and simpler).
- `_doScopeDelete()`'s two `alert()` calls (current lines 225, 233 — API failure, network failure) become `this.scopeErrorMsg = '...'` assignments instead. Clear `scopeErrorMsg = ''` at the start of a new scope-delete attempt (when `openScopeConfirm()` runs), so a stale error from a previous attempt doesn't linger next to an unrelated new one.
- **Modal idiom change**: `mounted()` no longer creates `this._modal = new bootstrap.Modal(el)`. It still attaches the `hidden.bs.modal` listener (resetting `pendingScope`/`pendingCgId`/`confirmInputValue`) directly to the `#confirmModal` element — this only needs the DOM element, not a `Modal` instance, so it stays in `mounted()` unchanged in that respect. The 6 `this._modal.show()`/`this._modal.hide()` call sites (`openScopeConfirm()`, `openCgDeleteConfirm()`, `_doScopeDelete()` ×2, `_doCgDelete()` ×2) become `bootstrap.Modal.getOrCreateInstance(document.getElementById('confirmModal')).show()` / `bootstrap.Modal.getInstance(document.getElementById('confirmModal'))?.hide()`. The `_modal` data field is removed entirely (no longer needed).

### `project-config.html`

- **`showConfirm(message)` signature change**: from `showConfirm(message, onConfirm)` (fire-and-forget callback) to `showConfirm(message)` returning `Promise<boolean>` — resolves `true` when the user clicks the modal's confirm button, `false` when the modal is dismissed any other way (Cancel, backdrop-adjacent close via `hidden.bs.modal`, if reachable — note `data-bs-backdrop="static"` on this modal blocks backdrop-click dismissal, so in practice `false` only comes from the explicit Cancel button or a programmatic hide).
  ```js
  showConfirm(message) {
    return new Promise(resolve => {
      this.confirmModal = { message };
      const el = document.getElementById('confirmModal');
      const onHidden = () => resolve(this._confirmResolvedTrue === true);
      this._confirmResolvedTrue = false;
      this._pendingConfirmResolve = () => { this._confirmResolvedTrue = true; };
      el.addEventListener('hidden.bs.modal', onHidden, { once: true });
      bootstrap.Modal.getOrCreateInstance(el).show();
    });
  },
  confirmModalOk() {
    if (this._pendingConfirmResolve) this._pendingConfirmResolve();
    bootstrap.Modal.getInstance(document.getElementById('confirmModal'))?.hide();
  },
  ```
  (Exact implementation detail — using a small instance-level flag plus the existing `hidden.bs.modal` event to resolve the promise exactly once, reusing the modal's native dismiss/confirm flow rather than introducing a second event mechanism. The implementer may simplify this shape as long as the two guarantees hold: resolves `true` only on explicit Confirm click, resolves `false` on every other dismissal path, and resolves exactly once per `showConfirm()` call.)
- **All existing callback-style `showConfirm(msg, callback)` callers migrate to the Promise style**, for one consistent signature within the file: `confirmRemoveTask`, `confirmRemoveResource`, `confirmRemovePtc`, and the Derive/Reforecast confirmations (`derivePhasing()`, `runReforecast()`) all become `async` methods using `if (await this.showConfirm(msg)) { ...proceed... }`.
- **`onSave()`'s empty-phasing check** (currently `if (!window.confirm(...)) return;`) becomes:
  ```js
  if (hasBillable && phasingEmpty) {
    const proceed = await this.showConfirm('The budget phasing for this project is empty — no monthly budget is configured.\n\nSave anyway?');
    if (!proceed) return;
  }
  ```
  Same blocking semantics: declining still aborts the save.
- **Remaining `alert()` sites become inline reactive fields**, placed near their triggering section:
  - `:520` (actuals upload guard, "Set the D365 Project ID first before uploading actuals.") and `:768` (Reforecast-triggered actuals-load network failure) → reuse/extend the existing `actuals` reactive object (already has `info`/`status`/`statusClass` — add or reuse a field for this guard message, rendered in the Actuals section).
  - `:534` (XLSX library unavailable) → a small reactive field near the "⬇ XLSX" button (e.g. `tasksXlsxError`), since this is specific to that one button and unrelated to the Actuals section.
  - `:581` (sold-hours validation failure in `onSave()`) → reuse `jsonError` (already bound to a visible `.alert-danger` banner, already used for the save-flow catch block) — this is itself a save-flow validation failure, consistent with `jsonError`'s existing purpose.
  - `:747` (Derive guard, "Set project dates first.") and `:761`/`:762` (Reforecast guards, "Set project start and end dates first." / "Set the D365 Project ID first...") → a shared reactive field near the Phasing/Planning section's action buttons (e.g. `phasingActionError`), since both Derive and Reforecast buttons live in that same section.
  - `:773` (`distError` from `reforecastDistribution()`, multi-line) → same `phasingActionError` field (it already needs to support multi-line text, matching the modal's `white-space:pre-line` precedent).

## Data flow

No API contract changes anywhere. Only the presentation of existing success/error/validation outcomes changes.

## Error handling

Every converted message preserves its original text verbatim. Every guard that previously used `alert()` to interrupt a flow (e.g. "Set project dates first.") still returns early — it just doesn't pop a native dialog to do it; the reactive field is set and the method returns, same as today.

## Backward compatibility

- No behavior change beyond presentation mechanism. The empty-phasing save-confirmation's blocking semantics are explicitly preserved (see Components above).
- `_db-reset.html`'s `confirmDelete()`/`pendingScope`/`pendingCgId` dispatcher (a previously-reviewed pattern from that page's own migration cycle) is untouched — only the Modal-instance-acquisition mechanism around it changes.
- `project-config.html`'s `showConfirm()` signature change is a breaking change to that method's own internal callers only (all within the same file, all updated in this same cycle) — no other file calls into `project-config.html`'s Vue instance methods, so there's no external caller to break.

## Testing

No new `js/lib/*` module needed — this is Vue template/state only, matching the judgment already applied to both files' original migrations (manual-verification-only for DOM-orchestration code). `npm test` must stay green (63+70 baseline — no test file exists for either page's own UI, so no test content changes expected).

Manual verification (post-merge, browser-based — same `pdash-nginx`-serves-`main`-only constraint as every prior cycle in this roadmap):
- `_db-reset.html`: trigger each of the 7 scope-delete failure paths (or simulate via a forced API error) and confirm the shared message area shows the error, not a native dialog; confirm the modal still opens/closes correctly with the new per-call idiom; confirm `pendingScope`/`pendingCgId` still reset correctly after modal dismissal.
- `project-config.html`: trigger each converted guard/validation/confirmation (missing D365 ID, missing project dates, invalid sold-hours, empty-phasing save, Reforecast `distError`, XLSX unavailable) and confirm each shows inline/in-modal, not via a native dialog, with the exact original message text and the same blocking/non-blocking behavior as before.

## Explicitly out of scope

- `terms.html`/`admin.html` — untouched, already alert/confirm-free.
- Any other page still using native `alert()`/`confirm()` outside these two files.
- New validation logic or new features.
- `js/config-form.js`, `js/clients.js`, `js/programs.js`, or any other shared file.
- `portfolio.html`'s orphaned `#configModal` cleanup — stays deferred per the existing roadmap decision.
