const express = require('express');
const { query } = require('../db/client');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { isAdminRole } = require('../lib/is-admin');
const { referenceVersionsCte } = require('../lib/pot-fee-sql');

const router = express.Router();

// GET /api/pipeline-years
// Admin: all years (active + inactive). Non-admin: only active years.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const isAdmin = isAdminRole(req.user.role);
    const whereClause = isAdmin ? '' : 'WHERE active = true';
    const { rows } = await query(
      `SELECT id, year, active, created_at FROM pipeline_years ${whereClause} ORDER BY year DESC`
    );

    // offers per year: visible proposals whose display version is not Canceled, counted in the year
    // of that version. The display version is the shared server rule (referenceVersionsCte): among
    // non-Draft versions, one with projects (through either link) first, then the newest. Visibility
    // mirrors GET /api/cost-grids: admin sees all, a user only what they own or that is shared.
    const visibility = isAdmin ? '' : `AND (
        cg.owner_id = $1
        OR EXISTS(SELECT 1 FROM resource_shares rs
                  WHERE rs.resource_type = 'cost_grid' AND rs.resource_id = cg.id AND rs.user_id = $1)
      )`;
    const { rows: counts } = await query(
      `WITH ${referenceVersionsCte()}
       SELECT ref_v.pipeline_year AS year, COUNT(*)::int AS offers
       FROM ref_v
       JOIN cost_grids cg ON cg.id = ref_v.cost_grid_id
       WHERE ref_v.pipeline <> 'Canceled'
         AND ref_v.pipeline_year IS NOT NULL ${visibility}
       GROUP BY ref_v.pipeline_year`,
      isAdmin ? [] : [req.user.id]
    );
    const byYear = new Map(counts.map(c => [Number(c.year), c.offers]));
    res.json(rows.map(r => ({ ...r, offers: byYear.get(Number(r.year)) || 0 })));
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
