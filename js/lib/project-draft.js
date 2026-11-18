// js/lib/project-draft.js
// A project as project-config edits it, against its base: what the project Save (PUT /api/projects/:id)
// would receive. The base is projectSavable of the project as loaded, or as adopted after a successful Save.
// Loaded as an ES module (<script type="module" src="js/lib/project-draft.js?v=N">) and bridged onto `window`.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = v => (v === undefined || v === null ? '' : v);
const SECTIONS = ['tasks', 'phasing', 'ptc', 'planning', 'groups'];

// { header, tasks, phasing, ptc, planning, groups } of a project: header carries the route's header fields
// (costGridRef.versionId as cgVersionId, a clientId that is not a UUID as null); group entries without a role
// are dropped.
export function projectSavable(project) {
  const p = project || {};
  const clientId = p.clientId && UUID_RE.test(p.clientId) ? p.clientId : null;
  return {
    header: {
      name: str(p.name),
      code: str(p.code),
      programId: p.programId || null,
      clientId,
      startDate: str(p.startDate),
      endDate: str(p.endDate),
      currency: str(p.currency),
      pipeline: str(p.pipeline),
      status: str(p.status),
      description: str(p.description),
      cgVersionId: p.costGridRef?.versionId || null,
    },
    tasks: p.tasks || [],
    phasing: p.phasing || {},
    ptc: p.ptc || [],
    planning: p.planning || {},
    groups: (p.groups || []).map(g => ({
      ...g,
      entries: (g.entries || []).filter(e => String(e?.role ?? '').trim()),
    })),
  };
}

// The body of the Save without `version`: header with the changed fields only, each section only when changed.
export function projectChanges(base, draft) {
  const now = projectSavable(draft);
  const out = {};
  const header = {};
  for (const [k, v] of Object.entries(now.header)) {
    if (JSON.stringify(v) !== JSON.stringify(base.header[k])) header[k] = v;
  }
  if (Object.keys(header).length) out.header = header;
  for (const s of SECTIONS) {
    if (JSON.stringify(now[s]) !== JSON.stringify(base[s])) out[s] = now[s];
  }
  return out;
}

export function projectIsDirty(base, draft) {
  return Object.keys(projectChanges(base, draft)).length > 0;
}

if (typeof window !== 'undefined') {
  window.projectSavable = projectSavable;
  window.projectChanges = projectChanges;
  window.projectIsDirty = projectIsDirty;
}
