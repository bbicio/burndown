const express = require('express');
const { query, pool } = require('../db/client');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All endpoints require admin
router.use(requireAuth, requireAdmin);

const SCOPES = {
  proposals: {
    label: 'Proposals',
    // cost_grids CASCADE → cost_grid_versions CASCADE → phases/tasks/task_roles/cg_version_projects
    // resource_shares for cost_grid type deleted separately (no FK cascade)
    sql: `
      DELETE FROM resource_shares WHERE resource_type = 'cost_grid';
      DELETE FROM cost_grids;
    `,
  },
  projects: {
    label: 'Projects & Programs',
    // projects CASCADE → project_tasks, cg_version_projects
    // resource_shares for project type deleted separately
    sql: `
      DELETE FROM resource_shares WHERE resource_type = 'project';
      DELETE FROM projects;
      DELETE FROM programs;
    `,
  },
  clients: {
    label: 'Clients & Client Groups',
    // pots CASCADE from client_groups and clients → pot_history CASCADE from pots
    // clients.group_id SET NULL when client_group deleted
    sql: `
      DELETE FROM pots;
      DELETE FROM client_groups;
      DELETE FROM clients;
    `,
  },
  ratecards: {
    label: 'Client Ratecards',
    // ratecard_entries CASCADE from ratecards
    // cost_grid_versions.ratecard_id SET NULL on ratecard delete
    sql: `
      DELETE FROM ratecards WHERE client_id IS NOT NULL;
    `,
  },
  actuals: {
    label: 'Actuals (Timesheets)',
    sql: `
      DELETE FROM timesheets;
    `,
  },
  pipelines: {
    label: 'Pipeline Years & POTs',
    // pot_history CASCADE from pots
    sql: `
      DELETE FROM pots;
      DELETE FROM pipeline_years;
    `,
  },
  notifications: {
    label: 'Notifications',
    sql: `
      DELETE FROM notifications;
    `,
  },
};

// GET /api/admin/reset/scopes — list available scopes with labels
router.get('/scopes', (req, res) => {
  res.json(Object.entries(SCOPES).map(([key, { label }]) => ({ key, label })));
});

// PATCH /api/admin/reset/cost-grid/:cgId/owner — reassign a proposal to a different active user
router.patch('/cost-grid/:cgId/owner', async (req, res, next) => {
  const { cgId } = req.params;
  const { ownerId } = req.body;
  if (!ownerId) return res.status(400).json({ error: 'ownerId is required' });

  try {
    const cg = await query('SELECT id, name FROM cost_grids WHERE id = $1', [cgId]);
    if (cg.rows.length === 0) return res.status(404).json({ error: 'Cost grid not found' });

    const user = await query(`SELECT id, first_name, last_name FROM users WHERE id = $1 AND status = 'active'`, [ownerId]);
    if (user.rows.length === 0) return res.status(404).json({ error: 'Active user not found' });

    await query('UPDATE cost_grids SET owner_id = $1 WHERE id = $2', [ownerId, cgId]);
    res.json({
      ok: true,
      cgName: cg.rows[0].name,
      newOwner: `${user.rows[0].first_name} ${user.rows[0].last_name}`,
    });
  } catch (err) { next(err); }
});

// POST /api/admin/reset/cost-grid/:cgId — delete one cost grid + all linked projects
router.post('/cost-grid/:cgId', async (req, res, next) => {
  const { cgId } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify the cost grid exists
    const exists = await client.query('SELECT id, name FROM cost_grids WHERE id = $1', [cgId]);
    if (exists.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cost grid not found' });
    }

    // Collect linked project IDs across all versions
    const linkedProjects = await client.query(
      `SELECT DISTINCT cvp.project_id FROM cg_version_projects cvp
       JOIN cost_grid_versions cgv ON cgv.id = cvp.cost_grid_version_id
       WHERE cgv.cost_grid_id = $1`,
      [cgId]
    );
    const projectIds = linkedProjects.rows.map(r => r.project_id);

    let deleted = 0;

    // Delete shares for the cost grid
    const r1 = await client.query(
      `DELETE FROM resource_shares WHERE resource_type = 'cost_grid' AND resource_id = $1`, [cgId]
    );
    deleted += r1.rowCount;

    // Delete shares + linked projects (cascade: project_tasks, cg_version_projects)
    if (projectIds.length > 0) {
      const r2 = await client.query(
        `DELETE FROM resource_shares WHERE resource_type = 'project' AND resource_id = ANY($1::uuid[])`,
        [projectIds]
      );
      deleted += r2.rowCount;
      const r3 = await client.query('DELETE FROM projects WHERE id = ANY($1::uuid[])', [projectIds]);
      deleted += r3.rowCount;
    }

    // Delete cost grid (cascade: versions → phases → tasks → task_roles, cg_version_projects)
    const r4 = await client.query('DELETE FROM cost_grids WHERE id = $1', [cgId]);
    deleted += r4.rowCount;

    await client.query('COMMIT');
    res.json({ ok: true, cgName: exists.rows[0].name, projectsDeleted: projectIds.length, deleted });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// POST /api/admin/reset/:scope
router.post('/:scope', async (req, res, next) => {
  const scope = SCOPES[req.params.scope];
  if (!scope) return res.status(400).json({ error: 'Unknown scope' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Execute each statement in the scope's SQL block
    const stmts = scope.sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    let totalDeleted = 0;
    for (const stmt of stmts) {
      const result = await client.query(stmt);
      totalDeleted += result.rowCount || 0;
    }
    await client.query('COMMIT');
    res.json({ ok: true, scope: req.params.scope, deleted: totalDeleted });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
