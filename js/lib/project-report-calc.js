// Pure presentation math for portfolio.html's project reporting view (7.4 redesign):
// pace judgment, Breakdown rows, row subtitles, entries per month and the Today index.
// See docs/superpowers/specs/2026-10-15-project-reporting-redesign-design.md §4.

// ?v=7 matches portfolio.html's own <script src="js/lib/portfolio-calc.js?v=7"> tag (CLAUDE.md "Cache-busting").
import { spentPercent, spentBarState, normalizeGroupEntries, entryMatchesRow, buildSummaryCols, todayIndex } from './portfolio-calc.js?v=7';

function pad2(n) { return String(n).padStart(2, '0'); }
function ymOf(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }

// Same ±10 threshold as program-calc.js's needsAttention(), so a project cannot be
// "on track" here and "behind" on the Program Dashboard.
export function paceJudgment(vsTime, threshold = 10) {
  if (vsTime === null || vsTime === undefined) return null;
  if (vsTime > threshold) return 'ahead';
  if (vsTime < -threshold) return 'behind';
  return 'on-track';
}

// Two decimals, as fmtH() shows them: three 0.1h entries against 0.3h sold are on budget,
// not over sold by a float residue.
function r2(n) { return Math.round(n * 100) / 100 + 0; } // + 0 turns -0 into 0

function toRow(label, soldHours, soldAmount, totalConsumed, totalConsumedAmount, inPeriod, inPeriodAmount, hasFilter) {
  // No sold reference at all (a role logged on a task where it is not configured): "—" rather
  // than "Over sold", which stays reserved for a configured role sold 0 or fewer hours.
  if (soldHours === null) {
    return {
      label, soldHours, soldAmount, remainingHours: null, remainingAmount: null,
      spentHours: hasFilter ? inPeriod : totalConsumed,
      spentAmount: hasFilter ? inPeriodAmount : totalConsumedAmount,
      pct: null, barState: 'none', overSold: false, soldKnown: false,
    };
  }
  const pct = spentPercent(totalConsumed, soldHours);
  const overSold = r2(totalConsumed) > r2(soldHours);
  return {
    label,
    soldHours,
    soldAmount,
    spentHours: hasFilter ? inPeriod : totalConsumed,
    spentAmount: hasFilter ? inPeriodAmount : totalConsumedAmount,
    remainingHours: r2(soldHours - totalConsumed),
    remainingAmount: r2(soldAmount - totalConsumedAmount),
    pct,
    barState: overSold ? 'danger' : spentBarState(pct),
    overSold,
    soldKnown: true,
  };
}

// `cols` are buildSummaryCols()/summaryByGroup columns. Spent follows the period filter,
// Remaining and the consumption % always use the whole-project consumption.
// `totalCol` (optional): a column the Total is computed from instead of the sum of `cols` — the
// By area view, whose rows may overlap.
export function breakdownRows(cols, hasFilter, totalCol = null) {
  const list = cols || [];
  const rows = list.map(c => toRow(c.label, c.soldHours, c.soldEur, c.totalConsumed, c.totalConsumedEur, c.inPeriod, c.inPeriodEur, hasFilter));
  const sum = k => list.reduce((s, c) => s + (c[k] || 0), 0);
  const t = totalCol || { soldHours: sum('soldHours'), soldEur: sum('soldEur'), totalConsumed: sum('totalConsumed'), totalConsumedEur: sum('totalConsumedEur'), inPeriod: sum('inPeriod'), inPeriodEur: sum('inPeriodEur') };
  const total = toRow('Total', t.soldHours, t.soldEur, t.totalConsumed, t.totalConsumedEur, t.inPeriod, t.inPeriodEur, hasFilter);
  return { rows, total };
}

export function taskSubtitle(task, groups) {
  const resources = task.resources || [];
  const n = resources.length;
  const head = `${n} ${n === 1 ? 'role' : 'roles'}`;
  const areas = (groups || [])
    .filter(g => {
      const entries = normalizeGroupEntries(g);
      return resources.some(r => entryMatchesRow(entries, r.role, task.name));
    })
    .map(g => g.name);
  return [head, ...areas].join(' · ');
}

// `rows` are the project's timesheet entries; the match is case-insensitive.
export function roleSubtitle(role, task, rows) {
  const roleLower = (role || '').toLowerCase();
  const taskLower = (task || '').toLowerCase();
  const matching = (rows || []).filter(r => (r.role || '').toLowerCase() === roleLower && (r.task || '').toLowerCase() === taskLower);
  if (!matching.length) return task;
  const owners = [...new Set(matching.map(r => r.owner).filter(Boolean))];
  const taskName = matching[0].task;
  return owners.length ? `${owners.join(', ')} · ${taskName}` : taskName;
}

export function groupSubtitle(group, tasks) {
  const entries = normalizeGroupEntries(group);
  return (tasks || [])
    .filter(t => (t.resources || []).some(r => entryMatchesRow(entries, r.role, t.name)))
    .map(t => t.name)
    .join(', ');
}

// Months most recent first, rows by ascending date. `rateFor(row)` returns the row's
// hourly rate or null (role not configured on the task): such a row has amount null and
// the month total sums only the known amounts.
export function entriesByMonth(rows, rateFor) {
  const byYm = new Map();
  for (const r of rows || []) {
    const ym = ymOf(r.date);
    if (!byYm.has(ym)) byYm.set(ym, []);
    const rate = rateFor(r);
    byYm.get(ym).push({ ...r, amount: rate === null || rate === undefined ? null : r.hours * rate });
  }
  return [...byYm.keys()].sort().reverse().map(ym => {
    const list = byYm.get(ym).sort((a, b) => a.date - b.date);
    return {
      ym,
      count: list.length,
      hours: list.reduce((s, r) => s + r.hours, 0),
      amount: list.reduce((s, r) => s + (r.amount ?? 0), 0),
      rows: list,
    };
  });
}

export function hoursByMonth(rows) {
  const out = {};
  for (const r of rows || []) {
    const ym = ymOf(r.date);
    out[ym] = (out[ym] || 0) + r.hours;
  }
  return out;
}

// `ym` as 'YYYYMM' or 'YYYY-MM'.
export function monthState(ym, today) {
  const key = String(ym).replace('-', '');
  const cur = `${today.getFullYear()}${pad2(today.getMonth() + 1)}`;
  if (key === cur) return 'current';
  return key < cur ? 'past' : 'future';
}

// todayIndex() lives in portfolio-calc.js (computeBurndownPoints needs it); re-exported here
// so this module's callers and the window.todayIndex bridge are unchanged.
export { todayIndex } from './portfolio-calc.js?v=7';

// The rows the Breakdown counts: billable, and with a task name By task can match (lower-case
// equality, as summaryByTask and findRate do). billableData() alone also collapses whitespace and
// keeps every row of a project with no tasks; By role and By area would then count rows By task
// cannot, and the three Totals would disagree (review round 1).
function reportRows(data, cfg, deps) {
  const names = new Set(deps.billableTasks(cfg).map(t => t.name.toLowerCase()));
  return deps.billableData(data, cfg).filter(r => names.has((r.task || '').toLowerCase()));
}

// Breakdown "By role" columns. `deps` = { billableData, billableTasks, findRate } (js/core.js globals).
// Composite key (role + task): a role sold at a different rate_override on two
// different tasks (task_roles is per (task, role), not a single global rate per
// role — verified on the Bayer AG "BERMITS Maintenance 2026" project, where
// "Account Director" resolves to 168/h on "Overall Coordination" and, via
// findRate()'s task-scoped fallback, 130/h on "Project Management") previously
// landed in ONE blended column here, summing hours billed at two different rates
// under a single total that could never be reconciled against the cost grid.
// Splitting the key by task keeps every column internally consistent (one rate).
export function roleColumns(data, cfg, filterRange, deps) {
  const { billableTasks, findRate } = deps;
  const roleTaskMap = new Map();
  billableTasks(cfg).forEach(t => t.resources.forEach(res => {
    const key = res.role.toLowerCase() + '|' + t.name.toLowerCase();
    if (!roleTaskMap.has(key)) roleTaskMap.set(key, { key, label: `${res.role} — ${t.name}`, role: res.role, task: t.name, soldHours: 0, soldEur: 0 });
    roleTaskMap.get(key).soldHours += res.soldHours;
    roleTaskMap.get(key).soldEur += res.soldHours * res.hourlyRate;
  }));
  const bData = reportRows(data, cfg, deps);
  const byKeyFn = r => r.role.toLowerCase() + '|' + r.task.toLowerCase();
  // Pairs logged but not configured (B-073): one column each, no sold reference, after the
  // configured ones in task order then role order, so the Total matches By task.
  const taskOrder = new Map(billableTasks(cfg).map((t, i) => [t.name.toLowerCase(), i]));
  const extra = new Map();
  bData.forEach(r => {
    const key = byKeyFn(r);
    if (!roleTaskMap.has(key) && !extra.has(key)) extra.set(key, { key, label: `${r.role} — ${r.task}`, role: r.role, task: r.task, soldHours: null, soldEur: null });
  });
  const extraSorted = [...extra.values()].sort((a, b) =>
    (taskOrder.get(a.task.toLowerCase()) ?? Infinity) - (taskOrder.get(b.task.toLowerCase()) ?? Infinity)
    || a.role.toLowerCase().localeCompare(b.role.toLowerCase()));
  const entries = [...roleTaskMap.values(), ...extraSorted];
  // role/task carried alongside each column for the Breakdown's By role rows (label and subtitle).
  return buildSummaryCols(bData, byKeyFn, entries, filterRange, cfg, findRate)
    .map((c, i) => ({ ...c, role: entries[i].role, task: entries[i].task }));
}

// Breakdown "By functional area" columns, one per group. Correctness comes from each group's own
// `entries: [{role, task}]` (normalizeGroupEntries()/entryMatchesRow(), js/lib/portfolio-calc.js),
// not from splitting the output by task: a group can claim a role's hours on one specific task
// while leaving another task's hours for the same role out entirely (the Bayer case —
// "HWGACCSVS - DIRECTOR" billed at 168/h on Overall Coordination vs 130/h on Project Management).
// Legacy groups with only `roles: string[]` normalize to wildcard entries (task: '') and sum
// across every task.
export function areaColumns(data, cfg, filterRange, deps) {
  const { billableTasks, findRate } = deps;
  const bData = reportRows(data, cfg, deps);
  const bTasks = billableTasks(cfg);
  const groupEntries = cfg.groups.map(normalizeGroupEntries);
  const cols = cfg.groups.map((grp, i) => areaColumn(grp.name,
    res => entryMatchesRow(groupEntries[i], res.role, res.task),
    bData, bTasks, filterRange, cfg, findRate));
  // What no group claims (B-073), shown only when there is something in it.
  const unclaimed = x => !groupEntries.some(e => entryMatchesRow(e, x.role, x.task));
  const ungrouped = areaColumn('Ungrouped', unclaimed, bData, bTasks, filterRange, cfg, findRate);
  if (ungrouped.soldHours > 0 || ungrouped.totalConsumed > 0) cols.push({ ...ungrouped, ungrouped: true });
  return cols;
}

// The By area Total: every billable resource and entry counted once, whatever the overlaps.
export function areaTotalColumn(data, cfg, filterRange, deps) {
  const { billableTasks, findRate } = deps;
  return areaColumn('Total', () => true, reportRows(data, cfg, deps), billableTasks(cfg), filterRange, cfg, findRate);
}

// True when a billable resource or entry is claimed by two or more groups.
export function areaOverlap(data, cfg, deps) {
  const { billableTasks } = deps;
  const groupEntries = (cfg.groups || []).map(normalizeGroupEntries);
  const claims = (role, task) => groupEntries.filter(e => entryMatchesRow(e, role, task)).length;
  return billableTasks(cfg).some(t => t.resources.some(res => claims(res.role, t.name) > 1))
    || reportRows(data, cfg, deps).some(r => claims(r.role, r.task) > 1);
}

// One area column: `claims({role, task})` selects the resources (with their task name) and the entries.
function areaColumn(label, claims, bData, bTasks, filterRange, cfg, findRate) {
  const { start, end } = filterRange;
  let soldHours = 0, soldEur = 0;
  bTasks.forEach(task => task.resources.forEach(res => {
    if (claims({ role: res.role, task: task.name })) { soldHours += res.soldHours; soldEur += res.soldHours * res.hourlyRate; }
  }));
  const rows = bData.filter(r => claims(r));
  const totalConsumed = rows.reduce((s, r) => s + r.hours, 0);
  const totalConsumedEur = rows.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0);
  const periodRows = rows.filter(r => (!start || r.date >= start) && (!end || r.date <= end));
  const inPeriod = periodRows.reduce((s, r) => s + r.hours, 0);
  const inPeriodEur = periodRows.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0);
  return { label, soldHours, soldEur, totalConsumed, totalConsumedEur, inPeriod, inPeriodEur };
}

window.paceJudgment = paceJudgment;
window.breakdownRows = breakdownRows;
window.taskSubtitle = taskSubtitle;
window.roleSubtitle = roleSubtitle;
window.groupSubtitle = groupSubtitle;
window.entriesByMonth = entriesByMonth;
window.hoursByMonth = hoursByMonth;
window.monthState = monthState;
window.roleColumns = roleColumns;
window.areaColumns = areaColumns;
window.areaTotalColumn = areaTotalColumn;
window.areaOverlap = areaOverlap;
window.todayIndex = todayIndex;
