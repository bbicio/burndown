const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query } = require('../db/client');
const { setAuthCookie, clearAuthCookie } = require('../services/jwt');
const { sendInvite, sendPasswordReset, sendAdminNotificationEmail, sendLoginCode } = require('../services/email');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { pushToUser } = require('./notifications');
const { rectificationError } = require('../lib/user-details');
const T = require('../lib/two-step');
const { createLimiter } = require('../lib/rate-limit');
const twoStep = require('../services/two-step');

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Failed password attempts only: a successful login does not count, so a shared NAT or the test suite
// can sign in as often as it likes while guessing stays capped. Checked with peek before bcrypt,
// counted with hit on a 401. In memory: the counters are lost on restart.
const loginIpLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 30 });
const loginEmailLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
// Every code sent (login that opens a challenge, resend): 10 per user per hour.
const sendLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 10 });

const CHALLENGE_COOKIE = 'pdash_challenge';
const DEVICE_COOKIE = 'pdash_device';
const COOKIE_PATH = '/api/auth';

function setChallengeCookie(res, token) {
  res.cookie(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: COOKIE_PATH,
    maxAge: T.CHALLENGE_TTL_MS,
  });
}

function setDeviceCookie(res, token) {
  res.cookie(DEVICE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: COOKIE_PATH,
    maxAge: T.TRUST_DAYS * 24 * 60 * 60 * 1000,
  });
}

function clearChallengeCookie(res) { res.clearCookie(CHALLENGE_COOKIE, { path: COOKIE_PATH }); }
function clearDeviceCookie(res) { res.clearCookie(DEVICE_COOKIE, { path: COOKIE_PATH }); }

const seconds = ms => Math.max(1, Math.ceil(ms / 1000));

function rateLimited(res, retryInMs) {
  return res.status(429).json({ error: 'Too many attempts', code: 'RATE_LIMITED', retryIn: seconds(retryInMs) });
}

function signedInBody(user) {
  return { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, role: user.role };
}

// The code mail is the one step that may fail without failing the login: the challenge stays and the
// user can ask for a new code. Resolves to true when the mail was handed over.
async function deliverCode(challengeId, user, code) {
  try {
    await sendLoginCode({ to: user.email, firstName: user.first_name, code });
    await twoStep.markSent(challengeId);
    return true;
  } catch (e) {
    console.warn('[two-step] code email failed:', e.message);
    return false;
  }
}

// The challenge of the pdash_challenge cookie and its user, or null (cookie cleared, challenge dropped
// when its user is gone or no longer active).
async function challengeOf(req, res) {
  const ch = await twoStep.findChallenge(req.cookies && req.cookies[CHALLENGE_COOKIE]);
  if (!ch) { clearChallengeCookie(res); return null; }
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [ch.user_id]);
  const user = rows[0];
  if (!user || user.status !== 'active') {
    await twoStep.deleteChallenge(ch.id);
    clearChallengeCookie(res);
    return null;
  }
  return { ch, user };
}

function noChallenge(res) {
  return res.status(401).json({ error: 'Sign-in expired', code: 'NO_CHALLENGE' });
}

async function getCurrentTermsVersion() {
  const { rows } = await query('SELECT COALESCE(MAX(version), 1) AS value FROM terms_versions');
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
      `SELECT id, email, first_name, last_name, role, status, terms_version,
              created_at, terms_accepted_at, password_changed_at, two_step_method
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    const currentTermsVersion = await getCurrentTermsVersion();
    const { two_step_method: method, ...me } = rows[0];
    res.json({
      ...me,
      current_terms_version: currentTermsVersion,
      two_step: { method, destination: T.maskEmail(me.email) },
    });
  } catch (err) { next(err); }
});

// POST /api/auth/rectification-request — the user's details are managed by an admin; the user asks
// for a correction instead. Recorded in rectification_requests and notified to every active admin.
router.post('/rectification-request', requireAuth, async (req, res, next) => {
  try {
    const { message } = req.body || {};
    const err = rectificationError(message);
    if (err) return res.status(400).json({ error: err });
    const text = message.trim();

    const me = (await query('SELECT first_name, last_name FROM users WHERE id = $1', [req.user.id])).rows[0];
    if (!me) return res.status(404).json({ error: 'User not found' });
    const { rows: [request] } = await query(
      'INSERT INTO rectification_requests (user_id, message) VALUES ($1, $2) RETURNING id', [req.user.id, text]);

    const title = `Profile change requested by ${me.first_name} ${me.last_name}`;
    const { rows: admins } = await query(
      `SELECT id, email, first_name FROM users
       WHERE status = 'active' AND role IN ('admin','sysadmin') AND id <> $1`,
      [req.user.id]
    );
    // Once the request is recorded the answer is 201: a failed delivery to one admin is logged, never a 500
    // that a retry would turn into a second request.
    for (const a of admins) {
      try {
        // Inserted already linked to the request (one statement), so anonymizing the requester deletes it
        // (notifications.rectification_request_id ON DELETE CASCADE).
        const { rows: [n] } = await query(
          `INSERT INTO notifications (user_id, type, title, body, url, url_label, rectification_request_id)
           VALUES ($1, 'info', $2, $3, '/admin.html', 'Open User Admin', $4)
           RETURNING id, user_id, type, title, body, url, url_label, read_at, created_at`,
          [a.id, title, text, request.id]
        );
        pushToUser(a.id, { event: 'notification', data: n });
      } catch (e) {
        // The email below still goes out: this admin hears of the request through one channel at least.
        console.warn('[rectification] notification failed:', e.message);
      }
      // The mailer escapes what it puts in the HTML; the in-app notification stays text.
      sendAdminNotificationEmail({
        to: a.email,
        firstName: a.first_name,
        title,
        body: text,
        url: '/admin.html',
      }).catch(e => console.warn('[rectification] email send failed:', e.message));
    }
    res.status(201).json({ ok: true });
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

// POST /api/auth/login — the password step. With a trusted device the session opens here; otherwise a
// challenge is opened, the code is mailed and the answer carries no pdash_token.
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const normalized = String(email).toLowerCase();
    const ipKey = req.ip;
    const gate = [loginIpLimiter.peek(ipKey), loginEmailLimiter.peek(normalized)].find(g => !g.allowed);
    if (gate) return rateLimited(res, gate.retryInMs);

    const { rows } = await query('SELECT * FROM users WHERE email = $1', [normalized]);
    const user = rows[0];

    const valid = user && user.password_hash && await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      loginIpLimiter.hit(ipKey);
      loginEmailLimiter.hit(normalized);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (user.status === 'disabled') return res.status(403).json({ error: 'Account disabled' });
    if (user.status === 'pending') return res.status(403).json({ error: 'Account not yet activated' });

    const device = await twoStep.findTrustedDevice(req.cookies && req.cookies[DEVICE_COOKIE]);
    if (T.deviceTrusted(device, user, Date.now())) {
      await twoStep.touchDevice(device.id);
      setAuthCookie(res, { id: user.id, email: user.email, role: user.role });
      return res.json(signedInBody(user));
    }

    const send = sendLimiter.hit(user.id);
    if (!send.allowed) return rateLimited(res, send.retryInMs);

    const { challenge, token, code } = await twoStep.createChallenge(user.id);
    const sent = await deliverCode(challenge.id, user, code);
    setChallengeCookie(res, token);
    res.json({
      twoStep: {
        method: 'email',
        destination: T.maskEmail(user.email),
        expiresIn: T.CODE_TTL_MS / 1000,
        resendIn: sent ? T.RESEND_COOLDOWN_MS / 1000 : 0,
        sendFailed: !sent,
      },
    });
  } catch (err) { next(err); }
});

// POST /api/auth/two-step/verify — the code step. Attempts are counted per challenge; a resend does
// not reset them.
router.post('/two-step/verify', async (req, res, next) => {
  try {
    const found = await challengeOf(req, res);
    if (!found) return noChallenge(res);
    const { ch, user } = found;

    const attempts = await twoStep.recordAttempt(ch.id);
    if (attempts === null) {
      await twoStep.deleteChallenge(ch.id);
      clearChallengeCookie(res);
      return res.status(423).json({ error: 'Too many attempts', code: 'LOCKED' });
    }

    const entered = T.normalizeCode(req.body && req.body.code);
    const expected = Buffer.from(ch.code_hash);
    const given = Buffer.from(T.hashCode(process.env.JWT_SECRET, ch.id, entered));
    const matches = entered.length === 6 && given.length === expected.length && crypto.timingSafeEqual(given, expected);
    const outcome = T.verifyOutcome({ attempts, code_expires_at: ch.code_expires_at }, Date.now(), matches);

    if (outcome.result === 'expired') return res.status(410).json({ error: 'Code expired', code: 'CODE_EXPIRED' });
    if (outcome.result === 'wrong') {
      return res.status(400).json({ error: 'Incorrect code', code: 'WRONG_CODE', attemptsLeft: outcome.attemptsLeft });
    }
    if (outcome.result === 'locked') {
      await twoStep.deleteChallenge(ch.id);
      clearChallengeCookie(res);
      return res.status(423).json({ error: 'Too many attempts', code: 'LOCKED' });
    }

    await twoStep.deleteChallenge(ch.id);
    clearChallengeCookie(res);
    if (req.body && req.body.trustDevice === true) {
      const deviceToken = await twoStep.trustDevice(user.id, req.get('user-agent'));
      setDeviceCookie(res, deviceToken);
    }
    setAuthCookie(res, { id: user.id, email: user.email, role: user.role });
    res.json(signedInBody(user));
  } catch (err) { next(err); }
});

// POST /api/auth/two-step/resend — a new code replaces the old one.
router.post('/two-step/resend', async (req, res, next) => {
  try {
    const found = await challengeOf(req, res);
    if (!found) return noChallenge(res);
    const { ch, user } = found;

    const wait = T.resendWait(ch, Date.now());
    if (wait === 'exhausted') {
      return rateLimited(res, new Date(ch.expires_at).getTime() - Date.now());
    }
    if (wait > 0) {
      return res.status(429).json({ error: 'Wait before asking for a new code', code: 'COOLDOWN', retryIn: seconds(wait) });
    }
    const send = sendLimiter.hit(user.id);
    if (!send.allowed) return rateLimited(res, send.retryInMs);

    const code = await twoStep.replaceCode(ch.id);
    if (!await deliverCode(ch.id, user, code)) {
      return res.status(502).json({ error: 'The email could not be sent', code: 'SEND_FAILED' });
    }
    res.json({ ok: true, expiresIn: T.CODE_TTL_MS / 1000, resendIn: T.RESEND_COOLDOWN_MS / 1000 });
  } catch (err) { next(err); }
});

// DELETE /api/auth/two-step — "Back to sign in": drops the open challenge. Always 200.
router.delete('/two-step', async (req, res, next) => {
  try {
    const ch = await twoStep.findChallenge(req.cookies && req.cookies[CHALLENGE_COOKIE]);
    if (ch) await twoStep.deleteChallenge(ch.id);
    clearChallengeCookie(res);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/auth/trusted-devices
router.get('/trusted-devices', requireAuth, async (req, res, next) => {
  try {
    res.json(await twoStep.listDevices(req.user.id, req.cookies && req.cookies[DEVICE_COOKIE]));
  } catch (err) { next(err); }
});

// DELETE /api/auth/trusted-devices — every device of the user.
router.delete('/trusted-devices', requireAuth, async (req, res, next) => {
  try {
    await twoStep.removeAllDevices(req.user.id);
    clearDeviceCookie(res);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/auth/trusted-devices/:id
router.delete('/trusted-devices/:id', requireAuth, async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Device not found' });
    const r = await twoStep.removeDevice(req.user.id, req.params.id, req.cookies && req.cookies[DEVICE_COOKIE]);
    if (!r.removed) return res.status(404).json({ error: 'Device not found' });
    if (r.wasCurrent) clearDeviceCookie(res);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/auth/logout — pdash_device stays: signing out does not untrust the browser.
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  clearChallengeCookie(res);
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

// POST /api/auth/:id/resend-invite  (admin only) — fresh 48h token, still-pending users only
router.post('/:id/resend-invite', requireAdmin, async (req, res, next) => {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
      return res.status(404).json({ error: 'User not found' });
    }
    const { rows } = await query(
      `SELECT email, first_name, status FROM users WHERE id = $1`,
      [req.params.id]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status !== 'pending') return res.status(400).json({ error: 'This user is not a pending invite' });

    const { tok, exp } = token48h();
    await query(
      `UPDATE users SET invite_token = $1, invite_expires = $2 WHERE id = $3`,
      [tok, exp, req.params.id]
    );

    await sendInvite({ to: user.email, firstName: user.first_name, token: tok });
    res.json({ ok: true });
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
      `UPDATE users SET password_hash = $1, password_changed_at = NOW(), status = 'active', invite_token = NULL, invite_expires = NULL WHERE id = $2`,
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
      `UPDATE users SET password_hash = $1, password_changed_at = NOW(), reset_token = NULL, reset_expires = NULL WHERE id = $2`,
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
    // 400, not 401: the shared client treats a 401 as an expired session and redirects to login.
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect', field: 'currentPassword' });

    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1, password_changed_at = NOW() WHERE id = $2', [hash, req.user.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
