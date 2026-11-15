// Pure helpers for the invite/reset token routes (routes/auth.js).
const RESET_TTL_MS = 2 * 60 * 60 * 1000;
const RESET_COOLDOWN_MS = 2 * 60 * 1000;

function isStr(v) {
  return typeof v === 'string';
}

function emailKey(v) {
  return v.trim().toLowerCase();
}

// A pending reset's age comes from its expiry: the token was issued RESET_TTL_MS before it expires.
function resetIssuedRecently(resetExpires, now = Date.now()) {
  if (resetExpires == null) return false;
  const issuedAt = new Date(resetExpires).getTime() - RESET_TTL_MS;
  return now - issuedAt < RESET_COOLDOWN_MS;
}

module.exports = { RESET_TTL_MS, RESET_COOLDOWN_MS, isStr, emailKey, resetIssuedRecently };
