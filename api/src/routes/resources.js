const express = require('express');
const { query } = require('../db/client');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const { normalizeName } = require('../lib/match-resource');
const { refreshUnmatched } = require('../services/resource-matching');

const router = express.Router();

router.use(requireAuth, requireAdmin);

// Best-effort full rescan after an admin change that can alter which names match.
async function rescanAll() {
  try { await refreshUnmatched(null); }
  catch (err) { console.warn('[resources] refreshUnmatched:', err.message); }
}

// Both role_id and user_id are FKs on `resources`; tell them apart by constraint name.
function fkErrorMessage(err) {
  return /role_id/.test(err.constraint || '') ? 'Role not found' : 'Linked user not found';
}

// GET /api/resources/unmatched — owner names from actuals that need an admin's attention
router.get('/unmatched', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT name_normalized,
              (array_agg(display_name ORDER BY hours DESC))[1] AS display_name,
              ROUND(SUM(hours), 2)::float AS hours,
              COUNT(DISTINCT project_code)::int AS projects,
              (array_agg(candidate_resource_ids))[1] AS candidate_resource_ids
       FROM profile_unmatched
       GROUP BY name_normalized
       ORDER BY SUM(hours) DESC, name_normalized`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/resources/unmatched/rescan — recompute the queue from all uploaded actuals
router.post('/unmatched/rescan', async (req, res, next) => {
  try {
    const unmatched = await refreshUnmatched(null);
    res.json({ ok: true, unmatched });
  } catch (err) { next(err); }
});

// GET /api/resources/aliases
router.get('/aliases', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT a.id, a.alias_normalized, a.display_name, a.resource_id, a.created_by, a.created_at,
              a.updated_by, a.updated_at, r.first_name, r.last_name
       FROM resource_aliases a
       LEFT JOIN resources r ON r.id = a.resource_id
       ORDER BY a.alias_normalized`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/resources/aliases — { name, resourceId } assigns a name to a resource;
// { name, ignore: true } marks it as not-a-person. Upserts on the normalized name.
router.post('/aliases', async (req, res, next) => {
  try {
    const { name, resourceId, ignore } = req.body;
    const key = normalizeName(name);
    if (!key) return res.status(400).json({ error: 'name is required' });
    const wantsIgnore = ignore === true;
    if (wantsIgnore === !!resourceId) {
      return res.status(400).json({ error: 'Provide either resourceId or ignore: true' });
    }
    // Upsert on the normalized key: a re-assignment keeps created_by, records updated_by/updated_at,
    // and is reported as 200 (only a genuine insert is 201; `xmax = 0` is true only for an insert).
    const { rows } = await query(
      `INSERT INTO resource_aliases (alias_normalized, display_name, resource_id, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT (alias_normalized) DO UPDATE
         SET resource_id = EXCLUDED.resource_id, display_name = EXCLUDED.display_name,
             updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING id, alias_normalized, display_name, resource_id, (xmax = 0) AS created`,
      [key, String(name).trim(), wantsIgnore ? null : resourceId, req.user.id]
    );
    await rescanAll();
    const { created, ...alias } = rows[0];
    res.status(created ? 201 : 200).json(alias);
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ error: 'Resource not found' });
    if (err.code === '22P02') return res.status(400).json({ error: 'resourceId must be a valid UUID' });
    next(err);
  }
});

// DELETE /api/resources/aliases/:id
router.delete('/aliases/:id', async (req, res, next) => {
  try {
    const { rows } = await query('DELETE FROM resource_aliases WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Alias not found' });
    await rescanAll();
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '22P02') return res.status(404).json({ error: 'Alias not found' });
    next(err);
  }
});

// GET /api/resources — all resources (active + inactive), with linked user resolved
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT r.id, r.first_name, r.last_name, r.email, r.job_description,
              r.role_id, ro.label AS role_label, ro.code AS role_code,
              r.user_id, r.status, r.created_at,
              u.first_name AS linked_user_first_name,
              u.last_name  AS linked_user_last_name,
              u.email      AS linked_user_email
       FROM resources r
       JOIN roles ro ON ro.id = r.role_id
       LEFT JOIN users u ON u.id = r.user_id
       ORDER BY r.last_name, r.first_name`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/resources
router.post('/', async (req, res, next) => {
  try {
    const { firstName, lastName, email, roleId, jobDescription, userId } = req.body;
    if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !roleId) {
      return res.status(400).json({ error: 'firstName, lastName, email and roleId are required' });
    }
    const { rows } = await query(
      `INSERT INTO resources (first_name, last_name, email, role_id, job_description, user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, first_name, last_name, email, role_id, job_description, user_id, status, created_at`,
      [firstName.trim(), lastName.trim(), email.trim(), roleId, jobDescription?.trim() || null, userId || null]
    );
    await rescanAll();
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ error: fkErrorMessage(err) });
    if (err.code === '22P02') return res.status(400).json({ error: 'roleId and userId must be valid UUIDs' });
    next(err);
  }
});

// PATCH /api/resources/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { firstName, lastName, email, roleId, jobDescription, userId, status } = req.body;
    const fields = [];
    const values = [];
    let i = 1;
    if (firstName !== undefined) {
      if (!firstName?.trim()) return res.status(400).json({ error: 'firstName cannot be empty' });
      fields.push(`first_name = $${i++}`); values.push(firstName.trim());
    }
    if (lastName !== undefined) {
      if (!lastName?.trim()) return res.status(400).json({ error: 'lastName cannot be empty' });
      fields.push(`last_name = $${i++}`); values.push(lastName.trim());
    }
    if (email !== undefined) {
      if (!email?.trim()) return res.status(400).json({ error: 'email cannot be empty' });
      fields.push(`email = $${i++}`); values.push(email.trim());
    }
    if (roleId !== undefined) {
      if (!roleId) return res.status(400).json({ error: 'roleId cannot be empty' });
      fields.push(`role_id = $${i++}`); values.push(roleId);
    }
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
       RETURNING id, first_name, last_name, email, role_id, job_description, user_id, status, created_at`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: 'Resource not found' });
    if (firstName !== undefined || lastName !== undefined || status !== undefined) await rescanAll();
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ error: fkErrorMessage(err) });
    if (err.code === '22P02') return res.status(400).json({ error: 'roleId and userId must be valid UUIDs' });
    next(err);
  }
});

// DELETE /api/resources/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await query('DELETE FROM resources WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Resource not found' });
    await rescanAll();
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
