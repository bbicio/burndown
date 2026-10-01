const test = require('node:test');
const assert = require('node:assert/strict');
const { formatMoney } = require('./money-format');

// Same cases as js/lib/money.test.js (a file cannot be shared between browser and Node without a build step).
const EUR = { code: 'EUR', symbol: '€', locale: 'it-IT' };
const USD = { code: 'USD', symbol: '$', locale: 'en-US' };
const JPY = { code: 'JPY', symbol: '¥', locale: 'ja-JP' };

test('money-format: formats with the locale of the currency', () => {
  assert.equal(formatMoney(12345, EUR), '€ 12.345,00');
  assert.equal(formatMoney(12345, USD), '$ 12,345.00');
});

test('money-format: always separates the thousands, even for 4-digit amounts', () => {
  assert.equal(formatMoney(1234.5, EUR), '€ 1.234,50');
  assert.equal(formatMoney(1234.5, USD), '$ 1,234.50');
  assert.equal(formatMoney(1234.5, EUR, { rounded: true }), '€ 1.235');
  assert.equal(formatMoney(999.5, EUR), '€ 999,50');
});

test('money-format: uses the currency fraction digits', () => {
  assert.equal(formatMoney(12345.6, JPY), '¥ 12,346');
});

test('money-format: rounded drops the decimals', () => {
  assert.equal(formatMoney(12345.67, EUR, { rounded: true }), '€ 12.346');
});

test('money-format: a non-finite amount renders as zero', () => {
  assert.equal(formatMoney(NaN, EUR), '€ 0,00');
  assert.equal(formatMoney(undefined, EUR), '€ 0,00');
  assert.equal(formatMoney('abc', USD), '$ 0.00');
});

test('money-format: falls back without throwing when currency info is missing', () => {
  assert.equal(formatMoney(10, { code: 'EUR' }), '€ 10,00');
  assert.equal(formatMoney(5, { code: 'XYZ' }), 'XYZ 5,00');
  assert.equal(formatMoney(5), '€ 5,00');
  assert.equal(formatMoney(5, { code: '€' }), '€ 5,00');
});
