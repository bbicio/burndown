# `project-config.html` Vue 3 Migration — Design Spec

**Source:** Brief `docs/superpowers/specs/2026-07-15-project-config-vue-migration-brief.md`. First Tier 2 page per `docs/superpowers/specs/2026-07-14-vue-migration-roadmap-design.md`. Follows the pattern validated by `terms.html` and `_db-reset.html`.

## Problem

`project-config.html` (521 lines) is the largest remaining Vanilla JS page not yet on Vue, driven by `js/config-form.js` (1369 lines, 54 functions) — the project config form (client/program assignment, project info, tasks & resources, phasing/planning grids with derive/reforecast, PTC, functional groups). It is also the first page in the Tier 2 shared-dependency cluster (also loading `js/roles.js`, `js/clients.js`, `js/programs.js`), so this cycle also resolves — narrowly, for this page's actual usage — the standing question of how Tier 2 pages relate to `config.html`'s already-independent Vue implementation of the same entity types.

## Investigation findings (informing scope decisions below)

Three findings from code review during brainstorming, verified by direct reading, changed the Brief's original assumptions:

1. **`js/roles.js` is loaded but entirely unused** by `config-form.js` on this page (zero references to `roles`/`getRoles()`) — confirmed dead weight specific to this page.
2. **The Form/JSON tab toggle (`#cfgTabJson`, `cfgSwitchTab`) is not page-local dead code** — `cfgSwitchTab` lives in the shared `js/config-form.js` and is still exercised by `portfolio.html`'s own `#configModal`. However, further investigation found **that modal itself is orphaned**: `portfolio.html`'s "⚙️ Configure" button navigates via `window.location.href` to `/project-config.html?projectId=...` (`js/portfolio.js:213-214`), never opening `#configModal`. So the toggle is unreachable everywhere in practice, but `js/config-form.js` itself is explicitly **not touched** by this cycle (it's a shared file and `portfolio.html` cleanup is out of scope here — see below). The new Vue page simply never reproduces this toggle, since it was never reachable from this page.
3. **Rollback/snapshot (`cfgSaveReforecastSnapshot`, `cfgSyncRollbackButtons`, `cfgRollbackReforecast`) is also dead specifically on this page** — `project-config.html`'s own markup (lines 97-115) has no rollback buttons, only Derive/Reforecast. `cfgSyncRollbackButtons` no-ops safely here (`if (!btn) return`, `js/config-form.js:579`) since the buttons don't exist; `cfgSaveReforecastSnapshot` still writes a pointless `localStorage` snapshot as a side effect of every reforecast/derive action today, with nothing to consume it. Confirmed with the user this was removed from this page's UI in a prior iteration and is not to be re-added.

**Decision:** `portfolio.html`'s orphaned `#configModal` (and by extension, whether `js/config-form.js`'s dead `cfgSwitchTab`/rollback code can ever be safely deleted) is explicitly deferred to a **separate future cycle**, not bundled into this one. This cycle touches only `project-config.html`.

## Architecture

Vue 3 rewrite (CDN, `Vue.createApp({...}).mount('#app')`), same pattern as `admin.html`/`terms.html`/`_db-reset.html`. `project-config.html` drops `js/config-form.js` and `js/roles.js` from its script-load list entirely; keeps `js/core.js`, `js/api.js`, `js/api-sync.js`, `js/nav.js`, `js/notifications.js`, `js/settings.js`. Adds one new module, `js/lib/config-form-calc.js` (pure functions, vitest-covered), following the same extraction pattern already established for `cfg-parse.js`/`planning-calc.js`/`costgrid-calc.js`/`status-rules.js`.

`initNav('portfolio', {...})` is unchanged (this page already had a navbar). Viewer mode (read-only banner + disabled inputs + hidden action buttons), currently a `setTimeout`-based DOM sweep (`project-config.html:472-500`) applied after async render, becomes a `computed: { isViewer() {...} }` driving `:disabled`/`v-if` bindings directly in the template — no timing dependency, no DOM sweep.

## Components (single Vue instance)

**`data()`** mirrors current state 1:1: current project object (client/program assignment, project info fields, currency, pipeline/status), `tasks[]` (each with `resources[]`), `phasing`/`planning` grids, `ptcList[]`, `groups[]`, plus local client/program dropdown + add-modal state (own Vue implementation, not shared with `config.html` or `js/clients.js`/`js/programs.js` — per the Brief's resolved open question).

**`js/lib/config-form-calc.js`** (new module): extracts the pure computational core from two of the highest-risk functions, separating math from DOM/modal orchestration (which stays as Vue methods):

- From `cfgDerivePhasing` (`js/config-form.js:626-709`): the pure part is lines 637-676 — computing `newPhasing`/`rawPlanning` per month from task date-overlap or monthly-% distribution, then `newPlanning` via the existing `distributeHoursExact` (already in `js/lib/cfg-parse.js`). Extracted as e.g. `deriveDistribution(tasks, months, cfgStart, cfgEnd)` → `{ newPhasing, newPlanning, totalBudget, totalHours }`. Lines 679-708 (confirm modal, snapshot-save, re-render) become a Vue method calling this pure function.
- From `cfgReforecast` (`js/config-form.js:711-933`, 222 lines): the equivalent split — actuals-based redistribution math extracted as a pure function, confirm-modal/render orchestration as a Vue method. Exact function boundary to be finalized during implementation planning (this function is larger and more intricate than `cfgDerivePhasing`; the plan should read it in full before drawing the line).
- Both extracted functions get vitest unit tests — this is the one part of the page getting new automated coverage; the rest is manual-verification-only, same as every prior migration.

**Dropped entirely (not ported — confirmed dead on this page, see Investigation findings):**
- Rollback/snapshot: no `cfgSaveReforecastSnapshot`/`cfgSyncRollbackButtons`/`cfgRollbackReforecast` equivalent. No `localStorage` snapshot writes.
- The Derive/Reforecast confirmation-modal copy drops the sentence "The current values will be saved as a snapshot for rollback" (`js/config-form.js:687,907`) — it would be inaccurate once no snapshot is saved.
- Form/JSON tab toggle (`#cfgTabJson`, `.cfg-tab-btn`, `cfgSwitchTab`) — never reachable from this page.
- `js/roles.js` load — unused on this page.

**Other sections** (project info, tasks & resources, PTC, functional groups) become straightforward `v-for`-driven lists over reactive arrays with add/remove methods, replacing `cfgMakeTaskCard`/`cfgMakePtcCard`/`cfgMakeGroupCard`'s manual HTML string building — same visual output, same fields, same validation.

**Client/program dropdown + add-modal**: own local Vue implementation (per the Brief's resolved open question — not shared with `config.html`'s independent Vue CRUD, not shared with `js/clients.js`/`js/programs.js`). Populates from the same API calls `cfgRefreshClientDropdown()`/`cfgRefreshProgramDropdown()` use today; the add-modal covers the same single add/edit case currently handled by `openClientEditModal(null)`/`openProgramEditModal(null)` — not the full list-management table (which this page never used).

## Data flow

No change to any API contract. Client/program/project load and save use the same endpoints as today. All phasing/planning/reforecast computation happens client-side over data already in memory (tasks, actuals) — no new network calls introduced.

## Error handling

Identical to current behavior for every path: project field validation, save-error handling, confirmation prompts before destructive actions (delete task/resource/PTC/group). No new error paths introduced by the Vue rewrite.

## Backward compatibility

- Every field, calculation, and validation rule in the 8 form sections is a 1:1 port, **except** the three deliberate omissions confirmed above (rollback/snapshot, Form/JSON toggle, `js/roles.js` load) — none of which are reachable/functional on this page today, so nothing observable changes for a user of this page.
- The Derive/Reforecast confirmation copy loses one now-inaccurate sentence about snapshots (confirmed with the user).
- Viewer mode's *effect* (read-only banner, disabled inputs, hidden buttons) is unchanged; its *mechanism* changes from a post-render `setTimeout` DOM sweep to reactive `computed`/binding — removing a timing dependency, not changing the visible outcome.
- `js/config-form.js` itself is untouched — still loaded by `portfolio.html` for its (separately-tracked, orphaned) `#configModal`. This cycle does not modify, delete, or clean up that file.

## Testing

`js/lib/config-form-calc.js`'s extracted functions get real vitest unit tests covering the derive/reforecast math — new coverage this page never had. Everything else (rendering, viewer mode, dropdowns, save/import/export, XLSX export) is manual, post-merge, browser-based verification — `pdash-nginx` serves `main`'s working directory only, same constraint as every prior migration in this roadmap.

## Explicitly out of scope

- `portfolio.html`'s orphaned `#configModal` and any cleanup of `js/config-form.js`'s now-provably-dead `cfgSwitchTab`/rollback code — deferred to a separate future cycle.
- `config.html`'s own independent Vue CRUD for clients/programs/roles/ratecards — untouched regardless of what this cycle does.
- Migrating `pipeline.html`, `portfolio.html`, `planning.html`, or `costgrid.html` — each is a separate future Tier 2 cycle.
- Any build-step introduction (Vite/SFC).
- Any backend/API change.
- Extracting a shared Vue component/composable for the client/program dropdown+modal, reusable across pages — this cycle's implementation is local to `project-config.html` only (per the resolved open question).
