const test = require('node:test');
const assert = require('node:assert/strict');
const {
  periodChangeError, DATE_RULE, isValidCalendarDate, taskPeriodError,
  mergePeriod, periodChanged, periodColumn, taskDatesError, monthKeysError
} = require('./dates');

const V = { kind: 'month', label: 'version' };

test('DATE_RULE is the stable error code', () => {
  assert.equal(DATE_RULE, 'DATE_RULE');
});

test('re-sending an identical (even disordered) stored period is tolerated', () => {
  assert.equal(periodChangeError({ start: '202609', end: '202607' }, { start: '202609', end: '202607' }, V), null);
});

test('null, empty and blank-padded values all count as empty', () => {
  assert.equal(periodChangeError({ start: null, end: null }, { start: '      ', end: null }, V), null);
  assert.equal(periodChangeError({ start: '', end: undefined }, { start: null, end: '' }, V), null);
});

test('a body field alone is checked against the stored other side', () => {
  assert.equal(
    periodChangeError({ end: '202607' }, { start: '202609', end: '202612' }, V),
    'Version end date (2026-07) is before its start date (2026-09).'
  );
});

test('a body without date fields is never checked', () => {
  assert.equal(periodChangeError({}, { start: '202609', end: '202607' }, V), null);
});

test('stored values are trimmed before comparison', () => {
  assert.equal(periodChangeError({ start: '202601' }, { start: '202601', end: '202603' }, V), null);
  assert.equal(periodChangeError({ start: '202601  ' }, { start: '202601', end: '202603' }, V), null);
});

test('an invalid changed value is reported', () => {
  assert.equal(
    periodChangeError({ start: '2026-05' }, { start: null, end: null }, V),
    'Invalid version start date "2026-05": expected YYYYMM.'
  );
});

test('isValidCalendarDate', () => {
  assert.equal(isValidCalendarDate(2024, 2, 29), true);
  assert.equal(isValidCalendarDate(2026, 2, 29), false);
  assert.equal(isValidCalendarDate(2026, 13, 1), false);
});

test('taskPeriodError accepts a task inside the period and refuses one outside', () => {
  const o = { label: 'T', parent: 'project' };
  assert.equal(taskPeriodError('2026-05-01', '2026-06-01', '202604', '202612', o), null);
  assert.equal(
    taskPeriodError('2026-03-01', '', '202604', '202612', o),
    'Task "T" starts on 2026-03-01, before the project period (2026-04 – 2026-12).'
  );
});

test('taskPeriodError names an unnamed task as Untitled task', () => {
  assert.equal(
    taskPeriodError('2026-03-01', '', '202604', '202612', { label: '', parent: 'version' }),
    'Task "Untitled task" starts on 2026-03-01, before the version period (2026-04 – 2026-12).'
  );
});


test('mergePeriod keeps the stored side when absent and clears on empty string', () => {
  assert.deepEqual(mergePeriod({ start: '202609' }, { start: '202601 ', end: '202612' }), { start: '202609', end: '202612' });
  assert.deepEqual(mergePeriod({ end: '' }, { start: '202601', end: '202612' }), { start: '202601', end: '' });
});

test('periodChanged ignores a re-sent identical period and blank padding', () => {
  assert.equal(periodChanged({ start: '202601', end: '202612' }, { start: '202601 ', end: '202612' }), false);
  assert.equal(periodChanged({ end: '202611' }, { start: '202601', end: '202612' }), true);
  assert.equal(periodChanged({}, { start: '202601', end: '202612' }), false);
});

test('periodColumn maps blank to null and trims the rest', () => {
  assert.equal(periodColumn('  '), null);
  assert.equal(periodColumn(null), null);
  assert.equal(periodColumn(undefined), null);
  assert.equal(periodColumn(' 202601'), '202601');
});

const P = { start: '202604', end: '202612' };
const tdErr = (tasks, storedTasks, storedPeriod, nextPeriod) =>
  taskDatesError({ tasks, storedTasks, storedPeriod, nextPeriod, parent: 'version' });

test('taskDatesError accepts a valid task inside the period', () => {
  const t = [{ name: 'A', start: '20260501', end: '20260601' }];
  assert.equal(tdErr(t, [], P, P), null);
});

test('taskDatesError refuses a new task whose end is before its start', () => {
  const t = [{ name: 'A', start: '20260601', end: '20260501' }];
  assert.match(tdErr(t, [], P, P), /before its start date/);
});

test('taskDatesError checks an edited task in full, even with the same dates', () => {
  const stored = [{ name: 'Old', start: '20260301', end: '' }];
  const t = [{ name: 'New', start: '20260301', end: '' }];
  assert.match(tdErr(t, stored, P, P), /before the version period/);
});

test('taskDatesError tolerates an unchanged task already outside the stored period', () => {
  const t = [{ name: 'Out', start: '20260301', end: '' }];
  assert.equal(tdErr(t, t, P, P), null);
});

test('taskDatesError names the first task a shrunk period pushes out', () => {
  const tasks = [{ name: 'A', start: '20260501', end: '20260601' }, { name: 'B', start: '20260410', end: '' }];
  assert.equal(
    tdErr(tasks, tasks, P, { start: '202605', end: '202612' }),
    'Task "B" starts on 2026-04-10, before the version period (2026-05 – 2026-12).'
  );
  assert.equal(tdErr(tasks, tasks, P, { start: '202603', end: '202612' }), null);
});

test('taskDatesError gives the same shrink message whatever the stored list holds', () => {
  const tasks = [{ name: 'B', start: '20260410', end: '' }];
  const next = { start: '202605', end: '202612' };
  const extra = [{ name: 'Z', start: '20260601', end: '' }, ...tasks];
  assert.equal(tdErr(tasks, tasks, P, next), tdErr(tasks, extra, P, next));
});

test('taskDatesError ignores tasks without dates', () => {
  const t = [{ name: 'None', start: '', end: null }];
  assert.equal(tdErr(t, t, P, { start: '202605', end: '202612' }), null);
});

test('taskDatesError treats an inverted stored period as no baseline', () => {
  const t = [{ name: 'A', start: '2026-08-01', end: '' }];
  assert.equal(tdErr(t, t, { start: '202609', end: '202607' }, { start: '202608', end: '202612' }), null);
});

test('taskDatesError checks the second of two identical tasks when only one is stored', () => {
  const t = { name: 'Dup', start: '20260301', end: '' };
  assert.match(tdErr([t, { ...t }], [t], P, P), /Task "Dup" starts on 2026-03-01/);
});

test('monthKeysError refuses a key outside the period and names it', () => {
  const err = monthKeysError([{ key: '202601', label: 'PTC row 1' }], { start: '202609', end: '202612' }, []);
  assert.match(err, /PTC row 1/);
  assert.match(err, /2026-09/);
});

test('monthKeysError accepts a key that is already stored', () => {
  assert.equal(monthKeysError([{ key: '202601', label: 'P' }], { start: '202609', end: '202612' }, ['202601']), null);
});

test('monthKeysError gives a blank month and a project without period no limits', () => {
  assert.equal(monthKeysError([{ key: '', label: 'P' }], { start: '202609', end: '202612' }, []), null);
  assert.equal(monthKeysError([{ key: '202601', label: 'P' }], { start: '', end: '' }, []), null);
});

test('monthKeysError treats an empty side as open', () => {
  const p = { start: '202609', end: '' };
  assert.notEqual(monthKeysError([{ key: '202601', label: 'P' }], p, []), null);
  assert.equal(monthKeysError([{ key: '202701', label: 'P' }], p, []), null);
});

test('monthKeysError tolerates an invalid stored period', () => {
  assert.equal(monthKeysError([{ key: '202601', label: 'P' }], { start: 'abc', end: '' }, []), null);
});

test('monthKeysError gives an inverted stored period no limit', () => {
  assert.equal(monthKeysError([{ key: '202601', label: 'P' }], { start: '202609', end: '202607' }, []), null);
});

test('monthKeysError refuses a key that is not a month', () => {
  const a = monthKeysError([{ key: '2026-07', label: 'P' }], { start: '202604', end: '202612' }, []);
  assert.equal(a, 'P month "2026-07" is not a valid month (expected YYYYMM).');
  const b = monthKeysError([{ key: 'zzz', label: 'P' }], { start: '202609', end: '' }, []);
  assert.equal(b, 'P month "zzz" is not a valid month (expected YYYYMM).');
});

test('monthKeysError tolerates a stored key that is not a month', () => {
  assert.equal(monthKeysError([{ key: 'zzz', label: 'P' }], { start: '202609', end: '' }, ['zzz']), null);
});

test('monthKeysError checks the key format even when the project has no period', () => {
  const err = monthKeysError([{ key: '2026-07', label: 'P' }], { start: '', end: '' }, []);
  assert.equal(err, 'P month "2026-07" is not a valid month (expected YYYYMM).');
});

test('monthKeysError checks the key format even when the stored period is invalid or inverted', () => {
  assert.match(monthKeysError([{ key: 'zzz', label: 'P' }], { start: 'abc', end: '' }, []), /is not a valid month/);
  assert.match(monthKeysError([{ key: 'zzz', label: 'P' }], { start: '202609', end: '202607' }, []), /is not a valid month/);
});

test('monthKeysError still gives a valid month no limit when there is no usable period', () => {
  assert.equal(monthKeysError([{ key: '202601', label: 'P' }], { start: '', end: '' }, []), null);
  assert.equal(monthKeysError([{ key: '202601', label: 'P' }], { start: 'abc', end: '' }, []), null);
});
