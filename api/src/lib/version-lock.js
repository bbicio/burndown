// Serialises, per cost-grid version, "change the currency of the version" against "link a project to it":
// both run inside this lock, so the check (no project linked yet / same currency) and the write that follows
// cannot interleave with the other side (project currency lock, 2026-10-01). A transaction-level advisory
// lock: it is released at COMMIT/ROLLBACK, needs no row and no schema change.
const { pool } = require('../db/client');

// The lock key of a version: the same string form on every caller, whatever the letter case of the id.
const lockKey = versionId => String(versionId).toLowerCase();

// Takes the version's advisory lock on an open transaction client.
async function lockVersion(client, versionId) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey(versionId)]);
}

// Runs fn(client) inside a transaction holding the version's lock; commits when fn returns, rolls back on a throw.
async function withVersionLock(versionId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await lockVersion(client, versionId);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { withVersionLock, lockVersion, lockKey };
