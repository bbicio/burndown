const { verifyToken } = require('../services/jwt');
const { query } = require('../db/client');

function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.pdash_token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin' && req.user.role !== 'sysadmin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

// Unlike requireAuth/requireAdmin (which trust the role claim baked into the
// JWT at login time), this re-reads the role from the database on every call:
// it gates irreversible bulk-deletion routes, where an up-to-8h stale
// revocation window (the token lifetime) is not acceptable.
function requireSysAdmin(req, res, next) {
  requireAuth(req, res, async () => {
    try {
      const { rows } = await query('SELECT role FROM users WHERE id = $1', [req.user.id]);
      if (!rows[0]) return res.status(401).json({ error: 'Session expired' });
      if (rows[0].role !== 'sysadmin') {
        return res.status(403).json({ error: 'Sysadmin access required' });
      }
      req.user.role = rows[0].role;
      next();
    } catch (err) { next(err); }
  });
}

module.exports = { requireAuth, requireAdmin, requireSysAdmin };
