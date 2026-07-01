const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query } = require('../db/client');
const { setAuthCookie, clearAuthCookie } = require('../services/jwt');
const { sendInvite, sendPasswordReset } = require('../services/email');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

async function getCurrentTermsVersion() {
  const { rows } = await query("SELECT value FROM app_settings WHERE key = 'terms_version'");
  return parseInt(rows[0]?.value || '1');
}

function token48h() {
  const tok = crypto.randomBytes(32).toString('hex');
  const exp = new Date(Date.now() + 48 * 60 * 60 * 1000);
  return { tok, exp };
}

function token2h() {
  const tok = crypto.randomBytes(32).toString('hex');
  const exp = new Date(Date.now() + 2 * 60 * 60 * 1000);
  return { tok, exp };
}

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, email, first_name, last_name, role, status, terms_version FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    const currentTermsVersion = await getCurrentTermsVersion();
    res.json({ ...rows[0], current_terms_version: currentTermsVersion });
  } catch (err) { next(err); }
});

// PATCH /api/auth/profile — update own name / email
router.patch('/profile', requireAuth, async (req, res, next) => {
  try {
    const { firstName, lastName, email } = req.body;
    const fields = [], params = [];

    if (firstName !== undefined) { params.push(firstName.trim()); fields.push(`first_name = $${params.length}`); }
    if (lastName  !== undefined) { params.push(lastName.trim());  fields.push(`last_name = $${params.length}`); }
    if (email     !== undefined) {
      const normalized = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
        return res.status(400).json({ error: 'Invalid email address' });
      const dup = await query('SELECT id FROM users WHERE email = $1 AND id <> $2', [normalized, req.user.id]);
      if (dup.rows[0]) return res.status(409).json({ error: 'Email already in use' });
      params.push(normalized); fields.push(`email = $${params.length}`);
    }

    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(req.user.id);
    const { rows } = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${params.length}
       RETURNING id, email, first_name, last_name, role`,
      params
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/auth/accept-terms
router.post('/accept-terms', requireAuth, async (req, res, next) => {
  try {
    const currentTermsVersion = await getCurrentTermsVersion();
    await query(
      'UPDATE users SET terms_version = $1, terms_accepted_at = NOW() WHERE id = $2',
      [currentTermsVersion, req.user.id]
    );
    res.json({ ok: true, terms_version: currentTermsVersion });
  } catch (err) { next(err); }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = rows[0];

    const valid = user && user.password_hash && await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });
    if (user.status === 'disabled') return res.status(403).json({ error: 'Account disabled' });
    if (user.status === 'pending') return res.status(403).json({ error: 'Account not yet activated' });

    setAuthCookie(res, { id: user.id, email: user.email, role: user.role });
    res.json({ id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, role: user.role });
  } catch (err) { next(err); }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// POST /api/auth/invite  (admin only)
router.post('/invite', requireAdmin, async (req, res, next) => {
  try {
    const { email, firstName, lastName, role } = req.body;
    if (!email || !firstName || !lastName) return res.status(400).json({ error: 'email, firstName and lastName required' });
    if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'role must be admin or user' });

    const exists = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (exists.rows[0]) return res.status(409).json({ error: 'Email already registered' });

    const { tok, exp } = token48h();
    const { rows } = await query(
      `INSERT INTO users (email, first_name, last_name, role, status, invite_token, invite_expires, invited_by)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7) RETURNING id`,
      [email.toLowerCase(), firstName, lastName, role, tok, exp, req.user.id]
    );

    await sendInvite({ to: email, firstName, token: tok });
    res.status(201).json({ id: rows[0].id });
  } catch (err) { next(err); }
});

// GET /api/auth/invite/:token
router.get('/invite/:token', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT email, first_name, last_name FROM users
       WHERE invite_token = $1 AND invite_expires > NOW() AND status = 'pending'`,
      [req.params.token]
    );
    if (!rows[0]) return res.status(410).json({ error: 'Invalid or expired invite link' });
    res.json({ email: rows[0].email, firstName: rows[0].first_name, lastName: rows[0].last_name });
  } catch (err) { next(err); }
});

// POST /api/auth/activate
router.post('/activate', async (req, res, next) => {
  try {
    const { token, password, passwordConfirm } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'token and password required' });
    if (password !== passwordConfirm) return res.status(400).json({ error: 'Passwords do not match' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const { rows } = await query(
      `SELECT id FROM users WHERE invite_token = $1 AND invite_expires > NOW() AND status = 'pending'`,
      [token]
    );
    if (!rows[0]) return res.status(410).json({ error: 'Invalid or expired invite link' });

    const hash = await bcrypt.hash(password, 12);
    await query(
      `UPDATE users SET password_hash = $1, status = 'active', invite_token = NULL, invite_expires = NULL WHERE id = $2`,
      [hash, rows[0].id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    // Always return 200 — do not reveal if email exists
    if (!email) return res.json({ ok: true });

    const { rows } = await query(
      `SELECT id, first_name FROM users WHERE email = $1 AND status = 'active'`,
      [email.toLowerCase()]
    );
    if (rows[0]) {
      const { tok, exp } = token2h();
      await query(
        `UPDATE users SET reset_token = $1, reset_expires = $2 WHERE id = $3`,
        [tok, exp, rows[0].id]
      );
      await sendPasswordReset({ to: email, firstName: rows[0].first_name, token: tok });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/auth/reset-password/:token
router.get('/reset-password/:token', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id FROM users WHERE reset_token = $1 AND reset_expires > NOW()`,
      [req.params.token]
    );
    if (!rows[0]) return res.status(410).json({ error: 'Invalid or expired reset link' });
    res.json({ valid: true });
  } catch (err) { next(err); }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password, passwordConfirm } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'token and password required' });
    if (password !== passwordConfirm) return res.status(400).json({ error: 'Passwords do not match' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const { rows } = await query(
      `SELECT id FROM users WHERE reset_token = $1 AND reset_expires > NOW()`,
      [token]
    );
    if (!rows[0]) return res.status(410).json({ error: 'Invalid or expired reset link' });

    const hash = await bcrypt.hash(password, 12);
    await query(
      `UPDATE users SET password_hash = $1, reset_token = NULL, reset_expires = NULL WHERE id = $2`,
      [hash, rows[0].id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword, newPasswordConfirm } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'All fields required' });
    if (newPassword !== newPasswordConfirm) return res.status(400).json({ error: 'Passwords do not match' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
