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

