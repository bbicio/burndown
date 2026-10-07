# Cost Grid redesign (cycle A: desktop + tablet) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `costgrid.html` (desktop + tablet only) to boards 5.17–5.21: one header card, three collapsible cards with per-proposal persistence, a redesigned grid (sticky first column, role ⋮ menu, state classes instead of inline hex), a reworked task-selection bar (single CTA), and an always-visible Monthly Phasing card — while fixing two real bugs found during design (id-only "free task" checks; `PDash_cgCompactHeader` never persisting) and applying the brainstorming rulings on the brief's open divergences.

**Architecture:** Same single Vue app mounted on `#costGridEditorSection`, same `js/costgrid.js` bridge (`_cgDraft === this.draft`, never cloned), same API surface (no backend changes). New pure helpers land in `js/lib/costgrid-calc.js` first so every later task can build on tested, bug-fixed logic instead of re-deriving it inline. A new `css/costgrid.css` (page-local, tokens only) replaces the inline `:style` bindings and emoji currently in `costgrid.html`.

**Tech Stack:** Vue 3 (CDN, no build step), Bootstrap 5.3.2 modals, vitest + jsdom for `js/lib/*.test.js`, Node's `node:test` is not involved (no backend change).

**Spec:** `docs/superpowers/specs/2026-10-07-costgrid-redesign-cycle-a-design.md` (read this alongside the plan — it has the full visual/behavioral detail; this plan only pins the facts an implementer can't derive from it alone: exact file paths, exact names, exact test assertions).

## Global Constraints

- No build step; no bundler.
- No hardcoded hex colors anywhere touched — `var(--token)` only, `color-mix()` on existing tokens if a shade is needed. No new tokens.
- No emoji in `#costGridEditorSection` or its modals — inline SVG (`stroke="currentColor"`, 14–16px) or plain text instead.
- Every amount goes through `formatMoney`/`formatMoneyInput`/`parseMoney` — no new formatting call sites outside those.
- Every touched versioned file's `?v=N` is bumped, and **every** reference to that file across the repo is updated to match (not just the page being tested) — verified by the existing guard tests (`js/lib/foundations-guard.test.js`'s cache-busting block, `js/lib/proposal-modals-guard.test.js`).
- `v-cloak` stays on `#costGridEditorSection`; `#app-shell`/`#app-main` are not touched.
- Edit HTML files with the `Edit` tool only — never PowerShell `Set-Content`/`Get-Content` (adds a BOM).
- English copy only, matching the brief's §8 copy table exactly where it applies.
- `this.draft` and `_cgDraft` stay the same object reference — never `JSON.parse(JSON.stringify(...))` or otherwise clone `this.draft`.

## Review Focus

- **Corrupted/missing section-state JSON.** `localStorage['PDash_cgSections:'+cgId]` holding invalid JSON (or absent) must fall back to `cgSectionDefaults(isDraft)` silently, not throw and break the page load. (Task 2 test.)
- **Nameless tasks counted as "free".** A task with an empty or whitespace-only `taskName` must never show up as free/selectable in `cgFreeTasksOf`, matching the existing `hasFreeTasks` guard — easy to drop while fixing the id-only bug. (Task 1 test.)
- **Name-only assignment still blocks phase delete.** A phase whose only "assigned" task is matched by name-alias (not by `taskId`, e.g. after a rename) must still refuse deletion — the same double-check `isTaskAssigned` already does. (Task 3 test.)
- **Stale "remove column" confirm state.** Clicking "Remove column" on role A (arming the second-click confirm), then opening role B's ⋮ menu, must not let a click in B's menu fire A's pending removal — the confirm state must be scoped/reset per menu open. (Task 3 test.)
- **Version-label edit on a locked/viewer version.** The inline-editable version label (replacing the old modal) must not become editable when `isLocked` is true or `cg.myPermission === 'viewer'` — same gate every other header field already uses. (Task 2 test.)

---

## Task 1: Pure helpers (`costgrid-calc.js`) + `core.js` persistence fix

**Files:**
- Modify: `js/lib/costgrid-calc.js` (`?v=6` → `?v=7`)
- Modify: `js/core.js` (`?v=11` → `?v=12`)
- Create: `js/lib/costgrid-calc.test.js`
- Create: `js/lib/core-storage.test.js`
- Modify (version bump only, both files): `costgrid.html`, `pipeline.html` — `js/lib/costgrid-calc.js?v=6` → `?v=7`
- Modify (version bump only, all 18 pages): `_db-reset.html`, `_terms-editor.html`, `admin.html`, `attribute-lists.html`, `costgrid.html`, `master-client-groups.html`, `master-clients.html`, `master-currencies.html`, `master-pipelines.html`, `master-roles.html`, `pipeline.html`, `planning.html`, `portfolio.html`, `profile-jobs.html`, `project-config.html`, `settings.html`, `team.html`, `timesheets.html` — `js/core.js?v=11` → `?v=12`

**Interfaces:**
- Produces (bridged to `window.*` the same way existing exports are):
  - `cgFreeTasksOf(tasks: Task[], linkedProjects: LinkedProject[]) -> Task[]` — tasks whose `taskName?.trim()` is non-empty and whose `taskId` is not in any `lp.taskIds` and whose trimmed-lowercased name is not in any `lp.taskNames`.
  - `cgOfferDetailsSummary(draft, { clientName, ratecardName }) -> { period, stage, client, ratecard, currency, owner }` — all string fields, pre-formatted for direct display (no further fallback logic needed by the caller).
  - `cgSectionDefaults(isDraft: boolean) -> { od: boolean, tags: boolean, sh: boolean }` — `true` means collapsed. Draft → `{ od: false, tags: false, sh: false }` (open); non-Draft → `{ od: true, tags: true, sh: true }` (closed).
  - `versionHasFreeTasks(ver)` keeps its existing signature and behavior (now implemented via `cgFreeTasksOf` internally) — no caller elsewhere needs to change.
- Consumes: nothing new (pure functions over plain data already shaped like `draft.phases`/`draft.linkedProjects`).

- [ ] **Step 1: Write failing tests for `cgFreeTasksOf`**

```js
// js/lib/costgrid-calc.test.js
import { describe, it, expect } from 'vitest';
import { cgFreeTasksOf, cgOfferDetailsSummary, cgSectionDefaults, versionHasFreeTasks } from './costgrid-calc.js';

describe('cgFreeTasksOf', () => {
  const linkedProjects = [{ taskIds: ['t1'], taskNames: ['UX Research'] }];

  it('excludes a task assigned by id', () => {
    const tasks = [{ taskId: 't1', taskName: 'Kickoff' }, { taskId: 't2', taskName: 'Build' }];
    expect(cgFreeTasksOf(tasks, linkedProjects).map(t => t.taskId)).toEqual(['t2']);
  });

  it('excludes a task assigned by name alias only (not id)', () => {
    const tasks = [{ taskId: 't9', taskName: 'UX Research' }, { taskId: 't2', taskName: 'Build' }];
    expect(cgFreeTasksOf(tasks, linkedProjects).map(t => t.taskId)).toEqual(['t2']);
  });

  it('excludes a nameless or whitespace-only task', () => {
    const tasks = [{ taskId: 't3', taskName: '' }, { taskId: 't4', taskName: '   ' }, { taskId: 't2', taskName: 'Build' }];
    expect(cgFreeTasksOf(tasks, linkedProjects).map(t => t.taskId)).toEqual(['t2']);
  });

  it('returns everything free when linkedProjects is empty', () => {
    const tasks = [{ taskId: 't2', taskName: 'Build' }];
    expect(cgFreeTasksOf(tasks, []).length).toBe(1);
  });
});

describe('versionHasFreeTasks (regression after refactor)', () => {
  it('still returns true/false consistently with cgFreeTasksOf', () => {
    const ver = { phases: [{ tasks: [{ taskId: 't1', taskName: 'A' }] }], linkedProjects: [] };
    expect(versionHasFreeTasks(ver)).toBe(true);
    ver.linkedProjects = [{ taskIds: ['t1'], taskNames: [] }];
    expect(versionHasFreeTasks(ver)).toBe(false);
  });
});

describe('cgOfferDetailsSummary', () => {
  it('formats a fully-populated draft', () => {
    const draft = { startDate: '202605', endDate: '202612', pipeline: 'SIP', clientId: 'c1', ratecardId: 'r1', currency: 'USD' };
    const out = cgOfferDetailsSummary(draft, { clientName: 'Acme', ratecardName: 'Standard 2026' });
    expect(out).toEqual({ period: expect.stringContaining('2026'), stage: 'SIP', client: 'Acme', ratecard: 'Standard 2026', currency: 'USD', owner: expect.any(String) });
  });

  it('falls back to placeholders when empty', () => {
    const draft = { startDate: '', endDate: '', pipeline: 'Draft', clientId: null, ratecardId: null, currency: 'EUR' };
    const out = cgOfferDetailsSummary(draft, { clientName: null, ratecardName: null });
    expect(out.period).toBe('Not set');
    expect(out.client).toBe('Unassigned');
    expect(out.ratecard).toBe('— None (use global role rates) —');
  });
});

describe('cgSectionDefaults', () => {
  it('Draft defaults to all open', () => { expect(cgSectionDefaults(true)).toEqual({ od: false, tags: false, sh: false }); });
  it('non-Draft defaults to all closed', () => { expect(cgSectionDefaults(false)).toEqual({ od: true, tags: true, sh: true }); });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test -- costgrid-calc`
Expected: FAIL — `cgFreeTasksOf`/`cgOfferDetailsSummary`/`cgSectionDefaults` not exported.

- [ ] **Step 3: Implement the three new functions in `js/lib/costgrid-calc.js`, and rewrite `versionHasFreeTasks` to call `cgFreeTasksOf`**

Add `cgFreeTasksOf`, `cgOfferDetailsSummary`, `cgSectionDefaults` as named exports plus `window.<name> = <name>` bridge lines, following the file's existing style (see `versionHasFreeTasks`/`isVersionCommittedLocked` at the top of the file for the pattern). Rewrite `versionHasFreeTasks(ver)` body to:
```js
export function versionHasFreeTasks(ver) {
  return cgFreeTasksOf((ver.phases || []).flatMap(ph => ph.tasks || []), ver.linkedProjects).length > 0;
}
```
`cgOfferDetailsSummary`'s `owner` field and date-period formatting should reuse the same slicing convention as `offerDetailsSummary` in `costgrid.html` today (`startDate.slice(0,4)+'/'+startDate.slice(4,6)`) — read that computed (current `costgrid.html:765-768`) before writing the new function so the two don't drift in format.

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test -- costgrid-calc`
Expected: PASS, all cases above.

- [ ] **Step 5: Write a failing test for the `core.js` persistence fix**

```js
// js/lib/core-storage.test.js
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const core = fs.readFileSync(path.resolve(__dirname, 'core.js'), 'utf8');

describe('cleanLegacyStorage keep rules', () => {
  it('keeps PDash_cgCompactHeader literally', () => {
    expect(core).toMatch(/PDash_cgCompactHeader/);
  });
  it('keeps any PDash_cgSections: prefixed key', () => {
    expect(core).toMatch(/PDash_cgSections:/);
  });
});
```

- [ ] **Step 6: Run test, verify it fails**

Run: `npm test -- core-storage`
Expected: FAIL — neither string present in `js/core.js` yet.

- [ ] **Step 7: Fix `js/core.js`'s `cleanLegacyStorage` (lines 1-8)**

Add `'PDash_cgCompactHeader'` to the literal `keep` Set, and change the filter condition from `k.startsWith('PDash') && !keep.has(k)` to also exclude any key starting with `'PDash_cgSections:'`:
```js
const keep = new Set(['PDash_summary', 'PDash_browserNotifDisabled', 'PDash_sidebarCollapsed', 'PDash_cgCompactHeader']);
Object.keys(localStorage)
  .filter(k => k.startsWith('PDash') && !keep.has(k) && !k.startsWith('PDash_cgSections:'))
  .forEach(k => localStorage.removeItem(k));
```

- [ ] **Step 8: Run test, verify it passes**

Run: `npm test -- core-storage`
Expected: PASS.

- [ ] **Step 9: Bump versions everywhere**

Bump `js/lib/costgrid-calc.js?v=6` → `?v=7` in `costgrid.html` and `pipeline.html`. Bump `js/core.js?v=11` → `?v=12` in all 18 pages listed in this task's Files section. Also update `js/lib/proposal-modals-guard.test.js`'s hardcoded `costgridCalcVersion(...)` expectations from `'6'` to `'7'` (its `costgridJsVersion` expectations stay `'39'` — that file isn't touched in this task).

- [ ] **Step 10: Run the full guard suite to verify the version bump is consistent**

Run: `npm test`
Expected: PASS — `foundations-guard.test.js`'s cache-busting block (core.js, any file-level check) and `proposal-modals-guard.test.js` both green; no other suite references `costgrid-calc.js`'s version number.

- [ ] **Step 11: Commit**

```bash
git add js/lib/costgrid-calc.js js/lib/costgrid-calc.test.js js/lib/core-storage.test.js js/core.js js/lib/proposal-modals-guard.test.js costgrid.html pipeline.html _db-reset.html _terms-editor.html admin.html attribute-lists.html master-client-groups.html master-clients.html master-currencies.html master-pipelines.html master-roles.html planning.html portfolio.html profile-jobs.html project-config.html settings.html team.html timesheets.html
git commit -m "feat(costgrid): add cgFreeTasksOf/cgOfferDetailsSummary/cgSectionDefaults, fix compact-header persistence"
```

---

## Task 2: Header card + collapsible cards (Offer details / Tags / Sharing)

**Files:**
- Modify: `costgrid.html` (header markup/logic §2–§3 of the spec; `#cgNewVersionModal` and `openNewVersionModal` removed)
- Modify: `js/costgrid.js` (`?v=39` → `?v=40`): remove `cgCreateNewVersion`, add `cgCreateNewVersionDirect`
- Create: `css/costgrid.css` (`?v=1`), linked only from `costgrid.html`
- Modify (version bump only): `pipeline.html` — `js/costgrid.js?v=39` → `?v=40`
- Modify: `js/lib/proposal-modals-guard.test.js` — update `costgridJsVersion` expectations to `'40'`; extend `REMOVED_IDS` with `'cgNewVersionModal'`, `'cgNewVersionLabel'`, `'cgNewVersionError'`, `'openNewVersionModal'`

**Interfaces:**
- Consumes (from Task 1): `window.cgSectionDefaults(isDraft)`, `window.cgOfferDetailsSummary(draft, {clientName, ratecardName})`.
- Produces (for Tasks 3/4): the Vue instance keeps `offerDetailsCollapsed`/`tagsCollapsed`/`sharingCollapsed` as before (now driven by `cgSectionDefaults`/localStorage instead of a hardcoded `false`); adds `shareSummary` data (`{ count, initials: string[], myRole }`, populated by a new `loadShareSummary()` method called from `openVersion()`); adds `editingVersionLabel` data (boolean) and `commitVersionLabelEdit()` method writing `this.draft.versionLabel` then `cgScheduleAutoSave()`. `js/costgrid.js` exposes global `cgCreateNewVersionDirect()` (async, no args — reads `_cgActiveCgId`/`_cgActiveVersionId`/`_cgDraft` the same way `cgCreateNewVersion` did).

- [ ] **Step 1: Write a failing test for the version-label lock gate**

```js
// js/lib/proposal-modals-guard.test.js — add to the existing describe block, or a new one in the same file
describe('version label inline edit is gated', () => {
  it('costgrid.html gates the version-label edit control on isLocked and viewer permission', () => {
    expect(costgrid).toMatch(/editingVersionLabel[\s\S]{0,400}(isLocked|myPermission\s*===\s*'viewer')/);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- proposal-modals-guard`
Expected: FAIL — `editingVersionLabel` doesn't exist yet.

- [ ] **Step 3: Implement the header card in `costgrid.html`**

Replace `.page-title-bar` + `.page-toolbar` + the version-tabs block (today `costgrid.html:28-56`) with the `.cg-header` card per spec §2: title/subtitle/stage pill row; version segmented control (`"+ New version"` `v-if="isDraft"` calling `createNewVersionDirect`; one segment per version via `versionTabLabel` with the lock-icon emoji removed, replaced by an SVG + `versionTabTitle` tooltip; the active segment's label becomes a click-to-edit text — show an `<input>` bound to `draft.versionLabel` when `editingVersionLabel` is true **and** `!isLocked` **and** `cg.myPermission !== 'viewer'`, else the plain label, toggled by a small edit icon next to the active segment only); action row (Save/Clone/Export XLS/divider/one primary action per state, Share, back-link). Move "Delete version" into the Draft banner's right side. Vue method `createNewVersionDirect()` calls the global `cgCreateNewVersionDirect()` then nothing else (the global already calls `showCostGridEditorView` to reload). `commitVersionLabelEdit()` trims the value, leaves it unchanged if empty, sets `editingVersionLabel = false`, calls `cgScheduleAutoSave()`.

- [ ] **Step 4: Implement `cgCreateNewVersionDirect()` in `js/costgrid.js`, remove `cgCreateNewVersion` and `openNewVersionModal`**

Base it on the current `cgCreateNewVersion` (`js/costgrid.js:765-827`): same `cgId`/`srcVerId`/`src` reads, same `cgAutoSave(true)` flush with the same try/catch (on failure, call `showInfo('Could not save your latest changes, so no new version was created: ' + e.message)` instead of writing into the removed `errEl`), same `Api.costGrids.versions.duplicate(cgId, srcVerId, { label })` call (on failure, `showInfo('New version failed: ' + e.message)`), same local-store seeding block (`newVer.versionId`/`versionLabel`/etc., lines 804-814), same `cgLoadStructureFromApi` + incomplete-structure `showInfo` warning, same final `showCostGridEditorView(cgId, serverId)`. The only change: `label` is computed as `` `v${cg.versions.length + 1}` `` instead of read from `#cgNewVersionLabel`, and there is no modal to hide/clear. Delete `#cgNewVersionModal` from `costgrid.html` (today `:548-`) and `openNewVersionModal` (`:1346-1349`) and the `shown.bs.modal`/button-click wiring for it (`:1487-1490`).

- [ ] **Step 5: Implement collapsible-card persistence and reordered Offer details in `costgrid.html`**

In the Vue instance's `openVersion()`: after loading `draft`, compute `const defaults = window.cgSectionDefaults(this.isDraft)`; try to `JSON.parse(localStorage.getItem('PDash_cgSections:' + cgId))`, guarded in a `try/catch` returning `null` on any error or non-object result; set `this.offerDetailsCollapsed = stored?.od ?? defaults.od` (same pattern for `tags`/`sh`). Add a small `persistSectionState()` method (`localStorage.setItem('PDash_cgSections:' + this.cgId, JSON.stringify({ od: this.offerDetailsCollapsed, tags: this.tagsCollapsed, sh: this.sharingCollapsed }))`) called at the end of each of the three toggle handlers. Reorder the Offer details open form to Client → Ratecard → Currency (spec §3.4); change `offerDetailsSummary` from the current string computed to `computed: offerDetailsSummary() { return window.cgOfferDetailsSummary(this.draft, { clientName: ..., ratecardName: ... }); }`, resolving `clientName`/`ratecardName` from `this.clients`/`this.allRatecards` the same way the existing template already does inline.

- [ ] **Step 6: Implement the Sharing closed-state summary**

Add `loadShareSummary()` method, called once at the end of `openVersion()`: `const rows = await Api.shares.list('cost_grid', this.cgId); this.shareSummary = { count: rows.length, initials: rows.slice(0,4).map(r => initialsOf(r.name||r.email)), myRole: ... }` (derive `myRole` from `cg.myPermission`, falling back to `'owner'` when the current user is `cg.ownerId`). Render the closed Sharing header using `shareSummary`.

- [ ] **Step 7: Write `css/costgrid.css`, link it from `costgrid.html`**

Add `<link rel="stylesheet" href="css/costgrid.css?v=1">` after `style.css` in `costgrid.html`'s `<head>`. Styles for everything built in this task: `.cg-header`, the version segmented control, the three `.cg-section-card` headers/summaries, tokens only (reference spec §9's color mapping table for which token replaces which current hex/var).

- [ ] **Step 8: Run tests, verify they pass**

Run: `npm test -- proposal-modals-guard`
Expected: PASS.

- [ ] **Step 9: Manual smoke check**

Open the app (or the branch test stack per `scripts/test-branch.sh`), load a Draft and a SIP proposal: confirm "+ New version" creates immediately with label `v{n}` and no modal; confirm the active version label is click-to-edit and persists after a save+reload; confirm it is **not** editable on a locked version or as a viewer; confirm section collapse state survives a page reload for the same proposal and differs correctly between a fresh Draft (open) and an existing SIP proposal (closed) the first time it's opened.

- [ ] **Step 10: Bump `js/costgrid.js` version and run full suite**

Bump `js/costgrid.js?v=39` → `?v=40` in `costgrid.html` and `pipeline.html`; update `proposal-modals-guard.test.js`'s `costgridJsVersion` expectations to `'40'` and extend `REMOVED_IDS` per the Files section above.
Run: `npm test`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add costgrid.html js/costgrid.js css/costgrid.css pipeline.html js/lib/proposal-modals-guard.test.js
git commit -m "feat(costgrid): header card, collapsible-card persistence, no-modal new version"
```

---

## Task 3: Grid restyle — sticky column, rate-state classes, role ⋮ menu, no-roles placeholder, phase-delete guard

**Files:**
- Modify: `costgrid.html` (grid markup/logic §4 of the spec)
- Modify: `css/costgrid.css` (`?v=1`, same version — new in this cycle, not yet shipped)

**Interfaces:**
- Consumes (from Task 1): `window.cgFreeTasksOf` is **not** needed here (phase-delete guard reuses the existing `isTaskAssigned` method, already id+name-correct).
- Consumes (from Task 2): `css/costgrid.css` file (appends to it), `.cg-section-card`/header conventions already established for visual consistency.
- Produces (for Task 4): `openRoleMenuCode` data (string|null — which role's ⋮ menu is open), `removeColumnConfirm` data (string|null — which role code is armed for the second-click remove, reset whenever `openRoleMenuCode` changes), `taskAssignedProjectName(task)` method (returns the linked project's display name or `''`), the phase-delete guard inside `deletePhase(phase)`.

- [ ] **Step 1: Write failing tests for the phase-delete guard and menu-confirm isolation**

```js
// Append to js/lib/proposal-modals-guard.test.js, or a new small test file js/lib/costgrid-grid-guard.test.js
describe('grid safety rules', () => {
  const html = fs.readFileSync(path.resolve(root, 'costgrid.html'), 'utf8');

  it('deletePhase checks task assignment before confirming', () => {
    const fn = html.match(/deletePhase\(phase\)\s*\{([\s\S]*?)\n\s*\},/)?.[1] || '';
    expect(fn).toMatch(/isTaskAssigned/);
  });

  it('removeColumnConfirm is reset when a different role menu opens', () => {
    expect(html).toMatch(/openRoleMenu\(code\)\s*\{[\s\S]{0,200}removeColumnConfirm\s*=\s*null/);
  });
});
```

(Use `read()`/`root` helpers already defined at the top of `proposal-modals-guard.test.js` if adding to that file, to avoid re-declaring them.)

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test -- guard`
Expected: FAIL — `deletePhase`/`openRoleMenu` don't contain the expected guards yet.

- [ ] **Step 3: Implement the sticky first column**

Add a `.cg-col-fixed` class (per row-type background + `position:sticky;left:0` + right-edge shadow, in `css/costgrid.css`) to the first cell of the header row, the rate row, every phase row, every task row, the add-task row, and the `tfoot` TOTAL row in `costgrid.html`'s grid markup (`:217-366`). Remove the outer `<div style="overflow:auto;max-height:calc(100vh - 300px)">`'s `max-height`, keep `overflow-x:auto`.

- [ ] **Step 4: Implement rate-row and header state classes**

Replace the `:style` ternaries driving custom/zero-rate visuals (`costgrid.html:242-249,263-265`) with `:class="{ 'is-custom': r.rateIsCustom, 'is-zero': !r.rate || r.rate === 0 }"` on the rate cell and the column header cell; implement `.is-custom`/`.is-zero` in `css/costgrid.css` per spec §9's token mapping. Replace "✎ custom"/"⚠️ rate 0"/"⚠️ 0" text with "Custom · reset {baseline}" (clickable, same reset body as today's empty-input path) and "Missing rate".

- [ ] **Step 5: Implement the grid-card header (legend + compact toggle)**

Add `.cg-legend` with three items (Custom rate / Missing rate / Task in a project) `v-if="!selectionMode"`; keep the existing `compactHeader` toggle and `addRoleColumn`/`addPhase` buttons, adding `v-if="!isLocked && !selectionMode"` to the latter two (today they're `!isLocked`-only).

- [ ] **Step 6: Implement the role ⋮ menu**

Replace the always-visible Move/Change/Duplicate/Remove row (`costgrid.html:267-275`) with a single `.cg-col-menu-btn` (⋮) and a `Teleport to="body"` popover (`v-if="openRoleMenuCode === r.roleCode"`) containing: header (role label/code/`colTotals[r.roleCode]?.hrs || 0`), Move left/right (`moveRole`, disabled at edges, unchanged), "Change role…"/"Duplicate with another role…" (`changeRole`/`duplicateRole`, unchanged), "Reset rate to {baseline}" (`v-if="r.rateIsCustom"`), and "Remove column" with the two-click pattern: `@click` checks `removeColumnConfirm === r.roleCode` — if not, sets it and re-renders the label as `` `Click again to remove · ${colTotals[r.roleCode]?.hrs || 0}h across all tasks will be deleted` ``; if so, runs the existing removal body from `removeRoleColumn` (`:1233-1240`) minus the `showConfirm` wrapper, then resets `removeColumnConfirm = null`. Add `openRoleMenu(code) { this.removeColumnConfirm = null; this.openRoleMenuCode = this.openRoleMenuCode === code ? null : code; }` as the only way the menu opens/closes (closing via outside-click/Escape/scroll all route through setting `openRoleMenuCode = null`, which must **not** separately touch `removeColumnConfirm` — only opening a *different* menu does, per the Review Focus item). Position the popover with `getBoundingClientRect()` off the clicked button, recomputed on the container's `scroll` event while open.

- [ ] **Step 7: Implement the no-roles placeholder column**

Replace the `v-if="draft.roles.length === 0"` banner row (`:281`) with a `.cg-col-placeholder` (260px, dashed) rendered as an extra column across header/phase/task rows when `draft.roles.length === 0`: header cell holds the "+ Add roles" button; task-row cells hold "Add roles to estimate hours for each task."; phase-row cells are empty.

- [ ] **Step 8: Implement the assigned-task lock icon, "In {project}" badge, and the phase-delete guard**

Add `taskAssignedProjectName(task)` method: resolve the same way `linkedProjectDisplay` resolves `taskNames` (look up `this.draft.linkedProjects` for an entry whose `taskIds`/`taskNames` include this task, return its `projectName`). In the task row's fixed cell, when `isTaskAssigned(task)`, render a lock icon (tooltip "Linked to a project: it can't be deleted") instead of the ✕, plus a small "In {taskAssignedProjectName(task)}" line under the name. In `deletePhase(phase)` (`:1260-1265`), add a guard before the existing `showConfirm` call: `if (phase.tasks.some(t => this.isTaskAssigned(t))) { showInfo("Can't delete: this phase has tasks linked to a project."); return; }`. In the phase row's ✕ button, add `:disabled="phase.tasks.some(t => isTaskAssigned(t))"` and a matching `:title`.

- [ ] **Step 9: Implement the TOTAL row and filled/empty cell classes**

Replace the `--indigo-*`/hex inline styles on the `tfoot` row with `.cg-row-total` (same `.cg-col-fixed` on its first cell); replace the `color:#bbb`/strong-vs-plain ternaries on task totals/PTC/hours cells with `.cg-cell-filled`/`.cg-cell-empty` classes.

- [ ] **Step 10: Run tests, verify they pass**

Run: `npm test -- guard`
Expected: PASS.

- [ ] **Step 11: Manual smoke check**

On a SIP proposal with linked projects: confirm the first column stays visible while scrolling horizontally on every row type; confirm a custom/zero-rate role shows the new classes/labels; confirm the ⋮ menu's remove-column requires two clicks and a different role's menu doesn't inherit the pending confirm; confirm an assigned task shows the lock icon + "In {project}" and its phase's ✕ is disabled with a tooltip; confirm a brand-new Draft with zero roles shows the dashed placeholder column instead of the old banner row.

- [ ] **Step 12: Run full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add costgrid.html css/costgrid.css js/lib/proposal-modals-guard.test.js
git commit -m "feat(costgrid): grid restyle, role menu, sticky column, phase-delete guard"
```

---

## Task 4: Selection flow fix, Monthly Phasing always-on, tablet responsive, docs

**Files:**
- Modify: `costgrid.html` (selection bar/modals §5, Monthly Phasing §6, Vue methods)
- Modify: `js/costgrid.js` (`?v=40` → `?v=41`: `cgGenerateProject`'s free-task count; `onHoursBlur`'s `alert()` → `showInfo()`)
- Modify (version bump only): `pipeline.html` — `js/costgrid.js?v=40` → `?v=41`
- Modify: `js/lib/proposal-modals-guard.test.js` — update `costgridJsVersion` expectations from `'40'` to `'41'`
- Modify: `css/costgrid.css` (`?v=1`, same version — tablet media query, selection bar, phasing bar styles)
- Modify: `CLAUDE.md` (costgrid.html row + file-structure block for `css/costgrid.css`; "Version tab switching (editor)" section)
- Modify: `docs/pages/costgrid.md`

**Interfaces:**
- Consumes (from Task 1): `window.cgFreeTasksOf`.
- Consumes (from Task 3): nothing new beyond what's already in the Vue instance.
- Produces: `addToProjectMode` data (`'new' | 'existing'`), `phaseFreeState(phase)` method returning `'none' | 'some' | 'all'`, `selectAllFreeState()` method (same return type, whole-draft scope), `phasingCollapsed` data (default `false`).

- [ ] **Step 1: Write a failing test for the id-only free-task bug fix**

```js
// js/lib/costgrid-calc.test.js — add to the existing file
describe('cgGenerateProject uses cgFreeTasksOf (bug regression)', () => {
  it('js/costgrid.js counts free tasks via cgFreeTasksOf, not raw assignedIds', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'js', 'costgrid.js'), 'utf8');
    const fn = src.match(/function cgGenerateProject\(\)\s*\{([\s\S]*?)\n\}/)?.[1] || '';
    expect(fn).toMatch(/cgFreeTasksOf/);
    expect(fn).not.toMatch(/assignedIds\.has\(t\.taskId\)/);
  });
});
```

(`fs`/`path` need importing at the top of `costgrid-calc.test.js` if not already present from Task 1.)

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- costgrid-calc`
Expected: FAIL — `cgGenerateProject` still uses the manual `assignedIds.has(...)` filter.

- [ ] **Step 3: Fix `cgGenerateProject` in `js/costgrid.js` (lines 1023-1038)**

Replace the manual `assignedIds`/`freeTasks` computation with:
```js
const freeTasks = window.cgFreeTasksOf((v.phases || []).flatMap(ph => ph.tasks), v.linkedProjects);
```
Leave the rest of the function (the `freeTasks.length === 0` early return and entering selection mode) unchanged.

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test -- costgrid-calc`
Expected: PASS.

- [ ] **Step 5: Fix `selectAllFreeInPhase`/`selectAllFree` in `costgrid.html` (lines 1304-1315)**

Rewrite both to build on `window.cgFreeTasksOf`:
```js
selectAllFreeInPhase(phase) {
  window.cgFreeTasksOf(phase.tasks, this.draft.linkedProjects).forEach(task => {
    this.selectedTaskIds.add(task.taskId); _cgSelectedTaskIds.add(task.taskId);
  });
},
selectAllFree() {
  window.cgFreeTasksOf((this.draft.phases || []).flatMap(ph => ph.tasks), this.draft.linkedProjects).forEach(task => {
    this.selectedTaskIds.add(task.taskId); _cgSelectedTaskIds.add(task.taskId);
  });
},
```

- [ ] **Step 6: Implement the Select-free/Clear-phase and Select-all-free/Clear-selection toggles**

Add `phaseFreeState(phase)`: compute `const free = window.cgFreeTasksOf(phase.tasks, this.draft.linkedProjects); if (!free.length) return 'none'; return free.every(t => this.selectedTaskIds.has(t.taskId)) ? 'all' : 'some';`. Add `toggleFreeInPhase(phase)`: if state is `'all'`, remove each free task's id from `selectedTaskIds`/`_cgSelectedTaskIds`; otherwise call `selectAllFreeInPhase(phase)`. Mirror both at the whole-draft level as `selectAllFreeState()`/`toggleSelectAllFree()`. Update the phase-row template (replace the "☑ free" link, `:366` area) and the sticky bottom bar's left link (`:374`) to use these, with labels "Select free (n)"/"Clear phase" and "Select all free (n)"/"Clear selection" (`n` = `free.length`).

- [ ] **Step 7: Implement the single-CTA selection bar**

Replace the sticky bar's right side (today both "＋ Add to project" and "▶ Create project" always rendered, `:376-386`) with: a two-segment `New project`/`Existing project` control bound to new `addToProjectMode` data (default `'new'`; "Existing project" segment `:disabled` + tooltip when `!draft.linkedProjects.length`); the existing `addToProjectSel` dropdown shown only when `addToProjectMode === 'existing'`, auto-selected when `linkedProjects.length === 1`; Cancel (`cancelSelection`, unchanged); one CTA: `v-if="addToProjectMode === 'new'"` → "Create project" (`confirmAndGenerate`), else "Add {{ selectedTaskIds.size }} to project" (`addToProject`) — both `:disabled="selectedTaskIds.size === 0 || (addToProjectMode === 'existing' && !addToProjectSel)"`.

- [ ] **Step 8: Fix the last native `alert()`**

In `onHoursBlur` (`costgrid.html:1292-1297`), replace `alert(...)` with `showInfo(...)`, same message text.

- [ ] **Step 9: Make Monthly Phasing always visible**

Change the panel's `v-if="phasingMonths.length"` (`:390`) to render unconditionally; add `phasingCollapsed` data (default `false`) and make the header clickable (same pattern as the three section cards); when `phasingMonths.length === 0`, render the message "Set Start and End in Offer details to see the monthly breakdown. Values fill in as you add roles and hours." in place of the table, and "no period set" in place of the Total/months summary in the header. Add a thin proportional bar under the Budget row's amount per month (`width: (phasingByMonth.amount[mo] / maxMonthAmount) * 100 + '%'`, `maxMonthAmount` a small inline computed over `Object.values(phasingByMonth.amount)`).

- [ ] **Step 10: Add the tablet media query to `css/costgrid.css`**

`@media (max-width: 1023px)`: `.cg-col-fixed { min-width: 220px; }`, hide `.cg-legend`. No other behavior changes — `flex-wrap` on the offer-summary and selection-bar rows is enough for wrapping (verify visually in Step 12, don't add new markup).

- [ ] **Step 11: Bump `js/costgrid.js` version and run full suite**

Bump `js/costgrid.js?v=40` → `?v=41` in `costgrid.html` and `pipeline.html` (this task changes `cgGenerateProject` and `onHoursBlur`, so the version must move again from Task 2's `?v=40`); update `proposal-modals-guard.test.js`'s `costgridJsVersion` expectations to `'41'`.
Run: `npm test`
Expected: PASS.

- [ ] **Step 12: Manual smoke check (desktop + 1024px + tablet widths, per spec §10 Gate 2 list)**

At 1440/1024px, on: new empty Draft, filled Draft, SIP with linked projects, locked version, viewer permission — verify: Select free/Clear phase/Clear selection toggle correctly with a mix of free and name-only-assigned tasks; the bottom bar shows exactly one CTA and the Existing-project segment is disabled with no linked projects; Monthly Phasing shows its empty-period message on a Draft with no Start/End, and the proportional bars render once hours exist; invalid sold hours now shows the `showInfo` dialog, not a native alert; the grid remains usable at 1024px width (220px fixed column, no legend).

- [ ] **Step 13: Update documentation**

`CLAUDE.md`: update the `costgrid.html` table row and `css/*` file-structure block to mention `css/costgrid.css`; rewrite "Version tab switching (editor)" section for the no-modal "+ New version" flow (Task 2) and reference the new header/grid structure. `docs/pages/costgrid.md`: add the cycle's narrative — card persistence, ⋮ menu, selection segmented control, the brief's §10 rulings (Decisions 1-6 from the spec), and the two bugs fixed (id-only free-task check; `PDash_cgCompactHeader` persistence).

- [ ] **Step 14: Commit**

```bash
git add costgrid.html pipeline.html js/costgrid.js css/costgrid.css js/lib/costgrid-calc.test.js js/lib/proposal-modals-guard.test.js CLAUDE.md docs/pages/costgrid.md
git commit -m "feat(costgrid): single-CTA selection bar, free-task bug fix, always-visible phasing, docs"
```

---

## Self-review notes (for the record)

- **Spec coverage:** §2 (Task 2), §3 (Task 2), §4 (Task 3), §5 (Task 4), §6 (Task 4), §7 (Task 4 step 10), §8 pure-function list (Task 1 + Task 4 step 3/5), §9/§10 copy and color mapping (referenced inline per task, not restated), §11 docs (Task 4 step 13). No spec section is without an owning task.
- **Type/name consistency checked:** `cgFreeTasksOf`, `cgOfferDetailsSummary`, `cgSectionDefaults` are introduced once (Task 1) and consumed with the same signatures in Tasks 2/3/4; `openRoleMenuCode`/`removeColumnConfirm` introduced in Task 3, not redefined later; `addToProjectMode`/`phaseFreeState`/`selectAllFreeState` introduced once in Task 4.
- **Proportion check:** plan is longer than the spec because it pins exact line ranges and function bodies-to-reuse for a 1500-line file with many interdependent inline styles; no task step includes a full template rewrite verbatim — each points at the existing block to replace and the new class/behavior, consistent with "signature + test + reused body description" rather than a transcript.
