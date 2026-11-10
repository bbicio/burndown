const test = require('node:test');
const assert = require('node:assert/strict');
const { sessionClaims, sessionError } = require('./session');

const active = { status: 'active', role: 'user' };

test('sessionClaims carries password_changed_at in whole milliseconds', () => {
  assert.deepEqual(
    sessionClaims({ id: 'u', email: 'e', role: 'user', password_changed_at: new Date(1731000000123), first_name: 'x' }),
    { id: 'u', email: 'e', role: 'user', pwd: 1731000000123 });
});

test('sessionClaims carries null when password_changed_at is NULL', () => {
  assert.deepEqual(sessionClaims({ id: 'u', email: 'e', role: 'user', password_changed_at: null }),
    { id: 'u', email: 'e', role: 'user', pwd: null });
});

test('sessionError accepts a numeric claim equal to the bigint string pg returns', () => {
  assert.equal(sessionError({ pwd: 1731000000123 }, { ...active, pwd: '1731000000123' }), null);
});

test('sessionError accepts a null claim against a NULL column', () => {
  assert.equal(sessionError({ pwd: null }, { status: 'active', pwd: null }), null);
});

test('sessionError refuses a missing row', () => {
  assert.equal(sessionError({ pwd: null }, undefined), 'Session expired');
});

test('sessionError refuses an account that is not active', () => {
  assert.equal(sessionError({ pwd: null }, { status: 'disabled', role: 'user', pwd: null }), 'Session expired');
});

test('sessionError refuses a token without the pwd claim', () => {
  assert.equal(sessionError({ id: 'u' }, { ...active, pwd: null }), 'Session expired');
});

test('sessionError refuses a different pwd', () => {
  assert.equal(sessionError({ pwd: 1731000000123 }, { ...active, pwd: '1731000000124' }), 'Session expired');
});

test('sessionError refuses a null claim against a set column', () => {
  assert.equal(sessionError({ pwd: null }, { ...active, pwd: '1731000000123' }), 'Session expired');
});

test('sessionError refuses a numeric claim against a NULL column', () => {
  assert.equal(sessionError({ pwd: 1731000000123 }, { ...active, pwd: null }), 'Session expired');
});
