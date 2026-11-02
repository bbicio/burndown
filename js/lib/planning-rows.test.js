import { describe, it, expect } from 'vitest';
import {
  formatCell, workingWeeks, loadLevel, initials, isoWeek, filterRows, visibleRows,
} from './planning-rows.js';

describe('formatCell', () => {
  it('shows "<1h" for a pulse below half an hour', () => {
    expect(formatCell(0.3, { pulse: true, round: true })).toBe('<1h');
  });
  it('prefixes a pulse with "~"', () => {
    expect(formatCell(3.4, { pulse: true, round: true })).toBe('~3h');
  });
  it('shows "<1h" for a non-pulse value below 1h when Rounded', () => {
    expect(formatCell(0.45, { pulse: false, round: true })).toBe('<1h');
  });
  it('keeps two decimals when Rounded is off', () => {
    expect(formatCell(0.45, { pulse: false, round: false })).toBe('0.45h');
  });
  it('rounds to whole hours when Rounded', () => {
    expect(formatCell(12.6, { pulse: false, round: true })).toBe('13h');
  });
  it('leaves zero and near-zero cells empty', () => {
    expect(formatCell(0, { pulse: false, round: true })).toBe('');
    expect(formatCell(0.004, { pulse: true, round: true })).toBe('');
    expect(formatCell(undefined, { pulse: false, round: true })).toBe('');
  });
});

describe('loadLevel', () => {
  it('uses the exact 24h / 30h weekly thresholds', () => {
    expect(loadLevel(24, 1)).toBe('high');
    expect(loadLevel(23.9, 1)).toBe(null);
    expect(loadLevel(30, 1)).toBe('over');
  });
  it('normalises a monthly total on its working weeks', () => {
    expect(loadLevel(96, 4)).toBe('high');
    expect(loadLevel(110, 4.4)).toBe('high');
    expect(loadLevel(140, 4.4)).toBe('over');
  });
});

describe('workingWeeks', () => {
  it('counts the weekdays of a month (Monthly) over 5', () => {
    expect(workingWeeks({ key: 'Oct 2026' }, 'monthly')).toBeCloseTo(22 / 5);
  });
  it('counts the weekdays of a full Monday–Sunday week (Weekly) over 5', () => {
    const w = { weekStart: new Date(2026, 9, 12), weekEnd: new Date(2026, 9, 18) };
    expect(workingWeeks(w, 'weekly')).toBe(1);
  });
});

describe('initials', () => {
  it('takes the first letter of the first and last word', () => {
    expect(initials('Michal Wadowski')).toBe('MW');
    expect(initials('  Anna  Maria Rossi ')).toBe('AR');
  });
  it('takes two letters of a single word', () => {
    expect(initials('chiara')).toBe('CH');
  });
});

describe('isoWeek', () => {
  it('returns the ISO week number, including W53 and W1 across the year', () => {
    expect(isoWeek(new Date(2026, 9, 12))).toBe(42);
    expect(isoWeek(new Date(2026, 11, 31))).toBe(53);
    expect(isoWeek(new Date(2027, 0, 4))).toBe(1);
  });
});

// a > a1 > a11, b > b1
const tree = [
  { id: 'a', parentId: null, label: 'a', sub: '' },
  { id: 'a1', parentId: 'a', label: 'a1', sub: '' },
  { id: 'a11', parentId: 'a1', label: 'a11', sub: '' },
  { id: 'b', parentId: null, label: 'b', sub: 'beta client' },
  { id: 'b1', parentId: 'b', label: 'b1', sub: '' },
];
const ids = rows => rows.map(r => r.id);

describe('filterRows', () => {
  it('keeps a matching row and its ancestors, forcing the ancestors open', () => {
    const f = filterRows(tree, 'a11');
    expect([...f.visibleIds].sort()).toEqual(['a', 'a1', 'a11']);
    expect([...f.forcedOpenIds].sort()).toEqual(['a', 'a1']);
  });
  it('is case-insensitive and keeps the descendants of a matching row', () => {
    const f = filterRows(tree, 'A1');
    expect([...f.visibleIds].sort()).toEqual(['a', 'a1', 'a11']);
  });
  it('matches on the second line (sub) too', () => {
    const f = filterRows(tree, 'BETA');
    expect([...f.visibleIds].sort()).toEqual(['b', 'b1']);
  });
  it('shows everything and forces nothing on an empty query', () => {
    const f = filterRows(tree, '  ');
    expect(f.visibleIds).toBe(null);
    expect(f.forcedOpenIds.size).toBe(0);
  });
});

describe('visibleRows', () => {
  it('shows only the roots when nothing is open', () => {
    expect(ids(visibleRows(tree, new Set(), null))).toEqual(['a', 'b']);
  });
  it('shows the children of an open row', () => {
    expect(ids(visibleRows(tree, new Set(['a']), null))).toEqual(['a', 'a1', 'b']);
  });
  it('opens the ancestors of a search match without writing to openIds', () => {
    const openIds = new Set();
    expect(ids(visibleRows(tree, openIds, filterRows(tree, 'a11')))).toEqual(['a', 'a1', 'a11']);
    expect(openIds.size).toBe(0);
    // clearing the search: the parent is closed again
    expect(ids(visibleRows(tree, openIds, filterRows(tree, '')))).toEqual(['a', 'b']);
  });
});
