'use strict';
// Planning model (Cycle A): pure, DB-free projections of projects + actuals into what the three
// views of planning.html render. Ports of the calculation blocks of byRoleView / byProjectView /
// byOwnerView. The three views deliberately keep DIFFERENT rules (spec §4) — do not unify them.
const { isoDate, parseTaskDate, makeFutureWeekCounter } = require('./planning-calendar');
const {
  matchesTaskRole, computeResidual, distributeFutureResidual,
  redistributeExcludingInactive, hasValidPhasing, phasedSeries,
} = require('./planning-distribution');

const PLACEHOLDER = '—'; // "no owner" / TBD row

// Raw actuals rows -> slim records. A row needs a date value and hours > 0; an unparsable date
// keeps the row (it counts as consumed) with date null (it never falls in a week).
function normalizeActuals(rows) {
  const out = [];
  for (const r of rows || []) {
    if (!r || !r.date) continue;
    const hours = parseFloat(r.hours) || 0;
    if (!(hours > 0)) continue;
    out.push({ date: isoDate(r.date), role: r.role || '', owner: r.owner || '', task: r.task || '', hours });
  }
  return out;
}

// sheets: [{ project_code, data: rawRows[] }]. Every project with a code gets that code's rows
// (as GET /api/timesheets/all-data does), sorted by date string.
function groupActualsByProject(projects, sheets) {
  const rawByCode = new Map();
  for (const s of sheets || []) {
    if (!s || !s.project_code) continue;
    const list = rawByCode.get(s.project_code) || [];
    for (const r of Array.isArray(s.data) ? s.data : []) list.push(r);
    rawByCode.set(s.project_code, list);
  }
  const normByCode = new Map();
  const out = new Map();
  for (const p of projects || []) {
    if (!p.code || !rawByCode.has(p.code)) continue;
    if (!normByCode.has(p.code)) {
      const sorted = [...rawByCode.get(p.code)].sort((a, b) => {
        const x = String((a && a.date) ?? ''), y = String((b && b.date) ?? '');
        return x < y ? -1 : x > y ? 1 : 0;
      });
      normByCode.set(p.code, normalizeActuals(sorted));
    }
    out.set(p.id, normByCode.get(p.code));
  }
  return out;
}

function ownerOf(rec) { return (rec.owner || '').trim() || PLACEHOLDER; }

function uniqueOwnerNames(projects, actuals) {
  const names = new Set();
  for (const p of projects || []) {
    for (const r of actuals.get(p.id) || []) {
      const n = (r.owner || '').trim();
      if (n) names.add(n);
    }
  }
  return [...names];
}

function inWeek(rec, week) {
  return rec.date !== null && rec.date >= week.weekStart && rec.date <= week.weekEnd;
}

// Port of js/core.js rolePassesTeamFilter: the team is the role text before ' - '.
function rolePassesTeams(teams, role) {
  if (!teams || teams.size === 0) return true;
  const dash = role ? role.indexOf(' - ') : -1;
  const team = dash > 0 ? role.slice(0, dash).trim() : role || '';
  return teams.has(team);
}

// ── By Role ───────────────────────────────────────────────────────────────────────────────
// Port of byRoleView's calculation block. Sold/Actuals totals only count tasks that overlap the
// visible window (weeks). Monthly distribution (task.monthlyDistribution) is honoured only here.
function roleProjection({ projects, actuals, weeks, today, pulse, teams }) {
  const countFw = makeFutureWeekCounter(today);
  const roleMap = {}, roleSoldMap = {}, roleActualsMap = {}, roleChildMap = {};

  for (const proj of projects) {
    const projData = actuals.get(proj.id) || [];
    const projLabel = proj.name || proj.id;

    for (const task of proj.tasks || []) {
      if (task.completed) continue;
      const tStart = parseTaskDate(task.startDate || proj.startDate, false);
      const tEnd   = parseTaskDate(task.endDate   || proj.endDate,   true);
      const overlapWeeks = weeks.filter(w => w.weekEnd >= tStart && w.weekStart <= tEnd);
      if (!overlapWeeks.length) continue;

      for (const res of task.resources || []) {
        if (!res.role) continue;
        if (!rolePassesTeams(teams, res.role)) continue;
        const soldH = res.soldHours || 0;
        const role = res.role;

        roleSoldMap[role] = (roleSoldMap[role] || 0) + soldH;
        const taskRoleRecs = projData.filter(r => matchesTaskRole(r, task.name, role));
        const consumedH = taskRoleRecs.reduce((s, r) => s + r.hours, 0);
        roleActualsMap[role] = (roleActualsMap[role] || 0) + consumedH;

        if (!roleChildMap[role]) roleChildMap[role] = {};
        const childKey = `${projLabel}::${task.name}`;
        if (!roleChildMap[role][childKey]) roleChildMap[role][childKey] = { project: projLabel, task: task.name, sold: 0, actual: 0 };
        roleChildMap[role][childKey].sold   += soldH;
        roleChildMap[role][childKey].actual += consumedH;

        const residualH = computeResidual(soldH, consumedH);
        if (!roleMap[role]) roleMap[role] = {};
        const cellOf = (key, isPast, isPulse) => (roleMap[role][key] ||= { hours: 0, breakdown: [], isPast, isPulse });

        for (const w of overlapWeeks.filter(w => w.isPast)) {
          const actualH = taskRoleRecs.filter(r => inWeek(r, w)).reduce((s, r) => s + r.hours, 0);
          if (actualH < 0.01) continue;
          const cell = cellOf(w.key, true, false);
          cell.hours += actualH;
          cell.breakdown.push({ project: projLabel, task: task.name, hours: actualH });
        }

        const futureWeeks = overlapWeeks.filter(w => !w.isPast);
        if (!futureWeeks.length || residualH < 0.01) continue;

        const pDist = task.monthlyDistribution;
        if (hasValidPhasing(pDist)) {
          for (const { key, hours } of phasedSeries({ residualH, pDist, futureWeeks, fallbackWeekCount: () => countFw(tStart, tEnd) })) {
            const cell = cellOf(key, false, false);
            cell.hours += hours;
            cell.breakdown.push({ project: projLabel, task: task.name, hours });
          }
        } else {
          const byMonth = {};
          for (const w of futureWeeks) (byMonth[w.monthKey] ||= []).push(w.key);
          const weeksByMonth = Object.entries(byMonth).map(([monthKey, weekKeys]) => ({ monthKey, weekKeys }));
          for (const entry of distributeFutureResidual(residualH, countFw(tStart, tEnd), weeksByMonth, pulse)) {
            const cell = cellOf(entry.key, false, entry.isPulse);
            if (entry.isPulse) cell.isPulse = true;
            cell.hours += entry.hours;
            cell.breakdown.push({ project: projLabel, task: task.name, hours: entry.hours });
          }
        }
      }
    }
  }

  return {
    roles: Object.keys(roleMap).map(role => ({
      role,
      sold: roleSoldMap[role] || 0,
      actuals: roleActualsMap[role] || 0,
      children: Object.values(roleChildMap[role] || {}),
      cells: roleMap[role],
    })),
  };
}

module.exports = {
  PLACEHOLDER, roleProjection, normalizeActuals, groupActualsByProject, uniqueOwnerNames,
  inWeek, ownerOf, rolePassesTeams,
  // projections are appended by the next tasks
  _internals: { parseTaskDate, makeFutureWeekCounter, matchesTaskRole, computeResidual, distributeFutureResidual, redistributeExcludingInactive, hasValidPhasing, phasedSeries },
};
