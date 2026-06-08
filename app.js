// ── STATE ─────────────────────────────────────────────────────────────────────
let timesheetData = [];
let config = { projects: [] };
let burndownChartInst = null;
let selectedProjectId = null;
let currentCfg = null;
let burndownInterval = 'monthly';
let portfolioOpen = false;
let planningInterval = 'monthly';
let planningProjectId = null;
let planningViewMode = 'bytask'; // 'bytask' or 'byrole'
let portfolioPlanningFilters = new Set(); // active pipeline filters
let portfolioMonthlyPulse   = true;       // aggregate low-h/week roles monthly
let portfolioProjectFilters = new Set();  // selected project IDs (empty = all)
let portfolioRoundHours    = true;        // round hour values in resource planning table
let portfolioPlanningView  = 'byrole';    // 'byrole' | 'byproject' | 'byowner'
let ppWindowStart = null;  // Date: first day of first visible month (null = uninitialized)
let ppWindowEnd   = null;  // Date: last day of last visible month (null = uninitialized)
let ppViewInterval   = 'monthly'; // 'monthly' | 'weekly'
let planningReturnToBurndown = false; // true when planning opened from burndown view
let portfolioTeamFilters = new Set(); // selected teams (empty = all)
const CONFIG_KEY     = 'burndown_v2_config';
const DATA_INDEX_KEY = 'burndown_v2_data_index';
const SUMMARY_KEY    = 'burndown_v2_summary';

let portfolioSummaryProjects = new Set(); // project IDs selected for the summary table

const AI_MODELS = {
  anthropic: [
    { id: 'claude-opus-4-7',           label: 'Claude Opus 4.7 (powerful)' },
    { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6 (balanced)' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fast)' },
  ],
  openai: [
    { id: 'gpt-4o',        label: 'GPT-4o (powerful)' },
    { id: 'gpt-4o-mini',   label: 'GPT-4o Mini (fast)' },
    { id: 'gpt-4-turbo',   label: 'GPT-4 Turbo' },
    { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (economical)' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash (fast)' },
    { id: 'gemini-1.5-pro',       label: 'Gemini 1.5 Pro (powerful)' },
    { id: 'gemini-1.5-flash',     label: 'Gemini 1.5 Flash (economical)' },
  ],
};

// ── TEAM FILTER HELPER ────────────────────────────────────────────────────────
function rolePassesTeamFilter(role) {
  if (portfolioTeamFilters.size === 0) return true;
  const dash = role ? role.indexOf(' - ') : -1;
  const team = dash > 0 ? role.slice(0, dash).trim() : role || '';
  return portfolioTeamFilters.has(team);
}

// ── PLANNING PERIOD HELPERS ───────────────────────────────────────────────────
function buildMonthPeriods(weeks) {
  const periods = [];
  weeks.forEach(w => {
    let p = periods.find(p => p.key === w.monthKey);
    if (!p) {
      p = { key: w.monthKey, label: w.monthKey, weekKeys: [], isPast: true, isCurrent: false };
      periods.push(p);
    }
    p.weekKeys.push(w.weekStart.toISOString());
    if (!w.isPast) p.isPast = false;
    if (w.isCurrent) p.isCurrent = true;
  });
  return periods;
}

function getPpAxis() {
  const projects = config.projects || [];
  let axisStart = null, axisEnd = null;
  projects.forEach(p => {
    const s = p.startDate ? parseTaskDate(p.startDate, false) : null;
    const e = p.endDate   ? parseTaskDate(p.endDate,   true)  : null;
    if (s && (!axisStart || s < axisStart)) axisStart = new Date(s.getFullYear(), s.getMonth(), 1);
    if (e && (!axisEnd   || e > axisEnd))   axisEnd   = new Date(e.getFullYear(), e.getMonth() + 1, 0);
  });
  const now = new Date();
  if (!axisStart) axisStart = new Date(now.getFullYear(), now.getMonth(), 1);
  if (!axisEnd)   axisEnd   = new Date(now.getFullYear(), now.getMonth() + 11, 0);
  return { axisStart, axisEnd };
}

function updatePpWindowWidget() {
  if (!ppWindowStart || !ppWindowEnd) return;
  const { axisStart, axisEnd } = getPpAxis();
  const mn = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  const sLabel = `${mn[ppWindowStart.getMonth()]} ${ppWindowStart.getFullYear()}`;
  const eLabel = `${mn[ppWindowEnd.getMonth()]} ${ppWindowEnd.getFullYear()}`;
  const el = document.getElementById('ppWindowLabel');
  if (el) el.textContent = `${sLabel} – ${eLabel}`;
  const atLeftLimit  = ppWindowStart <= axisStart;
  const atRightLimit = ppWindowEnd   >= axisEnd;
  const nextStart = new Date(ppWindowStart.getFullYear(), ppWindowStart.getMonth() + 1, 1);
  const prevEnd   = new Date(ppWindowEnd.getFullYear(),   ppWindowEnd.getMonth(),       0);
  const atMinWidth = nextStart > prevEnd;
  const btnEL = document.getElementById('btnPpExpandLeft');
  const btnSL = document.getElementById('btnPpShrinkLeft');
  const btnER = document.getElementById('btnPpExpandRight');
  const btnSR = document.getElementById('btnPpShrinkRight');
  if (btnEL) btnEL.disabled = atLeftLimit;
  if (btnSL) btnSL.disabled = atMinWidth;
  if (btnER) btnER.disabled = atRightLimit;
  if (btnSR) btnSR.disabled = atMinWidth;
}

// ── STORAGE ───────────────────────────────────────────────────────────────────
function storageGet(key) {
  try { return localStorage.getItem(key); } catch(e) { return null; }
}
function storageSet(key, val) {
  try { localStorage.setItem(key, val); } catch(e) {}
}

// ── PROJECT DATA CACHE ────────────────────────────────────────────────────────
function dataKey(pid) { return `burndown_v2_data_${pid}`; }

function getDataIndex() {
  try { const s = storageGet(DATA_INDEX_KEY); return s ? JSON.parse(s) : []; } catch(e) { return []; }
}
function addToDataIndex(pid) {
  const idx = getDataIndex();
  if (!idx.includes(pid)) { idx.push(pid); storageSet(DATA_INDEX_KEY, JSON.stringify(idx)); }
}
function removeFromDataIndex(pid) {
  storageSet(DATA_INDEX_KEY, JSON.stringify(getDataIndex().filter(id => id !== pid)));
}
function saveProjectData(pid, rows) {
  storageSet(dataKey(pid), JSON.stringify(
    rows.map(r => ({ ...r, date: r.date ? r.date.toISOString() : null }))
  ));
}
function loadProjectData(pid) {
  try {
    const s = storageGet(dataKey(pid));
    if (!s) return [];
    return JSON.parse(s).map(r => ({ ...r, date: r.date ? new Date(r.date) : null }));
  } catch(e) { return []; }
}
function refreshTimesheetData() {
  timesheetData = [];
  getDataIndex().forEach(pid => timesheetData.push(...loadProjectData(pid)));
}
function clearProjectData(pid) {
  try { localStorage.removeItem(dataKey(pid)); } catch(e) {}
  removeFromDataIndex(pid);
  refreshTimesheetData();
}

// ── CONFIG ────────────────────────────────────────────────────────────────────
function loadConfig() {
  try { const s = storageGet(CONFIG_KEY); if (s) config = JSON.parse(s); } catch(e) {}
}
function persistConfig() { storageSet(CONFIG_KEY, JSON.stringify(config)); }

function loadSummarySelection() {
  try { const s = storageGet(SUMMARY_KEY); if (s) portfolioSummaryProjects = new Set(JSON.parse(s)); } catch(e) {}
}
function saveSummarySelection() { storageSet(SUMMARY_KEY, JSON.stringify([...portfolioSummaryProjects])); }

function hasAiKey() {
  return !!(config.anthropicApiKey || config.openaiApiKey || config.geminiApiKey);
}
function hasEmailConfig() {
  return !!(config.emailjsKey && config.emailjsService && config.emailjsTemplate);
}

function updateAiButtonVisibility() {
  const navBtn = document.getElementById('btnToggleAiSidebar');
  if (navBtn) navBtn.style.display = hasAiKey() ? '' : 'none';
  updateAiProviderBadge();
}

function updateAiProviderBadge() {
  const el = document.getElementById('aiProviderBadge');
  if (!el) return;
  const provider = config.aiProvider || 'anthropic';
  const model    = config.aiModel    || '';
  const icons = { anthropic: '🟣', openai: '🟢', gemini: '🔵' };
  const names = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Gemini' };
  const models = AI_MODELS[provider] || [];
  const modelLabel = (models.find(m => m.id === model)?.label || model || models[0]?.label || '').replace(/ \(.*\)/, '');
  el.textContent = `${icons[provider] || '🤖'} ${names[provider] || provider} · ${modelLabel}`;
}

// ── CONFIG FORM ────────────────────────────────────────────────────────────────
let cfgEditConfig = null;
let cfgProjectIdx = -1;
let cfgActiveTab  = 'form';

function openConfigModal(projectId) {
  cfgEditConfig = JSON.parse(JSON.stringify(config));
  if (!Array.isArray(cfgEditConfig.projects)) cfgEditConfig.projects = [];
  document.getElementById('cfgJsonError').classList.add('d-none');
  document.getElementById('cfgAnthropicKey').value    = config.anthropicApiKey || '';
  document.getElementById('cfgOpenaiKey').value       = config.openaiApiKey    || '';
  document.getElementById('cfgGeminiKey').value       = config.geminiApiKey    || '';
  document.getElementById('cfgEmailjsKey').value      = config.emailjsKey      || '';
  document.getElementById('cfgEmailjsService').value  = config.emailjsService  || '';
  document.getElementById('cfgEmailjsTemplate').value = config.emailjsTemplate || '';
  document.getElementById('cfgAiProvider').value      = config.aiProvider      || 'anthropic';
  cfgUpdateModelDropdown(config.aiProvider || 'anthropic', config.aiModel || '');
  cfgActiveTab = 'form';
  document.getElementById('cfgTabForm').style.display = 'block';
  document.getElementById('cfgTabJson').style.display = 'none';
  document.querySelectorAll('.cfg-tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === 'form'));
  cfgPopulateProjectDropdown();

  // Pre-select the given project if provided, otherwise default to first
  let startIdx = cfgEditConfig.projects.length > 0 ? 0 : -1;
  if (projectId) {
    const found = cfgEditConfig.projects.findIndex(
      p => p.id && p.id.trim().toLowerCase() === projectId.trim().toLowerCase()
    );
    if (found >= 0) startIdx = found;
  }
  cfgSelectProject(startIdx);

  new bootstrap.Modal(document.getElementById('configModal')).show();
}

function cfgUpdateModelDropdown(provider, selectedModel) {
  const sel = document.getElementById('cfgAiModel');
  if (!sel) return;
  const models = AI_MODELS[provider] || [];
  sel.innerHTML = models.map(m =>
    `<option value="${m.id}"${m.id === selectedModel ? ' selected' : ''}>${m.label}</option>`
  ).join('');
  if (!sel.value && models.length) sel.value = models[0].id;
}

function cfgPopulateProjectDropdown() {
  const sel = document.getElementById('cfgProjectSel');
  sel.innerHTML = '';
  if (!cfgEditConfig.projects.length) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = '— No projects —';
    sel.appendChild(o);
    return;
  }
  cfgEditConfig.projects.forEach((p, i) => {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = p.name || p.id || `Project ${i + 1}`;
    sel.appendChild(o);
  });
}

function cfgSelectProject(idx) {
  cfgProjectIdx = idx;
  const has = idx >= 0 && idx < cfgEditConfig.projects.length;
  document.getElementById('cfgFormSections').style.display = has ? 'block' : 'none';
  document.getElementById('cfgNoProjectMsg').style.display = has ? 'none'  : 'block';
  document.getElementById('cfgBtnDelProject').disabled = !has;
  if (has) {
    document.getElementById('cfgProjectSel').value = idx;
    cfgLoadProject(cfgEditConfig.projects[idx]);
  }
}

function cfgSaveCurrentToState() {
  if (cfgProjectIdx < 0 || cfgProjectIdx >= cfgEditConfig.projects.length) return;
  cfgEditConfig.projects[cfgProjectIdx] = cfgReadFormProject();
}

// ── LOAD / READ PROJECT ────────────────────────────────────────────────────────
function cfgLoadProject(proj) {
  document.getElementById('cfgId').value        = proj.id       || '';
  document.getElementById('cfgName').value      = proj.name     || '';
  document.getElementById('cfgStartDate').value = ym2month(proj.startDate);
  document.getElementById('cfgEndDate').value   = ym2month(proj.endDate);
  document.getElementById('cfgCurrency').value  = proj.currency || '€';
  document.getElementById('cfgPipeline').value = proj.pipeline || '';
  cfgApplyPipelineRules(proj.pipeline || '', proj.status || '');
  cfgRenderTasks(proj.tasks    || []);
  cfgRenderPhasingGrid(proj.phasing  || {});
  cfgRenderPlanningGrid(proj.planning || {});
  cfgRenderPtcList(proj.ptc    || []);
  cfgRenderGroups(proj.groups  || []);
  cfgSyncRollbackButtons();
}

function cfgReadFormProject() {
  return {
    id:        document.getElementById('cfgId').value.trim(),
    name:      document.getElementById('cfgName').value.trim(),
    startDate: month2ym(document.getElementById('cfgStartDate').value),
    endDate:   month2ym(document.getElementById('cfgEndDate').value),
    currency:  document.getElementById('cfgCurrency').value,
    pipeline:  document.getElementById('cfgPipeline').value,
    status:    document.getElementById('cfgStatus').value,
    tasks:     cfgReadTasks(),
    phasing:   cfgReadGrid('cfg-phasing-input'),
    planning:  cfgReadGrid('cfg-planning-input'),
    ptc:       cfgReadPtcList(),
    groups:    cfgReadGroups(),
  };
}

function cfgMarkDirty() {
  // Called when a config form field changes; no-op here (state is read on save).
}

function cfgApplyPipelineRules(pipeline, currentStatus) {
  const sel = document.getElementById('cfgStatus');
  const allOpts = ['Not started yet', 'Started At Risk', 'Started', 'Put on hold', 'Complete'];
  const allowed = {
    'SIP':              [],
    'Expected':         ['Not started yet', 'Started At Risk', 'Put on hold', 'Complete'],
    'Anticipated':      ['Not started yet', 'Started At Risk', 'Put on hold', 'Complete'],
    'Committed':        ['Started', 'Put on hold', 'Complete'],
    'Started':          ['Started', 'Started At Risk', 'Put on hold', 'Complete'],
    'Started at risk':  ['Started', 'Started At Risk', 'Put on hold', 'Complete'],
    'On Hold':          ['Not started yet', 'Started At Risk', 'Put on hold', 'Complete'],
    'Canceled':         null, // keep value, disable
  };

  const opts = pipeline ? allowed[pipeline] : allOpts;

  if (pipeline === 'SIP') {
    sel.innerHTML = '<option value="">— Select —</option>';
    sel.disabled = true;
    sel.value = '';
  } else if (pipeline === 'Canceled') {
    sel.disabled = true;
    // keep current options and value
  } else {
    const list = opts || allOpts;
    sel.innerHTML = '<option value="">— Select —</option>' +
      list.map(o => `<option value="${o}">${o}</option>`).join('');
    sel.disabled = false;
    sel.value = list.includes(currentStatus) ? currentStatus : '';
  }
}

function ym2month(ym) {
  return (ym && ym.length >= 6) ? ym.slice(0, 4) + '-' + ym.slice(4, 6) : '';
}
function month2ym(m) { return m ? m.replace('-', '') : ''; }

// Task date helpers (YYYYMMDD ↔ YYYY-MM-DD)
function ymd2date(ymd) {
  if (!ymd) return '';
  if (ymd.length === 8) return `${ymd.slice(0,4)}-${ymd.slice(4,6)}-${ymd.slice(6,8)}`;
  if (ymd.length === 6) return `${ymd.slice(0,4)}-${ymd.slice(4,6)}-01`; // legacy YYYYMM
  return '';
}
function date2ymd(d) { return d ? d.replace(/-/g, '') : ''; }

// Parse a task date string (YYYYMMDD or legacy YYYYMM) to a JS Date.
// isEnd=true → last day of month for YYYYMM; first day for YYYYMMDD is exact.
function parseTaskDate(str, isEnd) {
  if (!str) return isEnd ? new Date(9999, 11, 31) : new Date(0);
  if (str.length >= 8) {
    return new Date(parseInt(str.slice(0,4)), parseInt(str.slice(4,6))-1, parseInt(str.slice(6,8)));
  }
  const y = parseInt(str.slice(0,4)), m = parseInt(str.slice(4,6));
  return isEnd ? new Date(y, m, 0) : new Date(y, m-1, 1);
}

// ── TASKS ──────────────────────────────────────────────────────────────────────
function cfgRenderTasks(tasks) {
  const c = document.getElementById('cfgTaskList');
  c.innerHTML = '';
  tasks.forEach(t => c.appendChild(cfgMakeTaskCard(t)));
  cfgUpdateGrandTotals();
}

function cfgMakeTaskCard(task) {
  const card = document.createElement('div');
  card.className = 'cfg-task-card border rounded p-3 mb-3';
  const isBillable = task.billable !== false;
  card.innerHTML = `
    <div class="d-flex align-items-center gap-2 mb-3">
      <span class="text-muted small text-nowrap">Task name:</span>
      <input type="text" class="form-control form-control-sm cfg-task-name fw-semibold"
             placeholder="must match Task/Issue column in XLS"
             value="${esc(task.name || '')}">
      <div class="form-check form-switch mb-0 flex-shrink-0 d-flex align-items-center gap-1" title="Uncheck to exclude this task from all reports and charts">
        <input class="form-check-input cfg-task-billable" type="checkbox" role="switch" ${isBillable ? 'checked' : ''}>
        <label class="form-check-label small text-nowrap">Include in report</label>
      </div>
      <div class="form-check form-switch mb-0 flex-shrink-0 d-flex align-items-center gap-1" title="Mark task as completed">
        <input class="form-check-input cfg-task-completed" type="checkbox" role="switch" ${task.completed ? 'checked' : ''}>
        <label class="form-check-label small text-nowrap">Completed</label>
      </div>
      <button class="btn btn-sm btn-outline-danger flex-shrink-0 cfg-btn-del-task">🗑 Remove</button>
    </div>
    <div class="d-flex align-items-center gap-2 mb-3 flex-wrap">
      <span class="text-muted small text-nowrap">Period:</span>
      <input type="date" class="form-control form-control-sm cfg-task-start" style="width:160px"
             value="${ymd2date(task.startDate || '')}">
      <span class="text-muted small">→</span>
      <input type="date" class="form-control form-control-sm cfg-task-end" style="width:160px"
             value="${ymd2date(task.endDate || '')}">
      <span class="text-muted small">(optional — defaults to project dates)</span>
    </div>
    <div class="table-responsive mb-2">
      <table class="table table-sm table-bordered mb-0" style="table-layout:fixed;width:100%">
        <colgroup>
          <col>
          <col style="width:110px">
          <col style="width:110px">
          <col style="width:110px">
          <col style="width:32px">
        </colgroup>
        <thead style="background:#f8f9fa">
          <tr>
            <th>Job Role: Name <span class="fw-normal text-muted small">(must match XLS)</span></th>
            <th class="text-end">Sold Hours</th>
            <th class="text-end">Hourly Rate</th>
            <th class="text-end">Subtotal</th>
            <th></th>
          </tr>
        </thead>
        <tbody class="cfg-res-tbody">
          ${(task.resources || []).map(cfgResRowHTML).join('')}
        </tbody>
        <tfoot>
          <tr style="background:#f8f9fa">
            <td colspan="3" class="text-end small fw-bold py-1">Task total</td>
            <td class="text-end fw-bold cfg-task-total py-1">—</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <button class="btn btn-sm btn-outline-primary cfg-add-res-btn">+ Add resource</button>`;

  const updateTotals = () => cfgUpdateTaskTotals(card);

  card.querySelector('.cfg-btn-del-task').addEventListener('click', () => {
    const name = card.querySelector('.cfg-task-name').value.trim() || 'this task';
    showConfirm(`Delete task "${name}" and all its resources?`, () => { card.remove(); cfgUpdateGrandTotals(); });
  });
  card.querySelector('.cfg-add-res-btn').addEventListener('click', () => {
    const tr = document.createElement('tr');
    tr.innerHTML = cfgResRowHTML({ role: '', soldHours: 0, hourlyRate: 0 });
    cfgBindResRow(tr, updateTotals);
    card.querySelector('.cfg-res-tbody').appendChild(tr);
    updateTotals();
  });
  card.querySelectorAll('.cfg-res-tbody tr').forEach(tr => cfgBindResRow(tr, updateTotals));
  updateTotals();
  return card;
}

function cfgUpdateTaskTotals(card) {
  const cur = document.getElementById('cfgCurrency')?.value || '€';
  const fmt = n => `${cur} ${Math.round(n).toLocaleString('en-US')}`;
  let total = 0;
  card.querySelectorAll('.cfg-res-tbody tr').forEach(tr => {
    const h   = parseFloat(tr.querySelector('.cfg-res-hours').value) || 0;
    const r   = parseFloat(tr.querySelector('.cfg-res-rate').value)  || 0;
    const sub = h * r;
    total += sub;
    tr.querySelector('.cfg-res-subtotal').textContent = sub > 0 ? fmt(sub) : '—';
  });
  card.querySelector('.cfg-task-total').textContent = total > 0 ? fmt(total) : '—';
  cfgUpdateGrandTotals();
}

function cfgUpdateGrandTotals() {
  const cur = document.getElementById('cfgCurrency')?.value || '€';
  const fmt = n => `${cur} ${Math.round(n).toLocaleString('en-US')}`;
  let totalHours = 0, totalBudget = 0;
  document.querySelectorAll('.cfg-task-card .cfg-res-tbody tr').forEach(tr => {
    const h     = parseFloat(tr.querySelector('.cfg-res-hours').value) || 0;
    const r     = parseFloat(tr.querySelector('.cfg-res-rate').value)  || 0;
    totalHours  += h;
    totalBudget += h * r;
  });
  const hoursEl  = document.getElementById('cfgGrandTotalHours');
  const budgetEl = document.getElementById('cfgGrandTotalBudget');
  if (hoursEl)  hoursEl.textContent  = totalHours  > 0 ? totalHours.toLocaleString('en-US')  : '—';
  if (budgetEl) budgetEl.textContent = totalBudget > 0 ? fmt(totalBudget) : '—';
  let totalPtc = 0;
  document.querySelectorAll('.cfg-ptc-card .cfg-ptc-amount').forEach(el => {
    totalPtc += parseFloat(el.value) || 0;
  });
  const ptcEl = document.getElementById('cfgGrandTotalPtc');
  if (ptcEl) ptcEl.textContent = totalPtc > 0 ? fmt(totalPtc) : '—';
}

function cfgResRowHTML(r) {
  return `<tr>
    <td><input type="text" class="form-control form-control-sm cfg-res-role"
               placeholder="e.g. HWGDEV - DEVELOPER" value="${esc(r.role || '')}"></td>
    <td><input type="number" class="form-control form-control-sm text-end cfg-res-hours"
               min="0" step="0.5" value="${r.soldHours ?? 0}"></td>
    <td><input type="number" class="form-control form-control-sm text-end cfg-res-rate"
               min="0" step="1" value="${r.hourlyRate ?? 0}"></td>
    <td class="text-end cfg-res-subtotal small fw-semibold align-middle">—</td>
    <td class="text-center"><button class="btn btn-sm btn-link text-danger p-0">✕</button></td>
  </tr>`;
}

function cfgBindResRow(tr, onUpdate) {
  tr.querySelector('button').addEventListener('click', () => {
    const role = tr.querySelector('.cfg-res-role').value.trim() || 'this resource';
    showConfirm(`Remove resource "${role}"?`, () => { tr.remove(); onUpdate?.(); });
  });
  if (onUpdate) {
    tr.querySelector('.cfg-res-hours').addEventListener('input', onUpdate);
    tr.querySelector('.cfg-res-rate').addEventListener('input', onUpdate);
  }
}

function cfgReadTasks() {
  return [...document.querySelectorAll('.cfg-task-card')].map(card => ({
    name:      card.querySelector('.cfg-task-name').value.trim(),
    billable:  card.querySelector('.cfg-task-billable').checked,
    completed: card.querySelector('.cfg-task-completed').checked,
    startDate: date2ymd(card.querySelector('.cfg-task-start').value),
    endDate:   date2ymd(card.querySelector('.cfg-task-end').value),
    resources: [...card.querySelectorAll('.cfg-res-tbody tr')].map(tr => ({
      role:       tr.querySelector('.cfg-res-role').value.trim(),
      soldHours:  parseFloat(tr.querySelector('.cfg-res-hours').value) || 0,
      hourlyRate: parseFloat(tr.querySelector('.cfg-res-rate').value)  || 0,
    })).filter(r => r.role),
  }));
}

// ── PHASING / PLANNING GRIDS ───────────────────────────────────────────────────
function cfgGetMonthRange() {
  const s = document.getElementById('cfgStartDate').value;
  const e = document.getElementById('cfgEndDate').value;
  if (!s || !e) return [];
  const [sy, sm] = s.split('-').map(Number);
  const [ey, em] = e.split('-').map(Number);
  const months = [];
  let cy = sy, cm = sm;
  while (cy < ey || (cy === ey && cm <= em)) {
    months.push(`${cy}${String(cm).padStart(2, '0')}`);
    cm++; if (cm > 12) { cm = 1; cy++; }
  }
  return months;
}

function cfgRenderPhasingGrid(phasing) {
  const months = cfgGetMonthRange();
  document.getElementById('cfgPhasingGrid').innerHTML = months.length
    ? cfgGridHTML(months, phasing, 'cfg-phasing-input')
    : '<p class="text-muted small mb-0">Set Start and End month first.</p>';
}

function cfgRenderPlanningGrid(planning) {
  const months = cfgGetMonthRange();
  document.getElementById('cfgPlanningGrid').innerHTML = months.length
    ? cfgGridHTML(months, planning, 'cfg-planning-input')
    : '<p class="text-muted small mb-0">Set Start and End month first.</p>';
}

function cfgReforecastSnapshotKey() {
  const pid = document.getElementById('cfgId')?.value.trim();
  return pid ? `reforecast_snapshot_${pid}` : null;
}

function cfgSaveReforecastSnapshot() {
  const key = cfgReforecastSnapshotKey();
  if (!key) return;
  localStorage.setItem(key, JSON.stringify({
    phasing:  cfgReadGrid('cfg-phasing-input'),
    planning: cfgReadGrid('cfg-planning-input'),
    savedAt:  Date.now(),
  }));
  cfgSyncRollbackButtons();
}

function cfgSyncRollbackButtons() {
  const key      = cfgReforecastSnapshotKey();
  const raw      = key ? localStorage.getItem(key) : null;
  const snapshot = raw ? JSON.parse(raw) : null;
  const hasSnap  = !!snapshot;
  const dateStr  = hasSnap
    ? new Date(snapshot.savedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
  ['cfgBtnRollbackPhasing', 'cfgBtnRollbackPlanning'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = !hasSnap;
    btn.title    = hasSnap ? `Restore snapshot saved on ${dateStr}` : 'No snapshot available';
    btn.querySelector('.rollback-date').textContent = hasSnap ? dateStr : '';
  });
}

function cfgRollbackReforecast() {
  const key = cfgReforecastSnapshotKey();
  if (!key) return;
  const raw = key ? localStorage.getItem(key) : null;
  if (!raw) return;
  const snapshot = JSON.parse(raw);
  const savedDate = new Date(snapshot.savedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

  const modalEl = document.getElementById('confirmModal');
  document.getElementById('confirmModalTitle').textContent = '↩ Rollback reforecast';
  document.getElementById('confirmModalMessage').innerHTML = `
    <p class="mb-2">This will restore phasing and planning to the snapshot saved on <strong>${savedDate}</strong>.</p>
    <p class="text-danger fw-semibold mb-0">⚠ Current reforecast values will be lost.</p>`;

  const okOld = document.getElementById('confirmModalOk');
  const okBtn = okOld.cloneNode(true);
  okOld.replaceWith(okBtn);

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  let confirmed = false;

  okBtn.addEventListener('click', () => { confirmed = true; modal.hide(); });
  modalEl.addEventListener('hidden.bs.modal', () => {
    if (!confirmed) return;
    cfgRenderPhasingGrid(snapshot.phasing   || {});
    cfgRenderPlanningGrid(snapshot.planning || {});
    localStorage.removeItem(key);
    cfgSyncRollbackButtons();
  }, { once: true });

  modalEl.addEventListener('shown.bs.modal', () => {
    modalEl.style.zIndex = '1200';
    const backdrops = document.querySelectorAll('.modal-backdrop');
    if (backdrops.length > 0) backdrops[backdrops.length - 1].style.zIndex = '1190';
  }, { once: true });

  modal.show();
}

function cfgDerivePhasing() {
  const tasks  = cfgReadTasks().filter(t => t.billable !== false);
  const months = cfgGetMonthRange();
  if (!months.length) { alert('Set project dates first.'); return; }

  const cfgStart = month2ym(document.getElementById('cfgStartDate').value);
  const cfgEnd   = month2ym(document.getElementById('cfgEndDate').value);
  const cur      = document.getElementById('cfgCurrency')?.value || '€';

  // Pre-compute new grids
  const newPhasing = {}, newPlanning = {};
  months.forEach(ym => {
    const [y, m]   = [parseInt(ym.slice(0,4)), parseInt(ym.slice(4,6))];
    const mStart   = new Date(y, m-1, 1);
    const mEnd     = new Date(y, m, 0);
    let budget = 0, hours = 0;
    tasks.forEach(task => {
      const tStart = parseTaskDate(task.startDate || cfgStart, false);
      const tEnd   = parseTaskDate(task.endDate   || cfgEnd,   true);
      const tDays  = Math.max(1, (tEnd - tStart) / 86400000 + 1);
      const oStart = new Date(Math.max(mStart, tStart));
      const oEnd   = new Date(Math.min(mEnd,   tEnd));
      const oDays  = Math.max(0, (oEnd - oStart) / 86400000 + 1);
      if (oDays <= 0) return;
      const frac   = oDays / tDays;
      budget += task.resources.reduce((s, r) => s + (r.soldHours||0) * (r.hourlyRate||0), 0) * frac;
      hours  += task.resources.reduce((s, r) => s + (r.soldHours||0), 0) * frac;
    });
    if (budget > 0) newPhasing[ym]  = Math.round(budget);
    if (hours  > 0) newPlanning[ym] = Math.round(hours * 10) / 10;
  });

  const totalBudget = Object.values(newPhasing).reduce((s, v) => s + v, 0);
  const totalHours  = Object.values(newPlanning).reduce((s, v) => s + v, 0);
  const fmtB = n => `${cur} ${Math.round(n).toLocaleString('en-US')}`;

  const modalEl = document.getElementById('confirmModal');
  document.getElementById('confirmModalTitle').textContent = '⟳ Derive from task dates';
  document.getElementById('confirmModalMessage').innerHTML = `
    <p class="mb-2">Phasing and planning will be computed from task date ranges, distributing each task's budget proportionally to the days of overlap with each month.</p>
    <ul class="mb-3">
      <li>Total budget distributed: <strong>${fmtB(totalBudget)}</strong> across ${months.length} months</li>
      <li>Total hours distributed: <strong>${totalHours.toLocaleString('en-US')} h</strong></li>
    </ul>
    <p class="mb-0 text-muted small">The current values will be saved as a snapshot for rollback.</p>`;

  const okOld = document.getElementById('confirmModalOk');
  const okBtn = okOld.cloneNode(true);
  okOld.replaceWith(okBtn);

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  let confirmed = false;
  okBtn.addEventListener('click', () => { confirmed = true; modal.hide(); });
  modalEl.addEventListener('hidden.bs.modal', () => {
    if (!confirmed) return;
    cfgSaveReforecastSnapshot();
    cfgRenderPhasingGrid(newPhasing);
    cfgRenderPlanningGrid(newPlanning);
  }, { once: true });
  modalEl.addEventListener('shown.bs.modal', () => {
    modalEl.style.zIndex = '1200';
    const bd = document.querySelectorAll('.modal-backdrop');
    if (bd.length > 0) bd[bd.length-1].style.zIndex = '1190';
  }, { once: true });
  modal.show();
}

function cfgReforecast() {
  const projectId = document.getElementById('cfgId').value.trim();
  const tasks     = cfgReadTasks().filter(t => t.billable !== false);
  const months    = cfgGetMonthRange();

  if (!months.length) { alert('Set project start and end dates first.'); return; }

  const now       = new Date();
  const currentYM = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Rate map: role (lowercase) → hourlyRate
  const rateMap = new Map();
  tasks.forEach(t => t.resources.forEach(r => {
    if (r.role && !rateMap.has(r.role.toLowerCase()))
      rateMap.set(r.role.toLowerCase(), r.hourlyRate || 0);
  }));

  const billableNames = new Set(tasks.map(t => t.name.toLowerCase()));
  const projData = timesheetData.filter(r =>
    r.projectId === projectId && billableNames.has(r.task?.toLowerCase())
  );

  // Actuals per month from XLS
  const actualSpend = {}, actualHours = {};
  projData.forEach(r => {
    if (!r.date) return;
    const ym   = `${r.date.getFullYear()}${String(r.date.getMonth() + 1).padStart(2, '0')}`;
    const rate = rateMap.get(r.role?.toLowerCase()) ?? 0;
    actualSpend[ym]  = (actualSpend[ym]  || 0) + r.hours * rate;
    actualHours[ym]  = (actualHours[ym]  || 0) + r.hours;
  });

  // Totals from config tasks
  const totalBudget = tasks.reduce((s, t) => s + t.resources.reduce((rs, r) => rs + (r.soldHours || 0) * (r.hourlyRate || 0), 0), 0);
  const totalHours  = tasks.reduce((s, t) => s + t.resources.reduce((rs, r) => rs + (r.soldHours || 0), 0), 0);

  const pastMonths   = months.filter(ym => ym <  currentYM);
  const futureMonths = months.filter(ym => ym >= currentYM);

  const pastSpend = pastMonths.reduce((s, ym) => s + (actualSpend[ym]  || 0), 0);
  const pastHrs   = pastMonths.reduce((s, ym) => s + (actualHours[ym] || 0), 0);

  const remainingBudget = totalBudget - pastSpend;
  const remainingHours  = totalHours  - pastHrs;
  const futureCount     = futureMonths.length || 1;
  const monthlyBudget   = remainingBudget / futureCount;
  const monthlyHours    = remainingHours  / futureCount;

  const cur  = document.getElementById('cfgCurrency')?.value || '€';
  const fmtB = n => `${cur} ${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
  const fmtH = n => `${+(Math.round(Math.abs(n) + 'e1') + 'e-1')} h`;

  const modalEl = document.getElementById('confirmModal');
  document.getElementById('confirmModalTitle').textContent = '↻ Reforecast from actuals';
  document.getElementById('confirmModalMessage').innerHTML = `
    <p class="mb-2">Phasing and planning grids will be fully overwritten:</p>
    <ul class="mb-3">
      <li><strong>Past months (${pastMonths.length})</strong> — replaced with actual spend &amp; hours from loaded XLS data</li>
      <li><strong>Current &amp; future months (${futureMonths.length})</strong> — remaining balance split equally:
        <ul class="mt-1 mb-0">
          <li>Budget: <strong>${fmtB(remainingBudget)}</strong> ÷ ${futureCount} = <strong>${fmtB(monthlyBudget)} / month</strong>${remainingBudget < 0 ? ' <span class="text-danger">(over budget)</span>' : ''}</li>
          <li>Hours:&nbsp; <strong>${fmtH(remainingHours)}</strong> ÷ ${futureCount} = <strong>${fmtH(monthlyHours)} / month</strong>${remainingHours < 0 ? ' <span class="text-danger">(over hours)</span>' : ''}</li>
        </ul>
      </li>
    </ul>
    <p class="mb-0 text-muted small">The current values will be saved as a snapshot for rollback.</p>`;

  const okOld = document.getElementById('confirmModalOk');
  const okBtn = okOld.cloneNode(true);
  okOld.replaceWith(okBtn);

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  let confirmed = false;

  okBtn.addEventListener('click', () => { confirmed = true; modal.hide(); });
  modalEl.addEventListener('hidden.bs.modal', () => {
    if (!confirmed) return;
    cfgSaveReforecastSnapshot();
    const newPhasing = {}, newPlanning = {};
    pastMonths.forEach(ym => {
      if ((actualSpend[ym]  || 0) > 0) newPhasing[ym]  = Math.round(actualSpend[ym]);
      if ((actualHours[ym] || 0) > 0) newPlanning[ym] = Math.round(actualHours[ym] * 10) / 10;
    });
    futureMonths.forEach(ym => {
      if (monthlyBudget > 0) newPhasing[ym]  = Math.round(monthlyBudget);
      if (monthlyHours  > 0) newPlanning[ym] = Math.round(monthlyHours * 10) / 10;
    });
    cfgRenderPhasingGrid(newPhasing);
    cfgRenderPlanningGrid(newPlanning);
  }, { once: true });

  modalEl.addEventListener('shown.bs.modal', () => {
    modalEl.style.zIndex = '1200';
    const backdrops = document.querySelectorAll('.modal-backdrop');
    if (backdrops.length > 0) backdrops[backdrops.length - 1].style.zIndex = '1190';
  }, { once: true });

  modal.show();
}

function cfgGridHTML(months, existing, cls) {
  return '<div class="cfg-month-grid">' + months.map(ym => {
    const [y, m] = [parseInt(ym.slice(0, 4)), parseInt(ym.slice(4, 6))];
    const label  = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const val    = existing[ym] != null ? existing[ym] : '';
    return `<div class="cfg-month-cell">
      <div class="cfg-month-label">${label}</div>
      <input type="number" class="form-control form-control-sm text-end ${cls}"
             data-ym="${ym}" min="0" step="1" placeholder="0" value="${val}">
    </div>`;
  }).join('') + '</div>';
}

function cfgReadGrid(cls) {
  const result = {};
  document.querySelectorAll(`.${cls}`).forEach(inp => {
    const val = parseFloat(inp.value);
    if (!isNaN(val) && val > 0) result[inp.dataset.ym] = val;
  });
  return result;
}

// ── PASS THROUGH COSTS (PTC) ──────────────────────────────────────────────────
function cfgGetProjectMonths() {
  const months = cfgGetMonthRange();
  return months;
}

function cfgPtcMonthOptions(selected) {
  const months = cfgGetProjectMonths();
  if (!months.length) return '<option value="">— set project dates first —</option>';
  return months.map(ym => {
    const [y, m] = [parseInt(ym.slice(0, 4)), parseInt(ym.slice(4, 6))];
    const label  = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const sel    = ym === selected ? ' selected' : '';
    return `<option value="${ym}"${sel}>${label}</option>`;
  }).join('');
}

function cfgRenderPtcList(ptcItems) {
  const c = document.getElementById('cfgPtcList');
  c.innerHTML = '';
  ptcItems.forEach(item => c.appendChild(cfgMakePtcCard(item)));
  cfgUpdateGrandTotals();
}

function cfgMakePtcCard(item) {
  const card = document.createElement('div');
  card.className = 'cfg-ptc-card border rounded p-3 mb-2';
  card.innerHTML = `
    <div class="row g-2 align-items-start">
      <div class="col-sm-3">
        <label class="form-label small text-muted mb-1">Title</label>
        <input type="text" class="form-control form-control-sm cfg-ptc-title"
               placeholder="e.g. Software licence" value="${esc(item.title || '')}">
      </div>
      <div class="col-sm-4">
        <label class="form-label small text-muted mb-1">Note</label>
        <input type="text" class="form-control form-control-sm cfg-ptc-note"
               placeholder="optional description" value="${esc(item.note || '')}">
      </div>
      <div class="col-sm-2">
        <label class="form-label small text-muted mb-1">Amount</label>
        <input type="number" class="form-control form-control-sm text-end cfg-ptc-amount"
               min="0" step="1" value="${item.amount ?? 0}">
      </div>
      <div class="col-sm-2">
        <label class="form-label small text-muted mb-1">Month</label>
        <select class="form-select form-select-sm cfg-ptc-month">
          ${cfgPtcMonthOptions(item.month || '')}
        </select>
      </div>
      <div class="col-sm-1 d-flex align-items-end">
        <button class="btn btn-sm btn-outline-danger w-100 cfg-ptc-del-btn">🗑</button>
      </div>
    </div>`;
  card.querySelector('.cfg-ptc-del-btn').addEventListener('click', () => {
    const title = card.querySelector('.cfg-ptc-title').value.trim() || 'this entry';
    showConfirm(`Remove PTC "${title}"?`, () => { card.remove(); cfgUpdateGrandTotals(); });
  });
  card.querySelector('.cfg-ptc-amount').addEventListener('input', () => cfgUpdateGrandTotals());
  return card;
}

function cfgReadPtcList() {
  return [...document.querySelectorAll('.cfg-ptc-card')].map(card => ({
    title:  card.querySelector('.cfg-ptc-title').value.trim(),
    note:   card.querySelector('.cfg-ptc-note').value.trim(),
    amount: parseFloat(card.querySelector('.cfg-ptc-amount').value) || 0,
    month:  card.querySelector('.cfg-ptc-month').value,
  })).filter(p => p.title || p.amount);
}

// ── GROUPS ─────────────────────────────────────────────────────────────────────
function cfgRenderGroups(groups) {
  const c = document.getElementById('cfgGroupList');
  c.innerHTML = '';
  groups.forEach(g => c.appendChild(cfgMakeGroupCard(g)));
}

function cfgMakeGroupCard(grp) {
  const card = document.createElement('div');
  card.className = 'cfg-group-card border rounded p-3 mb-2';
  card.innerHTML = `
    <div class="d-flex align-items-center gap-2 mb-2">
      <span class="text-muted small text-nowrap">Group name:</span>
      <input type="text" class="form-control form-control-sm cfg-group-name"
             placeholder="e.g. Development" value="${esc(grp.name || '')}">
      <button class="btn btn-sm btn-outline-danger flex-shrink-0">🗑</button>
    </div>
    <label class="form-label small text-muted mb-1">Roles (one per line, must match Job Role: Name column in XLS):</label>
    <textarea class="form-control form-control-sm cfg-group-roles font-monospace" rows="3"
              placeholder="HWGDEV - DEVELOPER&#10;HWGINTERN - ACCSVS">${esc((grp.roles || []).join('\n'))}</textarea>`;
  card.querySelector('button').addEventListener('click', () => card.remove());
  return card;
}

function cfgReadGroups() {
  return [...document.querySelectorAll('.cfg-group-card')].map(card => ({
    name:  card.querySelector('.cfg-group-name').value.trim(),
    roles: card.querySelector('.cfg-group-roles').value
               .split('\n').map(s => s.trim()).filter(Boolean),
  })).filter(g => g.name);
}

// ── TAB SWITCHING ──────────────────────────────────────────────────────────────
function cfgSwitchTab(tab) {
  if (tab === 'json' && cfgActiveTab === 'form') {
    if (cfgProjectIdx >= 0) cfgSaveCurrentToState();
    document.getElementById('configEditor').value = JSON.stringify(cfgEditConfig, null, 2);
  }
  if (tab === 'form' && cfgActiveTab === 'json') {
    try {
      cfgEditConfig = JSON.parse(document.getElementById('configEditor').value);
      if (!Array.isArray(cfgEditConfig.projects)) cfgEditConfig.projects = [];
      cfgPopulateProjectDropdown();
      const idx = Math.min(Math.max(cfgProjectIdx, 0), cfgEditConfig.projects.length - 1);
      cfgSelectProject(cfgEditConfig.projects.length > 0 ? idx : -1);
      document.getElementById('cfgJsonError').classList.add('d-none');
    } catch(e) {
      document.getElementById('cfgJsonError').textContent = 'Cannot switch: invalid JSON — ' + e.message;
      document.getElementById('cfgJsonError').classList.remove('d-none');
      return;
    }
  }
  cfgActiveTab = tab;
  document.getElementById('cfgTabForm').style.display = tab === 'form' ? 'block' : 'none';
  document.getElementById('cfgTabJson').style.display = tab === 'json' ? 'block' : 'none';
  document.querySelectorAll('.cfg-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
}

// ── SAVE CONFIG ────────────────────────────────────────────────────────────────
function saveConfig() {
  try {
    const editedProjectId = cfgActiveTab === 'form' && cfgProjectIdx >= 0
      ? cfgEditConfig.projects[cfgProjectIdx]?.id
      : null;

    if (cfgActiveTab === 'form') {
      if (cfgProjectIdx >= 0) cfgSaveCurrentToState();
      config = cfgEditConfig;
    } else {
      config = JSON.parse(document.getElementById('configEditor').value);
    }
    config.anthropicApiKey = document.getElementById('cfgAnthropicKey').value.trim();
    config.openaiApiKey    = document.getElementById('cfgOpenaiKey').value.trim();
    config.geminiApiKey    = document.getElementById('cfgGeminiKey').value.trim();
    config.aiProvider      = document.getElementById('cfgAiProvider').value || 'anthropic';
    config.aiModel         = document.getElementById('cfgAiModel').value || '';
    config.emailjsKey      = document.getElementById('cfgEmailjsKey').value.trim();
    config.emailjsService  = document.getElementById('cfgEmailjsService').value.trim();
    config.emailjsTemplate = document.getElementById('cfgEmailjsTemplate').value.trim();
    persistConfig();
    updateAiButtonVisibility();
    bootstrap.Modal.getInstance(document.getElementById('configModal')).hide();
    document.getElementById('cfgJsonError').classList.add('d-none');
    const inPortfolio         = document.getElementById('portfolioSection').style.display         !== 'none';
    const inPortfolioPlanning = document.getElementById('portfolioPlanningSection').style.display !== 'none';
    if (inPortfolioPlanning) {
      renderPortfolioPlanningView();
    } else if (selectedProjectId) {
      if (editedProjectId && editedProjectId !== selectedProjectId) {
        showDashboardView(editedProjectId);
      } else {
        renderDashboard(selectedProjectId);
      }
    } else if (inPortfolio) {
      renderPortfolioView();
    }
  } catch(e) {
    document.getElementById('cfgJsonError').textContent = 'Save failed: ' + e.message;
    document.getElementById('cfgJsonError').classList.remove('d-none');
  }
}

// ── IMPORT / EXPORT ────────────────────────────────────────────────────────────
function importConfigFile() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json';
  inp.addEventListener('change', e => {
    const fr = new FileReader();
    fr.onload = ev => {
      try {
        cfgEditConfig = JSON.parse(ev.target.result);
        if (!Array.isArray(cfgEditConfig.projects)) cfgEditConfig.projects = [];
        // Populate the editor so cfgSwitchTab can parse it correctly
        document.getElementById('configEditor').value = JSON.stringify(cfgEditConfig, null, 2);
        cfgActiveTab = 'json';
        cfgSwitchTab('form');
      } catch(err) {
        cfgActiveTab = 'form';
        cfgSwitchTab('json');
        document.getElementById('configEditor').value = ev.target.result;
        document.getElementById('cfgJsonError').textContent = 'Invalid JSON: ' + err.message;
        document.getElementById('cfgJsonError').classList.remove('d-none');
      }
    };
    fr.readAsText(e.target.files[0]);
  });
  inp.click();
}

function exportConfig() {
  const content = cfgActiveTab === 'form'
    ? (cfgProjectIdx >= 0 && cfgSaveCurrentToState(), JSON.stringify(cfgEditConfig, null, 2))
    : document.getElementById('configEditor').value;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  a.download = 'burndown_config.json';
  a.click();
}

// ── FILE UPLOAD ───────────────────────────────────────────────────────────────
function readXLS(file) {
  const reader = new FileReader();
  reader.addEventListener('load', e => {
    const wb   = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: false });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' });

    const newRows = rows.map(r => ({
      date:        parseDate(r['Date']),
      role:        str(r['Job Role: Name']),
      owner:       str(r['Owner: Name']),
      hours:       parseHours(r['Hours']),
      task:        str(r['Task/Issue']),
      notes:       str(r['Notes']),
      projectId:   str(r['D365 Project ID']),
      projectName: str(r['WF Project Name']),
    })).filter(r => r.date && r.hours > 0);

    // Save each project's rows to localStorage
    const byProject = {};
    newRows.forEach(r => {
      if (!r.projectId) return;
      if (!byProject[r.projectId]) byProject[r.projectId] = [];
      byProject[r.projectId].push(r);
    });
    Object.entries(byProject).forEach(([pid, prows]) => {
      saveProjectData(pid, prows);
      addToDataIndex(pid);
    });

    // Rebuild timesheetData from all cached sources
    refreshTimesheetData();

    document.getElementById('fileStatus').textContent = `✅ ${file.name} · ${newRows.length} rows`;
    populateProjectSelector();
    showPortfolioView();
  });
  reader.readAsArrayBuffer(file);
}

function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let [, mo, d, y] = m;
    if (y.length === 2) y = '20' + y;
    const dt = new Date(+y, +mo - 1, +d);
    return isNaN(dt) ? null : dt;
  }
  const dt = new Date(s);
  return isNaN(dt) ? null : dt;
}

function parseHours(v) { return parseFloat(String(v || '0').replace(',', '.')) || 0; }
function str(v)        { return String(v || '').trim(); }

// ── PROJECT SELECTOR ──────────────────────────────────────────────────────────
function populateProjectSelector() {
  const sel      = document.getElementById('projectSelect');
  const dataIdx  = new Set(getDataIndex());
  const shownIds = new Set();

  sel.innerHTML = '<option value="">— Select a project —</option>';

  // Configured projects first
  (config.projects || []).forEach(p => {
    if (!p.id) return;
    shownIds.add(p.id);
    const hasData = dataIdx.has(p.id);
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = (p.name ? `${p.name} — ${p.id}` : p.id) + (hasData ? '' : '  ⚠ no data');
    sel.appendChild(o);
  });

  // Unconfigured projects that have cached data
  dataIdx.forEach(pid => {
    if (shownIds.has(pid)) return;
    const row = timesheetData.find(r => r.projectId === pid);
    const o = document.createElement('option');
    o.value = pid;
    o.textContent = (row?.projectName ? `${row.projectName} — ` : '') + pid;
    sel.appendChild(o);
  });

  const total = sel.options.length - 1;
  if (total === 1) { sel.value = sel.options[1].value; selectProject(sel.value); }
}

function cfgForProject(projectId) {
  const key = projectId.trim().toLowerCase();
  return config.projects?.find(p => p.id && p.id.trim().toLowerCase() === key) || null;
}

function selectProject(id) {
  selectedProjectId = id;
  const inDashboard = document.getElementById('mainContent').style.display !== 'none';
  document.getElementById('btnAiAnalysis').style.display  = (id && inDashboard && hasAiKey()) ? 'inline-block' : 'none';
  document.getElementById('btnShareEmail').style.display  = (id && inDashboard && hasEmailConfig()) ? 'inline-block' : 'none';
  document.getElementById('btnPlanningView').style.display = (id && inDashboard) ? 'inline-block' : 'none';
  if (!id) {
    document.getElementById('dashboard').style.display = 'none';
    return;
  }
  document.getElementById('dashboard').style.display = 'block';
  renderDashboard(id);
}

// ── RENDER DASHBOARD ──────────────────────────────────────────────────────────
function renderDashboard(projectId) {
  const data = timesheetData.filter(r => r.projectId === projectId);
  const cfg  = cfgForProject(projectId);
  currentCfg = cfg;

  document.getElementById('noConfigAlert').classList.toggle('d-none', !!cfg);

  renderKPIs(data, cfg);
  populateBurndownTaskFilter(cfg);
  renderBurndown(data, cfg, '');
  populateMonthFilter(data, cfg);
  initDateFilter();
  renderMonthlyTable(data, cfg);
  renderPtcReport(cfg);
  renderSummaryByTask(data, cfg);
  renderSummaryTable(data, cfg);
  renderSummaryByGroup(data, cfg);
  renderTaskTables(data, cfg);
}

// ── KPIs ──────────────────────────────────────────────────────────────────────
function renderKPIs(data, cfg) {
  const bData     = billableData(data, cfg);
  const consumedH = bData.reduce((s, r) => s + r.hours, 0);
  document.getElementById('kpiConsumedHours').textContent = fmtH(consumedH);

  const maxDate = bData.length ? bData.reduce((max, r) => r.date > max ? r.date : max, bData[0].date) : null;
  const asOfStr = maxDate
    ? `as of ${maxDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
    : 'total to date';
  document.getElementById('kpiConsumedHoursSub').textContent = asOfStr;
  document.getElementById('kpiConsumedEurSub').textContent   = asOfStr;

  if (!cfg) {
    document.getElementById('kpiSoldHours').textContent   = '—';
    document.getElementById('kpiBudgetEur').textContent   = '—';
    document.getElementById('kpiConsumedEur').textContent = '—';
    document.getElementById('kpiHoursLeft').textContent   = '—';
    document.getElementById('kpiBudgetLeft').textContent  = '—';
    return;
  }

  const bTasks    = billableTasks(cfg);
  const soldH     = bTasks.reduce((s, t) => s + t.resources.reduce((ss, r) => ss + r.soldHours, 0), 0);
  const budgetE   = bTasks.reduce((s, t) => s + t.resources.reduce((ss, r) => ss + r.soldHours * r.hourlyRate, 0), 0);
  const consumedE = bData.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0);

  const hoursLeft  = soldH - consumedH;
  const budgetLeft = budgetE - consumedE;

  const hoursLeftEl  = document.getElementById('kpiHoursLeft');
  const budgetLeftEl = document.getElementById('kpiBudgetLeft');

  hoursLeftEl.textContent  = fmtH(hoursLeft);
  budgetLeftEl.textContent = fmtMoney(budgetLeft);
  hoursLeftEl.style.color  = hoursLeft < 0 ? '#dc3545' : hoursLeft < soldH * 0.1 ? '#fd7e14' : '';
  budgetLeftEl.style.color = budgetLeft < 0 ? '#dc3545' : budgetLeft < budgetE * 0.1 ? '#fd7e14' : '';

  document.getElementById('kpiSoldHours').textContent   = fmtH(soldH);
  document.getElementById('kpiBudgetEur').textContent   = fmtMoney(budgetE);
  document.getElementById('kpiConsumedEur').textContent = fmtMoney(consumedE);
}

// ── BURNDOWN ──────────────────────────────────────────────────────────────────
function populateBurndownTaskFilter(cfg) {
  const sel = document.getElementById('burndownTaskFilter');
  sel.innerHTML = '<option value="">All tasks</option>';
  if (cfg) billableTasks(cfg).forEach(t => {
    const o = document.createElement('option');
    o.value = t.name; o.textContent = t.name;
    sel.appendChild(o);
  });
}

function updateBurndown() {
  const data = timesheetData.filter(r => r.projectId === selectedProjectId);
  const cfg  = cfgForProject(selectedProjectId);
  renderBurndown(data, cfg, document.getElementById('burndownTaskFilter').value);
}

function renderBurndown(data, cfg, taskFilter) {
  if (burndownChartInst) { burndownChartInst.destroy(); burndownChartInst = null; }
  if (!data.length) return;

  const bData = billableData(data, cfg);
  const filteredData = taskFilter
    ? bData.filter(r => r.task.toLowerCase() === taskFilter.toLowerCase())
    : bData;

  const budget = cfg
    ? taskFilter
      ? (cfg.tasks.find(t => t.name.toLowerCase() === taskFilter.toLowerCase())
           ?.resources.reduce((s, r) => s + r.soldHours, 0) ?? 0)
      : billableTasks(cfg).reduce((s, t) => s + t.resources.reduce((ss, r) => ss + r.soldHours, 0), 0)
    : null;

  let axisStart, axisEnd;
  if (cfg?.startDate && cfg?.endDate) {
    const sy = parseInt(cfg.startDate.slice(0, 4));
    const sm = parseInt(cfg.startDate.slice(4, 6));
    const ey = parseInt(cfg.endDate.slice(0, 4));
    const em = parseInt(cfg.endDate.slice(4, 6));
    axisStart = new Date(sy, sm - 1, 1);
    axisEnd   = new Date(ey, em, 0);
  } else {
    const allDates = (filteredData.length ? filteredData : data).map(r => r.date);
    const minDate  = allDates.reduce((a, b) => a < b ? a : b);
    axisStart = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    axisEnd   = new Date(axisStart);
    axisEnd.setMonth(axisEnd.getMonth() + 14);
  }

  const points = [];
  if (burndownInterval === 'quarterly') {
    let cur = new Date(axisStart.getFullYear(), Math.floor(axisStart.getMonth() / 3) * 3, 1);
    while (cur <= axisEnd) {
      points.push(new Date(cur));
      cur.setMonth(cur.getMonth() + 3);
    }
  } else if (burndownInterval === 'weekly') {
    // align to Monday of the start week
    const weekStart = new Date(axisStart);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    for (let d = new Date(weekStart); d <= axisEnd; d.setDate(d.getDate() + 7))
      points.push(new Date(d));
  } else if (burndownInterval === 'monthly') {
    let cur = new Date(axisStart.getFullYear(), axisStart.getMonth(), 1);
    while (cur <= axisEnd) {
      points.push(new Date(cur));
      cur.setMonth(cur.getMonth() + 1);
    }
  } else { // biweekly
    for (let d = new Date(axisStart); d <= axisEnd; d.setDate(d.getDate() + 14))
      points.push(new Date(d));
  }

  const labels = burndownInterval === 'quarterly'
    ? points.map(d => {
        const q = Math.floor(d.getMonth() / 3) + 1;
        return `Q${q} '${String(d.getFullYear()).slice(2)}`;
      })
    : burndownInterval === 'monthly'
    ? points.map(d => d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }))
    : points.map(d => fmtDateLabel(d));

  const burnValues = points.map(d => {
    const consumed = filteredData.filter(r => r.date <= d).reduce((s, r) => s + r.hours, 0);
    return budget !== null ? Math.max(0, budget - consumed) : consumed;
  });

  // Build ideal trend data (phasing-based)
  let idealData = null;
  let totalBudgetEur = 0;
  if (budget !== null) {
    totalBudgetEur = cfg
      ? (taskFilter ? cfg.tasks : billableTasks(cfg))
          .reduce((s, t) => s + t.resources.reduce((ss, r) => ss + r.soldHours * r.hourlyRate, 0), 0)
      : 0;
    const usePhasingIdeal = !taskFilter && cfg?.phasing && Object.keys(cfg.phasing).length > 0 && totalBudgetEur > 0;

    idealData = points.map(d => {
      if (usePhasingIdeal) {
        let cumPhasing = 0;
        Object.entries(cfg.phasing).forEach(([ym, val]) => {
          const y = parseInt(ym.slice(0, 4));
          const m = parseInt(ym.slice(4, 6));
          if (new Date(y, m - 1, 1) <= d) cumPhasing += val;
        });
        const remaining = parseFloat(Math.max(0, budget * (1 - cumPhasing / totalBudgetEur)).toFixed(2));
        return { y: remaining, phasingEur: cumPhasing };
      } else {
        const span    = axisEnd - axisStart;
        const elapsed = d - axisStart;
        return { y: parseFloat(Math.max(0, budget * (1 - elapsed / span)).toFixed(2)), phasingEur: null };
      }
    });
  }

  // Build planning line data (hours-based)
  let planningData = null;
  if (budget !== null && !taskFilter && cfg?.planning && Object.keys(cfg.planning).length > 0) {
    planningData = points.map(d => {
      let cumPlanning = 0;
      Object.entries(cfg.planning).forEach(([ym, val]) => {
        const y = parseInt(ym.slice(0, 4));
        const m = parseInt(ym.slice(4, 6));
        if (new Date(y, m - 1, 1) <= d) cumPlanning += val;
      });
      return parseFloat(Math.max(0, budget - cumPlanning).toFixed(2));
    });
  }

  // Budget consumed per point — stored in closure, NOT on dataset object
  const tooltipBudgetConsumed = cfg
    ? points.map(d => filteredData
        .filter(r => r.date <= d)
        .reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0))
    : null;

  // Phasing EUR per point — stored in closure, NOT on dataset object
  const tooltipPhasingEur = idealData ? idealData.map(v => v.phasingEur) : null;

  const datasets = [{
    label: budget !== null ? 'Remaining Hours' : 'Cumulative Hours',
    data: burnValues,
    borderColor: '#0d6efd', backgroundColor: 'rgba(13,110,253,0.07)',
    fill: true, tension: 0.3, pointRadius: 3, pointHoverRadius: 5,
  }];
  if (idealData) {
    const hasPhasingEur = idealData.some(v => v.phasingEur !== null);
    datasets.push({
      label: hasPhasingEur ? 'Estimated Budget (phasing)' : 'Ideal Trend',
      data: idealData.map(v => v.y),
      borderColor: hasPhasingEur ? '#FF6F00' : '#adb5bd', borderDash: [6, 4], borderWidth: 2,
      fill: false, pointRadius: 0, tension: 0,
    });
  }
  if (planningData) {
    datasets.push({
      label: 'Estimated Hours',
      data: planningData,
      borderColor: '#2E7D32', borderDash: [4, 4], borderWidth: 2,
      fill: false, pointRadius: 0, tension: 0,
    });
  }

  const idealIdx = idealData ? 1 : -1;

  burndownChartInst = new Chart(document.getElementById('burndownChart'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        tooltip: {
          mode: 'index',
          intersect: false,
          filter: (item) => item.datasetIndex === 0,
          displayColors: false,
          callbacks: {
            label: (context) => {
              const i = context.dataIndex;
              const lines = [];
              lines.push('── Hours ──────────────────');
              if (budget !== null) {
                lines.push(`  Consumed:   ${fmtH(Math.max(0, budget - burnValues[i]))}`);
                lines.push(`  Remaining:  ${fmtH(Math.max(0, burnValues[i]))}`);
                if (planningData) lines.push(`  Estimated:  ${fmtH(planningData[i])}`);
              } else {
                lines.push(`  Consumed:   ${fmtH(burnValues[i])}`);
              }
              if (tooltipBudgetConsumed) {
                lines.push('');
                lines.push('── Budget ─────────────────');
                const consumed = tooltipBudgetConsumed[i] ?? 0;
                lines.push(`  Consumed:   ${fmtMoney(consumed)}`);
                lines.push(`  Remaining:  ${fmtMoney(totalBudgetEur - consumed)}`);
                if (tooltipPhasingEur?.[i] != null)
                  lines.push(`  Estimated:  ${fmtMoney(tooltipPhasingEur[i])}`);
              }
              return lines;
            },
          },
        },
        legend: { position: 'top' },
      },
      scales: {
        x: { ticks: { maxRotation: 45, autoSkip: false } },
        y: { beginAtZero: true, title: { display: true, text: 'Hours' } },
      },
    },
  });
}

// ── MONTHLY SUMMARY TABLE ─────────────────────────────────────────────────────
function renderMonthlyTable(data, cfg) {
  const container = document.getElementById('summaryMonthlyContainer');
  if (!data.length) { container.innerHTML = ''; return; }

  let startY, startM, endY, endM;
  if (cfg?.startDate && cfg?.endDate) {
    startY = parseInt(cfg.startDate.slice(0, 4));
    startM = parseInt(cfg.startDate.slice(4, 6));
    endY   = parseInt(cfg.endDate.slice(0, 4));
    endM   = parseInt(cfg.endDate.slice(4, 6));
  } else {
    const dates = data.map(r => r.date);
    const minD  = dates.reduce((a, b) => a < b ? a : b);
    const maxD  = dates.reduce((a, b) => a > b ? a : b);
    startY = minD.getFullYear(); startM = minD.getMonth() + 1;
    endY   = maxD.getFullYear(); endM   = maxD.getMonth() + 1;
  }

  // Build PTC totals per month
  const ptcItems = cfg?.ptc || [];
  const ptcByMonth = {};
  ptcItems.forEach(p => {
    if (p.month) ptcByMonth[p.month] = (ptcByMonth[p.month] || 0) + (p.amount || 0);
  });
  const hasPtc = ptcItems.length > 0;

  const bData = billableData(data, cfg);

  const months = [];
  let cy = startY, cm = startM;
  while (cy < endY || (cy === endY && cm <= endM)) {
    const ym    = `${cy}${pad(cm)}`;
    const start = new Date(cy, cm - 1, 1);
    const end   = new Date(cy, cm, 0, 23, 59, 59);
    const rows  = bData.filter(r => inRange(r.date, start, end));
    const hours = rows.reduce((s, r) => s + r.hours, 0);
    const spent = cfg ? rows.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0) : null;
    const estimatedHours = cfg?.planning?.[ym] ?? 0;
    const estimated = cfg?.phasing?.[ym] ?? 0;
    const ptc   = ptcByMonth[ym] || 0;
    const label = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    months.push({ label, hours, estimatedHours, spent, estimated, ptc });
    cm++;
    if (cm > 12) { cm = 1; cy++; }
  }

  const totHours          = months.reduce((s, m) => s + m.hours, 0);
  const totEstimatedHours = cfg ? months.reduce((s, m) => s + m.estimatedHours, 0) : null;
  const totHoursVariance  = totEstimatedHours !== null ? totEstimatedHours - totHours : null;
  const totSpent          = cfg ? months.reduce((s, m) => s + (m.spent ?? 0), 0) : null;
  const totEstimated      = cfg ? months.reduce((s, m) => s + m.estimated, 0) : null;
  const totBudgetVariance = (totEstimated !== null && totSpent !== null) ? totEstimated - totSpent : null;
  const totPtc            = hasPtc ? months.reduce((s, m) => s + m.ptc, 0) : null;

  container.innerHTML = `
    <div class="section-card mb-4">
      <div class="section-header d-flex justify-content-between align-items-center">
        <span>📅 Monthly Summary — hours and budget spent by month</span>
        <div class="tbl-export-btns d-flex gap-1"></div>
      </div>
      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle mb-0 tbl-fixed">
          <thead style="background:#f8f9fa;">
            <tr>
              <th class="ps-3" rowspan="2" style="vertical-align:middle;border-bottom:2px solid #dee2e6">Month</th>
              <th colspan="3" class="text-center border-start" style="border-bottom:2px solid #dee2e6">Hours</th>
              <th colspan="3" class="text-center border-start" style="border-bottom:2px solid #dee2e6">Budget</th>
              ${hasPtc ? '<th class="text-center border-start" rowspan="2" style="vertical-align:middle;border-bottom:2px solid #dee2e6">PTC</th>' : ''}
            </tr>
            <tr style="background:#f8f9fa;">
              <th class="text-end border-start">Estimated</th>
              <th class="text-end">Consumed</th>
              <th class="text-end">Variance</th>
              <th class="text-end border-start">Estimated</th>
              <th class="text-end">Spent</th>
              <th class="${hasPtc ? 'text-end' : 'text-end pe-3'}">Variance</th>
            </tr>
          </thead>
          <tbody>
            ${months.map(m => {
              const hVar = cfg ? m.estimatedHours - m.hours : null;
              const bVar = m.spent !== null ? m.estimated - m.spent : null;
              return `
              <tr>
                <td class="ps-3">${m.label}</td>
                <td class="text-end border-start">${cfg ? fmtH(m.estimatedHours) : '—'}</td>
                <td class="text-end">${fmtH(m.hours)}</td>
                <td class="text-end ${hVar !== null && hVar < 0 ? 'text-danger fw-bold' : ''}">${hVar !== null ? fmtH(hVar) : '—'}</td>
                <td class="text-end border-start">${cfg ? fmtMoney(m.estimated) : '—'}</td>
                <td class="text-end">${m.spent !== null ? fmtMoney(m.spent) : '—'}</td>
                <td class="${hasPtc ? 'text-end' : 'text-end pe-3'} ${bVar !== null && bVar < 0 ? 'text-danger fw-bold' : ''}">${bVar !== null ? fmtMoney(bVar) : '—'}</td>
                ${hasPtc ? `<td class="text-end pe-3 border-start">${m.ptc > 0 ? fmtMoney(m.ptc) : '—'}</td>` : ''}
              </tr>`;
            }).join('')}
            <tr class="fw-bold" style="background:#e9ecef;">
              <td class="ps-3">TOTAL</td>
              <td class="text-end border-start">${totEstimatedHours !== null ? fmtH(totEstimatedHours) : '—'}</td>
              <td class="text-end">${fmtH(totHours)}</td>
              <td class="text-end ${totHoursVariance !== null && totHoursVariance < 0 ? 'text-danger' : ''}">${totHoursVariance !== null ? fmtH(totHoursVariance) : '—'}</td>
              <td class="text-end border-start">${totEstimated !== null ? fmtMoney(totEstimated) : '—'}</td>
              <td class="text-end">${totSpent !== null ? fmtMoney(totSpent) : '—'}</td>
              <td class="${hasPtc ? 'text-end' : 'text-end pe-3'} ${totBudgetVariance !== null && totBudgetVariance < 0 ? 'text-danger' : ''}">${totBudgetVariance !== null ? fmtMoney(totBudgetVariance) : '—'}</td>
              ${hasPtc ? `<td class="text-end pe-3 border-start">${totPtc !== null ? fmtMoney(totPtc) : '—'}</td>` : ''}
            </tr>
          </tbody>
        </table>
      </div>
    </div>`;
  const _msCard = container.querySelector('.section-card');
  wireExportButtons(_msCard.querySelector('.tbl-export-btns'), () => _msCard.querySelector('table'), 'monthly_summary', _msCard);
}

// ── PTC REPORT ────────────────────────────────────────────────────────────────
function renderPtcReport(cfg) {
  const container = document.getElementById('ptcReportContainer');
  const ptcItems  = cfg?.ptc || [];
  if (!ptcItems.length) { container.innerHTML = ''; return; }

  const total = ptcItems.reduce((s, p) => s + (p.amount || 0), 0);

  // Sort by month then title
  const sorted = [...ptcItems].sort((a, b) => {
    if (a.month !== b.month) return (a.month || '').localeCompare(b.month || '');
    return (a.title || '').localeCompare(b.title || '');
  });

  const rows = sorted.map((p, i) => {
    const bg = i % 2 === 0 ? '' : 'style="background:#f8f9fa"';
    let monthLabel = '—';
    if (p.month && p.month.length === 6) {
      const [y, m] = [parseInt(p.month.slice(0, 4)), parseInt(p.month.slice(4, 6))];
      monthLabel = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    return `<tr ${bg}>
      <td class="ps-3">${monthLabel}</td>
      <td class="fw-semibold">${esc(p.title || '—')}</td>
      <td class="text-muted small">${esc(p.note || '')}</td>
      <td class="text-end pe-3 fw-semibold">${fmtMoney(p.amount || 0)}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="section-card mb-4">
      <div class="section-header d-flex justify-content-between align-items-center">
        <span>💼 Pass Through Costs</span>
        <div class="tbl-export-btns d-flex gap-1"></div>
      </div>
      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead style="background:#f8f9fa;">
            <tr>
              <th class="ps-3" style="width:160px">Month</th>
              <th>Title</th>
              <th>Note</th>
              <th class="text-end pe-3">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr class="fw-bold" style="background:#e9ecef;">
              <td class="ps-3" colspan="3">TOTAL</td>
              <td class="text-end pe-3">${fmtMoney(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>`;
  const _ptcCard = container.querySelector('.section-card');
  wireExportButtons(_ptcCard.querySelector('.tbl-export-btns'), () => _ptcCard.querySelector('table'), 'ptc_report', _ptcCard);
}

// ── DATE / MONTH FILTER ───────────────────────────────────────────────────────
function populateMonthFilter(data, cfg) {
  const sel = document.getElementById('monthFilter');
  const months = [];

  if (cfg?.startDate && cfg?.endDate) {
    let cy = parseInt(cfg.startDate.slice(0, 4));
    let cm = parseInt(cfg.startDate.slice(4, 6));
    const ey = parseInt(cfg.endDate.slice(0, 4));
    const em = parseInt(cfg.endDate.slice(4, 6));
    while (cy < ey || (cy === ey && cm <= em)) {
      months.push(`${cy}-${pad(cm)}`);
      cm++;
      if (cm > 12) { cm = 1; cy++; }
    }
  } else {
    const monthSet = new Set(data.map(r => {
      const d = r.date;
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    }));
    [...monthSet].sort().forEach(ym => months.push(ym));
  }

  sel.innerHTML = '<option value="">— All months —</option>';
  months.forEach(ym => {
    const [y, m] = ym.split('-').map(Number);
    const label  = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const o = document.createElement('option');
    o.value = ym; o.textContent = label;
    sel.appendChild(o);
  });
}

function initDateFilter() {
  document.getElementById('filterStart').value = '';
  document.getElementById('filterEnd').value   = '';
  document.getElementById('monthFilter').value = '';
  document.getElementById('filterRangeLabel').textContent = '';
}

function resetDateFilter() {
  document.getElementById('filterStart').value = '';
  document.getElementById('filterEnd').value   = '';
  document.getElementById('monthFilter').value = '';
  document.getElementById('filterRangeLabel').textContent = '';
  updateTaskTables();
}

function getFilterLabel() {
  const month = document.getElementById('monthFilter').value;
  if (month) {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  const sv = document.getElementById('filterStart').value;
  const ev = document.getElementById('filterEnd').value;
  if (sv && ev)  return `${fmtDate(new Date(sv + 'T00:00:00'))} – ${fmtDate(new Date(ev + 'T23:59:59'))}`;
  if (sv)        return `from ${fmtDate(new Date(sv + 'T00:00:00'))}`;
  if (ev)        return `until ${fmtDate(new Date(ev + 'T23:59:59'))}`;
  return '';
}

function getFilterRange() {
  const month = document.getElementById('monthFilter').value;
  if (month) {
    const [y, m] = month.split('-').map(Number);
    return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0, 23, 59, 59) };
  }
  const sv = document.getElementById('filterStart').value;
  const ev = document.getElementById('filterEnd').value;
  return {
    start: sv ? new Date(sv + 'T00:00:00') : null,
    end:   ev ? new Date(ev + 'T23:59:59') : null,
  };
}

function updateTaskTables() {
  const { start, end } = getFilterRange();
  const month = document.getElementById('monthFilter').value;
  const lbl   = document.getElementById('filterRangeLabel');
  if (month) {
    const [y, m] = month.split('-').map(Number);
    const label  = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    lbl.textContent = 'Month: ' + label;
  } else {
    lbl.textContent = (start && end) ? `Period: ${fmtDate(start)} – ${fmtDate(end)}` : '';
  }
  const data = timesheetData.filter(r => r.projectId === selectedProjectId);
  const cfg  = cfgForProject(selectedProjectId);
  currentCfg = cfg;
  renderSummaryByTask(data, cfg);
  renderSummaryTable(data, cfg);
  renderSummaryByGroup(data, cfg);
  renderTaskTables(data, cfg);
}

function inRange(date, start, end) {
  if (!date) return false;
  if (start && date < start) return false;
  if (end   && date > end)   return false;
  return true;
}

// ── SUMMARY TABLE HELPERS ─────────────────────────────────────────────────────
function he(h, e) {
  return `${fmtH(h)}<span class="eur-sub">${fmtMoney(e)}</span>`;
}

function summaryRows(cols, hasFilter) {
  const totSold        = cols.reduce((s, c) => s + c.soldHours, 0);
  const totSoldEur     = cols.reduce((s, c) => s + c.soldEur, 0);
  const totConsumed    = cols.reduce((s, c) => s + c.totalConsumed, 0);
  const totConsumedEur = cols.reduce((s, c) => s + c.totalConsumedEur, 0);
  const totInPeriod    = cols.reduce((s, c) => s + c.inPeriod, 0);
  const totInPeriodEur = cols.reduce((s, c) => s + c.inPeriodEur, 0);
  const totSpent       = totConsumed    - (hasFilter ? totInPeriod    : 0);
  const totSpentEur    = totConsumedEur - (hasFilter ? totInPeriodEur : 0);
  const totResidual    = totSold    - totConsumed;
  const totResidualEur = totSoldEur - totConsumedEur;

  const cell = (h, e, danger) =>
    `<td class="text-end${danger ? ' fw-bold text-danger' : ''}">${he(h, e)}</td>`;
  const cellLast = (h, e, danger) =>
    `<td class="text-end pe-3 fw-bold${danger ? ' text-danger' : ''}">${he(h, e)}</td>`;
  const dash     = () => `<td class="text-end text-muted">—</td>`;
  const dashLast = () => `<td class="text-end pe-3 fw-bold text-muted">—</td>`;

  return `
    <tr>
      <td class="ps-3 fw-semibold">Total Amount</td>
      ${cols.map(c => cell(c.soldHours, c.soldEur, false)).join('')}
      ${cellLast(totSold, totSoldEur, false)}
    </tr>
    <tr>
      <td class="ps-3 fw-semibold">Spent</td>
      ${cols.map(c => {
        const h = hasFilter ? c.totalConsumed - c.inPeriod       : c.totalConsumed;
        const e = hasFilter ? c.totalConsumedEur - c.inPeriodEur : c.totalConsumedEur;
        return cell(h, e, false);
      }).join('')}
      ${cellLast(totSpent, totSpentEur, false)}
    </tr>
    <tr>
      <td class="ps-3 fw-semibold">In period${hasFilter ? ` <span class="fw-normal text-muted">(${getFilterLabel()})</span>` : ''}</td>
      ${cols.map(c => hasFilter ? cell(c.inPeriod, c.inPeriodEur, false) : dash()).join('')}
      ${hasFilter ? cellLast(totInPeriod, totInPeriodEur, false) : dashLast()}
    </tr>
    <tr style="background:#e9ecef;">
      <td class="ps-3 fw-bold">Residual</td>
      ${cols.map(c => {
        const h = c.soldHours - c.totalConsumed;
        const e = c.soldEur   - c.totalConsumedEur;
        return cell(h, e, h < 0);
      }).join('')}
      ${cellLast(totResidual, totResidualEur, totResidual < 0)}
    </tr>`;
}

function summaryTable(title, headers, cols, hasFilter) {
  return `
    <div class="section-card mb-4">
      <div class="section-header d-flex justify-content-between align-items-center">
        <span>${title}</span>
        <div class="tbl-export-btns d-flex gap-1"></div>
      </div>
      <div class="table-responsive">
        <table class="table table-sm align-middle mb-0 tbl-fixed">
          <thead style="background:#f8f9fa;">
            <tr>
              <th class="ps-3"></th>
              ${headers.map(h => `<th class="text-end small">${esc(h)}</th>`).join('')}
              <th class="text-end pe-3 fw-bold">TOTAL</th>
            </tr>
          </thead>
          <tbody>${summaryRows(cols, hasFilter)}</tbody>
        </table>
      </div>
    </div>`;
}

// ── SUMMARY BY TASK ───────────────────────────────────────────────────────────
function renderSummaryByTask(data, cfg) {
  const container = document.getElementById('summaryByTaskContainer');
  if (!cfg) { container.innerHTML = ''; return; }

  const { start, end } = getFilterRange();
  const hasFilter = !!(start || end);

  const bTasks = billableTasks(cfg);
  const cols = bTasks.map(task => {
    const key              = task.name.toLowerCase();
    const soldHours        = task.resources.reduce((s, r) => s + r.soldHours, 0);
    const soldEur          = task.resources.reduce((s, r) => s + r.soldHours * r.hourlyRate, 0);
    const taskRows         = data.filter(r => r.task.toLowerCase() === key);
    const totalConsumed    = taskRows.reduce((s, r) => s + r.hours, 0);
    const totalConsumedEur = taskRows.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0);
    const periodRows       = taskRows.filter(r => inRange(r.date, start, end));
    const inPeriod         = periodRows.reduce((s, r) => s + r.hours, 0);
    const inPeriodEur      = periodRows.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0);
    return { soldHours, soldEur, totalConsumed, totalConsumedEur, inPeriod, inPeriodEur };
  });

  container.innerHTML = summaryTable('📋 Summary by task', bTasks.map(t => t.name), cols, hasFilter);
  const _stCard = container.querySelector('.section-card');
  wireExportButtons(_stCard.querySelector('.tbl-export-btns'), () => _stCard.querySelector('table'), 'summary_by_task', _stCard);
}

// ── SUMMARY BY GROUP ──────────────────────────────────────────────────────────
function renderSummaryByGroup(data, cfg) {
  const container = document.getElementById('summaryByGroupContainer');
  if (!cfg || !cfg.groups?.length) { container.innerHTML = ''; return; }

  const { start, end } = getFilterRange();
  const hasFilter = !!(start || end);

  const bData3 = billableData(data, cfg);
  const cols = cfg.groups.map(grp => {
    const roleLowers = grp.roles.map(r => r.toLowerCase());
    let soldHours = 0, soldEur = 0;
    billableTasks(cfg).forEach(task =>
      task.resources.forEach(res => {
        if (roleLowers.includes(res.role.toLowerCase())) {
          soldHours += res.soldHours;
          soldEur   += res.soldHours * res.hourlyRate;
        }
      })
    );
    const grpRows          = bData3.filter(r => roleLowers.includes(r.role.toLowerCase()));
    const totalConsumed    = grpRows.reduce((s, r) => s + r.hours, 0);
    const totalConsumedEur = grpRows.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0);
    const periodRows       = grpRows.filter(r => inRange(r.date, start, end));
    const inPeriod         = periodRows.reduce((s, r) => s + r.hours, 0);
    const inPeriodEur      = periodRows.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0);
    return { soldHours, soldEur, totalConsumed, totalConsumedEur, inPeriod, inPeriodEur };
  });

  container.innerHTML = summaryTable('🏷️ Summary by functional area', cfg.groups.map(g => g.name), cols, hasFilter);
  const _sgCard = container.querySelector('.section-card');
  wireExportButtons(_sgCard.querySelector('.tbl-export-btns'), () => _sgCard.querySelector('table'), 'summary_by_group', _sgCard);
}

// ── SUMMARY BY ROLE ───────────────────────────────────────────────────────────
function renderSummaryTable(data, cfg) {
  const container = document.getElementById('summaryTableContainer');
  if (!cfg) { container.innerHTML = ''; return; }

  const { start, end } = getFilterRange();
  const hasFilter = !!(start || end);

  const bData2  = billableData(data, cfg);
  const roleMap = new Map();
  billableTasks(cfg).forEach(task =>
    task.resources.forEach(res => {
      const key = res.role.toLowerCase();
      if (!roleMap.has(key)) roleMap.set(key, { role: res.role, soldHours: 0, soldEur: 0 });
      roleMap.get(key).soldHours += res.soldHours;
      roleMap.get(key).soldEur   += res.soldHours * res.hourlyRate;
    })
  );

  const cols = [...roleMap.values()].map(({ role, soldHours, soldEur }) => {
    const key              = role.toLowerCase();
    const roleRows         = bData2.filter(r => r.role.toLowerCase() === key);
    const totalConsumed    = roleRows.reduce((s, r) => s + r.hours, 0);
    const totalConsumedEur = roleRows.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0);
    const periodRows       = roleRows.filter(r => inRange(r.date, start, end));
    const inPeriod         = periodRows.reduce((s, r) => s + r.hours, 0);
    const inPeriodEur      = periodRows.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0);
    return { soldHours, soldEur, totalConsumed, totalConsumedEur, inPeriod, inPeriodEur };
  });

  container.innerHTML = summaryTable('📊 Summary by role', [...roleMap.values()].map(r => r.role), cols, hasFilter);
  const _srCard = container.querySelector('.section-card');
  wireExportButtons(_srCard.querySelector('.tbl-export-btns'), () => _srCard.querySelector('table'), 'summary_by_role', _srCard);
}

// ── TASK DETAIL TABLES ────────────────────────────────────────────────────────
function renderTaskTables(data, cfg) {
  const container = document.getElementById('taskTablesContainer');
  const divider   = document.getElementById('taskTablesDivider');
  container.innerHTML = '';
  if (!cfg) { divider.style.display = 'none'; return; }

  const { start, end } = getFilterRange();
  divider.style.display = 'block';

  cfg.tasks.forEach((task) => {
    const taskData   = data.filter(r => r.task.toLowerCase() === task.name.toLowerCase());
    const periodData = taskData.filter(r => inRange(r.date, start, end)).sort((a, b) => a.date - b.date);

    const roleMap = new Map();
    periodData.forEach(r => {
      const key = r.role.toLowerCase();
      if (!roleMap.has(key)) roleMap.set(key, { role: r.role, owners: new Set(), consumedPeriod: 0 });
      if (r.owner) roleMap.get(key).owners.add(r.owner);
      roleMap.get(key).consumedPeriod += r.hours;
    });
    task.resources.forEach(res => {
      if (!roleMap.has(res.role.toLowerCase()))
        roleMap.set(res.role.toLowerCase(), { role: res.role, owners: new Set(), consumedPeriod: 0 });
    });

    const rows = [...roleMap.values()].map(({ role, owners, consumedPeriod }) => {
      const owner = [...owners].filter(Boolean).join(', ') || '—';
      const cfgRes            = task.resources.find(r => r.role.toLowerCase() === role.toLowerCase());
      const rate              = cfgRes?.hourlyRate ?? 0;
      const soldHours         = cfgRes?.soldHours ?? null;
      const soldEur           = soldHours !== null ? soldHours * rate : null;
      const consumedTotal     = taskData.filter(r => r.role.toLowerCase() === role.toLowerCase()).reduce((s, r) => s + r.hours, 0);
      const remaining         = cfgRes != null ? cfgRes.soldHours - consumedTotal : null;
      const consumedPeriodEur = periodData
        .filter(r => r.role.toLowerCase() === role.toLowerCase())
        .reduce((s, r) => s + r.hours * rate, 0);
      const remainingEur      = cfgRes != null ? rate * (cfgRes.soldHours - consumedTotal) : null;
      return { label: `${role} (${owner})`, soldHours, soldEur, consumedPeriod, consumedPeriodEur, remaining, remainingEur };
    });

    const totSold         = rows.reduce((s, r) => s + (r.soldHours ?? 0), 0);
    const totSoldEur      = rows.reduce((s, r) => s + (r.soldEur    ?? 0), 0);
    const totPeriod    = periodData.reduce((s, r) => s + r.hours, 0);
    const totPeriodEur = periodData.reduce((s, r) => {
      const cfgR = task.resources.find(res => res.role.toLowerCase() === r.role.toLowerCase());
      return s + r.hours * (cfgR?.hourlyRate ?? 0);
    }, 0);
    const totRemaining    = rows.reduce((s, r) => s + (r.remaining    ?? 0), 0);
    const totRemainingEur = rows.reduce((s, r) => s + (r.remainingEur ?? 0), 0);

    // groupMode: 'flat' | 'role' | 'owner'
    function buildDetailRows(groupMode) {
      if (periodData.length === 0)
        return `<tr><td colspan="4" class="text-center text-muted py-3 small">No entries in the selected period.</td></tr>`;

      if (groupMode === 'flat') {
        return periodData.map(r => {
          const cfgR = task.resources.find(res => res.role.toLowerCase() === r.role.toLowerCase());
          const eur  = r.hours * (cfgR?.hourlyRate ?? 0);
          return `<tr>
            <td class="ps-3">${fmtDate(r.date)}</td>
            <td>${esc(r.role)} (${esc(r.owner)})</td>
            <td class="text-end">${fmtH(r.hours)}${cfgR ? `<span class="eur-sub">${fmtMoney(eur)}</span>` : ''}</td>
            <td class="text-muted small">${esc(r.notes)}</td>
          </tr>`;
        }).join('');
      }

      // Build groups keyed by role or owner
      const groups = new Map();
      periodData.forEach(r => {
        const k = groupMode === 'role' ? r.role.toLowerCase() : r.owner.toLowerCase();
        const label = groupMode === 'role' ? r.role : r.owner;
        if (!groups.has(k)) groups.set(k, { label, entries: [] });
        groups.get(k).entries.push(r);
      });

      let html = '';
      const headerBg = groupMode === 'role' ? '#eef1ff' : '#fff3cd';
      groups.forEach(({ label, entries }) => {
        const grpH   = entries.reduce((s, r) => s + r.hours, 0);
        const grpEur = entries.reduce((s, r) => {
          const cfgR = task.resources.find(res => res.role.toLowerCase() === r.role.toLowerCase());
          return s + r.hours * (cfgR?.hourlyRate ?? 0);
        }, 0);
        html += `<tr style="background:${headerBg};">
          <td class="ps-3 fw-semibold small" colspan="2">${esc(label)}</td>
          <td class="text-end fw-semibold small">${fmtH(grpH)}<span class="eur-sub">${fmtMoney(grpEur)}</span></td>
          <td></td>
        </tr>`;
        entries.forEach(r => {
          const cfgR = task.resources.find(res => res.role.toLowerCase() === r.role.toLowerCase());
          const eur  = r.hours * (cfgR?.hourlyRate ?? 0);
          const sub  = groupMode === 'role' ? esc(r.owner) : esc(r.role);
          html += `<tr>
            <td class="ps-3">${fmtDate(r.date)}</td>
            <td class="text-muted">${sub}</td>
            <td class="text-end">${fmtH(r.hours)}${cfgR ? `<span class="eur-sub">${fmtMoney(eur)}</span>` : ''}</td>
            <td class="text-muted small">${esc(r.notes)}</td>
          </tr>`;
        });
      });
      return html;
    }

    const isUnbillable = task.billable === false;
    const card = document.createElement('div');
    card.className = 'section-card mb-4';
    card.innerHTML = `
      <div class="section-header d-flex justify-content-between align-items-center">
        <span>📋 ${esc(task.name)}${isUnbillable ? ' <span class="badge bg-secondary ms-1" style="font-size:.72rem;vertical-align:middle;">Excluded from report</span>' : ''}</span>
        <div class="d-flex gap-2 align-items-center">
          <button class="btn btn-sm btn-outline-secondary expand-btn">▶ Expand details</button>
          <div class="tbl-export-btns d-flex gap-1"></div>
        </div>
      </div>
      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle mb-0 task-sum-tbl" style="table-layout:fixed;width:100%">
          <colgroup>
            <col style="width:40%">
            <col style="width:20%">
            <col style="width:20%">
            <col style="width:20%">
          </colgroup>
          <thead style="background:#f8f9fa;">
            <tr>
              <th class="ps-3">Role (Resource)</th>
              <th class="text-end">Sold hours</th>
              <th class="text-end">${(() => { const l = getFilterLabel(); return l ? `Consumed (${l})` : 'Consumed (period)'; })()}</th>
              <th class="text-end pe-3">Remaining (total)</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr class="${r.remaining !== null && r.remaining < 0 ? 'table-danger' : ''}">
                <td class="ps-3">${esc(r.label)}</td>
                <td class="text-end">
                  ${r.soldHours !== null ? fmtH(r.soldHours) : '—'}
                  ${r.soldEur !== null ? `<span class="eur-sub">${fmtMoney(r.soldEur)}</span>` : ''}
                </td>
                <td class="text-end">
                  ${fmtH(r.consumedPeriod)}
                  <span class="eur-sub">${fmtMoney(r.consumedPeriodEur)}</span>
                </td>
                <td class="text-end pe-3 ${r.remaining !== null && r.remaining < 0 ? 'fw-bold text-danger' : ''}">
                  ${r.remaining !== null ? fmtH(r.remaining) : '—'}
                  ${r.remainingEur !== null ? `<span class="eur-sub${r.remainingEur < 0 ? ' danger' : ''}">${fmtMoney(r.remainingEur)}</span>` : ''}
                </td>
              </tr>`).join('')}
            <tr class="fw-bold" style="background:#e9ecef;">
              <td class="ps-3">TOTAL</td>
              <td class="text-end">
                ${fmtH(totSold)}
                <span class="eur-sub">${fmtMoney(totSoldEur)}</span>
              </td>
              <td class="text-end">
                ${fmtH(totPeriod)}
                <span class="eur-sub">${fmtMoney(totPeriodEur)}</span>
              </td>
              <td class="text-end pe-3 ${totRemaining < 0 ? 'text-danger' : ''}">
                ${fmtH(totRemaining)}
                <span class="eur-sub${totRemainingEur < 0 ? ' danger' : ''}">${fmtMoney(totRemainingEur)}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="detail-section" style="display:none;">
        <div class="d-flex justify-content-between align-items-center px-3 py-2 border-top">
          <span class="text-muted small">Chronological entries</span>
          <div class="d-flex gap-2 align-items-center">
            <div class="btn-group btn-group-sm det-group-toggle" style="font-size:.78rem">
              <button class="btn btn-outline-primary active" data-group="flat">Flat</button>
              <button class="btn btn-outline-primary" data-group="role">By role</button>
              <button class="btn btn-outline-primary" data-group="owner">By owner</button>
            </div>
            <div class="det-export-btns d-flex gap-1"></div>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0 det-tbl" style="table-layout:fixed;width:100%">
            <colgroup>
              <col style="width:15%">
              <col style="width:40%">
              <col style="width:15%">
              <col style="width:30%">
            </colgroup>
            <thead style="background:#eef1ff;">
              <tr>
                <th class="ps-3">Date</th>
                <th class="det-col2">Role (Resource)</th>
                <th class="text-end">Hours</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody class="det-tbody">${buildDetailRows('flat')}</tbody>
          </table>
        </div>
      </div>`;

    let groupMode = 'flat';
    const expandBtn  = card.querySelector('.expand-btn');
    const detSection = card.querySelector('.detail-section');
    const detTbody   = card.querySelector('.det-tbody');
    const detCol2    = card.querySelector('.det-col2');

    expandBtn.addEventListener('click', () => {
      const open = detSection.style.display === 'none';
      detSection.style.display = open ? 'block' : 'none';
      expandBtn.textContent = open ? '▲ Close details' : '▶ Expand details';
    });

    const col2Labels = { flat: 'Role (Resource)', role: 'Owner', owner: 'Role' };
    card.querySelectorAll('.det-group-toggle [data-group]').forEach(btn => {
      btn.addEventListener('click', () => {
        groupMode = btn.dataset.group;
        card.querySelectorAll('.det-group-toggle [data-group]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        detCol2.textContent = col2Labels[groupMode];
        detTbody.innerHTML  = buildDetailRows(groupMode);
      });
    });

    wireExportButtons(
      card.querySelector('.tbl-export-btns'),
      () => card.querySelector('.task-sum-tbl'),
      `task_${task.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
      card
    );
    wireExportButtons(
      card.querySelector('.det-export-btns'),
      () => card.querySelector('.det-tbl'),
      `task_${task.name.replace(/[^a-zA-Z0-9]/g, '_')}_detail`,
      detSection
    );

    container.appendChild(card);
  });
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function findRate(row, cfg) {
  for (const task of cfg.tasks) {
    if (task.name.toLowerCase() !== row.task.toLowerCase()) continue;
    for (const res of task.resources)
      if (res.role.toLowerCase() === row.role.toLowerCase()) return res.hourlyRate;
    if (task.resources.length) return task.resources[0].hourlyRate;
  }
  return null;
}

// Returns only tasks marked as billable (default: billable when field is absent)
function billableTasks(cfg) {
  return cfg?.tasks.filter(t => t.billable !== false) ?? [];
}

// Returns only data rows belonging to billable tasks
function billableData(data, cfg) {
  if (!cfg) return data;
  const allowed = new Set(cfg.tasks.filter(t => t.billable !== false).map(t => t.name.toLowerCase()));
  return data.filter(r => allowed.has(r.task.toLowerCase()));
}

function fmtMoney(n) {
  if (n === null || n === undefined) return '—';
  const currency = currentCfg?.currency || '€';
  if (currency === '$')   return '$ '   + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
  if (currency === '£')   return '£ '   + new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(n);
  if (currency === 'CHF') return 'CHF ' + new Intl.NumberFormat('de-CH', { maximumFractionDigits: 0 }).format(n);
  return '€ ' + new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(n);
}

function fmtH(n)         { return (n !== null && n !== undefined) ? n.toFixed(2) + 'h' : '—'; }
function fmtDate(d)      { return d ? d.toLocaleDateString('en-US') : ''; }
function fmtDateLabel(d) { return d ? `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${String(d.getFullYear()).slice(2)}` : ''; }
function pad(n)          { return String(n).padStart(2, '0'); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function pipelineBadge(pipeline) {
  if (!pipeline) return '';
  const s = { SIP:'background:#6c757d;color:#fff', Expected:'background:#0dcaf0;color:#000',
    Anticipated:'background:#fd7e14;color:#fff', Committed:'background:#198754;color:#fff',
    Canceled:'background:#dc3545;color:#fff' }[pipeline] || 'background:#6c757d;color:#fff';
  return `<span style="font-size:.68rem;border-radius:4px;padding:1px 7px;font-weight:600;${s}">${esc(pipeline)}</span>`;
}

function statusBadge(status) {
  if (!status) return '';
  const s = { 'Not started yet':'background:#adb5bd;color:#fff', 'Started':'background:#198754;color:#fff',
    'Started At Risk':'background:#dc3545;color:#fff', 'Put on hold':'background:#ffc107;color:#000',
    'Completed':'background:#212529;color:#fff' }[status] || 'background:#adb5bd;color:#fff';
  return `<span style="font-size:.68rem;border-radius:4px;padding:1px 7px;font-weight:600;${s}">${esc(status)}</span>`;
}

// ── CONFIRM MODAL ─────────────────────────────────────────────────────────────
function showConfirm(message, onConfirm, onCancel, title = '⚠️ Confirm') {
  const modalEl = document.getElementById('confirmModal');
  document.getElementById('confirmModalTitle').textContent  = title;
  document.getElementById('confirmModalMessage').textContent = message;

  // Replace buttons to remove stale listeners
  const okOld = document.getElementById('confirmModalOk');
  const okBtn = okOld.cloneNode(true);
  okOld.replaceWith(okBtn);

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  let confirmed = false;

  okBtn.addEventListener('click', () => { confirmed = true; modal.hide(); });
  modalEl.addEventListener('hidden.bs.modal', () => {
    if (confirmed) { if (onConfirm) onConfirm(); }
    else           { if (onCancel)  onCancel();  }
  }, { once: true });

  // Raise z-index above any already-open modal (e.g. config form)
  modalEl.addEventListener('shown.bs.modal', () => {
    modalEl.style.zIndex = '1200';
    const backdrops = document.querySelectorAll('.modal-backdrop');
    if (backdrops.length > 0)
      backdrops[backdrops.length - 1].style.zIndex = '1190';
  }, { once: true });

  modal.show();
}

// ── EXPORT HELPERS ────────────────────────────────────────────────────────────
function copyTableToClipboard(tbl) {
  if (!tbl) return;
  const text = [...tbl.querySelectorAll('tr')]
    .map(tr => [...tr.querySelectorAll('th,td')]
      .map(c => c.innerText.replace(/\n/g, ' ').trim()).join('\t'))
    .join('\n');
  navigator.clipboard.writeText(text).catch(() => {});
}

function exportTableToXLS(tbl, filename) {
  if (!tbl) return;
  const wb = XLSX.utils.table_to_book(tbl, { sheet: 'Data' });
  XLSX.writeFile(wb, filename + '.xlsx');
}

function exportElementToPNG(el, filename) {
  if (!el || typeof html2canvas === 'undefined') return;
  html2canvas(el, { scale: 2, backgroundColor: '#ffffff' }).then(canvas => {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = filename + '.png';
    a.click();
  });
}

function wireExportButtons(div, tblFn, filename, cardEl) {
  if (!div) return;
  div.innerHTML =
    `<button class="btn btn-outline-secondary btn-sm py-0 px-2" style="font-size:.7rem" title="Copy">📋</button>` +
    `<button class="btn btn-outline-secondary btn-sm py-0 px-2" style="font-size:.7rem" title="XLS">📊</button>` +
    `<button class="btn btn-outline-secondary btn-sm py-0 px-2" style="font-size:.7rem" title="PNG">🖼️</button>`;
  div.querySelector('[title="Copy"]').addEventListener('click', () => copyTableToClipboard(tblFn()));
  div.querySelector('[title="XLS"]').addEventListener('click',  () => exportTableToXLS(tblFn(), filename));
  div.querySelector('[title="PNG"]').addEventListener('click',  () => exportElementToPNG(cardEl, filename));
}

// ── PORTFOLIO VIEW ────────────────────────────────────────────────────────────
function getMonthRangeFromCfg(cfg) {
  if (!cfg?.startDate || !cfg?.endDate) return [];
  const sy = parseInt(cfg.startDate.slice(0, 4)), sm = parseInt(cfg.startDate.slice(4, 6));
  const ey = parseInt(cfg.endDate.slice(0, 4)),   em = parseInt(cfg.endDate.slice(4, 6));
  const months = [];
  let cy = sy, cm = sm;
  while (cy < ey || (cy === ey && cm <= em)) {
    months.push(`${cy}${String(cm).padStart(2, '0')}`);
    cm++; if (cm > 12) { cm = 1; cy++; }
  }
  return months;
}

function renderPortfolioSummary() {
  const selectedCfgs = (config.projects || []).filter(p => p.id && portfolioSummaryProjects.has(p.id));

  // Collect union of all months across selected projects, sorted
  const monthSet = new Set();
  selectedCfgs.forEach(cfg => getMonthRangeFromCfg(cfg).forEach(ym => monthSet.add(ym)));
  const months = [...monthSet].sort();

  const wrap = document.createElement('div');
  wrap.id = 'portfolioSummaryBlock';

  if (!selectedCfgs.length) {
    wrap.innerHTML = `
      <div class="section-card mb-4" style="border:2px dashed #adb5bd">
        <div class="section-header d-flex align-items-center gap-2" style="background:#f8f9fa;color:#6c757d">
          <span>📊 Budget Summary</span>
          <span class="small fw-normal">— clicca <strong>＋ Riepilogo</strong> su un progetto per aggiungerlo</span>
        </div>
      </div>`;
    return wrap;
  }

  // Aggregate phasing and spend per month across selected projects
  const sumPhasing = {}, sumSpent = {};
  months.forEach(ym => { sumPhasing[ym] = 0; sumSpent[ym] = 0; });

  selectedCfgs.forEach(cfg => {
    months.forEach(ym => { sumPhasing[ym] += cfg.phasing?.[ym] || 0; });
    timesheetData.filter(r => r.projectId === cfg.id).forEach(r => {
      if (!r.date) return;
      const ym = `${r.date.getFullYear()}${String(r.date.getMonth()+1).padStart(2,'0')}`;
      if (sumSpent[ym] !== undefined) sumSpent[ym] += r.hours * (findRate(r, cfg) ?? 0);
    });
  });

  const grandEst   = months.reduce((s, ym) => s + sumPhasing[ym], 0);
  const grandSpent = months.reduce((s, ym) => s + sumSpent[ym],   0);
  const grandVar   = grandEst - grandSpent;

  const ym2lbl = ym => {
    const [y, m] = [parseInt(ym.slice(0,4)), parseInt(ym.slice(4,6))];
    return new Date(y, m-1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };
  const varColor = v => v > 0 ? '#198754' : v < 0 ? '#dc3545' : '#6c757d';
  const fmtV = v => `${v >= 0 ? '+' : ''}${fmtMoney(v)}`;

  const thCells   = months.map(ym => `<th class="text-end" style="min-width:90px;white-space:nowrap">${ym2lbl(ym)}</th>`).join('');
  const estCells  = months.map(ym => `<td class="text-end">${fmtMoney(sumPhasing[ym])}</td>`).join('');
  const spentCells= months.map(ym => `<td class="text-end">${fmtMoney(sumSpent[ym])}</td>`).join('');
  const varCells  = months.map(ym => {
    const v = sumPhasing[ym] - sumSpent[ym];
    return `<td class="text-end fw-semibold" style="color:${varColor(v)}">${fmtV(v)}</td>`;
  }).join('');

  const projectList = selectedCfgs.map(c => `<span class="badge" style="background:#e9ecef;color:#495057;font-weight:500">${esc(c.name || c.id)}</span>`).join(' ');

  wrap.innerHTML = `
    <div class="section-card mb-4" style="border:2px solid #5468c4">
      <div class="section-header d-flex justify-content-between align-items-center flex-wrap gap-2" style="background:#eef1ff">
        <div class="d-flex align-items-center gap-2 flex-wrap">
          <span class="fw-bold">📊 Budget Summary</span>
          <span class="small text-muted">${selectedCfgs.length} progett${selectedCfgs.length===1?'o':'i'}:</span>
          ${projectList}
        </div>
      </div>
      <div class="table-responsive p-2">
        <table class="table table-sm align-middle mb-0" style="font-size:.83rem">
          <thead style="background:#eef1ff">
            <tr>
              <th style="min-width:140px"></th>
              ${thCells}
              <th class="text-end fw-bold" style="min-width:100px;background:#e0e3f5">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr style="background:#f8f9fa">
              <td class="fw-semibold ps-2">Budget Estimated</td>
              ${estCells}
              <td class="text-end fw-bold" style="background:#f0f0f0">${fmtMoney(grandEst)}</td>
            </tr>
            <tr>
              <td class="fw-semibold ps-2">Budget Spent</td>
              ${spentCells}
              <td class="text-end fw-bold" style="background:#f0f0f0">${fmtMoney(grandSpent)}</td>
            </tr>
            <tr>
              <td class="fw-semibold ps-2">Variance</td>
              ${varCells}
              <td class="text-end fw-bold" style="background:#f0f0f0;color:${varColor(grandVar)}">${fmtV(grandVar)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>`;
  return wrap;
}

function renderPortfolioView() {
  const container = document.getElementById('portfolioContainer');
  if (!config.projects?.length) {
    container.innerHTML = '<div class="alert alert-info">No projects configured. Click ⚙️ Configure Budget to add projects.</div>';
    return;
  }

  container.innerHTML = '';
  const summaryEl = renderPortfolioSummary();
  if (summaryEl) container.appendChild(summaryEl);

  config.projects.forEach(cfg => {
    if (!cfg.id) return;
    const data   = timesheetData.filter(r => r.projectId === cfg.id);
    const months = getMonthRangeFromCfg(cfg);
    if (!months.length) return;

    // Build monthly spend map
    const monthSpend = {};
    data.forEach(r => {
      if (!r.date) return;
      const ym = `${r.date.getFullYear()}${String(r.date.getMonth() + 1).padStart(2, '0')}`;
      monthSpend[ym] = (monthSpend[ym] || 0) + r.hours * (findRate(r, cfg) ?? 0);
    });

    const hasData    = data.length > 0;
    const hasPhasing = cfg.phasing && Object.keys(cfg.phasing).length > 0;

    const thCells = months.map(ym => {
      const [y, m] = [parseInt(ym.slice(0, 4)), parseInt(ym.slice(4, 6))];
      const lbl = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      return `<th class="text-end" style="min-width:90px;white-space:nowrap">${lbl}</th>`;
    }).join('') + '<th class="text-end" style="min-width:90px;background:#e9ecef">Total</th>';

    const totalSpent   = months.reduce((s, ym) => s + (monthSpend[ym] || 0), 0);
    const totalPhasing = months.reduce((s, ym) => s + (cfg.phasing?.[ym] || 0), 0);
    const totalVar = totalPhasing - totalSpent;

    const estCells = months.map(ym => {
      const v = cfg.phasing?.[ym] || 0;
      return `<td class="text-end">${hasPhasing ? fmtMoney(v) : '—'}</td>`;
    }).join('') + `<td class="text-end fw-bold" style="background:#f0f0f0">${hasPhasing ? fmtMoney(totalPhasing) : '—'}</td>`;

    const spentCells = months.map(ym => {
      const v = monthSpend[ym] || 0;
      return `<td class="text-end">${hasData ? fmtMoney(v) : '—'}</td>`;
    }).join('') + `<td class="text-end fw-bold" style="background:#f0f0f0">${hasData ? fmtMoney(totalSpent) : '—'}</td>`;

    const varCells = months.map(ym => {
      if (!hasData || !hasPhasing) return '<td class="text-end text-muted">—</td>';
      const v   = (cfg.phasing?.[ym] || 0) - (monthSpend[ym] || 0);
      const col = v > 0 ? '#198754' : v < 0 ? '#dc3545' : '#6c757d';
      return `<td class="text-end" style="color:${col};font-weight:600">${v >= 0 ? '+' : ''}${fmtMoney(v)}</td>`;
    }).join('');
    const varTotalCol = totalVar > 0 ? '#198754' : totalVar < 0 ? '#dc3545' : '#6c757d';
    const varTotal = (!hasData || !hasPhasing)
      ? '<td class="text-end fw-bold" style="background:#f0f0f0">—</td>'
      : `<td class="text-end fw-bold" style="background:#f0f0f0;color:${varTotalCol}">${totalVar >= 0 ? '+' : ''}${fmtMoney(totalVar)}</td>`;

    const totalHours  = (cfg.tasks || []).reduce((s, t) => s + (t.resources || []).reduce((rs, r) => rs + (r.soldHours || 0), 0), 0);
    const totalBudget = (cfg.tasks || []).reduce((s, t) => s + (t.resources || []).reduce((rs, r) => rs + (r.soldHours || 0) * (r.hourlyRate || 0), 0), 0);
    const totalPtc    = (cfg.ptc   || []).reduce((s, p) => s + (p.amount || 0), 0);
    const cur         = cfg.currency || '€';
    const fmtB        = n => `${cur} ${Math.round(n).toLocaleString('en-US')}`;
    const budgetBadge = totalHours > 0 || totalBudget > 0
      ? `<span class="portfolio-budget-badge">${totalHours.toLocaleString('en-US')} h &nbsp;/&nbsp; ${fmtB(totalBudget)}${totalPtc > 0 ? ` &nbsp;+&nbsp; PTC: ${fmtB(totalPtc)}` : ''}</span>`
      : '';

    const card = document.createElement('div');
    card.className = 'section-card mb-4';
    card.innerHTML = `
      <div class="section-header d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div class="d-flex align-items-center gap-2 flex-wrap">
          <span>📁 ${esc(cfg.name || cfg.id)}</span>
          <span class="text-muted small">${esc(cfg.id)}</span>
          ${pipelineBadge(cfg.pipeline)}
          ${statusBadge(cfg.status)}
          ${!hasData ? '<span class="badge bg-warning text-dark">no XLS data</span>' : ''}
          ${budgetBadge}
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-secondary cfg-project-btn">⚙️ Configure</button>
          <button class="btn btn-sm btn-outline-info portfolio-planning-btn">📅 Planning</button>
          <button class="btn btn-sm ${hasData ? 'btn-primary' : 'btn-outline-secondary'} view-report-btn"
                  ${!hasData ? 'disabled' : ''}>📊 View Report →</button>
          <button class="btn btn-sm ${portfolioSummaryProjects.has(cfg.id) ? 'btn-success' : 'btn-outline-secondary'} summary-toggle-btn">
            ${portfolioSummaryProjects.has(cfg.id) ? '✓ Riepilogo' : '＋ Riepilogo'}
          </button>
        </div>
      </div>
      <div class="table-responsive p-2">
        <table class="table table-sm align-middle mb-0" style="font-size:.83rem">
          <thead style="background:#eef1ff">
            <tr>
              <th style="min-width:110px"></th>
              ${thCells}
            </tr>
          </thead>
          <tbody>
            <tr style="background:#f8f9fa"><td class="fw-semibold ps-2">Budget Estimated</td>${estCells}</tr>
            <tr><td class="fw-semibold ps-2">Budget Spent</td>${spentCells}</tr>
            <tr><td class="fw-semibold ps-2">Variance</td>${varCells}${varTotal}</tr>
          </tbody>
        </table>
      </div>`;
    card.querySelector('.cfg-project-btn').addEventListener('click', () => openConfigModal(cfg.id));
    card.querySelector('.view-report-btn').addEventListener('click', () => showDashboardView(cfg.id));
    card.querySelector('.portfolio-planning-btn').addEventListener('click', () => {
      portfolioProjectFilters.clear();
      portfolioProjectFilters.add(cfg.id);
      portfolioPlanningView = 'byproject';
      document.querySelectorAll('#ppViewToggle [data-ppview]').forEach(b =>
        b.classList.toggle('active', b.dataset.ppview === 'byproject'));
      showPortfolioPlanningView();
    });
    card.querySelector('.summary-toggle-btn').addEventListener('click', () => {
      if (portfolioSummaryProjects.has(cfg.id)) {
        portfolioSummaryProjects.delete(cfg.id);
      } else {
        portfolioSummaryProjects.add(cfg.id);
      }
      saveSummarySelection();
      const btn = card.querySelector('.summary-toggle-btn');
      const inSummary = portfolioSummaryProjects.has(cfg.id);
      btn.className = `btn btn-sm ${inSummary ? 'btn-success' : 'btn-outline-secondary'} summary-toggle-btn`;
      btn.textContent = inSummary ? '✓ Riepilogo' : '＋ Riepilogo';
      const portfolioContainer = document.getElementById('portfolioContainer');
      const oldSummary = document.getElementById('portfolioSummaryBlock');
      const newSummary = renderPortfolioSummary();
      if (oldSummary) {
        portfolioContainer.replaceChild(newSummary, oldSummary);
      } else {
        portfolioContainer.insertBefore(newSummary, portfolioContainer.firstChild);
      }
    });
    container.appendChild(card);
  });
}

// ── PLANNING / GANTT ──────────────────────────────────────────────────────────
function getPlanningPeriods(cfg, interval) {
  const months = getMonthRangeFromCfg(cfg);
  if (!months.length) return [];

  if (interval === 'monthly') {
    return months.map(ym => {
      const y = parseInt(ym.slice(0,4)), m = parseInt(ym.slice(4,6));
      return { key: ym,
        label: new Date(y, m-1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        start: new Date(y, m-1, 1), end: new Date(y, m, 0) };
    });
  }

  // Weekly: enumerate Mondays from the week containing project start to project end
  const [fy, fm] = [parseInt(months[0].slice(0,4)), parseInt(months[0].slice(4,6))];
  const [ly, lm] = [parseInt(months[months.length-1].slice(0,4)), parseInt(months[months.length-1].slice(4,6))];
  const anchor = new Date(fy, fm-1, 1);
  const dow = anchor.getDay();
  anchor.setDate(anchor.getDate() - (dow === 0 ? 6 : dow - 1)); // back to Monday
  const projectEnd = new Date(ly, lm, 0);
  const weeks = [];
  const cur = new Date(anchor);
  while (cur <= projectEnd) {
    const we = new Date(cur); we.setDate(we.getDate() + 6);
    weeks.push({ key: `${cur.getFullYear()}${String(cur.getMonth()+1).padStart(2,'0')}${String(cur.getDate()).padStart(2,'0')}`,
      label: cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      start: new Date(cur), end: new Date(we) });
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

function buildPlanningBarCells(periods, taskStart, taskEnd, fillColor, bgColor, pct, labelHtml, cellBg, barH) {
  const ONE_DAY = 86400000;
  barH = barH || 28;

  const overlaps = periods.map(p => {
    const oStart = Math.max(+p.start, +taskStart);
    const oEnd   = Math.min(+p.end,   +taskEnd);
    if (oEnd < oStart) return null;
    const pMs = +p.end - +p.start + ONE_DAY;
    const oMs = oEnd - oStart + ONE_DAY;
    return { leftPct: (oStart - +p.start) / pMs * 100, widPct: oMs / pMs * 100, oMs };
  });

  const totalMs  = overlaps.reduce((s, o) => s + (o ? o.oMs : 0), 0);
  const firstIdx = overlaps.findIndex(o => o !== null);
  const lastIdx  = overlaps.length - 1 - [...overlaps].reverse().findIndex(o => o !== null);

  let cumMs = 0;
  return periods.map((p, i) => {
    const o = overlaps[i];
    const tdBg = cellBg ? `background:${cellBg};` : '';
    if (!o) return `<td class="gantt-empty" style="${tdBg}"></td>`;

    const isFirst  = i === firstIdx;
    const isLast   = i === lastIdx;
    const radius   = (isFirst && isLast) ? '5px' : isFirst ? '5px 0 0 5px' : isLast ? '0 5px 5px 0' : '0';
    const borderL  = isFirst ? `2px solid ${fillColor}` : 'none';
    const borderR  = isLast  ? `2px solid ${fillColor}` : 'none';

    const segStart = totalMs > 0 ? cumMs / totalMs : 0;
    const segEnd   = totalMs > 0 ? (cumMs + o.oMs) / totalMs : 1;
    let cellFillPct = 0;
    if (pct > 0) {
      const f = pct / 100;
      if (f >= segEnd) cellFillPct = 100;
      else if (f > segStart) cellFillPct = (f - segStart) / (segEnd - segStart) * 100;
    }
    cumMs += o.oMs;

    const fillDiv = cellFillPct > 0
      ? `<div style="position:absolute;left:0;top:0;bottom:0;width:${cellFillPct.toFixed(1)}%;background:${fillColor};opacity:0.55;border-radius:inherit"></div>`
      : '';

    const labelSpan = (isFirst && labelHtml)
      ? `<span style="position:absolute;left:6px;top:50%;transform:translateY(-50%);font-size:.72rem;font-weight:700;color:#1a1a2e;white-space:nowrap;z-index:2;text-shadow:0 0 3px rgba(255,255,255,.9)">${labelHtml}</span>`
      : '';

    const barStyle = `position:absolute;left:${o.leftPct.toFixed(2)}%;width:${o.widPct.toFixed(2)}%;top:3px;bottom:3px;background:${bgColor};border-top:2px solid ${fillColor};border-bottom:2px solid ${fillColor};border-left:${borderL};border-right:${borderR};border-radius:${radius};overflow:hidden`;

    return `<td class="gantt-bar-cell" style="${tdBg}position:relative;padding:0;height:${barH + 6}px"><div style="${barStyle}">${fillDiv}${labelSpan}</div></td>`;
  }).join('');
}

// ── CALENDAR WEEK HELPERS ─────────────────────────────────────────────────────

// Count future weeks (Mon-based, weekEnd >= todayMidnight) that overlap the task range.
// Used to compute hPerWeek independently of the visible axis range so that
// adding/removing months from the view doesn't change per-period values.
function countFutureTaskWeeks(tStart, tEnd, todayMidnight) {
  if (!tEnd || tEnd < todayMidnight) return 0;
  const effectiveStart = (tStart && tStart > todayMidnight) ? tStart : todayMidnight;
  const mon = new Date(effectiveStart);
  mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  let count = 0;
  for (let d = new Date(mon); d <= tEnd; d.setDate(d.getDate() + 7)) {
    const wEnd = new Date(d); wEnd.setDate(wEnd.getDate() + 6);
    if (wEnd >= todayMidnight && (!tStart || wEnd >= tStart)) count++;
  }
  return count;
}

// Count distinct future calendar months that overlap the task range.
function countFutureTaskMonths(tStart, tEnd, todayMidnight) {
  if (!tEnd || tEnd < todayMidnight) return 0;
  const effectiveStart = (tStart && tStart > todayMidnight) ? tStart : todayMidnight;
  const sYM = effectiveStart.getFullYear() * 12 + effectiveStart.getMonth();
  const eYM = tEnd.getFullYear() * 12 + tEnd.getMonth();
  return Math.max(0, eYM - sYM + 1);
}

function getCalendarWeeks(startDate, endDate) {
  // Find the Monday on or before startDate
  const anchor = new Date(startDate);
  const dow = anchor.getDay();
  anchor.setDate(anchor.getDate() - (dow === 0 ? 6 : dow - 1));

  const weeks = [];
  const cur = new Date(anchor);
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  while (cur <= endDate) {
    const weekStart = new Date(cur);
    const weekEnd   = new Date(cur); weekEnd.setDate(weekEnd.getDate() + 6);

    const sDay = weekStart.getDate();
    const eDay = weekEnd.getDate();
    const sMon = weekStart.getMonth();
    const eMon = weekEnd.getMonth();

    let label;
    if (sMon === eMon) {
      label = `${String(sDay).padStart(2,'0')}-${String(eDay).padStart(2,'0')} ${monthNames[sMon]}`;
    } else {
      label = `${String(sDay).padStart(2,'0')} ${monthNames[sMon]}-${String(eDay).padStart(2,'0')} ${monthNames[eMon]}`;
    }

    const monthKey = `${monthNames[weekStart.getMonth()]} ${weekStart.getFullYear()}`;

    weeks.push({ weekStart: new Date(weekStart), weekEnd: new Date(weekEnd), label, monthKey });
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

function workingDaysInWeek(week, taskStart, taskEnd) {
  let count = 0;
  const d = new Date(week.weekStart);
  while (d <= week.weekEnd) {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5 && d >= taskStart && d <= taskEnd) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function buildWeekAllocationTable(weeks, rowsHtml, labelHeader) {
  // Build double header: row1 = months (colspan), row2 = weeks
  const monthGroups = [];
  weeks.forEach(w => {
    const last = monthGroups[monthGroups.length - 1];
    if (last && last.key === w.monthKey) { last.count++; }
    else { monthGroups.push({ key: w.monthKey, count: 1 }); }
  });

  const now = new Date();
  const monthHeaderHtml = monthGroups.map(mg =>
    `<th colspan="${mg.count}" style="text-align:center;background:#e8eaff;font-size:.78rem;padding:4px 3px;border:1px solid #dee2e6">${mg.key}</th>`
  ).join('');

  const weekHeaderHtml = weeks.map(w => {
    const isNow = now >= w.weekStart && now <= w.weekEnd;
    return `<th class="gantt-period-col${isNow ? ' gantt-today' : ''}" style="min-width:72px;font-size:.72rem">${w.label}</th>`;
  }).join('');

  return `<table class="gantt-table" style="border-collapse:collapse;width:100%">
    <thead>
      <tr>
        <th class="gantt-label-col" rowspan="2" style="background:#eef1ff;z-index:3;font-size:.82rem;padding:8px 10px">${labelHeader}</th>
        ${monthHeaderHtml}
      </tr>
      <tr style="background:#f0f2ff">
        ${weekHeaderHtml}
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>`;
}

function renderPlanningView(projectId) {
  const cfg = cfgForProject(projectId);
  if (!cfg) return;

  document.getElementById('planningProjectName').textContent = cfg.name || projectId;
  document.getElementById('planningProjectId').textContent   = cfg.name ? projectId : '';

  // Sync view toggle UI
  document.querySelectorAll('#planningViewToggle [data-planview]').forEach(b => {
    b.classList.toggle('active', b.dataset.planview === planningViewMode);
  });

  const container = document.getElementById('planningGanttContainer');

  // Determine date range from cfg
  const cfgStart = parseTaskDate(cfg.startDate, false);
  const cfgEnd   = parseTaskDate(cfg.endDate,   true);
  if (!cfg.startDate && !cfg.endDate) {
    container.innerHTML = '<div class="alert alert-info m-3">No project period configured.</div>';
    return;
  }

  const now2 = new Date();
  const clampedStart = new Date(now2.getFullYear(), now2.getMonth(), 1);
  const projStart = cfgStart > clampedStart ? cfgStart : clampedStart;
  const projEnd = ppExtendHorizon ? cfgEnd : (() => {
    const maxEnd = new Date(now2.getFullYear(), now2.getMonth() + 4, 0);
    return cfgEnd < maxEnd ? cfgEnd : maxEnd;
  })();

  const weeks = getCalendarWeeks(projStart, projEnd);
  if (!weeks.length) {
    container.innerHTML = '<div class="alert alert-info m-3">No project period configured.</div>';
    return;
  }

  if (planningViewMode === 'bytask') {
    renderPlanningByTask(cfg, weeks, container);
  } else {
    renderPlanningByRole(cfg, weeks, container);
  }
}

function renderPlanningByTask(cfg, weeks, container) {
  const periods = getPlanningPeriods(cfg, 'weekly');
  const data    = timesheetData.filter(r => r.projectId === (cfg.id || ''));
  let tbodyHtml = '';

  (cfg.tasks || []).forEach((task, taskIdx) => {
    if (task.completed) return;
    const taskStart = parseTaskDate(task.startDate || cfg.startDate, false);
    const taskEnd   = parseTaskDate(task.endDate   || cfg.endDate,   true);

    const taskData = data.filter(r => r.task.toLowerCase() === task.name.toLowerCase());
    const consumed = taskData.reduce((s, r) => s + r.hours, 0);
    const sold     = (task.resources || []).reduce((s, r) => s + (r.soldHours || 0), 0);
    const pct      = sold > 0 ? Math.min(100, consumed / sold * 100) : 0;
    const isOver      = sold > 0 && consumed > sold;
    const isExcl      = task.billable === false;
    const isCompleted = task.completed === true;

    const bFill    = isExcl ? '#6c757d' : isCompleted ? '#198754' : isOver ? '#dc3545' : '#4a90e2';
    const bBg      = bFill + '22';
    const labelHtml = `${isCompleted ? '&#10003; ' : ''}${esc(task.name)}${pct > 0 ? ` — ${Math.round(pct)}%` : ''}`;
    const dateRangeLabel = `${fmtDateLabel(taskStart)} – ${fmtDateLabel(taskEnd)}`;

    tbodyHtml += `
      <tr class="gantt-task-row" data-task-idx="${taskIdx}">
        <td class="gantt-label-col">
          <div class="d-flex align-items-center gap-1">
            <span class="small fw-semibold text-truncate ${isCompleted ? 'text-success' : ''}" title="${esc(task.name)}" style="${isCompleted ? 'text-decoration:line-through' : ''}">${esc(task.name)}</span>
            ${isCompleted ? '<span class="badge bg-success ms-1" style="font-size:.6rem">&#10003; done</span>' : ''}
            ${isExcl ? '<span class="badge bg-secondary ms-1" style="font-size:.6rem">excl</span>' : ''}
          </div>
          <div style="font-size:.7rem;color:#aaa">${dateRangeLabel}</div>
          <div style="font-size:.7rem;color:#888">${fmtH(consumed)} / ${fmtH(sold)}</div>
        </td>
        ${buildPlanningBarCells(periods, taskStart, taskEnd, bFill, bBg, pct, labelHtml)}
      </tr>`;

    const overlapWeeks = weeks.filter(w => w.weekEnd >= taskStart && w.weekStart <= taskEnd);

    (task.resources || []).forEach(res => {
      const rSold = res.soldHours || 0;
      const hPerWeek = overlapWeeks.length > 0 ? rSold / overlapWeeks.length : 0;

      const cells = weeks.map(w => {
        const inTask = w.weekEnd >= taskStart && w.weekStart <= taskEnd;
        if (!inTask) return `<td style="background:#f8f9fa;border:1px solid #dee2e6"></td>`;
        const wdays = workingDaysInWeek(w, taskStart, taskEnd);
        const cap = 6 * wdays;
        const isOver = cap > 0 && hPerWeek > cap;
        const bg = isOver ? '#fff3cd' : 'white';
        const txt = hPerWeek > 0 ? `${Math.round(hPerWeek)}h` : '';
        return `<td style="background:${bg};border:1px solid #dee2e6;text-align:center;font-size:.75rem;padding:2px 3px" title="${res.role}: ${Math.round(hPerWeek)}h/wk (cap ${cap}h)">${txt}</td>`;
      }).join('');

      tbodyHtml += `
        <tr class="gantt-role-row" data-task-idx="${taskIdx}">
          <td class="gantt-label-col" style="padding-left:26px;background:#fafafa">
            <span class="text-muted small text-truncate d-block" title="${esc(res.role)}">${esc(res.role)}</span>
            <span style="font-size:.7rem;color:#aaa">${fmtH(rSold)} sold</span>
          </td>
          ${cells}
        </tr>`;
    });
  });

  container.innerHTML = buildWeekAllocationTable(weeks, tbodyHtml, 'Task / Role');
}

function renderPlanningByRole(cfg, weeks, container) {
  // Collect all unique roles across all tasks
  const roleMap = {}; // role -> weekKey -> { hours, breakdown[] }
  const tasks = cfg.tasks || [];

  tasks.forEach(task => {
    if (task.completed) return;
    const taskStart = parseTaskDate(task.startDate || cfg.startDate, false);
    const taskEnd   = parseTaskDate(task.endDate   || cfg.endDate,   true);
    const overlapWeeks = weeks.filter(w => w.weekEnd >= taskStart && w.weekStart <= taskEnd);
    if (!overlapWeeks.length) return;

    (task.resources || []).forEach(res => {
      if (!res.role) return;
      if (!roleMap[res.role]) roleMap[res.role] = {};
      const hPerWeek = res.soldHours / overlapWeeks.length;
      overlapWeeks.forEach(w => {
        const key = w.weekStart.toISOString();
        if (!roleMap[res.role][key]) roleMap[res.role][key] = { hours: 0, breakdown: [] };
        roleMap[res.role][key].hours += hPerWeek;
        roleMap[res.role][key].breakdown.push({ task: task.name, hours: hPerWeek });
      });
    });
  });

  const roles = Object.keys(roleMap).sort();
  let tbodyHtml = '';

  roles.forEach(role => {
    const cells = weeks.map(w => {
      const key  = w.weekStart.toISOString();
      const cell = roleMap[role][key];
      if (!cell) return `<td style="background:#f8f9fa;border:1px solid #dee2e6"></td>`;
      const h = cell.hours;
      const bg = h > 30 ? '#f8d7da' : h > 24 ? '#fff3cd' : 'white';
      const tooltip = cell.breakdown.map(b => `${b.task}: ${Math.round(b.hours)}h`).join('\n');
      return `<td style="background:${bg};border:1px solid #dee2e6;text-align:center;font-size:.75rem;padding:2px 3px" title="${tooltip}">${Math.round(h)}h</td>`;
    }).join('');

    tbodyHtml += `
      <tr>
        <td class="gantt-label-col" style="font-size:.82rem;padding:6px 8px">
          <span class="text-truncate d-block" title="${esc(role)}">${esc(role)}</span>
        </td>
        ${cells}
      </tr>`;
  });

  if (!roles.length) {
    tbodyHtml = `<tr><td colspan="${weeks.length + 1}" class="text-center text-muted p-3">No resources configured.</td></tr>`;
  }

  container.innerHTML = buildWeekAllocationTable(weeks, tbodyHtml, 'Role');
}


function showPlanningView(projectId) {
  planningProjectId = projectId;
  planningReturnToBurndown = true;
  portfolioProjectFilters.clear();
  portfolioProjectFilters.add(projectId);
  showPortfolioPlanningView();
}

function showPortfolioView() {
  planningReturnToBurndown = false;
  portfolioProjectFilters.clear();
  document.getElementById('portfolioSection').style.display          = 'block';
  document.getElementById('portfolioPlanningSection').style.display  = 'none';
  document.getElementById('mainContent').style.display               = 'none';
  document.getElementById('uploadSection').style.display             = 'none';
  document.getElementById('btnAiAnalysis').style.display             = 'none';
  document.getElementById('btnShareEmail').style.display             = 'none';
  selectedProjectId = null;
  renderPortfolioView();
}

function showPortfolioPlanningView() {
  document.getElementById('portfolioSection').style.display          = 'none';
  document.getElementById('portfolioPlanningSection').style.display  = 'block';
  document.getElementById('mainContent').style.display               = 'none';
  document.getElementById('uploadSection').style.display             = 'none';
  document.getElementById('btnAiAnalysis').style.display             = 'none';
  document.getElementById('btnShareEmail').style.display             = 'none';
  renderPortfolioPlanningView();
}

function showDashboardView(pid) {
  const cfg = cfgForProject(pid);
  document.getElementById('portfolioSection').style.display          = 'none';
  document.getElementById('portfolioPlanningSection').style.display  = 'none';
  document.getElementById('uploadSection').style.display             = 'none';
  document.getElementById('mainContent').style.display               = 'block';
  document.getElementById('dashboardProjectName').textContent = cfg?.name || pid;
  document.getElementById('dashboardProjectId').textContent   = cfg?.name ? pid : '';
  const metaEl = document.getElementById('dashboardProjectMeta');
  if (metaEl) metaEl.innerHTML = [pipelineBadge(cfg?.pipeline), statusBadge(cfg?.status)].filter(Boolean).join(' ');
  document.getElementById('projectSelect').value = pid;
  selectProject(pid);
}

// ── PORTFOLIO PLANNING ────────────────────────────────────────────────────────
function renderPortfolioPlanningView() {
  const container = document.getElementById('portfolioPlanningContainer');
  const filtersEl = document.getElementById('portfolioPlanningFilters');

  // Update back button and title based on context
  const backBtn = document.getElementById('btnPortfolioPlanningBack');
  const planningTitle = document.getElementById('portfolioPlanningTitle');
  if (planningReturnToBurndown) {
    backBtn.textContent = '← Burndown';
    if (planningTitle) {
      const projName = portfolioProjectFilters.size === 1
        ? (config.projects?.find(p => portfolioProjectFilters.has(p.id))?.name || [...portfolioProjectFilters][0])
        : '';
      planningTitle.textContent = `📅 Resource Planning${projName ? ' — ' + projName : ''}`;
    }
  } else {
    backBtn.textContent = '← Portfolio';
    if (planningTitle) planningTitle.textContent = '📅 Resource Planning — All Projects';
  }

  const now        = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Initialize window on first open (current month + 3 future months)
  if (!ppWindowStart || !ppWindowEnd) {
    ppWindowStart = new Date(now.getFullYear(), now.getMonth(), 1);
    ppWindowEnd   = new Date(now.getFullYear(), now.getMonth() + 4, 0);
  }
  // Clamp to axis
  const { axisStart: ppAxis0, axisEnd: ppAxis1 } = getPpAxis();
  if (ppWindowStart < ppAxis0) ppWindowStart = new Date(ppAxis0);
  if (ppWindowEnd   > ppAxis1) ppWindowEnd   = new Date(ppAxis1);

  const rangeStart = ppWindowStart;
  const rangeEnd   = ppWindowEnd;

  const weeks = getCalendarWeeks(rangeStart, rangeEnd);
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Annotate weeks
  weeks.forEach(w => {
    w.wNum    = Math.min(5, Math.ceil(w.weekStart.getDate() / 7));
    w.wLabel  = `W${w.wNum}`;
    w.dateTitle = `${String(w.weekStart.getDate()).padStart(2,'0')} ${monthNames[w.weekStart.getMonth()]} – ${String(w.weekEnd.getDate()).padStart(2,'0')} ${monthNames[w.weekEnd.getMonth()]}`;
    w.isPast    = w.weekEnd < todayMidnight;
    w.isCurrent = w.weekStart <= todayMidnight && w.weekEnd >= todayMidnight;
    w.isLastOfMonth = false; // set below
  });
  for (let i = 0; i < weeks.length; i++) {
    weeks[i].isLastOfMonth = (i === weeks.length - 1) || (weeks[i].monthKey !== weeks[i + 1].monthKey);
  }

  // Pipeline filter chips
  const allPipelines = [...new Set(
    (config.projects || []).map(p => p.pipeline || '').filter(p => p && p !== 'SIP' && p !== 'Canceled')
  )].sort();

  filtersEl.innerHTML = '<span class="small text-muted me-1">Pipeline:</span>' +
    allPipelines.map(p => {
      const active = portfolioPlanningFilters.size === 0 || portfolioPlanningFilters.has(p);
      return `<button class="btn btn-sm ${active ? 'btn-primary' : 'btn-outline-secondary'} pp-filter-btn" data-pipeline="${esc(p)}">${esc(p)}</button>`;
    }).join('');
  filtersEl.querySelectorAll('.pp-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pipe = btn.dataset.pipeline;
      if (portfolioPlanningFilters.has(pipe)) portfolioPlanningFilters.delete(pipe);
      else portfolioPlanningFilters.add(pipe);
      renderPortfolioPlanningView();
    });
  });

  // All eligible projects (pipeline filter applied, SIP/Canceled excluded)
  const eligibleProjects = (config.projects || []).filter(p => {
    const pipe = p.pipeline || '';
    if (pipe === 'SIP' || pipe === 'Canceled') return false;
    if (p.status === 'Completed') return false;
    if (portfolioPlanningFilters.size > 0 && !portfolioPlanningFilters.has(pipe)) return false;
    return true;
  });

  // Build project multi-select dropdown
  const menu   = document.getElementById('projectFilterMenu');
  const badge  = document.getElementById('projectFilterBadge');
  const resetBtn = document.getElementById('btnResetProjectFilter');
  menu.innerHTML = eligibleProjects.map(p => {
    const checked = portfolioProjectFilters.size === 0 || portfolioProjectFilters.has(p.id);
    return `<li>
      <label class="dropdown-item d-flex align-items-center gap-2 py-1" style="cursor:pointer;font-size:.83rem">
        <input type="checkbox" class="pp-proj-chk flex-shrink-0" data-pid="${esc(p.id)}" ${checked ? 'checked' : ''}>
        <span class="text-truncate" title="${esc(p.name || p.id)}">${esc(p.name || p.id)}</span>
        ${p.pipeline ? `<span class="badge bg-light text-dark border ms-auto" style="font-size:.65rem">${esc(p.pipeline)}</span>` : ''}
      </label>
    </li>`;
  }).join('') + (eligibleProjects.length
    ? `<li><hr class="dropdown-divider my-1"></li>
       <li><button class="dropdown-item small text-primary" id="btnSelectAllProjects">Select all</button></li>`
    : '');

  // Badge showing selection count
  const selCount = portfolioProjectFilters.size;
  badge.textContent = selCount;
  badge.style.display = selCount > 0 ? '' : 'none';
  resetBtn.style.display = selCount > 0 ? '' : 'none';

  // Checkbox listeners
  menu.querySelectorAll('.pp-proj-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      portfolioProjectFilters.clear();
      menu.querySelectorAll('.pp-proj-chk:checked').forEach(c => portfolioProjectFilters.add(c.dataset.pid));
      // If all selected → treat as "all" (empty set)
      if (portfolioProjectFilters.size === eligibleProjects.length) portfolioProjectFilters.clear();
      renderPortfolioPlanningView();
    });
  });
  const selAllBtn = document.getElementById('btnSelectAllProjects');
  if (selAllBtn) selAllBtn.addEventListener('click', () => {
    portfolioProjectFilters.clear();
    renderPortfolioPlanningView();
  });

  // Team filter
  const allTeams = [...new Set(
    eligibleProjects.flatMap(p =>
      (p.tasks || []).flatMap(t =>
        (t.resources || []).map(r => {
          const dash = r.role ? r.role.indexOf(' - ') : -1;
          return dash > 0 ? r.role.slice(0, dash).trim() : r.role || '';
        })
      )
    ).filter(Boolean)
  )].sort();

  const teamMenu   = document.getElementById('teamFilterMenu');
  const teamBadge  = document.getElementById('teamFilterBadge');
  const teamReset  = document.getElementById('btnResetTeamFilter');

  teamMenu.innerHTML = allTeams.map(t => {
    const checked = portfolioTeamFilters.size === 0 || portfolioTeamFilters.has(t);
    return `<li>
      <label class="dropdown-item d-flex align-items-center gap-2 py-1" style="cursor:pointer;font-size:.83rem">
        <input type="checkbox" class="pp-team-chk flex-shrink-0" data-team="${esc(t)}" ${checked ? 'checked' : ''}>
        <span class="text-truncate">${esc(t)}</span>
      </label>
    </li>`;
  }).join('') + (allTeams.length
    ? `<li><hr class="dropdown-divider my-1"></li>
       <li><button class="dropdown-item small text-primary" id="btnSelectAllTeams">Select all</button></li>`
    : '');

  const teamSelCount = portfolioTeamFilters.size;
  teamBadge.textContent = teamSelCount;
  teamBadge.style.display = teamSelCount > 0 ? '' : 'none';
  teamReset.style.display = teamSelCount > 0 ? '' : 'none';

  teamMenu.querySelectorAll('.pp-team-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      portfolioTeamFilters.clear();
      teamMenu.querySelectorAll('.pp-team-chk:checked').forEach(c => portfolioTeamFilters.add(c.dataset.team));
      if (portfolioTeamFilters.size === allTeams.length) portfolioTeamFilters.clear();
      renderPortfolioPlanningView();
    });
  });
  const selAllTeamsBtn = document.getElementById('btnSelectAllTeams');
  if (selAllTeamsBtn) selAllTeamsBtn.addEventListener('click', () => {
    portfolioTeamFilters.clear();
    renderPortfolioPlanningView();
  });

  // Apply project filter to final list
  const projects = eligibleProjects.filter(p =>
    portfolioProjectFilters.size === 0 || portfolioProjectFilters.has(p.id)
  );

  updatePpWindowWidget();

  if (portfolioPlanningView === 'byproject') {
    renderPortfolioPlanningByProjectContent(container, projects, weeks);
    return;
  }
  if (portfolioPlanningView === 'byowner') {
    renderPortfolioPlanningByOwnerContent(container, projects, weeks);
    return;
  }

  // Build role -> weekKey -> { hours, breakdown, isPast }
  const roleMap      = {};
  const roleSoldMap  = {}; // role -> total sold hours across all projects/tasks
  const roleActualsMap = {}; // role -> total consumed hours from actuals

  projects.forEach(proj => {
    const projData = timesheetData.filter(r => r.projectId === proj.id);

    (proj.tasks || []).forEach(task => {
      if (task.completed) return;
      const tStart = parseTaskDate(task.startDate || proj.startDate, false);
      const tEnd   = parseTaskDate(task.endDate   || proj.endDate,   true);
      const overlapWeeks = weeks.filter(w => w.weekEnd >= tStart && w.weekStart <= tEnd);
      if (!overlapWeeks.length) return;

      (task.resources || []).forEach(res => {
        if (!res.role) return;
        if (!rolePassesTeamFilter(res.role)) return;
        const soldH = res.soldHours || 0;

        // Accumulate sold and actuals per role
        roleSoldMap[res.role]    = (roleSoldMap[res.role]    || 0) + soldH;

        // Consumed hours from actuals for this task+role
        const consumedH = projData
          .filter(r => r.task?.toLowerCase() === task.name.toLowerCase() &&
                       r.role?.toLowerCase() === res.role.toLowerCase())
          .reduce((s, r) => s + r.hours, 0);
        roleActualsMap[res.role] = (roleActualsMap[res.role] || 0) + consumedH;

        const residualH = Math.max(0, soldH - consumedH);

        if (!roleMap[res.role]) roleMap[res.role] = {};

        // PAST weeks: use actual timesheet hours grouped by week
        const pastWeeks = overlapWeeks.filter(w => w.isPast);
        pastWeeks.forEach(w => {
          const actualH = projData
            .filter(r => r.task?.toLowerCase() === task.name.toLowerCase() &&
                         r.role?.toLowerCase() === res.role.toLowerCase() &&
                         r.date >= w.weekStart && r.date <= w.weekEnd)
            .reduce((s, r) => s + r.hours, 0);
          if (actualH < 0.01) return;
          const key = w.weekStart.toISOString();
          if (!roleMap[res.role][key]) roleMap[res.role][key] = { hours: 0, breakdown: [], isPast: true, isPulse: false };
          roleMap[res.role][key].hours += actualH;
          roleMap[res.role][key].breakdown.push({ project: proj.name || proj.id, task: task.name, hours: actualH });
        });

        // CURRENT + FUTURE weeks: distribute residual
        const futureWeeks = overlapWeeks.filter(w => !w.isPast);
        if (!futureWeeks.length || residualH < 0.01) return;
        // Use total task future weeks (not just visible) so hPerWeek is stable as the axis range changes.
        const totalFutureWeeks = countFutureTaskWeeks(tStart, tEnd, todayMidnight);
        const hPerWeek = totalFutureWeeks > 0 ? residualH / totalFutureWeeks : residualH / futureWeeks.length;

        if (portfolioMonthlyPulse && hPerWeek < 1) {
          // Monthly pulse: aggregate by month, show in first week of each month
          const byMonth = {};
          futureWeeks.forEach(w => {
            if (!byMonth[w.monthKey]) byMonth[w.monthKey] = { weeks: [], hours: 0 };
            byMonth[w.monthKey].weeks.push(w);
            byMonth[w.monthKey].hours += hPerWeek;
          });
          Object.values(byMonth).forEach(m => {
            const firstWeek = m.weeks[0];
            const key = firstWeek.weekStart.toISOString();
            if (!roleMap[res.role][key]) roleMap[res.role][key] = { hours: 0, breakdown: [], isPast: false, isPulse: true };
            roleMap[res.role][key].isPulse = true;
            roleMap[res.role][key].hours += m.hours;
            roleMap[res.role][key].breakdown.push({ project: proj.name || proj.id, task: task.name, hours: m.hours });
          });
        } else {
          // Distribute evenly week by week (exact fractional values)
          futureWeeks.forEach(w => {
            const key = w.weekStart.toISOString();
            if (!roleMap[res.role][key]) roleMap[res.role][key] = { hours: 0, breakdown: [], isPast: false, isPulse: false };
            roleMap[res.role][key].hours += hPerWeek;
            roleMap[res.role][key].breakdown.push({ project: proj.name || proj.id, task: task.name, hours: hPerWeek });
          });
        }
      });
    });
  });

  const roles = Object.keys(roleMap).sort();
  const fmtPH = v => v > 0.005 ? (portfolioRoundHours ? Math.round(v) : v.toFixed(2)) + 'h' : '';

  if (!roles.length) {
    container.innerHTML = '<div class="alert alert-info m-3">No resource data found for the selected filters and date range.</div>';
    return;
  }

  // Month groups for header
  const monthGroups = [];
  weeks.forEach(w => {
    const last = monthGroups[monthGroups.length - 1];
    if (last && last.key === w.monthKey) last.count++;
    else monthGroups.push({ key: w.monthKey, count: 1, allPast: w.isPast });
  });
  // A month group is "past" only if all its weeks are past
  weeks.forEach(w => {
    const mg = monthGroups.find(m => m.key === w.monthKey);
    if (mg && !w.isPast) mg.allPast = false;
  });

  // Build display periods (monthly or weekly)
  const isMonthly = ppViewInterval === 'monthly';
  const periods   = isMonthly ? buildMonthPeriods(weeks) : weeks;

  // Header rows
  let periodHeaderHtml, subHeaderHtml = '';
  if (isMonthly) {
    periodHeaderHtml = periods.map(p => {
      const bg = p.isPast ? '#e9ebec' : p.isCurrent ? '#4dabf7' : '#e8eaff';
      const fw = p.isCurrent ? 'font-weight:bold;color:#fff;' : '';
      return `<th style="min-width:70px;text-align:center;background:${bg};font-size:.78rem;padding:4px 3px;border:1px solid #dee2e6;border-right:3px solid #6c757d;${fw}">${p.label}</th>`;
    }).join('');
  } else {
    periodHeaderHtml = monthGroups.map(mg => {
      const bg = mg.allPast ? '#e9ebec' : '#e8eaff';
      return `<th colspan="${mg.count}" style="text-align:center;background:${bg};font-size:.78rem;padding:4px 3px;border:1px solid #dee2e6;">${mg.key}</th>`;
    }).join('');
    subHeaderHtml = weeks.map(w => {
      const bg = w.isCurrent ? '#4dabf7' : w.isPast ? '#e8eaec' : '#f0f2ff';
      const borderR = w.isLastOfMonth ? '3px solid #6c757d' : '1px solid #dee2e6';
      const fw = w.isCurrent ? 'font-weight:bold;color:#fff;' : '';
      return `<th title="${w.dateTitle}" style="min-width:42px;max-width:52px;font-size:.72rem;text-align:center;background:${bg};border:1px solid #dee2e6;border-right:${borderR};padding:3px 2px;white-space:nowrap;${fw}">${w.wLabel}</th>`;
    }).join('');
  }

  // Column totals keyed by period key (for weekly mode weeks don't have .key, use weekStart ISO)
  const pKey = p => isMonthly ? p.key : p.weekStart.toISOString();
  const colTotals = {}, colFutureTotals = {};   // colTotals: all hours (display); colFutureTotals: future-only (TBP)
  periods.forEach(p => { colTotals[pKey(p)] = 0; colFutureTotals[pKey(p)] = 0; });

  let tbodyHtml = '';
  roles.forEach(role => {
    let rowToBePlanned = 0;
    const cells = periods.map(p => {
      const borderR = isMonthly ? '3px solid #6c757d' : (p.isLastOfMonth ? '3px solid #6c757d' : '1px solid #dee2e6');
      const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()];
      let h = 0, hFuture = 0, hasPulse = false, hasBreakdown = [];
      keys.forEach(key => {
        const cell = roleMap[role]?.[key];
        if (cell) {
          h += cell.hours;
          if (!cell.isPast) hFuture += cell.hours;  // only residual/future hours for TBP
          if (cell.isPulse) hasPulse = true;
          hasBreakdown.push(...(cell.breakdown || []));
        }
      });
      const emptyBg = p.isPast ? '#f4f5f6' : 'transparent';
      if (h < 0.01) return `<td style="background:${emptyBg};border:1px solid #dee2e6;border-right:${borderR}"></td>`;

      colTotals[pKey(p)]       = (colTotals[pKey(p)]       || 0) + h;
      colFutureTotals[pKey(p)] = (colFutureTotals[pKey(p)] || 0) + hFuture;
      if (!p.isPast) rowToBePlanned += hFuture;
      const bg = p.isPast ? '#e5e8ea' : hasPulse ? '#ede7f6' : (h > 30 ? '#f8d7da' : h > 24 ? '#fff3cd' : 'white');
      const tipLines = hasBreakdown.sort((a, b) => b.hours - a.hours)
        .map(b => `<div><b>${esc(b.project)}</b><br><span style="padding-left:8px">${esc(b.task)}: ${b.hours.toFixed(2)}h</span></div>`)
        .join('');
      const tipHtml = `<div style="font-size:.72rem;line-height:1.5;text-align:left">${p.isPast ? '<em style="color:#888">actual</em><br>' : hasPulse ? '<em style="color:#7e57c2">aggregato mensile</em><br>' : ''}${tipLines}</div>`;
      const displayVal = hasPulse ? `<span style="font-style:italic;color:#6a3fbf">~${fmtPH(h)}</span>`
        : h < 1 && portfolioRoundHours ? `<span style="color:#888;font-size:.7rem">${h.toFixed(2)}h</span>` : fmtPH(h);

      return `<td data-bs-toggle="tooltip" data-bs-html="true" data-bs-title="${tipHtml.replace(/"/g,'&quot;')}" style="background:${bg};border:1px solid #dee2e6;border-right:${borderR};text-align:center;font-size:.75rem;padding:2px 3px;cursor:default">${displayVal}</td>`;
    }).join('');

    const rSold    = roleSoldMap[role]    || 0;
    const rActuals = roleActualsMap[role] || 0;
    const soldCell = `<td style="position:sticky;left:185px;z-index:2;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd;background:#faf7ef">${fmtPH(rSold)}</td>`;
    const actCell  = `<td style="position:sticky;left:250px;z-index:2;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd;background:#faf7ef">${fmtPH(rActuals)}</td>`;
    const tbpCell  = `<td style="position:sticky;left:330px;z-index:2;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:3px solid #6c757d;background:#faf7ef">${fmtPH(rowToBePlanned)}</td>`;

    tbodyHtml += `
      <tr>
        <td style="position:sticky;left:0;z-index:2;background:white;font-size:.82rem;padding:6px 8px;font-weight:500;border:1px solid #dee2e6;white-space:nowrap">${esc(role)}</td>
        ${soldCell}${actCell}${tbpCell}${cells}
      </tr>`;
  });

  // Totals row
  const totalCells = periods.map(p => {
    const t = colTotals[pKey(p)] || 0;
    const borderR = isMonthly ? '3px solid #6c757d' : (p.isLastOfMonth ? '3px solid #6c757d' : '1px solid #dee2e6');
    const bg = p.isPast ? '#e5e8ea' : p.isCurrent ? '#c8e6ff' : '#f0f2ff';
    return `<td style="background:${bg};border:1px solid #dee2e6;border-right:${borderR};text-align:center;font-size:.75rem;font-weight:bold;padding:2px 3px">${fmtPH(t)}</td>`;
  }).join('');
  const grandSold    = Object.values(roleSoldMap).reduce((s, v) => s + v, 0);
  const grandActuals = Object.values(roleActualsMap).reduce((s, v) => s + v, 0);
  const grandTbp     = periods.filter(p => !p.isPast).reduce((s, p) => s + (colFutureTotals[pKey(p)] || 0), 0);
  tbodyHtml += `
    <tr style="background:#eef1ff">
      <td style="position:sticky;left:0;z-index:2;font-size:.82rem;padding:6px 8px;font-weight:bold;border:1px solid #dee2e6;border-top:3px solid #6c757d;background:#eef1ff">Total</td>
      <td style="position:sticky;left:185px;z-index:2;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd;border-top:3px solid #6c757d;background:#d6cdb3">${fmtPH(grandSold)}</td>
      <td style="position:sticky;left:250px;z-index:2;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd;border-top:3px solid #6c757d;background:#d6cdb3">${fmtPH(grandActuals)}</td>
      <td style="position:sticky;left:330px;z-index:2;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:3px solid #6c757d;border-top:3px solid #6c757d;background:#d6cdb3">${fmtPH(grandTbp)}</td>
      ${totalCells}
    </tr>`;

  container.innerHTML = `
    <div class="alert alert-light border mb-3" style="font-size:.82rem;color:#444;line-height:1.7">
      <strong>Estimation logic:</strong>
      <strong>Past weeks</strong> (grey background) show <em>actual hours</em> from loaded timesheets.
      <strong>Current and future weeks</strong> show <em>residual hours</em> (sold − consumed) distributed linearly across the remaining task duration.
      When the average falls below 1h/week, hours are <strong>aggregated monthly</strong> and shown in the first week of each month —
      these cells are displayed in <span style="background:#ede7f6;padding:1px 5px;border-radius:3px;font-style:italic;color:#6a3fbf">~italic lavender</span> with the label <em>"monthly aggregate"</em> in the tooltip.
      <span style="background:#fff3cd;padding:1px 5px;border-radius:3px">Yellow</span> = load &gt; 24h/week &nbsp;·&nbsp;
      <span style="background:#f8d7da;padding:1px 5px;border-radius:3px">Red</span> = load &gt; 30h/week (overallocation) &nbsp;·&nbsp;
      <span style="background:#c8e6ff;padding:1px 5px;border-radius:3px">Blue</span> = current week / month.
    </div>
    <table class="gantt-table" id="ppResourceTable" style="border-collapse:collapse;width:100%">
      <thead>
        <tr>
          <th rowspan="${isMonthly ? 1 : 2}" style="position:sticky;left:0;z-index:4;min-width:185px;background:#ede8d5;font-size:.82rem;padding:8px 10px;border:1px solid #dee2e6;white-space:nowrap">Role</th>
          <th rowspan="${isMonthly ? 1 : 2}" style="position:sticky;left:185px;z-index:4;min-width:65px;background:#ede8d5;font-size:.82rem;padding:8px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd;text-align:center;white-space:nowrap">Sold</th>
          <th rowspan="${isMonthly ? 1 : 2}" style="position:sticky;left:250px;z-index:4;min-width:80px;background:#ede8d5;font-size:.82rem;padding:8px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd;text-align:center;white-space:nowrap">From<br>actuals</th>
          <th rowspan="${isMonthly ? 1 : 2}" style="position:sticky;left:330px;z-index:4;min-width:90px;background:#ede8d5;font-size:.82rem;padding:8px 6px;border:1px solid #dee2e6;border-right:3px solid #6c757d;text-align:center;white-space:nowrap">To be<br>planned</th>
          ${periodHeaderHtml}
        </tr>
        ${isMonthly ? '' : `<tr>${subHeaderHtml}</tr>`}
      </thead>
      <tbody>${tbodyHtml}</tbody>
    </table>`;

  container.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
    new bootstrap.Tooltip(el, { trigger: 'hover', placement: 'top', customClass: 'pp-tooltip' });
  });

  // Export XLS (styled)
  const exportBtn = document.getElementById('btnExportResourcePlan');
  if (exportBtn) {
    exportBtn._ppExport = () => {
      const rnd = v => Math.round(v * 10) / 10;
      const periodLabels = periods.map(p => isMonthly ? p.label : p.dateTitle);
      const periodMeta   = periods.map(p => ({ isPast: p.isPast, isCurrent: p.isCurrent ?? false }));
      const expRows = [];
      expRows.push({ v: ['Role', 'Sold', 'From actuals', 'To be planned', ...periodLabels], level: 'header' });
      roles.forEach(role => {
        const rowTbp = Object.values(roleMap[role] || {}).reduce((s, c) => s + (c.isPast ? 0 : c.hours), 0);
        const pVals  = periods.map(p => {
          const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()];
          const h = keys.reduce((s, k) => s + (roleMap[role]?.[k]?.hours || 0), 0);
          return h > 0.01 ? rnd(h) : '';
        });
        expRows.push({ v: [role, rnd(roleSoldMap[role] || 0), rnd(roleActualsMap[role] || 0), rnd(rowTbp), ...pVals], level: 'role' });
      });
      const totPVals = periods.map(p => {
        const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()];
        const h = keys.reduce((s, k) => roles.reduce((rs, r) => rs + (roleMap[r]?.[k]?.hours || 0), s), 0);
        return h > 0.01 ? rnd(h) : '';
      });
      expRows.push({ v: ['Total', rnd(grandSold), rnd(grandActuals), rnd(grandTbp), ...totPVals], level: 'total' });
      buildStyledExcelExport({ exportRows: expRows, periodMeta, nameCount: 1, sheetName: 'Resource Planning', filename: `resource_planning_${new Date().toISOString().slice(0,10)}.xlsx` });
    };
    exportBtn.onclick = exportBtn._ppExport;
  }
}

// ── STYLED EXCEL EXPORT ───────────────────────────────────────────────────────
// exportRows: [{ v: [...values], level: 'header'|'project'|'task'|'role'|'owner'|'total' }]
// periodMeta: [{ isPast, isCurrent }]  — one entry per period column (after name + 3 metric cols)
async function buildStyledExcelExport({ exportRows, periodMeta, nameCount, sheetName, filename }) {
  const metricCount = 3;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);

  const lvlFill = {
    header:  { name: 'FFD8DFF7', metric: 'FFE0E1E3' },
    project: { name: 'FFC5CEF7', metric: 'FFD8D9DB' },
    task:    { name: 'FFE8ECFF', metric: 'FFE0E1E3' },
    role:    { name: 'FFFFFFFF', metric: 'FFF0F1F2' },
    owner:   { name: 'FFFAFAFA', metric: 'FFF5F6F7' },
    total:   { name: 'FFEEF1FF', metric: 'FFC8CACC' },
  };
  const periodFill = (pm, isHeader) => {
    if (isHeader) return pm.isCurrent ? 'FF4DABF7' : pm.isPast ? 'FFDDE0E3' : 'FFE8EAFF';
    return pm.isCurrent ? 'FFC8E6FF' : pm.isPast ? 'FFD6D9DC' : 'FFF0F2FF';
  };

  exportRows.forEach(({ v: values, level }) => {
    const wsRow = ws.addRow(values);
    const lc    = lvlFill[level] || lvlFill.role;
    const isBold = ['header', 'project', 'task', 'total'].includes(level);
    wsRow.eachCell({ includeEmpty: true }, (cell, colIdx) => {
      let fgColor, fontColor = 'FF000000';
      if (colIdx <= nameCount) {
        fgColor = lc.name;
      } else if (colIdx <= nameCount + metricCount) {
        fgColor = lc.metric;
      } else {
        const pm = periodMeta[colIdx - nameCount - metricCount - 1];
        if (pm) {
          fgColor = periodFill(pm, level === 'header');
          if (level === 'header' && pm.isCurrent) fontColor = 'FFFFFFFF';
        }
      }
      if (fgColor) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fgColor } };
      cell.font = { name: 'Calibri', size: 9, bold: isBold, color: { argb: fontColor } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFBFC4CA' } }, left: { style: 'thin', color: { argb: 'FFBFC4CA' } },
        bottom: { style: 'thin', color: { argb: 'FFBFC4CA' } }, right: { style: 'thin', color: { argb: 'FFBFC4CA' } },
      };
      cell.alignment = { vertical: 'middle', horizontal: colIdx <= nameCount ? 'left' : 'center' };
    });
    wsRow.height = 15;
  });

  ws.columns = [
    ...Array(nameCount).fill(null).map(() => ({ width: 28 })),
    ...Array(metricCount).fill(null).map(() => ({ width: 12 })),
    ...periodMeta.map(() => ({ width: 11 })),
  ];
  ws.views = [{ state: 'frozen', xSplit: nameCount + metricCount, ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── PORTFOLIO PLANNING — BY PROJECT ──────────────────────────────────────────
function renderPortfolioPlanningByProjectContent(container, projects, weeks) {
  const fmtPH = v => v > 0.005 ? (portfolioRoundHours ? Math.round(v) : v.toFixed(2)) + 'h' : '';
  const fmtDate = str => {
    if (!str) return '';
    const mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (str.length >= 8) return `${parseInt(str.slice(6,8))} ${mn[parseInt(str.slice(4,6))-1]} ${str.slice(0,4)}`;
    return `${mn[parseInt(str.slice(4,6))-1]} ${str.slice(0,4)}`;
  };
  const dateBadge = (s, e) => {
    const parts = [s && fmtDate(s), e && fmtDate(e)].filter(Boolean);
    return parts.length ? ` <span style="font-size:.65rem;color:#6c757d;font-weight:400">${parts.join(' → ')}</span>` : '';
  };

  const SH = 'position:sticky;z-index:4;';
  const SB = 'position:sticky;z-index:2;';
  const rnd = v => Math.round(v * 10) / 10;

  const isMonthly = ppViewInterval === 'monthly';
  const periods   = isMonthly ? buildMonthPeriods(weeks) : weeks;

  // Build header HTML
  let periodHeaderHtml, subHeaderHtml = '';
  if (isMonthly) {
    periodHeaderHtml = periods.map(p => {
      const bg = p.isPast ? '#e9ebec' : p.isCurrent ? '#4dabf7' : '#e8eaff';
      const fw = p.isCurrent ? 'font-weight:bold;color:#fff;' : '';
      return `<th style="min-width:70px;text-align:center;background:${bg};font-size:.78rem;padding:4px 3px;border:1px solid #dee2e6;border-right:3px solid #6c757d;${fw}">${p.label}</th>`;
    }).join('');
  } else {
    const monthGroups = [];
    weeks.forEach(w => {
      const last = monthGroups[monthGroups.length - 1];
      if (last && last.key === w.monthKey) last.count++;
      else monthGroups.push({ key: w.monthKey, count: 1, allPast: w.isPast });
    });
    weeks.forEach(w => { const mg = monthGroups.find(m => m.key === w.monthKey); if (mg && !w.isPast) mg.allPast = false; });
    periodHeaderHtml = monthGroups.map(mg => {
      const bg = mg.allPast ? '#e9ebec' : '#e8eaff';
      return `<th colspan="${mg.count}" style="text-align:center;background:${bg};font-size:.78rem;padding:4px 3px;border:1px solid #dee2e6;">${mg.key}</th>`;
    }).join('');
    subHeaderHtml = weeks.map(w => {
      const bg = w.isCurrent ? '#4dabf7' : w.isPast ? '#e8eaec' : '#f0f2ff';
      const borderR = w.isLastOfMonth ? '3px solid #6c757d' : '1px solid #dee2e6';
      const fw = w.isCurrent ? 'font-weight:bold;color:#fff;' : '';
      return `<th title="${w.dateTitle}" style="min-width:42px;max-width:52px;font-size:.72rem;text-align:center;background:${bg};border:1px solid #dee2e6;border-right:${borderR};padding:3px 2px;white-space:nowrap;${fw}">${w.wLabel}</th>`;
    }).join('');
  }

  // Helper: build period cells from a weekKey→hours map (subtotal rows)
  const makePeriodCells = (weekTotals, bgFn) => periods.map(p => {
    const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()];
    const h = keys.reduce((s, k) => s + (weekTotals[k] || 0), 0);
    const borderR = isMonthly ? '3px solid #6c757d' : (p.isLastOfMonth ? '3px solid #6c757d' : '1px solid #dee2e6');
    if (h < 0.01) return `<td style="background:${p.isPast ? '#f4f5f6' : 'transparent'};border:1px solid #dee2e6;border-right:${borderR}"></td>`;
    return `<td style="background:${bgFn(p)};border:1px solid #dee2e6;border-right:${borderR};text-align:center;font-size:.75rem;font-weight:bold;padding:2px 3px">${fmtPH(h)}</td>`;
  }).join('');

  const periodLabels = periods.map(p => isMonthly ? p.label : p.dateTitle);
  const periodMeta   = periods.map(p => ({ isPast: p.isPast, isCurrent: p.isCurrent ?? false }));
  const exportRows = [];
  exportRows.push({ v: ['Project', 'Task', 'Role', 'Owner', 'Sold', 'From actuals', 'To be planned', ...periodLabels], level: 'header' });

  let tbodyHtml = '';
  let grandSold = 0, grandActuals = 0, grandTbp = 0;
  const grandWeekTotals = {};
  weeks.forEach(w => { grandWeekTotals[w.weekStart.toISOString()] = 0; });

  projects.forEach(proj => {
    const projData = timesheetData.filter(r => r.projectId === proj.id);
    let projSold = 0, projActuals = 0, projTbp = 0;
    const projWeekTotals = {};
    weeks.forEach(w => { projWeekTotals[w.weekStart.toISOString()] = 0; });

    let projBodyHtml = '';
    const projExportRows = [];

    (proj.tasks || []).forEach(task => {
      if (task.completed) return;
      const tStart = parseTaskDate(task.startDate || proj.startDate, false);
      const tEnd   = parseTaskDate(task.endDate   || proj.endDate,   true);
      const overlapWeeks = weeks.filter(w => w.weekEnd >= tStart && w.weekStart <= tEnd);
      if (!overlapWeeks.length) return;

      let taskSold = 0, taskActuals = 0, taskTbp = 0;
      const taskWeekTotals = {};
      weeks.forEach(w => { taskWeekTotals[w.weekStart.toISOString()] = 0; });

      let taskBodyHtml = '';
      const taskExportRows = [];

      (task.resources || []).forEach(res => {
        if (!res.role) return;
        if (!rolePassesTeamFilter(res.role)) return;
        const soldH = res.soldHours || 0;

        const taskRoleRecs = projData.filter(r =>
          r.task?.toLowerCase() === task.name.toLowerCase() &&
          r.role?.toLowerCase() === res.role.toLowerCase()
        );
        const consumedH = taskRoleRecs.reduce((s, r) => s + r.hours, 0);
        const residualH = Math.max(0, soldH - consumedH);

        const ownerTotals = {};
        taskRoleRecs.forEach(r => { const o = r.owner?.trim() || '—'; ownerTotals[o] = (ownerTotals[o] || 0) + r.hours; });
        const totalOwnerH = Object.values(ownerTotals).reduce((s, v) => s + v, 0);
        const ownerNames = Object.keys(ownerTotals).sort((a, b) => ownerTotals[b] - ownerTotals[a]);
        const hasOwners = ownerNames.length > 0;

        const pastWeeks   = overlapWeeks.filter(w => w.isPast);
        const futureWeeks = overlapWeeks.filter(w => !w.isPast);
        const _now = new Date(); const _td = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate());
        const _totalFw = countFutureTaskWeeks(tStart, tEnd, _td);
        const hPerWeek = _totalFw > 0 ? residualH / _totalFw : (futureWeeks.length > 0 ? residualH / futureWeeks.length : 0);

        const roleWeekData = {};

        pastWeeks.forEach(w => {
          const key  = w.weekStart.toISOString();
          const recs = taskRoleRecs.filter(r => r.date >= w.weekStart && r.date <= w.weekEnd);
          const tot  = recs.reduce((s, r) => s + r.hours, 0);
          if (tot < 0.01) return;
          const byOwner = {};
          recs.forEach(r => { const o = r.owner?.trim() || '—'; byOwner[o] = (byOwner[o] || 0) + r.hours; });
          roleWeekData[key] = { total: tot, byOwner, isPulse: false, isPast: true };
        });

        const distribute = (byOwner, hours) => {
          if (hasOwners && totalOwnerH > 0.01) {
            ownerNames.forEach(o => { byOwner[o] = (byOwner[o] || 0) + hours * (ownerTotals[o] / totalOwnerH); });
          } else {
            byOwner['—'] = (byOwner['—'] || 0) + hours;
          }
        };

        if (futureWeeks.length > 0 && residualH > 0.01) {
          if (portfolioMonthlyPulse && hPerWeek < 1) {
            const byMonth = {};
            futureWeeks.forEach(w => {
              if (!byMonth[w.monthKey]) byMonth[w.monthKey] = { firstWeek: w, hours: 0 };
              byMonth[w.monthKey].hours += hPerWeek;
            });
            Object.values(byMonth).forEach(m => {
              const key = m.firstWeek.weekStart.toISOString();
              if (!roleWeekData[key]) roleWeekData[key] = { total: 0, byOwner: {}, isPulse: true, isPast: false };
              roleWeekData[key].total += m.hours;
              roleWeekData[key].isPulse = true;
              distribute(roleWeekData[key].byOwner, m.hours);
            });
          } else {
            futureWeeks.forEach(w => {
              const key = w.weekStart.toISOString();
              if (!roleWeekData[key]) roleWeekData[key] = { total: 0, byOwner: {}, isPulse: false, isPast: false };
              roleWeekData[key].total += hPerWeek;
              distribute(roleWeekData[key].byOwner, hPerWeek);
            });
          }
        }

        const roleTbp = Object.entries(roleWeekData)
          .filter(([key]) => weeks.find(w => w.weekStart.toISOString() === key && !w.isPast))
          .reduce((s, [, d]) => s + d.total, 0);

        taskSold    += soldH;
        taskActuals += consumedH;
        taskTbp     += roleTbp;
        Object.entries(roleWeekData).forEach(([key, d]) => { taskWeekTotals[key] = (taskWeekTotals[key] || 0) + d.total; });

        // Role row — period cells
        const noOwnerBadge = !hasOwners ? ' <span style="font-size:.65rem;background:#fff3cd;border:1px solid #ffc107;border-radius:3px;padding:0 4px;color:#856404">no owner</span>' : '';
        const roleStyle    = !hasOwners ? 'color:#dc6500;font-style:italic;' : '';

        const rolePeriodCells = periods.map(p => {
          const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()];
          let h = 0, isPulse = false;
          keys.forEach(key => { const d = roleWeekData[key]; if (d) { h += d.total; if (d.isPulse) isPulse = true; } });
          const borderR = isMonthly ? '3px solid #6c757d' : (p.isLastOfMonth ? '3px solid #6c757d' : '1px solid #dee2e6');
          if (h < 0.01) return `<td style="background:${p.isPast ? '#f4f5f6' : 'transparent'};border:1px solid #dee2e6;border-right:${borderR}"></td>`;
          const bg = p.isPast ? '#e5e8ea' : isPulse ? '#ede7f6' : (h > 30 ? '#f8d7da' : h > 24 ? '#fff3cd' : 'white');
          const dv = isPulse ? `<span style="font-style:italic;color:#6a3fbf">~${fmtPH(h)}</span>`
            : h < 1 && portfolioRoundHours ? `<span style="color:#888;font-size:.7rem">${h.toFixed(2)}h</span>`
            : fmtPH(h);
          return `<td style="background:${bg};border:1px solid #dee2e6;border-right:${borderR};text-align:center;font-size:.75rem;padding:2px 3px">${dv}</td>`;
        }).join('');

        taskBodyHtml += `
          <tr>
            <td style="${SB}left:0;background:#fff;font-size:.8rem;padding:4px 8px 4px 30px;border:1px solid #dee2e6;white-space:nowrap;font-weight:600;${roleStyle}">${esc(res.role)}${noOwnerBadge}</td>
            <td style="${SB}left:200px;background:#faf7ef;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd">${fmtPH(soldH)}</td>
            <td style="${SB}left:265px;background:#faf7ef;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd">${fmtPH(consumedH)}</td>
            <td style="${SB}left:345px;background:#faf7ef;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:3px solid #6c757d">${fmtPH(roleTbp)}</td>
            ${rolePeriodCells}
          </tr>`;

        taskExportRows.push({ v: ['', '', res.role, '', rnd(soldH), rnd(consumedH), rnd(roleTbp),
          ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (roleWeekData[k]?.total || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'role' });

        // Owner rows
        const displayOwners = hasOwners ? ownerNames : ['—'];
        displayOwners.forEach(ownerName => {
          const isPlaceholder = ownerName === '—';
          const ownerActualsH = ownerTotals[ownerName] || 0;
          const ownerProp     = totalOwnerH > 0.01 ? (ownerTotals[ownerName] || 0) / totalOwnerH : (isPlaceholder ? 1 : 0);
          const ownerTbpH     = roleTbp * ownerProp;

          const ownerPeriodCells = periods.map(p => {
            const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()];
            let oh = 0, isPulse = false;
            keys.forEach(key => { const d = roleWeekData[key]; if (d) { oh += (d.byOwner[ownerName] || 0); if (d.isPulse) isPulse = true; } });
            const borderR = isMonthly ? '3px solid #6c757d' : (p.isLastOfMonth ? '3px solid #6c757d' : '1px solid #dee2e6');
            const emptyBg = p.isPast ? '#f4f5f6' : 'transparent';
            if (oh < 0.01) return `<td style="background:${emptyBg};border:1px solid #dee2e6;border-right:${borderR}"></td>`;
            const bg = p.isPast ? '#e8eaec' : isPulse ? '#f3effe' : '#fafafa';
            const dv = isPulse ? `<span style="font-style:italic;color:#7e57c2;font-size:.7rem">~${fmtPH(oh)}</span>`
              : oh < 1 && portfolioRoundHours ? `<span style="color:#888;font-size:.68rem">${oh.toFixed(2)}h</span>`
              : `<span style="font-size:.72rem">${fmtPH(oh)}</span>`;
            return `<td style="background:${bg};border:1px solid #dee2e6;border-right:${borderR};text-align:center;padding:2px 3px">${dv}</td>`;
          }).join('');

          const ownerLabel = isPlaceholder ? '<span style="color:#aaa;font-style:italic">TBD</span>' : esc(ownerName);
          taskBodyHtml += `
            <tr style="background:#fafafa">
              <td style="${SB}left:0;background:#fafafa;font-size:.75rem;padding:3px 8px 3px 52px;border:1px solid #dee2e6;color:#444;white-space:nowrap">${ownerLabel}</td>
              <td style="${SB}left:200px;background:#f5f6f7;text-align:center;font-size:.72rem;padding:2px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd;color:#aaa">—</td>
              <td style="${SB}left:265px;background:#f5f6f7;text-align:center;font-size:.72rem;padding:2px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd;color:#555">${fmtPH(ownerActualsH)}</td>
              <td style="${SB}left:345px;background:#f5f6f7;text-align:center;font-size:.72rem;padding:2px 6px;border:1px solid #dee2e6;border-right:3px solid #6c757d;color:#555">${fmtPH(ownerTbpH)}</td>
              ${ownerPeriodCells}
            </tr>`;

          taskExportRows.push({ v: ['', '', res.role, isPlaceholder ? 'TBD' : ownerName, '', rnd(ownerActualsH), rnd(ownerTbpH),
            ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const oh = keys.reduce((s, k) => s + ((roleWeekData[k]?.byOwner[ownerName]) || 0), 0); return oh > 0.01 ? rnd(oh) : ''; })], level: 'owner' });
        });
      });

      if (!taskBodyHtml) return;

      projSold    += taskSold;
      projActuals += taskActuals;
      projTbp     += taskTbp;
      Object.entries(taskWeekTotals).forEach(([key, h]) => { projWeekTotals[key] = (projWeekTotals[key] || 0) + h; });

      projExportRows.push(
        { v: ['', task.name, '', '', rnd(taskSold), rnd(taskActuals), rnd(taskTbp),
          ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (taskWeekTotals[k] || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'task' },
        ...taskExportRows
      );

      projBodyHtml += `
        <tr style="background:#e8ecff;border-top:2px solid #8899dd">
          <td style="${SB}left:0;background:#e8ecff;font-size:.8rem;padding:5px 8px 5px 18px;font-weight:600;border:1px solid #dee2e6;border-left:3px solid #8899dd;white-space:nowrap">📋 ${esc(task.name)}${dateBadge(task.startDate, task.endDate)}</td>
          <td style="${SB}left:200px;background:#ede8d5;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd">${fmtPH(taskSold)}</td>
          <td style="${SB}left:265px;background:#ede8d5;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd">${fmtPH(taskActuals)}</td>
          <td style="${SB}left:345px;background:#ede8d5;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:3px solid #6c757d">${fmtPH(taskTbp)}</td>
          ${makePeriodCells(taskWeekTotals, p => p.isPast ? '#e5e8ea' : p.isCurrent ? '#c8e6ff' : '#f0f2ff')}
        </tr>
        ${taskBodyHtml}`;
    });

    if (!projBodyHtml) return;

    grandSold    += projSold;
    grandActuals += projActuals;
    grandTbp     += projTbp;
    Object.entries(projWeekTotals).forEach(([key, h]) => { grandWeekTotals[key] = (grandWeekTotals[key] || 0) + h; });

    const pipeBadge  = proj.pipeline ? ' ' + pipelineBadge(proj.pipeline) : '';
    const statBadge  = proj.status  ? ' ' + statusBadge(proj.status)     : '';

    exportRows.push(
      { v: [proj.name || proj.id, '', '', '', rnd(projSold), rnd(projActuals), rnd(projTbp),
        ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (projWeekTotals[k] || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'project' },
      ...projExportRows
    );

    tbodyHtml += `
      <tr style="background:#c5cef7;border-top:3px solid #5468c4;border-bottom:1px solid #5468c4">
        <td style="${SB}left:0;background:#c5cef7;font-size:.85rem;padding:7px 8px 7px 10px;font-weight:700;border:1px solid #dee2e6;border-left:4px solid #5468c4;white-space:nowrap">🏢 ${esc(proj.name || proj.id)}${pipeBadge}${statBadge}${dateBadge(proj.startDate, proj.endDate)}</td>
        <td style="${SB}left:200px;background:#dfd8c3;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd">${fmtPH(projSold)}</td>
        <td style="${SB}left:265px;background:#dfd8c3;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd">${fmtPH(projActuals)}</td>
        <td style="${SB}left:345px;background:#dfd8c3;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:3px solid #6c757d">${fmtPH(projTbp)}</td>
        ${makePeriodCells(projWeekTotals, p => p.isPast ? '#bec3c8' : p.isCurrent ? '#90c8f0' : '#c8d0f5')}
      </tr>
      ${projBodyHtml}`;
  });

  if (!tbodyHtml) {
    container.innerHTML = '<div class="alert alert-info m-3">No resource data found for the selected filters and date range.</div>';
    return;
  }

  tbodyHtml += `
    <tr style="background:#eef1ff;border-top:3px solid #6c757d">
      <td style="${SB}left:0;background:#eef1ff;font-size:.82rem;padding:6px 8px;font-weight:bold;border:1px solid #dee2e6;border-top:3px solid #6c757d">Total</td>
      <td style="${SB}left:200px;background:#d6cdb3;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd;border-top:3px solid #6c757d">${fmtPH(grandSold)}</td>
      <td style="${SB}left:265px;background:#d6cdb3;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd;border-top:3px solid #6c757d">${fmtPH(grandActuals)}</td>
      <td style="${SB}left:345px;background:#d6cdb3;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:3px solid #6c757d;border-top:3px solid #6c757d">${fmtPH(grandTbp)}</td>
      ${makePeriodCells(grandWeekTotals, p => p.isPast ? '#e5e8ea' : p.isCurrent ? '#c8e6ff' : '#f0f2ff')}
    </tr>`;

  exportRows.push(
    { v: ['Total', '', '', '', rnd(grandSold), rnd(grandActuals), rnd(grandTbp),
      ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (grandWeekTotals[k] || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'total' }
  );

  const rowspan = isMonthly ? '1' : '2';
  container.innerHTML = `
    <div class="alert alert-light border mb-3" style="font-size:.82rem;color:#444;line-height:1.7">
      <strong>Estimation logic (By Project):</strong>
      The table is structured as <strong>Project → Task → Role → Owner</strong>.
      <strong>Past weeks</strong> (grey) show <em>actual hours</em> from timesheets, broken down by owner.
      <strong>Current and future weeks</strong> show <em>residual hours</em> (sold − consumed) distributed linearly across the remaining task duration,
      then split among owners <em>proportionally to their share of actuals</em>.
      When residual falls below 1h/week per role, hours are <strong>aggregated monthly</strong> —
      shown in <span style="background:#ede7f6;padding:1px 5px;border-radius:3px;font-style:italic;color:#6a3fbf">~italic lavender</span>.
      <span style="background:#c8e6ff;padding:1px 5px;border-radius:3px">Blue</span> = current week / month.
    </div>
    <table class="gantt-table" id="ppResourceTable" style="border-collapse:collapse;width:100%">
      <thead>
        <tr>
          <th rowspan="${rowspan}" style="${SH}left:0;min-width:200px;background:#d8dff7;font-size:.82rem;padding:8px 10px;border:1px solid #dee2e6;white-space:nowrap">Project / Task / Role / Owner</th>
          <th rowspan="${rowspan}" style="${SH}left:200px;min-width:65px;background:#ede8d5;font-size:.82rem;padding:8px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd;text-align:center;white-space:nowrap">Sold</th>
          <th rowspan="${rowspan}" style="${SH}left:265px;min-width:80px;background:#ede8d5;font-size:.82rem;padding:8px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd;text-align:center;white-space:nowrap">From<br>actuals</th>
          <th rowspan="${rowspan}" style="${SH}left:345px;min-width:90px;background:#ede8d5;font-size:.82rem;padding:8px 6px;border:1px solid #dee2e6;border-right:3px solid #6c757d;text-align:center;white-space:nowrap">To be<br>planned</th>
          ${periodHeaderHtml}
        </tr>
        ${isMonthly ? '' : `<tr>${subHeaderHtml}</tr>`}
      </thead>
      <tbody>${tbodyHtml}</tbody>
    </table>`;

  const exportBtn = document.getElementById('btnExportResourcePlan');
  if (exportBtn) {
    exportBtn._ppExport = () => buildStyledExcelExport({ exportRows, periodMeta, nameCount: 4, sheetName: 'Planning By Project', filename: 'planning_by_project.xlsx' });
  }
}

// ── PLANNING BY OWNER ─────────────────────────────────────────────────────────
function renderPortfolioPlanningByOwnerContent(container, projects, weeks) {
  const fmtPH = v => v > 0.005 ? (portfolioRoundHours ? Math.round(v) : v.toFixed(2)) + 'h' : '';
  const rnd   = v => Math.round(v * 10) / 10;
  const SH = 'position:sticky;z-index:4;';
  const SB = 'position:sticky;z-index:2;';

  const isMonthly = ppViewInterval === 'monthly';
  const periods   = isMonthly ? buildMonthPeriods(weeks) : weeks;

  // Header HTML
  let periodHeaderHtml, subHeaderHtml = '';
  if (isMonthly) {
    periodHeaderHtml = periods.map(p => {
      const bg = p.isPast ? '#e9ebec' : p.isCurrent ? '#4dabf7' : '#e8eaff';
      const fw = p.isCurrent ? 'font-weight:bold;color:#fff;' : '';
      return `<th style="min-width:70px;text-align:center;background:${bg};font-size:.78rem;padding:4px 3px;border:1px solid #dee2e6;border-right:3px solid #6c757d;${fw}">${p.label}</th>`;
    }).join('');
  } else {
    const monthGroups = [];
    weeks.forEach(w => {
      const last = monthGroups[monthGroups.length - 1];
      if (last && last.key === w.monthKey) last.count++;
      else monthGroups.push({ key: w.monthKey, count: 1, allPast: w.isPast });
    });
    weeks.forEach(w => { const mg = monthGroups.find(m => m.key === w.monthKey); if (mg && !w.isPast) mg.allPast = false; });
    periodHeaderHtml = monthGroups.map(mg => {
      const bg = mg.allPast ? '#e9ebec' : '#e8eaff';
      return `<th colspan="${mg.count}" style="text-align:center;background:${bg};font-size:.78rem;padding:4px 3px;border:1px solid #dee2e6;">${mg.key}</th>`;
    }).join('');
    subHeaderHtml = weeks.map(w => {
      const bg = w.isCurrent ? '#4dabf7' : w.isPast ? '#e8eaec' : '#f0f2ff';
      const borderR = w.isLastOfMonth ? '3px solid #6c757d' : '1px solid #dee2e6';
      return `<th title="${w.dateTitle}" style="min-width:42px;max-width:52px;font-size:.72rem;text-align:center;background:${bg};border:1px solid #dee2e6;border-right:${borderR};padding:3px 2px;white-space:nowrap;${w.isCurrent ? 'font-weight:bold;color:#fff;' : ''}">${w.wLabel}</th>`;
    }).join('');
  }

  // Build ownerMap: owner → { sold, actuals, tbp, weekTotals, projects: { projId → { name, sold, actuals, tbp, weekTotals, roles: { role → { sold, actuals, tbp, weekData } } } } }
  const ownerMap = {};

  projects.forEach(proj => {
    const projData = timesheetData.filter(r => r.projectId === proj.id);
    (proj.tasks || []).forEach(task => {
      if (task.completed) return;
      const tStart = task.startDate ? parseTaskDate(task.startDate, false) : null;
      const tEnd   = task.endDate   ? parseTaskDate(task.endDate,   true)  : null;
      (task.resources || []).forEach(res => {
        if (!rolePassesTeamFilter(res.role)) return;
        const soldH    = res.soldHours || 0;
        const roleRecs = projData.filter(r => r.role === res.role && (!task.name || r.task === task.name));

        // Past week data + owner totals
        const roleWeekData = {};
        const ownerTotals  = {};
        let totalOwnerH    = 0;

        weeks.forEach(w => {
          if (!w.isPast) return;
          const key  = w.weekStart.toISOString();
          const recs = roleRecs.filter(r => { const d = new Date(r.date); d.setHours(0,0,0,0); return d >= w.weekStart && d <= w.weekEnd; });
          if (!recs.length) return;
          const byOwner = {};
          recs.forEach(r => { const o = r.owner?.trim() || '—'; byOwner[o] = (byOwner[o] || 0) + r.hours; });
          roleWeekData[key] = { total: recs.reduce((s, r) => s + r.hours, 0), byOwner, isPulse: false, isPast: true };
        });
        roleRecs.forEach(r => { const o = r.owner?.trim() || '—'; ownerTotals[o] = (ownerTotals[o] || 0) + r.hours; });
        Object.values(ownerTotals).forEach(h => { totalOwnerH += h; });

        const consumedH = totalOwnerH;
        const roleTbp   = Math.max(0, soldH - consumedH);
        if (soldH < 0.01 && consumedH < 0.01) return;

        const ownerNames = Object.entries(ownerTotals).filter(([, h]) => h > 0.01).sort((a, b) => b[1] - a[1]).map(([o]) => o);
        const hasOwners  = ownerNames.length > 0;

        // Future week distribution
        if (roleTbp > 0.01) {
          const _owNow = new Date(); const _owTd = new Date(_owNow.getFullYear(), _owNow.getMonth(), _owNow.getDate());
          const futureWeeks = weeks.filter(w => !w.isPast);
          const taskWeeks   = tStart && tEnd ? futureWeeks.filter(w => w.weekEnd >= tStart && w.weekStart <= tEnd) : futureWeeks;
          // Compute canonical counts from task date range (stable regardless of view range)
          const totalTaskFw = (tStart && tEnd) ? countFutureTaskWeeks(tStart, tEnd, _owTd) : taskWeeks.length;
          const totalTaskFm = (tStart && tEnd) ? countFutureTaskMonths(tStart, tEnd, _owTd) : null;
          const distribute  = (byOwner, hours) => {
            if (totalOwnerH > 0.01) ownerNames.forEach(o => { byOwner[o] = (byOwner[o] || 0) + hours * (ownerTotals[o] / totalOwnerH); });
            else byOwner['—'] = (byOwner['—'] || 0) + hours;
          };
          if (portfolioMonthlyPulse && roleTbp < taskWeeks.length) {
            const monthMap = {};
            taskWeeks.forEach(w => { if (!monthMap[w.monthKey]) monthMap[w.monthKey] = []; monthMap[w.monthKey].push(w); });
            const mkKeys = Object.keys(monthMap);
            const mh     = roleTbp / (totalTaskFm || mkKeys.length || 1);
            mkKeys.forEach(mk => {
              const lastW = monthMap[mk][monthMap[mk].length - 1];
              const key   = lastW.weekStart.toISOString();
              if (!roleWeekData[key]) roleWeekData[key] = { total: 0, byOwner: {}, isPulse: true, isPast: false };
              roleWeekData[key].total += mh;
              distribute(roleWeekData[key].byOwner, mh);
            });
          } else {
            const hpw = totalTaskFw > 0 ? roleTbp / totalTaskFw : (taskWeeks.length > 0 ? roleTbp / taskWeeks.length : 0);
            taskWeeks.forEach(w => {
              const key = w.weekStart.toISOString();
              if (!roleWeekData[key]) roleWeekData[key] = { total: 0, byOwner: {}, isPulse: false, isPast: false };
              roleWeekData[key].total += hpw;
              distribute(roleWeekData[key].byOwner, hpw);
            });
          }
        }

        // Pivot into ownerMap
        const displayOwners = hasOwners ? ownerNames : ['—'];
        displayOwners.forEach(ownerName => {
          const isPlaceholder = ownerName === '—';
          const ownerProp    = totalOwnerH > 0.01 ? (ownerTotals[ownerName] || 0) / totalOwnerH : (isPlaceholder ? 1 : 0);
          const ownerSold    = soldH * ownerProp;
          const ownerActuals = ownerTotals[ownerName] || 0;
          const ownerTbpH    = roleTbp * ownerProp;

          if (!ownerMap[ownerName]) ownerMap[ownerName] = { sold: 0, actuals: 0, tbp: 0, weekTotals: {}, projects: {} };
          const om = ownerMap[ownerName];
          om.sold += ownerSold; om.actuals += ownerActuals; om.tbp += ownerTbpH;

          if (!om.projects[proj.id]) om.projects[proj.id] = { name: proj.name || proj.id, sold: 0, actuals: 0, tbp: 0, weekTotals: {}, roles: {} };
          const pm = om.projects[proj.id];
          pm.sold += ownerSold; pm.actuals += ownerActuals; pm.tbp += ownerTbpH;

          if (!pm.roles[res.role]) pm.roles[res.role] = { sold: 0, actuals: 0, tbp: 0, weekData: {} };
          const rm = pm.roles[res.role];
          rm.sold += ownerSold; rm.actuals += ownerActuals; rm.tbp += ownerTbpH;

          weeks.forEach(w => {
            const key = w.weekStart.toISOString();
            const d   = roleWeekData[key];
            if (!d) return;
            const oh = d.byOwner[ownerName] || 0;
            if (oh < 0.001) return;
            if (!rm.weekData[key]) rm.weekData[key] = { hours: 0, isPulse: d.isPulse, isPast: d.isPast };
            rm.weekData[key].hours += oh;
            if (!pm.weekTotals[key]) pm.weekTotals[key] = { hours: 0, isPulse: d.isPulse, isPast: d.isPast };
            pm.weekTotals[key].hours += oh;
            if (!om.weekTotals[key]) om.weekTotals[key] = { hours: 0, isPulse: d.isPulse, isPast: d.isPast };
            om.weekTotals[key].hours += oh;
          });
        });
      });
    });
  });

  if (Object.keys(ownerMap).length === 0) {
    container.innerHTML = '<div class="alert alert-info m-3">Nessun dato owner trovato per i filtri selezionati.</div>';
    return;
  }

  // Period cell helper for ownerMap data (weekTotals has { hours, isPulse, isPast })
  const makePeriodCells = (weekDataMap, bgFn, small = false) => periods.map(p => {
    const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()];
    let h = 0, isPulse = false;
    keys.forEach(key => { const d = weekDataMap[key]; if (d) { h += d.hours; if (d.isPulse) isPulse = true; } });
    const borderR = isMonthly ? '3px solid #6c757d' : (p.isLastOfMonth ? '3px solid #6c757d' : '1px solid #dee2e6');
    if (h < 0.01) return `<td style="background:${p.isPast ? '#f4f5f6' : 'transparent'};border:1px solid #dee2e6;border-right:${borderR}"></td>`;
    const bg = bgFn ? bgFn(p, h, isPulse) : (p.isPast ? (small ? '#e8eaec' : '#e5e8ea') : isPulse ? (small ? '#f3effe' : '#ede7f6') : p.isCurrent ? '#c8e6ff' : small ? '#fafafa' : 'white');
    const dv = isPulse
      ? `<span style="font-style:italic;color:${small ? '#7e57c2' : '#6a3fbf'};font-size:${small ? '.7rem' : '.75rem'}">~${fmtPH(h)}</span>`
      : (h < 1 && portfolioRoundHours ? `<span style="color:#888;font-size:.68rem">${h.toFixed(2)}h</span>` : `<span style="font-size:${small ? '.72rem' : '.75rem'}">${fmtPH(h)}</span>`);
    return `<td style="background:${bg};border:1px solid #dee2e6;border-right:${borderR};text-align:center;padding:2px 3px">${dv}</td>`;
  }).join('');

  // Helper for grand total (plain weekKey→number map)
  const makeGrandCells = weekTotals => periods.map(p => {
    const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()];
    const h = keys.reduce((s, k) => s + (weekTotals[k] || 0), 0);
    const borderR = isMonthly ? '3px solid #6c757d' : (p.isLastOfMonth ? '3px solid #6c757d' : '1px solid #dee2e6');
    if (h < 0.01) return `<td style="background:${p.isPast ? '#f4f5f6' : 'transparent'};border:1px solid #dee2e6;border-right:${borderR}"></td>`;
    const bg = p.isPast ? '#e5e8ea' : p.isCurrent ? '#c8e6ff' : '#f0f2ff';
    return `<td style="background:${bg};border:1px solid #dee2e6;border-right:${borderR};text-align:center;font-size:.75rem;font-weight:bold;padding:2px 3px">${fmtPH(h)}</td>`;
  }).join('');

  const periodLabels = periods.map(p => isMonthly ? p.label : p.dateTitle);
  const periodMeta   = periods.map(p => ({ isPast: p.isPast, isCurrent: p.isCurrent ?? false }));
  const exportRows = [];
  exportRows.push({ v: ['Owner', 'Progetto', 'Ruolo', 'Sold', 'From actuals', 'To be planned', ...periodLabels], level: 'header' });
  let tbodyHtml = '';
  let grandSold = 0, grandActuals = 0, grandTbp = 0;
  const grandWeekTotals = {};

  Object.entries(ownerMap).sort((a, b) => a[0].localeCompare(b[0])).forEach(([ownerName, om]) => {
    const displayName = ownerName === '—' ? 'TBD' : ownerName;
    grandSold += om.sold; grandActuals += om.actuals; grandTbp += om.tbp;

    weeks.forEach(w => {
      const key = w.weekStart.toISOString();
      grandWeekTotals[key] = (grandWeekTotals[key] || 0) + (om.weekTotals[key]?.hours || 0);
    });

    tbodyHtml += `
      <tr style="background:#c5cef7;border-top:3px solid #5468c4;border-bottom:1px solid #5468c4">
        <td style="${SB}left:0;background:#c5cef7;font-size:.88rem;padding:7px 8px 7px 10px;font-weight:700;border:1px solid #dee2e6;border-left:4px solid #5468c4;white-space:nowrap">👤 ${esc(displayName)}</td>
        <td style="${SB}left:200px;background:#dfd8c3;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd">${fmtPH(om.sold)}</td>
        <td style="${SB}left:265px;background:#dfd8c3;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd">${fmtPH(om.actuals)}</td>
        <td style="${SB}left:345px;background:#dfd8c3;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:3px solid #6c757d">${fmtPH(om.tbp)}</td>
        ${makePeriodCells(om.weekTotals, null)}
      </tr>`;
    exportRows.push({ v: [displayName, '', '', rnd(om.sold), rnd(om.actuals), rnd(om.tbp),
      ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (om.weekTotals[k]?.hours || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'project' });

    Object.entries(om.projects).sort((a, b) => a[1].name.localeCompare(b[1].name)).forEach(([projId, pm]) => {
      const projCfg = (config.projects || []).find(p => p.id === projId);
      const pmPipe  = projCfg ? pipelineBadge(projCfg.pipeline) : '';
      const pmStat  = projCfg ? statusBadge(projCfg.status)     : '';
      tbodyHtml += `
        <tr style="background:#e8ecff;border-top:2px solid #8899dd">
          <td style="${SB}left:0;background:#e8ecff;font-size:.8rem;padding:5px 8px 5px 22px;font-weight:600;border:1px solid #dee2e6;border-left:3px solid #8899dd;white-space:nowrap">🏢 ${esc(pm.name)} ${pmPipe} ${pmStat}</td>
          <td style="${SB}left:200px;background:#ede8d5;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd">${fmtPH(pm.sold)}</td>
          <td style="${SB}left:265px;background:#ede8d5;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd">${fmtPH(pm.actuals)}</td>
          <td style="${SB}left:345px;background:#ede8d5;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:3px solid #6c757d">${fmtPH(pm.tbp)}</td>
          ${makePeriodCells(pm.weekTotals, null)}
        </tr>`;
      exportRows.push({ v: ['', pm.name, '', rnd(pm.sold), rnd(pm.actuals), rnd(pm.tbp),
        ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (pm.weekTotals[k]?.hours || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'task' });

      Object.entries(pm.roles).sort((a, b) => a[0].localeCompare(b[0])).forEach(([role, rm]) => {
        tbodyHtml += `
          <tr style="background:#fafafa">
            <td style="${SB}left:0;background:#fafafa;font-size:.78rem;padding:4px 8px 4px 38px;font-weight:600;border:1px solid #dee2e6;white-space:nowrap;color:#444">${esc(role)}</td>
            <td style="${SB}left:200px;background:#faf7ef;text-align:center;font-size:.72rem;padding:2px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd;color:#6c757d">${fmtPH(rm.sold)}</td>
            <td style="${SB}left:265px;background:#faf7ef;text-align:center;font-size:.72rem;padding:2px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd;color:#555">${fmtPH(rm.actuals)}</td>
            <td style="${SB}left:345px;background:#faf7ef;text-align:center;font-size:.72rem;padding:2px 6px;border:1px solid #dee2e6;border-right:3px solid #6c757d;color:#555">${fmtPH(rm.tbp)}</td>
            ${makePeriodCells(rm.weekData, null, true)}
          </tr>`;
        exportRows.push({ v: ['', '', role, rnd(rm.sold), rnd(rm.actuals), rnd(rm.tbp),
          ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (rm.weekData[k]?.hours || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'role' });
      });
    });
  });

  tbodyHtml += `
    <tr style="background:#eef1ff;border-top:3px solid #6c757d">
      <td style="${SB}left:0;background:#eef1ff;font-size:.82rem;padding:6px 8px;font-weight:bold;border:1px solid #dee2e6;border-top:3px solid #6c757d">Totale</td>
      <td style="${SB}left:200px;background:#d6cdb3;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd;border-top:3px solid #6c757d">${fmtPH(grandSold)}</td>
      <td style="${SB}left:265px;background:#d6cdb3;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd;border-top:3px solid #6c757d">${fmtPH(grandActuals)}</td>
      <td style="${SB}left:345px;background:#d6cdb3;text-align:center;font-size:.75rem;font-weight:bold;padding:2px 6px;border:1px solid #dee2e6;border-right:3px solid #6c757d;border-top:3px solid #6c757d">${fmtPH(grandTbp)}</td>
      ${makeGrandCells(grandWeekTotals)}
    </tr>`;

  exportRows.push({ v: ['Totale', '', '', rnd(grandSold), rnd(grandActuals), rnd(grandTbp),
    ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (grandWeekTotals[k] || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'total' });

  const rowspan = isMonthly ? '1' : '2';
  container.innerHTML = `
    <div class="alert alert-light border mb-3" style="font-size:.82rem;color:#444;line-height:1.7">
      <strong>Logica stima (By Owner):</strong>
      La tabella è strutturata come <strong>Owner → Progetto → Ruolo</strong>.
      Le <strong>settimane passate</strong> mostrano ore <em>effettive</em> da timesheet.
      Le <strong>settimane future</strong> mostrano la quota proporzionale dell'owner sulle ore residue (sold − consumato).
      Se nessun owner risulta dagli actuals, le ore vengono assegnate a un placeholder <em>TBD</em>.
    </div>
    <table class="gantt-table" id="ppResourceTable" style="border-collapse:collapse;width:100%">
      <thead>
        <tr>
          <th rowspan="${rowspan}" style="${SH}left:0;min-width:200px;background:#d8dff7;font-size:.82rem;padding:8px 10px;border:1px solid #dee2e6;white-space:nowrap">Owner / Progetto / Ruolo</th>
          <th rowspan="${rowspan}" style="${SH}left:200px;min-width:65px;background:#ede8d5;font-size:.82rem;padding:8px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd;text-align:center;white-space:nowrap">Sold</th>
          <th rowspan="${rowspan}" style="${SH}left:265px;min-width:80px;background:#ede8d5;font-size:.82rem;padding:8px 6px;border:1px solid #dee2e6;border-right:2px solid #adb5bd;text-align:center;white-space:nowrap">From<br>actuals</th>
          <th rowspan="${rowspan}" style="${SH}left:345px;min-width:90px;background:#ede8d5;font-size:.82rem;padding:8px 6px;border:1px solid #dee2e6;border-right:3px solid #6c757d;text-align:center;white-space:nowrap">To be<br>planned</th>
          ${periodHeaderHtml}
        </tr>
        ${isMonthly ? '' : `<tr>${subHeaderHtml}</tr>`}
      </thead>
      <tbody>${tbodyHtml}</tbody>
    </table>`;

  const exportBtn = document.getElementById('btnExportResourcePlan');
  if (exportBtn) {
    exportBtn._ppExport = () => buildStyledExcelExport({ exportRows, periodMeta, nameCount: 3, sheetName: 'Planning By Owner', filename: 'planning_by_owner.xlsx' });
  }
}

// ── AI PLANNING SIDEBAR ───────────────────────────────────────────────────────
let aiPlanMessages = []; // { role: 'user'|'assistant', content: string }

function buildPlanningContext() {
  const todayStr = new Date().toISOString().split('T')[0];
  let ctx = `You are an AI planning assistant for a professional services company. Today is ${todayStr}.\nAnswer questions about planning, capacity, workload, and resource allocation using the data below. Be concise and data-driven.\n\n`;

  ctx += '## PROJECTS\n';
  (config.projects || []).forEach(proj => {
    const projData  = timesheetData.filter(r => r.projectId === proj.id);
    const consumed  = projData.reduce((s, r) => s + r.hours, 0);
    const tasks     = proj.tasks || [];
    const sold      = tasks.reduce((s, t) => s + (t.resources || []).reduce((ss, r) => ss + (r.soldHours || 0), 0), 0);
    const tbp       = Math.max(0, sold - consumed);
    ctx += `- **${proj.name || proj.id}** | pipeline: ${proj.pipeline || 'n/a'} | dates: ${proj.startDate || '?'} → ${proj.endDate || '?'} | sold: ${sold.toFixed(0)}h | consumed: ${consumed.toFixed(0)}h | to-be-planned: ${tbp.toFixed(0)}h\n`;
    tasks.forEach(t => {
      const tSold  = (t.resources || []).reduce((s, r) => s + (r.soldHours || 0), 0);
      const tRecs  = projData.filter(r => r.task === t.name);
      const tConsumed = tRecs.reduce((s, r) => s + r.hours, 0);
      ctx += `  Task: ${t.name || '?'} | dates: ${t.startDate || '?'} → ${t.endDate || '?'} | sold: ${tSold.toFixed(0)}h | consumed: ${tConsumed.toFixed(0)}h\n`;
      (t.resources || []).forEach(res => {
        const rRecs    = tRecs.filter(r => r.role === res.role);
        const rConsumed = rRecs.reduce((s, r) => s + r.hours, 0);
        const rTbp     = Math.max(0, (res.soldHours || 0) - rConsumed);
        const ownersMap = {};
        rRecs.forEach(r => { const o = r.owner?.trim() || '—'; ownersMap[o] = (ownersMap[o] || 0) + r.hours; });
        const ownersStr = Object.entries(ownersMap).map(([o, h]) => `${o}:${h.toFixed(0)}h`).join(', ');
        ctx += `    Role: ${res.role} | sold: ${(res.soldHours || 0).toFixed(0)}h | consumed: ${rConsumed.toFixed(0)}h | tbp: ${rTbp.toFixed(0)}h | owners: ${ownersStr || 'none'}\n`;
      });
    });
  });

  ctx += '\n## OWNER TOTALS (from actuals)\n';
  const ownerSummary = {};
  timesheetData.forEach(r => {
    const o = r.owner?.trim() || '—';
    if (!ownerSummary[o]) ownerSummary[o] = { h: 0, roles: new Set(), projects: new Set() };
    ownerSummary[o].h += r.hours;
    ownerSummary[o].roles.add(r.role);
    ownerSummary[o].projects.add(r.projectId);
  });
  Object.entries(ownerSummary).sort((a, b) => b[1].h - a[1].h).forEach(([o, d]) => {
    ctx += `- **${o}**: ${d.h.toFixed(0)}h | roles: ${[...d.roles].join(', ')} | projects: ${[...d.projects].join(', ')}\n`;
  });

  ctx += '\n## FUTURE ALLOCATION ESTIMATE (next 6 months by owner)\n';
  const futureByOwnerMonth = {};
  const now = new Date(); now.setHours(0,0,0,0);
  (config.projects || []).forEach(proj => {
    const projData = timesheetData.filter(r => r.projectId === proj.id);
    (proj.tasks || []).forEach(task => {
      const tEnd = task.endDate ? parseTaskDate(task.endDate, true) : null;
      (task.resources || []).forEach(res => {
        const soldH = res.soldHours || 0;
        const rRecs = projData.filter(r => r.role === res.role && (!task.name || r.task === task.name));
        const ownersMap = {};
        let totalH = 0;
        rRecs.forEach(r => { const o = r.owner?.trim() || '—'; ownersMap[o] = (ownersMap[o] || 0) + r.hours; totalH += r.hours; });
        const tbp = Math.max(0, soldH - totalH);
        if (tbp < 0.01) return;
        const effectiveEnd = tEnd || new Date(now.getFullYear(), now.getMonth() + 6, 0);
        const months = [];
        let m = new Date(now.getFullYear(), now.getMonth(), 1);
        while (m <= effectiveEnd && months.length < 12) {
          months.push(`${m.getFullYear()}-${String(m.getMonth()+1).padStart(2,'0')}`);
          m = new Date(m.getFullYear(), m.getMonth()+1, 1);
        }
        if (!months.length) return;
        const hpm = tbp / months.length;
        months.forEach(mKey => {
          if (totalH > 0.01) {
            Object.entries(ownersMap).forEach(([o, h]) => {
              if (!futureByOwnerMonth[o]) futureByOwnerMonth[o] = {};
              futureByOwnerMonth[o][mKey] = (futureByOwnerMonth[o][mKey] || 0) + hpm * (h / totalH);
            });
          } else {
            if (!futureByOwnerMonth['TBD']) futureByOwnerMonth['TBD'] = {};
            futureByOwnerMonth['TBD'][mKey] = (futureByOwnerMonth['TBD'][mKey] || 0) + hpm;
          }
        });
      });
    });
  });
  Object.entries(futureByOwnerMonth).sort((a, b) => a[0].localeCompare(b[0])).forEach(([o, months]) => {
    const str = Object.entries(months).sort((a, b) => a[0].localeCompare(b[0])).map(([m, h]) => `${m}:${h.toFixed(0)}h`).join(' ');
    ctx += `- **${o}**: ${str}\n`;
  });

  return ctx;
}

async function aiPlanSend() {
  const provider = config.aiProvider || 'anthropic';
  const models   = AI_MODELS[provider] || [];
  const model    = config.aiModel || (models[0]?.id ?? '');
  const keys     = { anthropic: config.anthropicApiKey, openai: config.openaiApiKey, gemini: config.geminiApiKey };
  const apiKey   = (keys[provider] || '').trim();

  if (!apiKey) {
    const names = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Google Gemini' };
    showConfirm(`Nessuna API key configurata per ${names[provider] || provider}.\n\nApri ⚙️ Configura Budget → sezione AI Assistant.`, null, null, 'ℹ️ API Key richiesta');
    return;
  }
  const input = document.getElementById('aiPlanInput');
  const msg   = input.value.trim();
  if (!msg) return;
  input.value = '';
  aiPlanMessages.push({ role: 'user', content: msg });
  renderAiPlanMessages();
  const sendBtn = document.getElementById('btnAiPlanSend');
  sendBtn.disabled = true; sendBtn.textContent = '…';

  try {
    let reply;
    const ctx = buildPlanningContext();

    if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model, max_tokens: 1024, system: ctx, messages: aiPlanMessages }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
      const json = await res.json();
      reply = json.content?.[0]?.text || 'Nessuna risposta ricevuta.';

    } else if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          messages: [{ role: 'system', content: ctx }, ...aiPlanMessages],
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
      const json = await res.json();
      reply = json.choices?.[0]?.message?.content || 'Nessuna risposta ricevuta.';

    } else if (provider === 'gemini') {
      const geminiMsgs = aiPlanMessages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: geminiMsgs,
          systemInstruction: { parts: [{ text: ctx }] },
          generationConfig: { maxOutputTokens: 1024 },
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
      const json = await res.json();
      reply = json.candidates?.[0]?.content?.parts?.[0]?.text || 'Nessuna risposta ricevuta.';
    } else {
      throw new Error(`Provider non supportato: ${provider}`);
    }

    aiPlanMessages.push({ role: 'assistant', content: reply });
  } catch (e) {
    aiPlanMessages.push({ role: 'assistant', content: `⚠️ Errore: ${e.message}` });
  } finally {
    sendBtn.disabled = false; sendBtn.textContent = 'Invia';
    renderAiPlanMessages();
  }
}

function renderAiPlanMessages() {
  const el = document.getElementById('aiPlanMessages');
  if (!el) return;
  const intro = `<div style="background:#f0f4ff;border-radius:8px;padding:10px 12px;font-size:.82rem;color:#444;border-left:3px solid #6c757d">
    Ciao! Sono il tuo assistente di planning. Puoi chiedermi, ad esempio:<br>
    • <em>Chi è libero nei prossimi 2 mesi?</em><br>
    • <em>Quante ore ha allocato [nome] a [mese]?</em><br>
    • <em>Quale progetto ha più ore residue?</em>
  </div>`;
  const msgs = aiPlanMessages.map(m => {
    if (m.role === 'user') {
      return `<div style="align-self:flex-end;max-width:85%;background:#0d6efd;color:white;border-radius:12px 12px 2px 12px;padding:8px 12px;font-size:.83rem">${esc(m.content)}</div>`;
    }
    const html = m.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    return `<div style="align-self:flex-start;max-width:90%;background:#f1f3f5;border-radius:2px 12px 12px 12px;padding:8px 12px;font-size:.83rem;color:#212529">${html}</div>`;
  }).join('');
  el.innerHTML = intro + msgs;
  el.scrollTop = el.scrollHeight;
}

// ── EMAIL REPORT ──────────────────────────────────────────────────────────────
function buildEmailHTML(data, cfg) {
  const projectName = cfg?.name || selectedProjectId;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const bData     = billableData(data, cfg);
  const consumedH = bData.reduce((s, r) => s + r.hours, 0);
  let soldH = null, budgetE = null, consumedE = null, pctH = null, pctE = null;
  if (cfg) {
    const bTasks = billableTasks(cfg);
    soldH     = bTasks.reduce((s, t) => s + t.resources.reduce((ss, r) => ss + r.soldHours, 0), 0);
    budgetE   = bTasks.reduce((s, t) => s + t.resources.reduce((ss, r) => ss + r.soldHours * r.hourlyRate, 0), 0);
    consumedE = bData.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0);
    pctH = soldH > 0 ? (consumedH / soldH * 100).toFixed(1) : null;
    pctE = budgetE > 0 ? (consumedE / budgetE * 100).toFixed(1) : null;
  }

  const kpiBox = (label, value, sub, color) =>
    `<td style="width:25%;padding:10px;border-radius:8px;background:#f8f9fa;border-left:4px solid ${color};vertical-align:top">
      <div style="font-size:.75rem;color:#6c757d;margin-bottom:4px">${label}</div>
      <div style="font-size:1.15rem;font-weight:700;color:#212529">${value}</div>
      ${sub ? `<div style="font-size:.72rem;color:#6c757d">${sub}</div>` : ''}
    </td>`;

  const kpiRow = `<table width="100%" cellspacing="12" cellpadding="0" style="margin-bottom:24px">
    <tr>
      ${kpiBox('📦 Total Sold Hours',  soldH != null ? fmtH(soldH) : '—', 'from configuration', '#0d6efd')}
      ${kpiBox('💰 Total Budget',      budgetE != null ? fmtMoney(budgetE) : '—', 'hours × hourly rate', '#198754')}
      ${kpiBox('⏱️ Hours Consumed',    fmtH(consumedH), pctH ? `${pctH}% of sold hours` : 'total to date', '#fd7e14')}
      ${kpiBox('💸 Budget Consumed',   consumedE != null ? fmtMoney(consumedE) : '—', pctE ? `${pctE}% of budget` : '', '#6f42c1')}
    </tr>
  </table>`;

  // ── Monthly Summary (replicates renderMonthlyTable structure) ─────────────────
  let monthlyTable = '';
  if (data.length) {
    let startY, startM, endY, endM;
    if (cfg?.startDate && cfg?.endDate) {
      startY = parseInt(cfg.startDate.slice(0, 4));
      startM = parseInt(cfg.startDate.slice(4, 6));
      endY   = parseInt(cfg.endDate.slice(0, 4));
      endM   = parseInt(cfg.endDate.slice(4, 6));
    } else {
      const dates = data.filter(r => r.date).map(r => r.date);
      if (dates.length) {
        const minD = dates.reduce((a, b) => a < b ? a : b);
        const maxD = dates.reduce((a, b) => a > b ? a : b);
        startY = minD.getFullYear(); startM = minD.getMonth() + 1;
        endY   = maxD.getFullYear(); endM   = maxD.getMonth() + 1;
      }
    }
    if (startY) {
      const pad2 = n => String(n).padStart(2, '0');
      const ptcItems   = cfg?.ptc || [];
      const ptcByMonth = {};
      ptcItems.forEach(p => { if (p.month) ptcByMonth[p.month] = (ptcByMonth[p.month] || 0) + (p.amount || 0); });
      const hasPtc = ptcItems.length > 0;
      const emailBData = billableData(data, cfg);

      const months = [];
      let cy = startY, cm = startM;
      while (cy < endY || (cy === endY && cm <= endM)) {
        const ym     = `${cy}${pad2(cm)}`;
        const mStart = new Date(cy, cm - 1, 1);
        const mEnd   = new Date(cy, cm, 0, 23, 59, 59);
        const rows   = emailBData.filter(r => r.date && r.date >= mStart && r.date <= mEnd);
        const hours  = rows.reduce((s, r) => s + r.hours, 0);
        const spent  = cfg ? rows.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0) : null;
        const estimatedHours = cfg?.planning?.[ym] ?? 0;
        const estimated      = cfg?.phasing?.[ym]  ?? 0;
        const ptc            = ptcByMonth[ym] || 0;
        const label = mStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        months.push({ label, hours, estimatedHours, spent, estimated, ptc });
        cm++; if (cm > 12) { cm = 1; cy++; }
      }
      const totHours          = months.reduce((s, m) => s + m.hours, 0);
      const totEstimatedHours = cfg ? months.reduce((s, m) => s + m.estimatedHours, 0) : null;
      const totHoursVariance  = totEstimatedHours !== null ? totEstimatedHours - totHours : null;
      const totSpent          = cfg ? months.reduce((s, m) => s + (m.spent ?? 0), 0) : null;
      const totEstimated      = cfg ? months.reduce((s, m) => s + m.estimated, 0) : null;
      const totBudgetVariance = (totEstimated !== null && totSpent !== null) ? totEstimated - totSpent : null;
      const totPtc            = hasPtc ? months.reduce((s, m) => s + m.ptc, 0) : null;

      const mDataRows = months.map((m, i) => {
        const hVar = cfg ? m.estimatedHours - m.hours : null;
        const bVar = m.spent !== null ? m.estimated - m.spent : null;
        const bg   = i % 2 === 0 ? '#ffffff' : '#f8f9fa';
        return `<tr style="background:${bg}">
          <td style="padding:7px 10px">${m.label}</td>
          <td style="padding:7px 10px;text-align:right;border-left:1px solid #dee2e6">${cfg ? fmtH(m.estimatedHours) : '—'}</td>
          <td style="padding:7px 10px;text-align:right">${fmtH(m.hours)}</td>
          <td style="padding:7px 10px;text-align:right${hVar !== null && hVar < 0 ? ';color:#dc3545;font-weight:700' : ''}">${hVar !== null ? fmtH(hVar) : '—'}</td>
          <td style="padding:7px 10px;text-align:right;border-left:1px solid #dee2e6">${cfg ? fmtMoney(m.estimated) : '—'}</td>
          <td style="padding:7px 10px;text-align:right">${m.spent !== null ? fmtMoney(m.spent) : '—'}</td>
          <td style="padding:7px 10px;text-align:right${bVar !== null && bVar < 0 ? ';color:#dc3545;font-weight:700' : ''}">${bVar !== null ? fmtMoney(bVar) : '—'}</td>
          ${hasPtc ? `<td style="padding:7px 10px;text-align:right;border-left:1px solid #dee2e6">${m.ptc > 0 ? fmtMoney(m.ptc) : '—'}</td>` : ''}
        </tr>`;
      }).join('');

      monthlyTable = `
        <h3 style="font-size:.9rem;font-weight:700;text-transform:uppercase;color:#6c757d;letter-spacing:.05em;margin:0 0 8px">Monthly Consumption</h3>
        <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:24px;font-size:.85rem">
          <thead>
            <tr style="background:#f8f9fa">
              <th rowspan="2" style="padding:7px 10px;text-align:left;font-weight:600;vertical-align:middle;border-bottom:2px solid #dee2e6">Month</th>
              <th colspan="3" style="padding:7px 10px;text-align:center;font-weight:600;border-left:1px solid #dee2e6;border-bottom:2px solid #dee2e6">Hours</th>
              <th colspan="3" style="padding:7px 10px;text-align:center;font-weight:600;border-left:1px solid #dee2e6;border-bottom:2px solid #dee2e6">Budget</th>
              ${hasPtc ? '<th rowspan="2" style="padding:7px 10px;text-align:right;font-weight:600;vertical-align:middle;border-left:1px solid #dee2e6;border-bottom:2px solid #dee2e6">PTC</th>' : ''}
            </tr>
            <tr style="background:#f8f9fa">
              <th style="padding:7px 10px;text-align:right;font-weight:600;border-left:1px solid #dee2e6">Estimated</th>
              <th style="padding:7px 10px;text-align:right;font-weight:600">Consumed</th>
              <th style="padding:7px 10px;text-align:right;font-weight:600">Variance</th>
              <th style="padding:7px 10px;text-align:right;font-weight:600;border-left:1px solid #dee2e6">Estimated</th>
              <th style="padding:7px 10px;text-align:right;font-weight:600">Spent</th>
              <th style="padding:7px 10px;text-align:right;font-weight:600">Variance</th>
            </tr>
          </thead>
          <tbody>
            ${mDataRows}
            <tr style="background:#e9ecef;font-weight:700">
              <td style="padding:7px 10px">TOTAL</td>
              <td style="padding:7px 10px;text-align:right;border-left:1px solid #dee2e6">${totEstimatedHours !== null ? fmtH(totEstimatedHours) : '—'}</td>
              <td style="padding:7px 10px;text-align:right">${fmtH(totHours)}</td>
              <td style="padding:7px 10px;text-align:right${totHoursVariance !== null && totHoursVariance < 0 ? ';color:#dc3545' : ''}">${totHoursVariance !== null ? fmtH(totHoursVariance) : '—'}</td>
              <td style="padding:7px 10px;text-align:right;border-left:1px solid #dee2e6">${totEstimated !== null ? fmtMoney(totEstimated) : '—'}</td>
              <td style="padding:7px 10px;text-align:right">${totSpent !== null ? fmtMoney(totSpent) : '—'}</td>
              <td style="padding:7px 10px;text-align:right${totBudgetVariance !== null && totBudgetVariance < 0 ? ';color:#dc3545' : ''}">${totBudgetVariance !== null ? fmtMoney(totBudgetVariance) : '—'}</td>
              ${hasPtc ? `<td style="padding:7px 10px;text-align:right;border-left:1px solid #dee2e6">${totPtc !== null ? fmtMoney(totPtc) : '—'}</td>` : ''}
            </tr>
          </tbody>
        </table>`;
    }
  }

  // ── Email summary table builder (replicates summaryTable / summaryRows) ────────
  function emailSummaryTable(title, headers, cols) {
    const totSold        = cols.reduce((s, c) => s + c.soldHours, 0);
    const totSoldEur     = cols.reduce((s, c) => s + c.soldEur, 0);
    const totConsumed    = cols.reduce((s, c) => s + c.totalConsumed, 0);
    const totConsumedEur = cols.reduce((s, c) => s + c.totalConsumedEur, 0);
    const totResidual    = totSold - totConsumed;
    const totResidualEur = totSoldEur - totConsumedEur;

    const heE = (h, e) => `${fmtH(h)}<br><span style="font-size:.75em;color:#6c757d">${fmtMoney(e)}</span>`;
    const cStyle = (danger=false, bold=false) =>
      `padding:7px 10px;text-align:right${danger ? ';color:#dc3545;font-weight:700' : bold ? ';font-weight:700' : ''}`;

    return `
      <h3 style="font-size:.9rem;font-weight:700;text-transform:uppercase;color:#6c757d;letter-spacing:.05em;margin:0 0 8px">${title}</h3>
      <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:24px;font-size:.85rem">
        <thead>
          <tr style="background:#f8f9fa">
            <th style="padding:7px 10px;text-align:left;font-weight:600"></th>
            ${headers.map(h => `<th style="padding:7px 10px;text-align:right;font-weight:600">${esc(h)}</th>`).join('')}
            <th style="padding:7px 10px;text-align:right;font-weight:700">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:7px 10px;font-weight:600">Total Amount</td>
            ${cols.map(c => `<td style="${cStyle()}">${heE(c.soldHours, c.soldEur)}</td>`).join('')}
            <td style="${cStyle(false, true)}">${heE(totSold, totSoldEur)}</td>
          </tr>
          <tr style="background:#f8f9fa">
            <td style="padding:7px 10px;font-weight:600">Spent</td>
            ${cols.map(c => `<td style="${cStyle()}">${heE(c.totalConsumed, c.totalConsumedEur)}</td>`).join('')}
            <td style="${cStyle(false, true)}">${heE(totConsumed, totConsumedEur)}</td>
          </tr>
          <tr>
            <td style="padding:7px 10px;font-weight:600">In period</td>
            ${cols.map(() => `<td style="padding:7px 10px;text-align:right;color:#6c757d">—</td>`).join('')}
            <td style="padding:7px 10px;text-align:right;font-weight:700;color:#6c757d">—</td>
          </tr>
          <tr style="background:#e9ecef">
            <td style="padding:7px 10px;font-weight:700">Residual</td>
            ${cols.map(c => {
              const h = c.soldHours - c.totalConsumed;
              const e = c.soldEur   - c.totalConsumedEur;
              return `<td style="${cStyle(h < 0)}">${heE(h, e)}</td>`;
            }).join('')}
            <td style="${cStyle(totResidual < 0, true)}">${heE(totResidual, totResidualEur)}</td>
          </tr>
        </tbody>
      </table>`;
  }

  // ── Summary by task (billable only) ───────────────────────────────────────────
  let taskSummaryTable = '';
  if (cfg?.tasks?.length) {
    const eTasks = billableTasks(cfg);
    const cols = eTasks.map(task => {
      const key              = task.name.toLowerCase();
      const soldHours        = task.resources.reduce((s, r) => s + r.soldHours, 0);
      const soldEur          = task.resources.reduce((s, r) => s + r.soldHours * r.hourlyRate, 0);
      const taskRows         = bData.filter(r => r.task.toLowerCase() === key);
      const totalConsumed    = taskRows.reduce((s, r) => s + r.hours, 0);
      const totalConsumedEur = taskRows.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0);
      return { soldHours, soldEur, totalConsumed, totalConsumedEur };
    });
    taskSummaryTable = emailSummaryTable('Task Breakdown', eTasks.map(t => t.name), cols);
  }

  // ── Summary by role (billable only) ───────────────────────────────────────────
  let roleSummaryTable = '';
  if (cfg?.tasks?.length) {
    const roleMap = new Map();
    billableTasks(cfg).forEach(task =>
      task.resources.forEach(res => {
        const key = res.role.toLowerCase();
        if (!roleMap.has(key)) roleMap.set(key, { role: res.role, soldHours: 0, soldEur: 0 });
        roleMap.get(key).soldHours += res.soldHours;
        roleMap.get(key).soldEur   += res.soldHours * res.hourlyRate;
      })
    );
    const cols = [...roleMap.values()].map(({ role, soldHours, soldEur }) => {
      const key              = role.toLowerCase();
      const roleRows         = bData.filter(r => r.role.toLowerCase() === key);
      const totalConsumed    = roleRows.reduce((s, r) => s + r.hours, 0);
      const totalConsumedEur = roleRows.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0);
      return { soldHours, soldEur, totalConsumed, totalConsumedEur };
    });
    roleSummaryTable = emailSummaryTable('Summary by Role', [...roleMap.values()].map(r => r.role), cols);
  }

  // ── PTC table (email) ─────────────────────────────────────────────────────────
  let ptcEmailTable = '';
  const ptcItems = cfg?.ptc || [];
  if (ptcItems.length) {
    const sorted = [...ptcItems].sort((a, b) => (a.month || '').localeCompare(b.month || '') || (a.title || '').localeCompare(b.title || ''));
    const total  = ptcItems.reduce((s, p) => s + (p.amount || 0), 0);
    const ptcRows = sorted.map((p, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : '#f8f9fa';
      let monthLabel = '—';
      if (p.month && p.month.length === 6) {
        const [y, m] = [parseInt(p.month.slice(0, 4)), parseInt(p.month.slice(4, 6))];
        monthLabel = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }
      return `<tr style="background:${bg}">
        <td style="padding:7px 10px">${monthLabel}</td>
        <td style="padding:7px 10px;font-weight:600">${esc(p.title || '—')}</td>
        <td style="padding:7px 10px;color:#6c757d">${esc(p.note || '')}</td>
        <td style="padding:7px 10px;text-align:right;font-weight:600">${fmtMoney(p.amount || 0)}</td>
      </tr>`;
    }).join('');
    ptcEmailTable = `
      <h3 style="font-size:.9rem;font-weight:700;text-transform:uppercase;color:#6c757d;letter-spacing:.05em;margin:0 0 8px">Pass Through Costs</h3>
      <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:24px;font-size:.85rem">
        <thead>
          <tr style="background:#f8f9fa">
            <th style="padding:7px 10px;text-align:left;font-weight:600;width:160px">Month</th>
            <th style="padding:7px 10px;text-align:left;font-weight:600">Title</th>
            <th style="padding:7px 10px;text-align:left;font-weight:600">Note</th>
            <th style="padding:7px 10px;text-align:right;font-weight:600">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${ptcRows}
          <tr style="background:#e9ecef;font-weight:700">
            <td style="padding:7px 10px" colspan="3">TOTAL</td>
            <td style="padding:7px 10px;text-align:right">${fmtMoney(total)}</td>
          </tr>
        </tbody>
      </table>`;
  }

  return `<div style="font-family:'Segoe UI',Arial,sans-serif;color:#212529;max-width:800px">
    <div style="background:#1a1a2e;padding:20px 24px;border-radius:8px 8px 0 0;margin-bottom:20px">
      <h1 style="margin:0;font-size:1.2rem;color:#ffffff;font-weight:700">ⓕ Project Status Report</h1>
      <div style="margin-top:6px;font-size:.85rem;color:#adb5bd">${projectName} &nbsp;·&nbsp; ${today}</div>
    </div>
    ${kpiRow}
    ${monthlyTable}
    ${ptcEmailTable}
    ${taskSummaryTable}
    ${roleSummaryTable}
    <div style="margin-top:24px;padding-top:12px;border-top:1px solid #dee2e6;font-size:.75rem;color:#adb5bd">
      Generated by Timesheet Burndown Dashboard
    </div>
  </div>`;
}

function openEmailModal() {
  const data = timesheetData.filter(r => r.projectId === selectedProjectId);
  const cfg  = cfgForProject(selectedProjectId);
  const projectName = cfg?.name || selectedProjectId;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  document.getElementById('emailTo').value      = '';
  document.getElementById('emailSubject').value = `Project Status Report — ${projectName} — ${today}`;
  document.getElementById('emailMessage').value = '';
  document.getElementById('emailError').classList.add('d-none');
  document.getElementById('emailSpinner').classList.add('d-none');
  document.getElementById('btnSendEmail').disabled = false;
  document.getElementById('emailPreview').innerHTML = buildEmailHTML(data, cfg);

  bootstrap.Modal.getOrCreateInstance(document.getElementById('emailModal')).show();
}

async function sendEmail() {
  const key      = (config.emailjsKey      || '').trim();
  const service  = (config.emailjsService  || '').trim();
  const template = (config.emailjsTemplate || '').trim();

  if (!key || !service || !template) {
    document.getElementById('emailError').textContent =
      'EmailJS not configured. Open ⚙️ Configure Budget and fill in Public Key, Service ID and Template ID.';
    document.getElementById('emailError').classList.remove('d-none');
    return;
  }

  const to = document.getElementById('emailTo').value.trim();
  if (!to) {
    document.getElementById('emailError').textContent = 'Please enter a recipient email address.';
    document.getElementById('emailError').classList.remove('d-none');
    return;
  }

  const data = timesheetData.filter(r => r.projectId === selectedProjectId);
  const cfg  = cfgForProject(selectedProjectId);

  document.getElementById('emailError').classList.add('d-none');
  document.getElementById('emailSpinner').classList.remove('d-none');
  document.getElementById('btnSendEmail').disabled = true;

  try {
    await emailjs.send(service, template, {
      to_email:       to,
      subject:        document.getElementById('emailSubject').value.trim(),
      message:        document.getElementById('emailMessage').value.trim(),
      project_name:   cfg?.name || selectedProjectId,
      report_date:    new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      report_content: buildEmailHTML(data, cfg),
    }, key);

    bootstrap.Modal.getInstance(document.getElementById('emailModal')).hide();
  } catch (err) {
    document.getElementById('emailSpinner').classList.add('d-none');
    document.getElementById('btnSendEmail').disabled = false;
    document.getElementById('emailError').textContent = 'Send failed: ' + (err?.text || err?.message || JSON.stringify(err));
    document.getElementById('emailError').classList.remove('d-none');
  }
}

// ── AI ANALYSIS ───────────────────────────────────────────────────────────────
function buildProjectSummary(data, cfg) {
  const lines = [];
  const currency = cfg?.currency || '€';

  lines.push(`Project: ${cfg?.name || selectedProjectId}`);
  lines.push(`Project ID: ${selectedProjectId}`);
  lines.push(`Currency: ${currency}`);

  if (cfg?.startDate && cfg?.endDate) {
    const sy = parseInt(cfg.startDate.slice(0, 4)), sm = parseInt(cfg.startDate.slice(4, 6));
    const ey = parseInt(cfg.endDate.slice(0, 4)),   em = parseInt(cfg.endDate.slice(4, 6));
    const startLabel = new Date(sy, sm - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const endLabel   = new Date(ey, em - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    lines.push(`Timeline: ${startLabel} – ${endLabel}`);
    const today = new Date();
    const totalMonths   = (ey - sy) * 12 + (em - sm) + 1;
    const elapsedMonths = Math.max(0, (today.getFullYear() - sy) * 12 + (today.getMonth() - (sm - 1)));
    const remainingMonths = Math.max(0, totalMonths - elapsedMonths);
    lines.push(`Duration: ${totalMonths} months total, ~${elapsedMonths} elapsed, ~${remainingMonths} remaining`);
  }

  lines.push(`Report date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`);
  lines.push('');

  const consumedH = data.reduce((s, r) => s + r.hours, 0);
  lines.push('--- KEY METRICS ---');

  if (cfg) {
    const soldH     = cfg.tasks.reduce((s, t) => s + t.resources.reduce((ss, r) => ss + r.soldHours, 0), 0);
    const budgetE   = cfg.tasks.reduce((s, t) => s + t.resources.reduce((ss, r) => ss + r.soldHours * r.hourlyRate, 0), 0);
    const consumedE = data.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0);
    const pctH = soldH > 0 ? (consumedH / soldH * 100).toFixed(1) : 'N/A';
    const pctE = budgetE > 0 ? (consumedE / budgetE * 100).toFixed(1) : 'N/A';

    lines.push(`Sold Hours: ${soldH.toFixed(2)}h`);
    lines.push(`Hours Consumed: ${consumedH.toFixed(2)}h (${pctH}% of sold hours)`);
    lines.push(`Hours Remaining: ${Math.max(0, soldH - consumedH).toFixed(2)}h`);
    lines.push(`Total Budget: ${fmtMoney(budgetE)}`);
    lines.push(`Budget Consumed: ${fmtMoney(consumedE)} (${pctE}% of total budget)`);
    lines.push(`Budget Remaining: ${fmtMoney(Math.max(0, budgetE - consumedE))}`);

    const dates = data.map(r => r.date).filter(Boolean);
    if (dates.length > 1) {
      const minD = dates.reduce((a, b) => a < b ? a : b);
      const maxD = dates.reduce((a, b) => a > b ? a : b);
      const monthsActive = Math.max(1, (maxD - minD) / (1000 * 60 * 60 * 24 * 30));
      const burnRateH = consumedH / monthsActive;
      lines.push(`Average burn rate: ${burnRateH.toFixed(1)}h/month`);
      if (soldH > consumedH && burnRateH > 0) {
        const mLeft = (soldH - consumedH) / burnRateH;
        lines.push(`At current rate, hours exhausted in ~${mLeft.toFixed(1)} months`);
      }
    }

    lines.push('');
    lines.push('--- TASK BREAKDOWN ---');
    cfg.tasks.forEach(task => {
      const td  = data.filter(r => r.task.toLowerCase() === task.name.toLowerCase());
      const tch = td.reduce((s, r) => s + r.hours, 0);
      const tsh = task.resources.reduce((s, r) => s + r.soldHours, 0);
      const tbe = task.resources.reduce((s, r) => s + r.soldHours * r.hourlyRate, 0);
      const tce = td.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0);
      const ph  = tsh > 0 ? (tch / tsh * 100).toFixed(1) + '%' : 'N/A';
      const pe  = tbe > 0 ? (tce / tbe * 100).toFixed(1) + '%' : 'N/A';
      lines.push(`  ${task.name}:`);
      lines.push(`    Hours:  ${tch.toFixed(2)}h / ${tsh.toFixed(2)}h sold (${ph})`);
      lines.push(`    Budget: ${fmtMoney(tce)} / ${fmtMoney(tbe)} (${pe})`);
    });

    lines.push('');
    lines.push('--- ROLE BREAKDOWN ---');
    const roleMap = {};
    data.forEach(r => { roleMap[r.role] = (roleMap[r.role] || 0) + r.hours; });
    Object.entries(roleMap).sort((a, b) => b[1] - a[1])
      .forEach(([role, h]) => lines.push(`  ${role}: ${h.toFixed(2)}h`));

    const monthMap = {};
    data.forEach(r => {
      if (!r.date) return;
      const ym = `${r.date.getFullYear()}${String(r.date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap[ym]) monthMap[ym] = { h: 0, e: 0 };
      monthMap[ym].h += r.hours;
      monthMap[ym].e += r.hours * (findRate(r, cfg) ?? 0);
    });

    lines.push('');
    lines.push('--- MONTHLY CONSUMPTION ---');
    Object.keys(monthMap).sort().forEach(ym => {
      const [y, m] = [parseInt(ym.slice(0, 4)), parseInt(ym.slice(4, 6))];
      const lbl = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      lines.push(`  ${lbl}: ${monthMap[ym].h.toFixed(2)}h — ${fmtMoney(monthMap[ym].e)}`);
    });

    if (cfg.phasing && Object.keys(cfg.phasing).length > 0) {
      lines.push('');
      lines.push('--- BUDGET PHASING vs ACTUAL ---');
      [...new Set([...Object.keys(cfg.phasing), ...Object.keys(monthMap)])].sort().forEach(ym => {
        const [y, m] = [parseInt(ym.slice(0, 4)), parseInt(ym.slice(4, 6))];
        const lbl      = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const planned  = cfg.phasing[ym] || 0;
        const actual   = monthMap[ym]?.e || 0;
        const variance = actual - planned;
        lines.push(`  ${lbl}: Planned ${fmtMoney(planned)}, Actual ${fmtMoney(actual)}, Variance ${variance >= 0 ? '+' : ''}${fmtMoney(variance)}`);
      });
    }

    if (cfg.planning && Object.keys(cfg.planning).length > 0) {
      lines.push('');
      lines.push('--- HOURS PLANNING vs ACTUAL ---');
      [...new Set([...Object.keys(cfg.planning), ...Object.keys(monthMap)])].sort().forEach(ym => {
        const [y, m] = [parseInt(ym.slice(0, 4)), parseInt(ym.slice(4, 6))];
        const lbl      = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const planned  = cfg.planning[ym] || 0;
        const actual   = monthMap[ym]?.h || 0;
        const variance = actual - planned;
        lines.push(`  ${lbl}: Planned ${planned.toFixed(2)}h, Actual ${actual.toFixed(2)}h, Variance ${variance >= 0 ? '+' : ''}${variance.toFixed(2)}h`);
      });
    }

  } else {
    lines.push(`Hours Consumed: ${consumedH.toFixed(2)}h`);
    lines.push('(No budget configuration available)');
    const roleMap = {};
    data.forEach(r => { roleMap[r.role] = (roleMap[r.role] || 0) + r.hours; });
    lines.push('');
    lines.push('--- ROLE BREAKDOWN ---');
    Object.entries(roleMap).sort((a, b) => b[1] - a[1])
      .forEach(([role, h]) => lines.push(`  ${role}: ${h.toFixed(2)}h`));
  }

  return lines.join('\n');
}

async function callAi(prompt) {
  const provider = config.aiProvider || 'anthropic';
  const models   = AI_MODELS[provider] || [];
  const model    = config.aiModel || (models[0]?.id ?? '');
  const keys     = { anthropic: config.anthropicApiKey, openai: config.openaiApiKey, gemini: config.geminiApiKey };
  const apiKey   = (keys[provider] || '').trim();

  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model, max_tokens: 2048, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
    const json = await res.json();
    return json.content?.[0]?.text || 'No response received.';

  } else if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, max_tokens: 2048, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
    const json = await res.json();
    return json.choices?.[0]?.message?.content || 'No response received.';

  } else if (provider === 'gemini') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 2048 },
      }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
    const json = await res.json();
    return json.candidates?.[0]?.content?.parts?.[0]?.text || 'No response received.';
  }
  throw new Error(`Provider non supportato: ${provider}`);
}

async function openAiAnalysis() {
  if (!hasAiKey()) {
    showConfirm(
      'Nessuna API key AI configurata.\n\nApri ⚙️ Configura Budget → sezione AI Assistant.',
      null, null, 'ℹ️ API Key richiesta'
    );
    return;
  }

  const data = timesheetData.filter(r => r.projectId === selectedProjectId);
  const cfg  = cfgForProject(selectedProjectId);

  document.getElementById('aiSpinner').style.display = 'block';
  document.getElementById('aiResult').style.display  = 'none';
  document.getElementById('aiResult').textContent    = '';
  document.getElementById('aiError').classList.add('d-none');

  bootstrap.Modal.getOrCreateInstance(document.getElementById('aiModal')).show();

  const summary = buildProjectSummary(data, cfg);

  const prompt =
`You are a senior project manager reviewing a professional services project status report.
Analyze the following project data and provide a structured critical assessment.

Your analysis must cover:
1. **Overall project health** — assign a RAG status (Red / Amber / Green) with a short justification
2. **Hours consumption trend** — burn rate analysis, pace vs. sold hours, risk of overrun
3. **Budget consumption** — financial risk, spend efficiency, comparison to phasing (if available)
4. **Planning vs. actuals** — is the project ahead or behind the planned schedule?
5. **Task-level performance** — which tasks are overrunning or underperforming?
6. **Key risks and recommendations** — concrete, actionable suggestions for the project manager

Be concise, objective, and constructive. Use bullet points. Clearly flag critical issues.

=== PROJECT DATA ===
${summary}
=== END OF DATA ===`;

  try {
    const result = await callAi(prompt);
    document.getElementById('aiSpinner').style.display = 'none';
    document.getElementById('aiResult').style.display  = 'block';
    document.getElementById('aiResult').textContent    = result;
  } catch (err) {
    document.getElementById('aiSpinner').style.display = 'none';
    document.getElementById('aiError').textContent     = 'Error: ' + err.message;
    document.getElementById('aiError').classList.remove('d-none');
  }
}

// ── PLANNING AI ANALYSIS ──────────────────────────────────────────────────────
function buildResourceAllocationSummary(projectId) {
  const cfg  = cfgForProject(projectId);
  const data = timesheetData.filter(r => r.projectId === projectId);
  if (!cfg) return '';

  const lines = [];
  lines.push(`PROJECT: ${cfg.name || projectId}`);
  lines.push(`PERIOD:  ${ym2month(cfg.startDate)} → ${ym2month(cfg.endDate)}`);

  // ── Per-task detail ──
  lines.push('\n--- TASKS ---');
  (cfg.tasks || []).forEach(task => {
    const tStart = parseTaskDate(task.startDate || cfg.startDate, false);
    const tEnd   = parseTaskDate(task.endDate   || cfg.endDate,   true);
    const weeks  = Math.max(1, Math.ceil((tEnd - tStart) / (7 * 86400000)));
    const label  = d => d.toISOString().slice(0, 10);
    const status = task.completed ? 'COMPLETED' : task.billable === false ? 'EXCLUDED' : 'In progress';

    lines.push(`\nTask: ${task.name}  [${status}]`);
    lines.push(`  Period: ${label(tStart)} → ${label(tEnd)}  (${weeks} weeks)`);
    lines.push('  Sold resources:');
    (task.resources || []).forEach(res => {
      const wkLoad  = (res.soldHours / weeks).toFixed(1);
      const consumed = data
        .filter(r => r.task.toLowerCase() === task.name.toLowerCase()
                  && r.role.toLowerCase() === res.role.toLowerCase())
        .reduce((s, r) => s + r.hours, 0);
      lines.push(`    ${res.role}: ${res.soldHours}h sold (≈${wkLoad}h/wk), ${consumed.toFixed(1)}h consumed`);
    });
  });

  // ── Cross-task aggregation per owner ──
  lines.push('\n--- OWNER CROSS-TASK ALLOCATION ---');

  // Build: owner → [{ task, role, soldHours, weeklyLoad, start, end, weeks }]
  const ownerMap = {};
  (cfg.tasks || []).forEach(task => {
    const tStart = parseTaskDate(task.startDate || cfg.startDate, false);
    const tEnd   = parseTaskDate(task.endDate   || cfg.endDate,   true);
    const weeks  = Math.max(1, Math.ceil((tEnd - tStart) / (7 * 86400000)));

    (task.resources || []).forEach(res => {
      const owners = [...new Set(
        data.filter(r => r.task.toLowerCase() === task.name.toLowerCase()
                      && r.role.toLowerCase() === res.role.toLowerCase())
            .map(r => r.owner).filter(Boolean)
      )];
      const keys = owners.length ? owners : [res.role]; // fallback to role if no XLS data
      keys.forEach(key => {
        if (!ownerMap[key]) ownerMap[key] = [];
        ownerMap[key].push({
          task: task.name, role: res.role,
          soldHours: res.soldHours,
          weeklyLoad: res.soldHours / weeks,
          start: tStart, end: tEnd, weeks,
        });
      });
    });
  });

  Object.entries(ownerMap).sort((a, b) => a[0].localeCompare(b[0])).forEach(([owner, asgns]) => {
    const totalH = asgns.reduce((s, a) => s + a.soldHours, 0);
    lines.push(`\nResource: ${owner}  (total on project: ${totalH}h)`);
    asgns.forEach(a => {
      const label = d => d.toISOString().slice(0, 10);
      lines.push(`  [${a.task}] ${a.role}: ${a.soldHours}h / ${a.weeks}wk ≈ ${a.weeklyLoad.toFixed(1)}h/wk  (${label(a.start)}→${label(a.end)})`);
    });

    // Detect overlapping task pairs and their combined weekly load
    for (let i = 0; i < asgns.length; i++) {
      for (let j = i + 1; j < asgns.length; j++) {
        const a = asgns[i], b = asgns[j];
        if (a.start > b.end || b.start > a.end) continue;
        const oStart = new Date(Math.max(a.start, b.start));
        const oEnd   = new Date(Math.min(a.end,   b.end));
        const oWks   = Math.max(1, Math.ceil((oEnd - oStart) / (7 * 86400000)));
        const combo  = (a.weeklyLoad + b.weeklyLoad).toFixed(1);
        lines.push(`  ⚠ OVERLAP [${a.task}] + [${b.task}]: ${oWks} weeks, combined ≈${combo}h/wk on this project`);
      }
    }
  });

  return lines.join('\n');
}

async function openPlanningAiAnalysis() {
  if (!hasAiKey()) {
    showConfirm(
      'Nessuna API key AI configurata.\n\nApri ⚙️ Configura Budget → sezione AI Assistant.',
      null, null, 'ℹ️ API Key richiesta'
    );
    return;
  }

  const summary = buildResourceAllocationSummary(planningProjectId);

  const modalTitle = document.querySelector('#aiModal .modal-title');
  if (modalTitle) modalTitle.textContent = '🤖 Resource Allocation Analysis';

  document.getElementById('aiSpinner').style.display = 'block';
  document.getElementById('aiResult').style.display  = 'none';
  document.getElementById('aiResult').textContent    = '';
  document.getElementById('aiError').classList.add('d-none');
  bootstrap.Modal.getOrCreateInstance(document.getElementById('aiModal')).show();

  const prompt =
`You are a resource allocation expert reviewing a professional services project.

Working assumptions:
- Each resource is contracted for 40h/week total across ALL projects and activities
- Realistic availability on a single project: 20–28h/week (50–70% of contract)
- A weekly load above 28h/week on this project alone is a critical overallocation risk
- A weekly load of 20–28h/week is acceptable but leaves little buffer
- Overlapping tasks on the same resource compound the risk

Your task: produce a CONCRETE, PRIORITISED list of allocation issues found in the data below.

For every issue:
1. Name the resource
2. Name the task(s) involved
3. State the exact period affected (dates)
4. Quantify the problem (e.g. "allocated 34h/wk vs. ~24h realistic maximum")
5. Give a specific, actionable recommendation

Sort issues by severity (Critical → High → Medium). If no issues are found for a category, say so explicitly.
After the issues list, add a brief summary of overall allocation health (1–3 sentences).

Do not give generic advice. Every statement must reference specific resources, tasks, and numbers from the data.

=== PROJECT ALLOCATION DATA ===
${summary}
=== END ===`;

  try {
    const result = await callAi(prompt);
    document.getElementById('aiSpinner').style.display = 'none';
    document.getElementById('aiResult').style.display  = 'block';
    document.getElementById('aiResult').textContent    = result;
  } catch (err) {
    document.getElementById('aiSpinner').style.display = 'none';
    document.getElementById('aiError').textContent     = 'Error: ' + err.message;
    document.getElementById('aiError').classList.remove('d-none');
  }
}

// ── WIRE UP EVENT LISTENERS ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  loadSummarySelection();
  updateAiButtonVisibility();
  refreshTimesheetData();

  if (timesheetData.length > 0) {
    document.getElementById('fileStatus').textContent = `✅ ${timesheetData.length} rows (cached)`;
    populateProjectSelector();
  }

  // Portfolio is always the home — render it on startup
  showPortfolioView();

  // Back to portfolio button
  document.getElementById('btnBackToPortfolio').addEventListener('click', showPortfolioView);
  document.getElementById('btnPlanningView').addEventListener('click', () => showPlanningView(selectedProjectId));

  // Full-width toggle for resource planning
  document.getElementById('btnPPFullWidth').addEventListener('click', () => {
    const isFullWidth = document.body.classList.toggle('pp-fullwidth');
    document.getElementById('btnPPFullWidth').textContent = isFullWidth ? '⊡ Compact' : '⛶ Full width';
  });

  // Portfolio Planning view toggle (By Role / By Project)
  document.querySelectorAll('#ppViewToggle [data-ppview]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ppViewToggle [data-ppview]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      portfolioPlanningView = btn.dataset.ppview;
      renderPortfolioPlanningView();
    });
  });

  // Portfolio Planning
  document.getElementById('btnPortfolioPlanning').addEventListener('click', showPortfolioPlanningView);
  document.getElementById('btnPortfolioPlanningBack').addEventListener('click', () => {
    if (planningReturnToBurndown) {
      const pid = [...portfolioProjectFilters][0] || planningProjectId;
      planningReturnToBurndown = false;
      portfolioProjectFilters.clear();
      showDashboardView(pid);
    } else {
      showPortfolioView();
    }
  });

  // Interval toggle (Mensile / Settimanale)
  document.querySelectorAll('#ppIntervalToggle [data-ppinterval]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ppIntervalToggle [data-ppinterval]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ppViewInterval = btn.dataset.ppinterval;
      renderPortfolioPlanningView();
    });
  });

  // Planning window navigation
  document.getElementById('btnPpExpandLeft').addEventListener('click', () => {
    const { axisStart } = getPpAxis();
    const ns = new Date(ppWindowStart.getFullYear(), ppWindowStart.getMonth() - 1, 1);
    ppWindowStart = ns < axisStart ? new Date(axisStart.getFullYear(), axisStart.getMonth(), 1) : ns;
    updatePpWindowWidget(); renderPortfolioPlanningView();
  });
  document.getElementById('btnPpShrinkLeft').addEventListener('click', () => {
    const ns = new Date(ppWindowStart.getFullYear(), ppWindowStart.getMonth() + 1, 1);
    if (ns <= ppWindowEnd) { ppWindowStart = ns; updatePpWindowWidget(); renderPortfolioPlanningView(); }
  });
  document.getElementById('btnPpExpandRight').addEventListener('click', () => {
    const { axisEnd } = getPpAxis();
    const ne = new Date(ppWindowEnd.getFullYear(), ppWindowEnd.getMonth() + 2, 0);
    ppWindowEnd = ne > axisEnd ? new Date(axisEnd.getFullYear(), axisEnd.getMonth() + 1, 0) : ne;
    updatePpWindowWidget(); renderPortfolioPlanningView();
  });
  document.getElementById('btnPpShrinkRight').addEventListener('click', () => {
    const ne = new Date(ppWindowEnd.getFullYear(), ppWindowEnd.getMonth(), 0);
    if (ne >= ppWindowStart) { ppWindowEnd = ne; updatePpWindowWidget(); renderPortfolioPlanningView(); }
  });
  document.getElementById('btnExportResourcePlan').addEventListener('click', () => {
    const exportBtn = document.getElementById('btnExportResourcePlan');
    if (exportBtn._ppExport) exportBtn._ppExport();
  });
  document.getElementById('chkMonthlyPulse').addEventListener('change', e => {
    portfolioMonthlyPulse = e.target.checked;
    renderPortfolioPlanningView();
  });
  document.getElementById('btnResetProjectFilter').addEventListener('click', () => {
    portfolioProjectFilters.clear();
    renderPortfolioPlanningView();
  });
  document.getElementById('chkRoundHours').addEventListener('change', e => {
    portfolioRoundHours = e.target.checked;
    renderPortfolioPlanningView();
  });
  document.getElementById('btnResetTeamFilter').addEventListener('click', () => {
    portfolioTeamFilters.clear();
    renderPortfolioPlanningView();
  });

  // AI Planning Sidebar
  document.getElementById('btnToggleAiSidebar').addEventListener('click', () => {
    document.getElementById('aiPlanSidebar').classList.toggle('open');
  });
  document.getElementById('btnCloseAiSidebar').addEventListener('click', () => {
    document.getElementById('aiPlanSidebar').classList.remove('open');
  });
  document.getElementById('btnAiPlanSend').addEventListener('click', aiPlanSend);
  document.getElementById('btnAiPlanClear').addEventListener('click', () => {
    aiPlanMessages = [];
    renderAiPlanMessages();
  });
  document.getElementById('aiPlanInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiPlanSend(); }
  });

  // Pipeline / Status rules
  document.getElementById('cfgPipeline').addEventListener('change', () => {
    cfgApplyPipelineRules(document.getElementById('cfgPipeline').value, document.getElementById('cfgStatus').value);
    cfgMarkDirty();
  });

  // Clear XLS data for current project in config form
  document.getElementById('cfgBtnClearData').addEventListener('click', () => {
    const pid = cfgProjectIdx >= 0 ? cfgEditConfig.projects[cfgProjectIdx]?.id : '';
    if (!pid) return;
    showConfirm(
      `Clear all cached XLS data for project "${pid}"?\n\nThe configuration will be kept.`,
      () => { clearProjectData(pid); populateProjectSelector(); showPortfolioView(); },
      null, '🗑 Clear XLS data'
    );
  });

  // File upload
  const fileInput = document.getElementById('fileInput');
  document.getElementById('btnOpenFile').addEventListener('click', () => fileInput.click());
  document.getElementById('dropzone').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => { const f = e.target.files[0]; if (f) readXLS(f); });

  // Drag & drop
  const dz = document.getElementById('dropzone');
  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('dragover');
    const f = e.dataTransfer.files[0]; if (f) readXLS(f);
  });

  // Email share
  document.getElementById('btnShareEmail').addEventListener('click', openEmailModal);
  document.getElementById('btnSendEmail').addEventListener('click', sendEmail);

  // AI Analysis
  document.getElementById('btnAiAnalysis').addEventListener('click', openAiAnalysis);
  document.getElementById('btnCopyAi').addEventListener('click', () => {
    const text = document.getElementById('aiResult').textContent;
    if (text) navigator.clipboard.writeText(text).catch(() => {});
  });

  // Config modal
  document.getElementById('btnOpenConfig').addEventListener('click', () => {
    openConfigModal(selectedProjectId || null);
  });
  document.getElementById('btnSaveConfig').addEventListener('click', saveConfig);
  document.getElementById('btnImportConfig').addEventListener('click', importConfigFile);
  document.getElementById('btnExportConfig').addEventListener('click', exportConfig);
  document.getElementById('btnResetApp').addEventListener('click', () => {
    showConfirm(
      'Tutti i dati verranno eliminati definitivamente:\n\n' +
      '• Configurazione (progetti, task, risorse, budget)\n' +
      '• Dati XLS caricati\n' +
      '• Selezioni salvate\n\n' +
      '⚠️ Questa operazione non è reversibile.\n' +
      'Si consiglia di esportare la configurazione (Export JSON) prima di procedere.',
      () => {
        // Clear all known keys
        [CONFIG_KEY, DATA_INDEX_KEY, SUMMARY_KEY].forEach(k => {
          try { localStorage.removeItem(k); } catch(e) {}
        });
        // Clear all per-project data keys
        try {
          Object.keys(localStorage)
            .filter(k => k.startsWith('burndown_v2_data_'))
            .forEach(k => localStorage.removeItem(k));
        } catch(e) {}
        location.reload();
      },
      null,
      '🗑️ Reset App'
    );
  });

  // Tab switching
  document.querySelectorAll('.cfg-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => cfgSwitchTab(btn.dataset.tab));
  });

  // AI provider change → update model dropdown
  document.getElementById('cfgAiProvider').addEventListener('change', e => {
    cfgUpdateModelDropdown(e.target.value, '');
  });

  // Project management
  document.getElementById('cfgProjectSel').addEventListener('change', e => {
    if (cfgProjectIdx >= 0) cfgSaveCurrentToState();
    cfgSelectProject(parseInt(e.target.value));
  });
  document.getElementById('cfgBtnNewProject').addEventListener('click', () => {
    if (cfgProjectIdx >= 0) cfgSaveCurrentToState();
    cfgEditConfig.projects.push({
      id: '', name: '', startDate: '', endDate: '',
      currency: '€', tasks: [], phasing: {}, planning: {}, groups: [],
    });
    cfgPopulateProjectDropdown();
    cfgSelectProject(cfgEditConfig.projects.length - 1);
  });
  document.getElementById('cfgBtnDelProject').addEventListener('click', () => {
    if (cfgProjectIdx < 0) return;
    const proj = cfgEditConfig.projects[cfgProjectIdx];
    const name = proj.name || proj.id || 'this project';
    showConfirm(
      `Delete project "${name}"?\n\nThis will permanently remove all tasks, resources, phasing and planning data for this project.`,
      () => {
        cfgEditConfig.projects.splice(cfgProjectIdx, 1);
        cfgPopulateProjectDropdown();
        cfgSelectProject(cfgEditConfig.projects.length > 0 ? 0 : -1);
      }
    );
  });

  // Task / Group add buttons
  document.getElementById('cfgBtnDerivePhasing').addEventListener('click', cfgDerivePhasing);
  document.getElementById('cfgBtnDerivePlanning').addEventListener('click', cfgDerivePhasing);
  document.getElementById('cfgBtnReforecastPhasing').addEventListener('click', cfgReforecast);
  document.getElementById('cfgBtnReforecastPlanning').addEventListener('click', cfgReforecast);
  document.getElementById('cfgBtnRollbackPhasing').addEventListener('click', cfgRollbackReforecast);
  document.getElementById('cfgBtnRollbackPlanning').addEventListener('click', cfgRollbackReforecast);

  document.getElementById('cfgBtnAddTask').addEventListener('click', () => {
    document.getElementById('cfgTaskList').appendChild(
      cfgMakeTaskCard({ name: '', resources: [] })
    );
    cfgUpdateGrandTotals();
  });
  document.getElementById('cfgBtnAddPtc').addEventListener('click', () => {
    document.getElementById('cfgPtcList').appendChild(
      cfgMakePtcCard({ title: '', note: '', amount: 0, month: cfgGetProjectMonths()[0] || '' })
    );
    cfgUpdateGrandTotals();
  });

  document.getElementById('cfgBtnAddGroup').addEventListener('click', () => {
    document.getElementById('cfgGroupList').appendChild(
      cfgMakeGroupCard({ name: '', roles: [] })
    );
  });

  // Date changes → warn if phasing/planning values fall outside the new range
  ['cfgStartDate', 'cfgEndDate'].forEach(id => {
    const inp = document.getElementById(id);
    // Store previous value on focus so we can revert on cancel
    inp.addEventListener('focus', () => { inp.dataset.prev = inp.value; });
    inp.addEventListener('change', () => {
      const p  = cfgReadGrid('cfg-phasing-input');
      const pl = cfgReadGrid('cfg-planning-input');
      const newMonths = new Set(cfgGetMonthRange());
      const lost = [...new Set([
        ...Object.keys(p).filter(ym => !newMonths.has(ym)),
        ...Object.keys(pl).filter(ym => !newMonths.has(ym)),
      ])].sort();

      const applyDateChange = () => {
        cfgRenderPhasingGrid(p);
        cfgRenderPlanningGrid(pl);
      };

      if (lost.length > 0) {
        const names = lost.map(ym => {
          const [y, m] = [parseInt(ym.slice(0, 4)), parseInt(ym.slice(4, 6))];
          return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        });
        const msg =
          `Changing the project dates will discard the phasing/planning values for the following months:\n\n` +
          `${names.join(', ')}\n\n` +
          `Do you want to continue?`;
        showConfirm(msg, applyDateChange, () => { inp.value = inp.dataset.prev || ''; });
      } else {
        applyDateChange();
      }
    });
  });

  // Live-update project name in dropdown as user types
  document.getElementById('cfgName').addEventListener('input', () => {
    if (cfgProjectIdx < 0) return;
    const sel = document.getElementById('cfgProjectSel');
    if (sel.options[cfgProjectIdx]) {
      sel.options[cfgProjectIdx].textContent =
        document.getElementById('cfgName').value.trim() || `Project ${cfgProjectIdx + 1}`;
    }
  });

  // Project selector
  document.getElementById('projectSelect').addEventListener('change', e => selectProject(e.target.value));

  // Burndown task filter
  document.getElementById('burndownTaskFilter').addEventListener('change', updateBurndown);

  // Burndown chart export as PNG
  document.getElementById('btnExportChart').addEventListener('click', () => {
    if (!burndownChartInst) return;
    const a = document.createElement('a');
    a.href = burndownChartInst.toBase64Image('image/png', 1);
    a.download = `burndown_${selectedProjectId || 'chart'}.png`;
    a.click();
  });

  // Burndown interval toggle
  document.querySelectorAll('#intervalToggle [data-interval]').forEach(btn => {
    btn.addEventListener('click', () => {
      burndownInterval = btn.dataset.interval;
      document.querySelectorAll('#intervalToggle [data-interval]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateBurndown();
    });
  });

  // Month filter: clears datepickers then updates tables
  document.getElementById('monthFilter').addEventListener('change', () => {
    document.getElementById('filterStart').value = '';
    document.getElementById('filterEnd').value   = '';
    updateTaskTables();
  });

  // Datepickers: clears month filter then updates tables
  document.getElementById('filterStart').addEventListener('change', () => {
    document.getElementById('monthFilter').value = '';
    updateTaskTables();
  });
  document.getElementById('filterEnd').addEventListener('change', () => {
    document.getElementById('monthFilter').value = '';
    updateTaskTables();
  });

  document.getElementById('btnResetDate').addEventListener('click', resetDateFilter);
});
