// The save contract on the server: lock the row, compare the version the client started from, run
// the route's own write, bump the version and log the full snapshot to change_log — all in one
// transaction. With a pool it opens the transaction; with a client it runs inside the caller's.
const { withTransaction } = require('../db/transaction');
const { entities } = require('./saved-entities');

class StaleError extends Error {
  constructor(type, version) {
    super(entities[type]?.staleMessage || 'This record was changed by someone else since you opened it.');
    this.type = type;
    this.version = version;
  }
}

class NotFoundError extends Error {
  constructor(type) {
    super(entities[type]?.notFoundMessage || 'Not found');
    this.type = type;
  }
}

function isPool(db) {
  return typeof db.connect === 'function' && typeof db.release !== 'function';
}

async function logChange(client, type, id, version, action, userId, snapshot) {
  await client.query(
    `INSERT INTO change_log (entity_type, entity_id, version, action, user_id, snapshot)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [type, String(id), version, action, userId ?? null, JSON.stringify(snapshot)]
  );
}

async function run(client, { type, id, expectedVersion, userId, action, write }) {
  const def = entities[type];
  if (!def) throw new Error(`Unknown saved entity type: ${type}`);

  if (action === 'create') {
    const out = await write(client);
    const created = !(out && typeof out === 'object' && out.created === false);
    const newId = out && typeof out === 'object' ? out.id : out;
    const entity = await def.snapshot(client, newId);
    if (!created) return { entity, version: entity?.version, created: false };
    await logChange(client, type, newId, 0, action, userId, entity);
    return { entity, version: 0 };
  }

  const locked = await client.query(`SELECT version FROM ${def.table} WHERE id = $1 FOR UPDATE`, [id]);
  if (!locked.rows[0]) throw new NotFoundError(type);
  const stored = locked.rows[0].version;
  if (!Number.isInteger(expectedVersion) || expectedVersion !== stored) throw new StaleError(type, stored);

  if (action === 'delete') {
    const entity = await def.snapshot(client, id);
    await write(client);
    await logChange(client, type, id, stored + 1, action, userId, entity);
    return { entity, version: stored + 1 };
  }

  await write(client);
  const bumped = await client.query(
    `UPDATE ${def.table} SET version = version + 1 WHERE id = $1 RETURNING version`, [id]
  );
  const version = bumped.rows[0].version;
  const entity = await def.snapshot(client, id);
  await logChange(client, type, id, version, action, userId, entity);
  return { entity, version };
}

async function versionedWrite(poolOrClient, opts) {
  if (isPool(poolOrClient)) return withTransaction(poolOrClient, client => run(client, opts));
  return run(poolOrClient, opts);
}

// Answers a StaleError (409 STALE) or a NotFoundError (404); true when it did.
function respondSaveError(res, err) {
  if (err instanceof StaleError) {
    res.status(409).json({ error: err.message, code: 'STALE', version: err.version });
    return true;
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return true;
  }
  return false;
}

module.exports = { versionedWrite, respondSaveError, StaleError, NotFoundError };
