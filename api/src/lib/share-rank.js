// The order of the share permissions: owner > editor > viewer. A share that would lower a permission
// keeps the higher one (program share, save contract cycle 3).
const PERMISSION_RANK = { viewer: 1, editor: 2, owner: 3 };

// The higher of two permissions; with no current permission, the next one.
function higherPermission(current, next) {
  if (!current) return next;
  return (PERMISSION_RANK[next] || 0) > (PERMISSION_RANK[current] || 0) ? next : current;
}

// The same ranks as a SQL CASE over a column expression, so a query never restates the scale.
function RANK_SQL(col) {
  return `(CASE ${col} WHEN 'owner' THEN 3 WHEN 'editor' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END)`;
}

module.exports = { PERMISSION_RANK, higherPermission, RANK_SQL };
