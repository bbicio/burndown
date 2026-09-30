const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePlanningRequest } = require('./planning-request');

const good = () => ({ view: 'role', projectIds: ['a', 'b', 'a'], teams: ['T'], from: '2026-09-01', to: '2026-12-31', asOf: '2026-09-15', pulse: true });

test('a valid request is normalised: dates parsed, ids de-duplicated in order', () => {
  const r = parsePlanningRequest(good());
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.projectIds, ['a', 'b']);
  assert.equal(r.value.from.toISOString().slice(0, 10), '2026-09-01');
  assert.equal(r.value.pulse, true);
  assert.deepEqual(r.value.teams, ['T']);
});

test('teams defaults to [], empty projectIds is valid', () => {
  const b = good(); delete b.teams; b.projectIds = [];
  const r = parsePlanningRequest(b);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.teams, []);
});

test('errors are reported per field', () => {
  const r = parsePlanningRequest({ view: 'x', projectIds: 'no', teams: [1], from: 'bad', to: '2026-01-01', asOf: '', pulse: 'yes' });
  assert.equal(r.ok, false);
  for (const f of ['view', 'projectIds', 'teams', 'from', 'asOf', 'pulse']) assert.ok(r.errors[f], `missing error for ${f}`);
});

test('from after to, and an over-long window, are rejected', () => {
  assert.ok(parsePlanningRequest({ ...good(), from: '2026-12-31', to: '2026-01-01' }).errors.to);
  assert.ok(parsePlanningRequest({ ...good(), from: '2000-01-01', to: '2026-01-01' }).errors.to);
});

test('size limits and non-object bodies', () => {
  assert.ok(parsePlanningRequest({ ...good(), projectIds: Array(2001).fill('x') }).errors.projectIds);
  assert.ok(parsePlanningRequest({ ...good(), projectIds: ['x'.repeat(65)] }).errors.projectIds);
  assert.equal(parsePlanningRequest(null).ok, false);
  assert.equal(parsePlanningRequest('nope').ok, false);
});
