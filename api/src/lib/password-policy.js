// The password rule (NIST SP 800-63B), server side. Browser twin: js/lib/password-policy.js
// (rules 1-5 must give identical results, pinned by js/lib/password-policy.test.js).
// Lengths count code points; no Unicode normalisation, so the value checked is the value hashed.

'use strict';

const MIN_LENGTH = 12;
const MAX_LENGTH = 64;
const MAX_BYTES = 72;
const MIN_DISTINCT = 4;
const CONTEXT_MIN = 4;

function contextTokens({ email, firstName, lastName } = {}) {
  const raw = [];
  if (typeof email === 'string' && email) {
    const local = email.split('@')[0];
    raw.push(local, ...local.split(/[._+-]/));
  }
  if (typeof firstName === 'string') raw.push(firstName);
  if (typeof lastName === 'string') raw.push(lastName);
  raw.push('pdash');
  const tokens = [];
  for (const t of raw) {
    const low = t.toLowerCase();
    if (low.length >= CONTEXT_MIN && !tokens.includes(low)) tokens.push(low);
  }
  return tokens;
}

function passwordError(password, context = {}, { common = new Set() } = {}) {
  if (typeof password !== 'string') return { message: 'Password is required.' };
  const chars = [...password];
  if (chars.length < MIN_LENGTH) return { message: `Use at least ${MIN_LENGTH} characters.` };
  if (chars.length > MAX_LENGTH) return { message: `Use at most ${MAX_LENGTH} characters.` };
  if (Buffer.byteLength(password, 'utf8') > MAX_BYTES) return { message: 'This password is too long.' };
  if (new Set(chars).size < MIN_DISTINCT) return { message: 'Avoid repeating the same few characters.' };
  const low = password.toLowerCase();
  if (contextTokens(context || {}).some(t => low.includes(t))) {
    return { message: "Don't use your name or email in your password." };
  }
  if (common.has(low)) return { message: 'This password is too common. Choose a different one.' };
  return null;
}

module.exports = { MIN_LENGTH, MAX_LENGTH, MAX_BYTES, MIN_DISTINCT, CONTEXT_MIN, contextTokens, passwordError };
