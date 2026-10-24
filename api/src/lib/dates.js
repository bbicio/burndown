// Server twin of js/lib/dates.js (the eight common functions must return identical results,
// pinned by js/lib/dates-guard.test.js). Storage formats: months 'YYYYMM', days 'YYYYMMDD'.
// All calendar arithmetic goes through Date.UTC so the host timezone never shifts a day.

const DATE_RULE = 'DATE_RULE';

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function isValidCalendarDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= lengths[month - 1];
}

function splitDay(v) {
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d{4})(\d{2})(\d{2})$/) || v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
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

function isMonth(v) {
  return typeof v === 'string' && /^\d{6}$/.test(v) && Number(v.slice(4)) >= 1 && Number(v.slice(4)) <= 12;
}

function isDay(v) {
  return splitDay(v) !== null;
}

function toYmd(v) {
  const p = splitDay(v);
  return p ? p.join('') : null;
}

function toIso(v) {
  const p = splitDay(v);
  return p ? p.join('-') : null;
}

function monthFirstDay(ym) {
  if (!isMonth(ym)) return null;
  return `${ym.slice(0, 4)}-${ym.slice(4)}-01`;
}

function monthLastDay(ym) {
  if (!isMonth(ym)) return null;
  const last = daysInMonth(Number(ym.slice(0, 4)), Number(ym.slice(4)));
  return `${ym.slice(0, 4)}-${ym.slice(4)}-${String(last).padStart(2, '0')}`;
}

function key(v) {
  if (isMonth(v)) return v;
  return toYmd(v);
}

function isOrdered(start, end) {
  if (isEmpty(start) || isEmpty(end)) {
    if (!isEmpty(start) && key(start) === null) return false;
    if (!isEmpty(end) && key(end) === null) return false;
    return true;
  }
  const a = key(start);
  const b = key(end);
  if (a === null || b === null) return false;
  return b >= a;
}

function periodError(start, end, { kind, label }) {
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

// null, '' and blank-only (CHAR(6) pads with spaces) all mean "no value".
function normalize(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

// body: { start, end } where undefined = field not in the request; stored: as read from the DB.
// A re-sent unchanged period is never rejected (pre-existing data is tolerated).
function periodChangeError(body, stored, { kind, label }) {
  const b = body || {};
  const s = stored || {};
  const fields = ['start', 'end'].filter(f => b[f] !== undefined);
  if (fields.every(f => normalize(b[f]) === normalize(s[f]))) return null;
  const start = normalize(b.start !== undefined ? b.start : s.start);
  const end = normalize(b.end !== undefined ? b.end : s.end);
  return periodError(start, end, { kind, label });
}

module.exports = {
  DATE_RULE,
  isLeapYear,
  isValidCalendarDate,
  isMonth,
  isDay,
  toYmd,
  toIso,
  monthFirstDay,
  monthLastDay,
  isOrdered,
  periodError,
  periodChangeError
};
