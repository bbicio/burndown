export function matchesTaskRole(record, taskName, role) {
  const roleMatches = (record.role || '').toLowerCase() === (role || '').toLowerCase();
  const taskMatches = !taskName || (record.task || '').toLowerCase() === taskName.toLowerCase();
  return roleMatches && taskMatches;
}

export function computeResidual(soldH, consumedH) {
  return Math.max(0, soldH - consumedH);
}

window.matchesTaskRole = matchesTaskRole;
window.computeResidual = computeResidual;
