// ── PIPELINE BOARD ───────────────────────────────────────────────────────────
// Finance view: all cost grids organised by deal pipeline stage.
// Columns: SIP → Expected → Anticipated → Committed → Canceled
// Each column scrolls vertically; totals per currency are sticky at the bottom.

const PB_STAGES = ['SIP', 'Expected', 'Anticipated', 'Committed', 'Canceled'];

const PB_STAGE_STYLE = {
  SIP:         { bg: 'var(--pipeline-sip-bg)',          border: 'var(--pipeline-sip-color)',          badge: 'var(--pipeline-sip-color)'          },
  Expected:    { bg: 'var(--pipeline-expected-bg)',     border: 'var(--pipeline-expected-color)',     badge: 'var(--pipeline-expected-color)'     },
  Anticipated: { bg: 'var(--pipeline-anticipated-bg)', border: 'var(--pipeline-anticipated-color)', badge: 'var(--pipeline-anticipated-color)' },
  Committed:   { bg: 'var(--pipeline-committed-bg)',   border: 'var(--pipeline-committed-color)',   badge: 'var(--pipeline-committed-color)'   },
  Canceled:    { bg: 'var(--pipeline-canceled-bg)',    border: 'var(--pipeline-canceled-color)',    badge: 'var(--pipeline-canceled-color)'    },
};

let _pbActiveCgId  = null;
let _pbActiveVerid = null;

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

function pbGetDisplayVersion(cg) {
  const withLinks = cg.versions.filter(v => (v.linkedProjects || []).length > 0);
  if (withLinks.length) {
    return withLinks.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  }
  return cg.versions.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
    || cg.versions[cg.versions.length - 1];
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
  return (cur || '€') + ' ' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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

  // Collect all CGs with their display version
  const index = cgGetIndex();
  const items = index
    .map(cgId => {
      const cg = cgLoad(cgId);
      if (!cg || !cg.versions?.length) return null;
      const v = pbGetDisplayVersion(cg);
      return { cg, v };
    })
    .filter(Boolean);

  // Group by stage
  const grouped = {};
  PB_STAGES.forEach(s => { grouped[s] = []; });
  items.forEach(({ cg, v }) => {
    const stage = pbGetStage(v);
    if (grouped[stage]) grouped[stage].push({ cg, v });
    else grouped['SIP'].push({ cg, v });
  });

  container.innerHTML = PB_STAGES.map(stage => {
    const cards    = grouped[stage];
    const st       = PB_STAGE_STYLE[stage];
    const totals   = pbComputeColumnTotals(cards);
    const totalsHtml = Object.entries(totals)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cur, { fee, ptc }]) =>
        `<div class="d-flex justify-content-between align-items-baseline gap-2">
           <span class="text-muted" style="font-size:var(--text-xs)">${esc(cur)}</span>
           <div class="text-end">
             <div class="fw-bold" style="font-size:var(--text-base)">${pbFmtMoney(fee + ptc, cur)}</div>
             ${ptc > 0 ? `<div class="text-muted" style="font-size:var(--text-2xs)">${pbFmtMoney(fee, cur)} fees + ${pbFmtMoney(ptc, cur)} PTC</div>` : ''}
           </div>
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

    // Delete button → confirm and delete entire costgrid
    card.querySelector('.pb-card-del')?.addEventListener('click', e => {
      e.stopPropagation();
      const cg = cgLoad(cgId);
      if (cg) cgConfirmDeleteGrid(cgId, cg.name);
    });
  });
}

function pbComputeColumnTotals(cards) {
  const totals = {};
  cards.forEach(({ v }) => {
    const grand = cgComputeGrandTotals(v);
    const cur   = v.currency || '€';
    if (!totals[cur]) totals[cur] = { fee: 0, ptc: 0 };
    totals[cur].fee += grand.fee;
    totals[cur].ptc += grand.ptc;
  });
  return totals;
}

function pbBuildCard(cg, v) {
  const clientName = v.clientId ? getClientName(v.clientId) : '';
  const showClient = clientName && clientName !== 'Unassigned';
  const grand      = cgComputeGrandTotals(v);
  const cur        = v.currency || '€';
  const status     = pbGetStatus(v);
  const isLocked   = (v.linkedProjects || []).length > 0;

  const feeStr   = grand.fee > 0 ? pbFmtMoney(grand.fee, cur) : '—';
  const ptcStr   = grand.ptc > 0 ? `<span class="text-muted" style="font-size:var(--text-2xs)"> + ${pbFmtMoney(grand.ptc, cur)} PTC</span>` : '';
  const totalStr = (grand.fee + grand.ptc) > 0
    ? `<div class="fw-bold" style="font-size:var(--text-base)">${pbFmtMoney(grand.fee + grand.ptc, cur)}${ptcStr}</div>`
    : '<div class="text-muted" style="font-size:var(--text-sm)">No budget</div>';

  const statusBadgeHtml = status ? statusBadge(status) : '';
  const lockedBadge     = isLocked ? `<span class="badge" style="background:var(--text-muted);color:#fff;font-size:var(--text-2xs)">🔒</span>` : '';

  return `
    <div class="pb-card mb-2 p-2 rounded border" data-pb-cgid="${esc(cg.id)}" data-pb-verid="${esc(v.versionId)}"
         style="cursor:pointer;background:#fff;transition:box-shadow .15s"
         onmouseenter="this.style.boxShadow='0 2px 8px rgba(0,0,0,.13)'"
         onmouseleave="this.style.boxShadow=''">
      <!-- Client name -->
      ${showClient ? `<div class="text-muted" style="font-size:var(--text-xs);margin-bottom:1px">${esc(clientName)}</div>` : ''}
      <!-- Project name + lock badge -->
      <div class="d-flex align-items-start justify-content-between gap-1 mb-1">
        <span class="fw-semibold" style="font-size:var(--text-base);line-height:1.3">${esc(v.projectName || cg.name)}</span>
        ${lockedBadge}
      </div>
      <!-- Budget -->
      ${totalStr}
      <!-- Status + version + date -->
      <div class="d-flex align-items-center gap-1 flex-wrap mt-1">
        ${statusBadgeHtml}
        <span class="text-muted" style="font-size:var(--text-2xs)">${esc(v.versionLabel || '')}</span>
      </div>
      <div class="d-flex justify-content-between align-items-center mt-2 pt-1" style="border-top:1px solid var(--border-light)">
        <span style="font-size:var(--text-2xs);color:#999">${pbFmtDate(v.createdAt)}</span>
        <div class="d-flex gap-1">
          <button class="btn btn-xs btn-outline-secondary pb-card-edit" title="Open in editor">✏️ Edit</button>
          <button class="btn btn-xs btn-outline-danger pb-card-del" title="Delete cost grid">🗑</button>
        </div>
      </div>
    </div>`;
}

// ── DETAIL PANEL ──────────────────────────────────────────────────────────────

function pbOpenDetailPanel(cgId, verId) {
  _pbActiveCgId  = cgId;
  _pbActiveVerid = verId;

  const cg = cgLoad(cgId);
  if (!cg) return;
  const v = cg.versions.find(ver => ver.versionId === verId) || pbGetDisplayVersion(cg);

  const panel   = document.getElementById('pbDetailPanel');
  const content = document.getElementById('pbDetailContent');
  if (!panel || !content) return;

  const clientName = v.clientId ? getClientName(v.clientId) : '';
  const showClient = clientName && clientName !== 'Unassigned';
  const grand      = cgComputeGrandTotals(v);
  const cur        = v.currency || '€';
  const fmt        = n => pbFmtMoney(n, cur);
  const isLocked   = (v.linkedProjects || []).length > 0;
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
  const lps = v.linkedProjects || [];
  // Pre-collect projects for this version via costGridRef (for name-based fallback)
  const projsByRef = (config.projects || []).filter(p =>
    p.costGridRef?.cgId === cgId && p.costGridRef?.versionId === v.versionId
  );

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
            ${hasData
              ? `<button class="btn btn-xs btn-outline-primary flex-shrink-0"
                   onclick="pbGoToReporting('${esc(navId)}')">📊 Reporting</button>`
              : ''}
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
          task.startDate ? task.startDate.slice(0,4)+'/'+task.startDate.slice(4,6) : null,
          task.endDate   ? task.endDate.slice(0,4)+'/'+task.endDate.slice(4,6)     : null,
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

  // ── Two-column layout ─────────────────────────────────────────────────────
  content.innerHTML = `
    <div style="width:50%;padding:20px 18px;overflow-y:auto;border-right:1px solid var(--border-light)">
      ${offerHtml}
      <hr style="border-color:var(--border-light);margin:16px 0">
      ${linkedHtml}
    </div>
    <div style="flex:1;padding:20px 18px;overflow-y:auto">
      ${taskHtml}
    </div>`;

  // ── Action buttons ────────────────────────────────────────────────────────
  document.getElementById('pbBtnOpenCg').onclick = () => {
    pbCloseDetailPanel();
    showCostGridEditorView(cgId, v.versionId);
  };

  document.getElementById('pbBtnJsonCg').onclick = () => {
    const cg = cgLoad(cgId);
    if (!cg) return;
    openJsonViewer(
      `Cost Grid — ${cg.name}`, cg,
      imported => { cgSave(imported); renderPipelineBoard(); },
      `costgrid_${cg.name.replace(/[^a-z0-9]/gi, '_')}.json`
    );
  };

  panel.style.display = 'flex';
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
