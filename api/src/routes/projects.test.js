// Route test for PUT /api/projects/:id (the project Save) with a fake DB: pins the order of the answers before
// the transaction and the order of the locks inside it (the version lock before the project row lock).
// No database, no network.
const test = require('node:test');
const assert = require('node:assert/strict');

const ID = '11111111-1111-4111-8111-111111111111';
const VER = '22222222-2222-4222-8222-222222222222';
const STORED = { name: 'P', code: null, description: '', start_date: '202604', end_date: '202612', currency: 'EUR',
  cg_version_id: null, phasing: {}, ptc: [], planning: {} };
const state = { exists: true, canEdit: true, version: 3, log: [] };

function stub(rel, exports) {
  const file = require.resolve(rel);
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

const fakeClient = {
  async query(sql, params) {
    const s = sql.trim();
    state.log.push(s);
    if (/FOR NO KEY UPDATE/.test(s)) return { rows: state.exists ? [{ version: state.version }] : [] };
    if (/^SELECT name, code, description, start_date/.test(s)) return { rows: [STORED] };
    if (/FROM cost_grid_versions WHERE id/.test(s)) return { rows: [{ currency: 'EUR' }] };
    if (/^SELECT name, code, description FROM projects/.test(s)) return { rows: [{ name: 'Q', code: null, description: '' }] };
    if (/RETURNING version/.test(s)) return { rows: [{ version: state.version + 1 }] };
    if (/FROM projects p/.test(s)) return { rows: [{ id: ID, name: 'Q', version: state.version + 1 }] };
    return { rows: [] };
  },
  release() {},
};
stub('../db/client', {
  async query(sql) {
    const s = sql.trim();
    state.log.push(s);
    if (/^SELECT 1 FROM projects WHERE id/.test(s)) return { rows: state.exists ? [{ '?column?': 1 }] : [] };
    if (/permission IN \('owner','editor'\)/.test(s)) return { rows: state.canEdit ? [{}] : [] };
    return { rows: [] };
  },
  pool: { async connect() { return fakeClient; } },
});
stub('../middleware/auth', { requireAuth: (_req, _res, next) => next(), liveRole: async () => 'admin' });
stub('../services/email', { sendShareNotification: async () => {}, sendShareRevokedEmail: async () => {} });
stub('../services/profile-engine', { enqueueProjectsQuiet: async () => {} });

const router = require('./projects');
const layer = router.stack.find(l => l.route && l.route.path === '/:id' && l.route.methods.put);
const handler = layer.route.stack[layer.route.stack.length - 1].handle;

async function put(body, { id = ID, role = 'admin', exists = true, canEdit = true } = {}) {
  Object.assign(state, { exists, canEdit, log: [] });
  const res = {
    statusCode: 200, body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  let error = null;
  await handler({ user: { id: 'u', role }, params: { id }, body }, res, e => { error = e; });
  if (error) throw error;
  return res;
}

test('a non-UUID id answers 400 before any read', async () => {
  const res = await put({ version: 3, header: { name: 'Q' } }, { id: 'not-a-uuid' });
  assert.equal(res.statusCode, 400);
  assert.equal(state.log.length, 0);
});

test('a missing project answers 404 before the permission check', async () => {
  const res = await put({ version: 3, header: { name: 'Q' } }, { role: 'user', exists: false, canEdit: false });
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error, 'Project not found');
});

test('no edit permission answers 403 before the body is read', async () => {
  const res = await put({ version: 3, header: { bogus: 1 } }, { role: 'user', canEdit: false });
  assert.equal(res.statusCode, 403);
});

test('an unknown header field answers 400 without a transaction', async () => {
  const res = await put({ version: 3, header: { linkedProjects: [] } });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Unknown field: linkedProjects');
  assert.ok(!state.log.includes('BEGIN'));
});

test('a new link takes the version lock before the project row lock', async () => {
  const res = await put({ version: 3, header: { cgVersionId: VER } });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const s = state.log;
  const adv = s.findIndex(q => /pg_advisory_xact_lock/.test(q));
  const row = s.findIndex(q => /FOR NO KEY UPDATE/.test(q));
  assert.ok(s.indexOf('BEGIN') < adv && adv < row && row < s.indexOf('COMMIT'), s.join(' | '));
});

test('a stale version answers 409 STALE and rolls back', async () => {
  const res = await put({ version: 2, header: { name: 'Q' } });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'STALE');
  assert.ok(state.log.includes('ROLLBACK') && !state.log.includes('COMMIT'));
});
