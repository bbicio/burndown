import { distributeHoursExact } from './cfg-parse.js';

// Verbatim port of `parseTaskDate` in js/core.js (lines 255-262), the function
// actually called by cfgDerivePhasing/cfgReforecast. For a full 8-char YYYYMMDD
// string, `isEnd` is intentionally ignored (both start and end resolve to
// midnight of that literal day). Only the 6-char YYYYMM fallback (cfgStart/
// cfgEnd, task lacking its own dates) branches on `isEnd` to pick first-of-month
// vs. last-of-month.
function parseTaskDateLocal(str, isEnd) {
  if (!str) return isEnd ? new Date(9999, 11, 31) : new Date(0);
  if (str.length >= 8) {
    return new Date(parseInt(str.slice(0, 4)), parseInt(str.slice(4, 6)) - 1, parseInt(str.slice(6, 8)));
  }
  const y = parseInt(str.slice(0, 4)), m = parseInt(str.slice(4, 6));
  return isEnd ? new Date(y, m, 0) : new Date(y, m - 1, 1);
}

// Rounds a money amount to the currency's decimals (halves go up); each month is rounded on its own.
function round(v, digits) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

export function deriveDistribution(tasks, months, cfgStart, cfgEnd, digits = 2) {
  const newPhasing = {}, rawPlanning = {};
  months.forEach(ym => {
    const [y, m] = [parseInt(ym.slice(0,4)), parseInt(ym.slice(4,6))];
    const mStart = new Date(y, m - 1, 1);
    const mEnd = new Date(y, m, 0);
    let budget = 0, hours = 0;
    tasks.forEach(task => {
      const taskBudget = task.resources.reduce((s, r) => s + (r.soldHours || 0) * (r.hourlyRate || 0), 0);
      const taskHours = task.resources.reduce((s, r) => s + (r.soldHours || 0), 0);
      const dist = task.monthlyDistribution;
      const distSum = dist ? Object.values(dist).reduce((s, v) => s + v, 0) : 0;
      if (dist && Math.abs(distSum - 100) < 0.5) {
        const pct = (dist[ym] || 0) / 100;
        budget += taskBudget * pct;
        hours += taskHours * pct;
      } else {
        const tStart = parseTaskDateLocal(task.startDate || cfgStart, false);
        const tEnd = parseTaskDateLocal(task.endDate || cfgEnd, true);
        const tDays = Math.max(1, Math.round((tEnd - tStart) / 86400000) + 1);
        const oStart = new Date(Math.max(mStart, tStart));
        const oEnd = new Date(Math.min(mEnd, tEnd));
        const oDays = Math.max(0, Math.round((oEnd - oStart) / 86400000) + 1);
        if (oDays > 0) {
          const frac = oDays / tDays;
          budget += taskBudget * frac;
          hours += taskHours * frac;
        }
      }
    });
    if (budget > 0) newPhasing[ym] = round(budget, digits);
    if (hours > 0) rawPlanning[ym] = hours;
  });

  // Dates C3: the part of a task without a valid monthly distribution that lies outside `months`.
  let outsideBudget = 0, outsideHours = 0;
  if (months.length) {
    const first = new Date(parseInt(months[0].slice(0, 4)), parseInt(months[0].slice(4, 6)) - 1, 1);
    const last = new Date(parseInt(months[months.length - 1].slice(0, 4)), parseInt(months[months.length - 1].slice(4, 6)), 0);
    tasks.forEach(task => {
      const dist = task.monthlyDistribution;
      const distSum = dist ? Object.values(dist).reduce((s, v) => s + v, 0) : 0;
      if (dist && Math.abs(distSum - 100) < 0.5) return;
      const tStart = parseTaskDateLocal(task.startDate || cfgStart, false);
      const tEnd = parseTaskDateLocal(task.endDate || cfgEnd, true);
      const tDays = Math.max(1, Math.round((tEnd - tStart) / 86400000) + 1);
      const oDays = Math.max(0, Math.round((Math.min(last, tEnd) - Math.max(first, tStart)) / 86400000) + 1);
      const frac = Math.max(0, tDays - oDays) / tDays;
      if (frac <= 0) return;
      outsideBudget += task.resources.reduce((s, r) => s + (r.soldHours || 0) * (r.hourlyRate || 0), 0) * frac;
      outsideHours += task.resources.reduce((s, r) => s + (r.soldHours || 0), 0) * frac;
    });
  }

  const rawPlanningTotal = Object.values(rawPlanning).reduce((s, v) => s + v, 0);
  const newPlanning = rawPlanningTotal > 0 ? distributeHoursExact(rawPlanningTotal, rawPlanning) : {};
  const totalBudget = Object.values(newPhasing).reduce((s, v) => s + v, 0);
  const totalHours = Object.values(newPlanning).reduce((s, v) => s + v, 0);

  return { newPhasing, newPlanning, totalBudget, totalHours, outsideBudget, outsideHours };
}

// Past months get the true actuals; the open months (current and later) get the project's net remaining,
// split between the tasks still open in proportion to their own margin. Hours and money use separate keys.
export function reforecastDistribution(tasks, months, actualsRows, currentYm, digits = 2) {
  const pastMonths = months.filter(ym => ym < currentYm);
  const futureMonths = months.filter(ym => ym >= currentYm);
  const monthSet = new Set(months);
  const norm = s => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const billableNames = new Set(tasks.map(t => norm(t.name)));

  const rateMap = {};
  tasks.forEach(t => {
    const tKey = norm(t.name);
    rateMap[tKey] = { roles: {}, first: (t.resources || [])[0]?.hourlyRate ?? 0 };
    (t.resources || []).forEach(r => { if (r.role) rateMap[tKey].roles[norm(r.role)] = r.hourlyRate || 0; });
  });

  const newPhasing = {}, newPlanning = {};
  const consumed = {};
  actualsRows.forEach(r => {
    const tName = norm(r.task);
    if (!billableNames.has(tName) || !r.date) return;
    const dateStr = typeof r.date === 'string' ? r.date : r.date.toISOString();
    const ym = dateStr.slice(0, 7).replace('-', '');
    const rates = rateMap[tName];
    const rate = rates.roles[norm(r.role)] ?? rates.first ?? 0;
    const hours = r.hours || 0;
    const spend = hours * rate;
    if (!consumed[tName]) consumed[tName] = { hours: 0, spend: 0 };
    consumed[tName].hours += hours;
    consumed[tName].spend += spend;
    if (!monthSet.has(ym)) return;
    newPlanning[ym] = (newPlanning[ym] || 0) + hours;
    newPhasing[ym] = (newPhasing[ym] || 0) + spend;
  });
  // Correction rows net inside their month; a month that still nets negative is carried onto the earlier months,
  // then onto the later ones, so the written actuals add up to what was consumed. Hours and money separately.
  [newPlanning, newPhasing].forEach(m => {
    months.forEach((ym, i) => {
      if (!(m[ym] < 0)) return;
      for (let j = i - 1; j >= 0 && m[ym] < 0; j--) {
        const take = Math.min(m[months[j]] || 0, -m[ym]);
        if (take > 0) { m[months[j]] -= take; m[ym] += take; }
      }
      if (m[ym] < 0 && i + 1 < months.length) { m[months[i + 1]] = (m[months[i + 1]] || 0) + m[ym]; m[ym] = 0; }
    });
  });
  const openActualHours = futureMonths.reduce((s, ym) => s + Math.max(0, newPlanning[ym] || 0), 0);

  const sold = tasks.map(t => ({
    hours: (t.resources || []).reduce((s, r) => s + (r.soldHours || 0), 0),
    spend: (t.resources || []).reduce((s, r) => s + (r.soldHours || 0) * (r.hourlyRate || 0), 0),
  }));
  const soldHours = sold.reduce((s, v) => s + v.hours, 0);
  const soldBudget = sold.reduce((s, v) => s + v.spend, 0);
  const consumedHours = Object.values(consumed).reduce((s, v) => s + v.hours, 0);
  const consumedBudget = Object.values(consumed).reduce((s, v) => s + v.spend, 0);
  const remainingHours = Math.max(0, soldHours - consumedHours);
  const remainingBudget = Math.max(0, soldBudget - consumedBudget);

  // Recipients: tasks with at least one open month inside their own dates.
  const recipients = [];
  tasks.forEach((task, i) => {
    const taskStartYM = task.startDate ? task.startDate.slice(0, 6) : months[0];
    const taskEndYM = task.endDate ? task.endDate.slice(0, 6) : months[months.length - 1];
    const open = futureMonths.filter(ym => ym >= taskStartYM && ym <= taskEndYM);
    if (!open.length) return;
    const used = consumed[norm(task.name)] || { hours: 0, spend: 0 };
    const dist = task.monthlyDistribution;
    const distSum = dist ? Object.values(dist).reduce((s, v) => s + v, 0) : 0;
    const openPct = dist && Math.abs(distSum - 100) < 0.5 ? open.reduce((s, ym) => s + (dist[ym] || 0), 0) : 0;
    recipients.push({
      open,
      weights: openPct > 0 ? open.map(ym => (dist[ym] || 0) / openPct) : open.map(() => 1 / open.length),
      margin: { hours: Math.max(0, sold[i].hours - used.hours), spend: Math.max(0, sold[i].spend - used.spend) },
    });
  });

  const spread = (target, key, net) => {
    if (net <= 0) return;
    const marginSum = recipients.reduce((s, r) => s + r.margin[key], 0);
    if (marginSum > 0) {
      recipients.forEach(r => {
        const share = net * r.margin[key] / marginSum;
        if (share > 0) r.open.forEach((ym, j) => { target[ym] = (target[ym] || 0) + share * r.weights[j]; });
      });
    } else if (futureMonths.length) {
      futureMonths.forEach(ym => { target[ym] = (target[ym] || 0) + net / futureMonths.length; });
    }
  };
  spread(newPhasing, 'spend', remainingBudget);
  spread(newPlanning, 'hours', remainingHours);
  [newPlanning, newPhasing].forEach(m => Object.keys(m).forEach(ym => { if (!(m[ym] > 1e-9)) delete m[ym]; }));

  Object.keys(newPhasing).forEach(ym => { newPhasing[ym] = round(newPhasing[ym], digits); });

  const futureRawHours = {};
  futureMonths.forEach(ym => { if (newPlanning[ym] !== undefined) futureRawHours[ym] = newPlanning[ym]; });
  const futureRawHoursTotal = Object.values(futureRawHours).reduce((s, v) => s + v, 0);
  // The net remaining as it lands in the grid: the open months after rounding, less their own actuals.
  let distributedRemainingHours = 0;
  if (futureRawHoursTotal > 0) {
    const distributedFuture = distributeHoursExact(futureRawHoursTotal, futureRawHours);
    Object.assign(newPlanning, distributedFuture);
    const distributedTotal = Object.values(distributedFuture).reduce((s, v) => s + v, 0);
    distributedRemainingHours = Math.max(0, round(distributedTotal - openActualHours, 2));
  }

  return {
    newPhasing, newPlanning, distError: null, remainingBudget, remainingHours, distributedRemainingHours, pastMonths, futureMonths,
    consumedBudget, consumedHours, soldBudget, soldHours,
    // Compared at the currency's decimals and at 0.01 h, so floating-point noise is not an overrun.
    overBudget: round(consumedBudget, digits) > round(soldBudget, digits), overHours: round(consumedHours, 2) > round(soldHours, 2),
  };
}

// Dates C4 (B-158): the distribution a task keeps for a month list. An empty list keeps it untouched only for an
// inverted range (the user is still editing the dates); a cleared date resets it, as before.
export function keepDistribution(dist, months, inverted = false) {
  if (!months.length) return inverted ? { ...(dist || {}) } : {};
  const kept = {};
  months.forEach(ym => { if (dist?.[ym] != null) kept[ym] = dist[ym]; });
  if (months.length === 1) kept[months[0]] = 100;
  return kept;
}

// True when the project no longer matches its last loaded/saved JSON snapshot; no snapshot or no project means nothing to lose.
export function isProjectDirty(savedJson, project) {
  if (savedJson == null || project == null) return false;
  return JSON.stringify(project) !== savedJson;
}

// Redesign (2026-11-02): an even monthly split, two decimals per month, the last month takes the rounding.
export function spreadEvenly(months) {
  const out = {};
  if (!months.length) return out;
  const each = Math.floor(10000 / months.length) / 100;
  months.slice(0, -1).forEach(ym => { out[ym] = each; });
  out[months[months.length - 1]] = round(100 - each * (months.length - 1), 2);
  return out;
}

// The state of a task's monthly split over its months: valid within 0.5 of 100 (the calculations' rule), shown as 100% within 0.05.
export function splitState(distribution, months) {
  const sum = round(months.reduce((s, ym) => s + (Number(distribution?.[ym]) || 0), 0), 4);
  const valid = Math.abs(sum - 100) <= 0.5;
  if (sum === 0) return { sum, valid: false, label: 'Not split · 100% missing', tone: 'warn' };
  if (Math.abs(sum - 100) < 0.05) return { sum, valid, label: '100%', tone: 'ok' };
  if (sum > 100) return { sum, valid, label: (sum - 100).toFixed(1) + '% too much', tone: 'danger' };
  return { sum, valid, label: (100 - sum).toFixed(1) + '% missing', tone: 'warn' };
}

// Whether a phasing series adds up to its total, to half a unit of the last decimal shown per month: Derive rounds
// each month on its own, so a series of `months` values may drift by up to that much; diff = total - sum.
export function phasingBalance(sum, total, decimals, months = 1) {
  const diff = round(total - sum, decimals) || 0;
  return { balanced: Math.abs(sum - total) < 0.5 * 10 ** -decimals * Math.max(1, months), diff };
}

// The sum of values[ym] over the given months only: a month key saved outside the project period (left there
// when the period was narrowed) is not part of what the form shows, so it is not part of its sums.
export function sumWithinMonths(values, months) {
  let sum = 0;
  for (const ym of months || []) {
    const v = values?.[ym];
    if (typeof v === 'number' && Number.isFinite(v)) sum += v;
  }
  return sum;
}

window.deriveDistribution = deriveDistribution;
window.reforecastDistribution = reforecastDistribution;
window.isProjectDirty = isProjectDirty;
window.keepDistribution = keepDistribution;
window.spreadEvenly = spreadEvenly;
window.splitState = splitState;
window.phasingBalance = phasingBalance;
window.sumWithinMonths = sumWithinMonths;
