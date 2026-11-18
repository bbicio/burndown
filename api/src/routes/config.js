const express = require('express');
const { query, pool } = require('../db/client');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { isAdminRole } = require('../lib/is-admin');
const { amountError, overridesError, ratecardEntryError, MONEY_RULE_CODE, MAX_DECIMAL_10_2 } = require('../lib/money-rules');
const { isUuid } = require('../lib/input-rules');
const { sendShareNotification } = require('../services/email');
const { withTransaction } = require('../db/transaction');
const { versionedWrite, respondSaveError, NotFoundError } = require('../services/versioned-write');
const { RANK_SQL } = require('../lib/share-rank');
const { ratecardSnapshot } = require('../services/saved-entities');
let _createNotification; // lazy-loaded from notifications route to avoid circular deps

const router = express.Router();

// ── CLIENTS ───────────────────────────────────────────────────────────────────

router.get('/clients', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, name FROM clients ORDER BY name');
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/clients', requireAdmin, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const existing = await query('SELECT id FROM clients WHERE lower(name) = lower($1)', [name.trim()]);
    if (existing.rows[0]) return res.status(409).json({ error: 'Client name already exists' });
    const { rows } = await query(
      'INSERT INTO clients (name) VALUES ($1) RETURNING id, name',
      [name.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/clients/:id', requireAdmin, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const { rows } = await query(
      'UPDATE clients SET name = $1 WHERE id = $2 RETURNING id, name',
      [name.trim(), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Client not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/clients/:id', requireAdmin, async (req, res, next) => {
  try {
    const linked = await query(
      'SELECT COUNT(*) FROM projects WHERE client_id = $1',
      [req.params.id]
    );
    if (parseInt(linked.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete client with linked projects' });
    }
    await query('DELETE FROM clients WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── PROGRAMS ──────────────────────────────────────────────────────────────────

router.get('/programs', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, name FROM programs ORDER BY name');
    res.json(rows);
  } catch (err) { next(err); }
});

// requireAuth, not requireAdmin: project-config.html's own "+ New program" button is already
// reachable by any non-viewer (owner/editor), and costgrid.html's Generate Project flow needs the
// same access for a non-admin proposal owner/editor establishing a proposal's first program.
router.post('/programs', requireAuth, async (req, res, next) => {
  try {
    const { id, name } = req.body;
    if (!id?.trim() || !name?.trim()) return res.status(400).json({ error: 'id and name are required' });
    const out = await versionedWrite(pool, {
      type: 'program', action: 'create', userId: req.user.id,
      write: async c => (await c.query(
        'INSERT INTO programs (id, name) VALUES ($1, $2) RETURNING id', [id.trim(), name.trim()]
      )).rows[0].id,
    });
    res.status(201).json(out.entity);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Program ID already exists' });
    next(err);
  }
});

// requireAuth (not requireAdmin), matching POST /programs above
// program via costgrid.html's Generate Project flow needs to be able to fix a typo in its name.
// Same ownership check as POST /programs/:id/share below — admin, or owner/editor on at least one
// of the program's projects — except a program with zero projects yet (still being established;
// the sole existing caller creates the project only after this PATCH becomes reachable, but a
// prior generation attempt may have failed after creating the program, per _pushProjectToApi's
// failure path) is left open to any authenticated user, the same as POST /programs itself.
router.patch('/programs/:id', requireAuth, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

    if (!isAdminRole(req.user.role)) {
      const projects = await query('SELECT id FROM projects WHERE program_id = $1', [req.params.id]);
      if (projects.rows.length) {
        const projectIds = projects.rows.map(p => p.id);
        const access = await query(
          `SELECT 1 FROM projects p
           LEFT JOIN resource_shares rs ON rs.resource_type = 'project' AND rs.resource_id = p.id AND rs.user_id = $1
           WHERE p.id = ANY($2::uuid[]) AND (p.owner_id = $1 OR (rs.user_id IS NOT NULL AND rs.permission IN ('owner','editor')))
           LIMIT 1`,
          [req.user.id, projectIds]
        );
        if (!access.rows.length) return res.status(403).json({ error: 'Access denied' });
      }
    }

    const out = await versionedWrite(pool, {
      type: 'program', id: req.params.id, unchecked: true, action: 'update', userId: req.user.id,
      write: c => c.query('UPDATE programs SET name = $1 WHERE id = $2', [name.trim(), req.params.id]),
    });
    res.json(out.entity);
  } catch (err) {
    if (respondSaveError(res, err)) return;
    next(err);
  }
});

// POST /programs/:id/share — share all projects in a program with a user
router.post('/programs/:id/share', requireAuth, async (req, res, next) => {
  try {
    const { userId, permission } = req.body;
    if (!['editor', 'viewer'].includes(permission)) {
      return res.status(400).json({ error: 'permission must be editor or viewer' });
    }

    const prog = await query('SELECT id, name FROM programs WHERE id = $1', [req.params.id]);
    if (!prog.rows[0]) return res.status(404).json({ error: 'Program not found' });

    const target = await query(
      'SELECT id, email, first_name FROM users WHERE id = $1 AND status = $2', [userId, 'active']
    );
    if (!target.rows[0]) return res.status(404).json({ error: 'User not found' });

    const sharer = await query('SELECT first_name, last_name FROM users WHERE id = $1', [req.user.id]);

    // Find all projects in this program
    const projects = await query('SELECT id FROM projects WHERE program_id = $1', [req.params.id]);
    if (!projects.rows.length) return res.status(400).json({ error: 'Program has no projects' });

    // Caller must be an admin or already hold owner/editor access on at least one project in
    // this program — otherwise POST /programs (requireAuth) plus this route would let any
    // authenticated user attach their own project to an arbitrary existing program and then
    // grant themselves editor access to every other project in it.
    if (!isAdminRole(req.user.role)) {
      const projectIds = projects.rows.map(p => p.id);
      const access = await query(
        `SELECT 1 FROM projects p
         LEFT JOIN resource_shares rs ON rs.resource_type = 'project' AND rs.resource_id = p.id AND rs.user_id = $1
         WHERE p.id = ANY($2::uuid[]) AND (p.owner_id = $1 OR (rs.user_id IS NOT NULL AND rs.permission IN ('owner','editor')))
         LIMIT 1`,
        [req.user.id, projectIds]
      );
      if (!access.rows.length) return res.status(403).json({ error: 'Access denied' });
    }

    // Share each project in one logged program update. A permission never goes down (share-rank.js): an existing
    // owner or editor keeps it. granted = new rows, raised = rows taken to a higher permission, kept = the rest.
    let granted = 0, raised = 0, kept = 0;
    await versionedWrite(pool, {
      type: 'program', id: req.params.id, unchecked: true, action: 'update', userId: req.user.id,
      write: async c => {
        for (const p of projects.rows) {
          const { rows: [r] } = await c.query(
            `WITH prev AS (
               SELECT permission FROM resource_shares
               WHERE resource_type = 'project' AND resource_id = $1 AND user_id = $2
             )
             INSERT INTO resource_shares (resource_type, resource_id, user_id, permission, shared_by)
             VALUES ('project', $1, $2, $3, $4)
             ON CONFLICT (resource_type, resource_id, user_id) DO UPDATE SET permission =
               CASE WHEN ${RANK_SQL('EXCLUDED.permission')} > ${RANK_SQL('resource_shares.permission')}
                    THEN EXCLUDED.permission ELSE resource_shares.permission END
             RETURNING (SELECT permission FROM prev) AS before, permission`,
            [p.id, userId, permission, req.user.id]
          );
          if (r.before == null) granted++;
          else if (r.permission !== r.before) raised++;
          else kept++;
        }
      },
    });

    const sharerName = `${sharer.rows[0].first_name} ${sharer.rows[0].last_name}`;
    const appUrl = process.env.APP_URL || 'http://localhost';

    // Send email — the shares are stored: a refused email is reported, not turned into an error.
    let emailSent = true;
    try {
      await sendShareNotification({
        to: target.rows[0].email,
        firstName: target.rows[0].first_name,
        resourceType: 'program',
        resourceName: prog.rows[0].name,
        sharedBy: sharerName,
        link: `${appUrl}/portfolio.html`,
      });
    } catch (e) {
      emailSent = false;
      console.warn('[share] email send failed:', e.message);
    }

    // Send in-app notification
    if (!_createNotification) _createNotification = require('./notifications').createNotification;
    await _createNotification(userId, {
      type: 'share',
      title: `Program shared: ${prog.rows[0].name}`,
      body: `${sharerName} shared the program "${prog.rows[0].name}" (${projects.rows.length} project${projects.rows.length === 1 ? '' : 's'}) with you.`,
      url: `${appUrl}/portfolio.html`,
      urlLabel: 'Open Portfolio',
    });

    res.status(201).json({ ok: true, shared: projects.rows.length, granted, raised, kept, emailSent });
  } catch (err) { next(err); }
});

router.delete('/programs/:id', requireAdmin, async (req, res, next) => {
  try {
    const linked = await query(
      'SELECT COUNT(*) FROM projects WHERE program_id = $1',
      [req.params.id]
    );
    if (parseInt(linked.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete program with linked projects' });
    }
    try {
      await versionedWrite(pool, {
        type: 'program', id: req.params.id, unchecked: true, action: 'delete', userId: req.user.id,
        write: c => c.query('DELETE FROM programs WHERE id = $1', [req.params.id]),
      });
    } catch (err) {
      // A program already gone answers as before.
      if (!(err instanceof NotFoundError)) throw err;
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── ROLES ─────────────────────────────────────────────────────────────────────
// Every write of a role or a rate card goes through versionedWrite (the save contract): the body
// carries the version the client started from, a different or missing one answers 409 STALE, and
// a success answers the saved entity and leaves its snapshot in change_log.

// A refusal found inside a write: thrown, so the transaction rolls back, and answered as a 400.
function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// 409 STALE, 404, or a 400 thrown inside a write; true when answered.
function answerRefusal(res, err) {
  if (respondSaveError(res, err)) return true;
  if (err.status === 400) { res.status(400).json({ error: err.message }); return true; }
  return false;
}

router.get('/roles', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, label, code, team, hourly_rate, rate_overrides, version FROM roles ORDER BY label'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/roles', requireAdmin, async (req, res, next) => {
  try {
    const { label, code, team, hourlyRate, rateOverrides } = req.body;
    if (!label?.trim() || !code?.trim()) return res.status(400).json({ error: 'label and code are required' });
    const moneyErr = (hourlyRate != null ? amountError(hourlyRate, 'EUR', 'Hourly rate', { max: MAX_DECIMAL_10_2 }) : null)
      || overridesError(rateOverrides, 'Rate overrides');
    if (moneyErr) return res.status(400).json({ error: moneyErr, code: MONEY_RULE_CODE });
    const { entity } = await versionedWrite(pool, {
      type: 'role', userId: req.user.id, action: 'create',
      write: async client => (await client.query(
        'INSERT INTO roles (label, code, team, hourly_rate, rate_overrides) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [label.trim(), code.trim().toUpperCase(), team?.trim() || null, hourlyRate ?? null, JSON.stringify(rateOverrides ?? {})]
      )).rows[0].id,
    });
    res.status(201).json(entity);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Role code already exists' });
    next(err);
  }
});

// Partial: a field absent from the body is left as it is; `version` is required.
router.patch('/roles/:id', requireAdmin, async (req, res, next) => {
  try {
    const { label, code, team, hourlyRate, rateOverrides } = req.body;
    const moneyErr = (hourlyRate !== undefined && hourlyRate !== null ? amountError(hourlyRate, 'EUR', 'Hourly rate', { max: MAX_DECIMAL_10_2 }) : null)
      || (rateOverrides !== undefined ? overridesError(rateOverrides, 'Rate overrides') : null);
    if (moneyErr) return res.status(400).json({ error: moneyErr, code: MONEY_RULE_CODE });
    const fields = [];
    const params = [];

    if (label !== undefined)        { params.push(label.trim());                  fields.push(`label = $${params.length}`); }
    if (code !== undefined)         { params.push(code.trim().toUpperCase());      fields.push(`code = $${params.length}`); }
    if (team !== undefined)         { params.push(team?.trim() || null);           fields.push(`team = $${params.length}`); }
    if (hourlyRate !== undefined)   { params.push(hourlyRate);                     fields.push(`hourly_rate = $${params.length}`); }
    if (rateOverrides !== undefined){ params.push(JSON.stringify(rateOverrides));  fields.push(`rate_overrides = $${params.length}`); }

    const { entity } = await versionedWrite(pool, {
      type: 'role', id: req.params.id, expectedVersion: req.body?.version, userId: req.user.id, action: 'update',
      write: async client => {
        if (!fields.length) throw badRequest('Nothing to update');
        params.push(req.params.id);
        await client.query(`UPDATE roles SET ${fields.join(', ')} WHERE id = $${params.length}`, params);
      },
    });
    res.json(entity);
  } catch (err) {
    if (answerRefusal(res, err)) return;
    if (err.code === '23505') return res.status(409).json({ error: 'Role code already exists' });
    next(err);
  }
});

// The CASCADE on ratecard_entries changes every card holding the role, so each of them gets a new
// version and a 'role-deleted' snapshot in the same transaction.
router.delete('/roles/:id', requireAdmin, async (req, res, next) => {
  try {
    const roleId = req.params.id;
    await withTransaction(pool, async client => {
      // Cards first, then the role: the entries PATCH locks its card and then (through the FK) the
      // role, so the same order keeps the two from deadlocking.
      const cards = await client.query(
        `SELECT id, version FROM ratecards
         WHERE id IN (SELECT ratecard_id FROM ratecard_entries WHERE role_id = $1)
         ORDER BY id FOR UPDATE`, [roleId]
      );
      await versionedWrite(client, {
        type: 'role', id: roleId, expectedVersion: req.body?.version, userId: req.user.id, action: 'delete',
        write: async c => {
          const linked = await c.query('SELECT COUNT(*) FROM task_roles WHERE role_id = $1', [roleId]);
          if (parseInt(linked.rows[0].count) > 0) throw badRequest('Cannot delete role used in cost grids');
          const assigned = await c.query('SELECT COUNT(*) FROM resources WHERE role_id = $1', [roleId]);
          if (parseInt(assigned.rows[0].count) > 0) throw badRequest('Cannot delete role assigned to a team resource');
          await c.query('DELETE FROM roles WHERE id = $1', [roleId]);
        },
      });
      for (const card of cards.rows) {
        await versionedWrite(client, {
          type: 'ratecard', id: card.id, expectedVersion: card.version, userId: req.user.id, action: 'role-deleted',
          write: async () => {},
        });
      }
    });
    res.json({ ok: true });
  } catch (err) {
    if (answerRefusal(res, err)) return;
    // A resource assigned to this role between the check and the delete: same answer, not a 500.
    // Only for that FK — any other constraint must not be reported as a team-resource problem.
    if (err.code === '23503' && /resources/.test(err.constraint || '')) {
      return res.status(400).json({ error: 'Cannot delete role assigned to a team resource' });
    }
    next(err);
  }
});

// ── RATECARDS ─────────────────────────────────────────────────────────────────

router.get('/ratecards', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT r.id, r.name, r.client_id, r.version, c.name AS client_name,
             COALESCE(
               json_agg(
                 json_build_object('roleId', re.role_id, 'label', ro.label, 'hourlyRate', re.hourly_rate,
                                   'rateOverrides', COALESCE(re.rate_overrides, '{}'))
                 ORDER BY ro.label
               ) FILTER (WHERE re.id IS NOT NULL), '[]'
             ) AS entries
      FROM ratecards r
      LEFT JOIN clients c ON c.id = r.client_id
      LEFT JOIN ratecard_entries re ON re.ratecard_id = r.id
      LEFT JOIN roles ro ON ro.id = re.role_id
      GROUP BY r.id, r.name, r.client_id, r.version, c.name
      ORDER BY r.client_id NULLS FIRST, r.name
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/ratecards/:id', requireAuth, async (req, res, next) => {
  try {
    const card = await ratecardSnapshot(pool, req.params.id);
    if (!card) return res.status(404).json({ error: 'Ratecard not found' });
    res.json(card);
  } catch (err) { next(err); }
});

router.post('/ratecards', requireAdmin, async (req, res, next) => {
  try {
    const { name, clientId } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    if (!isUuid(clientId)) return res.status(400).json({ error: 'clientId is required' });
    const { entity, created } = await versionedWrite(pool, {
      type: 'ratecard', userId: req.user.id, action: 'create',
      write: async client => {
        // A client has one rate card: the client row lock makes concurrent creates converge on the same card.
        const lockedClient = await client.query('SELECT id FROM clients WHERE id = $1 FOR NO KEY UPDATE', [clientId]);
        if (!lockedClient.rows[0]) throw badRequest('Client not found');
        const existing = await client.query(
          'SELECT id FROM ratecards WHERE client_id = $1 ORDER BY created_at, id LIMIT 1', [clientId]
        );
        if (existing.rows[0]) return { id: existing.rows[0].id, created: false };
        const { rows } = await client.query(
          'INSERT INTO ratecards (name, client_id) VALUES ($1, $2) RETURNING id', [name.trim(), clientId]
        );
        return rows[0].id;
      },
    });
    // An existing card answers 200 with its entries, so a caller never shows it as empty.
    res.status(created === false ? 200 : 201).json(entity);
  } catch (err) {
    if (answerRefusal(res, err)) return;
    if (err.code === '23503') return res.status(400).json({ error: 'Client not found' });
    next(err);
  }
});

router.patch('/ratecards/:id', requireAdmin, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const { entity } = await versionedWrite(pool, {
      type: 'ratecard', id: req.params.id, expectedVersion: req.body?.version, userId: req.user.id, action: 'update',
      write: async client => {
        await client.query('UPDATE ratecards SET name = $1 WHERE id = $2', [name, req.params.id]);
      },
    });
    res.json(entity);
  } catch (err) {
    if (answerRefusal(res, err)) return;
    next(err);
  }
});

router.patch('/ratecards/:id/entries', requireAdmin, async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid ratecard id' });
    // A bare array is the pre-version body: it carries no version, so versionedWrite answers STALE.
    const entries = Array.isArray(req.body) ? req.body : req.body?.entries;
    if (!Array.isArray(entries)) return res.status(400).json({ error: 'Body must be { version, entries }' });

    const seen = new Set();
    for (let i = 0; i < entries.length; i++) {
      if (typeof entries[i]?.roleId !== 'string' || !isUuid(entries[i].roleId)) {
        return res.status(400).json({ error: `Entry ${i + 1} needs a valid roleId` });
      }
      if (seen.has(entries[i].roleId)) return res.status(400).json({ error: `Entry ${i + 1} repeats a role` });
      seen.add(entries[i].roleId);
      const moneyErr = ratecardEntryError(entries[i], `Entry ${i + 1}`);
      if (moneyErr) return res.status(400).json({ error: moneyErr, code: MONEY_RULE_CODE });
    }

    // Full replacement: roles missing from the body lose their entry.
    const { entity } = await versionedWrite(pool, {
      type: 'ratecard', id: req.params.id, expectedVersion: req.body?.version, userId: req.user.id, action: 'update-entries',
      write: async client => {
        // An entry whose role was deleted since the modal opened is dropped, not an error.
        const known = await client.query('SELECT id FROM roles WHERE id = ANY($1::uuid[])', [entries.map(e => e.roleId)]);
        const knownIds = new Set(known.rows.map(r => r.id));
        const kept = entries.filter(e => knownIds.has(e.roleId));
        await client.query(
          'DELETE FROM ratecard_entries WHERE ratecard_id = $1 AND NOT (role_id = ANY($2::uuid[]))',
          [req.params.id, kept.map(e => e.roleId)]
        );
        if (kept.length) {
          await client.query(`
            INSERT INTO ratecard_entries (ratecard_id, role_id, hourly_rate, rate_overrides)
            SELECT $1::uuid, t.role_id, t.hourly_rate, t.rate_overrides
            FROM unnest($2::uuid[], $3::numeric[], $4::jsonb[]) AS t(role_id, hourly_rate, rate_overrides)
            ON CONFLICT (ratecard_id, role_id) DO UPDATE
              SET hourly_rate = EXCLUDED.hourly_rate, rate_overrides = EXCLUDED.rate_overrides
          `, [
            req.params.id,
            kept.map(e => e.roleId),
            kept.map(e => e.hourlyRate ?? null),
            kept.map(e => JSON.stringify((e.rateOverrides && typeof e.rateOverrides === 'object') ? e.rateOverrides : {})),
          ]);
        }
      },
    });
    res.json(entity);
  } catch (err) {
    if (answerRefusal(res, err)) return;
    if (err.code === '23503') return res.status(400).json({ error: 'Unknown role in the entries' });
    next(err);
  }
});

router.delete('/ratecards/:id', requireAdmin, async (req, res, next) => {
  try {
    await versionedWrite(pool, {
      type: 'ratecard', id: req.params.id, expectedVersion: req.body?.version, userId: req.user.id, action: 'delete',
      write: async client => {
        const linked = await client.query('SELECT COUNT(*) FROM cost_grid_versions WHERE ratecard_id = $1', [req.params.id]);
        if (parseInt(linked.rows[0].count) > 0) throw badRequest('Cannot delete ratecard used in cost grids');
        await client.query('DELETE FROM ratecards WHERE id = $1', [req.params.id]);
      },
    });
    res.json({ ok: true });
  } catch (err) {
    if (answerRefusal(res, err)) return;
    next(err);
  }
});

module.exports = router;
