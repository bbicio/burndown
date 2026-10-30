const test = require('node:test');
const assert = require('node:assert/strict');
const { MONEY_RULE_CODE, amountError, overridesError, ratecardEntryError } = require('./money-rules');

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

test('ratecardEntryError: accepts a null EUR rate with an override, and 0', () => {
  assert.equal(ratecardEntryError({ roleId: 'r', hourlyRate: null, rateOverrides: { USD: 175.5 } }, 'E'), null);
  assert.equal(ratecardEntryError({ roleId: 'r', hourlyRate: 0, rateOverrides: {} }, 'E'), null);
  assert.equal(ratecardEntryError({ roleId: 'r', hourlyRate: 150 }, 'E'), null);
});

test('ratecardEntryError: refuses an entry that expresses nothing', () => {
  assert.equal(ratecardEntryError({ roleId: 'r', hourlyRate: null, rateOverrides: {} }, 'Entry 1'),
    'Entry 1 has neither a rate nor a currency override.');
  assert.notEqual(ratecardEntryError({ roleId: 'r', hourlyRate: null }, 'E'), null);
});

test('ratecardEntryError: refuses a bad EUR rate or override', () => {
  assert.notEqual(ratecardEntryError({ hourlyRate: -1 }, 'E'), null);
  assert.notEqual(ratecardEntryError({ hourlyRate: 1.555 }, 'E'), null);
  assert.notEqual(ratecardEntryError({ hourlyRate: '150' }, 'E'), null);
  assert.notEqual(ratecardEntryError({ hourlyRate: null, rateOverrides: { USD: -1 } }, 'E'), null);
});
