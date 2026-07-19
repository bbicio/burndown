// Pure KPI + burndown-series math extracted from js/dashboard.js's renderKPIs (:78-130)
// and renderBurndown (:148-340). billableData/billableTasks/findRate are plain globals
// defined in js/core.js today (confirmed: js/core.js:264 findRate, :275 billableTasks,
// :280 billableData) — not js/lib/* ES exports — so they are injected as parameters
// here rather than imported, keeping this module pure/DOM-free.

export function computeKpis(data, cfg, billableData, billableTasks, findRate) {
  const bData = billableData(data, cfg);
  const consumedHours = bData.reduce((s, r) => s + r.hours, 0);
  const maxDate = bData.length ? bData.reduce((max, r) => r.date > max ? r.date : max, bData[0].date) : null;

  if (!cfg) {
    return { consumedHours, maxDate, soldHours: null, budgetTotal: null, consumedEur: null, hoursLeft: null, budgetLeft: null, feesOnly: null, totalPtc: null };
  }

  const bTasks = billableTasks(cfg);
  const soldHours = bTasks.reduce((s, t) => s + t.resources.reduce((ss, r) => ss + r.soldHours, 0), 0);
  const feesOnly = bTasks.reduce((s, t) => s + t.resources.reduce((ss, r) => ss + r.soldHours * r.hourlyRate, 0), 0);
  const consumedEur = bData.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0);
  const totalPtc = (cfg.ptc || []).reduce((s, p) => s + (p.amount || 0), 0);
  const budgetTotal = feesOnly + totalPtc;
  const hoursLeft = soldHours - consumedHours;
  const budgetLeft = budgetTotal - consumedEur;

  return { consumedHours, maxDate, soldHours, budgetTotal, consumedEur, hoursLeft, budgetLeft, feesOnly, totalPtc };
}

// Local replicas of js/core.js's pad()/fmtDateLabel() (core.js:297-300): the brief's
// draft used a toLocaleDateString('en-US', {month:'short', day:'numeric'}) placeholder
// for the non-quarterly/monthly (weekly/biweekly) label format, but the real
// js/dashboard.js renderBurndown (:211) calls the real fmtDateLabel(d), which formats
// as `dd/mm/yy` (zero-padded day/month, 2-digit year) — not an English month name.
// Reproduced verbatim here (rather than injected as a parameter) since it is a trivial,
// dependency-free pure function with no DOM/global state.
function pad(n) { return String(n).padStart(2, '0'); }
function fmtDateLabel(d) { return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}` : ''; }

export function computeBurndownPoints(data, cfg, taskFilter, interval, billableData, billableTasks, findRate) {
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
    const sy = parseInt(cfg.startDate.slice(0, 4)), sm = parseInt(cfg.startDate.slice(4, 6));
    const ey = parseInt(cfg.endDate.slice(0, 4)), em = parseInt(cfg.endDate.slice(4, 6));
    axisStart = new Date(sy, sm - 1, 1);
    axisEnd = new Date(ey, em, 0);
  } else {
    const allDates = (filteredData.length ? filteredData : data).map(r => r.date);
    const minDate = allDates.reduce((a, b) => a < b ? a : b);
    axisStart = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    axisEnd = new Date(axisStart);
    axisEnd.setMonth(axisEnd.getMonth() + 14);
  }

  const points = [];
  if (interval === 'quarterly') {
    let cur = new Date(axisStart.getFullYear(), Math.floor(axisStart.getMonth() / 3) * 3, 1);
    while (cur <= axisEnd) { points.push(new Date(cur)); cur.setMonth(cur.getMonth() + 3); }
  } else if (interval === 'weekly') {
    const weekStart = new Date(axisStart);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    for (let d = new Date(weekStart); d <= axisEnd; d.setDate(d.getDate() + 7)) points.push(new Date(d));
  } else if (interval === 'monthly') {
    let cur = new Date(axisStart.getFullYear(), axisStart.getMonth(), 1);
    while (cur <= axisEnd) { points.push(new Date(cur)); cur.setMonth(cur.getMonth() + 1); }
  } else { // biweekly
    for (let d = new Date(axisStart); d <= axisEnd; d.setDate(d.getDate() + 14)) points.push(new Date(d));
  }

  const burnValues = points.map(d => {
    const consumed = filteredData.filter(r => r.date <= d).reduce((s, r) => s + r.hours, 0);
    return budget !== null ? Math.max(0, budget - consumed) : consumed;
  });

  let idealData = null;
  let totalBudgetEur = 0;
  if (budget !== null) {
    totalBudgetEur = cfg
      ? (taskFilter ? cfg.tasks : billableTasks(cfg)).reduce((s, t) => s + t.resources.reduce((ss, r) => ss + r.soldHours * r.hourlyRate, 0), 0)
      : 0;
    const usePhasingIdeal = !taskFilter && cfg?.phasing && Object.keys(cfg.phasing).length > 0 && totalBudgetEur > 0;
    idealData = points.map(d => {
      if (usePhasingIdeal) {
        let cumPhasing = 0;
        Object.entries(cfg.phasing).forEach(([ym, val]) => {
          const y = parseInt(ym.slice(0, 4)), m = parseInt(ym.slice(4, 6));
          if (new Date(y, m - 1, 1) <= d) cumPhasing += val;
        });
        return { y: parseFloat(Math.max(0, budget * (1 - cumPhasing / totalBudgetEur)).toFixed(2)), phasingEur: cumPhasing };
      } else {
        const span = axisEnd - axisStart, elapsed = d - axisStart;
        return { y: parseFloat(Math.max(0, budget * (1 - elapsed / span)).toFixed(2)), phasingEur: null };
      }
    });
  }

  let planningData = null;
  if (budget !== null && !taskFilter && cfg?.planning && Object.keys(cfg.planning).length > 0) {
    planningData = points.map(d => {
      let cumPlanning = 0;
      Object.entries(cfg.planning).forEach(([ym, val]) => {
        const y = parseInt(ym.slice(0, 4)), m = parseInt(ym.slice(4, 6));
        if (new Date(y, m - 1, 1) <= d) cumPlanning += val;
      });
      return parseFloat(Math.max(0, budget - cumPlanning).toFixed(2));
    });
  }

  const tooltipBudgetConsumed = cfg
    ? points.map(d => filteredData.filter(r => r.date <= d).reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0))
    : null;
  const tooltipPhasingEur = idealData ? idealData.map(v => v.phasingEur) : null;

  return {
    points, budget, axisStart, axisEnd, interval,
    burnValues,
    idealValues: idealData ? idealData.map(v => v.y) : null,
    hasPhasingEur: idealData ? idealData.some(v => v.phasingEur !== null) : false,
    planningData,
    totalBudgetEur,
    tooltipBudgetConsumed,
    tooltipPhasingEur,
    labels: interval === 'quarterly'
      ? points.map(d => `Q${Math.floor(d.getMonth() / 3) + 1} '${String(d.getFullYear()).slice(2)}`)
      : interval === 'monthly'
      ? points.map(d => d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }))
      : points.map(d => fmtDateLabel(d)), // weekly/biweekly — matches js/dashboard.js:211's real fmtDateLabel(d) call, not the brief's placeholder format
  };
}

window.computeKpis = computeKpis;
window.computeBurndownPoints = computeBurndownPoints;
