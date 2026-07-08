export function matchesTaskRole(record, taskName, role) {
  const roleMatches = (record.role || '').toLowerCase() === (role || '').toLowerCase();
  const taskMatches = !taskName || (record.task || '').toLowerCase() === taskName.toLowerCase();
  return roleMatches && taskMatches;
}

export function computeResidual(soldH, consumedH) {
  return Math.max(0, soldH - consumedH);
}

export function distributeFutureResidual(residualH, totalFutureWeeks, weeksByMonth, pulseEnabled) {
  const totalWeeks = weeksByMonth.reduce((s, m) => s + m.weekKeys.length, 0);
  const hPerWeek = totalFutureWeeks > 0 ? residualH / totalFutureWeeks
                 : (totalWeeks > 0 ? residualH / totalWeeks : 0);

  if (pulseEnabled && hPerWeek < 1) {
    return weeksByMonth.map(m => ({
      key: m.weekKeys[0],
      hours: hPerWeek * m.weekKeys.length,
      isPulse: true,
    }));
  }
  return weeksByMonth.flatMap(m => m.weekKeys.map(key => ({ key, hours: hPerWeek, isPulse: false })));
}

window.matchesTaskRole = matchesTaskRole;
window.computeResidual = computeResidual;
window.distributeFutureResidual = distributeFutureResidual;
