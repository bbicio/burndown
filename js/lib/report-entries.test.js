import { describe, it, expect } from 'vitest';
import { defaultSort, nextSort, filterOptions, pruneFilter, entriesBlock, filterChipLabel, entryValue } from './report-entries.js';

const e = (date, role, owner, hours, notes = '') => ({ date: new Date(date), role, owner, hours, notes });
const rateFor = r => (r.role === 'NoRate' ? null : 100);

const ENTRIES = [
  e('2026-09-10', 'PM', 'Anna', 4),
  e('2026-09-02', 'Analyst', 'Marco', 6),
  e('2026-08-20', 'PM', 'Bruno', 2),
  e('2026-08-05', 'NoRate', '', 8),
  e('2026-07-15', 'Analyst', 'Marco', 1),
];
const BASE = { filter: [], filterKind: 'role', sort: defaultSort(), openMonth: null, closedMonths: [] };

describe('nextSort', () => {
  it('toggles direction on the same key and starts ascending on a new one', () => {
    expect(defaultSort()).toEqual({ key: 'date', dir: 'desc' });
    expect(nextSort(defaultSort(), 'hours')).toEqual({ key: 'hours', dir: 'asc' });
    expect(nextSort({ key: 'hours', dir: 'asc' }, 'hours')).toEqual({ key: 'hours', dir: 'desc' });
    expect(nextSort({ key: 'hours', dir: 'desc' }, 'date')).toEqual({ key: 'date', dir: 'asc' });
  });
});

describe('filterOptions', () => {
  it('lists unique roles with summed hours, hours descending', () => {
    expect(filterOptions(ENTRIES, 'role')).toEqual([
      { value: 'NoRate', hours: 8 }, { value: 'Analyst', hours: 7 }, { value: 'PM', hours: 6 },
    ]);
  });
  it('keeps an entry without owner as the empty-value option (Review Focus 2)', () => {
    const opts = filterOptions(ENTRIES, 'resource');
    expect(opts.find(o => o.value === '')).toEqual({ value: '', hours: 8 });
  });
  it('breaks hour ties by value', () => {
    const opts = filterOptions([e('2026-09-01', 'B', 'x', 1), e('2026-09-01', 'A', 'x', 1)], 'role');
    expect(opts.map(o => o.value)).toEqual(['A', 'B']);
  });
});

describe('pruneFilter', () => {
  it('drops values that are no longer options (Review Focus 1)', () => {
    expect(pruneFilter(['PM', 'Gone'], [{ value: 'PM' }])).toEqual(['PM']);
    expect(pruneFilter(['Gone'], [{ value: 'PM' }])).toEqual([]);
  });
});

describe('entryValue / filterChipLabel', () => {
  it('reads role or owner', () => {
    expect(entryValue(ENTRIES[0], 'role')).toBe('PM');
    expect(entryValue(ENTRIES[3], 'resource')).toBe('');
  });
  it('builds the chip label', () => {
    expect(filterChipLabel([], 'role')).toBe('Role: All');
    expect(filterChipLabel(['PM', 'Analyst'], 'role')).toBe('Role: PM, Analyst');
    expect(filterChipLabel(['a', 'b', 'c'], 'role')).toBe('Role: 3 selected');
    expect(filterChipLabel(['Marco'], 'resource')).toBe('Resource: Marco');
    expect(filterChipLabel([''], 'resource')).toBe('Resource: —');
  });
});

describe('entriesBlock', () => {
  it('without filter opens only the most recent month by default', () => {
    const b = entriesBlock(ENTRIES, BASE, rateFor);
    expect(b.months.map(m => m.ym)).toEqual(['2026-09', '2026-08', '2026-07']);
    expect(b.months.map(m => m.open)).toEqual([true, false, false]);
    expect(b.total).toBe(5);
    expect(b.shown).toBe(5);
    expect(b.hiddenMonths).toBe(0);
  });
  it('honours openMonth and the all-closed empty string', () => {
    expect(entriesBlock(ENTRIES, { ...BASE, openMonth: '2026-08' }, rateFor).months.map(m => m.open)).toEqual([false, true, false]);
    expect(entriesBlock(ENTRIES, { ...BASE, openMonth: '' }, rateFor).months.map(m => m.open)).toEqual([false, false, false]);
  });
  it('with a filter drops empty months, opens the rest except closedMonths, recounts on filtered rows', () => {
    const b = entriesBlock(ENTRIES, { ...BASE, filter: ['PM'] }, rateFor);
    expect(b.months.map(m => m.ym)).toEqual(['2026-09', '2026-08']);
    expect(b.hiddenMonths).toBe(1);
    expect(b.months.every(m => m.open)).toBe(true);
    expect(b.months[0]).toMatchObject({ count: 1, hours: 4, amount: 400 });
    expect(b.total).toBe(5);
    expect(b.shown).toBe(2);
    const c = entriesBlock(ENTRIES, { ...BASE, filter: ['PM'], closedMonths: ['2026-08'] }, rateFor);
    expect(c.months.map(m => m.open)).toEqual([true, false]);
  });
  it('filters by resource, including the empty owner', () => {
    const b = entriesBlock(ENTRIES, { ...BASE, filterKind: 'resource', filter: [''] }, rateFor);
    expect(b.shown).toBe(1);
    expect(b.months[0].rows[0].role).toBe('NoRate');
  });
  it('sorts inside each month, ties by date descending, months stay newest first', () => {
    const list = [e('2026-09-01', 'A', 'x', 2), e('2026-09-05', 'B', 'x', 2), e('2026-09-03', 'C', 'x', 5), e('2026-08-01', 'D', 'x', 1)];
    const b = entriesBlock(list, { ...BASE, sort: { key: 'hours', dir: 'desc' } }, rateFor);
    expect(b.months.map(m => m.ym)).toEqual(['2026-09', '2026-08']);
    expect(b.months[0].rows.map(r => r.role)).toEqual(['C', 'B', 'A']);
    const asc = entriesBlock(list, { ...BASE, sort: { key: 'hours', dir: 'asc' } }, rateFor);
    expect(asc.months[0].rows.map(r => r.role)).toEqual(['B', 'A', 'C']);
  });
  it('puts null amounts last in both directions (Review Focus 3)', () => {
    const list = [e('2026-09-01', 'NoRate', 'x', 9), e('2026-09-02', 'A', 'x', 1), e('2026-09-03', 'B', 'x', 3)];
    for (const dir of ['asc', 'desc']) {
      const rows = entriesBlock(list, { ...BASE, sort: { key: 'amount', dir } }, rateFor).months[0].rows;
      expect(rows[rows.length - 1].role).toBe('NoRate');
    }
    const asc = entriesBlock(list, { ...BASE, sort: { key: 'amount', dir: 'asc' } }, rateFor).months[0].rows;
    expect(asc.map(r => r.role)).toEqual(['A', 'B', 'NoRate']);
  });
  it('sorts by who: role (owner) for role, owner for resource, case-insensitive', () => {
    const list = [e('2026-09-01', 'pm', 'Zed', 1), e('2026-09-02', 'Analyst', 'Bob', 1), e('2026-09-03', 'Analyst', 'alice', 1)];
    const byRole = entriesBlock(list, { ...BASE, sort: { key: 'who', dir: 'asc' } }, rateFor).months[0].rows;
    expect(byRole.map(r => r.owner)).toEqual(['alice', 'Bob', 'Zed']);
    const byRes = entriesBlock(list, { ...BASE, filterKind: 'resource', sort: { key: 'who', dir: 'desc' } }, rateFor).months[0].rows;
    expect(byRes.map(r => r.owner)).toEqual(['Zed', 'Bob', 'alice']);
  });
});
