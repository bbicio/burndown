# config.html

Config UI (currencies / roles / clients / client groups / pipelines & POT targets; admin only).

This file holds the full implementation narrative for this page — cycle-by-cycle detail, methods involved, first-attempt bugs, and report references. `CLAUDE.md`'s Pages table keeps only a one-line purpose description; when working on this page, read this file, not that row, for the detail. See `/sync-docs`'s routing rule for where future changes to this page should be written.

## Base state

Tab order (2026-09) is Currencies → Roles → Clients → Client Groups → Pipelines & POTs; the "Programs" tab button is now hidden (`config.html:91-111`) — its `v-show="activeTab === 'programs'"` panel, `programs` data, and `saveProgram`/`deleteProgram`/`Api.programs.*` methods are all untouched and still functional, just unreachable from this nav (program creation moved to `project-config.html`'s "+ New program" and Generate Project's auto-link flow; rename/delete currently have no UI entry point — an open follow-up, not an oversight). Roles form's per-currency rate fields (`v-for="cu in currencies.filter(...)"`) now also filter on `c.active` — previously showed every non-EUR currency in the registry regardless of activation status, contradicting `PRD.md`'s own documented "one field per active currency" behavior; fixed to match, in both the create and edit paths (one shared form).

## Rate-update confirmation modal (2026-09)

The Currencies tab's per-row rate Save button now calls `confirmUpdateCurrencyRate(cur)` instead of `updateCurrencyRate(code)` directly, opening a new `#crRateConfirmModal` showing old→new rate and explaining the update does not retroactively affect any proposal/project already in the system — verified against `cost_grid_versions.currency_rate` being a frozen per-version snapshot (`api/src/routes/pots.js`'s fee subqueries always read `cgv.currency_rate`, never a live join to `currencies.current_rate`).

The modal does not close on Confirm click (`data-bs-dismiss` removed) — `updateCurrencyRate()` now gates on a `saving` reentrancy guard (`if (ed.saving) return;`, matching this codebase's established idiom elsewhere), shows a spinner and disables both buttons while the API call is in flight, and closes itself (`bootstrap.Modal.getInstance(...).hide()`) only on success; a failure keeps the modal open with the error shown inline, rather than closing first and surfacing the error next to an already-dismissed modal.
