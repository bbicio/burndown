const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRequirement } = require('./team-requirement');
const { isoDate } = require('./planning-calendar');

const asOf = isoDate('2099-01-10');
const project = {
  id: 'p1', name: 'Target', startDate: '209901', endDate: '209903',
  tasks: [
    { name: 'Analysis', completed: false, startDate: '20990105', endDate: '20990228',
      resources: [{ role: 'DEV', soldHours: 100 }, { role: 'PM', soldHours: 20 }] },
    { name: 'Build', completed: false, startDate: '20990201', endDate: '20990329', resources: [{ role: 'dev', soldHours: 50 }] },
    { name: 'Done task', completed: true, resources: [{ role: 'QA', soldHours: 999 }] },
  ],
};
const rec = (task, role, hours) => ({ date: isoDate('2099-01-06'), task, role, owner: 'x', hours });

test('buildRequirement: roles grouped case-insensitively, completed tasks ignored, residual from actuals', () => {
  const req = buildRequirement({
    project, actuals: [rec('Analysis', 'DEV', 30), rec('Build', 'dev', 10), rec('Analysis', 'PM', 50)],
    tags: [{ slug: 'market', listName: 'Market', itemId: 'i1', label: 'Italy' }],
    projectTopics: [{ id: 't1', name: 'Medical writing' }],
    taskTopics: { build: [{ id: 't2', name: 'Data viz' }] }, asOf, windowOverride: null,
  });
  assert.deepEqual(req.roles.map(r => r.code), ['DEV', 'PM']);
  const dev = req.roles[0];
  assert.deepEqual(dev.tasks, ['Analysis', 'Build']);
  assert.equal(dev.soldHours, 150);
  assert.equal(dev.consumedHours, 40);
  assert.equal(dev.neededHours, 110);
  assert.equal(req.roles[1].neededHours, 0);                  // consumed 50 > sold 20 → residual floors at 0
  assert.deepEqual(dev.topics.map(t => t.id).sort(), ['t1', 't2']);
  assert.deepEqual(req.roles[1].topics.map(t => t.id), ['t1']);   // PM has no Build task
  assert.equal(req.tags.length, 1);
});

test('buildRequirement: window from task dates; override wins; a role window can be null', () => {
  const r1 = buildRequirement({ project, actuals: [], tags: [], projectTopics: [], taskTopics: {}, asOf, windowOverride: null });
  assert.equal(r1.roles[0].window.from.toISOString().slice(0, 10), '2099-01-10');
  assert.equal(r1.roles[0].window.to.toISOString().slice(0, 10), '2099-03-29');
  const ov = { from: isoDate('2099-05-01'), to: isoDate('2099-05-31') };
  const r2 = buildRequirement({ project, actuals: [], tags: [], projectTopics: [], taskTopics: {}, asOf, windowOverride: ov });
  assert.equal(r2.roles[0].window.from.toISOString().slice(0, 10), '2099-05-01');
  const bare = { id: 'p2', name: 'Bare', tasks: [{ name: 'T', completed: false, resources: [{ role: 'DEV', soldHours: 5 }] }] };
  assert.equal(buildRequirement({ project: bare, actuals: [], tags: [], projectTopics: [], taskTopics: {}, asOf, windowOverride: null }).roles[0].window, null);
});

test('buildRequirement: a project without roles/hours has no roles', () => {
  const empty = { id: 'p3', name: 'E', tasks: [{ name: 'T', completed: false, resources: [] }, { name: 'U', completed: false }] };
  assert.deepEqual(buildRequirement({ project: empty, actuals: [], tags: [], projectTopics: [], taskTopics: {}, asOf, windowOverride: null }).roles, []);
});
