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

// Generic pivot builder shared by portfolio.html's "Summary by task/role/functional
// area" cards — extracted verbatim (Vue's `this.filterRange`/`this.dashboardProject`
// become explicit `filterRange`/`cfg` parameters) from the former Vue method of the
// same name. `entries` is the caller-built list of {key, label, soldHours, soldEur}
// columns; `byKeyFn(row)` must return the same string as an entry's own `key` for a
// row to count toward that column — callers decide whether that key is a single
// dimension (role, or task) or a composite one (`role + '|' + task`), this function
// itself is agnostic to which.
export function buildSummaryCols(rows, byKeyFn, entries, filterRange, cfg, findRate) {
  const { start, end } = filterRange;
  return entries.map(({ key, label, soldHours, soldEur }) => {
    const keyRows = rows.filter(r => byKeyFn(r) === key);
    const totalConsumed = keyRows.reduce((s, r) => s + r.hours, 0);
    const totalConsumedEur = keyRows.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0);
    const periodRows = keyRows.filter(r => (!start || r.date >= start) && (!end || r.date <= end));
    const inPeriod = periodRows.reduce((s, r) => s + r.hours, 0);
    const inPeriodEur = periodRows.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0);
    return { label, soldHours, soldEur, totalConsumed, totalConsumedEur, inPeriod, inPeriodEur };
  });
}

// Sums an array of buildSummaryCols() columns into the TOTAL column shown at the
// right edge of each summary card — agnostic to how the columns were grouped (single
// or composite key), so regrouping a card's key never requires a change here.
export function summaryTotals(cols, hasFilter) {
  const totSold = cols.reduce((s, c) => s + c.soldHours, 0);
  const totSoldEur = cols.reduce((s, c) => s + c.soldEur, 0);
  const totConsumed = cols.reduce((s, c) => s + c.totalConsumed, 0);
  const totConsumedEur = cols.reduce((s, c) => s + c.totalConsumedEur, 0);
  const totInPeriod = cols.reduce((s, c) => s + c.inPeriod, 0);
  const totInPeriodEur = cols.reduce((s, c) => s + c.inPeriodEur, 0);
  const totSpent = totConsumed - (hasFilter ? totInPeriod : 0);
  const totSpentEur = totConsumedEur - (hasFilter ? totInPeriodEur : 0);
  const totResidual = totSold - totConsumed;
  const totResidualEur = totSoldEur - totConsumedEur;
  return { totSold, totSoldEur, totSpent, totSpentEur, totInPeriod, totInPeriodEur, totResidual, totResidualEur };
}

// Functional-area group membership. A group's `entries` is the precise, current
// shape: [{role, task}], where task === '' means "any task" (a wildcard). Legacy
// projects only have `roles: string[]` (no task association at all) -- normalized
// here to wildcard entries so old group definitions keep working unchanged until
// someone re-edits them in project-config.html's per-(role,task) form. No DB
// migration needed: both shapes are read transparently through this one function.
export function normalizeGroupEntries(grp) {
  if (grp.entries && grp.entries.length) return grp.entries;
  return (grp.roles || []).map(role => ({ role, task: '' }));
}

// True if a timesheet row's (role, task) is claimed by one of a group's entries --
// case-insensitive on both, wildcard entries (task: '') match any task. This is
// the precision mechanism that replaces per-task column splitting for "Summary by
// functional area": a group can claim a role's hours on one task but not another
// (the Bayer case -- same role label, 168/h on Overall Coordination, 130/h on
// Project Management) by adding only the entry it actually wants, instead of the
// report having to guess by fragmenting its own output.
export function entryMatchesRow(entries, role, task) {
  const roleLower = (role || '').toLowerCase();
  const taskLower = (task || '').toLowerCase();
  return entries.some(e => (e.role || '').toLowerCase() === roleLower && (!e.task || e.task.toLowerCase() === taskLower));
}

// Currency code to show a total that sums several projects' amounts (which are in each project's own
// currency): the shared code when every project has the same one, else EUR (no single meaningful currency).
export function commonCurrency(cfgs) {
  const codes = new Set((cfgs || []).map(c => c.currency || 'EUR'));
  return codes.size === 1 ? [...codes][0] : 'EUR';
}

// Overview redesign (Cycle 1) — row model, card metrics and layout helpers for
// portfolio.html's Card/List views. See docs/superpowers/specs/2026-10-08-portfolio-overview-cycle1-views-design.md.

// Sorts a copy of `rows` ('client': clientName asc, then programs before projects
// within the same client, then name; 'name': name only, kind ignored). localeCompare
// throughout so an empty clientName sorts first without throwing.
export function buildPortfolioRows(rows, sortMode) {
  const copy = [...rows];
  if (sortMode === 'name') {
    return copy.sort((a, b) => a.name.localeCompare(b.name));
  }
  return copy.sort((a, b) => {
    const clientCmp = (a.clientName || '').localeCompare(b.clientName || '');
    if (clientCmp !== 0) return clientCmp;
    const kindCmp = (a.kind === 'program' ? 0 : 1) - (b.kind === 'program' ? 0 : 1);
    if (kindCmp !== 0) return kindCmp;
    return a.name.localeCompare(b.name);
  });
}

// Percentage of `sold` consumed by `spent`. null when there is nothing sold to
// measure against (Review Focus 4: sold > 0 and spent === 0 is 0%, not null).
export function spentPercent(spent, sold) {
  if (!sold || sold <= 0) return null;
  return Math.round((spent / sold) * 100);
}

// Bar color state for a spentPercent() result, thresholds from spec §6.3 (85/100).
export function spentBarState(pct) {
  if (pct === null || pct === undefined) return 'none';
  if (pct < 85) return 'normal';
  if (pct <= 100) return 'warning';
  return 'danger';
}

// Count of a program's children currently "Started At Risk" (exact spelling from
// js/lib/status-rules.js's statusFilterOptions).
export function programAtRisk(children) {
  return (children || []).filter(c => c.status === 'Started At Risk').length;
}

// Validates a stored 'PDash_portfolioLayout' value, falling back to 'card' for
// anything else (Review Focus 1: missing/invalid storage opens in Card, not blank).
export function readLayoutPreference(raw) {
  return raw === 'list' ? 'list' : 'card';
}

// Grid column count for a given container width, thresholds from spec §13.
export function columnsForWidth(width) {
  if (width >= 1000) return 3;
  if (width >= 640) return 2;
  return 1;
}

// Resolves the currently-expanded program id against the live row set (Review Focus
// 2: a program removed by a filter must not leave the children panel orphaned).
export function resolveExpandedProgramId(currentId, rows) {
  if (!currentId) return null;
  const stillPresent = (rows || []).some(r => r.kind === 'program' && r.id === currentId);
  return stillPresent ? currentId : null;
}

// Keeps the two views' expansion state in step when the layout switches. The Card shows
// one program at a time and the List several, so the mapping is asymmetric: going to the
// List adds the card's open program to the set (without closing the others), and coming
// back to the Card adopts the most recently opened one — a Set's iteration order is its
// insertion order, and re-opening a program re-adds it, so "last" means "most recent".
// The list's own set is never pruned, so switching back and forth loses nothing.
export function syncExpansionOnLayoutChange(layout, expandedProgramId, listExpandedIds) {
  const ids = [...(listExpandedIds || [])];
  if (layout === 'list') {
    if (expandedProgramId && !ids.includes(expandedProgramId)) ids.push(expandedProgramId);
    return { expandedProgramId, listExpandedIds: ids };
  }
  return { expandedProgramId: ids.length ? ids[ids.length - 1] : null, listExpandedIds: ids };
}

window.syncExpansionOnLayoutChange = syncExpansionOnLayoutChange;
window.buildPortfolioRows = buildPortfolioRows;
window.spentPercent = spentPercent;
window.spentBarState = spentBarState;
window.programAtRisk = programAtRisk;
window.readLayoutPreference = readLayoutPreference;
window.columnsForWidth = columnsForWidth;
window.resolveExpandedProgramId = resolveExpandedProgramId;

window.commonCurrency = commonCurrency;
window.computeKpis = computeKpis;
window.computeBurndownPoints = computeBurndownPoints;
window.buildSummaryCols = buildSummaryCols;
window.summaryTotals = summaryTotals;
window.normalizeGroupEntries = normalizeGroupEntries;
window.entryMatchesRow = entryMatchesRow;
