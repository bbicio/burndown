// Pure helpers for the Cost Grid custom form controls (js/cg-controls.js).
// All date arithmetic goes through Date.UTC — a local-timezone Date constructor
// shifts the day in negative-offset zones.

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function isYm(ym) {
  return typeof ym === 'string' && /^\d{6}$/.test(ym) && Number(ym.slice(4)) >= 1 && Number(ym.slice(4)) <= 12;
}

function isIso(iso) {
  return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso);
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Short month label for a 1-based month number. */
export function monthLabel(month, long) {
  const list = long ? MONTH_LONG : MONTH_SHORT;
  return list[month - 1] || '';
}

/**
 * 12 month cells for a year.
 * @returns {{key:string,label:string,disabled:boolean}[]} key is 'YYYYMM'.
 */
export function monthGridYear(year, opts) {
  const o = opts || {};
  const min = isYm(o.min) ? o.min : null;
  const max = isYm(o.max) ? o.max : null;
  const out = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}${pad2(m)}`;
    out.push({
      key,
      label: MONTH_SHORT[m - 1],
      disabled: (min !== null && key < min) || (max !== null && key > max)
    });
  }
  return out;
}

/**
 * 6 weeks x 7 days, Monday first. Leading/trailing cells are { iso: null, day: null }.
 * `inRange` is true for days strictly between `min` and `selected`.
 * @param {number} month 1-based.
 */
export function dayGridMonth(year, month, opts) {
  const o = opts || {};
  const min = isIso(o.min) ? o.min : null;
  const max = isIso(o.max) ? o.max : null;
  const selected = isIso(o.selected) ? o.selected : null;
  const today = todayIso();

  const first = new Date(Date.UTC(year, month - 1, 1));
  // getUTCDay(): 0 = Sunday. Monday-first offset.
  const offset = (first.getUTCDay() + 6) % 7;
  const total = daysInMonth(year, month);

  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const dayNum = w * 7 + d - offset + 1;
      if (dayNum < 1 || dayNum > total) {
        week.push({ iso: null, day: null, disabled: true, inRange: false, isToday: false });
        continue;
      }
      const iso = `${year}-${pad2(month)}-${pad2(dayNum)}`;
      const inRange = !!(min && selected && min < selected && iso > min && iso < selected);
      week.push({
        iso,
        day: dayNum,
        disabled: (min !== null && iso < min) || (max !== null && iso > max),
        inRange,
        isToday: iso === today
      });
    }
    weeks.push(week);
  }
  return weeks;
}

/** 'dd/mm/yyyy' -> 'YYYY-MM-DD', null when the text is not a real date. */
export function parseItDate(text) {
  if (typeof text !== 'string') return null;
  const m = text.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** 'YYYY-MM-DD' -> 'dd/mm/yyyy', '' when the input is falsy or malformed. */
export function formatItDate(iso) {
  if (!isIso(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** 'mm/yyyy' -> 'YYYYMM', null when the text is not a real month. */
export function parseMonthInput(text) {
  if (typeof text !== 'string') return null;
  const m = text.trim().match(/^(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const month = Number(m[1]);
  if (month < 1 || month > 12) return null;
  return `${m[2]}${m[1]}`;
}

/** 'YYYYMM' -> 'mm/yyyy', '' when the input is falsy or malformed. */
export function formatMonthInput(ym) {
  if (!isYm(ym)) return '';
  return `${ym.slice(4)}/${ym.slice(0, 4)}`;
}

if (typeof window !== 'undefined') {
  window.monthGridYear = monthGridYear;
  window.dayGridMonth = dayGridMonth;
  window.parseItDate = parseItDate;
  window.formatItDate = formatItDate;
  window.parseMonthInput = parseMonthInput;
  window.formatMonthInput = formatMonthInput;
  window.cgMonthLabel = monthLabel;
}
