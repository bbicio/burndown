const test = require('node:test');
const assert = require('node:assert/strict');
const { computePlanningModel } = require('./planning-compute');
const { isoDate } = require('./planning-calendar');
const { groupActualsByProject } = require('./planning-model');

function fixture() {
  const projects = [
    { id: 'p1', code: 'C1', name: 'One', startDate: '209901', endDate: '209903', tasks: [
      { name: 'Analysis', completed: false, startDate: '20990105', endDate: '20990329', resources: [{ role: 'DEV', soldHours: 100 }] }] },
    { id: 'p2', code: 'C2', name: 'Two', startDate: '209901', endDate: '209903', tasks: [
      { name: 'Build', completed: false, startDate: '20990105', endDate: '20990329', resources: [{ role: 'DEV', soldHours: 50 }] }] },
  ];
  const sheets = [{ project_code: 'C1', data: [{ date: '2099-01-05', task: 'Analysis', role: 'DEV', owner: 'Ann Lee', hours: 10 }] }];
  return {
    projects: new Map(projects.map(p => [p.id, p])),
    actuals: groupActualsByProject(projects, sheets),
    resources: [], aliases: [],
  };
}
const req = (over = {}) => ({
  view: 'owner', projectIds: ['p1', 'p2'], teams: [], pulse: false,
  from: isoDate('2099-01-01'), to: isoDate('2099-03-31'), asOf: isoDate('2099-01-10'), ...over,
});

test('computePlanningModel: owner view returns ownerMap and ownerStatus', () => {
  const out = computePlanningModel(fixture(), null, req());
  assert.equal(out.view, 'owner');
  assert.ok(out.ownerMap['Ann Lee']);
  assert.equal(out.ownerStatus['Ann Lee'], 'active');
});

test('computePlanningModel: unknown and not-visible ids are ignored silently', () => {
  const out = computePlanningModel(fixture(), new Set(['p1']), req({ projectIds: ['p1', 'p2', 'nope'] }));
  assert.deepEqual(Object.keys(out.ownerMap['Ann Lee'].projects), ['p1']);
});

test('computePlanningModel: omitting a project removes exactly its hours from the load', () => {
  const both = computePlanningModel(fixture(), null, req());
  const only = computePlanningModel(fixture(), null, req({ projectIds: ['p2'] }));
  assert.ok(both.ownerMap['Ann Lee']);
  assert.equal(only.ownerMap['Ann Lee'], undefined);
});
