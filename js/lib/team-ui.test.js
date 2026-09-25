import { describe, it, expect } from 'vitest';
import { sortResources, filterComboOptions, buildProfileTree } from './team-ui.js';

describe('buildProfileTree', () => {
  const profile = {
    version: 1, computedAt: '2026-09-25T12:00:00.000Z',
    totals: { hours: 13, projects: 2, firstWorked: '2026-01', lastWorked: '2026-03' },
    dimensions: {
      market: { name: 'Market', untaggedHours: 3, values: [
        { value: 'Spain', itemId: 'm2', hours: 3, share: 0.2308, projects: 1, last: '2026-03', projectCodes: ['P2'] },
        { value: 'Italy', itemId: 'm1', hours: 10, share: 0.7692, projects: 1, last: '2026-02', projectCodes: ['P1'] },
      ] },
      brand: { name: 'Brand', untaggedHours: 0, values: [] },
    },
    roles: [
      { code: 'DEV', hours: 12, share: 0.9231, projects: 2, last: '2026-03', projectCodes: ['P2', 'P1'] },
      { code: 'ODD', hours: 1, share: 0.0769, projects: 1, last: '2026-03', projectCodes: ['P2'] },
    ],
    projects: {
      P1: { name: 'Alpha', hours: 10, last: '2026-02', tags: {}, tasks: [{ name: 'Analysis', hours: 10 }] },
      P2: { name: 'Beta', hours: 3, last: '2026-03', tags: {}, tasks: [{ name: 'Kickoff', hours: 3 }] },
    },
  };
  const roles = [{ id: 'r1', code: 'DEV', label: 'Developer' }];

  it('returns null for a missing or empty profile', () => {
    expect(buildProfileTree(null, roles)).toBeNull();
    expect(buildProfileTree(undefined, roles)).toBeNull();
    expect(buildProfileTree({}, roles)).toBeNull();
  });

  it('keeps totals and the computed date', () => {
    const t = buildProfileTree(profile, roles);
    expect(t.totals).toEqual(profile.totals);
    expect(t.computedAt).toBe('2026-09-25T12:00:00.000Z');
  });

  it('builds dimension → value → project → task, values ordered by hours desc', () => {
    const t = buildProfileTree(profile, roles);
    expect(t.dimensions.map(d => d.slug)).toEqual(['brand', 'market']);      // by name
    const market = t.dimensions.find(d => d.slug === 'market');
    expect(market.untaggedHours).toBe(3);
    expect(market.values.map(v => v.label)).toEqual(['Italy', 'Spain']);
    expect(market.values[0]).toMatchObject({ label: 'Italy', hours: 10, share: 0.7692, projectCount: 1, last: '2026-02' });
    expect(market.values[0].projects).toEqual([
      { code: 'P1', name: 'Alpha', hours: 10, last: '2026-02', tasks: [{ name: 'Analysis', hours: 10 }] },
    ]);
  });

  it('a dimension with no values is kept (empty list)', () => {
    const brand = buildProfileTree(profile, roles).dimensions.find(d => d.slug === 'brand');
    expect(brand.values).toEqual([]);
  });

  it('labels roles from the loaded roles, falls back to the code, orders projects by hours desc', () => {
    const t = buildProfileTree(profile, roles);
    expect(t.roles.map(r => [r.code, r.label])).toEqual([['DEV', 'Developer'], ['ODD', 'ODD']]);
    expect(t.roles[0].projects.map(p => p.code)).toEqual(['P1', 'P2']);       // 10 h before 3 h
    expect(t.roles[0].projectCount).toBe(2);
  });

  it('a project code missing from the index still produces a node', () => {
    const t = buildProfileTree({ ...profile, roles: [{ code: 'X', hours: 1, share: 1, projects: 1, last: null, projectCodes: ['GONE'] }] }, []);
    expect(t.roles[0].projects).toEqual([{ code: 'GONE', name: 'GONE', hours: 0, last: null, tasks: [] }]);
  });

  it('does not mutate the profile it is given', () => {
    const copy = JSON.stringify(profile);
    buildProfileTree(profile, roles);
    expect(JSON.stringify(profile)).toBe(copy);
  });
});

const R = (id, first, last, email, roleLabel, roleCode, status = 'active') =>
  ({ id, first_name: first, last_name: last, email, role_label: roleLabel, role_code: roleCode, status });

const people = [
  R('1', 'Mario', 'Rossi', 'm.rossi@x.test', 'Consultant', 'CONS'),
  R('2', 'Anna', 'Bianchi', 'a.bianchi@x.test', 'Director', 'DIR', 'inactive'),
  R('3', 'Luca', 'Verdi', 'l.verdi@x.test', 'Consultant', 'CONS'),
  R('4', 'Àlex', 'Bianchi', 'z.alex@x.test', 'Analyst', 'AN'),
];

const ids = list => list.map(r => r.id);

describe('sortResources', () => {
  it('sorts by name (last name, then first name), ascending by default', () => {
    expect(ids(sortResources(people, 'name'))).toEqual(['4', '2', '1', '3']); // Bianchi Àlex, Bianchi Anna, Rossi, Verdi
  });

  it('reverses the order for desc', () => {
    expect(ids(sortResources(people, 'name', 'desc'))).toEqual(['3', '1', '2', '4']);
  });

  it('sorts by email', () => {
    expect(ids(sortResources(people, 'email'))).toEqual(['2', '3', '1', '4']);
  });

  it('sorts by role label then code, ties broken by name ascending', () => {
    // Analyst, Consultant (Rossi, Verdi), Director
    expect(ids(sortResources(people, 'role'))).toEqual(['4', '1', '3', '2']);
  });

  it('keeps the name tie-break ascending even when the primary order is desc', () => {
    // Director, Consultant (Rossi, Verdi — still name ascending), Analyst
    expect(ids(sortResources(people, 'role', 'desc'))).toEqual(['2', '1', '3', '4']);
  });

  it('puts active before inactive, then by name', () => {
    expect(ids(sortResources(people, 'status'))).toEqual(['4', '1', '3', '2']);
    expect(ids(sortResources(people, 'status', 'desc'))).toEqual(['2', '4', '1', '3']);
  });

  it('falls back to name for an unknown key', () => {
    expect(ids(sortResources(people, 'nope'))).toEqual(ids(sortResources(people, 'name')));
  });

  it('does not mutate the input array', () => {
    const copy = ids(people);
    sortResources(people, 'email', 'desc');
    expect(ids(people)).toEqual(copy);
  });

  it('tolerates missing/null fields without throwing', () => {
    const sparse = [
      { id: 'a', first_name: 'Zed', last_name: 'Zulu', status: 'active' },
      { id: 'b', first_name: 'Amy', last_name: 'Alpha', email: null, role_label: null, status: 'active' },
    ];
    expect(ids(sortResources(sparse, 'email'))).toEqual(['b', 'a']);   // both empty → name order
    expect(ids(sortResources(sparse, 'role'))).toEqual(['b', 'a']);
  });

  it('is stable for fully equal rows (original order preserved)', () => {
    const twins = [R('x', 'Same', 'Name', 'a@x.test', 'R', 'R'), R('y', 'Same', 'Name', 'a@x.test', 'R', 'R')];
    expect(ids(sortResources(twins, 'name'))).toEqual(['x', 'y']);
    expect(ids(sortResources(twins, 'name', 'desc'))).toEqual(['x', 'y']);
  });
});

describe('filterComboOptions', () => {
  const opts = [
    { id: 'a', label: 'Mario Rossi' },
    { id: 'b', label: 'José Álvarez (inactive)' },
    { id: 'c', label: 'Luca Verdi' },
  ];

  it('returns every option, in order, for a blank query', () => {
    expect(filterComboOptions(opts, '')).toEqual(opts);
    expect(filterComboOptions(opts, '   ')).toEqual(opts);
    expect(filterComboOptions(opts, undefined)).toEqual(opts);
    expect(filterComboOptions(opts, '')).not.toBe(opts);   // a copy, not the same array
  });

  it('ignores case', () => {
    expect(filterComboOptions(opts, 'ROSSI').map(o => o.id)).toEqual(['a']);
  });

  it('ignores accents on both sides', () => {
    expect(filterComboOptions(opts, 'jose alvarez').map(o => o.id)).toEqual(['b']);
    expect(filterComboOptions(opts, 'José').map(o => o.id)).toEqual(['b']);
  });

  it('matches when every word of the query is present, in any order', () => {
    expect(filterComboOptions(opts, 'rossi mario').map(o => o.id)).toEqual(['a']);
    expect(filterComboOptions(opts, 'mario verdi')).toEqual([]);
  });

  it('matches a substring inside a word', () => {
    expect(filterComboOptions(opts, 'uca').map(o => o.id)).toEqual(['c']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterComboOptions(opts, 'zzz')).toEqual([]);
  });

  it('preserves the input order of the matches', () => {
    expect(filterComboOptions(opts, 'i').map(o => o.id)).toEqual(['a', 'b', 'c']);
  });
});
