const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseJobSettings, isJobDue, composeRunError, shouldRecordRun, nextRunInfo, jobSettingsError, deriveProjectStatus,
} = require('./job-schedule');

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

// ── Cycle 3d: run-history throttle ─────────────────────────────────────────────

test('composeRunError: joins with "; ", caps at 500 characters, null when there is no error', () => {
  assert.equal(composeRunError([]), null);
  assert.equal(composeRunError(undefined), null);
  assert.equal(composeRunError(['P1: boom', 'P2: bang']), 'P1: boom; P2: bang');
  assert.equal(composeRunError(['x'.repeat(600)]).length, 500);
});

test('shouldRecordRun: manual runs are always recorded', () => {
  assert.equal(shouldRecordRun({ trigger: 'manual', projects: 0, errors: [], lastRunError: null }), true);
  assert.equal(shouldRecordRun({ trigger: 'manual', projects: 0, errors: ['P1: boom'], lastRunError: 'P1: boom' }), true);
});

test('shouldRecordRun: a scheduled or bootstrap run that processed something is recorded', () => {
  assert.equal(shouldRecordRun({ trigger: 'scheduled', projects: 2, errors: [], lastRunError: null }), true);
  assert.equal(shouldRecordRun({ trigger: 'bootstrap', projects: 1, errors: ['P1: boom'], lastRunError: 'P1: boom' }), true);
});

test('shouldRecordRun: an idle scheduled/bootstrap run (no work, no error) is not recorded', () => {
  assert.equal(shouldRecordRun({ trigger: 'scheduled', projects: 0, errors: [], lastRunError: null }), false);
  assert.equal(shouldRecordRun({ trigger: 'bootstrap', projects: 0, errors: [], lastRunError: 'old' }), false);
});

test('shouldRecordRun: the same error as the last recorded run is skipped (throttle)', () => {
  assert.equal(shouldRecordRun({ trigger: 'scheduled', projects: 0, errors: ['P1: boom'], lastRunError: 'P1: boom' }), false);
  assert.equal(shouldRecordRun({ trigger: 'bootstrap', projects: 0, errors: ['P1: boom'], lastRunError: 'P1: boom' }), false);
});

test('shouldRecordRun: a different error, or no previous run, is recorded', () => {
  assert.equal(shouldRecordRun({ trigger: 'scheduled', projects: 0, errors: ['P1: boom'], lastRunError: 'P1: other' }), true);
  assert.equal(shouldRecordRun({ trigger: 'scheduled', projects: 0, errors: ['P1: boom'], lastRunError: null }), true);
  assert.equal(shouldRecordRun({ trigger: 'scheduled', projects: 0, errors: ['P1: boom'], lastRunError: undefined }), true);
  assert.equal(shouldRecordRun({ trigger: 'scheduled', projects: 0, errors: ['P1: boom', 'P2: bang'], lastRunError: 'P1: boom' }), true);
});

test('shouldRecordRun: compares the composed string (joined and capped), not the raw errors', () => {
  const long = ['P1: ' + 'x'.repeat(600)];
  assert.equal(shouldRecordRun({ trigger: 'scheduled', projects: 0, errors: long, lastRunError: composeRunError(long) }), false);
  assert.equal(shouldRecordRun({ trigger: 'scheduled', projects: 0, errors: long, lastRunError: long[0] }), true);
});

// ── Cycle 3d: next run estimate ────────────────────────────────────────────────

const S = (enabled, intervalMin) => ({ enabled, intervalMin });
const NOW = new Date('2026-09-26T10:00:00Z');
const at = iso => new Date(iso);

test('nextRunInfo: a disabled job is paused, whatever the last run', () => {
  assert.deepEqual(nextRunInfo(S(false, 10), null, NOW), { state: 'paused', nextRunAt: null });
  assert.deepEqual(nextRunInfo(S(false, 10), at('2026-09-26T09:59:00Z'), NOW), { state: 'paused', nextRunAt: null });
});

test('nextRunInfo: never ran (null, undefined, invalid timestamp) → due', () => {
  assert.deepEqual(nextRunInfo(S(true, 10), null, NOW), { state: 'due', nextRunAt: null });
  assert.deepEqual(nextRunInfo(S(true, 10), undefined, NOW), { state: 'due', nextRunAt: null });
  assert.deepEqual(nextRunInfo(S(true, 10), 'not-a-date', NOW), { state: 'due', nextRunAt: null });
});

test('nextRunInfo: overdue, and exactly at the boundary, → due', () => {
  assert.deepEqual(nextRunInfo(S(true, 10), at('2026-09-26T09:00:00Z'), NOW), { state: 'due', nextRunAt: null });
  assert.deepEqual(nextRunInfo(S(true, 10), at('2026-09-26T09:50:00Z'), NOW), { state: 'due', nextRunAt: null });
});

test('nextRunInfo: not yet due → scheduled at last run + interval (ISO strings accepted)', () => {
  const r = nextRunInfo(S(true, 10), '2026-09-26T09:55:00.000Z', NOW);
  assert.equal(r.state, 'scheduled');
  assert.equal(r.nextRunAt.toISOString(), '2026-09-26T10:05:00.000Z');
});

test('nextRunInfo: interval boundaries 1 and 1440, and a non-standard interval', () => {
  assert.equal(nextRunInfo(S(true, 1), at('2026-09-26T09:59:30Z'), NOW).nextRunAt.toISOString(), '2026-09-26T10:00:30.000Z');
  assert.equal(nextRunInfo(S(true, 1), at('2026-09-26T09:59:00Z'), NOW).state, 'due');
  assert.equal(nextRunInfo(S(true, 1440), at('2026-09-25T10:00:01Z'), NOW).nextRunAt.toISOString(), '2026-09-26T10:00:01.000Z');
  assert.equal(nextRunInfo(S(true, 1440), at('2026-09-25T10:00:00Z'), NOW).state, 'due');
  assert.equal(nextRunInfo(S(true, 7), at('2026-09-26T09:58:00Z'), NOW).nextRunAt.toISOString(), '2026-09-26T10:05:00.000Z');
});

test('nextRunInfo: a last run in the future (clock skew) stays scheduled at last + interval', () => {
  const r = nextRunInfo(S(true, 10), at('2026-09-26T10:05:00Z'), NOW);
  assert.equal(r.state, 'scheduled');
  assert.equal(r.nextRunAt.toISOString(), '2026-09-26T10:15:00.000Z');
});

test('nextRunInfo agrees with isJobDue (due ⇔ isJobDue) across the boundary', () => {
  const s = S(true, 10);
  for (const offsetSec of [-60, 0, 1, 599, 600, 601, 3600]) {
    const last = new Date(NOW.getTime() - offsetSec * 1000);
    assert.equal(nextRunInfo(s, last, NOW).state === 'due', isJobDue(s, last, NOW), `offset ${offsetSec}s`);
  }
});

// ── Cycle 3d: settings validation and row status ───────────────────────────────

test('jobSettingsError: accepts booleans and integers 1..1440', () => {
  assert.equal(jobSettingsError({ enabled: true, intervalMin: 10 }), null);
  assert.equal(jobSettingsError({ enabled: false, intervalMin: 1 }), null);
  assert.equal(jobSettingsError({ enabled: true, intervalMin: 1440 }), null);
});

test('jobSettingsError: rejects every other type or value', () => {
  const bad = [
    undefined, null, 'x', [], [true, 10],
    {}, { enabled: true }, { intervalMin: 10 },
    { enabled: 'true', intervalMin: 10 }, { enabled: 'false', intervalMin: 10 }, { enabled: 1, intervalMin: 10 },
    { enabled: null, intervalMin: 10 },
    { enabled: true, intervalMin: '10' }, { enabled: true, intervalMin: 10.5 }, { enabled: true, intervalMin: 0 },
    { enabled: true, intervalMin: 1441 }, { enabled: true, intervalMin: -1 }, { enabled: true, intervalMin: null },
    { enabled: true, intervalMin: true },
  ];
  for (const body of bad) assert.equal(typeof jobSettingsError(body), 'string', `body ${JSON.stringify(body)}`);
});

test('deriveProjectStatus: error beats queued beats updated; never processed and not queued → unprocessed', () => {
  assert.equal(deriveProjectStatus({ queued_at: 'x', last_processed_at: 'y', last_error: 'boom' }), 'error');
  assert.equal(deriveProjectStatus({ queued_at: null, last_processed_at: null, last_error: 'boom' }), 'error');
  assert.equal(deriveProjectStatus({ queued_at: 'x', last_processed_at: 'y', last_error: null }), 'queued');
  assert.equal(deriveProjectStatus({ queued_at: 'x', last_processed_at: null, last_error: null }), 'queued');
  assert.equal(deriveProjectStatus({ queued_at: null, last_processed_at: 'y', last_error: null }), 'updated');
  assert.equal(deriveProjectStatus({ queued_at: null, last_processed_at: null, last_error: null }), 'unprocessed');
  assert.equal(deriveProjectStatus({}), 'unprocessed');
});
