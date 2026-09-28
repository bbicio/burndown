import { describe, it, expect } from 'vitest';
import {
  filterJobProjects, sortJobProjects, jobStatusLabel, jobStatusClass,
  describeNextRun, formatDateTime, formatDuration,
} from './profile-jobs-ui.js';

const P = (code, name, status, extra = {}) => ({
  project_code: code, project_name: name, status, row_count: 0, resource_count: 0,
  queued_at: status === 'queued' ? '2026-09-26T09:00:00.000Z' : null,
  last_processed_at: null, last_error: status === 'error' ? 'boom' : null, ...extra,
});

const list = [
  P('HITA.000001586.001', 'Città Alpha', 'queued'),
  P('HITA.000001586.002', 'Beta study', 'error'),
  P('ZED.1', 'Zed', 'updated', { last_processed_at: '2026-09-26T08:00:00.000Z' }),
  P('ABC.9', 'ABC.9', 'unprocessed'),
  P('ABC.10', 'Gamma', 'updated', { last_processed_at: '2026-09-25T08:00:00.000Z' }),
];
const codes = rows => rows.map(p => p.project_code);

describe('filterJobProjects', () => {
  it('returns every row for a blank search and status all, as a new array', () => {
    const out = filterJobProjects(list, { search: '  ', status: 'all' });
    expect(out).toEqual(list);
    expect(out).not.toBe(list);
  });

  it('matches code and name, case- and accent-insensitive, every token required', () => {
    expect(codes(filterJobProjects(list, { search: 'CITTA' }))).toEqual(['HITA.000001586.001']);
    expect(filterJobProjects(list, { search: '1586' })).toHaveLength(2);
    expect(codes(filterJobProjects(list, { search: 'hita beta' }))).toEqual(['HITA.000001586.002']);
    expect(codes(filterJobProjects(list, { search: '000001586.001' }))).toEqual(['HITA.000001586.001']);
    expect(filterJobProjects(list, { search: 'nothing' })).toEqual([]);
  });

  it('filters by derived status', () => {
    expect(codes(filterJobProjects(list, { status: 'queued' }))).toEqual(['HITA.000001586.001']);
    expect(codes(filterJobProjects(list, { status: 'error' }))).toEqual(['HITA.000001586.002']);
    expect(codes(filterJobProjects(list, { status: 'updated' }))).toEqual(['ZED.1', 'ABC.10']);
  });

  it('combines search and status; tolerates a missing list or options', () => {
    expect(filterJobProjects(list, { search: 'hita', status: 'error' })).toHaveLength(1);
    expect(filterJobProjects(undefined)).toEqual([]);
    expect(filterJobProjects(list)).toHaveLength(5);
  });
});

describe('sortJobProjects', () => {
  it('sorts by code, numeric-aware, in both directions', () => {
    expect(codes(sortJobProjects(list, 'code', 'asc')))
      .toEqual(['ABC.9', 'ABC.10', 'HITA.000001586.001', 'HITA.000001586.002', 'ZED.1']);
    expect(codes(sortJobProjects(list, 'code', 'desc')))
      .toEqual(['ZED.1', 'HITA.000001586.002', 'HITA.000001586.001', 'ABC.10', 'ABC.9']);
  });

  it('sorts by status (error, queued, not processed, updated); ties by code ascending', () => {
    expect(codes(sortJobProjects(list, 'status', 'asc')))
      .toEqual(['HITA.000001586.002', 'HITA.000001586.001', 'ABC.9', 'ABC.10', 'ZED.1']);
    expect(codes(sortJobProjects(list, 'status', 'desc')))
      .toEqual(['ABC.10', 'ZED.1', 'ABC.9', 'HITA.000001586.001', 'HITA.000001586.002']);
  });

  it('sorts by last processed; never-processed rows stay last in both directions', () => {
    expect(codes(sortJobProjects(list, 'lastProcessed', 'asc')))
      .toEqual(['ABC.10', 'ZED.1', 'ABC.9', 'HITA.000001586.001', 'HITA.000001586.002']);
    expect(codes(sortJobProjects(list, 'lastProcessed', 'desc')))
      .toEqual(['ZED.1', 'ABC.10', 'ABC.9', 'HITA.000001586.001', 'HITA.000001586.002']);
  });

  it('does not mutate the input; an unknown key falls back to code', () => {
    const copy = list.slice();
    sortJobProjects(list, 'status', 'desc');
    expect(list).toEqual(copy);
    expect(codes(sortJobProjects(list, 'bogus'))[0]).toBe('ABC.9');
    expect(sortJobProjects(undefined)).toEqual([]);
  });
});

describe('jobStatusLabel / jobStatusClass', () => {
  it('labels the four statuses', () => {
    expect(['error', 'queued', 'updated', 'unprocessed'].map(jobStatusLabel))
      .toEqual(['Error', 'Queued', 'Updated', 'Not processed']);
  });

  it('gives a badge class per status and a neutral one for anything unknown', () => {
    expect(jobStatusClass('error')).toBe('job-st job-st-error');
    expect(jobStatusClass('queued')).toBe('job-st job-st-queued');
    expect(jobStatusClass('weird')).toBe('job-st job-st-unprocessed');
    expect(jobStatusLabel('weird')).toBe('weird');
    expect(jobStatusLabel(null)).toBe('');
  });
});

describe('formatDateTime', () => {
  it('formats a timestamp as local YYYY-MM-DD HH:MM', () => {
    const local = new Date(2026, 8, 26, 14, 5, 59);
    expect(formatDateTime(local.toISOString())).toBe('2026-09-26 14:05');
    expect(formatDateTime(local)).toBe('2026-09-26 14:05');
  });

  it('returns — for empty or invalid values', () => {
    for (const v of [null, undefined, '', 'nope']) expect(formatDateTime(v)).toBe('—');
  });
});

describe('describeNextRun', () => {
  const sched = (state, nextRunAt = null) => ({ state, lastRunAt: null, nextRunAt });
  const at = new Date(2026, 8, 26, 15, 30).toISOString();

  it('describes the global schedule', () => {
    expect(describeNextRun(sched('paused'))).toBe('Paused');
    expect(describeNextRun(sched('due'))).toBe('On the next tick (within 60 s)');
    expect(describeNextRun(sched('scheduled', at))).toBe('2026-09-26 15:30');
  });

  it('a row that is not queued has no next processing', () => {
    expect(describeNextRun(sched('scheduled', at), { queued_at: null })).toBe('—');
  });

  it('a queued row follows the job schedule', () => {
    const q = { queued_at: '2026-09-26T09:00:00.000Z' };
    expect(describeNextRun(sched('paused'), q)).toBe('Paused');
    expect(describeNextRun(sched('due'), q)).toBe('On the next tick (within 60 s)');
    expect(describeNextRun(sched('scheduled', at), q)).toBe('2026-09-26 15:30');
  });

  it('a scheduled state without a valid date, or no schedule at all, falls back to the next tick', () => {
    expect(describeNextRun(sched('scheduled', null))).toBe('On the next tick (within 60 s)');
    expect(describeNextRun(sched('scheduled', 'nope'))).toBe('On the next tick (within 60 s)');
    expect(describeNextRun(undefined)).toBe('On the next tick (within 60 s)');
  });
});

describe('formatDuration', () => {
  const t0 = '2026-09-26T10:00:00.000Z';
  const plus = ms => new Date(Date.parse(t0) + ms).toISOString();

  it('formats seconds, minutes and hours', () => {
    expect(formatDuration(t0, plus(0))).toBe('< 1 s');
    expect(formatDuration(t0, plus(400))).toBe('< 1 s');
    expect(formatDuration(t0, plus(12_300))).toBe('12 s');
    expect(formatDuration(t0, plus(185_000))).toBe('3 min 5 s');
    expect(formatDuration(t0, plus(3_720_000))).toBe('1 h 2 min');
  });

  it('returns — when a timestamp is missing or invalid, or the end is before the start', () => {
    expect(formatDuration(t0, null)).toBe('—');
    expect(formatDuration(null, t0)).toBe('—');
    expect(formatDuration('nope', t0)).toBe('—');
    expect(formatDuration(t0, plus(-1000))).toBe('—');
  });
});
