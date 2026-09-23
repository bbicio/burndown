# pipeline.html

Kanban pipeline board (6 stage columns, slide-in detail panel, pipeline-year dropdown), Vue 3 (CDN, no build step, same pattern as `portfolio.html`/`project-config.html`).

This file holds the full implementation narrative for this page — cycle-by-cycle detail, methods involved, first-attempt bugs, and report references. `CLAUDE.md`'s Pages table keeps only a one-line purpose description; when working on this page, read this file, not that row, for the detail. See `/sync-docs`'s routing rule for where future changes to this page should be written.

Cross-cutting board-layout/detail-panel/filter-bar architecture that spans more than one cycle still lives in `CLAUDE.md`'s own "Pipeline board layout", "Detail panel", "Column totals footer", and "Filter bar" sections — this file covers cycle narrative only.

## Base state

Folds in the former `js/pipeline-board.js` (760 lines, now deleted — confirmed exclusive to this page). Adds `js/lib/pipeline-calc.js` (`pbGetVersionBudget`/`pbComputeColumnTotals`/`pbFmtMoney`/`pbFmtDate`/`pbFmtTaskDate`/`pbComputePotPercentages`). `js/costgrid.js`/`js/core.js` and the 4 shared static modals (`#confirmModal`/`#cgNewGridModal`/`#cgCloneModal`/`#jsonViewerModal`) remain unmodified Vanilla, called as globals — `costgrid.html`/`planning.html` still depend on them as-is. Detail panel shows a loading spinner while phase/task structure fetches and an explicit "Could not load cost grid" message if it fails. Outside-click-to-close on the detail panel ignores clicks inside any Bootstrap modal spawned from the panel (Share/Clone/Confirm), since those modals live outside `#pbDetailPanel` in the DOM.

## Detail panel owner/created-at line + inline share list (2026-09)

Detail panel's left column shows the proposal owner name and version creation date as a labeled `Owner: 👤 <name>, Created at: <date>` line (version label dropped from this line — already shown as a colored badge in the version-tabs row above), separated from the Period/Currency/Fees/PTC/Total budget block by its own `<hr>`; plus an inline `<share-list>` component (registered via `app.component('share-list', ...)`, see `js/share-list-component.js`'s own entry in `CLAUDE.md`), positioned just above the optional POT block (after the totals and any note) and `border-top`-separated from the totals — the who-has-access list is now visible without opening the Share modal, and non-owner shares can be removed directly from it. When POT is present its own `border-top` wrapper doubles as the single shared separator line after the share list, so the two blocks intentionally draw one grey line between them, not two. A document-level `hidden.bs.modal` listener on `#shareModal` bumps `shareListRefreshTick` so the inline list refreshes after any change made in the modal.

## Filter bar (2026-09)

See `CLAUDE.md`'s own "Filter bar" subsection (near "Pipeline board layout") for the full design; briefly, a new row between the title bar and the columns holds search + Owner/Client/Currency/Value dropdown filters, all client-side over already-loaded data, matched via `js/lib/pipeline-calc.js`'s `pbCardMatchesFilters`.

## Linked-project button rename (2026-09)

Linked-project button in the detail panel's "Linked projects" section (`pbGoToPortfolio`) relabeled "📊 Portfolio" → "📊 Project Dashboard", matching `costgrid.html`'s identical rename in its own linked-projects area.
