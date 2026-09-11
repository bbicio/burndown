// Single source of truth for "does this role carry admin capabilities?".
// `sysadmin` sits above `admin` and inherits every admin capability, so every
// role check that used to be a bare `role === 'admin'` literal must go through
// here. Pure — no DB/Express dependency — so it is testable in isolation.
function isAdminRole(role) {
  return role === 'admin' || role === 'sysadmin';
}

module.exports = { isAdminRole };
