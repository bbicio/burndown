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

// Bridge to the mounted Vue instance on costgrid.html (set once by its created() hook).
// On pipeline.html this global is redefined again, further down that page's own script,
// as a plain redirect — that override still wins there exactly as it did before this migration.
let _cgVueApp = null;

async function showCostGridEditorView(cgId, versionId) {
  if (_cgVueApp) { await _cgVueApp.openVersion(cgId, versionId); return; }
  // No mounted Vue app (e.g. this global was called before mount, or from a page that
  // never sets _cgVueApp) — nothing to do; every real caller on costgrid.html runs after mount.
  console.warn('[costgrid] showCostGridEditorView called before _cgVueApp is ready', cgId, versionId);
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
    cgConfirmDeleteGrid(cgId, cg.name, onSuccess);
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
  if (_cgVueApp) { _cgVueApp.cg = cg ? JSON.parse(JSON.stringify(cg)) : null; return; }
  console.warn('[costgrid] renderCgVersionTabs called before _cgVueApp is ready', cg);
}

// ── EDITOR RENDER ─────────────────────────────────────────────────────────────
// Table columns (fixed, index 0–5):
//   0: Fase / Task  1: Descrizione  2: TOTAL COST and FEE  3: Pass-through Costs  4: Total hrs  5: Total fees
// Then role columns from index 6 onwards.

function renderCgEditor() {
  if (_cgVueApp) _cgVueApp.resyncFromGlobals();
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
    const resolved = resolveRoleRate({
      roleId: roleObj.id, globalRate: roleObj.rate || 0, currency, currencyRate,
      ratecardMap: _cgActiveRatecardMap, ratecardOverrides: _cgActiveRatecardOverrides,
      roleOverrides: roleObj.rateOverrides || {},
    });
    r.rate = resolved.effectiveRate;
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
    const resolved = resolveRoleRate({
      roleId: roleObj.id, globalRate: roleObj.rate || 0, currency: targetCurrency, currencyRate,
      ratecardMap: _cgActiveRatecardMap, ratecardOverrides: _cgActiveRatecardOverrides,
      roleOverrides: roleObj.rateOverrides || {},
    });
    return { roleCode: r.roleCode, roleLabel: r.roleLabel || r.roleCode, currentRate: r.rate, newRate: resolved.effectiveRate, isCustom: r.rateIsCustom };
  }).filter(Boolean);
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

// Sets the module-level mode/source globals cgAddSelectedRoles() still reads, then
// delegates the actual modal UI to the mounted Vue instance (Task 6).
function openCgRoleSelectModal(mode, sourceRoleCode) {
  _cgRoleModalMode = mode || 'add';
  _cgRoleModalSourceCode = sourceRoleCode || null;
  if (_cgVueApp) _cgVueApp.openRoleModal(mode, sourceRoleCode);
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
        showConfirm('Failed to publish: ' + e.message, null, null, '⚠️ Publish failed');
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
    const srcStructureLoaded = await cgLoadStructureFromApi(srcCgId, srcVerId);
    if (!srcStructureLoaded) {
      if (errEl) { errEl.textContent = 'Could not load the source proposal\'s structure. Please try again.'; errEl.classList.remove('d-none'); }
      return;
    }
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
    const structureLoaded = await cgLoadStructureFromApi(cgId, verId);
    if (!structureLoaded) {
      showConfirm(
        'The new proposal was created, but its structure may not have loaded correctly. Please reload the page to verify.',
        null, null, '⚠️ Clone incomplete'
      );
    }

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

function cgFmtDate(yyyymm) {
  if (!yyyymm || yyyymm.length < 6) return '';
  const mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${mn[parseInt(yyyymm.slice(4,6)) - 1]} ${yyyymm.slice(0,4)}`;
}
