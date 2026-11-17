const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MIN_LENGTH, MAX_LENGTH, MAX_BYTES, MIN_DISTINCT, CONTEXT_MIN, contextTokens, passwordError,
} = require('./password-policy');

const BASE = 'k7#wq9vz!m2p';
const EMOJI = ['😀', '😁', '😂', '🤣'];
const emojis = n => Array.from({ length: n }, (_, i) => EMOJI[i % EMOJI.length]).join('');
const msg = (pw, ctx, opts) => passwordError(pw, ctx, opts)?.message ?? null;
const ROSSI = { email: 'Mario.Rossi+x@acme.it', firstName: 'Ugo', lastName: 'Rossi' };

const rejected = [];
function rejects(pw, expected, ctx, opts) {
  assert.equal(msg(pw, ctx, opts), expected);
  rejected.push([pw, ctx, opts]);
}

test('constants', () => {
  assert.deepEqual([MIN_LENGTH, MAX_LENGTH, MAX_BYTES, MIN_DISTINCT, CONTEXT_MIN], [12, 64, 72, 4, 4]);
});

test('rejects 11 code points, accepts 12', () => {
  rejects(BASE.slice(0, 11), 'Use at least 12 characters.');
  assert.equal(passwordError(BASE), null);
});

test('accepts 64, rejects 65', () => {
  const long = BASE.repeat(6);
  assert.equal(passwordError(long.slice(0, 64)), null);
  rejects(long.slice(0, 65), 'Use at most 64 characters.');
});

test('rejects over 72 bytes', () => {
  assert.equal(passwordError(emojis(18)), null);
  rejects(emojis(19), 'This password is too long.');
});

test('counts code points, not UTF-16 units', () => {
  rejects(emojis(11), 'Use at least 12 characters.');
});

test('rejects 3 distinct, accepts 4', () => {
  rejects('abcabcabcabc', 'Avoid repeating the same few characters.');
  assert.equal(passwordError('abcdabcdabcd'), null);
});

test('context tokens', () => {
  assert.deepEqual(contextTokens(ROSSI), ['mario.rossi+x', 'mario', 'rossi', 'pdash']);
  rejects('Rossi-2026-ottobre', "Don't use your name or email in your password.", ROSSI);
  assert.equal(passwordError('Ugo-2026-ottobre!', ROSSI), null);
  rejects('my-PDash-vault-key', "Don't use your name or email in your password.", ROSSI);
});

test('missing context never throws', () => {
  assert.deepEqual(contextTokens({ email: null, firstName: undefined, lastName: '' }), ['pdash']);
  assert.deepEqual(contextTokens(), ['pdash']);
  assert.equal(passwordError('k7#wq9vz!m2pq'), null);
});

test('common list, case-insensitive', () => {
  rejects('QwertyUIOP123', 'This password is too common. Choose a different one.', {},
    { common: new Set(['qwertyuiop123']) });
});

test('non-string', () => {
  rejects(12345678901234, 'Password is required.');
  rejects({}, 'Password is required.');
});

test('no message contains the password', () => {
  assert.ok(rejected.length > 0);
  for (const [pw, ctx, opts] of rejected) {
    const m = msg(pw, ctx, opts);
    assert.ok(m);
    if (typeof pw === 'string') assert.ok(!m.includes(pw), m);
  }
});
