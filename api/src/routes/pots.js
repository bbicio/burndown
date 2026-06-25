const express = require('express');
const { query } = require('../db/client');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
  next();
}

// GET /api/pots/pipeline-summary?year=YYYY
// Per-stage count + total budget value for the whole pipeline year (all users).
// Must be declared before /:id routes.
router.get('/pipeline-summary', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { year } = req.query;
    if (!year) return res.status(400).json({ error: 'year is required' });
    const yr = parseInt(year);

    const { rows } = await query(
      `SELECT
         cgv.pipeline,
         COUNT(DISTINCT cgv.id)::int AS count,
         COALESCE(SUM((
           SELECT COALESCE(SUM(
             tr.days * 8 * COALESCE(
               tr.rate_override,
               (SELECT re.hourly_rate FROM ratecard_entries re
                WHERE re.ratecard_id = cgv.ratecard_id AND re.role_id = tr.role_id LIMIT 1),
               ro.hourly_rate, 0
             )
           ), 0)
           FROM phases ph
           JOIN tasks tk ON tk.phase_id = ph.id
           JOIN task_roles tr ON tr.task_id = tk.id
           JOIN roles ro ON ro.id = tr.role_id
           WHERE ph.version_id = cgv.id
         )), 0) AS total
       FROM cost_grid_versions cgv
       WHERE cgv.pipeline_year = $1
         AND cgv.pipeline IN ('SIP','Expected','Anticipated','Committed','Canceled')
       GROUP BY cgv.pipeline`,
      [yr]
    );

    const stages = ['SIP', 'Expected', 'Anticipated', 'Committed', 'Canceled'];
    const byStage = Object.fromEntries(rows.map(r => [r.pipeline, r]));
    res.json(stages.map(s => ({
      pipeline: s,
      count:    byStage[s]?.count || 0,
      total:    parseFloat(byStage[s]?.total || 0),
    })));
  } catch (err) { next(err); }
});

// GET /api/pots/year-totals
// Returns { year: { pot_total, achieved_total } } for all years with POTs or pipeline data.
// "achieved" = Committed + Anticipated fee values.
// Must be declared before /:id routes.
router.get('/year-totals', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { rows: potRows } = await query(
      `SELECT year, COALESCE(SUM(amount), 0) AS pot_total FROM pots GROUP BY year`
    );

    const { rows: valRows } = await query(
      `SELECT cgv.pipeline_year AS year,
              COALESCE(SUM((
                SELECT COALESCE(SUM(
                  tr.days * 8 * COALESCE(
                    tr.rate_override,
                    (SELECT re.hourly_rate FROM ratecard_entries re
                     WHERE re.ratecard_id = cgv.ratecard_id AND re.role_id = tr.role_id LIMIT 1),
                    ro.hourly_rate, 0
                  )
                ), 0)
                FROM phases ph
                JOIN tasks tk ON tk.phase_id = ph.id
                JOIN task_roles tr ON tr.task_id = tk.id
                JOIN roles ro ON ro.id = tr.role_id
                WHERE ph.version_id = cgv.id
              )), 0) AS achieved_total
       FROM cost_grid_versions cgv
       WHERE cgv.pipeline IN ('Committed', 'Anticipated')
         AND cgv.pipeline_year IS NOT NULL
       GROUP BY cgv.pipeline_year`
    );

    const result = {};
    for (const r of potRows) {
      result[r.year] = { pot_total: parseFloat(r.pot_total), achieved_total: 0 };
    }
    for (const r of valRows) {
      if (!result[r.year]) result[r.year] = { pot_total: 0, achieved_total: 0 };
      result[r.year].achieved_total = parseFloat(r.achieved_total);
    }
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/pots/summary?year=YYYY&(clientId=...|clientGroupId=...)
// Returns the POT target + all non-Draft proposals for that target/year.
// Must be declared before /:id routes to avoid Express routing conflicts.
router.get('/summary', requireAuth, async (req, res, next) => {
  try {
    const { year, clientId, clientGroupId } = req.query;
    if (!year || (!clientId && !clientGroupId)) {
      return res.status(400).json({ error: 'year and clientId or clientGroupId are required' });
    }
    const yr = parseInt(year);

    // Resolve the POT target
    let potQ, potParams;
    if (clientGroupId) {
      potQ = 'SELECT * FROM pots WHERE client_group_id = $1 AND year = $2';
      potParams = [clientGroupId, yr];
    } else {
      potQ = 'SELECT * FROM pots WHERE client_id = $1 AND year = $2';
      potParams = [clientId, yr];
    }
    const potResult = await query(potQ, potParams);
    const pot = potResult.rows[0] || null;

    // Find all non-Draft proposals for this target + year (match via cgv.client_id)
    let proposalsQ, proposalsParams;
    if (clientGroupId) {
      proposalsQ = `
        SELECT DISTINCT
          cgv.id AS version_id, cgv.label, cgv.pipeline, cgv.pipeline_year,
          cg.id AS cg_id, cg.name AS proposal_name,
          u.first_name || ' ' || u.last_name AS owner_name
        FROM cost_grid_versions cgv
        JOIN cost_grids cg ON cg.id = cgv.cost_grid_id
        JOIN users u ON u.id = cg.owner_id
        WHERE cgv.client_id IN (SELECT id FROM clients WHERE group_id = $1)
          AND cgv.pipeline_year = $2
          AND cgv.pipeline != 'Draft'
        ORDER BY cgv.pipeline, cg.name`;
      proposalsParams = [clientGroupId, yr];
    } else {
      proposalsQ = `
        SELECT DISTINCT
          cgv.id AS version_id, cgv.label, cgv.pipeline, cgv.pipeline_year,
          cg.id AS cg_id, cg.name AS proposal_name,
          u.first_name || ' ' || u.last_name AS owner_name
        FROM cost_grid_versions cgv
        JOIN cost_grids cg ON cg.id = cgv.cost_grid_id
        JOIN users u ON u.id = cg.owner_id
        WHERE cgv.client_id = $1
          AND cgv.pipeline_year = $2
          AND cgv.pipeline != 'Draft'
        ORDER BY cgv.pipeline, cg.name`;
      proposalsParams = [clientId, yr];
    }
    const proposalsResult = await query(proposalsQ, proposalsParams);

    res.json({ pot, proposals: proposalsResult.rows });
  } catch (err) { next(err); }
});

// GET /api/pots[?year=YYYY]
// Includes achieved_total (Committed + Anticipated professional fees) per POT row.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { year } = req.query;
    const params = [];
    let whereClause = '';
    if (year) {
      params.push(parseInt(year));
      whereClause = 'WHERE p.year = $1';
    }

    const feeExpr = `COALESCE((
      SELECT SUM(tr.days * 8 * COALESCE(
        tr.rate_override,
        (SELECT re.hourly_rate FROM ratecard_entries re
         WHERE re.ratecard_id = cgv2.ratecard_id AND re.role_id = tr.role_id LIMIT 1),
        ro.hourly_rate, 0))
      FROM phases ph2
      JOIN tasks tk2 ON tk2.phase_id = ph2.id
      JOIN task_roles tr ON tr.task_id = tk2.id
      JOIN roles ro ON ro.id = tr.role_id
      WHERE ph2.version_id = cgv2.id
    ), 0)`;

    const { rows } = await query(
      `SELECT p.id, p.year, p.amount, p.created_at, p.special_label,
              p.client_group_id, cg.name AS client_group_name,
              p.client_id, c.name AS client_name,
              COALESCE((
                SELECT SUM(${feeExpr})
                FROM cost_grid_versions cgv2
                WHERE cgv2.pipeline IN ('Committed', 'Anticipated')
                  AND cgv2.pipeline_year = p.year
                  AND (
                    (p.client_id IS NOT NULL AND cgv2.client_id = p.client_id)
                    OR
                    (p.client_group_id IS NOT NULL AND cgv2.client_id IN (
                      SELECT id FROM clients WHERE group_id = p.client_group_id
                    ))
                  )
              ), 0) AS achieved_total
       FROM pots p
       LEFT JOIN client_groups cg ON cg.id = p.client_group_id
       LEFT JOIN clients c ON c.id = p.client_id
       ${whereClause}
       ORDER BY p.year DESC, COALESCE(p.special_label, cg.name, c.name)`,
      params
    );
    res.json(rows.map(r => ({ ...r, achieved_total: parseFloat(r.achieved_total) || 0 })));
  } catch (err) { next(err); }
});

// POST /api/pots (admin only)
router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { clientGroupId, clientId, specialLabel, year, amount } = req.body;
    if (!year || amount == null) return res.status(400).json({ error: 'year and amount are required' });
    // Must have exactly one of: clientGroupId, clientId, or specialLabel
    const targets = [clientGroupId, clientId, specialLabel].filter(Boolean);
    if (targets.length !== 1) {
      return res.status(400).json({ error: 'Exactly one of clientGroupId, clientId, or specialLabel is required' });
    }
    const { rows } = await query(
      `INSERT INTO pots (client_group_id, client_id, special_label, year, amount)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [clientGroupId || null, clientId || null, specialLabel || null, parseInt(year), parseFloat(amount)]
    );
    await query(
      'INSERT INTO pot_history (pot_id, old_value, new_value, changed_by) VALUES ($1, NULL, $2, $3)',
      [rows[0].id, parseFloat(amount), req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A POT already exists for this target and year' });
    next(err);
  }
});

// GET /api/pots/:id/details?year=YYYY (admin only)
// Returns POT metadata, change history, committed+anticipated total, and all scoped proposals.
// Proposals are matched via cost_grid_versions.client_id (not through generated projects).
router.get('/:id/details', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { year } = req.query;
    if (!year) return res.status(400).json({ error: 'year is required' });
    const yr = parseInt(year);

    const potRes = await query(
      `SELECT p.*, cg2.name AS client_group_name, c2.name AS client_name
       FROM pots p
       LEFT JOIN client_groups cg2 ON cg2.id = p.client_group_id
       LEFT JOIN clients c2 ON c2.id = p.client_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!potRes.rows[0]) return res.status(404).json({ error: 'POT not found' });
    const pot = potRes.rows[0];

    const histRes = await query(
      `SELECT ph.id, ph.old_value, ph.new_value, ph.note, ph.changed_at,
              u.first_name || ' ' || u.last_name AS changed_by_name
       FROM pot_history ph
       LEFT JOIN users u ON u.id = ph.changed_by
       WHERE ph.pot_id = $1
       ORDER BY ph.changed_at DESC`,
      [req.params.id]
    );

    const valueExpr = `COALESCE((
      SELECT SUM(tr.days * 8 * COALESCE(
        tr.rate_override,
        (SELECT re.hourly_rate FROM ratecard_entries re
         WHERE re.ratecard_id = cgv.ratecard_id AND re.role_id = tr.role_id LIMIT 1),
        ro.hourly_rate, 0))
      FROM phases ph
      JOIN tasks tk ON tk.phase_id = ph.id
      JOIN task_roles tr ON tr.task_id = tk.id
      JOIN roles ro ON ro.id = tr.role_id
      WHERE ph.version_id = cgv.id
    ), 0)`;

    let proposals = [];
    if (pot.client_id || pot.client_group_id) {
      let proposalsQ, proposalsParams;
      if (pot.client_group_id) {
        proposalsQ = `
          SELECT DISTINCT ON (cgv.id)
            cgv.id AS version_id, cgrd.id AS cg_id, cgv.pipeline, cgv.created_at,
            cgrd.name AS proposal_name,
            cli.name AS client_name,
            u.first_name || ' ' || u.last_name AS owner_name,
            ${valueExpr} AS value
          FROM cost_grid_versions cgv
          JOIN cost_grids cgrd ON cgrd.id = cgv.cost_grid_id
          JOIN users u ON u.id = cgrd.owner_id
          LEFT JOIN clients cli ON cli.id = cgv.client_id
          WHERE cgv.client_id IN (SELECT id FROM clients WHERE group_id = $1)
            AND cgv.pipeline_year = $2
            AND cgv.pipeline != 'Draft'
          ORDER BY cgv.id, cgv.created_at DESC`;
        proposalsParams = [pot.client_group_id, yr];
      } else {
        proposalsQ = `
          SELECT DISTINCT ON (cgv.id)
            cgv.id AS version_id, cgrd.id AS cg_id, cgv.pipeline, cgv.created_at,
            cgrd.name AS proposal_name,
            cli.name AS client_name,
            u.first_name || ' ' || u.last_name AS owner_name,
            ${valueExpr} AS value
          FROM cost_grid_versions cgv
          JOIN cost_grids cgrd ON cgrd.id = cgv.cost_grid_id
          JOIN users u ON u.id = cgrd.owner_id
          LEFT JOIN clients cli ON cli.id = cgv.client_id
          WHERE cgv.client_id = $1
            AND cgv.pipeline_year = $2
            AND cgv.pipeline != 'Draft'
          ORDER BY cgv.id, cgv.created_at DESC`;
        proposalsParams = [pot.client_id, yr];
      }
      const proposalsRes = await query(proposalsQ, proposalsParams);
      proposals = proposalsRes.rows.map(r => ({ ...r, value: parseFloat(r.value || 0) }));
    }

    const committedTotal = proposals
      .filter(r => r.pipeline === 'Committed')
      .reduce((s, r) => s + r.value, 0);

    res.json({ pot, history: histRes.rows, committed_total: committedTotal, proposals });
  } catch (err) { next(err); }
});

// GET /api/pots/:id/history (admin only)
router.get('/:id/history', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ph.id, ph.old_value, ph.new_value, ph.note, ph.changed_at,
              u.first_name || ' ' || u.last_name AS changed_by_name
       FROM pot_history ph
       LEFT JOIN users u ON u.id = ph.changed_by
       WHERE ph.pot_id = $1
       ORDER BY ph.changed_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// PATCH /api/pots/:id (admin only)
router.patch('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { amount, note } = req.body;
    if (amount == null) return res.status(400).json({ error: 'amount is required' });
    if (!note || !note.trim()) return res.status(400).json({ error: 'note is required when updating a POT' });
    const old = await query('SELECT amount FROM pots WHERE id = $1', [req.params.id]);
    if (!old.rows[0]) return res.status(404).json({ error: 'POT not found' });
    const { rows } = await query(
      'UPDATE pots SET amount = $1 WHERE id = $2 RETURNING *',
      [parseFloat(amount), req.params.id]
    );
    await query(
      'INSERT INTO pot_history (pot_id, old_value, new_value, note, changed_by) VALUES ($1, $2, $3, $4, $5)',
      [req.params.id, old.rows[0].amount, parseFloat(amount), note.trim(), req.user.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/pots/:id (admin only)
router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await query('DELETE FROM pots WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'POT not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
