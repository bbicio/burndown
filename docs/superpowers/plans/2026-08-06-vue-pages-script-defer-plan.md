# Defer/Async Script Loading Across the 13 Vue Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shorten the blank-screen window before Vue mounts on all 13 Vue-mounted pages by marking every classic `<script src="...">` tag `defer`, with zero functional regression.

**Architecture:** Two mechanical edits per page: (1) add `defer` to every classic `<script src="...">` tag (CDN libraries and this project's own `js/*.js` files — `js/lib/*.js` files are already `type="module"` and need no change); (2) convert the page's trailing `Vue.createApp({...}).mount(...)` inline script to `type="module"` — **but only on pages where that call is not already wrapped in a `DOMContentLoaded` listener**. Verified during planning: `pipeline.html`, `costgrid.html`, and `planning.html` already wrap their entire Vue.createApp/mount call inside `document.addEventListener('DOMContentLoaded', () => {...})`, so their trailing script needs no conversion — the listener callback only runs once all deferred/module scripts have already executed, which is exactly the safety property module-conversion exists to provide on the other 10 pages. Any other inline script on a page that is not the trailing Vue.createApp block (small helper-function shims, `esc()` shims) is left completely untouched.

**Tech Stack:** Plain HTML `<script>` tag attributes. No new dependencies, no build step.

## Global Constraints

- No functional regression on any of the 13 pages — this is purely a script-loading-timing change.
- `js/lib/*.js` `<script type="module">` tags are already correct and must not be touched.
- Any inline script that is NOT the page's trailing `Vue.createApp(...).mount(...)` block (e.g. the `esc()` shims on `admin.html`/`timesheets.html`/`config.html`, the helper-function shims on `pipeline.html`/`planning.html`) must be left byte-for-byte unchanged.
- `pipeline.html`, `costgrid.html`, `planning.html`: only add `defer` to their classic `<script src>` tags — do NOT convert their trailing script to `type="module"` (already safely wrapped in `DOMContentLoaded`; converting it too would be an unnecessary, unrequired change).
- The other 10 pages (`portfolio.html`, `timesheets.html`, `config.html`, `project-config.html`, `admin.html`, `terms.html`, `login.html`, `activate.html`, `reset-password.html`, `_db-reset.html`): add `defer` to their classic `<script src>` tags AND convert their trailing `Vue.createApp` script tag to `type="module"`.
- Verification is manual, in a real browser, per page — no automated test can exercise real script-tag load-order timing. Each task's implementer runs `npm test` only as a quick regression sanity check (it does not exercise this change directly), and documents the page's specific manual-verification checklist (from the design spec) in its report for the controller to relay to the user.
- No bundler, no new external dependency.

---

### Task 1: `pipeline.html` — add `defer` only (no module conversion needed)

**Files:**
- Modify: `pipeline.html:340-355`

**Interfaces:** None — single-file, independent of every other task in this plan.

- [ ] **Step 1: Add `defer` to every classic `<script src>` tag in the identified block**

Replace lines 340-355:

```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script src="js/api.js?v=4"></script>
<script src="js/core.js?v=3"></script>
<script src="js/settings.js"></script>
<script src="js/notifications.js"></script>
<script src="js/roles.js"></script>
<script type="module" src="js/lib/cfg-parse.js?v=1"></script>
<script type="module" src="js/lib/costgrid-calc.js?v=3"></script>
<script type="module" src="js/lib/pipeline-calc.js?v=1"></script>
<script src="js/costgrid.js?v=5"></script>
<script src="js/clients.js"></script>
<script src="js/programs.js"></script>
<script src="js/api-sync.js?v=14"></script>
<script src="js/shares.js"></script>
<script src="js/nav.js?v=4"></script>
```

with:

```html
<script defer src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script defer src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script defer src="js/api.js?v=4"></script>
<script defer src="js/core.js?v=3"></script>
<script defer src="js/settings.js"></script>
<script defer src="js/notifications.js"></script>
<script defer src="js/roles.js"></script>
<script type="module" src="js/lib/cfg-parse.js?v=1"></script>
<script type="module" src="js/lib/costgrid-calc.js?v=3"></script>
<script type="module" src="js/lib/pipeline-calc.js?v=1"></script>
<script defer src="js/costgrid.js?v=5"></script>
<script defer src="js/clients.js"></script>
<script defer src="js/programs.js"></script>
<script defer src="js/api-sync.js?v=14"></script>
<script defer src="js/shares.js"></script>
<script defer src="js/nav.js?v=4"></script>
```

Leave the `type="module"` tags (`cfg-parse.js`, `costgrid-calc.js`, `pipeline-calc.js`) exactly as they are — do not add `defer` to them (redundant, modules are deferred by default). Leave the small helper-function script at `pipeline.html:357-362` (`function showCostGridEditorView(cgId, versionId) {...}`) and the main `DOMContentLoaded`-wrapped script at `pipeline.html:364-748` completely untouched — no attribute changes at all.

- [ ] **Step 2: Run the frontend test suite as a regression sanity check**

Run: `npm test`
Expected: all existing tests still pass (this change doesn't touch any `js/lib/*.js` logic, so this is a sanity check, not a direct test of the change).

- [ ] **Step 3: Self-review the diff**

Run: `git diff pipeline.html`
Confirm: exactly the 13 classic `<script src>` tags listed above gained `defer`; the 3 `type="module"` tags are unchanged; nothing else in the file changed (no accidental whitespace/line changes elsewhere).

- [ ] **Step 4: Record the manual verification checklist in your report**

Include this exact checklist in your task report (for the controller to relay to the user for manual browser testing — you do not need to perform it yourself):

> **pipeline.html** — hard reload (cache disabled). Console clean (no errors). Kanban board renders with all stage columns; clicking a card opens the detail panel (exercises `js/costgrid.js` global calls); Share/Clone modals open from the detail panel.

- [ ] **Step 5: Commit**

```bash
git add pipeline.html
git commit -m "perf: defer script loading on pipeline.html"
```

---

### Task 2: `planning.html` — add `defer` only (no module conversion needed)

**Files:**
- Modify: `planning.html:219-234`

**Interfaces:** None — single-file, independent of every other task in this plan.

- [ ] **Step 1: Add `defer` to every classic `<script src>` tag**

Replace lines 219-234:

```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"></script>
<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script src="js/api.js?v=3"></script>
<script src="js/core.js?v=3"></script>
<script src="js/settings.js"></script>
<script src="js/notifications.js"></script>
<script src="js/roles.js"></script>
<script type="module" src="js/lib/planning-calc.js?v=2"></script>
<script src="js/clients.js"></script>
<script src="js/programs.js"></script>
<script src="js/portfolio.js"></script>
<script src="js/upload.js"></script>
<script src="js/ai.js?v=1"></script>
<script src="js/api-sync.js?v=14"></script>
<script src="js/nav.js?v=4"></script>
```

with:

```html
<script defer src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"></script>
<script defer src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script defer src="js/api.js?v=3"></script>
<script defer src="js/core.js?v=3"></script>
<script defer src="js/settings.js"></script>
<script defer src="js/notifications.js"></script>
<script defer src="js/roles.js"></script>
<script type="module" src="js/lib/planning-calc.js?v=2"></script>
<script defer src="js/clients.js"></script>
<script defer src="js/programs.js"></script>
<script defer src="js/portfolio.js"></script>
<script defer src="js/upload.js"></script>
<script defer src="js/ai.js?v=1"></script>
<script defer src="js/api-sync.js?v=14"></script>
<script defer src="js/nav.js?v=4"></script>
```

Leave `js/lib/planning-calc.js`'s tag unchanged. Leave the single large inline script at `planning.html:236-1491` (which contains `function showPortfolioView() {...}` and the `DOMContentLoaded`-wrapped `Vue.createApp(...).mount(...)` call further down) completely untouched.

- [ ] **Step 2: Run the frontend test suite as a regression sanity check**

Run: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 3: Self-review the diff**

Run: `git diff planning.html`
Confirm: exactly the 15 classic `<script src>` tags gained `defer`; the 1 `type="module"` tag is unchanged; nothing else changed.

- [ ] **Step 4: Record the manual verification checklist in your report**

> **planning.html** — hard reload. Console clean. Resource planning grid renders in at least one grouping view (By Role/By Project/By Owner); AI Planning Sidebar opens and its input is usable; XLS export button reachable.

- [ ] **Step 5: Commit**

```bash
git add planning.html
git commit -m "perf: defer script loading on planning.html"
```

---

### Task 3: `costgrid.html` — add `defer` only (no module conversion needed)

**Files:**
- Modify: `costgrid.html:551-566`

**Interfaces:** None — single-file, independent of every other task in this plan.

- [ ] **Step 1: Add `defer` to every classic `<script src>` tag**

Replace lines 551-566:

```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"></script>
<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script src="js/api.js?v=3"></script>
<script src="js/core.js?v=3"></script>
<script src="js/settings.js"></script>
<script src="js/notifications.js"></script>
<script src="js/roles.js"></script>
<script src="js/clients.js"></script>
<script src="js/programs.js"></script>
<script type="module" src="js/lib/cfg-parse.js?v=1"></script>
<script type="module" src="js/lib/costgrid-calc.js?v=3"></script>
<script src="js/costgrid.js?v=27"></script>
<script src="js/api-sync.js?v=14"></script>
<script src="js/ratecards.js"></script>
<script src="js/nav.js?v=4"></script>
```

with:

```html
<script defer src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"></script>
<script defer src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script defer src="js/api.js?v=3"></script>
<script defer src="js/core.js?v=3"></script>
<script defer src="js/settings.js"></script>
<script defer src="js/notifications.js"></script>
<script defer src="js/roles.js"></script>
<script defer src="js/clients.js"></script>
<script defer src="js/programs.js"></script>
<script type="module" src="js/lib/cfg-parse.js?v=1"></script>
<script type="module" src="js/lib/costgrid-calc.js?v=3"></script>
<script defer src="js/costgrid.js?v=27"></script>
<script defer src="js/api-sync.js?v=14"></script>
<script defer src="js/ratecards.js"></script>
<script defer src="js/nav.js?v=4"></script>
```

Leave the 2 `type="module"` tags unchanged. Leave the single large inline script at `costgrid.html:568-1265` (already `DOMContentLoaded`-wrapped, contains `Vue.createApp(...).mount('#costGridEditorSection')`) completely untouched.

- [ ] **Step 2: Run the frontend test suite as a regression sanity check**

Run: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 3: Self-review the diff**

Run: `git diff costgrid.html`
Confirm: exactly the 14 classic `<script src>` tags gained `defer`; the 2 `type="module"` tags are unchanged; nothing else changed.

- [ ] **Step 4: Record the manual verification checklist in your report**

> **costgrid.html** — hard reload via a real `?cgId=&verId=`. Console clean (specifically confirm the `_cgVueApp` bridge pattern still works — `js/costgrid.js`'s functions like `cgSaveVersion`/`cgPublishDraft` must still find the mounted Vue instance). Editor table renders, version tabs switch, Save button works.

- [ ] **Step 5: Commit**

```bash
git add costgrid.html
git commit -m "perf: defer script loading on costgrid.html"
```

---

### Task 4: `portfolio.html` — add `defer` + convert trailing script to `type="module"`

**Files:**
- Modify: `portfolio.html:9`, `portfolio.html:491-506`

**Interfaces:** None — single-file, independent of every other task in this plan.

- [ ] **Step 1: Add `defer` to the `<head>` Chart.js CDN script**

Replace line 9:

```html
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
```

with:

```html
  <script defer src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
```

- [ ] **Step 2: Add `defer` to the remaining classic `<script src>` tags, and convert the trailing script to `type="module"`**

Replace lines 491-506:

```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script src="js/api.js?v=4"></script>
<script src="js/core.js?v=3"></script>
<script src="js/settings.js"></script>
<script src="js/notifications.js"></script>
<script src="js/upload.js"></script>
<script src="js/clients.js"></script>
<script src="js/programs.js"></script>
<script src="js/ai.js?v=1"></script>
<script src="js/shares.js"></script>
<script type="module" src="js/lib/portfolio-calc.js?v=1"></script>
<script src="js/api-sync.js?v=14"></script>
<script src="js/nav.js?v=4"></script>
<script>
```

with:

```html
<script defer src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<script defer src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script defer src="js/api.js?v=4"></script>
<script defer src="js/core.js?v=3"></script>
<script defer src="js/settings.js"></script>
<script defer src="js/notifications.js"></script>
<script defer src="js/upload.js"></script>
<script defer src="js/clients.js"></script>
<script defer src="js/programs.js"></script>
<script defer src="js/ai.js?v=1"></script>
<script defer src="js/shares.js"></script>
<script type="module" src="js/lib/portfolio-calc.js?v=1"></script>
<script defer src="js/api-sync.js?v=14"></script>
<script defer src="js/nav.js?v=4"></script>
<script type="module">
```

Also change the file's closing tag for this same script block, at line 1202, from `</script>` to `</script>` (no change needed — the closing tag syntax is identical regardless of the opening tag's attributes). The body of the script (lines 507-1201, starting with `const ExportButtons = {...}` and ending with `}).mount('#app');`) is left completely untouched — only the opening `<script>` tag's attribute changes.

- [ ] **Step 3: Run the frontend test suite as a regression sanity check**

Run: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 4: Self-review the diff**

Run: `git diff portfolio.html`
Confirm: the Chart.js tag and 10 classic `<script src>` tags gained `defer`; the `js/lib/portfolio-calc.js` tag is unchanged; the trailing script's opening tag changed from `<script>` to `<script type="module">`; the script's body content (everything between the opening and closing tag) is byte-for-byte identical to before.

- [ ] **Step 5: Record the manual verification checklist in your report**

> **portfolio.html** — hard reload. Console clean (note: Chart.js is in `<head>` — confirm it still loads/executes correctly deferred from there). Portfolio overview cards render; a project's dashboard renders its burndown chart (Chart.js + `js/lib/portfolio-calc.js`); AI analysis button reachable (`js/ai.js` + `#confirmModal`/`showInfo()`).

- [ ] **Step 6: Commit**

```bash
git add portfolio.html
git commit -m "perf: defer script loading on portfolio.html, module-ize trailing Vue.createApp script"
```

---

### Task 5: `timesheets.html` — add `defer` + convert trailing script to `type="module"`

**Files:**
- Modify: `timesheets.html:154-167`

**Interfaces:** None — single-file, independent of every other task in this plan.

- [ ] **Step 1: Add `defer` to classic `<script src>` tags, leave the `esc()` shim untouched, convert the trailing script**

Replace lines 154-167:

```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script src="js/api.js?v=3"></script>
<script>
  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
</script>
<script src="js/core.js?v=3"></script>
<script src="js/settings.js"></script>
<script src="js/notifications.js"></script>
<script src="js/nav.js?v=4"></script>

<script>
```

with:

```html
<script defer src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script defer src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script defer src="js/api.js?v=3"></script>
<script>
  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
</script>
<script defer src="js/core.js?v=3"></script>
<script defer src="js/settings.js"></script>
<script defer src="js/notifications.js"></script>
<script defer src="js/nav.js?v=4"></script>

<script type="module">
```

The `esc()` shim (lines 157-161) is reproduced verbatim, unchanged — do not add `defer` or any attribute to it. The trailing script's body (lines 168-255, starting with `Vue.createApp({...}` and ending with `}).mount('#app');`) is left completely untouched — only its opening tag changes.

- [ ] **Step 2: Run the frontend test suite as a regression sanity check**

Run: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 3: Self-review the diff**

Run: `git diff timesheets.html`
Confirm: the 6 classic `<script src>` tags gained `defer`; the `esc()` shim is byte-for-byte unchanged; the trailing script's opening tag changed to `<script type="module">`; its body is unchanged.

- [ ] **Step 4: Record the manual verification checklist in your report**

> **timesheets.html** — hard reload. Console clean, `esc()` available (no `esc is not defined`). Upload history list loads; file picker for XLS upload opens without a load-time crash.

- [ ] **Step 5: Commit**

```bash
git add timesheets.html
git commit -m "perf: defer script loading on timesheets.html, module-ize trailing Vue.createApp script"
```

---

### Task 6: `config.html` — add `defer` + convert trailing script to `type="module"`

**Files:**
- Modify: `config.html:968-981`

**Interfaces:** None — single-file, independent of every other task in this plan.

- [ ] **Step 1: Add `defer` to classic `<script src>` tags, leave the `esc()` shim untouched, convert the trailing script**

Replace lines 968-981:

```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script src="js/api.js?v=3"></script>
<script>
  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
</script>
<script src="js/core.js?v=3"></script>
<script src="js/settings.js"></script>
<script src="js/notifications.js"></script>
<script src="js/nav.js?v=4"></script>

<script>
window.__cfgApp = Vue.createApp({
```

with:

```html
<script defer src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script defer src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script defer src="js/api.js?v=3"></script>
<script>
  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
</script>
<script defer src="js/core.js?v=3"></script>
<script defer src="js/settings.js"></script>
<script defer src="js/notifications.js"></script>
<script defer src="js/nav.js?v=4"></script>

<script type="module">
window.__cfgApp = Vue.createApp({
```

The `esc()` shim (lines 971-975) stays byte-for-byte unchanged. The rest of the trailing script's body (lines 982-2068) is left completely untouched — only its opening tag changes.

- [ ] **Step 2: Run the frontend test suite as a regression sanity check**

Run: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 3: Self-review the diff**

Run: `git diff config.html`
Confirm: the 4 classic `<script src>` tags gained `defer`; the `esc()` shim is unchanged; the trailing script's opening tag changed to `<script type="module">` (note the first line inside it, `window.__cfgApp = Vue.createApp({`, is unaffected); its body is otherwise unchanged.

- [ ] **Step 4: Record the manual verification checklist in your report**

> **config.html** — hard reload. Console clean, `esc()` available. Clients/Client Groups/Programs/Roles/Pipelines & POTs tabs all switch and load data.

- [ ] **Step 5: Commit**

```bash
git add config.html
git commit -m "perf: defer script loading on config.html, module-ize trailing Vue.createApp script"
```

---

### Task 7: `project-config.html` — add `defer` + convert trailing script to `type="module"`

**Files:**
- Modify: `project-config.html:321-335`

**Interfaces:** None — single-file, independent of every other task in this plan.

- [ ] **Step 1: Add `defer` to classic `<script src>` tags, convert the trailing script**

Replace lines 321-335:

```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script src="js/api.js?v=4"></script>
<script src="js/core.js?v=3"></script>
<script src="js/settings.js"></script>
<script src="js/notifications.js"></script>
<script src="js/clients.js"></script>
<script src="js/programs.js"></script>
<script type="module" src="js/lib/cfg-parse.js?v=1"></script>
<script type="module" src="js/lib/status-rules.js?v=1"></script>
<script type="module" src="js/lib/config-form-calc.js?v=1"></script>
<script src="js/api-sync.js?v=14"></script>
<script src="js/nav.js?v=4"></script>
<script>
```

with:

```html
<script defer src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<script defer src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script defer src="js/api.js?v=4"></script>
<script defer src="js/core.js?v=3"></script>
<script defer src="js/settings.js"></script>
<script defer src="js/notifications.js"></script>
<script defer src="js/clients.js"></script>
<script defer src="js/programs.js"></script>
<script type="module" src="js/lib/cfg-parse.js?v=1"></script>
<script type="module" src="js/lib/status-rules.js?v=1"></script>
<script type="module" src="js/lib/config-form-calc.js?v=1"></script>
<script defer src="js/api-sync.js?v=14"></script>
<script defer src="js/nav.js?v=4"></script>
<script type="module">
```

The 3 `type="module"` tags stay unchanged. The trailing script's body (lines 336-846, starting with `function month2ym(monthInputVal) {...}` and ending with `}).mount('#app');`) is left completely untouched — only its opening tag changes.

- [ ] **Step 2: Run the frontend test suite as a regression sanity check**

Run: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 3: Self-review the diff**

Run: `git diff project-config.html`
Confirm: the 8 classic `<script src>` tags gained `defer`; the 3 `type="module"` tags are unchanged; the trailing script's opening tag changed to `<script type="module">`; its body is unchanged.

- [ ] **Step 4: Record the manual verification checklist in your report**

> **project-config.html** — hard reload via a real `?projectId=`. Console clean. Tasks/phasing/planning/groups sections render; Client/Program dropdowns populate; status dropdown respects `getStatusRule()`.

- [ ] **Step 5: Commit**

```bash
git add project-config.html
git commit -m "perf: defer script loading on project-config.html, module-ize trailing Vue.createApp script"
```

---

### Task 8: `admin.html` — add `defer` + convert trailing script to `type="module"`

**Files:**
- Modify: `admin.html:239-252`

**Interfaces:** None — single-file, independent of every other task in this plan.

- [ ] **Step 1: Add `defer` to classic `<script src>` tags, leave the `esc()` shim untouched, convert the trailing script**

Replace lines 239-252:

```html
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
  <script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
  <script src="js/api.js?v=3"></script>
  <script>
    // esc() dependency for nav.js and ratecards.js (core.js is not included on this page)
    function esc(s) {
      return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
</script>
  <script src="js/core.js?v=3"></script>
  <script src="js/settings.js"></script>
  <script src="js/notifications.js"></script>
  <script src="js/nav.js?v=4"></script>
  <script>
    Vue.createApp({
```

with:

```html
  <script defer src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
  <script defer src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
  <script defer src="js/api.js?v=3"></script>
  <script>
    // esc() dependency for nav.js and ratecards.js (core.js is not included on this page)
    function esc(s) {
      return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
</script>
  <script defer src="js/core.js?v=3"></script>
  <script defer src="js/settings.js"></script>
  <script defer src="js/notifications.js"></script>
  <script defer src="js/nav.js?v=4"></script>
  <script type="module">
    Vue.createApp({
```

The `esc()` shim (lines 242-247) stays byte-for-byte unchanged. The trailing script's body (lines 253-444, ending with `}).mount('#app');`) is left completely untouched — only its opening tag changes.

- [ ] **Step 2: Run the frontend test suite as a regression sanity check**

Run: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 3: Self-review the diff**

Run: `git diff admin.html`
Confirm: the 4 classic `<script src>` tags gained `defer`; the `esc()` shim is unchanged; the trailing script's opening tag changed to `<script type="module">`; its body is unchanged.

- [ ] **Step 4: Record the manual verification checklist in your report**

> **admin.html** — hard reload. Console clean (no `esc is not defined`, no `initNav is not defined`). User list loads, filter tabs work, "+ Invite" modal opens/closes, T&C editor tab loads content.

- [ ] **Step 5: Commit**

```bash
git add admin.html
git commit -m "perf: defer script loading on admin.html, module-ize trailing Vue.createApp script"
```

---

### Task 9: `terms.html` — add `defer` + convert trailing script to `type="module"`

**Files:**
- Modify: `terms.html:89-90`

**Interfaces:** None — single-file, independent of every other task in this plan.

- [ ] **Step 1: Add `defer` to the Vue CDN tag, convert the trailing script**

Replace lines 89-90:

```html
  <script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
  <script>
```

with:

```html
  <script defer src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
  <script type="module">
```

The trailing script's body (lines 91-136, ending with `}).mount('#app');`) is left completely untouched — only its opening tag changes.

- [ ] **Step 2: Run the frontend test suite as a regression sanity check**

Run: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 3: Self-review the diff**

Run: `git diff terms.html`
Confirm: the Vue CDN tag gained `defer`; the trailing script's opening tag changed to `<script type="module">`; its body is unchanged.

- [ ] **Step 4: Record the manual verification checklist in your report**

> **terms.html** — hard reload via the `?next=` redirect path (a user with a stale `terms_version`, or direct `?next=/pipeline.html`). Console clean. Accepting redirects to `next`.

- [ ] **Step 5: Commit**

```bash
git add terms.html
git commit -m "perf: defer script loading on terms.html, module-ize trailing Vue.createApp script"
```

---

### Task 10: `login.html` — add `defer` + convert trailing script to `type="module"`

**Files:**
- Modify: `login.html:101-102`

**Interfaces:** None — single-file, independent of every other task in this plan.

- [ ] **Step 1: Add `defer` to the Vue CDN tag, convert the trailing script**

Replace lines 101-102:

```html
  <script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
  <script>
```

with:

```html
  <script defer src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
  <script type="module">
```

The trailing script's body (lines 103-159, ending with `}).mount('#app');`) is left completely untouched — only its opening tag changes.

- [ ] **Step 2: Run the frontend test suite as a regression sanity check**

Run: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 3: Self-review the diff**

Run: `git diff login.html`
Confirm: the Vue CDN tag gained `defer`; the trailing script's opening tag changed to `<script type="module">`; its body is unchanged.

- [ ] **Step 4: Record the manual verification checklist in your report**

> **login.html** — hard reload. Console clean. Valid credentials → redirects to `/pipeline.html`. Invalid credentials → inline error, stays on page. "Forgot password" link switches view without reload.

- [ ] **Step 5: Commit**

```bash
git add login.html
git commit -m "perf: defer script loading on login.html, module-ize trailing Vue.createApp script"
```

---

### Task 11: `activate.html` — add `defer` + convert trailing script to `type="module"`

**Files:**
- Modify: `activate.html:116-117`

**Interfaces:** None — single-file, independent of every other task in this plan.

- [ ] **Step 1: Add `defer` to the Vue CDN tag, convert the trailing script**

Replace lines 116-117:

```html
  <script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
  <script>
```

with:

```html
  <script defer src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
  <script type="module">
```

The trailing script's body (lines 118-188, ending with `}).mount('#app');`) is left completely untouched — only its opening tag changes.

- [ ] **Step 2: Run the frontend test suite as a regression sanity check**

Run: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 3: Self-review the diff**

Run: `git diff activate.html`
Confirm: the Vue CDN tag gained `defer`; the trailing script's opening tag changed to `<script type="module">`; its body is unchanged.

- [ ] **Step 4: Record the manual verification checklist in your report**

> **activate.html** — hard reload with a valid `?token=`. Console clean. Form renders and submits; invalid/missing token shows the expected error state.

- [ ] **Step 5: Commit**

```bash
git add activate.html
git commit -m "perf: defer script loading on activate.html, module-ize trailing Vue.createApp script"
```

---

### Task 12: `reset-password.html` — add `defer` + convert trailing script to `type="module"`

**Files:**
- Modify: `reset-password.html:110-111`

**Interfaces:** None — single-file, independent of every other task in this plan.

- [ ] **Step 1: Add `defer` to the Vue CDN tag, convert the trailing script**

Replace lines 110-111:

```html
  <script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
  <script>
```

with:

```html
  <script defer src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
  <script type="module">
```

The trailing script's body (lines 112-179, ending with `}).mount('#app');`) is left completely untouched — only its opening tag changes.

- [ ] **Step 2: Run the frontend test suite as a regression sanity check**

Run: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 3: Self-review the diff**

Run: `git diff reset-password.html`
Confirm: the Vue CDN tag gained `defer`; the trailing script's opening tag changed to `<script type="module">`; its body is unchanged.

- [ ] **Step 4: Record the manual verification checklist in your report**

> **reset-password.html** — hard reload with a valid `?token=`. Console clean. Form renders and submits; invalid/missing token shows the expected error state.

- [ ] **Step 5: Commit**

```bash
git add reset-password.html
git commit -m "perf: defer script loading on reset-password.html, module-ize trailing Vue.createApp script"
```

---

### Task 13: `_db-reset.html` — add `defer` + convert trailing script to `type="module"`

**Files:**
- Modify: `_db-reset.html:123-130`

**Interfaces:** None — single-file, independent of every other task in this plan.

- [ ] **Step 1: Add `defer` to classic `<script src>` tags, convert the trailing script**

Replace lines 123-130:

```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script src="js/api.js?v=4"></script>
<script src="js/core.js?v=3"></script>
<script src="js/settings.js"></script>
<script src="js/notifications.js"></script>
<script src="js/nav.js?v=4"></script>
<script>
```

with:

```html
<script defer src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script defer src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script defer src="js/api.js?v=4"></script>
<script defer src="js/core.js?v=3"></script>
<script defer src="js/settings.js"></script>
<script defer src="js/notifications.js"></script>
<script defer src="js/nav.js?v=4"></script>
<script type="module">
```

The trailing script's body (lines 131-309, ending with `}).mount('#app');`) is left completely untouched — only its opening tag changes.

- [ ] **Step 2: Run the frontend test suite as a regression sanity check**

Run: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 3: Self-review the diff**

Run: `git diff _db-reset.html`
Confirm: the 6 classic `<script src>` tags gained `defer`; the trailing script's opening tag changed to `<script type="module">`; its body is unchanged.

- [ ] **Step 4: Record the manual verification checklist in your report**

> **_db-reset.html** — hard reload (admin session). Console clean. Scope list loads; "Delete single proposal" and "Change proposal owner" widgets are reachable.

- [ ] **Step 5: Commit**

```bash
git add _db-reset.html
git commit -m "perf: defer script loading on _db-reset.html, module-ize trailing Vue.createApp script"
```

---

## Self-Review Notes

- **Spec coverage:** all 13 pages from the design's per-page inventory table have a corresponding task (Tasks 1-13). The design's architecture decision (defer classic scripts + module-ize the trailing script) is implemented exactly, with the refinement discovered during planning (pipeline.html/costgrid.html/planning.html don't need module conversion, since their trailing script is already `DOMContentLoaded`-wrapped) applied consistently across Tasks 1-3 vs. Tasks 4-13. All 13 per-page manual verification checklists from the design doc are reproduced verbatim in each task's Step 4.
- **Placeholder scan:** every task shows the literal before/after HTML; no TBD/TODO; every "leave X untouched" note names the exact line range and content so an implementer never has to guess.
- **Type/line consistency:** verified during planning by reading every file directly (`grep`/`Read`) — every line number and script tag's exact text (including `?v=N` cache-busting suffixes) was captured from the actual current file content, not reconstructed from memory.
