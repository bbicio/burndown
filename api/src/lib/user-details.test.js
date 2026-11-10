const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeDetails, detailsError, RECTIFICATION_MAX, rectificationError, escapeHtml } = require('./user-details');

test('normalizeDetails: trims names, trims and lower-cases the email', () => {
  assert.deepEqual(normalizeDetails({ firstName: ' Ann ', lastName: ' Lee ', email: ' A@B.Co ' }),
    { firstName: 'Ann', lastName: 'Lee', email: 'a@b.co' });
});

test('normalizeDetails: absent keys do not appear', () => {
  assert.deepEqual(normalizeDetails({ email: ' A@B.Co ' }), { email: 'a@b.co' });
  assert.deepEqual(normalizeDetails({}), {});
});

test('detailsError: names the field of an empty name', () => {
  assert.deepEqual(detailsError({ firstName: '' }), { field: 'firstName', error: 'First name is required' });
  assert.deepEqual(detailsError({ lastName: '' }), { field: 'lastName', error: 'Last name is required' });
});

test('detailsError: refuses a malformed email', () => {
  assert.deepEqual(detailsError({ email: 'x@y' }), { field: 'email', error: 'Invalid email address' });
});

test('detailsError: refuses the anonymized-address pattern (it would lock the account)', () => {
  assert.deepEqual(detailsError({ email: 'anon_x@deleted.local' }), { field: 'email', error: 'This address is reserved' });
  assert.equal(detailsError({ email: 'anon@deleted.local.com' }), null);
});

test('detailsError: refuses an over-long value', () => {
  assert.deepEqual(detailsError({ firstName: 'x'.repeat(256) }), { field: 'firstName', error: 'First name is too long' });
  assert.equal(detailsError({ email: 'x'.repeat(251) + '@b.co' }).error, 'Email is too long');
});

test('detailsError: nothing to update', () => {
  assert.deepEqual(detailsError({}), { field: null, error: 'Nothing to update' });
});

test('detailsError: valid details pass', () => {
  assert.equal(detailsError({ firstName: 'A', email: 'a@b.co' }), null);
});

test('rectificationError: refuses empty, non-string and over-long messages', () => {
  assert.equal(RECTIFICATION_MAX, 2000);
  assert.equal(rectificationError('  '), 'Describe what needs to change');
  assert.equal(rectificationError(null), 'Describe what needs to change');
  assert.equal(rectificationError('x'.repeat(2001)), 'Keep it under 2000 characters');
  assert.equal(rectificationError('x'.repeat(2000)), null);
  assert.equal(rectificationError('  ' + 'x'.repeat(2000) + '  '), null);
});

test('escapeHtml: escapes the five HTML characters', () => {
  assert.equal(escapeHtml('<img onerror="x">&\''), '&lt;img onerror=&quot;x&quot;&gt;&amp;&#39;');
  assert.equal(escapeHtml(null), '');
});
