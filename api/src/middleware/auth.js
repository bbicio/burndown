const { verifyToken } = require('../services/jwt');

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
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

module.exports = { requireAuth, requireAdmin };
