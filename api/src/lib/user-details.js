// Rules for a user's name and email, edited only by an admin (`PATCH /api/users/:id`),
// and for the rectification request a user sends instead (`POST /api/auth/rectification-request`).
// Pure — no DB/Express dependency.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ANON_EMAIL_RE = /^anon_.+@deleted\.local$/;
const MAX_LEN = 255;
const RECTIFICATION_MAX = 2000;

const FIELDS = [
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'email', label: 'Email' },
];

function normalizeDetails({ firstName, lastName, email } = {}) {
  const out = {};
  if (firstName !== undefined) out.firstName = String(firstName ?? '').trim();
  if (lastName !== undefined) out.lastName = String(lastName ?? '').trim();
  if (email !== undefined) out.email = String(email ?? '').trim().toLowerCase();
  return out;
}

function detailsError(normalized) {
  const present = FIELDS.filter(f => normalized[f.key] !== undefined);
  if (!present.length) return { field: null, error: 'Nothing to update' };
  for (const { key, label } of present) {
    const v = normalized[key];
    if (key === 'email') {
      if (!EMAIL_RE.test(v)) return { field: key, error: 'Invalid email address' };
      // The address anonymize writes: on a live account it would make the row read as anonymized for good.
      if (ANON_EMAIL_RE.test(v)) return { field: key, error: 'This address is reserved' };
    } else if (!v) {
      return { field: key, error: `${label} is required` };
    }
    if (v.length > MAX_LEN) return { field: key, error: `${label} is too long` };
  }
  return null;
}

function rectificationError(message) {
  if (typeof message !== 'string' || !message.trim()) return 'Describe what needs to change';
  if (message.trim().length > RECTIFICATION_MAX) return `Keep it under ${RECTIFICATION_MAX} characters`;
  return null;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { ANON_EMAIL_RE, normalizeDetails, detailsError, RECTIFICATION_MAX, rectificationError, escapeHtml };
