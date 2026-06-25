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
