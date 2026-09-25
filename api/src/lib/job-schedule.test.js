const test = require('node:test');
const assert = require('node:assert/strict');
const { parseJobSettings, isJobDue } = require('./job-schedule');

const rows = (o) => Object.entries(o).map(([key, value]) => ({ key, value }));

test('parseJobSettings: defaults when nothing is stored', () => {
  assert.deepEqual(parseJobSettings([]), { enabled: true, intervalMin: 10 });
  assert.deepEqual(parseJobSettings(undefined), { enabled: true, intervalMin: 10 });
});

test('parseJobSettings: reads a valid interval and the enabled flag', () => {
  assert.deepEqual(
    parseJobSettings(rows({ profile_job_interval_min: '30', profile_job_enabled: 'false' })),
    { enabled: false, intervalMin: 30 }
  );
});

test('parseJobSettings: an invalid or out-of-range interval falls back to 10', () => {
  for (const bad of ['abc', '', '0', '-5', '1441', '2.5x']) {
    assert.equal(parseJobSettings(rows({ profile_job_interval_min: bad })).intervalMin, bad === '2.5x' ? 2 : 10, `value ${bad}`);
  }
});

test('parseJobSettings: boundaries 1 and 1440 are accepted', () => {
  assert.equal(parseJobSettings(rows({ profile_job_interval_min: '1' })).intervalMin, 1);
  assert.equal(parseJobSettings(rows({ profile_job_interval_min: '1440' })).intervalMin, 1440);
});

test('parseJobSettings: only the literal false disables (case/space-insensitive)', () => {
  assert.equal(parseJobSettings(rows({ profile_job_enabled: ' FALSE ' })).enabled, false);
  assert.equal(parseJobSettings(rows({ profile_job_enabled: 'true' })).enabled, true);
  assert.equal(parseJobSettings(rows({ profile_job_enabled: 'no' })).enabled, true);
});

test('isJobDue: a disabled job is never due', () => {
  assert.equal(isJobDue({ enabled: false, intervalMin: 10 }, null, new Date()), false);
});

test('isJobDue: a job that never ran is due', () => {
  assert.equal(isJobDue({ enabled: true, intervalMin: 10 }, null, new Date()), true);
});

test('isJobDue: due exactly at the interval boundary, not before', () => {
  const start = new Date('2026-09-25T10:00:00Z');
  const s = { enabled: true, intervalMin: 10 };
  assert.equal(isJobDue(s, start, new Date('2026-09-25T10:09:59Z')), false);
  assert.equal(isJobDue(s, start, new Date('2026-09-25T10:10:00Z')), true);
  assert.equal(isJobDue(s, start.toISOString(), new Date('2026-09-25T10:20:00Z')), true);
});

test('needsFreshContext: only work queued after the context was built', () => {
  const { needsFreshContext } = require('./job-schedule');
  const built = new Date('2026-09-25T10:00:00Z');
  assert.equal(needsFreshContext(new Date('2026-09-25T10:00:01Z'), built), true);
  assert.equal(needsFreshContext(new Date('2026-09-25T09:59:59Z'), built), false);
  assert.equal(needsFreshContext(built, built), false);
  assert.equal(needsFreshContext(null, built), false);
  assert.equal(needsFreshContext(new Date(), null), true);
});
