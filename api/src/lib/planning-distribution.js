'use strict';
// Rule primitives of the planning model — ports of js/lib/planning-calc.js and of the inline
// logic of planning.html's three views. Behaviour matches the browser except the deliberate
// Phase 2 change in phasedSeries (monthly distribution independent of the visible window).
const { getCalendarWeeks, utcDate, addDays } = require('./planning-calendar');

function matchesTaskRole(record, taskName, role) {
  const roleMatches = (record.role || '').toLowerCase() === (role || '').toLowerCase();
  const taskMatches = !taskName || (record.task || '').toLowerCase() === taskName.toLowerCase();
  return roleMatches && taskMatches;
}

function computeResidual(soldH, consumedH) { return Math.max(0, soldH - consumedH); }

// weeksByMonth: [{ monthKey, weekKeys: string[] }]. Uniform spread of the residual; pulse mode puts
// the whole month on its first week when the canonical hours/week is below 1.
function distributeFutureResidual(residualH, totalFutureWeeks, weeksByMonth, pulseEnabled) {
  const totalWeeks = weeksByMonth.reduce((s, m) => s + m.weekKeys.length, 0);
  const hPerWeek = totalFutureWeeks > 0 ? residualH / totalFutureWeeks
                 : (totalWeeks > 0 ? residualH / totalWeeks : 0);
  if (pulseEnabled && hPerWeek < 1) {
    return weeksByMonth.map(m => ({ key: m.weekKeys[0], hours: hPerWeek * m.weekKeys.length, isPulse: true }));
  }
  return weeksByMonth.flatMap(m => m.weekKeys.map(key => ({ key, hours: hPerWeek, isPulse: false })));
}

// ownerTotals: { name: actualsHours }; ownerStatus: { name: 'active'|'inactive' } (absent = active).
function redistributeExcludingInactive(ownerTotals, ownerStatus) {
  const eligible = Object.keys(ownerTotals).filter(n => (ownerStatus[n] || 'active') !== 'inactive');
  const eligibleTotal = eligible.reduce((s, n) => s + (ownerTotals[n] || 0), 0);
  if (eligible.length === 0 || eligibleTotal <= 0.01) return { props: {}, allInactive: true };
  const props = {};
  eligible.forEach(n => { props[n] = ownerTotals[n] / eligibleTotal; });
  return { props, allInactive: false };
}

// The task's own monthly distribution ({ 'YYYYMM': percent }) is used only when it sums to 100 (±0.5).
function hasValidPhasing(pDist) {
  if (!pDist) return false;
  const sum = Object.values(pDist).reduce((s, v) => s + v, 0);
  return Math.abs(sum - 100) < 0.5;
}

function ymOf(week) {
  return `${week.weekStart.getUTCFullYear()}${String(week.weekStart.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Future weeks of a task inside the months its monthly distribution covers (independent of any
// visible window). An undated task (end year 9999) is capped at the last month of the distribution.
// Upper bound on how far ahead a monthly-distribution key can push the enumeration (guards keys like '999912').
const MAX_FUTURE_DAYS = 20 * 366;

function taskFutureWeeks(tStart, tEnd, pDist, today) {
  const months = Object.keys(pDist || {}).filter(ym => /^\d{6}$/.test(ym)).sort();
  if (!months.length) return [];
  const last = months[months.length - 1];
  const distEndRaw = utcDate(parseInt(last.slice(0, 4), 10), parseInt(last.slice(4, 6), 10), 0); // last day of that month
  const horizon = addDays(today, MAX_FUTURE_DAYS);
  const distEnd = distEndRaw < horizon ? distEndRaw : horizon;
  const end = tEnd < distEnd ? tEnd : distEnd;
  const start = tStart > today ? tStart : today;
  if (end < start) return [];
  return getCalendarWeeks(start, end, today).filter(w => !w.isPast && w.weekEnd >= tStart && w.weekStart <= tEnd);
}

// PHASE 2: percentages are normalised over ALL future months of the task and hours per week use the
// full week count of each month; the visible window only decides which cells are emitted.
// fallbackWeekCount: () => number (canonical future-week count of the task).
function phasedSeries({ residualH, pDist, visibleFutureWeeks, allFutureWeeks, fallbackWeekCount }) {
  const byMonth = {};
  for (const w of allFutureWeeks) (byMonth[ymOf(w)] ||= []).push(w);
  const distTotal = Object.keys(byMonth).reduce((s, ym) => s + (pDist[ym] || 0), 0);
  if (distTotal < 0.01) {
    const count = fallbackWeekCount();
    const hPerWeek = count > 0 ? residualH / count : residualH / visibleFutureWeeks.length;
    return visibleFutureWeeks.map(w => ({ key: w.key, hours: hPerWeek }));
  }
  const visible = new Set(visibleFutureWeeks.map(w => w.key));
  const out = [];
  for (const [ym, mWeeks] of Object.entries(byMonth)) {
    const hPerWk = (residualH * ((pDist[ym] || 0) / distTotal)) / mWeeks.length;
    for (const w of mWeeks) if (visible.has(w.key)) out.push({ key: w.key, hours: hPerWk });
  }
  return out;
}

module.exports = {
  matchesTaskRole, computeResidual, distributeFutureResidual,
  redistributeExcludingInactive, hasValidPhasing, phasedSeries, taskFutureWeeks,
};
