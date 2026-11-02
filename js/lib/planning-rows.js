// Pure row model of planning.html's grid: cell text, load level, search filter and the flat
// rows the template renders. DOM-free; the hours themselves come from the server model.

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
  const isOpen = id => openIds.has(id) || forced.has(id);
  return rows.filter(r => {
    if (filter && filter.visibleIds && !filter.visibleIds.has(r.id)) return false;
    for (let p = byId.get(r.parentId); p; p = byId.get(p.parentId)) if (!isOpen(p.id)) return false;
    return true;
  });
}

window.formatCell = formatCell;
window.workingWeeks = workingWeeks;
window.loadLevel = loadLevel;
window.initials = initials;
window.isoWeek = isoWeek;
window.filterRows = filterRows;
window.visibleRows = visibleRows;
