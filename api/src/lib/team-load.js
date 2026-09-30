'use strict';
// Load curve and availability for the team assistant (spec 2026-09-29-planning-team-assistant §6).
// Nothing is recomputed here: weekly load comes from the planning model's `owner` projection.
const { parseTaskDate, mondayOnOrBefore, addDays, dateKey } = require('./planning-calendar');
const { matchOwner } = require('./match-resource');

const WEEKLY_TARGET_HOURS = 32;
const MAX_WINDOW_WEEKS = 104;
const CURRENT_LOAD_WEEKS = 4;

// Keeps the window at most MAX_WINDOW_WEEKS long (an undated/9999 end must not explode the week list).
function capWindow({ from, to }) {
  const cap = addDays(mondayOnOrBefore(from), MAX_WINDOW_WEEKS * 7 - 1);
  return { from, to: to > cap ? cap : to };
}

// tasks: [{ startDate, endDate }] (YYYYMMDD | YYYYMM | empty); project: { startDate, endDate }.
// Missing task dates fall back to the project's; nothing anywhere → null (availability not computable).
function roleWindow(tasks, project, asOf) {
  let start = null, end = null;
  for (const t of tasks || []) {
    if (t.startDate) { const s = parseTaskDate(t.startDate, false); if (!start || s < start) start = s; }
    if (t.endDate) { const e = parseTaskDate(t.endDate, true); if (!end || e > end) end = e; }
  }
  if (!start && project && project.startDate) start = parseTaskDate(project.startDate, false);
  if (!end && project && project.endDate) end = parseTaskDate(project.endDate, true);
  if (!start || !end || end < asOf) return null;
  return capWindow({ from: start > asOf ? start : asOf, to: end });
}

// union: { from, to } | null → the window of the single planning-model call.
// `to` is never before asOf: a window that ended already must still yield the recent weeks (current load).
function loadWindow(union, asOf) {
  return { from: addDays(mondayOnOrBefore(asOf), -7 * CURRENT_LOAD_WEEKS), to: union && union.to > asOf ? union.to : asOf };
}

// roles: requirement roles ({ window: { from, to } | null }) → { from: null, to: latest end } | null.
function unionWindow(roles) {
  const ends = (roles || []).filter(r => r.window).map(r => r.window.to);
  return ends.length ? { from: null, to: ends.reduce((m, e) => (e > m ? e : m), ends[0]) } : null;
}

// ownerMap: the `owner` projection's ownerMap; ctx: match-resource buildMatchContext(...).
// Several owner names resolving to one resource are summed; unmatched/ambiguous/ignored/empty names
// (including the '—' placeholder) contribute to nobody.
function loadByResource(ownerMap, ctx) {
  const out = new Map();
  for (const [name, om] of Object.entries(ownerMap || {})) {
    const m = matchOwner(name, ctx);
    if (m.kind !== 'alias' && m.kind !== 'matched') continue;
    let r = out.get(m.resourceId);
    if (!r) { r = { weeks: {} }; out.set(m.resourceId, r); }
    for (const [key, w] of Object.entries(om.weekTotals || {})) {
      const cur = r.weeks[key] || { hours: 0, isPast: !!w.isPast };
      cur.hours += w.hours;
      r.weeks[key] = cur;
    }
  }
  return out;
}

// Mean hours of the CURRENT_LOAD_WEEKS completed weeks before the current one (actuals only).
function currentLoad(load, asOf) {
  const monday = mondayOnOrBefore(asOf);
  let sum = 0;
  for (let i = 1; i <= CURRENT_LOAD_WEEKS; i++) {
    const w = load && load.weeks[dateKey(addDays(monday, -7 * i))];
    sum += (w && w.hours) || 0;
  }
  return sum / CURRENT_LOAD_WEEKS;
}

// weeks: getCalendarWeeks() items. Only weeks that are not past count.
function availabilityForWindow(load, weeks) {
  const future = (weeks || []).filter(w => !w.isPast);
  if (!future.length) return null;
  const frees = future.map(w => Math.max(0, WEEKLY_TARGET_HOURS - ((load && load.weeks[w.key] && load.weeks[w.key].hours) || 0)));
  return { freeAvg: frees.reduce((s, x) => s + x, 0) / frees.length, freeMin: Math.min(...frees), weeks: future.length };
}

module.exports = {
  WEEKLY_TARGET_HOURS, MAX_WINDOW_WEEKS, CURRENT_LOAD_WEEKS,
  roleWindow, capWindow, loadWindow, unionWindow, loadByResource, currentLoad, availabilityForWindow,
};
