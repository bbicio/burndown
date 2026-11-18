const test = require('node:test');
const assert = require('node:assert/strict');
const { higherPermission, RANK_SQL, PERMISSION_RANK } = require('./share-rank');

test('higherPermission keeps owner over viewer', () => {
  assert.equal(higherPermission('owner', 'viewer'), 'owner');
});

test('higherPermission raises viewer to editor', () => {
  assert.equal(higherPermission('viewer', 'editor'), 'editor');
});

test('higherPermission with no current returns next', () => {
  assert.equal(higherPermission(null, 'viewer'), 'viewer');
});

test('RANK_SQL names the three ranks', () => {
  const sql = RANK_SQL('rs.permission');
  assert.ok(sql.includes("'owner' THEN 3"));
  assert.ok(sql.includes("'editor' THEN 2"));
  assert.ok(sql.includes("'viewer' THEN 1"));
  assert.ok(sql.includes('rs.permission'));
});

test('PERMISSION_RANK orders owner > editor > viewer', () => {
  assert.ok(PERMISSION_RANK.owner > PERMISSION_RANK.editor && PERMISSION_RANK.editor > PERMISSION_RANK.viewer);
});
