const { test } = require('node:test');
const assert = require('node:assert/strict');
const { versionRate, CURRENCY_RULE_CODE } = require('./version-rate');

test('EUR is 1 whatever the row', () => {
  assert.deepEqual(versionRate('EUR', null), { rate: 1 });
  assert.deepEqual(versionRate('EUR', { active: false, current_rate: 3 }), { rate: 1 });
  assert.deepEqual(versionRate('EUR', { active: true, current_rate: '1.000000' }), { rate: 1 });
});

test('an active currency takes its current rate', () => {
  assert.deepEqual(versionRate('USD', { active: true, current_rate: '1.300000' }), { rate: 1.3 });
});

test('an inactive currency is refused', () => {
  assert.deepEqual(versionRate('CHF', { active: false, current_rate: '0.8' }), { error: 'Currency CHF is not active' });
});

test('an unknown currency is refused', () => {
  assert.deepEqual(versionRate('XXX', null), { error: 'Currency XXX is not active' });
});

test('CURRENCY_RULE_CODE is CURRENCY_RULE', () => {
  assert.equal(CURRENCY_RULE_CODE, 'CURRENCY_RULE');
});

test('the version routes never write a rate taken from the body', () => {
  const { readFileSync } = require('node:fs');
  const path = require('node:path');
  const src = readFileSync(path.join(__dirname, '../routes/cost-grids.js'), 'utf8');
  assert.doesNotMatch(src, /parseFloat\(currencyRate\)/);
  assert.match(src, /versionRate\(/);
  const start = src.indexOf("'/:id/versions/:vId/refresh-rate'");
  const block = src.slice(start, src.indexOf('router.', start));
  assert.match(block, /UPDATE cost_grid_versions SET currency_rate = \$1/);
});

test('refresh-rate decides the rate through versionRate', () => {
  const { readFileSync } = require('node:fs');
  const path = require('node:path');
  const src = readFileSync(path.join(__dirname, '../routes/cost-grids.js'), 'utf8');
  const start = src.indexOf("'/:id/versions/:vId/refresh-rate'");
  const block = src.slice(start, src.indexOf('router.', start));
  assert.match(block, /versionRate\(/);
  assert.match(block, /CURRENCY_RULE_CODE/);
  assert.doesNotMatch(block, /Currency not active/);
});
