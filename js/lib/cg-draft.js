// The cost grid editor's draft against its base: what the Save route (PUT /api/cost-grids/:id/versions/:vId)
// would receive. The base is cgSavableState of the draft as opened, or as adopted after a successful Save.

const str = v => (v === undefined || v === null ? '' : v);

// Only the fields the route reads, hours keys sorted so their order is not a change.
function phasesOf(phases) {
  return (phases || []).map(ph => ({
    phaseName: str(ph.phaseName),
    tasks: (ph.tasks || []).map(tk => ({
      taskId: tk.taskId ?? null,
      taskName: str(tk.taskName),
      taskDescription: str(tk.taskDescription),
      taskStartDate: str(tk.taskStartDate),
      taskEndDate: str(tk.taskEndDate),
      ptc: tk.ptc ?? 0,
      hours: Object.fromEntries(Object.keys(tk.hours || {}).sort().map(k => [k, tk.hours[k]])),
    })),
  }));
}

// { header, structure } of a draft: header carries the route's header fields (versionLabel as label, the
// unassigned client as null); structure is { phases, roles }.
export function cgSavableState(draft) {
  const d = draft || {};
  const clientId = d.clientId && d.clientId !== '__unassigned__' ? d.clientId : null;
  return {
    header: {
      label: str(d.versionLabel),
      pipeline: str(d.pipeline),
      startDate: str(d.startDate),
      endDate: str(d.endDate),
      currency: d.currency || 'EUR',
      note: str(d.note),
      ratecardId: d.ratecardId || null,
      clientId,
      projectName: str(d.projectName),
    },
    structure: {
      phases: phasesOf(d.phases),
      roles: (d.roles || []).map(r => ({ roleCode: r.roleCode, rate: r.rate ?? null, rateIsCustom: r.rateIsCustom === true })),
    },
  };
}

// The header fields whose value differs from the base.
export function cgChangedHeader(base, draft) {
  const now = cgSavableState(draft).header;
  const out = {};
  for (const [k, v] of Object.entries(now)) {
    if (JSON.stringify(v) !== JSON.stringify(base.header[k])) out[k] = v;
  }
  return out;
}

export function cgStructureChanged(base, draft) {
  return JSON.stringify(cgSavableState(draft).structure) !== JSON.stringify(base.structure);
}

export function cgIsDirty(base, draft) {
  return Object.keys(cgChangedHeader(base, draft)).length > 0 || cgStructureChanged(base, draft);
}

if (typeof window !== 'undefined') {
  window.cgSavableState = cgSavableState;
  window.cgChangedHeader = cgChangedHeader;
  window.cgStructureChanged = cgStructureChanged;
  window.cgIsDirty = cgIsDirty;
}
