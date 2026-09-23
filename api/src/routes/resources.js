const express = require('express');
const { query } = require('../db/client');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireAdmin);

// GET /api/resources — all resources (active + inactive), with linked user resolved
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT r.id, r.first_name, r.last_name, r.email, r.job_title, r.job_description,
              r.user_id, r.status, r.created_at,
              u.first_name AS linked_user_first_name,
              u.last_name  AS linked_user_last_name,
              u.email      AS linked_user_email
       FROM resources r
       LEFT JOIN users u ON u.id = r.user_id
       ORDER BY r.last_name, r.first_name`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/resources
router.post('/', async (req, res, next) => {
  try {
    const { firstName, lastName, email, jobTitle, jobDescription, userId } = req.body;
    if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !jobTitle?.trim()) {
      return res.status(400).json({ error: 'firstName, lastName, email and jobTitle are required' });
    }
    const { rows } = await query(
      `INSERT INTO resources (first_name, last_name, email, job_title, job_description, user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, first_name, last_name, email, job_title, job_description, user_id, status, created_at`,
      [firstName.trim(), lastName.trim(), email.trim(), jobTitle.trim(), jobDescription?.trim() || null, userId || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ error: 'Linked user not found' });
    next(err);
  }
});

// PATCH /api/resources/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { firstName, lastName, email, jobTitle, jobDescription, userId, status } = req.body;
    const fields = [];
    const values = [];
    let i = 1;
    if (firstName !== undefined)      { fields.push(`first_name = $${i++}`);      values.push(firstName.trim()); }
    if (lastName !== undefined)       { fields.push(`last_name = $${i++}`);       values.push(lastName.trim()); }
    if (email !== undefined)          { fields.push(`email = $${i++}`);           values.push(email.trim()); }
    if (jobTitle !== undefined)       { fields.push(`job_title = $${i++}`);       values.push(jobTitle.trim()); }
    if (jobDescription !== undefined) { fields.push(`job_description = $${i++}`); values.push(jobDescription?.trim() || null); }
    if (userId !== undefined)         { fields.push(`user_id = $${i++}`);         values.push(userId || null); }
    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
      fields.push(`status = $${i++}`); values.push(status);
    }
    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.params.id);
    const { rows } = await query(
      `UPDATE resources SET ${fields.join(', ')} WHERE id = $${i}
       RETURNING id, first_name, last_name, email, job_title, job_description, user_id, status, created_at`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: 'Resource not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ error: 'Linked user not found' });
    next(err);
  }
});

// DELETE /api/resources/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await query('DELETE FROM resources WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Resource not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
