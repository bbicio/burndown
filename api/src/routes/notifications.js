const express = require('express');
const { query } = require('../db/client');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendAdminNotificationEmail } = require('../services/email');

const router = express.Router();

// ── IN-PROCESS SSE REGISTRY ───────────────────────────────────────────────────
// userId (string) → Set<res>
const sseClients = new Map();

function pushToUser(userId, data) {
  const conns = sseClients.get(userId);
  if (!conns || conns.size === 0) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of conns) {
    try { res.write(payload); } catch (_) {}
  }
}

// ── GET /api/notifications/stream ─────────────────────────────────────────────

router.get('/stream', requireAuth, (req, res) => {
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Connection',        'keep-alive');
  res.flushHeaders();

  const userId = req.user.id;
  if (!sseClients.has(userId)) sseClients.set(userId, new Set());
  sseClients.get(userId).add(res);

  // Heartbeat every 25 s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (_) {}
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const conns = sseClients.get(userId);
    if (conns) {
      conns.delete(res);
      if (conns.size === 0) sseClients.delete(userId);
    }
  });
});

// ── GET /api/notifications ────────────────────────────────────────────────────

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, type, title, body, url, url_label, read_at, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /api/notifications/unread-count ──────────────────────────────────────

router.get('/unread-count', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [req.user.id]
    );
    res.json({ count: parseInt(rows[0].count, 10) });
  } catch (err) { next(err); }
});

// ── PATCH /api/notifications/read-all ────────────────────────────────────────

router.patch('/read-all', requireAuth, async (req, res, next) => {
  try {
    await query(
      'UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL',
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── PATCH /api/notifications/:id/read ────────────────────────────────────────

router.patch('/:id/read', requireAuth, async (req, res, next) => {
  try {
    await query(
      'UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2 AND read_at IS NULL',
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── POST /api/notifications ───────────────────────────────────────────────────

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { userId, type = 'info', title, body, url, urlLabel, channels } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });

    const chans = Array.isArray(channels) && channels.length ? channels : ['push'];
    const wantPush = chans.includes('push');
    const wantEmail = chans.includes('email');

    let targets;
    if (userId) {
      const { rows } = await query(
        `SELECT id, email, first_name FROM users WHERE id = $1 AND status = 'active'`,
        [userId]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Target user not found' });
      targets = rows;
    } else {
      // Broadcast to all active users — admin only
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can broadcast to all users' });
      }
      const { rows } = await query("SELECT id, email, first_name FROM users WHERE status = 'active'");
      targets = rows;
    }

    const created = [];
    for (const u of targets) {
      const { rows } = await query(
        `INSERT INTO notifications (user_id, type, title, body, url, url_label)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, user_id, type, title, body, url, url_label, read_at, created_at`,
        [u.id, type, title.trim(), body || null, url || null, urlLabel || null]
      );
      const notifRow = rows[0];
      created.push(notifRow);
      if (wantPush) pushToUser(u.id, { event: 'notification', data: notifRow });
      if (wantEmail) {
        sendAdminNotificationEmail({
          to: u.email,
          firstName: u.first_name,
          title: title.trim(),
          body: body || '',
          url: url || null,
        }).catch(e => console.warn('[notify] email send failed:', e.message));
      }
    }

    res.status(201).json({ ok: true, created: created.length });
  } catch (err) { next(err); }
});

module.exports = { router, pushToUser };
