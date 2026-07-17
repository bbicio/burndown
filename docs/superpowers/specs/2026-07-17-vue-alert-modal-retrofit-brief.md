# Retrofit `_db-reset.html`/`project-config.html`: no native alert/confirm, one modal idiom — Brief

**Scenario:** 2 (evolution of existing pages).

**Source:** Follow-up cleanup identified during a cold cross-cycle review (2026-07-17) of the three completed Vue migrations (`terms.html`, `_db-reset.html`, `project-config.html`), see `docs/superpowers/reports/2026-07-16-worktree-project-config-vue-migration-finish-cycle.md`. Convention now recorded as project memory (`feedback_vue_migration_conventions.md`): no native `alert()`/`window.confirm()` in migrated Vue pages, and one Bootstrap modal-management idiom across the codebase.

---

## Current behavior

**Native `alert()`/`window.confirm()` call sites** (grep-confirmed):

`_db-reset.html`:
- `:225` — `alert('Error: ' + (data.error || 'Unknown error'))` — scope-delete API failure.
- `:233` — `alert('Network error: ' + e.message)` — scope-delete network failure.

`project-config.html`:
- `:520` — `alert('Set the D365 Project ID first before uploading actuals.')` — actuals upload guard.
- `:534` — `alert('XLSX library not available.')` — XLSX export guard.
- `:581` — `alert(`Invalid sold hours "${r.soldHours}"...`)` — save-time sold-hours validation.
- `:590` — `window.confirm('The budget phasing for this project is empty...\n\nSave anyway?')` — empty-phasing save confirmation (this one returns a boolean the caller branches on, not just a notice — see Constraints).
- `:747` — `alert('Set project dates first.')` — Derive-from-dates guard.
- `:761` — `alert('Set project start and end dates first.')` — Reforecast guard.
- `:762` — `alert('Set the D365 Project ID first before running Reforecast.')` — Reforecast guard.
- `:768` — `alert('Could not load actuals from server: ' + e.message)` — Reforecast network failure.
- `:773` — `alert('Cannot reforecast:\n\n' + result.distError)` — Reforecast validation failure (multi-line message).

**Existing reactive-inline precedent already in these same two files** (the pattern to extend, not invent): `_db-reset.html`'s `cgDeleteMsg`/`cgOwnerMsg` (`{text, isError} | null`, rendered via `v-if` with `text-danger`/`text-success` class binding) for the single-proposal-delete and change-owner widgets; `project-config.html`'s `jsonError` (bound to a visible `.alert-danger` banner) for the save-flow catch block, and `clientModal.error`/`programModal.error` for the add-modal validation. Neither file has zero precedent to build from — both already do this correctly in at least one place.

**Modal-management idiom**, currently split two ways:
- `_db-reset.html:180-188` — pre-instantiates in `mounted()`: `this._modal = new bootstrap.Modal(el)`, plus a `hidden.bs.modal` listener resetting `pendingScope`/`pendingCgId`/`confirmInputValue`. Called via `this._modal.show()`/`this._modal.hide()`... — **actually, re-check**: (see Open questions — the brief author did not re-verify whether `.show()`/`.hide()` calls in `_db-reset.html`'s methods still reference `this._modal`, only that `mounted()` sets it up this way).
- `project-config.html:616,625,632,643,729,733` — per-call `bootstrap.Modal.getOrCreateInstance(id).show()` / `bootstrap.Modal.getInstance(id)?.hide()`, no `mounted()`-time instantiation, no stored instance property.

The confirmed convention (per project memory) is to standardize on `project-config.html`'s per-call `getOrCreateInstance()` idiom going forward.

---

## Expected behavior

1. **Every native `alert()` call site listed above** becomes a reactive inline message, following each file's own existing pattern:
   - `_db-reset.html`'s two sites (`:225`, `:233`) should use the existing `cgDeleteMsg`-style pattern, OR (if the scope-delete cards need their own per-card error slot since they're not tied to a single widget) a new small reactive field — to be decided during `/brainstorming` since the 7 scope-delete cards don't currently have an obvious per-card message slot the way the two widgets below them do.
   - `project-config.html`'s guard-style alerts (`:520,534,747,761,762`) and error alerts (`:581,768,773`) should become inline messages near their relevant section (Actuals upload area, XLSX export button, sold-hours validation, Derive/Reforecast buttons) — exact placement is a `/brainstorming` design question, not decided here.
2. **`window.confirm()` at `project-config.html:590`** (empty-phasing "Save anyway?") is different in kind from the others: it's a real yes/no gate the save flow branches on (`if (!window.confirm(...)) return;`), not just a notice. Replacing it requires either extending the existing `confirmModal`/`showConfirm()` infrastructure (already used for task/resource/PTC/group removal and Derive/Reforecast confirmations) to support this save-path branch, or another approach — a `/brainstorming` question, not decided here.
3. **Standardize both files on `bootstrap.Modal.getOrCreateInstance(...).show()` / `getInstance(...)?.hide()`.** `_db-reset.html`'s `mounted()`-time `new bootstrap.Modal(el)` pre-instantiation and its `hidden.bs.modal` reset listener are replaced with the per-call idiom, matching `project-config.html`. The `hidden.bs.modal`-driven state reset (`pendingScope = null` etc.) must be preserved — moved to wherever it needs to live under the new idiom (e.g., still an event listener, just not tied to a `mounted()`-created instance).
4. No behavior change beyond the presentation mechanism — same validation logic, same messages (verbatim text unless a Brief/design reason says otherwise), same branching (a guard that returns early still returns early; the empty-phasing confirm still blocks/proceeds save the same way).

---

## Constraints

- No new features, no new validation rules — purely a presentation-layer retrofit.
- Preserve exact message text for every converted `alert()`, unless `/brainstorming` decides a specific message needs rewording for its new inline context (e.g. shortening for a small inline slot) — flag any such change explicitly rather than silently rewording.
- `project-config.html:590`'s `window.confirm()` return value gates a real code branch (proceed vs. abort save) — its replacement must preserve that decision-blocking semantics, not just become a passive notice.
- Both files' existing `npm test` coverage (63 tests for `_db-reset.html`'s cycle baseline, 70 for `project-config.html`'s, no dedicated tests for either file's own UI) stays green; no test file changes expected unless new `js/lib/*` extraction happens (unlikely to be needed for this retrofit).
- `pdash-nginx` serves `main`'s working directory only — manual verification is a post-merge step, same constraint as every prior migration cycle in this roadmap.

---

## Acceptance criteria

- [ ] Zero `alert(` / `window.confirm(` occurrences remain in `_db-reset.html` or `project-config.html` (verifiable by grep).
- [ ] Every converted message preserves its original text (or any intentional rewording is explicitly called out and approved).
- [ ] The empty-phasing save-confirmation flow (`project-config.html:590`) still correctly blocks the save when the user declines, and proceeds when they accept — same as today's `window.confirm()` gate.
- [ ] `_db-reset.html` no longer pre-instantiates its modal in `mounted()`; both files use `bootstrap.Modal.getOrCreateInstance(...)`/`getInstance(...)` consistently.
- [ ] The `hidden.bs.modal`-driven pending-state reset in `_db-reset.html` (`pendingScope`/`pendingCgId`/`confirmInputValue` clearing) still fires correctly after the modal idiom change.
- [ ] `npm test` passes (63+70 baseline, no regressions).
- [ ] Manual post-merge verification confirms every converted alert/confirm site behaves identically from a user's perspective (same message, same blocking/non-blocking semantics), just presented inline/in-modal instead of via a native browser dialog.

---

## Explicitly excluded scope

- No change to `terms.html` or `admin.html` — already alert/confirm-free, not touched by this cycle.
- No change to any other page still using native `alert()`/`confirm()` (e.g. any not-yet-migrated Vanilla JS page) — this cycle only touches the two already-migrated Vue pages named above.
- No new validation logic, no new features.
- No change to `js/config-form.js`, `js/clients.js`, `js/programs.js`, or any other shared file — this is presentation-layer only, within the two already-Vue files.
- Not a vehicle for any other cleanup (e.g. the separately-tracked `portfolio.html` orphaned `#configModal`) — stays out of scope per the existing roadmap deferral.

---

## Open questions for `/brainstorming`

1. **`_db-reset.html`'s 7 scope-delete cards** have no existing per-card message slot (unlike the two widgets below them, which already have `cgDeleteMsg`/`cgOwnerMsg`). Does the retrofit add a shared error-message area (e.g. above the card grid) or a per-card slot?
2. **The empty-phasing `window.confirm()` at `project-config.html:590`** — extend the existing `confirmModal`/`showConfirm()` infrastructure to support a decision the caller awaits before proceeding (requires `showConfirm` to return a Promise or take two callbacks — accept/decline — rather than today's single `onConfirm`-only shape), or a different mechanism?
3. Should `_db-reset.html`'s modal-idiom change (`mounted()` pre-instantiation → per-call `getOrCreateInstance()`) happen in the same cycle as its alert/confirm retrofit, or does it warrant separating into two smaller, independently-reviewable steps within one plan?
4. Verify (brief author did not re-confirm) whether `_db-reset.html`'s methods actually call `this._modal.show()`/`.hide()` after `mounted()` sets `this._modal`, to scope exactly what needs to change when switching idioms — read the file's methods in full before designing this.

Brief ready. Next step: /brainstorming.
