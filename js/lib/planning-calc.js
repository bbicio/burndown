export function matchesTaskRole(record, taskName, role) {
  const roleMatches = (record.role || '').toLowerCase() === (role || '').toLowerCase();
  const taskMatches = !taskName || (record.task || '').toLowerCase() === taskName.toLowerCase();
  return roleMatches && taskMatches;
}

export function computeResidual(soldH, consumedH) {
  return Math.max(0, soldH - consumedH);
}

export function distributeFutureResidual(residualH, totalFutureWeeks, weeksByMonth, pulseEnabled) {
  const totalWeeks = weeksByMonth.reduce((s, m) => s + m.weekKeys.length, 0);
  const hPerWeek = totalFutureWeeks > 0 ? residualH / totalFutureWeeks
                 : (totalWeeks > 0 ? residualH / totalWeeks : 0);

  if (pulseEnabled && hPerWeek < 1) {
    return weeksByMonth.map(m => ({
      key: m.weekKeys[0],
      hours: hPerWeek * m.weekKeys.length,
      isPulse: true,
    }));
  }
  return weeksByMonth.flatMap(m => m.weekKeys.map(key => ({ key, hours: hPerWeek, isPulse: false })));
}

// ── CALENDAR WEEK HELPERS (relocated verbatim from js/planning.js:92-148) ────

// Count future weeks (Mon-based, weekEnd >= todayMidnight) that overlap the task range.
// Used to compute hPerWeek independently of the visible axis range so that
// adding/removing months from the view doesn't change per-period values.
export function countFutureTaskWeeks(tStart, tEnd, todayMidnight) {
  if (!tEnd || tEnd < todayMidnight) return 0;
  const effectiveStart = (tStart && tStart > todayMidnight) ? tStart : todayMidnight;
  const mon = new Date(effectiveStart);
  mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  let count = 0;
  for (let d = new Date(mon); d <= tEnd; d.setDate(d.getDate() + 7)) {
    const wEnd = new Date(d); wEnd.setDate(wEnd.getDate() + 6);
    if (wEnd >= todayMidnight && (!tStart || wEnd >= tStart)) count++;
  }
  return count;
}

export function getCalendarWeeks(startDate, endDate) {
  // Find the Monday on or before startDate
  const anchor = new Date(startDate);
  const dow = anchor.getDay();
  anchor.setDate(anchor.getDate() - (dow === 0 ? 6 : dow - 1));

  const weeks = [];
  const cur = new Date(anchor);
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  while (cur <= endDate) {
    const weekStart = new Date(cur);
    const weekEnd   = new Date(cur); weekEnd.setDate(weekEnd.getDate() + 6);

    const sDay = weekStart.getDate();
    const eDay = weekEnd.getDate();
    const sMon = weekStart.getMonth();
    const eMon = weekEnd.getMonth();

    let label;
    if (sMon === eMon) {
      label = `${String(sDay).padStart(2,'0')}-${String(eDay).padStart(2,'0')} ${monthNames[sMon]}`;
    } else {
      label = `${String(sDay).padStart(2,'0')} ${monthNames[sMon]}-${String(eDay).padStart(2,'0')} ${monthNames[eMon]}`;
    }

    const monthKey = `${monthNames[weekStart.getMonth()]} ${weekStart.getFullYear()}`;

    weeks.push({ weekStart: new Date(weekStart), weekEnd: new Date(weekEnd), label, monthKey });
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

export function workingDaysInWeek(week, taskStart, taskEnd) {
  let count = 0;
  const d = new Date(week.weekStart);
  while (d <= week.weekEnd) {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5 && d >= taskStart && d <= taskEnd) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// getMonthRangeFromCfg is a page global defined in js/portfolio.js (unchanged by this
// migration) — read via globalThis rather than imported, since js/portfolio.js is a
// classic (non-module) script and js/lib/ modules only import from sibling js/lib/
// modules, never from classic globals, per this codebase's established convention.
export function getPlanningPeriods(cfg, interval) {
  const months = globalThis.getMonthRangeFromCfg(cfg);
  if (!months.length) return [];

  if (interval === 'monthly') {
    return months.map(ym => {
      const y = parseInt(ym.slice(0,4)), m = parseInt(ym.slice(4,6));
      return { key: ym,
        label: new Date(y, m-1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        start: new Date(y, m-1, 1), end: new Date(y, m, 0) };
    });
  }

  // Weekly: enumerate Mondays from the week containing project start to project end
  const [fy, fm] = [parseInt(months[0].slice(0,4)), parseInt(months[0].slice(4,6))];
  const [ly, lm] = [parseInt(months[months.length-1].slice(0,4)), parseInt(months[months.length-1].slice(4,6))];
  const anchor = new Date(fy, fm-1, 1);
  const dow = anchor.getDay();
  anchor.setDate(anchor.getDate() - (dow === 0 ? 6 : dow - 1)); // back to Monday
  const projectEnd = new Date(ly, lm, 0);
  const weeks = [];
  const cur = new Date(anchor);
  while (cur <= projectEnd) {
    let we = new Date(cur); we.setDate(we.getDate() + 6);
    if (we > projectEnd) we = new Date(projectEnd);
    weeks.push({ key: `${cur.getFullYear()}${String(cur.getMonth()+1).padStart(2,'0')}${String(cur.getDate()).padStart(2,'0')}`,
      label: cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      start: new Date(cur), end: we });
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

window.matchesTaskRole = matchesTaskRole;
window.computeResidual = computeResidual;
window.distributeFutureResidual = distributeFutureResidual;
window.getCalendarWeeks = getCalendarWeeks;
window.workingDaysInWeek = workingDaysInWeek;
window.getPlanningPeriods = getPlanningPeriods;
window.countFutureTaskWeeks = countFutureTaskWeeks;
