const test = require('node:test');
const assert = require('node:assert/strict');
const { roleChangeError } = require('./role-transition');

test('roleChangeError: admin actor promoting a user to admin is allowed (unchanged existing behavior)', () => {
  assert.equal(roleChangeError('admin', 'user', 'admin'), null);
});

test('roleChangeError: admin actor demoting an admin to user is allowed (unchanged existing behavior)', () => {
  assert.equal(roleChangeError('admin', 'admin', 'user'), null);
});

test('roleChangeError: admin actor cannot promote an admin to sysadmin', () => {
  assert.equal(
    roleChangeError('admin', 'admin', 'sysadmin'),
    'Only a sysadmin can grant or revoke sysadmin'
  );
});

test('roleChangeError: admin actor cannot change a sysadmin row at all (e.g. demote to admin)', () => {
  assert.equal(
    roleChangeError('admin', 'sysadmin', 'admin'),
    'Only a sysadmin can grant or revoke sysadmin'
  );
});

test('roleChangeError: sysadmin actor can promote an admin to sysadmin', () => {
  assert.equal(roleChangeError('sysadmin', 'admin', 'sysadmin'), null);
});

test('roleChangeError: sysadmin actor can demote a sysadmin back to admin', () => {
  assert.equal(roleChangeError('sysadmin', 'sysadmin', 'admin'), null);
});

test('roleChangeError: even a sysadmin actor cannot jump a user directly to sysadmin (two-step rule)', () => {
  assert.equal(
    roleChangeError('sysadmin', 'user', 'sysadmin'),
    'Only an admin can be promoted to sysadmin'
  );
});

test('roleChangeError: sysadmin actor can still perform ordinary user<->admin changes', () => {
  assert.equal(roleChangeError('sysadmin', 'user', 'admin'), null);
  assert.equal(roleChangeError('sysadmin', 'admin', 'user'), null);
});

test('roleChangeError: even a sysadmin actor cannot demote a sysadmin straight to user (symmetric two-step rule)', () => {
  assert.equal(
    roleChangeError('sysadmin', 'sysadmin', 'user'),
    'A sysadmin must first be demoted to admin before becoming a plain user'
  );
});
