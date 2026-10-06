# Pipeline detail panel redesign (cycle 2 of 2) — design

Date: 2026-10-06. Type: evolution (Scenario 2), UI redesign page cycle. Source: Brief `docs/superpowers/design/2026-10-06-pipeline-brief.md` §6, §7 (panel part), §10 — its "Decisioni prese prima del ciclo" section prevails, and the decisions below (taken in this cycle's `/brainstorming`) prevail over both — with boards `docs/superpowers/design/Pipeline/4.10.1-barra-laterale-overview.png`, `4.11-barra-lateralle-tasks.png`, `4.12-barra-laterale-linkedprojects.png`, `4.13-barra-laterale-pot.png`. Base: cycle 1 merged (`d966474`, spec `docs/superpowers/specs/2026-10-06-pipeline-board-redesign-design.md`).

## Goal

Restyle the pipeline detail panel to boards 4.10–4.13: a 480px column beside the board (overlay or full screen when space is short), a new header, four tabs (Overview, Tasks, Linked projects, POT), and a richer POT view backed by a backward-compatible extension of `GET /api/pots/summary`. Same page, same Vue app, same data loading, same permissions, same modals.

## Decisions taken in this cycle's brainstorming

1. **POT lists are limited to the pipeline year.** "Other proposals · not in total" = the target's SIP and Expected proposals **of the same year**. Other years never appear (this reverses the brief's "of any vintage" note on board 4.13).
2. **No double counting in POT.** Verified: the UI allows only one non-Draft version per proposal (`+ New version` only on a Draft version, `costgrid.html:38`; Publish deletes the other Drafts, `js/costgrid.js:727-748`; a published version cannot go back to Draft, `costgrid.html:117-118`; real DB: 0 proposals with more than one non-Draft version). Per-version POT rows are therefore one row per proposal. The missing server-side enforcement is recorded for the clone-bug cycle (out of scope).
3. **POT lists show every proposal of the target** (owner and amount included), even those not shared with the user (brief decision 6); rows are therefore **not clickable**.
4. **Panel width 480px**, side by side when the board keeps ≥ 560px (brief decision 5).

## Current behaviour (verified in code)

- `pipeline.html:237-374`: `#pbDetailPanel` (`v-if="selectedCgId"`) is `position:absolute; width:860px; max-width:100%; z-index:200` inside `.pb-board-root`, after `.pb-board` (`:142`); navy header bar with "Offer detail", buttons `🗑 Delete` (Draft + non-viewer), `⧉ Clone` (non-viewer), `🔗 Share` (non-Draft), `✏️ Edit` (non-viewer), `×`; version tab row (`openDetailPanel(selectedCgId, ver.versionId)`, stage dot via `verStageBadgeColor`); two columns: left = stage badge, "🔗 Linked project" badge, client, title, "Owner: 👤 …, Created at: …", Period (`2026/05`), Currency + `1 € = x` + `↺ Refresh rate` (`rateStale`, admin), fees/PTC/Total, note, `<share-list>`, POT block (hex colours, `totColor`), linked projects (`v-html` `pipelineBadge`/`statusBadgeLarge`, `📊 Project Dashboard`); right = "📋 Tasks by phase" (`phaseTotal`, `taskTotals`, `taskDateRange`).
- Outside-click close: `_pbDetailOutsideClickHandler` (`mousedown`, 200ms delayed registration, ignores `.modal`/`.modal-backdrop`). Cycle 1 added document `keydown` (Esc closes search menu and year menu) and `mousedown` (search menu) listeners.
- `loadPotSection(v, stage)` (`:881`): returns with `potState = null` for Draft, missing year, or no client; resolves client from linked projects then `v.clientId`; client group if any; calls `Api.pots.summary({ year, clientGroupId | clientId })`.
- `GET /api/pots/summary` (`api/src/routes/pots.js:104-202`): `{ pot, proposals, committed_total, anticipated_total }`; proposals = non-Draft versions of the target in that year (`version_id, label, pipeline, pipeline_year, cg_id, proposal_name, owner_name`), no amount; totals use `feeExpr` (EUR) over all proposals. Only consumer: `pipeline.html` (Master Data uses `/:id/details`).
- `js/share-list-component.js` (also used by `costgrid.html`) renders its own title `👥 Shared with` as the first child of `.share-list`.
- `pbFmtTaskDate` returns `2026/05`. `statusBadgeLarge` (`js/core.js:274`) maps project status → `--status-*-bg` + `--status-text` and returns HTML.
- `js/lib/pipeline-guard.test.js` checks hex/emoji/`v-html` only from `id="pipelineBoardSection"` to `id="pbDetailPanel"`. Modals (`:380+`) are outside `#pipelineBoardSection`. Current versions: `css/pipeline.css?v=1`, `js/lib/pipeline-calc.js?v=5`.

## Design

### 1. Files and boundaries

| File | Change |
|---|---|
| `pipeline.html` | Panel container moves into a new flex row `.pb-main` beside `.pb-board`; new header, tabs (`detailTab`), tab bodies; Esc + outside-click rules; no hex/emoji/`v-html` in the panel; `loadPotSection` returns state kinds (§5); `pipeline.css?v=2`, `pipeline-calc.js?v=6`. |
| `css/pipeline.css` (v1 → v2) | Panel, header, tabs, Overview/Tasks/Linked/POT styles, three layout modes. Tokens only. |
| `js/lib/pipeline-calc.js` (v5 → v6) | New `pbFmtMonth`, `pbPotView` (§6). |
| `api/src/routes/pots.js` | `GET /summary` adds `expected_total`, `sip_total`, per-proposal `value`, `client_name` (§5.1). |
| `test-api.js` | New POT cases (§8). |
| `js/lib/pipeline-calc.test.js`, `js/lib/pipeline-guard.test.js` | Unit tests; guard region extended to the whole `#pipelineBoardSection`. |
| `CLAUDE.md`, `docs/pages/pipeline.md` | Docs (§9). |

Not touched: `js/share-list-component.js`, `css/style.css`, `css/tokens.css`, `js/core.js`, `js/costgrid.js`, modals, filter/permission logic, board (cycle 1).

### 2. Container and behaviour

**2.1 Layout.** `.pb-board-root` > header, toolbar, `.pb-main` (flex row, `flex:1; min-height:0`) containing `.pb-board` and, when open, `#pbDetailPanel` + `.pb-panel-scrim`. The panel: white, left border `--border-light`, 3px top border in the stage colour, header and tabs fixed, only the tab body scrolls.

**2.2 Modes (CSS only).**
- **Side by side**, width 480px, board shrinks: `@media (min-width: 1280px)`, and `@media (min-width: 1108px)` with `html[data-sidebar="collapsed"]`.
- **Overlay** below those thresholds down to 768px: 480px (`max-width:100%`) anchored right over the board (`position:absolute` within `.pb-main`), `.pb-panel-scrim` visible over the board (light, token colour); clicking the scrim closes the panel.
- **Full screen** below 768px: `position:fixed; inset:0`, z-index above the navigation and below Bootstrap modals (≤ 1040), so Share/Clone/Confirm modals stay on top.

**2.3 Behaviour.**
- Clicking another card (or a proposal in the search suggestions) switches content without closing: the outside-click handler ignores targets inside `.pb-card` and inside the suggestions menu, in addition to `.modal`/`.modal-backdrop`. Any other click outside the panel closes it (as today).
- Esc: if the search suggestions or the year menu is open, Esc closes that only; otherwise, if no Bootstrap modal is open (`.modal.show`), Esc closes the panel.
- `detailTab` (`'overview' | 'tasks' | 'linked' | 'pot'`) resets to `'overview'` in every `openDetailPanel` call (card click, suggestion click, version switch).

### 3. Header (boards 4.10–4.13)

1. Row 1: stage pill (`--pipeline-<stage>-bg/-color`; Draft `--surface-light`/`--text-muted`), "Linked project" pill when `detailLinkedProjects.length`, spacer, label "Version" + segmented control (one segment per version: label + stage dot; active segment magenta; click = `openDetailPanel(selectedCgId, ver.versionId)`), close button (SVG ✕, `aria-label="Close"`).
2. Client (12px muted; row hidden when `detailClientName` is empty), title 19px/700 (`selectedVersion.projectName || selectedCg.name`).
3. "Owner **{ownerName or —}** · Created on {pbFmtDate(createdAt)}".
4. Actions, visibility unchanged: **Edit** (navy filled, non-viewer, `showCostGridEditorView`), **Clone** (outlined, non-viewer, `openCloneModal`), **Share** (outlined, not Draft, `openShareModal('cost_grid', …)`), **Delete** (right, red text, Draft + non-viewer, `deleteSelectedVersion`). No emoji.
5. Tabs `role="tablist"`, each `role="tab"` + `aria-selected`, magenta bar under the active one: "Overview", "Tasks" + count pill (number of tasks across phases), "Linked projects" + count pill (`detailLinkedProjects.length`), "POT".
- Loading: only the close button and a spinner. Error: "Could not load cost grid. Try reloading the page." in `--color-danger-text`.

### 4. Overview, Tasks, Linked projects (boards 4.10–4.12)

**4.1 Overview.** Three boxes — "PROFESSIONAL FEES", "PTC", "TOTAL BUDGET" (navy box, white text) — amounts in the version currency via `formatMoney`, "—" when 0; for a foreign currency each box adds "≈ € X" (amount / version `currencyRate`). Two-column grid: "PERIOD" = `pbFmtMonth(start) – pbFmtMonth(end)` ("May 2026 – Dec 2026", "—" for a missing side); "CURRENCY" = code, plus "1 € = {rate, 4 decimals} {code}" for a foreign currency, plus a secondary "Refresh rate" button when `rateStale` (same `confirmRefreshRate` flow). Note (`selectedVersion.note`, pre-wrap) when present. "SHARED WITH" label + `<share-list>` unchanged; its own first-child title is hidden with `#pbDetailPanel .share-list > :first-child { display: none; }`.

**4.2 Tasks.** Per phase: header = phase name + `phaseTotal(ph)` (version currency), 2px `--brand-navy` bottom border; column header row "TASK · PERIOD · HOURS · AMOUNT" (uppercase, 10px, muted); one grid row per task: name, period (`pbFmtMonth` of task start/end, "—"), hours ("{totalHrs}h" or "—"), amount (`totalCostAndFee`, "—" when 0). A phase with no tasks shows only its header. No task at all: "No tasks defined in this version's cost grid."

**4.3 Linked projects.** One bordered card per project: name (600), code (monospace, muted), link "Project Dashboard →" (magenta, `pbGoToPortfolio(navId)`), stage pill (stage tokens) + project-status pill (page method `projectStatusStyle(status)` mirroring `statusBadgeLarge`'s map: `--status-{not-started,started,at-risk,on-hold,completed}-bg` + `--status-text`, default not-started), "Tasks: …" line when `taskNames.length`. Empty: `No linked projects. Projects are generated from the Cost Grid with "Generate project".`

### 5. POT tab (board 4.13)

**5.1 API — `GET /api/pots/summary`** (same year, Draft excluded, as today; fields added only):
- `expected_total`, `sip_total`: `SUM(CASE WHEN pipeline = 'Expected' / 'SIP' THEN feeExpr …)` in the existing totals query.
- each `proposals[]` row adds `value` (number, EUR, the same `feeExpr` per version) and `client_name` (`LEFT JOIN clients`).
- Canceled rows stay in the response; the panel shows them nowhere.

**5.2 States** (`potState.kind`, set by `loadPotSection`):

| kind | When | Text |
|---|---|---|
| `loading` | request in flight | small spinner |
| `draft` | version is Draft | "Draft proposals don't count toward the POT." |
| `noClient` | no client resolved, or no pipeline year | "This proposal has no client, so it has no POT." |
| `noTarget` | `pot` is null | "No POT target for {targetName} in {year}." |
| `error` | request failed | "Could not load the POT." |
| `ok` | otherwise | the view below, from `pbPotView` |

**5.3 View.**
- Header: "POTENTIAL (POT)", "{targetName} {year}", large `pct`%, "of target reached by Committed + Anticipated".
- Bar 12px: segments Committed, Anticipated, Expected, SIP (SIP striped via `repeating-linear-gradient` on the SIP tokens), colours `--pipeline-<stage>-color`; a navy notch labelled "Target" at `targetPos`%; legend with each stage's amount; note "Progress and gap count Committed + Anticipated only. SIP and Expected are upcoming pipeline."
- 2×2 grid: "COMMITTED" (amount, "{n}% of target"), "ANTICIPATED" (same), "TOTAL (C+A)" (amount), "GAP TO TARGET" (amount, "{n}% of target") or, when C+A > target, "OVER TARGET" with "+ {amount}" in `--color-success`.
- "CONTRIBUTING PROPOSALS": Committed + Anticipated rows; "OTHER PROPOSALS · NOT IN TOTAL": SIP + Expected rows, greyed. Row = proposal name, "{client_name or —} · Pipeline {year}", stage pill, amount. Rows are not clickable. Empty list: the list heading is followed by "None."
- Amounts: `formatMoney(n, 'EUR', currencies)` (two decimals, as on the board). The `totColor` hex logic and the old `potFmtMoney` rounding are removed from the panel.

### 6. Pure functions (`js/lib/pipeline-calc.js` v6, bridged on `window`)

- `pbFmtMonth(d) → string|null`: `YYYYMM`, `YYYYMMDD` or `YYYY-MM-DD` → "May 2026" (English short month); anything else → null.
- `pbPotView(summary) → { pct, segments:[{ stage, value, width }], targetPos, committed:{ value, pctOfTarget }, anticipated:{ value, pctOfTarget }, total, gap:{ over:boolean, value, pctOfTarget }, contributing:[row], other:[row] }` with `row = { versionId, name, clientName, year, stage, value }`.
  - Inputs: `pot.amount`, the four totals, `proposals`. All numbers parsed (`parseFloat`, non-finite → 0).
  - `pct = round((C+A) / target × 100)`, not capped; 0 when target ≤ 0.
  - `scale = max(target, C+A+E+S)`; `width = value / scale × 100` per segment (C, A, E, S in that order); `targetPos = target / scale × 100`; all 0 when scale is 0.
  - `pctOfTarget` rounded integers (0 when target ≤ 0). `gap.value = |target − (C+A)|`, `gap.over = (C+A) > target`.
  - `contributing` = Committed + Anticipated rows, `other` = SIP + Expected rows, each sorted by `value` descending; Canceled and Draft rows excluded.

### 7. Constraints

As cycle 1 (spec §7): no build step; no hex/emoji/`v-html` in `#pipelineBoardSection` (board **and** panel); tokens only in `css/pipeline.css`; `formatMoney` only for amounts; every versioned file bumped (`pipeline.css` 1 → 2, `pipeline-calc.js` 5 → 6, all references); `v-cloak` on `.pb-board-root`; `#app-shell`/`#app-main` untouched; English copy exactly as in §3–§5; Edit tool for HTML (no BOM).

### 8. Testing

- **vitest** (`pipeline-calc.test.js`): `pbFmtMonth` (three input shapes, invalid → null); `pbPotView` (pct and gap under target; over target; scale/notch when the sum exceeds the target; target 0 without division by zero; non-numeric strings from the API; list split and sorting; Canceled/Draft excluded).
- **Guard** (`pipeline-guard.test.js`): region = whole `#pipelineBoardSection` (up to the end of its root element, before the modals); `pipeline.css?v=2` and `pipeline-calc.js?v=6` everywhere; existing checks kept.
- **Backend** (`test-api.js`, extend `testPots`): `expected_total` and `sip_total` equal the fees of SIP/Expected proposals of the target and year; every proposal row has numeric `value` and `client_name`; Draft versions absent; a client-group target sums its clients' proposals.
- **Rhythm (PROCESS.md §6.2):** touched test files only during tasks; full suite once at the end, then Gate 1.

### 9. Documentation

`CLAUDE.md`: "Detail panel" section rewritten (container modes, header, tabs, POT), "Pipeline board layout" (`.pb-main` row), cache versions. `docs/pages/pipeline.md`: cycle narrative. PRD §4.4/§4.8 and test cases via `/sync-docs` at closeout.

### 10. Execution and verification

- Subagent-driven, Sonnet implementers, Opus final whole-branch review; four tasks: (1) POT API + test-api; (2) `pbFmtMonth` + `pbPotView` + tests; (3) container, behaviour, header, Overview/Tasks/Linked, guard extension; (4) POT tab, responsive, docs, full suite.
- No automated screenshots. Gate 2 checklist (user, branch stack, real data):
  - widths: 1440 sidebar open → side by side; 1280 open → side by side; 1200 open → overlay, and side by side after collapsing the sidebar; 1024 → overlay; 390 → full screen;
  - another card switches content and resets to Overview; outside click closes; Esc closes the search menu first, then the panel; scrim click closes; Share/Clone/Confirm modals from the panel do not close it;
  - header pills, version segments, actions as owner / viewer / on Draft;
  - Overview boxes with "≈ €", "May 2026" periods, Refresh rate (admin), note, Shared with without 👥;
  - Tasks phases/columns/hours/amounts and empty state; Linked projects cards, status pills, link, empty state;
  - POT under target and over target, bar notch, Contributing/Other lists, Draft / no client / no target states;
  - comparison with boards 4.10–4.13.

## Out of scope

Board (cycle 1); `js/share-list-component.js` (initial avatars of the board not adopted); clickable POT rows; other-year proposals; server-side "one non-Draft version" enforcement and the Clone bug (next cycle); `pbFmtTaskDate` callers elsewhere; legacy `.pb-*` rules in `style.css`; modals' emoji titles.

## Acceptance criteria

1. Panel modes match §2.2 at the checklist widths; content switches on another card; Esc/outside/scrim behaviour per §2.3.
2. Header, actions and tabs per §3 with today's visibility rules.
3. Overview/Tasks/Linked per §4; no `v-html`, hex or emoji anywhere in `#pipelineBoardSection`.
4. POT tab per §5 with the extended `/summary` (fields added only) and all six states.
5. `pbFmtMonth`/`pbPotView` tested; guard extended; versions bumped; all suites green.
