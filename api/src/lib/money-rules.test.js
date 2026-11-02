const test = require('node:test');
const assert = require('node:assert/strict');
const { MONEY_RULE_CODE, MAX_DECIMAL_10_2, MAX_NUMERIC_14_2, amountError, overridesError, ratecardEntryError,
  ptcRowsError, phasingError } = require('./money-rules');
const M = { max: MAX_DECIMAL_10_2 };

test('money-rules: the refusal code', () => {
  assert.equal(MONEY_RULE_CODE, 'MONEY_RULE');
});

test('amountError: accepts numbers ≥ 0 within the currency decimals', () => {
  assert.equal(amountError(0, 'EUR', 'L', M), null);
  assert.equal(amountError(150, 'EUR', 'L', M), null);
  assert.equal(amountError(175.5, 'EUR', 'L', M), null);
  assert.equal(amountError(175.55, 'EUR', 'L', M), null);
  assert.equal(amountError(1500, 'JPY', 'L', M), null);
  assert.equal(amountError(175.55, 'XX1', 'L', M), null);
});

test('amountError: refuses with the one message', () => {
  assert.equal(amountError(175.555, 'EUR', 'Rate for role "PM"', M),
    'Rate for role "PM" must be a number ≥ 0 with at most 2 decimal(s) for EUR.');
  assert.equal(amountError(1.5, 'JPY', 'X', M), 'X must be a number ≥ 0 with at most 0 decimal(s) for JPY.');
});

test('amountError: refuses non-numbers and negatives', () => {
  for (const v of [-1, NaN, Infinity, '150', null, undefined]) {
    assert.notEqual(amountError(v, 'EUR', 'L', M), null, String(v));
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

test('ratecardEntryError: an EUR key in rateOverrides is not a currency override', () => {
  assert.equal(ratecardEntryError({ roleId: 'r', hourlyRate: null, rateOverrides: { EUR: 100 } }, 'Entry 1'),
    'Entry 1 has neither a rate nor a currency override.');
  assert.equal(ratecardEntryError({ roleId: 'r', hourlyRate: null, rateOverrides: { EUR: 100, USD: 1 } }, 'E'), null);
});

test('amountError: column bound', () => {
  assert.equal(amountError(99999999.99, 'EUR', 'L', { max: MAX_DECIMAL_10_2 }), null);
  assert.equal(amountError(100000000, 'EUR', 'L', { max: MAX_DECIMAL_10_2 }), 'L must not exceed 99999999.99 EUR.');
  assert.equal(amountError(999999999999.99, 'EUR', 'L', { max: MAX_NUMERIC_14_2 }), null);
  assert.notEqual(amountError(1e12, 'EUR', 'L', { max: MAX_NUMERIC_14_2 }), null);
});

test('amountError: max is required', () => {
  assert.throws(() => amountError(1, 'EUR', 'L'), /max is required/);
});

test('overridesError: bound', () => {
  assert.notEqual(overridesError({ USD: 1e8 }, 'L'), null);
});

test('ptcRowsError', () => {
  assert.equal(ptcRowsError([], 'EUR'), null);
  assert.equal(ptcRowsError([{ amount: 100, month: '202601', title: 'T', note: '' }], 'EUR'), null);
  assert.equal(ptcRowsError({}, 'EUR'), 'PTC must be an array.');
  assert.equal(ptcRowsError([5], 'EUR'), 'PTC row 1 must be an object.');
  for (const rows of [[{ amount: -1 }], [{ amount: '100' }], [{ amount: 1.234 }], [{}]]) {
    assert.notEqual(ptcRowsError(rows, 'EUR'), null);
  }
  assert.notEqual(ptcRowsError([{ amount: 1.5 }], 'JPY'), null);
});

test('phasingError', () => {
  assert.equal(phasingError({}, 'EUR'), null);
  assert.equal(phasingError({ '202601': 1120.3 }, 'EUR'), null);
  for (const v of [null, [], 'x']) assert.equal(phasingError(v, 'EUR'), 'Phasing must be an object.');
  for (const v of [{ '202601': 1120.304347826087 }, { '202601': -1 }, { '202601': '5' }, { '202601': 1e8 }]) {
    assert.notEqual(phasingError(v, 'EUR'), null);
  }
});
