# Pipeline board redesign (cycle 1 of 2) — design

Date: 2026-10-06. Type: evolution (Scenario 2), UI redesign page cycle. Source: Brief `docs/superpowers/design/2026-10-06-pipeline-brief.md` (its "Decisioni prese prima del ciclo" section prevails over the rest) with boards `docs/superpowers/design/Pipeline/4.4` → `4.9`, verified against the code in `/brainstorming`. Cycle 2 (detail panel, brief §6/§10) is out of scope here.

## Goal

Restyle the board part of `pipeline.html` — header, year menu, toolbar, search, columns, cards, responsive layout — to match boards 4.4–4.9, inside the page's current structure (one Vue app on `#pipelineBoardSection`, same data loading, same filters, same permissions, same modals). Move board styling out of inline `style="…"` and HTML strings into a new page stylesheet and into pure, tested view-model functions. Add one backward-compatible API field (offer count per pipeline year).

## Current behaviour (verified in code)

- `pipeline.html` (909 lines, no BOM) loads `css/tokens.css?v=9`, `css/style.css?v=21`, Bootstrap 5.3.2 bundle (JS, offcanvas available), and `js/lib/pipeline-calc.js?v=4` (only reference in the repo, `pipeline.html:427`).
- Header (`:21-52`): year title at 2.5rem with a CSS triangle; year menu is an inline-styled absolute box listing `pipelineYears` with a ✓ on the current one; `selectYear()` redirects to `?year=`. `+ New Proposal` uses `btn-primary`, visible when `newProposalVisible`.
- Toolbar (`:55-121`): search input (`🔍` in placeholder) bound live to `filterSearch`; four Bootstrap dropdowns (Owner/Client/Currency/Value, `data-bs-auto-close="outside"`, count badges, "Include PTC in value"); `✕ Clear filters` red link when `filtersActive`.
- Columns (`:122-160`): `stagesData` computed (`:561-598`) groups cards per stage (`PB_STAGES`), skips `pbCardMatchesFilters` for Draft, builds `totalsHtml` HTML strings with hex literals (`#888`, `#ddd`) rendered via `v-html` in a separate footer row (`:161-167`). Column header background = stage bg; `PB_STAGE_STYLE.Draft` uses `#f8f9fa/#adb5bd/#6c757d` (`:449-457`).
- Card: client, title, 🔗 badge if linked, `v-html="cardBudgetHtml(card)"` (`:699-711`, hex `#888`), stage badge via `v-html="pipelineBadge(...)"`, version label, date (`color:#999`), `👤 owner`, buttons `✏️ Edit` / `⧉` (non-viewer), `🔗` Share (non-Draft), `🗑` Delete (Draft and non-viewer), all `@click.stop`.
- `filterableCards` (`:510-522`) = non-Draft display versions; feeds `ownerOptions`/`clientOptions`/`currencyOptions`.
- Search match (`pipeline-calc.js:75-80`): case-insensitive substring on `v.projectName || cg.name` and `getClientName(v.clientId)`.
- Detail panel (`:168-…`): `position:absolute`, 860px, `max-width:100%`, outside-click close via `_pbDetailOutsideClickHandler`. Unchanged in this cycle except the "selected card" state on the board.
- `GET /api/pipeline-years` (`api/src/routes/pipeline-years.js:10-19`) returns `id, year, active, created_at`; non-admins get active years only. Consumers: `pipeline.html`, `master-pipelines.html` (ignores extra fields).
- Board visibility (`api/src/routes/cost-grids.js:134-170`): admin = own CGs or any CG with a non-Draft version; user = own CGs or shared CGs with a non-Draft version; year filter = own Draft-only CGs, or CGs with a non-Draft version whose `pipeline_year` = year. `linkedProjects` comes from `cg_version_projects`.
- `pbGetDisplayVersion` (`pipeline.html:460-468`): latest non-Draft version preferring ones with `linkedProjects`, else latest version.
- `pbFmtDate` already yields "Oct 3, 2026". All tokens needed exist in `css/tokens.css` (`--brand-magenta-tint`, `--surface-subtle`, `--surface-medium`, `--surface-light`, `--text-faint`, `--text-disabled`, `--focus-ring`, `--radius-md/-lg`, `--shadow-sm/-md`, `--color-success`, `--color-danger`, `--pipeline-*-bg/-color`).
- Pre-existing, out of scope: an admin selecting an inactive year gets 403 from `GET /api/cost-grids?year=` and an empty board.

## Design

### 1. Files and boundaries

| File | Change |
|---|---|
| `pipeline.html` | New header/toolbar/board template; new state `currencyMode`, `collapsedStages`, `mobileStage`, `searchOpen`; `PB_STAGE_STYLE.Draft` to tokens; `cardBudgetHtml` and `totalsHtml` removed; links `css/pipeline.css?v=1` after `style.css`; `pipeline-calc.js?v=5`. Detail panel markup untouched. |
| `css/pipeline.css?v=1` (new) | All new `.pb-*` classes and media queries; tokens only, no hex; loaded only by `pipeline.html`. |
| `js/lib/pipeline-calc.js` (v4 → v5) | New pure functions (§6), with `window` bridges. |
| `api/src/routes/pipeline-years.js` | `GET /` adds `offers` per year (§2.4). |
| `test-api.js` | New PY cases for `offers`. |
| `js/lib/pipeline-calc.test.js`, new `js/lib/pipeline-guard.test.js` | Unit + guard tests (§8). |
| `CLAUDE.md`, `docs/pages/pipeline.md` | Docs (§9). |

Not touched: `css/style.css`, `css/tokens.css`, `js/core.js`, `js/costgrid.js`, `js/share-list-component.js`, filter/permission logic, budget calculation, modals. The legacy `.pb-column`/`.pb-col-body`/`.pb-card` rules in `style.css` stay; `pipeline.css` overrides them (loaded after). No emoji in the board part; modal titles are out of scope.

### 2. Header, year menu, Open pipeline (board 4.4, 4.6)

**2.1 Header.** Left: a `<button>` with "Pipeline {{ selectedYear }}" (26px/700, `--brand-navy`) and an inline SVG chevron (rotated while the menu is open), and the unchanged subtitle (including "No active pipelines"). Right: the Open pipeline block (label "OPEN PIPELINE" 10px uppercase, value 17px/700) and `+ New Proposal` (magenta, the only magenta button of the board; visibility `newProposalVisible` as today).

**2.2 Open pipeline.** Sum of **fees only** (PTC excluded, like column totals) of the SIP + Expected + Anticipated columns, each card converted to EUR with its version `currencyRate`. Draft, Committed and Canceled are excluded. It follows the active filters (it is the sum of what the board shows). Always in EUR regardless of Amounts; prefixed with "≈" only when at least one converted amount is included. Computed by `pbOpenPipelineTotal`.

**2.3 Year menu.** White card 300px, `--radius-lg`, `--shadow-md`, group label "AVAILABLE PIPELINES". One `<button>` row per `pipelineYears` entry: "Pipeline 2026" and below "14 offers" ("1 offer" singular; omitted if `offers` is missing). Current year: `--brand-magenta-tint` background, 3px magenta left border, pill "Current". Inactive years (visible to admins only): grey pill "Closed". Closes on outside click (as today) and on Esc. `selectYear()` unchanged.

**2.4 API: `offers` in `GET /api/pipeline-years`.** For each year, the number of cost grids the requesting user would see in the SIP…Committed columns of that year's board:
- Same visibility rule as `GET /api/cost-grids` (admin: own or any CG with a non-Draft version; user: own, or shared with a non-Draft version).
- The CG has a non-Draft version with `pipeline_year` = year (the board's year rule; own Draft-only CGs are excluded since they land in Draft).
- Its display version — latest non-Draft version, preferring versions with a `cg_version_projects` row, as `pbGetDisplayVersion` — is not `Canceled`.
- One query for all years (no per-year round trip). Years with no offers return `offers: 0`. Field added, nothing removed.

**2.5 Smartphone (< 768px).** Title 20px; "Open pipeline ≈ € X" on one line under the title; the button reads "+ New".

### 3. Toolbar, search, Amounts (board 4.4, 4.7)

**3.1 Toolbar (≥ 768px).** One wrapping row: search (300px, SVG icon, placeholder "Search proposal or client…", focus = magenta border + `--focus-ring`); Owner/Client/Currency/Value dropdowns; flexible space; "Amounts" label + segmented control. Dropdowns keep their Bootstrap behaviour, badges and "Include PTC in value"; triggers restyled (white, `--border-light`, `--radius-md`, 12.5px). "Clear filters" becomes a neutral text link (no ✕, not red), shown when `filtersActive`.

**3.2 Filter definition rendered twice.** The four dropdowns are generated from one `filterGroups` list (label, options, bound filter array, id prefix) and rendered in the toolbar and in the smartphone sheet (§5.3), with different id prefixes. Same `filter*` state, no duplicated logic.

**3.3 Search suggestions.** The live filter stays exactly as today (`filterSearch` filters the board while typing). A suggestions menu (400px) opens on focus and updates while typing:
- Match = the same rule as `pbCardMatchesFilters` (case-insensitive substring on title and client name).
- Source = the year's cards before the dropdown filters. **CLIENTS**: from non-Draft cards (same base as `clientOptions`), row = highlighted client name + "N proposals". **PROPOSALS**: from all cards including the user's own Drafts, max 4 rows = highlighted title, amount in original currency, stage-coloured dot · stage · client.
- Highlight without `v-html`: `pbSearchSuggestions` returns text split into `{ text, hit }` segments, rendered as spans.
- Click on a client: `filterClientIds = [id]`, `filterSearch = ''`, menu closes. Click on a proposal: `openDetailPanel(cgId, verId)`, menu closes, search text kept.
- Footer when more than 4 proposals match: "N more results — refine your search". Empty query: "Search by proposal title or client name in Pipeline {{ year }}." No match: `No results for "…"`.
- Closes on outside click, Esc, or focus leaving input + menu. Rows are `<button>`s (Tab-reachable); no arrow-key navigation.

**3.4 Amounts.** New state `currencyMode: 'original' | 'eur'`, always starting at `original`, not persisted. Segmented control of two buttons with `aria-pressed`. In `eur` mode cards and column headers show the EUR amount and, small, "from CHF 20'046.15", for fees and PTC; rate = version `currencyRate` (today's "≈" rate). The Value filter (already EUR) and Open pipeline (always EUR) are unaffected.

### 4. Columns and cards (board 4.4, 4.5)

**4.1 Board row.** Gap 12px, padding `0 24px 20px`, horizontal scroll. Expanded column `flex: 1 0 240px` (fills space, never below 240px); collapsed column 44px.

**4.2 Column.** Background `--surface-medium`, `--radius-lg`, 3px top border in the stage colour, no full-height stage background. Header = `<button>` with `aria-expanded` and title "Collapse column"/"Expand column": name, count pill, total on the right; "+ € X PTC" row when PTC > 0. Totals from `pbColumnHeader(cards, mode)` → `{ total, approx, ptc, pills[] }`:
- all-EUR column: total in EUR;
- column with any non-EUR card, `original` mode: "≈ € total" plus one pill per currency with that currency's fee sum (e.g. "CHF 20'046.15"), EUR first;
- `eur` mode: "≈ € total" (≈ only if something was converted), no pills.
- The footer totals row is removed.

**4.3 Collapsible columns.** `collapsedStages` is initialised **once**, when the initial load completes: empty columns start collapsed. Afterwards only user clicks change it. A column emptied by filters stays expanded and shows a dashed "No offers" box. Collapsed strip (44px): count pill at top, name vertical (`writing-mode`), total vertical when the column has cards; the whole strip is the expand button. Body scrolls vertically inside the column, as today.

**4.4 Card.** `role="button"`, `tabindex="0"`, opens on click and Enter. Top to bottom:
1. client (11px, muted, "—" when missing) · "Linked" pill when `linkedProjects.length` · version label on the right;
2. title 12.5px/600 `--brand-navy`, max 2 lines (`-webkit-line-clamp: 2`, `overflow-wrap: anywhere`), full title in `title`;
3. amount from `pbCardAmount(card, mode)`: `original` = amount 15px/700 + "≈ € X" beside it when foreign; `eur` = EUR amount + "from CHF X"; "No budget" in grey when fee is 0;
4. "+ X PTC" when PTC > 0, same mode;
5. meta row under a hairline: date left, owner right (text only).

**4.5 Card states.**
- Hover, only under `@media (hover: hover)`: darker border + `--shadow-sm`; the date gives way to text actions **Edit · Clone · Share · Delete** (owner stays, height unchanged). Same actions on `:focus-within` for keyboard users.
- Visibility exactly as today: Edit/Clone hidden for `myPermission === 'viewer'`; Share hidden on Draft; Delete only on Draft and non-viewer, in `--color-danger`; all `@click.stop`, same handlers (`showCostGridEditorView`, `openCloneModal`, `openShareModal`, `deleteGridCard`).
- Touch (no hover): no actions on the card; the detail panel has them.
- Selected (`selectedCgId === card.cg.id`): magenta border + `--focus-ring`.
- Draft: dashed border (kept).
- Removed from the card: stage badge (`pipelineBadge` `v-html`), emoji 🔗 👤 ✏️ ⧉ 🗑.

**4.6 Stage colours.** `PB_STAGE_STYLE.Draft` → `bg: var(--surface-light)`, `border: var(--text-disabled)`, `badge: var(--text-muted)`. No `--pipeline-draft-*` token.

### 5. Responsive (boards 4.8, 4.9)

**5.1 ≥ 768px.** One board for desktop and tablet; the `flex: 1 0 240px` columns give the 4.8 tablet look (≈ 3.5 columns at 1024px with the rail, last one cut) with no tablet-specific media query. Hover actions depend only on `(hover: hover)`.

**5.2 < 768px.** Compact header (§2.5). Search full width + **Filters** button; toolbar dropdowns and Amounts hidden; touch targets ≥ 44px. Scrollable **stage tabs** with count and a 3px stage-coloured indicator; only the `mobileStage` column is shown (initially the first stage with cards, else Draft); collapsed state ignored. Stage summary above the list (name, "N offers", total, currency pills, from `pbColumnHeader`). Full-width cards, title 14px, amount 16px.

**5.3 Filters sheet.** Bootstrap `offcanvas-bottom`: title "Filters" + "Close", Amounts control, the four dropdowns in a 2×2 grid (§3.2), navy **Show results** button closing the sheet.

**5.4 Detail panel.** Unchanged in this cycle; it is already `max-width: 100%` (full screen on smartphone, overlay on tablet).

### 6. Pure functions (`js/lib/pipeline-calc.js` v5)

Signatures follow the module's existing style (dependencies injected, `formatMoney` and `currencies` passed in):
- `pbCardAmount(card, mode, deps)` → `{ noBudget, main, approx, from, ptc }` (strings already formatted with `formatMoney(amount, code, currencies)`).
- `pbColumnHeader(cards, mode, deps)` → `{ total, approx, ptc, pills: [{ code, text }] }` (built on `pbComputeColumnTotals`).
- `pbOpenPipelineTotal(columns, deps)` → `{ text, approx }` (SIP + Expected + Anticipated fees in EUR).
- `pbSearchSuggestions(cards, query, deps)` → `{ empty, clients: [{ id, segments, count }], proposals: [{ cgId, verId, segments, amount, stage, clientName }], more }`.
- Helper `pbHighlight(text, query)` → `[{ text, hit }]`.

Formatting only via `formatMoney`; no `Intl.NumberFormat` (money guard).

### 7. Constraints

No build step; no hex in new CSS or board markup (`var(--token)` only); every edited versioned file bumped (`pipeline-calc.js` 4 → 5; `pipeline.css` new at 1); `#app-shell`/`#app-main` untouched; `v-cloak` stays on `.pb-board-root`; `.pb-board-root` height rule in `style.css` unchanged; all user-facing text in English (board copy: "Available pipelines", "Current", "Closed", "Clients", "Proposals", "from CHF …", "N more results — refine your search", "Expand column"/"Collapse column", "Original currency"/"All in EUR"). Edit HTML with the Edit tool, never PowerShell `Set-Content` (BOM).

### 8. Testing

- **vitest unit** (`pipeline-calc.test.js`): `pbCardAmount` (EUR, foreign, `eur` mode, no budget, PTC); `pbColumnHeader` (empty, EUR only, one foreign currency, mixed, `eur` mode); `pbOpenPipelineTotal` (Draft/Committed/Canceled excluded, ≈ flag); `pbSearchSuggestions` + `pbHighlight` (segments, max 4 + `more`, clients from non-Draft only, Draft proposals included, empty query, no match).
- **Guard** (`pipeline-guard.test.js`): `css/pipeline.css` linked only by `pipeline.html`, with `?v=`; no hex in `pipeline.css` nor in the board template (`#pipelineBoardSection` up to `#pbDetailPanel`); no `cardBudgetHtml`/`totalsHtml` and no `v-html` in the board template; no emoji in the board template; every `pipeline-calc.js` reference at `?v=5`. Existing `foundations-guard`, `nav-shell-guard`, `money-guard` stay green.
- **Backend** (`test-api.js`, via `scripts/run-tests.sh`): `offers` present on every row; admin vs user counts differ as visibility dictates; a shared CG counts for the user; Draft-only and Canceled excluded; display version wins (older SIP version + newer Canceled version → not counted).
- **Rhythm (PROCESS.md §6.2):** during tasks run only touched test files; full suite once at the end of execution, then Gate 1.

### 9. Documentation

`CLAUDE.md`: "Pipeline board layout" (board row, footer removed), "Column totals footer" → column header totals, "Filter bar" (new toolbar, suggestions, Amounts, smartphone sheet), file structure (`css/pipeline.css`), `pipeline-calc.js?v=5`. `docs/pages/pipeline.md`: cycle narrative.

### 10. Execution and verification

- Execution (PROCESS.md §6.1): subagent-driven, 4–5 large tasks (API; pure functions + tests; desktop template + CSS; responsive + sheet; docs), Sonnet implementers, Opus final whole-branch review; Gate 3 not re-run if that review covers HEAD.
- No automated screenshots (decided in `/brainstorming`). Visual check = user at Gate 2 on the branch stack with real data, checklist:
  - widths 1440 sidebar open, 1440 rail, 1024 and 390 (DevTools);
  - year menu (Current, offers, Closed), Open pipeline value;
  - search: empty, results, no results, client click, proposal click;
  - Amounts `eur` on cards and headers; multi-currency column pills;
  - collapse/expand; empty columns collapsed at load;
  - hover actions as owner, as shared viewer, on Draft; selected card; actions reachable with Tab;
  - smartphone stage tabs and Filters sheet;
  - comparison with boards 4.4–4.9.

## Out of scope

Detail panel (cycle 2: container, header, tabs, POT API); filter and permission logic; budget calculation; modals (New proposal, Clone, Confirm, JSON viewer, Share); `costgrid.html`; cleanup of legacy `.pb-*` rules in `style.css`; Amounts persistence; arrow-key navigation in suggestions; the inactive-year 403 (pre-existing, noted in the report).

## Acceptance criteria

1. Board matches boards 4.4–4.9 at 1440/1024/390 within the code's business rules.
2. No `v-html`, hex or emoji in the board template; `pipeline.css` only on `pipeline.html`; `style.css`/`tokens.css`/`core.js` unchanged.
3. Footer totals removed; header totals with currency pills; Open pipeline = SIP + Expected + Anticipated fees in EUR.
4. Columns collapsible, empty ones collapsed at load.
5. Card hierarchy, hover/focus actions with today's visibility, selected state.
6. Amounts original/EUR on cards and headers.
7. Live search + suggestions (client → filter, proposal → panel).
8. Year menu with Current/Closed and `offers` from the API with board visibility.
9. Smartphone stage tabs and Filters sheet sharing the desktop filter state.
10. All tests green (new unit, guard, PY cases, existing suites).
