const test = require('node:test');
const assert = require('node:assert/strict');
const { slugify } = require('./slugify');

test('slugify: simple single word lowercases', () => {
  assert.equal(slugify('Market'), 'market');
});

test('slugify: multi-word name becomes hyphen-separated', () => {
  assert.equal(slugify('Therapeutic Area'), 'therapeutic-area');
});

test('slugify: leading/trailing whitespace is trimmed', () => {
  assert.equal(slugify('  Service Type  '), 'service-type');
});

test('slugify: accented characters are normalized to ASCII', () => {
  assert.equal(slugify('Café Brand'), 'cafe-brand');
});

test('slugify: punctuation collapses into single hyphens', () => {
  assert.equal(slugify('R&D / Ops!!'), 'r-d-ops');
});

test('slugify: empty or whitespace-only input returns empty string', () => {
  assert.equal(slugify(''), '');
  assert.equal(slugify('   '), '');
});

test('slugify: null/undefined input returns empty string', () => {
  assert.equal(slugify(null), '');
  assert.equal(slugify(undefined), '');
});
