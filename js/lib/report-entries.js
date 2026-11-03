// Pure logic of the shared Entries block in portfolio.html's project reporting view
// (Breakdown v2): months, filter, sort and filter options. The markup is the `pr-entries` component.
// See docs/superpowers/specs/2026-11-03-breakdown-v2-design.md.

// ?v=4 matches portfolio.html's <script src="js/lib/project-report-calc.js?v=4"> tag (CLAUDE.md "Cache-busting").
import { entriesByMonth } from './project-report-calc.js?v=4';

export function defaultSort() { return { key: 'date', dir: 'desc' }; }

export function nextSort(sort, key) {
  return { key, dir: sort && sort.key === key && sort.dir === 'asc' ? 'desc' : 'asc' };
}

// The filtered value of an entry: its role, or its owner ('' when none).
export function entryValue(entry, kind) {
  return kind === 'resource' ? (entry.owner || '') : entry.role;
}

export function filterOptions(entries, kind) {
  const hours = new Map();
  for (const e of entries || []) {
    const v = entryValue(e, kind);
    hours.set(v, (hours.get(v) || 0) + e.hours);
  }
  return [...hours].map(([value, h]) => ({ value, hours: h }))
    .sort((a, b) => b.hours - a.hours || a.value.localeCompare(b.value));
}

export function pruneFilter(filter, options) {
  const valid = new Set((options || []).map(o => o.value));
  return (filter || []).filter(v => valid.has(v));
}

export function filterChipLabel(filter, kind) {
  const name = kind === 'resource' ? 'Resource' : 'Role';
  if (!filter || !filter.length) return `${name}: All`;
  if (filter.length > 2) return `${name}: ${filter.length} selected`;
  return `${name}: ${filter.map(v => v || '—').join(', ')}`;
}

function whoOf(row, kind) {
  return kind === 'resource' ? (row.owner || '') : row.role + (row.owner ? ` (${row.owner})` : '');
}

function compare(key, kind) {
  if (key === 'hours') return (a, b) => a.hours - b.hours;
  if (key === 'who') return (a, b) => whoOf(a, kind).toLowerCase().localeCompare(whoOf(b, kind).toLowerCase());
  if (key === 'amount') return (a, b) => a.amount - b.amount;
  return (a, b) => a.date - b.date;
}

function sortRows(rows, sort, kind) {
  const dir = sort.dir === 'asc' ? 1 : -1;
  const cmp = compare(sort.key, kind);
  const byDateDesc = (a, b) => b.date - a.date;
  return [...rows].sort((a, b) => {
    if (sort.key === 'amount') {
      // Rows without a rate go last whichever the direction, then newest first.
      if ((a.amount === null) !== (b.amount === null)) return a.amount === null ? 1 : -1;
      if (a.amount === null) return byDateDesc(a, b);
    }
    return dir * cmp(a, b) || byDateDesc(a, b);
  });
}

// state = { filter, filterKind, sort, openMonth, closedMonths }. Without a filter one month is
// open (openMonth; null = the most recent, '' = none); with one every remaining month is open
// except closedMonths.
export function entriesBlock(entries, state, rateFor) {
  const all = entriesByMonth(entries, rateFor);
  const total = (entries || []).length;
  const filter = state.filter || [];
  const sort = state.sort || defaultSort();
  const months = [];
  let hiddenMonths = 0;
  for (const m of all) {
    const rows = filter.length ? m.rows.filter(r => filter.includes(entryValue(r, state.filterKind))) : m.rows;
    if (!rows.length) { hiddenMonths++; continue; }
    months.push({
      ym: m.ym,
      count: rows.length,
      hours: rows.reduce((s, r) => s + r.hours, 0),
      amount: rows.reduce((s, r) => s + (r.amount ?? 0), 0),
      rows: sortRows(rows, sort, state.filterKind),
      open: false,
    });
  }
  // An openMonth outside the Period counts as unset (not as ''), so the most recent month opens.
  const openKnown = months.some(m => m.ym === state.openMonth);
  for (const m of months) {
    if (filter.length) m.open = !(state.closedMonths || []).includes(m.ym);
    else if (state.openMonth === null || state.openMonth === undefined || (state.openMonth !== '' && !openKnown)) m.open = m === months[0];
    else m.open = m.ym === state.openMonth;
  }
  return { total, shown: months.reduce((s, m) => s + m.count, 0), months, hiddenMonths };
}

window.defaultSort = defaultSort;
window.nextSort = nextSort;
window.entryValue = entryValue;
window.filterOptions = filterOptions;
window.pruneFilter = pruneFilter;
window.filterChipLabel = filterChipLabel;
window.entriesBlock = entriesBlock;
