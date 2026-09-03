# Design — project-config.html: Actuals block rework + Save redirect

Brief: `docs/superpowers/briefs/2026-09-03-project-config-actuals-block-brief.md`

## Overview

`project-config.html`'s "Actuals" section and its Save flow get brought in line with two things already established elsewhere in the app this session: `timesheets.html`'s View/Fee-Spent/XLSX-export pattern (previous cycle), and `portfolio.html`'s "📂 Load Actuals" wording and per-project detail view. Four button changes in the Actuals block, one relocated/renamed/behavior-changed button, and one line changed in the post-save redirect.

## 1. Actuals block — buttons and layout

Reorders the existing block (`project-config.html:85-99`) and moves the button out of "1. Project info":

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

- `📂 Load Actuals` — renamed from `⬆ Upload XLS`, exact label/icon match with `portfolio.html:128,164`. Upload mechanism (`onActualsFileChange()`) unchanged.
- `👁 View` and `⬇ Download actuals` — new/renamed, gated on `actuals.exportRows` (same visibility rule as today's Export button), visible to viewers too (non-destructive).
- `🗑 Delete actuals` — moved here from "1. Project info" (was `🗑 Clear XLS data`, `project-config.html:77`), last in the row, hidden for viewers, **not** gated on `actuals.exportRows` (deleting with nothing to delete is a harmless no-op, matching today's `Clear XLS data` which has no such gate either).

"1. Project info" loses that button/column entirely; the row's other fields (Currency, Pipeline, Status) reflow into the freed grid space with no other markup change needed.

## 2. View modal and Download actuals

New Bootstrap modal, following this page's own established pattern (`clientEditModal`/`programEditModal`: `.modal.fade` + `id` + `bootstrap.Modal.getOrCreateInstance(el).show()/.hide()`) rather than `timesheets.html`'s `v-if="modal.show"` custom-overlay pattern — the host page's own convention wins:

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

`openActualsViewModal()`: `bootstrap.Modal.getOrCreateInstance(document.getElementById('actualsViewModal')).show()` — no data fetch, reuses `actuals.exportRows` already loaded by `loadActuals()`.

**Currency:** `project.currency` is already a symbol (`€`/`$`/`£`/`CHF`), not an ISO code. Verified against `fmtMoney(n, currencyCode)` (`js/core.js:288-295`): when `currencyCode` doesn't match any entry in `window.__currencies` (a symbol never will, codes are `EUR`/`USD`/`GBP`), the fallback is `{ symbol: code, locale: 'it-IT' }` — i.e. the passed-in value is used directly as the displayed symbol. Passing `project.currency` straight through therefore renders correctly in all 4 cases with no conversion needed.

**`downloadActualsXlsx()`** — same structure as `timesheets.html`'s `downloadXlsx()`:

```js
async downloadActualsXlsx() {
  const rows = this.actuals.exportRows || [];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(this.project.code || 'Actuals');
  ws.addRow(['Date','Owner','Role','Task','Hours','Notes','Fee','Spent']).font = { bold: true };
  rows.forEach(r => {
    const fee = r.fee || 0;
    ws.addRow([r.date, r.owner, r.role, r.task, r.hours, r.notes, fee, fee * (r.hours || 0)]);
  });
  ws.columns = [{width:12},{width:20},{width:18},{width:24},{width:10},{width:30},{width:12},{width:12}];
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = this.buildActualsFilename();
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0); // deferred, matches the cold-review fix already applied to timesheets.html
},
buildActualsFilename() {
  const sanitize = s => String(s || '').trim().replace(/\s+/g, '-').replace(/[\\/:*?"<>|]/g, '');
  const client = sanitize(getClientName(this.project.clientId) || 'NoClient');
  const proj = sanitize(this.project.name || 'NoProject');
  const code = sanitize(this.project.code);
  const now = new Date();
  const yyyymmdd = now.getFullYear() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0');
  return `${client}_${proj}_${code}_${yyyymmdd}.xlsx`;
},
```

Adds `<script defer src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js">` — same pinned version already used in `timesheets.html`/`planning.html`/`costgrid.html`.

**`onDeleteActuals()`**:

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

Replaces `onClearData()` (`project-config.html:594-600`) entirely — the old function's local-cache-clear (`clearProjectData()`, `js/core.js:146-149`, no server call) is replaced by a real `DELETE /api/timesheets/:projectCode`. No redirect on success — stays on `project-config.html`, `loadActuals()` refreshes `actuals.info` to show "No actuals uploaded" in place.

## 3. Save redirect and error handling

**`onSave()`** (`project-config.html:601-640`) — the post-success redirect (currently line 635, bare `/portfolio.html`) becomes:

```js
window.location.href = '/portfolio.html?projectId=' + this.project.id;
```

Applies uniformly to both the edit and create-new-project flows: `project.id` is already the final id in both cases (client-generated, pushed via `Api.projects.create({ ...meta, id: project.id })` in `_pushProjectToApi()`, `js/api-sync.js:263`) — no server-assigned id to reconcile. `portfolio.html`'s own `created()` hook (`portfolio.html:878-884`) already handles a `?projectId=` query param by calling `showDashboard(urlProjectId)` — the exact function `📊 View Report →` calls — so no change is needed on the `portfolio.html` side.

**Removed from "1. Project info":** the `🗑 Clear XLS data` button markup (`project-config.html:77`) and `onClearData()` (`project-config.html:594-600`). `clearProjectData()` (`js/core.js:146-149`) itself is untouched — it has no other callers after this change but removing it is out of scope for this cycle (dead-code cleanup, not requested).

**Error handling:**
- `openActualsViewModal()` — no network call, cannot fail beyond the Bootstrap `.show()` call itself.
- `downloadActualsXlsx()` — the button is only rendered when `actuals.exportRows` is truthy (`v-if`), so no additional empty-data guard is needed; any ExcelJS/Blob-construction error propagates unhandled, matching this page's existing `exportTasksXlsx()` (no try/catch there either) — for consistency, not because errors are expected here.
- `onDeleteActuals()` — `try/catch` surfaces the failure via `actuals.status`/`actuals.statusClass` (same idiom `onActualsFileChange()` already uses for upload failures), no redirect either way.

## Testing

No automated test infrastructure exists for Vue pages beyond `js/lib/` pure functions (project-wide convention) — manual browser verification:

- Load Actuals: unchanged behavior, quick regression check after the rename.
- View: modal opens with correct rows; Fee/Spent render correctly in the project's currency symbol.
- Download actuals: downloads `.xlsx` (not `.csv`) with the expected filename, opens correctly.
- Delete actuals: confirmation prompt fires; deletion is real (verify in DB — `timesheets` row for that `project_code` gone); page stays open, Actuals block updates to "No actuals uploaded."
- Save: redirects to `/portfolio.html?projectId=<id>`, lands on that project's detail view — same result as clicking "📊 View Report" from the portfolio list. Verify for both an existing-project edit and a brand-new project creation.
- Viewer mode: View/Download visible; Load Actuals/Delete actuals hidden.

## Explicitly excluded scope

(Carried over from the Brief.)

- No change to the upload mechanism itself (column mapping, date parsing, fee snapshot logic).
- No change to `js/core.js`'s `clearProjectData()`/in-memory cache mechanism — left in place, unused after this change but not removed.
- No change to `timesheets.html` or `portfolio.html`.
- No change to `onSave()`'s validation logic (sold-hours check, empty-phasing warning) — only the post-success redirect target changes.
