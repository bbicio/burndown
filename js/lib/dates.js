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

/** 'dd/mm/yyyy' -> 'YYYY-MM-DD', null when the text is not a real date. */
export function parseDayText(text) {
  if (typeof text !== 'string') return null;
  const m = text.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return isDay(iso) ? iso : null;
}

/** 'YYYY-MM-DD' -> 'dd/mm/yyyy', '' when the input is falsy or malformed. */
export function formatDayText(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** 'mm/yyyy' -> 'YYYYMM', null when the text is not a real month. */
export function parseMonthText(text) {
  if (typeof text !== 'string') return null;
  const m = text.trim().match(/^(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const ym = `${m[2]}${m[1]}`;
  return isMonth(ym) ? ym : null;
}

/** 'YYYYMM' -> 'mm/yyyy', '' when the input is falsy or malformed. */
export function formatMonthText(ym) {
  if (!isMonth(ym)) return '';
  return `${ym.slice(4)}/${ym.slice(0, 4)}`;
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
    return { error: isMonthMode ? 'Enter a month as mm/yyyy.' : 'Enter a date as dd/mm/yyyy.' };
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
}
