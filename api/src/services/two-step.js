const defaultDb = require('../db/client');
const T = require('../lib/two-step');

function secret() {
  return process.env.JWT_SECRET;
}

async function purgeExpired(db) {
  await db.query('DELETE FROM login_challenges WHERE expires_at <= NOW()');
  await db.query('DELETE FROM trusted_devices WHERE expires_at <= NOW()');
}

// The credential state a request read before its slow steps (bcrypt, the mail): { email, passwordChangedAt }
// of the users row. A row written under it only lands while the user still matches, so a password or email
// change, or a disable, that revokes in between is not undone by the request that was already in flight.
// Returns the WHERE condition and the parameters it adds after the `first` placeholder.
function stateGuard(userIdParam, guard, first) {
  const params = [guard.email];
  let cond = `id = ${userIdParam} AND status = 'active' AND email = $${first}`;
  if (guard.passwordChangedAt) {
    params.push(new Date(guard.passwordChangedAt).getTime());
    cond += ` AND floor(extract(epoch FROM password_changed_at) * 1000) = $${first + 1}::bigint`;
  } else {
    cond += ' AND password_changed_at IS NULL';
  }
  return { sql: `EXISTS (SELECT 1 FROM users WHERE ${cond})`, params };
}

// Null when `guard` no longer matches the user.
async function createChallenge(userId, { db = defaultDb, guard } = {}) {
  await purgeExpired(db);
  const token = T.newToken();
  const code = T.generateCode();
  const g = guard ? stateGuard('$1::uuid', guard, 5) : { sql: 'TRUE', params: [] };
  const { rows: [ins] } = await db.query(
    `INSERT INTO login_challenges (user_id, token_hash, method, code_hash, code_expires_at, expires_at)
     SELECT $1::uuid, $2::text, 'email', 'pending', NOW() + ($3::text || ' milliseconds')::interval, NOW() + ($4::text || ' milliseconds')::interval
     WHERE ${g.sql}
     RETURNING id`,
    [userId, T.hashToken(token), String(T.CODE_TTL_MS), String(T.CHALLENGE_TTL_MS), ...g.params]
  );
  if (!ins) return null;
  // The code hash is bound to the row id, which only exists after the insert.
  const { rows: [challenge] } = await db.query(
    'UPDATE login_challenges SET code_hash = $2 WHERE id = $1 RETURNING *',
    [ins.id, T.hashCode(secret(), ins.id, code)]
  );
  return { challenge, token, code };
}

async function markSent(challengeId, { db = defaultDb } = {}) {
  await db.query('UPDATE login_challenges SET code_sent_at = NOW() WHERE id = $1', [challengeId]);
}

async function findChallenge(token, { db = defaultDb } = {}) {
  if (!token) return null;
  const { rows } = await db.query(
    'SELECT * FROM login_challenges WHERE token_hash = $1 AND expires_at > NOW()',
    [T.hashToken(token)]
  );
  return rows[0] || null;
}

async function recordAttempt(challengeId, { db = defaultDb } = {}) {
  const { rows } = await db.query(
    `UPDATE login_challenges SET attempts = attempts + 1
     WHERE id = $1 AND attempts < $2 RETURNING attempts`,
    [challengeId, T.MAX_ATTEMPTS]
  );
  return rows[0] ? rows[0].attempts : null;
}

async function replaceCode(challengeId, { db = defaultDb } = {}) {
  const code = T.generateCode();
  await db.query(
    `UPDATE login_challenges
     SET code_hash = $2, code_expires_at = NOW() + ($3 || ' milliseconds')::interval,
         sends = sends + 1, code_sent_at = NULL
     WHERE id = $1`,
    [challengeId, T.hashCode(secret(), challengeId, code), String(T.CODE_TTL_MS)]
  );
  return code;
}

// Emergency/test CLI: a fresh code for the user's most recent open challenge, without touching
// sends or code_sent_at. Null when the user has none.
async function resetLatestCode(userId, { db = defaultDb } = {}) {
  const { rows } = await db.query(
    `SELECT id FROM login_challenges WHERE user_id = $1 AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  if (!rows[0]) return null;
  const code = T.generateCode();
  await db.query(
    `UPDATE login_challenges SET code_hash = $2, code_expires_at = NOW() + ($3 || ' milliseconds')::interval
     WHERE id = $1`,
    [rows[0].id, T.hashCode(secret(), rows[0].id, code), String(T.CODE_TTL_MS)]
  );
  return code;
}

async function deleteChallenge(challengeId, { db = defaultDb } = {}) {
  await db.query('DELETE FROM login_challenges WHERE id = $1', [challengeId]);
}

// Called from every path that changes a credential or the state of the account.
async function revokeTwoStepState(userId, { db = defaultDb } = {}) {
  await db.query('DELETE FROM login_challenges WHERE user_id = $1', [userId]);
  await db.query('DELETE FROM trusted_devices WHERE user_id = $1', [userId]);
}

// Null when `guard` (see stateGuard) no longer matches the user.
async function trustDevice(userId, ua, { db = defaultDb, days = T.TRUST_DAYS, label, guard } = {}) {
  const token = T.newToken();
  const info = label ? { label, kind: 'desktop' } : T.deviceLabel(ua);
  const g = guard ? stateGuard('$1::uuid', guard, 6) : { sql: 'TRUE', params: [] };
  const { rows } = await db.query(
    `INSERT INTO trusted_devices (user_id, token_hash, label, kind, expires_at)
     SELECT $1::uuid, $2::text, $3::text, $4::text, NOW() + ($5::text || ' days')::interval
     WHERE ${g.sql}
     RETURNING id`,
    [userId, T.hashToken(token), info.label, info.kind, String(days), ...g.params]
  );
  return rows[0] ? token : null;
}

async function findTrustedDevice(token, { db = defaultDb } = {}) {
  if (!token) return null;
  const { rows } = await db.query('SELECT * FROM trusted_devices WHERE token_hash = $1', [T.hashToken(token)]);
  return rows[0] || null;
}

async function touchDevice(id, { db = defaultDb } = {}) {
  await db.query('UPDATE trusted_devices SET last_used_at = NOW() WHERE id = $1', [id]);
}

async function listDevices(userId, currentToken, { db = defaultDb } = {}) {
  const currentHash = currentToken ? T.hashToken(currentToken) : null;
  const { rows } = await db.query(
    `SELECT id, label, kind, created_at, expires_at, (token_hash = $2) AS current
     FROM trusted_devices WHERE user_id = $1 AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [userId, currentHash]
  );
  return rows.map(r => ({ ...r, current: r.current === true }));
}

async function removeDevice(userId, id, currentToken, { db = defaultDb } = {}) {
  const currentHash = currentToken ? T.hashToken(currentToken) : null;
  const { rows } = await db.query(
    'DELETE FROM trusted_devices WHERE id = $1 AND user_id = $2 RETURNING (token_hash = $3) AS was_current',
    [id, userId, currentHash]
  );
  return { removed: rows.length > 0, wasCurrent: rows.length > 0 && rows[0].was_current === true };
}

async function removeAllDevices(userId, { db = defaultDb } = {}) {
  await db.query('DELETE FROM trusted_devices WHERE user_id = $1', [userId]);
}

module.exports = {
  createChallenge, markSent, findChallenge, recordAttempt, replaceCode, resetLatestCode, deleteChallenge,
  revokeTwoStepState, trustDevice, findTrustedDevice, touchDevice, listDevices, removeDevice, removeAllDevices,
};
