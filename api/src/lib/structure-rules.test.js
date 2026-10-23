const test = require('node:test');
const assert = require('node:assert/strict');
const { missingLinkedTasks, STRUCTURE_RULE_CODE } = require('./structure-rules');

const T1 = { id: '11111111-1111-4111-8111-111111111111', title: 'T1' };
const T2 = { id: '22222222-2222-4222-8222-222222222222', title: 'T2' };

test('STRUCTURE_RULE_CODE is the code carried by the 400', () => {
  assert.equal(STRUCTURE_RULE_CODE, 'STRUCTURE_RULE');
});

test('missingLinkedTasks: no link → nothing is missing', () => {
  assert.deepEqual(missingLinkedTasks({ linkedTaskIds: [], currentTasks: [T1, T2], payloadTaskIds: [] }), []);
});

test('missingLinkedTasks: a linked task that is still in the payload → []', () => {
  assert.deepEqual(missingLinkedTasks({ linkedTaskIds: [T1.id], currentTasks: [T1, T2], payloadTaskIds: [T1.id] }), []);
});

test('missingLinkedTasks: a linked task absent from the payload is reported with its title', () => {
  assert.deepEqual(missingLinkedTasks({ linkedTaskIds: [T1.id], currentTasks: [T1, T2], payloadTaskIds: [T2.id] }), [T1]);
});

test('missingLinkedTasks: an orphan link (no such task in the version) is ignored', () => {
  const orphan = '00000000-0000-4000-8000-000000000000';
  assert.deepEqual(missingLinkedTasks({ linkedTaskIds: [orphan], currentTasks: [T1], payloadTaskIds: [] }), []);
});

test('missingLinkedTasks: ids compare without regard to letter case', () => {
  assert.deepEqual(
    missingLinkedTasks({ linkedTaskIds: [T1.id.toUpperCase()], currentTasks: [T1], payloadTaskIds: [T1.id] }), []);
  assert.deepEqual(
    missingLinkedTasks({ linkedTaskIds: [T1.id], currentTasks: [T1], payloadTaskIds: [T2.id.toUpperCase()] }), [T1]);
});
