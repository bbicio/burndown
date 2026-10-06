const express = require('express');
const { query } = require('../db/client');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { isAdminRole } = require('../lib/is-admin');

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

    // offers per year: visible proposals whose display version is not Canceled.
    // Display version mirrors pbGetDisplayVersion (pipeline.html): among non-Draft versions, one with
    // linked projects first, then the newest. Visibility mirrors GET /api/cost-grids (the non-Draft
    // version is guaranteed by the join): admin sees all, a user only what they own or that is shared.
    const visibility = isAdmin ? '' : `AND (
        cg.owner_id = $1
        OR EXISTS(SELECT 1 FROM resource_shares rs
                  WHERE rs.resource_type = 'cost_grid' AND rs.resource_id = cg.id AND rs.user_id = $1)
      )`;
    const { rows: counts } = await query(
      `WITH disp AS (
         SELECT DISTINCT ON (cg.id) cg.id, v.pipeline
         FROM cost_grids cg
         JOIN cost_grid_versions v ON v.cost_grid_id = cg.id AND v.pipeline <> 'Draft'
         WHERE 1=1 ${visibility}
         ORDER BY cg.id,
                  EXISTS(SELECT 1 FROM cg_version_projects cvp WHERE cvp.cost_grid_version_id = v.id) DESC,
                  v.created_at DESC
       )
       SELECT y.pipeline_year AS year, COUNT(DISTINCT d.id)::int AS offers
       FROM disp d
       JOIN (SELECT DISTINCT cost_grid_id, pipeline_year
             FROM cost_grid_versions WHERE pipeline <> 'Draft') y ON y.cost_grid_id = d.id
       WHERE d.pipeline <> 'Canceled'
       GROUP BY y.pipeline_year`,
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
