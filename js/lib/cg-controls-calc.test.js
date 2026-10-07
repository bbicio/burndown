import { describe, it, expect } from 'vitest';
import { monthGridYear, dayGridMonth, parseItDate, formatItDate, parseMonthInput, formatMonthInput } from './cg-controls-calc.js';

describe('monthGridYear', () => {
  it('returns 12 entries with YYYYMM keys and short labels', () => {
    const g = monthGridYear(2026);
    expect(g).toHaveLength(12);
    expect(g[0]).toMatchObject({ key: '202601', label: 'Jan', disabled: false });
    expect(g[11]).toMatchObject({ key: '202612', label: 'Dec' });
  });
  it('disables months before min', () => {
    const g = monthGridYear(2026, { min: '202605' });
    expect(g[3].disabled).toBe(true);   // Apr
    expect(g[4].disabled).toBe(false);  // May == min, selectable
  });
  it('tolerates a min later than the whole year', () => {
    expect(monthGridYear(2026, { min: '202701' }).every(m => m.disabled)).toBe(true);
  });
});

describe('dayGridMonth', () => {
  it('is Monday-first and pads with null cells', () => {
    const weeks = dayGridMonth(2026, 10);           // 1 Oct 2026 is a Thursday
    expect(weeks).toHaveLength(6);
    expect(weeks[0].slice(0, 3).every(d => d.iso === null)).toBe(true);
    expect(weeks[0][3]).toMatchObject({ day: 1, iso: '2026-10-01' });
  });
  it('handles a leap February', () => {
    const days = dayGridMonth(2028, 2).flat().filter(d => d.iso);
    expect(days).toHaveLength(29);
  });
  it('disables days before min and tints the range up to selected', () => {
    const days = dayGridMonth(2026, 10, { min: '2026-10-05', selected: '2026-10-30' }).flat();
    expect(days.find(d => d.iso === '2026-10-04').disabled).toBe(true);
    expect(days.find(d => d.iso === '2026-10-05').disabled).toBe(false);
    expect(days.find(d => d.iso === '2026-10-20').inRange).toBe(true);
    expect(days.find(d => d.iso === '2026-10-31').inRange).toBe(false);
  });
  it('still renders a selected value that precedes min', () => {
    const days = dayGridMonth(2026, 10, { min: '2026-10-20', selected: '2026-10-02' }).flat();
    expect(days.find(d => d.iso === '2026-10-02')).toBeTruthy();
    expect(days.every(d => d.inRange === false)).toBe(true);
  });
});

describe('date text parsing', () => {
  it('round-trips a valid day date', () => {
    expect(parseItDate('05/10/2026')).toBe('2026-10-05');
    expect(formatItDate('2026-10-05')).toBe('05/10/2026');
  });
  it('rejects out-of-range and empty input', () => {
    ['32/13/2026', '', '5/10/26', 'abc', '29/02/2027'].forEach(v => expect(parseItDate(v)).toBeNull());
  });
  it('round-trips a month value', () => {
    expect(parseMonthInput('10/2026')).toBe('202610');
    expect(formatMonthInput('202610')).toBe('10/2026');
    expect(parseMonthInput('13/2026')).toBeNull();
    expect(formatMonthInput('')).toBe('');
  });
});
