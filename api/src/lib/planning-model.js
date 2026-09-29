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

module.exports = {
  PLACEHOLDER, normalizeActuals, groupActualsByProject, uniqueOwnerNames,
  inWeek, ownerOf, rolePassesTeams,
  // projections are appended by the next tasks
  _internals: { parseTaskDate, makeFutureWeekCounter, matchesTaskRole, computeResidual, distributeFutureResidual, redistributeExcludingInactive, hasValidPhasing, phasedSeries },
};
