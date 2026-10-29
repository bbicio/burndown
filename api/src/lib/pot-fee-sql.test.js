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

const { referenceVersionsCte, potVersionsCte } = require('./pot-fee-sql');

test('referenceVersionsCte picks one non-Draft version per proposal', () => {
  const sql = referenceVersionsCte();
  assert.match(sql, /^ref_v AS \(/);
  assert.match(sql, /DISTINCT ON \(rv\.cost_grid_id\)/);
  assert.match(sql, /rv\.pipeline <> 'Draft'/);
  assert.match(sql, /rv\.created_at DESC/);
});

test('has projects counts both links', () => {
  const sql = referenceVersionsCte();
  assert.match(sql, /cg_version_projects rv_c WHERE rv_c\.cost_grid_version_id = rv\.id/);
  assert.match(sql, /projects rv_p WHERE rv_p\.cg_version_id = rv\.id/);
  assert.ok(sql.indexOf('rv_p.cg_version_id') < sql.indexOf('rv.created_at DESC'));
});

test('potVersionsCte computes the fee once', () => {
  const sql = potVersionsCte();
  assert.equal((sql.match(/SUM\(pf_tr\.days/g) || []).length, 1);
  assert.match(sql, /NULLIF\(ref_v\.currency_rate, 0\)/);
  assert.match(sql, /AS fee_original/);
  assert.match(sql, /AS fee_eur/);
});

test('no internal alias collides with the routes\' aliases', () => {
  for (const sql of [referenceVersionsCte(), potVersionsCte()]) {
    assert.doesNotMatch(sql, /\b(cgv|cgv2|cg|ph|tk|tr|ro|re)\./);
  }
});
