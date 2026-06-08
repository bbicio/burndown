const express = require('express');
const { query } = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const { sendShareNotification } = require('../services/email');

const router = express.Router();

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

// GET /api/cost-grids
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const visibilityClause = isAdmin
      ? ''
      : `AND (cg.owner_id = $1 OR EXISTS(
           SELECT 1 FROM resource_shares rs
           WHERE rs.resource_type = 'cost_grid' AND rs.resource_id = cg.id AND rs.user_id = $1
         ))`;

    const { rows } = await query(
      `SELECT cg.id, cg.name, cg.created_at,
              u.first_name || ' ' || u.last_name AS owner_name,
              cg.owner_id,
              (SELECT pipeline FROM cost_grid_versions WHERE cost_grid_id = cg.id ORDER BY created_at DESC LIMIT 1) AS pipeline
       FROM cost_grids cg
       JOIN users u ON u.id = cg.owner_id
       WHERE 1=1 ${visibilityClause}
       ORDER BY cg.created_at DESC`,
      isAdmin ? [] : [req.user.id]
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

// DELETE /api/cost-grids/:id
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const committed = await query(
      `SELECT 1 FROM cost_grid_versions WHERE cost_grid_id = $1 AND pipeline = 'Committed' LIMIT 1`,
      [req.params.id]
    );
    if (committed.rows.length > 0) {
      return res.status(400).json({ error: 'Cannot delete a cost grid with Committed versions' });
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
      `SELECT id, label, pipeline, start_date, end_date, currency, note, locked, ratecard_id, created_at
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
    const { label, pipeline, startDate, endDate, currency, note, ratecardId } = req.body;
    if (!label?.trim()) return res.status(400).json({ error: 'label is required' });

    const { rows } = await query(
      `INSERT INTO cost_grid_versions (cost_grid_id, label, pipeline, start_date, end_date, currency, note, ratecard_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.params.id, label.trim(), pipeline || 'SIP', startDate || null, endDate || null,
       currency || 'EUR', note || null, ratecardId || null]
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
    const locked = await query('SELECT locked FROM cost_grid_versions WHERE id = $1', [req.params.vId]);
    if (locked.rows[0]?.locked) return res.status(400).json({ error: 'Version is locked' });

    const { label, pipeline, startDate, endDate, note, ratecardId } = req.body;
    const fields = [];
    const params = [];

    if (label !== undefined)      { params.push(label.trim());   fields.push(`label = $${params.length}`); }
    if (pipeline !== undefined)   { params.push(pipeline);       fields.push(`pipeline = $${params.length}`); }
    if (startDate !== undefined)  { params.push(startDate);      fields.push(`start_date = $${params.length}`); }
    if (endDate !== undefined)    { params.push(endDate);        fields.push(`end_date = $${params.length}`); }
    if (note !== undefined)       { params.push(note);           fields.push(`note = $${params.length}`); }
    if (ratecardId !== undefined) { params.push(ratecardId);     fields.push(`ratecard_id = $${params.length}`); }

    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(req.params.vId);
    const { rows } = await query(
      `UPDATE cost_grid_versions SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Version not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/cost-grids/:id/versions/:vId
router.delete('/:id/versions/:vId', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { rows } = await query(
      'SELECT locked FROM cost_grid_versions WHERE id = $1', [req.params.vId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Version not found' });
    if (rows[0].locked) return res.status(400).json({ error: 'Version is locked' });

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
          'INSERT INTO tasks (phase_id, title, ptc, sort_order) VALUES ($1, $2, $3, $4) RETURNING id',
          [newPh.rows[0].id, tk.title, tk.ptc, tk.sort_order]
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
          `SELECT tr.id, tr.role_id, ro.label, ro.code, tr.days, tr.rate_override, tr.months
           FROM task_roles tr JOIN roles ro ON ro.id = tr.role_id WHERE tr.task_id = $1`,
          [tk.id]
        );
        tasksWithRoles.push({ ...tk, roles: roles.rows });
      }
      result.push({ ...ph, tasks: tasksWithRoles });
    }
    res.json({ phases: result });
  } catch (err) { next(err); }
});

// PUT /api/cost-grids/:id/versions/:vId/structure
router.put('/:id/versions/:vId/structure', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const locked = await query('SELECT locked FROM cost_grid_versions WHERE id = $1', [req.params.vId]);
    if (locked.rows[0]?.locked) return res.status(400).json({ error: 'Version is locked' });

    const { phases = [] } = req.body;

    // Replace entire structure
    await query('DELETE FROM phases WHERE version_id = $1', [req.params.vId]);

    for (let pi = 0; pi < phases.length; pi++) {
      const ph = phases[pi];
      const newPh = await query(
        'INSERT INTO phases (version_id, title, sort_order) VALUES ($1, $2, $3) RETURNING id',
        [req.params.vId, ph.title, pi]
      );
      for (let ti = 0; ti < (ph.tasks || []).length; ti++) {
        const tk = ph.tasks[ti];
        const newTk = await query(
          'INSERT INTO tasks (phase_id, title, ptc, sort_order) VALUES ($1, $2, $3, $4) RETURNING id',
          [newPh.rows[0].id, tk.title, tk.ptc || 0, ti]
        );
        for (const tr of (tk.roles || [])) {
          await query(
            'INSERT INTO task_roles (task_id, role_id, days, rate_override, months) VALUES ($1, $2, $3, $4, $5)',
            [newTk.rows[0].id, tr.roleId, tr.days || 0, tr.rateOverride || null, tr.months || null]
          );
        }
      }
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── LINKED PROJECTS ───────────────────────────────────────────────────────────

router.get('/:id/versions/:vId/linked-projects', requireAuth, async (req, res, next) => {
  try {
    if (!await canAccess(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { rows } = await query(
      'SELECT project_id, project_name FROM cg_version_projects WHERE cost_grid_version_id = $1',
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
    const { projectId } = req.body;
    const proj = await query('SELECT name FROM projects WHERE id = $1', [projectId]);
    if (!proj.rows[0]) return res.status(404).json({ error: 'Project not found' });

    await query(
      `INSERT INTO cg_version_projects (cost_grid_version_id, project_id, project_name)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [req.params.vId, projectId, proj.rows[0].name]
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
      link: `${process.env.APP_URL}?cg=${req.params.id}`,
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

module.exports = router;
