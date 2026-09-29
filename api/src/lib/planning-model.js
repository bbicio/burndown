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

// Legacy week membership used ONLY by By Role and By Project to place an actuals row into a past
// week cell. The old browser code parsed row dates as UTC midnight but compared them with
// local-midnight Monday-Sunday weeks, so in UTC+ zones a Sunday row fell in no week cell (it still
// counted in the consumed totals). Replicated here for zero visible change (parity); weekEnd is
// exclusive so Sunday rows are dropped. By Owner uses the inclusive inWeek. This browser quirk is
// to be fixed later as a deliberate, visible change.
function inWeekLegacy(rec, week) {
  return rec.date !== null && rec.date >= week.weekStart && rec.date < week.weekEnd;
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
          const actualH = taskRoleRecs.filter(r => inWeekLegacy(r, w)).reduce((s, r) => s + r.hours, 0);
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

// ── By Project ────────────────────────────────────────────────────────────────────────────
// Port of byProjectView's calculation block. Residual and owner split are per (task, role);
// uniform spread only (no monthly distribution); dates fall back to the project's.
function projectProjection({ projects, actuals, weeks, today, pulse, teams, ownerStatus }) {
  const countFw = makeFutureWeekCounter(today);
  const weekByKey = new Map(weeks.map(w => [w.key, w]));
  const projectNodes = [];

  for (const proj of projects) {
    const projData = actuals.get(proj.id) || [];
    let projSold = 0, projActuals = 0, projTbp = 0;
    const projWeekTotals = {};
    const taskNodes = [];

    for (const task of proj.tasks || []) {
      if (task.completed) continue;
      const tStart = parseTaskDate(task.startDate || proj.startDate, false);
      const tEnd   = parseTaskDate(task.endDate   || proj.endDate,   true);
      const overlapWeeks = weeks.filter(w => w.weekEnd >= tStart && w.weekStart <= tEnd);
      if (!overlapWeeks.length) continue;

      let taskSold = 0, taskActuals = 0, taskTbp = 0;
      const taskWeekTotals = {};
      const roleNodes = [];

      for (const res of task.resources || []) {
        if (!res.role) continue;
        if (!rolePassesTeams(teams, res.role)) continue;
        const soldH = res.soldHours || 0;

        const taskRoleRecs = projData.filter(r => matchesTaskRole(r, task.name, res.role));
        const consumedH = taskRoleRecs.reduce((s, r) => s + r.hours, 0);
        const residualH = computeResidual(soldH, consumedH);

        const ownerTotals = {};
        for (const r of taskRoleRecs) { const o = ownerOf(r); ownerTotals[o] = (ownerTotals[o] || 0) + r.hours; }
        const totalOwnerH = Object.values(ownerTotals).reduce((s, v) => s + v, 0);
        const ownerNames = Object.keys(ownerTotals).sort((a, b) => ownerTotals[b] - ownerTotals[a]);
        const hasOwners = ownerNames.length > 0;

        const pastWeeks   = overlapWeeks.filter(w => w.isPast);
        const futureWeeks = overlapWeeks.filter(w => !w.isPast);
        const totalFw = countFw(tStart, tEnd);

        const roleWeekData = {};
        for (const w of pastWeeks) {
          const recs = taskRoleRecs.filter(r => inWeekLegacy(r, w));
          const tot = recs.reduce((s, r) => s + r.hours, 0);
          if (tot < 0.01) continue;
          const byOwner = {};
          for (const r of recs) { const o = ownerOf(r); byOwner[o] = (byOwner[o] || 0) + r.hours; }
          roleWeekData[w.key] = { total: tot, byOwner, isPulse: false, isPast: true };
        }

        const { props: ownerFutureProps, allInactive: allOwnersInactive } = redistributeExcludingInactive(ownerTotals, ownerStatus);
        const distribute = (byOwner, hours) => {
          if (hasOwners && !allOwnersInactive) {
            for (const [o, prop] of Object.entries(ownerFutureProps)) byOwner[o] = (byOwner[o] || 0) + hours * prop;
          } else {
            byOwner[PLACEHOLDER] = (byOwner[PLACEHOLDER] || 0) + hours;
          }
        };

        if (futureWeeks.length > 0 && residualH > 0.01) {
          const byMonth = {};
          for (const w of futureWeeks) (byMonth[w.monthKey] ||= []).push(w.key);
          const weeksByMonth = Object.entries(byMonth).map(([monthKey, weekKeys]) => ({ monthKey, weekKeys }));
          for (const entry of distributeFutureResidual(residualH, totalFw, weeksByMonth, pulse)) {
            if (!roleWeekData[entry.key]) roleWeekData[entry.key] = { total: 0, byOwner: {}, isPulse: entry.isPulse, isPast: false };
            roleWeekData[entry.key].total += entry.hours;
            if (entry.isPulse) roleWeekData[entry.key].isPulse = true;
            distribute(roleWeekData[entry.key].byOwner, entry.hours);
          }
        }

        const roleTbp = Object.entries(roleWeekData)
          .filter(([key]) => weekByKey.has(key) && !weekByKey.get(key).isPast)
          .reduce((s, [, d]) => s + d.total, 0);

        taskSold += soldH; taskActuals += consumedH; taskTbp += roleTbp;
        for (const [key, d] of Object.entries(roleWeekData)) taskWeekTotals[key] = (taskWeekTotals[key] || 0) + d.total;

        const displayOwners = hasOwners
          ? (allOwnersInactive ? (ownerNames.includes(PLACEHOLDER) ? ownerNames : [...ownerNames, PLACEHOLDER]) : ownerNames)
          : [PLACEHOLDER];
        const owners = displayOwners.map(name => {
          const isPlaceholder = name === PLACEHOLDER;
          const ownerProp = isPlaceholder && (allOwnersInactive || totalOwnerH <= 0.01) ? 1 : (ownerFutureProps[name] || 0);
          return { name, isPlaceholder, actuals: ownerTotals[name] || 0, tbp: roleTbp * ownerProp };
        });

        roleNodes.push({
          role: res.role, sold: soldH, consumed: consumedH, tbp: roleTbp,
          hasOwners, allOwnersInactive, weekData: roleWeekData, owners,
        });
      }

      if (!roleNodes.length) continue;
      projSold += taskSold; projActuals += taskActuals; projTbp += taskTbp;
      for (const [key, h] of Object.entries(taskWeekTotals)) projWeekTotals[key] = (projWeekTotals[key] || 0) + h;
      taskNodes.push({
        name: task.name, startDate: task.startDate, endDate: task.endDate,
        sold: taskSold, actuals: taskActuals, tbp: taskTbp, weekTotals: taskWeekTotals, roles: roleNodes,
      });
    }

    if (!taskNodes.length) continue;
    projectNodes.push({ id: proj.id, sold: projSold, actuals: projActuals, tbp: projTbp, weekTotals: projWeekTotals, tasks: taskNodes });
  }

  return { projects: projectNodes };
}

// ── By Owner ──────────────────────────────────────────────────────────────────────────────
// Port of byOwnerView's calculation block. The residual is per TASK over the roles that pass the
// team filter; owners are aggregated over all those roles; no project-date fallback, no window skip.
function ownerProjection({ projects, actuals, weeks, today, pulse, teams, ownerStatus }) {
  const countFw = makeFutureWeekCounter(today);
  const ownerMap = {};

  for (const proj of projects) {
    const projData = actuals.get(proj.id) || [];
    for (const task of proj.tasks || []) {
      if (task.completed) continue;
      const tStart = task.startDate ? parseTaskDate(task.startDate, false) : null;
      const tEnd   = task.endDate   ? parseTaskDate(task.endDate,   true)  : null;

      const resources = (task.resources || []).filter(res => rolePassesTeams(teams, res.role));
      if (!resources.length) continue;
      const soldH = resources.reduce((s, res) => s + (res.soldHours || 0), 0);
      const taskRecs = projData.filter(r => resources.some(res => matchesTaskRole(r, task.name, res.role)));

      const taskWeekData = {};
      const ownerTotals = {};
      let totalOwnerH = 0;

      for (const w of weeks) {
        if (!w.isPast) continue;
        const recs = taskRecs.filter(r => inWeek(r, w));
        if (!recs.length) continue;
        const byOwner = {};
        for (const r of recs) { const o = ownerOf(r); byOwner[o] = (byOwner[o] || 0) + r.hours; }
        taskWeekData[w.key] = { total: recs.reduce((s, r) => s + r.hours, 0), byOwner, isPulse: false, isPast: true };
      }
      for (const r of taskRecs) { const o = ownerOf(r); ownerTotals[o] = (ownerTotals[o] || 0) + r.hours; }
      Object.values(ownerTotals).forEach(h => { totalOwnerH += h; });

      const consumedH = totalOwnerH;
      const taskTbp = computeResidual(soldH, consumedH);
      if (soldH < 0.01 && consumedH < 0.01) continue;

      const ownerNames = Object.entries(ownerTotals).filter(([, h]) => h > 0.01).sort((a, b) => b[1] - a[1]).map(([o]) => o);
      const hasOwners = ownerNames.length > 0;
      const ownerTotalsForSplit = Object.fromEntries(Object.entries(ownerTotals).filter(([, h]) => h > 0.01));
      const { props: ownerFutureProps, allInactive: allOwnersInactive } = redistributeExcludingInactive(ownerTotalsForSplit, ownerStatus);

      if (taskTbp > 0.01) {
        const futureWeeks = weeks.filter(w => !w.isPast);
        const taskWeeks = tStart && tEnd ? futureWeeks.filter(w => w.weekEnd >= tStart && w.weekStart <= tEnd) : futureWeeks;
        const totalTaskFw = (tStart && tEnd) ? countFw(tStart, tEnd) : taskWeeks.length;
        const distribute = (byOwner, hours) => {
          if (!allOwnersInactive) {
            for (const [o, prop] of Object.entries(ownerFutureProps)) byOwner[o] = (byOwner[o] || 0) + hours * prop;
          } else {
            byOwner[PLACEHOLDER] = (byOwner[PLACEHOLDER] || 0) + hours;
          }
        };
        const byMonth = {};
        for (const w of taskWeeks) (byMonth[w.monthKey] ||= []).push(w.key);
        const weeksByMonth = Object.entries(byMonth).map(([monthKey, weekKeys]) => ({ monthKey, weekKeys }));
        for (const entry of distributeFutureResidual(taskTbp, totalTaskFw, weeksByMonth, pulse)) {
          if (!taskWeekData[entry.key]) taskWeekData[entry.key] = { total: 0, byOwner: {}, isPulse: entry.isPulse, isPast: false };
          taskWeekData[entry.key].total += entry.hours;
          if (entry.isPulse) taskWeekData[entry.key].isPulse = true;
          distribute(taskWeekData[entry.key].byOwner, entry.hours);
        }
      }

      const displayOwners = hasOwners
        ? (allOwnersInactive ? (ownerNames.includes(PLACEHOLDER) ? ownerNames : [...ownerNames, PLACEHOLDER]) : ownerNames)
        : [PLACEHOLDER];
      for (const ownerName of displayOwners) {
        const isPlaceholder = ownerName === PLACEHOLDER;
        const ownerActualsProp = totalOwnerH > 0.01 ? (ownerTotals[ownerName] || 0) / totalOwnerH : (isPlaceholder ? 1 : 0);
        const ownerProp = isPlaceholder && (allOwnersInactive || totalOwnerH <= 0.01) ? 1 : (ownerFutureProps[ownerName] || 0);
        const ownerSold = soldH * ownerActualsProp;
        const ownerActuals = ownerTotals[ownerName] || 0;
        const ownerTbpH = taskTbp * ownerProp;

        const om = (ownerMap[ownerName] ||= { sold: 0, actuals: 0, tbp: 0, weekTotals: {}, projects: {} });
        om.sold += ownerSold; om.actuals += ownerActuals; om.tbp += ownerTbpH;
        const pm = (om.projects[proj.id] ||= { name: proj.name || proj.id, sold: 0, actuals: 0, tbp: 0, weekTotals: {}, tasks: {} });
        pm.sold += ownerSold; pm.actuals += ownerActuals; pm.tbp += ownerTbpH;
        const tm = (pm.tasks[task.name] ||= { sold: 0, actuals: 0, tbp: 0, weekData: {} });
        tm.sold += ownerSold; tm.actuals += ownerActuals; tm.tbp += ownerTbpH;

        for (const w of weeks) {
          const d = taskWeekData[w.key];
          if (!d) continue;
          const oh = d.byOwner[ownerName] || 0;
          if (oh < 0.001) continue;
          if (!tm.weekData[w.key]) tm.weekData[w.key] = { hours: 0, isPulse: d.isPulse, isPast: d.isPast };
          tm.weekData[w.key].hours += oh;
          if (!pm.weekTotals[w.key]) pm.weekTotals[w.key] = { hours: 0, isPulse: d.isPulse, isPast: d.isPast };
          pm.weekTotals[w.key].hours += oh;
          if (!om.weekTotals[w.key]) om.weekTotals[w.key] = { hours: 0, isPulse: d.isPulse, isPast: d.isPast };
          om.weekTotals[w.key].hours += oh;
        }
      }
    }
  }
  return { ownerMap };
}

function buildProjection(view, input) {
  if (view === 'role') return roleProjection(input);
  if (view === 'project') return projectProjection(input);
  if (view === 'owner') return ownerProjection(input);
  throw new Error('Unknown view');
}

module.exports = {
  PLACEHOLDER, normalizeActuals, groupActualsByProject, uniqueOwnerNames,
  inWeek, inWeekLegacy, ownerOf, rolePassesTeams,
  roleProjection, projectProjection, ownerProjection, buildProjection,
};
