// Pure helpers for the invite/reset token routes (routes/auth.js).
const RESET_TTL_MS = 2 * 60 * 60 * 1000;
const RESET_COOLDOWN_MS = 2 * 60 * 1000;

function isStr(v) {
  return typeof v === 'string';
}

function emailKey(v) {
  return v.trim().toLowerCase();
}

// A reset issued within the cooldown expires in (edge, ceiling]: it was written RESET_TTL_MS before its expiry.
// An expiry beyond the ceiling was written under a longer lifetime, so it is not "just issued". The ceiling has
// a cooldown of slack: a parallel request computes its expiry a few ms after this one's bounds, and its row must
// still count as just issued, or that request would replace the link this one is about to mail.
// The route puts both bounds in the UPDATE itself, so the check and the write are one atomic step.
function resetCooldownBounds(now = Date.now()) {
  return {
    edge: new Date(now + RESET_TTL_MS - RESET_COOLDOWN_MS),
    ceiling: new Date(now + RESET_TTL_MS + RESET_COOLDOWN_MS),
  };
}

module.exports = { RESET_TTL_MS, RESET_COOLDOWN_MS, isStr, emailKey, resetCooldownBounds };
