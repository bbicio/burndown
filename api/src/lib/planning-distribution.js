'use strict';
// Rule primitives of the planning model — ports of js/lib/planning-calc.js and of the inline
// logic of planning.html's three views. Keep behaviour identical (Phase 1 = zero visible change).

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

// PHASE 1 (parity): the percentages are normalised over the months of the *visible* future weeks
// (this is the browser's window-dependent behaviour; Task 17 replaces it on purpose).
// fallbackWeekCount: () => number (canonical future-week count of the task).
function phasedSeries({ residualH, pDist, futureWeeks, fallbackWeekCount }) {
  const byMonth = {};
  for (const w of futureWeeks) (byMonth[ymOf(w)] ||= []).push(w);
  const futureDistTotal = Object.keys(byMonth).reduce((s, ym) => s + (pDist[ym] || 0), 0);
  if (futureDistTotal < 0.01) {
    const count = fallbackWeekCount();
    const hPerWeek = count > 0 ? residualH / count : residualH / futureWeeks.length;
    return futureWeeks.map(w => ({ key: w.key, hours: hPerWeek }));
  }
  const out = [];
  for (const [ym, mWeeks] of Object.entries(byMonth)) {
    const mHours = residualH * ((pDist[ym] || 0) / futureDistTotal);
    const hPerWk = mHours / mWeeks.length;
    for (const w of mWeeks) out.push({ key: w.key, hours: hPerWk });
  }
  return out;
}

module.exports = {
  matchesTaskRole, computeResidual, distributeFutureResidual,
  redistributeExcludingInactive, hasValidPhasing, phasedSeries,
};
