const test = require('node:test');
const assert = require('node:assert/strict');
const { MONEY_RULE_CODE, amountError, overridesError } = require('./money-rules');

test('money-rules: the refusal code', () => {
  assert.equal(MONEY_RULE_CODE, 'MONEY_RULE');
});

test('amountError: accepts numbers ≥ 0 within the currency decimals', () => {
  assert.equal(amountError(0, 'EUR', 'L'), null);
  assert.equal(amountError(150, 'EUR', 'L'), null);
  assert.equal(amountError(175.5, 'EUR', 'L'), null);
  assert.equal(amountError(175.55, 'EUR', 'L'), null);
  assert.equal(amountError(1500, 'JPY', 'L'), null);
  assert.equal(amountError(175.55, 'XX1', 'L'), null);
});

test('amountError: refuses with the one message', () => {
  assert.equal(amountError(175.555, 'EUR', 'Rate for role "PM"'),
    'Rate for role "PM" must be a number ≥ 0 with at most 2 decimal(s) for EUR.');
  assert.equal(amountError(1.5, 'JPY', 'X'), 'X must be a number ≥ 0 with at most 0 decimal(s) for JPY.');
});

test('amountError: refuses non-numbers and negatives', () => {
  for (const v of [-1, NaN, Infinity, '150', null, undefined]) {
    assert.notEqual(amountError(v, 'EUR', 'L'), null, String(v));
  }
});

test('overridesError: accepts empty and valid overrides', () => {
  for (const v of [undefined, null, {}, { USD: 9999 }, { USD: 175.5, JPY: 1500 }]) {
    assert.equal(overridesError(v, 'L'), null);
  }
});

test('overridesError: names the key of the first bad value', () => {
  assert.equal(overridesError({ USD: -1 }, 'Rate overrides of role "PM"'),
    'Rate overrides of role "PM" (USD) must be a number ≥ 0 with at most 2 decimal(s) for USD.');
  assert.notEqual(overridesError({ JPY: 1.5 }, 'L'), null);
});

test('overridesError: refuses arrays and non-objects', () => {
  assert.equal(overridesError([], 'L'), 'L must be an object.');
  assert.equal(overridesError('x', 'L'), 'L must be an object.');
  assert.equal(overridesError(5, 'L'), 'L must be an object.');
});
