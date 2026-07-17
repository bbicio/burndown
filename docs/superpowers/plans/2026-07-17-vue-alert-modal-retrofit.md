# Alert/Confirm + Modal-Idiom Retrofit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every native `alert()`/`window.confirm()` from `_db-reset.html` and `project-config.html`, replacing them with reactive inline messages or the existing shared confirm modal; standardize both files on the per-call `bootstrap.Modal.getOrCreateInstance()` idiom.

**Architecture:** Presentation-only retrofit within two already-Vue files. `_db-reset.html` drops its `mounted()`-time `new bootstrap.Modal(el)` pre-instantiation for the per-call idiom already used in `project-config.html`, and its 2 `alert()` sites become a shared reactive `scopeErrorMsg`. `project-config.html`'s `showConfirm()` changes from a callback-style helper to a `Promise<boolean>`-returning one (needed to preserve the blocking "Save anyway?" semantics), and every existing caller of the callback form migrates to the new `await`-based form for one consistent signature. Its remaining 9 `alert()` sites become reactive fields near their triggering section.

**Tech Stack:** No new dependencies — same Vue 3 CDN / Bootstrap 5.3.2 already in place on both pages.

## Global Constraints

1. No behavior change beyond presentation mechanism — every converted message keeps its exact original text (verbatim), every guard that returned early still returns early, the empty-phasing "Save anyway?" still blocks the save when declined.
2. `_db-reset.html`'s `confirmDelete()`/`pendingScope`/`pendingCgId` dispatcher logic is untouched — only how the modal *instance* is obtained/released changes (`new bootstrap.Modal(el)` in `mounted()` → per-call `getOrCreateInstance(el)`/`getInstance(el)`).
3. `project-config.html`'s `showConfirm()` signature changes from `(message, onConfirm)` to `(message) → Promise<boolean>`. Every internal caller in this file migrates to the new signature in this same cycle — no dual signature support, no leftover callback-style call anywhere in the file once this plan is done.
4. No API/backend changes. No new `js/lib/*` module needed (this is Vue template/state only).
5. `pdash-nginx` serves `main`'s working directory only — manual verification is a post-merge step (Task 4).

---

## File Structure

- Modify: `_db-reset.html` (Task 1)
- Modify: `project-config.html` (Tasks 2-3)

---

### Task 1: `_db-reset.html` — modal idiom + alert retrofit

**Files:**
- Modify: `_db-reset.html`

**Interfaces:** None — self-contained page, no other file depends on its internals.

- [ ] **Step 1: Add the shared scope-error message area to the template**

In `_db-reset.html`, immediately after the opening `<div id="resetCards">` line (currently line 49) and before the `v-for` card div, add:

```html
      <div id="resetCards">
        <div v-if="scopeErrorMsg" class="alert alert-danger py-2 mb-3" style="grid-column:1 / -1">{{ scopeErrorMsg }}</div>
        <div class="danger-card" v-for="s in scopes" :key="s.scope">
```

(`grid-column:1 / -1` makes the message span the full width of the `#resetCards` CSS grid, matching the grid's own `display:grid` layout defined in the `<style>` block — otherwise the alert would only occupy one grid cell.)

- [ ] **Step 2: Add `scopeErrorMsg` to `data()`, remove `_modal`**

Change:
```js
        scopeDoneFlag: null,

        cgIdInput: '',
```
to:
```js
        scopeDoneFlag: null,
        scopeErrorMsg: '',

        cgIdInput: '',
```

And remove the `_modal: null,` line from `data()` entirely (it's no longer needed once `mounted()` stops storing an instance).

- [ ] **Step 3: Change `mounted()` to stop pre-instantiating the modal**

Change:
```js
    mounted() {
      const el = document.getElementById('confirmModal');
      this._modal = new bootstrap.Modal(el);
      el.addEventListener('hidden.bs.modal', () => {
        this.pendingScope = null;
        this.pendingCgId = null;
        this.confirmInputValue = '';
      });
    },
```
to:
```js
    mounted() {
      document.getElementById('confirmModal').addEventListener('hidden.bs.modal', () => {
        this.pendingScope = null;
        this.pendingCgId = null;
        this.confirmInputValue = '';
      });
    },
```

- [ ] **Step 4: Replace the 6 `this._modal.show()`/`.hide()` call sites with the per-call idiom**

In `openScopeConfirm(scope)`, change:
```js
      openScopeConfirm(scope) {
        this.pendingScope = scope;
        this.pendingCgId = null;
        const s = this.scopes.find(x => x.scope === scope);
        this.confirmText = 'You are about to permanently delete ' + s.label + '.';
        this.confirmInputValue = '';
        this._modal.show();
      },
```
to:
```js
      openScopeConfirm(scope) {
        this.pendingScope = scope;
        this.pendingCgId = null;
        this.scopeErrorMsg = '';
        const s = this.scopes.find(x => x.scope === scope);
        this.confirmText = 'You are about to permanently delete ' + s.label + '.';
        this.confirmInputValue = '';
        bootstrap.Modal.getOrCreateInstance(document.getElementById('confirmModal')).show();
      },
```
(Note the added `this.scopeErrorMsg = '';` — clears any stale error from a previous attempt before opening a new confirm.)

In `openCgDeleteConfirm()`, change the trailing `this._modal.show();` to `bootstrap.Modal.getOrCreateInstance(document.getElementById('confirmModal')).show();` (no other change needed here — this method doesn't touch `scopeErrorMsg`).

In `_doScopeDelete()`, change:
```js
      async _doScopeDelete() {
        const scope = this.pendingScope;
        this.confirmBusy = true;
        try {
          const res = await fetch('/api/admin/reset/' + scope, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          });
          const data = await res.json();
          this._modal.hide();

          if (!res.ok) {
            alert('Error: ' + (data.error || 'Unknown error'));
            return;
          }

          this.scopeDoneFlag = { scope };
          setTimeout(() => { this.scopeDoneFlag = null; }, 3000);
        } catch (e) {
          this._modal.hide();
          alert('Network error: ' + e.message);
        } finally {
          this.confirmBusy = false;
        }
      },
```
to:
```js
      async _doScopeDelete() {
        const scope = this.pendingScope;
        this.confirmBusy = true;
        try {
          const res = await fetch('/api/admin/reset/' + scope, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          });
          const data = await res.json();
          bootstrap.Modal.getInstance(document.getElementById('confirmModal'))?.hide();

          if (!res.ok) {
            this.scopeErrorMsg = 'Error: ' + (data.error || 'Unknown error');
            return;
          }

          this.scopeDoneFlag = { scope };
          setTimeout(() => { this.scopeDoneFlag = null; }, 3000);
        } catch (e) {
          bootstrap.Modal.getInstance(document.getElementById('confirmModal'))?.hide();
          this.scopeErrorMsg = 'Network error: ' + e.message;
        } finally {
          this.confirmBusy = false;
        }
      },
```

In `_doCgDelete()`, change both `this._modal.hide();` occurrences (the one right after `const data = await res.json();` and the one in the `catch` block) to `bootstrap.Modal.getInstance(document.getElementById('confirmModal'))?.hide();`. No other change in this method — it already uses `cgDeleteMsg`, not `alert()`.

- [ ] **Step 5: Verify no remaining `alert(`/`_modal` references**

Run: `grep -n "alert(\|_modal" _db-reset.html`
Expected: zero matches (the only remaining `Modal` references are `bootstrap.Modal.getOrCreateInstance`/`getInstance`, which won't match the literal string `_modal` since there's no underscore-prefixed variable left).

- [ ] **Step 6: Run the frontend test suite**

Run: `npm test` — expect all existing tests to still pass (this file has no dedicated test coverage; this step only confirms nothing else broke).

- [ ] **Step 7: Commit**

```bash
git add _db-reset.html
git commit -m "$(cat <<'EOF'
refactor(db-reset): remove native alert(), standardize modal idiom

Replaces the 2 alert() calls (scope-delete API/network failure) with
a shared scopeErrorMsg reactive field, rendered above the scope-delete
card grid. Switches from mounted()-time new bootstrap.Modal(el)
pre-instantiation to the per-call bootstrap.Modal.getOrCreateInstance()
idiom already used in project-config.html — the confirmDelete()/
pendingScope/pendingCgId dispatcher logic itself is unchanged.

Design: docs/superpowers/specs/2026-07-17-vue-alert-modal-retrofit-design.md
EOF
)"
```

---

### Task 2: `project-config.html` — `showConfirm()` becomes Promise-based, migrate all callers

**Files:**
- Modify: `project-config.html`

**Interfaces:**
- Produces: `showConfirm(message) → Promise<boolean>`, replacing the old `showConfirm(message, onConfirm)`.
- Consumes/changes: every existing caller of the old signature (`confirmRemoveTask`, `confirmRemoveResource`, `confirmRemovePtc`, `onClearData`, `derivePhasing`, `runReforecast`) and the `onSave()` empty-phasing `window.confirm()`.

- [ ] **Step 1: Replace `showConfirm`/`confirmModalOk` with the Promise-based versions**

Change:
```js
      showConfirm(message, onConfirm) {
        this.confirmModal = { message, onConfirm };
        bootstrap.Modal.getOrCreateInstance(document.getElementById('confirmModal')).show();
      },
      confirmModalOk() {
        const cb = this.confirmModal.onConfirm;
        bootstrap.Modal.getInstance(document.getElementById('confirmModal'))?.hide();
        if (cb) cb();
      },
```
to:
```js
      showConfirm(message) {
        this.confirmModal = { message };
        return new Promise(resolve => {
          const el = document.getElementById('confirmModal');
          this._confirmAccepted = false;
          this._confirmResolve = () => { this._confirmAccepted = true; };
          const onHidden = () => {
            el.removeEventListener('hidden.bs.modal', onHidden);
            resolve(this._confirmAccepted);
          };
          el.addEventListener('hidden.bs.modal', onHidden);
          bootstrap.Modal.getOrCreateInstance(el).show();
        });
      },
      confirmModalOk() {
        if (this._confirmResolve) this._confirmResolve();
        bootstrap.Modal.getInstance(document.getElementById('confirmModal'))?.hide();
      },
```

Also change `confirmModal: { message: '', onConfirm: null },` in `data()` to `confirmModal: { message: '' },` (the `onConfirm` field is no longer part of this object's shape — resolution now happens via the Promise, not a stored callback).

Note: `_confirmAccepted`/`_confirmResolve` are plain instance properties (not declared in `data()`), matching this codebase's existing convention of non-reactive helper state living outside `data()` when it's not meant to drive the template (same pattern as `_modal` in `admin.html`/`_db-reset.html` before Task 1's change) — Vue 3 does not make properties assigned outside `data()` reactive, which is fine here since nothing in the template reads `_confirmAccepted`/`_confirmResolve` directly.

- [ ] **Step 2: Migrate `confirmRemoveTask`/`confirmRemoveResource`/`confirmRemovePtc` to the Promise style**

Change:
```js
      confirmRemoveTask(ti) {
        const name = this.project.tasks[ti].name.trim() || 'this task';
        this.showConfirm(`Delete task "${name}" and all its resources?`, () => { this.project.tasks.splice(ti, 1); });
      },
```
to:
```js
      async confirmRemoveTask(ti) {
        const name = this.project.tasks[ti].name.trim() || 'this task';
        if (await this.showConfirm(`Delete task "${name}" and all its resources?`)) {
          this.project.tasks.splice(ti, 1);
        }
      },
```

Change:
```js
      confirmRemoveResource(ti, ri) {
        const role = this.project.tasks[ti].resources[ri].role.trim() || 'this resource';
        this.showConfirm(`Remove resource "${role}"?`, () => { this.project.tasks[ti].resources.splice(ri, 1); });
      },
```
to:
```js
      async confirmRemoveResource(ti, ri) {
        const role = this.project.tasks[ti].resources[ri].role.trim() || 'this resource';
        if (await this.showConfirm(`Remove resource "${role}"?`)) {
          this.project.tasks[ti].resources.splice(ri, 1);
        }
      },
```

Change:
```js
      confirmRemovePtc(pi) {
        const title = this.project.ptc[pi].title.trim() || 'this entry';
        this.showConfirm(`Remove PTC "${title}"?`, () => { this.project.ptc.splice(pi, 1); });
      },
```
to:
```js
      async confirmRemovePtc(pi) {
        const title = this.project.ptc[pi].title.trim() || 'this entry';
        if (await this.showConfirm(`Remove PTC "${title}"?`)) {
          this.project.ptc.splice(pi, 1);
        }
      },
```

- [ ] **Step 3: Migrate `onClearData()`**

Change:
```js
      onClearData() {
        if (!this.project.id) return;
        this.showConfirm(`Clear all cached XLS data for project "${this.project.id}"?`, () => {
          clearProjectData(this.project.id);
          window.location.href = '/portfolio.html';
        });
      },
```
to:
```js
      async onClearData() {
        if (!this.project.id) return;
        if (await this.showConfirm(`Clear all cached XLS data for project "${this.project.id}"?`)) {
          clearProjectData(this.project.id);
          window.location.href = '/portfolio.html';
        }
      },
```

- [ ] **Step 4: Migrate `derivePhasing()`**

Change:
```js
      derivePhasing() {
        const tasks = this.project.tasks.filter(t => t.billable !== false);
        const months = this.projectMonths;
        if (!months.length) { alert('Set project dates first.'); return; }
        const result = deriveDistribution(tasks, months, this.project.startDate, this.project.endDate);
        const fmtB = n => this.fmtMoney(n);
        const message = `Phasing and planning will be computed from task date ranges, distributing each task's budget proportionally to the days of overlap with each month.\n\n`
          + `Total budget distributed: ${fmtB(result.totalBudget)} across ${months.length} months\n`
          + `Total hours distributed: ${result.totalHours.toLocaleString('en-US')} h`;
        this.showConfirm(message, () => {
          this.project.phasing = result.newPhasing;
          this.project.planning = result.newPlanning;
        });
      },
```
to (note: the `alert('Set project dates first.')` guard is left in place here deliberately — Task 3 converts it, to keep this task scoped purely to `showConfirm()` migration):
```js
      async derivePhasing() {
        const tasks = this.project.tasks.filter(t => t.billable !== false);
        const months = this.projectMonths;
        if (!months.length) { alert('Set project dates first.'); return; }
        const result = deriveDistribution(tasks, months, this.project.startDate, this.project.endDate);
        const fmtB = n => this.fmtMoney(n);
        const message = `Phasing and planning will be computed from task date ranges, distributing each task's budget proportionally to the days of overlap with each month.\n\n`
          + `Total budget distributed: ${fmtB(result.totalBudget)} across ${months.length} months\n`
          + `Total hours distributed: ${result.totalHours.toLocaleString('en-US')} h`;
        if (await this.showConfirm(message)) {
          this.project.phasing = result.newPhasing;
          this.project.planning = result.newPlanning;
        }
      },
```

- [ ] **Step 5: Migrate `runReforecast()`**

Change the trailing part of `runReforecast()` from:
```js
        this.showConfirm(message, () => {
          this.project.phasing = result.newPhasing;
          this.project.planning = result.newPlanning;
        });
      },
```
to:
```js
        if (await this.showConfirm(message)) {
          this.project.phasing = result.newPhasing;
          this.project.planning = result.newPlanning;
        }
      },
```
(`runReforecast()` is already declared `async` — no signature change needed there, only the trailing `showConfirm` call.)

- [ ] **Step 6: Migrate `onSave()`'s empty-phasing `window.confirm()`**

Change:
```js
        if (hasBillable && phasingEmpty) {
          if (!window.confirm('The budget phasing for this project is empty — no monthly budget is configured.\n\nSave anyway?')) return;
        }
```
to:
```js
        if (hasBillable && phasingEmpty) {
          const proceed = await this.showConfirm('The budget phasing for this project is empty — no monthly budget is configured.\n\nSave anyway?');
          if (!proceed) return;
        }
```
(`onSave()` is already declared `async` — no signature change needed there.)

- [ ] **Step 7: Verify no remaining `window.confirm(` and no remaining callback-style `showConfirm` calls**

Run: `grep -n "window.confirm(\|showConfirm(.*=>" project-config.html`
Expected: zero matches (every `showConfirm(...)` call now takes exactly one argument, a message string — no second `() => {...}` callback argument anywhere).

- [ ] **Step 8: Run the frontend test suite**

Run: `npm test` — expect all existing tests to still pass (this page has no dedicated UI test coverage; this step only confirms nothing else broke).

- [ ] **Step 9: Commit**

```bash
git add project-config.html
git commit -m "$(cat <<'EOF'
refactor(project-config): showConfirm() becomes Promise-based

Changes showConfirm(message, onConfirm) to showConfirm(message) ->
Promise<boolean>, needed to preserve the blocking semantics of the
onSave() empty-phasing "Save anyway?" confirmation (previously a
native window.confirm()). Migrates every existing caller
(confirmRemoveTask/Resource/Ptc, onClearData, derivePhasing,
runReforecast) to the same await-based style for one consistent
signature within the file — no dual calling convention.

Design: docs/superpowers/specs/2026-07-17-vue-alert-modal-retrofit-design.md
EOF
)"
```

---

### Task 3: `project-config.html` — remaining `alert()` sites become reactive inline fields

**Files:**
- Modify: `project-config.html`

**Interfaces:**
- Produces: `data()` fields `actuals.guardMsg`, `tasksXlsxError`, `phasingActionError` (new); reuses existing `jsonError` for the sold-hours validation site.

- [ ] **Step 1: Add the new reactive fields to `data()`**

Change:
```js
        actuals: { info: 'Save the project first to enable actuals upload.', status: '', statusClass: '', exportRows: null },
```
to:
```js
        actuals: { info: 'Save the project first to enable actuals upload.', status: '', statusClass: '', exportRows: null, guardMsg: '' },
        tasksXlsxError: '',
        phasingActionError: '',
```

- [ ] **Step 2: Convert the Actuals-upload guard (`onActualsFileChange`)**

Change:
```js
      async onActualsFileChange(e) {
        const file = e.target.files[0];
        if (!file) return;
        if (!this.project.code) { alert('Set the D365 Project ID first before uploading actuals.'); return; }
        this.actuals.status = '⏳ Uploading…'; this.actuals.statusClass = 'text-muted';
```
to:
```js
      async onActualsFileChange(e) {
        const file = e.target.files[0];
        if (!file) return;
        this.actuals.guardMsg = '';
        if (!this.project.code) { this.actuals.guardMsg = 'Set the D365 Project ID first before uploading actuals.'; return; }
        this.actuals.status = '⏳ Uploading…'; this.actuals.statusClass = 'text-muted';
```

Add the guard-message display to the Actuals section template. Change:
```html
        <div class="text-muted small py-1" v-html="actuals.info"></div>
        <div class="small mt-1" v-if="actuals.status" :class="actuals.statusClass">{{ actuals.status }}</div>
```
to:
```html
        <div class="text-muted small py-1" v-html="actuals.info"></div>
        <div class="small mt-1 text-danger" v-if="actuals.guardMsg">{{ actuals.guardMsg }}</div>
        <div class="small mt-1" v-if="actuals.status" :class="actuals.statusClass">{{ actuals.status }}</div>
```

- [ ] **Step 3: Convert the XLSX-unavailable guard (`exportTasksXlsx`)**

Change:
```js
      exportTasksXlsx() {
        if (typeof XLSX === 'undefined') { alert('XLSX library not available.'); return; }
        const proj = this.project;
```
to:
```js
      exportTasksXlsx() {
        this.tasksXlsxError = '';
        if (typeof XLSX === 'undefined') { this.tasksXlsxError = 'XLSX library not available.'; return; }
        const proj = this.project;
```

Add the error display next to the "⬇ XLSX" button in the Tasks & Resources section header. Change:
```html
  <div class="d-flex justify-content-between align-items-center cfg-section-title">
    <span>3. Tasks &amp; Resources</span>
    <div class="d-flex gap-2">
      <button class="btn btn-sm btn-outline-secondary" @click="exportTasksXlsx">⬇ XLSX</button>
      <button class="btn btn-sm btn-primary" v-if="!isViewer" @click="addTask">+ Add task</button>
    </div>
  </div>
  <p class="text-muted small mb-3">Task name must match exactly the <strong>Task/Issue</strong> XLS column. Role must match <strong>Job Role: Name</strong>.</p>
```
to:
```html
  <div class="d-flex justify-content-between align-items-center cfg-section-title">
    <span>3. Tasks &amp; Resources</span>
    <div class="d-flex gap-2">
      <button class="btn btn-sm btn-outline-secondary" @click="exportTasksXlsx">⬇ XLSX</button>
      <button class="btn btn-sm btn-primary" v-if="!isViewer" @click="addTask">+ Add task</button>
    </div>
  </div>
  <div v-if="tasksXlsxError" class="alert alert-danger py-1 px-2 small mb-2">{{ tasksXlsxError }}</div>
  <p class="text-muted small mb-3">Task name must match exactly the <strong>Task/Issue</strong> XLS column. Role must match <strong>Job Role: Name</strong>.</p>
```

- [ ] **Step 4: Convert the sold-hours validation alert (reuse `jsonError`)**

Change, inside `onSave()`:
```js
        for (const task of this.project.tasks) {
          for (const r of task.resources) {
            if (r.soldHours && !isValidSoldHours(r.soldHours)) {
              alert(`Invalid sold hours "${r.soldHours}" for role "${r.role}" on task "${task.name}". Allowed values: whole numbers, or with a fraction of .25, .5, or .75.`);
              return;
            }
          }
        }
```
to:
```js
        this.jsonError = '';
        for (const task of this.project.tasks) {
          for (const r of task.resources) {
            if (r.soldHours && !isValidSoldHours(r.soldHours)) {
              this.jsonError = `Invalid sold hours "${r.soldHours}" for role "${r.role}" on task "${task.name}". Allowed values: whole numbers, or with a fraction of .25, .5, or .75.`;
              return;
            }
          }
        }
```
(`jsonError` is already rendered at the top of the ready-state template — `<div v-if="jsonError" class="alert alert-danger py-2 small">{{ jsonError }}</div>` — no template change needed for this one. The added `this.jsonError = '';` at the top clears any stale error from a previous save attempt before re-validating.)

- [ ] **Step 5: Convert the Derive/Reforecast guards and errors**

Change `derivePhasing()`'s guard:
```js
      async derivePhasing() {
        const tasks = this.project.tasks.filter(t => t.billable !== false);
        const months = this.projectMonths;
        if (!months.length) { alert('Set project dates first.'); return; }
```
to:
```js
      async derivePhasing() {
        this.phasingActionError = '';
        const tasks = this.project.tasks.filter(t => t.billable !== false);
        const months = this.projectMonths;
        if (!months.length) { this.phasingActionError = 'Set project dates first.'; return; }
```

Change `runReforecast()`'s three alert sites:
```js
      async runReforecast() {
        const tasks = this.project.tasks.filter(t => t.billable !== false);
        const months = this.projectMonths;
        if (!months.length) { alert('Set project start and end dates first.'); return; }
        if (!this.project.code) { alert('Set the D365 Project ID first before running Reforecast.'); return; }

        let actualsRows = [];
        try {
          const uploads = await Api.timesheets.get(this.project.code);
          actualsRows = (uploads || []).flatMap(u => u.data || []);
        } catch (e) { alert('Could not load actuals from server: ' + e.message); return; }

        const now = new Date();
        const currentYm = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}`;
        const result = reforecastDistribution(tasks, months, actualsRows, currentYm);
        if (result.distError) { alert('Cannot reforecast:\n\n' + result.distError); return; }
```
to:
```js
      async runReforecast() {
        this.phasingActionError = '';
        const tasks = this.project.tasks.filter(t => t.billable !== false);
        const months = this.projectMonths;
        if (!months.length) { this.phasingActionError = 'Set project start and end dates first.'; return; }
        if (!this.project.code) { this.phasingActionError = 'Set the D365 Project ID first before running Reforecast.'; return; }

        let actualsRows = [];
        try {
          const uploads = await Api.timesheets.get(this.project.code);
          actualsRows = (uploads || []).flatMap(u => u.data || []);
        } catch (e) { this.phasingActionError = 'Could not load actuals from server: ' + e.message; return; }

        const now = new Date();
        const currentYm = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}`;
        const result = reforecastDistribution(tasks, months, actualsRows, currentYm);
        if (result.distError) { this.phasingActionError = 'Cannot reforecast:\n\n' + result.distError; return; }
```

Add the error display in the Monthly Budget Phasing section (section 4), right after its action-buttons row. Change:
```html
      <div class="cfg-section">
  <div class="d-flex justify-content-between align-items-center cfg-section-title">
    <span>4. Monthly Budget Phasing <span class="fw-normal text-muted">(estimated budget to spend per month)</span></span>
    <div class="d-flex gap-2 align-items-center flex-wrap" v-if="!isViewer">
      <button class="btn btn-sm btn-outline-secondary" @click="derivePhasing">⟳ Derive from task dates</button>
      <button class="btn btn-sm btn-outline-secondary" v-if="reforecastVisible" @click="runReforecast">↻ Reforecast from actuals</button>
    </div>
  </div>
  <div class="mt-1" v-if="projectMonths.length">
```
to:
```html
      <div class="cfg-section">
  <div class="d-flex justify-content-between align-items-center cfg-section-title">
    <span>4. Monthly Budget Phasing <span class="fw-normal text-muted">(estimated budget to spend per month)</span></span>
    <div class="d-flex gap-2 align-items-center flex-wrap" v-if="!isViewer">
      <button class="btn btn-sm btn-outline-secondary" @click="derivePhasing">⟳ Derive from task dates</button>
      <button class="btn btn-sm btn-outline-secondary" v-if="reforecastVisible" @click="runReforecast">↻ Reforecast from actuals</button>
    </div>
  </div>
  <div v-if="phasingActionError" class="alert alert-danger py-1 px-2 small mb-2" style="white-space:pre-line">{{ phasingActionError }}</div>
  <div class="mt-1" v-if="projectMonths.length">
```

(`style="white-space:pre-line"` preserves the multi-line `distError` message's `\n` line breaks, matching the shared confirm modal's own `white-space:pre-line` treatment for consistency.)

- [ ] **Step 6: Verify no remaining `alert(` in the file**

Run: `grep -n "alert(" project-config.html`
Expected: zero matches.

- [ ] **Step 7: Run the frontend test suite**

Run: `npm test` — expect all existing tests to still pass.

- [ ] **Step 8: Commit**

```bash
git add project-config.html
git commit -m "$(cat <<'EOF'
refactor(project-config): remove remaining native alert() calls

Converts the 7 remaining alert() sites (actuals-upload guard, XLSX-
unavailable guard, sold-hours validation, Derive/Reforecast guards
and errors) to reactive inline messages rendered near their
triggering section, preserving exact original message text and
early-return semantics.

Design: docs/superpowers/specs/2026-07-17-vue-alert-modal-retrofit-design.md
EOF
)"
```

---

### Task 4: Manual verification (post-merge only — do not attempt during Tasks 1-3's review cycle)

**This task cannot be executed until after `/finish-cycle`'s Gate 4 (merge) completes**, per Global Constraint 5.

**Files:** None — manual browser checklist.

- [ ] **Step 1: `_db-reset.html` — scope-delete error path** — force a scope-delete API failure (or trigger one naturally if reachable) and confirm the red message area appears above the card grid with the exact original error text, not a native dialog; confirm it clears on the next attempt.
- [ ] **Step 2: `_db-reset.html` — modal idiom** — open/close the confirm modal via a scope-delete and via the single-proposal-delete flow; confirm both still work identically to before (modal opens, `DELETE` gate still works, Cancel/dismiss still resets `pendingScope`/`pendingCgId`/`confirmInputValue`).
- [ ] **Step 3: `project-config.html` — task/resource/PTC removal** — remove a task, a resource, and a PTC entry; confirm each still shows the confirm modal with the same message text and actually removes the item on Confirm, does nothing on Cancel.
- [ ] **Step 4: `project-config.html` — Clear XLS data** — confirm the modal appears with the same message, and clicking Confirm still clears data and redirects to `/portfolio.html`.
- [ ] **Step 5: `project-config.html` — Derive from task dates** — confirm the modal shows the same preview totals, and confirming still populates the phasing/planning grids.
- [ ] **Step 6: `project-config.html` — Reforecast from actuals** — same check, including the `distError` case if reachable (enter a monthlyDistribution that would trigger it) — confirm the multi-line error renders correctly with line breaks in `phasingActionError`, not via `alert()`.
- [ ] **Step 7: `project-config.html` — Save with empty phasing** — leave phasing empty on a project with billable tasks, click Save, confirm the modal (not `window.confirm()`) appears with the same message, and declining aborts the save while confirming proceeds.
- [ ] **Step 8: `project-config.html` — remaining guards** — trigger the actuals-upload-without-ID guard, the sold-hours validation failure, and (if `XLSX` can be made unavailable for testing, otherwise skip) the XLSX-unavailable guard; confirm each shows inline, not via `alert()`, with the exact original text.
- [ ] **Step 9: Console check** — throughout Steps 1-8, confirm no console errors.
- [ ] **Step 10: Record the result** — note in the cycle's `/finish-cycle` report that manual verification was completed post-merge, listing the checks above. If any check fails, this is a regression — do not close the cycle; fix on a new small follow-up commit, re-verify, then close.

---

## Self-Review Notes

- **Spec coverage:** every alert/confirm site listed in the design spec's Components section (`_db-reset.html:225,233`; `project-config.html:520,534,581,590,747,761,762,768,773`) has a corresponding conversion step across Tasks 1-3. The modal-idiom change (`_db-reset.html`) is Task 1. The `showConfirm()` Promise conversion and all its callers (`project-config.html`) is Task 2, kept separate from Task 3's remaining-`alert()` conversions so each task stays independently reviewable and testable (per the design's own resolved open question — one cycle, multiple tasks).
- **Placeholder scan:** no TBD/TODO; every step shows the complete before/after code, not a description of what to change.
- **Type consistency:** `showConfirm(message)` is called with exactly one argument everywhere after Task 2 — verified by Task 2's own Step 7 grep check. `phasingActionError`/`tasksXlsxError`/`actuals.guardMsg` names are used identically between their `data()` declaration (Task 3 Step 1) and their read/write sites (Task 3 Steps 2,3,5) and template bindings — no naming drift.
