# pipeline.html

Kanban pipeline board (6 stage columns, slide-in detail panel, pipeline-year dropdown), Vue 3 (CDN, no build step, same pattern as `portfolio.html`/`project-config.html`).

This file holds the full implementation narrative for this page — cycle-by-cycle detail, methods involved, first-attempt bugs, and report references. `CLAUDE.md`'s Pages table keeps only a one-line purpose description; when working on this page, read this file, not that row, for the detail. See `/sync-docs`'s routing rule for where future changes to this page should be written.

Cross-cutting board-layout/detail-panel/filter-bar architecture that spans more than one cycle still lives in `CLAUDE.md`'s own "Pipeline board layout", "Detail panel", "Column totals footer", and "Filter bar" sections — this file covers cycle narrative only.

## Base state

Folds in the former `js/pipeline-board.js` (760 lines, now deleted — confirmed exclusive to this page). Adds `js/lib/pipeline-calc.js` (`pbGetVersionBudget`/`pbComputeColumnTotals`/`pbFmtDate`/`pbFmtTaskDate`/`pbComputePotPercentages`). `js/costgrid.js`/`js/core.js` and the 4 shared static modals (`#confirmModal`/`#cgNewGridModal`/`#cgCloneModal`/`#jsonViewerModal`) remain unmodified Vanilla, called as globals — `costgrid.html`/`planning.html` still depend on them as-is. Detail panel shows a loading spinner while phase/task structure fetches and an explicit "Could not load cost grid" message if it fails. Outside-click-to-close on the detail panel ignores clicks inside any Bootstrap modal spawned from the panel (Share/Clone/Confirm), since those modals live outside `#pbDetailPanel` in the DOM.

## Detail panel owner/created-at line + inline share list (2026-09)

Detail panel's left column shows the proposal owner name and version creation date as a labeled `Owner: 👤 <name>, Created at: <date>` line (version label dropped from this line — already shown as a colored badge in the version-tabs row above), separated from the Period/Currency/Fees/PTC/Total budget block by its own `<hr>`; plus an inline `<share-list>` component (registered via `app.component('share-list', ...)`, see `js/share-list-component.js`'s own entry in `CLAUDE.md`), positioned just above the optional POT block (after the totals and any note) and `border-top`-separated from the totals — the who-has-access list is now visible without opening the Share modal, and non-owner shares can be removed directly from it. When POT is present its own `border-top` wrapper doubles as the single shared separator line after the share list, so the two blocks intentionally draw one grey line between them, not two. A document-level `hidden.bs.modal` listener on `#shareModal` bumps `shareListRefreshTick` so the inline list refreshes after any change made in the modal.

## Filter bar (2026-09)

See `CLAUDE.md`'s own "Filter bar" subsection (near "Pipeline board layout") for the full design; briefly, a new row between the title bar and the columns holds search + Owner/Client/Currency/Value dropdown filters, all client-side over already-loaded data, matched via `js/lib/pipeline-calc.js`'s `pbCardMatchesFilters`.

## Linked-project button rename (2026-09)

Linked-project button in the detail panel's "Linked projects" section (`pbGoToPortfolio`) relabeled "📊 Portfolio" → "📊 Project Dashboard", matching `costgrid.html`'s identical rename in its own linked-projects area.

## Money formatting (2026-10-01, money centralization cycle)

Card/detail/footer amounts call `formatMoney(amount, code, currencies)` directly with an explicit currency code (the Vue instance exposes `formatMoney` and `currencies`; the former `pbFmtMoney` wrapper was removed); `potFmtMoney` formats POT amounts in EUR with `{ rounded: true }`; the default currency of a card with no currency is `'EUR'` (it was the symbol `'€'`, which made the following `cur !== 'EUR'` test wrongly true). See `docs/js/lib.md`.

## Board redesign, cycle 1 of 2 (2026-10-06)

Board only; the detail panel is unchanged (cycle 2: panel container, tabs, POT API). Spec `docs/superpowers/specs/2026-10-06-pipeline-board-redesign-design.md`, input `docs/superpowers/design/2026-10-06-pipeline-brief.md` (boards 4.4-4.9).

What changed:
- **CSS:** page styles moved to `css/pipeline.css` (tokens only, `?v=1`, only `pipeline.html`), guarded by `js/lib/pipeline-guard.test.js` (no hex, emoji or `v-html` in the board region).
- **Header:** title + subtitle, year menu (AVAILABLE PIPELINES, Current/Closed pills, "N offers" per year from `GET /api/pipeline-years` `offers`), "OPEN PIPELINE" total, "+ New Proposal".
- **Toolbar:** search with suggestions (clients and proposals, highlighted hits, "N more results"), the four filter dropdowns from `filterGroups`, "Clear filters", and the Amounts toggle (Original currency / All in EUR, `currencyMode`, not persisted).
- **Columns and cards:** footer removed, totals in the column header with currency pills; collapsible columns (`collapsedStages`); restyled cards, with Edit/Clone/Share/Delete revealed on hover (pointer devices) or keyboard focus only, none on touch.
- **Smartphone (< 768px):** compact header ("+ New"), search + "Filters" button, scrollable stage tabs, stage summary, one full-width column at a time, `#pbFiltersSheet` bottom sheet (Amounts, 2×2 filter groups with `flt-sheet-` ids, "Show results"). The sheet uses `<details>` groups instead of Bootstrap dropdowns because the offcanvas body would clip an absolutely positioned menu.

Decisions (from the brief, applying to the board):
1. Search stays a live filter; the suggestions menu is a shortcut (client row sets the client filter, proposal row opens the panel); no "Press Enter" footer.
2. Open pipeline = SIP + Expected + Anticipated; Draft stays visible with the existing server rule (each user, admins included, sees only their own Drafts).
3. The year-menu counts come from an API extension (Draft and Canceled excluded).
4. Amounts has no persistence (no `localStorage`, no `core.js` bump).
5. Copy: "Original currency" / "All in EUR" on all breakpoints, "Clients" in the suggestions.

Known pre-existing behaviour (not changed): a non-admin only receives active years from `GET /api/pipeline-years`, so selecting an inactive year (e.g. via a stale value) gets a 403 from the cost-grids load.
