# pipeline.html

Kanban pipeline board (6 stage columns, slide-in detail panel, pipeline-year dropdown), Vue 3 (CDN, no build step, same pattern as `portfolio.html`/`project-config.html`).

This file holds the full implementation narrative for this page — cycle-by-cycle detail, methods involved, first-attempt bugs, and report references. `CLAUDE.md`'s Pages table keeps only a one-line purpose description; when working on this page, read this file, not that row, for the detail. See `/sync-docs`'s routing rule for where future changes to this page should be written.

Board, filter-bar and detail-panel architecture that spans more than one cycle is in this file's "Current state" section below; the dated sections after it carry cycle narrative only. (That architecture lived in `CLAUDE.md` until 2026-10-10, phase 3 of the context-size split.)

## Current state

How the board, the toolbar and the detail panel are built **today** — reference description, as opposed to the dated cycle entries below. Moved verbatim from `CLAUDE.md` on 2026-10-10 (phase 3 of the context-size split); the one imperative that no guard test pins stays in `CLAUDE.md`'s `Invariants` section.

### Pipeline board layout (height math)

Chrome (since Nav B2, 2026-10-02): no footer. At ≥ 1024px the navigation is a fixed left sidebar, so the only chrome above the board is the breadcrumb bar (`--breadcrumb-h`, 32px measured). Below 1024px the icon navbar is in flow with a fixed height (`--nav-top-h` 111px = 56 + 52 rows + 3px border) and the breadcrumb is hidden.

`#pipelineBoardSection.pb-board-root { height: calc(100vh - var(--nav-top-h) - var(--breadcrumb-h)); display:flex; flex-direction:column; overflow:hidden }` (`css/style.css`; `--nav-top-h` is 0px on large screens). Must be kept in sync if the navbar rows or the breadcrumb height change: re-measure in a browser (board bottom == `innerHeight`, page scroll 0 in the three layouts — sidebar open, rail, small navbar). Before B2 this was `calc(100vh - 206px)` (106px navbar + 100px footer). **Corrected 2026-09** — this section previously documented a `#pbColumnsContainer { height: calc(100% - 61px) }` rule; that id and hardcoded calc no longer exist in the current markup (confirmed via code review during the pipeline-filters cycle). The columns row is instead a flex child with `flex:1; min-height:0`, sized automatically by `.pb-board-root`'s `flex-direction:column` layout — any `flex-shrink:0` sibling row added above it (the title bar, and the 2026-09 filter bar) is absorbed automatically without needing a matching pixel adjustment anywhere, unlike a hardcoded `calc()` would require.

**Board redesign (2026-10-06, cycle 1 of 2):** inside `.pb-board-root` the rows are the header (`.pb-header`), the toolbar (`.pb-toolbar`), on smartphone the stage tabs and stage summary, then the `.pb-main` row (`flex:1; min-height:0; display:flex`, since cycle 2) holding the board `.pb-board` (`flex:1 1 auto; min-width:0`, columns `.pb-col`, collapsible) and, when open, the detail panel beside it or over it (see "Detail panel"). There is no footer row any more: column totals live in the column header. Page styles are in `css/pipeline.css` (linked only by `pipeline.html`, tokens only). Below 768px only the column of the selected stage tab (`mobileStage`/`activeMobileStage`) is visible, full width, ignoring the collapsed state.

**Critical**: do NOT add `h-100` to the columns row. Bootstrap's `.h-100` applies `height:100%!important`, which would override the flex sizing and can hide the column below `overflow:hidden`.

### Filter bar (2026-09)

*(Layout described in this paragraph — a background-tinted `flex-shrink:0` row — was replaced by the 2026-10-06 redesign paragraph below; the filter contents and behaviour still apply.)* A row between the title bar and the columns row holding (in this fixed order): a free-text search input, then four Bootstrap dropdown-with-checkboxes — Owner, Client, Currency, Value — each `data-bs-auto-close="outside"` so multi-selecting doesn't close the menu after every click, and each trigger showing a badge with its own active-selection count. The Value dropdown also holds an "Include PTC in value" checkbox below a divider. A neutral "Clear filters" text link appears only once at least one filter is active (`filtersActive` computed).

Filtering is entirely client-side over data already loaded by `cgSyncFromApi()` — no new API calls, and no change to which proposals are visible under the existing owner/shared/admin-all permission model (filters only narrow that already-scoped set). Multi-select values within one filter combine with OR; the five filter categories (search, Owner, Client, Currency, Value) combine with AND. Filters reset on every page load — no persistence in the URL or storage — and apply only to the currently selected pipeline year.

The **Draft column is never filtered** — `stagesData`'s per-card filter check (`js/nav`... see below) explicitly skips `pbCardMatchesFilters` for `stage === 'Draft'`, and the `filterableCards` computed that derives the Owner/Client/Currency option lists also excludes Draft — so a Draft-only owner/client never appears as a selectable option with zero possible matches. Since column card-count badges and header totals already derive from each column's own (now filtered) `cards` array, they update automatically with no separate recompute step.

**Redesign (2026-10-06):** the bar is now `.pb-toolbar` in `pipeline.html`: a search box with a suggestions menu (live filter as before; the menu is a shortcut — a client row sets `filterClientIds`, a proposal row opens the detail panel, "N more results — refine your search"; `pbSearchSuggestions`/`pbHighlight` in `pipeline-calc.js`), the four dropdowns rendered from the `filterGroups` computed (id prefix `flt-bar-`), "Clear filters" and the Amounts segmented control (`.pb-seg`). Below 768px the dropdowns and Amounts are hidden and a "Filters" button opens the bottom sheet `#pbFiltersSheet` (Bootstrap `offcanvas-bottom`): Amounts control, the same four groups in a 2×2 grid (id prefix `flt-sheet-`, same `filter*` state), "Show results". Draft stays unfiltered.

Filter matching logic lives in `js/lib/pipeline-calc.js` (pure, vitest-covered) — see [docs/js/lib.md](../js/lib.md) for `pbPriceBucketKey`/`pbCardMatchesFilters`. Stage/pipeline-column filtering and a board-vs-scrolling-list view toggle were both explicitly discussed and deferred to a future cycle, not implemented here.

### Detail panel

`#pbDetailPanel` (redesigned 2026-10-06, cycle 2 of 2), Vue-rendered (`v-if="selectedCgId"`), 480px wide, lives in the `.pb-main` row beside `.pb-board`. Three container modes (all in `css/pipeline.css`, tokens only): **side by side** (the board shrinks beside the panel, no scrim) at viewport >= 1280px, or >= 1108px when the sidebar is collapsed (`html[data-sidebar="collapsed"]`); **overlay** (panel over the board with `.pb-panel-scrim`) from 768px up to those thresholds; **full screen** (`position: fixed; inset: 0`, no scrim) below 768px. Content (top to bottom):
- While the structure is loading (`detailLoading`): a centred spinner. If `selectedCg`/`selectedVersion` fail to resolve: "Could not load cost grid. Try reloading the page."
- **Header** (`.pb-panel-head`): stage pill + "Linked project" pill, "Version" segmented control (clickable, `openDetailPanel(cgId, verId)`), close; client, title, `Owner <name> · Created on <date>`; actions Edit / Clone (hidden for `myPermission === 'viewer'`), Share (hidden on Draft), Delete (Draft and non-viewer only, `deleteSelectedVersion()`). Clone opens `#cgCloneModal` via `openCloneModal`.
- **Tabs** (`detailTab`, reset to `overview` whenever another card/version is opened): Overview (fee/PTC/total boxes with "≈ €" equivalent for a foreign currency, Period as "May 2026" via `pbFmtMonth`, Currency + "1 € = x" + "Refresh rate" for stale rates, note, "SHARED WITH" `<share-list>`), Tasks (phases, TASK/PERIOD/HOURS/AMOUNT), Linked projects (cards with stage and status pills, "Project Dashboard →"), POT.
- **POT tab**: `loadPotSection(v, stage)` sets `potState = { kind, targetName?, year?, view? }` with `kind` one of `loading | draft | noClient | noTarget | error | ok`; `view` is `pbPotView(summary)` (`js/lib/pipeline-calc.js`): percentage of target reached by Committed + Anticipated, a stacked bar (Committed, Anticipated, Expected, SIP striped) with a notch at the target, legend, 2x2 boxes (Committed, Anticipated, Total C+A, "GAP TO TARGET" or green "OVER TARGET"), "CONTRIBUTING PROPOSALS" and "OTHER PROPOSALS · NOT IN TOTAL" lists (rows not clickable). `GET /api/pots/summary` now also returns `expected_total`, `sip_total` and, per proposal, `client_name` and `value` (EUR fee, a number; `pbPotView` tolerates strings).
- **Closing rules:** Esc (document `keydown`, capture phase) closes the search/year menus first, then the panel, and is ignored while a Bootstrap `.modal.show` or offcanvas is open (Esc there closes only the modal). `mousedown` outside `#pbDetailPanel` closes it (200ms delayed registration) but ignores `.modal`/`.modal-backdrop` (Share/Clone/Confirm live outside the panel), `.pb-card` and the search suggestions menu (those switch the content without a close/reopen flash); a click on the scrim closes it.
- Smartphone (< 768px): title 17px, version segments and actions wrap, the tab row scrolls horizontally, touch targets >= 44px.
- Cache versions: `css/pipeline.css?v=2`, `js/lib/pipeline-calc.js?v=6`.

### Column header totals (2026-10-06; replaces the former column footer)

The totals footer was removed. Each column header (`stagesData[].header`, from `pbColumnHeader` in `js/lib/pipeline-calc.js`) shows the offer count, the **fees** total (bold; `≈` prefix when converted), a muted PTC line when `ptc > 0`, and, in "Original currency" mode, one currency pill per currency present when the column contains any non-EUR card. The "Amounts" toggle (`currencyMode`: `original` | `eur`, "Original currency" / "All in EUR", not persisted) switches cards and headers; in EUR mode cards show the converted amount plus "from {original}". A `currencyRate` of 0/null/missing counts as 1. Currency symbol is included in the value string via `formatMoney(n, cur, currencies)` — do NOT add a standalone currency `<span>`. The header "OPEN PIPELINE" total (`pbOpenPipelineTotal`) is SIP + Expected + Anticipated (Draft, Committed and Canceled excluded), follows the filters and ignores the Amounts toggle. Columns are collapsible (`collapsedStages`, `toggleStage`): empty columns start collapsed, creating/cloning a proposal expands Draft.

## Base state

Folds in the former `js/pipeline-board.js` (760 lines, now deleted — confirmed exclusive to this page). Adds `js/lib/pipeline-calc.js` (`pbGetVersionBudget`/`pbComputeColumnTotals`/`pbFmtDate`/`pbFmtTaskDate`/`pbComputePotPercentages`). `js/costgrid.js`/`js/core.js` and the 4 shared static modals (`#confirmModal`/`#cgNewGridModal`/`#cgCloneModal`/`#jsonViewerModal`) remain unmodified Vanilla, called as globals — `costgrid.html`/`planning.html` still depend on them as-is. Detail panel shows a loading spinner while phase/task structure fetches and an explicit "Could not load cost grid" message if it fails. Outside-click-to-close on the detail panel ignores clicks inside any Bootstrap modal spawned from the panel (Share/Clone/Confirm), since those modals live outside `#pbDetailPanel` in the DOM.

## Detail panel owner/created-at line + inline share list (2026-09)

Detail panel's left column shows the proposal owner name and version creation date as a labeled `Owner: 👤 <name>, Created at: <date>` line (version label dropped from this line — already shown as a colored badge in the version-tabs row above), separated from the Period/Currency/Fees/PTC/Total budget block by its own `<hr>`; plus an inline `<share-list>` component (registered via `app.component('share-list', ...)`, see `js/share-list-component.js`'s own entry in `CLAUDE.md`), positioned just above the optional POT block (after the totals and any note) and `border-top`-separated from the totals — the who-has-access list is now visible without opening the Share modal, and non-owner shares can be removed directly from it. When POT is present its own `border-top` wrapper doubles as the single shared separator line after the share list, so the two blocks intentionally draw one grey line between them, not two. A document-level `hidden.bs.modal` listener on `#shareModal` bumps `shareListRefreshTick` so the inline list refreshes after any change made in the modal.

## Filter bar — cycle narrative (2026-09)

See this file's "Filter bar (2026-09)" subsection under "Current state" for the full design; briefly, a new row between the title bar and the columns holds search + Owner/Client/Currency/Value dropdown filters, all client-side over already-loaded data, matched via `js/lib/pipeline-calc.js`'s `pbCardMatchesFilters`.

## Linked-project button rename (2026-09)

Linked-project button in the detail panel's "Linked projects" section (`pbGoToPortfolio`) relabeled "📊 Portfolio" → "📊 Project Dashboard", matching `costgrid.html`'s identical rename in its own linked-projects area.

## Money formatting (2026-10-01, money centralization cycle)

Card/detail/footer amounts call `formatMoney(amount, code, currencies)` directly with an explicit currency code (the Vue instance exposes `formatMoney` and `currencies`; the former `pbFmtMoney` wrapper was removed); POT amounts are formatted in EUR (the former `potFmtMoney` was removed in the 2026-10-06 panel redesign); the default currency of a card with no currency is `'EUR'` (it was the symbol `'€'`, which made the following `cur !== 'EUR'` test wrongly true). See `docs/js/lib.md`.

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

Known pre-existing behaviour (not changed, board cycle): a non-admin only receives active years from `GET /api/pipeline-years`, so selecting an inactive year (e.g. via a stale value) gets a 403 from the cost-grids load.

## Detail panel redesign, cycle 2 of 2 (2026-10-06)

Panel only (boards 4.10-4.13); spec `docs/superpowers/specs/2026-10-06-pipeline-detail-panel-redesign-design.md`, plan `docs/superpowers/plans/2026-10-06-pipeline-detail-panel-redesign.md`. Container modes, header, tabs, POT and closing rules are described in this file's "Detail panel" subsection under "Current state"; here the cycle's decisions:
1. **POT lists are limited to the pipeline year.** "Other proposals · not in total" = the target's SIP and Expected proposals of the same year; other years never appear (reverses the brief's "of any vintage" note on board 4.13).
2. **No double counting in POT.** The UI allows only one non-Draft version per proposal (`+ New version` only on a Draft; Publish deletes the other Drafts; a published version cannot return to Draft; the real DB had 0 proposals with more than one non-Draft version), so one POT row per proposal. Missing server-side enforcement is recorded for the clone-bug cycle (out of scope).
3. **POT lists show every proposal of the target** (owner and amount included), even those not shared with the user; rows are therefore not clickable.
4. **Panel width 480px**, side by side when the board keeps >= 560px.

Implementation notes: `GET /api/pots/summary` extended backward-compatibly (`expected_total`, `sip_total`, per-proposal `client_name`/`value`); `pbPotView`/`pbFmtMonth` in `pipeline-calc.js` (values arrive as strings or null; a target of 0 gives 0% and `gap.over` true whenever C+A exceeds it; bad dates print "—"); `potState.kind` state machine; `loadPotSection` ignores a response that arrives after another version was selected. `totColor`/`pctC`/`pctA`/`nContrib`/`potFmtMoney` removed (`pbComputePotPercentages` stays in the lib, now unused by the page). No automated screenshots: verified at Gate 2.
