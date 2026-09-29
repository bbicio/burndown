'use strict';
// Calendar helpers for the planning model. A "calendar date" is a Date at 00:00 UTC, so nothing
// here depends on the server's time zone. Weeks are Monday-Sunday. Direct ports of the browser
// helpers (js/core.js parseTaskDate/buildMonthPeriods, js/lib/planning-calc.js) for parity.

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_MS = 86400000;

function utcDate(y, m0, d) { return new Date(Date.UTC(y, m0, d)); }

// 'YYYY-MM-DD…' -> calendar Date, or null when unparsable / impossible (e.g. Feb 31).
function isoDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str ?? ''));
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const date = utcDate(y, mo - 1, d);
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

function dateKey(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { return new Date(d.getTime() + n * DAY_MS); }

function mondayOnOrBefore(d) {
  const dow = d.getUTCDay();
  return addDays(d, -(dow === 0 ? 6 : dow - 1));
}

// Task date string (YYYYMMDD, or legacy YYYYMM: first/last day of the month) -> calendar Date.
function parseTaskDate(str, isEnd) {
  if (!str) return isEnd ? utcDate(9999, 11, 31) : new Date(0);
  if (str.length >= 8) return utcDate(parseInt(str.slice(0, 4), 10), parseInt(str.slice(4, 6), 10) - 1, parseInt(str.slice(6, 8), 10));
  const y = parseInt(str.slice(0, 4), 10), m = parseInt(str.slice(4, 6), 10);
  return isEnd ? utcDate(y, m, 0) : utcDate(y, m - 1, 1);
}

// Weeks (Mon-Sun) from the Monday on/before `start` to `end`. `key` is the Monday as YYYY-MM-DD;
// `monthKey` is derived from the week START ("Sep 2026"), exactly like the browser.
function getCalendarWeeks(start, end, today) {
  const weeks = [];
  for (let cur = mondayOnOrBefore(start); cur <= end; cur = addDays(cur, 7)) {
    const weekEnd = addDays(cur, 6);
    weeks.push({
      key: dateKey(cur),
      weekStart: cur,
      weekEnd,
      monthKey: `${MONTH_NAMES[cur.getUTCMonth()]} ${cur.getUTCFullYear()}`,
      isPast: weekEnd < today,
      isCurrent: cur <= today && weekEnd >= today,
    });
  }
  return weeks;
}

// Port of countFutureTaskWeeks (js/lib/planning-calc.js): weeks (Mon-based, weekEnd >= today)
// overlapping the task range, independent of any visible window.
function countFutureTaskWeeks(tStart, tEnd, today) {
  if (!tEnd || tEnd < today) return 0;
  const effectiveStart = (tStart && tStart > today) ? tStart : today;
  let count = 0;
  for (let d = mondayOnOrBefore(effectiveStart); d <= tEnd; d = addDays(d, 7)) {
    const wEnd = addDays(d, 6);
    if (wEnd >= today && (!tStart || wEnd >= tStart)) count++;
  }
  return count;
}

// A task with no dates anywhere ends in year 9999 (~400k weeks): memoise per (start, end).
function makeFutureWeekCounter(today) {
  const memo = new Map();
  return (tStart, tEnd) => {
    const key = `${tStart ? tStart.getTime() : 'n'}|${tEnd ? tEnd.getTime() : 'n'}`;
    if (!memo.has(key)) memo.set(key, countFutureTaskWeeks(tStart, tEnd, today));
    return memo.get(key);
  };
}

module.exports = {
  MONTH_NAMES, utcDate, isoDate, dateKey, addDays, mondayOnOrBefore,
  parseTaskDate, getCalendarWeeks, countFutureTaskWeeks, makeFutureWeekCounter,
};
