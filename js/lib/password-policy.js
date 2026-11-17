// js/lib/password-policy.js
// Browser twin of api/src/lib/password-policy.js: rules 1-5 (no common-password list, no breach check),
// for immediate feedback only — the server decides. Parity is pinned by password-policy.test.js.
// Also the strength meter and the texts every new-password field shows. Native ES module, bridged onto `window`.

export const MIN_LENGTH = 12;
export const MAX_LENGTH = 64;
export const MAX_BYTES = 72;
export const MIN_DISTINCT = 4;
export const CONTEXT_MIN = 4;

export const STRENGTH_LABELS = ['', 'Too weak', 'Fair', 'Good', 'Strong'];
export const PASSWORD_HINT = `At least ${MIN_LENGTH} characters. A longer passphrase is stronger.`;
export const PASSWORD_PLACEHOLDER = `At least ${MIN_LENGTH} characters`;

export function contextTokens({ email, firstName, lastName } = {}) {
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

export function passwordError(password, context = {}) {
  if (typeof password !== 'string') return { message: 'Password is required.' };
  const chars = [...password];
  if (chars.length < MIN_LENGTH) return { message: `Use at least ${MIN_LENGTH} characters.` };
  if (chars.length > MAX_LENGTH) return { message: `Use at most ${MAX_LENGTH} characters.` };
  if (new TextEncoder().encode(password).length > MAX_BYTES) return { message: 'This password is too long.' };
  if (new Set(chars).size < MIN_DISTINCT) return { message: 'Avoid repeating the same few characters.' };
  const low = password.toLowerCase();
  if (contextTokens(context || {}).some(t => low.includes(t))) {
    return { message: "Don't use your name or email in your password." };
  }
  return null;
}

// 0 empty, 1 rule not met, then by length: 2 up to 15 code points, 3 up to 19, 4 from 20.
export function passwordStrength(password) {
  if (!password) return 0;
  if (passwordError(password)) return 1;
  const n = [...password].length;
  return n >= 20 ? 4 : n >= 16 ? 3 : 2;
}

if (typeof window !== 'undefined') {
  window.PASSWORD_MIN_LENGTH = MIN_LENGTH;
  window.contextTokens = contextTokens;
  window.passwordError = passwordError;
  window.passwordStrength = passwordStrength;
  window.STRENGTH_LABELS = STRENGTH_LABELS;
  window.PASSWORD_HINT = PASSWORD_HINT;
  window.PASSWORD_PLACEHOLDER = PASSWORD_PLACEHOLDER;
}
