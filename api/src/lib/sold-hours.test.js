const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidSoldHours } = require('./sold-hours');

test('accepts a whole number', () => {
  assert.equal(isValidSoldHours(5), true);
});

test('accepts a .25 fraction', () => {
  assert.equal(isValidSoldHours(2.25), true);
});

test('accepts a .5 fraction', () => {
  assert.equal(isValidSoldHours(3.5), true);
});

test('accepts a .75 fraction', () => {
  assert.equal(isValidSoldHours(1.75), true);
});

test('accepts zero', () => {
  assert.equal(isValidSoldHours(0), true);
});

test('rejects a .4 fraction (not in the allowed set)', () => {
  assert.equal(isValidSoldHours(2.4), false);
});

test('rejects a .6 fraction (not in the allowed set)', () => {
  assert.equal(isValidSoldHours(2.6), false);
});

test('rejects a negative value', () => {
  assert.equal(isValidSoldHours(-2.25), false);
});

test('rejects a non-finite value', () => {
  assert.equal(isValidSoldHours(NaN), false);
  assert.equal(isValidSoldHours(Infinity), false);
});
