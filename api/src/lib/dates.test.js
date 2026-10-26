const test = require('node:test');
const assert = require('node:assert/strict');
const { periodChangeError, DATE_RULE, isValidCalendarDate, taskPeriodError, periodShrinkError } = require('./dates');

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

test('periodShrinkError names the first task the new period pushes out', () => {
  const tasks = [{ name: 'A', start: '20260501', end: '20260601' }, { name: 'B', start: '20260410', end: '' }];
  const stored = { start: '202604', end: '202612' };
  assert.equal(
    periodShrinkError(tasks, stored, { start: '202605', end: '202612' }, { parent: 'version' }),
    'Task "B" starts on 2026-04-10, before the version period (2026-05 – 2026-12).'
  );
  assert.equal(periodShrinkError(tasks, stored, { start: '202603', end: '202612' }, { parent: 'version' }), null);
});

test('periodShrinkError ignores tasks already outside the stored period and tasks without dates', () => {
  const stored = { start: '202604', end: '202612' };
  const tasks = [{ name: 'Out', start: '20260301', end: '' }, { name: 'None', start: '', end: null }];
  assert.equal(periodShrinkError(tasks, stored, { start: '202605', end: '202612' }, { parent: 'project' }), null);
});

test('periodShrinkError treats an inverted stored period as no baseline', () => {
  const tasks = [{ name: 'A', start: '2026-08-01', end: '' }];
  assert.equal(
    periodShrinkError(tasks, { start: '202609', end: '202607' }, { start: '202608', end: '202612' }, { parent: 'version' }),
    null
  );
});
