const express = require('express');
const { query, pool } = require('../db/client');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/client-groups — list all groups with their clients; admins also get each group's POT years
// (a plain user reads this list on the pipeline page and has no business seeing POT ids)
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const isAdmin = ['admin', 'sysadmin'].includes(req.user.role);
    const { rows } = await query(
      `SELECT cg.id, cg.name, cg.created_at,
              COALESCE(
                json_agg(json_build_object('id', c.id, 'name', c.name) ORDER BY c.name)
                FILTER (WHERE c.id IS NOT NULL),
                '[]'
              ) AS clients,
              COALESCE(
                (SELECT json_agg(json_build_object('id', p.id, 'year', p.year) ORDER BY p.year DESC)
                 FROM pots p WHERE p.client_group_id = cg.id),
                '[]'
              ) AS pots
       FROM client_groups cg
       LEFT JOIN clients c ON c.group_id = cg.id
       GROUP BY cg.id, cg.name, cg.created_at
       ORDER BY cg.name`
    );
    res.json(isAdmin ? rows : rows.map(({ pots, ...group }) => group));
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

// The group row is locked before the POTs are looked at: a POT inserted meanwhile waits on the lock
// (its foreign key needs the row) and then fails, so the cascade can never delete a POT unseen.
// Returns { status, body } for the route to send.
async function deleteGroup(id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const group = await client.query('SELECT id FROM client_groups WHERE id = $1 FOR UPDATE', [id]);
    if (!group.rows[0]) { await client.query('ROLLBACK'); return { status: 404, body: { error: 'Group not found' } }; }
    const pot = await client.query('SELECT 1 FROM pots WHERE client_group_id = $1 LIMIT 1', [id]);
    if (pot.rows[0]) {
      await client.query('ROLLBACK');
      return { status: 409, body: { error: 'Group has a POT: remove the POT first.', code: 'GROUP_HAS_POT' } };
    }
    await client.query('DELETE FROM client_groups WHERE id = $1', [id]);
    await client.query('COMMIT');
    return { status: 200, body: { ok: true } };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection already gone */ }
    throw err;
  } finally {
    client.release();
  }
}

// DELETE /api/client-groups/:id (admin only)
// Clients are unlinked automatically (group_id SET NULL via FK); a group with a POT is refused
// (the POT would be deleted by cascade), 409 GROUP_HAS_POT.
router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { status, body } = await deleteGroup(req.params.id);
    res.status(status).json(body);
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
