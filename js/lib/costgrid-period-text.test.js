import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';
import { outOfPeriodTasks, formatMonthText, formatDayText, toIso } from './dates.js';

// B-141, B-160: the period texts of js/costgrid.js tolerate an invalid date and an inverted period.
const js = readFileSync('js/costgrid.js', 'utf8');
const src = ['function cgFmtMonth(', 'function cgOutOfPeriodNotice('].map(h => extractBlock(js, h)).join('\n');
const win = { outOfPeriodTasks, formatMonthText, formatDayText, toIso };
const { cgFmtMonth, cgOutOfPeriodNotice } = new Function('window', `${src}; return { cgFmtMonth, cgOutOfPeriodNotice };`)(win);

describe('cgFmtMonth', () => {
  it('formats a real date', () => {
    expect(cgFmtMonth('2026-05-11')).toBe('May 11, 2026');
    expect(cgFmtMonth('20260511')).toBe('May 11, 2026');
  });
  it('keeps the original text of an impossible date instead of showing nothing', () => {
    expect(cgFmtMonth('2026-02-30')).toBe('2026-02-30');
    expect(cgFmtMonth('  2026-02-30 ')).toBe('2026-02-30');
  });
  it('stays empty for an empty value', () => {
    expect(cgFmtMonth('')).toBe('');
    expect(cgFmtMonth(null)).toBe('');
    expect(cgFmtMonth(undefined)).toBe('');
  });
});

describe('cgOutOfPeriodNotice', () => {
  const tasks = [{ name: 'Early', startDate: '20260301', endDate: '' }];
  it('is empty when every task fits', () => {
    expect(cgOutOfPeriodNotice([{ name: 'Fine', startDate: '20260501', endDate: '' }], '202604', '202612')).toBe('');
  });
  it('lists the tasks outside a valid period', () => {
    const t = cgOutOfPeriodNotice(tasks, '202604', '202612');
    expect(t).toBe('These tasks are outside the project period (Apr 2026 – Dec 2026): "Early". Move them inside it first.');
  });
  it('says the period is not valid when it is inverted, without asking to move the tasks', () => {
    const t = cgOutOfPeriodNotice(tasks, '202612', '202601');
    expect(t).toBe('The project period (2026-12 – 2026-01) is not valid: fix it before adding tasks.');
    expect(t).not.toContain('Move them inside it');
  });
  it('says the period is not valid when a side is not a month', () => {
    expect(cgOutOfPeriodNotice(tasks, 'abc', '')).toBe('The project period (abc – …) is not valid: fix it before adding tasks.');
  });
});

describe('cgOutOfPeriodNotice does not read the error text', () => {
  const build = items => new Function('window', `${src}; return cgOutOfPeriodNotice;`)({ ...win, outOfPeriodTasks: () => items });
  it('says the period is not valid from the flag, whatever the error says', () => {
    const f = build([{ name: 'X', error: 'anything at all', periodInvalid: true, periodRange: '2026-12 – 2026-01' }]);
    expect(f([{ name: 'X', startDate: '20260301', endDate: '' }], '202612', '202601'))
      .toBe('The project period (2026-12 – 2026-01) is not valid: fix it before adding tasks.');
  });
  it('lists the tasks when the period is valid, whatever the error says', () => {
    const f = build([{ name: 'X', error: 'The project period (a – b) is not valid', periodInvalid: false, periodRange: '' }]);
    expect(f([{ name: 'X', startDate: '20260301', endDate: '' }], '202604', '202612'))
      .toBe('These tasks are outside the project period (Apr 2026 – Dec 2026): "X". Move them inside it first.');
  });
});
