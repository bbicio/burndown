// ── PIPELINE BOARD ───────────────────────────────────────────────────────────
// Finance view: all proposals organised by deal pipeline stage.
// Columns: Draft → SIP → Expected → Anticipated → Committed → Canceled
// Draft column shows only the current user's private proposals.
// Each column scrolls vertically; totals per currency are sticky at the bottom.

const PB_STAGES = ['Draft', 'SIP', 'Expected', 'Anticipated', 'Committed', 'Canceled'];

const PB_STAGE_STYLE = {
  Draft:       { bg: '#f8f9fa',                          border: '#adb5bd',                          badge: '#6c757d'                           },
  SIP:         { bg: 'var(--pipeline-sip-bg)',           border: 'var(--pipeline-sip-color)',         badge: 'var(--pipeline-sip-color)'          },
  Expected:    { bg: 'var(--pipeline-expected-bg)',      border: 'var(--pipeline-expected-color)',    badge: 'var(--pipeline-expected-color)'     },
  Anticipated: { bg: 'var(--pipeline-anticipated-bg)',  border: 'var(--pipeline-anticipated-color)', badge: 'var(--pipeline-anticipated-color)' },
  Committed:   { bg: 'var(--pipeline-committed-bg)',    border: 'var(--pipeline-committed-color)',   badge: 'var(--pipeline-committed-color)'   },
  Canceled:    { bg: 'var(--pipeline-canceled-bg)',     border: 'var(--pipeline-canceled-color)',    badge: 'var(--pipeline-canceled-color)'    },
};

let _pbActiveCgId    = null;
let _pbActiveVerid   = null;
let _pbSelectedYear  = new Date().getFullYear();
let _pbClientGroups  = [];  // populated from Api.clientGroups.list() on pipeline board init
let _pbRatecards     = [];  // populated from Api.ratecards.list() on pipeline board init
// _pbCloneSource is declared in costgrid.js (shared with the editor page)

// ── SHOW / HIDE ───────────────────────────────────────────────────────────────

function showPipelineBoardView() {
  const sections = [
    'portfolioSection', 'portfolioPlanningSection', 'mainContent',
    'uploadSection', 'costGridEditorSection',
    'pipelineBoardSection',
  ];
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('pipelineBoardSection').style.display = 'block';
  updateNavState('pipelineboard');
  renderPipelineBoard();
}

// ── DATA HELPERS ──────────────────────────────────────────────────────────────

// Returns the version to display for a cost grid on the pipeline board.
// Non-Draft CGs: latest non-Draft version (linked ones preferred).
// Draft-only CGs: latest Draft version.
function pbGetDisplayVersion(cg) {
  const nonDraft = cg.versions.filter(v => v.pipeline !== 'Draft');
  if (nonDraft.length) {
    const withLinks = nonDraft.filter(v => (v.linkedProjects || []).length > 0);
    if (withLinks.length) {
      return withLinks.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    }
    return nonDraft.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  }
  // All versions are Draft: return the most recent one (one card per CG, not per version)
  return cg.versions.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
}

function pbGetStage(v) {
  if (v.pipeline) return v.pipeline;
  // Legacy fallback for versions saved before the pipeline field existed.
  for (const lp of (v.linkedProjects || [])) {
    const p = (config.projects || []).find(proj => proj.id === lp.projectId)?.pipeline;
    if (p) return p;
  }
  return 'SIP';
}

function pbGetStatus(v) {
  const lps = v.linkedProjects || [];
  for (const lp of lps) {
    const proj = (config.projects || []).find(p => p.id === lp.projectId);
    if (proj?.status) return proj.status;
  }
  return null;
}

function pbFmtMoney(n, cur) {
  const safe = (typeof n === 'number' && isFinite(n)) ? n : 0;
  return (cur || '€') + ' ' + safe.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function pbFmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch (e) { return iso; }
}

// ── RENDER BOARD ──────────────────────────────────────────────────────────────

function renderPipelineBoard() {
  const container = document.getElementById('pbColumnsContainer');
  if (!container) return;

  const index = cgGetIndex();

  // Group by stage: Draft versions go into the Draft column;
  // each cost grid's latest non-Draft version determines its pipeline column.
  const grouped = {};
  PB_STAGES.forEach(s => { grouped[s] = []; });

  index.forEach(cgId => {
    const cg = cgLoad(cgId);
    if (!cg || !cg.versions?.length) return;

    const v = pbGetDisplayVersion(cg);
    if (!v) return;

    const stage = pbGetStage(v);
    if (stage === 'Draft') {
      // One card per cost grid in the Draft column (not one per version)
      grouped['Draft'].push({ cg, v });
    } else if (grouped[stage]) {
      grouped[stage].push({ cg, v });
    } else {
      grouped['SIP'].push({ cg, v });
    }
  });

  container.innerHTML = PB_STAGES.map(stage => {
    const cards    = grouped[stage];
    const st       = PB_STAGE_STYLE[stage];
    const totals   = pbComputeColumnTotals(cards);
    const totalsHtml = Object.entries(totals)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cur, { fee, ptc }]) =>
        `<div class="text-end">
           <div class="fw-bold" style="font-size:var(--text-base)">${pbFmtMoney(fee, cur)}</div>
           ${ptc > 0 ? `<div class="text-muted" style="font-size:var(--text-2xs)">${pbFmtMoney(ptc, cur)} PTC</div>` : ''}
         </div>`
      ).join('') || '<span class="text-muted" style="font-size:var(--text-xs)">—</span>';

    const cardsHtml = cards.length
      ? cards.map(({ cg, v }) => pbBuildCard(cg, v)).join('')
      : `<div class="text-center text-muted py-4" style="font-size:var(--text-sm)">No offers</div>`;

    return `
      <div class="pb-column d-flex flex-column" style="border-top:3px solid ${st.border}">
        <!-- Column header -->
        <div class="pb-col-header d-flex align-items-center gap-2 px-2 py-2 flex-shrink-0"
             style="background:${st.bg};border-bottom:1px solid ${st.border}20">
          <span class="fw-bold" style="font-size:var(--text-md);color:#1a1a2e">${esc(stage)}</span>
          <span class="badge rounded-pill text-white" style="background:${st.badge};font-size:var(--text-xs)">${cards.length}</span>
        </div>
        <!-- Scrollable body -->
        <div class="pb-col-body flex-grow-1 overflow-y-auto px-2 py-2" style="min-height:0">
          ${cardsHtml}
        </div>
        <!-- Sticky footer totals -->
        <div class="pb-col-footer flex-shrink-0 px-2 py-2"
             style="background:${st.bg};border-top:1px solid ${st.border}40;font-size:var(--text-sm)">
          ${totalsHtml}
        </div>
      </div>`;
  }).join('');

  // Wire card clicks and action buttons
  container.querySelectorAll('[data-pb-cgid]').forEach(card => {
    const cgId  = card.dataset.pbCgid;
    const verId = card.dataset.pbVerid;

    // Card body click → open detail panel
    card.addEventListener('click', () => pbOpenDetailPanel(cgId, verId));

    // Edit button → open costgrid editor
    card.querySelector('.pb-card-edit')?.addEventListener('click', e => {
      e.stopPropagation();
      showCostGridEditorView(cgId, verId);
    });

    // Clone button → open clone modal
    card.querySelector('.pb-card-clone')?.addEventListener('click', e => {
      e.stopPropagation();
      const cg = cgLoad(cgId);
      if (!cg) return;
      _pbCloneSource = { cgId, verId, name: cg.name };
      document.getElementById('cgCloneSourceName').textContent = cg.name;
      document.getElementById('cgCloneGridName').value = cg.name + ' — Copy';
      document.getElementById('cgCloneError').classList.add('d-none');
      bootstrap.Modal.getOrCreateInstance(document.getElementById('cgCloneModal')).show();
    });

    // Share button → open sharing modal
    card.querySelector('.pb-card-share')?.addEventListener('click', e => {
      e.stopPropagation();
      const cg = cgLoad(cgId);
      if (cg && typeof openShareModal === 'function') openShareModal('cost_grid', cgId, cg.name);
    });

    // Delete button → confirm and delete entire costgrid
    card.querySelector('.pb-card-del')?.addEventListener('click', e => {
      e.stopPropagation();
      const cg = cgLoad(cgId);
      if (cg) cgConfirmDeleteGrid(cgId, cg.name);
    });
  });
}

// Format a task date for display — handles YYYY-MM-DD (from API) and YYYYMM/YYYYMMDD (legacy).
function pbFmtTaskDate(d) {
  if (!d) return null;
  if (d.length === 10 && d[4] === '-') return d.slice(0, 4) + '/' + d.slice(5, 7); // YYYY-MM-DD
  if (d.length >= 6) return d.slice(0, 4) + '/' + d.slice(4, 6);                    // YYYYMM / YYYYMMDD
  return null;
}

// Returns grand totals for a version.
// Falls back to the pre-computed API budget when phases haven't been loaded yet
// (i.e. after cgSyncFromApi() but before cgLoadStructureFromApi()).
function pbGetBudget(v) {
  if ((v.phases || []).length) return cgComputeGrandTotals(v);
  if (typeof getPipelineBudget === 'function') {
    const api = getPipelineBudget(v.versionId);
    if (api) return { fee: api.fee, ptc: api.ptc || 0, hrs: 0, _fromApi: true };
  }
  return { fee: 0, ptc: 0, hrs: 0 };
}

function pbComputeColumnTotals(cards) {
  const totals = {};
  cards.forEach(({ v }) => {
    const grand = pbGetBudget(v);
    const cur   = v.currency || '€';
    if (!totals[cur]) totals[cur] = { fee: 0, ptc: 0 };
    totals[cur].fee += (isFinite(grand.fee) ? grand.fee : 0);
    totals[cur].ptc += (isFinite(grand.ptc) ? grand.ptc : 0);
  });
  return totals;
}

function pbBuildCard(cg, v) {
  const isDraft    = v.pipeline === 'Draft';
  const clientName = v.clientId ? getClientName(v.clientId) : '';
  const showClient = clientName && clientName !== 'Unassigned';
  const grand      = pbGetBudget(v);
  const cur        = v.currency || '€';
  const status     = pbGetStatus(v);
  const isLocked   = (v.linkedProjects || []).length > 0;

  const feeStr   = grand.fee > 0
    ? `<div class="fw-bold" style="font-size:var(--text-base)">${pbFmtMoney(grand.fee, cur)}</div>`
    : '<div class="text-muted" style="font-size:var(--text-sm)">No budget</div>';
  const ptcStr   = grand.ptc > 0
    ? `<div style="font-size:var(--text-2xs);color:var(--text-muted);margin-top:1px">+ ${pbFmtMoney(grand.ptc, cur)} PTC</div>`
    : '';
  const totalStr = feeStr + ptcStr;

  const statusBadgeHtml = status ? statusBadge(status) : '';
  const lockedBadge     = isLocked ? `<span class="badge" style="background:var(--text-muted);color:#fff;font-size:var(--text-2xs)">🔒</span>` : '';
  const ownerHtml       = cg.ownerName ? `<div class="text-muted" style="font-size:var(--text-2xs);margin-top:2px">👤 ${esc(cg.ownerName)}</div>` : '';

  return `
    <div class="pb-card mb-2 p-2 rounded border" data-pb-cgid="${esc(cg.id)}" data-pb-verid="${esc(v.versionId)}"
         style="cursor:pointer;background:#fff;transition:box-shadow .15s${isDraft ? ';border-style:dashed' : ''}"
         onmouseenter="this.style.boxShadow='0 2px 8px rgba(0,0,0,.13)'"
         onmouseleave="this.style.boxShadow=''">
      <!-- Client name -->
      ${showClient ? `<div class="text-muted" style="font-size:var(--text-xs);margin-bottom:1px">${esc(clientName)}</div>` : ''}
      <!-- Proposal name + lock badge -->
      <div class="d-flex align-items-start justify-content-between gap-1 mb-1">
        <span class="fw-semibold" style="font-size:var(--text-base);line-height:1.3">${esc(v.projectName || cg.name)}</span>
        ${lockedBadge}
      </div>
      <!-- Budget -->
      ${totalStr}
      <!-- Status + version -->
      <div class="d-flex align-items-center gap-1 flex-wrap mt-1">
        ${statusBadgeHtml}
        <span class="text-muted" style="font-size:var(--text-2xs)">${esc(v.versionLabel || '')}</span>
      </div>
      <!-- Creator + date + actions -->
      <div class="d-flex justify-content-between align-items-end mt-2 pt-1" style="border-top:1px solid var(--border-light)">
        <div>
          <span style="font-size:var(--text-2xs);color:#999">${pbFmtDate(v.createdAt)}</span>
          ${ownerHtml}
        </div>
        <div class="d-flex gap-1">
          <button class="btn btn-xs btn-outline-secondary pb-card-edit" title="Open in editor">✏️ Edit</button>
          <button class="btn btn-xs btn-outline-secondary pb-card-clone" title="Clone proposal">⧉</button>
          ${!isDraft ? `<button class="btn btn-xs btn-outline-secondary pb-card-share" title="Share">🔗</button>` : ''}
          ${isDraft  ? `<button class="btn btn-xs btn-outline-danger pb-card-del" title="Delete proposal">🗑</button>` : ''}
        </div>
      </div>
    </div>`;
}

// ── DETAIL PANEL ──────────────────────────────────────────────────────────────

async function pbOpenDetailPanel(cgId, verId) {
  _pbActiveCgId  = cgId;
  _pbActiveVerid = verId;

  const panel   = document.getElementById('pbDetailPanel');
  const content = document.getElementById('pbDetailContent');
  if (!panel || !content) return;

  // Show panel immediately with spinner while structure loads
  panel.style.display = 'flex';
  content.innerHTML = `<div class="d-flex align-items-center justify-content-center w-100"><div class="spinner-border text-secondary"></div></div>`;

  // Load phases + roles from API into localStorage
  if (typeof cgLoadStructureFromApi === 'function') {
    await cgLoadStructureFromApi(cgId, verId).catch(() => {});
  }

  const cg = cgLoad(cgId);
  if (!cg) {
    content.innerHTML = `<div class="d-flex align-items-center justify-content-center w-100 text-danger" style="font-size:var(--text-sm)">Could not load cost grid. Try reloading the page.</div>`;
    return;
  }
  const v = cg.versions.find(ver => ver.versionId === verId) || pbGetDisplayVersion(cg);

  // Derive linkedProjects from config.projects when not in localStorage
  // (the API list endpoint does not return linkedProjects).
  const _projsByRef = (config.projects || []).filter(p =>
    p.costGridRef?.cgId === cgId && p.costGridRef?.versionId === v.versionId
  );
  const _lps = (v.linkedProjects && v.linkedProjects.length)
    ? v.linkedProjects
    : _projsByRef.map(p => ({ projectId: p.id, projectName: p.name }));

  // Derive clientId: prefer stored v.clientId, else first linked project's clientId
  const _effectiveClientId = v.clientId
    || _lps.map(lp => (config.projects || []).find(p => p.id === lp.projectId)?.clientId).find(Boolean)
    || _projsByRef[0]?.clientId
    || null;

  const clientName = _effectiveClientId ? getClientName(_effectiveClientId) : '';
  const showClient = clientName && clientName !== 'Unassigned';
  const rcEntry    = v.ratecardId ? _pbRatecards.find(r => String(r.id) === String(v.ratecardId)) : null;
  const rcName     = rcEntry ? rcEntry.name : '';
  const grand      = pbGetBudget(v);
  const cur        = v.currency || '€';
  const fmt        = n => pbFmtMoney(n, cur);
  const isLocked   = _lps.length > 0;
  const stage      = pbGetStage(v);
  const st         = PB_STAGE_STYLE[stage] || PB_STAGE_STYLE.SIP;

  // ── LEFT COLUMN: offer info ───────────────────────────────────────────────
  const offerHtml = `
    <div class="mb-3">
      <div class="d-flex align-items-center gap-2 flex-wrap mb-1">
        <span class="badge rounded-pill text-white" style="background:${st.badge};font-size:var(--text-xs)">${esc(stage)}</span>
        ${isLocked ? `<span class="badge" style="background:var(--text-muted);color:#fff;font-size:var(--text-xs)">🔒 Locked</span>` : ''}
      </div>
      ${showClient ? `<div class="text-muted" style="font-size:var(--text-xs)">${esc(clientName)}</div>` : ''}
      ${rcName ? `<div class="text-muted" style="font-size:var(--text-xs)">Rate card: ${esc(rcName)}</div>` : ''}
      <div class="fw-bold" style="font-size:var(--text-lg)">${esc(v.projectName || cg.name)}</div>
      <div class="text-muted" style="font-size:var(--text-xs)">${esc(v.versionLabel || '')} · ${pbFmtDate(v.createdAt)}</div>
    </div>
    <div class="row g-2 mb-3" style="font-size:var(--text-base)">
      <div class="col-6">
        <div class="text-muted" style="font-size:var(--text-xs)">Period</div>
        <div>${v.startDate ? v.startDate.slice(0,4)+'/'+v.startDate.slice(4,6) : '—'} – ${v.endDate ? v.endDate.slice(0,4)+'/'+v.endDate.slice(4,6) : '—'}</div>
      </div>
      <div class="col-6">
        <div class="text-muted" style="font-size:var(--text-xs)">Currency</div>
        <div>${esc(cur)}</div>
      </div>
      <div class="col-6">
        <div class="text-muted" style="font-size:var(--text-xs)">Professional fees</div>
        <div class="fw-semibold">${grand.fee > 0 ? fmt(grand.fee) : '—'}</div>
      </div>
      <div class="col-6">
        <div class="text-muted" style="font-size:var(--text-xs)">PTC</div>
        <div class="fw-semibold">${grand.ptc > 0 ? fmt(grand.ptc) : '—'}</div>
      </div>
      <div class="col-12">
        <div class="text-muted" style="font-size:var(--text-xs)">Total budget</div>
        <div class="fw-bold" style="font-size:var(--text-xl)">${(grand.fee + grand.ptc) > 0 ? fmt(grand.fee + grand.ptc) : '—'}</div>
      </div>
    </div>
    ${v.note ? `<div class="mb-3 p-2 rounded" style="background:var(--surface-light);font-size:var(--text-sm);white-space:pre-wrap">${esc(v.note)}</div>` : ''}`;

  // ── LEFT COLUMN: linked projects ──────────────────────────────────────────
  const lps = _lps;
  const projsByRef = _projsByRef;

  let linkedHtml = `<div class="fw-semibold mb-2" style="font-size:var(--text-md)">🔗 Linked projects</div>`;
  if (!lps.length) {
    linkedHtml += `<div class="text-muted" style="font-size:var(--text-sm)">No projects linked.</div>`;
  } else {
    linkedHtml += lps.map(lp => {
      // 1. Direct ID match (fastest path, always correct)
      let proj = (config.projects || []).find(p => p.id === lp.projectId);

      // 2. If not found (project was renamed), try matching via costGridRef + name
      if (!proj && projsByRef.length) {
        proj = projsByRef.find(p => p.name === lp.projectName)
            || projsByRef.find(p => lp.projectName && p.name &&
                 (lp.projectName.startsWith(p.name) || p.name.startsWith(lp.projectName)))
            || (projsByRef.length === 1 ? projsByRef[0] : null);
      }

      const navId      = proj?.id || lp.projectId;
      const dispId     = proj?.id || lp.projectId;
      const pname      = lp.projectName || proj?.name || lp.projectId;
      const pipeline   = getProjectPipeline(navId) || proj?.pipeline || '';
      const projStatus = proj?.status || '';
      // Check data against the resolved navId
      const hasData    = timesheetData.some(r => r.projectId === navId);
      return `
        <div class="p-2 mb-2 rounded border" style="font-size:var(--text-sm);background:var(--surface-light)">
          <div class="d-flex align-items-start justify-content-between gap-2">
            <div class="flex-grow-1 min-width-0">
              <div class="fw-semibold">${esc(pname)}</div>
              <div style="font-size:var(--text-xs);color:var(--text-muted);font-family:'SFMono-Regular',monospace">${esc(dispId)}</div>
              <div class="d-flex gap-1 flex-wrap mt-1">
                ${pipeline   ? pipelineBadge(pipeline)  : ''}
                ${projStatus ? statusBadge(projStatus)  : ''}
              </div>
            </div>
            <div class="d-flex gap-1 flex-shrink-0">
              ${hasData
                ? `<button class="btn btn-xs btn-outline-secondary"
                     onclick="pbGoToReporting('${esc(navId)}')">📊 Reporting</button>`
                : ''}
              <button class="btn btn-xs btn-outline-secondary"
                onclick="pbGoToConfigure('${esc(navId)}')">⚙ Configure</button>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  // ── RIGHT COLUMN: phases + tasks ──────────────────────────────────────────
  let taskHtml = `<div class="fw-semibold mb-3" style="font-size:var(--text-md)">📋 Tasks by phase</div>`;
  const phases = v.phases || [];
  if (!phases.length || !phases.some(ph => ph.tasks?.length)) {
    taskHtml += `<div class="text-muted" style="font-size:var(--text-sm)">No tasks defined.</div>`;
  } else {
    taskHtml += phases.map(ph => {
      const phTot    = cgComputePhaseTotals(ph, v.roles);
      const phTotal  = (phTot.fee + phTot.ptc) > 0
        ? `<span style="font-size:var(--text-sm);font-weight:600">${fmt(phTot.fee + phTot.ptc)}</span>`
        : '';
      const taskRows = (ph.tasks || []).map(task => {
        const tt = cgComputeTaskTotals(task, v.roles);
        const dateRange = [
          pbFmtTaskDate(task.taskStartDate),
          pbFmtTaskDate(task.taskEndDate),
        ].filter(Boolean).join(' – ') || '—';
        return `
          <div class="d-flex align-items-baseline gap-3 py-2 border-bottom" style="font-size:var(--text-base)">
            <span class="flex-grow-1">${esc(task.taskName || task.taskId)}</span>
            <span class="text-muted" style="font-size:var(--text-xs);white-space:nowrap">${dateRange}</span>
            <span style="white-space:nowrap;min-width:44px;text-align:right;font-size:var(--text-xs);color:var(--text-muted)">${tt.totalHrs > 0 ? tt.totalHrs + 'h' : '—'}</span>
            <span class="fw-semibold" style="white-space:nowrap;min-width:80px;text-align:right">${tt.totalFee > 0 ? fmt(tt.totalFee) : '—'}</span>
          </div>`;
      }).join('');
      return `
        <div class="mb-4">
          <div class="d-flex align-items-center justify-content-between mb-2 pb-1" style="border-bottom:2px solid var(--indigo-200)">
            <span class="fw-bold" style="font-size:var(--text-md);color:var(--indigo-600)">${esc(ph.phaseName || ph.phaseId)}</span>
            ${phTotal}
          </div>
          ${taskRows}
        </div>`;
    }).join('');
  }

  // ── Version tabs (shown when the CG has more than one version) ───────────
  let versionTabsHtml = '';
  if (cg.versions.length > 1) {
    const tabBtns = cg.versions.map(ver => {
      const isActive = ver.versionId === v.versionId;
      const verStage = pbGetStage(ver);
      const verSt    = PB_STAGE_STYLE[verStage] || PB_STAGE_STYLE.SIP;
      return `<button class="btn btn-sm ${isActive ? 'btn-primary' : 'btn-outline-secondary'} pb-ver-tab-btn"
        data-cgid="${esc(cgId)}" data-verid="${esc(ver.versionId)}"
        style="font-size:var(--text-xs);padding:2px 10px;gap:4px">
        ${esc(ver.versionLabel)}<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${verSt.badge};vertical-align:middle;margin-left:4px"></span>
      </button>`;
    }).join('');
    versionTabsHtml = `
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 18px;border-bottom:1px solid var(--border-light);background:var(--surface-light);flex-shrink:0">
        <span class="text-muted" style="font-size:var(--text-xs)">Version:</span>
        ${tabBtns}
      </div>`;
  }

  // ── Two-column layout ─────────────────────────────────────────────────────
  content.innerHTML = `
    <div style="display:flex;flex-direction:column;width:100%;overflow:hidden">
      ${versionTabsHtml}
      <div style="display:flex;flex:1;overflow:hidden">
        <div style="width:50%;padding:20px 18px;overflow-y:auto;border-right:1px solid var(--border-light)">
          ${offerHtml}
          <div id="pbPotSection"></div>
          <hr style="border-color:var(--border-light);margin:16px 0">
          ${linkedHtml}
        </div>
        <div style="flex:1;padding:20px 18px;overflow-y:auto">
          ${taskHtml}
        </div>
      </div>
    </div>`;

  content.querySelectorAll('.pb-ver-tab-btn').forEach(btn =>
    btn.addEventListener('click', () => pbOpenDetailPanel(btn.dataset.cgid, btn.dataset.verid))
  );

  pbLoadPotSection(v, stage);

  // ── Action buttons ────────────────────────────────────────────────────────
  document.getElementById('pbBtnOpenCg').onclick = () => {
    pbCloseDetailPanel();
    showCostGridEditorView(cgId, v.versionId);
  };

  const shareBtn = document.getElementById('pbBtnShareCg');
  if (shareBtn) {
    shareBtn.style.display = stage === 'Draft' ? 'none' : '';
    shareBtn.onclick = () => {
      const cg = cgLoad(cgId);
      if (cg && typeof openShareModal === 'function') openShareModal('cost_grid', cgId, cg.name);
    };
  }

  const cloneBtn = document.getElementById('pbBtnCloneCg');
  if (cloneBtn) {
    cloneBtn.onclick = () => {
      const cg = cgLoad(cgId);
      if (!cg) return;
      _pbCloneSource = { cgId, verId: v.versionId, name: cg.name };
      document.getElementById('cgCloneSourceName').textContent =
        cg.name + (v.versionLabel ? ' — ' + v.versionLabel : '');
      document.getElementById('cgCloneGridName').value = cg.name + ' — Copy';
      document.getElementById('cgCloneError').classList.add('d-none');
      bootstrap.Modal.getOrCreateInstance(document.getElementById('cgCloneModal')).show();
    };
  }

}

async function pbLoadPotSection(v, stage) {
  const el = document.getElementById('pbPotSection');
  if (!el) return;

  const year = v.pipelineYear;
  if (!year || stage === 'Draft') { el.innerHTML = ''; return; }

  // Find the client from the first linked project
  let clientId = null;
  for (const lp of (v.linkedProjects || [])) {
    const proj = (config.projects || []).find(p => p.id === lp.projectId);
    if (proj?.clientId) { clientId = proj.clientId; break; }
  }
  if (!clientId) { el.innerHTML = ''; return; }

  // Check if client belongs to a group
  const group = _pbClientGroups.find(g => (g.clients || []).some(c => c.id === clientId));
  const params = group ? { year, clientGroupId: group.id } : { year, clientId };
  const targetName = group ? group.name : getClientName(clientId);

  el.innerHTML = `<div style="border-top:1px solid var(--border-light);padding-top:10px;margin-top:4px">
    <div class="text-muted" style="font-size:var(--text-xs)">Loading POT...</div>
  </div>`;

  try {
    const { pot, proposals } = await Api.pots.summary(params);

    if (!pot) {
      el.innerHTML = `<div style="border-top:1px solid var(--border-light);padding-top:10px;margin-top:4px">
        <div class="text-muted" style="font-size:var(--text-xs)">No POT target for <strong>${esc(targetName)}</strong> in ${year}.</div>
      </div>`;
      return;
    }

    const totalBudget = proposals.reduce((sum, p) => {
      const b = typeof getPipelineBudget === 'function' ? getPipelineBudget(p.version_id) : null;
      return sum + (b?.fee || 0);
    }, 0);
    const pct = pot.amount > 0 ? Math.min(100, Math.round(totalBudget / pot.amount * 100)) : 0;
    const pctColor = pct >= 100 ? '#198754' : pct >= 75 ? '#fd7e14' : '#0d6efd';
    const fmtM = n => '€ ' + Number(n).toLocaleString('en', { maximumFractionDigits: 0 });

    el.innerHTML = `
      <div style="border-top:1px solid var(--border-light);padding-top:10px;margin-top:4px">
        <div class="d-flex align-items-center justify-content-between mb-1">
          <span class="fw-semibold" style="font-size:var(--text-sm)">🎯 POT — ${esc(targetName)} ${year}</span>
          <span style="font-size:var(--text-xs);color:${pctColor};font-weight:700">${pct}%</span>
        </div>
        <div style="height:6px;background:#e9ecef;border-radius:3px;overflow:hidden;margin-bottom:5px">
          <div style="height:100%;width:${pct}%;background:${pctColor};border-radius:3px"></div>
        </div>
        <div class="d-flex justify-content-between" style="font-size:var(--text-xs);color:var(--text-muted)">
          <span>Pipeline: <strong style="color:#1a1a2e">${fmtM(totalBudget)}</strong></span>
          <span>Target: <strong style="color:#1a1a2e">${fmtM(pot.amount)}</strong></span>
        </div>
        ${proposals.length > 1 ? `<div class="text-muted mt-1" style="font-size:var(--text-2xs)">${proposals.length} proposals contribute to this POT</div>` : ''}
      </div>`;
  } catch (e) {
    el.innerHTML = '';
  }
}

function pbCloseDetailPanel() {
  const panel = document.getElementById('pbDetailPanel');
  if (panel) panel.style.display = 'none';
  _pbActiveCgId  = null;
  _pbActiveVerid = null;
}

function pbGoToReporting(projectId) {
  pbCloseDetailPanel();
  showDashboardView(projectId);
}

function pbGoToConfigure(projectId) {
  window.location.href = '/portfolio.html?projectId=' + encodeURIComponent(projectId) + '&configure=true';
}
