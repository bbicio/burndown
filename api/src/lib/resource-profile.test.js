const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMatchContext } = require('./match-resource');
const { monthOf, normalizeTask, buildContributions, aggregateProfile } = require('./resource-profile');

const R = (id, first, last, status = 'active') => ({ id, first_name: first, last_name: last, status });
const ctx = buildMatchContext([R('r1', 'Mario', 'Rossi'), R('r2', 'Luca', 'Verdi')], [
  { alias_normalized: 'tbd', resource_id: null },
  { alias_normalized: 'mr', resource_id: 'r1' },
]);

test('monthOf: ISO dates and timestamps give YYYY-MM; anything else null', () => {
  assert.equal(monthOf('2026-03-15'), '2026-03');
  assert.equal(monthOf('2026-03-15T10:00:00Z'), '2026-03');
  assert.equal(monthOf('2026-13-01'), null);
  assert.equal(monthOf('15/03/2026'), null);
  assert.equal(monthOf(''), null);
  assert.equal(monthOf(null), null);
});

test('normalizeTask: trims, lowercases the key, collapses spaces, keeps a readable name', () => {
  assert.deepEqual(normalizeTask('  Literature   Review '), { key: 'literature review', name: 'Literature Review' });
  assert.deepEqual(normalizeTask(''), { key: '(no task)', name: '(no task)' });
  assert.deepEqual(normalizeTask(null), { key: '(no task)', name: '(no task)' });
});

test('buildContributions: sums hours, months, roles and tasks per resource; spellings of one name merge', () => {
  const rows = [
    { owner: 'Mario Rossi', role: 'DEV', task: 'Analysis', hours: 4, date: '2026-01-15' },
    { owner: 'ROSSI mario', role: 'DEV', task: 'analysis ', hours: '2.5', date: '2026-02-10' },
    { owner: 'MR', role: 'PM', task: 'Kickoff', hours: 1, date: '2026-01-02' },
    { owner: 'Luca Verdi', role: 'DEV', task: 'Analysis', hours: 8, date: '2026-03-01' },
  ];
  const m = buildContributions(rows, ctx, 'Alpha');
  assert.deepEqual([...m.keys()].sort(), ['r1', 'r2']);
  assert.deepEqual(m.get('r1'), {
    projectName: 'Alpha', hours: 7.5, first: '2026-01', last: '2026-02',
    roles: { DEV: 6.5, PM: 1 },
    tasks: { analysis: { name: 'Analysis', hours: 6.5 }, kickoff: { name: 'Kickoff', hours: 1 } },
  });
  assert.equal(m.get('r2').hours, 8);
});

test('buildContributions: unmatched, ignored, ambiguous and blank owners produce nothing', () => {
  const ambiguousCtx = buildMatchContext([R('a', 'Ann', 'Lee'), R('b', 'Lee', 'Ann')], []);
  const rows = [
    { owner: 'Nobody Here', hours: 3, date: '2026-01-01' },
    { owner: 'TBD', hours: 3, date: '2026-01-01' },
    { owner: '', hours: 3, date: '2026-01-01' },
    { owner: null, hours: 3, date: '2026-01-01' },
    { owner: 'Ann Lee', hours: 3, date: '2026-01-01' },
  ];
  assert.equal(buildContributions(rows, ctx, 'P').size, 0);
  assert.equal(buildContributions(rows, ambiguousCtx, 'P').size, 0);
});

test('buildContributions: non-numeric hours count 0; missing/invalid dates leave first/last null; blank role skipped', () => {
  const m = buildContributions([
    { owner: 'Mario Rossi', role: '', task: '', hours: 'abc', date: 'not-a-date' },
    { owner: 'Mario Rossi', role: 'DEV', task: 'X', hours: 0.1, date: null },
    { owner: 'Mario Rossi', role: 'DEV', task: 'X', hours: 0.2, date: undefined },
  ], ctx, 'P');
  const c = m.get('r1');
  assert.equal(c.hours, 0.3);                        // no float noise
  assert.equal(c.first, null);
  assert.equal(c.last, null);
  assert.deepEqual(c.roles, { DEV: 0.3 });
  assert.deepEqual(c.tasks['(no task)'], { name: '(no task)', hours: 0 });
});

test('buildContributions: an empty row list gives an empty map', () => {
  assert.equal(buildContributions([], ctx, 'P').size, 0);
  assert.equal(buildContributions(undefined, ctx, 'P').size, 0);
});

const C = (hours, first, last, roles, tasks, projectName = 'X') => ({ projectName, hours, first, last, roles, tasks });
const tag = (slug, listName, itemId, label) => ({ slug, listName, itemId, label });
const NOW = new Date('2026-09-25T12:00:00Z');

test('aggregateProfile: no contributions → null', () => {
  assert.equal(aggregateProfile({}, {}, NOW), null);
  assert.equal(aggregateProfile(undefined, {}, NOW), null);
});

test('aggregateProfile: totals, project index, dimensions, roles and untagged hours', () => {
  const contrib = {
    P1: C(10, '2026-01', '2026-02', { DEV: 10 }, { analysis: { name: 'Analysis', hours: 10 } }, 'From actuals'),
    P2: C(3, '2026-03', '2026-03', { DEV: 2, PM: 1 }, { kickoff: { name: 'Kickoff', hours: 3 } }),
  };
  const projects = {
    P1: { projectId: 'id1', name: 'Alpha', tags: [tag('market', 'Market', 'm-it', 'Italy'), tag('brand', 'Brand', 'b-a', 'Brand A')] },
    P2: { projectId: 'id2', name: 'Beta', tags: [] },
  };
  const p = aggregateProfile(contrib, projects, NOW);
  assert.equal(p.version, 1);
  assert.equal(p.computedAt, NOW.toISOString());
  assert.deepEqual(p.totals, { hours: 13, projects: 2, firstWorked: '2026-01', lastWorked: '2026-03' });
  assert.deepEqual(Object.keys(p.projects), ['P1', 'P2']);            // ordered by hours desc
  assert.deepEqual(p.projects.P1, {
    name: 'Alpha', projectId: 'id1', hours: 10, last: '2026-02',
    tags: { market: ['Italy'], brand: ['Brand A'] },
    tasks: [{ name: 'Analysis', hours: 10 }],
  });
  assert.deepEqual(p.dimensions.market, {
    name: 'Market', untaggedHours: 3,
    values: [{ value: 'Italy', itemId: 'm-it', hours: 10, share: 0.7692, projects: 1, last: '2026-02', projectCodes: ['P1'] }],
  });
  assert.equal(p.dimensions.brand.untaggedHours, 3);
  assert.deepEqual(p.roles, [
    { code: 'DEV', hours: 12, share: 0.9231, projects: 2, last: '2026-03', projectCodes: ['P1', 'P2'] },
    { code: 'PM', hours: 1, share: 0.0769, projects: 1, last: '2026-03', projectCodes: ['P2'] },
  ]);
});

test('aggregateProfile: a project with several values in one dimension counts fully on each (shares may exceed 1 in total)', () => {
  const contrib = { P1: C(10, '2026-01', '2026-01', {}, {}) };
  const projects = { P1: { name: 'A', tags: [tag('market', 'Market', 'a', 'Italy'), tag('market', 'Market', 'b', 'Spain')] } };
  const p = aggregateProfile(contrib, projects, NOW);
  assert.deepEqual(p.dimensions.market.values.map(v => [v.value, v.hours, v.share]), [['Italy', 10, 1], ['Spain', 10, 1]]);
  assert.equal(p.dimensions.market.untaggedHours, 0);
});

test('aggregateProfile: a code with no project row falls back to the actuals name, then the code; no tags', () => {
  const p = aggregateProfile({ ORPHAN: C(2, null, null, {}, {}, 'Named in actuals'), BARE: C(1, null, null, {}, {}, '') }, {}, NOW);
  assert.equal(p.projects.ORPHAN.name, 'Named in actuals');
  assert.equal(p.projects.ORPHAN.projectId, null);
  assert.equal(p.projects.BARE.name, 'BARE');
  assert.deepEqual(p.dimensions, {});
  assert.equal(p.totals.firstWorked, null);
});

test('aggregateProfile: zero total hours does not divide by zero', () => {
  const p = aggregateProfile({ P1: C(0, null, null, {}, {}) }, { P1: { name: 'A', tags: [tag('market', 'Market', 'a', 'Italy')] } }, NOW);
  assert.equal(p.dimensions.market.values[0].share, 0);
});

test('aggregateProfile: values are ordered by hours (desc) then label; the result is deterministic', () => {
  const contrib = { P1: C(5, '2026-01', '2026-01', {}, {}), P2: C(5, '2026-01', '2026-01', {}, {}) };
  const projects = {
    P1: { name: 'A', tags: [tag('market', 'Market', 'z', 'Zed')] },
    P2: { name: 'B', tags: [tag('market', 'Market', 'a', 'Alpha')] },
  };
  const a = aggregateProfile(contrib, projects, NOW);
  const b = aggregateProfile(contrib, projects, NOW);
  assert.deepEqual(a.dimensions.market.values.map(v => v.value), ['Alpha', 'Zed']);
  assert.deepEqual(a, b);
});
