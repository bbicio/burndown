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

function pbFmtMoney(n, code) {
  const parsed = parseFloat(n);
  const opts   = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  const cur    = (window.__currencies || []).find(c => c.code === code)
    || { symbol: code === 'EUR' ? '€' : (code || '€'), locale: 'it-IT' };
  if (!isFinite(parsed)) return `${cur.symbol} 0,00`;
  return `${cur.symbol} ${new Intl.NumberFormat(cur.locale, opts).format(parsed)}`;
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

  const stagesData = PB_STAGES.map(stage => {
    const cards  = grouped[stage];
    const st     = PB_STAGE_STYLE[stage];
    const { byCurrency, totalEur, totalEurPtc } = pbComputeColumnTotals(cards);
    const multiCurrency = Object.keys(byCurrency).length > 1 || (Object.keys(byCurrency).length === 1 && !byCurrency['EUR']);
    const currencyLines = Object.entries(byCurrency)
      .sort(([a], [b]) => a === 'EUR' ? -1 : b === 'EUR' ? 1 : a.localeCompare(b))
      .map(([cur, { fee, ptc, rate }]) => {
        const localStr = `<span class="fw-bold">${pbFmtMoney(fee, cur)}</span>`;
        const eurEquiv = cur !== 'EUR' ? ` <span style="color:#888;font-size:var(--text-2xs)">(≈ ${pbFmtMoney(fee / rate, 'EUR')})</span>` : '';
        const ptcStr   = ptc > 0 ? `<div class="text-muted" style="font-size:var(--text-2xs)">${pbFmtMoney(ptc, cur)} PTC</div>` : '';
        return `<div class="text-end">${localStr}${eurEquiv}${ptcStr}</div>`;
      });
    if (multiCurrency) {
      const totPtcStr = totalEurPtc > 0 ? `<div class="text-muted" style="font-size:var(--text-2xs)">+ ${pbFmtMoney(totalEurPtc, 'EUR')} PTC</div>` : '';
      currencyLines.push(`<div class="text-end fw-bold" style="border-top:1px solid #ddd;margin-top:3px;padding-top:3px">TOT ${pbFmtMoney(totalEur, 'EUR')}${totPtcStr}</div>`);
    }
    const totalsHtml = currencyLines.join('') || '<span class="text-muted" style="font-size:var(--text-xs)">—</span>';
    const cardsHtml = cards.length
      ? cards.map(({ cg, v }) => pbBuildCard(cg, v)).join('')
      : `<div class="text-center text-muted py-4" style="font-size:var(--text-sm)">No offers</div>`;
    return { stage, st, cardsHtml, totalsHtml };
  });

  container.innerHTML = stagesData.map(({ stage, st, cardsHtml }) => `
      <div class="pb-column d-flex flex-column" style="border-top:3px solid ${st.border}">
        <div class="pb-col-header d-flex align-items-center gap-2 px-2 py-2 flex-shrink-0"
             style="background:${st.bg};border-bottom:1px solid ${st.border}20">
          <span class="fw-bold" style="font-size:var(--text-md);color:#1a1a2e">${esc(stage)}</span>
          <span class="badge rounded-pill text-white" style="background:${st.badge};font-size:var(--text-xs)">${grouped[stage].length}</span>
        </div>
        <div class="pb-col-body px-2 py-2">${cardsHtml}</div>
      </div>`
  ).join('');

  const totalsBar = document.getElementById('pbTotalsBar');
  if (totalsBar) {
    totalsBar.innerHTML = stagesData.map(({ st, totalsHtml }, i) =>
      `<div class="pb-col-footer px-2 py-2"
            style="flex:1 0 0;min-width:200px;background:${st.bg};
                   border-top:3px solid ${st.border};
                   ${i < PB_STAGES.length - 1 ? `border-right:1px solid ${st.border}40;` : ''}
                   font-size:var(--text-sm)">
         ${totalsHtml}
       </div>`
    ).join('');
  }

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
  const currencyRate = v.currencyRate || 1.0;
  if ((v.phases || []).length) {
    const g = cgComputeGrandTotals(v);
    return { ...g, currencyRate };
  }
  if (typeof getPipelineBudget === 'function') {
    const api = getPipelineBudget(v.versionId);
    if (api) return { fee: api.fee, ptc: api.ptc || 0, hrs: 0, currencyRate: api.currencyRate || currencyRate, _fromApi: true };
  }
  return { fee: 0, ptc: 0, hrs: 0, currencyRate };
}

function pbComputeColumnTotals(cards) {
  const byCurrency = {};
  let totalEur = 0, totalEurPtc = 0;
  cards.forEach(({ v }) => {
    const grand = pbGetBudget(v);
    const cur   = v.currency || 'EUR';
    const rate  = grand.currencyRate || v.currencyRate || 1.0;
    const fee   = isFinite(grand.fee) ? grand.fee : 0;
    const ptc   = isFinite(grand.ptc) ? grand.ptc : 0;
    if (!byCurrency[cur]) byCurrency[cur] = { fee: 0, ptc: 0, rate };
    byCurrency[cur].fee += fee;
    byCurrency[cur].ptc += ptc;
    totalEur    += fee / rate;
    totalEurPtc += ptc / rate;
  });
  return { byCurrency, totalEur, totalEurPtc };
}

function pbBuildCard(cg, v) {
  const isDraft    = v.pipeline === 'Draft';
  const canEdit    = cg.myPermission !== 'viewer';
  const clientName = v.clientId ? getClientName(v.clientId) : '';
  const showClient = clientName && clientName !== 'Unassigned';
  const grand      = pbGetBudget(v);
  const cur        = v.currency || '€';
  const status     = pbGetStatus(v);
  const isLocked   = (v.linkedProjects || []).length > 0;

  const currencyRate = grand.currencyRate || v.currencyRate || 1.0;
  const eurEquivStr  = cur !== 'EUR' && grand.fee > 0
    ? `<div style="font-size:var(--text-2xs);color:#888;margin-top:1px">≈ ${pbFmtMoney(grand.fee / currencyRate, 'EUR')}</div>`
    : '';
  const feeStr   = grand.fee > 0
    ? `<div class="fw-bold" style="font-size:var(--text-base)">${pbFmtMoney(grand.fee, cur)}</div>`
    : '<div class="text-muted" style="font-size:var(--text-sm)">No budget</div>';
  const ptcStr   = grand.ptc > 0
    ? `<div style="font-size:var(--text-2xs);color:var(--text-muted);margin-top:1px">+ ${pbFmtMoney(grand.ptc, cur)} PTC</div>`
    : '';
  const totalStr = feeStr + eurEquivStr + ptcStr;

  const statusBadgeHtml = pipelineBadge(v.pipeline);
  const lockedBadge     = isLocked ? `<span class="badge" style="background:var(--text-muted);color:#fff;font-size:var(--text-2xs)">🔗</span>` : '';
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
          ${canEdit ? `<button class="btn btn-xs btn-outline-secondary pb-card-edit" title="Open in editor">✏️ Edit</button>` : ''}
          ${canEdit ? `<button class="btn btn-xs btn-outline-secondary pb-card-clone" title="Clone proposal">⧉</button>` : ''}
          ${!isDraft ? `<button class="btn btn-xs btn-outline-secondary pb-card-share" title="Share">🔗</button>` : ''}
          ${isDraft && canEdit ? `<button class="btn btn-xs btn-outline-danger pb-card-del" title="Delete proposal">🗑</button>` : ''}
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

  document.removeEventListener('mousedown', _pbOutsideClickHandler);
  setTimeout(() => document.addEventListener('mousedown', _pbOutsideClickHandler), 200);

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
  const cur        = v.currency || 'EUR';
  const fmt        = n => pbFmtMoney(n, cur);
  const isLocked   = _lps.length > 0;
  const stage      = pbGetStage(v);
  const st         = PB_STAGE_STYLE[stage] || PB_STAGE_STYLE.SIP;

  const _liveRateEntry = cur !== 'EUR' ? (window.__currencies || []).find(c => c.code === cur) : null;
  const _liveRate      = _liveRateEntry ? parseFloat(_liveRateEntry.current_rate) : null;
  const _isAdmin       = window.__navUser?.role === 'admin';
  const _rateStale     = _isAdmin && _liveRate != null && Math.abs(_liveRate - (v.currencyRate || 1.0)) > 0.0001;

  // ── LEFT COLUMN: offer info ───────────────────────────────────────────────
  const offerHtml = `
    <div class="mb-3">
      <div class="d-flex align-items-center gap-2 flex-wrap mb-1">
        <span class="badge rounded-pill text-white" style="background:${st.badge};font-size:var(--text-xs)">${esc(stage)}</span>
        ${isLocked ? `<span class="badge" style="background:var(--text-muted);color:#fff;font-size:var(--text-xs)">🔗 Linked project</span>` : ''}
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
        <div class="d-flex align-items-center gap-2 flex-wrap">
          <span>${esc(cur)}${v.currencyRate && cur !== 'EUR' ? ` · 1 € = ${Number(v.currencyRate).toLocaleString('en', {minimumFractionDigits:4,maximumFractionDigits:4})} ${esc(cur)}` : ''}</span>
          ${_rateStale ? `<button id="pbBtnRefreshRate" class="btn btn-outline-warning" style="font-size:var(--text-2xs);padding:1px 6px;line-height:1.4" title="Rate snapshot is outdated — click to update">↺ Refresh rate</button>` : ''}
        </div>
      </div>
      <div class="col-6">
        <div class="text-muted" style="font-size:var(--text-xs)">Professional fees</div>
        <div class="fw-semibold">${grand.fee > 0 ? fmt(grand.fee) : '—'}</div>
        ${cur !== 'EUR' && grand.fee > 0 ? `<div class="text-muted" style="font-size:var(--text-2xs)">≈ ${pbFmtMoney(grand.fee / (v.currencyRate || 1), 'EUR')}</div>` : ''}
      </div>
      <div class="col-6">
        <div class="text-muted" style="font-size:var(--text-xs)">PTC</div>
        <div class="fw-semibold">${grand.ptc > 0 ? fmt(grand.ptc) : '—'}</div>
      </div>
      <div class="col-12">
        <div class="text-muted" style="font-size:var(--text-xs)">Total budget</div>
        <div class="fw-bold" style="font-size:var(--text-xl)">${(grand.fee + grand.ptc) > 0 ? fmt(grand.fee + grand.ptc) : '—'}</div>
        ${cur !== 'EUR' && (grand.fee + grand.ptc) > 0 ? `<div class="text-muted" style="font-size:var(--text-sm)">≈ ${pbFmtMoney((grand.fee + grand.ptc) / (v.currencyRate || 1), 'EUR')}</div>` : ''}
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
      const pcode      = proj?.code || '';
      const pname      = lp.projectName || proj?.name || lp.projectId;
      const pipeline   = getProjectPipeline(navId) || proj?.pipeline || '';
      const projStatus = proj?.status || '';
      const taskNames  = lp.taskNames || [];
      const taskListHtml = taskNames.length
        ? `<div style="font-size:var(--text-xs);color:var(--text-muted);margin-top:5px"><span style="font-weight:600">Tasks:</span> ${taskNames.map(n => esc(n)).join(', ')}</div>`
        : '';
      // Check data against the resolved navId
      const hasData    = timesheetData.some(r => r.projectId === navId);
      return `
        <div class="p-2 mb-2 rounded border" style="font-size:var(--text-sm);background:var(--surface-light)">
          <div class="d-flex align-items-start justify-content-between gap-2">
            <div class="flex-grow-1 min-width-0">
              <div class="fw-semibold">${esc(pname)}</div>
              ${pcode ? `<div style="font-size:var(--text-xs);color:var(--text-muted);font-family:'SFMono-Regular',monospace">${esc(pcode)}</div>` : ''}
              <div class="d-flex gap-1 flex-wrap mt-1">
                ${pipeline ? pipelineBadge(pipeline) : ''}
                ${statusBadgeLarge(projStatus)}
              </div>
              ${taskListHtml}
            </div>
            <div class="d-flex gap-1 flex-shrink-0 flex-wrap">
              <button class="btn btn-xs btn-outline-secondary"
                onclick="pbGoToPortfolio('${esc(navId)}')">📊 Portfolio</button>
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
            <span class="fw-semibold" style="white-space:nowrap;min-width:80px;text-align:right">${tt.totalCostAndFee > 0 ? fmt(tt.totalCostAndFee) : '—'}</span>
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

  // Wire refresh rate button (admin only, shown only when rate is stale)
  const refreshBtn = document.getElementById('pbBtnRefreshRate');
  if (refreshBtn && _liveRate != null) {
    refreshBtn.addEventListener('click', () => {
      const snapStr = Number(v.currencyRate || 1).toLocaleString('en', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
      const liveStr = Number(_liveRate).toLocaleString('en', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

      const modalId = 'pbRefreshRateModal';
      let modalEl = document.getElementById(modalId);
      if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = modalId;
        modalEl.className = 'modal fade';
        modalEl.tabIndex = -1;
        modalEl.innerHTML = `
          <div class="modal-dialog modal-dialog-centered" style="max-width:420px">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title" style="font-size:var(--text-base)">Update exchange rate</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body" id="${modalId}Body"></div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-warning btn-sm" id="${modalId}Confirm">↺ Update rate</button>
              </div>
            </div>
          </div>`;
        document.body.appendChild(modalEl);
      }

      document.getElementById(`${modalId}Body`).innerHTML = `
        <p style="font-size:var(--text-sm)">The exchange rate snapshot on this proposal will be updated to the latest rate.</p>
        <table class="table table-sm mb-2">
          <tbody>
            <tr>
              <td class="text-muted" style="font-size:var(--text-xs)">Current snapshot</td>
              <td class="fw-semibold">1 € = ${esc(snapStr)} ${esc(cur)}</td>
            </tr>
            <tr>
              <td class="text-muted" style="font-size:var(--text-xs)">Latest rate</td>
              <td class="fw-bold text-warning">1 € = ${esc(liveStr)} ${esc(cur)}</td>
            </tr>
          </tbody>
        </table>
        <p class="text-muted mb-0" style="font-size:var(--text-xs)">Budget amounts remain in ${esc(cur)}. Only the EUR equivalent display will change.</p>`;

      const bsModal = new bootstrap.Modal(modalEl);
      bsModal.show();

      document.getElementById(`${modalId}Confirm`).onclick = async () => {
        bsModal.hide();
        try {
          await Api.costGrids.versions.refreshRate(cgId, verId);
          await cgSyncFromApi();
          await loadPipelineBudgetsFromApi();
          renderPipelineBoard();
          await pbOpenDetailPanel(cgId, verId);
        } catch (e) {
          alert('Failed to refresh rate: ' + e.message);
        }
      };
    });
  }

  pbLoadPotSection(v, stage);

  // ── Action buttons ────────────────────────────────────────────────────────
  const cgForPerm  = cgLoad(cgId);
  const canEditCg  = cgForPerm?.myPermission !== 'viewer';

  const openCgBtn = document.getElementById('pbBtnOpenCg');
  if (openCgBtn) {
    openCgBtn.style.display = canEditCg ? '' : 'none';
    openCgBtn.onclick = () => {
      pbCloseDetailPanel();
      showCostGridEditorView(cgId, v.versionId);
    };
  }

  const shareBtn = document.getElementById('pbBtnShareCg');
  if (shareBtn) {
    shareBtn.style.display = stage === 'Draft' ? 'none' : '';
    shareBtn.onclick = () => {
      const cg = cgLoad(cgId);
      if (cg && typeof openShareModal === 'function') openShareModal('cost_grid', cgId, cg.name);
    };
  }

  const deleteVerBtn = document.getElementById('pbBtnDeleteVersion');
  if (deleteVerBtn) {
    deleteVerBtn.style.display = (stage === 'Draft' && canEditCg) ? '' : 'none';
    deleteVerBtn.onclick = () => {
      cgConfirmDeleteVersion(cgId, v.versionId, v.versionLabel, () => {
        pbCloseDetailPanel();
        renderPipelineBoard();
      });
    };
  }

  const cloneBtn = document.getElementById('pbBtnCloneCg');
  if (cloneBtn) {
    cloneBtn.style.display = canEditCg ? '' : 'none';
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

  // Resolve clientId: prefer linked project, fall back to version's own clientId
  let clientId = null;
  for (const lp of (v.linkedProjects || [])) {
    const proj = (config.projects || []).find(p => p.id === lp.projectId);
    if (proj?.clientId) { clientId = proj.clientId; break; }
  }
  if (!clientId) clientId = v.clientId || null;
  if (!clientId) { el.innerHTML = ''; return; }

  // Check if client belongs to a group
  const group = _pbClientGroups.find(g => (g.clients || []).some(c => c.id === clientId));
  const params = group ? { year, clientGroupId: group.id } : { year, clientId };
  const targetName = group ? group.name : getClientName(clientId);

  el.innerHTML = `<div style="border-top:1px solid var(--border-light);padding-top:10px;margin-top:4px">
    <div class="text-muted" style="font-size:var(--text-xs)">Loading POT...</div>
  </div>`;

  try {
    const { pot, proposals, committed_total, anticipated_total } = await Api.pots.summary(params);

    if (!pot) {
      el.innerHTML = `<div style="border-top:1px solid var(--border-light);padding-top:10px;margin-top:4px">
        <div class="text-muted" style="font-size:var(--text-xs)">No POT target for <strong>${esc(targetName)}</strong> in ${year}.</div>
      </div>`;
      return;
    }

    // Totals come from the server and include ALL proposals regardless of caller visibility
    const committedTotal   = parseFloat(committed_total   || 0);
    const anticipatedTotal = parseFloat(anticipated_total || 0);
    const totalBudget      = committedTotal + anticipatedTotal;

    const pct    = pot.amount > 0 ? Math.min(100, Math.round(totalBudget    / pot.amount * 100)) : 0;
    const pctC   = pot.amount > 0 ? Math.min(100, Math.round(committedTotal / pot.amount * 100)) : 0;
    const pctA   = Math.min(pct - pctC, 100 - pctC);
    const fmtM   = n => '€ ' + Number(n).toLocaleString('en', { maximumFractionDigits: 0 });
    const totColor = pct >= 100 ? '#198754' : pct >= 75 ? '#fd7e14' : '#0d6efd';
    const nContrib = proposals.filter(p => p.pipeline === 'Committed' || p.pipeline === 'Anticipated').length;

    el.innerHTML = `
      <div style="border-top:1px solid var(--border-light);padding-top:10px;margin-top:4px">
        <div class="d-flex align-items-center justify-content-between mb-1">
          <span class="fw-semibold" style="font-size:var(--text-sm)">🎯 POT — ${esc(targetName)} ${year}</span>
          <span style="font-size:var(--text-xs);color:${totColor};font-weight:700">${pct}% total</span>
        </div>
        <div style="height:8px;background:#e9ecef;border-radius:3px;overflow:hidden;margin-bottom:6px;display:flex">
          <div style="height:100%;width:${pctC}%;background:#198754"></div>
          <div style="height:100%;width:${pctA}%;background:#fd7e14;opacity:.75"></div>
        </div>
        <div style="font-size:var(--text-xs);color:var(--text-muted);display:flex;flex-direction:column;gap:3px">
          <div class="d-flex justify-content-between">
            <span>Total (C+A): <strong style="color:${totColor}">${fmtM(totalBudget)}</strong></span>
            <span>Target: <strong style="color:#1a1a2e">${fmtM(pot.amount)}</strong></span>
          </div>
          <div style="padding-left:8px;border-left:3px solid #198754">
            Committed: <strong style="color:#198754">${fmtM(committedTotal)}</strong> <span style="color:#888">(${pctC}%)</span>
          </div>
          ${anticipatedTotal > 0 ? `<div style="padding-left:8px;border-left:3px solid #fd7e14">
            Anticipated: <strong style="color:#fd7e14">+ ${fmtM(anticipatedTotal)}</strong> <span style="color:#888">(${pctA}%)</span>
          </div>` : ''}
        </div>
        ${nContrib > 1 ? `<div class="text-muted mt-1" style="font-size:var(--text-2xs)">${nContrib} proposals contribute to this POT</div>` : ''}
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
  document.removeEventListener('mousedown', _pbOutsideClickHandler);
}

function _pbOutsideClickHandler(e) {
  const panel = document.getElementById('pbDetailPanel');
  if (panel && !panel.contains(e.target)) pbCloseDetailPanel();
}

function pbGoToPortfolio(projectId) {
  window.location.href = '/portfolio.html?projectId=' + encodeURIComponent(projectId);
}

function pbGoToConfigure(projectId) {
  window.location.href = '/project-config.html?projectId=' + encodeURIComponent(projectId);
}
