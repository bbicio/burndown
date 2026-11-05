// js/lib/timesheets-list.js
// Pure helpers for timesheets.html's Actuals list: the filters, the 3-state sort and the grouping by client.
// No DOM, no Vue: unit-tested with vitest and bridged to window.* for the page's inline module script.

export const NO_CLIENT_LABEL = 'No client';

const cmpText = (a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });

// year 0 = all years; code is a case-insensitive substring of the project code.
export function filterTimesheetRows(rows, { year = 0, clients = [], projects = [], code = '' } = {}) {
  const needle = String(code || '').toLowerCase();
  return (rows || []).filter(r => {
    if (year !== 0 && r.pipeline_year !== year) return false;
    if (clients.length && !clients.includes(r.client_name)) return false;
    if (projects.length && !projects.includes(r.project_name)) return false;
    if (needle && !String(r.project_code).toLowerCase().includes(needle)) return false;
    return true;
  });
}

export function hasActiveFilters({ year = 0, clients = [], projects = [], code = '' } = {}) {
  return year !== 0 || clients.length > 0 || projects.length > 0 || !!code;
}

// New field → asc; asc → desc; desc → no sort.
export function nextSortState({ sortBy, sortDir }, field) {
  if (sortBy !== field) return { sortBy: field, sortDir: 'asc' };
  if (sortDir === 'asc') return { sortBy: field, sortDir: 'desc' };
  return { sortBy: null, sortDir: 'asc' };
}

// Rows inside a group: by project_name or project_code (an empty value always last), else input order.
function sortRows(rows, sortBy, sortDir) {
  if (sortBy !== 'project_name' && sortBy !== 'project_code') return rows;
  const sign = sortDir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = a[sortBy] || '';
    const bv = b[sortBy] || '';
    if (!av && bv) return 1;
    if (av && !bv) return -1;
    return cmpText(av, bv) * sign;
  });
}

// Groups by client: alphabetical (reversed by a descending client sort), "No client" always last.
export function groupTimesheetRows(rows, { sortBy = null, sortDir = 'asc' } = {}) {
  const byKey = new Map();
  for (const r of rows || []) {
    const key = r.client_name || '';
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(r);
  }
  const sign = sortBy === 'client_name' && sortDir === 'desc' ? -1 : 1;
  const keys = [...byKey.keys()].sort((a, b) => {
    if (!a) return 1;
    if (!b) return -1;
    return cmpText(a, b) * sign;
  });
  return keys.map(key => {
    const groupRows = sortRows(byKey.get(key), sortBy, sortDir);
    return {
      key,
      label: key || NO_CLIENT_LABEL,
      rows: groupRows,
      codes: groupRows.length,
      totalRows: groupRows.reduce((s, r) => s + (Number(r.total_rows) || 0), 0),
    };
  });
}

if (typeof window !== 'undefined') {
  window.NO_CLIENT_LABEL = NO_CLIENT_LABEL;
  window.filterTimesheetRows = filterTimesheetRows;
  window.hasActiveFilters = hasActiveFilters;
  window.nextSortState = nextSortState;
  window.groupTimesheetRows = groupTimesheetRows;
}
