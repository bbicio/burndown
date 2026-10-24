import { describe, it, expect } from 'vitest';
import {
  isMonth, isDay, toYmd, toIso, monthFirstDay, monthLastDay, isOrdered, periodError,
  parseDayText, formatDayText, parseMonthText, formatMonthText, parseDateInput, isWithin
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

describe('date text parsing', () => {
  it('round-trips a valid day date', () => {
    expect(parseDayText('05/10/2026')).toBe('2026-10-05');
    expect(formatDayText('2026-10-05')).toBe('05/10/2026');
  });
  it('rejects out-of-range and empty input', () => {
    ['32/13/2026', '', '5/10/26', 'abc', '29/02/2027'].forEach(v => expect(parseDayText(v)).toBeNull());
  });
  it('round-trips a month value', () => {
    expect(parseMonthText('10/2026')).toBe('202610');
    expect(formatMonthText('202610')).toBe('10/2026');
    expect(parseMonthText('13/2026')).toBeNull();
    expect(formatMonthText('')).toBe('');
  });
});

describe('parseDateInput', () => {
  it('empty text clears without error', () => {
    expect(parseDateInput('', { mode: 'day', min: '2026-03-01' })).toEqual({ value: '' });
  });
  it('limits are inclusive', () => {
    const o = { mode: 'day', min: '2026-03-01', max: '2026-03-31' };
    expect(parseDateInput('01/03/2026', o)).toEqual({ value: '2026-03-01' });
    expect(parseDateInput('31/03/2026', o)).toEqual({ value: '2026-03-31' });
  });
  it('reports bounds and unreadable text', () => {
    expect(parseDateInput('28/02/2026', { mode: 'day', min: '2026-03-01' }))
      .toEqual({ error: 'Must be on or after 01/03/2026.' });
    expect(parseDateInput('31/04/2026', { mode: 'day' }))
      .toEqual({ error: 'Enter a date as dd/mm/yyyy.' });
    expect(parseDateInput('13/2026', { mode: 'month' }))
      .toEqual({ error: 'Enter a month as mm/yyyy.' });
    expect(parseDateInput('08/2026', { mode: 'month', max: '202607' }))
      .toEqual({ error: 'Must be on or before 07/2026.' });
    expect(parseDateInput('07/2026', { mode: 'month', max: '202607' })).toEqual({ value: '202607' });
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
