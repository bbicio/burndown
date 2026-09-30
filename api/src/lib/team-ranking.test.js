const test = require('node:test');
const assert = require('node:assert/strict');
const { rankTeam, explainResource, rationale } = require('./team-ranking');
const { isoDate } = require('./planning-calendar');

const asOf = isoDate('2099-01-10');
const role = {
  code: 'DEV', tasks: ['Data analysis'], soldHours: 120, consumedHours: 0, neededHours: 120, topics: [],
  window: { from: isoDate('2099-01-10'), to: isoDate('2099-02-01') },        // 4 non-past weeks (Mondays 01-05 current … 01-26)
};
const requirement = { projectId: 'p', name: 'Target', tags: [], roles: [role] };

const prof = (devHours, analysisHours) => ({
  version: 2, roles: [{ code: 'DEV', hours: devHours }], dimensions: {},
  projects: { P1: { name: 'Brand X', hours: analysisHours, tasks: [{ name: 'Data analysis', hours: analysisHours }] } }, topics: [],
});
const person = (id, first, roleCode, profile, status = 'active') =>
  ({ id, firstName: first, lastName: 'T', roleCode, status, profile });

const resources = [
  person('a', 'Alice', 'DEV', prof(400, 200)),
  person('b', 'Bob', 'DEV', prof(100, 20)),
  person('c', 'Cara', 'DEV', null),                       // no profile
  person('d', 'Dan', 'PM', prof(0, 150)),                 // other role, relevant task experience
  person('e', 'Eve', 'PM', prof(0, 1)),                   // other role, no relevant experience
  person('f', 'Fred', 'DEV', prof(400, 200), 'inactive'),
];
const busy = { weeks: { '2099-01-12': { hours: 60, isPast: false }, '2099-01-19': { hours: 60, isPast: false } } };
const base = {
  requirement, resources, loads: new Map([['a', busy]]), asOf, params: { topN: 3, includeAlternatives: true },
  excludedIds: new Set(), projectHours: new Map([['b', 12]]),
};
const names = section => section[0].rows.map(r => r.name);

test('best: same role only, active only, by score; no-profile member listed with score 0 and a flag', () => {
  const { best } = rankTeam(base);
  assert.deepEqual(names(best), ['Alice T', 'Bob T', 'Cara T']);
  assert.equal(best[0].role, 'DEV');
  const cara = best[0].rows[2];
  assert.equal(cara.score, 0);
  assert.ok(cara.flags.includes('no actuals matched'));
  assert.ok(best[0].rows[1].score > 0 && best[0].rows[0].score > best[0].rows[1].score);
});

test('alternative: other roles only, needs a profile and score ≥ 30, role component excluded', () => {
  const { alternative } = rankTeam(base);
  assert.deepEqual(names(alternative), ['Dan T']);      // Eve < 30, Cara has no profile, DEV people are not "alternatives"
});

test('no-profile resources appear only in best (not alternative, not available)', () => {
  const { alternative, available } = rankTeam(base);
  assert.ok(!names(alternative).includes('Cara T'));
  assert.ok(!names(available).includes('Cara T'));
});

test('available: ordered by score × min(1, freeAvg / neededPerWeek); the busy expert drops below the free one', () => {
  const { available } = rankTeam(base);
  // neededPerWeek = 120 / 4 = 30 h; Alice's free weeks: 32, 0, 0, 32 → avg 16 → factor 16/30
  const alice = available[0].rows.find(r => r.name === 'Alice T');
  const bob = available[0].rows.find(r => r.name === 'Bob T');
  assert.equal(alice.freeAvg, 16);
  assert.equal(alice.freeMin, 0);
  assert.equal(bob.freeAvg, 32);
  assert.ok(Math.abs(alice.rank - Math.round(alice.score * (16 / 30) * 10) / 10) < 1e-9);
  assert.equal(bob.rank, bob.score);                    // 32 ≥ 30 → factor 1
  assert.equal(bob.hoursOnProject, 12);
});

test('excluded resources disappear from every table', () => {
  const r = rankTeam({ ...base, excludedIds: new Set(['a']) });
  for (const t of [r.best, r.alternative, r.available]) assert.ok(!names(t).includes('Alice T'));
});

test('params.roles selects roles (case-insensitive); unknown roles give no sections', () => {
  assert.equal(rankTeam({ ...base, params: { ...base.params, roles: ['dev'] } }).best.length, 1);
  assert.equal(rankTeam({ ...base, params: { ...base.params, roles: ['nope'] } }).best.length, 0);
});

test('includeAlternatives=false: no alternative table rows and the available pool is same-role only', () => {
  const r = rankTeam({ ...base, params: { ...base.params, includeAlternatives: false } });
  assert.deepEqual(r.alternative[0].rows, []);
  assert.ok(!names(r.available).includes('Dan T'));
});

test('minFreeHoursPerWeek filters the available table', () => {
  const r = rankTeam({ ...base, params: { ...base.params, minFreeHoursPerWeek: 20 } });
  assert.ok(!names(r.available).includes('Alice T'));
  assert.ok(names(r.available).includes('Bob T'));
});

test('requireTags keeps only resources with hours on that value', () => {
  const tagged = { ...prof(400, 200), dimensions: { market: { name: 'Market', values: [{ value: 'Italy', itemId: 'i', hours: 50 }] } } };
  const rs = [person('a', 'Alice', 'DEV', tagged), person('b', 'Bob', 'DEV', prof(100, 20))];
  const r = rankTeam({ ...base, resources: rs, params: { ...base.params, requireTags: [{ list: 'Market', value: 'Italy' }] } });
  assert.deepEqual(names(r.best), ['Alice T']);
});

test('topN limits every table; a role with nobody gets an explanatory note', () => {
  const one = rankTeam({ ...base, params: { ...base.params, topN: 1 } });
  assert.equal(one.best[0].rows.length, 1);
  const none = rankTeam({ ...base, resources: [person('d', 'Dan', 'PM', prof(0, 150))] });
  assert.deepEqual(none.best[0].rows, []);
  assert.match(none.best[0].note, /No active resource has this role/);
});

test('availability not computable (role without window): freeAvg null, factor 1, rationale says so', () => {
  const r = rankTeam({ ...base, requirement: { ...requirement, roles: [{ ...role, window: null }] } });
  const row = r.available[0].rows[0];
  assert.equal(row.freeAvg, null);
  assert.equal(row.rank, row.score);
  assert.match(row.rationale, /availability not computable/);
});

test('window entirely in the past behaves like a missing window (no NaN)', () => {
  const past = { ...role, window: { from: isoDate('2098-01-01'), to: isoDate('2098-02-01') } };
  const r = rankTeam({ ...base, requirement: { ...requirement, roles: [past] } });
  for (const row of r.available[0].rows) { assert.equal(row.freeAvg, null); assert.ok(Number.isFinite(row.rank)); }
});

test('low score flag: same-role member with almost no relevant experience', () => {
  const r = rankTeam({ ...base, resources: [person('z', 'Zed', 'DEV', prof(0, 0))] });
  assert.ok(r.best[0].rows[0].flags.includes('no relevant experience'));
});

test('rationale: fixed order and format, fragments omitted when absent', () => {
  const text = rationale({
    roleCode: 'DEV', roleHours: 142.4, flags: [],
    tags: [{ list: 'Market', value: 'Italy', hours: 90 }, { list: 'Brand', value: 'Acme', hours: 30 }],
    projects: [{ name: 'Brand X', hours: 90 }], topics: [{ name: 'Data viz', kind: 'direct', hours: 60 }],
    freeAvg: 12.4, freeMin: 0,
  });
  assert.equal(text, "142 h as DEV; tags: Italy (90 h), Acme (30 h); similar projects: Brand X (90 h); topic 'Data viz' (direct, 60 h); 12 h/week free");
  assert.equal(rationale({ roleCode: 'DEV', roleHours: 0, flags: ['no actuals matched'], tags: [], projects: [], topics: [], freeAvg: null }),
    'no actuals matched; availability not computable');
  assert.match(rationale({ roleCode: 'DEV', roleHours: 5, flags: ['topic provenance not available, recalculate profiles'],
    tags: [], projects: [], topics: [], freeAvg: 3 }), /topic provenance not available, recalculate profiles/);
});

test('explainResource: breakdown, both scores, position in the best list, availability', () => {
  const e = explainResource({ ...base, name: 'Bob T', roleCode: 'DEV' });
  assert.equal(e.name, 'Bob T');
  assert.equal(e.sameRole, true);
  assert.equal(e.positionInBest, 2);
  assert.ok(e.components.find(c => c.component === 'role').weight === 30);
  assert.equal(e.freeAvg, 32);
  assert.ok(e.scoreWithoutRole > 0);
  assert.match(explainResource({ ...base, name: 'Nobody', roleCode: 'DEV' }).error, /No resource named/);
  assert.match(explainResource({ ...base, name: 'Bob T', roleCode: 'XX' }).error, /not required/);
});
