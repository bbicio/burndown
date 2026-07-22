export function versionHasFreeTasks(ver) {
  const assignedIds = new Set();
  const assignedNames = new Set();
  (ver.linkedProjects || []).forEach(lp => {
    (lp.taskIds || []).forEach(id => assignedIds.add(id));
    (lp.taskNames || []).forEach(n => { if (n?.trim()) assignedNames.add(n.trim().toLowerCase()); });
  });
  return (ver.phases || []).flatMap(ph => ph.tasks || []).some(t =>
    t.taskName?.trim() && !assignedIds.has(t.taskId) && !assignedNames.has(t.taskName.trim().toLowerCase())
  );
}

export function isVersionCommittedLocked(ver) {
  return ver?.pipeline === 'Committed' && !versionHasFreeTasks(ver);
}

window.versionHasFreeTasks = versionHasFreeTasks;
window.isVersionCommittedLocked = isVersionCommittedLocked;

// ── RATE RESOLUTION ──────────────────────────────────────────────────────────
// Deduplicates the 3-tier rate chain (ratecard per-currency override → role-level
// per-currency override → EUR baseline × live exchange rate) that was previously
// repeated, slightly differently, in cgSyncRoleRatesToBaseline, cgPreviewRateChange,
// and the role-selector list's rate badge.
export function resolveRoleRate({ roleId, globalRate, currency, currencyRate, ratecardMap = {}, ratecardOverrides = {}, roleOverrides = {} }) {
  const rid = String(roleId);
  const ratecardEurRate = ratecardMap[rid];
  const eurRate = ratecardEurRate !== undefined ? ratecardEurRate : (globalRate || 0);
  if (currency === 'EUR') {
    return { eurRate, effectiveRate: eurRate, isOverride: false };
  }
  const ratecardOverride = (ratecardOverrides[rid] || {})[currency];
  const roleOverride = roleOverrides ? roleOverrides[currency] : undefined;
  if (ratecardOverride != null) return { eurRate, effectiveRate: ratecardOverride, isOverride: true };
  if (roleOverride != null) return { eurRate, effectiveRate: roleOverride, isOverride: true };
  const converted = Math.round(eurRate * (currencyRate || 1) * 100) / 100;
  return { eurRate, effectiveRate: converted, isOverride: false };
}

// ── TOTALS (relocated verbatim from js/costgrid.js:1696-1741) ────────────────
export function cgComputeTaskTotals(task, roles) {
  let totalHrs = 0, totalFee = 0;
  (roles || []).forEach(r => {
    const h = parseFloat(task.hours[r.roleCode]) || 0;
    totalHrs += h;
    totalFee += h * (r.rate || 0);
  });
  const ptc = parseFloat(task.ptc) || 0;
  return { totalHrs: Math.round(totalHrs * 100) / 100, totalFee, totalCostAndFee: totalFee + ptc };
}

export function cgComputePhaseTotals(phase, roles) {
  let hrs = 0, fee = 0, ptc = 0;
  const byRole = {};
  (roles || []).forEach(r => { byRole[r.roleCode] = 0; });
  (phase.tasks || []).forEach(task => {
    const tt = cgComputeTaskTotals(task, roles);
    hrs += tt.totalHrs;
    fee += tt.totalFee;
    ptc += parseFloat(task.ptc) || 0;
    (roles || []).forEach(r => { byRole[r.roleCode] = (byRole[r.roleCode] || 0) + (parseFloat(task.hours[r.roleCode]) || 0); });
  });
  return { hrs: Math.round(hrs * 100) / 100, fee, ptc, byRole };
}

export function cgComputeGrandTotals(version) {
  let hrs = 0, fee = 0, ptc = 0;
  (version.phases || []).forEach(ph => {
    const pt = cgComputePhaseTotals(ph, version.roles);
    hrs += pt.hrs; fee += pt.fee; ptc += pt.ptc;
  });
  return { hrs: Math.round(hrs * 100) / 100, fee, ptc };
}

export function cgComputeColumnTotals(version) {
  const result = {};
  (version.roles || []).forEach(r => { result[r.roleCode] = { hrs: 0, fee: 0 }; });
  (version.phases || []).forEach(ph => (ph.tasks || []).forEach(task => {
    (version.roles || []).forEach(r => {
      const h = parseFloat(task.hours[r.roleCode]) || 0;
      result[r.roleCode].hrs = Math.round((result[r.roleCode].hrs + h) * 100) / 100;
      result[r.roleCode].fee += h * (r.rate || 0);
    });
  }));
  return result;
}

window.resolveRoleRate = resolveRoleRate;
window.cgComputeTaskTotals = cgComputeTaskTotals;
window.cgComputePhaseTotals = cgComputePhaseTotals;
window.cgComputeGrandTotals = cgComputeGrandTotals;
window.cgComputeColumnTotals = cgComputeColumnTotals;
