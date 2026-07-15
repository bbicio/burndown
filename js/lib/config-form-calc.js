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

export function deriveDistribution(tasks, months, cfgStart, cfgEnd) {
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
        const tDays = Math.max(1, (tEnd - tStart) / 86400000 + 1);
        const oStart = new Date(Math.max(mStart, tStart));
        const oEnd = new Date(Math.min(mEnd, tEnd));
        const oDays = Math.max(0, (oEnd - oStart) / 86400000 + 1);
        if (oDays > 0) {
          const frac = oDays / tDays;
          budget += taskBudget * frac;
          hours += taskHours * frac;
        }
      }
    });
    if (budget > 0) newPhasing[ym] = Math.round(budget * 100) / 100;
    if (hours > 0) rawPlanning[ym] = hours;
  });

  const rawPlanningTotal = Object.values(rawPlanning).reduce((s, v) => s + v, 0);
  const newPlanning = rawPlanningTotal > 0 ? distributeHoursExact(rawPlanningTotal, rawPlanning) : {};
  const totalBudget = Object.values(newPhasing).reduce((s, v) => s + v, 0);
  const totalHours = Object.values(newPlanning).reduce((s, v) => s + v, 0);

  return { newPhasing, newPlanning, totalBudget, totalHours };
}

export function reforecastDistribution(tasks, months, actualsRows, currentYm) {
  const pastMonths = months.filter(ym => ym < currentYm);
  const futureMonths = months.filter(ym => ym >= currentYm);
  const norm = s => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const billableNames = new Set(tasks.map(t => norm(t.name)));

  const rateMap = {};
  tasks.forEach(t => {
    const tKey = norm(t.name);
    rateMap[tKey] = {};
    (t.resources || []).forEach(r => { if (r.role) rateMap[tKey][norm(r.role)] = r.hourlyRate || 0; });
  });

  const projData = actualsRows.filter(r => billableNames.has(norm(r.task)));
  const taskActuals = {};
  projData.forEach(r => {
    if (!r.date) return;
    const dateStr = typeof r.date === 'string' ? r.date : r.date.toISOString();
    const ym = dateStr.slice(0, 7).replace('-', '');
    const tName = norm(r.task);
    const rate = (rateMap[tName] || {})[norm(r.role)] ?? 0;
    if (!taskActuals[tName]) taskActuals[tName] = {};
    if (!taskActuals[tName][ym]) taskActuals[tName][ym] = { hours: 0, spend: 0 };
    taskActuals[tName][ym].hours += r.hours;
    taskActuals[tName][ym].spend += r.hours * rate;
  });

  const totalBudget = tasks.reduce((s, t) => s + t.resources.reduce((rs, r) => rs + (r.soldHours||0)*(r.hourlyRate||0), 0), 0);
  const totalHours = tasks.reduce((s, t) => s + t.resources.reduce((rs, r) => rs + (r.soldHours||0), 0), 0);

  const newPhasing = {}, newPlanning = {};
  let distError = null;

  for (const task of tasks) {
    const tName = norm(task.name);
    const tActuals = taskActuals[tName] || {};
    const taskBudget = task.resources.reduce((s, r) => s + (r.soldHours||0)*(r.hourlyRate||0), 0);
    const taskHours = task.resources.reduce((s, r) => s + (r.soldHours||0), 0);
    const dist = task.monthlyDistribution;
    const distSum = dist ? Object.values(dist).reduce((s, v) => s + v, 0) : 0;
    const useDist = dist && Math.abs(distSum - 100) < 0.5;

    const taskStartYM = task.startDate ? task.startDate.slice(0, 6) : months[0];
    const taskEndYM = task.endDate ? task.endDate.slice(0, 6) : months[months.length - 1];
    const taskFuture = futureMonths.filter(ym => ym >= taskStartYM && ym <= taskEndYM);
    const taskFutureCount = taskFuture.length || 1;

    const rawPastHrs = pastMonths.reduce((s, ym) => s + ((tActuals[ym] || {}).hours || 0), 0);
    const rawPastSpend = pastMonths.reduce((s, ym) => s + ((tActuals[ym] || {}).spend || 0), 0);
    const hrsScale = rawPastHrs > taskHours && taskHours > 0 ? taskHours / rawPastHrs : 1;
    const spendScale = rawPastSpend > taskBudget && taskBudget > 0 ? taskBudget / rawPastSpend : 1;
    const remainHrs = Math.max(0, taskHours - rawPastHrs);
    const remainBud = Math.max(0, taskBudget - rawPastSpend);

    if (useDist) {
      let deltaPct = 0;
      pastMonths.forEach(ym => {
        const actualHrs = ((tActuals[ym] || {}).hours || 0) * hrsScale;
        const actualBudget = ((tActuals[ym] || {}).spend || 0) * spendScale;
        const actualPct = taskBudget > 0 ? (actualBudget / taskBudget * 100) : 0;
        const plannedPct = dist[ym] || 0;
        deltaPct += plannedPct - actualPct;
        if (actualHrs > 0) newPlanning[ym] = (newPlanning[ym] || 0) + actualHrs;
        if (actualBudget > 0) newPhasing[ym] = (newPhasing[ym] || 0) + actualBudget;
      });
      if (taskFuture.length > 0) {
        const firstFuture = taskFuture[0];
        const adjustedPct = (dist[firstFuture] || 0) + deltaPct;
        if (adjustedPct > 100.5) {
          distError = `Task "${task.name}": carry-forward (${deltaPct.toFixed(1)}%) pushes ${firstFuture} above 100%.\nAdjust the monthly distribution manually before running Reforecast.`;
          break;
        }
        taskFuture.forEach((ym, i) => {
          const pct = (i === 0 ? adjustedPct : (dist[ym] || 0));
          const bud = taskBudget * pct / 100;
          const hrs = taskHours * pct / 100;
          if (bud > 0.01) newPhasing[ym] = (newPhasing[ym] || 0) + bud;
          if (hrs > 0.01) newPlanning[ym] = (newPlanning[ym] || 0) + hrs;
        });
      }
    } else {
      pastMonths.forEach(ym => {
        const hrs = ((tActuals[ym] || {}).hours || 0) * hrsScale;
        const bud = ((tActuals[ym] || {}).spend || 0) * spendScale;
        if (hrs > 0) newPlanning[ym] = (newPlanning[ym] || 0) + hrs;
        if (bud > 0) newPhasing[ym] = (newPhasing[ym] || 0) + bud;
      });
      taskFuture.forEach(ym => {
        if (remainBud > 0) newPhasing[ym] = (newPhasing[ym] || 0) + remainBud / taskFutureCount;
        if (remainHrs > 0) newPlanning[ym] = (newPlanning[ym] || 0) + remainHrs / taskFutureCount;
      });
    }
    if (distError) break;
  }

  if (distError) return { newPhasing: {}, newPlanning: {}, distError, remainingBudget: 0, remainingHours: 0, pastMonths, futureMonths };

  const pastYMs = new Set(pastMonths);
  Object.keys(newPhasing).forEach(ym => { if (!pastYMs.has(ym)) newPhasing[ym] = Math.round(newPhasing[ym] * 100) / 100; });

  const pastSpendTotal = Object.values(taskActuals).reduce((s, ta) => s + pastMonths.reduce((ps, ym) => ps + ((ta[ym]||{}).spend||0), 0), 0);
  const pastHrsTotal = Object.values(taskActuals).reduce((s, ta) => s + pastMonths.reduce((ps, ym) => ps + ((ta[ym]||{}).hours||0), 0), 0);
  const remainingBudget = totalBudget - pastSpendTotal;
  const remainingHours = totalHours - pastHrsTotal;

  const futureRawHours = {};
  futureMonths.forEach(ym => { if (newPlanning[ym] !== undefined) futureRawHours[ym] = newPlanning[ym]; });
  const futureRawHoursTotal = Object.values(futureRawHours).reduce((s, v) => s + v, 0);
  let distributedRemainingHours = remainingHours;
  if (futureRawHoursTotal > 0) {
    const distributedFuture = distributeHoursExact(futureRawHoursTotal, futureRawHours);
    Object.assign(newPlanning, distributedFuture);
    distributedRemainingHours = Object.values(distributedFuture).reduce((s, v) => s + v, 0);
  }

  return { newPhasing, newPlanning, distError: null, remainingBudget, remainingHours, distributedRemainingHours, pastMonths, futureMonths };
}

window.deriveDistribution = deriveDistribution;
window.reforecastDistribution = reforecastDistribution;
