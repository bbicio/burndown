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
const CONFIG_KEY     = 'PDash_config';
const DATA_INDEX_KEY = 'PDash_data_index';
const SUMMARY_KEY    = 'PDash_summary';
const SETTINGS_KEY   = 'PDash_settings';

let _jsonViewerOnSave   = null;
let _jsonViewerFilename = 'export.json';

let appSettings = {
  aiProvider: 'anthropic', aiModel: '',
  anthropicApiKey: '', openaiApiKey: '', geminiApiKey: '',
  emailjsKey: '', emailjsService: '', emailjsTemplate: ''
};

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
  // Track last local change for remote sync status (direct write, no recursion)
  if (key.startsWith('PDash_') && key !== 'PDash_sync' && key !== SETTINGS_KEY && !key.startsWith('PDash_data_')) {
    try {
      const raw  = localStorage.getItem('PDash_sync');
      const meta = raw ? JSON.parse(raw) : {};
      meta.localChangedAt = new Date().toISOString();
      localStorage.setItem('PDash_sync', JSON.stringify(meta));
    } catch(e) {}
  }
}

// ── PROJECT DATA CACHE ────────────────────────────────────────────────────────
function dataKey(pid) { return `PDash_data_${pid}`; }

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

function loadSettings() {
  try {
    const s = storageGet(SETTINGS_KEY);
    if (s) {
      appSettings = { ...appSettings, ...JSON.parse(s) };
    } else if (config.anthropicApiKey || config.openaiApiKey || config.emailjsKey) {
      // One-time migration from legacy config object
      appSettings.anthropicApiKey = config.anthropicApiKey || '';
      appSettings.openaiApiKey    = config.openaiApiKey    || '';
      appSettings.geminiApiKey    = config.geminiApiKey    || '';
      appSettings.aiProvider      = config.aiProvider      || 'anthropic';
      appSettings.aiModel         = config.aiModel         || '';
      appSettings.emailjsKey      = config.emailjsKey      || '';
      appSettings.emailjsService  = config.emailjsService  || '';
      appSettings.emailjsTemplate = config.emailjsTemplate || '';
      persistSettings();
    }
  } catch(e) {}
}
function persistSettings() { storageSet(SETTINGS_KEY, JSON.stringify(appSettings)); }

function hasAiKey() {
  return !!(appSettings.anthropicApiKey || appSettings.openaiApiKey || appSettings.geminiApiKey);
}
function hasEmailConfig() {
  return !!(appSettings.emailjsKey && appSettings.emailjsService && appSettings.emailjsTemplate);
}

// ── JSON VIEWER ───────────────────────────────────────────────────────────────

function openJsonViewer(title, data, onSave, filename) {
  _jsonViewerOnSave   = onSave  || null;
  _jsonViewerFilename = filename || 'export.json';
  document.getElementById('jsonViewerTitle').textContent   = '{ } ' + title;
  document.getElementById('jsonViewerContent').value       = JSON.stringify(data, null, 2);
  document.getElementById('jsonViewerError').classList.add('d-none');
  const applyBtn = document.getElementById('btnJsonApply');
  if (applyBtn) applyBtn.style.display = onSave ? '' : 'none';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('jsonViewerModal')).show();
}

// ── NAV STATE ────────────────────────────────────────────────────────────────

function updateNavState(tab) {
  document.querySelectorAll('.nav-main-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.navtab === tab);
  });
  const subnav = document.getElementById('appSubnav');
  if (subnav) subnav.innerHTML = '';
}

function updatePortfolioCacheBadge() {
  const el = document.getElementById('portfolioCacheBadge');
  if (!el) return;
  const n = timesheetData.length;
  el.innerHTML = n > 0
    ? `<span class="badge bg-success" style="font-size:var(--text-sm);padding:4px 8px">✅ ${n} rows in cache</span>`
    : `<span class="text-muted small">No XLS loaded</span>`;
}

function updateAiButtonVisibility() {
  const navBtn = document.getElementById('btnToggleAiSidebar');
  if (navBtn) navBtn.style.display = hasAiKey() ? '' : 'none';
  updateAiProviderBadge();
}

function updateAiProviderBadge() {
  const el = document.getElementById('aiProviderBadge');
  if (!el) return;
  const provider = appSettings.aiProvider || 'anthropic';
  const model    = appSettings.aiModel    || '';
  const icons = { anthropic: '🟣', openai: '🟢', gemini: '🔵' };
  const names = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Gemini' };
  const models = AI_MODELS[provider] || [];
  const modelLabel = (models.find(m => m.id === model)?.label || model || models[0]?.label || '').replace(/ \(.*\)/, '');
  el.textContent = `${icons[provider] || '🤖'} ${names[provider] || provider} · ${modelLabel}`;
}

// ── UTILITIES ────────────────────────────────────────────────────────────────
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
  const s = {
    SIP:         'background:var(--pipeline-sip-color);color:#fff',
    Expected:    'background:var(--pipeline-expected-color);color:#fff',
    Anticipated: 'background:var(--pipeline-anticipated-color);color:#fff',
    Committed:   'background:var(--pipeline-committed-color);color:#fff',
    Canceled:    'background:var(--pipeline-canceled-color);color:#fff',
  }[pipeline] || 'background:var(--text-muted);color:#fff';
  return `<span style="font-size:var(--text-xs);border-radius:var(--radius-xs);padding:2px 8px;font-weight:600;${s}">${esc(pipeline)}</span>`;
}

// Returns the pipeline for a project.
// If the project was generated from a costgrid, the costgrid version is the
// source of truth; otherwise falls back to config.projects[].pipeline.
function getProjectPipeline(projectId) {
  const proj = (config.projects || []).find(p => p.id === projectId);
  if (!proj) return '';
  const ref = proj.costGridRef;
  if (ref?.cgId) {
    const cg  = cgLoad(ref.cgId);
    const ver = cg?.versions.find(v => v.versionId === ref.versionId);
    if (ver?.pipeline) return ver.pipeline;
  }
  return proj.pipeline || '';
}

function statusBadge(status) {
  if (!status) return '';
  const s = { 'Not started yet':'background:var(--text-disabled);color:#fff', 'Started':'background:var(--color-success);color:#fff',
    'Started At Risk':'background:var(--color-danger);color:#fff', 'Put on hold':'background:var(--color-warning);color:#000',
    'Completed':'background:var(--brand-navy);color:#fff' }[status] || 'background:var(--text-disabled);color:#fff';
  return `<span style="font-size:var(--text-2xs);border-radius:var(--radius-xs);padding:1px 7px;font-weight:600;${s}">${esc(status)}</span>`;
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

  okBtn.addEventListener('click', () => {
    confirmed = true;
    if (onConfirm) onConfirm();   // execute immediately, before hide animation
    modal.hide();
  });
  modalEl.addEventListener('hidden.bs.modal', () => {
    modalEl.style.zIndex = '';  // reset inline z-index set by shown handler
    if (!confirmed && onCancel) onCancel();
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

function cfgForProject(projectId) {
  const key = projectId.trim().toLowerCase();
  return config.projects?.find(p => p.id && p.id.trim().toLowerCase() === key) || null;
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

function inRange(date, start, end) {
  if (!date) return false;
  if (start && date < start) return false;
  if (end   && date > end)   return false;
  return true;
}
