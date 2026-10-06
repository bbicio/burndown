# Pipeline board redesign (cycle 1 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the board part of `pipeline.html` (header, year menu, toolbar, search suggestions, Amounts, collapsible columns, cards, smartphone layout) to boards 4.4–4.9, and add an `offers` count to `GET /api/pipeline-years`.

**Architecture:** Restyle in place (spec approach A): same Vue app, data loading, filters and permissions. Board styling moves from inline styles/HTML strings to a new page stylesheet `css/pipeline.css` and to pure view-model functions in `js/lib/pipeline-calc.js` whose results the template renders (no `v-html`). The detail panel is untouched (cycle 2).

**Tech Stack:** Vue 3 (CDN, runtime-compiled, no build), Bootstrap 5.3.2 (dropdowns, offcanvas), vitest + jsdom, Express + PostgreSQL, `test-api.js` integration suite.

**Spec:** `docs/superpowers/specs/2026-10-06-pipeline-board-redesign-design.md` (read it — section numbers below refer to it). Brief and boards: `docs/superpowers/design/2026-10-06-pipeline-brief.md`, `docs/superpowers/design/Pipeline/4.4`…`4.9`.

## Global Constraints

- No build step; runtime files are served as on disk.
- No hex literals in `css/pipeline.css` or in the board template (`#pipelineBoardSection` up to `#pbDetailPanel`): `var(--token)` only, tokens already in `css/tokens.css`.
- Do not modify `css/style.css`, `css/tokens.css`, `js/core.js`, `js/costgrid.js`, `js/share-list-component.js`, the detail panel markup, the modals, filter logic (`pbCardMatchesFilters`) or permission rules.
- `css/pipeline.css?v=1` linked only by `pipeline.html`, after `css/style.css?v=21`. `js/lib/pipeline-calc.js` reference bumped `?v=4` → `?v=5`.
- Money formatting only via `formatMoney(amount, code, currencies)`; no `Intl.NumberFormat`/`toLocaleString` on amounts.
- No emoji in the board template; icons are inline SVG with `stroke="currentColor"`, `aria-hidden="true"`.
- `v-cloak` stays on `.pb-board-root`; `#app-shell`/`#app-main` untouched.
- All user-facing text in English. Exact copy: "AVAILABLE PIPELINES", "Current", "Closed", "N offers"/"1 offer", "OPEN PIPELINE", "Search proposal or client…", "CLIENTS", "PROPOSALS", "N proposals", "N more results — refine your search", "Search by proposal title or client name in Pipeline {year}.", `No results for "{query}"`, "Amounts", "Original currency", "All in EUR", "from {amount}", "+ {amount} PTC", "No budget", "No offers", "Linked", "Expand column"/"Collapse column", "Clear filters", "Filters", "Show results", "Close", "+ New Proposal" (smartphone "+ New").
- Edit HTML files with the Edit tool only — never PowerShell `Get-Content`/`Set-Content` (adds a BOM). `pipeline.html` has no BOM and must not get one.
- Tests during a task: only the touched test files (`npx vitest run js/lib/<file>.test.js`). Full suite (`npm test`) only in Task 5. Host Node is 24: run natively. A fresh worktree needs `npm ci` once and a copy of `.env` from the main checkout.
- Docker: never run `docker compose` against the main stack (`pdash-*`, project `burndown`). Backend integration tests run only via `scripts/run-tests.sh` (isolated `pdash_test` stack, self-tearing-down). Never pass `-v`/`--volumes` to anything touching the main stack; if a command misbehaves, stop and report — do not escalate.
- No automated screenshots; visual verification is the user's at `/finish-cycle` Gate 2 (checklist at the end).

## Review Focus

1. A card with fee 0 and PTC > 0 → "No budget" plus the "+ X PTC" line; no `NaN`, no "€ 0,00" as main amount. Test in Task 2 (`pbCardAmount`).
2. A version with `currencyRate` 0, null or missing → treated as 1 (no `Infinity`) in `eur` mode, column header and Open pipeline. Test in Task 2.
3. A search query with regex characters or different case (e.g. `"a.(b"`, `"BAY"`) → literal, case-insensitive match; highlight segments keep the original casing of the text. Test in Task 2 (`pbHighlight`).
4. A card whose version has no `projectName`, an empty `cg.name`, and no client → title "—", client "—"; never "undefined"/"null" in suggestions or cards. Test in Task 2 (`pbSearchSuggestions`); template uses the same fallbacks (Task 4).
5. A collapsed column that receives a card through a user action (new proposal, clone) or loses all its cards through a filter → creating/cloning expands the Draft column; a column emptied by a filter stays as it is (expanded shows "No offers"). Implemented and checked in Task 4.

---

### Task 1: `offers` count in `GET /api/pipeline-years`

**Files:**
- Modify: `api/src/routes/pipeline-years.js:10-19`
- Test: `test-api.js` (inside `testPipelineYears()`, new cases `PY-10`…`PY-14`)

**Interfaces:**
- Produces: every row of `GET /api/pipeline-years` gains `offers: number` (integer ≥ 0). Existing fields unchanged.

- [ ] **Step 1: Write the failing integration cases** in `testPipelineYears()` (after the existing PY cases, using `TEST_YEAR`, which is active at that point; reuse helpers `api`, `ok`, `later`, `getPlainUserCookie`, `sysadminCookie`):
  - `PY-10` every row has `Number.isInteger(row.offers) && row.offers >= 0`.
  - Setup: as admin create CG `__test_py_offers_a__` (`pipelineYear: TEST_YEAR`), publish its version (`POST /:id/versions/:vId/publish`, see `cost-grids.js:554`) so it is SIP in `TEST_YEAR`; CG `__test_py_offers_b__` published then `PATCH` its version to `pipeline: 'Canceled'`; CG `__test_py_offers_c__` left Draft-only; CG `__test_py_offers_d__` with an older version published (SIP, `TEST_YEAR`) and a newer version published then patched to `Canceled`. Read the baseline `offers` for `TEST_YEAR` before setup and assert deltas, not absolutes.
  - `PY-11` admin delta = 1 (A counted; B Canceled, C Draft-only, D display version Canceled not counted).
  - `PY-12` plain user (via `getPlainUserCookie()`) sees delta 0 for these admin-owned CGs.
  - `PY-13` after `POST /api/cost-grids/:A/shares` to the plain user, the plain user's delta = 1.
  - `PY-14` a row for a year with no proposals has `offers === 0`.
  - Cleanup: non-Draft CGs cannot be deleted with `DELETE /api/cost-grids/:id`; register the sysadmin single-proposal delete from `api/src/routes/reset.js:132` (`POST /api/admin/reset/cost-grid/:cgId` — read the route for its exact body) with `later(...)` — extend `runCleanup` only if its null body is not accepted.

- [ ] **Step 2: Run to verify it fails**

Run: `scripts/run-tests.sh`
Expected: `PY-10`…`PY-13` fail (`offers` undefined).

- [ ] **Step 3: Implement** in the `GET /` handler: keep the existing years query; add one query computing, per `pipeline_year`, the count of visible CGs whose display version is not Canceled, then attach `offers` (default 0) to each row. Visibility = the same `visibilityClause` logic as `cost-grids.js:137-156` (admin: owner or has a non-Draft version; user: owner, or shared via `resource_shares` with `resource_type = 'cost_grid'` and has a non-Draft version). Year membership = CG has a non-Draft version with that `pipeline_year`. Display version = `DISTINCT ON (cg.id)` over non-Draft versions ordered by `EXISTS(cg_version_projects for that version) DESC, created_at DESC` (mirrors `pbGetDisplayVersion`, `pipeline.html:460-468`). Count per year where display version's `pipeline <> 'Canceled'`. One query for all years.

- [ ] **Step 4: Run to verify it passes**

Run: `scripts/run-tests.sh`
Expected: all PY cases pass, no regression in other sections; the stack tears itself down.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/pipeline-years.js test-api.js
git commit -m "feat(api): offers count per pipeline year with board visibility"
```

---

### Task 2: View-model functions in `js/lib/pipeline-calc.js` (v5)

**Files:**
- Modify: `js/lib/pipeline-calc.js` (append functions + `window` bridges)
- Test: `js/lib/pipeline-calc.test.js`

**Interfaces:**
- Consumes: existing `pbGetVersionBudget`, `pbComputeColumnTotals` (same file).
- Produces (all exported and bridged on `window`), with `deps = { cgComputeGrandTotals, getPipelineBudget, getClientName, formatMoney, currencies }`; `card = { cg, v }`, plus `stage` where noted; `mode` is `'original' | 'eur'`; rate fallback everywhere: a non-finite or ≤ 0 rate becomes 1.
  - `pbCardAmount(card, mode, deps) → { noBudget: boolean, main: string|null, approx: string|null, from: string|null, ptc: string|null }`
    - `original`: `main = formatMoney(fee, cur)`; `approx = '≈ ' + formatMoney(fee/rate, 'EUR')` only if `cur !== 'EUR'` and fee > 0; `from = null`; `ptc = '+ ' + formatMoney(ptc, cur) + ' PTC'` if ptc > 0.
    - `eur`: `main = formatMoney(fee/rate, 'EUR')`; `from = 'from ' + formatMoney(fee, cur)` only if `cur !== 'EUR'`; `approx = null`; `ptc = '+ ' + formatMoney(ptc/rate, 'EUR') + ' PTC'` if ptc > 0.
    - fee not > 0: `noBudget = true`, `main = approx = from = null` (ptc still computed). `cur = v.currency || 'EUR'`.
  - `pbColumnHeader(cards, mode, deps) → { count: number, total: string|null, approx: boolean, ptc: string|null, pills: Array<{ code: string, text: string }> }`
    - From `pbComputeColumnTotals`. `count = cards.length`; `total = null` and `pills = []` when count is 0.
    - `approx = true` iff any card currency ≠ EUR. `total = formatMoney(totalEur, 'EUR')`; `ptc = '+ ' + formatMoney(totalEurPtc, 'EUR') + ' PTC'` if > 0 (template prefixes "≈ " to total and PTC amount when `approx`).
    - `pills`: only in `original` mode and when `approx`; one per currency, EUR first then alphabetical, `text = formatMoney(fee, code)`.
  - `pbOpenPipelineTotal(columns, deps) → { text: string, approx: boolean }` with `columns = Array<{ stage, cards }>`: EUR fee sum of stages `SIP`, `Expected`, `Anticipated` only; `approx` iff any card there is non-EUR.
  - `pbHighlight(text, query) → Array<{ text: string, hit: boolean }>`: literal, case-insensitive, every occurrence; blank query → `[{ text, hit: false }]`; concatenated `text` always equals the input.
  - `pbSearchSuggestions(cards, query, deps) → { empty: boolean, clients: Array<{ id, name, segments, count }>, proposals: Array<{ cgId, verId, title, segments, amount, stage, clientName }>, more: number }` with `cards = Array<{ cg, v, stage }>` (Draft included):
    - `empty = true` (and empty lists, `more = 0`) when the trimmed query is blank.
    - match rule = `pbCardMatchesFilters`'s search rule (substring of title `v.projectName || cg.name` or of `getClientName(v.clientId)`).
    - `clients`: distinct `v.clientId` of **non-Draft** cards whose client name matches; client name `'Unassigned'`/empty excluded; `count` = number of non-Draft cards of that client; sorted by name.
    - `proposals`: matching cards in input order, first 4; `title = v.projectName || cg.name || '—'`; `clientName` = client name or `'—'`; `amount = pbCardAmount(card, 'original', deps).main` (null if no budget); `more = matches − 4` (≥ 0).

- [ ] **Step 1: Write the failing tests** in `pipeline-calc.test.js`, one `describe` per function, with a stub `formatMoney = (n, code) => code + ' ' + n.toFixed(2)` and `currencies = []`:
  - `pbCardAmount`: EUR card fee 100 ptc 0 → `{ noBudget:false, main:'EUR 100.00', approx:null, from:null, ptc:null }`; CHF fee 110 rate 1.1 original → `approx: '≈ EUR 100.00'`; same in `eur` → `main:'EUR 100.00', from:'from CHF 110.00'`; fee 0 ptc 5 → `noBudget:true, main:null, ptc:'+ EUR 5.00 PTC'` (Review Focus 1); rate 0 and rate missing → no `Infinity` in any string (Review Focus 2).
  - `pbColumnHeader`: empty → `{ count:0, total:null, pills:[] }`; two EUR cards → `approx:false`, no pills; EUR + CHF original → `approx:true`, pills `[EUR…, CHF…]` in that order; same in `eur` → `pills: []`; ptc row present only when ptc > 0.
  - `pbOpenPipelineTotal`: columns for all six stages with one EUR 100 card each → `text:'EUR 300.00', approx:false`; a CHF card in Committed does not set `approx`; a CHF card in SIP does.
  - `pbHighlight`: `('Bayer AG','bay')` → `[{text:'Bay',hit:true},{text:'er AG',hit:false}]`; `('a.(b a.(b','A.(B')` → two hits, no throw (Review Focus 3); blank query → one non-hit segment.
  - `pbSearchSuggestions`: blank → `empty:true`; 6 matching proposals → 4 rows + `more:2`; client appearing only on a Draft card → not in `clients` but its Draft card is in `proposals`; card with no name/client → `title:'—'`, `clientName:'—'` (Review Focus 4); `count` counts non-Draft cards of the client, not only matches.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run js/lib/pipeline-calc.test.js`
Expected: FAIL (functions not exported).

- [ ] **Step 3: Implement** the five functions with the signatures above, append `window.pbCardAmount = pbCardAmount;` etc. for each.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run js/lib/pipeline-calc.test.js`
Expected: PASS, existing cases untouched.

- [ ] **Step 5: Commit**

```bash
git add js/lib/pipeline-calc.js js/lib/pipeline-calc.test.js
git commit -m "feat(pipeline): view-model functions for card amount, column header, open pipeline, search suggestions"
```

---

### Task 3: Header, year menu, toolbar, search suggestions, Amounts (desktop)

**Files:**
- Create: `css/pipeline.css`
- Modify: `pipeline.html` (`<head>` link; template `:21-121`; Vue `data`/`computed`/`methods`/`created`; script tag `:427` → `?v=5`)
- Test: none new (pure logic tested in Task 2; guard in Task 4)

**Interfaces:**
- Consumes: Task 1 `offers`; Task 2 `pbOpenPipelineTotal`, `pbSearchSuggestions` (pass `deps` built once as a method `pbDeps()` returning `{ cgComputeGrandTotals, getPipelineBudget, getClientName, formatMoney: window.formatMoney, currencies: window.__currencies }`).
- Produces for Task 4/5: data `currencyMode: 'original'` (`'original' | 'eur'`), `searchOpen: false`; computed `filterGroups` = `[{ key:'owner', label:'Owner', options: ownerOptions, model:'filterOwnerIds' }, { key:'client', … 'filterClientIds' }, { key:'currency', … 'filterCurrencies' }, { key:'value', … 'filterPriceBuckets', withPtc: true }]`; method `pbDeps()`; CSS classes `.pb-header`, `.pb-toolbar`, `.pb-filter-trigger`, `.pb-seg` (segmented control, buttons with `aria-pressed`), `.pb-pill`.

- [ ] **Step 1: Link the stylesheet and bump the lib.** Add `<link rel="stylesheet" href="css/pipeline.css?v=1">` after `css/style.css?v=21`; change `pipeline-calc.js?v=4` to `?v=5`.

- [ ] **Step 2: Header (spec §2.1–2.3).** Replace `:21-52`: title button (26px/700 `--brand-navy`, inline SVG chevron rotated when `yearDropdownOpen`), subtitle unchanged; year menu as a 300px card (`--radius-lg`, `--shadow-md`) with "AVAILABLE PIPELINES", rows showing "Pipeline {year}" and `py.offers` as "N offers"/"1 offer" (omitted when `offers` is undefined), current row `--brand-magenta-tint` + 3px magenta left border + "Current" pill, inactive rows a grey "Closed" pill. Add Esc to close (a `keydown` listener in `created`, alongside the existing outside-click listener). Right side: Open pipeline block from a computed `openPipeline` = `pbOpenPipelineTotal(stagesData, this.pbDeps())` rendered as "≈ " (if `approx`) + `text`; `+ New Proposal` restyled magenta, same `v-if`.

- [ ] **Step 3: Toolbar (spec §3.1–3.2).** Replace `:55-121`: search input (300px, SVG icon, placeholder "Search proposal or client…", focus `--brand-magenta` border + `--focus-ring`), the four dropdowns rendered by `v-for` over `filterGroups` with id prefix `flt-bar-` (checkbox `v-model` bound to the group's array, e.g. via `$data[g.model]`; Value group keeps "Include PTC in value" bound to `filterIncludePtc`), count badges, "Clear filters" neutral text link (`v-if="filtersActive"`), flexible spacer, "Amounts" + `.pb-seg` with "Original currency"/"All in EUR" setting `currencyMode`.

- [ ] **Step 4: Search suggestions (spec §3.3).** Computed `searchSuggestions` = `pbSearchSuggestions(yearCards, filterSearch, deps)` where `yearCards` is a new computed listing every display card of the year with its `stage` (same source as `stagesData`, no filters, Draft included). Menu (400px) shown when `searchOpen`: empty-state text, CLIENTS rows (`segments` as spans, hit spans bold/highlighted; "N proposals"), PROPOSALS rows (segments, amount, stage dot coloured from `PB_STAGE_STYLE[stage].badge` · stage · client), footer "N more results — refine your search" when `more > 0`, `No results for "…"` when both lists are empty. Client click → `filterClientIds = [id]; filterSearch = ''; searchOpen = false`. Proposal click → `searchOpen = false; openDetailPanel(cgId, verId)`. Open on input focus; close on Esc, outside click (`mousedown` outside the search wrapper) and `focusout` leaving the wrapper.

- [ ] **Step 5: Styles.** In `css/pipeline.css`: page background `--surface-subtle`; header, menu, toolbar, triggers (white, `--border-light`, `--radius-md`, 12.5px), `.pb-seg`, suggestions menu, pills. Tokens only.

- [ ] **Step 6: Verify.** Run `npx vitest run js/lib/pipeline-calc.test.js js/lib/money-guard.test.js js/lib/foundations-guard.test.js js/lib/nav-shell-guard.test.js` → PASS. Open the page in a static check if available, else rely on Task 5 + Gate 2.

- [ ] **Step 7: Commit**

```bash
git add css/pipeline.css pipeline.html
git commit -m "feat(pipeline): restyled header, year menu with offers, toolbar, search suggestions, Amounts toggle"
```

---

### Task 4: Columns, cards, footer removal, guard test

**Files:**
- Modify: `pipeline.html` (template `:122-167`; `stagesData`, `PB_STAGE_STYLE.Draft`, `cardBudgetHtml` removed; `created`)
- Modify: `css/pipeline.css`
- Create: `js/lib/pipeline-guard.test.js`

**Interfaces:**
- Consumes: Task 2 `pbCardAmount`, `pbColumnHeader`; Task 3 `currencyMode`, `pbDeps()`, `.pb-pill`.
- Produces for Task 5: data `collapsedStages: []` (array of stage names); `stagesData` items `{ stage, st, cards, header }` with `header = pbColumnHeader(cards, currencyMode, deps)` (no `totalsHtml`); method `toggleStage(stage)`; CSS classes `.pb-board`, `.pb-col`, `.pb-col--collapsed`, `.pb-col-head`, `.pb-col-body`, `.pb-card`, `.pb-card--draft`, `.pb-card--selected`, `.pb-card-actions`.

- [ ] **Step 1: Write the guard test** `js/lib/pipeline-guard.test.js` (read files with `fs`, like the existing `*-guard.test.js` files; the board template = the text of `pipeline.html` from `id="pipelineBoardSection"` up to `id="pbDetailPanel"`):
  - `css/pipeline.css` is linked by `pipeline.html` with `?v=` and by no other `*.html`;
  - no `#[0-9a-fA-F]{3,8}\b` in `css/pipeline.css` nor in the board template;
  - board template contains no `v-html`, and `pipeline.html` contains no `cardBudgetHtml`/`totalsHtml`;
  - board template contains no emoji (`/\p{Extended_Pictographic}/u`);
  - every `pipeline-calc.js?v=` reference in the repo's `*.html` is `?v=5`;
  - `PB_STAGE_STYLE` Draft entry contains no `#`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run js/lib/pipeline-guard.test.js`
Expected: FAIL on `v-html`, hex, emoji and `cardBudgetHtml`.

- [ ] **Step 3: Columns (spec §4.1–4.3).** Replace columns + footer `:122-167` with `.pb-board` (gap 12px, padding `0 24px 20px`, `overflow-x:auto`) containing per stage a `.pb-col` (`flex: 1 0 240px`; collapsed 44px), `--surface-medium`, `--radius-lg`, 3px top border `st.border`. Header `<button class="pb-col-head" :aria-expanded :title="collapsed ? 'Expand column' : 'Collapse column'" @click="toggleStage(stage)">` with name, count pill, `header.total` (prefixed "≈ " when `header.approx`), PTC row, `header.pills`. Collapsed: count pill, vertical name and vertical total (`writing-mode: vertical-rl`). Empty expanded column: dashed "No offers" box. Delete the footer row entirely. `stagesData` returns `header` instead of `totalsHtml`. `PB_STAGE_STYLE.Draft = { bg:'var(--surface-light)', border:'var(--text-disabled)', badge:'var(--text-muted)' }`.

- [ ] **Step 4: Collapse state (Review Focus 5).** In `created`, right after the initial-load `this.refreshTick++`, set `collapsedStages` to the stages whose `stagesData` cards are empty (once). In the `btnCgCreateGrid` and `btnCgClone` handlers, after `this.refreshTick++`, remove `'Draft'` from `collapsedStages`. No other automatic change.

- [ ] **Step 5: Cards (spec §4.4–4.5).** Each card `<div class="pb-card" role="button" tabindex="0" :title="fullTitle" @click="openDetailPanel(...)" @keydown.enter="openDetailPanel(...)">` with `pb-card--draft` on Draft and `pb-card--selected` when `selectedCgId === card.cg.id`. Rows: client (`cardClientName(card) || '—'`) · "Linked" pill if `(card.v.linkedProjects || []).length` · version label; title (`card.v.projectName || card.cg.name || '—'`, 2-line clamp); amount from a method `cardAmount(card)` = `pbCardAmount(card, currencyMode, pbDeps())` (main + `approx` or `from`, or "No budget"); PTC line; meta row date left / owner right, with `.pb-card-actions` (Edit · Clone · Share · Delete as text buttons, same `v-if`s and `@click.stop` handlers as today, Delete in `--color-danger`) replacing the date only under `@media (hover: hover)` on `:hover` and on `:focus-within`. Remove `cardBudgetHtml` and the per-card `pipelineBadge`.

- [ ] **Step 6: Styles** for all classes above in `css/pipeline.css` (hover border + `--shadow-sm`, selected magenta border + `--focus-ring`, Draft dashed border).

- [ ] **Step 7: Run to verify it passes**

Run: `npx vitest run js/lib/pipeline-guard.test.js js/lib/pipeline-calc.test.js js/lib/money-guard.test.js js/lib/foundations-guard.test.js js/lib/nav-shell-guard.test.js js/lib/nav-layout-guard.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add pipeline.html css/pipeline.css js/lib/pipeline-guard.test.js
git commit -m "feat(pipeline): collapsible columns with header totals, restyled cards with hover actions, footer removed"
```

---

### Task 5: Smartphone layout, Filters sheet, docs, full suite

**Files:**
- Modify: `pipeline.html`, `css/pipeline.css`
- Modify: `CLAUDE.md`, `docs/pages/pipeline.md`

**Interfaces:**
- Consumes: Task 3 `filterGroups`, `currencyMode`, `.pb-seg`; Task 4 `stagesData[].header`, `.pb-col`, `.pb-card`.
- Produces: data `mobileStage: null`; computed `activeMobileStage` (= `mobileStage` or, if null, the first stage with cards, else `'Draft'`).

- [ ] **Step 1: Smartphone header and toolbar (spec §2.5, §5.2)** under `@media (max-width: 767.98px)`: title 20px, Open pipeline on one line under it, button text "+ New" (render both labels, show one per breakpoint); search full width + a "Filters" button opening `#pbFiltersSheet`; toolbar dropdowns and Amounts hidden; touch targets ≥ 44px.

- [ ] **Step 2: Stage tabs and single column.** Scrollable tab row (one `<button>` per stage: name, count, 3px indicator in `st.border` when active, `aria-pressed`); below it the stage summary (name, "N offers", `header.total`, `header.pills`); only the column of `activeMobileStage` visible, full width, collapsed state ignored, its own header hidden; cards: title 14px, amount 16px. Desktop tabs/summary hidden at ≥ 768px.

- [ ] **Step 3: Filters sheet (spec §5.3).** Bootstrap `offcanvas offcanvas-bottom` `#pbFiltersSheet`: header "Filters" + "Close" (`data-bs-dismiss="offcanvas"`), "AMOUNTS" `.pb-seg`, the four dropdowns from `filterGroups` in a 2×2 grid with id prefix `flt-sheet-`, navy "Show results" button with `data-bs-dismiss="offcanvas"`. Same `filter*` state as the toolbar.

- [ ] **Step 4: Docs.** `CLAUDE.md`: "Pipeline board layout" (board row, no footer), "Column totals footer" → header totals with currency pills and Amounts, "Filter bar" (new toolbar, suggestions, Amounts, smartphone sheet), file structure entry for `css/pipeline.css`, `pipeline-calc.js?v=5` in the money section's cache list, `GET /api/pipeline-years` `offers`. `docs/pages/pipeline.md`: cycle narrative (what changed, decisions from the brief's decision section, pre-existing inactive-year 403 noted).

- [ ] **Step 5: Full suite.** Run `npm test` → all green (record the count). Backend already verified in Task 1; re-run `scripts/run-tests.sh` only if Task 3–5 touched `api/`.

- [ ] **Step 6: Commit**

```bash
git add pipeline.html css/pipeline.css CLAUDE.md docs/pages/pipeline.md
git commit -m "feat(pipeline): smartphone stage tabs and Filters sheet; docs"
```

---

## Gate 2 checklist (user, on the branch stack with real data)

- Widths: 1440 sidebar open, 1440 rail, 1024 (DevTools), 390 (DevTools).
- Year menu: Current row, "N offers" matches what each year's board shows for you, Closed (admin), Esc and outside click close it.
- Open pipeline = SIP + Expected + Anticipated, unaffected by Amounts, follows filters.
- Search: empty hint, results for a client and for proposals, `No results`, client click filters the board, proposal click opens the panel, "N more results".
- Amounts "All in EUR" on cards ("from …") and headers; multi-currency column pills in Original.
- Collapse/expand; empty columns collapsed at load; new proposal / clone shows the Draft column.
- Card hover actions as owner, as shared viewer (no Edit/Clone), on Draft (Delete, no Share); selected card; actions reachable with Tab; no actions on touch.
- Smartphone: stage tabs, stage summary, Filters sheet with Show results.
- Compare with boards 4.4–4.9.
