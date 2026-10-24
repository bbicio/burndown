import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';
import { isOrdered } from './dates.js';

const js = readFileSync('js/costgrid.js', 'utf8');
const gen = new Function('isOrdered', `${extractBlock(js, 'function cgGeneratedPeriod(')}; return cgGeneratedPeriod;`)(isOrdered);
const now = new Date(2026, 9, 24);

describe('cgGeneratedPeriod', () => {
  it('a start after the default end gets a one-month period instead of an inverted one', () => {
    expect(gen({ startDate: '202812', endDate: '' }, [], now)).toEqual({ projStart: '202812', projEnd: '202812' });
  });
  it('an end before the default start gets a one-month period', () => {
    expect(gen({ startDate: '', endDate: '202401' }, [], now)).toEqual({ projStart: '202401', projEnd: '202401' });
  });
  it('an ordered version period is unchanged', () => {
    expect(gen({ startDate: '202602', endDate: '202612' }, [], now)).toEqual({ projStart: '202602', projEnd: '202612' });
  });
  it('falls back to task dates, then to now / now + 12 months', () => {
    expect(gen({}, [{ taskStartDate: '2026-11-05', taskEndDate: '2027-02-01' }], now)).toEqual({ projStart: '202611', projEnd: '202702' });
    expect(gen({}, [], now)).toEqual({ projStart: '202610', projEnd: '202710' });
  });
});
