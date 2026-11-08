import { describe, it, expect } from 'vitest';
import { sortResources, filterComboOptions, buildProfileTree, paginate, sortUnmatched, fold } from './team-ui.js';

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

  it('adds a topics list: approved topics with the projects they appear in', () => {
    const withTopics = { ...profile, topics: [
      { id: 't2', name: 'Data visualization', projectCodes: ['P2'] },
      { id: 't1', name: 'Medical writing', projectCodes: ['P1', 'P2'] },
    ] };
    const tree = buildProfileTree(withTopics, []);
    expect(tree.topics.map(t => [t.name, t.projectCount])).toEqual([['Medical writing', 2], ['Data visualization', 1]]);
    expect(new Set(tree.topics[0].projects.map(p => p.code))).toEqual(new Set(['P1', 'P2']));
    expect(tree.topics[0].projects.every(p => typeof p.name === 'string')).toBe(true);
  });

  it('topics is an empty array when the profile has none (older profiles, nothing approved)', () => {
    expect(buildProfileTree(profile, []).topics).toEqual([]);
    expect(buildProfileTree({ ...profile, topics: [] }, []).topics).toEqual([]);
  });

  it('groups topics by provenance: direct experience, project context, legacy (no provenance)', () => {
    const p = { ...profile, topics: [
      { id: 'a', name: 'Medical writing', projectCodes: ['P1', 'P2'],
        direct: { hours: 12, projectCodes: ['P1'] }, context: { projectCodes: ['P2'] } },
      { id: 'b', name: 'Copy editing', projectCodes: ['P2'], direct: { hours: 0, projectCodes: [] }, context: { projectCodes: ['P2'] } },
      { id: 'c', name: 'Old topic', projectCodes: ['P1'] },
    ] };
    const tree = buildProfileTree(p, []);
    expect(tree.topicGroups.direct.map(t => [t.name, t.directHours])).toEqual([['Medical writing', 12]]);
    expect(tree.topicGroups.context.map(t => t.name).sort()).toEqual(['Copy editing', 'Medical writing']);
    expect(tree.topicGroups.legacy.map(t => t.name)).toEqual(['Old topic']);
    expect(tree.topics.find(t => t.id === 'a').direct.map(n => n.code)).toEqual(['P1']);
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

describe('paginate', () => {
  it('returns everything on one page when it fits', () => {
    const items = [1, 2, 3];
    const r = paginate(items, 1, 25);
    expect(r).toEqual({ pageItems: [1, 2, 3], totalPages: 1, page: 1 });
  });

  it('slices the requested page', () => {
    const items = Array.from({ length: 30 }, (_, i) => i + 1);
    const r = paginate(items, 2, 25);
    expect(r.pageItems).toEqual([26, 27, 28, 29, 30]);
    expect(r.totalPages).toBe(2);
    expect(r.page).toBe(2);
  });

  it('clamps a page number below 1 up to 1', () => {
    const r = paginate([1, 2, 3], 0, 25);
    expect(r.page).toBe(1);
    expect(r.pageItems).toEqual([1, 2, 3]);
  });

  it('clamps a page number past the end back to the last page', () => {
    const items = Array.from({ length: 30 }, (_, i) => i + 1);
    const r = paginate(items, 99, 25);
    expect(r.page).toBe(2);
    expect(r.pageItems).toEqual([26, 27, 28, 29, 30]);
  });

  it('an empty list has exactly one (empty) page, never zero', () => {
    const r = paginate([], 1, 25);
    expect(r).toEqual({ pageItems: [], totalPages: 1, page: 1 });
  });
});

describe('fold', () => {
  it('strips accents and lowercases', () => {
    expect(fold('Nicolò')).toBe(fold('Nicolo'));
    expect(fold('Nicolò')).toBe('nicolo');
    expect(fold('Nicolo')).toBe('nicolo');
  });

  it('trims surrounding whitespace', () => {
    expect(fold('  Mario  ')).toBe('mario');
  });

  it('tolerates null/undefined', () => {
    expect(fold(null)).toBe('');
    expect(fold(undefined)).toBe('');
  });
});

describe('sortUnmatched', () => {
  const rows = [
    { name_normalized: 'a', display_name: 'Bianchi Anna', hours: 9, projects: 2 },
    { name_normalized: 'b', display_name: 'alighieri dante', hours: 10, projects: 1 },
    { name_normalized: 'c', display_name: 'Verdi Carlo', hours: 3, projects: 10 },
  ];

  it('sorts by hours ascending, numerically not lexically (9 before 10)', () => {
    const sorted = sortUnmatched(rows, 'hours', 'asc');
    expect(sorted.map(r => r.hours)).toEqual([3, 9, 10]);
  });

  it('sorts by hours descending', () => {
    const sorted = sortUnmatched(rows, 'hours', 'desc');
    expect(sorted.map(r => r.hours)).toEqual([10, 9, 3]);
  });

  it('sorts by projects numerically (2 before 10, not "10" before "2")', () => {
    const sorted = sortUnmatched(rows, 'projects', 'asc');
    expect(sorted.map(r => r.projects)).toEqual([1, 2, 10]);
  });

  it('sorts by name, case/accent-insensitive', () => {
    const sorted = sortUnmatched(rows, 'name', 'asc');
    expect(sorted.map(r => r.display_name)).toEqual(['alighieri dante', 'Bianchi Anna', 'Verdi Carlo']);
  });

  it('does not mutate the input array', () => {
    const copy = rows.slice();
    sortUnmatched(rows, 'hours', 'asc');
    expect(rows).toEqual(copy);
  });

  it('falls back to hours ordering for an unknown key', () => {
    const sorted = sortUnmatched(rows, 'nonsense', 'asc');
    expect(sorted.map(r => r.hours)).toEqual([3, 9, 10]);
  });
});

// ── Redesign helpers (2026-11-08) ──
import {
  resourceCounts, filterResources, sessionProgress, hoursBarPct, isRecentMonth, profileMonthText,
  aliasRows, candidateChips, topTopicIds, deleteSummary,
} from './team-ui.js';

const RES = [
  { id: 'a', first_name: 'Anna', last_name: 'Bianchi', email: 'anna@x.it', role_id: 'r1', role_label: 'Developer', role_code: 'DEV', user_id: 'u1', status: 'active' },
  { id: 'b', first_name: 'Luca', last_name: 'Espòsito', email: 'luca@x.it', role_id: 'r2', role_label: 'Project Manager', role_code: 'PM', user_id: null, status: 'active' },
  { id: 'c', first_name: 'Marco', last_name: 'Amato', email: 'marco@x.it', role_id: 'r2', role_label: 'Project Manager', role_code: 'PM', user_id: null, status: 'inactive' },
];

describe('resourceCounts', () => {
  it('counts total, active and inactive', () => {
    expect(resourceCounts([{ status: 'active' }, { status: 'inactive' }, { status: 'active' }])).toEqual({ total: 3, active: 2, inactive: 1 });
  });
});

describe('filterResources', () => {
  const ids = (l) => l.map(r => r.id);
  it('defaults to active only', () => expect(ids(filterResources(RES, {}))).toEqual(['a', 'b']));
  it('status all keeps the inactive', () => expect(ids(filterResources(RES, { status: 'all' }))).toEqual(['a', 'b', 'c']));
  it('status inactive', () => expect(ids(filterResources(RES, { status: 'inactive' }))).toEqual(['c']));
  it('filters by role id', () => expect(ids(filterResources(RES, { status: 'all', roleId: 'r2' }))).toEqual(['b', 'c']));
  it('filters linked / unlinked on user_id', () => {
    expect(ids(filterResources(RES, { status: 'all', linked: 'linked' }))).toEqual(['a']);
    expect(ids(filterResources(RES, { status: 'all', linked: 'unlinked' }))).toEqual(['b', 'c']);
  });
  it('text is trimmed and case-insensitive', () => expect(ids(filterResources(RES, { text: '  ANNA ' }))).toEqual(['a']));
  it('text matches the role code', () => expect(ids(filterResources(RES, { text: 'pm' }))).toEqual(['b']));
  it('characterization: no accent folding', () => expect(ids(filterResources(RES, { text: 'esposito' }))).toEqual([]));
});

describe('sessionProgress', () => {
  it('total = resolved + queue', () => expect(sessionProgress(3, 14)).toEqual({ resolved: 3, total: 17, pct: 18 }));
  it('empty is 0%', () => expect(sessionProgress(0, 0)).toEqual({ resolved: 0, total: 0, pct: 0 }));
});

describe('hoursBarPct', () => {
  it('rounds the share', () => expect(hoursBarPct(64, 193)).toBe(33));
  it('0 when max is 0', () => expect(hoursBarPct(5, 0)).toBe(0));
});

describe('isRecentMonth', () => {
  const today = new Date('2026-11-08');
  it('current and two previous months are recent', () => {
    expect(isRecentMonth('2026-11', today)).toBe(true);
    expect(isRecentMonth('2026-09', today)).toBe(true);
  });
  it('older, future and invalid are not', () => {
    expect(isRecentMonth('2026-08', today)).toBe(false);
    expect(isRecentMonth('2026-12', today)).toBe(false);
    expect(isRecentMonth(null, today)).toBe(false);
    expect(isRecentMonth('2026-13', today)).toBe(false);
  });
  it('crosses the year boundary', () => expect(isRecentMonth('2025-11', new Date('2026-01-15'))).toBe(true));
});

describe('profileMonthText', () => {
  it('formats YYYY-MM', () => expect(profileMonthText('2025-12')).toBe('Dec 2025'));
  it('dash when missing or invalid', () => {
    expect(profileMonthText(null)).toBe('—');
    expect(profileMonthText('2025-13')).toBe('—');
  });
});

describe('aliasRows', () => {
  const aliases = [
    { id: 1, display_name: 'A. Rossi', resource_id: 'c' },
    { id: 2, display_name: 'TBD', resource_id: null },
    { id: 3, display_name: 'Anna B.', resource_id: 'a' },
  ];
  it('attaches the resource with role code and status', () => {
    const rows = aliasRows(aliases, RES);
    expect(rows[0].resource).toEqual({ id: 'c', name: 'Marco Amato', role_code: 'PM', status: 'inactive' });
    expect(rows[1].resource).toBeNull();
  });
  it('resolves ignored keeps only null resource_id', () => {
    expect(aliasRows(aliases, RES, { resolves: 'ignored' }).map(r => r.id)).toEqual([2]);
    expect(aliasRows(aliases, RES, { resolves: 'resource' }).map(r => r.id)).toEqual([1, 3]);
  });
  it('text matches the resource name', () => expect(aliasRows(aliases, RES, { text: 'amato' }).map(r => r.id)).toEqual([1]));
});

describe('candidateChips', () => {
  it('keeps the candidate order and skips missing ids', () => {
    const x = { id: 'x', first_name: 'X', last_name: 'One', role_code: 'DEV' };
    const y = { id: 'y', first_name: 'Y', last_name: 'Two', role_code: 'PM' };
    expect(candidateChips({ candidate_resource_ids: ['x', 'gone', 'y'] }, [y, x])).toEqual([
      { id: 'x', name: 'X One', role_code: 'DEV' }, { id: 'y', name: 'Y Two', role_code: 'PM' },
    ]);
  });
  it('no candidates → no chips', () => expect(candidateChips({}, RES)).toEqual([]));
});

describe('topTopicIds', () => {
  it('top two by hours', () => {
    expect(topTopicIds([{ id: 1, name: 'B', hours: 12 }, { id: 2, name: 'A', hours: 92 }, { id: 3, name: 'C', hours: 45 }])).toEqual([2, 3]);
  });
  it('ties broken by name', () => {
    expect(topTopicIds([{ id: 1, name: 'B', hours: 5 }, { id: 2, name: 'A', hours: 5 }], 1)).toEqual([2]);
  });
});

describe('deleteSummary', () => {
  const r = { id: 'a' };
  it('no aliases', () => expect(deleteSummary(r, [])).toEqual({ count: 0, names: [] }));
  it('counts only this resource aliases, names sorted', () => {
    const al = [
      { display_name: 'Zed', resource_id: 'a' }, { display_name: 'Anna', resource_id: 'a' },
      { display_name: 'Other', resource_id: 'b' }, { display_name: 'Bianchi A.', resource_id: 'a' },
    ];
    expect(deleteSummary(r, al)).toEqual({ count: 3, names: ['Anna', 'Bianchi A.', 'Zed'] });
  });
  it('tolerates missing aliases', () => expect(deleteSummary(r, null)).toEqual({ count: 0, names: [] }));
});
