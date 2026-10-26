// The single browser date module. Storage formats: months 'YYYYMM', days 'YYYYMMDD'
// (in memory in costgrid: ISO 'YYYY-MM-DD'). All calendar arithmetic goes through
// Date.UTC — a local-timezone Date constructor shifts the day in negative-offset zones.
// Server twin: api/src/lib/dates.js.

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function splitDay(v) {
  if (typeof v !== 'string') return null;
  let m = v.match(/^(\d{4})(\d{2})(\d{2})$/) || v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return [m[1], m[2], m[3]];
}

function isEmpty(v) {
  return v === '' || v === null || v === undefined;
}

export function isMonth(v) {
  return typeof v === 'string' && /^\d{6}$/.test(v) && Number(v.slice(4)) >= 1 && Number(v.slice(4)) <= 12;
}

export function isDay(v) {
  return splitDay(v) !== null;
}

export function toYmd(v) {
  const p = splitDay(v);
  return p ? p.join('') : null;
}

export function toIso(v) {
  const p = splitDay(v);
  return p ? p.join('-') : null;
}

export function monthFirstDay(ym) {
  if (!isMonth(ym)) return null;
  return `${ym.slice(0, 4)}-${ym.slice(4)}-01`;
}

export function monthLastDay(ym) {
  if (!isMonth(ym)) return null;
  const last = daysInMonth(Number(ym.slice(0, 4)), Number(ym.slice(4)));
  return `${ym.slice(0, 4)}-${ym.slice(4)}-${String(last).padStart(2, '0')}`;
}

// Normalises a value to a comparable key: months stay 'YYYYMM', days become 'YYYYMMDD'.
// Returns null when invalid. Months and days are never mixed by callers.
function key(v) {
  if (isMonth(v)) return v;
  return toYmd(v);
}

export function isOrdered(start, end) {
  if (isEmpty(start) || isEmpty(end)) {
    // A non-empty side must still be valid.
    if (!isEmpty(start) && key(start) === null) return false;
    if (!isEmpty(end) && key(end) === null) return false;
    return true;
  }
  const a = key(start);
  const b = key(end);
  if (a === null || b === null) return false;
  return b >= a;
}

export function periodError(start, end, { kind, label }) {
  const isValid = kind === 'month' ? isMonth : isDay;
  const expected = kind === 'month' ? 'YYYYMM' : 'YYYY-MM-DD';
  const shown = v => (kind === 'month' ? `${v.slice(0, 4)}-${v.slice(4)}` : toIso(v));
  for (const [name, v] of [['start', start], ['end', end]]) {
    if (!isEmpty(v) && !isValid(v)) return `Invalid ${label} ${name} date "${v}": expected ${expected}.`;
  }
  if (!isEmpty(start) && !isEmpty(end) && !isOrdered(start, end)) {
    const cap = label.charAt(0).toUpperCase() + label.slice(1);
    return `${cap} end date (${shown(end)}) is before its start date (${shown(start)}).`;
  }
  return null;
}

export function taskPeriodError(start, end, periodStart, periodEnd, { label, parent }) {
  const ps = periodStart === null || periodStart === undefined ? '' : String(periodStart).trim();
  const pe = periodEnd === null || periodEnd === undefined ? '' : String(periodEnd).trim();
  if ((!isEmpty(start) && !isDay(start)) || (!isEmpty(end) && !isDay(end))) return null;
  if (isEmpty(start) && isEmpty(end)) return null;
  const show = v => (v === '' ? '…' : isMonth(v) ? `${v.slice(0, 4)}-${v.slice(4)}` : v);
  const range = `${show(ps)} – ${show(pe)}`;
  if ((ps !== '' && !isMonth(ps)) || (pe !== '' && !isMonth(pe)) || (ps !== '' && pe !== '' && ps > pe)) {
    return `The ${parent} period (${range}) is not valid: fix it before setting task dates.`;
  }
  const first = ps === '' ? null : monthFirstDay(ps);
  const last = pe === '' ? null : monthLastDay(pe);
  const s = isEmpty(start) ? null : toIso(start);
  const e = isEmpty(end) ? null : toIso(end);
  const out = (word, iso, dir) => `Task "${String(label || '').trim() || 'Untitled task'}" ${word} on ${iso}, ${dir} the ${parent} period (${range}).`;
  if (s !== null && first !== null && s < first) return out('starts', s, 'before');
  if (s !== null && last !== null && s > last) return out('starts', s, 'after');
  if (e !== null && last !== null && e > last) return out('ends', e, 'after');
  if (e !== null && first !== null && e < first) return out('ends', e, 'before');
  return null;
}

function minOf(a, b) {
  return a !== '' && (b === '' || a < b) ? a : b;
}

function maxOf(a, b) {
  return a !== '' && (b === '' || a > b) ? a : b;
}

/** Picker limits for a task date: the period's first/last day, tightened by the task's other date (twin). */
export function taskDateBounds(periodStart, periodEnd, twin, side) {
  const first = monthFirstDay(isEmpty(periodStart) ? '' : String(periodStart).trim()) || '';
  const last = monthLastDay(isEmpty(periodEnd) ? '' : String(periodEnd).trim()) || '';
  let t = toIso(twin) || '';
  // A twin outside the period no longer narrows the picker (it would leave min > max): it bounds nothing until moved inside.
  // An inverted period (start after end) still locks it, by design: taskPeriodError asks to fix the period first.
  if (t !== '' && (side === 'start' ? first !== '' && t < first : last !== '' && t > last)) t = '';
  if (side === 'start') return { min: first, max: last === '' ? t : t === '' ? last : minOf(t, last) };
  return { min: first === '' ? t : t === '' ? first : maxOf(t, first), max: last };
}

/** Picker limits for a period month: it must still contain every task date; the twin month bounds the other side. */
export function periodBounds(taskDates, side, twin) {
  const keys = (taskDates || []).map(toYmd).filter(k => k !== null).sort();
  const t = typeof twin === 'string' && isMonth(twin.trim()) ? twin.trim() : '';
  if (side === 'start') {
    const m = keys.length ? keys[0].slice(0, 6) : '';
    return { min: '', max: t === '' ? m : m === '' ? t : minOf(t, m) };
  }
  const m = keys.length ? keys[keys.length - 1].slice(0, 6) : '';
  return { min: t === '' ? m : m === '' ? t : maxOf(t, m), max: '' };
}

/** The tasks ({ name, start, end }) that leave the period, each with its taskPeriodError. */
export function outOfPeriodTasks(tasks, periodStart, periodEnd, parent) {
  const out = [];
  for (const t of tasks || []) {
    const error = taskPeriodError(t.start, t.end, periodStart, periodEnd, { label: t.name, parent });
    if (error !== null) out.push({ name: t.name, error });
  }
  return out;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

// 1-based month number for an English month name or its 3-letter abbreviation (any case), else 0.
function monthNumber(word) {
  const w = word.toLowerCase();
  const i = MONTHS.findIndex(n => n.toLowerCase() === w || n.slice(0, 3).toLowerCase() === w);
  return i + 1;
}

function normText(text) {
  return typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : null;
}

function dayFrom(y, mo, d) {
  if (!mo) return null;
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isDay(iso) ? iso : null;
}

/** 'Dec 1, 2025' (also 'Dec 1 2025', '1 Dec 2025', full month names, ISO) -> 'YYYY-MM-DD', null when not a real date. */
export function parseDayText(text) {
  const s = normText(text);
  if (s === null) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isDay(s) ? s : null;
  let m = s.match(/^([a-z]+) (\d{1,2}),? (\d{4})$/i);
  if (m) return dayFrom(m[3], monthNumber(m[1]), m[2]);
  m = s.match(/^(\d{1,2}) ([a-z]+) (\d{4})$/i);
  if (m) return dayFrom(m[3], monthNumber(m[2]), m[1]);
  return null;
}

/** 'YYYY-MM-DD' -> 'Dec 1, 2025', '' when the input is falsy or malformed. */
export function formatDayText(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso) || !isDay(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${MONTHS[Number(m) - 1].slice(0, 3)} ${Number(d)}, ${y}`;
}

/** 'Dec 2025' (also full month names, 'YYYY-MM') -> 'YYYYMM', null when not a real month. */
export function parseMonthText(text) {
  const s = normText(text);
  if (s === null) return null;
  let ym = null;
  let m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) ym = m[1] + m[2];
  else if ((m = s.match(/^([a-z]+) (\d{4})$/i))) {
    const mo = monthNumber(m[1]);
    if (mo) ym = m[2] + String(mo).padStart(2, '0');
  }
  return ym !== null && isMonth(ym) ? ym : null;
}

/** 'YYYYMM' -> 'Dec 2025', '' when the input is falsy or malformed. */
export function formatMonthText(ym) {
  if (!isMonth(ym)) return '';
  return `${MONTHS[Number(ym.slice(4)) - 1].slice(0, 3)} ${ym.slice(0, 4)}`;
}

/** True when value lies within the inclusive limits; empty limits are ignored. */
export function isWithin(value, min, max) {
  if (!isEmpty(min) && value < min) return false;
  if (!isEmpty(max) && value > max) return false;
  return true;
}

export function parseDateInput(text, { mode, min, max } = {}) {
  if (typeof text !== 'string' || text.trim() === '') return { value: '' };
  const isMonthMode = mode === 'month';
  const value = isMonthMode ? parseMonthText(text) : parseDayText(text);
  if (value === null) {
    return { error: isMonthMode ? 'Enter a month like Dec 2025.' : 'Enter a date like Dec 1, 2025.' };
  }
  const fmt = isMonthMode ? formatMonthText : formatDayText;
  if (!isEmpty(min) && value < min) return { error: 'Must be on or after ' + fmt(min) + '.' };
  if (!isEmpty(max) && value > max) return { error: 'Must be on or before ' + fmt(max) + '.' };
  return { value };
}

if (typeof window !== 'undefined') {
  window.isMonth = isMonth;
  window.isDay = isDay;
  window.toYmd = toYmd;
  window.toIso = toIso;
  window.monthFirstDay = monthFirstDay;
  window.monthLastDay = monthLastDay;
  window.isOrdered = isOrdered;
  window.periodError = periodError;
  window.parseDayText = parseDayText;
  window.formatDayText = formatDayText;
  window.parseMonthText = parseMonthText;
  window.formatMonthText = formatMonthText;
  window.parseDateInput = parseDateInput;
  window.isWithin = isWithin;
  window.taskPeriodError = taskPeriodError;
  window.taskDateBounds = taskDateBounds;
  window.periodBounds = periodBounds;
  window.outOfPeriodTasks = outOfPeriodTasks;
}
