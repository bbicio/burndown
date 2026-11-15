const test = require('node:test');
const assert = require('node:assert/strict');
const { RESET_TTL_MS, RESET_COOLDOWN_MS, isStr, emailKey, resetIssuedRecently } = require('./auth-tokens');

const NOW = Date.UTC(2026, 10, 15, 12, 0, 0);

test('constants: reset lives 2 hours, cooldown is 2 minutes', () => {
  assert.equal(RESET_TTL_MS, 2 * 60 * 60 * 1000);
  assert.equal(RESET_COOLDOWN_MS, 2 * 60 * 1000);
});

test('isStr accepts only strings', () => {
  assert.equal(isStr(''), true);
  assert.equal(isStr('a'), true);
  for (const v of [{}, [], 1, null, undefined, { length: 99 }]) assert.equal(isStr(v), false);
});

test('emailKey trims and lowercases', () => {
  assert.equal(emailKey('  USER@X.COM '), 'user@x.com');
});

test('resetIssuedRecently: no pending reset is not recent', () => {
  assert.equal(resetIssuedRecently(null, NOW), false);
});

test('resetIssuedRecently: issued 1 minute ago is recent', () => {
  assert.equal(resetIssuedRecently(new Date(NOW + RESET_TTL_MS - 60000), NOW), true);
});

test('resetIssuedRecently: issued exactly 2 minutes ago is not recent', () => {
  assert.equal(resetIssuedRecently(new Date(NOW + RESET_TTL_MS - RESET_COOLDOWN_MS), NOW), false);
});

test('resetIssuedRecently: issued almost 2 hours ago is not recent', () => {
  assert.equal(resetIssuedRecently(new Date(NOW + 1000), NOW), false);
});

test('resetIssuedRecently accepts an ISO string', () => {
  assert.equal(resetIssuedRecently(new Date(NOW + RESET_TTL_MS - 60000).toISOString(), NOW), true);
});
