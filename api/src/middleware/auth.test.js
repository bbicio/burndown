const test = require('node:test');
const assert = require('node:assert/strict');

// requireAuth reads `query` and the JWT secret when its modules load: both are set first. `answer` is
// what the next users query does.
process.env.JWT_SECRET = 'test-secret';
const client = require('../db/client');
let answer = async () => ({ rows: [{ status: 'disabled', role: 'user', pwd: null }] });
client.query = (...args) => answer(...args);
const { requireAuth, requireAdmin, requireSysAdmin, sessionRowError } = require('./auth');
const { signToken } = require('../services/jwt');

const req = () => ({ cookies: { pdash_token: signToken({ id: 'u', email: 'e', role: 'user', pwd: null }) } });
const settle = () => new Promise(r => setImmediate(r));

test('requireAuth hands an error thrown while answering to next', async () => {
  answer = async () => ({ rows: [{ status: 'disabled', role: 'user', pwd: null }] });
  const boom = new Error('boom');
  const res = { status() { return res; }, json() { throw boom; } };
  const calls = [];
  requireAuth(req(), res, err => calls.push(err));
  await settle();
  assert.deepEqual(calls, [boom]);
});

for (const [name, guard] of [['requireAdmin', requireAdmin], ['requireSysAdmin', requireSysAdmin]]) {
  test(`${name} hands a failed session query to next instead of reading req.user`, async () => {
    const down = new Error('db down');
    answer = async () => { throw down; };
    const res = { status() { return res; }, json() { return res; } };
    const calls = [];
    guard(req(), res, err => calls.push(err));
    await settle();
    assert.deepEqual(calls, [down]);
  });
}

test('sessionRowError resolves the session error of the row', async () => {
  answer = async () => ({ rows: [{ status: 'disabled', role: 'user', pwd: null }] });
  assert.equal((await sessionRowError({ id: 'u', pwd: null })).error, 'Session expired');
  answer = async () => ({ rows: [{ status: 'active', role: 'admin', pwd: null }] });
  const ok = await sessionRowError({ id: 'u', pwd: null });
  assert.equal(ok.error, null);
  assert.equal(ok.row.role, 'admin');
});

test('sessionRowError rejects when the query fails', async () => {
  const down = new Error('db down');
  answer = async () => { throw down; };
  await assert.rejects(sessionRowError({ id: 'u', pwd: null }), down);
});
