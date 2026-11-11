const test = require('node:test');
const assert = require('node:assert/strict');

// requireAuth reads `query` and the JWT secret when its modules load: both are set first.
process.env.JWT_SECRET = 'test-secret';
const client = require('../db/client');
client.query = async () => ({ rows: [{ status: 'disabled', role: 'user', pwd: null }] });
const { requireAuth } = require('./auth');
const { signToken } = require('../services/jwt');

test('requireAuth hands an error thrown while answering to next', async () => {
  const boom = new Error('boom');
  const res = { status() { return res; }, json() { throw boom; } };
  const calls = [];
  requireAuth({ cookies: { pdash_token: signToken({ id: 'u', email: 'e', role: 'user', pwd: null }) } }, res, err => calls.push(err));
  await new Promise(r => setImmediate(r));
  assert.deepEqual(calls, [boom]);
});
