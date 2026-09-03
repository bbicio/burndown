const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveFee } = require('./rate-resolve');

test('resolveFee: exact task+role match returns that resource\'s hourlyRate', () => {
  const tasks = [
    { name: 'Design', resources: [{ role: 'Designer', hourlyRate: 50 }, { role: 'PM', hourlyRate: 80 }] },
  ];
  assert.equal(resolveFee(tasks, 'Design', 'PM'), 80);
});

test('resolveFee: task name match is case-insensitive', () => {
  const tasks = [{ name: 'Design', resources: [{ role: 'Designer', hourlyRate: 50 }] }];
  assert.equal(resolveFee(tasks, 'DESIGN', 'Designer'), 50);
});

test('resolveFee: role match is case-insensitive', () => {
  const tasks = [{ name: 'Design', resources: [{ role: 'Designer', hourlyRate: 50 }] }];
  assert.equal(resolveFee(tasks, 'Design', 'designer'), 50);
});

test('resolveFee: task matches but role does not — falls back to first resource', () => {
  const tasks = [{ name: 'Design', resources: [{ role: 'Designer', hourlyRate: 50 }, { role: 'PM', hourlyRate: 80 }] }];
  assert.equal(resolveFee(tasks, 'Design', 'QA'), 50);
});

test('resolveFee: no task name match returns 0', () => {
  const tasks = [{ name: 'Design', resources: [{ role: 'Designer', hourlyRate: 50 }] }];
  assert.equal(resolveFee(tasks, 'Development', 'Designer'), 0);
});

test('resolveFee: task matches but has no resources returns 0', () => {
  const tasks = [{ name: 'Design', resources: [] }];
  assert.equal(resolveFee(tasks, 'Design', 'Designer'), 0);
});

test('resolveFee: empty tasks array returns 0', () => {
  assert.equal(resolveFee([], 'Design', 'Designer'), 0);
});

test('resolveFee: null taskName never throws, returns 0', () => {
  const tasks = [{ name: 'Design', resources: [{ role: 'Designer', hourlyRate: 50 }] }];
  assert.equal(resolveFee(tasks, null, 'Designer'), 0);
});

test('resolveFee: null role never throws, falls back to first resource', () => {
  const tasks = [{ name: 'Design', resources: [{ role: 'Designer', hourlyRate: 50 }] }];
  assert.equal(resolveFee(tasks, 'Design', null), 50);
});

test('resolveFee: a matched resource with a falsy hourlyRate returns 0, not undefined', () => {
  const tasks = [{ name: 'Design', resources: [{ role: 'Designer', hourlyRate: 0 }] }];
  assert.equal(resolveFee(tasks, 'Design', 'Designer'), 0);
});
