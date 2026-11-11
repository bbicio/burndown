const { verifyToken } = require('../services/jwt');
const { query } = require('../db/client');
const { sessionError } = require('../lib/session');

// The signature alone is not enough: the user's row is read on every request, so a disabled or
// anonymized account, or a password changed since the token was signed, ends the session at once,
// and req.user.role is the role in the database, not the one baked into the token.
function requireAuth(req, res, next) {
  let claims;
  try {
    const token = req.cookies?.pdash_token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    claims = verifyToken(token);
  } catch {
    return res.status(401).json({ error: 'Session expired' });
  }
  sessionRowError(claims).then(({ error, row }) => {
    if (error) return res.status(401).json({ error });
    req.user = { ...claims, role: row.role };
    next();
  }).catch(next);
}

// The user's row and the session error it gives these claims (null when the session holds). Read by
// requireAuth on every request and by the notification stream on every heartbeat.
async function sessionRowError(claims) {
  const { rows } = await query(
    `SELECT status, role,
            floor(extract(epoch FROM password_changed_at) * 1000)::bigint AS pwd
     FROM users WHERE id = $1`,
    [claims.id]
  );
  return { error: sessionError(claims, rows[0]), row: rows[0] };
}

// The callbacks below receive requireAuth's errors too (a failed session query): they go to next, before
// req.user is read.
function requireAdmin(req, res, next) {
  requireAuth(req, res, err => {
    if (err) return next(err);
    if (req.user.role !== 'admin' && req.user.role !== 'sysadmin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

// Gates irreversible bulk-deletion routes. The role is already the database's (requireAuth).
function requireSysAdmin(req, res, next) {
  requireAuth(req, res, err => {
    if (err) return next(err);
    if (req.user.role !== 'sysadmin') {
      return res.status(403).json({ error: 'Sysadmin access required' });
    }
    next();
  });
}

// The role of a user read from the database. requireAuth already refreshes req.user.role on every
// request; the project rules read it again so the check sits next to the write it guards.
async function liveRole(userId) {
  const { rows } = await query('SELECT role FROM users WHERE id = $1', [userId]);
  return rows[0] ? rows[0].role : null;
}

module.exports = { requireAuth, requireAdmin, requireSysAdmin, liveRole, sessionRowError };
