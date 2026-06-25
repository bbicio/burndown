// ── DASHBOARD ────────────────────────────────────────────────────────────────
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
    o.textContent = (p.name ? `${p.name} — ${p.code || p.id}` : (p.code || p.id)) + (hasData ? '' : '  ⚠ no data');
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

function selectProject(id) {
  selectedProjectId = id;
  const inDashboard = document.getElementById('mainContent').style.display !== 'none';
  const proj    = id ? (config.projects || []).find(p => p.id === id) : null;
  const canEdit = proj?.my_permission !== 'viewer';
  document.getElementById('btnAiAnalysis').style.display       = (id && inDashboard && hasAiKey()) ? 'inline-block' : 'none';
  document.getElementById('btnShareProject').style.display     = (id && inDashboard) ? 'inline-block' : 'none';
  document.getElementById('btnPlanningView').style.display     = (id && inDashboard) ? 'inline-block' : 'none';
  document.getElementById('btnConfigureProject').style.display = (id && inDashboard && canEdit) ? 'inline-block' : 'none';
  const breadcrumb = document.getElementById('breadcrumbProjectName');
  if (breadcrumb) {
    const proj = (config.projects || []).find(p => p.id === id);
    breadcrumb.textContent = proj?.name || id || '';
  }
  if (!id) {
    document.getElementById('dashboard').style.display = 'none';
    return;
  }
  document.getElementById('dashboard').style.display = 'block';
  renderDashboard(id);
}

// ── RENDER DASHBOARD ──────────────────────────────────────────────────────────
function renderDashboard(projectId) {
  const cfg  = cfgForProject(projectId);
  currentCfg = cfg;
  const data = timesheetData.filter(r => r.projectId === projectId);

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
  const totalPtc  = (cfg.ptc || []).reduce((s, p) => s + (p.amount || 0), 0);
  const totalBudget = budgetE + totalPtc;

  const hoursLeft  = soldH - consumedH;
  const budgetLeft = totalBudget - consumedE;

  const hoursLeftEl  = document.getElementById('kpiHoursLeft');
  const budgetLeftEl = document.getElementById('kpiBudgetLeft');

  hoursLeftEl.textContent  = fmtH(hoursLeft);
  budgetLeftEl.textContent = fmtMoney(budgetLeft);
  hoursLeftEl.style.color  = hoursLeft < 0 ? 'var(--color-danger)' : hoursLeft < soldH * 0.1 ? '#fd7e14' : '';
  budgetLeftEl.style.color = budgetLeft < 0 ? 'var(--color-danger)' : budgetLeft < totalBudget * 0.1 ? '#fd7e14' : '';

  document.getElementById('kpiSoldHours').textContent   = fmtH(soldH);
  document.getElementById('kpiBudgetEur').textContent   = fmtMoney(totalBudget);
  document.getElementById('kpiConsumedEur').textContent = fmtMoney(consumedE);

  const budgetEurSubEl  = document.getElementById('kpiBudgetEurSub');
  const budgetLeftSubEl = document.getElementById('kpiBudgetLeftSub');
  if (totalPtc > 0) {
    if (budgetEurSubEl)  budgetEurSubEl.textContent  = `${fmtMoney(budgetE)} fees + ${fmtMoney(totalPtc)} PTC`;
    if (budgetLeftSubEl) budgetLeftSubEl.textContent = `(fees + PTC) − consumed`;
  } else {
    if (budgetEurSubEl)  budgetEurSubEl.textContent  = 'hours × hourly rate';
    if (budgetLeftSubEl) budgetLeftSubEl.textContent = 'budget − consumed';
  }
}

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
      borderColor: hasPhasingEur ? '#FF6F00' : 'var(--text-disabled)', borderDash: [6, 4], borderWidth: 2,
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
          <thead style="background:var(--surface-light);">
            <tr>
              <th class="ps-3" rowspan="2" style="vertical-align:middle;border-bottom:2px solid var(--border-light)">Month</th>
              <th colspan="3" class="text-center border-start" style="border-bottom:2px solid var(--border-light)">Hours</th>
              <th colspan="3" class="text-center border-start" style="border-bottom:2px solid var(--border-light)">Budget</th>
              ${hasPtc ? '<th class="text-center border-start" rowspan="2" style="vertical-align:middle;border-bottom:2px solid var(--border-light)">PTC</th>' : ''}
            </tr>
            <tr style="background:var(--surface-light);">
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
    const bg = i % 2 === 0 ? '' : 'style="background:var(--surface-light)"';
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
          <thead style="background:var(--surface-light);">
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
          <thead style="background:var(--surface-light);">
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
      const headerBg = groupMode === 'role' ? 'var(--indigo-50)' : 'var(--color-warning-bg)';
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
        <span>📋 ${esc(task.name)}${isUnbillable ? ' <span class="badge bg-secondary ms-1" style="font-size:var(--text-xs);vertical-align:middle;">Excluded from report</span>' : ''}</span>
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
          <thead style="background:var(--surface-light);">
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
            <div class="btn-group btn-group-sm det-group-toggle" style="font-size:var(--text-sm)">
              <button class="btn btn-outline-secondary active" data-group="flat">Flat</button>
              <button class="btn btn-outline-secondary" data-group="role">By role</button>
              <button class="btn btn-outline-secondary" data-group="owner">By owner</button>
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
            <thead style="background:var(--indigo-50);">
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

// ── EXPORT HELPERS ───────────────────────────────────────────────────────────
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
    `<button class="btn btn-outline-secondary btn-sm py-0 px-2" style="font-size:var(--text-xs)" title="Copy">📋</button>` +
    `<button class="btn btn-outline-secondary btn-sm py-0 px-2" style="font-size:var(--text-xs)" title="XLS">📊</button>` +
    `<button class="btn btn-outline-secondary btn-sm py-0 px-2" style="font-size:var(--text-xs)" title="PNG">🖼️</button>`;
  div.querySelector('[title="Copy"]').addEventListener('click', () => copyTableToClipboard(tblFn()));
  div.querySelector('[title="XLS"]').addEventListener('click',  () => exportTableToXLS(tblFn(), filename));
  div.querySelector('[title="PNG"]').addEventListener('click',  () => exportElementToPNG(cardEl, filename));
}
