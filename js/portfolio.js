// ── PORTFOLIO VIEW ───────────────────────────────────────────────────────────

// Tracks which program groups have their project list expanded (by program id).
// Default is collapsed — a program appears open only if its id is in this set.
const _expandedPrograms = new Set();
let _portfolioSort         = 'name';   // 'name' | 'client'
let _portfolioClientFilter = '';       // '' = all, else clientId

function fmtProjectTitle(cfg) {
  const client = getClientName(cfg.clientId);
  const name   = cfg.name || cfg.id;
  return client && client !== 'Unassigned' ? `${client} — ${name}` : name;
}

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

// ── SUMMARY BLOCK (global, pinned projects) ───────────────────────────────────

function renderPortfolioSummary() {
  const selectedCfgs = (config.projects || []).filter(p => p.id && portfolioSummaryProjects.has(p.id));

  const monthSet = new Set();
  selectedCfgs.forEach(cfg => getMonthRangeFromCfg(cfg).forEach(ym => monthSet.add(ym)));
  const months = [...monthSet].sort();

  const wrap = document.createElement('div');
  wrap.id = 'portfolioSummaryBlock';

  if (!selectedCfgs.length) {
    return null;
  }

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
  const ym2lbl = ym => new Date(parseInt(ym.slice(0,4)), parseInt(ym.slice(4,6))-1, 1)
    .toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  const varColor = v => v > 0 ? 'var(--color-success)' : v < 0 ? 'var(--color-danger)' : 'var(--text-muted)';
  const fmtV = v => `${v >= 0 ? '+' : ''}${fmtMoney(v)}`;

  const thCells    = months.map(ym => `<th class="text-end" style="min-width:90px;white-space:nowrap">${ym2lbl(ym)}</th>`).join('');
  const estCells   = months.map(ym => `<td class="text-end">${fmtMoney(sumPhasing[ym])}</td>`).join('');
  const spentCells = months.map(ym => `<td class="text-end">${fmtMoney(sumSpent[ym])}</td>`).join('');
  const varCells   = months.map(ym => {
    const v = sumPhasing[ym] - sumSpent[ym];
    return `<td class="text-end fw-semibold" style="color:${varColor(v)}">${fmtV(v)}</td>`;
  }).join('');
  const projectList = selectedCfgs.map(c =>
    `<span class="badge" style="background:#e9ecef;color:#495057;font-weight:500">${esc(fmtProjectTitle(c))}</span>`
  ).join(' ');

  wrap.innerHTML = `
    <div class="section-card mb-4" style="border:2px solid var(--indigo-500)">
      <div class="section-header d-flex justify-content-between align-items-center flex-wrap gap-2" style="background:var(--indigo-50)">
        <div class="d-flex align-items-center gap-2 flex-wrap">
          <span class="fw-bold">📊 Budget Summary</span>
          <span class="small text-muted">${selectedCfgs.length} project${selectedCfgs.length===1?'':'s'}:</span>
          ${projectList}
        </div>
      </div>
      <div class="table-responsive p-2">
        <table class="table table-sm align-middle mb-0" style="font-size:var(--text-base)">
          <thead style="background:var(--indigo-50)">
            <tr><th style="min-width:140px"></th>${thCells}<th class="text-end fw-bold" style="min-width:100px;background:#e0e3f5">Total</th></tr>
          </thead>
          <tbody>
            <tr style="background:var(--surface-light)"><td class="fw-semibold ps-2">Budget Estimated</td>${estCells}<td class="text-end fw-bold" style="background:#f0f0f0">${fmtMoney(grandEst)}</td></tr>
            <tr><td class="fw-semibold ps-2">Budget Spent</td>${spentCells}<td class="text-end fw-bold" style="background:#f0f0f0">${fmtMoney(grandSpent)}</td></tr>
            <tr><td class="fw-semibold ps-2">Variance</td>${varCells}<td class="text-end fw-bold" style="background:#f0f0f0;color:${varColor(grandVar)}">${fmtV(grandVar)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>`;
  return wrap;
}

// ── PROJECT CARD ──────────────────────────────────────────────────────────────

function buildProjectCard(cfg, { showSummaryBtn = true } = {}) {
  const data    = timesheetData.filter(r => r.projectId === cfg.id);
  const months  = getMonthRangeFromCfg(cfg);
  if (!months.length) return null;

  const monthSpend = {};
  data.forEach(r => {
    if (!r.date) return;
    const ym = `${r.date.getFullYear()}${String(r.date.getMonth() + 1).padStart(2, '0')}`;
    monthSpend[ym] = (monthSpend[ym] || 0) + r.hours * (findRate(r, cfg) ?? 0);
  });

  const hasData    = data.length > 0;
  const hasPhasing = cfg.phasing && Object.keys(cfg.phasing).length > 0;

  const totalPtc    = (cfg.ptc||[]).reduce((s,p) => s+(p.amount||0),0);
  const ptcByMonth  = {};
  (cfg.ptc||[]).forEach(p => { if (p.month) ptcByMonth[p.month] = (ptcByMonth[p.month]||0) + (p.amount||0); });

  const ym2lbl = ym => new Date(parseInt(ym.slice(0,4)), parseInt(ym.slice(4,6))-1, 1)
    .toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  const varColor = v => v > 0 ? 'var(--color-success)' : v < 0 ? 'var(--color-danger)' : 'var(--text-muted)';

  const totalColLabel = totalPtc > 0 ? 'Total Fee' : 'Total';
  const thCells = months.map(ym => `<th class="text-end" style="min-width:90px;white-space:nowrap">${ym2lbl(ym)}</th>`).join('') +
    `<th class="text-end" style="min-width:90px;background:#e9ecef">${totalColLabel}</th>` +
    (totalPtc > 0 ? '<th class="text-end" style="min-width:90px;background:var(--color-warning-bg);white-space:nowrap">PTC</th>' : '');

  const totalSpent   = months.reduce((s, ym) => s + (monthSpend[ym] || 0), 0);
  const totalPhasing = months.reduce((s, ym) => s + (cfg.phasing?.[ym] || 0), 0);
  const totalVar     = totalPhasing - totalSpent;

  const ptcTotalCell = totalPtc > 0 ? `<td class="text-end fw-bold" style="background:var(--color-warning-bg)">${fmtMoney(totalPtc)}</td>` : '';

  const estCells = months.map(ym => {
    const fee = cfg.phasing?.[ym] || 0;
    const ptc = ptcByMonth[ym] || 0;
    const feeLine = hasPhasing ? fmtMoney(fee) : '—';
    const ptcLine = (totalPtc > 0 && ptc > 0)
      ? `<div class="text-muted" style="font-size:.75em;line-height:1.2">PTC: ${fmtMoney(ptc)}</div>` : '';
    return `<td class="text-end">${feeLine}${ptcLine}</td>`;
  }).join('') +
    `<td class="text-end fw-bold" style="background:#f0f0f0">${hasPhasing ? fmtMoney(totalPhasing) : '—'}</td>` +
    ptcTotalCell;

  const spentCells = months.map(ym => `<td class="text-end">${hasData ? fmtMoney(monthSpend[ym]||0) : '—'}</td>`).join('') +
    `<td class="text-end fw-bold" style="background:#f0f0f0">${hasData ? fmtMoney(totalSpent) : '—'}</td>` +
    (totalPtc > 0 ? '<td class="text-end text-muted" style="background:var(--color-warning-bg)">—</td>' : '');
  const varCells = months.map(ym => {
    if (!hasData || !hasPhasing) return '<td class="text-end text-muted">—</td>';
    const v = (cfg.phasing?.[ym]||0) - (monthSpend[ym]||0);
    return `<td class="text-end" style="color:${varColor(v)};font-weight:600">${v>=0?'+':''}${fmtMoney(v)}</td>`;
  }).join('');
  const varTotal = (!hasData || !hasPhasing)
    ? '<td class="text-end fw-bold" style="background:#f0f0f0">—</td>'
    : `<td class="text-end fw-bold" style="background:#f0f0f0;color:${varColor(totalVar)}">${totalVar>=0?'+':''}${fmtMoney(totalVar)}</td>`;

  const totalHours  = (cfg.tasks||[]).reduce((s,t) => s+(t.resources||[]).reduce((rs,r) => rs+(r.soldHours||0),0),0);
  const totalBudget = (cfg.tasks||[]).reduce((s,t) => s+(t.resources||[]).reduce((rs,r) => rs+(r.soldHours||0)*(r.hourlyRate||0),0),0);
  const grandTotal  = totalBudget + totalPtc;

  // Fall back to cost-grid budget from the reporting API when project tasks are unconfigured.
  const cgRef = cfg.costGridRef;
  const apiBudget = (typeof getPipelineBudget === 'function' && cgRef?.versionId)
    ? getPipelineBudget(cgRef.versionId) : null;
  const displayFee   = totalBudget > 0 ? totalBudget   : (apiBudget?.fee   || 0);
  const displayHours = totalHours  > 0 ? totalHours    : 0;
  const displayTotal = displayFee + totalPtc;
  const budgetBadge = displayFee > 0 || displayHours > 0
    ? `<span class="portfolio-budget-badge">${displayHours > 0 ? displayHours.toLocaleString('en-US') + ' h &nbsp;/&nbsp; ' : ''}${fmtMoney(displayTotal)}${totalPtc > 0 ? `<span class="text-muted" style="font-size:.8em;font-weight:400"> &nbsp;(${fmtMoney(displayFee)} fees + ${fmtMoney(totalPtc)} PTC)</span>` : ''}${apiBudget && totalBudget === 0 ? '<span class="text-muted" style="font-size:.75em;margin-left:4px">(from cost grid)</span>' : ''}</span>`
    : '';

  const summaryBtnHtml = showSummaryBtn ? `
    <button class="btn btn-sm ${portfolioSummaryProjects.has(cfg.id) ? 'btn-success' : 'btn-outline-secondary'} summary-toggle-btn">
      ${portfolioSummaryProjects.has(cfg.id) ? '✓ Summary' : '＋ Summary'}
    </button>` : '';

  const card = document.createElement('div');
  card.className = 'section-card mb-4';
  card.innerHTML = `
    <div class="section-header d-flex justify-content-between align-items-center flex-wrap gap-2">
      <div class="d-flex align-items-center gap-2 flex-wrap">
        <span>📁 ${esc(fmtProjectTitle(cfg))}</span>
        ${cfg.code ? `<span class="text-muted small">${esc(cfg.code)}</span>` : ''}
        ${pipelineBadge(getProjectPipeline(cfg.id) || cfg.pipeline)}
        ${statusBadgeLarge(cfg.status)}
        ${!hasData ? '<span class="badge bg-warning text-dark">no XLS data</span>' : ''}
        ${budgetBadge}
      </div>
      <div class="d-flex gap-2 flex-wrap">
        ${cfg.my_permission !== 'viewer' ? '<button class="btn btn-sm btn-outline-secondary cfg-project-btn">⚙️ Configure</button>' : ''}
        <button class="btn btn-sm btn-outline-secondary portfolio-share-btn" title="Share project">🔗 Share</button>
        ${cfg.my_permission !== 'viewer' ? '<button class="btn btn-sm btn-outline-secondary load-actuals-btn" title="Upload XLS actuals for this project">📂 Load Actuals</button>' : ''}
        <button class="btn btn-sm btn-outline-secondary portfolio-planning-btn">📅 Planning</button>
        <button class="btn btn-sm ${hasData ? 'btn-primary' : 'btn-outline-secondary'} view-report-btn"
                ${!hasData ? 'disabled' : ''}>📊 View Report →</button>
        ${summaryBtnHtml}
      </div>
    </div>
    <div class="table-responsive p-2">
      <table class="table table-sm align-middle mb-0" style="font-size:var(--text-base)">
        <thead style="background:var(--indigo-50)">
          <tr><th style="min-width:110px"></th>${thCells}</tr>
        </thead>
        <tbody>
          <tr style="background:var(--surface-light)"><td class="fw-semibold ps-2">Budget Estimated</td>${estCells}</tr>
          <tr><td class="fw-semibold ps-2">Budget Spent</td>${spentCells}</tr>
          <tr><td class="fw-semibold ps-2">Variance</td>${varCells}${varTotal}${totalPtc > 0 ? '<td class="text-end text-muted" style="background:var(--color-warning-bg)">—</td>' : ''}</tr>
        </tbody>
      </table>
    </div>`;

  card.querySelector('.cfg-project-btn')?.addEventListener('click', () => {
    window.location.href = '/project-config.html?projectId=' + encodeURIComponent(cfg.id);
  });
  card.querySelector('.view-report-btn').addEventListener('click', () => showDashboardView(cfg.id));
  card.querySelector('.portfolio-share-btn').addEventListener('click', () => {
    if (typeof openShareModal === 'function') openShareModal('project', cfg.id, cfg.name || cfg.id);
  });
  card.querySelector('.load-actuals-btn')?.addEventListener('click', () => {
    if (typeof window.triggerLoadActuals === 'function') window.triggerLoadActuals(cfg.id);
  });
  card.querySelector('.portfolio-planning-btn').addEventListener('click', () => {
    portfolioProjectFilters.clear();
    portfolioProjectFilters.add(cfg.id);
    portfolioPlanningView = 'byproject';
    document.querySelectorAll('#ppViewToggle [data-ppview]').forEach(b =>
      b.classList.toggle('active', b.dataset.ppview === 'byproject'));
    showPortfolioPlanningView();
  });
  if (showSummaryBtn) {
    card.querySelector('.summary-toggle-btn')?.addEventListener('click', () => {
      if (portfolioSummaryProjects.has(cfg.id)) portfolioSummaryProjects.delete(cfg.id);
      else portfolioSummaryProjects.add(cfg.id);
      saveSummarySelection();
      renderPortfolioView();
    });
  }
  return card;
}

// ── PROGRAM SUMMARY TABLE ─────────────────────────────────────────────────────

function buildProgramSummary(cfgs) {
  const monthSet = new Set();
  cfgs.forEach(cfg => getMonthRangeFromCfg(cfg).forEach(ym => monthSet.add(ym)));
  const months = [...monthSet].sort();
  if (!months.length) return '';

  const sumPhasing = {}, sumSpent = {};
  months.forEach(ym => { sumPhasing[ym] = 0; sumSpent[ym] = 0; });
  cfgs.forEach(cfg => {
    months.forEach(ym => { sumPhasing[ym] += cfg.phasing?.[ym] || 0; });
    timesheetData.filter(r => r.projectId === cfg.id).forEach(r => {
      if (!r.date) return;
      const ym = `${r.date.getFullYear()}${String(r.date.getMonth()+1).padStart(2,'0')}`;
      if (sumSpent[ym] !== undefined) sumSpent[ym] += r.hours * (findRate(r, cfg) ?? 0);
    });
  });

  // Aggregate PTC across all child projects
  const totalPtc  = cfgs.reduce((s, cfg) => s + (cfg.ptc||[]).reduce((a, p) => a + (p.amount||0), 0), 0);
  const ptcByMonth = {};
  cfgs.forEach(cfg => (cfg.ptc||[]).forEach(p => {
    if (p.month) ptcByMonth[p.month] = (ptcByMonth[p.month]||0) + (p.amount||0);
  }));

  const grandEst   = months.reduce((s, ym) => s + sumPhasing[ym], 0);
  const grandSpent = months.reduce((s, ym) => s + sumSpent[ym],   0);
  const grandVar   = grandEst - grandSpent;
  const ym2lbl = ym => new Date(parseInt(ym.slice(0,4)), parseInt(ym.slice(4,6))-1, 1)
    .toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  const varColor = v => v > 0 ? 'var(--color-success)' : v < 0 ? 'var(--color-danger)' : 'var(--text-muted)';
  const fmtV = v => `${v >= 0 ? '+' : ''}${fmtMoney(v)}`;

  const ptcTh = totalPtc > 0 ? '<th class="text-end fw-bold" style="min-width:90px;background:var(--color-warning-bg);white-space:nowrap">PTC</th>' : '';

  const thCells    = months.map(ym => `<th class="text-end" style="min-width:90px;white-space:nowrap">${ym2lbl(ym)}</th>`).join('') +
    `<th class="text-end fw-bold" style="min-width:100px;background:#ddd8f5">${totalPtc > 0 ? 'Total Fee' : 'Total'}</th>` + ptcTh;

  const estCells = months.map(ym => {
    const ptc = ptcByMonth[ym] || 0;
    const ptcLine = (totalPtc > 0 && ptc > 0) ? `<div class="text-muted" style="font-size:.75em;line-height:1.2">PTC: ${fmtMoney(ptc)}</div>` : '';
    return `<td class="text-end">${fmtMoney(sumPhasing[ym])}${ptcLine}</td>`;
  }).join('') +
    `<td class="text-end fw-bold" style="background:#f0eeff">${fmtMoney(grandEst)}</td>` +
    (totalPtc > 0 ? `<td class="text-end fw-bold" style="background:var(--color-warning-bg)">${fmtMoney(totalPtc)}</td>` : '');

  const spentCells = months.map(ym => `<td class="text-end">${fmtMoney(sumSpent[ym])}</td>`).join('') +
    `<td class="text-end fw-bold" style="background:#f0eeff">${fmtMoney(grandSpent)}</td>` +
    (totalPtc > 0 ? '<td class="text-end text-muted" style="background:var(--color-warning-bg)">—</td>' : '');

  const varCells = months.map(ym => {
    const v = sumPhasing[ym] - sumSpent[ym];
    return `<td class="text-end fw-semibold" style="color:${varColor(v)}">${fmtV(v)}</td>`;
  }).join('') +
    `<td class="text-end fw-bold" style="background:#f0eeff;color:${varColor(grandVar)}">${fmtV(grandVar)}</td>` +
    (totalPtc > 0 ? '<td class="text-end text-muted" style="background:var(--color-warning-bg)">—</td>' : '');

  return `
    <div class="table-responsive px-3 pb-2" style="background:var(--violet-50)">
      <table class="table table-sm align-middle mb-0" style="font-size:var(--text-base)">
        <thead style="background:#ede8ff">
          <tr><th style="min-width:140px"></th>${thCells}</tr>
        </thead>
        <tbody>
          <tr style="background:#faf8ff"><td class="fw-semibold ps-2">Budget Estimated</td>${estCells}</tr>
          <tr><td class="fw-semibold ps-2">Budget Spent</td>${spentCells}</tr>
          <tr><td class="fw-semibold ps-2">Variance</td>${varCells}</tr>
        </tbody>
      </table>
    </div>`;
}

// ── MAIN RENDER ───────────────────────────────────────────────────────────────

function renderPortfolioView() {
  const container = document.getElementById('portfolioContainer');
  const projects  = config.projects || [];

  if (!projects.length) {
    container.innerHTML = '<div class="alert alert-info">No projects configured. Click <strong>＋ New project</strong> to add one.</div>';
    return;
  }

  container.innerHTML = '';

  // ── Toolbar: sort + client filter ────────────────────────────────────────
  const allClientIds = [...new Set(
    projects.filter(p => p.clientId && p.clientId !== '__unassigned__').map(p => p.clientId)
  )].sort((a, b) => getClientName(a).localeCompare(getClientName(b)));

  const clientOpts = [
    '<option value="">All clients</option>',
    ...allClientIds.map(cid =>
      `<option value="${esc(cid)}"${cid === _portfolioClientFilter ? ' selected' : ''}>${esc(getClientName(cid))}</option>`)
  ].join('');

  const toolbar = document.createElement('div');
  toolbar.className = 'd-flex align-items-center gap-3 mb-3 flex-wrap';
  toolbar.innerHTML = `
    <div class="d-flex align-items-center gap-2">
      <span class="small text-muted">Sort:</span>
      <select class="form-select form-select-sm" id="pfSort" style="width:auto">
        <option value="name"  ${_portfolioSort==='name'  ? 'selected':''}>Alphabetical</option>
        <option value="client"${_portfolioSort==='client'? 'selected':''}>Client name</option>
      </select>
    </div>
    <div class="d-flex align-items-center gap-2">
      <span class="small text-muted">Client:</span>
      <select class="form-select form-select-sm" id="pfClient" style="width:auto">${clientOpts}</select>
    </div>`;
  toolbar.querySelector('#pfSort').addEventListener('change', e => {
    _portfolioSort = e.target.value; renderPortfolioView();
  });
  toolbar.querySelector('#pfClient').addEventListener('change', e => {
    _portfolioClientFilter = e.target.value; renderPortfolioView();
  });
  container.appendChild(toolbar);

  // Global summary block (only shown when at least one project is pinned)
  const summaryEl = renderPortfolioSummary();
  if (summaryEl) container.appendChild(summaryEl);

  const programs = getPrograms();

  // Partition projects: grouped vs ungrouped
  const grouped   = {};
  const ungrouped = [];

  const sortFn = _portfolioSort === 'client'
    ? (a, b) => getClientName(a.clientId).localeCompare(getClientName(b.clientId)) || (a.name||a.id).localeCompare(b.name||b.id)
    : (a, b) => (a.name||a.id).localeCompare(b.name||b.id);

  const sorted = [...projects]
    .filter(p => p.id)
    .filter(p => !_portfolioClientFilter || p.clientId === _portfolioClientFilter)
    .sort(sortFn);

  sorted.forEach(cfg => {
    if (cfg.programId && programs.find(p => p.id === cfg.programId)) {
      if (!grouped[cfg.programId]) grouped[cfg.programId] = [];
      grouped[cfg.programId].push(cfg);
    } else {
      ungrouped.push(cfg);
    }
  });

  // Render program groups (alphabetical by program name)
  programs
    .filter(prog => grouped[prog.id]?.length)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(prog => {
      const children    = grouped[prog.id];
      const isCollapsed = !_expandedPrograms.has(prog.id);

      const pipelines   = children.map(c => getProjectPipeline(c.id) || c.pipeline).filter(Boolean);
      const domPipeline = pipelines.length ? pipelines[0] : '';

      // Derive client: use the most common clientId among children
      const clientIds = children.map(c => c.clientId).filter(c => c && c !== '__unassigned__');
      const domClientId = clientIds.length ? clientIds[0] : '';
      const domClientName = domClientId ? getClientName(domClientId) : '';

      const programBlock = document.createElement('div');
      programBlock.className = 'section-card mb-4';
      programBlock.style.border = '2px solid var(--violet-500)';

      programBlock.innerHTML = `
        <div class="section-header d-flex justify-content-between align-items-center" style="background:var(--violet-50)">
          <div class="d-flex align-items-center gap-3">
            <span style="font-size:var(--text-xl)">📂</span>
            <div>
              ${domClientName ? `<span class="fw-bold" style="font-size:var(--text-lg)">${esc(domClientName)} —</span> ` : ''}
              <span class="fw-bold" style="font-size:var(--text-lg)">${esc(prog.name)}</span>
              <span class="text-muted ms-2" style="font-size:var(--text-sm);font-family:monospace">${esc(prog.id)}</span>
            </div>
            ${pipelineBadge(domPipeline)}
            <span class="badge" style="background:#ede8ff;color:var(--violet-500);font-size:var(--text-xs)">${children.length} project${children.length===1?'':'s'}</span>
          </div>
          <div class="d-flex align-items-center gap-2">
            <button class="btn btn-sm btn-outline-secondary prog-share-btn" style="font-size:var(--text-sm)">🔗 Share Program</button>
            <button class="btn btn-sm btn-outline-secondary prog-toggle-btn" style="font-size:var(--text-sm)">
              ${isCollapsed ? '▶ Show Child Projects' : '▼ Hide Child Projects'}
            </button>
          </div>
        </div>
        ${buildProgramSummary(children)}
        <div class="prog-children" style="${isCollapsed ? 'display:none' : ''}">
          <div class="prog-project-list px-2 pb-2 pt-1"></div>
        </div>`;

      programBlock.querySelector('.prog-share-btn').addEventListener('click', () => {
        if (typeof openShareModal === 'function') openShareModal('program', prog.id, prog.name);
      });

      programBlock.querySelector('.prog-toggle-btn').addEventListener('click', () => {
        if (_expandedPrograms.has(prog.id)) _expandedPrograms.delete(prog.id);
        else _expandedPrograms.add(prog.id);
        renderPortfolioView();
      });

      const listEl = programBlock.querySelector('.prog-project-list');
      children.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
      children.forEach(cfg => {
        const card = buildProjectCard(cfg, { showSummaryBtn: false });
        if (card) listEl.appendChild(card);
      });

      container.appendChild(programBlock);
    });

  // Render ungrouped projects flat
  ungrouped.forEach(cfg => {
    const card = buildProjectCard(cfg, { showSummaryBtn: true });
    if (card) container.appendChild(card);
  });
}

function showPortfolioView() {
  if (typeof updateBreadcrumbs === 'function') updateBreadcrumbs([
    { label: 'Home', href: '/pipeline.html' },
    { label: 'Project Portfolio' },
  ]);
  planningReturnToBurndown = false;
  portfolioProjectFilters.clear();
  document.getElementById('portfolioSection').style.display          = 'block';
  document.getElementById('portfolioPlanningSection').style.display  = 'none';
  document.getElementById('mainContent').style.display               = 'none';
  document.getElementById('uploadSection').style.display             = 'none';
  document.getElementById('costGridEditorSection').style.display     = 'none';
  document.getElementById('pipelineBoardSection').style.display      = 'none';
  document.getElementById('btnAiAnalysis').style.display             = 'none';
  document.getElementById('btnShareProject').style.display           = 'none';
  document.getElementById('btnConfigureProject').style.display       = 'none';
  selectedProjectId = null;
  updateNavState('reporting');
  updatePortfolioCacheBadge();
  renderPortfolioView();
}

function showPortfolioPlanningView() {
  document.getElementById('portfolioSection').style.display          = 'none';
  document.getElementById('portfolioPlanningSection').style.display  = 'block';
  document.getElementById('mainContent').style.display               = 'none';
  document.getElementById('uploadSection').style.display             = 'none';
  document.getElementById('costGridEditorSection').style.display     = 'none';
  document.getElementById('pipelineBoardSection').style.display      = 'none';
  document.getElementById('btnAiAnalysis').style.display             = 'none';
  document.getElementById('btnShareProject').style.display           = 'none';
  document.getElementById('btnConfigureProject').style.display       = 'none';
  updateNavState('planning');
  renderPortfolioPlanningView();
}

function showDashboardView(pid) {
  const cfg = cfgForProject(pid);
  if (typeof updateBreadcrumbs === 'function') updateBreadcrumbs([
    { label: 'Home', href: '/pipeline.html' },
    { label: 'Project Portfolio', href: '/portfolio.html' },
    { label: cfg?.name || pid },
  ]);
  document.getElementById('portfolioSection').style.display          = 'none';
  document.getElementById('portfolioPlanningSection').style.display  = 'none';
  document.getElementById('uploadSection').style.display             = 'none';
  document.getElementById('pipelineBoardSection').style.display      = 'none';
  document.getElementById('mainContent').style.display               = 'block';

  // Row 1: client — program (always show if client or program present)
  const programRow = document.getElementById('dashboardProgramRow');
  const progId     = cfg?.programId;
  const prog       = progId ? getPrograms().find(p => p.id === progId) : null;
  const clientName = cfg?.clientId ? getClientName(cfg.clientId) : '';
  const hasClient  = clientName && clientName !== 'Unassigned';
  if (hasClient || prog) {
    const clientPart  = hasClient ? `<span class="fw-semibold">${esc(clientName)}</span>` : '';
    const sep         = hasClient && prog ? ' — ' : '';
    const progPart    = prog ? `<span class="fw-semibold">${esc(prog.name)}</span>` : '';
    programRow.innerHTML = clientPart + sep + progPart;
    programRow.style.display = '';
  } else {
    programRow.innerHTML = '';
    programRow.style.display = 'none';
  }

  // Row 2: project name + id + badges
  document.getElementById('dashboardProjectName').textContent = cfg ? (cfg.name || pid) : pid;
  document.getElementById('dashboardProjectId').textContent   = cfg?.name ? pid : '';
  const metaEl = document.getElementById('dashboardProjectMeta');
  if (metaEl) metaEl.innerHTML = [pipelineBadge(getProjectPipeline(pid) || cfg?.pipeline), statusBadgeLarge(cfg?.status)].join(' ');

  // Sibling project switcher
  const siblings = prog
    ? (config.projects || [])
        .filter(p => p.programId === progId && p.id !== pid)
        .sort((a, b) => (a.id || '').localeCompare(b.id || ''))
    : [];
  const dropdownEl = document.getElementById('dashboardSiblingDropdown');
  const menuEl     = document.getElementById('dashboardSiblingMenu');
  if (siblings.length && dropdownEl && menuEl) {
    menuEl.innerHTML = siblings.map(s => {
      const hasActuals = timesheetData.some(r => r.projectId === s.id);
      const badges     = [pipelineBadge(getProjectPipeline(s.id) || s.pipeline), statusBadgeLarge(s.status)].join(' ');
      if (hasActuals) {
        return `<li><a class="dropdown-item d-flex align-items-center gap-2 py-2" href="#" data-sib-pid="${esc(s.id)}">
          <span class="fw-semibold">${esc(s.name || s.id)}</span>
          ${s.code ? `<span class="text-muted small" style="font-family:monospace">${esc(s.code)}</span>` : ''}
          <span class="ms-auto d-inline-flex gap-1">${badges}</span>
        </a></li>`;
      } else {
        return `<li><span class="dropdown-item disabled d-flex align-items-center gap-2 py-2" style="opacity:.45;cursor:default">
          <span class="fw-semibold">${esc(s.name || s.id)}</span>
          ${s.code ? `<span class="text-muted small" style="font-family:monospace">${esc(s.code)}</span>` : ''}
          <span class="ms-auto d-inline-flex gap-1 align-items-center">${badges}<span class="text-muted small ms-1" style="font-size:var(--text-xs)">no data</span></span>
        </span></li>`;
      }
    }).join('');
    menuEl.querySelectorAll('[data-sib-pid]').forEach(a => {
      a.addEventListener('click', e => { e.preventDefault(); showDashboardView(a.dataset.sibPid); });
    });
    dropdownEl.style.display = '';
  } else if (dropdownEl) {
    dropdownEl.style.display = 'none';
  }

  document.getElementById('projectSelect').value = pid;
  selectProject(pid);
}
