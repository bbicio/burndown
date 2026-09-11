const test = require('node:test');
const assert = require('node:assert/strict');
const { isAdminRole } = require('./is-admin');

test('isAdminRole: admin is an admin role', () => {
  assert.equal(isAdminRole('admin'), true);
});

test('isAdminRole: sysadmin inherits every admin capability', () => {
  assert.equal(isAdminRole('sysadmin'), true);
});

test('isAdminRole: a plain user is not an admin role', () => {
  assert.equal(isAdminRole('user'), false);
});

test('isAdminRole: missing / unknown roles are not admin roles', () => {
  assert.equal(isAdminRole(undefined), false);
  assert.equal(isAdminRole(null), false);
  assert.equal(isAdminRole(''), false);
  assert.equal(isAdminRole('Admin'), false);
  assert.equal(isAdminRole('superadmin'), false);
});
