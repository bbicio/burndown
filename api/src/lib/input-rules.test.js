const test = require('node:test');
const assert = require('node:assert/strict');
const { isUuid, decimalRangeError, SPECIAL_POT_LABELS, specialLabelError, structureBodyError, taskListError } = require('./input-rules');

test('isUuid', () => {
  const u = '123e4567-e89b-12d3-a456-426614174000';
  assert.equal(isUuid(u), true);
  assert.equal(isUuid(u.toUpperCase()), true);
  for (const v of ['123e4567-e89b-12d3-a456-42661417400', '__unassigned__', '', null, 123]) {
    assert.equal(isUuid(v), false);
  }
});

test('decimalRangeError', () => {
  const o = { min: 0.000001, max: 9999.999999, label: 'Rate' };
  for (const v of [0.000001, 1.3, 9999.999999]) assert.equal(decimalRangeError(v, o), null);
  for (const v of [0.0000001, 16500, NaN, Infinity, '1.2', null]) {
    assert.equal(decimalRangeError(v, o), 'Rate must be between 0.000001 and 9999.999999');
  }
});

test('special labels', () => {
  assert.deepEqual(SPECIAL_POT_LABELS, ['Unassigned / To be Identified', 'New Biz']);
  for (const v of SPECIAL_POT_LABELS) assert.equal(specialLabelError(v), null);
  for (const v of ['New Biz ', 'new biz', 'Other', 42]) {
    assert.equal(specialLabelError(v), 'specialLabel must be one of: Unassigned / To be Identified, New Biz');
  }
});

test('structureBodyError', () => {
  for (const b of [{}, { phases: [] }, { phases: [{ tasks: [{ roles: [{}], hours: { A: 1 } }] }, { }], roles: [{ roleCode: 'X' }] }]) {
    assert.equal(structureBodyError(b), null);
  }
  for (const b of [{ phases: 'abc' }, { phases: {} }, { phases: null }, { phases: [null] }, { phases: [{ tasks: 'x' }] },
    { phases: [{ tasks: [null] }] }, { phases: [{ tasks: [{ roles: {} }] }] }, { phases: [{ tasks: [{ roles: [null] }] }] },
    { phases: [{ tasks: [{ hours: [1] }] }] }, { roles: [null] }, { roles: 'x' }, null, []]) {
    assert.equal(typeof structureBodyError(b), 'string', JSON.stringify(b));
  }
});

test('taskListError', () => {
  assert.equal(taskListError([]), null);
  assert.equal(taskListError([{ name: 'T', resources: [{}] }, { name: 'U' }]), null);
  for (const t of [{}, 'x', [null], [{ name: 'T', resources: {} }], [{ resources: [null] }], [[]]]) {
    assert.equal(typeof taskListError(t), 'string', JSON.stringify(t));
  }
});
