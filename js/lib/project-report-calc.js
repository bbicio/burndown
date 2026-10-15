// Pure presentation math for portfolio.html's project reporting view (7.4 redesign):
// pace judgment, Breakdown rows, row subtitles, entries per month and the Today index.
// See docs/superpowers/specs/2026-10-15-project-reporting-redesign-design.md §4.

// ?v=6 matches portfolio.html's own <script src="js/lib/portfolio-calc.js?v=6"> tag (CLAUDE.md "Cache-busting").
import { spentPercent, spentBarState, normalizeGroupEntries, entryMatchesRow, buildSummaryCols, todayIndex } from './portfolio-calc.js?v=6';

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
export function breakdownRows(cols, hasFilter) {
  const list = cols || [];
  const rows = list.map(c => toRow(c.label, c.soldHours, c.soldEur, c.totalConsumed, c.totalConsumedEur, c.inPeriod, c.inPeriodEur, hasFilter));
  const sum = k => list.reduce((s, c) => s + (c[k] || 0), 0);
  const total = toRow('Total', sum('soldHours'), sum('soldEur'), sum('totalConsumed'), sum('totalConsumedEur'), sum('inPeriod'), sum('inPeriodEur'), hasFilter);
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
export { todayIndex } from './portfolio-calc.js?v=6';

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
  const { billableData, billableTasks, findRate } = deps;
  const roleTaskMap = new Map();
  billableTasks(cfg).forEach(t => t.resources.forEach(res => {
    const key = res.role.toLowerCase() + '|' + t.name.toLowerCase();
    if (!roleTaskMap.has(key)) roleTaskMap.set(key, { key, label: `${res.role} — ${t.name}`, role: res.role, task: t.name, soldHours: 0, soldEur: 0 });
    roleTaskMap.get(key).soldHours += res.soldHours;
    roleTaskMap.get(key).soldEur += res.soldHours * res.hourlyRate;
  }));
  const bData = billableData(data, cfg);
  const byKeyFn = r => r.role.toLowerCase() + '|' + r.task.toLowerCase();
  const entries = [...roleTaskMap.values()];
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
  const { billableData, billableTasks, findRate } = deps;
  const bData = billableData(data, cfg);
  const bTasks = billableTasks(cfg);
  const { start, end } = filterRange;
  return cfg.groups.map(grp => {
    const grpEntries = normalizeGroupEntries(grp);
    let soldHours = 0, soldEur = 0;
    bTasks.forEach(task => task.resources.forEach(res => {
      if (entryMatchesRow(grpEntries, res.role, task.name)) { soldHours += res.soldHours; soldEur += res.soldHours * res.hourlyRate; }
    }));
    const grpRows = bData.filter(r => entryMatchesRow(grpEntries, r.role, r.task));
    const totalConsumed = grpRows.reduce((s, r) => s + r.hours, 0);
    const totalConsumedEur = grpRows.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0);
    const periodRows = grpRows.filter(r => (!start || r.date >= start) && (!end || r.date <= end));
    const inPeriod = periodRows.reduce((s, r) => s + r.hours, 0);
    const inPeriodEur = periodRows.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0);
    return { label: grp.name, soldHours, soldEur, totalConsumed, totalConsumedEur, inPeriod, inPeriodEur };
  });
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
window.todayIndex = todayIndex;
