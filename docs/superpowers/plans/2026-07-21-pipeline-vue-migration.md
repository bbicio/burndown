# `pipeline.html` Vue 3 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `pipeline.html` (currently driven by `js/pipeline-board.js`) as a single Vue 3 instance (CDN, no build step), 1:1 behavioral parity, following the pattern validated by `project-config.html`/`portfolio.html`.

**Architecture:** Single `Vue.createApp({...}).mount(...)` instance folds in `js/pipeline-board.js`'s rendering logic. `js/costgrid.js`/`js/core.js` stay unmodified Vanilla, called as globals. The 4 shared modals (`#confirmModal`, `#cgNewGridModal`, `#cgCloneModal`, `#jsonViewerModal`) stay static HTML outside the Vue-managed template. New `js/lib/pipeline-calc.js` extracts pure aggregation/formatting logic with vitest coverage.

**Tech Stack:** Vue 3 (CDN, `vue.global.prod.js`), vanilla JS, vitest (for the new lib module).

## Global Constraints

1. No build step — CDN Vue 3 only, matching every prior migration in this roadmap.
2. `js/costgrid.js` and `js/core.js` are **not modified** — `cgLoad`, `cgGetIndex`, `cgCreateNewGrid`, `cgCloneGrid`, `cgConfirmDeleteGrid`, `cgConfirmDeleteVersion`, `cgComputeGrandTotals`, `cgComputePhaseTotals`, `cgComputeTaskTotals`, `showConfirm` all stay exactly as they are, called as globals from the new Vue instance's methods.
3. `#confirmModal`, `#cgNewGridModal`, `#cgCloneModal`, `#jsonViewerModal` stay static HTML, **outside** the Vue app's mount root — they are manipulated directly by the unmodified `js/costgrid.js`/`js/core.js` functions above via `document.getElementById(...)`, and must keep working identically for `costgrid.html`/`planning.html`, which still use the same functions.
4. **`_cgStore` (the in-memory `Map` in `js/costgrid.js`, populated by `cgSyncFromApi()`/`cgSave()`/`cgSaveIndex()`) is a plain JS object, not Vue-reactive.** Any Vue `computed` that reads `cgGetIndex()`/`cgLoad(id)` must also read a reactive `data()` field (`refreshTick`, see Task 2) as its first statement, and every place that mutates `_cgStore` (creating, cloning, deleting a proposal; loading structure into the detail panel; refreshing an exchange rate) must increment `refreshTick` afterward. Without this, Vue's computed caching means the board would show stale data indefinitely after the first render — this exact bug (confirmed live, twice) is why `portfolio.html`'s equivalent fix (`docs/superpowers/reports/2026-07-19-worktree-cgstore-project-load-crash-fix-finish-cycle.md`) exists.
5. **Every global function called directly from a Vue template expression must be exposed via `methods:`** — bare shorthand re-export (`methods: { getClientName, pipelineBadge }`) for stable, never-reassigned classic-script functions; a wrapping method body for anything bridged from a deferred ES module (`js/lib/*.js`), since a bare shorthand would evaluate before the module has run. Vue 3's runtime-compiled template mode never falls through to `window` for unrecognized identifiers — this exact bug class broke `portfolio.html` and `project-config.html` after their own migrations (see `docs/superpowers/reports/2026-07-19-worktree-window-bare-global-click-fix` commit history) and must not recur here.
6. New lib functions must not collide with existing global names: `js/core.js` already declares global `fmtMoney(n, currencyCode)` (`js/core.js:288`) and `fmtDate(d)` (`:298`) with **different signatures** than `pipeline-board.js`'s own `pbFmtMoney(n, code)`/`pbFmtDate(iso)`. The extracted lib module keeps the `pb`-prefixed names when bridging to `window.*`, to avoid silently overwriting `js/core.js`'s globals.
7. **The entire `Vue.createApp({...}).mount(...)` call must be wrapped in `document.addEventListener('DOMContentLoaded', () => {...})`** (see Task 2 Step 3) — `js/lib/pipeline-calc.js` is a deferred `<script type="module">`, and the kanban board's `stagesData` computed calls its exports unconditionally on the very first render (there is no `dashboardReady`-style gate here, unlike `portfolio.html`'s dashboard-only KPIs — the board is always-visible, primary content). Without this wrapper, the app would throw `ReferenceError` and fail to mount on every page load, since classic scripts always execute before any deferred module. The original pre-migration `pipeline.html` already used this exact wrapper — preserve it, don't drop it.
8. A dedicated empirical jsdom + real `vue.global.js` mount test (Task 6) is mandatory before the final whole-branch review — not optional, not deferred to post-merge browser testing alone.

---

## File Structure

- Modify: `pipeline.html` (full rewrite of `<div id="pipelineBoardSection">`'s contents into a Vue template; drops `js/pipeline-board.js` script tag; adds Vue 3 CDN script; the 4 modals, at the bottom of `<body>`, stay untouched static HTML)
- Create: `js/lib/pipeline-calc.js` (pure functions, `export function` + `window.<name> = <name>` bridge)
- Create: `js/lib/pipeline-calc.test.js` (vitest)

---

### Task 1: `js/lib/pipeline-calc.js` — pure aggregation/formatting extraction (TDD)

**Files:**
- Create: `js/lib/pipeline-calc.js`
- Create: `js/lib/pipeline-calc.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks (this is the first task).
- Produces: `pbGetVersionBudget(v, cgComputeGrandTotals, getPipelineBudget)` → `{ fee, ptc, hrs, currencyRate, _fromApi? }`; `pbComputeColumnTotals(cards, cgComputeGrandTotals, getPipelineBudget)` → `{ byCurrency, totalEur, totalEurPtc }`; `pbFmtMoney(n, code, currencies)` → string; `pbFmtDate(iso)` → string; `pbFmtTaskDate(d)` → string|null; `pbComputePotPercentages(totalBudget, committedTotal, potAmount)` → `{ pct, pctC, pctA }`. All consumed by Tasks 2-4.

- [ ] **Step 1: Write the failing tests**

Create `js/lib/pipeline-calc.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  pbGetVersionBudget, pbComputeColumnTotals, pbFmtMoney, pbFmtDate, pbFmtTaskDate, pbComputePotPercentages,
} from './pipeline-calc.js';

describe('pbGetVersionBudget', () => {
  it('uses cgComputeGrandTotals when the version has phases', () => {
    const v = { phases: [{ phaseId: 'p1', tasks: [] }], currencyRate: 1.2 };
    const cgComputeGrandTotals = (ver) => { expect(ver).toBe(v); return { fee: 100, ptc: 10, hrs: 5 }; };
    const result = pbGetVersionBudget(v, cgComputeGrandTotals, () => null);
    expect(result).toEqual({ fee: 100, ptc: 10, hrs: 5, currencyRate: 1.2 });
  });

  it('falls back to getPipelineBudget when there are no phases yet', () => {
    const v = { phases: [], versionId: 'v1', currencyRate: 1.0 };
    const getPipelineBudget = (versionId) => { expect(versionId).toBe('v1'); return { fee: 50, ptc: 5, currencyRate: 1.1 }; };
    const result = pbGetVersionBudget(v, () => { throw new Error('should not be called'); }, getPipelineBudget);
    expect(result).toEqual({ fee: 50, ptc: 5, hrs: 0, currencyRate: 1.1, _fromApi: true });
  });

  it('defaults ptc to 0 when the API budget omits it', () => {
    const v = { phases: [], versionId: 'v1', currencyRate: 1.0 };
    const getPipelineBudget = () => ({ fee: 50 });
    const result = pbGetVersionBudget(v, () => {}, getPipelineBudget);
    expect(result).toEqual({ fee: 50, ptc: 0, hrs: 0, currencyRate: 1.0, _fromApi: true });
  });

  it('returns zeros when there are no phases and no API budget available', () => {
    const v = { phases: [], versionId: 'v1', currencyRate: 1.5 };
    const result = pbGetVersionBudget(v, () => {}, () => null);
    expect(result).toEqual({ fee: 0, ptc: 0, hrs: 0, currencyRate: 1.5 });
  });

  it('defaults currencyRate to 1.0 when the version has none', () => {
    const v = { phases: [], versionId: 'v1' };
    const result = pbGetVersionBudget(v, () => {}, () => null);
    expect(result.currencyRate).toBe(1.0);
  });
});

describe('pbComputeColumnTotals', () => {
  it('aggregates fee/ptc per currency across cards', () => {
    const cards = [
      { v: { phases: [{}], currency: 'EUR', currencyRate: 1.0 } },
      { v: { phases: [{}], currency: 'USD', currencyRate: 1.1 } },
    ];
    const cgComputeGrandTotals = (v) => v.currency === 'EUR' ? { fee: 100, ptc: 0, hrs: 0 } : { fee: 110, ptc: 11, hrs: 0 };
    const result = pbComputeColumnTotals(cards, cgComputeGrandTotals, () => null);
    expect(result.byCurrency.EUR).toEqual({ fee: 100, ptc: 0, rate: 1.0 });
    expect(result.byCurrency.USD).toEqual({ fee: 110, ptc: 11, rate: 1.1 });
    // totalEur = 100/1.0 + 110/1.1 = 100 + 100 = 200
    expect(result.totalEur).toBeCloseTo(200, 5);
    // totalEurPtc = 0/1.0 + 11/1.1 = 0 + 10 = 10
    expect(result.totalEurPtc).toBeCloseTo(10, 5);
  });

  it('treats a non-finite fee/ptc as 0 rather than propagating NaN', () => {
    const cards = [{ v: { phases: [{}], currency: 'EUR', currencyRate: 1.0 } }];
    const cgComputeGrandTotals = () => ({ fee: NaN, ptc: undefined, hrs: 0 });
    const result = pbComputeColumnTotals(cards, cgComputeGrandTotals, () => null);
    expect(result.byCurrency.EUR).toEqual({ fee: 0, ptc: 0, rate: 1.0 });
    expect(result.totalEur).toBe(0);
  });

  it('returns an empty byCurrency map for an empty card list', () => {
    const result = pbComputeColumnTotals([], () => {}, () => null);
    expect(result.byCurrency).toEqual({});
    expect(result.totalEur).toBe(0);
    expect(result.totalEurPtc).toBe(0);
  });
});

describe('pbFmtMoney', () => {
  it('formats using the matching currency entry (symbol + locale)', () => {
    const currencies = [{ code: 'USD', symbol: '$', locale: 'en-US' }];
    expect(pbFmtMoney(1234.5, 'USD', currencies)).toBe('$ 1,234.50');
  });

  it('falls back to a EUR-like default when no currency entry matches', () => {
    expect(pbFmtMoney(10, 'EUR', [])).toBe('€ 10,00');
  });

  it('returns "<symbol> 0,00" for a non-finite amount', () => {
    expect(pbFmtMoney(NaN, 'EUR', [])).toBe('€ 0,00');
    expect(pbFmtMoney(undefined, 'EUR', [])).toBe('€ 0,00');
  });

  it('uses the raw code as the symbol when no currency entry matches a non-EUR code', () => {
    expect(pbFmtMoney(5, 'XYZ', [])).toBe('XYZ 0,00'.length > 0 ? pbFmtMoney(5, 'XYZ', []) : ''); // sanity call
    expect(pbFmtMoney(5, 'XYZ', [])).toMatch(/^XYZ /);
  });
});

describe('pbFmtDate', () => {
  it('formats an ISO date string', () => {
    expect(pbFmtDate('2026-03-15T00:00:00.000Z')).toBe('Mar 15, 2026');
  });

  it('returns "—" for a falsy input', () => {
    expect(pbFmtDate(null)).toBe('—');
    expect(pbFmtDate('')).toBe('—');
  });

  it('returns the raw input if it fails to parse into a valid label', () => {
    expect(pbFmtDate('not-a-date')).toBe('not-a-date');
  });
});

describe('pbFmtTaskDate', () => {
  it('formats a YYYY-MM-DD date (API format)', () => {
    expect(pbFmtTaskDate('2026-03-15')).toBe('2026/03');
  });

  it('formats a YYYYMM/YYYYMMDD date (legacy format)', () => {
    expect(pbFmtTaskDate('202603')).toBe('2026/03');
    expect(pbFmtTaskDate('20260315')).toBe('2026/03');
  });

  it('returns null for a falsy or too-short input', () => {
    expect(pbFmtTaskDate(null)).toBe(null);
    expect(pbFmtTaskDate('2026')).toBe(null);
  });
});

describe('pbComputePotPercentages', () => {
  it('computes total/committed/anticipated percentages, capped at 100', () => {
    expect(pbComputePotPercentages(150, 100, 200)).toEqual({ pct: 75, pctC: 50, pctA: 25 });
  });

  it('caps total percentage at 100 even when budget exceeds the target', () => {
    expect(pbComputePotPercentages(300, 250, 200)).toEqual({ pct: 100, pctC: 100, pctA: 0 });
  });

  it('returns all zeros when potAmount is 0', () => {
    expect(pbComputePotPercentages(100, 50, 0)).toEqual({ pct: 0, pctC: 0, pctA: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- pipeline-calc`
Expected: FAIL — `Cannot find module './pipeline-calc.js'` (or similar; the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `js/lib/pipeline-calc.js`:

```js
// ── Pure aggregation/formatting logic extracted from js/pipeline-board.js ──
// cgComputeGrandTotals/getPipelineBudget are injected (not imported) so this module has
// zero DOM/global dependencies and can be unit-tested in isolation — same pattern as
// js/lib/portfolio-calc.js's computeKpis(data, cfg, billableData, billableTasks, findRate).

export function pbGetVersionBudget(v, cgComputeGrandTotals, getPipelineBudget) {
  const currencyRate = v.currencyRate || 1.0;
  if ((v.phases || []).length) {
    const g = cgComputeGrandTotals(v);
    return { ...g, currencyRate };
  }
  if (typeof getPipelineBudget === 'function') {
    const api = getPipelineBudget(v.versionId);
    if (api) return { fee: api.fee, ptc: api.ptc || 0, hrs: 0, currencyRate: api.currencyRate || currencyRate, _fromApi: true };
  }
  return { fee: 0, ptc: 0, hrs: 0, currencyRate };
}

export function pbComputeColumnTotals(cards, cgComputeGrandTotals, getPipelineBudget) {
  const byCurrency = {};
  let totalEur = 0, totalEurPtc = 0;
  cards.forEach(({ v }) => {
    const grand = pbGetVersionBudget(v, cgComputeGrandTotals, getPipelineBudget);
    const cur   = v.currency || 'EUR';
    const rate  = grand.currencyRate || v.currencyRate || 1.0;
    const fee   = isFinite(grand.fee) ? grand.fee : 0;
    const ptc   = isFinite(grand.ptc) ? grand.ptc : 0;
    if (!byCurrency[cur]) byCurrency[cur] = { fee: 0, ptc: 0, rate };
    byCurrency[cur].fee += fee;
    byCurrency[cur].ptc += ptc;
    totalEur    += fee / rate;
    totalEurPtc += ptc / rate;
  });
  return { byCurrency, totalEur, totalEurPtc };
}

export function pbFmtMoney(n, code, currencies) {
  const parsed = parseFloat(n);
  const opts   = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  const cur    = (currencies || []).find(c => c.code === code)
    || { symbol: code === 'EUR' ? '€' : (code || '€'), locale: 'it-IT' };
  if (!isFinite(parsed)) return `${cur.symbol} 0,00`;
  return `${cur.symbol} ${new Intl.NumberFormat(cur.locale, opts).format(parsed)}`;
}

export function pbFmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch (e) { return iso; }
}

export function pbFmtTaskDate(d) {
  if (!d) return null;
  if (d.length === 10 && d[4] === '-') return d.slice(0, 4) + '/' + d.slice(5, 7); // YYYY-MM-DD
  if (d.length >= 6) return d.slice(0, 4) + '/' + d.slice(4, 6);                    // YYYYMM / YYYYMMDD
  return null;
}

export function pbComputePotPercentages(totalBudget, committedTotal, potAmount) {
  const pct  = potAmount > 0 ? Math.min(100, Math.round(totalBudget    / potAmount * 100)) : 0;
  const pctC = potAmount > 0 ? Math.min(100, Math.round(committedTotal / potAmount * 100)) : 0;
  const pctA = Math.min(pct - pctC, 100 - pctC);
  return { pct, pctC, pctA };
}

window.pbGetVersionBudget = pbGetVersionBudget;
window.pbComputeColumnTotals = pbComputeColumnTotals;
window.pbFmtMoney = pbFmtMoney;
window.pbFmtDate = pbFmtDate;
window.pbFmtTaskDate = pbFmtTaskDate;
window.pbComputePotPercentages = pbComputePotPercentages;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- pipeline-calc`
Expected: PASS (18 tests).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS (all files, including the pre-existing suite unaffected).

- [ ] **Step 6: Commit**

```bash
git add js/lib/pipeline-calc.js js/lib/pipeline-calc.test.js
git commit -m "feat(pipeline): extract pbGetVersionBudget/pbComputeColumnTotals/pbFmt* into js/lib/pipeline-calc.js"
```

---

### Task 2: Vue skeleton, page init, kanban board rendering

**Files:**
- Modify: `pipeline.html` (full file — `<head>` unchanged except adding one `<link>`/`<script>` line each for Vue CDN; body replaces `<div id="pipelineBoardSection">`'s **contents** with a Vue template, keeps the div itself as the mount root; drops `js/pipeline-board.js` script tag; the 4 modals and toast, further down in `<body>`, are untouched)

**Interfaces:**
- Consumes: `js/lib/pipeline-calc.js`'s `pbComputeColumnTotals`, `pbFmtMoney`, `pbFmtDate` (Task 1). Global functions from `js/costgrid.js`/`js/core.js`: `cgGetIndex()`, `cgLoad(cgId)`, `cgConfirmDeleteGrid(cgId, name)`, `cgCreateNewGrid()`, `esc`, `pipelineBadge`, `getClientName`, `getPipelineBudget` (from `js/api-sync.js`).
- Produces: `data().refreshTick` (reactive counter — every later task's computed that reads `_cgStore` must depend on it); `data().selectedCgId`/`selectedVerId` (consumed by Task 3's detail panel); `methods.openDetailPanel(cgId, verId)` (stub in this task, filled in by Task 3); `computed.stagesData` (array of `{ stage, st, cards, totalsHtml components }`, consumed by the template only in this task, but the shape is referenced by Task 3/4 for card-click wiring).

- [ ] **Step 1: Add the Vue 3 CDN script and drop `js/pipeline-board.js`**

In `pipeline.html`, find the script list (around line 175-189):

```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script src="js/api.js?v=4"></script>
<script src="js/core.js?v=3"></script>
<script src="js/settings.js"></script>
<script src="js/notifications.js"></script>
<script src="js/roles.js"></script>
<script type="module" src="js/lib/cfg-parse.js?v=1"></script>
<script type="module" src="js/lib/costgrid-calc.js?v=1"></script>
<script src="js/costgrid.js?v=2"></script>
<script src="js/clients.js"></script>
<script src="js/programs.js"></script>
<script src="js/pipeline-board.js?v=10"></script>
<script src="js/api-sync.js?v=14"></script>
<script src="js/shares.js"></script>
<script src="js/nav.js?v=4"></script>
```

Replace with (adds Vue CDN before `js/api.js`, adds `js/lib/pipeline-calc.js`, drops `js/pipeline-board.js`):

```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script src="js/api.js?v=4"></script>
<script src="js/core.js?v=3"></script>
<script src="js/settings.js"></script>
<script src="js/notifications.js"></script>
<script src="js/roles.js"></script>
<script type="module" src="js/lib/cfg-parse.js?v=1"></script>
<script type="module" src="js/lib/costgrid-calc.js?v=1"></script>
<script type="module" src="js/lib/pipeline-calc.js?v=1"></script>
<script src="js/costgrid.js?v=2"></script>
<script src="js/clients.js"></script>
<script src="js/programs.js"></script>
<script src="js/api-sync.js?v=14"></script>
<script src="js/shares.js"></script>
<script src="js/nav.js?v=4"></script>
```

- [ ] **Step 2: Replace `#pipelineBoardSection`'s contents with the Vue template**

Find (currently lines 18-67):

```html
<div id="pipelineBoardSection" style="height:calc(100vh - 206px);display:flex;flex-direction:column;overflow:hidden;position:relative">
  <div class="d-flex align-items-center justify-content-between px-4 py-2 flex-shrink-0"
       style="border-bottom:1px solid #dee2e6">
    <!-- Pipeline year dropdown (replaces static title) -->
    <div class="position-relative" id="pbPipelineDropdownWrap">
      <button id="pbPipelineBtn" class="d-flex flex-column align-items-start border-0 bg-transparent p-0"
              style="cursor:pointer;text-align:left;line-height:1.35">
        <span class="fw-bold d-flex align-items-center gap-1" style="font-size:2.5rem;color:var(--brand-navy)">
          Pipeline&nbsp;<span id="pbPipelineYearLabel"></span>
          <span id="pbPipelineCaret"
                style="display:inline-block;width:0;height:0;margin-left:10px;vertical-align:middle;
                       border-left:8px solid transparent;border-right:8px solid transparent;
                       border-top:10px solid #4b5563"></span>
        </span>
        <span class="text-muted" style="font-size:.8rem" id="pbPipelineSubtitle">Loading pipelines…</span>
      </button>
      <div id="pbPipelineMenu"
           style="display:none;position:absolute;top:calc(100% + 6px);left:0;z-index:500;
                  background:#fff;border:1px solid #dee2e6;border-radius:8px;
                  box-shadow:0 6px 20px rgba(0,0,0,.13);min-width:200px;padding:4px 0">
      </div>
    </div>
    <div class="d-flex gap-2 align-items-center">
      <button class="btn btn-primary btn-sm" id="btnNewCostGrid" style="display:none">+ New Proposal</button>
    </div>
  </div>
  <!-- 5-column kanban board -->
  <div id="pbColumnsContainer" class="d-flex gap-0" style="flex:1;min-height:0;overflow-x:auto;overflow-y:hidden;align-items:stretch"></div>
  <!-- Sticky totals bar (outside overflow container so sticky works) -->
  <div id="pbTotalsBar" class="d-flex"></div>
  <!-- Detail panel (slide-in from right) -->
  <div id="pbDetailPanel"
       style="display:none;position:absolute;top:0;right:0;bottom:0;width:860px;max-width:100%;
              background:#fff;border-left:2px solid #dee2e6;box-shadow:-4px 0 16px rgba(0,0,0,.12);
              z-index:200;flex-direction:column">
    <div class="d-flex align-items-center justify-content-between px-3 py-2 flex-shrink-0"
         style="border-bottom:1px solid #dee2e6;background:#0B1840;color:#fff">
      <span class="fw-semibold" style="font-size:var(--text-md)">Offer detail</span>
      <div class="d-flex gap-2 align-items-center">
        <button class="btn btn-sm btn-outline-danger px-3" id="pbBtnDeleteVersion" style="display:none;font-size:var(--text-xs);font-weight:600" title="Delete this Draft version">🗑 Delete</button>
        <button class="btn btn-sm btn-light px-3" id="pbBtnCloneCg" style="font-size:var(--text-xs);font-weight:600" title="Clone this version as a new proposal">⧉ Clone</button>
        <button class="btn btn-sm btn-light px-3" id="pbBtnShareCg" style="font-size:var(--text-xs);font-weight:600" title="Share this cost grid">🔗 Share</button>
        <button class="btn btn-sm btn-light px-3" id="pbBtnOpenCg" style="font-size:var(--text-xs);font-weight:600" title="Open full cost grid editor">✏️ Edit</button>
        <button class="btn btn-sm btn-link text-white p-0" onclick="pbCloseDetailPanel()"
                style="font-size:1.1rem;line-height:1" title="Close">×</button>
      </div>
    </div>
    <div id="pbDetailContent" class="d-flex flex-grow-1" style="min-height:0"></div>
  </div>
</div>
```

Replace with (this task builds only the dropdown header + kanban board; the detail panel's own inner markup is a `<div id="pbDetailContent">`-equivalent placeholder wired up in Task 3 — for THIS task, leave the panel closed/hidden and just get its open/close mechanics scaffolded):

```html
<div id="pipelineBoardSection" style="height:calc(100vh - 206px);display:flex;flex-direction:column;overflow:hidden;position:relative">
  <div class="d-flex align-items-center justify-content-between px-4 py-2 flex-shrink-0"
       style="border-bottom:1px solid #dee2e6">
    <div class="position-relative">
      <button class="d-flex flex-column align-items-start border-0 bg-transparent p-0"
              style="cursor:pointer;text-align:left;line-height:1.35"
              @click.stop="yearDropdownOpen = !yearDropdownOpen">
        <span class="fw-bold d-flex align-items-center gap-1" style="font-size:2.5rem;color:var(--brand-navy)">
          Pipeline&nbsp;<span>{{ selectedYear }}</span>
          <span v-if="pipelineYears.length"
                style="display:inline-block;width:0;height:0;margin-left:10px;vertical-align:middle;
                       border-left:8px solid transparent;border-right:8px solid transparent;
                       border-top:10px solid #4b5563"></span>
        </span>
        <span class="text-muted" style="font-size:.8rem">{{ pipelineYears.length ? 'All cost grid offers organised by deal stage' : 'No active pipelines' }}</span>
      </button>
      <div v-if="yearDropdownOpen"
           style="position:absolute;top:calc(100% + 6px);left:0;z-index:500;
                  background:#fff;border:1px solid #dee2e6;border-radius:8px;
                  box-shadow:0 6px 20px rgba(0,0,0,.13);min-width:200px;padding:4px 0">
        <button v-for="py in pipelineYears" :key="py.year" type="button"
                @click="selectYear(py.year)"
                :style="{ display:'block', width:'100%', textAlign:'left', border:'none',
                          background: py.year === selectedYear ? '#f0f4ff' : 'transparent',
                          color: py.year === selectedYear ? 'var(--brand-navy)' : '#374151',
                          fontWeight: py.year === selectedYear ? 700 : 400,
                          padding:'8px 16px', fontSize:'.875rem', cursor:'pointer' }">
          Pipeline {{ py.year }}{{ py.year === selectedYear ? ' ✓' : '' }}
        </button>
      </div>
    </div>
    <div class="d-flex gap-2 align-items-center">
      <button class="btn btn-primary btn-sm" v-if="newProposalVisible" @click="openNewProposalModal">+ New Proposal</button>
    </div>
  </div>
  <div class="d-flex gap-0" style="flex:1;min-height:0;overflow-x:auto;overflow-y:hidden;align-items:stretch">
    <div v-for="col in stagesData" :key="col.stage" class="pb-column d-flex flex-column" :style="{ borderTop: '3px solid ' + col.st.border }">
      <div class="pb-col-header d-flex align-items-center gap-2 px-2 py-2 flex-shrink-0"
           :style="{ background: col.st.bg, borderBottom: '1px solid ' + col.st.border + '20' }">
        <span class="fw-bold" style="font-size:var(--text-md);color:#1a1a2e">{{ col.stage }}</span>
        <span class="badge rounded-pill text-white" :style="{ background: col.st.badge, fontSize:'var(--text-xs)' }">{{ col.cards.length }}</span>
      </div>
      <div class="pb-col-body px-2 py-2">
        <div v-if="!col.cards.length" class="text-center text-muted py-4" style="font-size:var(--text-sm)">No offers</div>
        <div v-for="card in col.cards" :key="card.cg.id + card.v.versionId"
             class="pb-card mb-2 p-2 rounded border" :style="{ cursor:'pointer', background:'#fff', borderStyle: card.v.pipeline === 'Draft' ? 'dashed' : 'solid' }"
             @click="openDetailPanel(card.cg.id, card.v.versionId)">
          <div v-if="cardClientName(card)" class="text-muted" style="font-size:var(--text-xs);margin-bottom:1px">{{ cardClientName(card) }}</div>
          <div class="d-flex align-items-start justify-content-between gap-1 mb-1">
            <span class="fw-semibold" style="font-size:var(--text-base);line-height:1.3">{{ card.v.projectName || card.cg.name }}</span>
            <span v-if="(card.v.linkedProjects || []).length" class="badge" style="background:var(--text-muted);color:#fff;font-size:var(--text-2xs)">🔗</span>
          </div>
          <div v-html="cardBudgetHtml(card)"></div>
          <div class="d-flex align-items-center gap-1 flex-wrap mt-1">
            <span v-html="pipelineBadge(card.v.pipeline)"></span>
            <span class="text-muted" style="font-size:var(--text-2xs)">{{ card.v.versionLabel || '' }}</span>
          </div>
          <div class="d-flex justify-content-between align-items-end mt-2 pt-1" style="border-top:1px solid var(--border-light)">
            <div>
              <span style="font-size:var(--text-2xs);color:#999">{{ pbFmtDate(card.v.createdAt) }}</span>
              <div v-if="card.cg.ownerName" class="text-muted" style="font-size:var(--text-2xs);margin-top:2px">👤 {{ card.cg.ownerName }}</div>
            </div>
            <div class="d-flex gap-1">
              <button v-if="card.cg.myPermission !== 'viewer'" class="btn btn-xs btn-outline-secondary" title="Open in editor" @click.stop="showCostGridEditorView(card.cg.id, card.v.versionId)">✏️ Edit</button>
              <button v-if="card.cg.myPermission !== 'viewer'" class="btn btn-xs btn-outline-secondary" title="Clone proposal" @click.stop="openCloneModal(card.cg.id, card.v.versionId)">⧉</button>
              <button v-if="card.v.pipeline !== 'Draft'" class="btn btn-xs btn-outline-secondary" title="Share" @click.stop="openShareModal('cost_grid', card.cg.id, card.cg.name)">🔗</button>
              <button v-if="card.v.pipeline === 'Draft' && card.cg.myPermission !== 'viewer'" class="btn btn-xs btn-outline-danger" title="Delete proposal" @click.stop="cgConfirmDeleteGrid(card.cg.id, card.cg.name)">🗑</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="d-flex">
    <div v-for="(col, i) in stagesData" :key="col.stage" class="pb-col-footer px-2 py-2"
         :style="{ flex:'1 0 0', minWidth:'200px', background: col.st.bg, borderTop:'3px solid ' + col.st.border,
                   borderRight: i < stagesData.length - 1 ? '1px solid ' + col.st.border + '40' : '', fontSize:'var(--text-sm)' }">
      <div v-html="col.totalsHtml"></div>
    </div>
  </div>
  <div id="pbDetailPanel"
       v-if="selectedCgId"
       style="position:absolute;top:0;right:0;bottom:0;width:860px;max-width:100%;
              background:#fff;border-left:2px solid #dee2e6;box-shadow:-4px 0 16px rgba(0,0,0,.12);
              z-index:200;display:flex;flex-direction:column">
    <div class="d-flex align-items-center justify-content-between px-3 py-2 flex-shrink-0"
         style="border-bottom:1px solid #dee2e6;background:#0B1840;color:#fff">
      <span class="fw-semibold" style="font-size:var(--text-md)">Offer detail</span>
      <div class="d-flex gap-2 align-items-center">
        <button class="btn btn-sm btn-link text-white p-0" @click="closeDetailPanel" style="font-size:1.1rem;line-height:1" title="Close">×</button>
      </div>
    </div>
    <div class="d-flex flex-grow-1 align-items-center justify-content-center" style="min-height:0">
      <div class="spinner-border text-secondary"></div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Add the inline `Vue.createApp({...})` script**

Find the existing inline `<script>` block (currently lines 191-364) and replace its ENTIRE contents with:

**Critical timing note (do not skip):** `js/lib/pipeline-calc.js` is loaded via `<script type="module">`, which is always **deferred** — it executes only after the whole document has finished parsing, strictly *after* any classic (non-module) script, regardless of tag order. The kanban board's `stagesData` computed (below) calls `pbComputeColumnTotals`/`pbFmtMoney` **unconditionally on the very first render** (unlike `portfolio.html`'s dashboard-only `computeKpis`, which is gated behind a `dashboardReady` flag that stays false until the user opens a project — the kanban board has no such gate, it's the page's primary, always-visible content). If `Vue.createApp({...}).mount(...)` runs as a plain top-level classic-script statement (as `project-config.html`/`portfolio.html` do — safe there only because neither's *first* render happens to touch a lib-bridged function), it would execute — and trigger its first synchronous render — *before* `js/lib/pipeline-calc.js`'s module has run, throwing `ReferenceError: pbComputeColumnTotals is not defined` and crashing the entire app on every page load. The original (pre-migration) `pipeline.html` already wrapped its whole init block in `document.addEventListener('DOMContentLoaded', async () => {...})` — preserve that wrapper here; `DOMContentLoaded` always fires strictly after every deferred module script has executed, which resolves this for good.

```html
<script>
document.addEventListener('DOMContentLoaded', () => {

const PB_STAGES = ['Draft', 'SIP', 'Expected', 'Anticipated', 'Committed', 'Canceled'];
const PB_STAGE_STYLE = {
  Draft:       { bg: '#f8f9fa',                          border: '#adb5bd',                          badge: '#6c757d'                           },
  SIP:         { bg: 'var(--pipeline-sip-bg)',           border: 'var(--pipeline-sip-color)',         badge: 'var(--pipeline-sip-color)'          },
  Expected:    { bg: 'var(--pipeline-expected-bg)',      border: 'var(--pipeline-expected-color)',    badge: 'var(--pipeline-expected-color)'     },
  Anticipated: { bg: 'var(--pipeline-anticipated-bg)',  border: 'var(--pipeline-anticipated-color)', badge: 'var(--pipeline-anticipated-color)' },
  Committed:   { bg: 'var(--pipeline-committed-bg)',    border: 'var(--pipeline-committed-color)',   badge: 'var(--pipeline-committed-color)'   },
  Canceled:    { bg: 'var(--pipeline-canceled-bg)',     border: 'var(--pipeline-canceled-color)',    badge: 'var(--pipeline-canceled-color)'    },
};

// Returns the version to display for a cost grid on the pipeline board.
function pbGetDisplayVersion(cg) {
  const nonDraft = cg.versions.filter(v => v.pipeline !== 'Draft');
  if (nonDraft.length) {
    const withLinks = nonDraft.filter(v => (v.linkedProjects || []).length > 0);
    if (withLinks.length) return withLinks.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    return nonDraft.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  }
  return cg.versions.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
}

function pbGetStage(v) {
  if (v.pipeline) return v.pipeline;
  for (const lp of (v.linkedProjects || [])) {
    const p = (config.projects || []).find(proj => proj.id === lp.projectId)?.pipeline;
    if (p) return p;
  }
  return 'SIP';
}

Vue.createApp({
  data() {
    return {
      refreshTick: 0, // bumped after any _cgStore mutation (see Global Constraint 4)
      pipelineYears: [],
      selectedYear: new Date().getFullYear(),
      yearDropdownOpen: false,
      newProposalVisible: false,
      selectedCgId: null,
      selectedVerId: null,
    };
  },
  computed: {
    stagesData() {
      this.refreshTick;
      const index = cgGetIndex();
      const grouped = {};
      PB_STAGES.forEach(s => { grouped[s] = []; });
      index.forEach(cgId => {
        const cg = cgLoad(cgId);
        if (!cg || !cg.versions?.length) return;
        const v = pbGetDisplayVersion(cg);
        if (!v) return;
        const stage = pbGetStage(v);
        if (stage === 'Draft') grouped['Draft'].push({ cg, v });
        else if (grouped[stage]) grouped[stage].push({ cg, v });
        else grouped['SIP'].push({ cg, v });
      });
      return PB_STAGES.map(stage => {
        const cards = grouped[stage];
        const st = PB_STAGE_STYLE[stage];
        const { byCurrency, totalEur, totalEurPtc } = pbComputeColumnTotals(cards, cgComputeGrandTotals, getPipelineBudget);
        const multiCurrency = Object.keys(byCurrency).length > 1 || (Object.keys(byCurrency).length === 1 && !byCurrency['EUR']);
        const currencyLines = Object.entries(byCurrency)
          .sort(([a], [b]) => a === 'EUR' ? -1 : b === 'EUR' ? 1 : a.localeCompare(b))
          .map(([cur, { fee, ptc, rate }]) => {
            const localStr = `<span class="fw-bold">${pbFmtMoney(fee, cur, window.__currencies)}</span>`;
            const eurEquiv = cur !== 'EUR' ? ` <span style="color:#888;font-size:var(--text-2xs)">(≈ ${pbFmtMoney(fee / rate, 'EUR', window.__currencies)})</span>` : '';
            const ptcStr = ptc > 0 ? `<div class="text-muted" style="font-size:var(--text-2xs)">${pbFmtMoney(ptc, cur, window.__currencies)} PTC</div>` : '';
            return `<div class="text-end">${localStr}${eurEquiv}${ptcStr}</div>`;
          });
        if (multiCurrency) {
          const totPtcStr = totalEurPtc > 0 ? `<div class="text-muted" style="font-size:var(--text-2xs)">+ ${pbFmtMoney(totalEurPtc, 'EUR', window.__currencies)} PTC</div>` : '';
          currencyLines.push(`<div class="text-end fw-bold" style="border-top:1px solid #ddd;margin-top:3px;padding-top:3px">TOT ${pbFmtMoney(totalEur, 'EUR', window.__currencies)}${totPtcStr}</div>`);
        }
        return { stage, st, cards, totalsHtml: currencyLines.join('') || '<span class="text-muted" style="font-size:var(--text-xs)">—</span>' };
      });
    },
  },
  methods: {
    esc,
    pipelineBadge,
    pbFmtDate,
    getClientName,
    openShareModal,
    showCostGridEditorView,
    cgConfirmDeleteGrid,
    cardClientName(card) {
      const clientId = card.v.clientId;
      const name = clientId ? getClientName(clientId) : '';
      return name && name !== 'Unassigned' ? name : '';
    },
    cardBudgetHtml(card) {
      const grand = pbGetVersionBudget(card.v, cgComputeGrandTotals, getPipelineBudget);
      const cur = card.v.currency || '€';
      const currencyRate = grand.currencyRate || card.v.currencyRate || 1.0;
      const eurEquivStr = cur !== 'EUR' && grand.fee > 0
        ? `<div style="font-size:var(--text-2xs);color:#888;margin-top:1px">≈ ${pbFmtMoney(grand.fee / currencyRate, 'EUR', window.__currencies)}</div>` : '';
      const feeStr = grand.fee > 0
        ? `<div class="fw-bold" style="font-size:var(--text-base)">${pbFmtMoney(grand.fee, cur, window.__currencies)}</div>`
        : '<div class="text-muted" style="font-size:var(--text-sm)">No budget</div>';
      const ptcStr = grand.ptc > 0
        ? `<div style="font-size:var(--text-2xs);color:var(--text-muted);margin-top:1px">+ ${pbFmtMoney(grand.ptc, cur, window.__currencies)} PTC</div>` : '';
      return feeStr + eurEquivStr + ptcStr;
    },
    selectYear(year) {
      this.yearDropdownOpen = false;
      window.location.href = '/pipeline.html?year=' + year;
    },
    openDetailPanel(cgId, verId) {
      // Filled in fully by Task 3; for this task, just track selection so the placeholder panel shows.
      this.selectedCgId = cgId;
      this.selectedVerId = verId;
    },
    closeDetailPanel() {
      this.selectedCgId = null;
      this.selectedVerId = null;
    },
    openNewProposalModal() {
      document.getElementById('cgNewGridName').value = '';
      document.getElementById('cgNewGridError').classList.add('d-none');
      bootstrap.Modal.getOrCreateInstance(document.getElementById('cgNewGridModal')).show();
    },
    openCloneModal(cgId, verId) {
      const cg = cgLoad(cgId);
      if (!cg) return;
      const v = cg.versions.find(ver => ver.versionId === verId);
      _pbCloneSource = { cgId, verId, name: cg.name };
      document.getElementById('cgCloneSourceName').textContent = cg.name + (v?.versionLabel ? ' — ' + v.versionLabel : '');
      document.getElementById('cgCloneGridName').value = cg.name + ' — Copy';
      document.getElementById('cgCloneError').classList.add('d-none');
      bootstrap.Modal.getOrCreateInstance(document.getElementById('cgCloneModal')).show();
    },
  },
  async created() {
    loadSettings();

    const user = await initNav('pipeline', { breadcrumbs: [
      { label: 'Home', href: '/pipeline.html' },
      { label: 'Pipeline' },
    ]});
    if (!user) return;

    await Promise.all([loadClientsFromApi(), loadProgramsFromApi(), loadRolesFromApi()]);

    let pipelineYears = [];
    try { pipelineYears = await Api.pipelineYears.list(); } catch (e) {}
    this.pipelineYears = pipelineYears;

    const urlParams = new URLSearchParams(window.location.search);
    let reqYear = urlParams.get('year') ? parseInt(urlParams.get('year')) : null;
    const validYear = pipelineYears.find(py => py.year === reqYear);
    if (!validYear) {
      const currentYearPy = pipelineYears.find(py => py.year === new Date().getFullYear());
      reqYear = currentYearPy ? new Date().getFullYear() : (pipelineYears.length ? pipelineYears[0].year : new Date().getFullYear());
      window.history.replaceState({}, '', '?year=' + reqYear);
    }
    this.selectedYear = reqYear;
    const selPy = pipelineYears.find(py => py.year === this.selectedYear);
    this.newProposalVisible = selPy?.active !== false;

    document.addEventListener('click', () => { this.yearDropdownOpen = false; });

    await loadCurrenciesFromApi();
    await cgSyncFromApi(this.selectedYear);
    await Promise.all([loadConfigFromApi(), loadPipelineBudgetsFromApi()]);
    this.refreshTick++; // initial load completed — see Global Constraint 4

    document.getElementById('cgNewGridModal').addEventListener('shown.bs.modal', () => {
      document.getElementById('cgNewGridName').focus();
    });
    document.getElementById('btnCgCreateGrid').addEventListener('click', async () => {
      await cgCreateNewGrid();
      this.refreshTick++;
    });
    document.getElementById('cgCloneModal').addEventListener('shown.bs.modal', () => {
      document.getElementById('cgCloneGridName').focus();
    });
    document.getElementById('btnCgClone').addEventListener('click', async () => {
      await cgCloneGrid();
      this.refreshTick++;
    });
  },
}).mount('#pipelineBoardSection');

}); // end DOMContentLoaded
</script>
```

- [ ] **Step 4: Update the "＋ New Proposal" / "Clone" buttons in `pipeline.html`'s modals to use the real IDs above**

The `#cgNewGridModal`/`#cgCloneModal` markup (lines 89-132) is unchanged — the buttons `#btnCgCreateGrid`/`#btnCgClone` inside them keep their existing `id`s; only the *listener attachment* moved into `created()` above (Step 3), replacing the old inline-script listeners. No HTML change needed for the modals themselves in this task.

- [ ] **Step 5: Remove the old `updateNavState`/`cgHideAll`/`showPipelineBoardView`/`showCostGridEditorView`/`pbGoToReporting` overrides from the bottom inline script**

These are superseded: `updateNavState`/`cgHideAll` no-ops are no longer needed (nothing calls them once `js/pipeline-board.js` is gone); `showPipelineBoardView`'s only real definition (the override) is replaced by the Vue app's own reactivity (no manual "show board" call needed — the template is always live). Confirm via:
```bash
grep -n "showPipelineBoardView\|updateNavState\|cgHideAll" pipeline.html
```
Expected: no matches (all removed as part of Step 3's full-script replacement — `showCostGridEditorView`/`pbGoToReporting`/`pbGoToConfigure`-equivalent are reintroduced properly in Task 3/4, not needed yet in this task since the detail panel isn't wired up until then). Note: `showCostGridEditorView` is called directly in the template's Edit button (Step 2) — add this ONE top-level function back, since it's still needed globally by `js/pipeline-board.js`-equivalent card actions and doesn't belong inside the Vue instance (it's a plain navigation helper, not reactive state):
```html
<script>
function showCostGridEditorView(cgId, versionId) {
  const p = new URLSearchParams({ cgId, verId: versionId });
  window.location.href = '/costgrid.html?' + p;
}
</script>
```
Place this **before** the `Vue.createApp({...})` script block from Step 3 (as its own small `<script>` tag, or prepended to the same block — either is fine since both are classic scripts in the same document).

- [ ] **Step 6: Run the test suite**

Run: `npm test`
Expected: PASS (this task touches no `js/lib/*` file beyond what Task 1 already added).

- [ ] **Step 7: Commit**

```bash
git add pipeline.html
git commit -m "feat(pipeline): Vue 3 skeleton, kanban board rendering, pipeline-year dropdown"
```

---

### Task 3: Detail panel — offer info, linked projects, phases/tasks

**Files:**
- Modify: `pipeline.html` (replaces Task 2's placeholder spinner-only detail panel body with the full two-column layout; extends `data()`/`computed`/`methods`)

**Interfaces:**
- Consumes: `data().selectedCgId`/`selectedVerId`/`refreshTick` (Task 2); `js/lib/pipeline-calc.js`'s `pbGetVersionBudget`, `pbFmtMoney`, `pbFmtTaskDate` (Task 1); globals `cgLoad`, `cgComputePhaseTotals`, `cgComputeTaskTotals`, `getProjectPipeline`, `statusBadgeLarge`, `timesheetData`.
- Produces: `computed.selectedCg`/`selectedVersion` (the resolved cost grid / version object for the open panel — consumed by Task 4's action buttons and version tabs); `methods.pbGoToPortfolio(projectId)` (consumed by the linked-project chip's "📊 Portfolio" button).

- [ ] **Step 1: Replace the placeholder detail-panel body from Task 2**

In `pipeline.html`, find (from Task 2's Step 2):

```html
    <div class="d-flex flex-grow-1 align-items-center justify-content-center" style="min-height:0">
      <div class="spinner-border text-secondary"></div>
    </div>
  </div>
</div>
```

Replace with:

```html
    <div class="d-flex flex-grow-1" style="min-height:0">
      <div style="width:50%;padding:20px 18px;overflow-y:auto;border-right:1px solid var(--border-light)">
        <div class="mb-3">
          <div class="d-flex align-items-center gap-2 flex-wrap mb-1">
            <span class="badge rounded-pill text-white" :style="{ background: detailStageStyle.badge, fontSize:'var(--text-xs)' }">{{ detailStage }}</span>
            <span v-if="detailLinkedProjects.length" class="badge" style="background:var(--text-muted);color:#fff;font-size:var(--text-xs)">🔗 Linked project</span>
          </div>
          <div v-if="detailClientName" class="text-muted" style="font-size:var(--text-xs)">{{ detailClientName }}</div>
          <div class="fw-bold" style="font-size:var(--text-lg)">{{ selectedVersion.projectName || selectedCg.name }}</div>
          <div class="text-muted" style="font-size:var(--text-xs)">{{ selectedVersion.versionLabel || '' }} · {{ pbFmtDate(selectedVersion.createdAt) }}</div>
        </div>
        <div class="row g-2 mb-3" style="font-size:var(--text-base)">
          <div class="col-6">
            <div class="text-muted" style="font-size:var(--text-xs)">Period</div>
            <div>{{ selectedVersion.startDate ? selectedVersion.startDate.slice(0,4)+'/'+selectedVersion.startDate.slice(4,6) : '—' }} – {{ selectedVersion.endDate ? selectedVersion.endDate.slice(0,4)+'/'+selectedVersion.endDate.slice(4,6) : '—' }}</div>
          </div>
          <div class="col-6">
            <div class="text-muted" style="font-size:var(--text-xs)">Currency</div>
            <div>{{ selectedVersion.currency || 'EUR' }}<span v-if="selectedVersion.currencyRate && selectedVersion.currency !== 'EUR'"> · 1 € = {{ Number(selectedVersion.currencyRate).toLocaleString('en', {minimumFractionDigits:4,maximumFractionDigits:4}) }} {{ selectedVersion.currency }}</span></div>
          </div>
          <div class="col-6">
            <div class="text-muted" style="font-size:var(--text-xs)">Professional fees</div>
            <div class="fw-semibold">{{ detailBudget.fee > 0 ? pbFmtMoney(detailBudget.fee, selectedVersion.currency || 'EUR', currencies) : '—' }}</div>
          </div>
          <div class="col-6">
            <div class="text-muted" style="font-size:var(--text-xs)">PTC</div>
            <div class="fw-semibold">{{ detailBudget.ptc > 0 ? pbFmtMoney(detailBudget.ptc, selectedVersion.currency || 'EUR', currencies) : '—' }}</div>
          </div>
          <div class="col-12">
            <div class="text-muted" style="font-size:var(--text-xs)">Total budget</div>
            <div class="fw-bold" style="font-size:var(--text-xl)">{{ (detailBudget.fee + detailBudget.ptc) > 0 ? pbFmtMoney(detailBudget.fee + detailBudget.ptc, selectedVersion.currency || 'EUR', currencies) : '—' }}</div>
          </div>
        </div>
        <div v-if="selectedVersion.note" class="mb-3 p-2 rounded" style="background:var(--surface-light);font-size:var(--text-sm);white-space:pre-wrap">{{ selectedVersion.note }}</div>
        <hr style="border-color:var(--border-light);margin:16px 0">
        <div class="fw-semibold mb-2" style="font-size:var(--text-md)">🔗 Linked projects</div>
        <div v-if="!detailLinkedProjects.length" class="text-muted" style="font-size:var(--text-sm)">No projects linked.</div>
        <div v-for="lp in detailLinkedProjects" :key="lp.navId" class="p-2 mb-2 rounded border" style="font-size:var(--text-sm);background:var(--surface-light)">
          <div class="d-flex align-items-start justify-content-between gap-2">
            <div class="flex-grow-1">
              <div class="fw-semibold">{{ lp.pname }}</div>
              <div v-if="lp.pcode" style="font-size:var(--text-xs);color:var(--text-muted);font-family:'SFMono-Regular',monospace">{{ lp.pcode }}</div>
              <div class="d-flex gap-1 flex-wrap mt-1">
                <span v-if="lp.pipeline" v-html="pipelineBadge(lp.pipeline)"></span>
                <span v-html="statusBadgeLarge(lp.projStatus)"></span>
              </div>
              <div v-if="lp.taskNames.length" style="font-size:var(--text-xs);color:var(--text-muted);margin-top:5px"><span style="font-weight:600">Tasks:</span> {{ lp.taskNames.join(', ') }}</div>
            </div>
            <div class="d-flex gap-1 flex-shrink-0">
              <button class="btn btn-xs btn-outline-secondary" @click="pbGoToPortfolio(lp.navId)">📊 Portfolio</button>
            </div>
          </div>
        </div>
      </div>
      <div style="flex:1;padding:20px 18px;overflow-y:auto">
        <div class="fw-semibold mb-3" style="font-size:var(--text-md)">📋 Tasks by phase</div>
        <div v-if="!detailHasTasks" class="text-muted" style="font-size:var(--text-sm)">No tasks defined.</div>
        <div v-for="ph in (selectedVersion.phases || [])" :key="ph.phaseId" class="mb-4">
          <div class="d-flex align-items-center justify-content-between mb-2 pb-1" style="border-bottom:2px solid var(--indigo-200)">
            <span class="fw-bold" style="font-size:var(--text-md);color:var(--indigo-600)">{{ ph.phaseName || ph.phaseId }}</span>
            <span v-if="phaseTotal(ph) > 0" style="font-size:var(--text-sm);font-weight:600">{{ pbFmtMoney(phaseTotal(ph), selectedVersion.currency || 'EUR', currencies) }}</span>
          </div>
          <div v-for="task in (ph.tasks || [])" :key="task.taskId" class="d-flex align-items-baseline gap-3 py-2 border-bottom" style="font-size:var(--text-base)">
            <span class="flex-grow-1">{{ task.taskName || task.taskId }}</span>
            <span class="text-muted" style="font-size:var(--text-xs);white-space:nowrap">{{ taskDateRange(task) }}</span>
            <span style="white-space:nowrap;min-width:44px;text-align:right;font-size:var(--text-xs);color:var(--text-muted)">{{ taskTotals(task).totalHrs > 0 ? taskTotals(task).totalHrs + 'h' : '—' }}</span>
            <span class="fw-semibold" style="white-space:nowrap;min-width:80px;text-align:right">{{ taskTotals(task).totalCostAndFee > 0 ? pbFmtMoney(taskTotals(task).totalCostAndFee, selectedVersion.currency || 'EUR', currencies) : '—' }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add the supporting `data()`, `computed`, and `methods`**

In the `data()` return object (from Task 2), add:

```js
      currencies: [],
```

Set it in `created()` right after `await loadCurrenciesFromApi();`:
```js
    await loadCurrenciesFromApi();
    this.currencies = window.__currencies || [];
```

In `computed`, add (after `stagesData`):

```js
    selectedCg() {
      this.refreshTick;
      return this.selectedCgId ? cgLoad(this.selectedCgId) : null;
    },
    selectedVersion() {
      const cg = this.selectedCg;
      if (!cg) return null;
      return cg.versions.find(v => v.versionId === this.selectedVerId) || pbGetDisplayVersion(cg);
    },
    detailStage() {
      return this.selectedVersion ? pbGetStage(this.selectedVersion) : 'SIP';
    },
    detailStageStyle() {
      return PB_STAGE_STYLE[this.detailStage] || PB_STAGE_STYLE.SIP;
    },
    detailBudget() {
      if (!this.selectedVersion) return { fee: 0, ptc: 0 };
      return pbGetVersionBudget(this.selectedVersion, cgComputeGrandTotals, getPipelineBudget);
    },
    detailLinkedProjects() {
      if (!this.selectedVersion || !this.selectedCg) return [];
      const v = this.selectedVersion;
      const projsByRef = (config.projects || []).filter(p =>
        p.costGridRef?.cgId === this.selectedCgId && p.costGridRef?.versionId === v.versionId
      );
      const lps = (v.linkedProjects && v.linkedProjects.length)
        ? v.linkedProjects
        : projsByRef.map(p => ({ projectId: p.id, projectName: p.name }));
      return lps.map(lp => {
        let proj = (config.projects || []).find(p => p.id === lp.projectId);
        if (!proj && projsByRef.length) {
          proj = projsByRef.find(p => p.name === lp.projectName)
              || projsByRef.find(p => lp.projectName && p.name &&
                   (lp.projectName.startsWith(p.name) || p.name.startsWith(lp.projectName)))
              || (projsByRef.length === 1 ? projsByRef[0] : null);
        }
        const navId = proj?.id || lp.projectId;
        return {
          navId,
          pcode: proj?.code || '',
          pname: lp.projectName || proj?.name || lp.projectId,
          pipeline: getProjectPipeline(navId) || proj?.pipeline || '',
          projStatus: proj?.status || '',
          taskNames: lp.taskNames || [],
        };
      });
    },
    detailClientName() {
      if (!this.selectedVersion) return '';
      const v = this.selectedVersion;
      const projsByRef = (config.projects || []).filter(p =>
        p.costGridRef?.cgId === this.selectedCgId && p.costGridRef?.versionId === v.versionId
      );
      const effectiveClientId = v.clientId
        || this.detailLinkedProjects.map(lp => (config.projects || []).find(p => p.id === lp.navId)?.clientId).find(Boolean)
        || projsByRef[0]?.clientId
        || null;
      const name = effectiveClientId ? getClientName(effectiveClientId) : '';
      return name && name !== 'Unassigned' ? name : '';
    },
    detailHasTasks() {
      const phases = this.selectedVersion?.phases || [];
      return phases.some(ph => ph.tasks?.length);
    },
```

In `methods`, add:

```js
    statusBadgeLarge,
    getProjectPipeline,
    // pbFmtMoney is called bare in this task's template interpolations (e.g. {{ pbFmtMoney(...) }})
    // — per Global Constraint 5, it must be a real methods: entry (not just relied on as a global),
    // since Vue's runtime-compiled template scope never falls through to window for it.
    pbFmtMoney(n, code) { return window.pbFmtMoney(n, code, this.currencies); },
    pbGoToPortfolio(projectId) {
      window.location.href = '/portfolio.html?projectId=' + encodeURIComponent(projectId);
    },
    phaseTotal(ph) {
      const t = cgComputePhaseTotals(ph, this.selectedVersion.roles);
      return t.fee + t.ptc;
    },
    taskTotals(task) {
      return cgComputeTaskTotals(task, this.selectedVersion.roles);
    },
    taskDateRange(task) {
      return [pbFmtTaskDate(task.taskStartDate), pbFmtTaskDate(task.taskEndDate)].filter(Boolean).join(' – ') || '—';
    },
```

- [ ] **Step 3: Load version structure when opening the panel, and bump `refreshTick`**

Replace Task 2's `openDetailPanel` method body:

```js
    openDetailPanel(cgId, verId) {
      this.selectedCgId = cgId;
      this.selectedVerId = verId;
    },
```

with:

```js
    async openDetailPanel(cgId, verId) {
      this.selectedCgId = cgId;
      this.selectedVerId = verId;
      if (typeof cgLoadStructureFromApi === 'function') {
        await cgLoadStructureFromApi(cgId, verId).catch(() => {});
      }
      this.refreshTick++; // structure just loaded into _cgStore — see Global Constraint 4
    },
```

- [ ] **Step 4: Run the test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline.html
git commit -m "feat(pipeline): detail panel — offer info, linked projects, phases/tasks"
```

---

### Task 4: POT section, version tabs, action buttons, Refresh rate

**Files:**
- Modify: `pipeline.html` (extends the detail panel header + left column from Task 3; extends `data()`/`computed`/`methods`)

**Interfaces:**
- Consumes: `computed.selectedCg`/`selectedVersion`/`detailStage` (Task 3); globals `Api.pots.summary`, `Api.costGrids.versions.refreshRate`, `cgConfirmDeleteVersion`, `js/lib/pipeline-calc.js`'s `pbComputePotPercentages`.
- Produces: nothing consumed by later tasks (this is the last rendering task before the lib is fully exercised and the mount test).

- [ ] **Step 1: Add version tabs + action buttons to the detail panel header**

In `pipeline.html`, find the detail panel's header (from Task 2's Step 2):

```html
    <div class="d-flex align-items-center justify-content-between px-3 py-2 flex-shrink-0"
         style="border-bottom:1px solid #dee2e6;background:#0B1840;color:#fff">
      <span class="fw-semibold" style="font-size:var(--text-md)">Offer detail</span>
      <div class="d-flex gap-2 align-items-center">
        <button class="btn btn-sm btn-link text-white p-0" @click="closeDetailPanel" style="font-size:1.1rem;line-height:1" title="Close">×</button>
      </div>
    </div>
```

Replace with:

```html
    <div class="d-flex align-items-center justify-content-between px-3 py-2 flex-shrink-0"
         style="border-bottom:1px solid #dee2e6;background:#0B1840;color:#fff">
      <span class="fw-semibold" style="font-size:var(--text-md)">Offer detail</span>
      <div class="d-flex gap-2 align-items-center">
        <button v-if="detailStage === 'Draft' && selectedCg.myPermission !== 'viewer'" class="btn btn-sm btn-outline-danger px-3" style="font-size:var(--text-xs);font-weight:600" title="Delete this Draft version" @click="deleteSelectedVersion">🗑 Delete</button>
        <button v-if="selectedCg.myPermission !== 'viewer'" class="btn btn-sm btn-light px-3" style="font-size:var(--text-xs);font-weight:600" title="Clone this version as a new proposal" @click="openCloneModal(selectedCgId, selectedVerId)">⧉ Clone</button>
        <button v-if="detailStage !== 'Draft'" class="btn btn-sm btn-light px-3" style="font-size:var(--text-xs);font-weight:600" title="Share this cost grid" @click="openShareModal('cost_grid', selectedCgId, selectedCg.name)">🔗 Share</button>
        <button v-if="selectedCg.myPermission !== 'viewer'" class="btn btn-sm btn-light px-3" style="font-size:var(--text-xs);font-weight:600" title="Open full cost grid editor" @click="closeDetailPanel(); showCostGridEditorView(selectedCgId, selectedVerId)">✏️ Edit</button>
        <button class="btn btn-sm btn-link text-white p-0" @click="closeDetailPanel" style="font-size:1.1rem;line-height:1" title="Close">×</button>
      </div>
    </div>
    <div v-if="selectedCg.versions.length > 1" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 18px;border-bottom:1px solid var(--border-light);background:var(--surface-light);flex-shrink:0">
      <span class="text-muted" style="font-size:var(--text-xs)">Version:</span>
      <button v-for="ver in selectedCg.versions" :key="ver.versionId"
              class="btn btn-sm" :class="ver.versionId === selectedVerId ? 'btn-primary' : 'btn-outline-secondary'"
              style="font-size:var(--text-xs);padding:2px 10px;gap:4px"
              @click="openDetailPanel(selectedCgId, ver.versionId)">
        {{ ver.versionLabel }}<span :style="{ display:'inline-block', width:'7px', height:'7px', borderRadius:'50%', background: verStageBadgeColor(ver), verticalAlign:'middle', marginLeft:'4px' }"></span>
      </button>
    </div>
```

**Note (per Global Constraint 5):** the version-tab dot color must **not** reference `PB_STAGE_STYLE`/`pbGetStage` directly in the template — both are top-level `const`/`function` declarations in the inline script, not `data()`/`computed`/`methods` entries, so a bare template reference would resolve to `undefined` under Vue 3's runtime-compiled-template scoping (the exact bug class fixed repeatedly in `portfolio.html`/`project-config.html` this month). Add a method instead, in `methods` (alongside `phaseTotal`/`taskTotals` from Task 3):

```js
    verStageBadgeColor(ver) {
      return (PB_STAGE_STYLE[pbGetStage(ver)] || PB_STAGE_STYLE.SIP).badge;
    },
```

The template then calls this method (`verStageBadgeColor(ver)`, shown above) instead of touching `PB_STAGE_STYLE`/`pbGetStage` inline.

- [ ] **Step 2: Add the POT section to the left column, right after the metadata block**

In the left column (from Task 3's Step 1), find:

```html
        <div v-if="selectedVersion.note" class="mb-3 p-2 rounded" style="background:var(--surface-light);font-size:var(--text-sm);white-space:pre-wrap">{{ selectedVersion.note }}</div>
        <hr style="border-color:var(--border-light);margin:16px 0">
```

Replace with:

```html
        <div v-if="selectedVersion.note" class="mb-3 p-2 rounded" style="background:var(--surface-light);font-size:var(--text-sm);white-space:pre-wrap">{{ selectedVersion.note }}</div>
        <div v-if="potState" style="border-top:1px solid var(--border-light);padding-top:10px;margin-top:4px">
          <div class="d-flex align-items-center justify-content-between mb-1">
            <span class="fw-semibold" style="font-size:var(--text-sm)">🎯 POT — {{ potState.targetName }} {{ potState.year }}</span>
            <span :style="{ fontSize:'var(--text-xs)', color: potState.totColor, fontWeight:700 }">{{ potState.pct }}% total</span>
          </div>
          <div v-if="potState.pot" style="height:8px;background:#e9ecef;border-radius:3px;overflow:hidden;margin-bottom:6px;display:flex">
            <div :style="{ height:'100%', width: potState.pctC + '%', background:'#198754' }"></div>
            <div :style="{ height:'100%', width: potState.pctA + '%', background:'#fd7e14', opacity:.75 }"></div>
          </div>
          <div v-if="potState.pot" style="font-size:var(--text-xs);color:var(--text-muted);display:flex;flex-direction:column;gap:3px">
            <div class="d-flex justify-content-between">
              <span>Total (C+A): <strong :style="{ color: potState.totColor }">{{ potFmtMoney(potState.totalBudget) }}</strong></span>
              <span>Target: <strong style="color:#1a1a2e">{{ potFmtMoney(potState.pot.amount) }}</strong></span>
            </div>
            <div style="padding-left:8px;border-left:3px solid #198754">
              Committed: <strong style="color:#198754">{{ potFmtMoney(potState.committedTotal) }}</strong> <span style="color:#888">({{ potState.pctC }}%)</span>
            </div>
            <div v-if="potState.anticipatedTotal > 0" style="padding-left:8px;border-left:3px solid #fd7e14">
              Anticipated: <strong style="color:#fd7e14">+ {{ potFmtMoney(potState.anticipatedTotal) }}</strong> <span style="color:#888">({{ potState.pctA }}%)</span>
            </div>
          </div>
          <div v-if="!potState.pot" class="text-muted" style="font-size:var(--text-xs)">No POT target for <strong>{{ potState.targetName }}</strong> in {{ potState.year }}.</div>
          <div v-if="potState.nContrib > 1" class="text-muted mt-1" style="font-size:var(--text-2xs)">{{ potState.nContrib }} proposals contribute to this POT</div>
        </div>
        <hr style="border-color:var(--border-light);margin:16px 0">
```

- [ ] **Step 3: Add `potState`, load it whenever the panel opens, and add the supporting methods**

In `data()`, add:

```js
      potState: null,
```

In `methods`, add:

```js
    potFmtMoney(n) { return '€ ' + Number(n).toLocaleString('en', { maximumFractionDigits: 0 }); },
    async loadPotSection(v, stage) {
      this.potState = null;
      const year = v.pipelineYear;
      if (!year || stage === 'Draft') return;

      let clientId = null;
      for (const lp of (v.linkedProjects || [])) {
        const proj = (config.projects || []).find(p => p.id === lp.projectId);
        if (proj?.clientId) { clientId = proj.clientId; break; }
      }
      if (!clientId) clientId = v.clientId || null;
      if (!clientId) return;

      const group = this.clientGroups.find(g => (g.clients || []).some(c => c.id === clientId));
      const params = group ? { year, clientGroupId: group.id } : { year, clientId };
      const targetName = group ? group.name : getClientName(clientId);

      try {
        const { pot, proposals, committed_total, anticipated_total } = await Api.pots.summary(params);
        if (!pot) { this.potState = { pot: null, year, targetName }; return; }
        const committedTotal = parseFloat(committed_total || 0);
        const anticipatedTotal = parseFloat(anticipated_total || 0);
        const totalBudget = committedTotal + anticipatedTotal;
        const { pct, pctC, pctA } = pbComputePotPercentages(totalBudget, committedTotal, pot.amount);
        const totColor = pct >= 100 ? '#198754' : pct >= 75 ? '#fd7e14' : '#0d6efd';
        const nContrib = proposals.filter(p => p.pipeline === 'Committed' || p.pipeline === 'Anticipated').length;
        this.potState = { pot, year, targetName, committedTotal, anticipatedTotal, totalBudget, pct, pctC, pctA, totColor, nContrib };
      } catch (e) {
        this.potState = null;
      }
    },
    deleteSelectedVersion() {
      cgConfirmDeleteVersion(this.selectedCgId, this.selectedVerId, this.selectedVersion.versionLabel, () => {
        this.closeDetailPanel();
        this.refreshTick++;
      });
    },
```

In `data()`, also add (populated in `created()`):

```js
      clientGroups: [],
```

In `created()`, after `this.currencies = window.__currencies || [];`, add:

```js
    Api.clientGroups.list().then(gs => { this.clientGroups = gs; }).catch(() => {});
```

Extend `openDetailPanel` (from Task 3) to load the POT section once the version is known:

```js
    async openDetailPanel(cgId, verId) {
      this.selectedCgId = cgId;
      this.selectedVerId = verId;
      if (typeof cgLoadStructureFromApi === 'function') {
        await cgLoadStructureFromApi(cgId, verId).catch(() => {});
      }
      this.refreshTick++;
      const v = this.selectedVersion;
      if (v) this.loadPotSection(v, pbGetStage(v));
    },
```

- [ ] **Step 4: Wire the exchange-rate refresh flow**

Add to the currency row in the left column (Task 3's Step 1), right after the currency `<div>`:

```html
          <div class="col-6">
            <div class="text-muted" style="font-size:var(--text-xs)">Currency</div>
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <span>{{ selectedVersion.currency || 'EUR' }}<span v-if="selectedVersion.currencyRate && selectedVersion.currency !== 'EUR'"> · 1 € = {{ Number(selectedVersion.currencyRate).toLocaleString('en', {minimumFractionDigits:4,maximumFractionDigits:4}) }} {{ selectedVersion.currency }}</span></span>
              <button v-if="rateStale" class="btn btn-outline-warning" style="font-size:var(--text-2xs);padding:1px 6px;line-height:1.4" title="Rate snapshot is outdated — click to update" @click="confirmRefreshRate">↺ Refresh rate</button>
            </div>
          </div>
```

(This replaces the earlier, simpler currency `<div class="col-6">` block added in Task 3's Step 1 — same content, with the refresh-rate button added.)

Add to `computed`:

```js
    liveRate() {
      if (!this.selectedVersion || this.selectedVersion.currency === 'EUR') return null;
      const entry = this.currencies.find(c => c.code === this.selectedVersion.currency);
      return entry ? parseFloat(entry.current_rate) : null;
    },
    rateStale() {
      const isAdmin = window.__navUser?.role === 'admin';
      return isAdmin && this.liveRate != null && Math.abs(this.liveRate - (this.selectedVersion.currencyRate || 1.0)) > 0.0001;
    },
```

Add to `methods`:

```js
    confirmRefreshRate() {
      const cgId = this.selectedCgId, verId = this.selectedVerId, cur = this.selectedVersion.currency;
      const snapStr = Number(this.selectedVersion.currencyRate || 1).toLocaleString('en', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
      const liveStr = Number(this.liveRate).toLocaleString('en', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
      showConfirm(
        `Update the exchange rate snapshot?\n\nCurrent snapshot: 1 € = ${snapStr} ${cur}\nLatest rate: 1 € = ${liveStr} ${cur}\n\nBudget amounts remain in ${cur}. Only the EUR equivalent display will change.`,
        async () => {
          try {
            await Api.costGrids.versions.refreshRate(cgId, verId);
            await cgSyncFromApi();
            await loadPipelineBudgetsFromApi();
            this.refreshTick++;
            await this.openDetailPanel(cgId, verId);
          } catch (e) {
            alert('Failed to refresh rate: ' + e.message);
          }
        },
        null,
        'Update exchange rate'
      );
    },
```

(This reuses the already-shared `showConfirm()` from `js/core.js` instead of building a one-off Bootstrap modal, since the original's bespoke modal in `js/pipeline-board.js:555-596` served no purpose `showConfirm()` doesn't already cover — same simplification precedent as removing genuinely-dead code in prior migrations, not a new feature.)

- [ ] **Step 5: Run the test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add pipeline.html
git commit -m "feat(pipeline): POT section, version tabs, action buttons, refresh-rate flow"
```

---

### Task 5: JSON viewer modal wiring, final script-list cleanup

**Files:**
- Modify: `pipeline.html`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks (last code task before the mount test).

- [ ] **Step 1: Confirm the JSON viewer modal buttons still work**

The `#jsonViewerModal` (lines 134-162, untouched static HTML) is driven by `_jsonViewerFilename`/`_jsonViewerOnSave` globals and `#btnJsonCopy`/`#btnJsonExport`/`#btnJsonImport`/`#btnJsonApply` listeners. These listeners were part of the OLD bottom inline script (original lines 317-361) that Task 2's Step 3 replaced wholesale. Add them back inside `created()`, right after the `btnCgClone` listener from Task 2 Step 3:

```js
    document.getElementById('btnJsonCopy').addEventListener('click', () => {
      navigator.clipboard.writeText(document.getElementById('jsonViewerContent').value).catch(() => {});
    });
    document.getElementById('btnJsonExport').addEventListener('click', () => {
      const text = document.getElementById('jsonViewerContent').value;
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = _jsonViewerFilename; a.click();
      URL.revokeObjectURL(url);
    });
    document.getElementById('btnJsonImport').addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json';
      inp.onchange = e => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          try {
            JSON.parse(ev.target.result);
            document.getElementById('jsonViewerContent').value = ev.target.result;
            document.getElementById('jsonViewerError').classList.add('d-none');
          } catch(err) {
            const el = document.getElementById('jsonViewerError');
            el.textContent = 'Invalid JSON: ' + err.message;
            el.classList.remove('d-none');
          }
        };
        reader.readAsText(file);
      };
      inp.click();
    });
    document.getElementById('btnJsonApply').addEventListener('click', () => {
      const errEl = document.getElementById('jsonViewerError');
      try {
        const parsed = JSON.parse(document.getElementById('jsonViewerContent').value);
        if (_jsonViewerOnSave) { _jsonViewerOnSave(parsed); }
        bootstrap.Modal.getInstance(document.getElementById('jsonViewerModal'))?.hide();
        errEl.classList.add('d-none');
      } catch(err) {
        errEl.textContent = 'Invalid JSON: ' + err.message;
        errEl.classList.remove('d-none');
      }
    });
```

- [ ] **Step 2: Verify the final script list**

Run: `grep -n "<script" pipeline.html`
Expected: bootstrap bundle, Vue 3 CDN, `js/api.js`, `js/core.js`, `js/settings.js`, `js/notifications.js`, `js/roles.js`, `js/lib/cfg-parse.js` (module), `js/lib/costgrid-calc.js` (module), `js/lib/pipeline-calc.js` (module), `js/costgrid.js`, `js/clients.js`, `js/programs.js`, `js/api-sync.js`, `js/shares.js`, `js/nav.js`, the `showCostGridEditorView` helper script, the inline `Vue.createApp` script. **No `js/pipeline-board.js`.**

- [ ] **Step 3: Verify no leftover dead references**

Run: `grep -n "pbBuildCard\|renderPipelineBoard\|_pbActiveCgId\|_pbActiveVerid\|_pbSelectedYear\|pbOpenDetailPanel\|pbCloseDetailPanel\|pbLoadPotSection\b" pipeline.html`
Expected: no matches (all superseded by the Vue instance's own `data()`/`methods` from Tasks 2-4 — these were the old global-scope names from `js/pipeline-board.js`, which is no longer loaded).

- [ ] **Step 4: Run the test suite one more time**

Run: `npm test`
Expected: PASS (76+18 tests: the pre-existing suite plus Task 1's 18 new tests).

- [ ] **Step 5: Commit**

```bash
git add pipeline.html
git commit -m "feat(pipeline): wire JSON viewer modal, verify script-list and dead-reference cleanup"
```

---

### Task 6: Empirical mount verification (mandatory, per Global Constraint 7)

**Files:** None — verification only, using a throwaway Node script (not committed; delete before Task 7's review).

**Interfaces:**
- Consumes: the fully-assembled `pipeline.html` from Tasks 1-5.
- Produces: a pass/fail verdict gating the final whole-branch review — no code artifact.

- [ ] **Step 1: Install throwaway test dependencies**

```bash
npm install --no-save vue@3 jsdom
```

- [ ] **Step 2: Write the mount-test script**

Create a temporary file (e.g. `scratch_pipeline_mount_test.js` in the repo root — **do not commit it**):

```js
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'outside-only', url: 'http://localhost/pipeline.html?year=2026' });
const { window } = dom;
global.window = window; global.document = window.document; global.navigator = window.navigator;

const vueSrc = fs.readFileSync(require.resolve('vue/dist/vue.global.prod.js'), 'utf8');
window.eval(vueSrc);
window.eval(fs.readFileSync('js/core.js', 'utf8'));

// Realistic data: one multi-version proposal with a linked project, one Draft-only, one Committed
// single-version with a POT target and a stale exchange rate.
const cgA = {
  id: 'cg1', name: 'Acme Renewal', ownerName: 'Test User', myPermission: 'owner',
  versions: [
    { versionId: 'v1a', versionLabel: 'v1', pipeline: 'Draft', createdAt: '2026-01-01', currency: 'EUR', phases: [], linkedProjects: [] },
    { versionId: 'v1b', versionLabel: 'v2', pipeline: 'Committed', createdAt: '2026-02-01', currency: 'USD', currencyRate: 1.08,
      phases: [{ phaseId: 'ph1', phaseName: 'Phase 1', tasks: [{ taskId: 't1', taskName: 'Design', taskStartDate: '20260101', taskEndDate: '20260228', resources: [{ role: 'PM', soldHours: 10, hourlyRate: 100 }] }] }],
      linkedProjects: [{ projectId: 'p1', projectName: 'Acme Project', taskNames: ['Design'] }],
      clientId: 'c1', pipelineYear: 2026, note: 'Renewal for Q1' },
  ],
};
const cgB = { id: 'cg2', name: 'Beta Draft', ownerName: 'Test User', myPermission: 'owner',
  versions: [{ versionId: 'v2a', versionLabel: 'v1', pipeline: 'Draft', createdAt: '2026-03-01', currency: 'EUR', phases: [] }] };

global._cgStore = new Map([['cg1', cgA], ['cg2', cgB]]);
Object.assign(window, {
  cgGetIndex: () => [...global._cgStore.keys()],
  cgLoad: (id) => { const cg = global._cgStore.get(id); return cg ? JSON.parse(JSON.stringify(cg)) : null; },
  cgComputeGrandTotals: (v) => ({ fee: (v.phases || []).length ? 5000 : 0, ptc: 0, hrs: 10 }),
  cgComputePhaseTotals: () => ({ fee: 5000, ptc: 0 }),
  cgComputeTaskTotals: () => ({ totalHrs: 10, totalCostAndFee: 1000 }),
  cgConfirmDeleteGrid: () => {}, cgConfirmDeleteVersion: () => {}, cgCreateNewGrid: async () => {}, cgCloneGrid: async () => {},
  cgLoadStructureFromApi: async () => {}, cgSyncFromApi: async () => {},
  config: { projects: [{ id: 'p1', name: 'Acme Project', clientId: 'c1', pipeline: 'Committed', status: 'Started', costGridRef: { cgId: 'cg1', versionId: 'v1b' } }] },
  timesheetData: [],
  getClientName: () => 'Acme Corp', getProjectPipeline: () => 'Committed', getPipelineBudget: () => null,
  pipelineBadge: () => '<span>badge</span>', statusBadgeLarge: () => '<span>status</span>',
  openShareModal: () => {}, showCostGridEditorView: () => {},
  loadClientsFromApi: async () => {}, loadProgramsFromApi: async () => {}, loadRolesFromApi: async () => {},
  loadConfigFromApi: async () => {}, loadPipelineBudgetsFromApi: async () => {}, loadCurrenciesFromApi: async () => { window.__currencies = [{ code: 'USD', symbol: '$', locale: 'en-US', current_rate: 1.12 }]; },
  initNav: async () => ({ id: 'u1', role: 'admin' }),
  Api: {
    pipelineYears: { list: async () => [{ year: 2026, active: true }] },
    clientGroups: { list: async () => [] },
    ratecards: { list: async () => [] },
    pots: { summary: async () => ({ pot: { amount: 100000 }, proposals: [{ pipeline: 'Committed' }], committed_total: 5000, anticipated_total: 0 }) },
    costGrids: { versions: { refreshRate: async () => {} } },
  },
  loadSettings: () => {},
});

const html = fs.readFileSync('pipeline.html', 'utf8');
document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)[1];

// Re-run every classic (non-module) inline/external <script> in document order, skipping ones
// already handled above (api.js/core.js/nav.js/etc. are stubbed via globals instead of loaded raw,
// since they'd try real network calls) — evaluate only the two pipeline-specific inline scripts.
const scripts = [...document.querySelectorAll('script:not([type="module"]):not([src])')];
let errors = [];
scripts.forEach(s => {
  try { window.eval(s.textContent); } catch (e) { errors.push(e); }
});
console.log('Inline script eval errors:', errors.map(e => e.stack));

setTimeout(() => {
  const board = document.getElementById('pipelineBoardSection');
  console.log('MOUNT RESULT length:', board ? board.innerHTML.length : 'NOT FOUND');
  console.log('Contains "Acme Renewal"?', board?.innerHTML.includes('Acme Renewal'));
  console.log('Contains "Beta Draft"?', board?.innerHTML.includes('Beta Draft'));
}, 200);
```

- [ ] **Step 3: Run it and interpret the result**

```bash
node scratch_pipeline_mount_test.js
```

Expected: `Inline script eval errors: []`, `MOUNT RESULT length` > 0, both proposal names present. If any error appears, it names the exact bare-global or reactivity gap to fix (per Global Constraints 4-5) — fix in the relevant task's file (not a new task; amend the task that introduced the gap), then re-run this script until clean.

- [ ] **Step 4: Click-simulate the detail panel and card actions to catch handler-level bugs**

Extend the script's `setTimeout` block to also exercise interactive paths (mirroring the empirical tests already run for `portfolio.html`/`project-config.html` this month):

```js
  const vm = /* capture from mount() return value if the script is restructured to call app.mount() directly rather than via document parsing above */;
  // If using the raw-HTML-parse approach above, instead simulate a card click:
  const firstCard = board.querySelector('.pb-card');
  if (firstCard) { firstCard.click(); }
  setTimeout(() => {
    console.log('Detail panel opened?', document.getElementById('pbDetailPanel') !== null);
  }, 100);
```

Adjust based on how Step 2's script actually captures the Vue app instance (prefer calling `Vue.createApp(opts).mount(...)` directly and keeping the returned `vm`, exactly as the `portfolio.html`/`project-config.html` cycles' own mount-test scripts did, rather than re-executing inline `<script>` tags via `querySelectorAll` — the latter is shown above for illustration but the executed cycles' own scripts extracted the `Vue.createApp({...})` object literal text and evaluated it directly, which is more reliable; follow that proven approach here too).

- [ ] **Step 5: Delete the scratch script**

```bash
rm -f scratch_pipeline_mount_test.js
git status --short
```
Expected: clean (nothing to commit from this task — it produced no permanent artifact).

---

## Self-Review Notes

- **Spec coverage:** every section of the design doc's Components list (kanban board, detail panel, POT/version-tabs/actions, dropdown+init, `pipeline-calc.js` extraction) maps to Tasks 1-5; the mandatory empirical mount test (Global Constraint 7 / design doc's Testing section) is Task 6. The design's confirmed-dead-code omission (`showPipelineBoardView()`'s first definition) is explicitly verified absent in Task 5 Step 3.
- **Placeholder scan:** no TBD/TODO; every step has complete code or exact commands with expected output. Task 6's Step 4 is intentionally left as a documented judgment call (which capture approach to use) rather than a placeholder, since it depends on how Step 2 is finally structured when actually run — this mirrors how the two prior migrations' own mount-test scripts were iterated live rather than fully pre-specified, and is explicitly framed as "adjust based on" rather than "TBD."
- **Type consistency:** `pbGetVersionBudget`/`pbComputeColumnTotals`/`pbFmtMoney`/`pbFmtDate`/`pbFmtTaskDate`/`pbComputePotPercentages` (Task 1) are used with identical names and argument order in Tasks 2-4. `data().refreshTick`/`selectedCgId`/`selectedVerId` (Task 2) are read/written identically in Tasks 3-4. `computed.selectedCg`/`selectedVersion` (Task 3) are consumed unchanged by Task 4.
- **Known risk, flagged explicitly:** this is the largest migration in the roadmap so far (760-line source file + 369-line host page, vs. `project-config.html`'s ~700 lines and `portfolio.html`'s ~1050 lines post-fold-in) — comparable in scale, but with a genuinely new integration risk (the `_cgStore`/`refreshTick` reactivity pattern applied to a *shared* Vanilla store for the first time, rather than `config.projects` which `portfolio.html` already established the pattern for). Task 6's mount test is the primary safeguard; if it surfaces more than 2-3 distinct defect classes, consider dispatching a second, independent empirical-verification pass before the final review, matching how the `portfolio.html` cycle's Gate 3 code review needed a follow-up empirical pass beyond the first.
- **Two real bugs found and fixed during this self-review pass (not left for Task 6 to discover):**
  1. Task 4's version-tab dot color originally referenced `PB_STAGE_STYLE`/`pbGetStage` (top-level `const`/`function`, not `data()`/`computed`/`methods`) directly inside a template `:style` binding — the exact bare-global-in-template bug class fixed repeatedly in `portfolio.html`/`project-config.html` this month. Fixed by adding a `verStageBadgeColor(ver)` method (Task 4 Step 1) instead.
  2. A more fundamental timing bug: the kanban board's `stagesData` computed calls `js/lib/pipeline-calc.js`'s exports (a deferred ES module) unconditionally on the very first render, with no `dashboardReady`-style gate — unlike `portfolio.html`, where the equivalent lib-bridged calls only happen inside the dashboard view, never on the always-visible overview. Since classic scripts (including a bare top-level `Vue.createApp({...}).mount(...)`) always execute *before* any deferred module, this would throw `ReferenceError` and crash the app on every load. Fixed by wrapping the entire inline script in `document.addEventListener('DOMContentLoaded', ...)` (Global Constraint 7, Task 2 Step 3) — which the pre-migration `pipeline.html` already did and which this plan had initially dropped. This is a genuinely new defect class, distinct from anything found in the prior two migrations, and is exactly why Task 6's mount test must use the real `vue.global.js` build with realistic data rather than relying on this self-review alone — a self-review reads code, it doesn't execute a real script-loading timeline.
