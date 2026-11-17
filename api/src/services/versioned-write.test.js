const test = require('node:test');
const assert = require('node:assert/strict');
const { entities } = require('./saved-entities');
const { versionedWrite, respondSaveError, StaleError, NotFoundError } = require('./versioned-write');

const SNAP = { id: 'r1', label: 'A' };

// A client that records every statement and answers by the SQL it receives; the pool hands it out.
function fakeDb({ stored = 2, missing = false, failLog = false, order = [] } = {}) {
  const log = [];
  const client = {
    released: false,
    query: async (text, params) => {
      log.push({ text, params });
      if (/FOR UPDATE/.test(text)) return { rows: missing ? [] : [{ version: stored }] };
      if (/SET version = version \+ 1/.test(text)) return { rows: [{ version: stored + 1 }] };
      if (/INSERT INTO change_log/.test(text)) {
        if (failLog) throw new Error('log failed');
        return { rows: [] };
      }
      return { rows: [] };
    },
    release() { this.released = true; },
  };
  const pool = { connect: async () => client };
  const texts = () => log.map(l => l.text);
  const logInsert = () => log.find(l => /INSERT INTO change_log/.test(l.text));
  return { log, client, pool, texts, logInsert, order };
}

// The 'role' entry is swapped for a fake whose snapshot is fixed and records when it ran.
let realRole;
test.beforeEach(() => { realRole = entities.role; });
test.afterEach(() => { entities.role = realRole; });
function fakeRole(order = []) {
  entities.role = {
    table: 'roles',
    staleMessage: 'This role was changed by someone else since you opened it.',
    notFoundMessage: 'Role not found',
    snapshot: async () => { order.push('snapshot'); return { ...SNAP }; },
  };
}

test('matching version: writes, bumps, logs, returns', async () => {
  fakeRole();
  const db = fakeDb({ stored: 2 });
  let writes = 0;
  const out = await versionedWrite(db.pool, {
    type: 'role', id: 'r1', expectedVersion: 2, userId: 'u1', action: 'update',
    write: async () => { writes++; },
  });
  assert.equal(writes, 1);
  const t = db.texts();
  const iBegin = t.indexOf('BEGIN');
  const iBump = t.findIndex(x => /UPDATE roles SET version = version \+ 1/.test(x));
  const iLog = t.findIndex(x => /INSERT INTO change_log/.test(x));
  const iCommit = t.indexOf('COMMIT');
  assert.ok(iBegin === 0 && iBegin < iBump && iBump < iLog && iLog < iCommit, t.join(' | '));
  assert.deepEqual(db.logInsert().params, ['role', 'r1', 3, 'update', 'u1', JSON.stringify(SNAP)]);
  assert.deepEqual(out, { entity: SNAP, version: 3 });
  assert.equal(db.client.released, true);
});

test('stale version: StaleError, no write, no log', async () => {
  fakeRole();
  const db = fakeDb({ stored: 2 });
  let writes = 0;
  await assert.rejects(
    versionedWrite(db.pool, { type: 'role', id: 'r1', expectedVersion: 1, userId: 'u1', action: 'update', write: async () => { writes++; } }),
    err => err instanceof StaleError && err.version === 2,
  );
  assert.equal(writes, 0);
  assert.equal(db.logInsert(), undefined);
  assert.ok(db.texts().includes('ROLLBACK'));
  assert.ok(!db.texts().includes('COMMIT'));
});

test('missing or non-integer version is stale', async () => {
  fakeRole();
  for (const expectedVersion of [undefined, '3', 1.5]) {
    const db = fakeDb({ stored: 3 });
    await assert.rejects(
      versionedWrite(db.pool, { type: 'role', id: 'r1', expectedVersion, userId: 'u1', action: 'update', write: async () => {} }),
      StaleError,
    );
  }
});

test('log failure rolls the write back', async () => {
  fakeRole();
  const db = fakeDb({ failLog: true });
  await assert.rejects(
    versionedWrite(db.pool, { type: 'role', id: 'r1', expectedVersion: 2, userId: 'u1', action: 'update', write: async () => {} }),
    /log failed/,
  );
  assert.ok(db.texts().includes('ROLLBACK'));
  assert.ok(!db.texts().includes('COMMIT'));
});

test('unknown id: NotFoundError', async () => {
  fakeRole();
  const db = fakeDb({ missing: true });
  let writes = 0;
  await assert.rejects(
    versionedWrite(db.pool, { type: 'role', id: 'nope', expectedVersion: 0, userId: 'u1', action: 'update', write: async () => { writes++; } }),
    NotFoundError,
  );
  assert.equal(writes, 0);
});

test('create logs version 0; created:false logs nothing', async () => {
  fakeRole();
  const db = fakeDb();
  const out = await versionedWrite(db.pool, { type: 'role', userId: 'u1', action: 'create', write: async () => 'new-id' });
  const p = db.logInsert().params;
  assert.equal(p[1], 'new-id');
  assert.equal(p[2], 0);
  assert.equal(p[3], 'create');
  assert.deepEqual(out.entity, SNAP);
  assert.ok(!db.texts().some(x => /FOR UPDATE|version = version \+ 1/.test(x)));

  const db2 = fakeDb();
  const out2 = await versionedWrite(db2.pool, { type: 'role', userId: 'u1', action: 'create', write: async () => ({ id: 'x', created: false }) });
  assert.equal(db2.logInsert(), undefined);
  assert.deepEqual(out2.entity, SNAP);
  assert.equal(out2.created, false);
});

test('delete snapshots before write and logs stored + 1', async () => {
  const order = [];
  fakeRole(order);
  const db = fakeDb({ stored: 4 });
  const out = await versionedWrite(db.pool, {
    type: 'role', id: 'r1', expectedVersion: 4, userId: 'u1', action: 'delete',
    write: async () => { order.push('write'); },
  });
  assert.deepEqual(order, ['snapshot', 'write']);
  assert.ok(!db.texts().some(x => /version = version \+ 1/.test(x)));
  assert.equal(db.logInsert().params[2], 5);
  assert.equal(db.logInsert().params[3], 'delete');
  assert.deepEqual(out, { entity: SNAP, version: 5 });
});

test('a caller client gets no BEGIN/COMMIT', async () => {
  fakeRole();
  const db = fakeDb();
  await versionedWrite(db.client, { type: 'role', id: 'r1', expectedVersion: 2, userId: 'u1', action: 'update', write: async () => {} });
  assert.ok(!db.texts().some(x => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(x)), db.texts().join(' | '));
  assert.equal(db.client.released, false);
});

test('respondSaveError maps Stale to 409 STALE and NotFound to 404', () => {
  const res = () => ({ code: null, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });

  const r1 = res();
  assert.equal(respondSaveError(r1, new StaleError('role', 7)), true);
  assert.equal(r1.code, 409);
  assert.deepEqual(r1.body, { error: 'This role was changed by someone else since you opened it.', code: 'STALE', version: 7 });

  const r2 = res();
  assert.equal(respondSaveError(r2, new NotFoundError('ratecard')), true);
  assert.equal(r2.code, 404);
  assert.deepEqual(r2.body, { error: 'Ratecard not found' });

  const r3 = res();
  assert.equal(respondSaveError(r3, new Error('other')), false);
  assert.equal(r3.code, null);
});
