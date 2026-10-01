// ── PORTFOLIO VIEW ───────────────────────────────────────────────────────────

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
