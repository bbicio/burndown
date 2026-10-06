# Pipeline detail panel redesign (cycle 2 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the `pipeline.html` detail panel to boards 4.10–4.13 (480px side-by-side / overlay / full-screen container, new header, Overview · Tasks · Linked projects · POT tabs) and extend `GET /api/pots/summary` with the data the POT tab needs.

**Architecture:** Restyle in place (spec approach A): same Vue app and panel state (`selectedCgId`, `detailLinkedProjects`, `loadPotSection`…). Styles go to `css/pipeline.css`, POT/period calculations to pure functions in `js/lib/pipeline-calc.js`, the API gets fields added only.

**Tech Stack:** Vue 3 (CDN, runtime-compiled, no build), Bootstrap 5.3.2, vitest + jsdom, Express + PostgreSQL, `test-api.js`.

**Spec:** `docs/superpowers/specs/2026-10-06-pipeline-detail-panel-redesign-design.md` (section numbers below refer to it; its "Decisions taken in this cycle's brainstorming" prevail). Boards: `docs/superpowers/design/Pipeline/4.10.1-barra-laterale-overview.png`, `4.11-barra-lateralle-tasks.png`, `4.12-barra-laterale-linkedprojects.png`, `4.13-barra-laterale-pot.png`.

## Global Constraints

- No build step. No hex literals, no emoji, no `v-html` anywhere inside `#pipelineBoardSection` (board **and** panel); `css/pipeline.css` uses `var(--token)` only (tokens already in `css/tokens.css`).
- Do not modify `js/share-list-component.js`, `css/style.css`, `css/tokens.css`, `js/core.js`, `js/costgrid.js`, the modals, filter or permission logic, or the board markup from cycle 1 (except moving `.pb-board` into the new `.pb-main` row).
- Versions: `css/pipeline.css?v=1` → `?v=2`, `js/lib/pipeline-calc.js?v=5` → `?v=6` (every reference).
- Amounts only via `formatMoney(amount, code, currencies)`; no `Intl.NumberFormat`/`toLocaleString` on amounts (the "1 € = x" exchange rate may keep `toLocaleString`).
- Panel button visibility unchanged: Edit and Clone hidden for `myPermission === 'viewer'`; Share hidden on Draft; Delete only on Draft and non-viewer.
- Exact copy: "Version", "Linked project", "Owner", "Created on", "Edit", "Clone", "Share", "Delete", "Overview", "Tasks", "Linked projects", "POT", "PROFESSIONAL FEES", "PTC", "TOTAL BUDGET", "PERIOD", "CURRENCY", "Refresh rate", "SHARED WITH", "TASK", "PERIOD", "HOURS", "AMOUNT", "No tasks defined in this version's cost grid.", "Project Dashboard →", "Tasks:", `No linked projects. Projects are generated from the Cost Grid with "Generate project".`, "POTENTIAL (POT)", "of target reached by Committed + Anticipated", "Target", "Progress and gap count Committed + Anticipated only. SIP and Expected are upcoming pipeline.", "COMMITTED", "ANTICIPATED", "TOTAL (C+A)", "GAP TO TARGET", "OVER TARGET", "% of target", "CONTRIBUTING PROPOSALS", "OTHER PROPOSALS · NOT IN TOTAL", "None.", "Draft proposals don't count toward the POT.", "This proposal has no client, so it has no POT.", "No POT target for {target} in {year}.", "Could not load the POT.", "Could not load cost grid. Try reloading the page.".
- Edit HTML with the Edit tool only (no PowerShell `Set-Content` — BOM). Git as single plain commands (the worktree hook rejects compound bash commands containing git; PowerShell works).
- Tests during a task: only the touched files (`npx vitest run js/lib/<file>.test.js`). Backend only via `scripts/run-tests.sh` (isolated, self-tearing-down). Full `npm test` once, in Task 4. Fresh worktree: `npm ci` once + copy `.env` from the main checkout.
- Never run `docker compose` against the main stack; never `-v`/`--volumes`; if a Docker command misbehaves, stop and report.
- No automated screenshots; the user verifies at `/finish-cycle` Gate 2 (checklist at the end).

## Review Focus

1. API values arrive as strings (`"95000.00"`) or null → `pbPotView` parses them, never concatenates strings or shows `NaN`. Test in Task 2.
2. A POT target of 0 (or a missing `pot.amount`) with proposals present → percentages 0, no `Infinity`, bar still drawn on the sum. Test in Task 2.
3. A version whose `startDate`/`endDate` or task dates are missing or malformed → "—" (never "undefined 2026" or "Invalid Date"). Test in Task 2 (`pbFmtMonth` returns null → template prints "—").
4. Esc pressed while a Bootstrap modal opened from the panel (Share/Clone/Confirm) is showing → only the modal closes, the panel stays. Implemented and checked in Task 3 (guard on `.modal.show`).
5. Clicking another card or a search suggestion while the panel is open → panel switches content without the close/reopen flash, and the tab resets to Overview. Implemented in Task 3 (outside-click handler ignores `.pb-card` and the suggestions menu).

---

### Task 1: Extend `GET /api/pots/summary`

**Files:**
- Modify: `api/src/routes/pots.js:104-202`
- Test: `test-api.js` (extend `testPots()`, new cases `POT-08`…`POT-11`)

**Interfaces:**
- Produces: response `{ pot, proposals, committed_total, anticipated_total, expected_total, sip_total }`; each `proposals[]` row additionally has `value` (number, EUR) and `client_name` (string or null). Existing fields unchanged.

- [ ] **Step 1: Write the failing cases** in `testPots()` (after the existing ones): create a dedicated client `__test_pot_summary_client__` and a POT for it in the **current calendar year** (publish stamps the current year — create that `pipeline_years` row if missing and register its cleanup); create 4 proposals for that client, publish each (`POST /api/cost-grids/:id/versions/:vId/publish`), give each a non-zero fee by saving a minimal structure (`PUT /api/cost-grids/:id/versions/:vId/structure`, read `api/src/routes/cost-grids.js:619` for the body), and set stages SIP, Expected, Anticipated, Committed via `PATCH /versions/:vId { pipeline }`; plus one Draft-only proposal for the same client. Clean up non-Draft grids with the sysadmin route `POST /api/admin/reset/cost-grid/:cgId` via `later(...)` (pattern from `testPipelineYears`).
  - `POT-08` `expected_total` and `sip_total` are numbers.
  - `POT-09` every `proposals[]` row has a numeric `value` and a `client_name` equal to `__test_pot_summary_client__`.
  - `POT-10` for each stage, the stage total equals the sum of `value` over that stage's rows (SIP → `sip_total`, Expected → `expected_total`, Anticipated → `anticipated_total`, Committed → `committed_total`), and each is > 0.
  - `POT-11` the Draft-only proposal is absent from `proposals`.
- [ ] **Step 2: Run to verify it fails** — `scripts/run-tests.sh` → `POT-08`…`POT-10` fail.
- [ ] **Step 3: Implement** in the `/summary` handler: add `client_name` (`LEFT JOIN clients cli ON cli.id = cgv.client_id`) and `${feeExpr-per-row} AS value` to both proposals queries (same expression as the totals' `feeExpr`, applied to `cgv`); add `expected_total` / `sip_total` `SUM(CASE …)` columns to both totals queries; `parseFloat` the new totals and each row's `value` before `res.json`.
- [ ] **Step 4: Run to verify it passes** — `scripts/run-tests.sh` → all pass, no regression.
- [ ] **Step 5: Commit**

```bash
git add api/src/routes/pots.js test-api.js
git commit -m "feat(api): POT summary with expected/SIP totals and per-proposal value"
```

---

### Task 2: `pbFmtMonth` and `pbPotView`

**Files:**
- Modify: `js/lib/pipeline-calc.js` (append + `window` bridges)
- Test: `js/lib/pipeline-calc.test.js`

**Interfaces:**
- Consumes: the Task 1 response shape.
- Produces (exported, bridged on `window`):
  - `pbFmtMonth(d: string|null|undefined) → string|null` — `'202605'`, `'20260501'`, `'2026-05-01'` → `'May 2026'` (English short month names `Jan`…`Dec`); anything else (null, `''`, `'2026'`, `'abc'`, month `13`) → `null`.
  - `pbPotView(summary) → { pct, segments, targetPos, committed, anticipated, total, gap, contributing, other }` exactly as spec §6: `segments = [{ stage:'Committed'|'Anticipated'|'Expected'|'SIP', value, width }]` in that order; `committed/anticipated = { value, pctOfTarget }`; `total = C+A`; `gap = { over, value, pctOfTarget }`; `contributing`/`other` = `[{ versionId, name, clientName, year, stage, value }]` from `proposals` (`version_id`, `proposal_name`, `client_name`, `pipeline_year`, `pipeline`, `value`).

- [ ] **Step 1: Write the failing tests** (`describe('pbFmtMonth')`, `describe('pbPotView')`):
  - `pbFmtMonth('202605')`, `('20260501')`, `('2026-05-01')` → `'May 2026'`; `('202612')` → `'Dec 2026'`; `(null)`, `('')`, `('2026')`, `('abc')`, `('202613')` → `null` (Review Focus 3).
  - Under target: `pot.amount 400000`, C 95000, A 216630, E 38000, S 45000 → `pct 78`, `committed.pctOfTarget 24`, `anticipated.pctOfTarget 54`, `total 311630`, `gap { over:false, value:88370, pctOfTarget:22 }`, `targetPos 100` (scale = target since sum 394630 < 400000), segment widths sum ≈ 98.66.
  - Over target: amount 100000, C 80000, A 40000 → `pct 120`, `gap { over:true, value:20000 }`, scale 120000 → `targetPos ≈ 83.33`.
  - Target 0 / missing `pot.amount` with C 50000 → `pct 0`, all `pctOfTarget 0`, widths computed on the sum (C width 100), no `Infinity`/`NaN` anywhere (Review Focus 2).
  - String inputs (`"95000.00"`, `null`) parsed as numbers; `value` of a row `"1200.5"` → `1200.5` (Review Focus 1).
  - Lists: rows in stages Committed, Anticipated, Expected, SIP, Canceled, Draft → `contributing` = Committed + Anticipated sorted by value desc, `other` = SIP + Expected sorted by value desc, Canceled and Draft in neither.
- [ ] **Step 2: Run to verify it fails** — `npx vitest run js/lib/pipeline-calc.test.js` → FAIL (not exported).
- [ ] **Step 3: Implement** both functions with the signatures above; rounding with `Math.round`; non-finite numbers → 0.
- [ ] **Step 4: Run to verify it passes** — same command → PASS, existing cases untouched.
- [ ] **Step 5: Commit**

```bash
git add js/lib/pipeline-calc.js js/lib/pipeline-calc.test.js
git commit -m "feat(pipeline): pbFmtMonth and pbPotView view-model functions"
```

---

### Task 3: Container, behaviour, header, Overview / Tasks / Linked projects, guard

**Files:**
- Modify: `pipeline.html` (panel `:237-374`, the board row around `.pb-board` `:142`, `openDetailPanel`/`closeDetailPanel`/outside-click handler, `created` keydown listener, `<link>`/`<script>` versions)
- Modify: `css/pipeline.css`
- Modify: `js/lib/pipeline-guard.test.js`

**Interfaces:**
- Consumes: Task 2 `pbFmtMonth`.
- Produces for Task 4: data `detailTab: 'overview'` (`'overview'|'tasks'|'linked'|'pot'`); the panel markup with an empty POT tab body `<div v-if="detailTab === 'pot'" class="pb-tab-body pb-pot">` for Task 4 to fill; method `projectStatusStyle(status) → { background, color }`; classes `.pb-main`, `.pb-panel`, `.pb-panel-scrim`, `.pb-panel-head`, `.pb-tabs-panel`, `.pb-tab-body`, `.pb-stage-pill`; `pipeline.css?v=2`, `pipeline-calc.js?v=6` already set.

- [ ] **Step 1: Update the guard** `js/lib/pipeline-guard.test.js`: board region = from `id="pipelineBoardSection"` to the end of that root element (the text before the first `<div class="modal` of the page); every `pipeline.css` reference is `?v=2`, every `pipeline-calc.js` reference `?v=6`; existing checks (no hex, no emoji, no `v-html`, pipeline.css only on pipeline.html, Draft style without `#`) apply to the enlarged region.
- [ ] **Step 2: Run to verify it fails** — `npx vitest run js/lib/pipeline-guard.test.js` → FAIL on the panel's hex/emoji/`v-html` and on the versions.
- [ ] **Step 3: Container and modes (spec §2.1–2.2).** Wrap `.pb-board` and the panel in `<div class="pb-main">`; `#pbDetailPanel` gets class `pb-panel` plus `:style` only for the 3px top border colour (stage token); add `<div v-if="selectedCgId" class="pb-panel-scrim" @click="closeDetailPanel"></div>`. CSS: side by side at `(min-width: 1280px)` and at `(min-width: 1108px)` under `html[data-sidebar="collapsed"]` (width 480px, scrim hidden); overlay otherwise down to 768px (absolute, right, `width:480px; max-width:100%`, scrim visible); `(max-width: 767.98px)` full screen (`position:fixed; inset:0; z-index:1040`). Header and tabs fixed, `.pb-tab-body` scrolls.
- [ ] **Step 4: Behaviour (spec §2.3, Review Focus 4–5).** Outside-click handler also returns early for targets inside `.pb-card` or the search suggestions menu; Esc in the existing `keydown` listener: close suggestions / year menu if open, else close the panel when `selectedCgId` and no `.modal.show` exists; `openDetailPanel` sets `this.detailTab = 'overview'`.
- [ ] **Step 5: Header (spec §3)** and **tabs**: stage pill, "Linked project" pill, "Version" segmented control (active segment magenta, stage dot via `verStageBadgeColor`), SVG close with `aria-label="Close"`, client, title, owner line, actions (Edit navy filled / Clone / Share outlined / Delete red text right, same `v-if`s and handlers), tab list with counts (tasks across phases; `detailLinkedProjects.length`). Loading = close + spinner; error text in `--color-danger-text`.
- [ ] **Step 6: Overview, Tasks, Linked projects (spec §4)** as tab bodies (`v-if="detailTab === '…'"`): the three amount boxes with "≈ €" for foreign currency; PERIOD with `pbFmtMonth(...) || '—'`; CURRENCY with "1 € = …" and "Refresh rate" when `rateStale`; note; "SHARED WITH" + `<share-list>` (unchanged props/key) with `#pbDetailPanel .share-list > :first-child { display:none; }`; Tasks grid per §4.2 (task period via `pbFmtMonth` of `taskStartDate`/`taskEndDate`); Linked cards per §4.3 with stage pill and `projectStatusStyle` pill (map of spec §4.3), no `pipelineBadge`/`statusBadgeLarge`.
- [ ] **Step 7: Run to verify it passes** — `npx vitest run js/lib/pipeline-guard.test.js js/lib/pipeline-calc.test.js js/lib/money-guard.test.js js/lib/foundations-guard.test.js js/lib/nav-shell-guard.test.js js/lib/nav-layout-guard.test.js` → PASS (the POT tab body is an empty placeholder, so the guard passes once the old POT block is removed).
- [ ] **Step 8: Commit**

```bash
git add pipeline.html css/pipeline.css js/lib/pipeline-guard.test.js
git commit -m "feat(pipeline): detail panel container modes, header, Overview/Tasks/Linked tabs"
```

---

### Task 4: POT tab, smartphone panel, docs, full suite

**Files:**
- Modify: `pipeline.html` (`loadPotSection`, POT tab body), `css/pipeline.css`
- Modify: `CLAUDE.md`, `docs/pages/pipeline.md`

**Interfaces:**
- Consumes: Task 1 response; Task 2 `pbPotView`; Task 3 `detailTab`, POT placeholder, `.pb-stage-pill`.
- Produces: `potState = { kind: 'loading'|'draft'|'noClient'|'noTarget'|'error'|'ok', targetName?, year?, view? }`.

- [ ] **Step 1: `loadPotSection` (spec §5.2).** Set `kind:'loading'` first; Draft → `'draft'`; no year or no client → `'noClient'`; `pot` null → `'noTarget'` (with `targetName`, `year`); caught error → `'error'`; else `'ok'` with `view = pbPotView(response)`. Remove `totColor`, `pctC/pctA`, `nContrib`, `potFmtMoney` if no longer used anywhere.
- [ ] **Step 2: POT tab body (spec §5.3)**: header, bar (segments by `width`%, SIP striped via `repeating-linear-gradient` on the SIP tokens, navy notch at `targetPos`% labelled "Target"), legend, note, 2×2 grid (GAP TO TARGET / OVER TARGET with "+ " and `--color-success`), CONTRIBUTING and OTHER lists (rows: name, "{clientName || '—'} · Pipeline {year}", stage pill, amount; Other greyed; "None." when empty; rows not clickable); state texts for the other kinds. Amounts via `formatMoney(n, 'EUR', currencies)`.
- [ ] **Step 3: Smartphone (< 768px)** inside the full-screen panel: title 17px, version segments and actions wrap, the tab row scrolls horizontally (`overflow-x:auto`), touch targets ≥ 44px.
- [ ] **Step 4: Docs.** `CLAUDE.md`: rewrite "Detail panel" (modes and thresholds, header, tabs, POT, Esc/outside/scrim rules), "Pipeline board layout" (`.pb-main` row), cache versions `pipeline.css?v=2`, `pipeline-calc.js?v=6`, `/api/pots/summary` new fields where the POT summary is mentioned. `docs/pages/pipeline.md`: dated section "Detail panel redesign, cycle 2 of 2" with this cycle's decisions (spec "Decisions taken…").
- [ ] **Step 5: Full suite** — `npm test` → all green (record the count). Backend already verified in Task 1.
- [ ] **Step 6: Commit**

```bash
git add pipeline.html css/pipeline.css CLAUDE.md docs/pages/pipeline.md
git commit -m "feat(pipeline): POT tab with extended summary, smartphone panel; docs"
```

---

## Gate 2 checklist (user, on the branch stack with real data)

- Widths: 1440 sidebar open → side by side; 1280 open → side by side; 1200 open → overlay, side by side after collapsing the sidebar; 1024 → overlay; 390 → full screen.
- Another card / a search suggestion switches content without closing and resets to Overview; click outside closes; Esc closes the search menu first, then the panel; scrim click closes; Share/Clone/Confirm opened from the panel do not close it, and Esc there closes only the modal.
- Header: stage and "Linked project" pills, version segments clickable, actions as owner / viewer / on Draft.
- Overview: boxes with "≈ €" for a foreign currency, "May 2026" periods, Refresh rate (admin, stale rate), note, Shared with without 👥.
- Tasks: phases, columns, hours, amounts, empty state. Linked projects: cards, status pills, "Project Dashboard →", empty state.
- POT: under target and over target, notch, legend, Contributing / Other lists, Draft / no client / no target states.
- Compare with boards 4.10–4.13.
