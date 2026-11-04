import { describe, it, expect } from 'vitest';
import {
  filterClients, groupSections, customRateCount, roleFamily, sortFamilies, cellSource,
  buildRatecardEntries, moveClient, groupNameError, readUrlState, urlFor,
} from './master-clients.js';

const currencies = [
  { code: 'EUR', symbol: '€', locale: 'it-IT', current_rate: 1 },
  { code: 'GBP', symbol: '£', locale: 'en-GB', current_rate: 0.86 },
  { code: 'SEK', symbol: 'kr', locale: 'sv-SE', current_rate: 11 },
];

describe('filterClients', () => {
  const groups = new Map([['g1', { name: 'Menarini Group' }]]);
  const clients = [
    { id: 'c2', name: 'Bayer AG', groupId: null },
    { id: 'c1', name: 'Berlin-Chemie', groupId: 'g1' },
    { id: 'c3', name: 'Acme', groupId: null },
  ];
  it('matches the client name, case-insensitively', () => {
    expect(filterClients(clients, groups, 'bay').map(c => c.id)).toEqual(['c2']);
  });
  it('matches the name of the client\'s group', () => {
    expect(filterClients(clients, groups, 'menarini group').map(c => c.id)).toEqual(['c1']);
  });
  it('returns every client, sorted by name, for a blank query', () => {
    expect(filterClients(clients, groups, '  ').map(c => c.name)).toEqual(['Acme', 'Bayer AG', 'Berlin-Chemie']);
  });
});

describe('groupSections', () => {
  const groups = [{ id: 'g2', name: 'Zeta', pots: [] }, { id: 'g1', name: 'Alpha', pots: [] }];
  it('keeps an empty group and orders groups by name', () => {
    const s = groupSections([{ id: 'c1', name: 'A', groupId: 'g2' }], groups);
    expect(s.map(x => x.group.name)).toEqual(['Alpha', 'Zeta']);
    expect(s[0].clients).toEqual([]);
  });
  it('adds "No group" only when a client has no group', () => {
    const all = groupSections([{ id: 'c1', name: 'A', groupId: 'g1' }], groups);
    expect(all.some(x => x.group === null)).toBe(false);
    const some = groupSections([{ id: 'c1', name: 'A', groupId: null }], groups);
    expect(some[some.length - 1].group).toBeNull();
    expect(some[some.length - 1].clients).toHaveLength(1);
  });
});

describe('customRateCount', () => {
  it('counts an entry with only an override', () => {
    expect(customRateCount({ entries: [{ roleId: 1, hourlyRate: null, rateOverrides: { GBP: 150 } }] })).toBe(1);
  });
  it('does not count an entry without values', () => {
    expect(customRateCount({ entries: [{ roleId: 1, hourlyRate: null, rateOverrides: {} }] })).toBe(0);
    expect(customRateCount({ entries: [{ roleId: 1, hourlyRate: null, rateOverrides: { GBP: null } }] })).toBe(0);
  });
  it('counts an entry with a EUR rate, and treats a missing ratecard as 0', () => {
    expect(customRateCount({ entries: [{ roleId: 1, hourlyRate: 120 }] })).toBe(1);
    expect(customRateCount(undefined)).toBe(0);
  });
});

describe('roleFamily / sortFamilies', () => {
  it('takes the prefix before the first " - "', () => {
    expect(roleFamily('HWGACCSVS - DIRECTOR')).toBe('HWGACCSVS');
    expect(roleFamily('GREENLIGHT SHARED RESOURCE')).toBe('Other');
  });
  it('sorts alphabetically with Other last', () => {
    expect(sortFamilies(['Other', 'CPROD', 'HWG'])).toEqual(['CPROD', 'HWG', 'Other']);
  });
});

describe('cellSource', () => {
  const row = (over = {}) => ({
    roleId: '7', defaults: { EUR: 130, GBP: 116 }, texts: { EUR: '', GBP: '' }, stored: { EUR: null, GBP: null }, hidden: {}, ...over,
  });
  it('EUR with a custom value is custom', () => {
    expect(cellSource({ row: row({ texts: { EUR: '168', GBP: '' } }), code: 'EUR', currencies })).toEqual({ value: 168, kind: 'custom' });
  });
  it('EUR without a custom value uses the agency rate', () => {
    expect(cellSource({ row: row(), code: 'EUR', currencies })).toEqual({ value: 130, kind: 'agency' });
  });
  it('EUR without agency rate is missing', () => {
    expect(cellSource({ row: row({ defaults: { EUR: null, GBP: null } }), code: 'EUR', currencies }).kind).toBe('missing');
  });
  it('GBP with an agency GBP rate uses it', () => {
    expect(cellSource({ row: row(), code: 'GBP', currencies })).toEqual({ value: 116, kind: 'agency-currency' });
  });
  it('GBP without agency GBP converts the agency EUR rate', () => {
    const r = cellSource({ row: row({ defaults: { EUR: 110, GBP: null } }), code: 'GBP', currencies });
    expect(r.kind).toBe('converted');
    expect(r.value).toBeCloseTo(94.6, 5);
  });
  it('GBP without agency GBP converts a custom EUR rate', () => {
    const r = cellSource({ row: row({ defaults: { EUR: 110, GBP: null }, texts: { EUR: '100', GBP: '' } }), code: 'GBP', currencies });
    expect(r.kind).toBe('converted');
    expect(r.value).toBeCloseTo(86, 5);
  });
  it('GBP with nothing anywhere is missing', () => {
    expect(cellSource({ row: row({ defaults: { EUR: null, GBP: null } }), code: 'GBP', currencies }).kind).toBe('missing');
  });
  it('a custom GBP value is custom', () => {
    expect(cellSource({ row: row({ texts: { EUR: '', GBP: '150' } }), code: 'GBP', currencies })).toEqual({ value: 150, kind: 'custom' });
  });
  it('invalid text counts as absent', () => {
    expect(cellSource({ row: row({ texts: { EUR: 'abc', GBP: '' } }), code: 'EUR', currencies })).toEqual({ value: 130, kind: 'agency' });
  });
});

describe('buildRatecardEntries', () => {
  it('produces the payload the modal produced', () => {
    const rows = [
      { roleId: '1', texts: { EUR: '120', GBP: '£100' }, stored: { EUR: null, GBP: null }, hidden: {} },
      { roleId: '2', texts: { EUR: '', GBP: '' }, stored: { EUR: null, GBP: null }, hidden: {} },
      { roleId: '3', texts: { EUR: '0', GBP: '' }, stored: { EUR: 0, GBP: null }, hidden: { SEK: 50 } },
    ];
    expect(buildRatecardEntries(rows, currencies)).toEqual({
      entries: [
        { roleId: '1', hourlyRate: 120, rateOverrides: { GBP: 100 } },
        { roleId: '3', hourlyRate: 0, rateOverrides: { SEK: 50 } },
      ],
    });
  });
  it('keeps a hidden override on a row with otherwise blank fields', () => {
    const rows = [{ roleId: '9', texts: { EUR: '' }, stored: { EUR: null }, hidden: { SEK: 50 } }];
    expect(buildRatecardEntries(rows, currencies)).toEqual({ entries: [{ roleId: '9', hourlyRate: null, rateOverrides: { SEK: 50 } }] });
  });
  it('reports the first invalid amount', () => {
    const rows = [{ roleId: '1', texts: { EUR: '', GBP: '1,2,3' }, stored: {}, hidden: {} }];
    expect(buildRatecardEntries(rows, currencies)).toEqual({ error: { code: 'GBP' } });
  });
});

describe('moveClient', () => {
  const fake = (failOn = {}) => {
    const calls = [];
    return {
      calls,
      assignClient: async (g, c) => { calls.push(['assign', g]); if (failOn.assign === g && !failOn.once) { failOn.once = true; throw new Error('assign ' + g); } },
      removeClient: async (g, c) => { calls.push(['remove', g]); if (failOn.remove === g) throw new Error('remove ' + g); },
    };
  };
  it('assigns a client that had no group', async () => {
    const api = fake();
    await moveClient({ clientId: 'c', fromGroupId: null, toGroupId: 'B' }, api);
    expect(api.calls).toEqual([['assign', 'B']]);
  });
  it('removes a client when the target is null', async () => {
    const api = fake();
    await moveClient({ clientId: 'c', fromGroupId: 'A', toGroupId: null }, api);
    expect(api.calls).toEqual([['remove', 'A']]);
  });
  it('moves A to B as remove then assign', async () => {
    const api = fake();
    await moveClient({ clientId: 'c', fromGroupId: 'A', toGroupId: 'B' }, api);
    expect(api.calls).toEqual([['remove', 'A'], ['assign', 'B']]);
  });
  it('re-assigns the old group when the assign fails, and rethrows the original error', async () => {
    const api = fake({ assign: 'B' });
    await expect(moveClient({ clientId: 'c', fromGroupId: 'A', toGroupId: 'B' }, api)).rejects.toThrow('assign B');
    expect(api.calls).toEqual([['remove', 'A'], ['assign', 'B'], ['assign', 'A']]);
  });
  it('does not assign when the remove fails', async () => {
    const api = fake({ remove: 'A' });
    await expect(moveClient({ clientId: 'c', fromGroupId: 'A', toGroupId: 'B' }, api)).rejects.toThrow('remove A');
    expect(api.calls).toEqual([['remove', 'A']]);
  });
  it('does nothing when from equals to', async () => {
    const api = fake();
    await moveClient({ clientId: 'c', fromGroupId: 'A', toGroupId: 'A' }, api);
    expect(api.calls).toEqual([]);
  });
  it('ignores a failing rollback and still rethrows the original error', async () => {
    const calls = [];
    const api = {
      removeClient: async () => { calls.push('remove'); },
      assignClient: async (g) => { calls.push('assign ' + g); throw new Error('boom ' + g); },
    };
    await expect(moveClient({ clientId: 'c', fromGroupId: 'A', toGroupId: 'B' }, api)).rejects.toThrow('boom B');
    expect(calls).toEqual(['remove', 'assign B', 'assign A']);
  });
});

describe('groupNameError', () => {
  const groups = [{ id: 'g1', name: 'Menarini Group' }, { id: 'g2', name: 'Other' }];
  it('requires a name', () => {
    expect(groupNameError('  ', groups, null)).toBe('Name is required.');
  });
  it('refuses another group\'s name, case-insensitively', () => {
    expect(groupNameError('menarini group', groups, 'g2')).toBe('A group named "Menarini Group" already exists.');
  });
  it('accepts the group\'s own name with other capitals', () => {
    expect(groupNameError('MENARINI GROUP', groups, 'g1')).toBeNull();
  });
  it('accepts a new name', () => {
    expect(groupNameError('Fresh', groups, null)).toBeNull();
  });
});

describe('url state', () => {
  it('reads the rate card client', () => {
    expect(readUrlState('?client=abc')).toEqual({ view: 'list', clientId: 'abc' });
  });
  it('reads the by-group view', () => {
    expect(readUrlState('?view=group')).toEqual({ view: 'group', clientId: null });
  });
  it('defaults to the list', () => {
    expect(readUrlState('')).toEqual({ view: 'list', clientId: null });
  });
  it('builds the inverse', () => {
    expect(urlFor({ view: 'list', clientId: 'abc' })).toBe('?client=abc');
    expect(urlFor({ view: 'group', clientId: null })).toBe('?view=group');
    expect(urlFor({ view: 'list', clientId: null })).toBe('');
  });
});
