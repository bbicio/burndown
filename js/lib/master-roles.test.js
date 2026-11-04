import { describe, it, expect } from 'vitest';
import {
  extractTeam, isMissingRate, rateColumns, filterRoles, groupRoles,
  fallbackRate, splitCode, joinCode, teamOptions,
} from './master-roles.js';

describe('extractTeam', () => {
  it('takes the prefix before the first " - ", else the first token', () => {
    expect(extractTeam('PM - Project Manager')).toBe('PM');
    expect(extractTeam('DEV_LEAD')).toBe('DEV');
    expect(extractTeam('')).toBe('—');
    expect(extractTeam(null)).toBe('—');
  });
});

describe('isMissingRate', () => {
  it('treats null, undefined and 0 as missing', () => {
    for (const v of [null, undefined, 0, '0']) expect(isMissingRate(v), String(v)).toBe(true);
    expect(isMissingRate(150)).toBe(false);
  });
});

describe('rateColumns', () => {
  it('puts EUR first, then the active non-EUR currencies in API order', () => {
    const cols = rateColumns([
      { code: 'USD', active: true }, { code: 'EUR', active: true },
      { code: 'GBP', active: false }, { code: 'CHF', active: true },
    ]);
    expect(cols.map(c => c.code)).toEqual(['EUR', 'USD', 'CHF']);
  });
  it('keeps an EUR column when the list is empty', () => {
    expect(rateColumns([])).toEqual([{ code: 'EUR' }]);
  });
});

const ROLES = [
  { id: 1, label: 'Project Manager', code: 'PM - PROJECT MANAGER', rate: 150 },
  { id: 2, label: 'Developer', code: 'HWGDEV - DEVELOPER', rate: 0 },
  { id: 3, label: 'Architect', code: 'HWGDEV - ARCHITECT', rate: null },
];

describe('filterRoles', () => {
  it('matches label and code, case-insensitive', () => {
    expect(filterRoles(ROLES, { query: 'manager' }).map(r => r.id)).toEqual([1]);
    expect(filterRoles(ROLES, { query: 'hwgdev' }).map(r => r.id)).toEqual([2, 3]);
    expect(filterRoles(ROLES, { query: '  ' })).toHaveLength(3);
  });
  it('keeps only roles with a 0 or null EUR rate when missingOnly', () => {
    expect(filterRoles(ROLES, { missingOnly: true }).map(r => r.id)).toEqual([2, 3]);
  });
});

describe('groupRoles', () => {
  it('sorts teams, then roles by label, and counts the missing rates', () => {
    const groups = groupRoles([
      { id: 1, label: 'Zeta', code: 'B - Z', rate: 10 },
      { id: 2, label: 'Beta', code: 'A - B', rate: 0 },
      { id: 3, label: 'Alpha', code: 'A - A', rate: null },
    ]);
    expect(groups.map(g => g.team)).toEqual(['A', 'B']);
    expect(groups[0].roles.map(r => r.label)).toEqual(['Alpha', 'Beta']);
    expect(groups[0].missing).toBe(2);
    expect(groups[1].missing).toBe(0);
  });
});

describe('fallbackRate', () => {
  it('converts the EUR rate at the currency rate, rounded to its decimals', () => {
    expect(fallbackRate({ id: 1, rate: 105 }, { code: 'GBP', current_rate: 0.8 })).toBe(84);
    expect(fallbackRate({ id: 1, rate: 100 }, { code: 'JPY', current_rate: 161.234 })).toBe(16123);
  });
  it('is null without an EUR rate or without a usable currency rate', () => {
    expect(fallbackRate({ id: 1, rate: 0 }, { code: 'GBP', current_rate: 0.8 })).toBeNull();
    expect(fallbackRate({ id: 1, rate: 100 }, { code: 'GBP', current_rate: null })).toBeNull();
    expect(fallbackRate({ id: 1, rate: 100 }, { code: 'GBP', current_rate: 0 })).toBeNull();
  });
});

describe('splitCode / joinCode', () => {
  it('round-trips a TEAM - ROLE code', () => {
    const s = splitCode('HWGACCSVS - MARKETING COORDINATOR');
    expect(s).toEqual({ team: 'HWGACCSVS', role: 'MARKETING COORDINATOR' });
    expect(joinCode(s.team, s.role)).toBe('HWGACCSVS - MARKETING COORDINATOR');
  });
  it('keeps the rest after the first separator as the role', () => {
    const s = splitCode('HWGDEV - SR - LEAD');
    expect(s).toEqual({ team: 'HWGDEV', role: 'SR - LEAD' });
    expect(joinCode(s.team, s.role)).toBe('HWGDEV - SR - LEAD');
  });
  it('leaves a code without " - " unchanged', () => {
    expect(splitCode('LEGACYCODE')).toEqual({ team: '', role: 'LEGACYCODE' });
    expect(joinCode('', 'LEGACYCODE')).toBe('LEGACYCODE');
  });
  it('trims both parts', () => {
    expect(joinCode(' hwgdev ', ' dev ')).toBe('hwgdev - dev');
  });
});

describe('teamOptions', () => {
  it('lists the distinct teams of TEAM - ROLE codes, sorted', () => {
    expect(teamOptions([{ code: 'B - x' }, { code: 'A - y' }, { code: 'A - z' }, { code: 'LEGACY' }])).toEqual(['A', 'B']);
  });
});
