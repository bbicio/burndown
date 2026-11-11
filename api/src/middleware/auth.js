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
  query(
    `SELECT status, role,
            floor(extract(epoch FROM password_changed_at) * 1000)::bigint AS pwd
     FROM users WHERE id = $1`,
    [claims.id]
  ).then(({ rows }) => {
    const err = sessionError(claims, rows[0]);
    if (err) return res.status(401).json({ error: err });
    req.user = { ...claims, role: rows[0].role };
    next();
  }).catch(next);
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin' && req.user.role !== 'sysadmin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

// Gates irreversible bulk-deletion routes. The role is already the database's (requireAuth).
function requireSysAdmin(req, res, next) {
  requireAuth(req, res, () => {
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

module.exports = { requireAuth, requireAdmin, requireSysAdmin, liveRole };
