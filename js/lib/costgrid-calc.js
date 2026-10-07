// ── FREE TASKS (Task 1, 2026-10-07) ──────────────────────────────────────────
export function cgFreeTasksOf(tasks, linkedProjects) {
  const assignedIds = new Set();
  const assignedNames = new Set();
  (linkedProjects || []).forEach(lp => {
    (lp.taskIds || []).forEach(id => assignedIds.add(id));
    (lp.taskNames || []).forEach(n => { if (n?.trim()) assignedNames.add(n.trim().toLowerCase()); });
  });
  return (tasks || []).filter(t =>
    t.taskName?.trim() && !assignedIds.has(t.taskId) && !assignedNames.has(t.taskName.trim().toLowerCase())
  );
}

export function versionHasFreeTasks(ver) {
  return cgFreeTasksOf((ver.phases || []).flatMap(ph => ph.tasks || []), ver.linkedProjects).length > 0;
}

export function isVersionCommittedLocked(ver) {
  return ver?.pipeline === 'Committed' && !versionHasFreeTasks(ver);
}

// ── OFFER DETAILS SUMMARY (Task 1, 2026-10-07) ───────────────────────────────
export function cgOfferDetailsSummary(draft, { clientName, ratecardName }) {
  const period = !draft.startDate && !draft.endDate
    ? 'Not set'
    : `${draft.startDate ? draft.startDate.slice(0,4)+'/'+draft.startDate.slice(4,6) : ''}${draft.endDate ? ' – ' + draft.endDate.slice(0,4)+'/'+draft.endDate.slice(4,6) : ''}`.trim();

  return {
    period,
    stage: draft.pipeline || 'Draft',
    client: clientName || 'Unassigned',
    ratecard: ratecardName || '— None (use global role rates) —',
    currency: draft.currency || 'EUR',
    owner: ''
  };
}

// ── SECTION COLLAPSE DEFAULTS (Task 1, 2026-10-07) ────────────────────────────
export function cgSectionDefaults(isDraft) {
  return isDraft
    ? { od: false, tags: false, sh: false }
    : { od: true, tags: true, sh: true };
}

window.cgFreeTasksOf = cgFreeTasksOf;
window.versionHasFreeTasks = versionHasFreeTasks;
window.isVersionCommittedLocked = isVersionCommittedLocked;
window.cgOfferDetailsSummary = cgOfferDetailsSummary;
window.cgSectionDefaults = cgSectionDefaults;

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

// ── CLONE BUG FIX ─────────────────────────────────────────────────────────────
// Strips server-assigned taskId/phaseId before a cloned structure is POSTed to
// saveStructure() for a brand-new version — otherwise the backend's PUT
// /:id/versions/:vId/structure handler reuses the supplied taskId as the new
// row's primary key (correct for a same-version re-save, wrong here: the SOURCE
// version's tasks still exist in the DB under those exact IDs), causing
// `duplicate key value violates unique constraint "tasks_pkey"`.
export function stripCloneTaskIds(phases) {
  return (phases || []).map(ph => {
    const { phaseId, ...phRest } = ph;
    return { ...phRest, tasks: (ph.tasks || []).map(t => { const { taskId, ...tRest } = t; return tRest; }) };
  });
}

window.stripCloneTaskIds = stripCloneTaskIds;

// ── PROGRAM AUTO-LINK (Generate Project) ──────────────────────────────────────
// Once a proposal's first partial-task-selection Generate Project run establishes
// a program, every later generation from the same proposal — partial or covering
// every remaining task — auto-links to that same program instead of prompting
// again. Derived from the linked projects' own programId (no dedicated field
// exists on cost_grid_versions/cg_version_projects for "this proposal's program").
//
// A linked project's own id can go stale if it was renamed after linking
// (linkedProjects[].projectId then matches nothing in `projects`) — resolved the
// same way pipeline.html's detailLinkedProjects computed does: direct id match,
// else a name match (exact or prefix) among projects scoped to this cost-grid
// version, else that scope's own single-project fallback. cgId/versionId are
// optional — omitting either simply skips the fallback (returns only on a direct
// id match), which is the correct behavior when the caller has no such scope.
export function findExistingProgramForProposal(linkedProjects, projects, cgId, versionId) {
  const allProjects = projects || [];
  const projsByRef = (cgId && versionId)
    ? allProjects.filter(p => p.costGridRef?.cgId === cgId && p.costGridRef?.versionId === versionId)
    : [];
  for (const lp of linkedProjects || []) {
    let proj = allProjects.find(p => p.id === lp.projectId);
    if (!proj && projsByRef.length) {
      proj = projsByRef.find(p => p.name === lp.projectName)
        || projsByRef.find(p => lp.projectName && p.name &&
             (lp.projectName.startsWith(p.name) || p.name.startsWith(lp.projectName)))
        || (projsByRef.length === 1 ? projsByRef[0] : null);
    }
    if (proj?.programId) return proj.programId;
  }
  return null;
}

window.findExistingProgramForProposal = findExistingProgramForProposal;

// ── CLIENT ID SANITIZATION (2026-10-07) ────────────────────────────────────────
// The frontend uses sentinel values like '__unassigned__' for "no client" in <select>
// elements; these are not valid UUIDs and must never be sent to the API (a uuid column
// would reject them). Same regex as js/api-sync.js's existing sanitization.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function cgApiClientId(id) {
  return (id && UUID_RE.test(id)) ? id : null;
}

window.cgApiClientId = cgApiClientId;
