const express = require('express');
const { query, pool } = require('../db/client');
const { requireAuth, liveRole } = require('../middleware/auth');
const rules = require('../lib/project-rules');
const { withVersionLock, lockVersion } = require('../lib/version-lock');

// A refusal by the project rules: 400 with a code, so a client can tell it from other errors.
const refuse = (res, error) => res.status(400).json({ error, code: rules.RULE_CODE });
// Answers a refusal thrown inside a versionedWrite: STALE/404 (respondSaveError) or a ruleError; true when it did.
function respondWriteError(res, err) {
  if (respondSaveError(res, err)) return true;
  if (!err.isRule) return false;
  res.status(err.status).json(err.code ? { error: err.message, code: err.code } : { error: err.message });
  return true;
}
const { sendShareNotification, sendOwnerReassignedEmail, appLink } = require('../services/email');
const { DATE_RULE, periodError } = require('../lib/dates');
const { isAdminRole } = require('../lib/is-admin');
const { parsePipelineYear, pipelineYearAvailabilityError } = require('../lib/pipeline-year');
const { formatMoney } = require('../lib/money-format');
const { versionRate, CURRENCY_RULE_CODE } = require('../lib/version-rate');
const { versionedWrite, respondSaveError } = require('../services/versioned-write');
const { structureOf } = require('../services/saved-entities');
const { HEADER_FIELDS, ruleError, applyHeader, applyStructure, propagateStage } = require('../services/cost-grid-save');

let _pushToUser;
let _createNotification;

const router = express.Router();


async function notifyAdminsPipelineChange(cgId, vId, oldPipeline, newPipeline) {
  try {
    // Fetch CG name, client name, fee, currency in one query
    const { rows: info } = await query(`
      SELECT cg.name AS cg_name,
             COALESCE(c.name, '') AS client_name,
             cgv.currency,
             COALESCE(cu.symbol, cgv.currency, '€') AS currency_symbol,
             cu.locale AS currency_locale,
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
      GROUP BY cg.name, c.name, cgv.currency, cu.symbol, cu.locale
    `, [vId]);
    if (!info[0]) return;

    const { cg_name, client_name, currency, currency_symbol, currency_locale, fee } = info[0];
    const feeStr = formatMoney(fee, { code: currency, symbol: currency_symbol, locale: currency_locale }, { rounded: true });

    const title = `Pipeline: ${cg_name}`;
    const body = `${client_name ? client_name + ' — ' : ''}${cg_name}\n${oldPipeline} → ${newPipeline}\nValue: ${feeStr}`;
    const url = `/costgrid.html?cgId=${cgId}&verId=${vId}`;
    const urlLabel = 'Open Cost Grid';

    const { rows: admins } = await query(
      `SELECT id FROM users WHERE role IN ('admin', 'sysadmin') AND status = 'active'`
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
  if (isAdminRole(role)) return true;
  const { rows } = await query(
    `SELECT 1 FROM cost_grids cg
     LEFT JOIN resource_shares rs ON rs.resource_type = 'cost_grid' AND rs.resource_id = cg.id AND rs.user_id = $1
     WHERE cg.id = $2 AND (cg.owner_id = $1 OR rs.user_id IS NOT NULL)`,
    [userId, cgId]
  );
  return rows.length > 0;
}

async function canEdit(userId, role, cgId) {
  if (isAdminRole(role)) return true;
  const { rows } = await query(
    `SELECT 1 FROM cost_grids cg
     LEFT JOIN resource_shares rs ON rs.resource_type = 'cost_grid' AND rs.resource_id = cg.id AND rs.user_id = $1
     WHERE cg.id = $2 AND (cg.owner_id = $1 OR (rs.user_id IS NOT NULL AND rs.permission IN ('owner','editor')))`,
    [userId, cgId]
  );
  return rows.length > 0;
}

// True when the grid has a version past Draft; feeds rules.versionCreationError in both version-creation routes.
async function gridHasPublishedVersion(cgId) {
  const { rows } = await query(
    `SELECT 1 FROM cost_grid_versions WHERE cost_grid_id = $1 AND pipeline <> 'Draft' LIMIT 1`,
    [cgId]
  );
  return rows.length > 0;
}

// A version "has projects" when a cg_version_projects row or a project's cg_version_id points at it.
// `q` is the query runner: the pool by default, a transaction client when called under the version lock.
async function versionHasProjects(versionId, q = query) {
  const { rows } = await q(
    `SELECT (EXISTS (SELECT 1 FROM cg_version_projects WHERE cost_grid_version_id = $1)
          OR EXISTS (SELECT 1 FROM projects WHERE cg_version_id = $1)) AS has`, [versionId]);
  return rows[0].has;
}
async function gridHasProjects(gridId) {
  const { rows } = await query(
    `SELECT EXISTS (
       SELECT 1 FROM cost_grid_versions v
       WHERE v.cost_grid_id = $1
         AND (EXISTS (SELECT 1 FROM cg_version_projects cvp WHERE cvp.cost_grid_version_id = v.id)
           OR EXISTS (SELECT 1 FROM projects p WHERE p.cg_version_id = v.id))) AS has`, [gridId]);
  return rows[0].has;
}

// ── COST GRIDS ────────────────────────────────────────────────────────────────

// GET /api/cost-grids[?year=YYYY]
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { year } = req.query;
    const isAdmin = isAdminRole(req.user.role);
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
                    'version',       cgv.version,
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

    let row;
    await versionedWrite(pool, {
      type: 'cost_grid', userId: req.user.id, action: 'create',
      write: async client => {
        ({ rows: [row] } = await client.query(
          `INSERT INTO cost_grids (name, owner_id) VALUES ($1, $2)
           RETURNING id, name, owner_id, created_at, version`,
          [name.trim(), req.user.id]
        ));
        // Register owner in resource_shares
        await client.query(
          `INSERT INTO resource_shares (resource_type, resource_id, user_id, permission, shared_by)
           VALUES ('cost_grid', $1, $2, 'owner', $2)`,
          [row.id, req.user.id]
        );
        return row.id;
      },
    });
    res.status(201).json(row);
  } catch (err) { next(err); }
});

// GET /api/cost-grids/budgets — pre-computed fee+ptc per version for pipeline board cards.
// Must be declared before /:id to avoid Express matching "budgets" as an id param.
router.get('/budgets', requireAuth, async (req, res, next) => {
  try {
    const { id: userId, role } = req.user;
    const isAdmin = isAdminRole(role);
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

// DELETE /api/cost-grids/:id — only allowed when ALL versions are in Draft stage
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (await gridHasPublishedVersion(req.params.id)) {
      return res.status(400).json({ error: 'Cannot delete a proposal that has been published to the pipeline' });
    }
    const delErr = rules.versionRemovalError({ role: await liveRole(req.user.id), hasProjects: await gridHasProjects(req.params.id) });
    if (delErr) return refuse(res, delErr);
    await versionedWrite(pool, {
      type: 'cost_grid', id: req.params.id, unchecked: true, userId: req.user.id, action: 'delete',
      write: client => client.query('DELETE FROM cost_grids WHERE id = $1', [req.params.id]),
    });
    res.json({ ok: true });
  } catch (err) {
    if (respondWriteError(res, err)) return;
    next(err);
  }
});

// ── VERSIONS ──────────────────────────────────────────────────────────────────

// Every /:id/versions/:vId/... route is scoped to its grid: a version that is not in grid :id answers 404,
// whatever the handler below does (2026-09-30 hardening; closes the tag-cycle ":vId not checked against :id"
// finding for structure, linked-projects, duplicate, patch, delete and refresh-rate). Registered after
// requireAuth so an anonymous request still gets 401; canEdit/canAccess stay in each handler.
const { isUuid } = require('../lib/input-rules');
async function versionScope(req, res, next) {
  try {
    const { id, vId } = req.params;
    if (!isUuid(id) || !isUuid(vId)) return res.status(404).json({ error: 'Version not found' });
    const { rows } = await query(
      'SELECT 1 FROM cost_grid_versions WHERE id = $1 AND cost_grid_id = $2', [vId, id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Version not found' });
    next();
  } catch (err) { next(err); }
}
router.use('/:id/versions/:vId', requireAuth, versionScope);

// GET /api/cost-grids/:id/versions
router.get('/:id/versions', requireAuth, async (req, res, next) => {
  try {
    if (!await canAccess(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { rows } = await query(
      `SELECT id, label, pipeline, pipeline_year, start_date, end_date, currency, note, locked, ratecard_id, client_id, project_name, created_at, version
       FROM cost_grid_versions WHERE cost_grid_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// The currencies row of `code` ({ active, current_rate }), or null when the code is unknown.
async function currencyRow(code, q = query) {
  const { rows } = await q('SELECT active, current_rate FROM currencies WHERE code = $1', [code]);
  return rows[0] || null;
}

// POST /api/cost-grids/:id/versions
router.post('/:id/versions', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { label, pipeline, startDate, endDate, currency, note, ratecardId, clientId, projectName, pipelineYear } = req.body;
    if (!label?.trim()) return res.status(400).json({ error: 'label is required' });
    const parsedYear = parsePipelineYear(pipelineYear);
    if (parsedYear.error) return res.status(400).json({ error: parsedYear.error });
    if (parsedYear.year !== null) {
      const { rows: yearRows } = await query('SELECT active FROM pipeline_years WHERE year = $1', [parsedYear.year]);
      const yearErr = pipelineYearAvailabilityError(yearRows[0]);
      if (yearErr) return res.status(400).json({ error: yearErr });
    }
    const periodErr = periodError(startDate, endDate, { kind: 'month', label: 'version' });
    if (periodErr) return res.status(400).json({ error: periodErr, code: DATE_RULE });

    const [role, hasPublishedVersion] = await Promise.all([liveRole(req.user.id), gridHasPublishedVersion(req.params.id)]);
    const versionErr = rules.versionCreationError({ role, hasPublishedVersion });
    if (versionErr) return res.status(400).json({ error: versionErr, code: rules.VERSION_RULE_CODE });

    // The rate is decided by the server only; a currencyRate in the body is ignored
    const resolvedCurrency = currency || 'EUR';
    const rate = versionRate(resolvedCurrency, await currencyRow(resolvedCurrency));
    if (rate.error) return res.status(400).json({ error: rate.error, code: CURRENCY_RULE_CODE });
    const resolvedRate = rate.rate;

    // New versions always start as Draft (published via the /publish endpoint). The Draft carries the pipeline
    // year it was created for, so publishing keeps it; with none, publishing uses the current year.
    let row;
    await versionedWrite(pool, {
      type: 'cost_grid_version', userId: req.user.id, action: 'create',
      write: async client => {
        ({ rows: [row] } = await client.query(
          `INSERT INTO cost_grid_versions (cost_grid_id, label, pipeline, start_date, end_date, currency, currency_rate, note, ratecard_id, client_id, project_name, pipeline_year)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
          [req.params.id, label.trim(), 'Draft', startDate || null, endDate || null,
           resolvedCurrency, resolvedRate, note || null, ratecardId || null, clientId || null, projectName || '', parsedYear.year]
        ));
        return row.id;
      },
    });
    res.status(201).json(row);
  } catch (err) { next(err); }
});

// PUT /api/cost-grids/:id/versions/:vId — the editor's Save: { version, header?, structure? } in one
// versionedWrite. header carries only changed fields among HEADER_FIELDS; structure is { phases, roles }.
router.put('/:id/versions/:vId', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const vId = req.params.vId;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { header, structure } = body;
    if (header !== undefined && (header === null || typeof header !== 'object' || Array.isArray(header))) {
      return res.status(400).json({ error: 'header must be an object' });
    }
    for (const k of Object.keys(header || {})) {
      if (!HEADER_FIELDS.includes(k)) return res.status(400).json({ error: `Unknown field: ${k}` });
    }
    const hasStructure = structure !== undefined && structure !== null;
    if (!Object.keys(header || {}).length && !hasStructure) return res.status(400).json({ error: 'Nothing to update' });

    const role = header?.currency !== undefined ? await liveRole(req.user.id) : null;
    let oldPipeline = null;
    const out = await versionedWrite(pool, {
      type: 'cost_grid_version', id: vId, expectedVersion: body.version, userId: req.user.id, action: 'update',
      write: async client => {
        const { locked } = (await client.query('SELECT locked FROM cost_grid_versions WHERE id = $1', [vId])).rows[0];
        if (locked) throw ruleError('Version is locked');
        await lockVersion(client, vId);
        const h = await applyHeader(client, vId, header, { role });
        oldPipeline = h.stored.pipeline;
        await applyStructure(client, vId, hasStructure ? structure : undefined, h);
        if (header?.pipeline !== undefined && header.pipeline !== oldPipeline) {
          await propagateStage(client, vId, header.pipeline, req.user.id);
        }
      },
    });
    if (header?.pipeline !== undefined && oldPipeline && header.pipeline !== oldPipeline) {
      notifyAdminsPipelineChange(req.params.id, vId, oldPipeline, header.pipeline);
    }
    res.json(out.entity);
  } catch (err) {
    if (respondWriteError(res, err)) return;
    next(err);
  }
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
    const delErr = rules.versionRemovalError({ role: await liveRole(req.user.id), hasProjects: await versionHasProjects(req.params.vId) });
    if (delErr) return refuse(res, delErr);

    await versionedWrite(pool, {
      type: 'cost_grid_version', id: req.params.vId, unchecked: true, userId: req.user.id, action: 'delete',
      write: client => client.query('DELETE FROM cost_grid_versions WHERE id = $1', [req.params.vId]),
    });
    res.json({ ok: true });
  } catch (err) {
    if (respondWriteError(res, err)) return;
    next(err);
  }
});

// POST /api/cost-grids/:id/versions/:vId/duplicate
router.post('/:id/versions/:vId/duplicate', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
    if (!label) return res.status(400).json({ error: 'label is required' });
    const src = await query('SELECT * FROM cost_grid_versions WHERE id = $1', [req.params.vId]);
    if (!src.rows[0]) return res.status(404).json({ error: 'Version not found' });
    const s = src.rows[0];

    const [role, hasPublishedVersion] = await Promise.all([liveRole(req.user.id), gridHasPublishedVersion(req.params.id)]);
    const versionErr = rules.versionCreationError({ role, hasPublishedVersion });
    if (versionErr) return res.status(400).json({ error: versionErr, code: rules.VERSION_RULE_CODE });

    // One transaction: any failure rolls everything back, so no half-copied version is ever left behind.
    const out = await versionedWrite(pool, {
      type: 'cost_grid_version', userId: req.user.id, action: 'create',
      write: async client => {
        // Full copy of the header, always a Draft: unlocked, no links to generated projects. The pipeline year is
        // inherited only from a Draft source (the year it was created for); a published source leaves it empty.
        const newV = await client.query(
          `INSERT INTO cost_grid_versions
             (cost_grid_id, label, pipeline, start_date, end_date, currency, currency_rate, note, ratecard_id, client_id, project_name, pipeline_year)
           VALUES ($1, $2, 'Draft', $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
          [s.cost_grid_id, label, s.start_date, s.end_date, s.currency, s.currency_rate, s.note, s.ratecard_id, s.client_id, s.project_name,
           s.pipeline === 'Draft' ? s.pipeline_year : null]
        );
        const newVId = newV.rows[0].id;

        // Phases → tasks → task_roles (fresh ids everywhere)
        const phases = await client.query('SELECT * FROM phases WHERE version_id = $1 ORDER BY sort_order', [req.params.vId]);
        for (const ph of phases.rows) {
          const newPh = await client.query(
            'INSERT INTO phases (version_id, title, sort_order) VALUES ($1, $2, $3) RETURNING id',
            [newVId, ph.title, ph.sort_order]
          );
          const tasks = await client.query('SELECT * FROM tasks WHERE phase_id = $1 ORDER BY sort_order', [ph.id]);
          for (const tk of tasks.rows) {
            const newTk = await client.query(
              'INSERT INTO tasks (phase_id, title, description, start_date, end_date, ptc, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
              [newPh.rows[0].id, tk.title, tk.description || '', tk.start_date || '', tk.end_date || '', tk.ptc, tk.sort_order]
            );
            await client.query(
              `INSERT INTO task_roles (task_id, role_id, days, rate_override, months, rate_is_custom)
               SELECT $1, role_id, days, rate_override, months, rate_is_custom FROM task_roles WHERE task_id = $2`,
              [newTk.rows[0].id, tk.id]
            );
          }
        }

        await client.query(
          `INSERT INTO cost_grid_version_tags (version_id, item_id)
           SELECT $1, item_id FROM cost_grid_version_tags WHERE version_id = $2`,
          [newVId, req.params.vId]
        );
        return newVId;
      },
    });
    res.status(201).json({ id: out.entity.id });
  } catch (err) { next(err); }
});

// POST /api/cost-grids/:id/versions/:vId/publish — promote Draft → SIP
router.post('/:id/versions/:vId/publish', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const currentYear = new Date().getFullYear();
    const out = await versionedWrite(pool, {
      type: 'cost_grid_version', id: req.params.vId, unchecked: true, userId: req.user.id, action: 'update',
      write: async client => {
        const { pipeline } = (await client.query('SELECT pipeline FROM cost_grid_versions WHERE id = $1', [req.params.vId])).rows[0];
        if (pipeline !== 'Draft') throw ruleError('Only Draft versions can be published');
        await client.query(
          `UPDATE cost_grid_versions SET pipeline = 'SIP', pipeline_year = COALESCE(pipeline_year, $1) WHERE id = $2`,
          [currentYear, req.params.vId]
        );
        await propagateStage(client, req.params.vId, 'SIP', req.user.id);
      },
    });
    notifyAdminsPipelineChange(req.params.id, req.params.vId, 'Draft', 'SIP');
    res.json(out.entity);
  } catch (err) {
    if (respondWriteError(res, err)) return;
    next(err);
  }
});

// ── STRUCTURE ─────────────────────────────────────────────────────────────────

// GET /api/cost-grids/:id/versions/:vId/structure
router.get('/:id/versions/:vId/structure', requireAuth, async (req, res, next) => {
  try {
    if (!await canAccess(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { rows } = await query('SELECT version FROM cost_grid_versions WHERE id = $1', [req.params.vId]);
    res.json({ phases: await structureOf({ query }, req.params.vId), version: rows[0]?.version });
  } catch (err) { next(err); }
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
    const role = await liveRole(req.user.id);
    // The currency check and the insert run under the version lock (see lib/version-lock.js).
    const out = await withVersionLock(req.params.vId, async client => {
      const proj = await client.query('SELECT name, currency FROM projects WHERE id = $1', [projectId]);
      if (!proj.rows[0]) return { status: 404, error: 'Project not found' };
      const ver = await client.query('SELECT currency FROM cost_grid_versions WHERE id = $1', [req.params.vId]);
      // versionScope already answers 404 for a version that is not in this grid; this only keeps the handler safe on its own.
      if (!ver.rows[0]) return { status: 404, error: 'Version not found' };
      const linkErr = rules.linkCurrencyError({ role, projectCurrency: proj.rows[0].currency, versionCurrency: ver.rows[0].currency });
      if (linkErr) return { rule: linkErr };
      await client.query(
        `INSERT INTO cg_version_projects (cost_grid_version_id, project_id, project_name, task_ids, task_names_direct)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (cost_grid_version_id, project_id)
         DO UPDATE SET task_ids = EXCLUDED.task_ids, task_names_direct = EXCLUDED.task_names_direct`,
        [req.params.vId, projectId, proj.rows[0].name, JSON.stringify(taskIds || []), JSON.stringify(taskNames || [])]
      );
      return { ok: true };
    });
    if (out.rule) return refuse(res, out.rule);
    if (out.status) return res.status(out.status).json({ error: out.error });
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id/versions/:vId/linked-projects/:projectId', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const unlinkErr = rules.linkRemovalError({ role: await liveRole(req.user.id) });
    if (unlinkErr) return refuse(res, unlinkErr);
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
    if (!isUuid(userId)) return res.status(400).json({ error: 'userId must be a valid UUID' });

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

    const sharerName = `${sharer.rows[0].first_name} ${sharer.rows[0].last_name}`;

    // The share is stored: a refused email is reported, not turned into an error.
    let emailSent = true;
    try {
      await sendShareNotification({
        to: target.rows[0].email,
        firstName: target.rows[0].first_name,
        resourceType: 'cost grid',
        resourceName: cg.rows[0].name,
        sharedBy: sharerName,
        link: appLink('/pipeline.html'),
      });
    } catch (e) {
      emailSent = false;
      console.warn('[share] email send failed:', e.message);
    }

    if (!_createNotification) _createNotification = require('./notifications').createNotification;
    await _createNotification(userId, {
      type: 'share',
      title: `Cost grid shared: ${cg.rows[0].name}`,
      body: `${sharerName} shared the cost grid "${cg.rows[0].name}" with you.`,
      url: appLink('/pipeline.html'),
      urlLabel: 'Open Pipeline',
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

// ── OWNER REASSIGNMENT (admin/sysadmin, distinct from reset.js's sysadmin-only path) ───────

// PATCH /api/cost-grids/:id/reassign-owner — admin/sysadmin-only. Unlike
// PATCH /api/admin/reset/cost-grid/:cgId/owner (reset.js, sysadmin-exclusive, cost-grid-only),
// this route is reachable from costgrid.html itself, open to any admin or sysadmin, and also
// grants the new owner an 'editor' resource_shares row on every project linked to ANY version
// of this cost grid — the old owner's own access to those projects (as project owner or via
// a separate share) is untouched, since project ownership is a different resource entirely.
router.patch('/:id/reassign-owner', requireAuth, async (req, res, next) => {
  if (!isAdminRole(req.user.role)) return res.status(403).json({ error: 'Access denied' });
  const { id: cgId } = req.params;
  const { ownerId } = req.body;
  if (!ownerId) return res.status(400).json({ error: 'ownerId is required' });

  try {
    let cg, user, linked;
    await versionedWrite(pool, {
      type: 'cost_grid', id: cgId, unchecked: true, userId: req.user.id, action: 'update',
      write: async client => {
        cg = await client.query('SELECT id, name FROM cost_grids WHERE id = $1', [cgId]);
        user = await client.query(
          `SELECT id, email, first_name, last_name FROM users WHERE id = $1 AND status = 'active'`,
          [ownerId]
        );
        if (user.rows.length === 0) throw ruleError('Active user not found', undefined, 404);

        await client.query('UPDATE cost_grids SET owner_id = $1 WHERE id = $2', [ownerId, cgId]);

        await client.query(
          `DELETE FROM resource_shares WHERE resource_type = 'cost_grid' AND resource_id = $1 AND permission = 'owner' AND user_id != $2`,
          [cgId, ownerId]
        );
        await client.query(
          `INSERT INTO resource_shares (resource_type, resource_id, user_id, permission, shared_by)
           VALUES ('cost_grid', $1, $2, 'owner', $3)
           ON CONFLICT (resource_type, resource_id, user_id) DO UPDATE SET permission = 'owner', shared_by = $3`,
          [cgId, ownerId, req.user.id]
        );

        // Every project linked to ANY version of this cost grid — not just the version currently
        // open in the editor — gets an 'editor' grant for the new owner.
        linked = await client.query(
          `SELECT DISTINCT cvp.project_id, p.name AS project_name
           FROM cg_version_projects cvp
           JOIN cost_grid_versions cgv ON cgv.id = cvp.cost_grid_version_id
           JOIN projects p ON p.id = cvp.project_id
           WHERE cgv.cost_grid_id = $1`,
          [cgId]
        );
        for (const row of linked.rows) {
          await client.query(
            `INSERT INTO resource_shares (resource_type, resource_id, user_id, permission, shared_by)
             VALUES ('project', $1, $2, 'editor', $3)
             ON CONFLICT (resource_type, resource_id, user_id) DO UPDATE
             SET permission = 'editor', shared_by = $3 WHERE resource_shares.permission != 'owner'`,
            [row.project_id, ownerId, req.user.id]
          );
        }
      },
    });

    const reassigner = await query('SELECT first_name, last_name FROM users WHERE id = $1', [req.user.id]);
    const reassignerName = `${reassigner.rows[0].first_name} ${reassigner.rows[0].last_name}`;
    sendOwnerReassignedEmail({
      to: user.rows[0].email,
      firstName: user.rows[0].first_name,
      cgName: cg.rows[0].name,
      reassignedBy: reassignerName,
      linkedProjectNames: linked.rows.map(r => r.project_name),
      link: appLink('/pipeline.html'),
    }).catch(e => console.warn('[reassign-owner] email failed:', e.message));

    if (!_createNotification) _createNotification = require('./notifications').createNotification;
    _createNotification(ownerId, {
      type: 'share',
      title: `You are now the owner: ${cg.rows[0].name}`,
      body: `${reassignerName} made you the owner of "${cg.rows[0].name}".`,
      url: appLink('/pipeline.html'),
      urlLabel: 'Open Pipeline',
    }).catch(e => console.warn('[reassign-owner] notification failed:', e.message));

    res.json({ ok: true, cgName: cg.rows[0].name, newOwner: `${user.rows[0].first_name} ${user.rows[0].last_name}` });
  } catch (err) {
    if (respondWriteError(res, err)) return;
    next(err);
  }
});

// POST /api/cost-grids/:id/versions/:vId/refresh-rate
// Snapshots the rate versionRate gives the version's currency (EUR 1, else its live rate); an
// inactive currency is refused with 400 CURRENCY_RULE and the stored rate is kept.
router.post('/:id/versions/:vId/refresh-rate', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    // Under the row lock and then the version lock (the Save's order), so a concurrent currency change
    // cannot land between the read and the write.
    let currency, rate;
    await versionedWrite(pool, {
      type: 'cost_grid_version', id: req.params.vId, unchecked: true, userId: req.user.id, action: 'update',
      write: async client => {
        await lockVersion(client, req.params.vId);
        const q = client.query.bind(client);
        ({ currency } = (await q('SELECT currency FROM cost_grid_versions WHERE id = $1', [req.params.vId])).rows[0]);
        const r = versionRate(currency, await currencyRow(currency, q));
        if (r.error) throw ruleError(r.error, CURRENCY_RULE_CODE);
        rate = r.rate;
        await q('UPDATE cost_grid_versions SET currency_rate = $1 WHERE id = $2', [rate, req.params.vId]);
      },
    });
    res.json({ currency, currency_rate: rate });
  } catch (err) {
    if (respondWriteError(res, err)) return;
    next(err);
  }
});

// ── TAGS ──────────────────────────────────────────────────────────────────────

// True when the version belongs to the cost grid named in the URL.
async function versionInGrid(cgId, vId) {
  const { rows } = await query(
    'SELECT 1 FROM cost_grid_versions WHERE id = $1 AND cost_grid_id = $2', [vId, cgId]
  );
  return rows.length > 0;
}

// GET /api/cost-grids/:id/versions/:vId/tags
router.get('/:id/versions/:vId/tags', requireAuth, async (req, res, next) => {
  try {
    if (!await canAccess(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!await versionInGrid(req.params.id, req.params.vId)) {
      return res.status(404).json({ error: 'Version not found' });
    }
    const { rows } = await query(
      `SELECT ali.id AS item_id, ali.label, ali.status, al.id AS list_id, al.name AS list_name, al.slug AS list_slug
       FROM cost_grid_version_tags cvt
       JOIN attribute_list_items ali ON ali.id = cvt.item_id
       JOIN attribute_lists al ON al.id = ali.list_id
       WHERE cvt.version_id = $1
       ORDER BY al.name, ali.label`,
      [req.params.vId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// PUT /api/cost-grids/:id/versions/:vId/tags — replace-all
router.put('/:id/versions/:vId/tags', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const ver = await query(
      'SELECT locked FROM cost_grid_versions WHERE id = $1 AND cost_grid_id = $2',
      [req.params.vId, req.params.id]
    );
    if (!ver.rows[0]) return res.status(404).json({ error: 'Version not found' });
    if (ver.rows[0].locked) return res.status(400).json({ error: 'Version is locked' });

    const { itemIds = [] } = req.body;
    if (!Array.isArray(itemIds)) return res.status(400).json({ error: 'itemIds must be an array' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM cost_grid_version_tags WHERE version_id = $1', [req.params.vId]);
      await client.query(
        `INSERT INTO cost_grid_version_tags (version_id, item_id)
         SELECT $1::uuid, unnest($2::uuid[]) ON CONFLICT DO NOTHING`,
        [req.params.vId, itemIds]
      );
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err.code === '23503') return res.status(400).json({ error: 'One or more tag items do not exist' });
      if (err.code === '22P02') return res.status(400).json({ error: 'itemIds must be valid UUIDs' });
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

module.exports = router;
