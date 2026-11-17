const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { loadCommonPasswords, pwnedCount, hashNewPassword } = require('./passwords');

// scripts/run-tests.sh runs this file inside an api container started with PASSWORD_BREACH_CHECK=off:
// the breach-check cases need it unset (the test that sets it restores this state).
const BREACH_ENV = process.env.PASSWORD_BREACH_CHECK;
delete process.env.PASSWORD_BREACH_CHECK;
test.after(() => {
  if (BREACH_ENV === undefined) delete process.env.PASSWORD_BREACH_CHECK;
  else process.env.PASSWORD_BREACH_CHECK = BREACH_ENV;
});

const PW = 'correct-horse-battery';
const SHA = crypto.createHash('sha1').update(PW).digest('hex').toUpperCase();
const PREFIX = SHA.slice(0, 5);
const SUFFIX = SHA.slice(5);
const OTHER = 'A'.repeat(35);

function stub(body, { ok = true, status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, headers: opts && opts.headers });
    return { ok, status, text: async () => body };
  };
  return { fetchImpl, calls };
}

test('found → count', async () => {
  const { fetchImpl } = stub(`${OTHER}:3\r\n${SUFFIX}:42\r\n`);
  assert.equal(await pwnedCount(PW, { fetchImpl }), 42);
});

test('not found → 0', async () => {
  const { fetchImpl } = stub(`${OTHER}:3\r\n`);
  assert.equal(await pwnedCount(PW, { fetchImpl }), 0);
});

test('padding line ignored', async () => {
  const { fetchImpl } = stub(`${OTHER}:3\r\n${SUFFIX}:0\r\n`);
  assert.equal(await pwnedCount(PW, { fetchImpl }), 0);
});

test('only the 5-char prefix leaves', async () => {
  const { fetchImpl, calls } = stub('');
  await pwnedCount(PW, { fetchImpl });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://api.pwnedpasswords.com/range/${PREFIX}`);
  assert.equal(calls[0].headers['Add-Padding'], 'true');
});

test('timeout → null', async () => {
  const fetchImpl = (url, opts) => new Promise((resolve, reject) => {
    opts.signal.addEventListener('abort', () => reject(opts.signal.reason));
  });
  const started = Date.now();
  assert.equal(await pwnedCount(PW, { fetchImpl, timeoutMs: 50 }), null);
  assert.ok(Date.now() - started < 1000);
});

test('timeout → null even when the fetch ignores the signal', async () => {
  const fetchImpl = () => new Promise(() => {});
  const started = Date.now();
  assert.equal(await pwnedCount(PW, { fetchImpl, timeoutMs: 50 }), null);
  assert.ok(Date.now() - started < 1000);
});

test('network error → null', async () => {
  const fetchImpl = async () => { throw new TypeError('fetch failed'); };
  assert.equal(await pwnedCount(PW, { fetchImpl }), null);
});

test('status 500 → null', async () => {
  const { fetchImpl } = stub('', { ok: false, status: 500 });
  assert.equal(await pwnedCount(PW, { fetchImpl }), null);
});

test('hashNewPassword rule error', async () => {
  const { fetchImpl, calls } = stub('');
  assert.deepEqual(await hashNewPassword('short', {}, { fetchImpl }), { error: 'Use at least 12 characters.' });
  assert.equal(calls.length, 0);
});

test('hashNewPassword breach', async () => {
  const { fetchImpl } = stub(`${SUFFIX}:7\r\n`);
  assert.deepEqual(await hashNewPassword(PW, {}, { fetchImpl }),
    { error: 'This password has appeared in a data breach. Choose a different one.' });
});

test('hashNewPassword fail-open', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const fetchImpl = async () => { throw new TypeError('fetch failed'); };
  const r = await hashNewPassword(PW, {}, { fetchImpl });
  assert.ok(r.hash);
  assert.ok(bcrypt.compareSync(PW, r.hash));
  assert.equal(warn.mock.callCount(), 1);
  const text = warn.mock.calls[0].arguments.join(' ');
  assert.ok(!text.includes(PW));
  assert.ok(!text.includes(PREFIX));
  assert.equal(text, '[passwords] breach check unavailable: network');
});

test('breachCheck: false does not call HIBP', async () => {
  const { fetchImpl, calls } = stub('');
  const r = await hashNewPassword(PW, {}, { breachCheck: false, fetchImpl });
  assert.ok(r.hash);
  assert.equal(calls.length, 0);
});

test('PASSWORD_BREACH_CHECK=off does not call HIBP', async () => {
  process.env.PASSWORD_BREACH_CHECK = 'off';
  try {
    const { fetchImpl, calls } = stub('');
    const r = await hashNewPassword(PW, {}, { fetchImpl });
    assert.ok(r.hash);
    assert.equal(calls.length, 0);
  } finally {
    delete process.env.PASSWORD_BREACH_CHECK;
  }
});

test('common list loads', () => {
  const common = loadCommonPasswords();
  assert.ok(common.size > 0);
  for (const v of common) assert.ok(!v.startsWith('#'));
  assert.ok(!common.has(''));
  assert.equal(loadCommonPasswords(), common);
});

test('common list entries are refused', async () => {
  const [first] = loadCommonPasswords();
  assert.deepEqual(await hashNewPassword(first.toUpperCase(), {}, { breachCheck: false }),
    { error: 'This password is too common. Choose a different one.' });
});

test('test-profile defaults pass the local rule', async () => {
  const admin = await hashNewPassword('Quiet-Harbor-Lantern-42',
    { email: 'test-admin@pdash.local', firstName: 'Test', lastName: 'Admin' }, { breachCheck: false });
  assert.ok(admin.hash, admin.error);
  const sys = await hashNewPassword('Silver-Orchard-Compass-87',
    { email: 'test-sysadmin@pdash.local', firstName: 'Test', lastName: 'SysAdmin' }, { breachCheck: false });
  assert.ok(sys.hash, sys.error);
});
