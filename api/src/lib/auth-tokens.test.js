const test = require('node:test');
const assert = require('node:assert/strict');
const { RESET_TTL_MS, RESET_COOLDOWN_MS, isStr, emailKey, resetCooldownBounds } = require('./auth-tokens');

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

test('resetCooldownBounds: a reset issued within the cooldown expires in (edge, ceiling]', () => {
  const { edge, ceiling } = resetCooldownBounds(NOW);
  assert.equal(edge.getTime(), NOW + RESET_TTL_MS - RESET_COOLDOWN_MS);
  assert.ok(ceiling.getTime() > NOW + RESET_TTL_MS, 'a reset a parallel request writes a few ms later still sits below the ceiling');
  assert.equal(ceiling.getTime(), NOW + RESET_TTL_MS + RESET_COOLDOWN_MS);
});

test('resetCooldownBounds: defaults to the current time', () => {
  const before = Date.now();
  const { edge } = resetCooldownBounds();
  const lower = before + RESET_TTL_MS - RESET_COOLDOWN_MS;
  assert.ok(edge.getTime() >= lower && edge.getTime() <= Date.now() + RESET_TTL_MS - RESET_COOLDOWN_MS);
});
