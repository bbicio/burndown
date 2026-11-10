// The pdash_token claims and the check requireAuth makes on every request against the user's row.
// `pwd` is password_changed_at in whole milliseconds (null when the column is NULL): a password change
// ends every session signed before it.

function sessionClaims(user) {
  const at = user.password_changed_at;
  return { id: user.id, email: user.email, role: user.role, pwd: at ? new Date(at).getTime() : null };
}

// `row` is { status, role, pwd } read by requireAuth, `pwd` the bigint string pg returns or null.
// A token signed before the claim existed has no `pwd` and is refused.
function sessionError(claims, row) {
  if (!row || row.status !== 'active') return 'Session expired';
  if (!claims || !('pwd' in claims)) return 'Session expired';
  const stored = row.pwd === null || row.pwd === undefined ? null : Number(row.pwd);
  if (claims.pwd !== stored) return 'Session expired';
  return null;
}

module.exports = { sessionClaims, sessionError };
