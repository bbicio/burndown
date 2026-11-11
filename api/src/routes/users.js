const express = require('express');
const { query, pool } = require('../db/client');
const { withTransaction } = require('../db/transaction');
// liveRole: the actor's role read again right before the role/status/anonymize writes that touch a sysadmin.
const { requireAuth, requireAdmin, liveRole } = require('../middleware/auth');
const { roleChangeError } = require('../lib/role-transition');
const { ANON_EMAIL_RE, normalizeDetails, detailsError } = require('../lib/user-details');
const { revokeTwoStepState } = require('../services/two-step');
const { anonymizeUser } = require('../services/users');

const router = express.Router();

// Guards every mutation of another user's row (role, status, anonymize, delete):
// only a sysadmin may touch a sysadmin. Returns an error message or null.
function sysAdminTargetError(actorRole, targetCurrentRole) {
  if (targetCurrentRole === 'sysadmin' && actorRole !== 'sysadmin') {
    return 'Only a sysadmin can modify another sysadmin';
  }
  return null;
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

    const { rows: [target] } = await query('SELECT role, email, status FROM users WHERE id = $1', [req.params.id]);
    if (!target) return res.status(404).json({ error: 'User not found' });

    // A sysadmin row is only ever modifiable by another sysadmin — whatever
    // field the request is trying to change (status-only requests included).
    // Use the actor's live role.
    const actorRole = await liveRole(req.user.id);
    const protErr = sysAdminTargetError(actorRole, target.role);
    if (protErr) return res.status(403).json({ error: protErr });

    if (role) {
      const roleErr = roleChangeError(actorRole, target.role, role);
      if (roleErr) return res.status(403).json({ error: roleErr });
    }

    let details = {};
    if (wantsDetails) {
      // Live role: an email change is an account takeover.
      if (!['admin', 'sysadmin'].includes(actorRole)) return res.status(403).json({ error: 'Admin rights required' });
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
    // Links already mailed to the old address (a pending invite, a password reset) must not activate or
    // reset the corrected account.
    if (details.email !== undefined && details.email !== target.email) {
      fields.push('reset_token = NULL', 'reset_expires = NULL');
      if (target.status === 'pending') fields.push('invite_token = NULL', 'invite_expires = NULL');
    }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(req.params.id);
    let rows;
    try {
      ({ rows } = await query(
        `UPDATE users SET ${fields.join(', ')} WHERE id = $${params.length}
         RETURNING id, email, first_name, last_name, role, status`,
        params
      ));
    } catch (err) {
      // A concurrent request took the address between the duplicate check above and this UPDATE.
      if (err.code === '23505' && err.constraint === 'users_email_key') {
        return res.status(409).json({ error: 'Email already in use', field: 'email' });
      }
      throw err;
    }
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    // A new address or a disabled account must not keep a code mailed to the old one, nor a device trusted before.
    if ((details.email !== undefined && details.email !== target.email) || status === 'disabled') {
      await revokeTwoStepState(req.params.id);
    }
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

    // All or nothing: a failure half-way must not leave the requests deleted and the user intact.
    const updated = await withTransaction(pool, c => anonymizeUser(c, req.params.id));
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
    await revokeTwoStepState(req.params.id);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
