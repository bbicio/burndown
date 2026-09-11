// Validates a requested users.role change beyond the simple "is it a known
// role" check already done by the caller. Pure — no DB/Express dependency —
// so the sysadmin promotion rules are testable in isolation.
function roleChangeError(actorRole, targetCurrentRole, requestedRole) {
  const touchesSysAdmin = requestedRole === 'sysadmin' || targetCurrentRole === 'sysadmin';
  if (touchesSysAdmin && actorRole !== 'sysadmin') {
    return 'Only a sysadmin can grant or revoke sysadmin';
  }
  if (requestedRole === 'sysadmin' && targetCurrentRole !== 'admin') {
    return 'Only an admin can be promoted to sysadmin';
  }
  // Symmetric with promotion: a sysadmin steps down through admin, never
  // straight to user, in one call.
  if (targetCurrentRole === 'sysadmin' && requestedRole !== 'sysadmin' && requestedRole !== 'admin') {
    return 'A sysadmin must first be demoted to admin before becoming a plain user';
  }
  return null;
}

module.exports = { roleChangeError };
