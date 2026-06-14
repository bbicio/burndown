const express = require('express');
const { query } = require('../db/client');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
  next();
}

// GET /api/client-groups — list all groups with their clients
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT cg.id, cg.name, cg.created_at,
              COALESCE(
                json_agg(json_build_object('id', c.id, 'name', c.name) ORDER BY c.name)
                FILTER (WHERE c.id IS NOT NULL),
                '[]'
              ) AS clients
       FROM client_groups cg
       LEFT JOIN clients c ON c.group_id = cg.id
       GROUP BY cg.id, cg.name, cg.created_at
       ORDER BY cg.name`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/client-groups (admin only)
router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const { rows } = await query(
      `INSERT INTO client_groups (name) VALUES ($1) RETURNING id, name, created_at`,
      [name.trim()]
    );
    res.status(201).json({ ...rows[0], clients: [] });
  } catch (err) { next(err); }
});

// PATCH /api/client-groups/:id (admin only)
router.patch('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const { rows } = await query(
      'UPDATE client_groups SET name = $1 WHERE id = $2 RETURNING id, name, created_at',
      [name.trim(), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Group not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/client-groups/:id (admin only)
// Clients are unlinked automatically (group_id SET NULL via FK)
router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await query(
      'DELETE FROM client_groups WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Group not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PUT /api/client-groups/:id/clients/:clientId — assign client to group (admin only)
router.put('/:id/clients/:clientId', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const group = await query('SELECT id FROM client_groups WHERE id = $1', [req.params.id]);
    if (!group.rows[0]) return res.status(404).json({ error: 'Group not found' });

    const client = await query('SELECT id, group_id FROM clients WHERE id = $1', [req.params.clientId]);
    if (!client.rows[0]) return res.status(404).json({ error: 'Client not found' });

    const existingGroupId = client.rows[0].group_id;
    if (existingGroupId && existingGroupId !== req.params.id) {
      return res.status(400).json({ error: 'Client already belongs to another group' });
    }

    await query('UPDATE clients SET group_id = $1 WHERE id = $2', [req.params.id, req.params.clientId]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/client-groups/:id/clients/:clientId — remove client from group (admin only)
router.delete('/:id/clients/:clientId', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    await query(
      'UPDATE clients SET group_id = NULL WHERE id = $1 AND group_id = $2',
      [req.params.clientId, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
