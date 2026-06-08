const express = require('express');
const { query } = require('../db/client');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

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
