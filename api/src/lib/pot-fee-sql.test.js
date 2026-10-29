const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { referenceVersionsCte, potVersionsCte } = require('./pot-fee-sql');

test('pots.js has no fee expression of its own', () => {
  const src = readFileSync(path.join(__dirname, '../routes/pots.js'), 'utf8');
  assert.doesNotMatch(src, /currency_rate/);
});

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

test('pots.js reads versions only through pot_v', () => {
  const src = readFileSync(path.join(__dirname, '../routes/pots.js'), 'utf8');
  assert.doesNotMatch(src, /FROM cost_grid_versions/);
  assert.doesNotMatch(src, /JOIN cost_grid_versions/);
  assert.doesNotMatch(src, /feeEurSql|feeOriginalSql/);
  assert.match(src, /potVersionsCte\(\)/);
  assert.ok((src.match(/WITH \$\{potVersionsCte\(\)\}/g) || []).length >= 5);
});
