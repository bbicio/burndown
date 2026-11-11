const test = require('node:test');
const assert = require('node:assert/strict');
const { phasingByVersion } = require('./phasing-export');

const base = {
  version_id: 'v', cg_name: 'Grid', version_label: 'V1', pipeline: 'Committed',
  ver_start: '20260101', ver_end: '20261231',
  task_start: '20260101', task_end: '20260331',
  days: 120, hourly_rate: '50',
};

test('the stored hours are spread over the task months without a x8 factor', () => {
  const v = phasingByVersion([base], 2026).get('v');
  assert.deepEqual(v.months['2026-01'], { hours: 40, amount: 2000 });
  assert.deepEqual(v.months['2026-03'], { hours: 40, amount: 2000 });
  assert.equal(v.name, 'Grid');
  assert.equal(v.versionLabel, 'V1');
});

test('a row without task dates falls back to the version dates', () => {
  const r = { ...base, task_start: null, task_end: null, ver_start: '20260101', ver_end: '20260212', days: 80 };
  const v = phasingByVersion([r], 2026).get('v');
  assert.deepEqual(v.months['2026-01'], { hours: 40, amount: 2000 });
  assert.deepEqual(v.months['2026-02'], { hours: 40, amount: 2000 });
});

test('a row with no dates at all yields no months', () => {
  const r = { ...base, task_start: null, task_end: null, ver_start: null, ver_end: null };
  const v = phasingByVersion([r], 2026).get('v');
  assert.deepEqual(v.months, {});
  assert.equal(v.startDate, '');
});

test('months outside the year are dropped', () => {
  const r = { ...base, task_start: '20251201', task_end: '20260131', days: 100 };
  const v = phasingByVersion([r], 2026).get('v');
  assert.deepEqual(Object.keys(v.months), ['2026-01']);
  assert.equal(v.months['2026-01'].hours, 50);
});
