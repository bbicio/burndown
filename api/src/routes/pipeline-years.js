const express = require('express');
const { query } = require('../db/client');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
  next();
}

// GET /api/pipeline-years
// Admin: all years (active + inactive). Non-admin: only active years.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const whereClause = isAdmin ? '' : 'WHERE active = true';
    const { rows } = await query(
      `SELECT id, year, active, created_at FROM pipeline_years ${whereClause} ORDER BY year DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/pipeline-years — create a new pipeline year (admin only)
router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { year, active = true } = req.body;
    const yr = parseInt(year);
    if (!yr || yr < 2000 || yr > 2100) return res.status(400).json({ error: 'A valid year (2000–2100) is required' });

    const { rows } = await query(
      'INSERT INTO pipeline_years (year, active) VALUES ($1, $2) RETURNING id, year, active, created_at',
      [yr, Boolean(active)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Pipeline year already exists' });
    next(err);
  }
});

// PATCH /api/pipeline-years/:id — toggle active / inactive (admin only)
router.patch('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { active } = req.body;
    if (active == null) return res.status(400).json({ error: 'active is required' });

    const { rows } = await query(
      'UPDATE pipeline_years SET active = $1 WHERE id = $2 RETURNING id, year, active, created_at',
      [Boolean(active), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Pipeline year not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/pipeline-years/:id (admin only)
// Blocked if any cost grid version has pipeline_year = this year.
router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { rows: py } = await query('SELECT year FROM pipeline_years WHERE id = $1', [req.params.id]);
    if (!py[0]) return res.status(404).json({ error: 'Pipeline year not found' });

    const { rows: inUse } = await query(
      'SELECT 1 FROM cost_grid_versions WHERE pipeline_year = $1 LIMIT 1',
      [py[0].year]
    );
    if (inUse.length) {
      return res.status(409).json({
        error: `Pipeline ${py[0].year} cannot be deleted because it has proposals. Deactivate it instead.`,
      });
    }

    await query('DELETE FROM pipeline_years WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
