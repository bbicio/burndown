const test = require('node:test');
const assert = require('node:assert/strict');
const { withTransaction } = require('./transaction');

// A pool whose one client records the statements it receives.
function fakePool() {
  const log = [];
  const client = {
    released: false,
    query: async text => { log.push(text); return { rows: [] }; },
    release() { this.released = true; },
  };
  return { log, client, connect: async () => client };
}

test('withTransaction commits what fn did and returns its result', async () => {
  const pool = fakePool();
  const out = await withTransaction(pool, async c => { await c.query('UPDATE x'); return 42; });
  assert.equal(out, 42);
  assert.deepEqual(pool.log, ['BEGIN', 'UPDATE x', 'COMMIT']);
  assert.equal(pool.client.released, true);
});

test('withTransaction rolls back and rethrows when fn throws', async () => {
  const pool = fakePool();
  const boom = new Error('boom');
  await assert.rejects(withTransaction(pool, async () => { throw boom; }), boom);
  assert.deepEqual(pool.log, ['BEGIN', 'ROLLBACK']);
  assert.equal(pool.client.released, true);
});
