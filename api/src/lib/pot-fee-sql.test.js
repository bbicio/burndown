const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { feeEurSql, feeOriginalSql } = require('./pot-fee-sql');

test('feeEurSql divides by the rate of the given version, a zero rate counting as 1', () => {
  const sql = feeEurSql('cgv');
  assert.match(sql, /NULLIF\(cgv\.currency_rate, 0\)/);
  assert.match(sql, /cgv\.id\b/);
  assert.match(sql, /cgv\.ratecard_id\b/);
});

test('feeOriginalSql is the same fee without the rate', () => {
  const sql = feeOriginalSql('cgv');
  assert.doesNotMatch(sql, /currency_rate/);
  assert.match(sql, /cgv\.id\b/);
});

test('neither expression uses an alias the routes already use', () => {
  for (const sql of [feeEurSql('cgv'), feeOriginalSql('cgv')]) {
    assert.doesNotMatch(sql, /\b(ph|tk|tr|ro|re|ph2|tk2)\./);
  }
});

test('pots.js has no fee expression of its own', () => {
  const src = readFileSync(path.join(__dirname, '../routes/pots.js'), 'utf8');
  assert.doesNotMatch(src, /currency_rate/);
});
