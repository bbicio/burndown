// ── PLANNING / GANTT ─────────────────────────────────────────────────────────

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

  // Build ownerMap: owner → { sold, actuals, tbp, weekTotals, projects: { projId → { name, sold, actuals, tbp, weekTotals, tasks: { taskName → { sold, actuals, tbp, weekData } } } } }
  const ownerMap = {};

  projects.forEach(proj => {
    const projData = timesheetData.filter(r => r.projectId === proj.id);
    (proj.tasks || []).forEach(task => {
      if (task.completed) return;
      const tStart = task.startDate ? parseTaskDate(task.startDate, false) : null;
      const tEnd   = task.endDate   ? parseTaskDate(task.endDate,   true)  : null;

      const resources = (task.resources || []).filter(res => rolePassesTeamFilter(res.role));
      if (!resources.length) return;
      const soldH    = resources.reduce((s, res) => s + (res.soldHours || 0), 0);
      const taskRecs = projData.filter(r => resources.some(res => matchesTaskRole(r, task.name, res.role)));

      // Past week data + owner totals
      const taskWeekData = {};
      const ownerTotals  = {};
      let totalOwnerH    = 0;

      weeks.forEach(w => {
        if (!w.isPast) return;
        const key  = w.weekStart.toISOString();
        const recs = taskRecs.filter(r => { const d = new Date(r.date); d.setHours(0,0,0,0); return d >= w.weekStart && d <= w.weekEnd; });
        if (!recs.length) return;
        const byOwner = {};
        recs.forEach(r => { const o = r.owner?.trim() || '—'; byOwner[o] = (byOwner[o] || 0) + r.hours; });
        taskWeekData[key] = { total: recs.reduce((s, r) => s + r.hours, 0), byOwner, isPulse: false, isPast: true };
      });
      taskRecs.forEach(r => { const o = r.owner?.trim() || '—'; ownerTotals[o] = (ownerTotals[o] || 0) + r.hours; });
      Object.values(ownerTotals).forEach(h => { totalOwnerH += h; });

      const consumedH = totalOwnerH;
      const taskTbp   = computeResidual(soldH, consumedH);
      if (soldH < 0.01 && consumedH < 0.01) return;

      const ownerNames = Object.entries(ownerTotals).filter(([, h]) => h > 0.01).sort((a, b) => b[1] - a[1]).map(([o]) => o);
      const hasOwners  = ownerNames.length > 0;

      // Future week distribution
      if (taskTbp > 0.01) {
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

        distributeFutureResidual(taskTbp, totalTaskFw, weeksByMonth, portfolioMonthlyPulse).forEach(entry => {
          if (!taskWeekData[entry.key]) taskWeekData[entry.key] = { total: 0, byOwner: {}, isPulse: entry.isPulse, isPast: false };
          taskWeekData[entry.key].total += entry.hours;
          if (entry.isPulse) taskWeekData[entry.key].isPulse = true;
          distribute(taskWeekData[entry.key].byOwner, entry.hours);
        });
      }

      // Pivot into ownerMap
      const displayOwners = hasOwners ? ownerNames : ['—'];
      displayOwners.forEach(ownerName => {
        const isPlaceholder = ownerName === '—';
        const ownerProp    = totalOwnerH > 0.01 ? (ownerTotals[ownerName] || 0) / totalOwnerH : (isPlaceholder ? 1 : 0);
        const ownerSold    = soldH * ownerProp;
        const ownerActuals = ownerTotals[ownerName] || 0;
        const ownerTbpH    = taskTbp * ownerProp;

        if (!ownerMap[ownerName]) ownerMap[ownerName] = { sold: 0, actuals: 0, tbp: 0, weekTotals: {}, projects: {} };
        const om = ownerMap[ownerName];
        om.sold += ownerSold; om.actuals += ownerActuals; om.tbp += ownerTbpH;

        if (!om.projects[proj.id]) om.projects[proj.id] = { name: proj.name || proj.id, sold: 0, actuals: 0, tbp: 0, weekTotals: {}, tasks: {} };
        const pm = om.projects[proj.id];
        pm.sold += ownerSold; pm.actuals += ownerActuals; pm.tbp += ownerTbpH;

        if (!pm.tasks[task.name]) pm.tasks[task.name] = { sold: 0, actuals: 0, tbp: 0, weekData: {} };
        const tm = pm.tasks[task.name];
        tm.sold += ownerSold; tm.actuals += ownerActuals; tm.tbp += ownerTbpH;

        weeks.forEach(w => {
          const key = w.weekStart.toISOString();
          const d   = taskWeekData[key];
          if (!d) return;
          const oh = d.byOwner[ownerName] || 0;
          if (oh < 0.001) return;
          if (!tm.weekData[key]) tm.weekData[key] = { hours: 0, isPulse: d.isPulse, isPast: d.isPast };
          tm.weekData[key].hours += oh;
          if (!pm.weekTotals[key]) pm.weekTotals[key] = { hours: 0, isPulse: d.isPulse, isPast: d.isPast };
          pm.weekTotals[key].hours += oh;
          if (!om.weekTotals[key]) om.weekTotals[key] = { hours: 0, isPulse: d.isPulse, isPast: d.isPast };
          om.weekTotals[key].hours += oh;
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
  exportRows.push({ v: ['Owner', 'Project', 'Task', 'Sold', 'From actuals', 'To be planned', ...periodLabels], level: 'header' });
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

      Object.entries(pm.tasks).sort((a, b) => a[0].localeCompare(b[0])).forEach(([taskName, tm]) => {
        tbodyHtml += `
          <tr data-parent-group="${oid}" style="background:#fafafa">
            <td style="${SB}left:0;background:#fafafa;font-size:var(--text-sm);padding:4px 8px 4px 38px;font-weight:600;border:1px solid var(--border-light);white-space:nowrap;color:#444">${esc(taskName)}</td>
            <td style="${SB}left:200px;background:var(--sand-50);text-align:center;font-size:var(--text-xs);padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);color:var(--text-muted)">${fmtPH(tm.sold)}</td>
            <td style="${SB}left:265px;background:var(--sand-50);text-align:center;font-size:var(--text-xs);padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);color:#555">${fmtPH(tm.actuals)}</td>
            <td style="${SB}left:345px;background:var(--sand-50);text-align:center;font-size:var(--text-xs);padding:2px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);color:#555">${fmtPH(tm.tbp)}</td>
            ${makePeriodCells(tm.weekData, null, true)}
          </tr>`;
        exportRows.push({ v: ['', '', taskName, rnd(tm.sold), rnd(tm.actuals), rnd(tm.tbp),
          ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (tm.weekData[k]?.hours || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'role' });
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
      The table is structured as <strong>Owner → Project → Task</strong>.
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
          <th rowspan="${rowspan}" style="${SH}left:0;min-width:200px;background:#d8dff7;font-size:var(--text-base);padding:8px 10px;border:1px solid var(--border-light);white-space:nowrap">Owner / Project / Task</th>
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
