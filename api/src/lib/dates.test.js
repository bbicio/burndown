const test = require('node:test');
const assert = require('node:assert/strict');
const { periodChangeError, DATE_RULE, isValidCalendarDate } = require('./dates');

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
