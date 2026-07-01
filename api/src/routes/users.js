const express = require('express');
const { query } = require('../db/client');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

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

// PATCH /api/users/:id  — change role or status
router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { role, status } = req.body;

    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot modify your own account' });
    }

    const allowed = { role: ['admin', 'user'], status: ['active', 'disabled'] };
    if (role && !allowed.role.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    if (status && !allowed.status.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const fields = [];
    const params = [];
    if (role)   { params.push(role);   fields.push(`role = $${params.length}`); }
    if (status) { params.push(status); fields.push(`status = $${params.length}`); }
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

    const { rows: [existing] } = await query('SELECT id, status FROM users WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'User not found' });

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
