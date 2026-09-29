const test = require('node:test');
const assert = require('node:assert/strict');
const {
  utcDate, isoDate, dateKey, addDays, mondayOnOrBefore, parseTaskDate,
  getCalendarWeeks, countFutureTaskWeeks, makeFutureWeekCounter,
} = require('./planning-calendar');

const D = (s) => isoDate(s);

test('isoDate: valid, invalid and rolled-over dates', () => {
  assert.equal(dateKey(D('2026-09-15')), '2026-09-15');
  assert.equal(dateKey(isoDate('2026-09-15T10:00:00Z')), '2026-09-15');
  assert.equal(isoDate('2026-02-31'), null);
  assert.equal(isoDate('15/09/2026'), null);
  assert.equal(isoDate(''), null);
  assert.equal(isoDate(null), null);
});

test('mondayOnOrBefore: Monday stays, Sunday goes back six days, midweek goes to Monday', () => {
  assert.equal(dateKey(mondayOnOrBefore(D('2026-09-14'))), '2026-09-14'); // Monday
  assert.equal(dateKey(mondayOnOrBefore(D('2026-09-20'))), '2026-09-14'); // Sunday
  assert.equal(dateKey(mondayOnOrBefore(D('2026-09-16'))), '2026-09-14'); // Wednesday
});

test('parseTaskDate: YYYYMMDD exact, YYYYMM start/end of month, empty -> sentinels', () => {
  assert.equal(dateKey(parseTaskDate('20260915', false)), '2026-09-15');
  assert.equal(dateKey(parseTaskDate('202609', false)), '2026-09-01');
  assert.equal(dateKey(parseTaskDate('202609', true)), '2026-09-30');
  assert.equal(dateKey(parseTaskDate('202602', true)), '2026-02-28');
  assert.equal(dateKey(parseTaskDate('', true)), '9999-12-31');
  assert.equal(dateKey(parseTaskDate(null, false)), '1970-01-01');
});

test('getCalendarWeeks: Monday-anchored weeks, past/current flags, month key of the week start', () => {
  const weeks = getCalendarWeeks(D('2026-09-01'), D('2026-09-30'), D('2026-09-15'));
  assert.deepEqual(weeks.map(w => w.key), ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
  assert.deepEqual(weeks.map(w => w.isPast), [true, true, false, false, false]);
  assert.deepEqual(weeks.map(w => w.isCurrent), [false, false, true, false, false]);
  assert.equal(weeks[0].monthKey, 'Aug 2026');
  assert.equal(weeks[1].monthKey, 'Sep 2026');
  assert.equal(dateKey(weeks[1].weekEnd), '2026-09-13');
});

test('countFutureTaskWeeks: task spanning today, task fully in the future, ended task', () => {
  const today = D('2026-09-15');
  assert.equal(countFutureTaskWeeks(D('2026-09-01'), D('2026-09-30'), today), 3);
  assert.equal(countFutureTaskWeeks(D('2026-10-05'), D('2026-10-25'), today), 3);
  assert.equal(countFutureTaskWeeks(D('2026-08-01'), D('2026-09-01'), today), 0);
  assert.equal(countFutureTaskWeeks(D('2026-09-01'), null, today), 0);
});

test('makeFutureWeekCounter: memoised, and an undated task (end year 9999) stays fast', () => {
  const counter = makeFutureWeekCounter(D('2026-09-15'));
  const t0 = Date.now();
  const a = counter(parseTaskDate('', false), parseTaskDate('', true));
  const b = counter(parseTaskDate('', false), parseTaskDate('', true));
  assert.equal(a, b);
  assert.ok(a > 100000, `expected a huge week count for an undated task, got ${a}`);
  assert.ok(Date.now() - t0 < 2000, 'undated task count must not take seconds');
});
