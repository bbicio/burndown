// Pure row model of planning.html's grid: cell text, load level, search filter and the flat
// rows the template renders. DOM-free; the hours themselves come from the server model.
import { computeResidual, sumChildBreakdownHours } from './planning-calc.js?v=5';
import { formatDayText } from './dates.js?v=6';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const hoursText = (h, round) => (round ? Math.round(h) : h.toFixed(2)) + 'h';

export function formatCell(h, { pulse, round }) {
  if (!(h > 0.005)) return '';
  if (pulse) return h < 0.5 ? '<1h' : '~' + hoursText(h, round);
  if (round && h < 1) return '<1h';
  return hoursText(h, round);
}

function weekdaysBetween(start, end) {
  let n = 0;
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (d <= end) {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

// Monthly periods (js/core.js buildMonthPeriods) are keyed 'Oct 2026'; weekly ones carry weekStart/weekEnd.
export function workingWeeks(period, interval) {
  if (interval === 'monthly') {
    const [mon, year] = String(period.key).split(' ');
    const m = MONTHS.indexOf(mon), y = parseInt(year, 10);
    return weekdaysBetween(new Date(y, m, 1), new Date(y, m + 1, 0)) / 5;
  }
  return weekdaysBetween(period.weekStart, period.weekEnd) / 5;
}

export function loadLevel(h, weeks) {
  if (!(weeks > 0)) return null;
  const rate = h / weeks;
  if (rate >= 30) return 'over';
  if (rate >= 24) return 'high';
  return null;
}

export function initials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow); // the Thursday of this week decides the year
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

export function filterRows(rows, query) {
  const q = String(query || '').trim().toLowerCase();
  const forcedOpenIds = new Set();
  if (!q) return { visibleIds: null, forcedOpenIds };
  const byId = new Map(rows.map(r => [r.id, r]));
  const visibleIds = new Set();
  const matches = r => `${r.label || ''}\n${r.sub || ''}`.toLowerCase().includes(q);
  const hasMatchingAncestor = r => {
    for (let p = byId.get(r.parentId); p; p = byId.get(p.parentId)) if (matches(p)) return true;
    return false;
  };
  for (const r of rows) {
    if (matches(r)) {
      visibleIds.add(r.id);
      for (let p = byId.get(r.parentId); p; p = byId.get(p.parentId)) {
        visibleIds.add(p.id);
        forcedOpenIds.add(p.id);
      }
    } else if (hasMatchingAncestor(r)) {
      visibleIds.add(r.id);
    }
  }
  return { visibleIds, forcedOpenIds };
}

export function visibleRows(rows, openIds, filter) {
  const byId = new Map(rows.map(r => [r.id, r]));
  const forced = filter ? filter.forcedOpenIds : new Set();
  const closed = (filter && filter.closedIds) || new Set();
  const isOpen = id => !closed.has(id) && (openIds.has(id) || forced.has(id));
  return rows.filter(r => {
    if (filter && filter.visibleIds && !filter.visibleIds.has(r.id)) return false;
    for (let p = byId.get(r.parentId); p; p = byId.get(p.parentId)) if (!isOpen(p.id)) return false;
    return true;
  });
}

// A click on a row's chevron. A row the search forces open is collapsed (and re-opened) through
// `suppressed`, never through `open`, so clearing the search restores the state from before it.
export function toggleRowState(id, { open, suppressed, forced }) {
  if (forced.has(id)) {
    if (suppressed.has(id)) suppressed.delete(id); else suppressed.add(id);
    return;
  }
  if (open.has(id)) open.delete(id); else open.add(id);
}

// The search filter with the forced-open rows the user collapsed: `closedIds` wins over both the
// forced set and openIds while the search lasts, so an already-open parent collapses too.
export function effectiveFilter(filter, suppressed) {
  if (!filter || !suppressed.size) return filter;
  return {
    visibleIds: filter.visibleIds,
    forcedOpenIds: new Set([...filter.forcedOpenIds].filter(id => !suppressed.has(id))),
    // only ids the search still forces open: one it no longer forces follows openIds again
    closedIds: new Set([...suppressed].filter(id => filter.forcedOpenIds.has(id))),
  };
}

// Tab inside a modal panel: the element to focus instead of the browser's next one, or null.
export function focusTrapTarget(focusables, active, backwards) {
  if (!focusables.length) return null;
  const first = focusables[0], last = focusables[focusables.length - 1];
  if (!focusables.includes(active)) return backwards ? last : first;
  if (!backwards && active === last) return first;
  if (backwards && active === first) return last;
  return null;
}

// ── Row builders ────────────────────────────────────────────────────────────────────────────
// Input: the shapes of js/lib/planning-model-ui.js's adaptRoleModel / adaptProjectModel /
// adaptOwnerModel and the page's periods (buildMonthPeriods(weeks) in Monthly, weeks in Weekly).
// opts: { interval, round, ownerStatus, projectInfo(idOrName) → { id, name, stage, status, client,
// start, end } | null, taskRoles(projectId, taskName) → [role] }. The numbers are those the page's
// three view computeds already put in exportRows; ids are derived from keys, never from indexes.

const PLACEHOLDER = '—';

export const displayRole = role => String(role || '').split(' - ').join(' · ');

const periodKeys = (p, interval) => (interval === 'monthly' ? p.weekKeys : [p.weekStart.toISOString()]);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function makeRow(fields) {
  return {
    id: '', parentId: null, depth: 0, kind: '', label: '', sub: '', stage: '', status: '', client: '',
    start: '', end: '', owners: [], inactive: false, sold: 0, actuals: 0, toPlan: 0, cells: [], ...fields,
  };
}

function projectFields(info) {
  return info
    ? { stage: info.stage || '', status: info.status || '', client: info.client || '', sub: info.client || '', start: info.start || '', end: info.end || '' }
    : {};
}

// cellAt(keys) → { h, pulse }
function cellsOf(periods, interval, cellAt, loadOn = false) {
  return periods.map(p => {
    const { h, pulse } = cellAt(periodKeys(p, interval));
    const past = !!p.isPast, current = !!p.isCurrent;
    const load = loadOn && !past && !pulse ? loadLevel(h, workingWeeks(p, interval)) : null;
    return { h, past, current, pulse, load };
  });
}

function totalOf(periods, topRows, count) {
  const sum = f => topRows.reduce((s, r) => s + r[f], 0);
  return {
    count, sold: sum('sold'), actuals: sum('actuals'), toPlan: sum('toPlan'),
    cells: periods.map((p, i) => ({ h: topRows.reduce((s, r) => s + r.cells[i].h, 0), past: !!p.isPast, current: !!p.isCurrent })),
  };
}

export function buildRoleRows(adapted, periods, opts) {
  const { roleMap, roleSoldMap, roleActualsMap, roleChildMap } = adapted;
  const { interval } = opts;
  const rows = [], tops = [];
  let count = 0;
  for (const role of Object.keys(roleMap).sort()) {
    const cellsMap = roleMap[role] || {};
    const id = `role:${role}`;
    const top = makeRow({
      id, kind: 'role', label: displayRole(role),
      sold: roleSoldMap[role] || 0, actuals: roleActualsMap[role] || 0,
      toPlan: Object.values(cellsMap).reduce((s, c) => s + (c.isPast ? 0 : c.hours), 0),
      cells: cellsOf(periods, interval, keys => {
        let h = 0, pulse = false;
        for (const k of keys) { const c = cellsMap[k]; if (c) { h += c.hours; if (c.isPulse) pulse = true; } }
        return { h, pulse };
      }),
    });
    rows.push(top); tops.push(top);
    const children = Object.values(roleChildMap[role] || {}).sort((a, b) => (b.sold + b.actual) - (a.sold + a.actual));
    for (const child of children) {
      const info = opts.projectInfo(child.project);
      rows.push(makeRow({
        id: `${id}|${child.project}::${child.task}`, parentId: id, depth: 1, kind: 'pair',
        label: child.project, sub: child.task, stage: info?.stage || '', status: info?.status || '', client: info?.client || '',
        sold: child.sold, actuals: child.actual, toPlan: computeResidual(child.sold, child.actual),
        cells: cellsOf(periods, interval, keys => {
          const { hours, isPulse } = sumChildBreakdownHours(cellsMap, keys, child.project, child.task);
          return { h: hours, pulse: isPulse };
        }),
      }));
      count++;
    }
  }
  return { rows, total: totalOf(periods, tops, count) };
}

export function buildProjectRows(adapted, periods, opts) {
  const { interval, ownerStatus = {} } = opts;
  const rows = [], tops = [];
  let count = 0;
  // A task or project period is a pulse only when every role with hours there is a pulse.
  const pulseIn = (roles, keys) => {
    const withHours = roles.filter(r => keys.some(k => r.weekData[k]?.total > 0));
    return withHours.length > 0 && withHours.every(r => keys.some(k => r.weekData[k]?.isPulse && r.weekData[k].total > 0));
  };
  const sumNum = (obj, keys) => keys.reduce((s, k) => s + (obj[k] || 0), 0);
  // A project can hold two tasks of the same name and a task two resources of the same role:
  // the second and later get a "~n" suffix, so every id stays unique and still key-derived.
  const seen = new Map();
  const uniq = id => { const n = (seen.get(id) || 0) + 1; seen.set(id, n); return n === 1 ? id : `${id}~${n}`; };
  for (const pNode of adapted.projects || []) {
    const info = opts.projectInfo(pNode.id);
    if (!info) continue;
    const pid = `p:${pNode.id}`;
    const allRoles = pNode.tasks.flatMap(t => t.roles);
    const top = makeRow({
      id: pid, kind: 'project', label: info.name || pNode.id, ...projectFields(info),
      sold: pNode.sold, actuals: pNode.actuals, toPlan: pNode.tbp,
      cells: cellsOf(periods, interval, keys => ({ h: sumNum(pNode.weekTotals, keys), pulse: pulseIn(allRoles, keys) })),
    });
    rows.push(top); tops.push(top);
    for (const tNode of pNode.tasks) {
      const tid = uniq(`${pid}|t:${tNode.name}`);
      rows.push(makeRow({
        id: tid, parentId: pid, depth: 1, kind: 'task', label: tNode.name, sub: plural(tNode.roles.length, 'role'),
        start: tNode.startDate || '', end: tNode.endDate || '',
        sold: tNode.sold, actuals: tNode.actuals, toPlan: tNode.tbp,
        cells: cellsOf(periods, interval, keys => ({ h: sumNum(tNode.weekTotals, keys), pulse: pulseIn(tNode.roles, keys) })),
      }));
      for (const rNode of tNode.roles) {
        const owners = rNode.owners.filter(o => !o.isPlaceholder && o.name !== PLACEHOLDER)
          .map(o => ({ name: o.name, initials: initials(o.name), inactive: ownerStatus[o.name] === 'inactive' }));
        rows.push(makeRow({
          id: uniq(`${tid}|r:${rNode.role}`), parentId: tid, depth: 2, kind: 'roleLeaf', label: displayRole(rNode.role),
          sub: owners.length ? owners.map(o => o.name).join(', ') : 'No owner yet', owners,
          sold: rNode.sold, actuals: rNode.consumed, toPlan: rNode.tbp,
          cells: cellsOf(periods, interval, keys => {
            let h = 0, pulse = false;
            for (const k of keys) { const d = rNode.weekData[k]; if (d) { h += d.total; if (d.isPulse) pulse = true; } }
            return { h, pulse };
          }),
        }));
        count++;
      }
    }
  }
  return { rows, total: totalOf(periods, tops, count) };
}

export function buildOwnerRows(ownerMap, periods, opts) {
  const { interval, ownerStatus = {} } = opts;
  const rows = [], tops = [];
  let count = 0;
  const hoursAt = map => keys => {
    let h = 0, pulse = false;
    for (const k of keys) { const d = map[k]; if (d) { h += d.hours; if (d.isPulse) pulse = true; } }
    return { h, pulse };
  };
  // A task's roles are known from the project configuration, not from the model: shown only when unambiguous.
  const taskRoles = (pid, task) => opts.taskRoles ? opts.taskRoles(pid, task) : [];
  const names = Object.keys(ownerMap).sort((a, b) => (a === PLACEHOLDER ? -1 : b === PLACEHOLDER ? 1 : a.localeCompare(b)));
  for (const name of names) {
    const om = ownerMap[name];
    const isTbd = name === PLACEHOLDER;
    const oid = `o:${name}`;
    const projectEntries = Object.entries(om.projects).sort((a, b) => a[1].name.localeCompare(b[1].name));
    const roles = new Set();
    for (const [pid, pm] of projectEntries) {
      for (const tn of Object.keys(pm.tasks)) { const r = taskRoles(pid, tn); if (r.length === 1) roles.add(displayRole(r[0])); }
    }
    const top = makeRow({
      id: oid, kind: isTbd ? 'tbd' : 'person',
      label: isTbd ? 'Unassigned (TBD)' : name,
      sub: isTbd ? 'No owner found in actuals, or every owner is inactive'
        : [plural(projectEntries.length, 'project'), [...roles].sort().join(', ')].filter(Boolean).join(' · '),
      inactive: !isTbd && ownerStatus[name] === 'inactive',
      owners: isTbd ? [] : [{ name, initials: initials(name), inactive: ownerStatus[name] === 'inactive' }],
      sold: om.sold, actuals: om.actuals, toPlan: om.tbp,
      cells: cellsOf(periods, interval, hoursAt(om.weekTotals), !isTbd),
    });
    rows.push(top); tops.push(top);
    for (const [projId, pm] of projectEntries) {
      const pid = `${oid}|p:${projId}`;
      rows.push(makeRow({
        id: pid, parentId: oid, depth: 1, kind: 'project', label: pm.name, ...projectFields(opts.projectInfo(projId)),
        sold: pm.sold, actuals: pm.actuals, toPlan: pm.tbp,
        cells: cellsOf(periods, interval, hoursAt(pm.weekTotals)),
      }));
      for (const [taskName, tm] of Object.entries(pm.tasks).sort((a, b) => a[0].localeCompare(b[0]))) {
        const r = taskRoles(projId, taskName);
        rows.push(makeRow({
          id: `${pid}|t:${taskName}`, parentId: pid, depth: 2, kind: 'task', label: taskName,
          sub: r.length === 1 ? displayRole(r[0]) : r.length ? plural(r.length, 'role') : '',
          sold: tm.sold, actuals: tm.actuals, toPlan: tm.tbp,
          cells: cellsOf(periods, interval, hoursAt(tm.weekData)),
        }));
        count++;
      }
    }
  }
  return { rows, total: totalOf(periods, tops, count) };
}

// ── Period window ───────────────────────────────────────────────────────────────────────────
// A window is { start: first day of a month, end: last day of a month }.

const monthStart = (d, add = 0) => new Date(d.getFullYear(), d.getMonth() + add, 1);
const monthEnd = (d, add = 0) => new Date(d.getFullYear(), d.getMonth() + add + 1, 0);
const monthIndex = d => d.getFullYear() * 12 + d.getMonth();

// The page's initial window: the current month and the next three.
export function defaultWindow(today) {
  return { start: monthStart(today), end: monthEnd(today, 3) };
}

// Presets start the month before the current one, so the last month of actuals stays visible.
export function presetWindow(months, today) {
  return { start: monthStart(today, -1), end: monthEnd(today, months - 2) };
}

export function shiftWindow({ start, end }, delta, { axisStart, axisEnd }) {
  const width = monthIndex(end) - monthIndex(start); // months after the first
  if (width >= monthIndex(axisEnd) - monthIndex(axisStart)) return { start: monthStart(axisStart), end: monthEnd(axisEnd) };
  let s = monthStart(start, delta);
  if (monthIndex(s) < monthIndex(axisStart)) s = monthStart(axisStart);
  if (monthIndex(s) + width > monthIndex(axisEnd)) s = monthStart(axisEnd, -width);
  return { start: s, end: monthEnd(s, width) };
}

const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// 'Sep 28 – Nov 2, 2026': the start of the first and of the last week, the year once when shared.
export function weeklyWindowLabel(weeks) {
  if (!weeks || !weeks.length) return '';
  const a = weeks[0].weekStart, b = weeks[weeks.length - 1].weekStart;
  const first = formatDayText(isoOf(a)), last = formatDayText(isoOf(b));
  return a.getFullYear() === b.getFullYear() ? `${first.replace(/, \d{4}$/, '')} – ${last}` : `${first} – ${last}`;
}

// ── Smartphone layout (planning.html under 768px) ───────────────────────────────────────────

// The badge of the "Filters" buttons: every filter or switch away from its default.
export function countActiveFilters({ pipelineFilters, projectFilters, teamFilters, monthlyPulse, roundHours, search }) {
  return [pipelineFilters.size > 0, projectFilters.size > 0, teamFilters.size > 0,
    !monthlyPulse, !roundHours, !!String(search || '').trim()].filter(Boolean).length;
}

// Leaf descendants of every row that has children, from the whole row list (never the search-filtered one).
export function leafCounts(rows) {
  const children = new Map();
  for (const r of rows) {
    if (r.parentId == null) continue;
    if (!children.has(r.parentId)) children.set(r.parentId, []);
    children.get(r.parentId).push(r.id);
  }
  const counts = new Map();
  const leaves = id => {
    const kids = children.get(id);
    if (!kids) return 1;
    const n = kids.reduce((sum, k) => sum + leaves(k), 0);
    counts.set(id, n);
    return n;
  };
  for (const r of rows) if (r.parentId == null) leaves(r.id);
  return counts;
}

// One bar per period: height ratio against the tallest cell, colour kind from the cell's state.
export function miniBar(cells) {
  const max = cells.reduce((m, c) => (c.h > 0.005 && c.h > m ? c.h : m), 0);
  return cells.map(c => {
    if (!(c.h > 0.005)) return { kind: 'empty', ratio: 0 };
    const kind = c.load === 'over' || c.load === 'high' ? c.load : c.past ? 'past' : c.current ? 'current' : 'future';
    return { kind, ratio: c.h / max };
  });
}

export function defaultPeriodIdx(periods) {
  const i = periods.findIndex(p => p.isCurrent);
  return i < 0 ? 0 : i;
}

export function clampPeriodIdx(idx, periods) {
  return Math.max(0, Math.min(idx, periods.length - 1));
}

export function stepperState(periods, idx, interval) {
  const p = periods[idx];
  if (!p) return { label: '', sub: '', canPrev: false, canNext: false };
  const weekly = interval !== 'monthly';
  return {
    label: weekly ? `${p.dateTitle} · W${isoWeek(p.weekStart)}` : p.label,
    sub: p.isCurrent ? `Current ${weekly ? 'week' : 'month'} · planned` : p.isPast ? 'Actuals' : 'Planned',
    canPrev: idx > 0,
    canNext: idx < periods.length - 1,
  };
}

window.toggleRowState = toggleRowState;
window.effectiveFilter = effectiveFilter;
window.focusTrapTarget = focusTrapTarget;
window.defaultWindow = defaultWindow;
window.presetWindow = presetWindow;
window.shiftWindow = shiftWindow;
window.weeklyWindowLabel = weeklyWindowLabel;
window.formatCell = formatCell;
window.displayRole = displayRole;
window.buildRoleRows = buildRoleRows;
window.buildProjectRows = buildProjectRows;
window.buildOwnerRows = buildOwnerRows;
window.workingWeeks = workingWeeks;
window.loadLevel = loadLevel;
window.initials = initials;
window.isoWeek = isoWeek;
window.filterRows = filterRows;
window.visibleRows = visibleRows;
window.countActiveFilters = countActiveFilters;
window.leafCounts = leafCounts;
window.miniBar = miniBar;
window.defaultPeriodIdx = defaultPeriodIdx;
window.clampPeriodIdx = clampPeriodIdx;
window.stepperState = stepperState;
