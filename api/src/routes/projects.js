const express = require('express');
const { query } = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const { sendShareNotification } = require('../services/email');
let _pushToUser;

const router = express.Router();

// ── HELPERS ───────────────────────────────────────────────────────────────────

async function canAccess(userId, role, projectId) {
  if (role === 'admin') return true;
  const { rows } = await query(
    `SELECT 1 FROM projects p
     LEFT JOIN resource_shares rs ON rs.resource_type = 'project' AND rs.resource_id = p.id AND rs.user_id = $1
     WHERE p.id = $2 AND (p.owner_id = $1 OR rs.user_id IS NOT NULL)`,
    [userId, projectId]
  );
  return rows.length > 0;
}

async function canEdit(userId, role, projectId) {
  if (role === 'admin') return true;
  const { rows } = await query(
    `SELECT 1 FROM projects p
     LEFT JOIN resource_shares rs ON rs.resource_type = 'project' AND rs.resource_id = p.id AND rs.user_id = $1
     WHERE p.id = $2 AND (p.owner_id = $1 OR (rs.user_id IS NOT NULL AND rs.permission IN ('owner','editor')))`,
    [userId, projectId]
  );
  return rows.length > 0;
}

// ── PROJECTS ──────────────────────────────────────────────────────────────────

// GET /api/projects
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const visibilityClause = isAdmin
      ? ''
      : `AND (p.owner_id = $1 OR EXISTS(
           SELECT 1 FROM resource_shares rs
           WHERE rs.resource_type = 'project' AND rs.resource_id = p.id AND rs.user_id = $1
         ))`;

    const { rows } = await query(
      `SELECT p.id, p.name, p.program_id, p.client_id, p.pipeline, p.status,
              p.start_date, p.end_date, p.currency, p.cg_version_id, p.created_at,
              p.owner_id, p.phasing, p.ptc, p.planning, p.groups,
              u.first_name || ' ' || u.last_name AS owner_name,
              c.name AS client_name,
              pr.name AS program_name,
              COALESCE(
                (SELECT json_agg(json_build_object(
                   'name',                 pt.name,
                   'billable',             pt.billable,
                   'completed',            pt.completed,
                   'startDate',            pt.start_date,
                   'endDate',              pt.end_date,
                   'monthlyDistribution',  pt.monthly_distribution,
                   'resources',            pt.resources
                 ) ORDER BY pt.sort_order)
                 FROM project_tasks pt WHERE pt.project_id = p.id),
                '[]'::json
              ) AS tasks
       FROM projects p
       JOIN users u ON u.id = p.owner_id
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN programs pr ON pr.id = p.program_id
       WHERE 1=1 ${visibilityClause}
       ORDER BY p.name`,
      isAdmin ? [] : [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/projects/:id
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    if (!await canAccess(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { rows } = await query(
      `SELECT p.*, u.first_name || ' ' || u.last_name AS owner_name,
              c.name AS client_name, pr.name AS program_name
       FROM projects p
       JOIN users u ON u.id = p.owner_id
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN programs pr ON pr.id = p.program_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Project not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/projects
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, programId, clientId, startDate, endDate, currency, pipeline, status } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

    const { rows } = await query(
      `INSERT INTO projects (name, program_id, client_id, start_date, end_date, currency, pipeline, status, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, name, owner_id, created_at`,
      [name.trim(), programId || null, clientId || null, startDate || null,
       endDate || null, currency || 'EUR', pipeline || null, status || null, req.user.id]
    );

    // Register owner in resource_shares
    await query(
      `INSERT INTO resource_shares (resource_type, resource_id, user_id, permission, shared_by)
       VALUES ('project', $1, $2, 'owner', $2)`,
      [rows[0].id, req.user.id]
    );

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/projects/:id
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const allowed = ['name', 'programId', 'clientId', 'startDate', 'endDate',
                     'currency', 'pipeline', 'status', 'cgVersionId'];
    const map = {
      name: 'name', programId: 'program_id', clientId: 'client_id',
      startDate: 'start_date', endDate: 'end_date', currency: 'currency',
      pipeline: 'pipeline', status: 'status', cgVersionId: 'cg_version_id'
    };

    const fields = [];
    const params = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        params.push(req.body[key] || null);
        fields.push(`${map[key]} = $${params.length}`);
      }
    }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE projects SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING id, name`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Project not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/projects/:id
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const timesheets = await query(
      'SELECT COUNT(*) FROM timesheets WHERE project_code = (SELECT name FROM projects WHERE id = $1)',
      [req.params.id]
    );
    if (parseInt(timesheets.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete project with uploaded timesheet data' });
    }
    await query('DELETE FROM projects WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── PROJECT TASKS ─────────────────────────────────────────────────────────────

// GET /api/projects/:id/tasks
router.get('/:id/tasks', requireAuth, async (req, res, next) => {
  try {
    if (!await canAccess(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { rows } = await query(
      `SELECT id, name, billable, completed, start_date, end_date,
              monthly_distribution, resources, sort_order
       FROM project_tasks WHERE project_id = $1 ORDER BY sort_order`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// PUT /api/projects/:id/tasks  — bulk replace
router.put('/:id/tasks', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const tasks = req.body;
    if (!Array.isArray(tasks)) return res.status(400).json({ error: 'Body must be an array' });

    await query('DELETE FROM project_tasks WHERE project_id = $1', [req.params.id]);

    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      await query(
        `INSERT INTO project_tasks
         (project_id, name, billable, completed, start_date, end_date,
          monthly_distribution, resources, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [req.params.id, t.name, t.billable ?? true, t.completed ?? false,
         t.startDate || null, t.endDate || null,
         t.monthlyDistribution ? JSON.stringify(t.monthlyDistribution) : null,
         t.resources ? JSON.stringify(t.resources) : null, i]
      );
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── PHASING & PTC ─────────────────────────────────────────────────────────────

// PATCH /api/projects/:id/phasing
router.patch('/:id/phasing', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { phasing } = req.body;
    await query('UPDATE projects SET phasing = $1 WHERE id = $2', [JSON.stringify(phasing), req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PATCH /api/projects/:id/ptc
router.patch('/:id/ptc', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { ptc } = req.body;
    await query('UPDATE projects SET ptc = $1 WHERE id = $2', [JSON.stringify(ptc), req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PATCH /api/projects/:id/planning
router.patch('/:id/planning', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { planning } = req.body;
    await query('UPDATE projects SET planning = $1 WHERE id = $2', [JSON.stringify(planning), req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PATCH /api/projects/:id/groups
router.patch('/:id/groups', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { groups } = req.body;
    await query('UPDATE projects SET groups = $1 WHERE id = $2', [JSON.stringify(groups), req.params.id]);
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
       WHERE rs.resource_type = 'project' AND rs.resource_id = $1`,
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
      'SELECT email, first_name FROM users WHERE id = $1 AND status = $2', [userId, 'active']
    );
    if (!target.rows[0]) return res.status(404).json({ error: 'User not found' });

    const proj = await query('SELECT name FROM projects WHERE id = $1', [req.params.id]);
    const sharer = await query('SELECT first_name, last_name FROM users WHERE id = $1', [req.user.id]);

    await query(
      `INSERT INTO resource_shares (resource_type, resource_id, user_id, permission, shared_by)
       VALUES ('project', $1, $2, $3, $4)
       ON CONFLICT (resource_type, resource_id, user_id) DO UPDATE SET permission = $3`,
      [req.params.id, userId, permission, req.user.id]
    );

    const sharerName = `${sharer.rows[0].first_name} ${sharer.rows[0].last_name}`;
    const appUrl = process.env.APP_URL || 'http://localhost';

    await sendShareNotification({
      to: target.rows[0].email,
      firstName: target.rows[0].first_name,
      resourceType: 'project',
      resourceName: proj.rows[0].name,
      sharedBy: sharerName,
      link: `${appUrl}/portfolio.html`,
    });

    const { rows: [notif] } = await query(
      `INSERT INTO notifications (user_id, type, title, body, url, url_label)
       VALUES ($1, 'share', $2, $3, $4, $5)
       RETURNING id, user_id, type, title, body, url, url_label, read_at, created_at`,
      [
        userId,
        `Project shared: ${proj.rows[0].name}`,
        `${sharerName} shared the project "${proj.rows[0].name}" with you.`,
        `${appUrl}/portfolio.html`,
        'Open Portfolio',
      ]
    );

    if (!_pushToUser) _pushToUser = require('./notifications').pushToUser;
    _pushToUser(userId, { event: 'notification', data: notif });

    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id/shares/:userId', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const isOwner = await query(
      `SELECT 1 FROM resource_shares WHERE resource_type = 'project'
       AND resource_id = $1 AND user_id = $2 AND permission = 'owner'`,
      [req.params.id, req.params.userId]
    );
    if (isOwner.rows.length > 0) {
      return res.status(400).json({ error: 'Cannot remove the owner' });
    }
    await query(
      `DELETE FROM resource_shares WHERE resource_type = 'project'
       AND resource_id = $1 AND user_id = $2`,
      [req.params.id, req.params.userId]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
