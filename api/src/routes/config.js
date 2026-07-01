const express = require('express');
const { query } = require('../db/client');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendShareNotification } = require('../services/email');
let _pushToUser; // lazy-loaded from notifications route to avoid circular deps

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

router.post('/programs', requireAdmin, async (req, res, next) => {
  try {
    const { id, name } = req.body;
    if (!id?.trim() || !name?.trim()) return res.status(400).json({ error: 'id and name are required' });
    const { rows } = await query(
      'INSERT INTO programs (id, name) VALUES ($1, $2) RETURNING id, name',
      [id.trim(), name.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Program ID already exists' });
    next(err);
  }
});

router.patch('/programs/:id', requireAdmin, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const { rows } = await query(
      'UPDATE programs SET name = $1 WHERE id = $2 RETURNING id, name',
      [name.trim(), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Program not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
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

    // Share each project
    for (const p of projects.rows) {
      await query(
        `INSERT INTO resource_shares (resource_type, resource_id, user_id, permission, shared_by)
         VALUES ('project', $1, $2, $3, $4)
         ON CONFLICT (resource_type, resource_id, user_id) DO UPDATE SET permission = $3`,
        [p.id, userId, permission, req.user.id]
      );
    }

    const sharerName = `${sharer.rows[0].first_name} ${sharer.rows[0].last_name}`;
    const appUrl = process.env.APP_URL || 'http://localhost';

    // Send email
    await sendShareNotification({
      to: target.rows[0].email,
      firstName: target.rows[0].first_name,
      resourceType: 'program',
      resourceName: prog.rows[0].name,
      sharedBy: sharerName,
      link: `${appUrl}/portfolio.html`,
    });

    // Send in-app notification
    const { rows: [notif] } = await query(
      `INSERT INTO notifications (user_id, type, title, body, url, url_label)
       VALUES ($1, 'share', $2, $3, $4, $5)
       RETURNING id, user_id, type, title, body, url, url_label, read_at, created_at`,
      [
        userId,
        `Program shared: ${prog.rows[0].name}`,
        `${sharerName} shared the program "${prog.rows[0].name}" (${projects.rows.length} project${projects.rows.length === 1 ? '' : 's'}) with you.`,
        `${appUrl}/portfolio.html`,
        'Open Portfolio',
      ]
    );

    if (!_pushToUser) _pushToUser = require('./notifications').pushToUser;
    _pushToUser(userId, { event: 'notification', data: notif });

    res.status(201).json({ ok: true, shared: projects.rows.length });
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
    await query('DELETE FROM programs WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── ROLES ─────────────────────────────────────────────────────────────────────

router.get('/roles', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, label, code, team, hourly_rate, rate_overrides FROM roles ORDER BY label'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/roles', requireAdmin, async (req, res, next) => {
  try {
    const { label, code, team, hourlyRate } = req.body;
    if (!label?.trim() || !code?.trim()) return res.status(400).json({ error: 'label and code are required' });
    const { rows } = await query(
      'INSERT INTO roles (label, code, team, hourly_rate) VALUES ($1, $2, $3, $4) RETURNING *',
      [label.trim(), code.trim().toUpperCase(), team?.trim() || null, hourlyRate || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Role code already exists' });
    next(err);
  }
});

router.patch('/roles/:id', requireAdmin, async (req, res, next) => {
  try {
    const { label, code, team, hourlyRate, rateOverrides } = req.body;
    const fields = [];
    const params = [];

    if (label !== undefined)        { params.push(label.trim());                  fields.push(`label = $${params.length}`); }
    if (code !== undefined)         { params.push(code.trim().toUpperCase());      fields.push(`code = $${params.length}`); }
    if (team !== undefined)         { params.push(team?.trim() || null);           fields.push(`team = $${params.length}`); }
    if (hourlyRate !== undefined)   { params.push(hourlyRate);                     fields.push(`hourly_rate = $${params.length}`); }
    if (rateOverrides !== undefined){ params.push(JSON.stringify(rateOverrides));  fields.push(`rate_overrides = $${params.length}`); }

    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE roles SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Role not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Role code already exists' });
    next(err);
  }
});

router.delete('/roles/:id', requireAdmin, async (req, res, next) => {
  try {
    const linked = await query(
      'SELECT COUNT(*) FROM task_roles WHERE role_id = $1',
      [req.params.id]
    );
    if (parseInt(linked.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete role used in cost grids' });
    }
    await query('DELETE FROM roles WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── RATECARDS ─────────────────────────────────────────────────────────────────

router.get('/ratecards', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT r.id, r.name, r.client_id, c.name AS client_name,
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
      GROUP BY r.id, r.name, r.client_id, c.name
      ORDER BY r.client_id NULLS FIRST, r.name
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/ratecards/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT r.id, r.name, r.client_id,
             COALESCE(
               json_agg(
                 json_build_object('roleId', re.role_id, 'label', ro.label, 'hourlyRate', re.hourly_rate,
                                   'rateOverrides', COALESCE(re.rate_overrides, '{}'))
                 ORDER BY ro.label
               ) FILTER (WHERE re.id IS NOT NULL), '[]'
             ) AS entries
      FROM ratecards r
      LEFT JOIN ratecard_entries re ON re.ratecard_id = r.id
      LEFT JOIN roles ro ON ro.id = re.role_id
      WHERE r.id = $1
      GROUP BY r.id, r.name, r.client_id
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Ratecard not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/ratecards', requireAdmin, async (req, res, next) => {
  try {
    const { name, clientId } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const { rows } = await query(
      'INSERT INTO ratecards (name, client_id) VALUES ($1, $2) RETURNING id, name, client_id',
      [name.trim(), clientId || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/ratecards/clone', requireAdmin, async (req, res, next) => {
  try {
    const { clientId, name } = req.body;
    if (!clientId || !name?.trim()) return res.status(400).json({ error: 'clientId and name are required' });

    // Find global ratecard (client_id IS NULL)
    const global = await query(
      'SELECT id FROM ratecards WHERE client_id IS NULL LIMIT 1'
    );
    if (!global.rows[0]) return res.status(404).json({ error: 'No global ratecard found' });

    // Create new ratecard for client
    const newRc = await query(
      'INSERT INTO ratecards (name, client_id) VALUES ($1, $2) RETURNING id',
      [name.trim(), clientId]
    );
    const newId = newRc.rows[0].id;

    // Clone entries from global
    await query(`
      INSERT INTO ratecard_entries (ratecard_id, role_id, hourly_rate)
      SELECT $1, role_id, hourly_rate FROM ratecard_entries WHERE ratecard_id = $2
    `, [newId, global.rows[0].id]);

    res.status(201).json({ id: newId });
  } catch (err) { next(err); }
});

router.patch('/ratecards/:id', requireAdmin, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const result = await query(
      'UPDATE ratecards SET name = $1 WHERE id = $2 RETURNING id, name, client_id',
      [name, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Ratecard not found' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.patch('/ratecards/:id/entries', requireAdmin, async (req, res, next) => {
  try {
    const entries = req.body;
    if (!Array.isArray(entries)) return res.status(400).json({ error: 'Body must be an array' });

    for (const e of entries) {
      const overrides = (e.rateOverrides && typeof e.rateOverrides === 'object') ? e.rateOverrides : {};
      await query(`
        INSERT INTO ratecard_entries (ratecard_id, role_id, hourly_rate, rate_overrides)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (ratecard_id, role_id) DO UPDATE SET hourly_rate = $3, rate_overrides = $4
      `, [req.params.id, e.roleId, e.hourlyRate, JSON.stringify(overrides)]);
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/ratecards/:id', requireAdmin, async (req, res, next) => {
  try {
    const linked = await query(
      'SELECT COUNT(*) FROM cost_grid_versions WHERE ratecard_id = $1',
      [req.params.id]
    );
    if (parseInt(linked.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete ratecard used in cost grids' });
    }
    await query('DELETE FROM ratecards WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
