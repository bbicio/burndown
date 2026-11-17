import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import {
  MIN_LENGTH, MAX_LENGTH, MAX_BYTES, MIN_DISTINCT, CONTEXT_MIN, contextTokens, passwordError, passwordStrength,
  STRENGTH_LABELS, PASSWORD_HINT, PASSWORD_PLACEHOLDER,
} from './password-policy.js';

const server = createRequire(import.meta.url)('../../api/src/lib/password-policy.js');

const BASE = 'k7#wq9vz!m2p';
const of = n => BASE.repeat(6).slice(0, n);
const EMOJI = ['😀', '😁', '😂', '🤣'];
const emojis = n => Array.from({ length: n }, (_, i) => EMOJI[i % EMOJI.length]).join('');
const ROSSI = { email: 'Mario.Rossi+x@acme.it', firstName: 'Ugo', lastName: 'Rossi' };

const CASES = [
  [of(11)], [of(12)], [of(64)], [of(65)],
  [emojis(11)], [emojis(18)], [emojis(19)],
  ['abcabcabcabc'], ['abcdabcdabcd'],
  ['Rossi-2026-ottobre', ROSSI], ['Ugo-2026-ottobre!', ROSSI], ['my-PDash-vault-key', ROSSI],
  ['k7#wq9vz!m2pq', { email: null, firstName: undefined, lastName: '' }],
  [12345678901234], [{}], [null],
];

describe('parity with api/src/lib/password-policy.js', () => {
  it('has the same constants', () => {
    expect([MIN_LENGTH, MAX_LENGTH, MAX_BYTES, MIN_DISTINCT, CONTEXT_MIN])
      .toEqual([server.MIN_LENGTH, server.MAX_LENGTH, server.MAX_BYTES, server.MIN_DISTINCT, server.CONTEXT_MIN]);
  });
  it('gives the same answer on rules 1-5', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(12);
    for (const [pw, ctx] of CASES) {
      expect(passwordError(pw, ctx)?.message ?? null, String(pw)).toBe(server.passwordError(pw, ctx)?.message ?? null);
    }
  });
  it('builds the same context tokens', () => {
    expect(contextTokens(ROSSI)).toEqual(server.contextTokens(ROSSI));
    expect(contextTokens()).toEqual(['pdash']);
  });
});

describe('passwordStrength', () => {
  it('grows with the length once the rule is met', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength(of(11))).toBe(1);
    expect(passwordStrength(of(12))).toBe(2);
    expect(passwordStrength(of(15))).toBe(2);
    expect(passwordStrength(of(16))).toBe(3);
    expect(passwordStrength(of(19))).toBe(3);
    expect(passwordStrength(of(20))).toBe(4);
  });
  it('stays at 1 while the rule is not met, however long', () => {
    expect(passwordStrength('abcabcabcabc')).toBe(1);
  });
  it('has one label per level', () => {
    expect(STRENGTH_LABELS).toEqual(['', 'Too weak', 'Fair', 'Good', 'Strong']);
  });
});

describe('texts', () => {
  it('states the minimum from the constant', () => {
    expect(PASSWORD_HINT).toBe('At least 12 characters. A longer passphrase is stronger.');
    expect(PASSWORD_PLACEHOLDER).toBe('At least 12 characters');
  });
});

describe('no firstName', () => {
  it('accepts a conforming password with an empty first name', () => {
    expect(passwordError('k7#wq9vz!m2pq', { email: 'a@b.c', firstName: '' })).toBe(null);
  });
});
