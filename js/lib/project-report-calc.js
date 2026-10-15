// Pure presentation math for portfolio.html's project reporting view (7.4 redesign):
// pace judgment, Breakdown rows, row subtitles, entries per month and the Today index.
// See docs/superpowers/specs/2026-10-15-project-reporting-redesign-design.md §4.

// ?v=5 matches portfolio.html's own <script src="js/lib/portfolio-calc.js?v=5"> tag (CLAUDE.md "Cache-busting").
import { spentPercent, spentBarState, normalizeGroupEntries, entryMatchesRow } from './portfolio-calc.js?v=5';

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

function toRow(label, soldHours, soldAmount, totalConsumed, totalConsumedAmount, inPeriod, inPeriodAmount, hasFilter) {
  const pct = spentPercent(totalConsumed, soldHours);
  const overSold = totalConsumed > soldHours;
  return {
    label,
    soldHours,
    soldAmount,
    spentHours: hasFilter ? inPeriod : totalConsumed,
    spentAmount: hasFilter ? inPeriodAmount : totalConsumedAmount,
    remainingHours: soldHours - totalConsumed,
    remainingAmount: soldAmount - totalConsumedAmount,
    pct,
    barState: overSold ? 'danger' : spentBarState(pct),
    overSold,
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

// Index of the last axis point on or before today; null before the axis, or beyond the
// last point by more than one interval (31 days with a single point).
export function todayIndex(points, today) {
  if (!points || !points.length || !today) return null;
  let idx = null;
  for (let i = 0; i < points.length; i++) if (points[i] <= today) idx = i;
  if (idx === null) return null;
  const last = points.length - 1;
  if (idx === last) {
    const step = points.length > 1 ? points[last] - points[last - 1] : 31 * 24 * 3600 * 1000;
    if (today - points[last] > step) return null;
  }
  return idx;
}

window.paceJudgment = paceJudgment;
window.breakdownRows = breakdownRows;
window.taskSubtitle = taskSubtitle;
window.roleSubtitle = roleSubtitle;
window.groupSubtitle = groupSubtitle;
window.entriesByMonth = entriesByMonth;
window.hoursByMonth = hoursByMonth;
window.monthState = monthState;
window.todayIndex = todayIndex;
