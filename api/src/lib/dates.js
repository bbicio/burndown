// Server twin of js/lib/dates.js (the common functions must return identical results,
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

function taskPeriodError(start, end, periodStart, periodEnd, { label, parent }) {
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

// Server only. body: { start?, end? } (absent = keep the stored side, '' = clear); stored: as read from the DB.
function mergePeriod(body, stored) {
  const b = body || {};
  const s = stored || {};
  return {
    start: b.start === undefined ? normalize(s.start) : normalize(b.start),
    end: b.end === undefined ? normalize(s.end) : normalize(b.end)
  };
}

// True when a side present in the body differs from the stored one (a re-sent identical period is no change).
function periodChanged(body, stored) {
  const b = body || {};
  const s = stored || {};
  return ['start', 'end'].some(f => b[f] !== undefined && normalize(b[f]) !== normalize(s[f]));
}

// Value to write in a CHAR(6) period column: null for "no value", otherwise trimmed.
function periodColumn(v) {
  const n = normalize(v);
  return n === '' ? null : n;
}

function taskKey(t) {
  const day = v => toYmd(normalize(v)) ?? normalize(v);
  return `${normalize(t.name).replace(/\s+/g, ' ')}|${day(t.start)}|${day(t.end)}`;
}

// Server only. tasks: the task list being written; storedTasks: what is saved now ({ name, start, end }).
// A task identical to a saved one (name, start, end; each saved task matches once) is tolerated if it is
// already outside the stored period, and checked against the next period otherwise. Any other task is
// new or edited: checked in full against the next period, then for its own start/end order.
function taskDatesError({ tasks, storedTasks, storedPeriod, nextPeriod, parent }) {
  const st = storedPeriod || {};
  const nx = nextPeriod || {};
  const unused = new Map();
  for (const t of (storedTasks || [])) {
    const k = taskKey(t);
    unused.set(k, (unused.get(k) || 0) + 1);
  }
  for (const t of (tasks || [])) {
    const start = normalize(t.start);
    const end = normalize(t.end);
    const k = taskKey(t);
    const left = unused.get(k) || 0;
    const unchanged = left > 0;
    if (unchanged) unused.set(k, left - 1);
    if (start === '' && end === '') continue;
    const o = { label: t.name, parent };
    if (unchanged) {
      if (taskPeriodError(start, end, st.start, st.end, o) !== null) continue;
      const err = taskPeriodError(start, end, nx.start, nx.end, o);
      if (err !== null) return err;
      continue;
    }
    const err = taskPeriodError(start, end, nx.start, nx.end, o)
      || periodError(start, end, { kind: 'day', label: `task "${normalize(t.name)}"` });
    if (err) return err;
  }
  return null;
}

// Server only. keys: { key: 'YYYYMM', label }[] about to be written to a project; storedKeys: the keys
// already saved. A blank key, a stored key, a project without period or with an invalid or inverted stored
// period have no limit; an empty side of the period is open; any other key must be a YYYYMM month.
function monthKeysError(keys, storedPeriod, storedKeys) {
  const ps = normalize((storedPeriod || {}).start);
  const pe = normalize((storedPeriod || {}).end);
  // Without a usable period there is no limit to enforce, but a key must still be a month.
  const limited = !((ps !== '' && !isMonth(ps)) || (pe !== '' && !isMonth(pe)))
    && !(ps === '' && pe === '') && !(ps !== '' && pe !== '' && ps > pe);
  const stored = new Set((storedKeys || []).map(normalize));
  const show = v => (v === '' ? '…' : `${v.slice(0, 4)}-${v.slice(4)}`);
  for (const { key: raw, label } of (keys || [])) {
    const k = normalize(raw);
    if (k === '' || stored.has(k)) continue;
    if (!isMonth(k)) return `${label} month "${k}" is not a valid month (expected YYYYMM).`;
    if (limited && ((ps !== '' && k < ps) || (pe !== '' && k > pe))) {
      return `${label} month ${show(k)} is outside the project period (${show(ps)} – ${show(pe)}).`;
    }
  }
  return null;
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
  periodChangeError,
  taskPeriodError,
  mergePeriod,
  periodChanged,
  periodColumn,
  taskDatesError,
  monthKeysError
};
