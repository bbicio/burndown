import { describe, it, expect } from 'vitest';
import {
  isMonth, isDay, toYmd, toIso, monthFirstDay, monthLastDay, isOrdered, periodError,
  parseDayText, formatDayText, parseMonthText, formatMonthText, parseDateInput, isWithin,
  taskPeriodError, taskDateBounds, periodBounds, outOfPeriodTasks
} from './dates.js';

describe('isDay / isMonth', () => {
  it('validates calendar days in both formats', () => {
    expect(isDay('20260431')).toBe(false);
    expect(isDay('20260229')).toBe(false);
    expect(isDay('20240229')).toBe(true);
    expect(isDay('2026-04-30')).toBe(true);
    expect(isDay('15/03/20')).toBe(false);
    expect(isDay(null)).toBe(false);
  });
  it('validates months', () => {
    expect(isMonth('202613')).toBe(false);
    expect(isMonth('202600')).toBe(false);
    expect(isMonth('2026-05')).toBe(false);
    expect(isMonth(' 202605')).toBe(false);
    expect(isMonth('202605')).toBe(true);
  });
});

describe('conversions', () => {
  it('toYmd / toIso', () => {
    expect(toYmd('2026-04-30')).toBe('20260430');
    expect(toYmd('2026-04-31')).toBeNull();
    expect(toIso('20260430')).toBe('2026-04-30');
    expect(toIso('x')).toBeNull();
  });
  it('monthFirstDay / monthLastDay', () => {
    expect(monthFirstDay('202602')).toBe('2026-02-01');
    expect(monthLastDay('202602')).toBe('2026-02-28');
    expect(monthLastDay('202402')).toBe('2024-02-29');
    expect(monthLastDay('202613')).toBeNull();
  });
});

describe('isOrdered', () => {
  it('handles order, empties and invalid values', () => {
    expect(isOrdered('202609', '202607')).toBe(false);
    expect(isOrdered('202607', '202607')).toBe(true);
    expect(isOrdered('', '202607')).toBe(true);
    expect(isOrdered(null, undefined)).toBe(true);
    expect(isOrdered('202613', '')).toBe(false);
    expect(isOrdered('2026-03-02', '20260301')).toBe(false);
    expect(isOrdered('2026-03-01', '20260302')).toBe(true);
  });
});

describe('periodError', () => {
  it('reports order, shape and calendar errors', () => {
    expect(periodError('202609', '202607', { kind: 'month', label: 'version' }))
      .toBe('Version end date (2026-07) is before its start date (2026-09).');
    expect(periodError('2026-05', '', { kind: 'month', label: 'version' }))
      .toBe('Invalid version start date "2026-05": expected YYYYMM.');
    expect(periodError('2026-04-31', '', { kind: 'day', label: 'task "T1"' }))
      .toBe('Invalid task "T1" start date "2026-04-31": expected YYYY-MM-DD.');
    expect(periodError('', '202613', { kind: 'month', label: 'version' }))
      .toBe('Invalid version end date "202613": expected YYYYMM.');
  });
  it('returns null for valid or partial periods', () => {
    expect(periodError('202607', '202609', { kind: 'month', label: 'version' })).toBeNull();
    expect(periodError('', '', { kind: 'month', label: 'version' })).toBeNull();
    expect(periodError('2026-07-01', '', { kind: 'day', label: 'task' })).toBeNull();
  });
});

describe('text format', () => {
  it('formats days and months in the canonical English form', () => {
    expect(formatDayText('2025-12-01')).toBe('Dec 1, 2025');
    expect(formatDayText('2026-05-31')).toBe('May 31, 2026');
    expect(formatDayText('')).toBe('');
    expect(formatMonthText('202512')).toBe('Dec 2025');
    expect(formatMonthText('202613')).toBe('');
  });
  it.each([
    ['Dec 1, 2025'], ['Dec 1 2025'], ['1 Dec 2025'], ['December 1, 2025'], ['1 December 2025'],
    ['DEC 1 2025'], ['  dec 1,   2025 '], ['2025-12-01'],
  ])('parseDayText(%j) is 2025-12-01', t => expect(parseDayText(t)).toBe('2025-12-01'));
  it.each([['Dec 2025'], ['december 2025'], ['DEC  2025'], ['2025-12']])
    ('parseMonthText(%j) is 202512', t => expect(parseMonthText(t)).toBe('202512'));
  it.each([['03/04/2026'], ['3.4.2026'], ['03-04-2026'], ['Feb 30, 2026'], ['Foo 1, 2025'], ['Dec 2025'], ['abc'], ['']])
    ('parseDayText(%j) is null', t => expect(parseDayText(t)).toBeNull());
  it.each([['04/2026'], ['4.2026'], ['Foo 2025'], ['Dec 1, 2025'], ['2025-13'], ['']])
    ('parseMonthText(%j) is null', t => expect(parseMonthText(t)).toBeNull());
  it('round-trips to the canonical form', () => {
    expect(formatDayText(parseDayText('december 1 2025'))).toBe('Dec 1, 2025');
    expect(formatMonthText(parseMonthText('DECEMBER 2025'))).toBe('Dec 2025');
  });
});

describe('parseDateInput', () => {
  it('empty text clears without error', () => {
    expect(parseDateInput('', { mode: 'day', min: '2026-03-01' })).toEqual({ value: '' });
  });
  it('limits are inclusive', () => {
    const o = { mode: 'day', min: '2026-03-01', max: '2026-03-31' };
    expect(parseDateInput('Mar 1, 2026', o)).toEqual({ value: '2026-03-01' });
    expect(parseDateInput('Mar 31, 2026', o)).toEqual({ value: '2026-03-31' });
  });
  it('reports bounds and unreadable text', () => {
    expect(parseDateInput('Feb 28, 2026', { mode: 'day', min: '2026-03-01' }))
      .toEqual({ error: 'Must be on or after Mar 1, 2026.' });
    expect(parseDateInput('Apr 31, 2026', { mode: 'day' }))
      .toEqual({ error: 'Enter a date like Dec 1, 2025.' });
    expect(parseDateInput('Foo 2026', { mode: 'month' }))
      .toEqual({ error: 'Enter a month like Dec 2025.' });
    expect(parseDateInput('Aug 2026', { mode: 'month', max: '202607' }))
      .toEqual({ error: 'Must be on or before Jul 2026.' });
    expect(parseDateInput('Jul 2026', { mode: 'month', max: '202607' })).toEqual({ value: '202607' });
  });
});

describe('isWithin', () => {
  it('is inclusive and ignores empty limits', () => {
    expect(isWithin('202608', '', '202607')).toBe(false);
    expect(isWithin('202607', '202601', '202607')).toBe(true);
    expect(isWithin('202607', '', '')).toBe(true);
    expect(isWithin('202601', '202602', undefined)).toBe(false);
  });
});

describe('taskPeriodError', () => {
  const o = { label: 'T', parent: 'version' };
  it('accepts empty and in-period dates', () => {
    expect(taskPeriodError('', '', '202604', '202612', o)).toBeNull();
    expect(taskPeriodError('2026-04-01', '2026-12-31', '202604', '202612', o)).toBeNull();
    expect(taskPeriodError('2026-05-01', '2026-05-02', '202604', '', o)).toBeNull();
  });
  it('reports the first side that leaves the period', () => {
    expect(taskPeriodError('2026-03-31', '', '202604', '202612', o))
      .toBe('Task "T" starts on 2026-03-31, before the version period (2026-04 – 2026-12).');
    expect(taskPeriodError('2027-01-05', '', '202604', '202612', o))
      .toBe('Task "T" starts on 2027-01-05, after the version period (2026-04 – 2026-12).');
    expect(taskPeriodError('', '20270101', '202604', '202612', o))
      .toBe('Task "T" ends on 2027-01-01, after the version period (2026-04 – 2026-12).');
    expect(taskPeriodError('', '2026-03-01', '202604 ', '202612 ', o))
      .toBe('Task "T" ends on 2026-03-01, before the version period (2026-04 – 2026-12).');
  });
  it('shows an empty period side as an ellipsis', () => {
    expect(taskPeriodError('2026-03-01', '', '202604', '', o))
      .toBe('Task "T" starts on 2026-03-01, before the version period (2026-04 – …).');
  });
  it('refuses task dates against an inverted period, ignores it without dates', () => {
    expect(taskPeriodError('2026-08-01', '', '202609', '202607', o))
      .toBe('The version period (2026-09 – 2026-07) is not valid: fix it before setting task dates.');
    expect(taskPeriodError('', '', '202609', '202607', o)).toBeNull();
  });
  it('leaves an invalid task date to periodError', () => {
    expect(taskPeriodError('2026-02-31', '', '202604', '202612', o)).toBeNull();
  });
});

describe('taskDateBounds', () => {
  it('bounds a task date by the period and its twin', () => {
    expect(taskDateBounds('202604', '202612', '2026-06-10', 'start')).toEqual({ min: '2026-04-01', max: '2026-06-10' });
    expect(taskDateBounds('202604', '202612', '', 'end')).toEqual({ min: '2026-04-01', max: '2026-12-31' });
    expect(taskDateBounds('', '', '', 'start')).toEqual({ min: '', max: '' });
  });

  it('ignores a twin that lies outside the period on the side it would bound, so the picker never locks', () => {
    // task Jan 1 – Mar 1 2026, period Sep – Dec 2026: the start must be movable into the period
    expect(taskDateBounds('202609', '202612', '2026-03-01', 'start')).toEqual({ min: '2026-09-01', max: '2026-12-31' });
    // task Jan 1 2027 – Feb 1 2027, period Sep – Dec 2026: the end must be movable into the period
    expect(taskDateBounds('202609', '202612', '2027-01-01', 'end')).toEqual({ min: '2026-09-01', max: '2026-12-31' });
    // a twin past the period on the start side, or before it on the end side, bounds nothing more than the period
    expect(taskDateBounds('202609', '202612', '2027-02-01', 'start')).toEqual({ min: '2026-09-01', max: '2026-12-31' });
    expect(taskDateBounds('202609', '202612', '2026-01-01', 'end')).toEqual({ min: '2026-09-01', max: '2026-12-31' });
    // an open period side keeps the twin as the only bound
    expect(taskDateBounds('', '202612', '2026-03-01', 'start')).toEqual({ min: '', max: '2026-03-01' });
  });
});

describe('periodBounds', () => {
  it('bounds a period side by the task dates and its twin', () => {
    expect(periodBounds(['2026-03-03', '20260820'], 'start', '202612')).toEqual({ min: '', max: '202603' });
    expect(periodBounds(['2026-03-03', '20260820'], 'end', '202602')).toEqual({ min: '202608', max: '' });
    expect(periodBounds(['2026-07-01', '2026-08-31'], 'start', '202607').max).toBe('202607');
    expect(periodBounds([], 'end', '202604')).toEqual({ min: '202604', max: '' });
    expect(periodBounds(['', null], 'start', 'bad')).toEqual({ min: '', max: '' });
  });
});

describe('outOfPeriodTasks', () => {
  it('returns only the tasks outside the period', () => {
    const tasks = [{ name: 'A', start: '2026-05-01', end: '2026-05-02' }, { name: 'B', start: '2026-01-01', end: '' }];
    expect(outOfPeriodTasks(tasks, '202604', '202612', 'version')).toEqual([
      { name: 'B', error: 'Task "B" starts on 2026-01-01, before the version period (2026-04 – 2026-12).' }
    ]);
  });
});
