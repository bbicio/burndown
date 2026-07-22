# `costgrid.html` Editor Vue 3 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `costgrid.html` (currently driven imperatively by `js/costgrid.js`'s `renderCgEditor()`/`renderCgVersionTabs()`/inline init script) as a single Vue 3 instance (CDN, no build step), 1:1 behavioral parity, plus two bundled bug fixes (Clone `duplicate key` error, New Proposal flow), following the pattern validated by `project-config.html`/`portfolio.html`/`pipeline.html`.

**Architecture:** Single `Vue.createApp({...}).mount('#costGridEditorSection')` instance owns the toolbar, version tabs, offer-details header form, role columns, task/phase rows, selection mode, and phasing panel. `js/costgrid.js` stays loaded as the shared library for `pipeline.html`/`planning.html` — every function those two pages call as a global keeps its exact signature and behavior. Three functions that today rebuild `#cgEditorBody`'s `innerHTML` imperatively — `renderCgEditor()`, `renderCgVersionTabs(cg)`, `showCostGridEditorView(cgId, versionId)` — are **redefined as thin bridge functions** that delegate into the mounted Vue instance (kept via a module-level `_cgVueApp` reference) instead of touching the DOM directly. This bridge is what lets the ~15 other "kept unchanged" functions in `js/costgrid.js` (`cgPublishDraft`, `cgCreateNewVersion`, `cgCloneGrid`, `cgGenerateProject`, `cgDoGenerateProject`, `cgAddSelectedRoles`, `cgAutoSave`, etc.) continue to work completely unmodified — they already call `renderCgEditor()`/`renderCgVersionTabs()`/`showCostGridEditorView()` at their tail exactly as before; only what those three functions *do* changes. `js/lib/costgrid-calc.js` (existing) gains a new `resolveRoleRate()` pure function (deduplicating the 3-tier rate-resolution logic currently repeated three times) plus relocated `cgComputeTaskTotals`/`cgComputePhaseTotals`/`cgComputeGrandTotals`/`cgComputeColumnTotals` (previously untested inline pure functions in `js/costgrid.js`, now vitest-covered ES module exports, window-bridged back to their exact original names so every existing caller — including `pipeline.html`'s detail panel — is unaffected) and a new `stripCloneTaskIds()` helper (Clone bug fix).

**Tech Stack:** Vue 3 (CDN, `vue.global.prod.js`), vanilla JS, vitest (for the `js/lib/costgrid-calc.js` extensions).

## Global Constraints

1. No build step — CDN Vue 3 only, matching every prior migration in this roadmap.
2. `js/costgrid.js` remains the shared library for `pipeline.html`/`planning.html` (both call into it as globals: `cgLoad`, `cgGetVersionLockState`, `cgComputeGrandTotals`, etc.) — this migration must not break those two pages' existing (unmodified) usage of it. Functions consumed cross-page must keep their current signatures/behavior.
3. `js/ratecards.js` stays loaded on `costgrid.html` only for its `loadRatecardsForDropdown()` cache helper — no ratecard admin modal exists on this page and none is introduced by this cycle.
4. All user-facing text stays in English (`CLAUDE.md` "Language constraint").
5. Cache-busting `?v=N` query params on modified shared scripts (`js/costgrid.js`, `js/lib/costgrid-calc.js`) must be bumped on every page that loads them (`costgrid.html`, `pipeline.html`, `planning.html`), per the pattern established in the `pipeline.html` cycle (commit `4f2e621`).
6. `/finish-cycle` is the mandatory terminal step (test gate → manual verification → `/code-review` → merge → `/sync-docs` + report) — never `superpowers:finishing-a-development-branch`.
7. **The bridge pattern is load-bearing.** `renderCgEditor()`, `renderCgVersionTabs(cg)`, and `showCostGridEditorView(cgId, versionId)` in `js/costgrid.js` are redefined (Task 2) to delegate to the mounted Vue instance via a module-level `_cgVueApp` reference, set once by the Vue app's own `created()` hook. Every other "kept unchanged" function in `js/costgrid.js` that calls one of these three at its tail (`cgPublishDraft`, `cgCreateNewVersion`, `cgCloneGrid`, `cgGenerateProject`, `cgExitSelectionMode`, `cgDoAddTasksToProject`, `cgDoGenerateProject`, `cgDeleteLinkedProject`, `cgAddSelectedRoles`) is thereby unaffected and requires **zero code changes** — do not "helpfully" rewrite these functions; the whole point of the bridge is that they don't need to change.
8. **DOM element `id`s/classes that "kept unchanged" functions read via `document.getElementById`/`querySelectorAll` must be preserved exactly in the new Vue template** — e.g. `#cgProjectName`/`#cgStartDate`/`#cgEndDate`/`#cgCurrency`/`#cgPipeline`/`#cgNote`/`#cgClientId`/`#cgRatecardId` (read by `cgSyncHeaderFromForm()`, called from `cgAutoSave()`), `#cgNewVersionLabel`/`#cgNewVersionError` (`cgCreateNewVersion()`), `#cgCloneGridName`/`#cgCloneError`/`#cgCloneSourceName` (`cgCloneGrid()`), `.cg-role-checkbox` with `data-label`/`data-rate` attributes (`cgAddSelectedRoles()`), `#btnCgSave` (`cgSaveVersion()`), `#cgAutoSaveToast` (`cgScheduleAutoSave()`). Since Vue's `v-model` keeps the real DOM element's `.value` live-synced to the reactive state on every keystroke, these `document.getElementById(...).value` reads inside unchanged functions continue to return the correct, current value — no DOM-reading logic needs to be ported to Vue for these specific fields.
9. `_cgDraft`/`_cgActiveCgId`/`_cgActiveVersionId` (module-level `let`s already in `js/costgrid.js`) remain the single source of truth that every kept-unchanged function reads/writes directly. The Vue instance's reactive `data().draft`/`data().cg` are refreshed via `this.resyncFromGlobals()` (called from the `renderCgEditor()`/`renderCgVersionTabs()` bridges) — a full `JSON.parse(JSON.stringify(...))` re-clone, not a shallow patch, matching the exact idiom `showCostGridEditorView()` already used pre-migration (`cgMigrateVersion(JSON.parse(JSON.stringify(version)))`). This mirrors Global Constraint 4 from the `pipeline.html` cycle's `_cgStore`/`refreshTick` pattern, applied here to `_cgDraft`/`draft` instead.
10. A dedicated empirical jsdom + real `vue.global.js` mount test (Task 8) is mandatory before the final whole-branch review — not optional, not deferred to post-merge browser testing alone.
11. The New Proposal bug fix (Task 7) must start with an executable characterization step (manual repro procedure with exact DevTools checks) before any code change — no fix is designed against an unconfirmed cause.

---

## File Structure

- Modify: `costgrid.html` (full rewrite of `<div id="costGridEditorSection">`'s contents into a Vue template; drops the old inline init script's DOM-wiring code; adds Vue 3 CDN script; removes 6 dead-modal `<div>` blocks + 3 now-unneeded `<script>` tags; keeps `#confirmModal`/`#jsonViewerModal`/`#cgNewGridModal`/`#cgNewVersionModal`/`#cgCloneModal`/`#cgRoleSelectModal`/`#cgAutoSaveToast` as static/Vue-triggered markup outside or inside the mount root as appropriate)
- Modify: `js/costgrid.js` (redefines `renderCgEditor()`/`renderCgVersionTabs(cg)`/`showCostGridEditorView(cgId, versionId)` as Vue bridges; deletes `cgBindEditorEvents`, `cgApplyEditorLock`, `cgRefreshTotals`, `cgRefreshPhaseDates`, `cgRenderRoleList`, `cgFindTask`, `openCgRoleSelectModal`'s DOM-manipulation body — all now dead or replaced by Vue; relocates `cgComputeTaskTotals`/`cgComputePhaseTotals`/`cgComputeGrandTotals`/`cgComputeColumnTotals` to `js/lib/costgrid-calc.js`, keeping `window.*` bridges of the same names; adds `stripCloneTaskIds()` call inside `cgCloneGrid()`)
- Modify: `js/lib/costgrid-calc.js` (adds `resolveRoleRate()`, `stripCloneTaskIds()`, relocated totals functions, all vitest-covered)
- Create: `js/lib/costgrid-calc.test.js` (vitest — new tests for the above; existing `versionHasFreeTasks`/`isVersionCommittedLocked` untested today, left as-is, out of scope)
- Modify: `planning.html` (removes the same 2 dead modals confirmed dead there — `#rolesModal`, `#roleModal` — and 3 now-unneeded `<script>` tags)
- Modify: `pipeline.html` (cache-bust bump only, Task 7's final step)

---

### Task 1: `js/lib/costgrid-calc.js` — rate resolution + totals extraction (TDD)

**Files:**
- Modify: `js/lib/costgrid-calc.js` (existing file, currently holds `versionHasFreeTasks`/`isVersionCommittedLocked` — untouched, only additions)
- Create: `js/lib/costgrid-calc.test.js`
- Modify: `js/costgrid.js:1696-1741` (delete the 4 now-relocated functions, no other change in this task)
- Modify: `costgrid.html`, `pipeline.html`, `planning.html` (bump `?v=` on `js/lib/costgrid-calc.js`)

**Interfaces:**
- Consumes: nothing from earlier tasks (this is the first task).
- Produces: `resolveRoleRate({ roleId, globalRate, currency, currencyRate, ratecardMap, ratecardOverrides, roleOverrides })` → `{ eurRate, effectiveRate, isOverride }`; `cgComputeTaskTotals(task, roles)` → `{ totalHrs, totalFee, totalCostAndFee }`; `cgComputePhaseTotals(phase, roles)` → `{ hrs, fee, ptc, byRole }`; `cgComputeGrandTotals(version)` → `{ hrs, fee, ptc }`; `cgComputeColumnTotals(version)` → `{ [roleCode]: { hrs, fee } }`. All five are consumed by Tasks 3-5 (Vue template computed properties) and remain callable as `window.*` globals for `pipeline.html`'s detail panel (unchanged call sites there).

- [ ] **Step 1: Write the failing tests for `resolveRoleRate`**

Create `js/lib/costgrid-calc.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  resolveRoleRate, cgComputeTaskTotals, cgComputePhaseTotals, cgComputeGrandTotals, cgComputeColumnTotals,
} from './costgrid-calc.js';

describe('resolveRoleRate', () => {
  it('returns the EUR baseline rate unchanged when currency is EUR', () => {
    const r = resolveRoleRate({ roleId: 5, globalRate: 100, currency: 'EUR', currencyRate: 1.0, ratecardMap: {}, ratecardOverrides: {}, roleOverrides: {} });
    expect(r).toEqual({ eurRate: 100, effectiveRate: 100, isOverride: false });
  });

  it('prefers the ratecard EUR rate over the global role rate', () => {
    const r = resolveRoleRate({ roleId: 5, globalRate: 100, currency: 'EUR', currencyRate: 1.0, ratecardMap: { '5': 120 }, ratecardOverrides: {}, roleOverrides: {} });
    expect(r).toEqual({ eurRate: 120, effectiveRate: 120, isOverride: false });
  });

  it('falls back to 0 when there is no ratecard entry and no global rate', () => {
    const r = resolveRoleRate({ roleId: 5, globalRate: undefined, currency: 'EUR', currencyRate: 1.0, ratecardMap: {}, ratecardOverrides: {}, roleOverrides: {} });
    expect(r.eurRate).toBe(0);
  });

  it('converts EUR to the target currency using currencyRate when no override exists', () => {
    const r = resolveRoleRate({ roleId: 5, globalRate: 100, currency: 'USD', currencyRate: 1.1, ratecardMap: {}, ratecardOverrides: {}, roleOverrides: {} });
    expect(r).toEqual({ eurRate: 100, effectiveRate: 110, isOverride: false });
  });

  it('rounds the converted rate to 2 decimals', () => {
    const r = resolveRoleRate({ roleId: 5, globalRate: 100, currency: 'USD', currencyRate: 1.005, ratecardMap: {}, ratecardOverrides: {}, roleOverrides: {} });
    expect(r.effectiveRate).toBe(100.5);
  });

  it('prefers the ratecard per-currency override over the computed conversion', () => {
    const r = resolveRoleRate({ roleId: 5, globalRate: 100, currency: 'USD', currencyRate: 1.1, ratecardMap: {}, ratecardOverrides: { '5': { USD: 216 } }, roleOverrides: {} });
    expect(r).toEqual({ eurRate: 100, effectiveRate: 216, isOverride: true });
  });

  it('prefers the ratecard override over the role-level override', () => {
    const r = resolveRoleRate({ roleId: 5, globalRate: 100, currency: 'USD', currencyRate: 1.1, ratecardMap: {}, ratecardOverrides: { '5': { USD: 216 } }, roleOverrides: { USD: 200 } });
    expect(r.effectiveRate).toBe(216);
  });

  it('falls back to the role-level override when there is no ratecard override', () => {
    const r = resolveRoleRate({ roleId: 5, globalRate: 100, currency: 'USD', currencyRate: 1.1, ratecardMap: {}, ratecardOverrides: {}, roleOverrides: { USD: 200 } });
    expect(r).toEqual({ eurRate: 100, effectiveRate: 200, isOverride: true });
  });

  it('treats a missing ratecardOverrides/roleOverrides entry for this role as absent, not throwing', () => {
    const r = resolveRoleRate({ roleId: 9, globalRate: 50, currency: 'GBP', currencyRate: 0.85, ratecardMap: {}, ratecardOverrides: {}, roleOverrides: {} });
    expect(r.effectiveRate).toBe(42.5);
  });
});

describe('cgComputeTaskTotals', () => {
  it('sums hours × rate across roles and adds ptc to the cost total', () => {
    const task = { hours: { PM: 10, DEV: 5 }, ptc: 100 };
    const roles = [{ roleCode: 'PM', rate: 100 }, { roleCode: 'DEV', rate: 80 }];
    expect(cgComputeTaskTotals(task, roles)).toEqual({ totalHrs: 15, totalFee: 1400, totalCostAndFee: 1500 });
  });

  it('treats a missing hours entry as 0', () => {
    const task = { hours: {}, ptc: 0 };
    const roles = [{ roleCode: 'PM', rate: 100 }];
    expect(cgComputeTaskTotals(task, roles)).toEqual({ totalHrs: 0, totalFee: 0, totalCostAndFee: 0 });
  });

  it('rounds totalHrs to 2 decimals', () => {
    const task = { hours: { PM: 0.1, DEV: 0.2 }, ptc: 0 };
    const roles = [{ roleCode: 'PM', rate: 0 }, { roleCode: 'DEV', rate: 0 }];
    expect(cgComputeTaskTotals(task, roles).totalHrs).toBe(0.3);
  });
});

describe('cgComputePhaseTotals', () => {
  it('aggregates task totals and per-role hours across the phase', () => {
    const phase = {
      tasks: [
        { hours: { PM: 10 }, ptc: 50 },
        { hours: { PM: 5, DEV: 2 }, ptc: 0 },
      ],
    };
    const roles = [{ roleCode: 'PM', rate: 100 }, { roleCode: 'DEV', rate: 80 }];
    expect(cgComputePhaseTotals(phase, roles)).toEqual({ hrs: 17, fee: 1660, ptc: 50, byRole: { PM: 15, DEV: 2 } });
  });

  it('returns zeroed totals for a phase with no tasks', () => {
    const roles = [{ roleCode: 'PM', rate: 100 }];
    expect(cgComputePhaseTotals({ tasks: [] }, roles)).toEqual({ hrs: 0, fee: 0, ptc: 0, byRole: { PM: 0 } });
  });
});

describe('cgComputeGrandTotals', () => {
  it('sums phase totals across the whole version', () => {
    const version = {
      roles: [{ roleCode: 'PM', rate: 100 }],
      phases: [
        { tasks: [{ hours: { PM: 10 }, ptc: 0 }] },
        { tasks: [{ hours: { PM: 5 }, ptc: 20 }] },
      ],
    };
    expect(cgComputeGrandTotals(version)).toEqual({ hrs: 15, fee: 1500, ptc: 20 });
  });
});

describe('cgComputeColumnTotals', () => {
  it('returns per-role hrs/fee totals across all phases', () => {
    const version = {
      roles: [{ roleCode: 'PM', rate: 100 }, { roleCode: 'DEV', rate: 50 }],
      phases: [
        { tasks: [{ hours: { PM: 3 } }] },
        { tasks: [{ hours: { PM: 2, DEV: 4 } }] },
      ],
    };
    expect(cgComputeColumnTotals(version)).toEqual({ PM: { hrs: 5, fee: 500 }, DEV: { hrs: 4, fee: 200 } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- costgrid-calc`
Expected: FAIL — `resolveRoleRate`/`cgComputeTaskTotals`/etc. are not exported from `./costgrid-calc.js` yet.

- [ ] **Step 3: Add the implementation to `js/lib/costgrid-calc.js`**

Read the existing file first (it must keep `versionHasFreeTasks`/`isVersionCommittedLocked` and their `window.*` bridges unchanged), then append:

```js
// ── RATE RESOLUTION ──────────────────────────────────────────────────────────
// Deduplicates the 3-tier rate chain (ratecard per-currency override → role-level
// per-currency override → EUR baseline × live exchange rate) that was previously
// repeated, slightly differently, in cgSyncRoleRatesToBaseline, cgPreviewRateChange,
// and the role-selector list's rate badge.
export function resolveRoleRate({ roleId, globalRate, currency, currencyRate, ratecardMap = {}, ratecardOverrides = {}, roleOverrides = {} }) {
  const rid = String(roleId);
  const ratecardEurRate = ratecardMap[rid];
  const eurRate = ratecardEurRate !== undefined ? ratecardEurRate : (globalRate || 0);
  if (currency === 'EUR') {
    return { eurRate, effectiveRate: eurRate, isOverride: false };
  }
  const ratecardOverride = (ratecardOverrides[rid] || {})[currency];
  const roleOverride = roleOverrides ? roleOverrides[currency] : undefined;
  if (ratecardOverride != null) return { eurRate, effectiveRate: ratecardOverride, isOverride: true };
  if (roleOverride != null) return { eurRate, effectiveRate: roleOverride, isOverride: true };
  const converted = Math.round(eurRate * (currencyRate || 1) * 100) / 100;
  return { eurRate, effectiveRate: converted, isOverride: false };
}

// ── TOTALS (relocated verbatim from js/costgrid.js:1696-1741) ────────────────
export function cgComputeTaskTotals(task, roles) {
  let totalHrs = 0, totalFee = 0;
  (roles || []).forEach(r => {
    const h = parseFloat(task.hours[r.roleCode]) || 0;
    totalHrs += h;
    totalFee += h * (r.rate || 0);
  });
  const ptc = parseFloat(task.ptc) || 0;
  return { totalHrs: Math.round(totalHrs * 100) / 100, totalFee, totalCostAndFee: totalFee + ptc };
}

export function cgComputePhaseTotals(phase, roles) {
  let hrs = 0, fee = 0, ptc = 0;
  const byRole = {};
  (roles || []).forEach(r => { byRole[r.roleCode] = 0; });
  (phase.tasks || []).forEach(task => {
    const tt = cgComputeTaskTotals(task, roles);
    hrs += tt.totalHrs;
    fee += tt.totalFee;
    ptc += parseFloat(task.ptc) || 0;
    (roles || []).forEach(r => { byRole[r.roleCode] = (byRole[r.roleCode] || 0) + (parseFloat(task.hours[r.roleCode]) || 0); });
  });
  return { hrs: Math.round(hrs * 100) / 100, fee, ptc, byRole };
}

export function cgComputeGrandTotals(version) {
  let hrs = 0, fee = 0, ptc = 0;
  (version.phases || []).forEach(ph => {
    const pt = cgComputePhaseTotals(ph, version.roles);
    hrs += pt.hrs; fee += pt.fee; ptc += pt.ptc;
  });
  return { hrs: Math.round(hrs * 100) / 100, fee, ptc };
}

export function cgComputeColumnTotals(version) {
  const result = {};
  (version.roles || []).forEach(r => { result[r.roleCode] = { hrs: 0, fee: 0 }; });
  (version.phases || []).forEach(ph => (ph.tasks || []).forEach(task => {
    (version.roles || []).forEach(r => {
      const h = parseFloat(task.hours[r.roleCode]) || 0;
      result[r.roleCode].hrs = Math.round((result[r.roleCode].hrs + h) * 100) / 100;
      result[r.roleCode].fee += h * (r.rate || 0);
    });
  }));
  return result;
}

window.resolveRoleRate = resolveRoleRate;
window.cgComputeTaskTotals = cgComputeTaskTotals;
window.cgComputePhaseTotals = cgComputePhaseTotals;
window.cgComputeGrandTotals = cgComputeGrandTotals;
window.cgComputeColumnTotals = cgComputeColumnTotals;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- costgrid-calc`
Expected: PASS (all new tests, plus no regression on any pre-existing test file in the repo).

- [ ] **Step 5: Delete the now-relocated functions from `js/costgrid.js`**

In `js/costgrid.js`, delete lines 1696-1741 (the original `cgComputeTaskTotals`/`cgComputePhaseTotals`/`cgComputeGrandTotals`/`cgComputeColumnTotals` definitions) — the `window.*` bridge from Step 3 now supplies these same names as globals. Leave the `// ── CALCULATIONS ──` comment header in place; the relocated functions leave that section empty except for `cgComputePhasing` (`:1747+`), which stays untouched (that function computes month-by-month phasing for the phasing panel, not role/task/phase totals, and is not part of this task's extraction).

- [ ] **Step 6: Confirm no other file defines these names, then run the full test suite**

```bash
grep -n "^function cgComputeTaskTotals\|^function cgComputePhaseTotals\|^function cgComputeGrandTotals\|^function cgComputeColumnTotals" js/costgrid.js
```
Expected: no matches (all four deleted from `js/costgrid.js` in Step 5; they now live only in `js/lib/costgrid-calc.js`, bridged onto the same `window.*` names).

```bash
npm test
```
Expected: PASS (all files).

- [ ] **Step 7: Bump the cache-busting version on `js/lib/costgrid-calc.js`**

In `costgrid.html`, `pipeline.html`, and `planning.html`, find:
```html
<script type="module" src="js/lib/costgrid-calc.js?v=1"></script>
```
Replace with:
```html
<script type="module" src="js/lib/costgrid-calc.js?v=2"></script>
```
(all three pages load this module; the version bump must be applied to all three so no page serves a stale cached copy missing the new exports).

- [ ] **Step 8: Commit**

```bash
git add js/lib/costgrid-calc.js js/lib/costgrid-calc.test.js js/costgrid.js costgrid.html pipeline.html planning.html
git commit -m "feat(costgrid): extract resolveRoleRate + relocate totals functions into js/lib/costgrid-calc.js"
```

---

### Task 2: Vue skeleton, bridge functions, page init, toolbar, version tabs, offer-details header form

**Files:**
- Modify: `costgrid.html` (full file — adds Vue 3 CDN script; replaces `<div id="costGridEditorSection">`'s contents with a Vue template; replaces the bottom inline `<script>` block entirely)
- Modify: `js/costgrid.js:184-201` (`showCostGridEditorView`), `js/costgrid.js:333-360` (`renderCgVersionTabs`), `js/costgrid.js:367-887` (`renderCgEditor` — becomes a one-line bridge; its markup-building body is deleted, its logic is ported into the Vue template/methods added by this and later tasks)

**Interfaces:**
- Consumes: `js/lib/costgrid-calc.js`'s `cgComputeGrandTotals`, `cgComputeColumnTotals` (Task 1). Global functions from `js/costgrid.js`/`js/core.js`/`js/api-sync.js`: `cgLoad`, `cgSave`, `cgMigrateVersion`, `cgLoadStructureFromApi`, `cgSyncFromApi`, `cgUpdateActiveRatecardMap`, `cgGetVersionLockState`, `cgAutoSave`, `cgSaveVersion`, `cgPublishDraft`, `cgConfirmDeleteVersion`, `cgCreateNewVersion`, `cgCloneGrid`, `cgExportXls`, `cgGenerateProject`, `esc`, `getClients`, `showConfirm`.
- Produces: `data().cgId`/`verId`/`cg`/`draft`/`loading`/`loadError` (consumed by every later task); `methods.resyncFromGlobals()` (the bridge target, consumed by Tasks 3-7's kept-unchanged global functions indirectly via `renderCgEditor()`); `methods.openVersion(cgId, versionId)` (consumed by version-tab clicks and by the `showCostGridEditorView` bridge); `computed.lockState`/`isDraft`/`isLocked`/`grand`/`colTotals` (consumed by Tasks 3-5's template bindings); module-level `_cgVueApp` in `js/costgrid.js` (the bridge wire, set once in `created()`).

- [ ] **Step 1: Add the Vue 3 CDN script to `costgrid.html`'s script list**

Find (current script list, `costgrid.html:277-291`):

```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<script src="js/api.js?v=3"></script>
<script src="js/core.js?v=3"></script>
<script src="js/settings.js"></script>
<script src="js/notifications.js"></script>
<script src="js/roles.js"></script>
<script src="js/clients.js"></script>
<script src="js/programs.js"></script>
<script type="module" src="js/lib/cfg-parse.js?v=1"></script>
<script type="module" src="js/lib/costgrid-calc.js?v=2"></script>
<script src="js/costgrid.js?v=25"></script>
<script src="js/api-sync.js?v=14"></script>
<script src="js/ratecards.js"></script>
<script src="js/nav.js?v=4"></script>
```

Replace with (adds Vue CDN before `js/api.js`; `js/roles.js`/`js/clients.js`/`js/programs.js` stay for now — removed in Task 6 once their dead-modal consumers are deleted):

```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script src="js/api.js?v=3"></script>
<script src="js/core.js?v=3"></script>
<script src="js/settings.js"></script>
<script src="js/notifications.js"></script>
<script src="js/roles.js"></script>
<script src="js/clients.js"></script>
<script src="js/programs.js"></script>
<script type="module" src="js/lib/cfg-parse.js?v=1"></script>
<script type="module" src="js/lib/costgrid-calc.js?v=2"></script>
<script src="js/costgrid.js?v=26"></script>
<script src="js/api-sync.js?v=14"></script>
<script src="js/ratecards.js"></script>
<script src="js/nav.js?v=4"></script>
```

(the `js/costgrid.js` version bump to `?v=26` reflects Step 2/3's edits, made now so it's not forgotten later.)

- [ ] **Step 2: Redefine `showCostGridEditorView`/`renderCgVersionTabs`/`renderCgEditor` in `js/costgrid.js` as Vue bridges**

Find (`js/costgrid.js:184-201`):

```js
async function showCostGridEditorView(cgId, versionId) {
  const cg = cgLoad(cgId);
  if (!cg) return;
  const version = cg.versions.find(v => v.versionId === versionId);
  if (!version) return;
  _cgActiveCgId            = cgId;
  _cgActiveVersionId       = versionId;
  _cgDraft                 = cgMigrateVersion(JSON.parse(JSON.stringify(version)));
  _cgOfferDetailsCollapsed = false;
  _cgSummaryCollapsed      = false;
  cgHideAll();
  document.getElementById('costGridEditorSection').style.display = 'block';
  updateNavState('pipelineboard');
  document.getElementById('cgEditorTitle').textContent = cg.name;
  renderCgVersionTabs(cg);
  await cgUpdateActiveRatecardMap();
  renderCgEditor();
}
```

Replace with:

```js
// Bridge to the mounted Vue instance on costgrid.html (set once by its created() hook).
// On pipeline.html this global is redefined again, further down that page's own script,
// as a plain redirect — that override still wins there exactly as it did before this migration.
let _cgVueApp = null;

async function showCostGridEditorView(cgId, versionId) {
  if (_cgVueApp) { await _cgVueApp.openVersion(cgId, versionId); return; }
  // No mounted Vue app (e.g. this global was called before mount, or from a page that
  // never sets _cgVueApp) — nothing to do; every real caller on costgrid.html runs after mount.
}
```

Find (`js/costgrid.js:333-360`):

```js
function renderCgVersionTabs(cg) {
  const container = document.getElementById('cgVersionTabs');
  container.innerHTML = '';
  cg.versions.forEach(v => {
    const isActive   = v.versionId === _cgActiveVersionId;
    const projCount  = (v.linkedProjects || []).length;
    const badge      = cgLiveVersionBadge(v);
    const lockState  = cgGetVersionLockState(cg.id, v.versionId);
    const lockIcon   = lockState.locked ? ' 🔒' : '';
    const countBadge = projCount > 0 ? ` (${projCount})` : '';
    const btn = document.createElement('button');
    btn.className = `btn btn-sm ${isActive ? 'btn-primary' : 'btn-outline-secondary'}`;
    btn.style.fontSize = '.85rem';
    btn.textContent = v.versionLabel + badge.icon + countBadge + lockIcon;
    if (lockState.locked) btn.title = lockState.message;
    btn.addEventListener('click', async () => {
      if (isActive) return;
      cgAutoSave();
      await cgLoadStructureFromApi(cg.id, v.versionId);
      showCostGridEditorView(cg.id, v.versionId);
      // Keep URL in sync so a refresh reopens the same version
      const url = new URL(window.location.href);
      url.searchParams.set('verId', v.versionId);
      window.history.replaceState(null, '', url.toString());
    });
    container.appendChild(btn);
  });
}
```

Replace with:

```js
function renderCgVersionTabs(cg) {
  if (_cgVueApp) _cgVueApp.cg = cg ? JSON.parse(JSON.stringify(cg)) : null;
}
```

(the version-tab **buttons themselves** — click handler, active/lock/badge styling — are now a Vue `v-for` in the template, added by this task's Step 3; `cgLiveVersionBadge`/`cgGetVersionLockState` are still called, just from a Vue computed instead of from here.)

Find (`js/costgrid.js:367-887`, the entire `renderCgEditor()` function body — starts at `function renderCgEditor() {` and ends at the matching closing `}` right after `cgBindEditorEvents(body); if (isLocked) cgApplyEditorLock(body);`). Replace the **entire function** with:

```js
function renderCgEditor() {
  if (_cgVueApp) _cgVueApp.resyncFromGlobals();
}
```

Leave `cgApplyEditorLock`, `cgBindEditorEvents`, `cgRefreshTotals`, `cgRefreshPhaseDates`, and `cgRenderRoleList` in place for now (they become unreachable dead code the moment `renderCgEditor()` stops calling them, but deleting their definitions is deferred to Task 6's Step 5 dead-code cleanup, once every task that needed to read their logic as a porting reference has run — deleting them now, before Tasks 3-5 have ported their logic into Vue, would remove the reference material mid-plan).

- [ ] **Step 3: Replace `<div id="costGridEditorSection">`'s contents with the Vue template**

In `costgrid.html`, find (current lines 17-44):

```html
<div id="costGridEditorSection" class="app-container">
  <div class="page-title-bar">
    <h4 class="fw-bold mb-0" id="cgEditorTitle">Cost Grid</h4>
  </div>
  <div class="page-toolbar mb-2">
    <div class="page-toolbar-left">
      <button class="btn btn-outline-secondary btn-sm" id="btnCgEditorBack">← Pipeline</button>
    </div>
    <div class="page-toolbar-right">
      <button class="btn btn-sm btn-outline-danger" id="btnCgDeleteVersion" style="display:none" title="Delete this Draft version">🗑 Delete version</button>
      <button class="btn btn-sm btn-primary" id="btnCgPublish" style="display:none">🚀 Publish to SIP →</button>
      <button class="btn btn-sm btn-primary" id="btnCgNewVersion">+ New version</button>
      <button class="btn btn-sm btn-outline-secondary" id="btnCgCloneVersion" title="Clone this version as a new proposal">⧉ Clone</button>
      <button class="btn btn-sm btn-outline-secondary" id="btnCgExportXls">⬇ Export XLS</button>
      <button class="btn btn-sm btn-outline-secondary" id="btnCgGenerateProject" title="Generate project in SIP">🚀 Generate Project</button>
      <button class="btn btn-sm btn-primary" id="btnCgSave">💾 Save</button>
    </div>
  </div>
  <!-- Version tabs -->
  <div class="d-flex align-items-center gap-2 mb-3 flex-wrap">
    <span class="small text-muted">Version:</span>
    <div id="cgVersionTabs" class="d-flex gap-1 flex-wrap"></div>
  </div>
  <!-- Editor body -->
  <div id="cgEditorBody"></div>
  <!-- Phasing panel (rendered below the structure table) -->
  <div id="cgPhasingPanel" style="display:none;margin-top:2rem"></div>
</div>
```

Replace with:

```html
<div id="costGridEditorSection" class="app-container">
  <div v-if="loading" class="d-flex justify-content-center align-items-center" style="height:60vh">
    <div class="spinner-border text-secondary"></div>
  </div>
  <div v-else-if="loadError" class="alert alert-danger m-4">
    {{ loadError }} <a href="/pipeline.html">← Back to Pipeline</a>
  </div>
  <template v-else>
    <div class="page-title-bar">
      <h4 class="fw-bold mb-0">{{ cg?.name || 'Cost Grid' }}</h4>
    </div>
    <div class="page-toolbar mb-2">
      <div class="page-toolbar-left">
        <button class="btn btn-outline-secondary btn-sm" @click="goBack" :disabled="backSaving">{{ backSaving ? '💾 Saving…' : '← Pipeline' }}</button>
      </div>
      <div class="page-toolbar-right">
        <button v-if="isDraft" class="btn btn-sm btn-outline-danger" @click="deleteVersion" title="Delete this Draft version">🗑 Delete version</button>
        <button v-if="isDraft" class="btn btn-sm btn-primary" @click="publishDraft">🚀 Publish to SIP →</button>
        <button v-if="isDraft" class="btn btn-sm btn-primary" @click="openNewVersionModal">+ New version</button>
        <button class="btn btn-sm btn-outline-secondary" @click="openCloneModal" title="Clone this version as a new proposal">⧉ Clone</button>
        <button class="btn btn-sm btn-outline-secondary" @click="exportXls">⬇ Export XLS</button>
        <button v-if="!isLocked && !isDraft && hasFreeTasks" class="btn btn-sm btn-outline-secondary" @click="generateProject" title="Generate project in SIP">🚀 Generate Project</button>
        <button id="btnCgSave" class="btn btn-sm btn-primary" @click="saveVersion">💾 Save</button>
      </div>
    </div>
    <!-- Version tabs -->
    <div v-if="cg && cg.versions.length > 1" class="d-flex align-items-center gap-2 mb-3 flex-wrap">
      <span class="small text-muted">Version:</span>
      <div class="d-flex gap-1 flex-wrap">
        <button v-for="v in cg.versions" :key="v.versionId"
          class="btn btn-sm" :class="v.versionId === verId ? 'btn-primary' : 'btn-outline-secondary'"
          style="font-size:.85rem" :title="versionTabTitle(v)" @click="switchVersion(v.versionId)">
          {{ versionTabLabel(v) }}
        </button>
      </div>
    </div>

    <div v-if="isLocked" class="alert mb-3 py-2 px-3 d-flex align-items-center gap-2"
         style="background:var(--color-warning-bg);border:1px solid #ffc107;border-radius:var(--radius-sm);font-size:var(--text-base)">
      <span>🔒</span>
      <span class="fw-semibold">{{ lockState.message }}</span>
    </div>
    <div v-else-if="isDraft" class="alert mb-3 py-2 px-3 d-flex align-items-center justify-content-between gap-2"
         style="background:#f8f9fa;border:1px solid #adb5bd;border-radius:var(--radius-sm);font-size:var(--text-base)">
      <div class="d-flex align-items-center gap-2">
        <span>✏️</span>
        <span class="fw-semibold">Draft — private to you. Publish to make it visible in the shared pipeline.</span>
      </div>
    </div>

    <!-- Editor body -->
    <div id="cgEditorBody">
      <!-- Header form -->
      <div class="section-card mb-3">
        <div class="section-header d-flex align-items-center" style="cursor:pointer;user-select:none" @click="offerDetailsCollapsed = !offerDetailsCollapsed">
          <span style="font-size:var(--text-sm);margin-right:6px;color:var(--text-muted)">{{ offerDetailsCollapsed ? '▶' : '▼' }}</span>
          <span>📄 Offer details</span>
          <span v-if="offerDetailsCollapsed" class="text-muted ms-3" style="font-size:var(--text-base);font-weight:400">{{ offerDetailsSummary }}</span>
        </div>
        <div v-show="!offerDetailsCollapsed" class="p-3">
          <div class="row g-2 align-items-end mb-2">
            <div class="col-md-4">
              <label class="form-label small fw-semibold mb-1">Project name</label>
              <input type="text" class="form-control" id="cgProjectName" v-model="draft.projectName" placeholder="Project name" @change="onHeaderFieldChange">
            </div>
            <div class="col-md-2">
              <label class="form-label small fw-semibold mb-1">Start</label>
              <input type="month" class="form-control" id="cgStartDate" v-model="startDateInput" @change="onHeaderFieldChange">
            </div>
            <div class="col-md-2">
              <label class="form-label small fw-semibold mb-1">End</label>
              <input type="month" class="form-control" id="cgEndDate" v-model="endDateInput" @change="onHeaderFieldChange">
            </div>
            <div class="col-md-2">
              <label class="form-label small fw-semibold mb-1">Currency</label>
              <select class="form-select" id="cgCurrency" v-model="draft.currency" @change="onCurrencyChange">
                <option v-for="cu in (currencies.length ? currencies : [{code:'EUR',symbol:'€',name:'Euro'}])" :key="cu.code" :value="cu.code">{{ cu.symbol }} {{ cu.code }} — {{ cu.name }}</option>
              </select>
            </div>
            <div class="col-md-2">
              <label class="form-label small fw-semibold mb-1">Pipeline stage</label>
              <div v-if="isDraft" class="form-control-plaintext ps-2 fw-semibold" style="font-size:var(--text-md);color:#6c757d">✏️ Draft</div>
              <select v-else class="form-select" id="cgPipeline" v-model="draft.pipeline" @change="onPipelineChange">
                <option v-for="p in ['SIP','Expected','Anticipated','Committed','Canceled']" :key="p" :value="p">{{ p }}</option>
              </select>
            </div>
          </div>
          <div class="row g-2 mt-1 align-items-end">
            <div class="col-md-6">
              <label class="form-label small fw-semibold mb-1">Client</label>
              <div class="d-flex gap-2">
                <select class="form-select form-select-sm" id="cgClientId" v-model="draft.clientId" @change="onClientChange">
                  <option v-for="c in clients" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
                <button type="button" class="btn btn-outline-secondary btn-sm flex-shrink-0" onclick="showClientsModal()" style="white-space:nowrap">+ New</button>
              </div>
            </div>
            <div class="col-md-6" id="cgRatecardCol">
              <label class="form-label small fw-semibold mb-1">Rate card <span class="text-muted fw-normal">(optional)</span></label>
              <select class="form-select form-select-sm" id="cgRatecardId" v-model="ratecardIdInput" @change="onRatecardChange">
                <option value="">— None (use global role rates) —</option>
                <option v-for="rc in filteredRatecards" :key="rc.id" :value="String(rc.id)">{{ rc.client_name ? rc.name + ' (' + rc.client_name + ')' : rc.name }}</option>
              </select>
            </div>
          </div>
          <div class="row g-2">
            <div class="col-12">
              <label class="form-label small fw-semibold mb-1">Notes</label>
              <textarea class="form-control" id="cgNote" v-model="draft.note" rows="3" placeholder="Notes, conditions, scope of work…" @change="onHeaderFieldChange"></textarea>
            </div>
          </div>

          <div v-if="(draft.linkedProjects || []).length" class="mt-3 pt-2 border-top">
            <div class="small fw-semibold text-muted mb-2">🔗 Linked projects ({{ draft.linkedProjects.length }})</div>
            <div class="d-flex flex-wrap gap-2">
              <div v-for="lp in linkedProjectDisplay" :key="lp.currentProjId" class="border rounded p-2" style="font-size:var(--text-sm);background:var(--surface-light);min-width:220px">
                <div class="d-flex align-items-start justify-content-between gap-2">
                  <div class="flex-grow-1 min-width-0">
                    <div class="fw-semibold text-truncate">{{ lp.pname }}</div>
                    <div v-if="lp.pcode" style="font-size:var(--text-xs);color:var(--text-muted);font-family:'SFMono-Regular',monospace">{{ lp.pcode }}</div>
                    <div class="d-flex gap-1 flex-wrap mt-1">
                      <span v-html="pipelineBadge(lp.ppipe)"></span>
                      <span v-html="statusBadgeLarge(lp.pstatus)"></span>
                    </div>
                    <div v-if="lp.taskNames.length" style="font-size:var(--text-xs);color:var(--text-muted);margin-top:5px"><span style="font-weight:600">Tasks:</span> {{ lp.taskNames.join(', ') }}</div>
                  </div>
                  <button v-if="lp.hasProj" class="btn btn-xs btn-outline-secondary flex-shrink-0" @click="openLinkedProject(lp.currentProjId)" style="font-size:var(--text-xs);white-space:nowrap">📊 Portfolio</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Grid table: Task 3 (role columns) + Task 4 (task/phase rows/selection bar) -->
      <div id="cgGridPlaceholder"></div>
    </div>

    <!-- Phasing panel: Task 5 -->
    <div id="cgPhasingPanelPlaceholder"></div>
  </template>
</div>
```

- [ ] **Step 4: Write the Vue app skeleton**

Find the existing bottom inline `<script>` block (`costgrid.html:293-507`) and replace its **entire contents** with:

```html
<script>
document.addEventListener('DOMContentLoaded', () => {

function updateNavState() {}
function cgHideAll() {}

Vue.createApp({
  data() {
    return {
      cgId: null, verId: null,
      cg: null, draft: null,
      loading: true, loadError: null,
      clients: [], currencies: [],
      ratecardMap: {}, ratecardOverrides: {}, isClientRatecard: false, allRatecards: [],
      offerDetailsCollapsed: false, summaryCollapsed: false,
      selectionMode: false, selectedTaskIds: new Set(),
      backSaving: false,
      newVersionLabel: '', newVersionError: '',
      cloneGridName: '', cloneError: '', cloneSourceName: '',
      prevCurrency: 'EUR', // last-committed currency, used by Task 5's onCurrencyChange to detect+revert a change
    };
  },
  computed: {
    lockState() {
      this.cg; // reactive dependency — see Global Constraint 9
      if (!this.cgId || !this.verId) return { locked: false, reason: '', message: '' };
      return cgGetVersionLockState(this.cgId, this.verId);
    },
    isLocked() { return this.lockState.locked; },
    isDraft() { return this.draft?.pipeline === 'Draft'; },
    hasFreeTasks() {
      if (!this.draft) return false;
      const assignedIds = cgGetAssignedTaskIds();
      const assignedNames = cgGetAssignedTaskNames();
      return (this.draft.phases || []).flatMap(ph => ph.tasks).some(t =>
        t.taskName?.trim() && !assignedIds.has(t.taskId) && !assignedNames.has(t.taskName.trim().toLowerCase())
      );
    },
    grand() { return this.draft ? cgComputeGrandTotals(this.draft) : { hrs: 0, fee: 0, ptc: 0 }; },
    colTotals() { return this.draft ? cgComputeColumnTotals(this.draft) : {}; },
    offerDetailsSummary() {
      const v = this.draft; if (!v) return '';
      return `${v.projectName || ''}${v.startDate ? '  ·  ' + v.startDate.slice(0,4)+'/'+v.startDate.slice(4,6) : ''}${v.endDate ? ' – ' + v.endDate.slice(0,4)+'/'+v.endDate.slice(4,6) : ''}  ·  ${v.currency || 'EUR'}`;
    },
    startDateInput: {
      get() { return this.draft?.startDate ? this.draft.startDate.slice(0,4)+'-'+this.draft.startDate.slice(4,6) : ''; },
      set(val) { if (this.draft) this.draft.startDate = val ? val.replace('-','') : ''; },
    },
    endDateInput: {
      get() { return this.draft?.endDate ? this.draft.endDate.slice(0,4)+'-'+this.draft.endDate.slice(4,6) : ''; },
      set(val) { if (this.draft) this.draft.endDate = val ? val.replace('-','') : ''; },
    },
    ratecardIdInput: {
      get() { return this.draft?.ratecardId ? String(this.draft.ratecardId) : ''; },
      set(val) { if (this.draft) this.draft.ratecardId = val || null; },
    },
    filteredRatecards() {
      const clientId = this.draft?.clientId && this.draft.clientId !== '__unassigned__' ? String(this.draft.clientId) : null;
      return this.allRatecards.filter(rc => rc.client_id == null || (clientId && String(rc.client_id) === clientId));
    },
    linkedProjectDisplay() {
      if (!this.draft) return [];
      const pipeline = this.draft.pipeline || 'SIP';
      return (this.draft.linkedProjects || []).map(lp => {
        let proj = (config.projects || []).find(p => p.id === lp.projectId);
        if (!proj) {
          proj = (config.projects || []).find(p => p.costGridRef?.cgId === this.cgId && p.costGridRef?.versionId === this.verId);
        }
        const currentProjId = proj?.id || lp.projectId;
        const resolvedTaskNames = (lp.taskIds || []).map(tid => {
          for (const ph of this.draft.phases || []) {
            const t = ph.tasks.find(t => t.taskId === tid);
            if (t?.taskName?.trim()) return t.taskName.trim();
          }
          return null;
        }).filter(Boolean);
        return {
          currentProjId,
          pname: lp.projectName || proj?.name || lp.projectId,
          pcode: proj?.code || '',
          pstatus: proj?.status || '',
          ppipe: (typeof getProjectPipeline === 'function' ? getProjectPipeline(currentProjId) : null) || pipeline,
          taskNames: resolvedTaskNames.length ? resolvedTaskNames : (lp.taskNames || []),
          hasProj: !!proj,
        };
      });
    },
  },
  methods: {
    esc, pipelineBadge, statusBadgeLarge, cgScheduleAutoSave,
    versionTabLabel(v) {
      const badge = cgLiveVersionBadge(v);
      const projCount = (v.linkedProjects || []).length;
      const lockState = cgGetVersionLockState(this.cgId, v.versionId);
      return v.versionLabel + badge.icon + (projCount > 0 ? ` (${projCount})` : '') + (lockState.locked ? ' 🔒' : '');
    },
    versionTabTitle(v) {
      const lockState = cgGetVersionLockState(this.cgId, v.versionId);
      return lockState.locked ? lockState.message : '';
    },
    resyncFromGlobals() {
      // `this.draft` and `_cgDraft` are kept as the SAME object reference (see openVersion) —
      // every kept-unchanged global mutates _cgDraft's fields in place, which Vue's v-model
      // reads/writes go through too. Re-cloning `this.draft` here would silently break that
      // invariant (cgAutoSave() would then keep saving a stale snapshot of the FIRST clone
      // forever, since it reads `_cgDraft` directly, not `this.draft`). What raw external
      // mutation *doesn't* get automatically is a re-render trigger (Vue's reactivity fires
      // only on writes that go through its own proxy) — $forceUpdate() supplies that without
      // touching the reference. See Global Constraint 9.
      if (_cgActiveCgId) this.cg = cgLoad(_cgActiveCgId);
      this.selectionMode = _cgSelectionMode;
      this.selectedTaskIds = new Set(_cgSelectedTaskIds);
      this.$forceUpdate();
    },
    async openVersion(cgId, versionId) {
      this.loading = true; this.loadError = null;
      let cgRec = cgLoad(cgId);
      if (!cgRec) { this.loadError = 'Cost grid not found or access denied.'; this.loading = false; return; }
      let resolvedVerId = versionId;
      if (!cgRec.versions.find(v => v.versionId === resolvedVerId)) {
        resolvedVerId = cgRec.versions[0]?.versionId;
        if (!resolvedVerId) { this.loadError = 'Version not found.'; this.loading = false; return; }
      }
      await cgLoadStructureFromApi(cgId, resolvedVerId);
      cgRec = cgLoad(cgId);
      const version = cgRec.versions.find(v => v.versionId === resolvedVerId);
      if (!version) { this.loadError = 'Version not found.'; this.loading = false; return; }

      this.cgId = cgId; this.verId = resolvedVerId;
      _cgActiveCgId = cgId; _cgActiveVersionId = resolvedVerId;
      _cgDraft = cgMigrateVersion(JSON.parse(JSON.stringify(version)));
      _cgSelectionMode = false; _cgSelectedTaskIds = new Set();
      this.offerDetailsCollapsed = false; this.summaryCollapsed = false;
      this.cg = cgRec;
      // `this.draft` is assigned the SAME object as `_cgDraft` — not a clone of it — and this
      // is the ONLY place that reference is ever swapped (see Global Constraint 9). Every
      // subsequent Vue v-model edit and every kept-unchanged global's in-place mutation of
      // `_cgDraft.foo = ...` both land on this one object, so cgAutoSave() (which reads
      // `_cgDraft` directly) always sees the current edited state.
      this.draft = _cgDraft;
      this.prevCurrency = this.draft.currency || 'EUR';
      this.selectionMode = false; this.selectedTaskIds = new Set();

      await cgUpdateActiveRatecardMap(); // may mutate _cgDraft.roles[].rate in place (non-custom roles)
      this.ratecardMap = { ..._cgActiveRatecardMap };
      this.ratecardOverrides = { ..._cgActiveRatecardOverrides };
      this.isClientRatecard = _cgIsClientRatecard;
      // No re-render needed yet — this is still before the very first paint (this.loading is
      // still true), so the upcoming initial render already reflects cgUpdateActiveRatecardMap's
      // adjustment with no stale-vs-fresh gap to bridge.

      if (typeof loadRatecardsForDropdown === 'function') {
        this.allRatecards = await loadRatecardsForDropdown().catch(() => []);
      }

      const url = new URL(window.location.href);
      url.searchParams.set('cgId', cgId);
      url.searchParams.set('verId', resolvedVerId);
      window.history.replaceState(null, '', url.toString());
      document.title = 'PDash — ' + (this.cg?.name || 'Cost Grid');

      this.loading = false;
    },
    async switchVersion(verId) {
      if (verId === this.verId) return;
      cgAutoSave();
      await this.openVersion(this.cgId, verId);
    },
    async goBack() {
      cgAutoSave();
      this.backSaving = true;
      await new Promise(r => setTimeout(r, 500));
      window.location.href = '/pipeline.html';
    },
    onHeaderFieldChange() { cgScheduleAutoSave(); },
    onPipelineChange() {
      cgPropagatePipelineToProjects();
      const cgFresh = cgLoad(this.cgId);
      if (cgFresh) this.cg = cgFresh;
      cgAutoSave();
    },
    async onClientChange() {
      await this.refreshRatecards();
      cgScheduleAutoSave();
    },
    async onRatecardChange() {
      // this.draft IS _cgDraft (same reference — see openVersion), so this.draft.ratecardId
      // is already current; cgUpdateActiveRatecardMap() reads _cgDraft.ratecardId directly.
      await cgUpdateActiveRatecardMap(); // mutates _cgDraft.roles[].rate in place for non-custom roles
      this.ratecardMap = { ..._cgActiveRatecardMap };
      this.ratecardOverrides = { ..._cgActiveRatecardOverrides };
      this.isClientRatecard = _cgIsClientRatecard;
      this.$forceUpdate(); // reflect the in-place role-rate adjustment (Global Constraint 9)
      cgScheduleAutoSave();
    },
    async refreshRatecards() {
      // Mirrors the filtering cgPopulateRatecardDropdown() used to do — the actual <option>
      // filtering now lives in the filteredRatecards computed; this only resets an
      // out-of-range selection and re-syncs the active ratecard map.
      const clientId = this.draft?.clientId && this.draft.clientId !== '__unassigned__' ? String(this.draft.clientId) : null;
      const valid = this.allRatecards.find(rc => String(rc.id) === String(this.draft.ratecardId) && (rc.client_id == null || (clientId && String(rc.client_id) === clientId)));
      if (this.draft.ratecardId && !valid) this.draft.ratecardId = null; // this.draft IS _cgDraft
      await cgUpdateActiveRatecardMap();
      this.ratecardMap = { ..._cgActiveRatecardMap };
      this.ratecardOverrides = { ..._cgActiveRatecardOverrides };
      this.isClientRatecard = _cgIsClientRatecard;
      this.$forceUpdate();
    },
    saveVersion() { cgSaveVersion(); },
    deleteVersion() {
      if (!this.cg || !this.verId) return;
      const v = this.cg.versions.find(v => v.versionId === this.verId);
      if (!v) return;
      cgConfirmDeleteVersion(this.cgId, this.verId, v.versionLabel, () => { window.location.href = 'pipeline.html'; });
    },
    publishDraft() { cgPublishDraft(); },
    openLinkedProject(projId) { cgAutoSave(); showDashboardView(projId); },
    exportXls() { cgExportXls(); },
    generateProject() { cgGenerateProject(); },
  },
  async created() {
    loadConfig();
    loadSettings();

    const user = await initNav('pipeline', { breadcrumbs: [
      { label: 'Home', href: '/pipeline.html' },
      { label: 'Pipeline', href: '/pipeline.html' },
      { label: '…' },
    ]});
    if (!user) { this.loadError = 'Failed to connect to the server. Please check your connection and try again.'; this.loading = false; return; }

    try {
      await Promise.all([loadClientsFromApi(), loadProgramsFromApi(), loadRolesFromApi(), loadCurrenciesFromApi(), loadConfigFromApi()]);
    } catch (e) { console.warn('[init] loadClientsFromApi/loadProgramsFromApi/loadRolesFromApi failed:', e.message); }

    try { await cgSyncFromApi(); } catch (e) { console.warn('[init] cgSyncFromApi failed:', e.message); }

    this.clients = getClients();
    this.currencies = window.__currencies || [];

    const params = new URLSearchParams(window.location.search);
    const cgId = params.get('cgId');
    const versionId = params.get('verId');
    if (!cgId) { window.location.href = '/pipeline.html'; return; }
    const cgRec = cgLoad(cgId);
    if (!cgRec) { this.loadError = 'Cost grid not found or access denied.'; this.loading = false; return; }
    const targetVerId = (versionId && cgRec.versions.find(v => v.versionId === versionId)) ? versionId : cgRec.versions[0]?.versionId;
    if (!targetVerId) { this.loadError = 'Cost grid not found or access denied.'; this.loading = false; return; }

    _cgVueApp = this; // wire the bridge — Global Constraint 7

    await this.openVersion(cgId, targetVerId);
    if (typeof updateBreadcrumbs === 'function' && this.cg) updateBreadcrumbs([
      { label: 'Home', href: '/pipeline.html' },
      { label: 'Pipeline', href: '/pipeline.html' },
      { label: this.cg.name },
    ]);
  },
}).mount('#costGridEditorSection');

}); // end DOMContentLoaded
</script>
```

Note: `openNewVersionModal`/`openCloneModal` are referenced by the template (Step 3) but implemented in Task 5 (they open `#cgNewVersionModal`/`#cgCloneModal`, added there) — leave them undefined for now; Task 5 adds them before this task's manual verification would exercise those buttons. `showClientsModal()` (the "+ New" client button) stays an unmodified `onclick="..."` global — out of scope, unrelated to this migration's reachable surface (verified in the design's investigation: `js/clients.js` is loaded for exactly this reason on `costgrid.html` today, and stays loaded).

- [ ] **Step 5: Run the test suite (no `js/lib` changes in this task, but confirms nothing broke)**

```bash
npm test
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add costgrid.html js/costgrid.js
git commit -m "feat(costgrid): Vue 3 skeleton, bridge functions, page init, toolbar, version tabs, offer-details form"
```

---

### Task 3: Grid table shell + role columns (header cells, rate row)

**Files:**
- Modify: `costgrid.html` (replaces the `<div id="cgGridPlaceholder">` placeholder from Task 2 with the grid `<table>` shell: summary rows, role header row, rate row, empty `<tbody>` placeholder for Task 4, `<tfoot>`)

**Interfaces:**
- Consumes: `js/lib/costgrid-calc.js`'s `resolveRoleRate` (Task 1); `data().draft`/`computed.grand`/`computed.colTotals` (Task 2); global `getRoles()` (unchanged, `js/roles.js`).
- Produces: `computed.roleBaseline(role)` helper wrapped as a `methods` entry (Vue can't parametrize a `computed`, so this is a method); `methods.moveRole(role, dir)`, `onRateChange(role, event)`, `removeRoleColumn(code)`, `addRoleColumn()`, `changeRole(code)`, `duplicateRole(code)`, `toggleCompactHeader()`, `toggleSummaryCollapsed()` — all consumed by Task 6 (the role-selector modal these last three open) and read by Task 4's task-row role-hours grid (same `draft.roles` array).

- [ ] **Step 1: Add `compactHeader` to `data()` and the rate-resolution/role-column methods**

In the `data()` return object (Task 2), add:
```js
      compactHeader: localStorage.getItem('PDash_cgCompactHeader') === '1',
```

In `methods`, add (alongside the existing ones from Task 2):
```js
    roleBaseline(role) {
      const roleObj = getRoles().find(gr => gr.code === role.roleCode);
      const roleId = roleObj?.id;
      const globalRate = roleObj?.rate;
      if (roleId == null) return { eurRate: globalRate || 0, effectiveRate: role.rate, isOverride: false };
      return resolveRoleRate({
        roleId, globalRate,
        currency: this.draft.currency || 'EUR',
        currencyRate: parseFloat((this.currencies || []).find(c => c.code === (this.draft.currency || 'EUR'))?.current_rate) || 1.0,
        ratecardMap: this.ratecardMap, ratecardOverrides: this.ratecardOverrides,
        roleOverrides: roleObj?.rateOverrides || {},
      });
    },
    onRateChange(role, event) {
      const val = event.target.value.trim();
      const baseline = this.roleBaseline(role);
      if (val === '') {
        role.rate = baseline.effectiveRate;
        role.rateIsCustom = false;
      } else {
        const newRate = parseFloat(val) || 0;
        role.rate = newRate;
        role.rateIsCustom = newRate !== baseline.effectiveRate;
      }
      cgScheduleAutoSave();
    },
    moveRole(role, dir) {
      const idx = this.draft.roles.findIndex(r => r.roleCode === role.roleCode);
      const newIdx = idx + dir;
      if (idx < 0 || newIdx < 0 || newIdx >= this.draft.roles.length) return;
      const roles = this.draft.roles;
      [roles[idx], roles[newIdx]] = [roles[newIdx], roles[idx]];
      cgScheduleAutoSave();
    },
    removeRoleColumn(code) {
      const label = this.draft.roles.find(r => r.roleCode === code)?.roleLabel || code;
      showConfirm(`Remove column "${label}"?\n\nHours entered for this role will be deleted.`, () => {
        this.draft.roles = this.draft.roles.filter(r => r.roleCode !== code);
        this.draft.phases.forEach(ph => ph.tasks.forEach(t => delete t.hours[code]));
        cgScheduleAutoSave();
      }, null, '✕ Remove column');
    },
    addRoleColumn() { this.openRoleModal('add', null); },
    changeRole(code) { this.openRoleModal('change', code); },
    duplicateRole(code) { this.openRoleModal('duplicate', code); },
    toggleCompactHeader() {
      this.compactHeader = !this.compactHeader;
      localStorage.setItem('PDash_cgCompactHeader', this.compactHeader ? '1' : '0');
    },
    toggleSummaryCollapsed() { this.summaryCollapsed = !this.summaryCollapsed; },
```

`openRoleModal(mode, sourceRoleCode)` is added by Task 6 (it opens `#cgRoleSelectModal`); leave it unimplemented for now — this task's manual exercise of "+ Add role"/change/duplicate buttons is deferred until Task 6 lands, exactly like Task 2 deferred `openNewVersionModal`/`openCloneModal` to Task 5.

- [ ] **Step 2: Replace the grid placeholder with the table shell**

In `costgrid.html`, find (from Task 2, Step 3):

```html
      <!-- Grid table: Task 3 (role columns) + Task 4 (task/phase rows/selection bar) -->
      <div id="cgGridPlaceholder"></div>
```

Replace with:

```html
      <!-- Grid -->
      <div class="section-card">
        <div class="section-header d-flex justify-content-between align-items-center">
          <span>📊 Cost Grid</span>
          <div class="d-flex gap-2">
            <button class="btn btn-sm btn-outline-secondary py-0 px-2" style="font-size:var(--text-base)" @click="addRoleColumn">👥 + Add role</button>
            <button class="btn btn-sm btn-outline-secondary py-0 px-2" style="font-size:var(--text-base)" @click="addPhase">+ Add phase</button>
          </div>
        </div>
        <div style="overflow:auto;max-height:calc(100vh - 300px)">
          <table class="table mb-0" id="cgGridTable" style="min-width:700px;border-collapse:collapse">
            <thead>
              <tr style="background:var(--sand-200);cursor:pointer;user-select:none" :title="summaryCollapsed ? 'Expand summary' : 'Collapse summary'" @click="toggleSummaryCollapsed">
                <td :colspan="6 + draft.roles.length" style="padding:3px 12px;border:1px solid var(--sand-border);font-size:var(--text-sm);color:#888;font-weight:600">
                  <span style="font-size:var(--text-xs);margin-right:4px">{{ summaryCollapsed ? '▶' : '▼' }}</span>
                  {{ summaryCollapsed ? 'Summary (click to expand)' : 'Summary (click to collapse)' }}
                </td>
              </tr>
              <tr v-show="!summaryCollapsed" style="background:var(--sand-200)">
                <td colspan="6" style="padding:5px 12px;border:1px solid var(--sand-border);font-weight:700;font-size:var(--text-base);color:#444">Total Hrs by Role</td>
                <td v-for="r in draft.roles" :key="'hrs-'+r.roleCode" style="text-align:center;background:var(--sand-200);font-weight:700;border:1px solid var(--sand-border);padding:5px 4px;font-size:var(--text-md)">{{ colTotals[r.roleCode]?.hrs || 0 }}</td>
              </tr>
              <tr v-show="!summaryCollapsed" style="background:var(--sand-200)">
                <td colspan="6" style="padding:5px 12px;border:1px solid var(--sand-border);font-weight:700;font-size:var(--text-base);color:#444">Total Fee by Role</td>
                <td v-for="r in draft.roles" :key="'fee-'+r.roleCode" style="text-align:center;background:var(--sand-200);font-weight:700;border:1px solid var(--sand-border);padding:5px 4px;font-size:var(--text-base)">{{ (colTotals[r.roleCode]?.fee > 0) ? fmtCur(colTotals[r.roleCode].fee) : '—' }}</td>
              </tr>
              <tr v-show="!summaryCollapsed" style="background:var(--sand-100)">
                <td style="padding:6px 12px;border:1px solid var(--sand-border);vertical-align:middle">
                  <span style="background:var(--brand-navy);color:#fff;border-radius:var(--radius-xs);padding:3px 10px;font-size:var(--text-base);font-weight:700;letter-spacing:.04em">{{ draft.currency || 'EUR' }}</span>
                </td>
                <td style="border:1px solid var(--sand-border)"></td>
                <td style="text-align:right;padding:6px 10px;border:1px solid var(--sand-border);font-weight:700;font-size:var(--text-lg);white-space:nowrap"><strong>{{ fmtCur(grand.fee + grand.ptc) }}</strong></td>
                <td style="text-align:right;padding:6px 10px;border:1px solid var(--sand-border);font-size:var(--text-md);white-space:nowrap">{{ grand.ptc > 0 ? fmtCur(grand.ptc) : '—' }}</td>
                <td style="text-align:right;padding:6px 10px;border:1px solid var(--sand-border);font-weight:700;font-size:var(--text-lg);white-space:nowrap">{{ grand.hrs > 0 ? grand.hrs + 'h' : '—' }}</td>
                <td style="text-align:right;padding:6px 10px;border:1px solid var(--sand-border);font-size:var(--text-md);white-space:nowrap">{{ grand.fee > 0 ? fmtCur(grand.fee) : '—' }}</td>
                <td v-for="r in draft.roles" :key="'rate-'+r.roleCode" :style="{ textAlign:'center', background: (!r.rate || r.rate === 0) ? '#fff0f0' : (r.rateIsCustom ? '#fffbe6' : 'var(--sand-50)'), border: '1px solid ' + ((!r.rate || r.rate === 0) ? '#f5c6cb' : (r.rateIsCustom ? '#ffe58f' : 'var(--sand-border)')), padding:'3px 4px' }">
                  <div style="font-size:var(--text-xs);color:#aaa;margin-bottom:1px">{{ draft.currency || 'EUR' }}/h</div>
                  <input type="number" min="0" step="1" :value="r.rate" @change="onRateChange(r, $event)"
                    :title="r.rateIsCustom ? 'Custom (baseline: ' + (draft.currency||'EUR') + ' ' + roleBaseline(r).effectiveRate + '/h) — clear to restore' : 'Rate from roles registry / ratecard'"
                    :style="{ width:'100%', border:'1px solid ' + ((!r.rate||r.rate===0)?'#f5c6cb':(r.rateIsCustom?'#ffe58f':'var(--sand-border)')), borderRadius:'var(--radius-xs)', textAlign:'center', fontSize:'var(--text-md)', fontWeight: (!r.rate||r.rate===0||r.rateIsCustom) ? '700':'400', color: (!r.rate||r.rate===0) ? 'var(--color-danger)' : (r.rateIsCustom ? 'var(--color-warning-text)':'#555'), background:'transparent', padding:'1px 4px' }">
                  <div v-if="r.rateIsCustom" style="font-size:var(--text-2xs);color:var(--color-warning-text);margin-top:2px">✎ custom</div>
                  <div v-if="!r.rate || r.rate === 0" style="font-size:var(--text-2xs);color:var(--color-danger);margin-top:2px">⚠️ 0</div>
                </td>
              </tr>
              <tr style="background:var(--brand-navy)">
                <th style="position:sticky;top:0;left:0;z-index:4;background:var(--brand-navy);color:#fff;border:1px solid #333;padding:8px 12px;min-width:200px;font-size:var(--text-md)">
                  <div class="d-flex align-items-center justify-content-between">
                    <span>Phase / Task</span>
                    <button style="background:none;border:none;color:#93c5fd;font-size:12px;cursor:pointer;padding:0;line-height:1;margin-left:6px" :title="compactHeader ? 'Expand header' : 'Compact header'" @click.stop="toggleCompactHeader">{{ compactHeader ? '⊞' : '⊟' }}</button>
                  </div>
                </th>
                <th style="position:sticky;top:0;z-index:2;background:var(--brand-navy);color:#fff;border:1px solid #333;padding:8px 12px;min-width:240px;font-size:var(--text-md)">Description</th>
                <th style="position:sticky;top:0;z-index:2;background:var(--brand-navy);color:#fff;border:1px solid #333;padding:8px 10px;min-width:130px;text-align:right;font-size:var(--text-base)">TOTAL COST<br>and FEE</th>
                <th style="position:sticky;top:0;z-index:2;background:var(--brand-navy);color:#fff;border:1px solid #333;padding:8px 10px;min-width:115px;text-align:right;font-size:var(--text-base)">Total Pass<br>through Costs</th>
                <th style="position:sticky;top:0;z-index:2;background:var(--brand-navy);color:#fff;border:1px solid #333;padding:8px 10px;min-width:75px;text-align:right;font-size:var(--text-base)">Total<br>hrs</th>
                <th style="position:sticky;top:0;z-index:2;background:var(--brand-navy);color:#fff;border:1px solid #333;padding:8px 10px;min-width:120px;text-align:right;font-size:var(--text-base)">Total<br>fees</th>
                <th v-for="(r, rIdx) in draft.roles" :key="r.roleCode" :style="{ position:'sticky', top:0, zIndex:2, textAlign:'center', background: (!r.rate||r.rate===0) ? '#7f0b0b' : 'var(--brand-navy)', color:'#fff', border:'1px solid #333', padding: compactHeader ? '3px 2px':'8px 4px', minWidth: compactHeader ? '80px':'100px', fontSize: compactHeader ? '10px':'var(--text-base)', fontWeight:600, verticalAlign: compactHeader?'middle':'top' }">
                  <div :title="r.roleCode" :style="compactHeader ? 'cursor:default;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80px' : 'cursor:default'">{{ r.roleLabel }}<template v-if="compactHeader && (!r.rate||r.rate===0)"> ⚠️</template></div>
                  <div v-if="!compactHeader && (!r.rate||r.rate===0)" style="font-size:var(--text-xs);color:#ffb3b3;font-weight:400">⚠️ rate 0</div>
                  <template v-if="!compactHeader">
                    <div class="d-flex justify-content-center gap-2 mt-1">
                      <button class="btn btn-link p-0" :disabled="rIdx === 0" :style="{ color: rIdx > 0 ? '#93c5fd' : '#444', fontSize:'var(--text-sm)', lineHeight:1 }" title="Move left" @click="moveRole(r, -1)">◀</button>
                      <button class="btn btn-link p-0" :disabled="rIdx === draft.roles.length - 1" :style="{ color: rIdx < draft.roles.length - 1 ? '#93c5fd' : '#444', fontSize:'var(--text-sm)', lineHeight:1 }" title="Move right" @click="moveRole(r, 1)">▶</button>
                    </div>
                    <div class="d-flex justify-content-center gap-1 mt-1 flex-wrap">
                      <button class="btn btn-link p-0" style="color:#93c5fd;font-size:var(--text-2xs);line-height:1.3" title="Replace this role with another" @click="changeRole(r.roleCode)">⇄ change</button>
                      <button class="btn btn-link p-0" style="color:#86efac;font-size:var(--text-2xs);line-height:1.3" title="Duplicate column with a different role" @click="duplicateRole(r.roleCode)">⊕ dup</button>
                      <button class="btn btn-link p-0" style="color:#f8877a;font-size:var(--text-2xs);line-height:1.3" title="Remove column" @click="removeRoleColumn(r.roleCode)">✕ remove</button>
                    </div>
                  </template>
                </th>
              </tr>
            </thead>
            <tbody id="cgGridBody">
              <tr v-if="draft.roles.length === 0"><td colspan="6" class="text-center text-muted py-2" style="font-size:var(--text-base);border:1px solid var(--border-light)">No roles added yet. Click <strong>👥 + Add role</strong> to add role columns.</td></tr>
              <!-- Phase/task rows: Task 4 -->
            </tbody>
            <tfoot>
              <tr style="background:var(--indigo-50)">
                <td style="position:sticky;left:0;z-index:3;background:var(--indigo-50);font-weight:700;padding:7px 12px;border:1px solid #c0c8e8;border-top:2px solid var(--indigo-500);font-size:var(--text-md)">TOTAL</td>
                <td style="border:1px solid #c0c8e8;border-top:2px solid var(--indigo-500);background:var(--indigo-50)"></td>
                <td style="text-align:right;font-weight:700;padding:7px 10px;border:1px solid #c0c8e8;border-top:2px solid var(--indigo-500);background:var(--sand-100);font-size:var(--text-lg);white-space:nowrap"><strong>{{ fmtCur(grand.fee + grand.ptc) }}</strong></td>
                <td style="text-align:right;padding:7px 10px;border:1px solid #c0c8e8;border-top:2px solid var(--indigo-500);background:var(--sand-100);font-size:var(--text-md);white-space:nowrap">{{ grand.ptc > 0 ? fmtCur(grand.ptc) : '—' }}</td>
                <td style="text-align:right;font-weight:700;padding:7px 10px;border:1px solid #c0c8e8;border-top:2px solid var(--indigo-500);background:var(--sand-100);font-size:var(--text-lg);white-space:nowrap">{{ grand.hrs > 0 ? grand.hrs + 'h' : '—' }}</td>
                <td style="text-align:right;padding:7px 10px;border:1px solid #c0c8e8;border-top:2px solid var(--indigo-500);background:var(--sand-100);font-size:var(--text-md);white-space:nowrap">{{ grand.fee > 0 ? fmtCur(grand.fee) : '—' }}</td>
                <td v-for="r in draft.roles" :key="'foot-'+r.roleCode" style="text-align:center;font-weight:700;padding:7px 4px;border:1px solid #c0c8e8;border-top:2px solid var(--indigo-500);background:var(--sand-50);font-size:var(--text-md)">{{ (colTotals[r.roleCode]?.hrs || 0) > 0 ? colTotals[r.roleCode].hrs : '' }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
```

Add the `addPhase()` and `fmtCur()` helpers to `methods` (used above; `addPhase` is used by both this task's toolbar and Task 4, `fmtCur` is used throughout every remaining task):
```js
    fmtCur(amount) { return cgFmtCurrency(amount, this.draft?.currency || 'EUR'); },
    addPhase() {
      this.draft.phases.push({ phaseId: cgNewPhId(), phaseName: 'New phase', tasks: [] });
      cgScheduleAutoSave();
    },
```

- [ ] **Step 3: Run the test suite**

```bash
npm test
```
Expected: PASS (this task touches no `js/lib` file).

- [ ] **Step 4: Commit**

```bash
git add costgrid.html
git commit -m "feat(costgrid): grid table shell + role column headers/rates"
```

---

### Task 4: Task/phase rows, selection mode, add-to-project bar

**Files:**
- Modify: `costgrid.html` (replaces the `<!-- Phase/task rows: Task 4 -->` placeholder inside `<tbody id="cgGridBody">` from Task 3 with real `v-for` phase/task rows; adds the sticky selection bar below the grid card)

**Interfaces:**
- Consumes: `js/lib/costgrid-calc.js`'s `cgComputeTaskTotals`/`cgComputePhaseTotals` (Task 1, via `methods.taskTotals`/`phaseTotals`); `data().selectionMode`/`selectedTaskIds` (Task 2, populated by the `resyncFromGlobals()` bridge whenever a kept-unchanged global like `cgGenerateProject()` flips `_cgSelectionMode`); global unchanged functions `cgGetAssignedTaskIds`, `cgGetAssignedTaskNames`, `cgFmtMonth`, `cgIsoToIt`, `cgItToIso`, `cgNewPhId`, `cgNewTkId`, `cgScheduleAutoSave`, `showConfirm`, `isValidSoldHours`, `cgExitSelectionMode`, `cgConfirmAndGenerate`, `_cgEnsureAddToProjectModal`.
- Produces: `methods.taskTotals(task)`/`phaseTotals(phase)`/`phaseDatesLabel(phase)`/`isTaskAssigned(task)` — consumed nowhere further in this plan but available for any future extension; `data().ptcFocusedTask`/`addToProjectSel` — internal to this task only.

- [ ] **Step 1: Add task/phase/selection data fields and methods**

In the `data()` return object, add:
```js
      ptcFocusedTask: null, addToProjectSel: '',
```

In `methods`, add:
```js
    taskTotals(task) { return cgComputeTaskTotals(task, this.draft.roles); },
    phaseTotals(phase) { return cgComputePhaseTotals(phase, this.draft.roles); },
    phaseDatesLabel(phase) {
      const dates = phase.tasks.flatMap(t => [t.taskStartDate, t.taskEndDate]).filter(Boolean).sort();
      return dates.length ? `${cgFmtMonth(dates[0])} – ${cgFmtMonth(dates[dates.length-1])}` : '';
    },
    isTaskAssigned(task) {
      const assignedIds = cgGetAssignedTaskIds();
      const assignedNames = cgGetAssignedTaskNames();
      return assignedIds.has(task.taskId) || assignedNames.has(task.taskName?.trim().toLowerCase());
    },
    deletePhase(phase) {
      showConfirm(`Delete phase "${phase.phaseName}" and all its tasks?`, () => {
        this.draft.phases = this.draft.phases.filter(p => p.phaseId !== phase.phaseId);
        cgScheduleAutoSave();
      }, null, '✕ Delete phase');
    },
    deleteTask(phase, task) {
      showConfirm(`Delete task "${task.taskName || 'this task'}"?`, () => {
        phase.tasks = phase.tasks.filter(t => t.taskId !== task.taskId);
        cgScheduleAutoSave();
      }, null, '✕ Delete task');
    },
    addTask(phase) {
      phase.tasks.push({ taskId: cgNewTkId(), taskName: '', taskDescription: '', ptc: 0, taskStartDate: '', taskEndDate: '', hours: {} });
      cgScheduleAutoSave();
    },
    onTaskDateChange(task, field, event) {
      const iso = cgItToIso(event.target.value);
      event.target.value = iso ? cgIsoToIt(iso) : '';
      task[field] = iso;
      cgScheduleAutoSave();
    },
    onHoursInput(task, roleCode, event) {
      const val = parseFloat(event.target.value) || 0;
      if (val > 0) task.hours[roleCode] = val; else delete task.hours[roleCode];
      cgScheduleAutoSave();
    },
    onHoursBlur(task, roleCode, event) {
      const val = parseFloat(event.target.value) || 0;
      if (val > 0 && !isValidSoldHours(val)) {
        alert(`Invalid sold hours "${val}". Allowed values: whole numbers, or with a fraction of .25, .5, or .75.`);
        delete task.hours[roleCode];
        event.target.value = '';
        cgScheduleAutoSave();
      }
    },
    toggleTaskSelection(task) {
      if (this.selectedTaskIds.has(task.taskId)) { this.selectedTaskIds.delete(task.taskId); _cgSelectedTaskIds.delete(task.taskId); }
      else { this.selectedTaskIds.add(task.taskId); _cgSelectedTaskIds.add(task.taskId); }
    },
    selectAllFreeInPhase(phase) {
      const assignedIds = cgGetAssignedTaskIds();
      phase.tasks.forEach(task => {
        if (!assignedIds.has(task.taskId)) { this.selectedTaskIds.add(task.taskId); _cgSelectedTaskIds.add(task.taskId); }
      });
    },
    selectAllFree() {
      const assignedIds = cgGetAssignedTaskIds();
      (this.draft.phases || []).flatMap(ph => ph.tasks).forEach(task => {
        if (!assignedIds.has(task.taskId)) { this.selectedTaskIds.add(task.taskId); _cgSelectedTaskIds.add(task.taskId); }
      });
    },
    cancelSelection() { cgExitSelectionMode(); },
    confirmAndGenerate() { cgConfirmAndGenerate(); },
    addToProject() {
      const projId = this.addToProjectSel;
      if (!projId) { alert('Select a project from the dropdown.'); return; }
      if (this.selectedTaskIds.size === 0) { alert('Select at least one task.'); return; }
      const lp = (this.draft.linkedProjects || []).find(l => l.projectId === projId);
      const projName = lp?.projectName || projId;
      const selectedIds = [...this.selectedTaskIds];
      const taskNames = selectedIds.map(tid => {
        for (const ph of this.draft.phases || []) {
          const t = ph.tasks.find(t => t.taskId === tid);
          if (t?.taskName?.trim()) return t.taskName.trim();
        }
        return tid;
      });
      const modal = _cgEnsureAddToProjectModal();
      modal.querySelector('#cgAddToProjectModalBody').innerHTML =
        `<p class="mb-2">Add the following tasks to <strong>${esc(projName)}</strong>?</p>
         <ul class="mb-0 ps-3" style="font-size:var(--text-sm)">${taskNames.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`;
      modal.dataset.projId = projId;
      modal.dataset.taskIds = JSON.stringify(selectedIds);
      modal.style.display = 'flex';
    },
```

Add `cgIsoToIt`, `cgItToIso` to the `methods` shorthand re-export list from Task 2 (bare re-exports of stable classic-script globals — safe since neither is bridged from a deferred `js/lib/*` module; `cgScheduleAutoSave` is already in this list from Task 2 — added there specifically because this task's template calls it directly as `@change="cgScheduleAutoSave()"` on the phase-name/task-name/task-description fields and inline inside the PTC input's `@input` handler below. Per the established rule from the `pipeline.html` cycle (Vue 3's runtime-compiled template mode never falls through to `window` for an unrecognized identifier — a real bug class hit repeatedly in `project-config.html`/`portfolio.html`), **any** global function invoked directly inside a template expression — not from inside a `methods`/`computed` function body, where normal JS scoping already resolves it — must be exposed via `methods:`, even as a bare one-line shorthand):
```js
    esc, pipelineBadge, statusBadgeLarge, cgScheduleAutoSave, cgIsoToIt, cgItToIso,
```

- [ ] **Step 2: Replace the tbody placeholder with real phase/task rows**

In `costgrid.html`, find (from Task 3, Step 2):

```html
            <tbody id="cgGridBody">
              <tr v-if="draft.roles.length === 0"><td colspan="6" class="text-center text-muted py-2" style="font-size:var(--text-base);border:1px solid var(--border-light)">No roles added yet. Click <strong>👥 + Add role</strong> to add role columns.</td></tr>
              <!-- Phase/task rows: Task 4 -->
            </tbody>
```

Replace with:

```html
            <tbody id="cgGridBody">
              <tr v-if="draft.roles.length === 0"><td colspan="6" class="text-center text-muted py-2" style="font-size:var(--text-base);border:1px solid var(--border-light)">No roles added yet. Click <strong>👥 + Add role</strong> to add role columns.</td></tr>
              <template v-for="phase in draft.phases" :key="phase.phaseId">
                <tr class="cg-phase-row">
                  <td style="padding:6px 8px;border:1px solid var(--brand-dark);background:var(--brand-navy);vertical-align:middle">
                    <div class="d-flex align-items-center gap-1">
                      <input type="text" class="form-control" style="border:none;font-size:var(--text-lg);background:transparent;color:#fff;font-weight:700;flex:1;padding:2px 4px;height:32px" v-model="phase.phaseName" placeholder="Phase name" @change="cgScheduleAutoSave()">
                      <button class="btn btn-link p-0" style="color:#93c5fd;font-size:var(--text-sm);white-space:nowrap" title="Add task" @click="addTask(phase)">+ task</button>
                      <button v-if="selectionMode" class="btn btn-link p-0" style="color:#fcd34d;font-size:var(--text-xs);white-space:nowrap" title="Select all free tasks in this phase" @click="selectAllFreeInPhase(phase)">☑ liberi</button>
                      <button class="btn btn-link p-0" style="color:#f8877a;font-size:var(--text-xs)" title="Delete phase" @click="deletePhase(phase)">✕</button>
                    </div>
                  </td>
                  <td style="background:var(--brand-navy);border:1px solid var(--brand-dark);padding:4px 8px;vertical-align:middle">
                    <span style="font-size:var(--text-xs);color:#93c5fd;font-weight:400">{{ phaseDatesLabel(phase) }}</span>
                  </td>
                  <td style="text-align:right;padding:6px 10px;border:1px solid var(--brand-dark);font-weight:700;font-size:var(--text-md);white-space:nowrap;background:var(--brand-mid);color:#e2e8ff">{{ (phaseTotals(phase).fee + phaseTotals(phase).ptc) > 0 ? fmtCur(phaseTotals(phase).fee + phaseTotals(phase).ptc) : '—' }}</td>
                  <td style="text-align:right;padding:6px 10px;border:1px solid var(--brand-dark);font-weight:600;font-size:var(--text-md);white-space:nowrap;background:var(--brand-mid);color:#e2e8ff">{{ phaseTotals(phase).ptc > 0 ? fmtCur(phaseTotals(phase).ptc) : '—' }}</td>
                  <td style="text-align:right;padding:6px 10px;border:1px solid var(--brand-dark);font-weight:700;font-size:var(--text-md);white-space:nowrap;background:var(--brand-mid);color:#e2e8ff">{{ phaseTotals(phase).hrs > 0 ? phaseTotals(phase).hrs + 'h' : '—' }}</td>
                  <td style="text-align:right;padding:6px 10px;border:1px solid var(--brand-dark);font-weight:600;font-size:var(--text-md);white-space:nowrap;background:var(--brand-mid);color:#e2e8ff">{{ phaseTotals(phase).fee > 0 ? fmtCur(phaseTotals(phase).fee) : '—' }}</td>
                  <td v-for="r in draft.roles" :key="'ph-'+r.roleCode" style="text-align:center;vertical-align:middle;background:var(--brand-mid);color:#c8d0ee;font-weight:600;border:1px solid var(--brand-dark);padding:6px 4px;font-size:var(--text-md)">{{ (phaseTotals(phase).byRole[r.roleCode] || 0) > 0 ? phaseTotals(phase).byRole[r.roleCode] : '' }}</td>
                </tr>
                <tr v-for="task in phase.tasks" :key="task.taskId" class="cg-task-row">
                  <td style="padding:4px 6px;border:1px solid var(--border-light);min-width:200px;vertical-align:top">
                    <div v-if="selectionMode" class="mb-1 d-flex align-items-center gap-1">
                      <input type="checkbox" class="form-check-input" :checked="isTaskAssigned(task) || selectedTaskIds.has(task.taskId)" :disabled="isTaskAssigned(task)" :style="isTaskAssigned(task) ? 'opacity:.4' : ''" @change="toggleTaskSelection(task)">
                      <span v-if="isTaskAssigned(task)" style="font-size:var(--text-xs);color:var(--text-disabled)">already assigned</span>
                    </div>
                    <div class="d-flex align-items-start gap-1">
                      <textarea class="form-control" rows="2" style="border:none;font-size:var(--text-md);font-weight:700;background:transparent;flex:1;padding:3px 4px;resize:vertical;min-height:48px" placeholder="Task name" v-model="task.taskName" @change="cgScheduleAutoSave()"></textarea>
                      <button v-if="!isTaskAssigned(task)" class="btn btn-link p-0" style="color:var(--color-danger);font-size:var(--text-xs);line-height:1;flex-shrink:0;margin-top:4px" title="Delete task" @click="deleteTask(phase, task)">✕</button>
                    </div>
                    <div class="d-flex gap-2 mt-1 align-items-center">
                      <div class="d-flex align-items-center gap-1">
                        <span class="text-muted" style="font-size:var(--text-xs);white-space:nowrap">From</span>
                        <input type="text" class="form-control form-control-sm p-1" style="font-size:var(--text-xs);height:24px;border:1px solid var(--border-light);width:100px" placeholder="gg/mm/aaaa" maxlength="10" :value="cgIsoToIt(task.taskStartDate)" @change="onTaskDateChange(task, 'taskStartDate', $event)">
                      </div>
                      <div class="d-flex align-items-center gap-1">
                        <span class="text-muted" style="font-size:var(--text-xs);white-space:nowrap">To</span>
                        <input type="text" class="form-control form-control-sm p-1" style="font-size:var(--text-xs);height:24px;border:1px solid var(--border-light);width:100px" placeholder="gg/mm/aaaa" maxlength="10" :value="cgIsoToIt(task.taskEndDate)" @change="onTaskDateChange(task, 'taskEndDate', $event)">
                      </div>
                    </div>
                  </td>
                  <td style="padding:4px 6px;border:1px solid var(--border-light);min-width:240px;vertical-align:top">
                    <textarea class="form-control" rows="3" style="border:none;font-size:var(--text-md);background:transparent;color:#555;padding:3px 4px;resize:vertical;min-height:72px" placeholder="Description…" v-model="task.taskDescription" @change="cgScheduleAutoSave()"></textarea>
                  </td>
                  <td style="text-align:right;padding:6px 10px;border:1px solid var(--border-light);font-size:var(--text-md);white-space:nowrap;background:var(--sand-50);vertical-align:middle">
                    <strong v-if="taskTotals(task).totalCostAndFee > 0">{{ fmtCur(taskTotals(task).totalCostAndFee) }}</strong><span v-else style="color:#bbb">—</span>
                  </td>
                  <td style="padding:3px 5px;border:1px solid var(--border-light);min-width:120px;vertical-align:middle">
                    <input type="text" class="form-control" style="border:1px solid var(--border-light);font-size:var(--text-md);padding:4px 6px;height:32px;text-align:right"
                      :value="ptcFocusedTask === task.taskId ? (task.ptc > 0 ? task.ptc : '') : (task.ptc > 0 ? fmtCur(task.ptc) : '')" placeholder="—"
                      @focus="ptcFocusedTask = task.taskId"
                      @input="task.ptc = parseFloat($event.target.value) || 0; cgScheduleAutoSave()"
                      @blur="ptcFocusedTask = null">
                  </td>
                  <td style="text-align:right;padding:6px 10px;border:1px solid var(--border-light);font-size:var(--text-md);white-space:nowrap;background:var(--sand-50);vertical-align:middle">
                    <strong v-if="taskTotals(task).totalHrs > 0">{{ taskTotals(task).totalHrs }}h</strong><span v-else style="color:#bbb">—</span>
                  </td>
                  <td style="text-align:right;padding:6px 10px;border:1px solid var(--border-light);font-size:var(--text-md);white-space:nowrap;background:var(--sand-50);vertical-align:middle">
                    <span v-if="taskTotals(task).totalFee > 0">{{ fmtCur(taskTotals(task).totalFee) }}</span><span v-else style="color:#bbb">—</span>
                  </td>
                  <td v-for="r in draft.roles" :key="'th-'+r.roleCode" style="border:1px solid var(--border-light);padding:2px 3px;text-align:center;vertical-align:middle">
                    <input type="number" class="form-control p-1" style="border:none;text-align:center;font-size:var(--text-md);background:transparent;min-width:70px;height:34px"
                      :value="task.hours[r.roleCode] || ''" min="0" step="0.5" placeholder="—"
                      @input="onHoursInput(task, r.roleCode, $event)" @blur="onHoursBlur(task, r.roleCode, $event)">
                  </td>
                </tr>
                <tr class="cg-add-task-row">
                  <td :colspan="6 + draft.roles.length" style="padding:3px 10px;border:1px solid var(--border-light);background:var(--surface-light)">
                    <button class="btn btn-link btn-sm p-0" style="font-size:var(--text-base);color:var(--text-muted)" @click="addTask(phase)">+ add task</button>
                  </td>
                </tr>
              </template>
            </tbody>
```

- [ ] **Step 3: Add the sticky selection bar below the grid card**

In `costgrid.html`, find (end of Task 3's grid `<div class="section-card">` block):

```html
      </div>
```
(the closing tag right after `</table></div>` for the grid card — the very last `</div>` before `<!-- Phasing panel: Task 5 -->`)

Add immediately after it (still inside `<div id="cgEditorBody">`, i.e. as a sibling of the grid card, before the phasing panel placeholder):

```html
      <div v-if="selectionMode" style="position:sticky;bottom:0;left:0;right:0;z-index:100;background:var(--brand-navy);color:#fff;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border-top:3px solid var(--indigo-500)">
        <div class="d-flex align-items-center gap-3">
          <span style="font-size:var(--text-md)"><strong>{{ selectedTaskIds.size }}</strong> tasks selected</span>
          <button class="btn btn-sm btn-outline-light py-0 px-2" style="font-size:var(--text-sm)" @click="selectAllFree">☑ All free tasks</button>
        </div>
        <div class="d-flex gap-2 align-items-center flex-wrap">
          <template v-if="(draft.linkedProjects || []).length">
            <select v-model="addToProjectSel" class="form-select form-select-sm py-0" style="width:auto;min-width:180px;height:30px;font-size:var(--text-sm)">
              <option value="">— Add to existing project —</option>
              <option v-for="lp in draft.linkedProjects" :key="lp.projectId" :value="lp.projectId">{{ lp.projectName || lp.projectId }}</option>
            </select>
            <button class="btn btn-sm btn-warning py-0 px-3" style="font-size:var(--text-base)" @click="addToProject">＋ Add to project</button>
          </template>
          <button class="btn btn-sm btn-outline-secondary py-0 px-3" style="font-size:var(--text-base)" @click="cancelSelection">Cancel</button>
          <button class="btn btn-sm btn-success py-0 px-3" style="font-size:var(--text-base)" @click="confirmAndGenerate">▶ Create project</button>
        </div>
      </div>
```

- [ ] **Step 4: Run the test suite**

```bash
npm test
```
Expected: PASS (no `js/lib` change in this task).

- [ ] **Step 5: Commit**

```bash
git add costgrid.html
git commit -m "feat(costgrid): task/phase rows, selection mode, add-to-project bar"
```

---

### Task 5: Phasing panel + New Version/Clone modals + currency-change confirmation

**Files:**
- Modify: `costgrid.html` (replaces the `<div id="cgPhasingPanelPlaceholder">` placeholder from Task 2 with a Vue-rendered phasing table; makes `#cgNewVersionModal`/`#cgCloneModal` Vue-triggered; adds the currency-change confirmation flow)

**Interfaces:**
- Consumes: `data().draft` (Task 2); global unchanged functions `cgComputePhasing`, `cgCreateNewVersion`, `cgCloneGrid`, `cgPreviewRateChange`, `cgSyncRoleRatesToBaseline`, `cgAutoSave`.
- Produces: `methods.openNewVersionModal`/`openCloneModal` (referenced by Task 2's toolbar template, implemented here as promised); `computed.phasingMonths`/`phasingTotals` (internal to this task).

- [ ] **Step 1: Add the phasing panel computed properties and template**

`renderCgPhasing()` (`js/costgrid.js:1810-1931`) computed a month-by-month hours/budget table from `cgComputePhasing`-equivalent inline logic. Since that whole computation is pure (reads only `v.startDate`/`v.endDate`/`v.phases`/`v.roles`, no DOM), port it as a `computed` reading `this.draft`:

In `computed`, add:
```js
    phasingMonths() {
      const v = this.draft;
      if (!v?.startDate || !v?.endDate || v.startDate.length < 6 || v.endDate.length < 6) return [];
      const sy = parseInt(v.startDate.slice(0, 4)), sm = parseInt(v.startDate.slice(4, 6));
      const ey = parseInt(v.endDate.slice(0, 4)), em = parseInt(v.endDate.slice(4, 6));
      const months = [];
      let y = sy, m = sm;
      while (y < ey || (y === ey && m <= em)) {
        months.push(`${y}-${String(m).padStart(2, '0')}`);
        if (++m > 12) { m = 1; y++; }
      }
      return months;
    },
    phasingByMonth() {
      const months = this.phasingMonths;
      if (!months.length) return { hours: {}, amount: {} };
      const distribute = (hrs, taskStart, taskEnd) => {
        let allMonths;
        if (taskStart && taskEnd && taskStart.length >= 7) {
          const tsy = parseInt(taskStart.slice(0, 4)), tsm = parseInt(taskStart.slice(5, 7));
          const tey = parseInt(taskEnd.slice(0, 4)), tem = parseInt(taskEnd.slice(5, 7));
          allMonths = [];
          let ty = tsy, tm = tsm;
          while (ty < tey || (ty === tey && tm <= tem)) {
            allMonths.push(`${ty}-${String(tm).padStart(2, '0')}`);
            if (++tm > 12) { tm = 1; ty++; }
          }
        } else {
          allMonths = months;
        }
        if (!allMonths.length) return {};
        const hpp = parseFloat(hrs) / allMonths.length;
        const result = {};
        for (const mo of allMonths) if (mo >= months[0] && mo <= months[months.length - 1]) result[mo] = (result[mo] || 0) + hpp;
        return result;
      };
      const monthHours = {}, monthAmount = {};
      months.forEach(mo => { monthHours[mo] = 0; monthAmount[mo] = 0; });
      (this.draft.phases || []).forEach(ph => (ph.tasks || []).forEach(task => {
        (this.draft.roles || []).forEach(r => {
          const h = parseFloat(task.hours[r.roleCode]) || 0;
          if (!h) return;
          const dist = distribute(h, task.taskStartDate, task.taskEndDate);
          for (const [mo, hh] of Object.entries(dist)) {
            if (mo in monthHours) { monthHours[mo] += hh; monthAmount[mo] += hh * (r.rate || 0); }
          }
        });
      }));
      return { hours: monthHours, amount: monthAmount };
    },
    phasingTotals() {
      const { hours, amount } = this.phasingByMonth;
      const months = this.phasingMonths;
      return {
        totalAmt: months.reduce((s, mo) => s + (amount[mo] || 0), 0),
        totalH: months.reduce((s, mo) => s + (hours[mo] || 0), 0),
      };
    },
```

In `methods`, add the formatting helpers (kept separate from `fmtCur` — the phasing panel uses a plain `CUR 1,234` format, not the localized `cgFmtCurrency` symbol format, matching the original `renderCgPhasing()`'s own `fmtA`/`fmtH`/`fmtMo` exactly):
```js
    phasingFmtAmount(n) { return (this.draft.currency || 'EUR') + ' ' + Math.round(n).toLocaleString('en'); },
    phasingFmtHours(n) { return (Math.round(n * 10) / 10) + ' h'; },
    phasingFmtMonth(mo) {
      const [my, mm] = mo.split('-');
      return new Date(parseInt(my), parseInt(mm) - 1).toLocaleString('en', { month: 'short' }) + ' ' + my;
    },
```

- [ ] **Step 2: Replace the phasing panel placeholder with the Vue template**

In `costgrid.html`, find (from Task 2, Step 3):

```html
    <!-- Phasing panel: Task 5 -->
    <div id="cgPhasingPanelPlaceholder"></div>
```

Replace with:

```html
    <!-- Phasing panel -->
    <div v-if="phasingMonths.length" style="margin-top:2rem;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <div style="background:#0B1840;color:#fff;padding:.5rem 1rem;font-size:.82rem;font-weight:700;display:flex;align-items:center;justify-content:space-between">
        <span>📅 Monthly Phasing</span>
        <span style="font-weight:400;font-size:.75rem;color:#93c5fd">
          Total: {{ phasingFmtAmount(phasingTotals.totalAmt) }} · {{ phasingFmtHours(phasingTotals.totalH) }} · {{ phasingMonths.length }} month{{ phasingMonths.length !== 1 ? 's' : '' }}
        </span>
      </div>
      <div style="overflow-x:auto">
        <table style="border-collapse:collapse;width:100%">
          <thead>
            <tr style="background:#f8f9fa">
              <th style="text-align:left;padding:5px 10px;font-size:.75rem;font-weight:700;border-bottom:2px solid #dee2e6;white-space:nowrap">Metric</th>
              <th v-for="mo in phasingMonths" :key="'h-'+mo" style="text-align:right;padding:5px 8px;font-size:.75rem;font-weight:700;white-space:nowrap;min-width:90px;border-bottom:2px solid #dee2e6">{{ phasingFmtMonth(mo) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:5px 10px;font-size:.78rem;font-weight:700;white-space:nowrap">Budget ({{ draft.currency || 'EUR' }})</td>
              <td v-for="mo in phasingMonths" :key="'a-'+mo" style="text-align:right;padding:5px 8px;font-size:.78rem;font-weight:700;white-space:nowrap">{{ phasingFmtAmount(phasingByMonth.amount[mo] || 0) }}</td>
            </tr>
            <tr style="background:#fafbfc">
              <td style="padding:3px 10px;font-size:.72rem;color:#6b7280;white-space:nowrap">Hours</td>
              <td v-for="mo in phasingMonths" :key="'hr-'+mo" style="text-align:right;padding:3px 8px;font-size:.72rem;color:#6b7280;white-space:nowrap">{{ phasingFmtHours(phasingByMonth.hours[mo] || 0) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
```

- [ ] **Step 3: Make `#cgNewVersionModal`/`#cgCloneModal` Vue-triggered**

In `costgrid.html`, find the static `#cgNewVersionModal` markup (`:88-104`) and replace its input/error/button element bindings (keep the surrounding modal chrome and — per Global Constraint 8 — keep the exact `id`s so `cgCreateNewVersion()` stays unchanged):

```html
<div class="modal fade" id="cgNewVersionModal" tabindex="-1">
  <div class="modal-dialog modal-dialog-centered" style="max-width:400px">
    <div class="modal-content">
      <div class="modal-header border-0 pb-1"><h6 class="modal-title fw-bold">+ New version</h6><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body">
        <label class="form-label small fw-semibold mb-1">Version label</label>
        <input type="text" class="form-control form-control-sm" id="cgNewVersionLabel" placeholder="e.g. v2 client" autofocus>
        <div class="form-text">The new version will be a copy of the current one.</div>
        <div id="cgNewVersionError" class="text-danger small mt-2 d-none"></div>
      </div>
      <div class="modal-footer border-0 pt-0">
        <button class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
        <button class="btn btn-primary btn-sm" id="btnCgCreateVersion">Create</button>
      </div>
    </div>
  </div>
</div>
```

Note this markup does **not** change — the `<input id="cgNewVersionLabel">`/`<div id="cgNewVersionError">`/`<button id="btnCgCreateVersion">` stay plain (not `v-model`-bound, not inside the Vue mount root — `#cgNewVersionModal` is a sibling of `#costGridEditorSection`, outside it, matching the existing DOM structure) — `cgCreateNewVersion()` (kept unchanged) already reads/writes them directly via `document.getElementById`. What changes is only how the modal is **opened**: add to `methods`:

```js
    openNewVersionModal() {
      document.getElementById('cgNewVersionLabel').value = '';
      document.getElementById('cgNewVersionError').classList.add('d-none');
      bootstrap.Modal.getOrCreateInstance(document.getElementById('cgNewVersionModal')).show();
    },
    openCloneModal() {
      if (!this.cg) return;
      const ver = this.cg.versions.find(v => v.versionId === this.verId);
      _pbCloneSource = { cgId: this.cgId, verId: this.verId, name: this.cg.name };
      document.getElementById('cgCloneSourceName').textContent = this.cg.name + (ver?.versionLabel ? ' — ' + ver.versionLabel : '');
      document.getElementById('cgCloneGridName').value = this.cg.name + ' — Copy';
      document.getElementById('cgCloneError').classList.add('d-none');
      bootstrap.Modal.getOrCreateInstance(document.getElementById('cgCloneModal')).show();
    },
```

In `created()`, after `_cgVueApp = this;` and the initial `openVersion(...)` call, wire the two modals' static buttons (these listeners are attached once, on mount — matching how `pipeline.html`'s `created()` wires `#btnCgCreateGrid`/`#btnCgClone` the same way):

```js
    document.getElementById('cgNewVersionModal').addEventListener('shown.bs.modal', () => {
      document.getElementById('cgNewVersionLabel').focus();
    });
    document.getElementById('btnCgCreateVersion').addEventListener('click', cgCreateNewVersion);
    document.getElementById('cgCloneModal').addEventListener('shown.bs.modal', () => {
      document.getElementById('cgCloneGridName').focus();
    });
    document.getElementById('btnCgClone').addEventListener('click', cgCloneGrid);
```

- [ ] **Step 4: Port the currency-change confirmation flow as `onCurrencyChange()`**

Add to `methods` (ports `js/costgrid.js:1202-1301`'s dynamic modal verbatim, using `cgPreviewRateChange`/`cgSyncRoleRatesToBaseline` unchanged):

```js
    onCurrencyChange() {
      const newCurrency = this.draft.currency;
      const prevCurrency = this.prevCurrency;
      if (newCurrency === prevCurrency) return;

      if (!this.draft.roles?.length) {
        cgSyncRoleRatesToBaseline(true);
        this.prevCurrency = newCurrency;
        this.$forceUpdate();
        cgAutoSave();
        return;
      }

      const preview = cgPreviewRateChange(newCurrency);
      const newEntry = (this.currencies || []).find(c => c.code === newCurrency);
      const prevEntry = (this.currencies || []).find(c => c.code === prevCurrency);
      const newSym = newEntry?.symbol || newCurrency;
      const prevSym = prevEntry?.symbol || prevCurrency;
      const fmtR = (n, sym) => `${sym} ${Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const hasCustom = preview.some(r => r.isCustom);
      const roleRows = preview.map(r =>
        `<tr>
          <td style="padding:3px 8px;font-size:.82rem">${esc(r.roleLabel)}</td>
          <td style="padding:3px 8px;font-size:.82rem;text-align:right;color:#6b7280">${fmtR(r.currentRate, prevSym)}</td>
          <td style="padding:3px 8px;font-size:.82rem;text-align:right;font-weight:600">${fmtR(r.newRate, newSym)}</td>
          ${r.isCustom ? `<td style="padding:3px 8px;font-size:.75rem;color:#dc3545">custom → reset</td>` : '<td></td>'}
        </tr>`
      ).join('');

      const modalId = 'cgCurrencyChangeModal';
      let modalEl = document.getElementById(modalId);
      if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = modalId;
        modalEl.className = 'modal fade';
        modalEl.tabIndex = -1;
        modalEl.innerHTML = `
          <div class="modal-dialog modal-dialog-centered" style="max-width:480px">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title" style="font-size:var(--text-base)">Change currency to ${esc(newCurrency)}?</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body" id="${modalId}Body"></div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary btn-sm" id="${modalId}Cancel">Cancel</button>
                <button type="button" class="btn btn-primary btn-sm" id="${modalId}Confirm">Change to ${esc(newCurrency)}</button>
              </div>
            </div>
          </div>`;
        document.body.appendChild(modalEl);
      } else {
        modalEl.querySelector('.modal-title').textContent = `Change currency to ${newCurrency}?`;
        document.getElementById(`${modalId}Confirm`).textContent = `Change to ${newCurrency}`;
      }

      document.getElementById(`${modalId}Body`).innerHTML = `
        <p style="font-size:var(--text-sm);margin-bottom:8px">
          All role rates will be reset to their <strong>${esc(newCurrency)} baseline</strong>.
          ${hasCustom ? '<span style="color:#dc3545">Custom rates will be lost.</span>' : ''}
        </p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #dee2e6;border-radius:4px;overflow:hidden">
          <thead style="background:#f1f3f5">
            <tr>
              <th style="padding:4px 8px;font-size:.75rem;font-weight:600;text-align:left">Role</th>
              <th style="padding:4px 8px;font-size:.75rem;font-weight:600;text-align:right">Current (${esc(prevCurrency)})</th>
              <th style="padding:4px 8px;font-size:.75rem;font-weight:600;text-align:right">New (${esc(newCurrency)})</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${roleRows}</tbody>
        </table>`;

      const bsModal = new bootstrap.Modal(modalEl);
      bsModal.show();

      document.getElementById(`${modalId}Cancel`).onclick = () => {
        bsModal.hide();
        this.draft.currency = prevCurrency; // revert — a genuine Vue-driven mutation, no forceUpdate needed
      };
      document.getElementById(`${modalId}Confirm`).onclick = () => {
        bsModal.hide();
        cgSyncRoleRatesToBaseline(true); // mutates _cgDraft.roles[].rate in place — this.draft IS _cgDraft
        this.prevCurrency = newCurrency;
        this.$forceUpdate();
        cgAutoSave();
      };
      modalEl.addEventListener('hidden.bs.modal', () => {
        if (this.draft.currency !== prevCurrency && this.prevCurrency === prevCurrency) {
          this.draft.currency = prevCurrency;
        }
      }, { once: true });
    },
```

This replaces the earlier `@change="onCurrencyChange"` binding on `#cgCurrency` from Task 2's template (already wired there — no template change needed in this step, only the method's implementation, which was left undefined until now).

- [ ] **Step 5: Run the test suite**

```bash
npm test
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add costgrid.html
git commit -m "feat(costgrid): phasing panel, New Version/Clone modals, currency-change confirmation"
```

---

### Task 6: Role Selector modal (Vue-triggered) + dead-modal removal

**Files:**
- Modify: `costgrid.html` (makes `#cgRoleSelectModal` Vue-reactive; deletes `#rolesModal`, `#roleModal`, `#programsModal`, `#programEditModal`, `#clientsModal`, `#clientEditModal` markup and their now-dead inline-script wiring; drops the `js/roles.js`/`js/clients.js`/`js/programs.js` `<script>` tags)
- Modify: `planning.html` (deletes `#rolesModal:165-184`, `#roleModal:187-200`, and the `js/roles.js:216`/`js/clients.js:222`/`js/programs.js:223` `<script>` tags — same dead-code pattern, confirmed independently)
- Modify: `js/costgrid.js` (deletes `cgApplyEditorLock`, `cgBindEditorEvents`, `cgRefreshTotals`, `cgRefreshPhaseDates`, `cgRenderRoleList`, `cgFindTask` — all fully unreachable now that Tasks 2-6 have ported every caller's logic into Vue; rewrites `openCgRoleSelectModal`'s DOM-manipulation body as a thin bridge to the Vue modal)

**Interfaces:**
- Consumes: `js/lib/costgrid-calc.js`'s `resolveRoleRate` (Task 1); `data().ratecardMap`/`ratecardOverrides`/`isClientRatecard`/`allRatecards` (Task 2); global unchanged `cgAddSelectedRoles`, `getRoles`, `cgUpdateActiveRatecardMap`.
- Produces: `methods.openRoleModal(mode, sourceRoleCode)` (consumed by Task 3's `addRoleColumn`/`changeRole`/`duplicateRole`, previously calling an undefined stub); `methods.confirmRoleSelection()`.

- [ ] **Step 1: Verify the dead-modal claim independently before deleting anything**

```bash
grep -n "showRolesView\|showClientsView\|showProgramsView\|btnRolesView\|main\.js" *.html
```
Expected: no matches (confirms the design spec's investigation finding — these modals' only openers live in `js/main.js`, which no current HTML page loads).

```bash
grep -n "rolesModal\|roleModal\|programsModal\|programEditModal\|clientsModal\|clientEditModal" planning.html
```
Expected: matches only `#rolesModal` (`:165`) and `#roleModal` (`:187`) — `planning.html` never had `#programsModal`/`#clientsModal` markup to begin with.

- [ ] **Step 2: Delete the 6 dead modals + 3 script tags from `costgrid.html`**

Delete the following blocks entirely from `costgrid.html`:
- `<!-- Roles Registry -->` / `#rolesModal` (`:152-171`)
- `<!-- Role Edit -->` / `#roleModal` (`:174-187`)
- `<!-- Programs -->` / `#programsModal` (`:209-222`)
- `<!-- Program Edit -->` / `#programEditModal` (`:225-237`)
- `<!-- Clients -->` / `#clientsModal` (`:240-253`)
- `<!-- Client Edit -->` / `#clientEditModal` (`:256-267`)

And remove these three lines from the script list (added back in Task 2, Step 1 — they were never needed once these modals are gone):
```html
<script src="js/roles.js"></script>
<script src="js/clients.js"></script>
<script src="js/programs.js"></script>
```

Confirm no remaining references:
```bash
grep -n "rolesModal\|roleModal\|programsModal\|programEditModal\|clientsModal\|clientEditModal\|js/roles.js\|js/clients.js\|js/programs.js" costgrid.html
```
Expected: no matches. (`showClientsModal()` — the "+ New" button next to the Client dropdown, Task 2 — was already confirmed in the design's investigation to be a separate, live function unrelated to the dead `#clientsModal` registry; it opens a different, still-reachable flow and is unaffected. If this grep unexpectedly surfaces a reference to it, stop and re-verify before proceeding — it means the earlier investigation's scope boundary was misread.)

- [ ] **Step 3: Delete the same 2 dead modals + 3 script tags from `planning.html`**

Delete `#rolesModal` (`:165-184`) and `#roleModal` (`:187-200`), and remove:
```html
<script src="js/roles.js"></script>
```
```html
<script src="js/clients.js"></script>
<script src="js/programs.js"></script>
```
(`planning.html`'s own `loadRolesFromApi()`/`loadClientsFromApi()`/`loadProgramsFromApi()` calls live in `js/api-sync.js`, not in these three files, so they are unaffected — confirmed in the design spec's investigation.)

```bash
grep -n "rolesModal\|roleModal\|js/roles.js\|js/clients.js\|js/programs.js" planning.html
```
Expected: no matches.

- [ ] **Step 4: Make `#cgRoleSelectModal` Vue-reactive**

Add to `data()`:
```js
      roleModalMode: 'add', roleModalSourceCode: null, roleSearch: '', roleActiveTeam: '', roleAllRoles: [], roleRcName: '',
```

Add to `computed`:
```js
    roleModalTeams() {
      const teams = [...new Set(this.roleAllRoles.map(r => r.code.indexOf(' - ') > 0 ? r.code.slice(0, r.code.indexOf(' - ')).trim() : '—'))].sort();
      return ['', ...teams];
    },
    roleModalCurrentCodes() {
      const codes = new Set(this.draft.roles.map(r => r.roleCode));
      if (this.roleModalMode === 'change' && this.roleModalSourceCode) codes.delete(this.roleModalSourceCode);
      return codes;
    },
    roleModalFilteredGroups() {
      let filtered = this.roleAllRoles;
      if (this.roleActiveTeam) {
        filtered = filtered.filter(r => (r.code.indexOf(' - ') > 0 ? r.code.slice(0, r.code.indexOf(' - ')).trim() : '—') === this.roleActiveTeam);
      }
      if (this.roleSearch.trim()) {
        const q = this.roleSearch.trim().toLowerCase();
        filtered = filtered.filter(r => r.label.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
      }
      const groups = {};
      filtered.forEach(r => {
        const team = r.code.indexOf(' - ') > 0 ? r.code.slice(0, r.code.indexOf(' - ')).trim() : '—';
        if (!groups[team]) groups[team] = [];
        groups[team].push(r);
      });
      return Object.entries(groups).sort(([a],[b]) => a.localeCompare(b)).map(([team, roles]) => ({
        team, roles: roles.slice().sort((a,b) => a.label.localeCompare(b.label)).map(r => this.roleModalRoleRow(r)),
      }));
    },
```

Add to `methods`:
```js
    roleModalRoleRow(r) {
      const already = this.roleModalCurrentCodes.has(r.code);
      const currency = this.draft?.currency || 'EUR';
      const currencyRate = parseFloat((this.currencies || []).find(c => c.code === currency)?.current_rate) || 1.0;
      const resolved = resolveRoleRate({
        roleId: r.id, globalRate: r.rate || 0, currency, currencyRate,
        ratecardMap: this.ratecardMap, ratecardOverrides: this.ratecardOverrides, roleOverrides: r.rateOverrides || {},
      });
      const rcRate = this.ratecardMap[String(r.id)];
      return {
        ...r,
        already,
        effectiveRate: resolved.effectiveRate,
        curSym: (this.currencies || []).find(c => c.code === currency)?.symbol || '€',
        hasOverride: resolved.isOverride,
        hasCustom: this.isClientRatecard && rcRate !== undefined && rcRate !== (r.rate || 0),
        zeroRate: !resolved.effectiveRate || resolved.effectiveRate === 0,
        isSingleMode: this.roleModalMode === 'change' || this.roleModalMode === 'duplicate',
        isSource: r.code === this.roleModalSourceCode,
      };
    },
    async openRoleModal(mode, sourceRoleCode) {
      this.roleModalMode = mode || 'add';
      this.roleModalSourceCode = sourceRoleCode || null;
      this.roleAllRoles = getRoles();
      this.roleActiveTeam = '';
      this.roleSearch = '';
      await cgUpdateActiveRatecardMap();
      this.ratecardMap = { ..._cgActiveRatecardMap };
      this.ratecardOverrides = { ..._cgActiveRatecardOverrides };
      this.isClientRatecard = _cgIsClientRatecard;
      this.roleRcName = '';
      const rcId = this.draft?.ratecardId;
      if (rcId) {
        const rc = this.allRatecards.find(r => String(r.id) === String(rcId));
        if (rc) this.roleRcName = rc.name;
      }
      bootstrap.Modal.getOrCreateInstance(document.getElementById('cgRoleSelectModal')).show();
      this.$nextTick(() => document.getElementById('cgRoleSearch')?.focus());
    },
    confirmRoleSelection() { cgAddSelectedRoles(); },
```

Find the static `#cgRoleSelectModal` markup (`costgrid.html:129-149`):

```html
<!-- Role Selector -->
<div class="modal fade" id="cgRoleSelectModal" tabindex="-1">
  <div class="modal-dialog modal-dialog-centered" style="max-width:760px">
    <div class="modal-content">
      <div class="modal-header border-0 pb-1"><h6 class="modal-title fw-bold">👥 Add roles</h6><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body">
        <div class="mb-3">
          <input type="text" id="cgRoleSearch" class="form-control form-control-sm mb-2" placeholder="Search by name or code...">
          <div id="cgRoleTeamFilters" class="d-flex flex-wrap gap-1"></div>
        </div>
        <p class="small text-muted mb-2">Roles already added are disabled.</p>
        <div id="cgRoleSelectList" style="max-height:460px;overflow-y:auto"></div>
        <div id="cgRoleSelectEmpty" class="text-muted small text-center py-3 d-none">No roles available. Configure them in <strong>⚙ Config → Roles</strong>.</div>
      </div>
      <div class="modal-footer border-0 pt-0">
        <button class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
        <button class="btn btn-primary btn-sm" id="btnCgAddSelectedRoles">Add selected</button>
      </div>
    </div>
  </div>
</div>
```

Replace with (this modal is a sibling of `#costGridEditorSection`, **outside** the Vue mount root, exactly like `#cgNewVersionModal`/`#cgCloneModal` — but since it now needs live Vue bindings, mount a **second, independent** `Vue.createApp` instance on it in Step 5, matching the "outside the primary mount root but still Vue-reactive" pattern used for cases like this in prior migrations):

```html
<!-- Role Selector -->
<div class="modal fade" id="cgRoleSelectModal" tabindex="-1">
  <div class="modal-dialog modal-dialog-centered" style="max-width:760px">
    <div class="modal-content">
      <div class="modal-header border-0 pb-1"><h6 class="modal-title fw-bold">{{ roleModalMode === 'change' ? '⇄ Change role' : roleModalMode === 'duplicate' ? '⊕ Duplicate column' : '👥 Add roles' }}</h6><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body">
        <div class="mb-3">
          <input type="text" id="cgRoleSearch" class="form-control form-control-sm mb-2" placeholder="Search by name or code..." v-model="roleSearch">
          <div class="d-flex flex-wrap gap-1">
            <button v-for="t in roleModalTeams" :key="t || 'All'" type="button" class="btn btn-sm py-0 px-2" :class="roleActiveTeam === t ? 'btn-primary' : 'btn-outline-secondary'" style="font-size:var(--text-sm)" @click="roleActiveTeam = t">{{ t || 'All' }}</button>
          </div>
        </div>
        <p class="small text-muted mb-2">
          {{ roleModalMode === 'add' ? 'Roles already added are disabled.' : 'Select a single role. Roles already in the grid are disabled.' }}
          <span v-if="roleRcName" style="color:var(--indigo-600,#4f46e5)">&#10022; Custom rates from <strong>{{ roleRcName }}</strong> applied.</span>
        </p>
        <div style="max-height:460px;overflow-y:auto">
          <div v-if="!roleAllRoles.length" class="text-muted small text-center py-3">No roles available. Configure them in <strong>⚙ Config → Roles</strong>.</div>
          <div v-else-if="!roleModalFilteredGroups.length" class="text-muted small text-center py-3">No results.</div>
          <div v-for="g in roleModalFilteredGroups" :key="g.team" class="mb-2">
            <div style="font-size:var(--text-xs);font-weight:700;color:var(--indigo-500);text-transform:uppercase;letter-spacing:.04em;padding:2px 0 4px">{{ g.team }}</div>
            <div v-for="row in g.roles" :key="row.code" class="form-check mb-1" :style="row.hasCustom && !row.already ? 'background:#f5f3ff;border-radius:4px;' : ''">
              <input class="form-check-input cg-role-checkbox" :type="row.isSingleMode ? 'radio' : 'checkbox'"
                :id="'cgrc_' + row.id" :value="row.code" :data-label="row.label" :data-rate="row.effectiveRate"
                :name="row.isSingleMode ? 'cgRoleSelectSingle' : null" :disabled="row.already">
              <label class="form-check-label" :for="'cgrc_' + row.id" :style="row.already ? 'color:var(--text-disabled)' : ''">
                <strong style="font-size:var(--text-md)">{{ row.label }}</strong>
                <span class="text-muted ms-1" style="font-size:var(--text-sm)">{{ row.code }}</span>
                <span v-if="row.zeroRate" class="ms-1 badge" style="background:#fff0f0;color:var(--color-danger);font-size:var(--text-xs)">⚠️ 0/h</span>
                <span v-else-if="row.hasOverride || row.hasCustom" class="ms-1 badge" style="background:#eef2ff;color:#4f46e5;border:1px solid #c7d2fe;font-size:var(--text-xs)">&#10022; {{ row.effectiveRate }} {{ row.curSym }}/h</span>
                <span v-else class="ms-1 badge" style="background:var(--sand-50);color:#666;font-size:var(--text-xs)">{{ row.effectiveRate }} {{ row.curSym }}/h</span>
                <span v-if="row.isSource" class="ms-1 badge" style="background:var(--text-muted);color:#fff;font-size:var(--text-xs)">current</span>
                <span v-if="row.already && !row.isSource" class="ms-1 text-muted" style="font-size:var(--text-xs)">(already added)</span>
              </label>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer border-0 pt-0">
        <button class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
        <button class="btn btn-primary btn-sm" id="btnCgAddSelectedRoles" @click="confirmRoleSelection">Add selected</button>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 5: Mount `#cgRoleSelectModal` on the SAME Vue instance as `#costGridEditorSection`**

This modal is a DOM sibling of `#costGridEditorSection` (outside it), but Vue templates only render `v-model`/`{{ }}`/`v-for` inside their own mount root's subtree. Rather than introduce a second `Vue.createApp` instance (a genuinely new pattern this codebase has never used, and unnecessary complexity for one modal), move `#cgRoleSelectModal`'s markup to be a **child of `#costGridEditorSection`**, appended right after the closing `</template>` tag added in Task 2 (Vue 3 supports multiple root-level siblings under one mount element — the `v-if="loading"`/`v-else-if="loadError"`/`<template v-else>` block and this modal can coexist as two top-level children of `#costGridEditorSection`):

Find, in `costgrid.html`, the end of `#costGridEditorSection` (from Task 2, Step 3's replacement, immediately before its own closing `</div>`):
```html
    <!-- Phasing panel -->
    <div v-if="phasingMonths.length" ...>
      ...
    </div>
  </template>
</div>
```

Replace with (moves `#cgRoleSelectModal`'s full markup from Step 4 here, as a sibling of `<template v-else>`, still inside `#costGridEditorSection`):
```html
    <!-- Phasing panel -->
    <div v-if="phasingMonths.length" ...>
      ...
    </div>
  </template>

  <!-- Role Selector (see Task 6, Step 4 for full markup) -->
  <div class="modal fade" id="cgRoleSelectModal" tabindex="-1">
    ...
  </div>
</div>
```

Delete the now-duplicate static `#cgRoleSelectModal` block that used to sit among the other modals (`costgrid.html:129-149`'s original location) — it now lives solely inside `#costGridEditorSection` as shown above.

- [ ] **Step 6: Rewrite `openCgRoleSelectModal` in `js/costgrid.js` as a bridge, delete now-dead functions**

Find (`js/costgrid.js:1479-1559`, the full `openCgRoleSelectModal` function) and replace with:
```js
function openCgRoleSelectModal(mode, sourceRoleCode) {
  if (_cgVueApp) _cgVueApp.openRoleModal(mode, sourceRoleCode);
}
```

(this keeps the identifier alive as a bridge purely for symmetry/documentation — nothing in the ported Vue template calls it anymore, since Task 3's `addRoleColumn`/`changeRole`/`duplicateRole` call `this.openRoleModal(...)` directly; no other file calls `openCgRoleSelectModal` today, confirmed by `grep -rn "openCgRoleSelectModal" js/ *.html`.)

Delete the following now-fully-unreachable functions from `js/costgrid.js` (each was called only from `renderCgEditor()`'s old body via `cgBindEditorEvents`, or from `openCgRoleSelectModal`'s old body — all replaced by Task 2-6's Vue code). **Line numbers below are from the original pre-migration file and no longer match — Task 2's replacement of `renderCgEditor()` (originally 521 lines, now 3) and Task 1's relocation of the totals functions have both shifted everything after them upward by several hundred lines. Locate each by its exact function signature (e.g. search for the literal text `function cgBindEditorEvents(body) {`), not by the stale line number, then delete from that line through its matching closing `}`:**
- `cgApplyEditorLock` (originally `:889-896`) — starts at `function cgApplyEditorLock(body) {`
- `cgBindEditorEvents` (originally `:900-1329`) — starts at `function cgBindEditorEvents(body) {`
- `cgRefreshTotals` (originally `:1937-2013`) — starts at `function cgRefreshTotals() {`
- `cgRefreshPhaseDates` (originally `:88-101`) — starts at `function cgRefreshPhaseDates() {`
- `cgRenderRoleList` (originally `:1561-1640`) — starts at `function cgRenderRoleList() {`
- `cgFindTask` (originally `:2855-2858`) — starts at `function cgFindTask(phaseId, taskId) {`

```bash
grep -n "cgApplyEditorLock\|cgBindEditorEvents\|cgRefreshTotals\|cgRefreshPhaseDates\|cgRenderRoleList\|cgFindTask" js/costgrid.js *.html
```
Expected: no matches (confirms every deleted function had zero remaining callers).

- [ ] **Step 7: Run the test suite**

```bash
npm test
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add costgrid.html planning.html js/costgrid.js
git commit -m "feat(costgrid): Vue-reactive role selector modal, delete dead registry modals + dead rendering code"
```

---

### Task 7: Bug fixes — Clone `duplicate key` error (TDD) + New Proposal flow (characterize first)

**Files:**
- Modify: `js/lib/costgrid-calc.js` (adds `stripCloneTaskIds`)
- Modify: `js/lib/costgrid-calc.test.js` (adds its tests)
- Modify: `js/costgrid.js:2218-2307` (`cgCloneGrid()` — strips IDs before `saveStructure`, then re-fetches the server-assigned structure before opening the editor)
- Modify: `costgrid.html`, `pipeline.html`, `planning.html` (final cache-bust bump for this cycle's `js/costgrid.js`/`js/lib/costgrid-calc.js` changes)

**Interfaces:**
- Consumes: nothing from earlier tasks beyond what's already wired.
- Produces: `stripCloneTaskIds(phases)` → phases array with `taskId`/`phaseId` removed from every phase/task, all other fields preserved.

#### Part A — Clone `duplicate key value violates unique constraint "tasks_pkey"` (root cause already confirmed in the design spec)

Root cause (confirmed by reading `api/src/routes/cost-grids.js:600-609`): `cgCloneGrid()` sends the *source* version's real `taskId`/`phaseId` UUIDs to `saveStructure()` for the brand-new version. The backend's `PUT /:id/versions/:vId/structure` handler reuses a supplied `taskId` as the new row's primary key when present (`INSERT INTO tasks (id, ...)`) — correct for normal same-version re-saves, wrong for Clone, since the source version's tasks still exist in the DB under those exact IDs.

- [ ] **Step 1: Write the failing tests**

Add to `js/lib/costgrid-calc.test.js`:
```js
import { stripCloneTaskIds } from './costgrid-calc.js';

describe('stripCloneTaskIds', () => {
  it('removes phaseId and taskId from every phase/task while keeping other fields', () => {
    const phases = [
      { phaseId: 'ph1', phaseName: 'Phase 1', tasks: [
        { taskId: 't1', taskName: 'Design', hours: { PM: 10 }, ptc: 50 },
        { taskId: 't2', taskName: 'Build', hours: {} },
      ] },
    ];
    const result = stripCloneTaskIds(phases);
    expect(result).toEqual([
      { phaseName: 'Phase 1', tasks: [
        { taskName: 'Design', hours: { PM: 10 }, ptc: 50 },
        { taskName: 'Build', hours: {} },
      ] },
    ]);
  });

  it('does not mutate the input array or its objects', () => {
    const phases = [{ phaseId: 'ph1', phaseName: 'Phase 1', tasks: [{ taskId: 't1', taskName: 'Design' }] }];
    const before = JSON.parse(JSON.stringify(phases));
    stripCloneTaskIds(phases);
    expect(phases).toEqual(before);
  });

  it('handles a phase with no tasks', () => {
    expect(stripCloneTaskIds([{ phaseId: 'ph1', phaseName: 'Empty', tasks: [] }]))
      .toEqual([{ phaseName: 'Empty', tasks: [] }]);
  });

  it('handles an empty/undefined phases array', () => {
    expect(stripCloneTaskIds([])).toEqual([]);
    expect(stripCloneTaskIds(undefined)).toEqual([]);
  });

  it('handles a phase whose tasks array is missing entirely', () => {
    expect(stripCloneTaskIds([{ phaseId: 'ph1', phaseName: 'No tasks key' }]))
      .toEqual([{ phaseName: 'No tasks key', tasks: [] }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- costgrid-calc`
Expected: FAIL — `stripCloneTaskIds` is not exported from `./costgrid-calc.js` yet.

- [ ] **Step 3: Implement `stripCloneTaskIds`**

Add to `js/lib/costgrid-calc.js`:
```js
// ── CLONE BUG FIX ─────────────────────────────────────────────────────────────
// Strips server-assigned taskId/phaseId before a cloned structure is POSTed to
// saveStructure() for a brand-new version — otherwise the backend's PUT
// /:id/versions/:vId/structure handler reuses the supplied taskId as the new
// row's primary key (correct for a same-version re-save, wrong here: the SOURCE
// version's tasks still exist in the DB under those exact IDs), causing
// `duplicate key value violates unique constraint "tasks_pkey"`.
export function stripCloneTaskIds(phases) {
  return (phases || []).map(ph => {
    const { phaseId, ...phRest } = ph;
    return { ...phRest, tasks: (ph.tasks || []).map(t => { const { taskId, ...tRest } = t; return tRest; }) };
  });
}

window.stripCloneTaskIds = stripCloneTaskIds;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- costgrid-calc`
Expected: PASS.

- [ ] **Step 5: Apply the fix in `cgCloneGrid()`, and re-fetch the server-assigned structure before opening the editor**

Find (`js/costgrid.js`, inside `cgCloneGrid()`):
```js
    // 2. Copy phase/task/role structure
    await Api.costGrids.versions.saveStructure(cgId, verId, {
      phases: srcVer.phases || [],
      roles:  srcVer.roles  || [],
    });

    // 3. Seed in-memory store
    const cg = {
      id: cgId,
      name,
      versions: [{
        versionId:      verId,
        versionLabel:   'v1',
        createdAt:      new Date().toISOString(),
        status:         'draft',
        pipeline:       'Draft',
        pipelineYear:   null,
        linkedProjects: [],
        projectName:    name,
        clientId:       srcVer.clientId    || null,
        ratecardId:     srcVer.ratecardId  || null,
        startDate:      srcVer.startDate   || '',
        endDate:        srcVer.endDate     || '',
        currency:       srcVer.currency    || 'EUR',
        note:           srcVer.note        || '',
        roles:          JSON.parse(JSON.stringify(srcVer.roles  || [])),
        phases:         JSON.parse(JSON.stringify(srcVer.phases || [])),
      }],
    };
    const idx = cgGetIndex();
    if (!idx.includes(cgId)) idx.push(cgId);
    cgSaveIndex(idx);
    cgSave(cg);

    bootstrap.Modal.getInstance(document.getElementById('cgCloneModal'))?.hide();
    showCostGridEditorView(cgId, verId);
```

Replace with (strips IDs before the save so the backend mints fresh UUIDs, then **re-fetches** the structure it just saved — without this, the in-memory seed below would still hold the *source's* stale `taskId`s, and the very first autosave after opening the clone would resend them, immediately reproducing the same `duplicate key` error on save #1 of the new version):
```js
    // 2. Copy phase/task/role structure — strip taskId/phaseId so the backend mints fresh UUIDs
    //    instead of reusing the source version's (still-live) ones (see stripCloneTaskIds above).
    await Api.costGrids.versions.saveStructure(cgId, verId, {
      phases: stripCloneTaskIds(srcVer.phases || []),
      roles:  srcVer.roles  || [],
    });

    // 3. Seed in-memory store with header fields only — phases/roles (with the server's
    //    real new IDs) are filled in by cgLoadStructureFromApi() right after, so nothing in
    //    memory ever holds the source version's stale taskIds (which would otherwise be
    //    resent, and fail the same way, on the very first autosave of the new clone).
    const cg = {
      id: cgId,
      name,
      versions: [{
        versionId:      verId,
        versionLabel:   'v1',
        createdAt:      new Date().toISOString(),
        status:         'draft',
        pipeline:       'Draft',
        pipelineYear:   null,
        linkedProjects: [],
        projectName:    name,
        clientId:       srcVer.clientId    || null,
        ratecardId:     srcVer.ratecardId  || null,
        startDate:      srcVer.startDate   || '',
        endDate:        srcVer.endDate     || '',
        currency:       srcVer.currency    || 'EUR',
        note:           srcVer.note        || '',
        roles:          JSON.parse(JSON.stringify(srcVer.roles || [])),
        phases:         [],
      }],
    };
    const idx = cgGetIndex();
    if (!idx.includes(cgId)) idx.push(cgId);
    cgSaveIndex(idx);
    cgSave(cg);
    await cgLoadStructureFromApi(cgId, verId);

    bootstrap.Modal.getInstance(document.getElementById('cgCloneModal'))?.hide();
    showCostGridEditorView(cgId, verId);
```

- [ ] **Step 6: Manually verify the fix**

1. Open an existing proposal in `costgrid.html` with at least one phase/task (so its structure is loaded into memory — the exact precondition the bug report specified).
2. Click **⧉ Clone**, enter a name, confirm.
3. Expected: no `duplicate key value violates unique constraint "tasks_pkey"` error; the new proposal opens with the same phases/tasks/roles as the source.
4. Edit any field in the newly-cloned proposal (e.g. a task's hours) and wait for autosave (or click **💾 Save**).
5. Expected: the save succeeds with no error — this specifically exercises the "resend stale taskIds on first save" regression the re-fetch in Step 5 prevents.

- [ ] **Step 7: Run the full test suite**

```bash
npm test
```
Expected: PASS.

#### Part B — "New Proposal" flow (characterize before fixing)

Per Global Constraint 11, the reported breakage (`cgCreateNewGrid()`, triggered from `pipeline.html`'s "+ New Proposal" button) has never been reproduced or root-caused. Static reading of `cgCreateNewGrid()` (`js/costgrid.js:2160-2214`), `showCostGridEditorView`'s redirect override on `pipeline.html`, and `costgrid.html`'s cold-load init path found no confirmed defect — every step (`POST /api/cost-grids` → `POST /api/cost-grids/:id/versions` → `PUT .../structure` → redirect to `costgrid.html?cgId=...&verId=...` → `cgSyncFromApi()` → `cgLoad(cgId)` → `cgLoadStructureFromApi()` → open editor) appears internally consistent. This step characterizes actual behavior before any change is made.

- [ ] **Step 1: Manual reproduction procedure (run this exactly, on the pre-fix branch, before writing any code)**

1. Open `pipeline.html` in a browser with DevTools open (Network tab, "Preserve log" checked; Console tab visible in a second pane or split view).
2. Click **+ New Proposal**. Enter a name (e.g. "Characterization Test"), click **Create**.
3. In the Network tab, record, in order: the response status and body of `POST /api/cost-grids`, `POST /api/cost-grids/:id/versions`, `PUT /api/cost-grids/:id/versions/:vId/structure`.
4. Record the exact URL the browser navigates to (check the address bar and/or the `Location`-equivalent — this is a client-side `window.location.href` redirect, not a server redirect, so check the URL bar directly after the click).
5. On the page that loads, record: any red errors in the Console; whether the editor shows the new proposal's name/phases, an "access denied"/"not found" message, or a blank/stuck loading state; the final resolved `cgId`/`verId` query params in the URL bar.
6. Repeat steps 2-5 once more with a **second** browser tab already open on `pipeline.html` at the same time (tests for any session/race condition specific to concurrent tabs, since New Proposal was reported as intermittent).

- [ ] **Step 2: Log the observed outcome in the PR/commit description verbatim** (do not summarize away specifics — exact status codes, exact URL, exact console text) before proceeding to Step 3.

- [ ] **Step 3: Apply the fix matching the confirmed outcome — do not apply more than one of these**

- **If the URL after redirect has a literal `cgId=undefined` or `verId=undefined` (or is missing one of the two params entirely):** the defect is a timing/ordering bug in `cgCreateNewGrid()`'s tail call sequence. Fix: in `js/costgrid.js`'s `cgCreateNewGrid()`, confirm `cgId`/`verId` are captured from the resolved `newCg.id`/`newVer.id` (not from a variable that could still be `undefined` at the point `showCostGridEditorView(cgId, verId)` is called) and that the call happens strictly after `cgSave(cg)` — add a one-line `console.assert(cgId && verId, '...')` guard immediately before the `showCostGridEditorView` call as a permanent regression guard, then re-run Step 1's repro to confirm the URL is now well-formed.
- **If `costgrid.html` shows "Cost grid not found or access denied":** the defect is a read-after-write consistency gap — `cgSyncFromApi()` (called on `costgrid.html`'s cold load) is racing the `POST /api/cost-grids` transaction, or the new grid's owner/share row isn't visible yet under the requesting user's session. Fix: in `costgrid.html`'s `created()` (Task 2), if `cgLoad(cgId)` returns null on the very first attempt, retry `cgSyncFromApi()` once (not looped indefinitely) before showing the error — this converts a hard race into a self-healing one-retry path. Add this as an explicit `if (!cgRec) { await cgSyncFromApi(); cgRec = cgLoad(cgId); }` immediately before the existing `if (!cgRec) { this.loadError = ...}` check in `created()`.
- **If the editor opens correctly with the right name/phases and no error:** the bug is not reproducible as described; do not add a speculative fix. Instead, add a short note to this cycle's finish-cycle report stating it was not reproduced after N attempts (single-tab and multi-tab), matching this project's process for previously-reported-but-unconfirmed issues (see the `pipeline.html` cycle's "Publish — 'Only Draft versions can be published'" precedent, flagged as awareness-only rather than fixed).

- [ ] **Step 4: Add a regression check for whichever branch of Step 3 applied**

If Step 3's first or second branch applied, manually re-run the full Step 1 procedure (both single-tab and multi-tab variants) twice more after the fix to confirm it no longer reproduces. If the third branch applied, no regression check is needed (no code changed).

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```
Expected: PASS.

#### Part C — Cache-bust bump (final content-changing step of this cycle)

- [ ] **Step 6: Bump `js/costgrid.js`'s cache-busting version on every page that loads it**

In `costgrid.html`, `pipeline.html`, `planning.html`, find:
```html
<script src="js/costgrid.js?v=26"></script>
```
(or `?v=3` on `pipeline.html`/`planning.html` — same file, different pre-existing version numbers per page, per this project's established per-page cache-bust convention)

Replace with `?v=27` (`costgrid.html`) and `?v=4` (`pipeline.html`, `planning.html`) respectively — bump each page's own counter by 1, reflecting every `js/costgrid.js` edit made across Tasks 1-7.

Also bump `js/lib/costgrid-calc.js?v=2` → `?v=3` on all three pages (Part A's `stripCloneTaskIds` addition).

- [ ] **Step 7: Commit**

```bash
git add js/lib/costgrid-calc.js js/lib/costgrid-calc.test.js js/costgrid.js costgrid.html pipeline.html planning.html
git commit -m "fix(costgrid): Clone duplicate-key error (strip+refetch task IDs); characterize New Proposal flow"
```

---

### Task 8: Empirical mount verification (mandatory, per Global Constraint 10)

**Files:** None — verification only, using a throwaway Node script (not committed; delete before the final whole-branch review).

**Interfaces:**
- Consumes: the fully-assembled `costgrid.html` from Tasks 1-7.
- Produces: a pass/fail verdict gating the final whole-branch review — no code artifact.

- [ ] **Step 1: Install throwaway test dependencies**

```bash
npm install --no-save vue@3 jsdom
```

- [ ] **Step 2: Write the mount-test script**

Create a temporary file `scratch_costgrid_mount_test.js` in the repo root — **do not commit it**:

```js
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  runScripts: 'outside-only',
  url: 'http://localhost/costgrid.html?cgId=cg1&verId=v1b',
});
const { window } = dom;
global.window = window; global.document = window.document; global.navigator = window.navigator;
global.localStorage = { getItem: () => null, setItem: () => {} };
window.localStorage = global.localStorage;

const vueSrc = fs.readFileSync(require.resolve('vue/dist/vue.global.prod.js'), 'utf8');
window.eval(vueSrc);
window.eval(fs.readFileSync('js/core.js', 'utf8'));

// Realistic data: a multi-role/multi-phase Committed (locked) version with a linked project,
// plus a sibling Draft version with a free (unassigned) task — exercises both lock states,
// the version-tabs row (cg.versions.length > 1), and hasFreeTasks/Generate Project visibility.
const cgA = {
  id: 'cg1', name: 'Acme Renewal', ownerName: 'Test User', myPermission: 'owner',
  versions: [
    { versionId: 'v1a', versionLabel: 'v1', pipeline: 'Draft', createdAt: '2026-01-01', currency: 'EUR',
      startDate: '202601', endDate: '202606',
      roles: [{ roleCode: 'PM', roleLabel: 'Project Manager', rate: 100, rateIsCustom: false }],
      phases: [{ phaseId: 'ph0', phaseName: 'Discovery', tasks: [
        { taskId: 't0', taskName: 'Kickoff', taskDescription: '', ptc: 0, taskStartDate: '2026-01-01', taskEndDate: '2026-01-31', hours: { PM: 10 } },
      ] }],
      linkedProjects: [] },
    { versionId: 'v1b', versionLabel: 'v2', pipeline: 'Committed', createdAt: '2026-02-01', currency: 'USD', currencyRate: 1.08,
      startDate: '202602', endDate: '202604',
      roles: [
        { roleCode: 'PM', roleLabel: 'Project Manager', rate: 108, rateIsCustom: false },
        { roleCode: 'DEV', roleLabel: 'Developer', rate: 86, rateIsCustom: true },
      ],
      phases: [{ phaseId: 'ph1', phaseName: 'Build', tasks: [
        { taskId: 't1', taskName: 'Design', taskDescription: 'UX pass', ptc: 500, taskStartDate: '2026-02-01', taskEndDate: '2026-02-28', hours: { PM: 10, DEV: 20 } },
      ] }],
      linkedProjects: [{ projectId: 'p1', projectName: 'Acme Project', taskIds: ['t1'], taskNames: ['Design'] }],
      clientId: 'c1', pipelineYear: 2026, note: 'Renewal for Q1', ratecardId: null },
  ],
};

global._cgStore = new Map([['cg1', cgA]]);
Object.assign(window, {
  cgGetIndex: () => [...global._cgStore.keys()],
  cgLoad: (id) => { const cg = global._cgStore.get(id); return cg ? JSON.parse(JSON.stringify(cg)) : null; },
  cgSave: (cg) => { global._cgStore.set(cg.id, JSON.parse(JSON.stringify(cg))); },
  cgSaveIndex: () => {}, cgMigrateVersion: (v) => v,
  cgNewPhId: () => 'ph-new', cgNewTkId: () => 't-new',
  cgFmtCurrency: (n, code) => `${code} ${Number(n || 0).toFixed(2)}`, cgFmtMonth: () => 'Jan 2026',
  cgIsoToIt: (iso) => iso ? iso.split('-').reverse().join('/') : '', cgItToIso: (it) => it,
  cgGetVersionLockState: (cgId, verId) => verId === 'v1b'
    ? { locked: true, reason: 'committed', message: 'This version is locked — the proposal has been committed and every task has been migrated to a project.' }
    : { locked: false, reason: '', message: '' },
  cgLiveVersionBadge: (v) => ({ label: v.pipeline, bg: '#000', color: '#fff', icon: v.pipeline === 'Committed' ? ' 🔒' : ' ✏️' }),
  cgGetAssignedTaskIds: () => new Set(['t1']), cgGetAssignedTaskNames: () => new Set(['design']),
  cgAutoSave: () => Promise.resolve(), cgScheduleAutoSave: () => {}, cgSaveVersion: () => {},
  cgPublishDraft: async () => {}, cgConfirmDeleteVersion: () => {}, cgCreateNewVersion: async () => {},
  cgCloneGrid: async () => {}, cgExportXls: async () => {}, cgGenerateProject: () => {},
  cgExitSelectionMode: () => {}, cgConfirmAndGenerate: () => {}, cgAddSelectedRoles: () => {},
  cgUpdateActiveRatecardMap: async () => {}, cgPreviewRateChange: () => [], cgSyncRoleRatesToBaseline: () => {},
  cgPropagatePipelineToProjects: () => {}, cgLoadStructureFromApi: async () => {}, cgSyncFromApi: async () => {},
  _cgEnsureAddToProjectModal: () => { const m = document.createElement('div'); m.innerHTML = '<div id="cgAddToProjectModalBody"></div>'; return m; },
  getRoles: () => [{ id: 1, code: 'PM', label: 'Project Manager', rate: 100, rateOverrides: {} }, { id: 2, code: 'DEV', label: 'Developer', rate: 80, rateOverrides: {} }],
  getClients: () => [{ id: '__unassigned__', name: 'Unassigned' }, { id: 'c1', name: 'Acme Corp' }],
  loadRatecardsForDropdown: async () => [],
  config: { projects: [{ id: 'p1', name: 'Acme Project', clientId: 'c1', pipeline: 'Committed', status: 'Started', costGridRef: { cgId: 'cg1', versionId: 'v1b' } }] },
  getProjectPipeline: () => 'Committed', pipelineBadge: () => '<span>badge</span>', statusBadgeLarge: () => '<span>status</span>',
  showConfirm: (msg, onOk) => onOk(), showDashboardView: () => {}, isValidSoldHours: () => true,
  loadClientsFromApi: async () => {}, loadProgramsFromApi: async () => {}, loadRolesFromApi: async () => {},
  loadConfigFromApi: async () => {}, loadCurrenciesFromApi: async () => { window.__currencies = [{ code: 'USD', symbol: '$', locale: 'en-US', current_rate: 1.08 }]; },
  initNav: async () => ({ id: 'u1', role: 'admin' }), loadConfig: () => {}, loadSettings: () => {},
  Api: { costGrids: { versions: {} } },
});

const html = fs.readFileSync('costgrid.html', 'utf8');
document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)[1];

const scripts = [...document.querySelectorAll('script:not([type="module"]):not([src])')];
let errors = [];
scripts.forEach(s => {
  try { window.eval(s.textContent); } catch (e) { errors.push(e); }
});

setTimeout(() => {
  console.log('Inline script eval errors:', errors.map(e => e.stack));
  const section = document.getElementById('costGridEditorSection');
  console.log('MOUNT RESULT length:', section ? section.innerHTML.length : 'NOT FOUND');
  console.log('Contains "Acme Renewal"?', section?.innerHTML.includes('Acme Renewal'));
  console.log('Contains lock message?', section?.innerHTML.includes('proposal has been committed'));
  console.log('Contains "Design" task?', section?.innerHTML.includes('Design'));
  console.log('Contains version tabs (v1/v2)?', section?.innerHTML.includes('>v1<') || section?.innerHTML.includes('v1') );
}, 300);
```

- [ ] **Step 3: Run it and interpret the result**

```bash
node scratch_costgrid_mount_test.js
```

Expected: `Inline script eval errors: []`, `MOUNT RESULT length` > 0, `Contains "Acme Renewal"?` → `true`, `Contains lock message?` → `true` (the seeded URL opens `v1b`, the Committed/locked version), `Contains "Design" task?` → `true`. If any error appears, it names the exact bare-global or reactivity gap to fix (per Global Constraints 7-9) — fix in the task that introduced the gap (do not add a new task for it), then re-run this script until clean.

- [ ] **Step 4: Exercise the Draft version (no lock, has a free task) via the version tab**

Extend the script's `setTimeout` block to switch to `v1a` and re-check:
```js
  const vueApp = window.__CG_TEST_APP__; // see note below
```
Since this script parses raw HTML and re-evaluates the inline `<script>` tags (rather than calling `Vue.createApp(opts).mount(...)` directly and keeping the returned instance), the cleanest way to reach the mounted app for interaction-simulation is to temporarily add, in `costgrid.html`'s own inline script for the duration of this manual verification only (revert before Step 5's cleanup — **do not commit this line**):
```js
}).mount('#costGridEditorSection');
window.__CG_TEST_APP__ = app; // TEMP — remove before committing; requires capturing the return value: const app = Vue.createApp({...}).mount(...)
```
Then in the script's `setTimeout`, after the initial assertions:
```js
setTimeout(async () => {
  await window.__CG_TEST_APP__.switchVersion('v1a');
  console.log('After switching to Draft v1a — locked?', window.__CG_TEST_APP__.isLocked);
  console.log('After switching to Draft v1a — hasFreeTasks?', window.__CG_TEST_APP__.hasFreeTasks);
  console.log('Contains "Kickoff" task?', section.innerHTML.includes('Kickoff'));
}, 600);
```
Run again: `node scratch_costgrid_mount_test.js`. Expected: `locked?` → `false`, `hasFreeTasks?` → `true` (task `t0` "Kickoff" has no `linkedProjects` entry in `v1a`), `Contains "Kickoff" task?` → `true`.

- [ ] **Step 5: Revert the temporary `window.__CG_TEST_APP__` capture line and delete the scratch script**

```bash
git diff --stat costgrid.html
```
Expected: no diff (Step 4's temporary capture line must be reverted — it was for local interaction-testing only, never committed).

```bash
rm -f scratch_costgrid_mount_test.js
git status --short
```
Expected: clean (nothing to commit from this task — it produced no permanent artifact).

---

## Self-Review Notes

**Spec coverage:** every section of the design doc's Components list maps to a task — Task 1 (design's Task 6, reordered first since Tasks 3/6 depend on `resolveRoleRate`) + page shell/toolbar/version tabs/offer-details form (design's Task 1 → this plan's Task 2) + role columns (design's Task 2 → Task 3) + task rows/selection (design's Task 3 → Task 4) + phasing panel/toolbar actions (design's Task 4 → Task 5) + role selector/dead-modal removal (design's Task 5 → Task 6) + both bug fixes (design's Task 7 → Task 7) + the mandatory empirical mount test (design's Final task → Task 8). The design's explicit Data flow/Error handling/Backward-compatibility sections are covered: no API contract change except Clone's stripped `taskId`/`phaseId` (Task 7); the loading-spinner/explicit-error-message pattern from `pipeline.html`'s detail panel is replicated in Task 2, Step 3 (`v-if="loading"` / `v-else-if="loadError"`); `pipeline.html`/`planning.html` cross-page smoke checks are called out in Task 6 (dead-modal removal) and belong to `/finish-cycle`'s own manual-verification gate, not a plan task (matching the brief's Acceptance Criteria, which lists this as a manual check, not an automated one).

**Placeholder scan:** no `TBD`/`TODO`/"add appropriate error handling"/"similar to Task N" language found. Two forward references are deliberate and explicitly flagged as such (not placeholders): Task 2's template calls `openNewVersionModal`/`openCloneModal` before they're implemented in Task 5, and Task 3's `addRoleColumn`/`changeRole`/`duplicateRole` call `this.openRoleModal(...)` before it's implemented in Task 6 — both are noted inline at the point they're introduced, with the exact task number where the implementation lands, mirroring the same forward-reference pattern the `pipeline.html` plan used for its own `openNewProposalModal`/`openCloneModal`.

**Type/signature consistency:** `resolveRoleRate({ roleId, globalRate, currency, currencyRate, ratecardMap, ratecardOverrides, roleOverrides })` (Task 1) is called with identical argument names in Task 3's `roleBaseline` and Task 6's `roleModalRoleRow` — verified both call sites pass `roleOverrides` as a plain per-currency map (`roleObj.rateOverrides || {}` / `r.rateOverrides || {}`), not nested under a role ID, matching the function's own destructuring. `cgComputeTaskTotals`/`cgComputePhaseTotals`/`cgComputeGrandTotals`/`cgComputeColumnTotals` (Task 1) keep the exact parameter order and shape used by the original inline versions, so `pipeline.html`'s existing (unmodified) call sites are unaffected. `data().draft`/`cg`/`ratecardMap`/`ratecardOverrides`/`isClientRatecard`/`selectionMode`/`selectedTaskIds` are declared once in Task 2 and read/written with consistent names through Tasks 3-7 — checked directly against the source.

**Two real bugs found and fixed during this self-review pass (not left for Task 8 to discover):**
1. **Bare-global-in-template bug** (the same defect class that broke `portfolio.html`/`project-config.html` after their own migrations, per Global Constraint 8 in the `pipeline.html` plan): Task 4's original draft called `cgScheduleAutoSave()` directly inside four template expressions (`@change` on phase name / task name / task description, and inline inside the PTC input's `@input` handler) without exposing it via `methods:`. Vue 3's runtime-compiled template mode does not fall through to `window` for an unrecognized identifier, so every one of those four bindings would have thrown `ReferenceError: cgScheduleAutoSave is not defined` the first time a user typed in any of those fields. Fixed by adding `cgScheduleAutoSave` to Task 2's `methods` bare re-export line (`esc, pipelineBadge, statusBadgeLarge, cgScheduleAutoSave`), with Task 4's own instruction updated to explain why it's already there by the time Task 4 needs it.
2. **A more fundamental architectural bug in the `_cgDraft`/`this.draft` relationship**, caught while writing Task 5: the initial draft of Task 2's `openVersion()`/`resyncFromGlobals()` re-cloned `this.draft` from `_cgDraft` via `JSON.parse(JSON.stringify(_cgDraft))` on every resync — treating them as two independent copies kept manually in sync. This is wrong: `cgAutoSave()` (a "kept unchanged" global, per Global Constraint 7) reads `_cgDraft` **directly**, not `this.draft` — so once a user edited anything through Vue's `v-model` (which only ever wrote to `this.draft`, the re-clone), `_cgDraft` would freeze at its initial-load state forever, and every autosave/manual-save from that point on would silently persist the *original*, un-edited version while the UI kept showing (and losing) the user's real edits. This would have been a silent, severe data-loss bug, plausibly not caught by Task 8's mount test either (which asserts on rendered content, not on what gets sent to `cgSave`/`_cgUpsertVersionToApi`). Fixed by making `this.draft` and `_cgDraft` the **same object reference**, assigned together exactly once per version load in `openVersion()` (Global Constraint 9), with `resyncFromGlobals()` calling `this.$forceUpdate()` instead of re-cloning — this preserves the reference (so `cgAutoSave()` always sees live edits) while still forcing Vue to re-render after a kept-unchanged global's raw, non-reactive mutation of `_cgDraft`'s fields. Every method that previously re-cloned `this.draft` after calling a ratecard-related kept global (`onRatecardChange`, `refreshRatecards`) was corrected the same way.

**Known, accepted trade-off (not a bug, documented for the reviewer):** Task 4's PTC input uses a `ptcFocusedTask` tracked-focus pattern (`:value` shows the raw number while focused, the formatted currency string once blurred) to avoid Vue's `:value` binding re-formatting the field on every keystroke while typing (which the original Vanilla implementation never did, since it never wrote back to the DOM `.value` on `input`, only mutated the JS model). This is the correct, idiomatic Vue fix for the general "format on blur" pattern, but unlike the original, an edge case — typing a trailing decimal point (e.g. `150.`) immediately before blurring elsewhere without typing more digits — could theoretically get silently stripped back to `150` on a Vue re-render that happens to fire mid-edit. This is judged an acceptable, extremely narrow divergence from 1:1 parity (the original had no such edge case at all, since it never touched `.value`), not worth a bespoke uncontrolled-input wrapper component for one legacy field; flagged here rather than silently accepted.

**Line-number staleness (documented, not fixed as a "bug" — inherent to any multi-task plan touching the same file repeatedly):** Task 6's function-deletion list originally cited only the pre-migration file's line numbers for `cgApplyEditorLock`/`cgBindEditorEvents`/`cgRefreshTotals`/`cgRefreshPhaseDates`/`cgRenderRoleList`/`cgFindTask`, all of which shift substantially once Tasks 1-2 have already deleted ~560 lines earlier in the file. Fixed by adding an explicit instruction to locate each by its exact function signature instead of trusting the stale line number. Every other task's "Find" step already shows the verbatim code block being searched for (not just a line number), which is inherently robust to this same drift — only Task 6's list-style (name + line number only, no code shown, since the functions' full bodies were never reproduced in this plan) needed the explicit callout.
