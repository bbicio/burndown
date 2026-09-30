const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('./team-scoring');

const role = { code: 'DEV', tasks: ['Data analysis', 'Build dashboard'], topics: [{ id: 't1', name: 'Medical writing' }, { id: 't2', name: 'Data viz' }] };
const tags = [{ slug: 'market', listName: 'Market', itemId: 'i-it', label: 'Italy' }];
const profile = {
  version: 2,
  roles: [{ code: 'DEV', hours: 200 }, { code: 'PM', hours: 50 }],
  dimensions: { market: { name: 'Market', values: [{ value: 'Italy', itemId: 'i-it', hours: 100 }, { value: 'Spain', itemId: 'i-es', hours: 40 }] } },
  projects: {
    P1: { name: 'Brand X', hours: 120, tasks: [{ name: 'Data Analysis', hours: 60 }, { name: 'Kickoff', hours: 5 }] },
    P2: { name: 'Brand Y', hours: 30, tasks: [{ name: 'Dashboard build', hours: 30 }, { name: '(no task)', hours: 9 }] },
  },
  topics: [
    { id: 't1', name: 'Medical writing', projectCodes: ['P1'], direct: { hours: 20, projectCodes: ['P1'] }, context: { projectCodes: [] } },
    { id: 't2', name: 'Data viz', projectCodes: ['P2'], direct: { hours: 0, projectCodes: [] }, context: { projectCodes: ['P2'] } },
  ],
};
const sat = (x, k) => 1 - Math.exp(-x / k);

test('scoreResource: components use the saturation curve and the spec weights', () => {
  const r = S.scoreResource(profile, role, tags, { includeRole: true });
  const roleV = sat(200, 200), tagV = sat(100, 100);
  const taskV = sat(90, 100);            // 'Data Analysis' (equal) 60 + 'Dashboard build' (jaccard ≥ .5 with 'Build dashboard') 30; '(no task)' ignored
  const topicV = (1.0 + 0.4) / 2;
  const expected = 100 * (30 * roleV + 30 * tagV + 25 * taskV + 15 * topicV) / 100;
  assert.ok(Math.abs(r.score - Math.round(expected * 10) / 10) < 1e-9);
  assert.equal(r.evidence.roleHours, 200);
  assert.deepEqual(r.evidence.tags, [{ list: 'Market', value: 'Italy', hours: 100 }]);
  assert.deepEqual(r.evidence.topics.map(t => [t.id, t.kind]), [['t1', 'direct'], ['t2', 'context']]);
  assert.deepEqual(r.evidence.projects.map(p => p.name), ['Brand X', 'Brand Y']);
  assert.equal(r.noProfile, false);
});

test('scoreResource: includeRole=false drops the role component and renormalises', () => {
  const r = S.scoreResource(profile, role, tags, { includeRole: false });
  assert.equal(r.components.role, undefined);
  const expected = 100 * (30 * sat(100, 100) + 25 * sat(90, 100) + 15 * 0.7) / 70;
  assert.ok(Math.abs(r.score - Math.round(expected * 10) / 10) < 1e-9);
});

test('scoreResource: no tags / no topics in the requirement → those components are excluded', () => {
  const bare = { code: 'DEV', tasks: ['Data analysis'], topics: [] };
  const r = S.scoreResource(profile, bare, [], { includeRole: true });
  assert.equal(r.components.tag, undefined);
  assert.equal(r.components.topic, undefined);
  const expected = 100 * (30 * sat(200, 200) + 25 * sat(60, 100)) / 55;
  assert.ok(Math.abs(r.score - Math.round(expected * 10) / 10) < 1e-9);
});

test('scoreResource: profile null → score 0, noProfile, empty evidence', () => {
  const r = S.scoreResource(null, role, tags, { includeRole: true });
  assert.equal(r.score, 0);
  assert.equal(r.noProfile, true);
  assert.deepEqual(r.evidence.tags, []);
});

test('scoreResource: v1 topics (no direct/context) count as context and raise the provenance flag', () => {
  const v1 = { ...profile, topics: [{ id: 't1', name: 'Medical writing', projectCodes: ['P1'] }] };
  const r = S.scoreResource(v1, role, [], { includeRole: true });
  assert.equal(r.evidence.topicProvenanceMissing, true);
  assert.equal(r.evidence.topics[0].kind, 'context');
  assert.ok(Math.abs(r.components.topic.value - 0.4 / 2) < 1e-9);
});

test('scoreResource: tag dimensions are weighted (therapeutic-area/brand 3, market/service-type 2, others 1)', () => {
  const p = { ...profile, dimensions: {
    'therapeutic-area': { name: 'Therapeutic Area', values: [{ value: 'Oncology', itemId: 'o', hours: 100 }] },
    market: { name: 'Market', values: [{ value: 'Italy', itemId: 'i-it', hours: 0 }] } } };
  const reqTags = [
    { slug: 'therapeutic-area', listName: 'Therapeutic Area', itemId: 'o', label: 'Oncology' },
    { slug: 'market', listName: 'Market', itemId: 'i-it', label: 'Italy' }];
  const r = S.scoreResource(p, { code: 'DEV', tasks: [], topics: [] }, reqTags, { includeRole: false });
  assert.ok(Math.abs(r.components.tag.value - (3 * sat(100, 100) + 2 * 0) / 5) < 1e-9);
});

test('scoreResource: a listName-only tag (as buildRequirement returns) scores like the equivalent list tag', () => {
  const r1 = S.scoreResource(profile, role, [{ listName: 'Market', itemId: 'i-it', label: 'Italy' }], { includeRole: true });
  const r2 = S.scoreResource(profile, role, [{ list: 'Market', itemId: 'i-it', label: 'Italy' }], { includeRole: true });
  assert.ok(r1.components.tag.value > 0.6);
  assert.equal(r1.score, r2.score);
  assert.deepEqual(r1.evidence.tags, [{ list: 'Market', value: 'Italy', hours: 100 }]);
});

test('matchedTagHours: a listName-only tag resolves its dimension', () => {
  assert.equal(S.matchedTagHours(profile, { listName: 'Market', label: 'Italy' }), 100);
});

test('matchedTagHours: by itemId, or by label when the tag is typed free-form (list name or slug)', () => {
  assert.equal(S.matchedTagHours(profile, { slug: 'market', list: 'Market', itemId: 'i-es', label: 'Spain' }), 40);
  assert.equal(S.matchedTagHours(profile, { list: 'market', label: 'ITALY' }), 100);
  assert.equal(S.matchedTagHours(profile, { list: 'Brand', label: 'Italy' }), 0);
  assert.equal(S.matchedTagHours(null, { list: 'Market', label: 'Italy' }), 0);
});
