// Route test for PATCH /api/projects/:id with a fake DB: pins which statements run, and in which order,
// for a period that changes and for one that does not (B-483, B-484, B-486). No database, no network.
const test = require('node:test');
const assert = require('node:assert/strict');

const ID = '11111111-1111-4111-8111-111111111111';
const state = { read: null, locked: null, log: [] };

function stub(rel, exports) {
  const file = require.resolve(rel);
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

const fakeClient = {
  async query(sql, params) {
    state.log.push({ sql: sql.trim(), params, via: 'client' });
    if (/FOR UPDATE/.test(sql)) return { rows: state.locked ? [state.locked] : [] };
    if (/^\s*UPDATE projects/.test(sql)) return { rows: [{ id: ID, name: 'P' }] };
    return { rows: [] };
  },
  release() {},
};
stub('../db/client', {
  async query(sql, params) {
    state.log.push({ sql: sql.trim(), params, via: 'query' });
    if (/cg_version_id FROM projects WHERE id/.test(sql)) return { rows: state.read ? [state.read] : [] };
    if (/^\s*UPDATE projects/.test(sql)) return { rows: [{ id: ID, name: 'P' }] };
    return { rows: [] };
  },
  pool: { async connect() { return fakeClient; } },
});
stub('../middleware/auth', { requireAuth: (_req, _res, next) => next(), liveRole: async () => 'admin' });
stub('../services/email', { sendShareNotification: async () => {}, sendShareRevokedEmail: async () => {} });
stub('../services/profile-engine', { enqueueProjectsQuiet: async () => {} });

const router = require('./projects');
const layer = router.stack.find(l => l.route && l.route.path === '/:id' && l.route.methods.patch);
const handler = layer.route.stack[layer.route.stack.length - 1].handle;

const STORED = { id: ID, name: 'P', start_date: '202604 ', end_date: '202612 ', currency: 'EUR', cg_version_id: null };

async function patch(body, { read = STORED, locked = STORED } = {}) {
  state.read = read;
  state.locked = locked;
  state.log = [];
  const res = {
    statusCode: 200, body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  let error = null;
  await handler({ user: { id: 'u', role: 'admin' }, params: { id: ID }, body }, res, e => { error = e; });
  if (error) throw error;
  return res;
}

const sqlOf = () => state.log.map(l => l.sql);
const updates = () => state.log.filter(l => /^UPDATE projects/.test(l.sql));

test('a changed period takes the row lock before the UPDATE', async () => {
  const res = await patch({ endDate: '202611' });
  assert.equal(res.statusCode, 200);
  const s = sqlOf();
  const begin = s.indexOf('BEGIN');
  const lock = s.findIndex(q => /FOR UPDATE/.test(q));
  const upd = s.findIndex(q => /^UPDATE projects/.test(q));
  const commit = s.indexOf('COMMIT');
  assert.ok(begin >= 0 && begin < lock && lock < upd && upd < commit, s.join(' | '));
  assert.match(s[upd], /end_date/);
});

test('an unchanged period opens no transaction and writes no period column', async () => {
  const res = await patch({ name: 'Q', startDate: '202604', endDate: '202612' });
  assert.equal(res.statusCode, 200);
  assert.ok(!sqlOf().includes('BEGIN'));
  assert.equal(updates().length, 1);
  assert.match(updates()[0].sql, /name = /);
  assert.doesNotMatch(updates()[0].sql, /start_date|end_date/);
});

test('a body of only unchanged dates answers 200 with id and name', async () => {
  const res = await patch({ startDate: '202604', endDate: '202612' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { id: ID, name: 'P' });
  assert.equal(updates().length, 0);
});

test('a missing project answers 404 for a body of dates', async () => {
  const res = await patch({ startDate: '202604' }, { read: null, locked: null });
  assert.equal(res.statusCode, 404);
});

test('a cleared period is a change', async () => {
  const res = await patch({ startDate: '', endDate: '' });
  assert.equal(res.statusCode, 200);
  assert.ok(sqlOf().includes('BEGIN') && sqlOf().some(q => /FOR UPDATE/.test(q)));
  const u = updates()[0];
  assert.match(u.sql, /start_date = \$1, end_date = \$2/);
  assert.deepEqual(u.params.slice(0, 2), [null, null]);
});

test('a malformed changed period is refused under the lock', async () => {
  const res = await patch({ endDate: '2026-11' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'DATE_RULE');
  assert.ok(sqlOf().includes('BEGIN') && sqlOf().includes('ROLLBACK'));
  assert.equal(updates().length, 0);
});

test('a body without any field still answers Nothing to update', async () => {
  const res = await patch({});
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Nothing to update');
});
