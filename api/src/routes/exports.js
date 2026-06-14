const express = require('express');
const { query } = require('../db/client');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendExportEmail } = require('../services/email');

const router = express.Router();

// ── CSV HELPERS ───────────────────────────────────────────────────────────────

function csvCell(v) {
  const s = (v === null || v === undefined) ? '' : String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(headers, rows) {
  return [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
}

// ── POST /api/exports/portfolio ───────────────────────────────────────────────

router.post('/portfolio', requireAuth, async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const visibilityClause = isAdmin
      ? ''
      : `AND (p.owner_id = $1 OR EXISTS(
           SELECT 1 FROM resource_shares rs
           WHERE rs.resource_type = 'project' AND rs.resource_id = p.id AND rs.user_id = $1
         ))`;

    const { rows } = await query(
      `SELECT p.id, p.name, p.program_id, p.pipeline, p.status,
              p.start_date, p.end_date, p.currency,
              c.name AS client_name,
              pr.name AS program_name
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN programs pr ON pr.id = p.program_id
       WHERE 1=1 ${visibilityClause}
       ORDER BY p.name`,
      isAdmin ? [] : [req.user.id]
    );

    const headers = ['ID', 'Name', 'Program', 'Program ID', 'Client', 'Pipeline', 'Status', 'Start Date', 'End Date', 'Currency'];
    const csvRows = rows.map(r => [
      r.id,
      r.name,
      r.program_name || '',
      r.program_id || '',
      r.client_name || '',
      r.pipeline || '',
      r.status || '',
      r.start_date ? String(r.start_date).slice(0, 10) : '',
      r.end_date   ? String(r.end_date).slice(0, 10)   : '',
      r.currency || '',
    ]);

    const content = buildCsv(headers, csvRows);
    const filename = `portfolio_${new Date().toISOString().slice(0, 10)}.csv`;

    await sendExportEmail({
      to: req.user.email,
      firstName: req.user.first_name,
      exports: [{ filename, content, type: 'text/csv' }],
    });

    res.json({ ok: true, email: req.user.email });
  } catch (err) { next(err); }
});

// ── POST /api/exports/cost-grids ──────────────────────────────────────────────

router.post('/cost-grids', requireAuth, async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const visibilityClause = isAdmin
      ? ''
      : `AND (cg.owner_id = $1 OR EXISTS(
           SELECT 1 FROM resource_shares rs
           WHERE rs.resource_type = 'cost_grid' AND rs.resource_id = cg.id AND rs.user_id = $1
         ))`;

    // Fetch all tasks with role assignments for accessible grids
    const { rows } = await query(
      `SELECT
         cg.id AS cg_id, cg.name AS cg_name,
         cgv.id AS ver_id, cgv.label AS ver_label, cgv.pipeline,
         cgv.start_date, cgv.end_date, cgv.currency,
         ph.title AS phase_title,
         tk.id AS task_id, tk.title AS task_title,
         ro.code AS role_code, tr.days
       FROM cost_grids cg
       JOIN cost_grid_versions cgv ON cgv.cost_grid_id = cg.id
       JOIN phases ph ON ph.version_id = cgv.id
       JOIN tasks tk ON tk.phase_id = ph.id
       JOIN task_roles tr ON tr.task_id = tk.id
       JOIN roles ro ON ro.id = tr.role_id
       WHERE 1=1 ${visibilityClause}
       ORDER BY cg.name, cgv.label, ph.sort_order, tk.sort_order`,
      isAdmin ? [] : [req.user.id]
    );

    // Collect all unique role codes
    const roleCodes = [...new Set(rows.map(r => r.role_code))].sort();

    // Group by task
    const taskMap = new Map();
    for (const r of rows) {
      const key = `${r.ver_id}__${r.task_id}`;
      if (!taskMap.has(key)) {
        taskMap.set(key, {
          cg_name:     r.cg_name,
          ver_label:   r.ver_label,
          pipeline:    r.pipeline,
          start_date:  r.start_date,
          end_date:    r.end_date,
          currency:    r.currency,
          phase_title: r.phase_title,
          task_title:  r.task_title,
          roleDays:    {},
        });
      }
      taskMap.get(key).roleDays[r.role_code] = (taskMap.get(key).roleDays[r.role_code] || 0) + Number(r.days);
    }

    const headers = [
      'Cost Grid', 'Version', 'Pipeline', 'Start Date', 'End Date', 'Currency',
      'Phase', 'Task',
      ...roleCodes.map(c => `${c} (days)`),
    ];

    const csvRows = [...taskMap.values()].map(t => [
      t.cg_name,
      t.ver_label,
      t.pipeline || '',
      t.start_date ? String(t.start_date).slice(0, 10) : '',
      t.end_date   ? String(t.end_date).slice(0, 10)   : '',
      t.currency || '',
      t.phase_title,
      t.task_title,
      ...roleCodes.map(c => t.roleDays[c] != null ? t.roleDays[c] : ''),
    ]);

    const content = buildCsv(headers, csvRows);
    const filename = `cost_grids_${new Date().toISOString().slice(0, 10)}.csv`;

    await sendExportEmail({
      to: req.user.email,
      firstName: req.user.first_name,
      exports: [{ filename, content, type: 'text/csv' }],
    });

    res.json({ ok: true, email: req.user.email });
  } catch (err) { next(err); }
});

// ── POST /api/exports/ratecards ───────────────────────────────────────────────

router.post('/ratecards', requireAdmin, async (req, res, next) => {
  try {
    // Load all roles
    const { rows: roleRows } = await query('SELECT id, code, label FROM roles ORDER BY code');

    // Load all ratecards with client info
    const { rows: rcRows } = await query(
      `SELECT rc.id, rc.name, c.name AS client_name
       FROM ratecards rc
       LEFT JOIN clients c ON c.id = rc.client_id
       ORDER BY rc.client_id NULLS FIRST, rc.name`
    );

    // Load all ratecard entries
    const { rows: entryRows } = await query(
      'SELECT ratecard_id, role_id, hourly_rate FROM ratecard_entries'
    );

    // Build a lookup: ratecard_id → Map(role_id → rate)
    const rcEntries = new Map();
    for (const e of entryRows) {
      if (!rcEntries.has(e.ratecard_id)) rcEntries.set(e.ratecard_id, new Map());
      rcEntries.get(e.ratecard_id).set(e.role_id, e.hourly_rate);
    }

    // Separate default (client_id IS NULL) from client-specific
    const defaultRc  = rcRows.filter(r => !r.client_name);
    const clientRcs  = rcRows.filter(r => !!r.client_name);

    // Build column headers: Role Code, Role Label, Default (rate)..., Client (rcName)...
    const rcCols = [
      ...defaultRc.map(r => `Default (${r.name})`),
      ...clientRcs.map(r => `${r.client_name} (${r.name})`),
    ];
    const rcColsData = [...defaultRc, ...clientRcs];

    const headers = ['Role Code', 'Role Label', ...rcCols];

    const csvRows = roleRows.map(role => [
      role.code,
      role.label,
      ...rcColsData.map(rc => {
        const m = rcEntries.get(rc.id);
        const rate = m ? m.get(role.id) : undefined;
        return rate != null ? rate : '';
      }),
    ]);

    const content = buildCsv(headers, csvRows);
    const filename = `ratecards_${new Date().toISOString().slice(0, 10)}.csv`;

    await sendExportEmail({
      to: req.user.email,
      firstName: req.user.first_name,
      exports: [{ filename, content, type: 'text/csv' }],
    });

    res.json({ ok: true, email: req.user.email });
  } catch (err) { next(err); }
});

module.exports = router;
