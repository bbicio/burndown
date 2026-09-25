const express = require('express');
const { query } = require('../db/client');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { slugify } = require('../lib/slugify');
const { enqueueAllQuiet } = require('../services/profile-engine');

const router = express.Router();

// Reads are open to any authenticated user (e.g. the tag-assignment UI on
// costgrid.html/project-config.html, used by editors — not just admins). Writes
// stay admin-only, applied per-route below.
router.use(requireAuth);

// GET /api/attribute-lists — all lists with their active item count
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT al.id, al.name, al.slug, al.created_at,
              COUNT(ali.id) FILTER (WHERE ali.status = 'active')::int AS active_item_count
       FROM attribute_lists al
       LEFT JOIN attribute_list_items ali ON ali.list_id = al.id
       GROUP BY al.id
       ORDER BY al.name`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/attribute-lists
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const slug = slugify(name);
    if (!slug) return res.status(400).json({ error: 'name must contain at least one letter or number' });
    if (slug.length > 100) return res.status(400).json({ error: 'name produces a slug longer than 100 characters — please use a shorter name' });
    const { rows } = await query(
      `INSERT INTO attribute_lists (name, slug) VALUES ($1, $2) RETURNING id, name, slug, created_at`,
      [name.trim(), slug]
    );
    res.status(201).json({ ...rows[0], active_item_count: 0 });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A list with this name already exists' });
    next(err);
  }
});

// PATCH /api/attribute-lists/:id — rename only, slug is immutable
router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const { rows } = await query(
      `UPDATE attribute_lists SET name = $1 WHERE id = $2 RETURNING id, name, slug, created_at`,
      [name.trim(), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'List not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/attribute-lists/:id/items
router.get('/:id/items', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, list_id, label, status, created_at FROM attribute_list_items WHERE list_id = $1 ORDER BY label`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/attribute-lists/:id/items
router.post('/:id/items', requireAdmin, async (req, res, next) => {
  try {
    const { label } = req.body;
    if (!label?.trim()) return res.status(400).json({ error: 'label is required' });
    const { rows } = await query(
      `INSERT INTO attribute_list_items (list_id, label) VALUES ($1, $2) RETURNING id, list_id, label, status, created_at`,
      [req.params.id, label.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23503') return res.status(404).json({ error: 'List not found' });
    if (err.code === '23505') return res.status(409).json({ error: 'An item with this label already exists in this list' });
    next(err);
  }
});

// PATCH /api/attribute-lists/:id/items/:itemId
router.patch('/:id/items/:itemId', requireAdmin, async (req, res, next) => {
  try {
    const { label, status } = req.body;
    const fields = [];
    const values = [];
    let i = 1;
    if (label !== undefined) {
      if (!label?.trim()) return res.status(400).json({ error: 'label cannot be empty' });
      fields.push(`label = $${i++}`); values.push(label.trim());
    }
    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
      fields.push(`status = $${i++}`); values.push(status);
    }
    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.params.itemId, req.params.id);
    const { rows } = await query(
      `UPDATE attribute_list_items SET ${fields.join(', ')} WHERE id = $${i} AND list_id = $${i + 1}
       RETURNING id, list_id, label, status, created_at`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: 'Item not found' });
    if (label !== undefined) await enqueueAllQuiet();   // profiles store the label at aggregation time
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'An item with this label already exists in this list' });
    next(err);
  }
});

module.exports = router;
