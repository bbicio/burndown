const express = require('express');
const { query } = require('../db/client');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { roleChangeError } = require('../lib/role-transition');
const { normalizeDetails, detailsError } = require('../lib/user-details');

const ANON_EMAIL_RE = /^anon_.+@deleted\.local$/;

const router = express.Router();

// Guards every mutation of another user's row (role, status, anonymize, delete):
// only a sysadmin may touch a sysadmin. Returns an error message or null.
function sysAdminTargetError(actorRole, targetCurrentRole) {
  if (targetCurrentRole === 'sysadmin' && actorRole !== 'sysadmin') {
    return 'Only a sysadmin can modify another sysadmin';
  }
  return null;
}

// requireAdmin (unlike requireSysAdmin) trusts the role claim baked into the
// JWT at login time. That's fine for ordinary admin actions, but role/status/
// anonymize mutations that touch a sysadmin account need the actor's *current*
// privilege, not a stale one from up to 8h ago — an actor whose sysadmin
// status was just revoked must not be able to keep granting/revoking it or
// modifying other sysadmins on the strength of an old token.
async function liveRole(userId) {
  const { rows: [u] } = await query('SELECT role FROM users WHERE id = $1', [userId]);
  return u ? u.role : null;
}

// GET /api/users/search?email=... — any authenticated user, for share-target lookup
router.get('/search', requireAuth, async (req, res, next) => {
  try {
    const email = (req.query.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'email is required' });
    const { rows } = await query(
      `SELECT id, email, first_name, last_name
       FROM users WHERE LOWER(email) = $1 AND status = 'active'`,
      [email]
    );
    if (!rows[0]) return res.status(404).json({ error: 'No active user found with that email' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/users/active-list — any authenticated user, minimal fields for notification/share targeting
router.get('/active-list', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, email, first_name, last_name, role
       FROM users WHERE status = 'active' ORDER BY first_name, last_name`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/users
router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.query;
    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`u.status = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.status, u.created_at,
              inv.first_name || ' ' || inv.last_name AS invited_by_name
       FROM users u
       LEFT JOIN users inv ON inv.id = u.invited_by
       ${where}
       ORDER BY u.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/users/:id
router.get('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.status, u.created_at,
              inv.first_name || ' ' || inv.last_name AS invited_by_name
       FROM users u
       LEFT JOIN users inv ON inv.id = u.invited_by
       WHERE u.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/users/:id  — change role, status, or name / email (details are admin-managed)
router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { role, status, firstName, lastName, email } = req.body;
    const wantsDetails = [firstName, lastName, email].some(v => v !== undefined);

    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot modify your own account' });
    }

    const allowed = { role: ['admin', 'user', 'sysadmin'], status: ['active', 'disabled'] };
    if (role && !allowed.role.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    if (status && !allowed.status.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const { rows: [target] } = await query('SELECT role, email FROM users WHERE id = $1', [req.params.id]);
    if (!target) return res.status(404).json({ error: 'User not found' });

    // A sysadmin row is only ever modifiable by another sysadmin — whatever
    // field the request is trying to change (status-only requests included).
    // Use the actor's live role, not the JWT-cached one from requireAdmin.
    const actorRole = await liveRole(req.user.id);
    const protErr = sysAdminTargetError(actorRole, target.role);
    if (protErr) return res.status(403).json({ error: protErr });

    if (role) {
      const roleErr = roleChangeError(actorRole, target.role, role);
      if (roleErr) return res.status(403).json({ error: roleErr });
    }

    let details = {};
    if (wantsDetails) {
      if (ANON_EMAIL_RE.test(target.email)) return res.status(400).json({ error: 'This user has been anonymized' });
      details = normalizeDetails({ firstName, lastName, email });
      const detErr = detailsError(details);
      if (detErr) return res.status(400).json(detErr);
      if (details.email !== undefined) {
        const dup = await query('SELECT id FROM users WHERE LOWER(email) = $1 AND id <> $2', [details.email, req.params.id]);
        if (dup.rows[0]) return res.status(409).json({ error: 'Email already in use', field: 'email' });
      }
    }

    const fields = [];
    const params = [];
    if (role)   { params.push(role);   fields.push(`role = $${params.length}`); }
    if (status) { params.push(status); fields.push(`status = $${params.length}`); }
    if (details.firstName !== undefined) { params.push(details.firstName); fields.push(`first_name = $${params.length}`); }
    if (details.lastName  !== undefined) { params.push(details.lastName);  fields.push(`last_name = $${params.length}`); }
    if (details.email     !== undefined) { params.push(details.email);     fields.push(`email = $${params.length}`); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${params.length}
       RETURNING id, email, first_name, last_name, role, status`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/users/:id/anonymize — replace personal data with anonymous values; keep operational records
router.post('/:id/anonymize', requireAdmin, async (req, res, next) => {
  try {
    if (req.params.id === req.user.id)
      return res.status(400).json({ error: 'You cannot anonymize your own account' });

    const { rows: [existing] } = await query('SELECT id, status, role FROM users WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'User not found' });

    const actorRole = await liveRole(req.user.id);
    const protErr = sysAdminTargetError(actorRole, existing.role);
    if (protErr) return res.status(403).json({ error: protErr });

    // The rectification requests are free text with personal data: they go with the rest.
    await query('DELETE FROM rectification_requests WHERE user_id = $1', [req.params.id]);
    const { rows: [updated] } = await query(
      `UPDATE users SET
         email             = 'anon_' || id || '@deleted.local',
         first_name        = '[Deleted]',
         last_name         = 'User',
         password_hash     = NULL,
         invite_token      = NULL,
         invite_expires    = NULL,
         reset_token       = NULL,
         reset_expires     = NULL,
         terms_version     = NULL,
         terms_accepted_at = NULL,
         status            = 'disabled'
       WHERE id = $1
       RETURNING id, status`,
      [req.params.id]
    );
    res.json({ ok: true, ...updated });
  } catch (err) { next(err); }
});

// DELETE /api/users/:id  — soft delete (disable)
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot disable your own account' });
    }

    const { rows: [target] } = await query('SELECT role FROM users WHERE id = $1', [req.params.id]);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const actorRole = await liveRole(req.user.id);
    const protErr = sysAdminTargetError(actorRole, target.role);
    if (protErr) return res.status(403).json({ error: protErr });

    const { rows } = await query(
      `UPDATE users SET status = 'disabled' WHERE id = $1
       RETURNING id, email, first_name, last_name, status`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
