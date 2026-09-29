// Client side of the planning model (Cycle A): builds the POST /api/planning/model request and
// adapts the server's response (weeks keyed 'YYYY-MM-DD') into the shapes planning.html's render
// code already uses (weeks keyed by weekStart.toISOString()). Pure, DOM-free.

const pad = n => String(n).padStart(2, '0');
export function localYmd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export function buildKeyMap(weeks) {
  return new Map(weeks.map(w => [localYmd(w.weekStart), w.weekStart.toISOString()]));
}

export function remapKeys(obj, keyMap) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) out[keyMap.get(k) ?? k] = v;
  return out;
}

export function adaptRoleModel(data, keyMap) {
  const roleMap = {}, roleSoldMap = {}, roleActualsMap = {}, roleChildMap = {};
  for (const r of data.roles || []) {
    roleMap[r.role] = remapKeys(r.cells, keyMap);
    roleSoldMap[r.role] = r.sold;
    roleActualsMap[r.role] = r.actuals;
    roleChildMap[r.role] = {};
    for (const c of r.children) roleChildMap[r.role][`${c.project}::${c.task}`] = { ...c };
  }
  return { roleMap, roleSoldMap, roleActualsMap, roleChildMap };
}

export function adaptProjectModel(data, keyMap) {
  return {
    projects: (data.projects || []).map(p => ({
      ...p,
      weekTotals: remapKeys(p.weekTotals, keyMap),
      tasks: p.tasks.map(t => ({
        ...t,
        weekTotals: remapKeys(t.weekTotals, keyMap),
        roles: t.roles.map(r => ({ ...r, weekData: remapKeys(r.weekData, keyMap) })),
      })),
    })),
  };
}

export function adaptOwnerModel(data, keyMap) {
  const ownerMap = {};
  for (const [name, om] of Object.entries(data.ownerMap || {})) {
    const projects = {};
    for (const [pid, pm] of Object.entries(om.projects)) {
      const tasks = {};
      for (const [tn, tm] of Object.entries(pm.tasks)) tasks[tn] = { ...tm, weekData: remapKeys(tm.weekData, keyMap) };
      projects[pid] = { ...pm, weekTotals: remapKeys(pm.weekTotals, keyMap), tasks };
    }
    ownerMap[name] = { ...om, weekTotals: remapKeys(om.weekTotals, keyMap), projects };
  }
  return ownerMap;
}

const VIEW_NAMES = { byrole: 'role', byproject: 'project', byowner: 'owner' };

export function buildModelRequest({ view, projectIds, teams, windowStart, windowEnd, today, pulse }) {
  return {
    view: VIEW_NAMES[view],
    projectIds: [...projectIds],
    teams: [...teams].sort(),
    from: localYmd(windowStart),
    to: localYmd(windowEnd),
    asOf: localYmd(today),
    pulse: !!pulse,
  };
}

window.localYmd = localYmd;
window.buildKeyMap = buildKeyMap;
window.remapKeys = remapKeys;
window.adaptRoleModel = adaptRoleModel;
window.adaptProjectModel = adaptProjectModel;
window.adaptOwnerModel = adaptOwnerModel;
window.buildModelRequest = buildModelRequest;
