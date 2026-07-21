// ── COST GRID MODULE ──────────────────────────────────────────────────────────
// Structure: CostGrid { id, name, versions[] }
// Version:   { versionId, versionLabel, createdAt, status, linkedProjectId,
//              projectName, startDate, endDate, currency, note,
//              roles[], phases[] }
// Phase:     { phaseId, phaseName, tasks[] }
// Task:      { taskId, taskName, taskDescription, ptc, hours: { roleCode: n } }

const _cgStore = new Map(); // in-memory: cgId → cg object (replaces localStorage PDash_cg_*)

let _cgActiveCgId      = null;
let _cgActiveVersionId = null;
let _cgDraft           = null;
let _cgSelectionMode         = false;
let _cgSelectedTaskIds       = new Set();
let _cgOfferDetailsCollapsed = false;
let _cgSummaryCollapsed      = false;
let _cgCompactHeader         = localStorage.getItem('PDash_cgCompactHeader') === '1';
let _cgRoleModalMode         = 'add';   // 'add' | 'change' | 'duplicate'
let _cgRoleModalSourceCode   = null;    // roleCode being changed/duplicated
let _cgActiveRatecardMap     = {};      // roleId → EUR hourly_rate from the ratecard selected for the current version
let _cgActiveRatecardOverrides = {};   // roleId → { USD: 216, GBP: 200, ... } per-currency rate overrides
let _cgIsClientRatecard      = false;   // true when selected ratecard is client-specific (not agency-wide)
let _pbCloneSource           = null;    // { cgId, verId, name } — shared between pipeline board and editor

// ── PERSISTENCE ───────────────────────────────────────────────────────────────

function cgGetIndex()     { return [..._cgStore.keys()]; }
function cgSaveIndex()    { /* no-op: index is implicit in _cgStore */ }
function cgLoad(cgId)     { const cg = _cgStore.get(cgId); return cg ? JSON.parse(JSON.stringify(cg)) : null; }
function cgSave(cg)       { _cgStore.set(cg.id, JSON.parse(JSON.stringify(cg))); }
async function cgDelete(cgId) {
  await Api.costGrids.delete(cgId);
  _cgStore.delete(cgId);
}

function cgNewId()    { return crypto.randomUUID(); }
function cgNewVerId() { return crypto.randomUUID(); }
function cgNewPhId()  { return crypto.randomUUID(); }
function cgNewTkId()  { return crypto.randomUUID(); }

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

function cgFmtCurrency(amount, code) {
  const n    = parseFloat(amount) || 0;
  const opts = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  const cur  = (window.__currencies || []).find(c => c.code === code)
    || { symbol: code === 'EUR' ? '€' : (code || 'EUR'), locale: 'it-IT' };
  return `${cur.symbol} ${new Intl.NumberFormat(cur.locale, opts).format(n)}`;
}

function cgFmtMonth(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate + (isoDate.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d)) return '';
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

// dd/mm/yyyy ↔ yyyy-mm-dd helpers for task date inputs
function cgIsoToIt(iso) {
  if (!iso || iso.length < 10) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function cgItToIso(it) {
  if (!it) return '';
  const parts = it.split('/');
  if (parts.length !== 3) return '';
  const [d, m, y] = parts;
  if (!d || !m || !y || y.length !== 4) return '';
  const iso = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  return isNaN(new Date(iso).getTime()) ? '' : iso;
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
  renderCgPhasing();
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

  // Proposal itself is Committed and every task has been migrated to a project → deal is fully done, lock it
  const thisVer = cg.versions.find(v => v.versionId === versionId);
  if (isVersionCommittedLocked(thisVer)) return {
    locked: true, reason: 'committed',
    message: 'This version is locked — the proposal has been committed and every task has been migrated to a project.'
  };

  return { locked: false, reason: '', message: '' };
}

function cgPipelineStyle(pipeline) {
  switch (pipeline) {
    case 'Draft':       return { bg: '#6c757d',                            color: '#fff', icon: ' ✏️' };
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
  if (!lps.length) return { label: 'Draft', bg: '#6c757d', color: '#fff', icon: ' ✏️' };
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
      const fmt         = a => cgFmtCurrency(a, v.currency || 'EUR');
      const dateRange   = [v.startDate && cgFmtDate(v.startDate), v.endDate && cgFmtDate(v.endDate)].filter(Boolean).join(' – ');
      return `
        <tr>
          <td class="ps-3" style="font-weight:500;font-size:var(--text-md)">${esc(v.versionLabel)}</td>
          <td class="text-muted" style="font-size:var(--text-base)">${new Date(v.createdAt).toLocaleDateString('it-IT')}</td>
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

function cgConfirmDeleteGrid(cgId, name, onSuccess) {
  const cg     = cgLoad(cgId);
  const hasSip = cg?.versions.some(v => (v.linkedProjects || []).length > 0 || v.linkedProjectId);
  const warn   = hasSip ? '\n\n⚠️ One or more versions have generated a project. The project will NOT be deleted.' : '';
  showConfirm(
    `Delete Cost Grid "${name}"?${warn}\n\nAll versions will be deleted.`,
    async () => {
      try {
        await cgDelete(cgId);
        if (onSuccess) onSuccess(); else renderPipelineBoard();
      } catch(e) {
        alert('Delete failed: ' + e.message);
      }
    },
    null, '🗑 Delete Cost Grid'
  );
}

function cgConfirmDeleteVersion(cgId, versionId, versionLabel, onSuccess) {
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
    async () => {
      try {
        await Api.costGrids.versions.delete(cgId, versionId);
        const fresh = cgLoad(cgId);
        if (fresh) {
          fresh.versions = fresh.versions.filter(v => v.versionId !== versionId);
          cgSave(fresh);
        }
        if (onSuccess) onSuccess(); else renderPipelineBoard();
      } catch(e) {
        alert('Delete failed: ' + e.message);
      }
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

// ── EDITOR RENDER ─────────────────────────────────────────────────────────────
// Table columns (fixed, index 0–5):
//   0: Fase / Task  1: Descrizione  2: TOTAL COST and FEE  3: Pass-through Costs  4: Total hrs  5: Total fees
// Then role columns from index 6 onwards.

function renderCgEditor() {
  const v   = _cgDraft;
  const cur = v.currency || 'EUR';
  const fmt = a => cgFmtCurrency(a, cur);

  const lockState  = cgGetVersionLockState(_cgActiveCgId, _cgActiveVersionId);
  const isLocked   = lockState.locked;
  const isDraft    = v.pipeline === 'Draft';

  // Show/hide Generate Project + Publish + New Version + Delete Version toolbar buttons
  const assignedIds   = cgGetAssignedTaskIds();
  const assignedNames = cgGetAssignedTaskNames();
  const _isTaskAssigned = t => assignedIds.has(t.taskId) || assignedNames.has(t.taskName?.trim().toLowerCase());
  const hasFreeTasks = (v.phases || []).flatMap(ph => ph.tasks).some(t => t.taskName?.trim() && !_isTaskAssigned(t));

  const genBtn = document.getElementById('btnCgGenerateProject');
  if (genBtn) genBtn.style.display = (isLocked || isDraft || !hasFreeTasks) ? 'none' : '';
  const pubBtn = document.getElementById('btnCgPublish');
  if (pubBtn) pubBtn.style.display = isDraft ? '' : 'none';
  const newVerBtn = document.getElementById('btnCgNewVersion');
  if (newVerBtn) newVerBtn.style.display = isDraft ? '' : 'none';
  const delVerBtn = document.getElementById('btnCgDeleteVersion');
  if (delVerBtn) delVerBtn.style.display = isDraft ? '' : 'none';

  const lockBannerHtml = isLocked ? `
    <div class="alert mb-3 py-2 px-3 d-flex align-items-center gap-2"
         style="background:var(--color-warning-bg);border:1px solid #ffc107;border-radius:var(--radius-sm);font-size:var(--text-base)">
      <span>🔒</span>
      <span class="fw-semibold">${esc(lockState.message)}</span>
    </div>` : '';

  const draftBannerHtml = (!isLocked && isDraft) ? `
    <div class="alert mb-3 py-2 px-3 d-flex align-items-center justify-content-between gap-2"
         style="background:#f8f9fa;border:1px solid #adb5bd;border-radius:var(--radius-sm);font-size:var(--text-base)">
      <div class="d-flex align-items-center gap-2">
        <span>✏️</span>
        <span class="fw-semibold">Draft — private to you. Publish to make it visible in the shared pipeline.</span>
      </div>
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

  // Row: Grand totals + rates per role (editable, baseline from ratecard or global roles)
  const rateCells = v.roles.map(r => {
    const zeroRate     = !r.rate || r.rate === 0;
    const roleObj      = getRoles().find(gr => gr.code === r.roleCode);
    const globalRate   = roleObj?.rate;
    const rcRate       = roleObj ? _cgActiveRatecardMap[String(roleObj.id)] : undefined;
    const baselineRate = rcRate !== undefined ? rcRate : globalRate;
    const isCustom     = r.rateIsCustom === true;
    const bg  = zeroRate ? '#fff0f0' : (isCustom ? '#fffbe6' : 'var(--sand-50)');
    const bdr = zeroRate ? '#f5c6cb' : (isCustom ? '#ffe58f' : 'var(--sand-border)');
    const col = zeroRate ? 'var(--color-danger)' : (isCustom ? 'var(--color-warning-text)' : '#555');
    const title = isCustom
      ? `Custom (baseline: ${cur}€ ${baselineRate}/h) — clear to restore`
      : rcRate !== undefined
        ? `Ratecard rate${globalRate !== undefined ? ` (agency default: ${cur}€ ${globalRate}/h)` : ''}`
        : 'Rate from roles registry';
    return `<td style="text-align:center;background:${bg};border:1px solid ${bdr};padding:3px 4px;">
      <div style="font-size:var(--text-xs);color:#aaa;margin-bottom:1px">${cur}/h</div>
      <input type="number" class="cg-rate-input" data-role="${esc(r.roleCode)}" data-default="${baselineRate ?? ''}"
        value="${r.rate}" min="0" step="1" title="${esc(title)}"
        style="width:100%;border:1px solid ${bdr};border-radius:var(--radius-xs);text-align:center;font-size:var(--text-md);font-weight:${zeroRate||isCustom?'700':'400'};color:${col};background:transparent;padding:1px 4px">
      ${isCustom ? '<div style="font-size:var(--text-2xs);color:var(--color-warning-text);margin-top:2px">✎ custom</div>' : ''}
      ${zeroRate  ? '<div style="font-size:var(--text-2xs);color:var(--color-danger);margin-top:2px">⚠️ 0</div>' : ''}
    </td>`;  }).join('');

  // Row: Column labels + role names + remove/change/duplicate buttons
  const roleHeaderCells = v.roles.map((r, rIdx) => {
    const zeroRate = !r.rate || r.rate === 0;
    const hdrBg    = zeroRate ? '#7f0b0b' : 'var(--brand-navy)';
    if (_cgCompactHeader) {
      const zeroWarn = zeroRate ? ' ⚠️' : '';
      return `<th style="position:sticky;top:0;z-index:2;text-align:center;background:${hdrBg};color:#fff;border:1px solid #333;padding:3px 2px;min-width:80px;font-size:10px;font-weight:600;vertical-align:middle">
         <div title="${esc(r.roleCode)}" style="cursor:default;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80px">${esc(r.roleLabel)}${zeroWarn}</div>
       </th>`;
    }
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

  const _assignedTaskIds   = cgGetAssignedTaskIds();
  const _assignedTaskNames = cgGetAssignedTaskNames();

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

      const isAssigned = _assignedTaskIds.has(task.taskId) || _assignedTaskNames.has(task.taskName?.trim().toLowerCase());
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
              ${!isAssigned ? `<button class="btn btn-link p-0 cg-del-task-btn" data-phase="${esc(phase.phaseId)}" data-task="${esc(task.taskId)}"
                style="color:var(--color-danger);font-size:var(--text-xs);line-height:1;flex-shrink:0;margin-top:4px" title="Delete task">✕</button>` : ''}
            </div>
            <div class="d-flex gap-2 mt-1 align-items-center">
              <div class="d-flex align-items-center gap-1">
                <span class="text-muted" style="font-size:var(--text-xs);white-space:nowrap">From</span>
                <input type="text" class="cg-task-start form-control form-control-sm p-1"
                  style="font-size:var(--text-xs);height:24px;border:1px solid var(--border-light);width:100px"
                  placeholder="gg/mm/aaaa" maxlength="10"
                  value="${cgIsoToIt(task.taskStartDate)}"
                  data-phase="${esc(phase.phaseId)}" data-task="${esc(task.taskId)}">
              </div>
              <div class="d-flex align-items-center gap-1">
                <span class="text-muted" style="font-size:var(--text-xs);white-space:nowrap">To</span>
                <input type="text" class="cg-task-end form-control form-control-sm p-1"
                  style="font-size:var(--text-xs);height:24px;border:1px solid var(--border-light);width:100px"
                  placeholder="gg/mm/aaaa" maxlength="10"
                  value="${cgIsoToIt(task.taskEndDate)}"
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
    const badges = linkedProjects.map(lp => {
      let proj = (config.projects || []).find(p => p.id === lp.projectId);
      if (!proj) {
        proj = (config.projects || []).find(p =>
          p.costGridRef?.cgId === _cgActiveCgId && p.costGridRef?.versionId === _cgActiveVersionId
        );
      }
      const currentProjId = proj?.id || lp.projectId;
      const pname   = lp.projectName || proj?.name || lp.projectId;
      const pcode   = proj?.code || '';
      const pstatus = proj?.status || '';
      const ppipe   = getProjectPipeline(currentProjId) || pipeline;
      // Task names: prefer in-memory resolution (fresh), fallback to API-returned taskNames
      const resolvedTaskNames = (lp.taskIds || []).map(tid => {
        for (const ph of _cgDraft.phases || []) {
          const t = ph.tasks.find(t => t.taskId === tid);
          if (t?.taskName?.trim()) return t.taskName.trim();
        }
        return null;
      }).filter(Boolean);
      const taskNames = resolvedTaskNames.length ? resolvedTaskNames : (lp.taskNames || []);
      const taskListHtml = taskNames.length
        ? `<div style="font-size:var(--text-xs);color:var(--text-muted);margin-top:5px"><span style="font-weight:600">Tasks:</span> ${taskNames.map(n => esc(n)).join(', ')}</div>`
        : '';
      return `
        <div class="border rounded p-2" style="font-size:var(--text-sm);background:var(--surface-light);min-width:220px">
          <div class="d-flex align-items-start justify-content-between gap-2">
            <div class="flex-grow-1 min-width-0">
              <div class="fw-semibold text-truncate">${esc(pname)}</div>
              ${pcode ? `<div style="font-size:var(--text-xs);color:var(--text-muted);font-family:'SFMono-Regular',monospace">${esc(pcode)}</div>` : ''}
              <div class="d-flex gap-1 flex-wrap mt-1">
                ${pipelineBadge(ppipe)}
                ${statusBadgeLarge(pstatus)}
              </div>
              ${taskListHtml}
            </div>
            ${proj ? `<button class="btn btn-xs btn-outline-secondary flex-shrink-0 cg-open-project-btn"
              data-projid="${esc(currentProjId)}" style="font-size:var(--text-xs);white-space:nowrap">📊 Portfolio</button>` : ''}
          </div>
        </div>`;
    }).join('');
    linkedProjectsHtml = `
      <div class="mt-3 pt-2 border-top">
        <div class="small fw-semibold text-muted mb-2">🔗 Linked projects (${linkedProjects.length})</div>
        <div class="d-flex flex-wrap gap-2">${badges}</div>
      </div>`;
  }

  // ── Selection bar (sticky bottom, shown only in selection mode) ────────────
  const existingLinked = (_cgDraft.linkedProjects || []);
  const addToProjectOpts = existingLinked.map(lp =>
    `<option value="${esc(lp.projectId)}">${esc(lp.projectName || lp.projectId)}</option>`
  ).join('');
  const selBarHtml = _cgSelectionMode ? `
    <div id="cgSelectionBar" style="position:sticky;bottom:0;left:0;right:0;z-index:100;background:var(--brand-navy);color:#fff;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border-top:3px solid var(--indigo-500)">
      <div class="d-flex align-items-center gap-3">
        <span style="font-size:var(--text-md)"><strong id="cgSelCount">${_cgSelectedTaskIds.size}</strong> tasks selected</span>
        <button class="btn btn-sm btn-outline-light py-0 px-2" id="btnCgSelectAll" style="font-size:var(--text-sm)">☑ All free tasks</button>
      </div>
      <div class="d-flex gap-2 align-items-center flex-wrap">
        ${existingLinked.length ? `
          <select id="cgAddToProjectSel" class="form-select form-select-sm py-0" style="width:auto;min-width:180px;height:30px;font-size:var(--text-sm)">
            <option value="">— Add to existing project —</option>
            ${addToProjectOpts}
          </select>
          <button class="btn btn-sm btn-warning py-0 px-3" id="btnCgAddToProject" style="font-size:var(--text-base)">＋ Add to project</button>
        ` : ''}
        <button class="btn btn-sm btn-outline-secondary py-0 px-3" id="btnCgCancelSel" style="font-size:var(--text-base)">Cancel</button>
        <button class="btn btn-sm btn-success py-0 px-3" id="btnCgConfirmSel" style="font-size:var(--text-base)">▶ Create project</button>
      </div>
    </div>` : '';

  const offerIcon = _cgOfferDetailsCollapsed ? '▶' : '▼';
  const offerSummary = _cgOfferDetailsCollapsed
    ? `<span class="text-muted ms-3" style="font-size:var(--text-base);font-weight:400">${esc(v.projectName || '')}${v.startDate ? '  ·  ' + v.startDate.slice(0,4)+'/'+v.startDate.slice(4,6) : ''}${v.endDate ? ' – ' + v.endDate.slice(0,4)+'/'+v.endDate.slice(4,6) : ''}  ·  ${esc(v.currency || 'EUR')}</span>`
    : '';

  const body = document.getElementById('cgEditorBody');
  body.innerHTML = `
    ${lockBannerHtml}${draftBannerHtml}
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
              ${(window.__currencies || [{code:'EUR',symbol:'€',name:'Euro'}]).map(cu =>
                `<option value="${cu.code}"${(v.currency||'EUR')===cu.code?' selected':''}>  ${cu.symbol} ${cu.code} — ${cu.name}</option>`
              ).join('')}
            </select>
          </div>
          <div class="col-md-2">
            <label class="form-label small fw-semibold mb-1">Pipeline stage</label>
            ${isDraft
              ? `<div class="form-control-plaintext ps-2 fw-semibold" style="font-size:var(--text-md);color:#6c757d">✏️ Draft</div>`
              : `<select class="form-select" id="cgPipeline">
                   ${['SIP','Expected','Anticipated','Committed','Canceled']
                     .map(p => `<option value="${p}"${(v.pipeline||'SIP')===p?' selected':''}>${p}</option>`).join('')}
                 </select>`}
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
          <div class="col-md-6" id="cgRatecardCol">
            <label class="form-label small fw-semibold mb-1">Rate card <span class="text-muted fw-normal">(optional)</span></label>
            <select class="form-select form-select-sm" id="cgRatecardId">
              <option value="">— None (use global role rates) —</option>
            </select>
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
              ${_cgCompactHeader ? `
              <th style="position:sticky;top:0;left:0;z-index:4;background:var(--brand-navy);color:#fff;border:1px solid #333;padding:3px 8px;min-width:200px;font-size:10px">
                <div class="d-flex align-items-center justify-content-between">
                  <span>Phase / Task</span>
                  <button id="cgCompactToggleBtn" title="Expand header" style="background:none;border:none;color:#93c5fd;font-size:12px;cursor:pointer;padding:0;line-height:1;margin-left:6px">⊞</button>
                </div>
              </th>
              <th style="position:sticky;top:0;z-index:2;background:var(--brand-navy);color:#fff;border:1px solid #333;padding:3px 8px;min-width:240px;font-size:10px">Description</th>
              <th style="position:sticky;top:0;z-index:2;background:var(--brand-navy);color:#fff;border:1px solid #333;padding:3px 6px;min-width:110px;text-align:right;font-size:10px">TOTAL COST / FEE</th>
              <th style="position:sticky;top:0;z-index:2;background:var(--brand-navy);color:#fff;border:1px solid #333;padding:3px 6px;min-width:90px;text-align:right;font-size:10px">PTC</th>
              <th style="position:sticky;top:0;z-index:2;background:var(--brand-navy);color:#fff;border:1px solid #333;padding:3px 6px;min-width:60px;text-align:right;font-size:10px">hrs</th>
              <th style="position:sticky;top:0;z-index:2;background:var(--brand-navy);color:#fff;border:1px solid #333;padding:3px 6px;min-width:100px;text-align:right;font-size:10px">Fees</th>
              ` : `
              <th style="position:sticky;top:0;left:0;z-index:4;background:var(--brand-navy);color:#fff;border:1px solid #333;padding:8px 12px;min-width:200px;font-size:var(--text-md)">
                <div class="d-flex align-items-center justify-content-between">
                  <span>Phase / Task</span>
                  <button id="cgCompactToggleBtn" title="Compact header" style="background:none;border:none;color:#93c5fd;font-size:12px;cursor:pointer;padding:0;line-height:1;margin-left:6px">⊟</button>
                </div>
              </th>
              <th style="position:sticky;top:0;z-index:2;background:var(--brand-navy);color:#fff;border:1px solid #333;padding:8px 12px;min-width:240px;font-size:var(--text-md)">Description</th>
              <th style="position:sticky;top:0;z-index:2;background:var(--brand-navy);color:#fff;border:1px solid #333;padding:8px 10px;min-width:130px;text-align:right;font-size:var(--text-base)">TOTAL COST<br>and FEE</th>
              <th style="position:sticky;top:0;z-index:2;background:var(--brand-navy);color:#fff;border:1px solid #333;padding:8px 10px;min-width:115px;text-align:right;font-size:var(--text-base)">Total Pass<br>through Costs</th>
              <th style="position:sticky;top:0;z-index:2;background:var(--brand-navy);color:#fff;border:1px solid #333;padding:8px 10px;min-width:75px;text-align:right;font-size:var(--text-base)">Total<br>hrs</th>
              <th style="position:sticky;top:0;z-index:2;background:var(--brand-navy);color:#fff;border:1px solid #333;padding:8px 10px;min-width:120px;text-align:right;font-size:var(--text-base)">Total<br>fees</th>
              `}
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
        span.textContent = `${v.projectName || ''}${v.startDate ? '  ·  ' + v.startDate.slice(0,4)+'/'+v.startDate.slice(4,6) : ''}${v.endDate ? ' – ' + v.endDate.slice(0,4)+'/'+v.endDate.slice(4,6) : ''}  ·  ${v.currency || 'EUR'}`;
        body.querySelector('#cgOfferDetailsHeader').appendChild(span);
      }
    } else {
      existingSummary?.remove();
    }
  });

  // Summary rows collapse toggle
  body.querySelector('#cgCompactToggleBtn')?.addEventListener('click', e => {
    e.stopPropagation();
    _cgCompactHeader = !_cgCompactHeader;
    localStorage.setItem('PDash_cgCompactHeader', _cgCompactHeader ? '1' : '0');
    renderCgEditor();
  });

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

  body.querySelectorAll('.cg-hours-input').forEach(inp =>
    inp.addEventListener('blur', e => {
      const val = parseFloat(e.target.value) || 0;
      if (val > 0 && !isValidSoldHours(val)) {
        alert(`Invalid sold hours "${val}". Allowed values: whole numbers, or with a fraction of .25, .5, or .75.`);
        const task = cgFindTask(e.target.dataset.phase, e.target.dataset.task);
        if (task) delete task.hours[e.target.dataset.role];
        e.target.value = '';
        cgRefreshTotals(); cgScheduleAutoSave();
      }
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
      if (task) e.target.value = task.ptc > 0 ? cgFmtCurrency(task.ptc, _cgDraft.currency || 'EUR') : '';
    });
  });

  body.querySelectorAll('.cg-task-start').forEach(inp =>
    inp.addEventListener('change', e => {
      const task = cgFindTask(e.target.dataset.phase, e.target.dataset.task);
      if (!task) return;
      const iso = cgItToIso(e.target.value);
      e.target.value = iso ? cgIsoToIt(iso) : '';
      task.taskStartDate = iso;
      cgRefreshPhaseDates();
      cgScheduleAutoSave();
    })
  );

  body.querySelectorAll('.cg-task-end').forEach(inp =>
    inp.addEventListener('change', e => {
      const task = cgFindTask(e.target.dataset.phase, e.target.dataset.task);
      if (!task) return;
      const iso = cgItToIso(e.target.value);
      e.target.value = iso ? cgIsoToIt(iso) : '';
      task.taskEndDate = iso;
      cgRefreshPhaseDates();
      cgScheduleAutoSave();
    })
  );

  body.querySelectorAll('.cg-rate-input').forEach(inp =>
    inp.addEventListener('change', e => {
      const code = e.target.dataset.role;
      const role = _cgDraft.roles.find(r => r.roleCode === code);
      if (!role) return;
      const val      = e.target.value.trim();
      const defRate  = parseFloat(e.target.dataset.default) || 0;
      if (val === '') {
        role.rate         = defRate;
        role.rateIsCustom = false;
      } else {
        const newRate     = parseFloat(val) || 0;
        role.rate         = newRate;
        role.rateIsCustom = newRate !== defRate;
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

  body.querySelector('#btnCgAddToProject')?.addEventListener('click', () => {
    const sel = document.getElementById('cgAddToProjectSel');
    const projId = sel?.value;
    if (!projId) { alert('Select a project from the dropdown.'); return; }
    if (_cgSelectedTaskIds.size === 0) { alert('Select at least one task.'); return; }

    const lp = (_cgDraft.linkedProjects || []).find(l => l.projectId === projId);
    const projName = lp?.projectName || projId;
    const selectedIds = [..._cgSelectedTaskIds];
    const taskNames = selectedIds.map(tid => {
      for (const ph of _cgDraft.phases || []) {
        const t = ph.tasks.find(t => t.taskId === tid);
        if (t?.taskName?.trim()) return t.taskName.trim();
      }
      return tid;
    });

    const modal = _cgEnsureAddToProjectModal();
    modal.querySelector('#cgAddToProjectModalBody').innerHTML = `
      <p class="mb-2">Add the following tasks to <strong>${esc(projName)}</strong>?</p>
      <ul class="mb-0 ps-3" style="font-size:var(--text-sm)">
        ${taskNames.map(n => `<li>${esc(n)}</li>`).join('')}
      </ul>`;
    modal.dataset.projId = projId;
    modal.dataset.taskIds = JSON.stringify(selectedIds);
    modal.style.display = 'flex';
  });

  body.querySelectorAll('.cg-del-linked-btn').forEach(btn =>
    btn.addEventListener('click', e => cgDeleteLinkedProject(e.currentTarget.dataset.projid))
  );

  body.querySelectorAll('.cg-open-project-btn').forEach(btn =>
    btn.addEventListener('click', e => {
      cgAutoSave();
      showDashboardView(e.currentTarget.dataset.projid);
    })
  );

  // Currency triggers rate recalculation + full re-render
  document.getElementById('cgCurrency')?.addEventListener('change', function () {
    const sel          = this;
    const newCurrency  = sel.value;
    const prevCurrency = _cgDraft?.currency || 'EUR';

    if (newCurrency === prevCurrency) return;

    // If no roles yet, just apply immediately
    if (!_cgDraft?.roles?.length) {
      cgSyncHeaderFromForm();
      cgSyncRoleRatesToBaseline(true);
      renderCgEditor();
      cgAutoSave();
      return;
    }

    const preview   = cgPreviewRateChange(newCurrency);
    const newEntry  = (window.__currencies || []).find(c => c.code === newCurrency);
    const prevEntry = (window.__currencies || []).find(c => c.code === prevCurrency);
    const newSym    = newEntry?.symbol  || newCurrency;
    const prevSym   = prevEntry?.symbol || prevCurrency;
    const fmtR      = (n, sym) => `${sym} ${Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const hasCustom = preview.some(r => r.isCustom);
    const roleRows  = preview.map(r =>
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
      sel.value = prevCurrency;  // revert dropdown
    };

    document.getElementById(`${modalId}Confirm`).onclick = () => {
      bsModal.hide();
      cgSyncHeaderFromForm();        // sets _cgDraft.currency = newCurrency
      cgSyncRoleRatesToBaseline(true); // force-reset all roles
      renderCgEditor();
      cgAutoSave();
    };

    // Also revert on backdrop/ESC dismiss
    modalEl.addEventListener('hidden.bs.modal', () => {
      if (sel.value !== prevCurrency && _cgDraft?.currency === prevCurrency) {
        sel.value = prevCurrency;
      }
    }, { once: true });
  });

  // Pipeline change: save immediately (not deferred) so the server can detect the change and notify admins
  document.getElementById('cgPipeline')?.addEventListener('change', () => {
    cgSyncHeaderFromForm();
    cgPropagatePipelineToProjects();
    const cg = cgLoad(_cgActiveCgId);
    if (cg) renderCgVersionTabs(cg);
    renderCgEditor();
    cgAutoSave();
  });

  ['cgProjectName','cgStartDate','cgEndDate','cgNote'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => cgSyncHeaderFromForm());
  });
  document.getElementById('cgClientId')?.addEventListener('change', async () => {
    cgSyncHeaderFromForm();             // updates _cgDraft.clientId
    await cgPopulateRatecardDropdown(); // re-filter + reset ratecard if no longer valid
    renderCgEditor();
  });
  document.getElementById('cgRatecardId')?.addEventListener('change', async () => {
    cgSyncHeaderFromForm();
    await cgUpdateActiveRatecardMap();
    renderCgEditor();
  });

  cgPopulateRatecardDropdown();
  renderCgPhasing();
}

async function cgUpdateActiveRatecardMap() {
  _cgActiveRatecardMap     = {};
  _cgActiveRatecardOverrides = {};
  _cgIsClientRatecard      = false;
  const rcId = _cgDraft?.ratecardId;
  if (rcId && typeof loadRatecardsForDropdown === 'function') {
    try {
      const list = await loadRatecardsForDropdown();
      const rc   = list.find(r => String(r.id) === String(rcId));
      if (rc) {
        _cgIsClientRatecard = rc.client_id != null;
        (rc.entries || []).forEach(e => {
          const rid  = String(e.roleId ?? e.role_id);
          const rate = parseFloat(e.hourlyRate ?? e.hourly_rate);
          if (!isNaN(rate)) _cgActiveRatecardMap[rid] = rate;
          const ov = e.rateOverrides ?? e.rate_overrides;
          if (ov && typeof ov === 'object') _cgActiveRatecardOverrides[rid] = ov;
        });
      }
    } catch (_) {}
  }
  cgSyncRoleRatesToBaseline();
}

// Update r.rate for all roles that haven't been manually customised.
// For non-EUR cost grids: use rate_overrides[currency] if set, else convert EUR × exchange rate.
// Pass force=true to reset even roles marked as rateIsCustom (used on explicit currency change).
function cgSyncRoleRatesToBaseline(force = false) {
  if (!_cgDraft) return;
  const currency     = _cgDraft.currency || 'EUR';
  const currencyRate = parseFloat(
    (window.__currencies || []).find(c => c.code === currency)?.current_rate
  ) || 1.0;
  const allRoles = typeof getRoles === 'function' ? getRoles() : [];
  _cgDraft.roles.forEach(r => {
    if (r.rateIsCustom && !force) return;
    const roleObj  = allRoles.find(gr => gr.code === r.roleCode);
    if (!roleObj) return;
    const rid      = String(roleObj.id);
    const eurRate  = _cgActiveRatecardMap[rid] ?? (roleObj.rate || 0);
    if (currency === 'EUR') {
      r.rate = eurRate;
    } else {
      const rcOverride   = (_cgActiveRatecardOverrides[rid] || {})[currency];
      const roleOverride = (roleObj.rateOverrides || {})[currency];
      r.rate = rcOverride != null ? rcOverride
             : roleOverride != null ? roleOverride
             : Math.round(eurRate * currencyRate * 100) / 100;
    }
    if (force) r.rateIsCustom = false;
  });
}

// Compute what each role's rate would be in targetCurrency without mutating _cgDraft.
// Returns array of { roleCode, roleLabel, currentRate, newRate }.
function cgPreviewRateChange(targetCurrency) {
  if (!_cgDraft) return [];
  const currencyRate = parseFloat(
    (window.__currencies || []).find(c => c.code === targetCurrency)?.current_rate
  ) || 1.0;
  const allRoles = typeof getRoles === 'function' ? getRoles() : [];
  return _cgDraft.roles.map(r => {
    const roleObj = allRoles.find(gr => gr.code === r.roleCode);
    if (!roleObj) return null;
    const rid     = String(roleObj.id);
    const eurRate = _cgActiveRatecardMap[rid] ?? (roleObj.rate || 0);
    let newRate;
    if (targetCurrency === 'EUR') {
      newRate = eurRate;
    } else {
      const rcOverride   = (_cgActiveRatecardOverrides[rid] || {})[targetCurrency];
      const roleOverride = (roleObj.rateOverrides || {})[targetCurrency];
      newRate = rcOverride != null ? rcOverride
              : roleOverride != null ? roleOverride
              : Math.round(eurRate * currencyRate * 100) / 100;
    }
    return { roleCode: r.roleCode, roleLabel: r.roleLabel || r.roleCode, currentRate: r.rate, newRate, isCustom: r.rateIsCustom };
  }).filter(Boolean);
}

async function cgPopulateRatecardDropdown() {
  const sel = document.getElementById('cgRatecardId');
  if (!sel) return;
  if (typeof loadRatecardsForDropdown !== 'function') return;
  const allRatecards = await loadRatecardsForDropdown();

  // Show global ratecards + those specific to the currently selected client
  const clientId = _cgDraft?.clientId && _cgDraft.clientId !== '__unassigned__'
    ? String(_cgDraft.clientId) : null;
  const ratecards = allRatecards.filter(rc =>
    rc.client_id == null || (clientId && String(rc.client_id) === clientId)
  );

  // If the current ratecard is no longer in the filtered list (client switched), reset to None
  const cur = _cgDraft?.ratecardId;
  if (cur && !ratecards.find(rc => String(rc.id) === String(cur))) {
    _cgDraft.ratecardId = null;
  }

  sel.innerHTML = '<option value="">— None (use global role rates) —</option>' +
    ratecards.map(rc => {
      const label = rc.client_name ? `${rc.name} (${rc.client_name})` : rc.name;
      return `<option value="${esc(rc.id)}"${String(rc.id) === String(_cgDraft?.ratecardId) ? ' selected' : ''}>${esc(label)}</option>`;
    }).join('');
  // Populate map so rate cells use the correct baseline
  await cgUpdateActiveRatecardMap();
}

function cgSyncHeaderFromForm() {
  if (!_cgDraft) return;
  _cgDraft.projectName = document.getElementById('cgProjectName')?.value.trim() || '';
  const sd = document.getElementById('cgStartDate')?.value;
  const ed = document.getElementById('cgEndDate')?.value;
  _cgDraft.startDate   = sd ? sd.replace('-','') : '';
  _cgDraft.endDate     = ed ? ed.replace('-','') : '';
  _cgDraft.currency    = document.getElementById('cgCurrency')?.value || 'EUR';
  // Preserve Draft stage — the dropdown is hidden for Draft versions
  if (_cgDraft.pipeline !== 'Draft') {
    _cgDraft.pipeline = document.getElementById('cgPipeline')?.value || 'SIP';
  }
  _cgDraft.note        = document.getElementById('cgNote')?.value.trim() || '';
  _cgDraft.clientId    = document.getElementById('cgClientId')?.value || '__unassigned__';
  _cgDraft.ratecardId  = document.getElementById('cgRatecardId')?.value || null;
  renderCgPhasing();
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

async function openCgRoleSelectModal(mode, sourceRoleCode) {
  _cgRoleModalMode       = mode || 'add';
  _cgRoleModalSourceCode = sourceRoleCode || null;
  _cgRoleAllRoles        = getRoles();
  _cgRoleActiveTeam      = null;
  _cgRoleSearch          = '';

  // Ensure the active ratecard map is current (usually already populated by cgPopulateRatecardDropdown)
  await cgUpdateActiveRatecardMap();
  let rcName = '';
  const rcId = _cgDraft?.ratecardId;
  if (rcId && typeof loadRatecardsForDropdown === 'function') {
    try {
      const list = await loadRatecardsForDropdown();
      const rc   = list.find(r => String(r.id) === String(rcId));
      if (rc) rcName = rc.name;
    } catch (_) {}
  }

  // In 'change' mode exclude source from "already added" so it's selectable as target too
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
    const base = _cgRoleModalMode === 'add'
      ? 'Roles already added are disabled.'
      : 'Select a single role. Roles already in the grid are disabled.';
    const rcHint = rcName
      ? ` <span style="color:var(--indigo-600,#4f46e5)">&#10022; Custom rates from <strong>${esc(rcName)}</strong> applied.</span>`
      : '';
    hintEl.innerHTML = base + rcHint;
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
        const already       = _cgRoleCurrentCodes.has(r.code);
        const roleId        = String(r.id);
        const currency      = _cgDraft?.currency || 'EUR';
        const currencyRate  = parseFloat((window.__currencies || []).find(c => c.code === currency)?.current_rate) || 1.0;
        const curSym        = (window.__currencies || []).find(c => c.code === currency)?.symbol || '€';
        const rcRate        = _cgActiveRatecardMap[roleId];
        const globalRate    = r.rate || 0;
        const eurRate       = rcRate !== undefined ? rcRate : globalRate;
        const override      = currency !== 'EUR' ? (_cgActiveRatecardOverrides[roleId] || {})[currency] : undefined;
        const roleDefault   = currency !== 'EUR' ? (r.rateOverrides || {})[currency] : undefined;
        const effectiveRate = currency === 'EUR' ? eurRate
          : override != null    ? override
          : roleDefault != null ? roleDefault
          : Math.round(eurRate * currencyRate * 100) / 100;
        const hasOverride   = currency !== 'EUR' && (override != null || roleDefault != null);
        // Highlight only when a CLIENT ratecard is active and its rate differs from global default
        const hasCustom     = _cgIsClientRatecard && rcRate !== undefined && rcRate !== globalRate;
        const zeroRate      = !effectiveRate || effectiveRate === 0;
        const rateBadge = zeroRate
          ? `<span class="ms-1 badge" style="background:#fff0f0;color:var(--color-danger);font-size:var(--text-xs)">⚠️ 0/h</span>`
          : hasOverride
            ? `<span class="ms-1 badge" style="background:#eef2ff;color:#4f46e5;border:1px solid #c7d2fe;font-size:var(--text-xs)">&#10022; ${effectiveRate} ${curSym}/h</span>`
          : hasCustom
            ? `<span class="ms-1 badge" style="background:#eef2ff;color:#4f46e5;border:1px solid #c7d2fe;font-size:var(--text-xs)">&#10022; ${effectiveRate} ${curSym}/h</span>`
            : `<span class="ms-1 badge" style="background:var(--sand-50);color:#666;font-size:var(--text-xs)">${effectiveRate} ${curSym}/h</span>`;
        const isSingleMode = _cgRoleModalMode === 'change' || _cgRoleModalMode === 'duplicate';
        const isSource     = r.code === _cgRoleModalSourceCode;
        const inputType    = isSingleMode ? 'radio' : 'checkbox';
        const inputName    = isSingleMode ? 'cgRoleSelectSingle' : undefined;
        const nameAttr     = inputName ? `name="${inputName}"` : '';
        const rowBg        = hasCustom && !already ? 'background:#f5f3ff;border-radius:4px;' : '';
        return `<div class="form-check mb-1" style="${rowBg}">
          <input class="form-check-input cg-role-checkbox" type="${inputType}" id="cgrc_${esc(r.id)}"
            value="${esc(r.code)}" data-label="${esc(r.label)}" data-rate="${effectiveRate}"
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
      _cgDraft.roles[roleIdx] = { roleCode: newCode, roleLabel: cb.dataset.label, rate: parseFloat(cb.dataset.rate) || 0, rateIsCustom: false };
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
    const newRole = { roleCode: newCode, roleLabel: cb.dataset.label, rate: parseFloat(cb.dataset.rate) || 0, rateIsCustom: false };
    _cgDraft.roles.splice(srcIdx + 1, 0, newRole);
    // Copy source hours to new role in all tasks
    _cgDraft.phases.forEach(ph => ph.tasks.forEach(task => {
      if (task.hours[srcCode] !== undefined) task.hours[newCode] = task.hours[srcCode];
    }));

  } else {
    // 'add' mode — original behaviour
    checked.forEach(cb => {
      if (!_cgDraft.roles.find(r => r.roleCode === cb.value)) {
        _cgDraft.roles.push({ roleCode: cb.value, roleLabel: cb.dataset.label, rate: parseFloat(cb.dataset.rate) || 0, rateIsCustom: false });
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
    const h = parseFloat(task.hours[r.roleCode]) || 0;
    totalHrs += h;
    totalFee += h * (r.rate || 0);
  });
  const ptc = parseFloat(task.ptc) || 0;
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
    ptc += parseFloat(task.ptc) || 0;
    (roles || []).forEach(r => { byRole[r.roleCode] = (byRole[r.roleCode] || 0) + (parseFloat(task.hours[r.roleCode]) || 0); });
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
      const h = parseFloat(task.hours[r.roleCode]) || 0;
      result[r.roleCode].hrs = Math.round((result[r.roleCode].hrs + h) * 100) / 100;
      result[r.roleCode].fee += h * (r.rate || 0);
    });
  }));
  return result;
}

// ── PHASING COMPUTATION (shared by panel + generate-project) ─────────────────
// Returns { 'YYYYMM': amount } using the version's task dates and role rates.
// Pass selectedTaskIds array to limit to specific tasks; omit/null for all.

function cgComputePhasing(v, selectedTaskIds) {
  const vs = v.startDate, ve = v.endDate;
  if (!vs || !ve || vs.length < 6 || ve.length < 6) return {};
  const sy = parseInt(vs.slice(0, 4)), sm = parseInt(vs.slice(4, 6));
  const ey = parseInt(ve.slice(0, 4)), em = parseInt(ve.slice(4, 6));
  const months = [];
  let y = sy, mo = sm;
  while (y < ey || (y === ey && mo <= em)) {
    months.push(`${y}-${String(mo).padStart(2, '0')}`);
    if (++mo > 12) { mo = 1; y++; }
  }
  if (!months.length) return {};

  function distribute(hrs, taskStart, taskEnd) {
    let allMonths;
    if (taskStart && taskEnd && taskStart.length >= 7) {
      const tsy = parseInt(taskStart.slice(0, 4)), tsm = parseInt(taskStart.slice(5, 7));
      const tey = parseInt(taskEnd.slice(0, 4)),   tem = parseInt(taskEnd.slice(5, 7));
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
    const out = {};
    for (const m of allMonths) {
      if (m >= months[0] && m <= months[months.length - 1]) out[m] = (out[m] || 0) + hpp;
    }
    return out;
  }

  const monthAmount = {};
  months.forEach(m => { monthAmount[m] = 0; });

  (v.phases || []).forEach(ph => {
    (ph.tasks || []).forEach(task => {
      if (selectedTaskIds && !selectedTaskIds.includes(task.taskId)) return;
      (v.roles || []).forEach(r => {
        const h = parseFloat(task.hours[r.roleCode]) || 0;
        if (!h) return;
        const dist = distribute(h, task.taskStartDate, task.taskEndDate);
        for (const [m, hh] of Object.entries(dist)) {
          if (m in monthAmount) monthAmount[m] += hh * (r.rate || 0);
        }
      });
    });
  });

  // Project phasing grid uses YYYYMM keys (no dash)
  const result = {};
  for (const [m, amt] of Object.entries(monthAmount)) {
    if (amt > 0) result[m.replace('-', '')] = Math.round(amt);
  }
  return result;
}

// ── PHASING PANEL ────────────────────────────────────────────────────────────

function renderCgPhasing() {
  const panel = document.getElementById('cgPhasingPanel');
  if (!panel) return;
  const v = _cgDraft;
  if (!v) { panel.style.display = 'none'; return; }

  // Determine month range from version dates (YYYYMM)
  const vs = v.startDate, ve = v.endDate;
  if (!vs || !ve || vs.length < 6 || ve.length < 6) { panel.style.display = 'none'; return; }
  const sy = parseInt(vs.slice(0, 4)), sm = parseInt(vs.slice(4, 6));
  const ey = parseInt(ve.slice(0, 4)), em = parseInt(ve.slice(4, 6));

  const months = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; y++; }
  }
  if (!months.length) { panel.style.display = 'none'; return; }

  // Distribute task-role hours proportionally across its months (fallback: version range)
  function distribute(hrs, taskStart, taskEnd) {
    let allMonths;
    if (taskStart && taskEnd && taskStart.length >= 7) {
      // taskStart is YYYY-MM-DD
      const tsy = parseInt(taskStart.slice(0, 4)), tsm = parseInt(taskStart.slice(5, 7));
      const tey = parseInt(taskEnd.slice(0, 4)),   tem = parseInt(taskEnd.slice(5, 7));
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
    for (const mo of allMonths) {
      if (mo >= months[0] && mo <= months[months.length - 1]) {
        result[mo] = (result[mo] || 0) + hpp;
      }
    }
    return result;
  }

  // Accumulate per-month totals
  const monthHours  = {};
  const monthAmount = {};
  months.forEach(mo => { monthHours[mo] = 0; monthAmount[mo] = 0; });

  (v.phases || []).forEach(ph => {
    (ph.tasks || []).forEach(task => {
      (v.roles || []).forEach(r => {
        const h = parseFloat(task.hours[r.roleCode]) || 0;
        if (!h) return;
        const dist = distribute(h, task.taskStartDate, task.taskEndDate);
        for (const [mo, hh] of Object.entries(dist)) {
          if (mo in monthHours) {
            monthHours[mo]  += hh;
            monthAmount[mo] += hh * (r.rate || 0);
          }
        }
      });
    });
  });

  const cur   = v.currency || 'EUR';
  const fmtA  = n => cur + ' ' + Math.round(n).toLocaleString('en');
  const fmtH  = n => (Math.round(n * 10) / 10) + ' h';
  const fmtMo = mo => {
    const [my, mm] = mo.split('-');
    return new Date(parseInt(my), parseInt(mm) - 1).toLocaleString('en', { month: 'short' }) + ' ' + my;
  };

  const totalAmt = months.reduce((s, mo) => s + monthAmount[mo], 0);
  const totalH   = months.reduce((s, mo) => s + monthHours[mo], 0);

  const thCells = months.map(mo =>
    `<th style="text-align:right;padding:5px 8px;font-size:.75rem;font-weight:700;white-space:nowrap;min-width:90px;border-bottom:2px solid #dee2e6">${fmtMo(mo)}</th>`
  ).join('');

  const amtCells = months.map(mo =>
    `<td style="text-align:right;padding:5px 8px;font-size:.78rem;font-weight:700;white-space:nowrap">${fmtA(monthAmount[mo])}</td>`
  ).join('');

  const hrsCells = months.map(mo =>
    `<td style="text-align:right;padding:3px 8px;font-size:.72rem;color:#6b7280;white-space:nowrap">${fmtH(monthHours[mo])}</td>`
  ).join('');

  panel.style.display = '';
  panel.innerHTML = `
    <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <div style="background:#0B1840;color:#fff;padding:.5rem 1rem;font-size:.82rem;font-weight:700;display:flex;align-items:center;justify-content:space-between">
        <span>📅 Monthly Phasing</span>
        <span style="font-weight:400;font-size:.75rem;color:#93c5fd">
          Total: ${fmtA(totalAmt)} · ${fmtH(totalH)} · ${months.length} month${months.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div style="overflow-x:auto">
        <table style="border-collapse:collapse;width:100%">
          <thead>
            <tr style="background:#f8f9fa">
              <th style="text-align:left;padding:5px 10px;font-size:.75rem;font-weight:700;border-bottom:2px solid #dee2e6;white-space:nowrap">Metric</th>
              ${thCells}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:5px 10px;font-size:.78rem;font-weight:700;white-space:nowrap">Budget (${cur})</td>
              ${amtCells}
            </tr>
            <tr style="background:#fafbfc">
              <td style="padding:3px 10px;font-size:.72rem;color:#6b7280;white-space:nowrap">Hours</td>
              ${hrsCells}
            </tr>
          </tbody>
        </table>
      </div>
    </div>`;
}

// ── PARTIAL REFRESH ───────────────────────────────────────────────────────────
// Updates totals cells only — avoids full re-render on each keystroke.
// Column layout: 0=name, 1=desc, 2=cost, 3=ptc-input, 4=hrs, 5=fees, 6+=roles

function cgRefreshTotals() {
  const v         = _cgDraft;
  const cur       = v.currency || 'EUR';
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
  renderCgPhasing();
}

// ── SAVE ──────────────────────────────────────────────────────────────────────

function cgAutoSave() {
  if (!_cgActiveCgId || !_cgActiveVersionId || !_cgDraft) return Promise.resolve();
  cgSyncHeaderFromForm();
  const cg = cgLoad(_cgActiveCgId);
  if (!cg) return Promise.resolve();
  const idx = cg.versions.findIndex(v => v.versionId === _cgActiveVersionId);
  if (idx >= 0) cg.versions[idx] = _cgDraft;
  cgSave(cg);
  if (typeof _cgUpsertVersionToApi !== 'undefined') {
    return _cgUpsertVersionToApi(_cgActiveCgId, _cgActiveVersionId)
      .catch(e => console.warn('[sync] cgAutoSave:', e.message));
  }
  return Promise.resolve();
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

// ── PUBLISH DRAFT ─────────────────────────────────────────────────────────────

async function cgPublishDraft() {
  if (!_cgActiveCgId || !_cgActiveVersionId) return;
  const cg = cgLoad(_cgActiveCgId);
  const ver = cg?.versions.find(v => v.versionId === _cgActiveVersionId);
  if (!ver || ver.pipeline !== 'Draft') return;

  const otherDrafts = cg.versions.filter(v => v.versionId !== _cgActiveVersionId && v.pipeline === 'Draft');
  const otherWarn = otherDrafts.length > 0
    ? `\n\n⚠️ ${otherDrafts.length} other draft version${otherDrafts.length > 1 ? 's' : ''} (${otherDrafts.map(v => v.versionLabel).join(', ')}) will be permanently deleted.`
    : '';

  showConfirm(
    `Publish "${ver.versionLabel}" to SIP?${otherWarn}\n\nThis version will become visible to your team and cannot be set back to Draft.`,
    async () => {
      await cgAutoSave();
      try {
        // Delete all other Draft versions from the DB first
        for (const other of otherDrafts) {
          await Api.costGrids.versions.delete(_cgActiveCgId, other.versionId);
        }

        const updated = await Api.costGrids.versions.publish(_cgActiveCgId, _cgActiveVersionId);

        const cgFresh = cgLoad(_cgActiveCgId);
        if (cgFresh) {
          // Remove the deleted drafts from the in-memory store
          cgFresh.versions = cgFresh.versions.filter(v =>
            v.versionId === _cgActiveVersionId || v.pipeline !== 'Draft'
          );
          const v = cgFresh.versions.find(v => v.versionId === _cgActiveVersionId);
          if (v) { v.pipeline = 'SIP'; v.pipelineYear = updated.pipeline_year || null; }
          cgSave(cgFresh);
        }
        if (_cgDraft) { _cgDraft.pipeline = 'SIP'; _cgDraft.pipelineYear = updated.pipeline_year || null; }
        renderCgEditor();
        const tabs = cgLoad(_cgActiveCgId);
        if (tabs) renderCgVersionTabs(tabs);
      } catch (e) {
        alert('Failed to publish: ' + e.message);
      }
    },
    null, '🚀 Publish to SIP'
  );
}

// ── NEW VERSION ───────────────────────────────────────────────────────────────

async function cgCreateNewVersion() {
  const label = document.getElementById('cgNewVersionLabel')?.value.trim();
  const errEl = document.getElementById('cgNewVersionError');
  if (!label) {
    if (errEl) { errEl.textContent = 'Please enter a label.'; errEl.classList.remove('d-none'); }
    return;
  }
  if (errEl) errEl.classList.add('d-none');

  // Save current version before branching
  cgAutoSave();

  // Create on the server first to get a server-assigned UUID.
  // This prevents duplicate rows from repeated upsert attempts with a client UUID.
  let serverId;
  try {
    const src = _cgDraft;
    const created = await Api.costGrids.versions.create(_cgActiveCgId, {
      label,
      currency:    src.currency    || 'EUR',
      clientId:    (src.clientId && src.clientId !== '__unassigned__') ? src.clientId : null,
      ratecardId:  src.ratecardId  || null,
      startDate:   src.startDate   || null,
      endDate:     src.endDate     || null,
      note:        src.note        || '',
      projectName: src.projectName || '',
    });
    serverId = created.id;
  } catch(e) {
    if (errEl) { errEl.textContent = 'API error: ' + e.message; errEl.classList.remove('d-none'); }
    return;
  }

  // Copy phases/roles structure to the new version
  if ((_cgDraft.phases || []).length > 0) {
    await Api.costGrids.versions.saveStructure(_cgActiveCgId, serverId, {
      phases: _cgDraft.phases,
      roles:  _cgDraft.roles || [],
    }).catch(e => console.warn('[sync] cgCreateNewVersion saveStructure:', e.message));
  }

  // Store in localStorage using the server UUID
  const cg = cgLoad(_cgActiveCgId);
  if (!cg) return;
  const newVer = JSON.parse(JSON.stringify(_cgDraft));
  newVer.versionId      = serverId;
  newVer.versionLabel   = label;
  newVer.createdAt      = new Date().toISOString();
  newVer.status         = 'draft';
  newVer.pipeline       = 'Draft';
  newVer.pipelineYear   = null;
  newVer.linkedProjects = [];
  delete newVer.linkedProjectId;
  cg.versions.push(newVer);
  cgSave(cg);

  bootstrap.Modal.getInstance(document.getElementById('cgNewVersionModal'))?.hide();
  document.getElementById('cgNewVersionLabel').value = '';
  showCostGridEditorView(_cgActiveCgId, serverId);
}

// ── CREATE NEW GRID ───────────────────────────────────────────────────────────

async function cgCreateNewGrid() {
  const name  = document.getElementById('cgNewGridName')?.value.trim();
  const errEl = document.getElementById('cgNewGridError');
  if (!name) {
    if (errEl) { errEl.textContent = 'Please enter a name.'; errEl.classList.remove('d-none'); }
    return;
  }
  if (errEl) errEl.classList.add('d-none');

  // Create on the API first to get server-assigned IDs.
  // POST /api/cost-grids ignores any client-provided id, so we must use the
  // UUID from the response — otherwise version creates fail with a FK violation.
  let cgId, verId;
  try {
    const newCg  = await Api.costGrids.create({ name });
    cgId = newCg.id;
    const newVer = await Api.costGrids.versions.create(cgId, { label: 'v1' });
    verId = newVer.id;
    await Api.costGrids.versions.saveStructure(cgId, verId, {
      phases: [{ phaseName: 'Phase 1', tasks: [] }],
      roles:  [],
    }).catch(() => {});
  } catch (e) {
    if (errEl) { errEl.textContent = 'API error: ' + e.message; errEl.classList.remove('d-none'); }
    return;
  }

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
      startDate:      '',
      endDate:        '',
      currency:       '€',
      note:           '',
      roles:          [],
      phases:         [{ phaseId: cgNewPhId(), phaseName: 'Phase 1', tasks: [] }],
    }],
  };
  const idx = cgGetIndex();
  if (!idx.includes(cgId)) idx.push(cgId);
  cgSaveIndex(idx);
  cgSave(cg);
  bootstrap.Modal.getInstance(document.getElementById('cgNewGridModal'))?.hide();
  document.getElementById('cgNewGridName').value = '';
  showCostGridEditorView(cgId, verId);
}

// ── CLONE GRID ────────────────────────────────────────────────────────────────

async function cgCloneGrid() {
  const name  = document.getElementById('cgCloneGridName')?.value.trim();
  const errEl = document.getElementById('cgCloneError');
  if (!name) {
    if (errEl) { errEl.textContent = 'Please enter a name.'; errEl.classList.remove('d-none'); }
    return;
  }
  if (errEl) errEl.classList.add('d-none');

  const { cgId: srcCgId, verId: srcVerId } = _pbCloneSource || {};
  if (!srcCgId || !srcVerId) return;

  // Cancel any pending autosave before starting async clone operations
  clearTimeout(_cgAutoSaveTimer);

  // Load full structure from API if not already in memory
  if (typeof cgLoadStructureFromApi === 'function') {
    await cgLoadStructureFromApi(srcCgId, srcVerId).catch(() => {});
  }
  const srcCg  = cgLoad(srcCgId);
  const srcVer = srcCg?.versions.find(v => v.versionId === srcVerId);
  if (!srcVer) {
    if (errEl) { errEl.textContent = 'Source proposal not found.'; errEl.classList.remove('d-none'); }
    return;
  }

  try {
    // 1. Create new cost grid and version on the API
    const newCg  = await Api.costGrids.create({ name });
    const cgId   = newCg.id;
    const newVer = await Api.costGrids.versions.create(cgId, {
      label:      'v1',
      currency:   srcVer.currency    || 'EUR',
      clientId:   srcVer.clientId    || null,
      ratecardId: srcVer.ratecardId  || null,
      startDate:  srcVer.startDate   || '',
      endDate:    srcVer.endDate     || '',
      note:       srcVer.note        || '',
      projectName: name,
    });
    const verId = newVer.id;

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
    // On costgrid.html, showCostGridEditorView re-renders in place without changing the URL.
    // Update URL to point to the new clone so refresh/back button work correctly.
    const curUrl = new URL(window.location.href);
    if (curUrl.searchParams.get('cgId') && curUrl.searchParams.get('cgId') !== cgId) {
      curUrl.searchParams.set('cgId', cgId);
      curUrl.searchParams.set('verId', verId);
      window.history.replaceState(null, '', curUrl.toString());
    }
  } catch(e) {
    if (errEl) { errEl.textContent = 'Clone failed: ' + e.message; errEl.classList.remove('d-none'); }
  }
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

async function cgDoAddTasksToProject(projId, selectedTaskIds) {
  const v = _cgDraft;
  const proj = (config.projects || []).find(p => p.id === projId);
  if (!proj) { alert('Project not found in local config.'); return; }

  // Build new task objects to append to the project
  const newTasks = [];
  (v.phases || []).forEach(ph => {
    (ph.tasks || []).forEach(task => {
      if (!selectedTaskIds.includes(task.taskId)) return;
      if (!task.taskName?.trim()) return;
      newTasks.push({
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

  // Append tasks to project in memory and push to API
  if (!proj.tasks) proj.tasks = [];
  proj.tasks.push(...newTasks);
  await _pushProjectToApi(proj).catch(e => console.warn('[sync] addTasksToProject failed:', e.message));

  // Update task_ids + task_names_direct in cg_version_projects (upsert via POST)
  const lp = (_cgDraft.linkedProjects || []).find(l => l.projectId === projId);
  if (lp) {
    const updatedTaskIds = [...(lp.taskIds || []), ...selectedTaskIds];
    // Resolve names for all assigned taskIds (union of previous + new)
    const resolveNameForId = tid => {
      for (const ph of v.phases || []) {
        const t = ph.tasks.find(t => t.taskId === tid);
        if (t?.taskName?.trim()) return t.taskName.trim();
      }
      return null;
    };
    const updatedTaskNames = [...new Set([
      ...(lp.taskNames || []),
      ...selectedTaskIds.map(resolveNameForId).filter(Boolean),
    ])];
    lp.taskIds   = updatedTaskIds;
    lp.taskNames = updatedTaskNames;
    await Api.costGrids.versions.linkedProjects.add(
      _cgActiveCgId, _cgActiveVersionId,
      { projectId: projId, taskIds: updatedTaskIds, taskNames: updatedTaskNames }
    ).catch(e => console.warn('[sync] task_ids update failed:', e.message));
  }

  // Sync back to _cgStore
  const cg = cgLoad(_cgActiveCgId);
  if (cg) {
    const storeVer = cg.versions.find(v => v.versionId === _cgActiveVersionId);
    if (storeVer) storeVer.linkedProjects = JSON.parse(JSON.stringify(_cgDraft.linkedProjects));
    cgSave(cg);
  }

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
  const generatedId = crypto.randomUUID();

  // Version dates are authoritative (they define the contract period).
  // Task dates are used only when the version has no dates set.
  const toYYYYMM = iso => iso ? iso.slice(0, 7).replace('-', '') : '';
  const selTasks  = (v.phases || []).flatMap(ph => ph.tasks).filter(t => selectedTaskIds.includes(t.taskId));
  const startDates = selTasks.map(t => t.taskStartDate).filter(Boolean).sort();
  const endDates   = selTasks.map(t => t.taskEndDate).filter(Boolean).sort();
  const now = new Date();
  const defaultStart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const defaultEnd   = (() => { const d = new Date(now.getFullYear(), now.getMonth() + 12, 1); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`; })();
  const projStart = v.startDate || (startDates.length ? toYYYYMM(startDates[0]) : null) || defaultStart;
  const projEnd   = v.endDate   || (endDates.length   ? toYYYYMM(endDates[endDates.length - 1]) : null) || defaultEnd;

  const ptc = selTasks
    .filter(t => t.ptc > 0)
    .map(t => ({
      title:  t.taskName || '',
      note:   '',
      amount: t.ptc,
      month:  t.taskStartDate ? toYYYYMM(t.taskStartDate) : '',
    }));

  const newProject = {
    id:        generatedId,
    code:      '',
    name:      projectName,
    startDate: projStart,
    endDate:   projEnd,
    currency:  v.currency || 'EUR',
    pipeline:  _cgDraft.pipeline || 'SIP',
    status:    '',
    note:      v.note     || '',
    tasks,
    phasing:   {},
    planning:  {},
    ptc,
    groups:    [],
    costGridRef: { cgId: _cgActiveCgId, versionId: _cgActiveVersionId },
    clientId:  _cgDraft.clientId || '__unassigned__',
  };
  config.projects.push(newProject);
  persistConfig();
  const selectedTaskNames = selectedTaskIds.map(tid => {
    const t = (v.phases || []).flatMap(ph => ph.tasks).find(t => t.taskId === tid);
    return t?.taskName?.trim() || null;
  }).filter(Boolean);

  _pushProjectToApi(newProject).then(() =>
    Api.costGrids.versions.linkedProjects.add(_cgActiveCgId, _cgActiveVersionId, { projectId: generatedId, taskIds: selectedTaskIds, taskNames: selectedTaskNames })
      .catch(e => console.warn('[sync] linkedProject link failed:', e.message))
  );

  if (!_cgDraft.linkedProjects) _cgDraft.linkedProjects = [];
  _cgDraft.linkedProjects.push({
    projectId:   generatedId,
    projectName: projectName,
    taskIds:     selectedTaskIds,
    taskNames:   selectedTaskNames,
    createdAt:   new Date().toISOString(),
  });
  _cgDraft.status = 'sip';

  _cgSelectionMode = false;
  _cgSelectedTaskIds = new Set();

  // Sync linkedProjects back to _cgStore so cgGetVersionLockState hides the Generate button
  const cg = cgLoad(_cgActiveCgId);
  if (cg) {
    const storeVer = cg.versions.find(v => v.versionId === _cgActiveVersionId);
    if (storeVer) storeVer.linkedProjects = [..._cgDraft.linkedProjects];
    cgSave(cg);
    renderCgVersionTabs(cg);
  }

  cgAutoSave();

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
  const cur = v.currency || 'EUR';
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
          () => {
            cgSaveIndex(data.index);
            data.grids.forEach(cg => {
              cgSave(cg);
              if (typeof _cgUpsertVersionToApi !== 'undefined') {
                cg.versions.forEach(v =>
                  _cgUpsertVersionToApi(cg.id, v.versionId)
                    .catch(e => console.warn('[sync] import:', e.message))
                );
              }
            });
            if (typeof renderPipelineBoard === 'function') renderPipelineBoard();
          },
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

// Returns Set of lower-cased task names that are assigned to a linked project.
// Used as a robust fallback when task UUIDs may have changed.
function cgGetAssignedTaskNames() {
  const names = new Set();
  (_cgDraft?.linkedProjects || []).forEach(lp =>
    (lp.taskNames || []).forEach(n => { if (n?.trim()) names.add(n.trim().toLowerCase()); })
  );
  return names;
}

// Singleton modal appended to document.body so it's not clipped by the sticky bar z-index.
function _cgEnsureAddToProjectModal() {
  let m = document.getElementById('cgAddToProjectModal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'cgAddToProjectModal';
    m.style.cssText = 'display:none;position:fixed;inset:0;z-index:10500;background:rgba(0,0,0,.5);align-items:center;justify-content:center;';
    m.innerHTML = `
      <div style="max-width:480px;width:100%;margin:0 auto">
        <div class="modal-content shadow-lg">
          <div class="modal-header py-2 px-3" style="background:var(--brand-navy);color:#fff;border-bottom:none">
            <h6 class="modal-title mb-0">＋ Add tasks to project</h6>
          </div>
          <div class="modal-body px-3 py-3" id="cgAddToProjectModalBody"></div>
          <div class="modal-footer py-2 px-3 gap-2">
            <button class="btn btn-sm btn-outline-secondary" id="cgAddToProjectCancel">Cancel</button>
            <button class="btn btn-sm btn-warning" id="cgAddToProjectConfirm">Confirm</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(m);

    m.querySelector('#cgAddToProjectCancel').addEventListener('click', () => { m.style.display = 'none'; });
    m.querySelector('#cgAddToProjectConfirm').addEventListener('click', async () => {
      const projId = m.dataset.projId;
      const taskIds = JSON.parse(m.dataset.taskIds || '[]');
      m.style.display = 'none';
      await cgDoAddTasksToProject(projId, taskIds);
    });
  }
  return m;
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
