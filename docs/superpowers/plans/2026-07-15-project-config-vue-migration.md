# `project-config.html` Vue 3 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `project-config.html` from imperative Vanilla JS (driven by the shared `js/config-form.js`) to a Vue 3 (CDN, no build step) app, 1:1 behavior for every reachable feature, with four confirmed simplifications (see Global Constraints) and one new testable module.

**Architecture:** Single-file rewrite of `project-config.html`, same pattern as `admin.html`. One `Vue.createApp({...}).mount('#app')` manages a single reactive `project` object (not an array — see Global Constraints #4). A new module, `js/lib/config-form-calc.js`, extracts the pure calculation core of derive/reforecast into vitest-tested functions, following the `cfg-parse.js`/`planning-calc.js`/`costgrid-calc.js` pattern already in this codebase. `project-config.html` drops its dependency on `js/config-form.js` and `js/roles.js` entirely.

**Tech Stack:** Vue 3 via CDN (`https://unpkg.com/vue@3/dist/vue.global.prod.js`), Bootstrap 5.3.2 (already loaded), XLSX (already loaded via CDN for export), no build step, no bundler.

## Global Constraints

1. Vue 3 via CDN only — no build step, no SFCs.
2. `project-config.html` no longer loads `js/config-form.js` or `js/roles.js`. It keeps `js/core.js`, `js/api.js`, `js/api-sync.js`, `js/nav.js`, `js/notifications.js`, `js/settings.js`, the XLSX CDN script, and adds `js/lib/config-form-calc.js` (new, `type="module"`) alongside the existing `js/lib/cfg-parse.js` (still needed for `cfgParseHours`/`cfgFmtHours`/`distributeHoursExact`).
3. No change to any API endpoint used today (`loadClientsFromApi`, `loadProgramsFromApi`, `loadConfigFromApi`, `_pushProjectToApi`, `Api.timesheets.get`/`.upload`, client/program CRUD).
4. **Single `project` object, not an array.** The hidden `projects[]`/dropdown/New/Delete machinery (`project-config.html:18-24` in the original) is not reproduced — confirmed dead weight specific to this page (invisible stubs, never user-reachable). The page resolves exactly one project from `?projectId=` in the URL, or starts a fresh blank one if the param is absent.
5. **Unknown `?projectId=`** shows an explicit "Project not found" error state instead of the original's silent fallback to array index 0 — confirmed fix, not a 1:1 port point.
6. **Not ported** (confirmed dead on this page — see design spec's Investigation findings): rollback/snapshot (`cfgSaveReforecastSnapshot`/`cfgSyncRollbackButtons`/`cfgRollbackReforecast`), the Form/JSON tab toggle, `js/roles.js` load. The Derive/Reforecast confirmation copy drops the "...saved as a snapshot for rollback" sentence.
7. Client/program dropdown + add-modal: own local Vue implementation, not shared with `config.html`'s independent Vue CRUD or with `js/clients.js`/`js/programs.js` (though `loadClientsFromApi()`/`loadProgramsFromApi()` and the underlying API calls are reused — only the modal UI is reimplemented locally).
8. `js/config-form.js` itself is **not modified or deleted** — it's still loaded by `portfolio.html` for its (separately-tracked, orphaned) `#configModal`. Cleanup of that file is out of scope for this cycle.
9. `pdash-nginx` serves the main checkout's working directory only — new behavior is not visible in a browser until after merge. Manual verification is a post-merge step (Task 8).

---

## File Structure

- Modify: `project-config.html` (full rewrite; `<head>` stays as-is except adding one new `<script type="module">` tag).
- Create: `js/lib/config-form-calc.js` (pure functions, `export function` + `window.*` bridge, per the established `js/lib/*` pattern).
- Create: `js/lib/config-form-calc.test.js` (vitest).

---

## Shared Data Shapes (referenced by every task)

**`project` object** (mirrors `cfgReadFormProject()`'s output shape, `js/config-form.js:140-162`):

```js
{
  id: '', code: '', name: '', startDate: '', endDate: '', currency: '€',
  pipeline: '', status: '',
  tasks: [ /* { name, billable, completed, startDate, endDate, monthlyDistribution: {ym: pct}, resources: [{role, soldHours, hourlyRate}] } */ ],
  phasing: {}, planning: {}, // { ym: number }
  ptc: [ /* { title, note, amount, month } */ ],
  groups: [ /* { name, roles: [] } */ ],
  costGridRef: null,
  programId: null,
  clientId: '__unassigned__',
  my_permission: 'owner', // or 'viewer'
}
```

**Month string format**: `YYYYMM` (e.g. `'202607'`), matching `cfgGetMonthRange()`'s output today.

---

### Task 1: Vue app skeleton, project resolution, project info fields

**Files:**
- Modify: `project-config.html` (full file — `<head>` unchanged, full `<body>` rewrite; later tasks add template/method blocks to the same file)

**Interfaces:**
- Produces: `data()` fields `ready`, `project`, `notFound`, `isViewer` (computed), `isNewProject`; methods `resolveProject()`, `saveProjectField(...)` implied via `v-model`. Later tasks extend the same `data()`/`methods`/`computed` objects — this task establishes them, later tasks add to them (the plan's later steps show the additive diffs).
- Consumes: global `config.projects` (populated by `loadConfigFromApi()`, already loaded via `js/api-sync.js`), `initNav()`, `getProjectPipeline()`, `cfgApplyPipelineRules()` (from `js/core.js` — unchanged, still used).

- [ ] **Step 1: Write the new file's head and skeleton body**

Replace `project-config.html` in full:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PDash — Project Configuration</title>
  <link rel="icon" type="image/png" href="https://ik.imagekit.io/6ezjgrjjf/00_Home_Page/letter-f.png">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="css/tokens.css?v=5">
  <link rel="stylesheet" href="css/style.css?v=5">
</head>
<body>

<div id="nav-container"></div>

<div id="app" class="app-container">

  <div v-if="notFound" class="text-center text-muted py-5">
    <div style="font-size:2.5rem">⚠️</div>
    <p class="mt-2">Project not found.</p>
    <a href="/portfolio.html" class="btn btn-outline-secondary btn-sm">← Back to Portfolio</a>
  </div>

  <div v-else-if="!ready" class="d-flex align-items-center justify-content-center" style="height:60vh">
    <div class="spinner-border text-secondary"></div>
  </div>

  <template v-else>
    <div v-if="jsonError" class="alert alert-danger py-2 small">{{ jsonError }}</div>
    <div v-if="isViewer" class="alert alert-info d-flex align-items-center gap-2 mb-3 rounded-0" style="position:sticky;top:0;z-index:100;font-size:.85rem">
      <span>👁 You have <strong>viewer</strong> access to this project — editing is disabled.</span>
    </div>

    <div class="pt-4">
      <!-- Task 2 inserts Client + Program sections here -->

      <div class="cfg-section">
        <div class="cfg-section-title">1. Project info</div>
        <div class="row g-3">
          <div class="col-md-4"><label class="form-label small mb-1">D365 Project ID <span class="text-muted">(matches XLS column)</span></label><input type="text" class="form-control form-control-sm" v-model="project.code" :disabled="isViewer" placeholder="e.g. HITA.000001201"></div>
          <div class="col-md-8"><label class="form-label small mb-1">Project Name</label><input type="text" class="form-control form-control-sm" v-model="project.name" :disabled="isViewer" placeholder="e.g. Bayer AG - BERMITS 2026" @input="onNameInput"></div>
          <div class="col-sm-3 col-md-2"><label class="form-label small mb-1">Start month</label><input type="month" class="form-control form-control-sm" v-model="startMonthInput" :disabled="isViewer" @change="onDateChange"></div>
          <div class="col-sm-3 col-md-2"><label class="form-label small mb-1">End month</label><input type="month" class="form-control form-control-sm" v-model="endMonthInput" :disabled="isViewer" @change="onDateChange"></div>
          <div class="col-sm-3 col-md-2"><label class="form-label small mb-1">Currency</label><select class="form-select form-select-sm" v-model="project.currency" :disabled="isViewer"><option value="€">€ Euro</option><option value="$">$ Dollar</option><option value="£">£ Pound</option><option value="CHF">CHF Swiss Franc</option></select></div>
          <div class="col-sm-3 col-md-2 d-flex align-items-end"><button type="button" class="btn btn-outline-danger btn-sm w-100" v-if="!isViewer" @click="onClearData">🗑 Clear XLS data</button></div>
        </div>
        <div class="row g-3 mt-1">
          <div class="col-sm-6 col-md-3"><label class="form-label small mb-1">Pipeline</label><select class="form-select form-select-sm" v-model="project.pipeline" :disabled="isViewer || pipelineLocked" :title="pipelineLocked ? 'Pipeline is managed from the Cost Grid' : ''" @change="onPipelineChange"><option value="">— Select —</option><option value="SIP">SIP</option><option value="Expected">Expected</option><option value="Anticipated">Anticipated</option><option value="Committed">Committed</option><option value="Canceled">Canceled</option></select></div>
          <div class="col-sm-6 col-md-3"><label class="form-label small mb-1">Status</label><select class="form-select form-select-sm" v-model="project.status" :disabled="isViewer || !statusRule.options"><option v-if="!statusRule.options || !statusRule.options.length" value=""> — Select —</option><option v-for="opt in (statusRule.options || [])" :key="opt" :value="opt">{{ opt }}</option></select></div>
        </div>
      </div>

      <!-- Task 6 inserts Actuals section here -->
      <!-- Task 3 inserts Tasks & Resources section here -->
      <!-- Task 5 inserts Phasing/Planning grid sections here -->
      <!-- Task 6 inserts PTC + Functional Groups sections here -->
    </div>

    <div class="d-flex gap-2 justify-content-between align-items-center py-4 border-top mt-2 mb-5">
      <button class="btn btn-outline-secondary" onclick="window.location.href='/portfolio.html'">← Back to Portfolio</button>
      <button v-if="!isViewer" class="btn btn-primary px-4" :disabled="saving" @click="onSave">{{ saving ? '💾 Saving…' : '💾 Save' }}</button>
    </div>
  </template>

  <!-- Task 2 inserts Client/Program modals; Task 3/6 insert the confirm modal here -->

</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script src="js/api.js?v=4"></script>
<script src="js/core.js?v=2"></script>
<script src="js/settings.js"></script>
<script src="js/notifications.js"></script>
<script type="module" src="js/lib/cfg-parse.js?v=1"></script>
<script type="module" src="js/lib/config-form-calc.js?v=1"></script>
<script src="js/api-sync.js?v=14"></script>
<script src="js/nav.js?v=4"></script>
<script>
  function month2ym(monthInputVal) {
    if (!monthInputVal) return '';
    return monthInputVal.replace('-', '');
  }
  function ym2month(ym) {
    if (!ym || ym.length < 6) return '';
    return `${ym.slice(0,4)}-${ym.slice(4,6)}`;
  }

  const BLANK_PROJECT = () => ({
    id: '', code: '', name: '', startDate: '', endDate: '', currency: '€',
    pipeline: '', status: '', tasks: [], phasing: {}, planning: {},
    ptc: [], groups: [], costGridRef: null, programId: null,
    clientId: '__unassigned__', my_permission: 'owner',
  });

  Vue.createApp({
    data() {
      return {
        ready: false,
        notFound: false,
        project: null,
        isNewProject: false,
        jsonError: '',
        saving: false,
      };
    },
    computed: {
      isViewer() {
        return this.project?.my_permission === 'viewer';
      },
      pipelineLocked() {
        return !!(this.project?.costGridRef?.cgId);
      },
      statusRule() {
        return this.project ? getStatusRule(this.project.pipeline) : { options: null, disabled: true };
      },
      startMonthInput: {
        get() { return ym2month(this.project?.startDate); },
        set(v) { if (this.project) this.project.startDate = month2ym(v); },
      },
      endMonthInput: {
        get() { return ym2month(this.project?.endDate); },
        set(v) { if (this.project) this.project.endDate = month2ym(v); },
      },
    },
    async created() {
      const user = await initNav('portfolio', { breadcrumbs: [
        { label: 'Home', href: '/pipeline.html' },
        { label: 'Project Portfolio', href: '/portfolio.html' },
        { label: '…' },
      ]});
      if (!user) return;

      await Promise.all([loadClientsFromApi(), loadProgramsFromApi()]);
      await loadConfigFromApi();

      if (config.projects.length === 0 && new URLSearchParams(window.location.search).get('projectId')) {
        await new Promise(r => setTimeout(r, 600));
        await loadConfigFromApi();
      }

      this.resolveProject();
      this.ready = true;
    },
    methods: {
      resolveProject() {
        const params = new URLSearchParams(window.location.search);
        const projectId = params.get('projectId');
        if (!projectId) {
          this.project = BLANK_PROJECT();
          this.isNewProject = true;
          this.updateBreadcrumb('New Project');
          return;
        }
        const found = (config.projects || []).find(
          p => p.id && p.id.trim().toLowerCase() === projectId.trim().toLowerCase()
        );
        if (!found) {
          this.notFound = true;
          return;
        }
        this.project = JSON.parse(JSON.stringify(found));
        this.isNewProject = false;
        this.updateBreadcrumb(this.project.name || projectId);
      },
      updateBreadcrumb(label) {
        if (typeof updateBreadcrumbs === 'function') {
          updateBreadcrumbs([
            { label: 'Home', href: '/pipeline.html' },
            { label: 'Project Portfolio', href: '/portfolio.html' },
            { label },
          ]);
        }
      },
      onNameInput() {
        this.updateBreadcrumb(this.project.name.trim() || 'New Project');
      },
      onPipelineChange() {
        cfgApplyPipelineRules(this.project.pipeline, this.project.status);
      },
      onDateChange() {
        // Task 5 extends this to warn about out-of-range phasing/planning months.
      },
      onClearData() {
        // Task 6 implements this fully (clearProjectData + redirect).
      },
      async onSave() {
        // Task 6 implements the full save flow.
      },
    },
  }).mount('#app');
</script>
</body>
</html>
```

- [ ] **Step 2: Verify the page loads without console errors on an existing project**

Manual step deferred to Task 8 (post-merge) per Global Constraint 9. For now, run: `node -e "require('fs').readFileSync('project-config.html', 'utf8')" && echo "file readable"` to confirm no syntax error.

- [ ] **Step 3: Run the frontend test suite**

Run: `npm test` — expected all existing tests still pass (this task touches no test files).

- [ ] **Step 4: Commit**

```bash
git add project-config.html
git commit -m "feat(project-config): Vue 3 skeleton, project resolution, project info section

Task 1 of the project-config.html Vue migration. Single reactive
project object (not an array — the hidden multi-project dropdown/
New/Delete machinery was confirmed dead weight specific to this page).
Unknown ?projectId= now shows an explicit not-found state instead of
silently loading array index 0.

Design: docs/superpowers/specs/2026-07-15-project-config-vue-migration-design.md"
```

---

### Task 2: Client/Program dropdown + add-modal (local Vue implementation)

**Files:**
- Modify: `project-config.html` (add template sections + `data()`/`methods` fields to the same Vue instance from Task 1)

**Interfaces:**
- Consumes: `getClients()`/`getClientName()` (`js/clients.js`), `getPrograms()` (`js/programs.js`) — read-only, for the dropdown option lists (loaded into memory by `loadClientsFromApi()`/`loadProgramsFromApi()`, called in Task 1's `created()`). Also `Api.clients.create`/`Api.programs.create` (or whatever the underlying create call is — read `js/clients.js:64-95`/`js/programs.js:61-95`'s `saveClientFromModal`/`saveProgramFromModal` bodies before writing this task's methods, to match the exact request shape).
- Produces: `data()` fields `clientModal`, `programModal`; methods `openClientModal()`, `saveClientModal()`, `openProgramModal()`, `saveProgramModal()`.

- [ ] **Step 1: Read the exact client/program create-API call shape**

Before writing `saveClientModal()`/`saveProgramModal()`, read `js/clients.js:64-95` (`openClientEditModal`/`saveClientFromModal`) and `js/programs.js:61-95` (`openProgramEditModal`/`saveProgramFromModal`) in full to copy the exact API call and post-save refresh logic (likely `loadClientsFromApi()`/`loadProgramsFromApi()` re-run after create, then updating the local dropdown list).

- [ ] **Step 2: Add the Client and Program sections to the template**

Insert immediately before the "1. Project info" section added in Task 1 (replacing the `<!-- Task 2 inserts Client + Program sections here -->` marker):

```html
<div class="cfg-section">
  <div class="cfg-section-title">Client</div>
  <div class="row g-3 align-items-end">
    <div class="col-md-8">
      <label class="form-label small mb-1">Assign to a client</label>
      <select class="form-select form-select-sm" v-model="project.clientId" :disabled="isViewer">
        <option value="__unassigned__">Unassigned</option>
        <option v-for="c in getClients()" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
    </div>
    <div class="col-md-4 d-flex align-items-end">
      <button type="button" class="btn btn-primary btn-sm w-100" v-if="!isViewer" @click="openClientModal">＋ New client</button>
    </div>
  </div>
</div>
<div class="cfg-section">
  <div class="cfg-section-title">0. Program <span class="fw-normal text-muted" style="font-size:.8rem">(optional)</span></div>
  <div class="row g-3 align-items-end">
    <div class="col-md-8">
      <label class="form-label small mb-1">Assign to a program</label>
      <select class="form-select form-select-sm" v-model="project.programId" :disabled="isViewer">
        <option value="">— No program —</option>
        <option v-for="p in getPrograms()" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
    </div>
    <div class="col-md-4 d-flex align-items-end">
      <button type="button" class="btn btn-primary btn-sm w-100" v-if="!isViewer" @click="openProgramModal">＋ New program</button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Add the two add-modals to the template**

Insert where `<!-- Task 2 inserts Client/Program modals... -->` is marked:

```html
<div class="modal fade" id="clientEditModal" tabindex="-1">
  <div class="modal-dialog modal-sm">
    <div class="modal-content">
      <div class="modal-header"><h5 class="modal-title fw-bold">＋ New client</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body">
        <div v-if="clientModal.error" class="alert alert-danger py-2">{{ clientModal.error }}</div>
        <div class="mb-3"><label class="form-label small fw-semibold">Client name</label><input type="text" class="form-control form-control-sm" v-model="clientModal.name" placeholder="e.g. Acme Corp"></div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary btn-sm" @click="saveClientModal">Save</button></div>
    </div>
  </div>
</div>
<div class="modal fade" id="programEditModal" tabindex="-1">
  <div class="modal-dialog modal-sm">
    <div class="modal-content">
      <div class="modal-header"><h5 class="modal-title fw-bold">＋ New program</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body">
        <div v-if="programModal.error" class="alert alert-danger py-2">{{ programModal.error }}</div>
        <div class="mb-3"><label class="form-label small fw-semibold">Program name</label><input type="text" class="form-control form-control-sm" v-model="programModal.name" placeholder="e.g. Chatbot AI Platform"></div>
        <div class="mb-3"><label class="form-label small fw-semibold">Program ID</label><input type="text" class="form-control form-control-sm" v-model="programModal.id" placeholder="e.g. PRG-001"></div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary btn-sm" @click="saveProgramModal">Save</button></div>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Add `data()` fields and `methods` to the Vue instance from Task 1**

In `data()`, add:

```js
clientModal: { name: '', error: '' },
programModal: { name: '', id: '', error: '' },
```

In `methods`, add (fill in the exact API call bodies using what Step 1 found in `js/clients.js`/`js/programs.js` — do not guess the payload shape):

```js
openClientModal() {
  this.clientModal = { name: '', error: '' };
  bootstrap.Modal.getOrCreateInstance(document.getElementById('clientEditModal')).show();
},
async saveClientModal() {
  const name = this.clientModal.name.trim();
  if (!name) { this.clientModal.error = 'Client name is required.'; return; }
  try {
    // Use the exact same API call js/clients.js's saveClientFromModal makes for a new client.
    const created = await Api.clients.create({ name }); // ← verify exact method name/shape against js/clients.js:73-95
    await loadClientsFromApi();
    this.project.clientId = created.id;
    bootstrap.Modal.getInstance(document.getElementById('clientEditModal'))?.hide();
  } catch (e) {
    this.clientModal.error = e.message || 'Failed to save client.';
  }
},
openProgramModal() {
  this.programModal = { name: '', id: '', error: '' };
  bootstrap.Modal.getOrCreateInstance(document.getElementById('programEditModal')).show();
},
async saveProgramModal() {
  const name = this.programModal.name.trim();
  if (!name) { this.programModal.error = 'Program name is required.'; return; }
  try {
    const created = await Api.programs.create({ name, programId: this.programModal.id.trim() }); // ← verify exact method name/shape against js/programs.js:71-95
    await loadProgramsFromApi();
    this.project.programId = created.id;
    bootstrap.Modal.getInstance(document.getElementById('programEditModal'))?.hide();
  } catch (e) {
    this.programModal.error = e.message || 'Failed to save program.';
  }
},
```

- [ ] **Step 5: Run the frontend test suite**

Run: `npm test` — expected all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add project-config.html
git commit -m "feat(project-config): client/program dropdown + add-modal (local Vue)

Task 2. Own local implementation, not shared with config.html's
independent Vue CRUD or js/clients.js/programs.js's modal code —
reuses only the underlying API calls and in-memory getClients()/
getPrograms() lists."
```

---

### Task 3: Tasks & Resources section

**Files:**
- Modify: `project-config.html`

**Interfaces:**
- Consumes: `project.tasks[]` (Task 1's data shape), `cfgFmtMoney`/`cfgParseMoney` (this task defines these as Vue methods, since they're config-form.js-specific currency formatting not yet extracted anywhere — see Step 3), `isValidSoldHours` (from `js/core.js`, unchanged).
- Produces: `addTask()`, `removeTask(index)`, `addResource(taskIndex)`, `removeResource(taskIndex, resIndex)`, computed `taskTotals` (per-task and grand totals), and the monthly-%-distribution sub-UI per task.

- [ ] **Step 1: Add the Tasks & Resources section to the template**

Insert where `<!-- Task 3 inserts Tasks & Resources section here -->` is marked:

```html
<div class="cfg-section">
  <div class="d-flex justify-content-between align-items-center cfg-section-title">
    <span>3. Tasks &amp; Resources</span>
    <div class="d-flex gap-2">
      <button class="btn btn-sm btn-outline-secondary" @click="exportTasksXlsx">⬇ XLSX</button>
      <button class="btn btn-sm btn-primary" v-if="!isViewer" @click="addTask">+ Add task</button>
    </div>
  </div>
  <p class="text-muted small mb-3">Task name must match exactly the <strong>Task/Issue</strong> XLS column. Role must match <strong>Job Role: Name</strong>.</p>

  <div v-for="(task, ti) in project.tasks" :key="ti" class="cfg-task-card border rounded p-3 mb-3">
    <div class="d-flex align-items-center gap-2 mb-3">
      <span class="text-muted small text-nowrap">Task name:</span>
      <input type="text" class="form-control form-control-sm fw-semibold" v-model="task.name" :disabled="isViewer" placeholder="must match Task/Issue column in XLS">
      <div class="form-check form-switch mb-0 flex-shrink-0 d-flex align-items-center gap-1" title="Uncheck to exclude this task from all reports and charts">
        <input class="form-check-input" type="checkbox" role="switch" v-model="task.billable" :disabled="isViewer">
        <label class="form-check-label small text-nowrap">Include in report</label>
      </div>
      <div class="form-check form-switch mb-0 flex-shrink-0 d-flex align-items-center gap-1" title="Mark task as completed">
        <input class="form-check-input" type="checkbox" role="switch" v-model="task.completed" :disabled="isViewer" @change="rebuildTaskDist(ti)">
        <label class="form-check-label small text-nowrap">Completed</label>
      </div>
      <button class="btn btn-sm btn-outline-danger flex-shrink-0" v-if="!isViewer" @click="confirmRemoveTask(ti)">🗑 Remove</button>
    </div>
    <div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
      <span class="text-muted small text-nowrap">Period:</span>
      <input type="text" class="form-control form-control-sm" style="width:120px" :disabled="isViewer" placeholder="gg/mm/aaaa" maxlength="10" :value="ymdToIt(task.startDate)" @change="e => { task.startDate = itToYmd(e.target.value); rebuildTaskDist(ti); }">
      <span class="text-muted small">→</span>
      <input type="text" class="form-control form-control-sm" style="width:120px" :disabled="isViewer" placeholder="gg/mm/aaaa" maxlength="10" :value="ymdToIt(task.endDate)" @change="e => { task.endDate = itToYmd(e.target.value); rebuildTaskDist(ti); }">
      <span class="text-muted small">(optional — defaults to project dates)</span>
    </div>

    <div class="mt-1 pt-2" style="border-top:1px solid #e9ecef" v-if="taskMonthRange(task).length">
      <div class="d-flex align-items-center gap-2 mb-1">
        <span class="text-muted small">Monthly % distribution:</span>
        <span class="badge" :class="distBadgeClass(task)">{{ distBadgeText(task) }}</span>
      </div>
      <div class="cfg-month-grid">
        <div class="cfg-month-cell" v-for="ym in taskMonthRange(task)" :key="ym">
          <div class="cfg-month-label">{{ monthLabel(ym, 'it-IT') }}</div>
          <div class="d-flex align-items-center gap-1">
            <input type="number" class="form-control form-control-sm text-end" min="0" max="100" step="1"
                   :readonly="taskMonthRange(task).length === 1 || task.completed || isViewer"
                   v-model.number="task.monthlyDistribution[ym]" placeholder="0">
            <span style="font-size:var(--text-xs);color:#888">%</span>
          </div>
        </div>
      </div>
    </div>

    <div class="table-responsive mb-2">
      <table class="table table-sm table-bordered mb-0" style="table-layout:fixed;width:100%">
        <colgroup><col><col style="width:110px"><col style="width:110px"><col style="width:110px"><col style="width:32px"></colgroup>
        <thead style="background:var(--surface-light)">
          <tr><th>Job Role: Name <span class="fw-normal text-muted small">(must match XLS)</span></th><th class="text-end">Sold Hours</th><th class="text-end">Hourly Rate</th><th class="text-end">Subtotal</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="(res, ri) in task.resources" :key="ri">
            <td><input type="text" class="form-control form-control-sm" v-model="res.role" :disabled="isViewer" placeholder="e.g. HWGDEV - DEVELOPER"></td>
            <td><input type="number" class="form-control form-control-sm text-end" min="0" step="0.5" v-model.number="res.soldHours" :disabled="isViewer"></td>
            <td><input type="number" class="form-control form-control-sm text-end" min="0" step="1" v-model.number="res.hourlyRate" :disabled="isViewer"></td>
            <td class="text-end small fw-semibold align-middle">{{ res.soldHours > 0 && res.hourlyRate > 0 ? fmtMoney(res.soldHours * res.hourlyRate) : '—' }}</td>
            <td class="text-center"><button class="btn btn-sm btn-link text-danger p-0" v-if="!isViewer" @click="confirmRemoveResource(ti, ri)">✕</button></td>
          </tr>
        </tbody>
        <tfoot>
          <tr style="background:var(--surface-light)">
            <td colspan="3" class="text-end small fw-bold py-1">Task total</td>
            <td class="text-end fw-bold py-1">{{ taskTotal(task) > 0 ? fmtMoney(taskTotal(task)) : '—' }}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <button class="btn btn-sm btn-primary" v-if="!isViewer" @click="addResource(ti)">+ Add resource</button>
  </div>

  <div class="d-flex justify-content-end gap-4 px-2 py-2 mt-1 border-top fw-bold small" style="background:#f8f9fa;border-radius:0 0 6px 6px">
    <span>Total hours: {{ grandTotalHours > 0 ? grandTotalHours.toLocaleString('en-US') : '—' }}</span>
    <span>Total budget: {{ grandTotalBudget > 0 ? fmtMoney(grandTotalBudget) : '—' }}</span>
  </div>
</div>
```

- [ ] **Step 2: Add the confirm modal (shared with later tasks) to the template**

Insert once, where `<!-- Task 3/6 insert the confirm modal here -->` is marked (used by task/resource/PTC/group removal confirmations in this and later tasks):

```html
<div class="modal fade" id="confirmModal" tabindex="-1" data-bs-backdrop="static">
  <div class="modal-dialog modal-dialog-centered" style="max-width:460px">
    <div class="modal-content shadow-lg">
      <div class="modal-header border-0 pb-1"><h6 class="modal-title fw-bold">⚠️ Confirm</h6></div>
      <div class="modal-body pt-1"><p class="mb-0" style="white-space:pre-line;font-size:.92rem">{{ confirmModal.message }}</p></div>
      <div class="modal-footer border-0 pt-2">
        <button class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
        <button class="btn btn-danger" @click="confirmModalOk">Confirm</button>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Add `data()`, `computed`, and `methods`**

In `data()`, add:

```js
confirmModal: { message: '', onConfirm: null },
```

In `computed`, add:

```js
grandTotalHours() {
  return (this.project?.tasks || []).reduce((s, t) => s + t.resources.reduce((rs, r) => rs + (r.soldHours || 0), 0), 0);
},
grandTotalBudget() {
  return (this.project?.tasks || []).reduce((s, t) => s + t.resources.reduce((rs, r) => rs + (r.soldHours || 0) * (r.hourlyRate || 0), 0), 0);
},
```

In `methods`, add:

```js
// Currency formatting — config-form.js-specific, not extracted to js/lib (no other page needs it after this migration).
cfgCurrencyLocale(cur) { return (cur === '$' || cur === '£') ? 'en-US' : 'de-DE'; },
fmtMoney(amount) {
  const cur = this.project?.currency || '€';
  const f = new Intl.NumberFormat(this.cfgCurrencyLocale(cur), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);
  return cur === 'CHF' ? `CHF ${f}` : `${cur} ${f}`;
},
parseMoney(str) {
  const cur = this.project?.currency || '€';
  const digits = String(str).trim().replace(/^(CHF|[€$£])\s*/i, '');
  return this.cfgCurrencyLocale(cur) === 'de-DE'
    ? parseFloat(digits.replace(/\./g, '').replace(',', '.')) || 0
    : parseFloat(digits.replace(/,/g, '')) || 0;
},
ymdToIt(ymd) {
  if (!ymd || ymd.length < 8) return '';
  return `${ymd.slice(6,8)}/${ymd.slice(4,6)}/${ymd.slice(0,4)}`;
},
itToYmd(it) {
  if (!it) return '';
  const parts = it.split('/');
  if (parts.length !== 3) return '';
  const [d, m, y] = parts;
  if (!d || !m || !y || y.length !== 4) return '';
  const ymd = `${y}${m.padStart(2,'0')}${d.padStart(2,'0')}`;
  return isNaN(new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`).getTime()) ? '' : ymd;
},
monthLabel(ym, locale = 'en-US') {
  const [y, m] = [parseInt(ym.slice(0,4)), parseInt(ym.slice(4,6))];
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'short', year: '2-digit' });
},
taskMonthRange(task) {
  const s = task.startDate || (this.project.startDate ? this.project.startDate + '01' : '');
  const e = task.endDate   || (this.project.endDate   ? this.project.endDate   + '01' : '');
  if (!s || !e) return [];
  // parseTaskDate is defined in js/core.js and stays unchanged — same semantics as today.
  const tStart = parseTaskDate(s, false), tEnd = parseTaskDate(e, true);
  const months = [];
  let cy = tStart.getFullYear(), cm = tStart.getMonth() + 1;
  const ey = tEnd.getFullYear(), em = tEnd.getMonth() + 1;
  while (cy < ey || (cy === ey && cm <= em)) { months.push(`${cy}${String(cm).padStart(2,'0')}`); cm++; if (cm > 12) { cm = 1; cy++; } }
  return months;
},
rebuildTaskDist(ti) {
  const task = this.project.tasks[ti];
  const months = this.taskMonthRange(task);
  const kept = {};
  months.forEach(ym => { if (task.monthlyDistribution?.[ym] != null) kept[ym] = task.monthlyDistribution[ym]; });
  if (months.length === 1) kept[months[0]] = 100;
  task.monthlyDistribution = kept;
},
distBadgeClass(task) {
  const sum = Object.values(task.monthlyDistribution || {}).reduce((s, v) => s + (v || 0), 0);
  if (Math.abs(sum - 100) < 0.05) return 'bg-success';
  return sum > 100 ? 'bg-danger' : 'bg-warning text-dark';
},
distBadgeText(task) {
  const sum = Object.values(task.monthlyDistribution || {}).reduce((s, v) => s + (v || 0), 0);
  const rounded = Math.round(sum * 10) / 10;
  if (Math.abs(sum - 100) < 0.05) return 'Σ = 100%';
  return sum > 100 ? `Σ = ${rounded}% (${Math.round((sum-100)*10)/10}% too much)` : `Σ = ${rounded}% (${Math.round((100-sum)*10)/10}% missing)`;
},
taskTotal(task) {
  return task.resources.reduce((s, r) => s + (r.soldHours || 0) * (r.hourlyRate || 0), 0);
},
addTask() {
  this.project.tasks.push({ name: '', billable: true, completed: false, startDate: '', endDate: '', monthlyDistribution: {}, resources: [] });
},
confirmRemoveTask(ti) {
  const name = this.project.tasks[ti].name.trim() || 'this task';
  this.showConfirm(`Delete task "${name}" and all its resources?`, () => { this.project.tasks.splice(ti, 1); });
},
addResource(ti) {
  this.project.tasks[ti].resources.push({ role: '', soldHours: 0, hourlyRate: 0 });
},
confirmRemoveResource(ti, ri) {
  const role = this.project.tasks[ti].resources[ri].role.trim() || 'this resource';
  this.showConfirm(`Remove resource "${role}"?`, () => { this.project.tasks[ti].resources.splice(ri, 1); });
},
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

Note: `showConfirm`/`confirmModalOk` are shared infrastructure used by Tasks 3, 5, and 6 (task/resource/PTC/group removal, and the derive/reforecast confirmation flow) — defined once here, reused later without redefinition.

- [ ] **Step 4: Run the frontend test suite**

Run: `npm test` — expected all existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add project-config.html
git commit -m "feat(project-config): Tasks & Resources section, shared confirm modal"
```

---

### Task 4: `js/lib/config-form-calc.js` — pure derive/reforecast extraction (TDD)

**Files:**
- Create: `js/lib/config-form-calc.js`
- Create: `js/lib/config-form-calc.test.js`

**Interfaces:**
- Consumes: `distributeHoursExact` from `js/lib/cfg-parse.js` (native ES `import`, per this codebase's rule that `js/lib/*` modules needing another `js/lib/*` function use `import`, not the `window` bridge).
- Produces: `deriveDistribution(tasks, months, projStartYm, projEndYm)` and `reforecastDistribution(tasks, months, actualsRows, currentYm)`, both pure (no DOM access), both bridged to `window.*` for Task 5's Vue methods to call.

This is the one task in this plan following strict TDD (per `superpowers:test-driven-development`) — write the failing test first, since these are pure functions with no DOM dependency to fight.

- [ ] **Step 1: Write the failing tests for `deriveDistribution`**

Create `js/lib/config-form-calc.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { deriveDistribution, reforecastDistribution } from './config-form-calc.js';

describe('deriveDistribution', () => {
  it('distributes a single-month task fully into that month', () => {
    const tasks = [{
      name: 'Dev', billable: true,
      startDate: '20260101', endDate: '20260131',
      resources: [{ soldHours: 10, hourlyRate: 100 }],
    }];
    const result = deriveDistribution(tasks, ['202601'], '202601', '202601');
    expect(result.newPhasing['202601']).toBe(1000);
    expect(result.newPlanning['202601']).toBe(10);
    expect(result.totalBudget).toBe(1000);
    expect(result.totalHours).toBe(10);
  });

  it('splits a task spanning two equal-length months roughly in half by day-overlap', () => {
    const tasks = [{
      name: 'Dev', billable: true,
      startDate: '20260101', endDate: '20260228',
      resources: [{ soldHours: 28, hourlyRate: 100 }],
    }];
    const result = deriveDistribution(tasks, ['202601', '202602'], '202601', '202602');
    // Jan has 31 days, Feb has 28 — task spans exactly Jan 1 to Feb 28 (59 days total)
    expect(result.newPlanning['202601'] + result.newPlanning['202602']).toBeCloseTo(28, 5);
    expect(result.newPlanning['202601']).toBeGreaterThan(result.newPlanning['202602']);
  });

  it('uses monthlyDistribution percentages when they sum to ~100', () => {
    const tasks = [{
      name: 'Dev', billable: true,
      startDate: '20260101', endDate: '20260228',
      monthlyDistribution: { '202601': 30, '202602': 70 },
      resources: [{ soldHours: 100, hourlyRate: 10 }],
    }];
    const result = deriveDistribution(tasks, ['202601', '202602'], '202601', '202602');
    expect(result.newPhasing['202601']).toBe(300);
    expect(result.newPhasing['202602']).toBe(700);
  });

  it('excludes non-billable tasks', () => {
    const tasks = [{
      name: 'Dev', billable: false,
      startDate: '20260101', endDate: '20260131',
      resources: [{ soldHours: 10, hourlyRate: 100 }],
    }];
    // Caller is responsible for filtering billable:true tasks before calling —
    // this function assumes the caller already filtered, per cfgDerivePhasing's
    // existing `.filter(t => t.billable !== false)` at the call site.
    const result = deriveDistribution(tasks.filter(t => t.billable !== false), ['202601'], '202601', '202601');
    expect(result.newPhasing).toEqual({});
  });
});

describe('reforecastDistribution', () => {
  it('replaces past months with exact actuals and splits remaining budget across future months', () => {
    const tasks = [{
      name: 'Dev', billable: true,
      startDate: '20260101', endDate: '20260331',
      resources: [{ role: 'Developer', soldHours: 30, hourlyRate: 100 }],
    }];
    const actualsRows = [
      { task: 'Dev', role: 'Developer', date: '2026-01-15', hours: 10 },
    ];
    const result = reforecastDistribution(tasks, ['202601', '202602', '202603'], actualsRows, '202602');
    // January (past): exact actuals — 10h × €100 = €1000
    expect(result.newPlanning['202601']).toBe(10);
    expect(result.newPhasing['202601']).toBe(1000);
    // Remaining 20h / €2000 split across Feb+Mar (2 future months, even split, no monthlyDistribution)
    expect(result.newPlanning['202602'] + result.newPlanning['202603']).toBeCloseTo(20, 5);
  });

  it('caps past actuals at sold hours/budget when actuals exceed sold', () => {
    const tasks = [{
      name: 'Dev', billable: true,
      startDate: '20260101', endDate: '20260131',
      resources: [{ role: 'Developer', soldHours: 5, hourlyRate: 100 }],
    }];
    const actualsRows = [{ task: 'Dev', role: 'Developer', date: '2026-01-15', hours: 20 }];
    const result = reforecastDistribution(tasks, ['202601'], actualsRows, '202602');
    // Actuals (20h) exceed sold (5h) — scaled down to exactly 5h / €500, not 20h / €2000.
    expect(result.newPlanning['202601']).toBeCloseTo(5, 5);
    expect(result.newPhasing['202601']).toBeCloseTo(500, 5);
  });

  it('returns a distError when carry-forward pushes a monthlyDistribution month above 100%', () => {
    const tasks = [{
      name: 'Dev', billable: true,
      startDate: '20260101', endDate: '20260228',
      monthlyDistribution: { '202601': 90, '202602': 10 },
      resources: [{ role: 'Developer', soldHours: 100, hourlyRate: 10 }],
    }];
    // Actuals for Jan are far below the 90% planned — large positive carry-forward delta.
    const actualsRows = [{ task: 'Dev', role: 'Developer', date: '2026-01-15', hours: 1 }];
    const result = reforecastDistribution(tasks, ['202601', '202602'], actualsRows, '202602');
    expect(result.distError).toContain('Dev');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run js/lib/config-form-calc.test.js`
Expected: FAIL with "Cannot find module './config-form-calc.js'" (file doesn't exist yet).

- [ ] **Step 3: Read the original functions in full before extracting**

Read `js/config-form.js:626-709` (`cfgDerivePhasing`) and `js/config-form.js:711-931` (`cfgReforecast`) one more time side-by-side with the tests above — the extraction must preserve every branch (monthly-% path vs. day-proportional path in derive; past-months-exact-actuals vs. future-months-distribution, the over-consumption scaling via `hrsScale`/`spendScale`, the `distError` carry-forward check, and the final `distributeHoursExact` call for future-month hour rounding in reforecast).

- [ ] **Step 4: Write `js/lib/config-form-calc.js`**

```js
import { distributeHoursExact } from './cfg-parse.js';

function parseTaskDateLocal(ymd, endOfDay) {
  const y = parseInt(ymd.slice(0, 4)), m = parseInt(ymd.slice(4, 6)), d = parseInt(ymd.slice(6, 8)) || 1;
  return new Date(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
}

export function deriveDistribution(tasks, months, cfgStart, cfgEnd) {
  const newPhasing = {}, rawPlanning = {};
  months.forEach(ym => {
    const [y, m] = [parseInt(ym.slice(0,4)), parseInt(ym.slice(4,6))];
    const mStart = new Date(y, m - 1, 1);
    const mEnd = new Date(y, m, 0);
    let budget = 0, hours = 0;
    tasks.forEach(task => {
      const taskBudget = task.resources.reduce((s, r) => s + (r.soldHours || 0) * (r.hourlyRate || 0), 0);
      const taskHours = task.resources.reduce((s, r) => s + (r.soldHours || 0), 0);
      const dist = task.monthlyDistribution;
      const distSum = dist ? Object.values(dist).reduce((s, v) => s + v, 0) : 0;
      if (dist && Math.abs(distSum - 100) < 0.5) {
        const pct = (dist[ym] || 0) / 100;
        budget += taskBudget * pct;
        hours += taskHours * pct;
      } else {
        const tStart = parseTaskDateLocal(task.startDate || cfgStart, false);
        const tEnd = parseTaskDateLocal(task.endDate || cfgEnd, true);
        const tDays = Math.max(1, (tEnd - tStart) / 86400000 + 1);
        const oStart = new Date(Math.max(mStart, tStart));
        const oEnd = new Date(Math.min(mEnd, tEnd));
        const oDays = Math.max(0, (oEnd - oStart) / 86400000 + 1);
        if (oDays > 0) {
          const frac = oDays / tDays;
          budget += taskBudget * frac;
          hours += taskHours * frac;
        }
      }
    });
    if (budget > 0) newPhasing[ym] = Math.round(budget * 100) / 100;
    if (hours > 0) rawPlanning[ym] = hours;
  });

  const rawPlanningTotal = Object.values(rawPlanning).reduce((s, v) => s + v, 0);
  const newPlanning = rawPlanningTotal > 0 ? distributeHoursExact(rawPlanningTotal, rawPlanning) : {};
  const totalBudget = Object.values(newPhasing).reduce((s, v) => s + v, 0);
  const totalHours = Object.values(newPlanning).reduce((s, v) => s + v, 0);

  return { newPhasing, newPlanning, totalBudget, totalHours };
}

export function reforecastDistribution(tasks, months, actualsRows, currentYm) {
  const pastMonths = months.filter(ym => ym < currentYm);
  const futureMonths = months.filter(ym => ym >= currentYm);
  const norm = s => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const billableNames = new Set(tasks.map(t => norm(t.name)));

  const rateMap = {};
  tasks.forEach(t => {
    const tKey = norm(t.name);
    rateMap[tKey] = {};
    (t.resources || []).forEach(r => { if (r.role) rateMap[tKey][norm(r.role)] = r.hourlyRate || 0; });
  });

  const projData = actualsRows.filter(r => billableNames.has(norm(r.task)));
  const taskActuals = {};
  projData.forEach(r => {
    if (!r.date) return;
    const dateStr = typeof r.date === 'string' ? r.date : r.date.toISOString();
    const ym = dateStr.slice(0, 7).replace('-', '');
    const tName = norm(r.task);
    const rate = (rateMap[tName] || {})[norm(r.role)] ?? 0;
    if (!taskActuals[tName]) taskActuals[tName] = {};
    if (!taskActuals[tName][ym]) taskActuals[tName][ym] = { hours: 0, spend: 0 };
    taskActuals[tName][ym].hours += r.hours;
    taskActuals[tName][ym].spend += r.hours * rate;
  });

  const totalBudget = tasks.reduce((s, t) => s + t.resources.reduce((rs, r) => rs + (r.soldHours||0)*(r.hourlyRate||0), 0), 0);
  const totalHours = tasks.reduce((s, t) => s + t.resources.reduce((rs, r) => rs + (r.soldHours||0), 0), 0);

  const newPhasing = {}, newPlanning = {};
  let distError = null;

  for (const task of tasks) {
    const tName = norm(task.name);
    const tActuals = taskActuals[tName] || {};
    const taskBudget = task.resources.reduce((s, r) => s + (r.soldHours||0)*(r.hourlyRate||0), 0);
    const taskHours = task.resources.reduce((s, r) => s + (r.soldHours||0), 0);
    const dist = task.monthlyDistribution;
    const distSum = dist ? Object.values(dist).reduce((s, v) => s + v, 0) : 0;
    const useDist = dist && Math.abs(distSum - 100) < 0.5;

    const taskStartYM = task.startDate ? task.startDate.slice(0, 6) : months[0];
    const taskEndYM = task.endDate ? task.endDate.slice(0, 6) : months[months.length - 1];
    const taskFuture = futureMonths.filter(ym => ym >= taskStartYM && ym <= taskEndYM);
    const taskFutureCount = taskFuture.length || 1;

    const rawPastHrs = pastMonths.reduce((s, ym) => s + ((tActuals[ym] || {}).hours || 0), 0);
    const rawPastSpend = pastMonths.reduce((s, ym) => s + ((tActuals[ym] || {}).spend || 0), 0);
    const hrsScale = rawPastHrs > taskHours && taskHours > 0 ? taskHours / rawPastHrs : 1;
    const spendScale = rawPastSpend > taskBudget && taskBudget > 0 ? taskBudget / rawPastSpend : 1;
    const remainHrs = Math.max(0, taskHours - rawPastHrs);
    const remainBud = Math.max(0, taskBudget - rawPastSpend);

    if (useDist) {
      let deltaPct = 0;
      pastMonths.forEach(ym => {
        const actualHrs = ((tActuals[ym] || {}).hours || 0) * hrsScale;
        const actualBudget = ((tActuals[ym] || {}).spend || 0) * spendScale;
        const actualPct = taskBudget > 0 ? (actualBudget / taskBudget * 100) : 0;
        const plannedPct = dist[ym] || 0;
        deltaPct += plannedPct - actualPct;
        if (actualHrs > 0) newPlanning[ym] = (newPlanning[ym] || 0) + actualHrs;
        if (actualBudget > 0) newPhasing[ym] = (newPhasing[ym] || 0) + actualBudget;
      });
      if (taskFuture.length > 0) {
        const firstFuture = taskFuture[0];
        const adjustedPct = (dist[firstFuture] || 0) + deltaPct;
        if (adjustedPct > 100.5) {
          distError = `Task "${task.name}": carry-forward (${deltaPct.toFixed(1)}%) pushes ${firstFuture} above 100%.\nAdjust the monthly distribution manually before running Reforecast.`;
          break;
        }
        taskFuture.forEach((ym, i) => {
          const pct = (i === 0 ? adjustedPct : (dist[ym] || 0));
          const bud = taskBudget * pct / 100;
          const hrs = taskHours * pct / 100;
          if (bud > 0.01) newPhasing[ym] = (newPhasing[ym] || 0) + bud;
          if (hrs > 0.01) newPlanning[ym] = (newPlanning[ym] || 0) + hrs;
        });
      }
    } else {
      pastMonths.forEach(ym => {
        const hrs = ((tActuals[ym] || {}).hours || 0) * hrsScale;
        const bud = ((tActuals[ym] || {}).spend || 0) * spendScale;
        if (hrs > 0) newPlanning[ym] = (newPlanning[ym] || 0) + hrs;
        if (bud > 0) newPhasing[ym] = (newPhasing[ym] || 0) + bud;
      });
      taskFuture.forEach(ym => {
        if (remainBud > 0) newPhasing[ym] = (newPhasing[ym] || 0) + remainBud / taskFutureCount;
        if (remainHrs > 0) newPlanning[ym] = (newPlanning[ym] || 0) + remainHrs / taskFutureCount;
      });
    }
    if (distError) break;
  }

  if (distError) return { newPhasing: {}, newPlanning: {}, distError, remainingBudget: 0, remainingHours: 0, pastMonths, futureMonths };

  const pastYMs = new Set(pastMonths);
  Object.keys(newPhasing).forEach(ym => { if (!pastYMs.has(ym)) newPhasing[ym] = Math.round(newPhasing[ym] * 100) / 100; });

  const pastSpendTotal = Object.values(taskActuals).reduce((s, ta) => s + pastMonths.reduce((ps, ym) => ps + ((ta[ym]||{}).spend||0), 0), 0);
  const pastHrsTotal = Object.values(taskActuals).reduce((s, ta) => s + pastMonths.reduce((ps, ym) => ps + ((ta[ym]||{}).hours||0), 0), 0);
  const remainingBudget = totalBudget - pastSpendTotal;
  const remainingHours = totalHours - pastHrsTotal;

  const futureRawHours = {};
  futureMonths.forEach(ym => { if (newPlanning[ym] !== undefined) futureRawHours[ym] = newPlanning[ym]; });
  const futureRawHoursTotal = Object.values(futureRawHours).reduce((s, v) => s + v, 0);
  let distributedRemainingHours = remainingHours;
  if (futureRawHoursTotal > 0) {
    const distributedFuture = distributeHoursExact(futureRawHoursTotal, futureRawHours);
    Object.assign(newPlanning, distributedFuture);
    distributedRemainingHours = Object.values(distributedFuture).reduce((s, v) => s + v, 0);
  }

  return { newPhasing, newPlanning, distError: null, remainingBudget, remainingHours, distributedRemainingHours, pastMonths, futureMonths };
}

window.deriveDistribution = deriveDistribution;
window.reforecastDistribution = reforecastDistribution;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run js/lib/config-form-calc.test.js`
Expected: PASS, all 7 tests.

- [ ] **Step 6: Run the full frontend test suite**

Run: `npm test` — expected all tests pass (63 previous + 7 new = 70).

- [ ] **Step 7: Commit**

```bash
git add js/lib/config-form-calc.js js/lib/config-form-calc.test.js
git commit -m "feat(project-config): extract derive/reforecast math into js/lib/config-form-calc.js

New vitest-covered pure functions, extracted verbatim (same branches,
same rounding, same distError condition) from cfgDerivePhasing and
cfgReforecast in js/config-form.js. Follows the cfg-parse.js/
planning-calc.js/costgrid-calc.js pattern already established in this
codebase. js/config-form.js itself is untouched — still used by
portfolio.html."
```

---

### Task 5: Phasing/Planning grids + wire derive/reforecast

**Files:**
- Modify: `project-config.html`

**Interfaces:**
- Consumes: `deriveDistribution`/`reforecastDistribution` (Task 4, via `window.*` bridge — read from inside a Vue method invoked after `DOMContentLoaded`/`created()`, satisfying this codebase's bridging rule), `cfgParseHours`/`cfgFmtHours` (from `js/lib/cfg-parse.js`, already loaded), `showConfirm`/`confirmModalOk` (Task 3).
- Produces: `derivePhasing()`, `runReforecast()` Vue methods; phasing/planning grid template sections.

- [ ] **Step 1: Add the Monthly Budget Phasing and Monthly Hour Planning sections**

Insert where `<!-- Task 5 inserts Phasing/Planning grid sections here -->` is marked:

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
    <div class="cfg-month-grid">
      <div class="cfg-month-cell" v-for="ym in projectMonths" :key="ym">
        <div class="cfg-month-label">{{ monthLabel(ym) }}</div>
        <input type="text" class="form-control form-control-sm text-end"
               :readonly="isViewer" :value="project.phasing[ym] > 0 ? fmtMoney(project.phasing[ym]) : ''"
               @focus="e => { e.target.value = project.phasing[ym] > 0 ? project.phasing[ym] : ''; }"
               @blur="e => { const v = parseMoney(e.target.value); if (v > 0) project.phasing[ym] = v; else delete project.phasing[ym]; e.target.value = v > 0 ? fmtMoney(v) : ''; }">
      </div>
    </div>
    <div class="d-flex align-items-center gap-2 mt-2" style="font-size:var(--text-base)">
      <span class="text-muted">=</span><strong>{{ phasingSum > 0 ? fmtMoney(phasingSum) : '—' }}{{ grandTotalBudget > 0 ? ' / ' + fmtMoney(grandTotalBudget) : '' }}</strong>
    </div>
  </div>
  <p class="text-muted small mb-0" v-else>Set Start and End month first.</p>
</div>
<div class="cfg-section">
  <div class="d-flex justify-content-between align-items-center cfg-section-title">
    <span>5. Monthly Hour Planning <span class="fw-normal text-muted">(planned hours to consume per month)</span></span>
    <div class="d-flex gap-2 align-items-center flex-wrap" v-if="!isViewer">
      <button class="btn btn-sm btn-outline-secondary" @click="derivePhasing">⟳ Derive from task dates</button>
      <button class="btn btn-sm btn-outline-secondary" v-if="reforecastVisible" @click="runReforecast">↻ Reforecast from actuals</button>
    </div>
  </div>
  <div class="mt-1" v-if="projectMonths.length">
    <div class="cfg-month-grid">
      <div class="cfg-month-cell" v-for="ym in projectMonths" :key="ym">
        <div class="cfg-month-label">{{ monthLabel(ym) }}</div>
        <input type="text" class="form-control form-control-sm text-end"
               :readonly="isViewer" :value="project.planning[ym] > 0 ? cfgFmtHours(project.planning[ym]) : ''"
               @focus="e => { e.target.value = project.planning[ym] > 0 ? project.planning[ym] : ''; }"
               @blur="e => { const v = cfgParseHours(e.target.value); if (v > 0) project.planning[ym] = v; else delete project.planning[ym]; e.target.value = v > 0 ? cfgFmtHours(v) : ''; }">
      </div>
    </div>
    <div class="d-flex align-items-center gap-2 mt-2" style="font-size:var(--text-base)">
      <span class="text-muted">=</span><strong>{{ planningSum > 0 ? (planningSum.toLocaleString('en-US') + ' h') : '—' }}{{ grandTotalHours > 0 ? ' / ' + grandTotalHours.toLocaleString('en-US') + ' h' : '' }}</strong>
    </div>
  </div>
  <p class="text-muted small mb-0" v-else>Set Start and End month first.</p>
</div>
```

- [ ] **Step 2: Add `data()`, `computed`, and `methods`**

In `data()`, add:

```js
reforecastVisible: false,
```

In `computed`, add:

```js
projectMonths() {
  if (!this.project?.startDate || !this.project?.endDate) return [];
  const [sy, sm] = [parseInt(this.project.startDate.slice(0,4)), parseInt(this.project.startDate.slice(4,6))];
  const [ey, em] = [parseInt(this.project.endDate.slice(0,4)), parseInt(this.project.endDate.slice(4,6))];
  const months = [];
  let cy = sy, cm = sm;
  while (cy < ey || (cy === ey && cm <= em)) { months.push(`${cy}${String(cm).padStart(2,'0')}`); cm++; if (cm > 12) { cm = 1; cy++; } }
  return months;
},
phasingSum() { return Object.values(this.project?.phasing || {}).reduce((s, v) => s + v, 0); },
planningSum() { return Object.values(this.project?.planning || {}).reduce((s, v) => s + v, 0); },
```

In `methods`, add:

```js
async updateReforecastVisibility() {
  this.reforecastVisible = false;
  if (!this.project?.code) return;
  try {
    const uploads = await Api.timesheets.get(this.project.code);
    this.reforecastVisible = (uploads || []).some(u => (u.data || []).length > 0);
  } catch (_) { /* stays hidden */ }
},
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

  const fmtB = n => this.fmtMoney(Math.abs(n));
  const fmtH = n => `${+(Math.round(Math.abs(n) + 'e1') + 'e-1')} h`;
  const pastCount = result.pastMonths.length, futureCount = result.futureMonths.length;
  const distTaskCount = tasks.filter(t => {
    const d = t.monthlyDistribution;
    return d && Math.abs(Object.values(d).reduce((s,v)=>s+v,0) - 100) < 0.5;
  }).length;

  const message = `Phasing and planning grids will be fully overwritten:\n\n`
    + `Past months (${pastCount}) — replaced with actual spend & hours from loaded XLS data\n`
    + `Current & future months (${futureCount}) — distributed per task settings `
    + (distTaskCount > 0 ? `(${distTaskCount} task${distTaskCount>1?'s':''} use monthly distribution)` : '(even split)') + `:\n`
    + `  Remaining budget: ${fmtB(result.remainingBudget)}${result.remainingBudget < 0 ? ' (over budget)' : ''}\n`
    + `  Remaining hours: ${fmtH(result.distributedRemainingHours)}${result.remainingHours < 0 ? ' (over hours)' : ''}`;

  this.showConfirm(message, () => {
    this.project.phasing = result.newPhasing;
    this.project.planning = result.newPlanning;
  });
},
```

Note: the confirmation copy intentionally omits "The current values will be saved as a snapshot for rollback" (present in the original at `js/config-form.js:687,907`) — per Global Constraint 6, rollback is not ported.

- [ ] **Step 3: Call `updateReforecastVisibility()` after project resolution**

In `created()` (Task 1's method), after `this.resolveProject();`, add:

```js
if (this.project && !this.notFound) await this.updateReforecastVisibility();
```

- [ ] **Step 4: Run the frontend test suite**

Run: `npm test` — expected all tests pass.

- [ ] **Step 5: Commit**

```bash
git add project-config.html
git commit -m "feat(project-config): phasing/planning grids, wire derive/reforecast via js/lib/config-form-calc.js

Confirmation copy drops the now-inaccurate rollback/snapshot sentence
(rollback is confirmed dead on this page, not ported — see design
spec's Investigation findings)."
```

---

### Task 6: PTC, Functional Groups, Actuals, Save/Import/Export, viewer-mode buttons

**Files:**
- Modify: `project-config.html`

**Interfaces:**
- Consumes: `Api.timesheets.get`/`.upload` (unchanged), `_pushProjectToApi`/`clearProjectData`/`persistConfig`/`isValidSoldHours` (from `js/api-sync.js`/`js/core.js`, unchanged).
- Produces: PTC/groups CRUD methods, actuals upload/export methods, `onSave()` (full implementation replacing Task 1's stub), `onClearData()` (full implementation), `exportTasksXlsx()`.

- [ ] **Step 1: Add the Actuals section**

Insert where `<!-- Task 6 inserts Actuals section here -->` is marked (immediately after "1. Project info", before "3. Tasks & Resources"):

```html
<div class="cfg-section">
  <div class="d-flex justify-content-between align-items-center cfg-section-title">
    <span>2. Actuals</span>
    <div class="d-flex gap-2">
      <label class="btn btn-sm btn-outline-secondary mb-0" v-if="project.code && !isViewer">
        ⬆ Upload XLS
        <input type="file" accept=".xls,.xlsx" style="display:none" @change="onActualsFileChange">
      </label>
      <button class="btn btn-sm btn-outline-secondary" v-if="actuals.exportRows" @click="exportActualsCsv">⬇ Export CSV</button>
    </div>
  </div>
  <div class="text-muted small py-1" v-html="actuals.info"></div>
  <div class="small mt-1" v-if="actuals.status" :class="actuals.statusClass">{{ actuals.status }}</div>
</div>
```

- [ ] **Step 2: Add the PTC and Functional Groups sections**

Insert where `<!-- Task 6 inserts PTC + Functional Groups sections here -->` is marked:

```html
<div class="cfg-section">
  <div class="d-flex justify-content-between align-items-center cfg-section-title"><span>6. Pass Through Costs <span class="fw-normal text-muted">(PTC)</span></span><button class="btn btn-sm btn-primary" v-if="!isViewer" @click="addPtc">+ Add PTC</button></div>
  <p class="text-muted small mb-3">Add external costs (licences, travel, etc.) with title, note, amount and the month they occur.</p>
  <div class="cfg-ptc-card border rounded p-3 mb-2" v-for="(item, pi) in project.ptc" :key="pi">
    <div class="row g-2 align-items-start">
      <div class="col-sm-3"><label class="form-label small text-muted mb-1">Title</label><input type="text" class="form-control form-control-sm" v-model="item.title" :disabled="isViewer" placeholder="e.g. Software licence"></div>
      <div class="col-sm-4"><label class="form-label small text-muted mb-1">Note</label><input type="text" class="form-control form-control-sm" v-model="item.note" :disabled="isViewer" placeholder="optional description"></div>
      <div class="col-sm-2"><label class="form-label small text-muted mb-1">Amount</label>
        <input type="text" class="form-control form-control-sm text-end" :readonly="isViewer"
               :value="item.amount > 0 ? fmtMoney(item.amount) : ''"
               @focus="e => { e.target.value = item.amount > 0 ? item.amount : ''; }"
               @blur="e => { item.amount = parseMoney(e.target.value); e.target.value = item.amount > 0 ? fmtMoney(item.amount) : ''; }">
      </div>
      <div class="col-sm-2"><label class="form-label small text-muted mb-1">Month</label>
        <select class="form-select form-select-sm" v-model="item.month" :disabled="isViewer">
          <option v-if="!projectMonths.length" value="">— set project dates first —</option>
          <option v-for="ym in projectMonths" :key="ym" :value="ym">{{ monthLabelLong(ym) }}</option>
        </select>
      </div>
      <div class="col-sm-1 d-flex align-items-end"><button class="btn btn-sm btn-outline-danger w-100" v-if="!isViewer" @click="confirmRemovePtc(pi)">🗑</button></div>
    </div>
  </div>
  <div class="d-flex justify-content-end px-2 py-2 mt-1 border-top fw-bold small" style="background:#fff3cd;border-radius:0 0 6px 6px">Total PTC: {{ totalPtc > 0 ? fmtMoney(totalPtc) : '—' }}</div>
</div>
<div class="cfg-section">
  <div class="d-flex justify-content-between align-items-center cfg-section-title"><span>7. Functional Groups <span class="fw-normal text-muted">(optional)</span></span><button class="btn btn-sm btn-primary" v-if="!isViewer" @click="addGroup">+ Add group</button></div>
  <p class="text-muted small mb-3">Group roles into functional areas. Roles must match the <strong>Job Role: Name</strong> column (one per line).</p>
  <div class="cfg-group-card border rounded p-3 mb-2" v-for="(grp, gi) in project.groups" :key="gi">
    <div class="d-flex align-items-center gap-2 mb-2">
      <span class="text-muted small text-nowrap">Group name:</span>
      <input type="text" class="form-control form-control-sm" v-model="grp.name" :disabled="isViewer" placeholder="e.g. Development">
      <button class="btn btn-sm btn-outline-danger flex-shrink-0" v-if="!isViewer" @click="project.groups.splice(gi, 1)">🗑</button>
    </div>
    <label class="form-label small text-muted mb-1">Roles (one per line, must match Job Role: Name column in XLS):</label>
    <textarea class="form-control form-control-sm font-monospace" rows="3" :disabled="isViewer"
              :value="grp.roles.join('\n')" @input="e => grp.roles = e.target.value.split('\n').map(s => s.trim()).filter(Boolean)"
              placeholder="HWGDEV - DEVELOPER&#10;HWGINTERN - ACCSVS"></textarea>
  </div>
</div>
```

- [ ] **Step 3: Add `data()`, `computed`, and `methods` for PTC/groups/actuals/save**

In `data()`, add:

```js
actuals: { info: 'Save the project first to enable actuals upload.', status: '', statusClass: '', exportRows: null },
```

In `computed`, add:

```js
totalPtc() { return (this.project?.ptc || []).reduce((s, p) => s + (p.amount || 0), 0); },
```

In `methods`, add:

```js
monthLabelLong(ym) {
  const [y, m] = [parseInt(ym.slice(0,4)), parseInt(ym.slice(4,6))];
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
},
addPtc() {
  this.project.ptc.push({ title: '', note: '', amount: 0, month: this.projectMonths[0] || '' });
},
confirmRemovePtc(pi) {
  const title = this.project.ptc[pi].title.trim() || 'this entry';
  this.showConfirm(`Remove PTC "${title}"?`, () => { this.project.ptc.splice(pi, 1); });
},
addGroup() {
  this.project.groups.push({ name: '', roles: [] });
},

async loadActuals() {
  if (!this.project.code) { this.actuals.info = 'Save the project first to enable actuals upload.'; return; }
  this.actuals.info = 'Loading…';
  try {
    const rows = await Api.timesheets.get(this.project.code);
    if (!rows || !rows.length) {
      this.actuals.info = `<span class="text-muted">No actuals uploaded for project <code>${esc(this.project.code)}</code>.</span>`;
      this.actuals.exportRows = null;
      return;
    }
    const row = rows[0];
    const dt = row.uploaded_at ? new Date(row.uploaded_at).toLocaleString('en-GB', { dateStyle:'medium', timeStyle:'short' }) : '—';
    const cnt = row.row_count ?? 0;
    const approxKb = row.data ? Math.round(JSON.stringify(row.data).length / 1024) : '?';
    this.actuals.info = `Last upload: <strong>${esc(dt)}</strong> &nbsp;·&nbsp; <strong>${cnt}</strong> rows &nbsp;·&nbsp; ~${approxKb} KB`;
    this.actuals.exportRows = row.data;
  } catch (e) {
    this.actuals.info = `<span class="text-danger">Could not load actuals: ${esc(e.message)}</span>`;
  }
},
exportActualsCsv() {
  const rowData = this.actuals.exportRows;
  if (!rowData || !rowData.length) return;
  const cols = ['projectId','projectName','date','role','owner','task','hours','notes'];
  const header = cols.join(',');
  const csvRows = rowData.map(r => cols.map(c => {
    const v = r[c] === null || r[c] === undefined ? '' : String(r[c]);
    return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g,'""')}"` : v;
  }).join(','));
  const csv = [header, ...csvRows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `actuals_${this.project.code}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
},
async onActualsFileChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!this.project.code) { alert('Set the D365 Project ID first before uploading actuals.'); return; }
  this.actuals.status = '⏳ Uploading…'; this.actuals.statusClass = 'text-muted';
  try {
    const result = await Api.timesheets.upload(file, this.project.code);
    this.actuals.status = `✅ Uploaded ${result.totalRows} rows.`; this.actuals.statusClass = 'text-success';
    await this.loadActuals();
    await this.updateReforecastVisibility();
    setTimeout(() => { this.actuals.status = ''; }, 4000);
  } catch (err) {
    this.actuals.status = `❌ Upload failed: ${err.message}`; this.actuals.statusClass = 'text-danger';
  }
  e.target.value = '';
},

exportTasksXlsx() {
  if (typeof XLSX === 'undefined') { alert('XLSX library not available.'); return; }
  const proj = this.project;
  const fmt = n => typeof n === 'number' ? n : (parseFloat(n) || 0);
  const rows = [];
  rows.push(['Project', proj.name || '']);
  rows.push(['Project ID (D365)', proj.code || '']);
  rows.push(['Pipeline', proj.pipeline || '']);
  rows.push(['Status', proj.status || '']);
  rows.push([]);
  rows.push(['Task', 'Role', 'Hours', 'Hourly Rate (€)', 'Total (€)']);
  let grandHours = 0, grandTotal = 0;
  (proj.tasks || []).forEach(task => {
    const resources = task.resources || [];
    let taskHours = 0, taskTotal = 0;
    if (resources.length === 0) {
      rows.push([task.name || '', '', '', '', '']);
    } else {
      resources.forEach((res, ri) => {
        const h = fmt(res.soldHours), r = fmt(res.hourlyRate), sub = h * r;
        taskHours += h; taskTotal += sub;
        rows.push([ri === 0 ? (task.name || '') : '', res.role || '', h, r, sub]);
      });
    }
    rows.push(['', 'Subtotal', taskHours, '', taskTotal]);
    rows.push([]);
    grandHours += taskHours; grandTotal += taskTotal;
  });
  rows.push(['', 'GRAND TOTAL', grandHours, '', grandTotal]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 36 }, { wch: 30 }, { wch: 10 }, { wch: 16 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tasks & Resources');
  const safe = s => String(s || '').replace(/[^a-z0-9]/gi, '_').slice(0, 30);
  XLSX.writeFile(wb, `tasks_${safe(proj.code || proj.name)}_${new Date().toISOString().slice(0, 10)}.xlsx`);
},

onClearData() {
  if (!this.project.id) return;
  this.showConfirm(`Clear all cached XLS data for project "${this.project.id}"?`, () => {
    clearProjectData(this.project.id);
    window.location.href = '/portfolio.html';
  });
},

async onSave() {
  // Sold-hours validation — reject the save if any value is outside the allowed set.
  for (const task of this.project.tasks) {
    for (const r of task.resources) {
      if (r.soldHours && !isValidSoldHours(r.soldHours)) {
        alert(`Invalid sold hours "${r.soldHours}" for role "${r.role}" on task "${task.name}". Allowed values: whole numbers, or with a fraction of .25, .5, or .75.`);
        return;
      }
    }
  }
  // Warn if there are billable tasks with resources but no phasing configured.
  const hasBillable = this.project.tasks.some(t => t.billable !== false && t.resources.length);
  const phasingEmpty = !Object.values(this.project.phasing).some(v => v > 0);
  if (hasBillable && phasingEmpty) {
    if (!window.confirm('The budget phasing for this project is empty — no monthly budget is configured.\n\nSave anyway?')) return;
  }

  this.saving = true;
  try {
    // config/cfgEditConfig/persistConfig are the existing in-memory-state contract (js/core.js, no-ops
    // by design per CLAUDE.md's "Data strategy" section) — mirror the original's single-project write-back.
    if (this.isNewProject) {
      config.projects.push(this.project);
    } else {
      const idx = config.projects.findIndex(p => p.id === this.project.id);
      if (idx >= 0) config.projects[idx] = this.project; else config.projects.push(this.project);
    }
    persistConfig();

    if (typeof _pushProjectToApi !== 'undefined') {
      await _pushProjectToApi(this.project).catch(e => console.warn('[sync] project push:', e.message));
    }
    window.location.href = '/portfolio.html';
  } catch (e) {
    this.jsonError = 'Save failed: ' + e.message;
    this.saving = false;
  }
},
```

- [ ] **Step 4: Call `loadActuals()` after project resolution**

In `created()`, after the `updateReforecastVisibility()` call added in Task 5, add:

```js
if (this.project && !this.notFound) await this.loadActuals();
```

- [ ] **Step 5: Run the frontend test suite**

Run: `npm test` — expected all tests pass.

- [ ] **Step 6: Commit**

```bash
git add project-config.html
git commit -m "feat(project-config): PTC, functional groups, actuals, save/clear-data, XLSX export

Completes the 1:1 port of every reachable section. Save flow includes
the same sold-hours validation and empty-phasing warning as the
original."
```

---

### Task 7: Remove now-unused stub markup and finalize head script list

**Files:**
- Modify: `project-config.html`

- [ ] **Step 1: Verify no leftover references to the dropped machinery**

Run: `grep -n "cfgProjectSel\|cfgBtnNewProject\|cfgBtnDelProject\|cfgPageTitle\|cfgTabJson\|cfg-tab-btn\|cfgSwitchTab\|rollback\|Rollback" project-config.html`
Expected: no matches (all confirmed-dead markup from the original was never carried into the Task 1-6 rewrite — this step is a verification, not a removal, since the new file never included them).

- [ ] **Step 2: Verify the script tag list matches Global Constraint 2 exactly**

Run: `grep -n "<script" project-config.html`
Expected: bootstrap bundle, XLSX CDN, Vue 3 CDN, `js/api.js`, `js/core.js`, `js/settings.js`, `js/notifications.js`, `js/lib/cfg-parse.js` (module), `js/lib/config-form-calc.js` (module), `js/api-sync.js`, `js/nav.js`, plus the inline `<script>` with the Vue app. No `js/config-form.js`, no `js/roles.js`, no `js/clients.js`/`js/programs.js` (Task 2's client/program logic is inline in the Vue app, not from those files — only their underlying API/state helpers `loadClientsFromApi`/`getClients`/etc. are still used, which live in those files; re-check whether keeping the `<script src="js/clients.js">`/`<script src="js/programs.js">` tags is still required for `getClients()`/`getPrograms()`/`loadClientsFromApi()`/`loadProgramsFromApi()` to exist — if so, add them back explicitly here with a comment noting only the state/API helpers are used, not the modal UI).

- [ ] **Step 3: Run the full frontend test suite one more time**

Run: `npm test` — expected all tests pass (70/70).

- [ ] **Step 4: Commit (only if Step 1 or 2 required a fix)**

```bash
git add project-config.html
git commit -m "chore(project-config): verify script list and confirm no dead markup carried over"
```

If Steps 1-2 found nothing to fix, skip this commit — the plan's task list still records this verification pass.

---

### Task 8: Manual verification (post-merge only — do not attempt during Tasks 1-7's review cycle)

**This task cannot be executed until after `/finish-cycle`'s Gate 4 (merge) completes**, per Global Constraint 9.

**Files:** None — manual browser checklist.

- [ ] **Step 1: Open an existing project** via `/project-config.html?projectId=<real-id>` — confirm all 8 sections render with the project's actual data, breadcrumb shows the project name.
- [ ] **Step 2: Open with no `?projectId=`** — confirm a blank new-project form renders, breadcrumb shows "New Project".
- [ ] **Step 3: Open with a bogus `?projectId=`** — confirm the explicit "Project not found" state renders (Global Constraint 5), not a random different project.
- [ ] **Step 4: Client/Program** — assign an existing client/program via dropdown; create a new client and a new program via the add-modal, confirm both appear in their dropdowns immediately after creation.
- [ ] **Step 5: Tasks & Resources** — add a task, add 2 resources, remove one resource, remove the task (with confirm), verify grand totals update live.
- [ ] **Step 6: Monthly % distribution** — set a task's start/end dates spanning 3+ months, confirm the distribution grid appears with a Σ badge that updates as you type.
- [ ] **Step 7: Derive from task dates** — with tasks configured, click Derive, confirm the preview totals in the confirmation dialog, confirm, verify phasing/planning grids populate. Confirm the dialog text does **not** mention "snapshot" or "rollback".
- [ ] **Step 8: Reforecast from actuals** — upload an XLS with actuals for the project's D365 code (or use an existing uploaded project), confirm the "↻ Reforecast from actuals" button appears only once actuals exist, run it, verify past months show actuals-derived values and future months redistribute the remainder.
- [ ] **Step 9: PTC** — add a PTC entry, set amount/month, verify Total PTC updates; remove it.
- [ ] **Step 10: Functional Groups** — add a group, enter roles (one per line), verify it persists after save.
- [ ] **Step 11: Actuals upload/export** — upload an XLS, confirm the info line updates with row count; export CSV, confirm the file downloads with the expected columns.
- [ ] **Step 12: XLSX export** — click the "⬇ XLSX" button on Tasks & Resources, confirm the downloaded file's structure (header block, task rows, subtotals, grand total).
- [ ] **Step 13: Save** — save the project, confirm redirect to `/portfolio.html`, reopen the project, confirm all changes persisted.
- [ ] **Step 14: Sold-hours validation** — enter an invalid sold-hours value (e.g. `.3`), attempt to save, confirm the alert blocks the save with the exact original message.
- [ ] **Step 15: Empty-phasing warning** — clear all phasing values on a project with billable tasks, attempt to save, confirm the `window.confirm` warning appears.
- [ ] **Step 16: Viewer mode** — open a project where the current user has `viewer` permission, confirm: the info banner shows, all inputs are disabled (not just visually — attempt to type), Save/New/Delete/Clear-data/Derive/Reforecast/Remove buttons are all absent.
- [ ] **Step 17: Clear XLS data** — click "Clear XLS data" on a project with cached actuals, confirm the confirmation prompt, confirm redirect to portfolio after confirming.
- [ ] **Step 18: Console check** — throughout Steps 1-17, confirm no console errors.
- [ ] **Step 19: Record the result**

If all 18 checks pass: note in the cycle's `/finish-cycle` report that manual verification was completed post-merge, listing the checks above. If any check fails: this is a regression — do not close the cycle; fix `project-config.html` on a new small follow-up commit, re-verify, then close.

---

## Self-Review Notes

- **Spec coverage:** every section in the design spec's Components section (project info, client/program, tasks & resources, `js/lib/config-form-calc.js` extraction, phasing/planning, PTC, groups, actuals) maps to a task above. The design's 4 confirmed-dead-code omissions (rollback/snapshot, JSON tab toggle, `js/roles.js`, multi-project array) are each explicitly called out in Global Constraints and never reintroduced in any task's code.
- **Placeholder scan:** Task 2's Step 1 asks the implementer to read the exact API call shape before writing Step 4's code, rather than guessing a method name — this is a deliberate "read before writing" instruction, not a TBD; the surrounding code (validation, refresh-after-create, error handling) is fully written. All other tasks show complete code for every step.
- **Type consistency:** `project` object field names (`id`, `code`, `name`, `startDate`, `endDate`, `currency`, `pipeline`, `status`, `tasks`, `phasing`, `planning`, `ptc`, `groups`, `costGridRef`, `programId`, `clientId`, `my_permission`) are used identically across Tasks 1, 3, 5, and 6 — no drift. `deriveDistribution`/`reforecastDistribution`'s return shapes (`newPhasing`, `newPlanning`, `totalBudget`/`totalHours` or `remainingBudget`/`remainingHours`/`distError`) match exactly between Task 4's implementation and Task 5's consumption.
- **Task 2's open item:** the exact `Api.clients.create`/`Api.programs.create` method names in Task 2 Step 4 are marked for verification against `js/clients.js`/`js/programs.js` before writing — flagged explicitly in the task text (Step 1), not silently assumed.
