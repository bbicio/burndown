const express = require('express');
const { query, pool } = require('../db/client');
const { requireAuth, liveRole } = require('../middleware/auth');
const { isUuid } = require('../lib/input-rules');
const rules = require('../lib/project-rules');
const { lockVersion } = require('../lib/version-lock');
const { sendShareNotification, sendShareRevokedEmail } = require('../services/email');
const { DATE_RULE, periodError } = require('../lib/dates');
const { isAdminRole } = require('../lib/is-admin');
const { enqueueProjectsQuiet } = require('../services/profile-engine');
const { withTransaction } = require('../db/transaction');
const { versionedWrite, NotFoundError } = require('../services/versioned-write');
const { PROJECT_COLUMNS, PROJECT_FROM, entities } = require('../services/saved-entities');
const { ruleError } = require('../services/cost-grid-save');
const { projectSaveBodyError, applyProjectSave, respondWriteError } = require('../services/project-save');
const projectSnapshot = entities.project.snapshot;
let _createNotification;

const router = express.Router();

// A refusal by the project rules: 400 with a code, so a client can tell it from other errors.
const refuse = (res, error) => res.status(400).json({ error, code: rules.RULE_CODE });

// ── HELPERS ───────────────────────────────────────────────────────────────────

async function canAccess(userId, role, projectId) {
  if (isAdminRole(role)) return true;
  const { rows } = await query(
    `SELECT 1 FROM projects p
     LEFT JOIN resource_shares rs ON rs.resource_type = 'project' AND rs.resource_id = p.id AND rs.user_id = $1
     WHERE p.id = $2 AND (p.owner_id = $1 OR rs.user_id IS NOT NULL)`,
    [userId, projectId]
  );
  return rows.length > 0;
}

async function canEdit(userId, role, projectId) {
  if (isAdminRole(role)) return true;
  const { rows } = await query(
    `SELECT 1 FROM projects p
     LEFT JOIN resource_shares rs ON rs.resource_type = 'project' AND rs.resource_id = p.id AND rs.user_id = $1
     WHERE p.id = $2 AND (p.owner_id = $1 OR (rs.user_id IS NOT NULL AND rs.permission IN ('owner','editor')))`,
    [userId, projectId]
  );
  return rows.length > 0;
}

// Copies a cost grid version's tags onto a project, only when the project has none yet.
// One atomic statement. Best-effort: the project write it follows has already been committed,
// so a failure here is logged, not surfaced. A missed copy is repaired by re-running this same statement by
// hand for that one project (NOT by re-running migration 023, which would also refill
// every project whose tags were deliberately cleared).
async function copyVersionTagsToProject(projectId, versionId) {
  try {
    await query(
      `INSERT INTO project_tags (project_id, item_id)
       SELECT $1::uuid, cvt.item_id
       FROM cost_grid_version_tags cvt
       WHERE cvt.version_id = $2::uuid
         AND NOT EXISTS (SELECT 1 FROM project_tags pt WHERE pt.project_id = $1::uuid)
       ON CONFLICT DO NOTHING`,
      [projectId, versionId]
    );
  } catch (err) {
    console.warn('[projects] copyVersionTagsToProject:', err.message);
  }
}

// Queue a profile recalculation for a project's code (best-effort; a project without a code has none).
async function enqueueProjectCode(projectId) {
  try {
    const { rows } = await query('SELECT code FROM projects WHERE id = $1', [projectId]);
    if (rows[0]?.code) await enqueueProjectsQuiet([rows[0].code]);
  } catch (err) {
    console.warn('[projects] enqueueProjectCode:', err.message);
  }
}

// ── PROJECTS ──────────────────────────────────────────────────────────────────

// GET /api/projects
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const isAdmin = isAdminRole(req.user.role);
    const visibilityClause = isAdmin
      ? ''
      : `AND (p.owner_id = $1 OR EXISTS(
           SELECT 1 FROM resource_shares rs
           WHERE rs.resource_type = 'project' AND rs.resource_id = p.id AND rs.user_id = $1
         ))`;

    // my_permission: 'owner' for admins and owners; else the share permission; null if not shared
    const myPermCol = isAdmin
      ? `'owner'::text AS my_permission,`
      : `CASE WHEN p.owner_id = $1 THEN 'owner'
              ELSE (SELECT rs2.permission FROM resource_shares rs2
                    WHERE rs2.resource_type = 'project' AND rs2.resource_id = p.id AND rs2.user_id = $1
                    LIMIT 1)
         END AS my_permission,`;

    // The columns are the project snapshot's (services/saved-entities.js), so a Save answers in this shape.
    const { rows } = await query(
      `SELECT ${myPermCol}
              ${PROJECT_COLUMNS}
       ${PROJECT_FROM}
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
    const snap = await projectSnapshot(pool, req.params.id);
    res.json({ ...rows[0], links: snap?.links || [] });
  } catch (err) { next(err); }
});

// POST /api/projects
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { id, name, code, programId, clientId, startDate, endDate, currency, pipeline, status, cgVersionId, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const periodErr = periodError(startDate, endDate, { kind: 'month', label: 'project' });
    if (periodErr) return res.status(400).json({ error: periodErr, code: DATE_RULE });

    const safeClientId    = clientId    && isUuid(clientId)    ? clientId    : null;
    const safeCgVersionId = cgVersionId && isUuid(cgVersionId) ? cgVersionId : null;

    const role = await liveRole(req.user.id);
    const createErr = rules.projectCreateError({ role, versionId: safeCgVersionId });
    if (createErr) return refuse(res, createErr);

    const insertParams = [id || null, code?.trim() || null, name.trim(), programId || null, safeClientId, startDate || null,
       endDate || null, currency || 'EUR', pipeline || null, status || null,
       safeCgVersionId, req.user.id, String(description ?? '')];
    // One transaction: linked at creation, the version must exist and share the currency, checked and written
    // under the version lock; the owner's share is written with the row.
    const out = await withTransaction(pool, async client => {
      if (safeCgVersionId) {
        await lockVersion(client, safeCgVersionId);
        const ver = (await client.query('SELECT currency FROM cost_grid_versions WHERE id = $1', [safeCgVersionId])).rows[0];
        if (!ver) throw ruleError(rules.MESSAGES.versionNotFound, rules.RULE_CODE);
        const linkErr = rules.linkCurrencyError({ role, projectCurrency: currency, versionCurrency: ver.currency });
        if (linkErr) throw ruleError(linkErr, rules.RULE_CODE);
      }
      return versionedWrite(client, {
        type: 'project', userId: req.user.id, action: 'create',
        write: async c => {
          const newId = (await c.query(
            `INSERT INTO projects (id, code, name, program_id, client_id, start_date, end_date, currency, pipeline, status, cg_version_id, owner_id, description)
             VALUES (COALESCE($1::uuid, uuid_generate_v4()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING id`, insertParams
          )).rows[0].id;
          await c.query(
            `INSERT INTO resource_shares (resource_type, resource_id, user_id, permission, shared_by)
             VALUES ('project', $1, $2, 'owner', $2)`,
            [newId, req.user.id]
          );
          return { id: newId };
        },
      });
    });

    if (safeCgVersionId) await copyVersionTagsToProject(out.entity.id, safeCgVersionId);
    if (code?.trim()) await enqueueProjectsQuiet([code.trim()]);

    res.status(201).json(out.entity);
  } catch (err) {
    if (respondWriteError(res, err)) return;
    next(err);
  }
});

// PUT /api/projects/:id — the project's Save: { version, header?, tasks?, phasing?, ptc?, planning?, groups? }
// in one versionedWrite, all or nothing. header carries only changed fields among PROJECT_HEADER_FIELDS; each
// section only when changed, `tasks` replacing the task list. The rules (project currency lock, dates, money)
// run on the final state: the period after this header, the tasks of the body or the stored ones.
// Replaces PATCH /:id, PUT /:id/tasks and PATCH /:id/{phasing,ptc,planning,groups} (save-contract cycle 3).
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid project id' });
    const { rows: [found] } = await query('SELECT 1 FROM projects WHERE id = $1', [id]);
    if (!found) return res.status(404).json({ error: 'Project not found' });
    if (!await canEdit(req.user.id, req.user.role, id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const body = req.body;
    const bodyErr = projectSaveBodyError(body);
    if (bodyErr) return res.status(400).json({ error: bodyErr });
    const role = await liveRole(req.user.id);
    // Linking: the version lock comes before the project row lock (see lib/version-lock.js).
    const target = body.header?.cgVersionId || null;
    let result;
    const out = await withTransaction(pool, async client => {
      if (target) await lockVersion(client, target);
      return versionedWrite(client, {
        type: 'project', id, expectedVersion: body.version, userId: req.user.id, action: 'update',
        write: async c => { result = await applyProjectSave(c, id, body, { role, userId: req.user.id }); },
      });
    });
    if (result.seedFromVersionId) await copyVersionTagsToProject(id, result.seedFromVersionId);
    if (result.enqueue) await enqueueProjectsQuiet(result.codes);
    res.json(out.entity);
  } catch (err) {
    if (respondWriteError(res, err)) return;
    next(err);
  }
});

// DELETE /api/projects/:id
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const delErr = rules.projectRemovalError({ role: await liveRole(req.user.id) });
    if (delErr) return refuse(res, delErr);
    const timesheets = await query(
      'SELECT COUNT(*) FROM timesheets t JOIN projects p ON p.code = t.project_code WHERE p.id = $1',
      [req.params.id]
    );
    if (parseInt(timesheets.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete project with uploaded timesheet data' });
    }
    let delCode = null;
    try {
      delCode = (await query('SELECT code FROM projects WHERE id = $1', [req.params.id])).rows[0]?.code ?? null;
    } catch (err) {
      console.warn('[projects] read code before delete:', err.message);
    }
    try {
      await versionedWrite(pool, {
        type: 'project', id: req.params.id, unchecked: true, action: 'delete', userId: req.user.id,
        write: c => c.query('DELETE FROM projects WHERE id = $1', [req.params.id]),
      });
    } catch (err) {
      // A project already gone answers as before: nothing left to delete.
      if (!(err instanceof NotFoundError)) throw err;
    }
    if (delCode) await enqueueProjectsQuiet([delCode]);
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
      `SELECT id, name, description, billable, completed, start_date, end_date,
              monthly_distribution, resources, sort_order
       FROM project_tasks WHERE project_id = $1 ORDER BY sort_order`,
      [req.params.id]
    );
    res.json(rows);
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
    if (!isUuid(userId)) return res.status(400).json({ error: 'userId must be a valid UUID' });

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

    // The share is stored: a refused email is reported, not turned into an error.
    let emailSent = true;
    try {
      await sendShareNotification({
        to: target.rows[0].email,
        firstName: target.rows[0].first_name,
        resourceType: 'project',
        resourceName: proj.rows[0].name,
        sharedBy: sharerName,
        link: `${appUrl}/portfolio.html`,
      });
    } catch (e) {
      emailSent = false;
      console.warn('[share] email send failed:', e.message);
    }

    if (!_createNotification) _createNotification = require('./notifications').createNotification;
    await _createNotification(userId, {
      type: 'share',
      title: `Project shared: ${proj.rows[0].name}`,
      body: `${sharerName} shared the project "${proj.rows[0].name}" with you.`,
      url: `${appUrl}/portfolio.html`,
      urlLabel: 'Open Portfolio',
    });

    res.status(201).json({ ok: true, emailSent });
  } catch (err) { next(err); }
});

router.delete('/:id/shares/:userId', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!isUuid(req.params.userId)) return res.status(400).json({ error: 'userId must be a valid UUID' });
    const isOwner = await query(
      `SELECT 1 FROM resource_shares WHERE resource_type = 'project'
       AND resource_id = $1 AND user_id = $2 AND permission = 'owner'`,
      [req.params.id, req.params.userId]
    );
    if (isOwner.rows.length > 0) {
      return res.status(400).json({ error: 'Cannot remove the owner' });
    }

    const [target, proj, revoker] = await Promise.all([
      query('SELECT email, first_name FROM users WHERE id = $1', [req.params.userId]),
      query('SELECT name FROM projects WHERE id = $1', [req.params.id]),
      query('SELECT first_name, last_name FROM users WHERE id = $1', [req.user.id]),
    ]);

    await query(
      `DELETE FROM resource_shares WHERE resource_type = 'project'
       AND resource_id = $1 AND user_id = $2`,
      [req.params.id, req.params.userId]
    );

    // Best-effort — the row is already gone either way, and a departed/anonymized
    // target may no longer resolve to a real user row.
    if (target.rows[0]) {
      const revokerName = `${revoker.rows[0].first_name} ${revoker.rows[0].last_name}`;
      sendShareRevokedEmail({
        to: target.rows[0].email,
        firstName: target.rows[0].first_name,
        resourceType: 'project',
        resourceName: proj.rows[0].name,
        revokedBy: revokerName,
      }).catch(e => console.warn('[share-revoke] email failed:', e.message));

      if (!_createNotification) _createNotification = require('./notifications').createNotification;
      _createNotification(req.params.userId, {
        type: 'share',
        title: `Access removed: ${proj.rows[0].name}`,
        body: `${revokerName} removed your access to the project "${proj.rows[0].name}".`,
      }).catch(e => console.warn('[share-revoke] notification failed:', e.message));
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── TAGS ──────────────────────────────────────────────────────────────────────

async function listProjectTags(projectId) {
  const { rows } = await query(
    `SELECT ali.id AS item_id, ali.label, ali.status, al.id AS list_id, al.name AS list_name, al.slug AS list_slug
     FROM project_tags pt
     JOIN attribute_list_items ali ON ali.id = pt.item_id
     JOIN attribute_lists al ON al.id = ali.list_id
     WHERE pt.project_id = $1
     ORDER BY al.name, ali.label`,
    [projectId]
  );
  return rows;
}

// GET /api/projects/:id/tags
router.get('/:id/tags', requireAuth, async (req, res, next) => {
  try {
    if (!await canAccess(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json(await listProjectTags(req.params.id));
  } catch (err) { next(err); }
});

// PUT / DELETE /api/projects/:id/tags/:itemId — assign / remove one tag; the answer is the list.
// Project tags are autonomous from the linked proposal (Cycle 3a): they are seeded once by
// copyVersionTagsToProject, then edited here.
async function changeProjectTag(req, res, next, assign) {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { rows: projRows } = await query('SELECT 1 FROM projects WHERE id = $1', [req.params.id]);
    if (!projRows[0]) return res.status(404).json({ error: 'Project not found' });
    if (!isUuid(req.params.itemId)) return res.status(400).json({ error: 'itemId must be a valid UUID' });

    let touched;
    try {
      const r = assign
        ? await query(
            'INSERT INTO project_tags (project_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [req.params.id, req.params.itemId])
        : await query(
            'DELETE FROM project_tags WHERE project_id = $1 AND item_id = $2',
            [req.params.id, req.params.itemId]);
      touched = r.rowCount;
    } catch (err) {
      if (err.code === '23503') return res.status(400).json({ error: 'Tag item does not exist' });
      throw err;
    }
    if (touched > 0) await enqueueProjectCode(req.params.id);
    res.json(await listProjectTags(req.params.id));
  } catch (err) { next(err); }
}
router.put('/:id/tags/:itemId', requireAuth, (req, res, next) => changeProjectTag(req, res, next, true));
router.delete('/:id/tags/:itemId', requireAuth, (req, res, next) => changeProjectTag(req, res, next, false));

module.exports = router;
// The edit permission on a project, also checked by Add tasks (routes/cost-grids.js).
module.exports.canEditProject = canEdit;
