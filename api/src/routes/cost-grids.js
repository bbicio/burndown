const express = require('express');
const { query, pool } = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const { sendShareNotification } = require('../services/email');
const { isValidSoldHours } = require('../lib/sold-hours');

let _pushToUser;

const router = express.Router();


async function notifyAdminsPipelineChange(cgId, vId, oldPipeline, newPipeline) {
  try {
    // Fetch CG name, client name, fee, currency in one query
    const { rows: info } = await query(`
      SELECT cg.name AS cg_name,
             COALESCE(c.name, '') AS client_name,
             cgv.currency,
             COALESCE(cu.symbol, cgv.currency, '€') AS currency_symbol,
             COALESCE(SUM(tr.days * COALESCE(tr.rate_override, r.hourly_rate, 0)), 0) AS fee
      FROM cost_grid_versions cgv
      JOIN cost_grids cg ON cg.id = cgv.cost_grid_id
      LEFT JOIN clients c ON c.id = cgv.client_id
      LEFT JOIN currencies cu ON cu.code = cgv.currency
      LEFT JOIN phases ph ON ph.version_id = cgv.id
      LEFT JOIN tasks t ON t.phase_id = ph.id
      LEFT JOIN task_roles tr ON tr.task_id = t.id
      LEFT JOIN roles r ON r.id = tr.role_id
      WHERE cgv.id = $1
      GROUP BY cg.name, c.name, cgv.currency, cu.symbol
    `, [vId]);
    if (!info[0]) return;

    const { cg_name, client_name, currency_symbol, fee } = info[0];
    const feeStr = currency_symbol + ' ' + Math.round(parseFloat(fee)).toLocaleString('en-US');

    const title = `Pipeline: ${cg_name}`;
    const body = `${client_name ? client_name + ' — ' : ''}${cg_name}\n${oldPipeline} → ${newPipeline}\nValue: ${feeStr}`;
    const url = `/costgrid.html?cgId=${cgId}&verId=${vId}`;
    const urlLabel = 'Open Cost Grid';

    const { rows: admins } = await query(
      `SELECT id FROM users WHERE role = 'admin' AND status = 'active'`
    );

    if (!_pushToUser) _pushToUser = require('./notifications').pushToUser;

    for (const admin of admins) {
      const { rows } = await query(
        `INSERT INTO notifications (user_id, type, title, body, url, url_label)
         VALUES ($1, 'pipeline', $2, $3, $4, $5)
         RETURNING id, user_id, type, title, body, url, url_label, read_at, created_at`,
        [admin.id, title, body, url, urlLabel]
      );
      _pushToUser(admin.id, { event: 'notification', data: rows[0] });
    }
  } catch (e) {
    console.warn('[notify] pipeline change notification failed:', e.message);
  }
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

async function canAccess(userId, role, cgId) {
  if (role === 'admin') return true;
  const { rows } = await query(
    `SELECT 1 FROM cost_grids cg
     LEFT JOIN resource_shares rs ON rs.resource_type = 'cost_grid' AND rs.resource_id = cg.id AND rs.user_id = $1
     WHERE cg.id = $2 AND (cg.owner_id = $1 OR rs.user_id IS NOT NULL)`,
    [userId, cgId]
  );
  return rows.length > 0;
}

async function canEdit(userId, role, cgId) {
  if (role === 'admin') return true;
  const { rows } = await query(
    `SELECT 1 FROM cost_grids cg
     LEFT JOIN resource_shares rs ON rs.resource_type = 'cost_grid' AND rs.resource_id = cg.id AND rs.user_id = $1
     WHERE cg.id = $2 AND (cg.owner_id = $1 OR (rs.user_id IS NOT NULL AND rs.permission IN ('owner','editor')))`,
    [userId, cgId]
  );
  return rows.length > 0;
}

// ── COST GRIDS ────────────────────────────────────────────────────────────────

// GET /api/cost-grids[?year=YYYY]
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { year } = req.query;
    const isAdmin = req.user.role === 'admin';
    const userId = req.user.id;
    const params = [];

    // Validate the requested year against admin-managed pipeline years.
    // An inactive year is inaccessible to everyone on the board.
    if (year) {
      const pyRes = await query(
        'SELECT active FROM pipeline_years WHERE year = $1',
        [parseInt(year)]
      );
      if (!pyRes.rows[0]) return res.status(404).json({ error: 'Pipeline year not found' });
      if (!pyRes.rows[0].active) return res.status(403).json({ error: 'Pipeline year is inactive' });
    }

    // Admin: own cost grids (includes Drafts) OR any CG with at least one non-Draft version.
    // Non-admin: own cost grids (any stage, includes Drafts) OR accessible cost grids
    //            with at least one non-Draft version.
    params.push(userId); // $1 for both admin and non-admin
    let visibilityClause;
    if (isAdmin) {
      visibilityClause = `AND (
        cg.owner_id = $1
        OR EXISTS(
          SELECT 1 FROM cost_grid_versions v2 WHERE v2.cost_grid_id = cg.id AND v2.pipeline != 'Draft'
        )
      )`;
    } else {
      visibilityClause = `AND (
        cg.owner_id = $1
        OR (
          EXISTS(SELECT 1 FROM resource_shares rs
                 WHERE rs.resource_type = 'cost_grid' AND rs.resource_id = cg.id AND rs.user_id = $1)
          AND EXISTS(SELECT 1 FROM cost_grid_versions v2
                     WHERE v2.cost_grid_id = cg.id AND v2.pipeline != 'Draft')
        )
      )`;
    }

    let yearClause = '';
    if (year) {
      params.push(parseInt(year));
      const yp = params.length;
      // Year filter: Draft-only CGs owned by current user always pass (must appear in Draft column).
      // All other CGs must have a non-Draft version with pipeline_year = requested year.
      yearClause = `AND (
        (cg.owner_id = $1 AND NOT EXISTS(SELECT 1 FROM cost_grid_versions v3 WHERE v3.cost_grid_id = cg.id AND v3.pipeline != 'Draft'))
        OR EXISTS(
          SELECT 1 FROM cost_grid_versions v3
          WHERE v3.cost_grid_id = cg.id AND v3.pipeline_year = $${yp} AND v3.pipeline != 'Draft'
        )
      )`;
    }

    // $1 is always userId (pushed above for both admin and non-admin)
    const { rows } = await query(
      `SELECT cg.id, cg.name, cg.created_at,
              u.first_name || ' ' || u.last_name AS owner_name,
              cg.owner_id,
              CASE WHEN cg.owner_id = $1 THEN 'owner'
                   ELSE (SELECT rs2.permission FROM resource_shares rs2
                         WHERE rs2.resource_type = 'cost_grid' AND rs2.resource_id = cg.id AND rs2.user_id = $1
                         LIMIT 1)
              END AS my_permission,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id',            cgv.id,
                    'label',         cgv.label,
                    'pipeline',      cgv.pipeline,
                    'pipeline_year', cgv.pipeline_year,
                    'start_date',    cgv.start_date,
                    'end_date',      cgv.end_date,
                    'currency',      cgv.currency,
                    'currency_rate', cgv.currency_rate,
                    'note',          cgv.note,
                    'created_at',    cgv.created_at,
                    'locked',        cgv.locked,
                    'ratecard_id',   cgv.ratecard_id,
                    'client_id',     cgv.client_id,
                    'project_name',  cgv.project_name,
                    'linkedProjects', COALESCE(
                      (SELECT json_agg(json_build_object(
                                'project_id',   cvp.project_id,
                                'project_name', cvp.project_name,
                                'task_ids',     cvp.task_ids,
                                'task_names',   cvp.task_names_direct))
                       FROM cg_version_projects cvp
                       WHERE cvp.cost_grid_version_id = cgv.id),
                      '[]'::json)
                  ) ORDER BY cgv.created_at DESC
                ) FILTER (WHERE cgv.id IS NOT NULL),
                '[]'
              ) AS versions
       FROM cost_grids cg
       JOIN users u ON u.id = cg.owner_id
       LEFT JOIN cost_grid_versions cgv ON cgv.cost_grid_id = cg.id
       WHERE 1=1 ${visibilityClause} ${yearClause}
       GROUP BY cg.id, cg.name, cg.created_at, u.first_name, u.last_name, cg.owner_id
       ORDER BY cg.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/cost-grids
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

    const { rows } = await query(
      `INSERT INTO cost_grids (name, owner_id) VALUES ($1, $2)
       RETURNING id, name, owner_id, created_at`,
      [name.trim(), req.user.id]
    );

    // Register owner in resource_shares
    await query(
      `INSERT INTO resource_shares (resource_type, resource_id, user_id, permission, shared_by)
       VALUES ('cost_grid', $1, $2, 'owner', $2)`,
      [rows[0].id, req.user.id]
    );

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/cost-grids/budgets — pre-computed fee+ptc per version for pipeline board cards.
// Must be declared before /:id to avoid Express matching "budgets" as an id param.
router.get('/budgets', requireAuth, async (req, res, next) => {
  try {
    const { id: userId, role } = req.user;
    const isAdmin = role === 'admin';
    const params = [];
    let visClause = '';
    if (!isAdmin) {
      params.push(userId);
      visClause = `AND (
        cg.owner_id = $${params.length}
        OR EXISTS(SELECT 1 FROM resource_shares rs
                  WHERE rs.resource_type = 'cost_grid' AND rs.resource_id = cg.id
                    AND rs.user_id = $${params.length})
      )`;
    }

    const { rows } = await query(`
      WITH version_fees AS (
        SELECT ph.version_id,
          COALESCE(SUM(tr.days * COALESCE(tr.rate_override, r.hourly_rate, 0)), 0) AS fee
        FROM phases ph
        JOIN tasks      t  ON t.phase_id  = ph.id
        JOIN task_roles tr ON tr.task_id  = t.id
        JOIN roles      r  ON r.id        = tr.role_id
        GROUP BY ph.version_id
      ),
      version_ptc AS (
        SELECT ph.version_id, COALESCE(SUM(t.ptc), 0) AS ptc
        FROM phases ph
        JOIN tasks t ON t.phase_id = ph.id
        GROUP BY ph.version_id
      )
      SELECT v.id AS version_id,
             v.currency,
             v.currency_rate,
             COALESCE(vf.fee, 0) AS fee,
             COALESCE(vp.ptc, 0) AS ptc
      FROM cost_grid_versions v
      JOIN cost_grids cg ON cg.id = v.cost_grid_id
      LEFT JOIN version_fees vf ON vf.version_id = v.id
      LEFT JOIN version_ptc  vp ON vp.version_id = v.id
      WHERE 1=1 ${visClause}
    `, params);

    const out = {};
    for (const r of rows) {
      out[r.version_id] = {
        fee:          parseFloat(r.fee) || 0,
        ptc:          parseFloat(r.ptc) || 0,
        currency:     r.currency || 'EUR',
        currencyRate: parseFloat(r.currency_rate) || 1.0,
      };
    }
    res.json(out);
  } catch (err) { next(err); }
});

// PATCH /api/cost-grids/:id
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const { rows } = await query(
      'UPDATE cost_grids SET name = $1 WHERE id = $2 RETURNING id, name',
      [name.trim(), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Cost grid not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/cost-grids/:id — only allowed when ALL versions are in Draft stage
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const nonDraft = await query(
      `SELECT 1 FROM cost_grid_versions WHERE cost_grid_id = $1 AND pipeline != 'Draft' LIMIT 1`,
      [req.params.id]
    );
    if (nonDraft.rows.length > 0) {
      return res.status(400).json({ error: 'Cannot delete a proposal that has been published to the pipeline' });
    }
    await query('DELETE FROM cost_grids WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── VERSIONS ──────────────────────────────────────────────────────────────────

// GET /api/cost-grids/:id/versions
router.get('/:id/versions', requireAuth, async (req, res, next) => {
  try {
    if (!await canAccess(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { rows } = await query(
      `SELECT id, label, pipeline, pipeline_year, start_date, end_date, currency, note, locked, ratecard_id, client_id, project_name, created_at
       FROM cost_grid_versions WHERE cost_grid_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/cost-grids/:id/versions
router.post('/:id/versions', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { label, pipeline, startDate, endDate, currency, currencyRate, note, ratecardId, clientId, projectName } = req.body;
    if (!label?.trim()) return res.status(400).json({ error: 'label is required' });

    // Resolve currency_rate: use provided value, else look up live rate from currencies table
    const resolvedCurrency = currency || 'EUR';
    let resolvedRate = parseFloat(currencyRate) || null;
    if (!resolvedRate) {
      if (resolvedCurrency === 'EUR') {
        resolvedRate = 1.0;
      } else {
        const { rows: cr } = await query('SELECT current_rate FROM currencies WHERE code = $1 AND active = true', [resolvedCurrency]);
        resolvedRate = cr[0] ? parseFloat(cr[0].current_rate) : 1.0;
      }
    }

    // New versions always start as Draft (published via the /publish endpoint)
    const { rows } = await query(
      `INSERT INTO cost_grid_versions (cost_grid_id, label, pipeline, start_date, end_date, currency, currency_rate, note, ratecard_id, client_id, project_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [req.params.id, label.trim(), 'Draft', startDate || null, endDate || null,
       resolvedCurrency, resolvedRate, note || null, ratecardId || null, clientId || null, projectName || '']
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/cost-grids/:id/versions/:vId
router.patch('/:id/versions/:vId', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const locked = await query('SELECT locked, pipeline AS old_pipeline FROM cost_grid_versions WHERE id = $1', [req.params.vId]);
    if (locked.rows[0]?.locked) return res.status(400).json({ error: 'Version is locked' });
    const oldPipeline = locked.rows[0]?.old_pipeline;

    const { label, pipeline, startDate, endDate, currency, currencyRate, note, ratecardId, clientId, projectName } = req.body;
    const fields = [];
    const params = [];
    if (label !== undefined)       { params.push(label.trim());       fields.push(`label = $${params.length}`); }
    if (pipeline !== undefined)    { params.push(pipeline);           fields.push(`pipeline = $${params.length}`); }
    if (startDate !== undefined)   { params.push(startDate || null);  fields.push(`start_date = $${params.length}`); }
    if (endDate !== undefined)     { params.push(endDate   || null);  fields.push(`end_date = $${params.length}`); }
    if (currency !== undefined)    { params.push(currency || 'EUR');  fields.push(`currency = $${params.length}`); }
    if (currencyRate !== undefined){ params.push(parseFloat(currencyRate) || 1.0); fields.push(`currency_rate = $${params.length}`); }
    if (note !== undefined)        { params.push(note);               fields.push(`note = $${params.length}`); }
    if (ratecardId !== undefined)  { params.push(ratecardId || null); fields.push(`ratecard_id = $${params.length}`); }
    if (clientId !== undefined)    { params.push(clientId || null);   fields.push(`client_id = $${params.length}`); }
    if (projectName !== undefined) { params.push(projectName || '');  fields.push(`project_name = $${params.length}`); }

    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(req.params.vId);
    const { rows } = await query(
      `UPDATE cost_grid_versions SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Version not found' });

    if (pipeline !== undefined && oldPipeline && pipeline !== oldPipeline) {
      notifyAdminsPipelineChange(req.params.id, req.params.vId, oldPipeline, pipeline);
    }

    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/cost-grids/:id/versions/:vId — only Draft versions can be deleted
router.delete('/:id/versions/:vId', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { rows } = await query(
      'SELECT locked, pipeline FROM cost_grid_versions WHERE id = $1', [req.params.vId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Version not found' });
    if (rows[0].locked) return res.status(400).json({ error: 'Version is locked' });
    if (rows[0].pipeline !== 'Draft') {
      return res.status(400).json({ error: 'Only Draft versions can be deleted' });
    }

    await query('DELETE FROM cost_grid_versions WHERE id = $1', [req.params.vId]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/cost-grids/:id/versions/:vId/duplicate
router.post('/:id/versions/:vId/duplicate', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const src = await query('SELECT * FROM cost_grid_versions WHERE id = $1', [req.params.vId]);
    if (!src.rows[0]) return res.status(404).json({ error: 'Version not found' });
    const s = src.rows[0];

    // Clone version
    const newV = await query(
      `INSERT INTO cost_grid_versions (cost_grid_id, label, pipeline, start_date, end_date, currency, note, ratecard_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [s.cost_grid_id, s.label + ' (copy)', s.pipeline, s.start_date, s.end_date, s.currency, s.note, s.ratecard_id]
    );
    const newVId = newV.rows[0].id;

    // Clone phases → tasks → task_roles
    const phases = await query('SELECT * FROM phases WHERE version_id = $1 ORDER BY sort_order', [req.params.vId]);
    for (const ph of phases.rows) {
      const newPh = await query(
        'INSERT INTO phases (version_id, title, sort_order) VALUES ($1, $2, $3) RETURNING id',
        [newVId, ph.title, ph.sort_order]
      );
      const tasks = await query('SELECT * FROM tasks WHERE phase_id = $1 ORDER BY sort_order', [ph.id]);
      for (const tk of tasks.rows) {
        const newTk = await query(
          'INSERT INTO tasks (phase_id, title, description, start_date, end_date, ptc, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
          [newPh.rows[0].id, tk.title, tk.description || '', tk.start_date || '', tk.end_date || '', tk.ptc, tk.sort_order]
        );
        await query(
          `INSERT INTO task_roles (task_id, role_id, days, rate_override, months)
           SELECT $1, role_id, days, rate_override, months FROM task_roles WHERE task_id = $2`,
          [newTk.rows[0].id, tk.id]
        );
      }
    }
    res.status(201).json({ id: newVId });
  } catch (err) { next(err); }
});

// POST /api/cost-grids/:id/versions/:vId/publish — promote Draft → SIP
router.post('/:id/versions/:vId/publish', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { rows } = await query(
      'SELECT pipeline FROM cost_grid_versions WHERE id = $1 AND cost_grid_id = $2',
      [req.params.vId, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Version not found' });
    if (rows[0].pipeline !== 'Draft') {
      return res.status(400).json({ error: 'Only Draft versions can be published' });
    }
    const currentYear = new Date().getFullYear();
    const { rows: updated } = await query(
      `UPDATE cost_grid_versions SET pipeline = 'SIP', pipeline_year = $1 WHERE id = $2 RETURNING *`,
      [currentYear, req.params.vId]
    );
    notifyAdminsPipelineChange(req.params.id, req.params.vId, 'Draft', 'SIP');
    res.json(updated[0]);
  } catch (err) { next(err); }
});

// ── STRUCTURE ─────────────────────────────────────────────────────────────────

// GET /api/cost-grids/:id/versions/:vId/structure
router.get('/:id/versions/:vId/structure', requireAuth, async (req, res, next) => {
  try {
    if (!await canAccess(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const phases = await query(
      'SELECT * FROM phases WHERE version_id = $1 ORDER BY sort_order', [req.params.vId]
    );
    const result = [];
    for (const ph of phases.rows) {
      const tasks = await query(
        'SELECT * FROM tasks WHERE phase_id = $1 ORDER BY sort_order', [ph.id]
      );
      const tasksWithRoles = [];
      for (const tk of tasks.rows) {
        const roles = await query(
          `SELECT tr.id, tr.role_id, ro.label, ro.code, ro.hourly_rate, tr.days, tr.rate_override, tr.months
           FROM task_roles tr JOIN roles ro ON ro.id = tr.role_id WHERE tr.task_id = $1`,
          [tk.id]
        );
        const toInputDate = d => d && d.length === 8 ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : (d || '');
        tasksWithRoles.push({
          id:          tk.id,
          title:       tk.title,
          description: tk.description || '',
          start_date:  toInputDate(tk.start_date),
          end_date:    toInputDate(tk.end_date),
          ptc:         parseFloat(tk.ptc) || 0,
          sort_order:  tk.sort_order,
          roles:       roles.rows,
        });
      }
      result.push({ ...ph, tasks: tasksWithRoles });
    }
    res.json({ phases: result });
  } catch (err) { next(err); }
});

// PUT /api/cost-grids/:id/versions/:vId/structure
router.put('/:id/versions/:vId/structure', requireAuth, async (req, res, next) => {
  if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const locked = await query('SELECT locked FROM cost_grid_versions WHERE id = $1', [req.params.vId]);
  if (locked.rows[0]?.locked) return res.status(400).json({ error: 'Version is locked' });

  const { phases = [], roles: rolesBody = [] } = req.body;

  // Reject the whole request — no partial writes — if any role's sold hours
  // fall outside the allowed set. No automatic rounding.
  for (const ph of phases) {
    for (const tk of (ph?.tasks || [])) {
      if (tk?.hours && typeof tk.hours === 'object') {
        for (const [code, days] of Object.entries(tk.hours)) {
          if (!isValidSoldHours(days)) {
            return res.status(400).json({
              error: `Invalid sold hours "${days}" for role "${code}" in task "${tk.taskName || tk.title || ''}". Allowed values: whole numbers, or with a fraction of .25, .5, or .75.`,
            });
          }
        }
      }
      for (const tr of (tk?.roles || [])) {
        if (tr?.days != null && !isValidSoldHours(tr.days)) {
          return res.status(400).json({
            error: `Invalid sold hours "${tr.days}" in task "${tk.taskName || tk.title || ''}". Allowed values: whole numbers, or with a fraction of .25, .5, or .75.`,
          });
        }
      }
    }
  }

  // Preload all roles for code→id lookup
  const { rows: allRoles } = await query('SELECT id, code FROM roles');
  const roleByCode = Object.fromEntries(allRoles.map(r => [r.code, r.id]));

  // Snapshot rate for every role so the DB budget query always uses the same
  // rate the editor sees, regardless of whether the rate was explicitly customised.
  const rateByCode = {};
  for (const r of rolesBody) {
    if (r.roleCode && r.rate != null) {
      rateByCode[r.roleCode] = parseFloat(r.rate) || null;
    }
  }

  // Use a dedicated client for the transaction so BEGIN/COMMIT share the same connection
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM phases WHERE version_id = $1', [req.params.vId]);

    for (let pi = 0; pi < phases.length; pi++) {
      const ph = phases[pi];
      if (!ph) continue;
      const phTitle = (ph.phaseName || ph.title || '').trim() || 'New Phase';
      const newPh = await client.query(
        'INSERT INTO phases (version_id, title, sort_order) VALUES ($1, $2, $3) RETURNING id',
        [req.params.vId, phTitle, pi]
      );
      for (let ti = 0; ti < (ph.tasks || []).length; ti++) {
        const tk = ph.tasks[ti];
        if (!tk) continue;
        const tkTitle = (tk.taskName || tk.title || '').trim() || 'New Task';
        const tkDesc  = tk.taskDescription || tk.description || '';
        const normDate = d => d ? d.replace(/-/g, '').slice(0, 8) : '';
        const tkStart = normDate(tk.taskStartDate || tk.start_date  || '');
        const tkEnd   = normDate(tk.taskEndDate   || tk.end_date    || '');
        const tkId = tk.taskId || tk.id || null;
        const newTk = tkId
          ? await client.query(
              'INSERT INTO tasks (id, phase_id, title, description, start_date, end_date, ptc, sort_order) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
              [tkId, newPh.rows[0].id, tkTitle, tkDesc, tkStart, tkEnd, tk.ptc || 0, ti]
            )
          : await client.query(
              'INSERT INTO tasks (phase_id, title, description, start_date, end_date, ptc, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
              [newPh.rows[0].id, tkTitle, tkDesc, tkStart, tkEnd, tk.ptc || 0, ti]
            );
        // Accept both hours map {roleCode: days} and roles array [{roleId, days}]
        const taskRoles = [];
        if (tk.hours && typeof tk.hours === 'object') {
          for (const [code, days] of Object.entries(tk.hours)) {
            const roleId = roleByCode[code];
            if (roleId && days > 0) taskRoles.push({
              roleId,
              days,
              rateOverride: rateByCode[code] ?? null,
              months: null,
            });
          }
        } else {
          for (const tr of (tk.roles || [])) {
            const roleId = tr.roleId || roleByCode[tr.roleCode || tr.code];
            if (roleId) taskRoles.push({ roleId, days: tr.days || 0, rateOverride: tr.rateOverride || null, months: tr.months || null });
          }
        }
        for (const tr of taskRoles) {
          await client.query(
            'INSERT INTO task_roles (task_id, role_id, days, rate_override, months) VALUES ($1, $2, $3, $4, $5)',
            [newTk.rows[0].id, tr.roleId, tr.days, tr.rateOverride, tr.months]
          );
        }
      }
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// ── LINKED PROJECTS ───────────────────────────────────────────────────────────

router.get('/:id/versions/:vId/linked-projects', requireAuth, async (req, res, next) => {
  try {
    if (!await canAccess(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { rows } = await query(
      'SELECT project_id, project_name, task_ids FROM cg_version_projects WHERE cost_grid_version_id = $1',
      [req.params.vId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/:id/versions/:vId/linked-projects', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { projectId, taskIds, taskNames } = req.body;
    const proj = await query('SELECT name FROM projects WHERE id = $1', [projectId]);
    if (!proj.rows[0]) return res.status(404).json({ error: 'Project not found' });

    await query(
      `INSERT INTO cg_version_projects (cost_grid_version_id, project_id, project_name, task_ids, task_names_direct)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (cost_grid_version_id, project_id)
       DO UPDATE SET task_ids = EXCLUDED.task_ids, task_names_direct = EXCLUDED.task_names_direct`,
      [req.params.vId, projectId, proj.rows[0].name, JSON.stringify(taskIds || []), JSON.stringify(taskNames || [])]
    );
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id/versions/:vId/linked-projects/:projectId', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    await query(
      'DELETE FROM cg_version_projects WHERE cost_grid_version_id = $1 AND project_id = $2',
      [req.params.vId, req.params.projectId]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── SHARING ───────────────────────────────────────────────────────────────────

router.get('/:id/shares', requireAuth, async (req, res, next) => {
  try {
    if (!await canAccess(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { rows } = await query(
      `SELECT rs.user_id, u.email, u.first_name, u.last_name, rs.permission
       FROM resource_shares rs JOIN users u ON u.id = rs.user_id
       WHERE rs.resource_type = 'cost_grid' AND rs.resource_id = $1`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/:id/shares', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { userId, permission } = req.body;
    if (!['editor', 'viewer'].includes(permission)) {
      return res.status(400).json({ error: 'permission must be editor or viewer' });
    }

    const target = await query(
      'SELECT email, first_name FROM users WHERE id = $1 AND status = $2',
      [userId, 'active']
    );
    if (!target.rows[0]) return res.status(404).json({ error: 'User not found' });

    const cg = await query('SELECT name FROM cost_grids WHERE id = $1', [req.params.id]);
    const sharer = await query(
      'SELECT first_name, last_name FROM users WHERE id = $1', [req.user.id]
    );

    await query(
      `INSERT INTO resource_shares (resource_type, resource_id, user_id, permission, shared_by)
       VALUES ('cost_grid', $1, $2, $3, $4)
       ON CONFLICT (resource_type, resource_id, user_id) DO UPDATE SET permission = $3`,
      [req.params.id, userId, permission, req.user.id]
    );

    await sendShareNotification({
      to: target.rows[0].email,
      firstName: target.rows[0].first_name,
      resourceType: 'cost grid',
      resourceName: cg.rows[0].name,
      sharedBy: `${sharer.rows[0].first_name} ${sharer.rows[0].last_name}`,
      link: `${process.env.APP_URL}/pipeline.html`,
    });

    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id/shares/:userId', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const isOwner = await query(
      `SELECT 1 FROM resource_shares WHERE resource_type = 'cost_grid'
       AND resource_id = $1 AND user_id = $2 AND permission = 'owner'`,
      [req.params.id, req.params.userId]
    );
    if (isOwner.rows.length > 0) {
      return res.status(400).json({ error: 'Cannot remove the owner' });
    }
    await query(
      `DELETE FROM resource_shares WHERE resource_type = 'cost_grid'
       AND resource_id = $1 AND user_id = $2`,
      [req.params.id, req.params.userId]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/cost-grids/:id/versions/:vId/refresh-rate
// Snapshots the current live exchange rate from currencies table onto the version.
router.post('/:id/versions/:vId/refresh-rate', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { rows: ver } = await query(
      'SELECT currency FROM cost_grid_versions WHERE id = $1', [req.params.vId]
    );
    if (!ver[0]) return res.status(404).json({ error: 'Version not found' });
    const currency = ver[0].currency;
    if (currency === 'EUR') return res.json({ currency, currency_rate: 1.0 });

    const { rows: cur } = await query(
      'SELECT current_rate FROM currencies WHERE code = $1 AND active = true', [currency]
    );
    if (!cur[0]) return res.status(404).json({ error: 'Currency not active' });

    const rate = parseFloat(cur[0].current_rate);
    await query(
      'UPDATE cost_grid_versions SET currency_rate = $1 WHERE id = $2',
      [rate, req.params.vId]
    );
    res.json({ currency, currency_rate: rate });
  } catch (err) { next(err); }
});

module.exports = router;
