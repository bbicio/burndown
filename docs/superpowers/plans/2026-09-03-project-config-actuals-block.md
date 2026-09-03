# project-config.html Actuals Block Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework `project-config.html`'s Actuals block to match `timesheets.html`'s View/Fee-Spent/XLSX pattern and `portfolio.html`'s "Load Actuals" wording, move the delete action into that block with real server-side deletion, and change the post-Save redirect to land on the saved project's detail view instead of the bare portfolio list.

**Architecture:** All changes are confined to `project-config.html` (a single-file Vue 3 CDN-no-build-step page). No backend changes — `DELETE /api/timesheets/:projectCode` and `GET /api/timesheets/:projectCode` already exist and are already called elsewhere in the app (`timesheets.html`, and this page's own `loadActuals()`). A new Bootstrap modal (matching this page's own `clientEditModal`/`programEditModal` pattern) replaces "Export CSV" with a "View" popup and an ExcelJS-based "Download actuals" export, mirroring `timesheets.html`'s already-shipped `downloadXlsx()`/`buildXlsxFilename()`.

**Tech Stack:** Vue 3 (CDN, no build step), Bootstrap 5 modals, ExcelJS 4.4.0 (CDN) for the new XLSX export.

## Global Constraints

- No native `alert()`/`confirm()` — use this page's existing `showConfirm()` (backed by `#confirmModal`).
- ExcelJS pinned version: `4.4.0`, same CDN URL already used elsewhere: `https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js`.
- `View`/`Download actuals` visible to viewers (`isViewer`); `Load Actuals`/`Delete actuals` hidden for viewers (`v-if="!isViewer"`).
- `Delete actuals` requires no new backend work — `DELETE /api/timesheets/:projectCode` already enforces owner/admin.
- The View modal follows this page's own established Bootstrap `.modal.fade` + `bootstrap.Modal.getOrCreateInstance(el).show()/.hide()` pattern (matching `#clientEditModal`/`#programEditModal`) — not `timesheets.html`'s `v-if="modal.show"` custom overlay.
- `project.currency` is a symbol (`€`/`$`/`£`/`CHF`), not an ISO code — pass it directly as `fmtMoney(n, project.currency)`'s second argument; no conversion needed (`js/core.js`'s `fmtMoney` fallback uses an unmatched code as the displayed symbol verbatim).
- No change to the upload mechanism, the Save button's validation logic, `timesheets.html`, `portfolio.html`, or `js/core.js`'s `clearProjectData()`.

---

## File Structure

- **Modify:** `project-config.html` — the only file touched. Sections affected: the "1. Project info" block (remove the Clear XLS data button), the "2. Actuals" block (button row + new state), a new `#actualsViewModal` (added next to the existing `#clientEditModal`/`#programEditModal`), the `methods` block (`onClearData` replaced by `onDeleteActuals`, new `openActualsViewModal`/`downloadActualsXlsx`/`buildActualsFilename`, `exportActualsCsv` removed, `onSave`'s redirect line changed), and one new `<script defer>` CDN tag for ExcelJS.

---

### Task 1: Actuals block — rename Load Actuals, move + rename Delete actuals with real server delete

**Files:**
- Modify: `project-config.html:77` (remove), `project-config.html:85-99` (button row), `project-config.html:594-600` (`onClearData` → `onDeleteActuals`)

**Interfaces:**
- Produces: `onDeleteActuals()` — an `async` Vue method with no parameters, calling `Api.timesheets.delete(project.code)` (already defined, `js/api.js`). Consumed by the new `🗑 Delete actuals` button's `@click`.

- [ ] **Step 1: Remove the "Clear XLS data" button from "1. Project info"**

In `project-config.html`, find this block (around line 77):

```html
          <div class="col-sm-3 col-md-2 d-flex align-items-end"><button type="button" class="btn btn-outline-danger btn-sm w-100" v-if="!isViewer" @click="onClearData">🗑 Clear XLS data</button></div>
```

Delete this entire `<div>` line. The surrounding `<div class="row g-3">` (Currency/Pipeline/Status inputs) needs no other change — Bootstrap's grid reflows automatically with one fewer column.

- [ ] **Step 2: Rename "Upload XLS" to "Load Actuals" and rebuild the Actuals block button row**

Find the "2. Actuals" block (around lines 85-99):

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
        <div class="small mt-1 text-danger" v-if="actuals.guardMsg">{{ actuals.guardMsg }}</div>
        <div class="small mt-1" v-if="actuals.status" :class="actuals.statusClass">{{ actuals.status }}</div>
      </div>
```

Replace it with:

```html
      <div class="cfg-section">
        <div class="d-flex justify-content-between align-items-center cfg-section-title">
          <span>2. Actuals</span>
          <div class="d-flex gap-2">
            <label class="btn btn-sm btn-outline-secondary mb-0" v-if="project.code && !isViewer">
              📂 Load Actuals
              <input type="file" accept=".xls,.xlsx" style="display:none" @change="onActualsFileChange">
            </label>
            <button class="btn btn-sm btn-outline-secondary" v-if="actuals.exportRows" @click="openActualsViewModal">👁 View</button>
            <button class="btn btn-sm btn-outline-secondary" v-if="actuals.exportRows" @click="downloadActualsXlsx">⬇ Download actuals</button>
            <button class="btn btn-sm btn-outline-danger" v-if="!isViewer" @click="onDeleteActuals">🗑 Delete actuals</button>
          </div>
        </div>
        <div class="text-muted small py-1" v-html="actuals.info"></div>
        <div class="small mt-1 text-danger" v-if="actuals.guardMsg">{{ actuals.guardMsg }}</div>
        <div class="small mt-1" v-if="actuals.status" :class="actuals.statusClass">{{ actuals.status }}</div>
      </div>
```

(The `👁 View` and `⬇ Download actuals` buttons reference methods added in Tasks 2 and 3 — they won't work yet after this task alone, but the markup is correct and Vue won't error on an undefined method reference until clicked.)

- [ ] **Step 3: Replace `onClearData()` with `onDeleteActuals()`**

Find (around line 594-600):

```js
      async onClearData() {
        if (!this.project.id) return;
        if (await this.showConfirm(`Clear all cached XLS data for project "${this.project.id}"?`)) {
          clearProjectData(this.project.id);
          window.location.href = '/portfolio.html';
        }
      },
```

Replace with:

```js
      async onDeleteActuals() {
        if (!this.project.code) return;
        const n = this.actuals.exportRows?.length || 0;
        const msg = n
          ? `Delete ALL actuals for project "${this.project.code}"?\n\nThis removes ${n} row${n !== 1 ? 's' : ''}. This cannot be undone.`
          : `Delete actuals for project "${this.project.code}"?`;
        if (!(await this.showConfirm(msg))) return;
        try {
          await Api.timesheets.delete(this.project.code);
          await this.loadActuals();
        } catch (e) {
          this.actuals.status = `❌ Delete failed: ${e.message}`; this.actuals.statusClass = 'text-danger';
        }
      },
```

Note the guard changed from `this.project.id` to `this.project.code` — deletion is keyed by `project_code` (matching `Api.timesheets.delete`'s signature and `loadActuals()`'s own guard), not the internal `project.id`, and there's no redirect on success (unlike the old function): the page stays open and `loadActuals()` refreshes `actuals.info` to reflect the now-empty state.

- [ ] **Step 4: Manual verification**

```bash
scripts/test-branch.sh up
```

- Log in as admin, open `project-config.html?projectId=<id>` for a project that has at least one timesheet upload.
- Confirm `1. Project info` no longer shows a "Clear XLS data" button anywhere.
- Confirm `2. Actuals` shows `📂 Load Actuals` (not `⬆ Upload XLS`) and a `🗑 Delete actuals` button as the last button in that row.
- Click `🗑 Delete actuals`: confirm the dialog text names the actual row count; confirm it; verify the page does **not** navigate away, and `2. Actuals`'s info line updates to "No actuals uploaded for project ...".
- Run, against the test-branch DB (see `.env`/`scripts/test-branch.sh` for the container name):

```bash
docker exec <db-container> psql -U pdash -d pdash -c "SELECT * FROM timesheets WHERE project_code = '<that project's code>';"
```

Confirm zero rows — the delete was real, not just a local cache clear.
- Re-upload a small XLS via `📂 Load Actuals` to confirm the upload flow still works unchanged, then tear down: `scripts/test-branch.sh down`.

- [ ] **Step 5: Commit**

```bash
git add project-config.html
git commit -m "$(cat <<'EOF'
feat: rename Load Actuals, move Delete actuals into Actuals block with real server delete

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Czd2T16Y3TbXF4H5XCVRog
EOF
)"
```

---

### Task 2: "View" modal for actuals

**Files:**
- Modify: `project-config.html` (new modal markup near `#clientEditModal`/`#programEditModal`, around line 303; new method in `methods`)

**Interfaces:**
- Consumes: `actuals.exportRows` (existing `data()` field, populated by `loadActuals()`), `project.currency` (existing field).
- Produces: `openActualsViewModal()` — a Vue method with no parameters, no return value. Consumed by Task 1's `👁 View` button (`@click="openActualsViewModal"`, already wired in Task 1's markup).

- [ ] **Step 1: Add the `#actualsViewModal` markup**

In `project-config.html`, find the closing of `#programEditModal` (around line 303):

```html
  <div class="modal fade" id="programEditModal" tabindex="-1">
    <div class="modal-dialog modal-sm">
      <div class="modal-content">
        <div class="modal-header"><h5 class="modal-title fw-bold">＋ New program</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body">
          <div v-if="programModal.error" class="alert alert-danger py-2">{{ programModal.error }}</div>
          <div class="mb-3"><label class="form-label small fw-semibold">Program name</label><input type="text" class="form-control form-control-sm" v-model="programModal.name" placeholder="e.g. Chatbot AI Platform"></div>
          <div class="mb-3"><label class="form-label small fw-semibold">Program ID</label><input type="text" class="form-control form-control-sm" v-model="programModal.id" placeholder="e.g. PRG-001"></div>
        </div>
        <div class="modal-footer"><button class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary btn-sm" :disabled="programModal.saving" @click="saveProgramModal">{{ programModal.saving ? 'Saving…' : 'Save' }}</button></div>
      </div>
    </div>
  </div>
```

Immediately after that closing `</div>` (still before the `<!-- Task 3/6 insert the confirm modal here -->` comment and `#confirmModal`), insert:

```html
  <div class="modal fade" id="actualsViewModal" tabindex="-1">
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header py-2">
          <h6 class="modal-title mb-0">Actuals <span class="text-muted ms-2" style="font-size:.8rem">{{ actuals.exportRows?.length || 0 }} rows</span></h6>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body p-0">
          <table class="table table-sm table-hover mb-0" style="font-size:.78rem">
            <thead>
              <tr><th>Date</th><th>Owner</th><th>Role</th><th>Task</th><th class="text-end">Hours</th><th>Notes</th><th class="text-end">Fee</th><th class="text-end">Spent</th></tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in actuals.exportRows" :key="i">
                <td>{{ row.date }}</td><td>{{ row.owner }}</td><td>{{ row.role }}</td><td>{{ row.task }}</td>
                <td class="text-end">{{ row.hours }}</td><td>{{ row.notes }}</td>
                <td class="text-end">{{ fmtMoney(row.fee || 0, project.currency) }}</td>
                <td class="text-end fw-semibold">{{ fmtMoney((row.fee || 0) * (row.hours || 0), project.currency) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
```

`fmtMoney` is a plain global function from `js/core.js` (already loaded, `project-config.html:325`) — check whether it's already called bare elsewhere in this page's template (e.g. search for `fmtMoney(` in the file). If it is NOT already used bare in this page's template, you must add `fmtMoney,` to the `methods` object in Step 2 below (Vue 3's runtime-compiled templates fall through to global scope only via `with(this)`, and this repo's convention — see `timesheets.html`'s own `fmtMoney` fix — is to register it as a `methods` shorthand when a page's own `fmtDate`/other local method shadows the global lookup path; check for safety even if this page doesn't define its own `fmtDate`).

- [ ] **Step 2: Add `openActualsViewModal()` (and `fmtMoney` registration if needed per Step 1's check)**

In `project-config.html`'s `methods` object, find `loadActuals()` (around line 503) and add a new method directly after it (after its closing `},`):

```js
      openActualsViewModal() {
        bootstrap.Modal.getOrCreateInstance(document.getElementById('actualsViewModal')).show();
      },
```

If Step 1's check found `fmtMoney` is not already callable bare in this page's template, also add `fmtMoney,` as its own line inside the `methods: { ... }` object (anywhere — e.g. right before `openActualsViewModal() {`), so `{{ fmtMoney(...) }}` in the new modal template resolves correctly.

- [ ] **Step 3: Manual verification**

```bash
scripts/test-branch.sh up
```

- Open `project-config.html?projectId=<id>` for a project with existing actuals (re-upload one via `📂 Load Actuals` if needed after Task 1's delete test emptied it).
- Click `👁 View`. Confirm a modal opens listing Date/Owner/Role/Task/Hours/Notes/Fee/Spent for every uploaded row, with Fee/Spent showing the project's currency symbol and correct values (`Spent = Fee × Hours`).
- Confirm a row with no resolvable rate shows `Fee`/`Spent` as `0` (upload a row with an unmatched task/role via a small test XLS, same technique as the previous cycle's verification, if the project's existing data doesn't already have one).
- Close the modal (`×` button), confirm it closes cleanly and the page underneath is unaffected.
- Tear down: `scripts/test-branch.sh down`.

- [ ] **Step 4: Commit**

```bash
git add project-config.html
git commit -m "$(cat <<'EOF'
feat: add actuals View modal to project-config.html

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Czd2T16Y3TbXF4H5XCVRog
EOF
)"
```

---

### Task 3: "Download actuals" XLSX export

**Files:**
- Modify: `project-config.html` (new `<script>` tag; `exportActualsCsv()` replaced by `downloadActualsXlsx()` + `buildActualsFilename()`)

**Interfaces:**
- Consumes: `actuals.exportRows`, `project.code`/`project.name`/`project.clientId` (existing fields), `getClientName(clientId)` (global, `js/clients.js`, already loaded).
- Produces: `downloadActualsXlsx()` and `buildActualsFilename()` — Vue methods, no parameters. Consumed by Task 1's `⬇ Download actuals` button (`@click="downloadActualsXlsx"`, already wired).

- [ ] **Step 1: Add the ExcelJS CDN script tag**

In `project-config.html`, find (around line 322):

```html
<script defer src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
```

Add immediately after it:

```html
<script defer src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"></script>
```

(This page already loads `xlsx@0.18.5` — SheetJS — for its own, unrelated `exportTasksXlsx()`. ExcelJS is a different library with a different API; both can coexist, same as `timesheets.html`/`planning.html`/`costgrid.html` load ExcelJS without conflicting with anything else on those pages.)

- [ ] **Step 2: Replace `exportActualsCsv()` with `downloadActualsXlsx()` + `buildActualsFilename()`**

Find (around line 523-539):

```js
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
```

Replace with:

```js
      async downloadActualsXlsx() {
        const rows = this.actuals.exportRows || [];
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet(this.project.code || 'Actuals');
        ws.addRow(['Date', 'Owner', 'Role', 'Task', 'Hours', 'Notes', 'Fee', 'Spent']).font = { bold: true };
        rows.forEach(r => {
          const fee = r.fee || 0;
          ws.addRow([r.date, r.owner, r.role, r.task, r.hours, r.notes, fee, fee * (r.hours || 0)]);
        });
        ws.columns = [
          { width: 12 }, { width: 20 }, { width: 18 }, { width: 24 },
          { width: 10 }, { width: 30 }, { width: 12 }, { width: 12 },
        ];
        ws.views = [{ state: 'frozen', ySplit: 1 }];

        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = this.buildActualsFilename();
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 0);
      },
      buildActualsFilename() {
        const sanitize = s => String(s || '').trim().replace(/\s+/g, '-').replace(/[\\/:*?"<>|]/g, '');
        const client = sanitize(getClientName(this.project.clientId) || 'NoClient');
        const proj = sanitize(this.project.name || 'NoProject');
        const code = sanitize(this.project.code);
        const now = new Date();
        const yyyymmdd = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
        return `${client}_${proj}_${code}_${yyyymmdd}.xlsx`;
      },
```

The `setTimeout(..., 0)` deferred revoke (not an immediate synchronous `URL.revokeObjectURL`) matches the cold-review fix already applied to `timesheets.html`'s equivalent export — on Safari and some older Firefox/Chromium builds, revoking synchronously right after `a.click()` can cancel the download before it starts.

- [ ] **Step 3: Manual verification**

```bash
scripts/test-branch.sh up
```

- Open `project-config.html?projectId=<id>` for a project with existing actuals.
- Click `⬇ Download actuals`. Confirm an `.xlsx` file downloads (not `.csv`), named `<Client>_<ProjectName>_<ProjectCode>_<YYYYMMDD>.xlsx` with spaces replaced by `-`.
- Open the downloaded file and confirm it has the same 8 columns and values as the `👁 View` modal from Task 2, including correct Fee/Spent.
- Confirm no `⬇ Export CSV` button or `.csv` download option remains anywhere on the page.
- Tear down: `scripts/test-branch.sh down`.

- [ ] **Step 4: Commit**

```bash
git add project-config.html
git commit -m "$(cat <<'EOF'
feat: replace actuals CSV export with XLSX download in project-config.html

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Czd2T16Y3TbXF4H5XCVRog
EOF
)"
```

---

### Task 4: Save redirects to the saved project's detail view

**Files:**
- Modify: `project-config.html:635`

**Interfaces:**
- Consumes: `this.project.id` (existing field, already the final id for both new and existing projects by the time this line runs — see `_pushProjectToApi()`'s create-with-client-generated-id path, `js/api-sync.js:263`).

- [ ] **Step 1: Change the post-save redirect**

Find, inside `onSave()` (around line 635):

```js
          window.location.href = '/portfolio.html';
```

Replace with:

```js
          window.location.href = '/portfolio.html?projectId=' + this.project.id;
```

- [ ] **Step 2: Manual verification**

```bash
scripts/test-branch.sh up
```

- Open `project-config.html?projectId=<id>` for an existing project, change any field (e.g. the Project Name), click `💾 Save`. Confirm the browser lands on `portfolio.html` showing that specific project's detail view (KPI cards, burndown chart — the same view `📊 View Report →` produces from the portfolio list), not the bare project list.
- Open `project-config.html` with no `?projectId=` (new-project flow), fill in the required fields, click `💾 Save`. Confirm it also lands on that new project's detail view, not the bare list.
- Tear down: `scripts/test-branch.sh down`.

- [ ] **Step 3: Commit**

```bash
git add project-config.html
git commit -m "$(cat <<'EOF'
feat: redirect Save to the saved project's detail view instead of the portfolio list

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Czd2T16Y3TbXF4H5XCVRog
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** Brief/design items — Load Actuals rename ✓ (Task 1), View modal with Fee/Spent ✓ (Task 2), Download actuals XLSX ✓ (Task 3), Delete actuals moved/renamed/real-delete ✓ (Task 1), Save redirect ✓ (Task 4). All "Explicitly excluded scope" items are respected (no upload-mechanism change, no `clearProjectData()` removal, no `timesheets.html`/`portfolio.html` changes, no Save validation-logic change).
- **Placeholder scan:** no TBD/TODO; every step has literal code, not a description of code.
- **Type consistency:** `onDeleteActuals()` (Task 1) takes no parameters, matching its `@click="onDeleteActuals"` binding (also Task 1). `openActualsViewModal()` (Task 2) and `downloadActualsXlsx()` (Task 3) likewise take no parameters, matching their `@click` bindings introduced in Task 1's markup. `buildActualsFilename()` (Task 3) is called only from within `downloadActualsXlsx()` in the same task, no cross-task signature risk. `actuals.exportRows` is read (never mutated) by Tasks 2 and 3 — only `loadActuals()` (pre-existing) and `onDeleteActuals()` (Task 1, via calling `loadActuals()`) write it, so no task races another task's expectations of its shape (`Array` of `{date, owner, role, task, hours, notes, fee}` objects, unchanged from today).
