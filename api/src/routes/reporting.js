const express = require('express');
const { query } = require('../db/client');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Visibility WHERE clause helpers
function projectsVisibilitySql(isAdmin, paramIndex) {
  if (isAdmin) return '';
  return `AND (p.owner_id = $${paramIndex} OR EXISTS(
    SELECT 1 FROM resource_shares rs
    WHERE rs.resource_type='project' AND rs.resource_id=p.id AND rs.user_id=$${paramIndex}
  ))`;
}

// ── PIPELINE ─────────────────────────────────────────────────────────────────
// GET /api/reporting/pipeline
router.get('/pipeline', requireAuth, async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const vis = projectsVisibilitySql(isAdmin, 1);
    const params = isAdmin ? [] : [req.user.id];

    const { rows } = await query(
      `SELECT
         COALESCE(p.pipeline, 'SIP') AS stage,
         COUNT(*)::int                AS count,
         json_agg(json_build_object(
           'id',          p.id,
           'name',        p.name,
           'clientName',  c.name,
           'programName', pr.name,
           'pipeline',    p.pipeline,
           'status',      p.status,
           'startDate',   p.start_date,
           'endDate',     p.end_date,
           'currency',    p.currency,
           'budget',      COALESCE(bud.total, 0)
         ) ORDER BY p.name) AS projects
       FROM projects p
       LEFT JOIN clients  c  ON c.id  = p.client_id
       LEFT JOIN programs pr ON pr.id = p.program_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(
           tr.days * 8 * COALESCE(tr.rate_override,
             (SELECT re2.hourly_rate FROM ratecard_entries re2
              JOIN cost_grid_versions v2 ON v2.ratecard_id = re2.ratecard_id
              WHERE v2.id = p.cg_version_id AND re2.role_id = tr.role_id LIMIT 1),
             r.hourly_rate, 0)
         ), 0) AS total
         FROM phases ph
         JOIN tasks  t  ON t.phase_id  = ph.id
         JOIN task_roles tr ON tr.task_id = t.id
         JOIN roles  r  ON r.id = tr.role_id
         WHERE ph.version_id = p.cg_version_id
       ) bud ON TRUE
       WHERE 1=1 ${vis}
       GROUP BY COALESCE(p.pipeline, 'SIP')
       ORDER BY CASE COALESCE(p.pipeline, 'SIP')
         WHEN 'Committed'   THEN 1
         WHEN 'Expected'    THEN 2
         WHEN 'Anticipated' THEN 3
         WHEN 'SIP'         THEN 4
         WHEN 'Canceled'    THEN 5
         ELSE 6 END`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── PORTFOLIO ─────────────────────────────────────────────────────────────────
// GET /api/reporting/portfolio
router.get('/portfolio', requireAuth, async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const vis = projectsVisibilitySql(isAdmin, 1);
    const params = isAdmin ? [] : [req.user.id];

    const { rows } = await query(
      `SELECT
         p.id, p.name, p.pipeline, p.status, p.start_date, p.end_date,
         p.currency, p.phasing, p.ptc, p.cg_version_id,
         c.name  AS client_name,
         pr.name AS program_name,
         u.first_name || ' ' || u.last_name AS owner_name,
         COALESCE(bud.total, 0)             AS budget,
         COALESCE(act.actual_hours, 0)      AS actual_hours
       FROM projects p
       JOIN  users    u  ON u.id   = p.owner_id
       LEFT JOIN clients  c  ON c.id   = p.client_id
       LEFT JOIN programs pr ON pr.id  = p.program_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(
           tr.days * 8 * COALESCE(tr.rate_override,
             (SELECT re2.hourly_rate FROM ratecard_entries re2
              JOIN cost_grid_versions v2 ON v2.ratecard_id = re2.ratecard_id
              WHERE v2.id = p.cg_version_id AND re2.role_id = tr.role_id LIMIT 1),
             r.hourly_rate, 0)
         ), 0) AS total
         FROM phases ph
         JOIN tasks  t  ON t.phase_id  = ph.id
         JOIN task_roles tr ON tr.task_id = t.id
         JOIN roles  r  ON r.id = tr.role_id
         WHERE ph.version_id = p.cg_version_id
       ) bud ON TRUE
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM((entry->>'hours')::numeric), 0) AS actual_hours
         FROM timesheets ts, jsonb_array_elements(ts.data) AS entry
         WHERE ts.project_code = p.name
       ) act ON TRUE
       WHERE 1=1 ${vis}
       ORDER BY p.name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── SINGLE PROJECT ────────────────────────────────────────────────────────────
// GET /api/reporting/projects/:id
router.get('/projects/:id', requireAuth, async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    if (!isAdmin) {
      const { rows: access } = await query(
        `SELECT 1 FROM projects p
         LEFT JOIN resource_shares rs ON rs.resource_type='project' AND rs.resource_id=p.id AND rs.user_id=$1
         WHERE p.id=$2 AND (p.owner_id=$1 OR rs.user_id IS NOT NULL)`,
        [req.user.id, req.params.id]
      );
      if (!access.length) return res.status(403).json({ error: 'Access denied' });
    }

    // Project header
    const { rows: [proj] } = await query(
      `SELECT p.*, c.name AS client_name, pr.name AS program_name,
              u.first_name || ' ' || u.last_name AS owner_name
       FROM projects p
       JOIN users u ON u.id = p.owner_id
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN programs pr ON pr.id = p.program_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!proj) return res.status(404).json({ error: 'Project not found' });

    // Project tasks
    const { rows: tasks } = await query(
      'SELECT * FROM project_tasks WHERE project_id = $1 ORDER BY sort_order',
      [req.params.id]
    );

    // Timesheet data for this project (by name as project_code)
    const { rows: tsRows } = await query(
      `SELECT entry
       FROM timesheets ts, jsonb_array_elements(ts.data) AS entry
       WHERE ts.project_code = $1`,
      [proj.name]
    );
    const timesheetEntries = tsRows.map(r => r.entry);

    // Budget from cost grid version
    let cgBudget = null;
    if (proj.cg_version_id) {
      const { rows: budRows } = await query(
        `SELECT
           ph.title AS phase,
           t.title  AS task,
           r.label  AS role,
           tr.days,
           COALESCE(tr.rate_override,
             (SELECT re2.hourly_rate FROM ratecard_entries re2
              JOIN cost_grid_versions v2 ON v2.ratecard_id = re2.ratecard_id
              WHERE v2.id = $1 AND re2.role_id = tr.role_id LIMIT 1),
             r.hourly_rate, 0) AS hourly_rate
         FROM phases ph
         JOIN tasks t ON t.phase_id = ph.id
         JOIN task_roles tr ON tr.task_id = t.id
         JOIN roles r ON r.id = tr.role_id
         WHERE ph.version_id = $1
         ORDER BY ph.sort_order, t.sort_order`,
        [proj.cg_version_id]
      );
      cgBudget = budRows;
    }

    res.json({ project: proj, tasks, timesheetEntries, cgBudget });
  } catch (err) { next(err); }
});

// ── PHASING ───────────────────────────────────────────────────────────────────
// GET /api/reporting/phasing?year=YYYY (admin only)
// Returns monthly hours+amount breakdown for all versions in the year (all pipeline stages).
router.get('/phasing', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
    const { year } = req.query;
    if (!year) return res.status(400).json({ error: 'year is required' });
    const yr = parseInt(year);

    const { rows } = await query(
      `SELECT
         cgv.id            AS version_id,
         cgv.cost_grid_id  AS cg_id,
         cg.name           AS cg_name,
         cgv.currency      AS currency,
         cgv.currency_rate AS currency_rate,
         cgv.label         AS version_label,
         cgv.pipeline,
         cgv.client_id,
         cgv.start_date    AS ver_start,
         cgv.end_date      AS ver_end,
         tk.start_date     AS task_start,
         tk.end_date       AS task_end,
         tr.days,
         COALESCE(
           tr.rate_override,
           (SELECT re.hourly_rate FROM ratecard_entries re
            WHERE re.ratecard_id = cgv.ratecard_id AND re.role_id = tr.role_id LIMIT 1),
           ro.hourly_rate, 0
         ) AS hourly_rate
       FROM cost_grid_versions cgv
       JOIN cost_grids cg ON cg.id = cgv.cost_grid_id
       JOIN phases ph ON ph.version_id = cgv.id
       JOIN tasks tk ON tk.phase_id = ph.id
       JOIN task_roles tr ON tr.task_id = tk.id
       JOIN roles ro ON ro.id = tr.role_id
       WHERE cgv.pipeline_year = $1`,
      [yr]
    );

    const yearMonths = [];
    for (let m = 1; m <= 12; m++) yearMonths.push(`${yr}-${String(m).padStart(2, '0')}`);

    // Distribute task-role days proportionally across months, clipped to the requested year
    function distribute(days, taskStart, taskEnd, verStart, verEnd) {
      let sy, sm, ey, em;
      const ts = taskStart && taskStart.length >= 6 ? taskStart : null;
      const te = taskEnd   && taskEnd.length >= 6   ? taskEnd   : null;
      if (ts && te) {
        sy = parseInt(ts.slice(0, 4)); sm = parseInt(ts.slice(4, 6));
        ey = parseInt(te.slice(0, 4)); em = parseInt(te.slice(4, 6));
      } else if (verStart && verEnd && verStart.length >= 6 && verEnd.length >= 6) {
        sy = parseInt(verStart.slice(0, 4)); sm = parseInt(verStart.slice(4, 6));
        ey = parseInt(verEnd.slice(0, 4));   em = parseInt(verEnd.slice(4, 6));
      } else {
        return {};
      }
      const all = [];
      let y = sy, m = sm;
      while (y < ey || (y === ey && m <= em)) {
        all.push(`${y}-${String(m).padStart(2, '0')}`);
        if (++m > 12) { m = 1; y++; }
      }
      if (!all.length) return {};
      const dpp = parseFloat(days) / all.length;
      const out = {};
      for (const mo of all) {
        if (mo >= `${yr}-01` && mo <= `${yr}-12`) out[mo] = (out[mo] || 0) + dpp;
      }
      return out;
    }

    const versionMap = new Map();
    for (const r of rows) {
      if (!versionMap.has(r.version_id)) {
        versionMap.set(r.version_id, {
          cgId: r.cg_id, versionId: r.version_id,
          name: r.cg_name, versionLabel: r.version_label,
          pipeline: r.pipeline,
          currency:     r.currency      || 'EUR',
          currencyRate: parseFloat(r.currency_rate) || 1.0,
          clientId: r.client_id || null,
          startDate: r.ver_start || '', endDate: r.ver_end || '',
          months: {},
        });
      }
      const v = versionMap.get(r.version_id);
      const dist = distribute(r.days, r.task_start, r.task_end, r.ver_start, r.ver_end);
      const rate = parseFloat(r.hourly_rate) || 0;
      for (const [mo, d] of Object.entries(dist)) {
        if (!v.months[mo]) v.months[mo] = { hours: 0, amount: 0 };
        const hrs = d;
        v.months[mo].hours  += hrs;
        v.months[mo].amount += hrs * rate;
      }
    }

    // Totals are always in EUR: convert each version's local amounts using the currency_rate snapshot
    const totals = {};
    for (const mo of yearMonths) totals[mo] = { hours: 0, amount: 0 };
    for (const v of versionMap.values()) {
      const rate = v.currencyRate || 1.0;
      for (const [mo, val] of Object.entries(v.months)) {
        if (totals[mo]) {
          totals[mo].hours  += val.hours;
          totals[mo].amount += val.amount / rate;
        }
      }
    }
    for (const mo of yearMonths) {
      totals[mo].hours  = Math.round(totals[mo].hours * 10) / 10;
      totals[mo].amount = Math.round(totals[mo].amount * 100) / 100;
    }

    const projects = [...versionMap.values()].map(v => ({
      ...v,
      months: Object.fromEntries(Object.entries(v.months).map(([mo, val]) => [mo, {
        hours:  Math.round(val.hours * 10) / 10,
        amount: Math.round(val.amount * 100) / 100,
      }])),
    }));

    res.json({ year: yr, months: yearMonths, totals, projects, totalsCurrency: 'EUR' });
  } catch (err) { next(err); }
});

// ── PROJECT PHASING ───────────────────────────────────────────────────────────
// GET /api/reporting/project-phasing?year=YYYY (admin only)
// Reads projects.phasing directly — values already reflect actuals if user ran Reforecast + saved.
// Excludes Draft and Canceled pipeline stages.
router.get('/project-phasing', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
    const { year } = req.query;
    if (!year) return res.status(400).json({ error: 'year is required' });
    const yr = parseInt(year);

    const yearMonths = [];
    for (let m = 1; m <= 12; m++) yearMonths.push(`${yr}-${String(m).padStart(2, '0')}`);

    // Projects linked to cost grid versions in this pipeline year (excludes Draft + Canceled)
    const { rows: projRows } = await query(
      `SELECT p.id, p.name, p.client_id, p.currency, p.phasing,
              cgv.pipeline, cgv.client_id AS version_client_id,
              cgv.currency_rate
       FROM cost_grid_versions cgv
       JOIN projects p ON p.cg_version_id = cgv.id
       WHERE cgv.pipeline_year = $1
         AND cgv.pipeline NOT IN ('Draft', 'Canceled')`,
      [yr]
    );

    if (!projRows.length) {
      return res.json({ year: yr, months: yearMonths, totals: Object.fromEntries(yearMonths.map(m => [m, 0])), projects: [], totalsCurrency: 'EUR' });
    }

    // projects.phasing keys are YYYYMM (no dash); yearMonths are YYYY-MM
    const projects = projRows.map(p => {
      const phasing      = p.phasing || {};
      const clientId     = p.client_id || p.version_client_id || null;
      const currencyRate = parseFloat(p.currency_rate) || 1.0;
      const months       = {};
      for (const mo of yearMonths) {
        const key  = mo.replace('-', '');  // "2026-07" → "202607"
        months[mo] = Math.round((parseFloat(phasing[key]) || 0) * 100) / 100;
      }
      return { projectId: p.id, name: p.name, pipeline: p.pipeline, currency: p.currency || 'EUR', currencyRate, clientId, months };
    });

    // Totals always in EUR: divide each project's local amount by its currency_rate snapshot
    const totals = Object.fromEntries(yearMonths.map(m => [m, 0]));
    for (const p of projects) {
      const rate = p.currencyRate || 1.0;
      for (const mo of yearMonths) totals[mo] += p.months[mo] / rate;
    }
    for (const mo of yearMonths) totals[mo] = Math.round(totals[mo] * 100) / 100;

    res.json({ year: yr, months: yearMonths, totals, projects, totalsCurrency: 'EUR' });
  } catch (err) { next(err); }
});

// ── PLANNING ──────────────────────────────────────────────────────────────────
// GET /api/reporting/planning
router.get('/planning', requireAuth, async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const vis = projectsVisibilitySql(isAdmin, 1);
    const params = isAdmin ? [] : [req.user.id];

    // Monthly days per role across all committed/expected versions linked to visible projects
    const { rows: allocRows } = await query(
      `SELECT
         r.id   AS role_id,
         r.label AS role_label,
         r.code  AS role_code,
         month_entry.key   AS month,
         SUM((month_entry.value)::numeric) AS allocated_days
       FROM projects p
       JOIN cost_grid_versions cgv ON cgv.id = p.cg_version_id
       JOIN phases ph ON ph.version_id = cgv.id
       JOIN tasks  t  ON t.phase_id = ph.id
       JOIN task_roles tr ON tr.task_id = t.id
       JOIN roles r ON r.id = tr.role_id,
       jsonb_each_text(tr.months) AS month_entry
       WHERE 1=1
         AND tr.months IS NOT NULL
         AND cgv.pipeline IN ('Committed','Expected','Anticipated')
         ${vis}
       GROUP BY r.id, r.label, r.code, month_entry.key
       ORDER BY r.label, month_entry.key`,
      params
    );

    // Monthly capacity from config (stored in project settings; we expose as-is from DB if available)
    // For now return just allocations grouped by role
    const byRole = {};
    for (const row of allocRows) {
      if (!byRole[row.role_id]) {
        byRole[row.role_id] = { roleId: row.role_id, label: row.role_label, code: row.role_code, months: {} };
      }
      byRole[row.role_id].months[row.month] = parseFloat(row.allocated_days);
    }

    res.json(Object.values(byRole));
  } catch (err) { next(err); }
});

module.exports = router;
