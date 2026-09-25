const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeName, buildMatchContext, matchOwner, aggregateUnmatched } = require('./match-resource');

const R = (id, first, last, status = 'active') => ({ id, first_name: first, last_name: last, status });

test('normalizeName: order-insensitive, case-insensitive', () => {
  assert.equal(normalizeName('Mario Rossi'), normalizeName('ROSSI mario'));
  assert.equal(normalizeName('Mario Rossi'), 'mario rossi');
});

test('normalizeName: strips accents, punctuation and extra spaces', () => {
  assert.equal(normalizeName('  José   Álvarez '), 'alvarez jose');
  assert.equal(normalizeName('Rossi, Mario.'), 'mario rossi');
});

test('normalizeName: compound names keep all tokens', () => {
  assert.equal(normalizeName('Maria Rosa Bianchi'), 'bianchi maria rosa');
});

test('normalizeName: empty-ish input gives an empty string', () => {
  assert.equal(normalizeName(null), '');
  assert.equal(normalizeName(undefined), '');
  assert.equal(normalizeName('   '), '');
  assert.equal(normalizeName('.,-'), '');
});

test('matchOwner: inverted name matches an active resource', () => {
  const ctx = buildMatchContext([R('r1', 'Mario', 'Rossi')], []);
  assert.deepEqual(matchOwner('ROSSI mario', ctx), { kind: 'matched', resourceId: 'r1' });
});

test('matchOwner: empty owner is kind empty', () => {
  const ctx = buildMatchContext([R('r1', 'Mario', 'Rossi')], []);
  assert.deepEqual(matchOwner('', ctx), { kind: 'empty' });
  assert.deepEqual(matchOwner(null, ctx), { kind: 'empty' });
});

test('matchOwner: unknown name is unmatched with no candidates', () => {
  const ctx = buildMatchContext([R('r1', 'Mario', 'Rossi')], []);
  assert.deepEqual(matchOwner('Luca Verdi', ctx), { kind: 'unmatched', candidates: [] });
});

test('matchOwner: two active resources with the same normalized name are ambiguous, never matched', () => {
  const ctx = buildMatchContext([R('r1', 'Mario', 'Rossi'), R('r2', 'Rossi', 'Mario')], []);
  assert.deepEqual(matchOwner('Mario Rossi', ctx), { kind: 'ambiguous', candidates: ['r1', 'r2'] });
});

test('matchOwner: inactive resource is excluded from automatic matching', () => {
  const ctx = buildMatchContext([R('r1', 'Mario', 'Rossi', 'inactive')], []);
  assert.deepEqual(matchOwner('Mario Rossi', ctx), { kind: 'unmatched', candidates: [] });
});

test('matchOwner: an inactive resource plus an active namesake is not ambiguous', () => {
  const ctx = buildMatchContext([R('r1', 'Mario', 'Rossi', 'inactive'), R('r2', 'Mario', 'Rossi')], []);
  assert.deepEqual(matchOwner('Mario Rossi', ctx), { kind: 'matched', resourceId: 'r2' });
});

test('matchOwner: an explicit alias beats the name match', () => {
  const ctx = buildMatchContext(
    [R('r1', 'Mario', 'Rossi'), R('r2', 'Luca', 'Verdi')],
    [{ alias_normalized: 'mario rossi', resource_id: 'r2' }]
  );
  assert.deepEqual(matchOwner('Mario Rossi', ctx), { kind: 'alias', resourceId: 'r2' });
});

test('matchOwner: an alias to an inactive resource still resolves', () => {
  const ctx = buildMatchContext(
    [R('r1', 'Old', 'Timer', 'inactive')],
    [{ alias_normalized: 'mt', resource_id: 'r1' }]
  );
  assert.deepEqual(matchOwner('MT', ctx), { kind: 'alias', resourceId: 'r1' });
});

test('matchOwner: an alias with a null resource means ignored', () => {
  const ctx = buildMatchContext([], [{ alias_normalized: 'tbd', resource_id: null }]);
  assert.deepEqual(matchOwner('TBD', ctx), { kind: 'ignored' });
});

test('aggregateUnmatched: sums hours per project+name, skips matched/ignored/empty owners', () => {
  const ctx = buildMatchContext(
    [R('r1', 'Mario', 'Rossi')],
    [{ alias_normalized: 'tbd', resource_id: null }]
  );
  const out = aggregateUnmatched({
    P1: [
      { owner: 'Luca Verdi', hours: 4 },
      { owner: 'verdi luca', hours: '2.5' },
      { owner: 'Mario Rossi', hours: 8 },
      { owner: 'TBD', hours: 3 },
      { owner: '', hours: 9 },
      { owner: null, hours: 9 },
    ],
    P2: [{ owner: 'Luca Verdi', hours: 1 }],
  }, ctx);
  assert.deepEqual(out, [
    { projectCode: 'P1', nameNormalized: 'luca verdi', displayName: 'Luca Verdi', hours: 6.5, candidateResourceIds: [] },
    { projectCode: 'P2', nameNormalized: 'luca verdi', displayName: 'Luca Verdi', hours: 1, candidateResourceIds: [] },
  ]);
});

test('aggregateUnmatched: ambiguous names carry their candidates; bad hours count as 0', () => {
  const ctx = buildMatchContext([R('r1', 'Mario', 'Rossi'), R('r2', 'Rossi', 'Mario')], []);
  const out = aggregateUnmatched({ P1: [{ owner: 'Mario Rossi', hours: 'abc' }] }, ctx);
  assert.deepEqual(out, [
    { projectCode: 'P1', nameNormalized: 'mario rossi', displayName: 'Mario Rossi', hours: 0, candidateResourceIds: ['r1', 'r2'] },
  ]);
});
