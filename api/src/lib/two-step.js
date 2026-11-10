const crypto = require('crypto');

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const CHALLENGE_TTL_MS = 30 * 60 * 1000;
const MAX_SENDS = 5;
const TRUST_DAYS = 30;
const TWO_STEP_METHODS = ['email'];

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function normalizeCode(input) {
  return String(input == null ? '' : input).replace(/\D/g, '');
}

function hashCode(secret, challengeId, code) {
  return crypto.createHmac('sha256', secret).update(`${challengeId}:${code}`).digest('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ch.attempts is already incremented for the attempt being judged.
function verifyOutcome(ch, now, matches) {
  if (new Date(ch.code_expires_at).getTime() < now) return { result: 'expired' };
  if (matches) return { result: 'ok' };
  if (ch.attempts >= MAX_ATTEMPTS) return { result: 'locked' };
  return { result: 'wrong', attemptsLeft: MAX_ATTEMPTS - ch.attempts };
}

function resendWait(ch, now) {
  if (ch.sends >= MAX_SENDS) return 'exhausted';
  if (!ch.code_sent_at) return 0;
  const left = new Date(ch.code_sent_at).getTime() + RESEND_COOLDOWN_MS - now;
  return left > 0 ? left : 0;
}

function maskEmail(email) {
  const s = String(email || '');
  const at = s.lastIndexOf('@');
  if (at < 1) return '•••';
  return `${s[0]}•••${s.slice(at)}`;
}

function deviceLabel(ua) {
  const s = String(ua || '');
  let browser = 'Unknown browser';
  if (/Edg(e|A|iOS)?\//.test(s)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(s)) browser = 'Opera';
  else if (/Firefox\/|FxiOS\//.test(s)) browser = 'Firefox';
  else if (/Chrome\/|CriOS\//.test(s)) browser = 'Chrome';
  else if (/Safari\//.test(s)) browser = 'Safari';

  let os = 'Unknown device';
  let kind = 'desktop';
  if (/iPhone/.test(s)) { os = 'iPhone'; kind = 'mobile'; }
  else if (/iPad/.test(s)) { os = 'iPad'; kind = 'mobile'; }
  else if (/Android/.test(s)) { os = 'Android'; kind = 'mobile'; }
  else if (/Windows/.test(s)) os = 'Windows';
  else if (/Mac OS X|Macintosh/.test(s)) os = 'macOS';
  else if (/Linux|X11/.test(s)) os = 'Linux';

  return { label: `${browser} on ${os}`, kind };
}

function deviceTrusted(device, user, now) {
  if (!device || !user) return false;
  if (device.user_id !== user.id) return false;
  if (new Date(device.expires_at).getTime() <= now) return false;
  if (user.password_changed_at
      && new Date(device.created_at).getTime() <= new Date(user.password_changed_at).getTime()) return false;
  return true;
}

module.exports = {
  CODE_TTL_MS, RESEND_COOLDOWN_MS, MAX_ATTEMPTS, CHALLENGE_TTL_MS, MAX_SENDS, TRUST_DAYS, TWO_STEP_METHODS,
  generateCode, normalizeCode, hashCode, hashToken, newToken,
  verifyOutcome, resendWait, maskEmail, deviceLabel, deviceTrusted,
};
