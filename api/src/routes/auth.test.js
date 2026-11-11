const test = require('node:test');
const assert = require('node:assert/strict');

// routes/auth.js reads `query` and `pool` when it loads: the fakes are set first. `mode` decides what
// the transaction's INSERT of the request does.
process.env.JWT_SECRET = 'test-secret';
let mode = 'fail';
const client = require('../db/client');
client.query = async () => ({ rows: [{ first_name: 'A', last_name: 'B' }] });
client.pool = {
  connect: async () => ({
    async query(text) {
      if (/INSERT INTO rectification_requests/.test(text)) {
        if (mode === 'fail') throw new Error('db down');
        return { rows: [{ id: 'r1' }] };
      }
      return { rows: [] };   // BEGIN, COMMIT, ROLLBACK, and notifyAdmins finding no admin
    },
    release() {},
  }),
};
const router = require('./auth');
const handler = router.stack.find(l => l.route && l.route.path === '/rectification-request').route.stack.at(-1).handle;

// One request: the status the handler answered with, or 500 when it handed an error to next.
async function send(userId) {
  let status = null;
  const res = { status(code) { status = code; return res; }, json() { return res; } };
  await handler({ user: { id: userId }, body: { message: 'x' } }, res, () => { status = 500; });
  return status;
}

test('a request that fails on the database gives its rate-limit slot back', async () => {
  mode = 'fail';
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push(await send('u1'));
  assert.deepEqual(statuses, [500, 500, 500, 500, 500, 500]);
});

test('a 409 with no other admin keeps its slot: the sixth request is limited', async () => {
  mode = 'none';
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push(await send('u2'));
  assert.deepEqual(statuses, [409, 409, 409, 409, 409, 429]);
});
