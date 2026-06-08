// ── COST GRID MODULE ──────────────────────────────────────────────────────────
// Structure: CostGrid { id, name, versions[] }
// Version:   { versionId, versionLabel, createdAt, status, linkedProjectId,
//              projectName, startDate, endDate, currency, note,
//              roles[], phases[] }
// Phase:     { phaseId, phaseName, tasks[] }
// Task:      { taskId, taskName, taskDescription, ptc, hours: { roleCode: n } }

const CG_INDEX_KEY = 'PDash_cg_index';
const cgKey = id  => `PDash_cg_${id}`;

let _cgActiveCgId      = null;
let _cgActiveVersionId = null;
let _cgDraft           = null;
let _cgSelectionMode         = false;
let _cgSelectedTaskIds       = new Set();
let _cgOfferDetailsCollapsed = false;
let _cgSummaryCollapsed      = false;
let _cgRoleModalMode         = 'add';   // 'add' | 'change' | 'duplicate'
let _cgRoleModalSourceCode   = null;    // roleCode being changed/duplicated

// ── PERSISTENCE ───────────────────────────────────────────────────────────────

function cgGetIndex()     { try { const s = storageGet(CG_INDEX_KEY); return s ? JSON.parse(s) : []; } catch(e) { return []; } }
function cgSaveIndex(idx) { storageSet(CG_INDEX_KEY, JSON.stringify(idx)); }
function cgLoad(cgId)     { try { const s = storageGet(cgKey(cgId)); return s ? JSON.parse(s) : null; } catch(e) { return null; } }
function cgSave(cg)       { storageSet(cgKey(cg.id), JSON.stringify(cg)); }
function cgDelete(cgId)   { try { localStorage.removeItem(cgKey(cgId)); } catch(e) {} cgSaveIndex(cgGetIndex().filter(id => id !== cgId)); }

function cgNewId()    { return 'cg_'   + Date.now(); }
function cgNewVerId() { return 'ver_'  + Date.now(); }
function cgNewPhId()  { return 'ph_'   + Date.now() + '_' + Math.random().toString(36).slice(2,6); }
function cgNewTkId()  { return 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2,6); }

// ── MIGRATION ────────────────────────────────────────────────────────────────

function cgMigrateVersion(v) {
  if (!v.linkedProjects) {
    v.linkedProjects = v.linkedProjectId
      ? [{ projectId: v.linkedProjectId, taskIds: [], createdAt: v.createdAt || new Date().toISOString() }]
      : [];
    delete v.linkedProjectId;
  }
  return v;
}

// ── CURRENCY FORMAT ───────────────────────────────────────────────────────────

function cgFmtCurrency(amount, currency) {
  const n      = Math.round((amount || 0) * 100) / 100;
  const locale = (currency === '$' || currency === '£') ? 'en-US' : 'de-DE';
  const f      = n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (currency === 'CHF') return `CHF ${f}`;
  if (currency === '$')   return `$ ${f}`;
  if (currency === '£')   return `£ ${f}`;
  return `€ ${f}`;
}

function cgFmtMonth(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate + (isoDate.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

function cgRefreshPhaseDates() {
  document.querySelectorAll('.cg-phase-row').forEach(phRow => {
    const phaseId = phRow.dataset.phase;
    const ph = _cgDraft.phases.find(p => p.phaseId === phaseId);
    if (!ph) return;
    const dates = ph.tasks.flatMap(t => [t.taskStartDate, t.taskEndDate]).filter(Boolean).sort();
    const cell  = phRow.cells[1];
    if (!cell) return;
    cell.innerHTML = dates.length
      ? `<span style="font-size:var(--text-xs);color:#93c5fd;font-weight:400">${cgFmtMonth(dates[0])} – ${cgFmtMonth(dates[dates.length-1])}</span>`
      : '';
  });
}

// ── VERSION LOCK STATE & LIVE BADGE ──────────────────────────────────────────

function cgGetVersionLockState(cgId, versionId) {
  const cg = cgLoad(cgId);
  if (!cg) return { locked: false, reason: '', message: '' };

  // Any OTHER version with linked projects → this version is superseded
  const otherLinked = cg.versions.some(v =>
    v.versionId !== versionId && (v.linkedProjects || []).length > 0
  );
  if (otherLinked) return {
    locked: true, reason: 'other-version-active',
    message: 'This version is locked — another version has been used to generate a project.'
  };

  // This version has a Committed linked project → deal is done, lock it
  const thisVer = cg.versions.find(v => v.versionId === versionId);
  const hasCommitted = (thisVer?.linkedProjects || []).some(lp => {
    const proj = (config.projects || []).find(p => p.id === lp.projectId);
    return proj?.pipeline === 'Committed';
  });
  if (hasCommitted) return {
    locked: true, reason: 'committed',
    message: 'This version is locked — the linked project has been committed.'
  };

  return { locked: false, reason: '', message: '' };
}

function cgPipelineStyle(pipeline) {
  switch (pipeline) {
    case 'SIP':         return { bg: 'var(--pipeline-sip-color)',          color: '#fff', icon: '' };
    case 'Expected':    return { bg: 'var(--pipeline-expected-color)',     color: '#fff', icon: '' };
    case 'Anticipated': return { bg: 'var(--pipeline-anticipated-color)', color: '#fff', icon: '' };
    case 'Committed':   return { bg: 'var(--pipeline-committed-color)',   color: '#fff', icon: ' 🔒' };
    case 'Canceled':    return { bg: 'var(--pipeline-canceled-color)',    color: '#fff', icon: ' ✕' };
    default:            return { bg: 'var(--text-disabled)', color: '#fff', icon: '' };
  }
}

function cgLiveVersionBadge(v) {
  // Pipeline is now owned by the version itself.
  if (v.pipeline) {
    const s = cgPipelineStyle(v.pipeline);
    return { label: v.pipeline, bg: s.bg, color: s.color, icon: s.icon };
  }
  const lps = v.linkedProjects || [];
  if (!lps.length) return { label: 'draft', bg: '#e9ecef', color: '#495057', icon: '' };
  // Legacy fallback: read from linked project.
  const PRIORITY = ['Committed', 'SIP', 'Anticipated', 'Expected', 'Canceled'];
  const found = new Set();
  for (const lp of lps) {
    const pipeline = (config.projects || []).find(p => p.id === lp.projectId)?.pipeline;
    if (pipeline) found.add(pipeline);
  }
  for (const p of PRIORITY) {
    if (found.has(p)) {
      const s = cgPipelineStyle(p);
      return { label: p, bg: s.bg, color: s.color, icon: s.icon };
    }
  }
  if (found.size) {
    const p = [...found][0];
    const s = cgPipelineStyle(p);
    return { label: p, bg: s.bg, color: s.color, icon: s.icon };
  }
  return { label: '?', bg: 'var(--text-disabled)', color: '#fff', icon: '' };
}



const CG_SECTIONS = ['portfolioSection','portfolioPlanningSection','mainContent',
                     'uploadSection','costGridEditorSection',
                     'pipelineBoardSection'];

function cgHideAll() { CG_SECTIONS.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; }); }

function showCostGridListView() {
  cgHideAll();
  document.getElementById('costGridListSection').style.display = 'block';
  updateNavState('costgrid');
  renderCostGridList();
}

function showCostGridEditorView(cgId, versionId) {
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
  renderCgEditor();
}

// ── LIST VIEW ─────────────────────────────────────────────────────────────────

function renderCostGridList() {
  const container = document.getElementById('costGridListContainer');
  const index     = cgGetIndex();

  if (!index.length) {
    container.innerHTML = '<div class="alert alert-info">No cost grids yet. Click <strong>+ New Cost Grid</strong> to get started.</div>';
    return;
  }

  container.innerHTML = '';
  index.forEach(cgId => {
    const cg = cgLoad(cgId);
    if (!cg) return;
    const card = document.createElement('div');
    card.className = 'section-card mb-3';

    const versionRows = cg.versions.map(v => {
      const badge       = cgLiveVersionBadge(v);
      const sipBadge    = `<span class="badge" style="background:${badge.bg};color:${badge.color};font-size:var(--text-xs)">${esc(badge.label)}</span>`;
      const lockState   = cgGetVersionLockState(cgId, v.versionId);
      const lockBadge   = lockState.locked ? `<span class="badge" style="background:var(--text-muted);color:#fff;font-size:var(--text-xs)" title="${esc(lockState.message)}">🔒</span>` : '';
      const _lps = v.linkedProjects || (v.linkedProjectId ? [{ projectId: v.linkedProjectId }] : []);
      const linkedBadge = _lps.length > 0
        ? `<span class="badge" style="background:#0dcaf0;color:#000;font-size:var(--text-xs)">🔗 ${_lps.length} project${_lps.length > 1 ? 's' : ''}</span>` : '';
      const totals      = cgComputeGrandTotals(v);
      const fmt         = a => cgFmtCurrency(a, v.currency || '€');
      const dateRange   = [v.startDate && cgFmtDate(v.startDate), v.endDate && cgFmtDate(v.endDate)].filter(Boolean).join(' – ');
      return `
        <tr>
          <td class="ps-3" style="font-weight:500;font-size:var(--text-md)">${esc(v.versionLabel)}</td>
          <td class="text-muted" style="font-size:var(--text-base)">${new Date(v.createdAt).toLocaleDateString('en-US')}</td>
          <td>${sipBadge} ${lockBadge} ${linkedBadge}</td>
          <td class="text-muted" style="font-size:var(--text-base)">${dateRange}</td>
          <td class="text-end" style="font-size:var(--text-md)">${totals.hrs > 0 ? totals.hrs + 'h' : '—'}</td>
          <td class="text-end fw-semibold" style="font-size:var(--text-md)">${totals.fee > 0 ? fmt(totals.fee + totals.ptc) : '—'}</td>
          <td class="text-end">
            <div class="d-flex gap-1 justify-content-end">
              <button class="btn btn-sm btn-primary py-0 px-2 cg-open-ver-btn" data-verid="${esc(v.versionId)}" style="font-size:var(--text-sm)">Open</button>
              <button class="btn btn-sm btn-outline-danger py-0 px-2 cg-del-ver-btn" data-verid="${esc(v.versionId)}" data-verlabel="${esc(v.versionLabel)}" style="font-size:var(--text-sm)" title="Delete version">🗑</button>
            </div>
          </td>
        </tr>`;
    }).join('');

    card.innerHTML = `
      <div class="section-header d-flex justify-content-between align-items-center">
        <span class="fw-bold">📋 ${esc(cg.name)}</span>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-secondary py-0 px-2 cg-json-btn" style="font-size:var(--text-xs)">{ } JSON</button>
          <button class="btn btn-sm btn-outline-danger py-0 px-2 cg-delete-grid-btn" style="font-size:var(--text-sm)">🗑 Delete</button>
        </div>
      </div>
      <div class="table-responsive px-2 pb-2 pt-1">
        <table class="table table-sm align-middle mb-0" style="font-size:var(--text-md)">
          <thead style="background:var(--surface-light)">
            <tr>
              <th class="ps-3">Version</th><th>Date</th><th>Status</th>
              <th>Period</th><th class="text-end">Total hrs</th>
              <th class="text-end">Total</th><th></th>
            </tr>
          </thead>
          <tbody>${versionRows}</tbody>
        </table>
      </div>`;

    card.querySelectorAll('.cg-open-ver-btn').forEach(btn =>
      btn.addEventListener('click', () => showCostGridEditorView(cgId, btn.dataset.verid)));
    card.querySelectorAll('.cg-del-ver-btn').forEach(btn =>
      btn.addEventListener('click', () => cgConfirmDeleteVersion(cgId, btn.dataset.verid, btn.dataset.verlabel)));
    card.querySelector('.cg-delete-grid-btn').addEventListener('click', () => cgConfirmDeleteGrid(cgId, cg.name));
    card.querySelector('.cg-json-btn')?.addEventListener('click', () => {
      openJsonViewer(`Cost Grid — ${cg.name}`, cg,
        imported => { cgSave(imported); renderCostGridList(); },
        `costgrid_${cg.name.replace(/[^a-z0-9]/gi,'_')}.json`
      );
    });
    container.appendChild(card);
  });
}

function cgConfirmDeleteGrid(cgId, name) {
  const cg     = cgLoad(cgId);
  const hasSip = cg?.versions.some(v => (v.linkedProjects || []).length > 0 || v.linkedProjectId);
  const warn   = hasSip ? '\n\n⚠️ One or more versions have generated a project. The project will NOT be deleted.' : '';
  showConfirm(
    `Delete Cost Grid "${name}"?${warn}\n\nAll versions will be deleted.`,
    () => { cgDelete(cgId); renderPipelineBoard(); },
    null, '🗑 Delete Cost Grid'
  );
}

function cgConfirmDeleteVersion(cgId, versionId, versionLabel) {
  const cg = cgLoad(cgId);
  if (!cg) return;
  if (cg.versions.length <= 1) {
    alert('Cannot delete the only version of a Cost Grid. Delete the entire Cost Grid instead.');
    return;
  }
  const v = cg.versions.find(v => v.versionId === versionId);
  const warn = (v?.linkedProjects || []).length > 0 ? `\n\n⚠️ This version has ${(v.linkedProjects || []).length} linked project(s). The projects will NOT be deleted.` : '';
  showConfirm(
    `Delete version "${versionLabel}"?${warn}`,
    () => {
      cg.versions = cg.versions.filter(v => v.versionId !== versionId);
      cgSave(cg);
      renderPipelineBoard();
    },
    null, '🗑 Delete Version'
  );
}

// ── VERSION TABS ──────────────────────────────────────────────────────────────

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
    btn.addEventListener('click', () => {
      if (isActive) return;
      cgAutoSave();
      showCostGridEditorView(cg.id, v.versionId);
    });
    container.appendChild(btn);
  });
}

// ── EDITOR RENDER ─────────────────────────────────────────────────────────────
// Table columns (fixed, index 0–5):
//   0: Fase / Task  1: Descrizione  2: TOTAL COST and FEE  3: Pass-through Costs  4: Total hrs  5: Total fees
// Then role columns from index 6 onwards.

function renderCgEditor() {
  const v   = _cgDraft;
  const cur = v.currency || '€';
  const fmt = a => cgFmtCurrency(a, cur);

  const lockState  = cgGetVersionLockState(_cgActiveCgId, _cgActiveVersionId);
  const isLocked   = lockState.locked;

  // Show/hide Generate Project toolbar button
  const genBtn = document.getElementById('btnCgGenerateProject');
  if (genBtn) genBtn.style.display = isLocked ? 'none' : '';

  const lockBannerHtml = isLocked ? `
    <div class="alert mb-3 py-2 px-3 d-flex align-items-center gap-2"
         style="background:var(--color-warning-bg);border:1px solid #ffc107;border-radius:var(--radius-sm);font-size:var(--text-base)">
      <span>🔒</span>
      <span class="fw-semibold">${esc(lockState.message)}</span>
    </div>` : '';

  const colTotals = cgComputeColumnTotals(v);
  const grand     = cgComputeGrandTotals(v);

  // ── thead rows ────────────────────────────────────────────────────────────

  // Row: Total Hrs by Role (role cols only)
  const totalHrsCells = v.roles.map(r =>
    `<td style="text-align:center;background:var(--sand-200);font-weight:700;border:1px solid var(--sand-border);padding:5px 4px;font-size:var(--text-md)">${colTotals[r.roleCode]?.hrs || 0}</td>`
  ).join('');

  // Row: Total Fee by Role
  const totalFeeCells = v.roles.map(r =>
    `<td style="text-align:center;background:var(--sand-200);font-weight:700;border:1px solid var(--sand-border);padding:5px 4px;font-size:var(--text-base)">${colTotals[r.roleCode]?.fee > 0 ? fmt(colTotals[r.roleCode].fee) : '—'}</td>`
  ).join('');

  // Row: Grand totals + rates per role (editable, default from global roles)
  const rateCells = v.roles.map(r => {
    const zeroRate   = !r.rate || r.rate === 0;
    const globalRate = getRoles().find(gr => gr.code === r.roleCode)?.rate;
    const isCustom   = globalRate !== undefined && r.rate !== globalRate;
    const bg  = zeroRate ? '#fff0f0' : (isCustom ? '#fffbe6' : 'var(--sand-50)');
    const bdr = zeroRate ? '#f5c6cb' : (isCustom ? '#ffe58f' : 'var(--sand-border)');
    const col = zeroRate ? 'var(--color-danger)' : (isCustom ? 'var(--color-warning-text)' : '#555');
    const title = isCustom
      ? `Custom (default: ${cur} ${globalRate}/h) — clear to restore`
      : `Rate from roles registry`;
    return `<td style="text-align:center;background:${bg};border:1px solid ${bdr};padding:3px 4px;">
      <div style="font-size:var(--text-xs);color:#aaa;margin-bottom:1px">${cur}/h</div>
      <input type="number" class="cg-rate-input" data-role="${esc(r.roleCode)}" data-default="${globalRate ?? ''}" 
        value="${r.rate}" min="0" step="1" title="${esc(title)}"
        style="width:100%;border:1px solid ${bdr};border-radius:var(--radius-xs);text-align:center;font-size:var(--text-md);font-weight:${zeroRate||isCustom?'700':'400'};color:${col};background:transparent;padding:1px 4px">
      ${isCustom ? '<div style="font-size:var(--text-2xs);color:var(--color-warning-text);margin-top:2px">✎ custom</div>' : ''}
      ${zeroRate  ? '<div style="font-size:var(--text-2xs);color:var(--color-danger);margin-top:2px">⚠️ 0</div>' : ''}
    </td>`;
  }).join('');

  // Row: Column labels + role names + remove/change/duplicate buttons
  const roleHeaderCells = v.roles.map((r, rIdx) => {
    const zeroRate = !r.rate || r.rate === 0;
    const hdrBg    = zeroRate ? '#7f0b0b' : 'var(--brand-navy)';
    const zeroWarn = zeroRate ? '<div style="font-size:var(--text-xs);color:#ffb3b3;font-weight:400">⚠️ rate 0</div>' : '';
    const canL = rIdx > 0;
    const canR = rIdx < v.roles.length - 1;
    return `<th style="position:sticky;top:0;z-index:2;text-align:center;background:${hdrBg};color:#fff;border:1px solid #333;padding:8px 4px;min-width:100px;font-size:var(--text-base);font-weight:600;vertical-align:top">
       <div title="${esc(r.roleCode)}" style="cursor:default">${esc(r.roleLabel)}</div>
       ${zeroWarn}
       <div class="d-flex justify-content-center gap-2 mt-1">
         <button class="btn btn-link p-0 cg-move-role-btn" data-role="${esc(r.roleCode)}" data-dir="-1"
           style="color:${canL ? '#93c5fd' : '#444'};font-size:var(--text-sm);line-height:1" ${canL ? '' : 'disabled'} title="Move left">◀</button>
         <button class="btn btn-link p-0 cg-move-role-btn" data-role="${esc(r.roleCode)}" data-dir="1"
           style="color:${canR ? '#93c5fd' : '#444'};font-size:var(--text-sm);line-height:1" ${canR ? '' : 'disabled'} title="Move right">▶</button>
       </div>
       <div class="d-flex justify-content-center gap-1 mt-1 flex-wrap">
         <button class="btn btn-link p-0 cg-change-role-btn" data-role="${esc(r.roleCode)}" style="color:#93c5fd;font-size:var(--text-2xs);line-height:1.3" title="Replace this role with another">⇄ change</button>
         <button class="btn btn-link p-0 cg-dup-role-btn"    data-role="${esc(r.roleCode)}" style="color:#86efac;font-size:var(--text-2xs);line-height:1.3" title="Duplicate column with a different role">⊕ dup</button>
         <button class="btn btn-link p-0 cg-remove-role-btn" data-role="${esc(r.roleCode)}" style="color:#f8877a;font-size:var(--text-2xs);line-height:1.3" title="Remove column">✕ remove</button>
       </div>
     </th>`;
  }).join('');

  // ── phase / task body rows ─────────────────────────────────────────────────

  const _assignedTaskIds = cgGetAssignedTaskIds();

  const bodyRows = v.phases.map(phase => {
    const phTotals = cgComputePhaseTotals(phase, v.roles);

    const phRoleCells = v.roles.map(r => {
      const h = phTotals.byRole[r.roleCode] || 0;
      return `<td style="text-align:center;vertical-align:middle;background:var(--brand-mid);color:#c8d0ee;font-weight:600;border:1px solid var(--brand-dark);padding:6px 4px;font-size:var(--text-md)">${h > 0 ? h : ''}</td>`;
    }).join('');

    const phaseDates = phase.tasks.flatMap(t => [t.taskStartDate, t.taskEndDate]).filter(Boolean).sort();
    const phDateRange = phaseDates.length
      ? `<span style="font-size:var(--text-xs);color:#93c5fd;font-weight:400">${cgFmtMonth(phaseDates[0])} – ${cgFmtMonth(phaseDates[phaseDates.length-1])}</span>`
      : '';

    const taskRows = phase.tasks.map(task => {
      const tt = cgComputeTaskTotals(task, v.roles);

      const roleInputs = v.roles.map(r =>
        `<td style="border:1px solid var(--border-light);padding:2px 3px;text-align:center;vertical-align:middle">
           <input type="number" class="cg-hours-input form-control p-1"
             style="border:none;text-align:center;font-size:var(--text-md);background:transparent;min-width:70px;height:34px"
             data-phase="${esc(phase.phaseId)}" data-task="${esc(task.taskId)}" data-role="${esc(r.roleCode)}"
             value="${task.hours[r.roleCode] || ''}" min="0" step="0.5" placeholder="—">
         </td>`
      ).join('');

      const isAssigned = _assignedTaskIds.has(task.taskId);
      const isSelected = _cgSelectedTaskIds.has(task.taskId);
      const cbHtml = _cgSelectionMode
        ? `<div class="mb-1 d-flex align-items-center gap-1">
             <input type="checkbox" class="form-check-input cg-sel-task-cb"
               data-phase="${esc(phase.phaseId)}" data-task="${esc(task.taskId)}"
               ${isAssigned ? 'checked disabled' : (isSelected ? 'checked' : '')}
               style="${isAssigned ? 'opacity:.4' : ''}">
             ${isAssigned ? '<span style="font-size:var(--text-xs);color:var(--text-disabled)">already assigned</span>' : ''}
           </div>`
        : '';

      return `
        <tr class="cg-task-row" data-phase="${esc(phase.phaseId)}" data-task="${esc(task.taskId)}">
          <td style="padding:4px 6px;border:1px solid var(--border-light);min-width:200px;vertical-align:top">
            ${cbHtml}
            <div class="d-flex align-items-start gap-1">
              <textarea class="cg-task-name form-control" rows="2"
                style="border:none;font-size:var(--text-md);font-weight:700;background:transparent;flex:1;padding:3px 4px;resize:vertical;min-height:48px"
                placeholder="Task name"
                data-phase="${esc(phase.phaseId)}" data-task="${esc(task.taskId)}">${esc(task.taskName)}</textarea>
              <button class="btn btn-link p-0 cg-del-task-btn" data-phase="${esc(phase.phaseId)}" data-task="${esc(task.taskId)}"
                style="color:var(--color-danger);font-size:var(--text-xs);line-height:1;flex-shrink:0;margin-top:4px" title="Delete task">✕</button>
            </div>
            <div class="d-flex gap-2 mt-1 align-items-center">
              <div class="d-flex align-items-center gap-1">
                <span class="text-muted" style="font-size:var(--text-xs);white-space:nowrap">From</span>
                <input type="date" class="cg-task-start form-control form-control-sm p-1"
                  style="font-size:var(--text-xs);height:24px;border:1px solid var(--border-light);min-width:140px"
                  value="${task.taskStartDate || ''}"
                  data-phase="${esc(phase.phaseId)}" data-task="${esc(task.taskId)}">
              </div>
              <div class="d-flex align-items-center gap-1">
                <span class="text-muted" style="font-size:var(--text-xs);white-space:nowrap">To</span>
                <input type="date" class="cg-task-end form-control form-control-sm p-1"
                  style="font-size:var(--text-xs);height:24px;border:1px solid var(--border-light);min-width:140px"
                  value="${task.taskEndDate || ''}"
                  data-phase="${esc(phase.phaseId)}" data-task="${esc(task.taskId)}">
              </div>
            </div>
          </td>
          <td style="padding:4px 6px;border:1px solid var(--border-light);min-width:240px;vertical-align:top">
            <textarea class="cg-task-desc form-control" rows="3"
              style="border:none;font-size:var(--text-md);background:transparent;color:#555;padding:3px 4px;resize:vertical;min-height:72px"
              placeholder="Description…"
              data-phase="${esc(phase.phaseId)}" data-task="${esc(task.taskId)}">${esc(task.taskDescription || '')}</textarea>
          </td>
          <td class="cg-cell-cost" style="text-align:right;padding:6px 10px;border:1px solid var(--border-light);font-size:var(--text-md);white-space:nowrap;background:var(--sand-50);vertical-align:middle">
            ${tt.totalCostAndFee > 0 ? `<strong>${fmt(tt.totalCostAndFee)}</strong>` : '<span style="color:#bbb">—</span>'}
          </td>
          <td style="padding:3px 5px;border:1px solid var(--border-light);min-width:120px;vertical-align:middle">
            <input type="text" class="cg-ptc-input form-control"
              style="border:1px solid var(--border-light);font-size:var(--text-md);padding:4px 6px;height:32px;text-align:right"
              value="${task.ptc > 0 ? cgFmtCurrency(task.ptc, cur) : ''}" placeholder="—"
              data-phase="${esc(phase.phaseId)}" data-task="${esc(task.taskId)}">
          </td>
          <td class="cg-cell-hrs" style="text-align:right;padding:6px 10px;border:1px solid var(--border-light);font-size:var(--text-md);white-space:nowrap;background:var(--sand-50);vertical-align:middle">
            ${tt.totalHrs > 0 ? `<strong>${tt.totalHrs}h</strong>` : '<span style="color:#bbb">—</span>'}
          </td>
          <td class="cg-cell-fee" style="text-align:right;padding:6px 10px;border:1px solid var(--border-light);font-size:var(--text-md);white-space:nowrap;background:var(--sand-50);vertical-align:middle">
            ${tt.totalFee > 0 ? fmt(tt.totalFee) : '<span style="color:#bbb">—</span>'}
          </td>
          ${roleInputs}
        </tr>`;
    }).join('');

    return `
      <tr class="cg-phase-row" data-phase="${esc(phase.phaseId)}">
        <td style="padding:6px 8px;border:1px solid var(--brand-dark);background:var(--brand-navy);vertical-align:middle">
          <div class="d-flex align-items-center gap-1">
            <input type="text" class="cg-phase-name form-control"
              style="border:none;font-size:var(--text-lg);background:transparent;color:#fff;font-weight:700;flex:1;padding:2px 4px;height:32px"
              value="${esc(phase.phaseName)}" placeholder="Phase name"
              data-phase="${esc(phase.phaseId)}">
            <button class="btn btn-link p-0 cg-add-task-btn" data-phase="${esc(phase.phaseId)}" style="color:#93c5fd;font-size:var(--text-sm);white-space:nowrap" title="Add task">+ task</button>
            ${_cgSelectionMode ? `<button class="btn btn-link p-0 cg-sel-phase-btn" data-phase="${esc(phase.phaseId)}" style="color:#fcd34d;font-size:var(--text-xs);white-space:nowrap" title="Select all free tasks in this phase">☑ liberi</button>` : ''}
            <button class="btn btn-link p-0 cg-del-phase-btn" data-phase="${esc(phase.phaseId)}" style="color:#f8877a;font-size:var(--text-xs)" title="Delete phase">✕</button>
          </div>
        </td>
        <td style="background:var(--brand-navy);border:1px solid var(--brand-dark);padding:4px 8px;vertical-align:middle">${phDateRange}</td>
        <td style="text-align:right;padding:6px 10px;border:1px solid var(--brand-dark);font-weight:700;font-size:var(--text-md);white-space:nowrap;background:var(--brand-mid);color:#e2e8ff">
          ${(phTotals.fee + phTotals.ptc) > 0 ? fmt(phTotals.fee + phTotals.ptc) : '—'}
        </td>
        <td style="text-align:right;padding:6px 10px;border:1px solid var(--brand-dark);font-weight:600;font-size:var(--text-md);white-space:nowrap;background:var(--brand-mid);color:#e2e8ff">
          ${phTotals.ptc > 0 ? fmt(phTotals.ptc) : '—'}
        </td>
        <td style="text-align:right;padding:6px 10px;border:1px solid var(--brand-dark);font-weight:700;font-size:var(--text-md);white-space:nowrap;background:var(--brand-mid);color:#e2e8ff">
          ${phTotals.hrs > 0 ? phTotals.hrs + 'h' : '—'}
        </td>
        <td style="text-align:right;padding:6px 10px;border:1px solid var(--brand-dark);font-weight:600;font-size:var(--text-md);white-space:nowrap;background:var(--brand-mid);color:#e2e8ff">
          ${phTotals.fee > 0 ? fmt(phTotals.fee) : '—'}
        </td>
        ${phRoleCells}
      </tr>
      ${taskRows}
      <tr class="cg-add-task-row" data-phase="${esc(phase.phaseId)}">
        <td colspan="${6 + v.roles.length}" style="padding:3px 10px;border:1px solid var(--border-light);background:var(--surface-light)">
          <button class="btn btn-link btn-sm p-0 cg-add-task-btn" data-phase="${esc(phase.phaseId)}" style="font-size:var(--text-base);color:var(--text-muted)">+ add task</button>
        </td>
      </tr>`;
  }).join('');

  // ── Grand total footer ─────────────────────────────────────────────────────

  const footRoleCells = v.roles.map(r =>
    `<td style="text-align:center;font-weight:700;padding:7px 4px;border:1px solid #c0c8e8;border-top:2px solid var(--indigo-500);background:var(--sand-50);font-size:var(--text-md)">
       ${(colTotals[r.roleCode]?.hrs || 0) > 0 ? colTotals[r.roleCode].hrs : ''}
     </td>`
  ).join('');

  // ── Assemble HTML ──────────────────────────────────────────────────────────

  const noRolesHint = v.roles.length === 0
    ? `<tr><td colspan="6" class="text-center text-muted py-2" style="font-size:var(--text-base);border:1px solid var(--border-light)">
         No roles added yet. Click <strong>👥 + Add role</strong> to add role columns.
       </td></tr>`
    : '';

  // ── Linked Projects panel ──────────────────────────────────────────────────
  const linkedProjects = _cgDraft.linkedProjects || [];
  let linkedProjectsHtml = '';
  if (linkedProjects.length > 0) {
    const pipeline = _cgDraft.pipeline || 'SIP';
    const style    = cgPipelineStyle(pipeline);
    const badges = linkedProjects.map(lp => {
      // Look up by stored ID first; fall back to costGridRef in case the user
      // renamed the project ID in the config form after generation.
      let proj = (config.projects || []).find(p => p.id === lp.projectId);
      if (!proj) {
        proj = (config.projects || []).find(p =>
          p.costGridRef?.cgId === _cgActiveCgId && p.costGridRef?.versionId === _cgActiveVersionId
        );
      }
      const currentProjId = proj?.id || lp.projectId;
      const pname   = lp.projectName || proj?.name || lp.projectId;
      const taskCnt = (lp.taskIds || []).length;
      const isSip   = pipeline === 'SIP';
      const btnTitle = !proj
        ? 'Remove link (project not found in portfolio)'
        : (isSip ? 'Delete project (SIP) and remove link' : 'Remove link only (project is not SIP and will not be deleted)');
      return `<div class="d-flex align-items-center gap-1 border rounded px-2 py-1" style="font-size:var(--text-base);background:var(--surface-light)">
        <span class="fw-semibold">${esc(pname)}</span>
        <span class="text-muted" style="font-size:var(--text-xs)">&nbsp;${taskCnt} task</span>
        <span style="background:${style.bg};color:${style.color};border-radius:var(--radius-xs);padding:1px 6px;font-size:var(--text-xs);font-weight:600">${esc(pipeline)}</span>
        ${proj ? `<button class="btn btn-sm btn-outline-primary py-0 px-2 cg-open-project-btn" data-projid="${esc(currentProjId)}"
          style="font-size:var(--text-xs)">Reporting</button>` : ''}
        <button class="btn btn-link p-0 ms-1 cg-del-linked-btn" data-projid="${esc(lp.projectId)}"
          style="color:var(--color-danger);font-size:var(--text-sm);line-height:1"
          title="${esc(btnTitle)}">🗑</button>
      </div>`;
    }).join('');
    linkedProjectsHtml = `
      <div class="mt-3 pt-2 border-top">
        <div class="small fw-semibold text-muted mb-2">🔗 Generated projects (${linkedProjects.length})</div>
        <div class="d-flex flex-wrap gap-2">${badges}</div>
      </div>`;
  }

  // ── Selection bar (sticky bottom, shown only in selection mode) ────────────
  const selBarHtml = _cgSelectionMode ? `
    <div id="cgSelectionBar" style="position:sticky;bottom:0;left:0;right:0;z-index:100;background:var(--brand-navy);color:#fff;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;border-top:3px solid var(--indigo-500)">
      <div class="d-flex align-items-center gap-3">
        <span style="font-size:var(--text-md)"><strong id="cgSelCount">${_cgSelectedTaskIds.size}</strong> tasks selected</span>
        <button class="btn btn-sm btn-outline-light py-0 px-2" id="btnCgSelectAll" style="font-size:var(--text-sm)">☑ All free tasks</button>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-sm btn-outline-secondary py-0 px-3" id="btnCgCancelSel" style="font-size:var(--text-base)">Cancel</button>
        <button class="btn btn-sm btn-success py-0 px-3" id="btnCgConfirmSel" style="font-size:var(--text-base)">▶ Create project</button>
      </div>
    </div>` : '';

  const offerIcon = _cgOfferDetailsCollapsed ? '▶' : '▼';
  const offerSummary = _cgOfferDetailsCollapsed
    ? `<span class="text-muted ms-3" style="font-size:var(--text-base);font-weight:400">${esc(v.projectName || '')}${v.startDate ? '  ·  ' + v.startDate.slice(0,4)+'/'+v.startDate.slice(4,6) : ''}${v.endDate ? ' – ' + v.endDate.slice(0,4)+'/'+v.endDate.slice(4,6) : ''}  ·  ${esc(v.currency || '€')}</span>`
    : '';

  const body = document.getElementById('cgEditorBody');
  body.innerHTML = `
    ${lockBannerHtml}
    <!-- Header form -->
    <div class="section-card mb-3">
      <div class="section-header d-flex align-items-center" id="cgOfferDetailsHeader" style="cursor:pointer;user-select:none">
        <span style="font-size:var(--text-sm);margin-right:6px;color:var(--text-muted)">${offerIcon}</span>
        <span>📄 Offer details</span>
        ${offerSummary}
      </div>
      <div id="cgOfferDetailsBody" class="p-3" style="${_cgOfferDetailsCollapsed ? 'display:none' : ''}">
        <div class="row g-2 align-items-end mb-2">
          <div class="col-md-4">
            <label class="form-label small fw-semibold mb-1">Project name</label>
            <input type="text" class="form-control" id="cgProjectName" value="${esc(v.projectName || '')}" placeholder="Project name">
          </div>
          <div class="col-md-2">
            <label class="form-label small fw-semibold mb-1">Start</label>
            <input type="month" class="form-control" id="cgStartDate" value="${v.startDate ? v.startDate.slice(0,4)+'-'+v.startDate.slice(4,6) : ''}">
          </div>
          <div class="col-md-2">
            <label class="form-label small fw-semibold mb-1">End</label>
            <input type="month" class="form-control" id="cgEndDate" value="${v.endDate ? v.endDate.slice(0,4)+'-'+v.endDate.slice(4,6) : ''}">
          </div>
          <div class="col-md-2">
            <label class="form-label small fw-semibold mb-1">Currency</label>
            <select class="form-select" id="cgCurrency">
              <option value="€"   ${v.currency==='€'  ?'selected':''}>€ EUR</option>
              <option value="$"   ${v.currency==='$'  ?'selected':''}>$ USD</option>
              <option value="£"   ${v.currency==='£'  ?'selected':''}>£ GBP</option>
              <option value="CHF" ${v.currency==='CHF'?'selected':''}>CHF</option>
            </select>
          </div>
          <div class="col-md-2">
            <label class="form-label small fw-semibold mb-1">Pipeline stage</label>
            <select class="form-select" id="cgPipeline">
              ${['SIP','Expected','Anticipated','Committed','Canceled']
                .map(p => `<option value="${p}"${(v.pipeline||'SIP')===p?' selected':''}>${p}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="row g-2 mt-1 align-items-end">
          <div class="col-md-6">
            <label class="form-label small fw-semibold mb-1">Client</label>
            <div class="d-flex gap-2">
              <select class="form-select form-select-sm" id="cgClientId">
                ${getClients().map(c => `<option value="${esc(c.id)}"${c.id === (v.clientId || '__unassigned__') ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
              </select>
              <button type="button" class="btn btn-outline-secondary btn-sm flex-shrink-0" onclick="showClientsModal()" style="white-space:nowrap">+ New</button>
            </div>
          </div>
        </div>
        <div class="row g-2">
          <div class="col-12">
            <label class="form-label small fw-semibold mb-1">Notes</label>
            <textarea class="form-control" id="cgNote" rows="3" placeholder="Notes, conditions, scope of work…">${esc(v.note || '')}</textarea>
          </div>
        </div>
        ${linkedProjectsHtml}
      </div>
    </div>

    <!-- Grid -->
    <div class="section-card">
      <div class="section-header d-flex justify-content-between align-items-center">
        <span>📊 Cost Grid</span>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-secondary py-0 px-2" id="btnCgAddFigura" style="font-size:var(--text-base)">👥 + Add role</button>
          <button class="btn btn-sm btn-outline-secondary py-0 px-2" id="btnCgAddPhase" style="font-size:var(--text-base)">+ Add phase</button>
        </div>
      </div>
      <div style="overflow:auto;max-height:calc(100vh - 300px)">
        <table class="table mb-0" id="cgGridTable" style="min-width:700px;border-collapse:collapse">
          <thead>
            <!-- Row: Summary toggle -->
            <tr id="cgSummaryToggleRow" style="background:var(--sand-200);cursor:pointer;user-select:none" title="${_cgSummaryCollapsed ? 'Expand summary' : 'Collapse summary'}">
              <td colspan="${6 + v.roles.length}" style="padding:3px 12px;border:1px solid var(--sand-border);font-size:var(--text-sm);color:#888;font-weight:600">
                <span style="font-size:var(--text-xs);margin-right:4px">${_cgSummaryCollapsed ? '▶' : '▼'}</span>
                ${_cgSummaryCollapsed ? 'Summary (click to expand)' : 'Summary (click to collapse)'}
              </td>
            </tr>
            <!-- Row: Total Hrs by Role -->
            <tr data-summary="hrs" style="background:var(--sand-200);${_cgSummaryCollapsed ? 'display:none' : ''}">
              <td colspan="6" style="padding:5px 12px;border:1px solid var(--sand-border);font-weight:700;font-size:var(--text-base);color:#444">Total Hrs by Role</td>
              ${totalHrsCells}
            </tr>
            <!-- Row: Total Fee by Role -->
            <tr data-summary="fee" style="background:var(--sand-200);${_cgSummaryCollapsed ? 'display:none' : ''}">
              <td colspan="6" style="padding:5px 12px;border:1px solid var(--sand-border);font-weight:700;font-size:var(--text-base);color:#444">Total Fee by Role</td>
              ${totalFeeCells}
            </tr>
            <!-- Row: Grand totals + rates per role -->
            <tr data-summary="grand" style="background:var(--sand-100);${_cgSummaryCollapsed ? 'display:none' : ''}">
              <td style="padding:6px 12px;border:1px solid var(--sand-border);vertical-align:middle">
                <span style="background:var(--brand-navy);color:#fff;border-radius:var(--radius-xs);padding:3px 10px;font-size:var(--text-base);font-weight:700;letter-spacing:.04em">${esc(cur)}</span>
              </td>
              <td style="border:1px solid var(--sand-border)"></td>
              <td style="text-align:right;padding:6px 10px;border:1px solid var(--sand-border);font-weight:700;font-size:var(--text-lg);white-space:nowrap">
                <strong>${fmt(grand.fee + grand.ptc)}</strong>
              </td>
              <td style="text-align:right;padding:6px 10px;border:1px solid var(--sand-border);font-size:var(--text-md);white-space:nowrap">
                ${grand.ptc > 0 ? fmt(grand.ptc) : '—'}
              </td>
              <td style="text-align:right;padding:6px 10px;border:1px solid var(--sand-border);font-weight:700;font-size:var(--text-lg);white-space:nowrap">
                ${grand.hrs > 0 ? grand.hrs + 'h' : '—'}
              </td>
              <td style="text-align:right;padding:6px 10px;border:1px solid var(--sand-border);font-size:var(--text-md);white-space:nowrap">
                ${grand.fee > 0 ? fmt(grand.fee) : '—'}
              </td>
              ${rateCells}
            </tr>
            <!-- Row: Column labels + role names -->
            <tr style="background:var(--brand-navy)">
              <th style="position:sticky;top:0;left:0;z-index:4;background:var(--brand-navy);color:#fff;border:1px solid #333;padding:8px 12px;min-width:200px;font-size:var(--text-md)">Phase / Task</th>
              <th style="position:sticky;top:0;z-index:2;background:var(--brand-navy);color:#fff;border:1px solid #333;padding:8px 12px;min-width:240px;font-size:var(--text-md)">Description</th>
              <th style="position:sticky;top:0;z-index:2;background:var(--brand-navy);color:#fff;border:1px solid #333;padding:8px 10px;min-width:130px;text-align:right;font-size:var(--text-base)">TOTAL COST<br>and FEE</th>
              <th style="position:sticky;top:0;z-index:2;background:var(--brand-navy);color:#fff;border:1px solid #333;padding:8px 10px;min-width:115px;text-align:right;font-size:var(--text-base)">Total Pass<br>through Costs</th>
              <th style="position:sticky;top:0;z-index:2;background:var(--brand-navy);color:#fff;border:1px solid #333;padding:8px 10px;min-width:75px;text-align:right;font-size:var(--text-base)">Total<br>hrs</th>
              <th style="position:sticky;top:0;z-index:2;background:var(--brand-navy);color:#fff;border:1px solid #333;padding:8px 10px;min-width:120px;text-align:right;font-size:var(--text-base)">Total<br>fees</th>
              ${roleHeaderCells}
            </tr>
          </thead>
          <tbody id="cgGridBody">
            ${noRolesHint}
            ${bodyRows}
          </tbody>
          <tfoot>
            <tr style="background:var(--indigo-50)">
              <td style="position:sticky;left:0;z-index:3;background:var(--indigo-50);font-weight:700;padding:7px 12px;border:1px solid #c0c8e8;border-top:2px solid var(--indigo-500);font-size:var(--text-md)">TOTAL</td>
              <td style="border:1px solid #c0c8e8;border-top:2px solid var(--indigo-500);background:var(--indigo-50)"></td>
              <td style="text-align:right;font-weight:700;padding:7px 10px;border:1px solid #c0c8e8;border-top:2px solid var(--indigo-500);background:var(--sand-100);font-size:var(--text-lg);white-space:nowrap">
                <strong>${fmt(grand.fee + grand.ptc)}</strong>
              </td>
              <td style="text-align:right;padding:7px 10px;border:1px solid #c0c8e8;border-top:2px solid var(--indigo-500);background:var(--sand-100);font-size:var(--text-md);white-space:nowrap">
                ${grand.ptc > 0 ? fmt(grand.ptc) : '—'}
              </td>
              <td style="text-align:right;font-weight:700;padding:7px 10px;border:1px solid #c0c8e8;border-top:2px solid var(--indigo-500);background:var(--sand-100);font-size:var(--text-lg);white-space:nowrap">
                ${grand.hrs > 0 ? grand.hrs + 'h' : '—'}
              </td>
              <td style="text-align:right;padding:7px 10px;border:1px solid #c0c8e8;border-top:2px solid var(--indigo-500);background:var(--sand-100);font-size:var(--text-md);white-space:nowrap">
                ${grand.fee > 0 ? fmt(grand.fee) : '—'}
              </td>
              ${footRoleCells}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
    ${selBarHtml}`;

  cgBindEditorEvents(body);
  if (isLocked) cgApplyEditorLock(body);
}

function cgApplyEditorLock(body) {
  body.querySelectorAll('input, textarea, select').forEach(el => { el.disabled = true; });
  ['.cg-add-task-btn', '.cg-del-task-btn', '.cg-del-phase-btn',
   '.cg-remove-role-btn', '.cg-move-role-btn', '.cg-sel-phase-btn',
   '.cg-del-linked-btn', '#btnCgAddFigura', '#btnCgAddPhase',
   '#btnCgSelectAll', '#btnCgConfirmSel', '#btnCgCancelSel'
  ].forEach(sel => body.querySelectorAll(sel).forEach(el => { el.style.display = 'none'; }));
}

// ── EDITOR EVENT BINDING ──────────────────────────────────────────────────────

function cgBindEditorEvents(body) {
  // Offer details collapse toggle
  body.querySelector('#cgOfferDetailsHeader')?.addEventListener('click', () => {
    _cgOfferDetailsCollapsed = !_cgOfferDetailsCollapsed;
    const panel = body.querySelector('#cgOfferDetailsBody');
    const icon  = body.querySelector('#cgOfferDetailsHeader > span:first-child');
    if (panel) panel.style.display = _cgOfferDetailsCollapsed ? 'none' : '';
    if (icon)  icon.textContent    = _cgOfferDetailsCollapsed ? '▶' : '▼';
    // Update inline summary text
    const v = _cgDraft;
    const existingSummary = body.querySelector('#cgOfferDetailsHeader .text-muted');
    if (_cgOfferDetailsCollapsed) {
      if (!existingSummary) {
        const span = document.createElement('span');
        span.className = 'text-muted ms-3';
        span.style.cssText = 'font-size:var(--text-base);font-weight:400';
        span.textContent = `${v.projectName || ''}${v.startDate ? '  ·  ' + v.startDate.slice(0,4)+'/'+v.startDate.slice(4,6) : ''}${v.endDate ? ' – ' + v.endDate.slice(0,4)+'/'+v.endDate.slice(4,6) : ''}  ·  ${v.currency || '€'}`;
        body.querySelector('#cgOfferDetailsHeader').appendChild(span);
      }
    } else {
      existingSummary?.remove();
    }
  });

  // Summary rows collapse toggle
  body.querySelector('#cgSummaryToggleRow')?.addEventListener('click', () => {
    _cgSummaryCollapsed = !_cgSummaryCollapsed;
    const rows = body.querySelectorAll('[data-summary="hrs"],[data-summary="fee"],[data-summary="grand"]');
    rows.forEach(r => { r.style.display = _cgSummaryCollapsed ? 'none' : ''; });
    const toggleRow = body.querySelector('#cgSummaryToggleRow');
    if (toggleRow) {
      toggleRow.title = _cgSummaryCollapsed ? 'Expand summary' : 'Collapse summary';
      toggleRow.querySelector('td').innerHTML =
        `<span style="font-size:var(--text-xs);margin-right:4px">${_cgSummaryCollapsed ? '▶' : '▼'}</span>${_cgSummaryCollapsed ? 'Summary (click to expand)' : 'Summary (click to collapse)'}`;
    }
  });

  body.querySelectorAll('.cg-phase-name').forEach(inp =>
    inp.addEventListener('change', e => {
      const ph = _cgDraft.phases.find(p => p.phaseId === e.target.dataset.phase);
      if (ph) { ph.phaseName = e.target.value; cgScheduleAutoSave(); }
    })
  );

  body.querySelectorAll('.cg-task-name').forEach(inp =>
    inp.addEventListener('change', e => {
      const task = cgFindTask(e.target.dataset.phase, e.target.dataset.task);
      if (task) { task.taskName = e.target.value; cgScheduleAutoSave(); }
    })
  );

  body.querySelectorAll('.cg-task-desc').forEach(inp =>
    inp.addEventListener('change', e => {
      const task = cgFindTask(e.target.dataset.phase, e.target.dataset.task);
      if (task) { task.taskDescription = e.target.value; cgScheduleAutoSave(); }
    })
  );

  body.querySelectorAll('.cg-hours-input').forEach(inp =>
    inp.addEventListener('input', e => {
      const task = cgFindTask(e.target.dataset.phase, e.target.dataset.task);
      if (!task) return;
      const val = parseFloat(e.target.value) || 0;
      if (val > 0) task.hours[e.target.dataset.role] = val;
      else delete task.hours[e.target.dataset.role];
      cgRefreshTotals(); cgScheduleAutoSave();
    })
  );

  body.querySelectorAll('.cg-ptc-input').forEach(inp => {
    inp.addEventListener('focus', e => {
      const task = cgFindTask(e.target.dataset.phase, e.target.dataset.task);
      if (task) e.target.value = task.ptc > 0 ? task.ptc : '';
    });
    inp.addEventListener('input', e => {
      const task = cgFindTask(e.target.dataset.phase, e.target.dataset.task);
      if (task) { task.ptc = parseFloat(e.target.value) || 0; cgRefreshTotals(); cgScheduleAutoSave(); }
    });
    inp.addEventListener('blur', e => {
      const task = cgFindTask(e.target.dataset.phase, e.target.dataset.task);
      if (task) e.target.value = task.ptc > 0 ? cgFmtCurrency(task.ptc, _cgDraft.currency || '€') : '';
    });
  });

  body.querySelectorAll('.cg-task-start').forEach(inp =>
    inp.addEventListener('change', e => {
      const task = cgFindTask(e.target.dataset.phase, e.target.dataset.task);
      if (task) { task.taskStartDate = e.target.value; cgRefreshPhaseDates(); cgScheduleAutoSave(); }
    })
  );

  body.querySelectorAll('.cg-task-end').forEach(inp =>
    inp.addEventListener('change', e => {
      const task = cgFindTask(e.target.dataset.phase, e.target.dataset.task);
      if (task) { task.taskEndDate = e.target.value; cgRefreshPhaseDates(); cgScheduleAutoSave(); }
    })
  );

  body.querySelectorAll('.cg-rate-input').forEach(inp =>
    inp.addEventListener('change', e => {
      const code = e.target.dataset.role;
      const role = _cgDraft.roles.find(r => r.roleCode === code);
      if (!role) return;
      const val = e.target.value.trim();
      if (val === '') {
        role.rate = parseFloat(e.target.dataset.default) || 0;
      } else {
        role.rate = parseFloat(val) || 0;
      }
      renderCgEditor();
    })
  );

  body.querySelectorAll('.cg-move-role-btn').forEach(btn =>
    btn.addEventListener('click', e => {
      const code = e.currentTarget.dataset.role;
      const dir  = parseInt(e.currentTarget.dataset.dir);
      const idx  = _cgDraft.roles.findIndex(r => r.roleCode === code);
      const newIdx = idx + dir;
      if (idx < 0 || newIdx < 0 || newIdx >= _cgDraft.roles.length) return;
      const roles = _cgDraft.roles;
      [roles[idx], roles[newIdx]] = [roles[newIdx], roles[idx]];
      renderCgEditor();
    })
  );

  body.querySelector('#btnCgAddPhase')?.addEventListener('click', () => {
    _cgDraft.phases.push({ phaseId: cgNewPhId(), phaseName: 'New phase', tasks: [] });
    renderCgEditor();
  });

  body.querySelectorAll('.cg-add-task-btn').forEach(btn =>
    btn.addEventListener('click', e => {
      const phaseId = e.currentTarget.dataset.phase;
      const ph = _cgDraft.phases.find(p => p.phaseId === phaseId);
      if (ph) { ph.tasks.push({ taskId: cgNewTkId(), taskName: '', taskDescription: '', ptc: 0, taskStartDate: '', taskEndDate: '', hours: {} }); renderCgEditor(); }
    })
  );

  body.querySelectorAll('.cg-del-phase-btn').forEach(btn =>
    btn.addEventListener('click', e => {
      const phaseId = e.currentTarget.dataset.phase;
      const ph = _cgDraft.phases.find(p => p.phaseId === phaseId);
      if (!ph) return;
      showConfirm(`Delete phase "${ph.phaseName}" and all its tasks?`, () => {
        _cgDraft.phases = _cgDraft.phases.filter(p => p.phaseId !== phaseId);
        renderCgEditor();
      }, null, '✕ Delete phase');
    })
  );

  body.querySelectorAll('.cg-del-task-btn').forEach(btn =>
    btn.addEventListener('click', e => {
      const phaseId = e.currentTarget.dataset.phase;
      const taskId  = e.currentTarget.dataset.task;
      const ph = _cgDraft.phases.find(p => p.phaseId === phaseId);
      if (!ph) return;
      const task = ph.tasks.find(t => t.taskId === taskId);
      showConfirm(`Delete task "${task?.taskName || 'this task'}"?`, () => {
        ph.tasks = ph.tasks.filter(t => t.taskId !== taskId);
        renderCgEditor();
      }, null, '✕ Delete task');
    })
  );

  body.querySelector('#btnCgAddFigura')?.addEventListener('click', () => openCgRoleSelectModal('add', null));

  body.querySelectorAll('.cg-change-role-btn').forEach(btn =>
    btn.addEventListener('click', e => openCgRoleSelectModal('change', e.currentTarget.dataset.role))
  );

  body.querySelectorAll('.cg-dup-role-btn').forEach(btn =>
    btn.addEventListener('click', e => openCgRoleSelectModal('duplicate', e.currentTarget.dataset.role))
  );

  body.querySelectorAll('.cg-remove-role-btn').forEach(btn =>
    btn.addEventListener('click', e => {
      const code  = e.currentTarget.dataset.role;
      const label = _cgDraft.roles.find(r => r.roleCode === code)?.roleLabel || code;
      showConfirm(`Remove column "${label}"?\n\nHours entered for this role will be deleted.`, () => {
        _cgDraft.roles = _cgDraft.roles.filter(r => r.roleCode !== code);
        _cgDraft.phases.forEach(ph => ph.tasks.forEach(t => delete t.hours[code]));
        renderCgEditor();
      }, null, '✕ Remove column');
    })
  );

  // Selection mode events
  body.querySelectorAll('.cg-sel-task-cb').forEach(cb =>
    cb.addEventListener('change', e => {
      const taskId = e.target.dataset.task;
      if (e.target.checked) _cgSelectedTaskIds.add(taskId);
      else _cgSelectedTaskIds.delete(taskId);
      const counter = document.getElementById('cgSelCount');
      if (counter) counter.textContent = _cgSelectedTaskIds.size;
    })
  );

  body.querySelectorAll('.cg-sel-phase-btn').forEach(btn =>
    btn.addEventListener('click', e => {
      const phaseId = e.currentTarget.dataset.phase;
      const ph = _cgDraft.phases.find(p => p.phaseId === phaseId);
      if (!ph) return;
      const assignedIds = cgGetAssignedTaskIds();
      ph.tasks.forEach(task => {
        if (!assignedIds.has(task.taskId)) {
          _cgSelectedTaskIds.add(task.taskId);
          const cb = body.querySelector(`.cg-sel-task-cb[data-task="${task.taskId}"]`);
          if (cb) cb.checked = true;
        }
      });
      const counter = document.getElementById('cgSelCount');
      if (counter) counter.textContent = _cgSelectedTaskIds.size;
    })
  );

  body.querySelector('#btnCgSelectAll')?.addEventListener('click', () => {
    body.querySelectorAll('.cg-sel-task-cb:not(:disabled)').forEach(cb => {
      cb.checked = true;
      _cgSelectedTaskIds.add(cb.dataset.task);
    });
    const counter = document.getElementById('cgSelCount');
    if (counter) counter.textContent = _cgSelectedTaskIds.size;
  });

  body.querySelector('#btnCgCancelSel')?.addEventListener('click', cgExitSelectionMode);
  body.querySelector('#btnCgConfirmSel')?.addEventListener('click', cgConfirmAndGenerate);

  body.querySelectorAll('.cg-del-linked-btn').forEach(btn =>
    btn.addEventListener('click', e => cgDeleteLinkedProject(e.currentTarget.dataset.projid))
  );

  body.querySelectorAll('.cg-open-project-btn').forEach(btn =>
    btn.addEventListener('click', e => {
      cgAutoSave();
      showDashboardView(e.currentTarget.dataset.projid);
    })
  );

  // Currency triggers full re-render (affects all formatted values)
  document.getElementById('cgCurrency')?.addEventListener('change', () => {
    cgSyncHeaderFromForm();
    renderCgEditor();
  });

  // Pipeline change: re-render linked projects panel + propagate to config
  document.getElementById('cgPipeline')?.addEventListener('change', () => {
    cgSyncHeaderFromForm();
    cgPropagatePipelineToProjects();
    const cg = cgLoad(_cgActiveCgId);
    if (cg) renderCgVersionTabs(cg);
    renderCgEditor();
  });

  ['cgProjectName','cgStartDate','cgEndDate','cgNote','cgClientId'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => cgSyncHeaderFromForm());
  });
}

function cgSyncHeaderFromForm() {
  if (!_cgDraft) return;
  _cgDraft.projectName = document.getElementById('cgProjectName')?.value.trim() || '';
  const sd = document.getElementById('cgStartDate')?.value;
  const ed = document.getElementById('cgEndDate')?.value;
  _cgDraft.startDate   = sd ? sd.replace('-','') : '';
  _cgDraft.endDate     = ed ? ed.replace('-','') : '';
  _cgDraft.currency    = document.getElementById('cgCurrency')?.value || '€';
  _cgDraft.pipeline    = document.getElementById('cgPipeline')?.value || 'SIP';
  _cgDraft.note        = document.getElementById('cgNote')?.value.trim() || '';
  _cgDraft.clientId    = document.getElementById('cgClientId')?.value || '__unassigned__';
}

// Propagates the costgrid version's pipeline to all linked config.projects.
function cgPropagatePipelineToProjects() {
  if (!_cgDraft) return;
  const pipeline = _cgDraft.pipeline || 'SIP';
  let changed = false;
  (_cgDraft.linkedProjects || []).forEach(lp => {
    const proj = (config.projects || []).find(p => p.id === lp.projectId);
    if (proj && proj.pipeline !== pipeline) {
      proj.pipeline = pipeline;
      changed = true;
    }
  });
  if (changed) persistConfig();
}

// ── ROLE SELECT MODAL ─────────────────────────────────────────────────────────

let _cgRoleAllRoles    = [];
let _cgRoleCurrentCodes = new Set();
let _cgRoleActiveTeam  = null;
let _cgRoleSearch      = '';

function openCgRoleSelectModal(mode, sourceRoleCode) {
  _cgRoleModalMode       = mode || 'add';
  _cgRoleModalSourceCode = sourceRoleCode || null;
  _cgRoleAllRoles        = getRoles();
  _cgRoleActiveTeam      = null;
  _cgRoleSearch          = '';

  // In 'change' mode exclude source from "already added" so it's selectable as target too
  // (user could pick same role — we just prevent picking codes already in the grid except source)
  const currentCodes = new Set(_cgDraft.roles.map(r => r.roleCode));
  if (_cgRoleModalMode === 'change' && _cgRoleModalSourceCode) currentCodes.delete(_cgRoleModalSourceCode);
  _cgRoleCurrentCodes = currentCodes;

  // Update modal title + hint
  const titleEl = document.querySelector('#cgRoleSelectModal .modal-title');
  const hintEl  = document.querySelector('#cgRoleSelectModal .small.text-muted.mb-2');
  if (titleEl) {
    titleEl.textContent = _cgRoleModalMode === 'change'    ? '⇄ Change role'
                        : _cgRoleModalMode === 'duplicate' ? '⊕ Duplicate column'
                        : '👥 Add roles';
  }
  if (hintEl) {
    hintEl.textContent = _cgRoleModalMode === 'add'
      ? 'Roles already added are disabled.'
      : 'Select a single role. Roles already in the grid are disabled.';
  }

  const emptyEl  = document.getElementById('cgRoleSelectEmpty');
  const searchEl = document.getElementById('cgRoleSearch');
  const teamsEl  = document.getElementById('cgRoleTeamFilters');

  searchEl.value = '';
  searchEl.oninput = () => { _cgRoleSearch = searchEl.value.trim().toLowerCase(); cgRenderRoleList(); };

  if (!_cgRoleAllRoles.length) {
    document.getElementById('cgRoleSelectList').innerHTML = '';
    emptyEl.classList.remove('d-none');
    teamsEl.innerHTML = '';
  } else {
    emptyEl.classList.add('d-none');

    const teams = [...new Set(_cgRoleAllRoles.map(r =>
      r.code.indexOf(' - ') > 0 ? r.code.slice(0, r.code.indexOf(' - ')).trim() : '—'
    ))].sort();

    teamsEl.innerHTML = ['All', ...teams].map((t, i) =>
      `<button class="btn btn-sm ${i === 0 ? 'btn-primary' : 'btn-outline-secondary'} cg-team-filter-btn py-0 px-2" style="font-size:var(--text-sm)" data-team="${i === 0 ? '' : esc(t)}">${esc(t)}</button>`
    ).join('');

    teamsEl.querySelectorAll('.cg-team-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _cgRoleActiveTeam = btn.dataset.team || null;
        teamsEl.querySelectorAll('.cg-team-filter-btn').forEach(b =>
          b.className = 'btn btn-sm btn-outline-secondary cg-team-filter-btn py-0 px-2'
        );
        btn.className = 'btn btn-sm btn-primary cg-team-filter-btn py-0 px-2';
        cgRenderRoleList();
      });
    });

    cgRenderRoleList();
  }

  bootstrap.Modal.getOrCreateInstance(document.getElementById('cgRoleSelectModal')).show();
  setTimeout(() => searchEl.focus(), 300);
}

function cgRenderRoleList() {
  const listEl = document.getElementById('cgRoleSelectList');

  let filtered = _cgRoleAllRoles;
  if (_cgRoleActiveTeam) {
    filtered = filtered.filter(r => {
      const team = r.code.indexOf(' - ') > 0 ? r.code.slice(0, r.code.indexOf(' - ')).trim() : '—';
      return team === _cgRoleActiveTeam;
    });
  }
  if (_cgRoleSearch) {
    filtered = filtered.filter(r =>
      r.label.toLowerCase().includes(_cgRoleSearch) || r.code.toLowerCase().includes(_cgRoleSearch)
    );
  }

  if (!filtered.length) {
    listEl.innerHTML = '<div class="text-muted small text-center py-3">No results.</div>';
    return;
  }

  const groups = {};
  filtered.forEach(r => {
    const team = r.code.indexOf(' - ') > 0 ? r.code.slice(0, r.code.indexOf(' - ')).trim() : '—';
    if (!groups[team]) groups[team] = [];
    groups[team].push(r);
  });

  listEl.innerHTML = Object.entries(groups).sort(([a],[b]) => a.localeCompare(b)).map(([team, teamRoles]) => `
    <div class="mb-2">
      <div style="font-size:var(--text-xs);font-weight:700;color:var(--indigo-500);text-transform:uppercase;letter-spacing:.04em;padding:2px 0 4px">${esc(team)}</div>
      ${teamRoles.sort((a,b) => a.label.localeCompare(b.label)).map(r => {
        const already   = _cgRoleCurrentCodes.has(r.code);
        const zeroRate  = !r.rate || r.rate === 0;
        const rateBadge = zeroRate
          ? `<span class="ms-1 badge" style="background:#fff0f0;color:var(--color-danger);font-size:var(--text-xs)">⚠️ 0/h</span>`
          : `<span class="ms-1 badge" style="background:var(--sand-50);color:#666;font-size:var(--text-xs)">${r.rate} €/h</span>`;
        const isSingleMode = _cgRoleModalMode === 'change' || _cgRoleModalMode === 'duplicate';
        const isSource     = r.code === _cgRoleModalSourceCode;
        const inputType    = isSingleMode ? 'radio' : 'checkbox';
        const inputName    = isSingleMode ? 'cgRoleSelectSingle' : undefined;
        const nameAttr     = inputName ? `name="${inputName}"` : '';
        return `<div class="form-check mb-1">
          <input class="form-check-input cg-role-checkbox" type="${inputType}" id="cgrc_${esc(r.id)}"
            value="${esc(r.code)}" data-label="${esc(r.label)}" data-rate="${r.rate}"
            ${nameAttr}
            ${already ? 'disabled' : ''}>
          <label class="form-check-label" for="cgrc_${esc(r.id)}" style="${already ? 'color:var(--text-disabled)' : ''}">
            <strong style="font-size:var(--text-md)">${esc(r.label)}</strong>
            <span class="text-muted ms-1" style="font-size:var(--text-sm)">${esc(r.code)}</span>
            ${rateBadge}
            ${isSource  ? '<span class="ms-1 badge" style="background:var(--text-muted);color:#fff;font-size:var(--text-xs)">current</span>' : ''}
            ${already && !isSource ? '<span class="ms-1 text-muted" style="font-size:var(--text-xs)">(already added)</span>' : ''}
          </label>
        </div>`;
      }).join('')}
    </div>`
  ).join('');
}

function cgAddSelectedRoles() {
  const checked = [...document.querySelectorAll('.cg-role-checkbox:checked:not(:disabled)')];

  if (_cgRoleModalMode === 'change') {
    const cb = checked[0];
    if (!cb) { alert('Select a role to replace with.'); return; }
    const oldCode = _cgRoleModalSourceCode;
    const newCode = cb.value;
    if (oldCode === newCode) { bootstrap.Modal.getInstance(document.getElementById('cgRoleSelectModal')).hide(); return; }
    if (_cgDraft.roles.find(r => r.roleCode === newCode)) { alert(`Role "${cb.dataset.label}" is already in the grid.`); return; }
    // Replace role metadata in the roles array
    const roleIdx = _cgDraft.roles.findIndex(r => r.roleCode === oldCode);
    if (roleIdx >= 0) {
      _cgDraft.roles[roleIdx] = { roleCode: newCode, roleLabel: cb.dataset.label, rate: parseFloat(cb.dataset.rate) || 0 };
    }
    // Rename hours keys in all tasks
    _cgDraft.phases.forEach(ph => ph.tasks.forEach(task => {
      if (task.hours[oldCode] !== undefined) {
        task.hours[newCode] = task.hours[oldCode];
        delete task.hours[oldCode];
      }
    }));

  } else if (_cgRoleModalMode === 'duplicate') {
    const cb = checked[0];
    if (!cb) { alert('Select a role to duplicate into.'); return; }
    const srcCode = _cgRoleModalSourceCode;
    const newCode = cb.value;
    if (_cgDraft.roles.find(r => r.roleCode === newCode)) { alert(`Role "${cb.dataset.label}" is already in the grid.`); return; }
    // Insert new role immediately after the source role
    const srcIdx = _cgDraft.roles.findIndex(r => r.roleCode === srcCode);
    const newRole = { roleCode: newCode, roleLabel: cb.dataset.label, rate: parseFloat(cb.dataset.rate) || 0 };
    _cgDraft.roles.splice(srcIdx + 1, 0, newRole);
    // Copy source hours to new role in all tasks
    _cgDraft.phases.forEach(ph => ph.tasks.forEach(task => {
      if (task.hours[srcCode] !== undefined) task.hours[newCode] = task.hours[srcCode];
    }));

  } else {
    // 'add' mode — original behaviour
    checked.forEach(cb => {
      if (!_cgDraft.roles.find(r => r.roleCode === cb.value)) {
        _cgDraft.roles.push({ roleCode: cb.value, roleLabel: cb.dataset.label, rate: parseFloat(cb.dataset.rate) || 0 });
      }
    });
  }

  bootstrap.Modal.getInstance(document.getElementById('cgRoleSelectModal')).hide();
  renderCgEditor();
  cgScheduleAutoSave();
}

// ── CALCULATIONS ──────────────────────────────────────────────────────────────

function cgComputeTaskTotals(task, roles) {
  let totalHrs = 0, totalFee = 0;
  (roles || []).forEach(r => {
    const h = task.hours[r.roleCode] || 0;
    totalHrs += h;
    totalFee += h * (r.rate || 0);
  });
  const ptc = task.ptc || 0;
  return { totalHrs: Math.round(totalHrs * 100) / 100, totalFee, totalCostAndFee: totalFee + ptc };
}

function cgComputePhaseTotals(phase, roles) {
  let hrs = 0, fee = 0, ptc = 0;
  const byRole = {};
  (roles || []).forEach(r => { byRole[r.roleCode] = 0; });
  (phase.tasks || []).forEach(task => {
    const tt = cgComputeTaskTotals(task, roles);
    hrs += tt.totalHrs;
    fee += tt.totalFee;
    ptc += task.ptc || 0;
    (roles || []).forEach(r => { byRole[r.roleCode] = (byRole[r.roleCode] || 0) + (task.hours[r.roleCode] || 0); });
  });
  return { hrs: Math.round(hrs * 100) / 100, fee, ptc, byRole };
}

function cgComputeGrandTotals(version) {
  let hrs = 0, fee = 0, ptc = 0;
  (version.phases || []).forEach(ph => {
    const pt = cgComputePhaseTotals(ph, version.roles);
    hrs += pt.hrs; fee += pt.fee; ptc += pt.ptc;
  });
  return { hrs: Math.round(hrs * 100) / 100, fee, ptc };
}

function cgComputeColumnTotals(version) {
  const result = {};
  (version.roles || []).forEach(r => { result[r.roleCode] = { hrs: 0, fee: 0 }; });
  (version.phases || []).forEach(ph => (ph.tasks || []).forEach(task => {
    (version.roles || []).forEach(r => {
      const h = task.hours[r.roleCode] || 0;
      result[r.roleCode].hrs = Math.round((result[r.roleCode].hrs + h) * 100) / 100;
      result[r.roleCode].fee += h * (r.rate || 0);
    });
  }));
  return result;
}

// ── PARTIAL REFRESH ───────────────────────────────────────────────────────────
// Updates totals cells only — avoids full re-render on each keystroke.
// Column layout: 0=name, 1=desc, 2=cost, 3=ptc-input, 4=hrs, 5=fees, 6+=roles

function cgRefreshTotals() {
  const v         = _cgDraft;
  const cur       = v.currency || '€';
  const fmt       = a => cgFmtCurrency(a, cur);
  const grand     = cgComputeGrandTotals(v);
  const colTotals = cgComputeColumnTotals(v);

  // Task rows — update cost(2), hrs(4), fees(5)
  document.querySelectorAll('.cg-task-row').forEach(tr => {
    const task = cgFindTask(tr.dataset.phase, tr.dataset.task);
    if (!task) return;
    const tt    = cgComputeTaskTotals(task, v.roles);
    const cells = tr.querySelectorAll('td');
    if (cells[2]) cells[2].innerHTML = tt.totalCostAndFee > 0
      ? `<strong>${fmt(tt.totalCostAndFee)}</strong>`
      : '<span style="color:#bbb">—</span>';
    if (cells[4]) cells[4].innerHTML = tt.totalHrs > 0
      ? `<strong>${tt.totalHrs}h</strong>`
      : '<span style="color:#bbb">—</span>';
    if (cells[5]) cells[5].innerHTML = tt.totalFee > 0
      ? fmt(tt.totalFee)
      : '<span style="color:#bbb">—</span>';
  });

  // Phase rows — update cost(2), ptc(3), hrs(4), fees(5), role totals(6+)
  document.querySelectorAll('.cg-phase-row').forEach(tr => {
    const ph = v.phases.find(p => p.phaseId === tr.dataset.phase);
    if (!ph) return;
    const pt    = cgComputePhaseTotals(ph, v.roles);
    const cells = tr.querySelectorAll('td');
    if (cells[2]) cells[2].textContent = (pt.fee + pt.ptc) > 0 ? fmt(pt.fee + pt.ptc) : '—';
    if (cells[3]) cells[3].textContent = pt.ptc > 0 ? fmt(pt.ptc) : '—';
    if (cells[4]) cells[4].textContent = pt.hrs > 0 ? pt.hrs + 'h' : '—';
    if (cells[5]) cells[5].textContent = pt.fee > 0 ? fmt(pt.fee) : '—';
    v.roles.forEach((r, i) => {
      const h = pt.byRole[r.roleCode] || 0;
      if (cells[6 + i]) cells[6 + i].textContent = h > 0 ? h : '';
    });
  });

  // Header summary rows (identified by data-summary attribute)
  const hrsRow   = document.querySelector('#cgGridTable [data-summary="hrs"]');
  const feeRow   = document.querySelector('#cgGridTable [data-summary="fee"]');
  const grandRow = document.querySelector('#cgGridTable [data-summary="grand"]');

  if (hrsRow) {
    // first cell is colspan=6 label; role cells follow
    const cells = Array.from(hrsRow.querySelectorAll('td')).slice(1); // skip the colspan label
    v.roles.forEach((r, i) => { if (cells[i]) cells[i].textContent = colTotals[r.roleCode]?.hrs || 0; });
  }
  if (feeRow) {
    const cells = Array.from(feeRow.querySelectorAll('td')).slice(1);
    v.roles.forEach((r, i) => { if (cells[i]) cells[i].textContent = colTotals[r.roleCode]?.fee > 0 ? fmt(colTotals[r.roleCode].fee) : '—'; });
  }
  if (grandRow) {
    const cells = grandRow.querySelectorAll('td');
    // cells: [0]=currency pill, [1]=blank, [2]=total cost, [3]=total ptc, [4]=total hrs, [5]=total fees, [6+]=rates (static)
    if (cells[2]) cells[2].innerHTML = `<strong>${fmt(grand.fee + grand.ptc)}</strong>`;
    if (cells[3]) cells[3].textContent = grand.ptc > 0 ? fmt(grand.ptc) : '—';
    if (cells[4]) cells[4].textContent = grand.hrs > 0 ? grand.hrs + 'h' : '—';
    if (cells[5]) cells[5].textContent = grand.fee > 0 ? fmt(grand.fee) : '—';
  }

  // Footer grand total
  const tfoot = document.querySelector('#cgGridTable tfoot tr');
  if (tfoot) {
    const cells = tfoot.querySelectorAll('td');
    if (cells[2]) cells[2].innerHTML = `<strong>${fmt(grand.fee + grand.ptc)}</strong>`;
    if (cells[3]) cells[3].textContent = grand.ptc > 0 ? fmt(grand.ptc) : '—';
    if (cells[4]) cells[4].textContent = grand.hrs > 0 ? grand.hrs + 'h' : '—';
    if (cells[5]) cells[5].textContent = grand.fee > 0 ? fmt(grand.fee) : '—';
    v.roles.forEach((r, i) => {
      if (cells[6 + i]) cells[6 + i].textContent = (colTotals[r.roleCode]?.hrs || 0) > 0 ? colTotals[r.roleCode].hrs : '';
    });
  }
}

// ── SAVE ──────────────────────────────────────────────────────────────────────

function cgAutoSave() {
  if (!_cgActiveCgId || !_cgActiveVersionId || !_cgDraft) return;
  cgSyncHeaderFromForm();
  const cg = cgLoad(_cgActiveCgId);
  if (!cg) return;
  const idx = cg.versions.findIndex(v => v.versionId === _cgActiveVersionId);
  if (idx >= 0) cg.versions[idx] = _cgDraft;
  cgSave(cg);
}

let _cgAutoSaveTimer = null;
function cgScheduleAutoSave() {
  clearTimeout(_cgAutoSaveTimer);
  _cgAutoSaveTimer = setTimeout(() => {
    cgAutoSave();
    const toastEl = document.getElementById('cgAutoSaveToast');
    if (toastEl) bootstrap.Toast.getOrCreateInstance(toastEl).show();
  }, 2000);
}

function cgSaveVersion() {
  cgAutoSave();
  const btn = document.getElementById('btnCgSave');
  if (btn) { const orig = btn.textContent; btn.textContent = '✓ Saved'; setTimeout(() => { btn.textContent = orig; }, 1500); }
}

// ── NEW VERSION ───────────────────────────────────────────────────────────────

function cgCreateNewVersion() {
  const label = document.getElementById('cgNewVersionLabel')?.value.trim();
  if (!label) {
    const errEl = document.getElementById('cgNewVersionError');
    if (errEl) { errEl.textContent = 'Please enter a label.'; errEl.classList.remove('d-none'); }
    return;
  }
  cgAutoSave();
  const cg = cgLoad(_cgActiveCgId);
  if (!cg) return;
  const newVer = JSON.parse(JSON.stringify(_cgDraft));
  newVer.versionId    = cgNewVerId();
  newVer.versionLabel = label;
  newVer.createdAt    = new Date().toISOString();
  newVer.status       = 'draft';
  newVer.linkedProjects  = [];
  delete newVer.linkedProjectId;
  cg.versions.push(newVer);
  cgSave(cg);
  bootstrap.Modal.getInstance(document.getElementById('cgNewVersionModal'))?.hide();
  document.getElementById('cgNewVersionLabel').value = '';
  showCostGridEditorView(_cgActiveCgId, newVer.versionId);
}

// ── CREATE NEW GRID ───────────────────────────────────────────────────────────

function cgCreateNewGrid() {
  const name  = document.getElementById('cgNewGridName')?.value.trim();
  const errEl = document.getElementById('cgNewGridError');
  if (!name) {
    if (errEl) { errEl.textContent = 'Please enter a name.'; errEl.classList.remove('d-none'); }
    return;
  }
  if (errEl) errEl.classList.add('d-none');

  const cgId  = cgNewId();
  const verId = cgNewVerId();
  const cg = {
    id: cgId,
    name,
    versions: [{
      versionId:       verId,
      versionLabel:    'v1',
      createdAt:       new Date().toISOString(),
      status:          'draft',
      linkedProjects:  [],
      projectName:     name,
      startDate:       '',
      endDate:         '',
      currency:        '€',
      note:            '',
      roles:           [],
      phases:          [{ phaseId: cgNewPhId(), phaseName: 'Phase 1', tasks: [] }],
    }],
  };
  const idx = cgGetIndex();
  idx.push(cgId);
  cgSaveIndex(idx);
  cgSave(cg);
  bootstrap.Modal.getInstance(document.getElementById('cgNewGridModal'))?.hide();
  document.getElementById('cgNewGridName').value = '';
  showCostGridEditorView(cgId, verId);
}

// ── GENERATE PROJECT ──────────────────────────────────────────────────────────

function cgGenerateProject() {
  cgSyncHeaderFromForm();
  const v = _cgDraft;
  if (!v.projectName) { alert('Enter a project name before generating.'); return; }

  // Count free tasks (not yet assigned to any project)
  const assignedIds = cgGetAssignedTaskIds();
  const freeTasks = (v.phases || []).flatMap(ph => ph.tasks).filter(t => t.taskName?.trim() && !assignedIds.has(t.taskId));
  if (freeTasks.length === 0) {
    alert('All tasks have already been assigned to existing projects.');
    return;
  }

  // Enter selection mode
  _cgSelectionMode = true;
  _cgSelectedTaskIds = new Set();
  renderCgEditor();
  document.getElementById('cgGridTable')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cgExitSelectionMode() {
  _cgSelectionMode = false;
  _cgSelectedTaskIds = new Set();
  renderCgEditor();
}

function cgConfirmAndGenerate() {
  if (_cgSelectedTaskIds.size === 0) {
    alert('Select at least one task.');
    return;
  }
  cgSyncHeaderFromForm();
  const defaultName = _cgDraft.projectName || '';
  const projectName = prompt('Project name:', defaultName);
  if (!projectName || !projectName.trim()) return;
  cgDoGenerateProject([..._cgSelectedTaskIds], projectName.trim());
}

function cgDoGenerateProject(selectedTaskIds, projectName) {
  const v = _cgDraft;

  const tasks = [];
  (v.phases || []).forEach(ph => {
    (ph.tasks || []).forEach(task => {
      if (!selectedTaskIds.includes(task.taskId)) return;
      if (!task.taskName?.trim()) return;
      tasks.push({
        name:      task.taskName.trim(),
        completed: false,
        billable:  true,
        startDate: task.taskStartDate ? task.taskStartDate.replace(/-/g, '') : '',
        endDate:   task.taskEndDate   ? task.taskEndDate.replace(/-/g, '')   : '',
        resources: (v.roles || []).map(r => ({
          role:       r.roleCode,
          soldHours:  task.hours[r.roleCode] || 0,
          hourlyRate: r.rate || 0,
        })).filter(r => r.soldHours > 0),
      });
    });
  });

  if (!config.projects) config.projects = [];
  const generatedId = projectName.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 20) + '_' + Date.now().toString().slice(-4);

  // Derive start/end from selected task dates, falling back to version header dates
  const toYYYYMM = iso => iso ? iso.slice(0, 7).replace('-', '') : '';
  const selTasks = (v.phases || []).flatMap(ph => ph.tasks).filter(t => selectedTaskIds.includes(t.taskId));
  const selDates = selTasks.flatMap(t => [t.taskStartDate, t.taskEndDate]).filter(Boolean).sort();
  const now = new Date();
  const defaultStart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const defaultEnd   = (() => { const d = new Date(now.getFullYear(), now.getMonth() + 12, 1); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`; })();
  const projStart = (selDates.length ? toYYYYMM(selDates[0]) : null) || v.startDate || defaultStart;
  const projEnd   = (selDates.length ? toYYYYMM(selDates[selDates.length - 1]) : null) || v.endDate || defaultEnd;

  config.projects.push({
    id:        generatedId,
    name:      projectName,
    startDate: projStart,
    endDate:   projEnd,
    currency:  v.currency || '€',
    pipeline:  _cgDraft.pipeline || 'SIP',
    status:    '',
    note:      v.note     || '',
    tasks,
    phasing:   {},
    planning:  {},
    ptc:       [],
    groups:    [],
    costGridRef: { cgId: _cgActiveCgId, versionId: _cgActiveVersionId },
    clientId:  _cgDraft.clientId || '__unassigned__',
  });
  persistConfig();

  if (!_cgDraft.linkedProjects) _cgDraft.linkedProjects = [];
  _cgDraft.linkedProjects.push({
    projectId:   generatedId,
    projectName: projectName,
    taskIds:     selectedTaskIds,
    createdAt:   new Date().toISOString(),
  });
  _cgDraft.status = 'sip';

  _cgSelectionMode = false;
  _cgSelectedTaskIds = new Set();
  cgAutoSave();

  const cg = cgLoad(_cgActiveCgId);
  if (cg) renderCgVersionTabs(cg);

  renderCgEditor();

  showConfirm(
    `Project "${projectName}" created in Portfolio (pipeline: ${_cgDraft.pipeline || 'SIP'}).\n\nOpen configuration to assign the Project ID?`,
    () => { showPortfolioView(); openConfigModal(generatedId); },
    null, '✓ Project created'
  );
}

function cgDeleteLinkedProject(projectId) {
  const lp   = (_cgDraft.linkedProjects || []).find(l => l.projectId === projectId);
  const proj = (config.projects || []).find(p => p.id === projectId);
  const name = lp?.projectName || proj?.name || projectId;

  const removeLink = () => {
    _cgDraft.linkedProjects = (_cgDraft.linkedProjects || []).filter(l => l.projectId !== projectId);
    if (_cgDraft.linkedProjects.length === 0) _cgDraft.status = 'draft';
    cgAutoSave();
    const cg = cgLoad(_cgActiveCgId);
    if (cg) renderCgVersionTabs(cg);
    renderCgEditor();
  };

  if (!proj) {
    showConfirm(
      `Project "${name}" is not present in the current portfolio.\nRemove the link from the cost grid? Tasks will become available for new assignments.`,
      removeLink, null, '🗑 Remove link'
    );
    return;
  }

  const currentPipeline = _cgDraft?.pipeline || proj.pipeline || 'SIP';
  if (currentPipeline !== 'SIP') {
    showConfirm(
      `Project "${name}" is not in SIP (pipeline: ${currentPipeline}) and cannot be deleted from here.\n\nRemove only the link from the cost grid? Tasks will become available for new assignments.`,
      removeLink, null, '🔗 Remove link only'
    );
    return;
  }

  showConfirm(
    `Delete project "${name}" (SIP) from portfolio and remove the link from the cost grid?\n\nTasks will become available for new assignments.`,
    () => {
      config.projects = config.projects.filter(p => p.id !== projectId);
      persistConfig();
      removeLink();
    }, null, '🗑 Delete project'
  );
}

// ── EXPORT XLS ────────────────────────────────────────────────────────────────

async function cgExportXls() {
  cgSyncHeaderFromForm();
  const v   = _cgDraft;
  const cur = v.currency || '€';
  const cg  = cgLoad(_cgActiveCgId);
  if (typeof ExcelJS === 'undefined') { alert('ExcelJS is not available.'); return; }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Cost Grid');

  const DARK  = { argb: 'FF1A1A2E' };
  const SAND  = { argb: 'FFEDE8D5' };
  const SANDB = { argb: 'FFFAF7EF' };
  const NAVY  = { argb: 'FF1E2D5A' };
  const WHITE = { argb: 'FFFFFFFF' };
  const LILAC = { argb: 'FFEEF1FF' };
  const hB    = () => ({ top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} });

  const colTot = cgComputeColumnTotals(v);
  const grand  = cgComputeGrandTotals(v);

  // Info rows
  ws.addRow(['Project name:', v.projectName || '', '', 'Start Date:', cgFmtDate(v.startDate) || '']);
  ws.addRow(['NOTE:', v.note || '', '', 'End Date:', cgFmtDate(v.endDate) || '']);
  ws.addRow(['Currency:', cur]);
  ws.addRow([]);

  // Column headers
  const headers = ['Phase / Task', 'Description', 'TOTAL COST and FEE', 'Pass-through Costs', 'Total hrs', 'Total fees',
                   ...v.roles.map(r => r.roleLabel)];
  const hRow = ws.addRow(headers);
  hRow.eachCell(c => {
    c.fill = { type:'pattern', pattern:'solid', fgColor: DARK };
    c.font = { color:{ argb:'FFFFFFFF' }, bold: true, size: 10 };
    c.border = hB();
    c.alignment = { horizontal:'center', vertical:'middle', wrapText: true };
  });
  hRow.height = 28;

  // Total Hrs by Role
  const hrsRow = ws.addRow(['Total Hrs by Role', '', '', '', '', '', ...v.roles.map(r => colTot[r.roleCode]?.hrs || 0)]);
  hrsRow.eachCell((c, ci) => {
    c.fill = { type:'pattern', pattern:'solid', fgColor: ci <= 6 ? SAND : SANDB };
    c.font = { bold: true, size: 10 };
    c.border = hB();
    c.alignment = { horizontal: ci <= 6 ? 'left' : 'center' };
  });

  // Total Fee by Role
  const feeRow = ws.addRow(['Total Fee by Role', '', '', '', '', '', ...v.roles.map(r => colTot[r.roleCode]?.fee || 0)]);
  feeRow.eachCell((c, ci) => {
    c.fill = { type:'pattern', pattern:'solid', fgColor: ci <= 6 ? SAND : SANDB };
    c.font = { bold: true, size: 10 };
    c.border = hB();
    c.alignment = { horizontal: ci <= 6 ? 'left' : 'center' };
    if (ci > 6) c.numFmt = `"${cur}" #,##0.00`;
  });

  // Rate row
  const rateRow = ws.addRow(['Hourly rate', '', '', '', '', '', ...v.roles.map(r => r.rate)]);
  rateRow.eachCell((c, ci) => {
    c.fill = { type:'pattern', pattern:'solid', fgColor: SANDB };
    c.font = { size: 9, color:{ argb:'FF666666' } };
    c.border = hB();
    c.alignment = { horizontal: ci <= 6 ? 'left' : 'center' };
    if (ci > 6) c.numFmt = `"${cur}" #,##0.00`;
  });

  ws.addRow([]);

  // Phases and tasks
  v.phases.forEach(ph => {
    const pt = cgComputePhaseTotals(ph, v.roles);
    const phRow = ws.addRow([ph.phaseName, '', pt.fee + pt.ptc || '', pt.ptc || '', pt.hrs || '', pt.fee || '',
                             ...v.roles.map(r => pt.byRole[r.roleCode] || '')]);
    phRow.eachCell((c, ci) => {
      c.fill = { type:'pattern', pattern:'solid', fgColor: ci <= 2 ? DARK : NAVY };
      c.font = { color:{ argb:'FFE2E8FF' }, bold: true, size: 10 };
      c.border = hB();
      c.alignment = { horizontal: ci <= 2 ? 'left' : 'center' };
      if ([3,4,6,7].includes(ci)) c.numFmt = `"${cur}" #,##0.00`;
    });
    phRow.height = 20;

    ph.tasks.forEach(task => {
      const tt = cgComputeTaskTotals(task, v.roles);
      const taskRow = ws.addRow([
        task.taskName, task.taskDescription || '',
        tt.totalCostAndFee > 0 ? tt.totalCostAndFee : '',
        task.ptc > 0 ? task.ptc : '',
        tt.totalHrs > 0 ? tt.totalHrs : '',
        tt.totalFee > 0 ? tt.totalFee : '',
        ...v.roles.map(r => task.hours[r.roleCode] || ''),
      ]);
      taskRow.eachCell((c, ci) => {
        c.fill = { type:'pattern', pattern:'solid', fgColor: [3,4,5,6,7].includes(ci) ? SANDB : WHITE };
        c.font = { size: 10 };
        c.border = hB();
        c.alignment = { horizontal: ci <= 2 ? 'left' : 'center' };
        if ([3,4,6,7].includes(ci)) c.numFmt = `"${cur}" #,##0.00`;
      });
    });
  });

  // Grand total
  const gtRow = ws.addRow(['TOTAL', '', grand.fee + grand.ptc, grand.ptc || '', grand.hrs, grand.fee,
                            ...v.roles.map(r => colTot[r.roleCode]?.hrs || '')]);
  gtRow.eachCell((c, ci) => {
    c.fill = { type:'pattern', pattern:'solid', fgColor: LILAC };
    c.font = { bold: true, size: 10 };
    c.border = { ...hB(), top:{ style:'medium' } };
    c.alignment = { horizontal: ci <= 2 ? 'left' : 'center' };
    if ([3,4,6,7].includes(ci)) c.numFmt = `"${cur}" #,##0.00`;
  });
  gtRow.height = 20;

  // Column widths
  ws.getColumn(1).width = 32;
  ws.getColumn(2).width = 36;
  ws.getColumn(3).width = 16;
  ws.getColumn(4).width = 16;
  ws.getColumn(5).width = 10;
  ws.getColumn(6).width = 16;
  v.roles.forEach((_, i) => { ws.getColumn(7 + i).width = 14; });

  // ── Ratecard sheet ──────────────────────────────────────────────────────────
  const wsRc     = wb.addWorksheet('Ratecard');
  const allRoles = getRoles();

  // Project info header
  [
    ['Project name:', v.projectName || '', '', 'Version:', v.versionLabel || ''],
    ['Start:',        cgFmtDate(v.startDate) || '', '', 'End:', cgFmtDate(v.endDate) || ''],
    ['Currency:',     cur],
    [],
  ].forEach(r => wsRc.addRow(r));

  // Column headers
  const rcHdr = wsRc.addRow(['Role Code', 'Role Label', 'Default Rate', 'Applied Rate', 'Override']);
  rcHdr.eachCell(c => {
    c.fill      = { type: 'pattern', pattern: 'solid', fgColor: DARK };
    c.font      = { color: WHITE, bold: true, size: 10 };
    c.border    = hB();
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  rcHdr.height = 22;

  // One row per role
  v.roles.forEach(r => {
    const globalRate = allRoles.find(gr => gr.code === r.roleCode)?.rate ?? null;
    const isCustom   = globalRate !== null && r.rate !== globalRate;
    const rcRow      = wsRc.addRow([
      r.roleCode,
      r.roleLabel,
      globalRate !== null ? globalRate : '—',
      r.rate,
      isCustom ? '✎ custom' : '',
    ]);
    rcRow.eachCell((c, ci) => {
      c.fill      = { type: 'pattern', pattern: 'solid', fgColor: isCustom ? { argb: 'FFFFF8E1' } : WHITE };
      c.font      = { size: 10, bold: isCustom && ci >= 4,
                      color: { argb: isCustom && ci >= 4 ? 'FF856404' : 'FF000000' } };
      c.border    = hB();
      c.alignment = { horizontal: ci <= 2 ? 'left' : 'center' };
      if ((ci === 3 || ci === 4) && typeof c.value === 'number') c.numFmt = `"${cur}" #,##0.00`;
    });
  });

  wsRc.getColumn(1).width = 32;
  wsRc.getColumn(2).width = 28;
  wsRc.getColumn(3).width = 16;
  wsRc.getColumn(4).width = 16;
  wsRc.getColumn(5).width = 12;

  const buf  = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `costgrid_${(cg?.name || 'export').replace(/[^a-z0-9]/gi,'_')}_${v.versionLabel.replace(/[^a-z0-9]/gi,'_')}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── IMPORT / EXPORT ALL ───────────────────────────────────────────────────────

function cgExportAll() {
  const index = cgGetIndex();
  const all   = index.map(id => cgLoad(id)).filter(Boolean);
  const blob  = new Blob([JSON.stringify({ index, grids: all }, null, 2)], { type:'application/json' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = `costgrids_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function cgImportAll() {
  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.index || !data.grids) throw new Error('Invalid format');
        showConfirm(
          `Import ${data.grids.length} Cost Grid(s)? This will replace all existing Cost Grids.`,
          () => { cgSaveIndex(data.index); data.grids.forEach(cg => cgSave(cg)); renderPipelineBoard(); },
          null, '⬆ Import Cost Grid'
        );
      } catch(err) { alert('JSON file error: ' + err.message); }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ── UTILS ─────────────────────────────────────────────────────────────────────

function cgGetAssignedTaskIds() {
  const assigned = new Set();
  (_cgDraft?.linkedProjects || []).forEach(lp => (lp.taskIds || []).forEach(id => assigned.add(id)));
  return assigned;
}

function cgFindTask(phaseId, taskId) {
  const ph = _cgDraft?.phases.find(p => p.phaseId === phaseId);
  return ph?.tasks.find(t => t.taskId === taskId) || null;
}

function cgFmtDate(yyyymm) {
  if (!yyyymm || yyyymm.length < 6) return '';
  const mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${mn[parseInt(yyyymm.slice(4,6)) - 1]} ${yyyymm.slice(0,4)}`;
}
