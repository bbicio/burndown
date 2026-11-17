// The one place that hashes a new password: the rule (lib/password-policy.js), then the
// Have I Been Pwned range check (k-anonymity, fail-open), then bcrypt.
// scripts/password-policy-guard.test.js fails on a bcrypt.hash( anywhere else under api/src.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { passwordError } = require('../lib/password-policy');

const COMMON_FILE = path.join(__dirname, '..', 'lib', 'data', 'common-passwords.txt');
const BREACH_MESSAGE = 'This password has appeared in a data breach. Choose a different one.';

let common = null;

function loadCommonPasswords() {
  if (!common) {
    common = new Set(fs.readFileSync(COMMON_FILE, 'utf8').split(/\r?\n/)
      .filter(line => line && !line.startsWith('#')));
  }
  return common;
}

// Only the first 5 hex characters of the SHA-1 leave the server. Returns the breach count, 0 when
// absent, null when HIBP could not answer (timeout, network error, non-200), with the reason
// passed to `onFailure` — never the password or its prefix.
async function pwnedCount(password, { fetchImpl = fetch, timeoutMs = 2000, onFailure = () => {} } = {}) {
  const sha = crypto.createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = sha.slice(0, 5);
  const suffix = sha.slice(5);
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve('timeout'), timeoutMs); });
  try {
    const res = await Promise.race([
      fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'Add-Padding': 'true' },
        signal: AbortSignal.timeout(timeoutMs),
      }),
      timeout,
    ]);
    if (res === 'timeout') { onFailure('timeout'); return null; }
    if (!res.ok || res.status !== 200) { onFailure(`status ${res.status}`); return null; }
    const body = await Promise.race([res.text(), timeout]);
    if (body === 'timeout') { onFailure('timeout'); return null; }
    for (const line of body.split(/\r?\n/)) {
      const [s, n] = line.split(':');
      if (s && s.trim().toUpperCase() === suffix) {
        const count = parseInt(n, 10);
        return count > 0 ? count : 0;
      }
    }
    return 0;
  } catch (e) {
    onFailure(e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'timeout' : 'network');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function hashNewPassword(password, context, { breachCheck = true, fetchImpl } = {}) {
  const ruleError = passwordError(password, context, { common: loadCommonPasswords() });
  if (ruleError) return { error: ruleError.message };
  if (breachCheck && process.env.PASSWORD_BREACH_CHECK !== 'off') {
    let reason = '';
    const count = await pwnedCount(password, { fetchImpl, onFailure: r => { reason = r; } });
    if (count === null) console.warn('[passwords] breach check unavailable:', reason);
    else if (count > 0) return { error: BREACH_MESSAGE };
  }
  return { hash: await bcrypt.hash(password, 12) };
}

module.exports = { loadCommonPasswords, pwnedCount, hashNewPassword };
