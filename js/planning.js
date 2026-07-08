// ── PLANNING / GANTT ─────────────────────────────────────────────────────────
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
      ? `<span style="position:absolute;left:6px;top:50%;transform:translateY(-50%);font-size:var(--text-xs);font-weight:700;color:var(--brand-navy);white-space:nowrap;z-index:2;text-shadow:0 0 3px rgba(255,255,255,.9)">${labelHtml}</span>`
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
    `<th colspan="${mg.count}" style="text-align:center;background:var(--indigo-100);font-size:var(--text-sm);padding:4px 3px;border:1px solid var(--border-light)">${mg.key}</th>`
  ).join('');

  const weekHeaderHtml = weeks.map(w => {
    const isNow = now >= w.weekStart && now <= w.weekEnd;
    return `<th class="gantt-period-col${isNow ? ' gantt-today' : ''}" style="min-width:72px;font-size:var(--text-xs)">${w.label}</th>`;
  }).join('');

  return `<table class="gantt-table" style="border-collapse:collapse;width:100%">
    <thead>
      <tr>
        <th class="gantt-label-col" rowspan="2" style="background:var(--indigo-50);z-index:3;font-size:var(--text-base);padding:8px 10px">${labelHeader}</th>
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

  document.getElementById('planningProjectName').textContent = fmtProjectTitle(cfg);
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
    container.innerHTML = '<div class="alert alert-info mb-0">No project period configured.</div>';
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
    container.innerHTML = '<div class="alert alert-info mb-0">No project period configured.</div>';
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

    const bFill    = isExcl ? 'var(--text-muted)' : isCompleted ? 'var(--color-success)' : isOver ? 'var(--color-danger)' : '#4a90e2';
    const bBg      = bFill + '22';
    const labelHtml = `${isCompleted ? '&#10003; ' : ''}${esc(task.name)}${pct > 0 ? ` — ${Math.round(pct)}%` : ''}`;
    const dateRangeLabel = `${fmtDateLabel(taskStart)} – ${fmtDateLabel(taskEnd)}`;

    tbodyHtml += `
      <tr class="gantt-task-row" data-task-idx="${taskIdx}">
        <td class="gantt-label-col">
          <div class="d-flex align-items-center gap-1">
            <span class="small fw-semibold text-truncate ${isCompleted ? 'text-success' : ''}" title="${esc(task.name)}" style="${isCompleted ? 'text-decoration:line-through' : ''}">${esc(task.name)}</span>
            ${isCompleted ? '<span class="badge bg-success ms-1" style="font-size:var(--text-2xs)">&#10003; done</span>' : ''}
            ${isExcl ? '<span class="badge bg-secondary ms-1" style="font-size:var(--text-2xs)">excl</span>' : ''}
          </div>
          <div style="font-size:var(--text-xs);color:#aaa">${dateRangeLabel}</div>
          <div style="font-size:var(--text-xs);color:#888">${fmtH(consumed)} / ${fmtH(sold)}</div>
        </td>
        ${buildPlanningBarCells(periods, taskStart, taskEnd, bFill, bBg, pct, labelHtml)}
      </tr>`;

    const overlapWeeks = weeks.filter(w => w.weekEnd >= taskStart && w.weekStart <= taskEnd);

    // Monthly % distribution support (Option B)
    const taskDist    = task.monthlyDistribution;
    const taskDistSum = taskDist ? Object.values(taskDist).reduce((s, v) => s + v, 0) : 0;
    const useTaskDist = taskDist && Math.abs(taskDistSum - 100) < 0.5;
    const mthWkCounts = {};
    if (useTaskDist) {
      overlapWeeks.forEach(w => {
        const ym = `${w.weekStart.getFullYear()}${String(w.weekStart.getMonth()+1).padStart(2,'0')}`;
        mthWkCounts[ym] = (mthWkCounts[ym] || 0) + 1;
      });
    }

    (task.resources || []).forEach(res => {
      const rSold    = res.soldHours || 0;
      const baseHPW  = overlapWeeks.length > 0 ? rSold / overlapWeeks.length : 0;
      const hPerWeekFn = useTaskDist
        ? w => {
            const ym = `${w.weekStart.getFullYear()}${String(w.weekStart.getMonth()+1).padStart(2,'0')}`;
            const pct = (taskDist[ym] || 0) / 100;
            const cnt = mthWkCounts[ym] || 1;
            return rSold * pct / cnt;
          }
        : () => baseHPW;

      const cells = weeks.map(w => {
        const inTask = w.weekEnd >= taskStart && w.weekStart <= taskEnd;
        if (!inTask) return `<td style="background:var(--surface-light);border:1px solid var(--border-light)"></td>`;
        const h     = hPerWeekFn(w);
        const wdays = workingDaysInWeek(w, taskStart, taskEnd);
        const cap   = 6 * wdays;
        const isOver = cap > 0 && h > cap;
        const bg  = isOver ? 'var(--color-warning-bg)' : 'white';
        const txt = h > 0 ? `${Math.round(h)}h` : '';
        return `<td style="background:${bg};border:1px solid var(--border-light);text-align:center;font-size:var(--text-xs);padding:2px 3px" title="${res.role}: ${Math.round(h)}h/wk (cap ${cap}h)">${txt}</td>`;
      }).join('');

      tbodyHtml += `
        <tr class="gantt-role-row" data-task-idx="${taskIdx}">
          <td class="gantt-label-col" style="padding-left:26px;background:#fafafa">
            <span class="text-muted small text-truncate d-block" title="${esc(res.role)}">${esc(res.role)}</span>
            <span style="font-size:var(--text-xs);color:#aaa">${fmtH(rSold)} sold</span>
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

    const tDist    = task.monthlyDistribution;
    const tDistSum = tDist ? Object.values(tDist).reduce((s, v) => s + v, 0) : 0;
    const useTDist = tDist && Math.abs(tDistSum - 100) < 0.5;
    const tMthWks  = {};
    if (useTDist) {
      overlapWeeks.forEach(w => {
        const ym = `${w.weekStart.getFullYear()}${String(w.weekStart.getMonth()+1).padStart(2,'0')}`;
        tMthWks[ym] = (tMthWks[ym] || 0) + 1;
      });
    }

    (task.resources || []).forEach(res => {
      if (!res.role) return;
      if (!roleMap[res.role]) roleMap[res.role] = {};
      const baseHPW = overlapWeeks.length > 0 ? res.soldHours / overlapWeeks.length : 0;
      overlapWeeks.forEach(w => {
        const key = w.weekStart.toISOString();
        if (!roleMap[res.role][key]) roleMap[res.role][key] = { hours: 0, breakdown: [] };
        let h = baseHPW;
        if (useTDist) {
          const ym  = `${w.weekStart.getFullYear()}${String(w.weekStart.getMonth()+1).padStart(2,'0')}`;
          const pct = (tDist[ym] || 0) / 100;
          const cnt = tMthWks[ym] || 1;
          h = res.soldHours * pct / cnt;
        }
        roleMap[res.role][key].hours += h;
        roleMap[res.role][key].breakdown.push({ task: task.name, hours: h });
      });
    });
  });

  const roles = Object.keys(roleMap).sort();
  let tbodyHtml = '';

  roles.forEach(role => {
    const cells = weeks.map(w => {
      const key  = w.weekStart.toISOString();
      const cell = roleMap[role][key];
      if (!cell) return `<td style="background:var(--surface-light);border:1px solid var(--border-light)"></td>`;
      const h = cell.hours;
      const bg = h > 30 ? 'var(--color-danger-bg)' : h > 24 ? 'var(--color-warning-bg)' : 'white';
      const tooltip = cell.breakdown.map(b => `${b.task}: ${Math.round(b.hours)}h`).join('\n');
      return `<td style="background:${bg};border:1px solid var(--border-light);text-align:center;font-size:var(--text-xs);padding:2px 3px" title="${tooltip}">${Math.round(h)}h</td>`;
    }).join('');

    tbodyHtml += `
      <tr>
        <td class="gantt-label-col" style="font-size:var(--text-base);padding:6px 8px">
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

function renderPortfolioPlanningView() {
  const container = document.getElementById('portfolioPlanningContainer');
  const filtersEl = document.getElementById('portfolioPlanningFilters');

  // Update back button and title based on context
  const backBtn = document.getElementById('btnPortfolioPlanningBack');
  const planningTitle = document.getElementById('portfolioPlanningTitle');
  if (planningReturnToBurndown) {
    if (backBtn) backBtn.textContent = '← Burndown';
    if (planningTitle) {
      const projName = portfolioProjectFilters.size === 1
        ? (config.projects?.find(p => portfolioProjectFilters.has(p.id))?.name || [...portfolioProjectFilters][0])
        : '';
      planningTitle.textContent = `📅 Resource Planning${projName ? ' — ' + projName : ''}`;
    }
  } else {
    if (backBtn) backBtn.textContent = '← Portfolio';
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
    (config.projects || []).map(p => p.pipeline || '').filter(p => p && p !== 'Canceled')
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
    if (pipe === 'Canceled') return false;
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
      <label class="dropdown-item d-flex align-items-center gap-2 py-1" style="cursor:pointer;font-size:var(--text-base)">
        <input type="checkbox" class="pp-proj-chk flex-shrink-0" data-pid="${esc(p.id)}" ${checked ? 'checked' : ''}>
        <span class="text-truncate" title="${esc(fmtProjectTitle(p))}">${esc(fmtProjectTitle(p))}</span>
        ${p.pipeline ? `<span class="badge bg-light text-dark border ms-auto" style="font-size:var(--text-2xs)">${esc(p.pipeline)}</span>` : ''}
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
      <label class="dropdown-item d-flex align-items-center gap-2 py-1" style="cursor:pointer;font-size:var(--text-base)">
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
          .filter(r => matchesTaskRole(r, task.name, res.role))
          .reduce((s, r) => s + r.hours, 0);
        roleActualsMap[res.role] = (roleActualsMap[res.role] || 0) + consumedH;

        const residualH = computeResidual(soldH, consumedH);

        if (!roleMap[res.role]) roleMap[res.role] = {};

        // PAST weeks: use actual timesheet hours grouped by week
        const pastWeeks = overlapWeeks.filter(w => w.isPast);
        pastWeeks.forEach(w => {
          const actualH = projData
            .filter(r => matchesTaskRole(r, task.name, res.role) &&
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

        const pDist    = task.monthlyDistribution;
        const pDistSum = pDist ? Object.values(pDist).reduce((s, v) => s + v, 0) : 0;
        const usePDist = pDist && Math.abs(pDistSum - 100) < 0.5;

        if (usePDist) {
          // Option B: distribute residual proportional to future-month % (renormalized)
          const futureMthWks = {};
          futureWeeks.forEach(w => {
            const ym = `${w.weekStart.getFullYear()}${String(w.weekStart.getMonth()+1).padStart(2,'0')}`;
            if (!futureMthWks[ym]) futureMthWks[ym] = [];
            futureMthWks[ym].push(w);
          });
          const futureDistTotal = Object.keys(futureMthWks).reduce((s, ym) => s + (pDist[ym] || 0), 0);
          if (futureDistTotal < 0.01) {
            // No distribution for visible future months: fall through to even split below
            const totalFutureWeeks = countFutureTaskWeeks(tStart, tEnd, todayMidnight);
            const hPerWeek = totalFutureWeeks > 0 ? residualH / totalFutureWeeks : residualH / futureWeeks.length;
            futureWeeks.forEach(w => {
              const key = w.weekStart.toISOString();
              if (!roleMap[res.role][key]) roleMap[res.role][key] = { hours: 0, breakdown: [], isPast: false, isPulse: false };
              roleMap[res.role][key].hours += hPerWeek;
              roleMap[res.role][key].breakdown.push({ project: proj.name || proj.id, task: task.name, hours: hPerWeek });
            });
          } else {
            Object.entries(futureMthWks).forEach(([ym, mWeeks]) => {
              const mPct    = (pDist[ym] || 0) / futureDistTotal;
              const mHours  = residualH * mPct;
              const hPerWk  = mHours / mWeeks.length;
              mWeeks.forEach(w => {
                const key = w.weekStart.toISOString();
                if (!roleMap[res.role][key]) roleMap[res.role][key] = { hours: 0, breakdown: [], isPast: false, isPulse: false };
                roleMap[res.role][key].hours += hPerWk;
                roleMap[res.role][key].breakdown.push({ project: proj.name || proj.id, task: task.name, hours: hPerWk });
              });
            });
          }
        } else {
        // Use total task future weeks (not just visible) so hPerWeek is stable as the axis range changes.
        const totalFutureWeeks = countFutureTaskWeeks(tStart, tEnd, todayMidnight);

        const byMonth = {};
        futureWeeks.forEach(w => {
          if (!byMonth[w.monthKey]) byMonth[w.monthKey] = [];
          byMonth[w.monthKey].push(w.weekStart.toISOString());
        });
        const weeksByMonth = Object.entries(byMonth).map(([monthKey, weekKeys]) => ({ monthKey, weekKeys }));

        distributeFutureResidual(residualH, totalFutureWeeks, weeksByMonth, portfolioMonthlyPulse).forEach(entry => {
          if (!roleMap[res.role][entry.key]) roleMap[res.role][entry.key] = { hours: 0, breakdown: [], isPast: false, isPulse: entry.isPulse };
          if (entry.isPulse) roleMap[res.role][entry.key].isPulse = true;
          roleMap[res.role][entry.key].hours += entry.hours;
          roleMap[res.role][entry.key].breakdown.push({ project: proj.name || proj.id, task: task.name, hours: entry.hours });
        });
        }
      });
    });
  });

  const roles = Object.keys(roleMap).sort();
  const fmtPH = v => v > 0.005 ? (portfolioRoundHours ? Math.round(v) : v.toFixed(2)) + 'h' : '';

  if (!roles.length) {
    container.innerHTML = '<div class="alert alert-info mb-0">No resource data found for the selected filters and date range.</div>';
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
      const bg = p.isPast ? '#e9ebec' : p.isCurrent ? '#4dabf7' : 'var(--indigo-100)';
      const fw = p.isCurrent ? 'font-weight:bold;color:#fff;' : '';
      return `<th style="min-width:70px;text-align:center;background:${bg};font-size:var(--text-sm);padding:4px 3px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);${fw}">${p.label}</th>`;
    }).join('');
  } else {
    periodHeaderHtml = monthGroups.map(mg => {
      const bg = mg.allPast ? '#e9ebec' : 'var(--indigo-100)';
      return `<th colspan="${mg.count}" style="text-align:center;background:${bg};font-size:var(--text-sm);padding:4px 3px;border:1px solid var(--border-light);">${mg.key}</th>`;
    }).join('');
    subHeaderHtml = weeks.map(w => {
      const bg = w.isCurrent ? '#4dabf7' : w.isPast ? '#e8eaec' : '#f0f2ff';
      const borderR = w.isLastOfMonth ? '3px solid var(--text-muted)' : '1px solid var(--border-light)';
      const fw = w.isCurrent ? 'font-weight:bold;color:#fff;' : '';
      return `<th title="${w.dateTitle}" style="min-width:42px;max-width:52px;font-size:var(--text-xs);text-align:center;background:${bg};border:1px solid var(--border-light);border-right:${borderR};padding:3px 2px;white-space:nowrap;${fw}">${w.wLabel}</th>`;
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
      const borderR = isMonthly ? '3px solid var(--text-muted)' : (p.isLastOfMonth ? '3px solid var(--text-muted)' : '1px solid var(--border-light)');
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
      if (h < 0.01) return `<td style="background:${emptyBg};border:1px solid var(--border-light);border-right:${borderR}"></td>`;

      colTotals[pKey(p)]       = (colTotals[pKey(p)]       || 0) + h;
      colFutureTotals[pKey(p)] = (colFutureTotals[pKey(p)] || 0) + hFuture;
      if (!p.isPast) rowToBePlanned += hFuture;
      const bg = p.isPast ? '#e5e8ea' : hasPulse ? 'var(--violet-100)' : (h > 30 ? 'var(--color-danger-bg)' : h > 24 ? 'var(--color-warning-bg)' : 'white');
      const tipLines = hasBreakdown.sort((a, b) => b.hours - a.hours)
        .map(b => `<div><b>${esc(b.project)}</b><br><span style="padding-left:8px">${esc(b.task)}: ${b.hours.toFixed(2)}h</span></div>`)
        .join('');
      const tipHtml = `<div style="font-size:var(--text-xs);line-height:1.5;text-align:left">${p.isPast ? '<em style="color:#888">actual</em><br>' : hasPulse ? '<em style="color:var(--violet-400)">monthly aggregate</em><br>' : ''}${tipLines}</div>`;
      const displayVal = hasPulse ? `<span style="font-style:italic;color:var(--violet-600)">~${fmtPH(h)}</span>`
        : h < 1 && portfolioRoundHours ? `<span style="color:#888;font-size:var(--text-xs)">${h.toFixed(2)}h</span>` : fmtPH(h);

      return `<td data-bs-toggle="tooltip" data-bs-html="true" data-bs-title="${tipHtml.replace(/"/g,'&quot;')}" style="background:${bg};border:1px solid var(--border-light);border-right:${borderR};text-align:center;font-size:var(--text-xs);padding:2px 3px;cursor:default">${displayVal}</td>`;
    }).join('');

    const rSold    = roleSoldMap[role]    || 0;
    const rActuals = roleActualsMap[role] || 0;
    const soldCell = `<td style="position:sticky;left:185px;z-index:2;text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);background:var(--sand-50)">${fmtPH(rSold)}</td>`;
    const actCell  = `<td style="position:sticky;left:250px;z-index:2;text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);background:var(--sand-50)">${fmtPH(rActuals)}</td>`;
    const tbpCell  = `<td style="position:sticky;left:330px;z-index:2;text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);background:var(--sand-50)">${fmtPH(rowToBePlanned)}</td>`;

    tbodyHtml += `
      <tr>
        <td style="position:sticky;left:0;z-index:2;background:white;font-size:var(--text-base);padding:6px 8px;font-weight:500;border:1px solid var(--border-light);white-space:nowrap">${esc(role)}</td>
        ${soldCell}${actCell}${tbpCell}${cells}
      </tr>`;
  });

  // Totals row
  const totalCells = periods.map(p => {
    const t = colTotals[pKey(p)] || 0;
    const borderR = isMonthly ? '3px solid var(--text-muted)' : (p.isLastOfMonth ? '3px solid var(--text-muted)' : '1px solid var(--border-light)');
    const bg = p.isPast ? '#e5e8ea' : p.isCurrent ? '#c8e6ff' : '#f0f2ff';
    return `<td style="background:${bg};border:1px solid var(--border-light);border-right:${borderR};text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 3px">${fmtPH(t)}</td>`;
  }).join('');
  const grandSold    = Object.values(roleSoldMap).reduce((s, v) => s + v, 0);
  const grandActuals = Object.values(roleActualsMap).reduce((s, v) => s + v, 0);
  const grandTbp     = periods.filter(p => !p.isPast).reduce((s, p) => s + (colFutureTotals[pKey(p)] || 0), 0);
  tbodyHtml += `
    <tr style="background:var(--indigo-50)">
      <td style="position:sticky;left:0;z-index:2;font-size:var(--text-base);padding:6px 8px;font-weight:bold;border:1px solid var(--border-light);border-top:3px solid var(--text-muted);background:var(--indigo-50)">Total</td>
      <td style="position:sticky;left:185px;z-index:2;text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);border-top:3px solid var(--text-muted);background:var(--sand-400)">${fmtPH(grandSold)}</td>
      <td style="position:sticky;left:250px;z-index:2;text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);border-top:3px solid var(--text-muted);background:var(--sand-400)">${fmtPH(grandActuals)}</td>
      <td style="position:sticky;left:330px;z-index:2;text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);border-top:3px solid var(--text-muted);background:var(--sand-400)">${fmtPH(grandTbp)}</td>
      ${totalCells}
    </tr>`;

  container.innerHTML = `
    <div class="alert alert-light border mb-3" style="font-size:var(--text-base);color:#444;line-height:1.7">
      <strong>Estimation logic:</strong>
      <strong>Past weeks</strong> (grey background) show <em>actual hours</em> from loaded timesheets.
      <strong>Current and future weeks</strong> show <em>residual hours</em> (sold − consumed) distributed linearly across the remaining task duration.
      When the average falls below 1h/week, hours are <strong>aggregated monthly</strong> and shown in the first week of each month —
      these cells are displayed in <span style="background:var(--violet-100);padding:1px 5px;border-radius:var(--radius-xs);font-style:italic;color:var(--violet-600)">~italic lavender</span> with the label <em>"monthly aggregate"</em> in the tooltip.
      <span style="background:var(--color-warning-bg);padding:1px 5px;border-radius:var(--radius-xs)">Yellow</span> = load &gt; 24h/week &nbsp;·&nbsp;
      <span style="background:var(--color-danger-bg);padding:1px 5px;border-radius:var(--radius-xs)">Red</span> = load &gt; 30h/week (overallocation) &nbsp;·&nbsp;
      <span style="background:#c8e6ff;padding:1px 5px;border-radius:var(--radius-xs)">Blue</span> = current week / month.
    </div>
    <table class="gantt-table" id="ppResourceTable" style="border-collapse:collapse;width:100%">
      <thead>
        <tr>
          <th rowspan="${isMonthly ? 1 : 2}" style="position:sticky;left:0;z-index:4;min-width:185px;background:var(--sand-200);font-size:var(--text-base);padding:8px 10px;border:1px solid var(--border-light);white-space:nowrap">Role</th>
          <th rowspan="${isMonthly ? 1 : 2}" style="position:sticky;left:185px;z-index:4;min-width:65px;background:var(--sand-200);font-size:var(--text-base);padding:8px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);text-align:center;white-space:nowrap">Sold</th>
          <th rowspan="${isMonthly ? 1 : 2}" style="position:sticky;left:250px;z-index:4;min-width:80px;background:var(--sand-200);font-size:var(--text-base);padding:8px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);text-align:center;white-space:nowrap">From<br>actuals</th>
          <th rowspan="${isMonthly ? 1 : 2}" title="To be planned can exceed Sold − Actuals when a role has multiple tasks and one is over-consumed — hours over budget on one task aren't subtracted from another task's remaining budget." style="position:sticky;left:330px;z-index:4;min-width:90px;background:var(--sand-200);font-size:var(--text-base);padding:8px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);text-align:center;white-space:nowrap">To be<br>planned</th>
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
    return parts.length ? ` <span style="font-size:var(--text-2xs);color:var(--text-muted);font-weight:400">${parts.join(' → ')}</span>` : '';
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
      const bg = p.isPast ? '#e9ebec' : p.isCurrent ? '#4dabf7' : 'var(--indigo-100)';
      const fw = p.isCurrent ? 'font-weight:bold;color:#fff;' : '';
      return `<th style="min-width:70px;text-align:center;background:${bg};font-size:var(--text-sm);padding:4px 3px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);${fw}">${p.label}</th>`;
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
      const bg = mg.allPast ? '#e9ebec' : 'var(--indigo-100)';
      return `<th colspan="${mg.count}" style="text-align:center;background:${bg};font-size:var(--text-sm);padding:4px 3px;border:1px solid var(--border-light);">${mg.key}</th>`;
    }).join('');
    subHeaderHtml = weeks.map(w => {
      const bg = w.isCurrent ? '#4dabf7' : w.isPast ? '#e8eaec' : '#f0f2ff';
      const borderR = w.isLastOfMonth ? '3px solid var(--text-muted)' : '1px solid var(--border-light)';
      const fw = w.isCurrent ? 'font-weight:bold;color:#fff;' : '';
      return `<th title="${w.dateTitle}" style="min-width:42px;max-width:52px;font-size:var(--text-xs);text-align:center;background:${bg};border:1px solid var(--border-light);border-right:${borderR};padding:3px 2px;white-space:nowrap;${fw}">${w.wLabel}</th>`;
    }).join('');
  }

  // Helper: build period cells from a weekKey→hours map (subtotal rows)
  const makePeriodCells = (weekTotals, bgFn) => periods.map(p => {
    const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()];
    const h = keys.reduce((s, k) => s + (weekTotals[k] || 0), 0);
    const borderR = isMonthly ? '3px solid var(--text-muted)' : (p.isLastOfMonth ? '3px solid var(--text-muted)' : '1px solid var(--border-light)');
    if (h < 0.01) return `<td style="background:${p.isPast ? '#f4f5f6' : 'transparent'};border:1px solid var(--border-light);border-right:${borderR}"></td>`;
    return `<td style="background:${bgFn(p)};border:1px solid var(--border-light);border-right:${borderR};text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 3px">${fmtPH(h)}</td>`;
  }).join('');

  const periodLabels = periods.map(p => isMonthly ? p.label : p.dateTitle);
  const periodMeta   = periods.map(p => ({ isPast: p.isPast, isCurrent: p.isCurrent ?? false }));
  const exportRows = [];
  exportRows.push({ v: ['Project', 'Task', 'Role', 'Owner', 'Sold', 'From actuals', 'To be planned', ...periodLabels], level: 'header' });

  let tbodyHtml = '';
  let projGroupIdx = 0;
  let grandSold = 0, grandActuals = 0, grandTbp = 0;
  const grandWeekTotals = {};
  weeks.forEach(w => { grandWeekTotals[w.weekStart.toISOString()] = 0; });

  projects.forEach(proj => {
    const gid = `proj-${projGroupIdx++}`;
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

        const taskRoleRecs = projData.filter(r => matchesTaskRole(r, task.name, res.role));
        const consumedH = taskRoleRecs.reduce((s, r) => s + r.hours, 0);
        const residualH = computeResidual(soldH, consumedH);

        const ownerTotals = {};
        taskRoleRecs.forEach(r => { const o = r.owner?.trim() || '—'; ownerTotals[o] = (ownerTotals[o] || 0) + r.hours; });
        const totalOwnerH = Object.values(ownerTotals).reduce((s, v) => s + v, 0);
        const ownerNames = Object.keys(ownerTotals).sort((a, b) => ownerTotals[b] - ownerTotals[a]);
        const hasOwners = ownerNames.length > 0;

        const pastWeeks   = overlapWeeks.filter(w => w.isPast);
        const futureWeeks = overlapWeeks.filter(w => !w.isPast);
        const _now = new Date(); const _td = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate());
        const _totalFw = countFutureTaskWeeks(tStart, tEnd, _td);

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
          const byMonth = {};
          futureWeeks.forEach(w => {
            if (!byMonth[w.monthKey]) byMonth[w.monthKey] = [];
            byMonth[w.monthKey].push(w.weekStart.toISOString());
          });
          const weeksByMonth = Object.entries(byMonth).map(([monthKey, weekKeys]) => ({ monthKey, weekKeys }));

          distributeFutureResidual(residualH, _totalFw, weeksByMonth, portfolioMonthlyPulse).forEach(entry => {
            if (!roleWeekData[entry.key]) roleWeekData[entry.key] = { total: 0, byOwner: {}, isPulse: entry.isPulse, isPast: false };
            roleWeekData[entry.key].total += entry.hours;
            if (entry.isPulse) roleWeekData[entry.key].isPulse = true;
            distribute(roleWeekData[entry.key].byOwner, entry.hours);
          });
        }

        const roleTbp = Object.entries(roleWeekData)
          .filter(([key]) => weeks.find(w => w.weekStart.toISOString() === key && !w.isPast))
          .reduce((s, [, d]) => s + d.total, 0);

        taskSold    += soldH;
        taskActuals += consumedH;
        taskTbp     += roleTbp;
        Object.entries(roleWeekData).forEach(([key, d]) => { taskWeekTotals[key] = (taskWeekTotals[key] || 0) + d.total; });

        // Role row — period cells
        const noOwnerBadge = !hasOwners ? ' <span style="font-size:var(--text-2xs);background:var(--color-warning-bg);border:1px solid #ffc107;border-radius:var(--radius-xs);padding:0 4px;color:var(--color-warning-text)">no owner</span>' : '';
        const roleStyle    = !hasOwners ? 'color:#dc6500;font-style:italic;' : '';

        const rolePeriodCells = periods.map(p => {
          const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()];
          let h = 0, isPulse = false;
          keys.forEach(key => { const d = roleWeekData[key]; if (d) { h += d.total; if (d.isPulse) isPulse = true; } });
          const borderR = isMonthly ? '3px solid var(--text-muted)' : (p.isLastOfMonth ? '3px solid var(--text-muted)' : '1px solid var(--border-light)');
          if (h < 0.01) return `<td style="background:${p.isPast ? '#f4f5f6' : 'transparent'};border:1px solid var(--border-light);border-right:${borderR}"></td>`;
          const bg = p.isPast ? '#e5e8ea' : isPulse ? 'var(--violet-100)' : (h > 30 ? 'var(--color-danger-bg)' : h > 24 ? 'var(--color-warning-bg)' : 'white');
          const dv = isPulse ? `<span style="font-style:italic;color:var(--violet-600)">~${fmtPH(h)}</span>`
            : h < 1 && portfolioRoundHours ? `<span style="color:#888;font-size:var(--text-xs)">${h.toFixed(2)}h</span>`
            : fmtPH(h);
          return `<td style="background:${bg};border:1px solid var(--border-light);border-right:${borderR};text-align:center;font-size:var(--text-xs);padding:2px 3px">${dv}</td>`;
        }).join('');

        taskBodyHtml += `
          <tr data-parent-group="${gid}">
            <td style="${SB}left:0;background:#fff;font-size:var(--text-sm);padding:4px 8px 4px 30px;border:1px solid var(--border-light);white-space:nowrap;font-weight:600;${roleStyle}">${esc(res.role)}${noOwnerBadge}</td>
            <td style="${SB}left:200px;background:var(--sand-50);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled)">${fmtPH(soldH)}</td>
            <td style="${SB}left:265px;background:var(--sand-50);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled)">${fmtPH(consumedH)}</td>
            <td style="${SB}left:345px;background:var(--sand-50);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted)">${fmtPH(roleTbp)}</td>
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
            const borderR = isMonthly ? '3px solid var(--text-muted)' : (p.isLastOfMonth ? '3px solid var(--text-muted)' : '1px solid var(--border-light)');
            const emptyBg = p.isPast ? '#f4f5f6' : 'transparent';
            if (oh < 0.01) return `<td style="background:${emptyBg};border:1px solid var(--border-light);border-right:${borderR}"></td>`;
            const bg = p.isPast ? '#e8eaec' : isPulse ? '#f3effe' : '#fafafa';
            const dv = isPulse ? `<span style="font-style:italic;color:var(--violet-400);font-size:var(--text-xs)">~${fmtPH(oh)}</span>`
              : oh < 1 && portfolioRoundHours ? `<span style="color:#888;font-size:var(--text-2xs)">${oh.toFixed(2)}h</span>`
              : `<span style="font-size:var(--text-xs)">${fmtPH(oh)}</span>`;
            return `<td style="background:${bg};border:1px solid var(--border-light);border-right:${borderR};text-align:center;padding:2px 3px">${dv}</td>`;
          }).join('');

          const ownerLabel = isPlaceholder ? '<span style="color:#aaa;font-style:italic">TBD</span>' : esc(ownerName);
          taskBodyHtml += `
            <tr data-parent-group="${gid}" style="background:#fafafa">
              <td style="${SB}left:0;background:#fafafa;font-size:var(--text-xs);padding:3px 8px 3px 52px;border:1px solid var(--border-light);color:#444;white-space:nowrap">${ownerLabel}</td>
              <td style="${SB}left:200px;background:#f5f6f7;text-align:center;font-size:var(--text-xs);padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);color:#aaa">—</td>
              <td style="${SB}left:265px;background:#f5f6f7;text-align:center;font-size:var(--text-xs);padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);color:#555">${fmtPH(ownerActualsH)}</td>
              <td style="${SB}left:345px;background:#f5f6f7;text-align:center;font-size:var(--text-xs);padding:2px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);color:#555">${fmtPH(ownerTbpH)}</td>
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
        <tr data-parent-group="${gid}" style="background:#e8ecff;border-top:2px solid #8899dd">
          <td style="${SB}left:0;background:#e8ecff;font-size:var(--text-sm);padding:5px 8px 5px 18px;font-weight:600;border:1px solid var(--border-light);border-left:3px solid #8899dd;white-space:nowrap">📋 ${esc(task.name)}${dateBadge(task.startDate, task.endDate)}</td>
          <td style="${SB}left:200px;background:var(--sand-200);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled)">${fmtPH(taskSold)}</td>
          <td style="${SB}left:265px;background:var(--sand-200);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled)">${fmtPH(taskActuals)}</td>
          <td style="${SB}left:345px;background:var(--sand-200);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted)">${fmtPH(taskTbp)}</td>
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
      <tr data-group-id="${gid}" style="background:var(--indigo-300);border-top:3px solid var(--indigo-500);border-bottom:1px solid var(--indigo-500)">
        <td style="${SB}left:0;background:var(--indigo-300);font-size:var(--text-base);padding:7px 8px 7px 10px;font-weight:700;border:1px solid var(--border-light);border-left:4px solid var(--indigo-500);white-space:nowrap"><span class="pp-toggle" style="display:inline-block;width:12px;margin-right:4px;font-size:var(--text-xs)">▼</span>🏢 ${esc(proj.name || proj.id)}${pipeBadge}${statBadge}${dateBadge(proj.startDate, proj.endDate)}</td>
        <td style="${SB}left:200px;background:var(--sand-300);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled)">${fmtPH(projSold)}</td>
        <td style="${SB}left:265px;background:var(--sand-300);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled)">${fmtPH(projActuals)}</td>
        <td style="${SB}left:345px;background:var(--sand-300);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted)">${fmtPH(projTbp)}</td>
        ${makePeriodCells(projWeekTotals, p => p.isPast ? '#bec3c8' : p.isCurrent ? '#90c8f0' : '#c8d0f5')}
      </tr>
      ${projBodyHtml}`;
  });

  if (!tbodyHtml) {
    container.innerHTML = '<div class="alert alert-info mb-0">No resource data found for the selected filters and date range.</div>';
    return;
  }

  tbodyHtml += `
    <tr style="background:var(--indigo-50);border-top:3px solid var(--text-muted)">
      <td style="${SB}left:0;background:var(--indigo-50);font-size:var(--text-base);padding:6px 8px;font-weight:bold;border:1px solid var(--border-light);border-top:3px solid var(--text-muted)">Total</td>
      <td style="${SB}left:200px;background:var(--sand-400);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);border-top:3px solid var(--text-muted)">${fmtPH(grandSold)}</td>
      <td style="${SB}left:265px;background:var(--sand-400);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);border-top:3px solid var(--text-muted)">${fmtPH(grandActuals)}</td>
      <td style="${SB}left:345px;background:var(--sand-400);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);border-top:3px solid var(--text-muted)">${fmtPH(grandTbp)}</td>
      ${makePeriodCells(grandWeekTotals, p => p.isPast ? '#e5e8ea' : p.isCurrent ? '#c8e6ff' : '#f0f2ff')}
    </tr>`;

  exportRows.push(
    { v: ['Total', '', '', '', rnd(grandSold), rnd(grandActuals), rnd(grandTbp),
      ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (grandWeekTotals[k] || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'total' }
  );

  const rowspan = isMonthly ? '1' : '2';
  container.innerHTML = `
    <div class="alert alert-light border mb-3" style="font-size:var(--text-base);color:#444;line-height:1.7">
      <strong>Estimation logic (By Project):</strong>
      The table is structured as <strong>Project → Task → Role → Owner</strong>.
      <strong>Past weeks</strong> (grey) show <em>actual hours</em> from timesheets, broken down by owner.
      <strong>Current and future weeks</strong> show <em>residual hours</em> (sold − consumed) distributed linearly across the remaining task duration,
      then split among owners <em>proportionally to their share of actuals</em>.
      When residual falls below 1h/week per role, hours are <strong>aggregated monthly</strong> —
      shown in <span style="background:var(--violet-100);padding:1px 5px;border-radius:var(--radius-xs);font-style:italic;color:var(--violet-600)">~italic lavender</span>.
      <span style="background:#c8e6ff;padding:1px 5px;border-radius:var(--radius-xs)">Blue</span> = current week / month.
    </div>
    <div class="d-flex justify-content-end gap-1 mb-2">
      <button class="btn btn-outline-secondary pp-expand-all" style="font-size:var(--text-xs);padding:2px 8px">⊞ Expand all</button>
      <button class="btn btn-outline-secondary pp-collapse-all" style="font-size:var(--text-xs);padding:2px 8px">⊟ Collapse all</button>
    </div>
    <table class="gantt-table" id="ppResourceTable" style="border-collapse:collapse;width:100%">
      <thead>
        <tr>
          <th rowspan="${rowspan}" style="${SH}left:0;min-width:200px;background:#d8dff7;font-size:var(--text-base);padding:8px 10px;border:1px solid var(--border-light);white-space:nowrap">Project / Task / Role / Owner</th>
          <th rowspan="${rowspan}" style="${SH}left:200px;min-width:65px;background:var(--sand-200);font-size:var(--text-base);padding:8px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);text-align:center;white-space:nowrap">Sold</th>
          <th rowspan="${rowspan}" style="${SH}left:265px;min-width:80px;background:var(--sand-200);font-size:var(--text-base);padding:8px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);text-align:center;white-space:nowrap">From<br>actuals</th>
          <th rowspan="${rowspan}" title="To be planned can exceed Sold − Actuals when a role has multiple tasks and one is over-consumed — hours over budget on one task aren't subtracted from another task's remaining budget." style="${SH}left:345px;min-width:90px;background:var(--sand-200);font-size:var(--text-base);padding:8px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);text-align:center;white-space:nowrap">To be<br>planned</th>
          ${periodHeaderHtml}
        </tr>
        ${isMonthly ? '' : `<tr>${subHeaderHtml}</tr>`}
      </thead>
      <tbody>${tbodyHtml}</tbody>
    </table>`;

  setupGroupToggle(container);

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
      const bg = p.isPast ? '#e9ebec' : p.isCurrent ? '#4dabf7' : 'var(--indigo-100)';
      const fw = p.isCurrent ? 'font-weight:bold;color:#fff;' : '';
      return `<th style="min-width:70px;text-align:center;background:${bg};font-size:var(--text-sm);padding:4px 3px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);${fw}">${p.label}</th>`;
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
      const bg = mg.allPast ? '#e9ebec' : 'var(--indigo-100)';
      return `<th colspan="${mg.count}" style="text-align:center;background:${bg};font-size:var(--text-sm);padding:4px 3px;border:1px solid var(--border-light);">${mg.key}</th>`;
    }).join('');
    subHeaderHtml = weeks.map(w => {
      const bg = w.isCurrent ? '#4dabf7' : w.isPast ? '#e8eaec' : '#f0f2ff';
      const borderR = w.isLastOfMonth ? '3px solid var(--text-muted)' : '1px solid var(--border-light)';
      return `<th title="${w.dateTitle}" style="min-width:42px;max-width:52px;font-size:var(--text-xs);text-align:center;background:${bg};border:1px solid var(--border-light);border-right:${borderR};padding:3px 2px;white-space:nowrap;${w.isCurrent ? 'font-weight:bold;color:#fff;' : ''}">${w.wLabel}</th>`;
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
        const roleRecs = projData.filter(r => matchesTaskRole(r, task.name, res.role));

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
        const roleTbp   = computeResidual(soldH, consumedH);
        if (soldH < 0.01 && consumedH < 0.01) return;

        const ownerNames = Object.entries(ownerTotals).filter(([, h]) => h > 0.01).sort((a, b) => b[1] - a[1]).map(([o]) => o);
        const hasOwners  = ownerNames.length > 0;

        // Future week distribution
        if (roleTbp > 0.01) {
          const _owNow = new Date(); const _owTd = new Date(_owNow.getFullYear(), _owNow.getMonth(), _owNow.getDate());
          const futureWeeks = weeks.filter(w => !w.isPast);
          const taskWeeks   = tStart && tEnd ? futureWeeks.filter(w => w.weekEnd >= tStart && w.weekStart <= tEnd) : futureWeeks;
          // Compute canonical count from task date range (stable regardless of view range)
          const totalTaskFw = (tStart && tEnd) ? countFutureTaskWeeks(tStart, tEnd, _owTd) : taskWeeks.length;
          const distribute  = (byOwner, hours) => {
            if (totalOwnerH > 0.01) ownerNames.forEach(o => { byOwner[o] = (byOwner[o] || 0) + hours * (ownerTotals[o] / totalOwnerH); });
            else byOwner['—'] = (byOwner['—'] || 0) + hours;
          };

          const monthMap = {};
          taskWeeks.forEach(w => {
            if (!monthMap[w.monthKey]) monthMap[w.monthKey] = [];
            monthMap[w.monthKey].push(w.weekStart.toISOString());
          });
          const weeksByMonth = Object.entries(monthMap).map(([monthKey, weekKeys]) => ({ monthKey, weekKeys }));

          distributeFutureResidual(roleTbp, totalTaskFw, weeksByMonth, portfolioMonthlyPulse).forEach(entry => {
            if (!roleWeekData[entry.key]) roleWeekData[entry.key] = { total: 0, byOwner: {}, isPulse: entry.isPulse, isPast: false };
            roleWeekData[entry.key].total += entry.hours;
            if (entry.isPulse) roleWeekData[entry.key].isPulse = true;
            distribute(roleWeekData[entry.key].byOwner, entry.hours);
          });
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
    container.innerHTML = '<div class="alert alert-info mb-0">No owner data found for the selected filters.</div>';
    return;
  }

  // Period cell helper for ownerMap data (weekTotals has { hours, isPulse, isPast })
  const makePeriodCells = (weekDataMap, bgFn, small = false) => periods.map(p => {
    const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()];
    let h = 0, isPulse = false;
    keys.forEach(key => { const d = weekDataMap[key]; if (d) { h += d.hours; if (d.isPulse) isPulse = true; } });
    const borderR = isMonthly ? '3px solid var(--text-muted)' : (p.isLastOfMonth ? '3px solid var(--text-muted)' : '1px solid var(--border-light)');
    if (h < 0.01) return `<td style="background:${p.isPast ? '#f4f5f6' : 'transparent'};border:1px solid var(--border-light);border-right:${borderR}"></td>`;
    const bg = bgFn ? bgFn(p, h, isPulse) : (p.isPast ? (small ? '#e8eaec' : '#e5e8ea') : isPulse ? (small ? '#f3effe' : 'var(--violet-100)') : p.isCurrent ? '#c8e6ff' : small ? '#fafafa' : 'white');
    const dv = isPulse
      ? `<span style="font-style:italic;color:${small ? 'var(--violet-400)' : 'var(--violet-600)'};font-size:${small ? '.7rem' : '.75rem'}">~${fmtPH(h)}</span>`
      : (h < 1 && portfolioRoundHours ? `<span style="color:#888;font-size:var(--text-2xs)">${h.toFixed(2)}h</span>` : `<span style="font-size:${small ? '.72rem' : '.75rem'}">${fmtPH(h)}</span>`);
    return `<td style="background:${bg};border:1px solid var(--border-light);border-right:${borderR};text-align:center;padding:2px 3px">${dv}</td>`;
  }).join('');

  // Helper for grand total (plain weekKey→number map)
  const makeGrandCells = weekTotals => periods.map(p => {
    const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()];
    const h = keys.reduce((s, k) => s + (weekTotals[k] || 0), 0);
    const borderR = isMonthly ? '3px solid var(--text-muted)' : (p.isLastOfMonth ? '3px solid var(--text-muted)' : '1px solid var(--border-light)');
    if (h < 0.01) return `<td style="background:${p.isPast ? '#f4f5f6' : 'transparent'};border:1px solid var(--border-light);border-right:${borderR}"></td>`;
    const bg = p.isPast ? '#e5e8ea' : p.isCurrent ? '#c8e6ff' : '#f0f2ff';
    return `<td style="background:${bg};border:1px solid var(--border-light);border-right:${borderR};text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 3px">${fmtPH(h)}</td>`;
  }).join('');

  const periodLabels = periods.map(p => isMonthly ? p.label : p.dateTitle);
  const periodMeta   = periods.map(p => ({ isPast: p.isPast, isCurrent: p.isCurrent ?? false }));
  const exportRows = [];
  exportRows.push({ v: ['Owner', 'Project', 'Role', 'Sold', 'From actuals', 'To be planned', ...periodLabels], level: 'header' });
  let tbodyHtml = '';
  let ownerGroupIdx = 0;
  let grandSold = 0, grandActuals = 0, grandTbp = 0;
  const grandWeekTotals = {};

  Object.entries(ownerMap).sort((a, b) => a[0].localeCompare(b[0])).forEach(([ownerName, om]) => {
    const oid = `owner-${ownerGroupIdx++}`;
    const displayName = ownerName === '—' ? 'TBD' : ownerName;
    grandSold += om.sold; grandActuals += om.actuals; grandTbp += om.tbp;

    weeks.forEach(w => {
      const key = w.weekStart.toISOString();
      grandWeekTotals[key] = (grandWeekTotals[key] || 0) + (om.weekTotals[key]?.hours || 0);
    });

    tbodyHtml += `
      <tr data-group-id="${oid}" style="background:var(--indigo-300);border-top:3px solid var(--indigo-500);border-bottom:1px solid var(--indigo-500)">
        <td style="${SB}left:0;background:var(--indigo-300);font-size:var(--text-md);padding:7px 8px 7px 10px;font-weight:700;border:1px solid var(--border-light);border-left:4px solid var(--indigo-500);white-space:nowrap"><span class="pp-toggle" style="display:inline-block;width:12px;margin-right:4px;font-size:var(--text-xs)">▼</span>👤 ${esc(displayName)}</td>
        <td style="${SB}left:200px;background:var(--sand-300);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled)">${fmtPH(om.sold)}</td>
        <td style="${SB}left:265px;background:var(--sand-300);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled)">${fmtPH(om.actuals)}</td>
        <td style="${SB}left:345px;background:var(--sand-300);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted)">${fmtPH(om.tbp)}</td>
        ${makePeriodCells(om.weekTotals, null)}
      </tr>`;
    exportRows.push({ v: [displayName, '', '', rnd(om.sold), rnd(om.actuals), rnd(om.tbp),
      ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (om.weekTotals[k]?.hours || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'project' });

    Object.entries(om.projects).sort((a, b) => a[1].name.localeCompare(b[1].name)).forEach(([projId, pm]) => {
      const projCfg = (config.projects || []).find(p => p.id === projId);
      const pmPipe  = projCfg ? pipelineBadge(projCfg.pipeline) : '';
      const pmStat  = projCfg ? statusBadge(projCfg.status)     : '';
      tbodyHtml += `
        <tr data-parent-group="${oid}" style="background:#e8ecff;border-top:2px solid #8899dd">
          <td style="${SB}left:0;background:#e8ecff;font-size:var(--text-sm);padding:5px 8px 5px 22px;font-weight:600;border:1px solid var(--border-light);border-left:3px solid #8899dd;white-space:nowrap">🏢 ${esc(pm.name)} ${pmPipe} ${pmStat}</td>
          <td style="${SB}left:200px;background:var(--sand-200);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled)">${fmtPH(pm.sold)}</td>
          <td style="${SB}left:265px;background:var(--sand-200);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled)">${fmtPH(pm.actuals)}</td>
          <td style="${SB}left:345px;background:var(--sand-200);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted)">${fmtPH(pm.tbp)}</td>
          ${makePeriodCells(pm.weekTotals, null)}
        </tr>`;
      exportRows.push({ v: ['', pm.name, '', rnd(pm.sold), rnd(pm.actuals), rnd(pm.tbp),
        ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (pm.weekTotals[k]?.hours || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'task' });

      Object.entries(pm.roles).sort((a, b) => a[0].localeCompare(b[0])).forEach(([role, rm]) => {
        tbodyHtml += `
          <tr data-parent-group="${oid}" style="background:#fafafa">
            <td style="${SB}left:0;background:#fafafa;font-size:var(--text-sm);padding:4px 8px 4px 38px;font-weight:600;border:1px solid var(--border-light);white-space:nowrap;color:#444">${esc(role)}</td>
            <td style="${SB}left:200px;background:var(--sand-50);text-align:center;font-size:var(--text-xs);padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);color:var(--text-muted)">${fmtPH(rm.sold)}</td>
            <td style="${SB}left:265px;background:var(--sand-50);text-align:center;font-size:var(--text-xs);padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);color:#555">${fmtPH(rm.actuals)}</td>
            <td style="${SB}left:345px;background:var(--sand-50);text-align:center;font-size:var(--text-xs);padding:2px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);color:#555">${fmtPH(rm.tbp)}</td>
            ${makePeriodCells(rm.weekData, null, true)}
          </tr>`;
        exportRows.push({ v: ['', '', role, rnd(rm.sold), rnd(rm.actuals), rnd(rm.tbp),
          ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (rm.weekData[k]?.hours || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'role' });
      });
    });
  });

  tbodyHtml += `
    <tr style="background:var(--indigo-50);border-top:3px solid var(--text-muted)">
      <td style="${SB}left:0;background:var(--indigo-50);font-size:var(--text-base);padding:6px 8px;font-weight:bold;border:1px solid var(--border-light);border-top:3px solid var(--text-muted)">Totale</td>
      <td style="${SB}left:200px;background:var(--sand-400);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);border-top:3px solid var(--text-muted)">${fmtPH(grandSold)}</td>
      <td style="${SB}left:265px;background:var(--sand-400);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);border-top:3px solid var(--text-muted)">${fmtPH(grandActuals)}</td>
      <td style="${SB}left:345px;background:var(--sand-400);text-align:center;font-size:var(--text-xs);font-weight:bold;padding:2px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);border-top:3px solid var(--text-muted)">${fmtPH(grandTbp)}</td>
      ${makeGrandCells(grandWeekTotals)}
    </tr>`;

  exportRows.push({ v: ['Totale', '', '', rnd(grandSold), rnd(grandActuals), rnd(grandTbp),
    ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (grandWeekTotals[k] || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'total' });

  const rowspan = isMonthly ? '1' : '2';
  container.innerHTML = `
    <div class="alert alert-light border mb-3" style="font-size:var(--text-base);color:#444;line-height:1.7">
      <strong>Estimation logic (By Owner):</strong>
      The table is structured as <strong>Owner → Project → Role</strong>.
      <strong>Past weeks</strong> show <em>actual</em> hours from timesheets.
      <strong>Future weeks</strong> show each owner's proportional share of remaining hours (sold − consumed).
      If no owner is found in the actuals, hours are assigned to a <em>TBD</em> placeholder.
    </div>
    <div class="d-flex justify-content-end gap-1 mb-2">
      <button class="btn btn-outline-secondary pp-expand-all" style="font-size:var(--text-xs);padding:2px 8px">⊞ Expand all</button>
      <button class="btn btn-outline-secondary pp-collapse-all" style="font-size:var(--text-xs);padding:2px 8px">⊟ Collapse all</button>
    </div>
    <table class="gantt-table" id="ppResourceTable" style="border-collapse:collapse;width:100%">
      <thead>
        <tr>
          <th rowspan="${rowspan}" style="${SH}left:0;min-width:200px;background:#d8dff7;font-size:var(--text-base);padding:8px 10px;border:1px solid var(--border-light);white-space:nowrap">Owner / Project / Role</th>
          <th rowspan="${rowspan}" style="${SH}left:200px;min-width:65px;background:var(--sand-200);font-size:var(--text-base);padding:8px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);text-align:center;white-space:nowrap">Sold</th>
          <th rowspan="${rowspan}" style="${SH}left:265px;min-width:80px;background:var(--sand-200);font-size:var(--text-base);padding:8px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);text-align:center;white-space:nowrap">From<br>actuals</th>
          <th rowspan="${rowspan}" title="To be planned can exceed Sold − Actuals when a role has multiple tasks and one is over-consumed — hours over budget on one task aren't subtracted from another task's remaining budget." style="${SH}left:345px;min-width:90px;background:var(--sand-200);font-size:var(--text-base);padding:8px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);text-align:center;white-space:nowrap">To be<br>planned</th>
          ${periodHeaderHtml}
        </tr>
        ${isMonthly ? '' : `<tr>${subHeaderHtml}</tr>`}
      </thead>
      <tbody>${tbodyHtml}</tbody>
    </table>`;

  setupGroupToggle(container);

  const exportBtn = document.getElementById('btnExportResourcePlan');
  if (exportBtn) {
    exportBtn._ppExport = () => buildStyledExcelExport({ exportRows, periodMeta, nameCount: 3, sheetName: 'Planning By Owner', filename: 'planning_by_owner.xlsx' });
  }
}

// ── GROUP TOGGLE HELPER ───────────────────────────────────────────────────────
function setupGroupToggle(container) {
  const groups = new Map();
  container.querySelectorAll('tr[data-group-id]').forEach(hRow => {
    const gid = hRow.dataset.groupId;
    const childRows = [...container.querySelectorAll(`tr[data-parent-group="${gid}"]`)];
    groups.set(gid, { hRow, childRows, collapsed: false });
    hRow.style.cursor = 'pointer';
    hRow.addEventListener('click', () => {
      const g = groups.get(gid);
      g.collapsed = !g.collapsed;
      g.childRows.forEach(r => r.style.display = g.collapsed ? 'none' : '');
      const btn = hRow.querySelector('.pp-toggle');
      if (btn) btn.textContent = g.collapsed ? '▶' : '▼';
    });
  });
  const expandAll   = container.querySelector('.pp-expand-all');
  const collapseAll = container.querySelector('.pp-collapse-all');
  if (expandAll)   expandAll.addEventListener('click',  e => { e.stopPropagation(); groups.forEach(g => { g.collapsed = false; g.childRows.forEach(r => r.style.display = '');     const b = g.hRow.querySelector('.pp-toggle'); if (b) b.textContent = '▼'; }); });
  if (collapseAll) collapseAll.addEventListener('click', e => { e.stopPropagation(); groups.forEach(g => { g.collapsed = true;  g.childRows.forEach(r => r.style.display = 'none'); const b = g.hRow.querySelector('.pp-toggle'); if (b) b.textContent = '▶'; }); });
}
