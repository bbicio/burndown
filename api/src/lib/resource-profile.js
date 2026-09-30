// Pure profile-building helpers (Cycle 3c): actuals rows of ONE project code → per-resource
// contributions, and one resource's contributions → its aggregated profile. No DB access.
const { matchOwner } = require('./match-resource');

const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = n => Math.round((n + Number.EPSILON) * 10000) / 10000;

function toHours(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// 'YYYY-MM-DD…' → 'YYYY-MM' (month 01–12), otherwise null.
function monthOf(date) {
  const m = /^(\d{4})-(\d{2})/.exec(String(date ?? ''));
  if (!m) return null;
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? `${m[1]}-${m[2]}` : null;
}

function normalizeTask(task) {
  const name = String(task ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return { key: '(no task)', name: '(no task)' };
  return { key: name.toLowerCase(), name };
}

// rows: raw actuals elements { owner, role, task, hours, date } of one project code.
// Only names that resolve to a resource (alias or exact match) contribute.
function buildContributions(rows, ctx, projectName) {
  const byResource = new Map();
  for (const row of rows || []) {
    const m = matchOwner(row.owner, ctx);
    if (m.kind !== 'alias' && m.kind !== 'matched') continue;
    let c = byResource.get(m.resourceId);
    if (!c) {
      c = { projectName, hours: 0, first: null, last: null, roles: {}, tasks: {} };
      byResource.set(m.resourceId, c);
    }
    const hours = toHours(row.hours);
    c.hours += hours;
    const month = monthOf(row.date);
    if (month) {
      if (!c.first || month < c.first) c.first = month;
      if (!c.last || month > c.last) c.last = month;
    }
    const role = String(row.role ?? '').trim();
    if (role) c.roles[role] = (c.roles[role] || 0) + hours;
    const t = normalizeTask(row.task);
    const cur = c.tasks[t.key] || { name: t.name, hours: 0 };
    cur.hours += hours;
    c.tasks[t.key] = cur;
  }
  for (const c of byResource.values()) {
    c.hours = round2(c.hours);
    for (const k of Object.keys(c.roles)) c.roles[k] = round2(c.roles[k]);
    for (const k of Object.keys(c.tasks)) c.tasks[k].hours = round2(c.tasks[k].hours);
  }
  return byResource;
}

// contribByCode: { [code]: contribution } for ONE resource.
// projectsByCode[code] = { projectId, name, tags: [...], topicIds?: string[], taskTopics?: { [taskKey]: string[] } }.
function aggregateProfile(contribByCode, projectsByCode, now = new Date()) {
  const codes = Object.keys(contribByCode || {});
  if (!codes.length) return null;

  let totalHours = 0;
  let firstWorked = null;
  let lastWorked = null;
  const projects = {};
  const dims = {};
  const roleAcc = new Map();
  const topicAcc = new Map();

  for (const code of codes) {
    const c = contribByCode[code];
    const info = (projectsByCode && projectsByCode[code]) || {};
    totalHours += c.hours;
    if (c.first && (!firstWorked || c.first < firstWorked)) firstWorked = c.first;
    if (c.last && (!lastWorked || c.last > lastWorked)) lastWorked = c.last;

    const tags = {};
    for (const t of info.tags || []) {
      if (!tags[t.slug]) tags[t.slug] = [];
      tags[t.slug].push(t.label);
      let d = dims[t.slug];
      if (!d) d = dims[t.slug] = { name: t.listName, values: new Map(), codes: new Set() };
      d.codes.add(code);
      let v = d.values.get(t.itemId);
      if (!v) {
        v = { value: t.label, itemId: t.itemId, hours: 0, last: null, projectCodes: [] };
        d.values.set(t.itemId, v);
      }
      v.hours += c.hours;
      if (c.last && (!v.last || c.last > v.last)) v.last = c.last;
      v.projectCodes.push(code);
    }

    // direct = the topic comes from a task the person logged hours on (hours = sum over those tasks);
    // context = it only comes from the project description (spec §5).
    const directHours = new Map();
    for (const [k, task] of Object.entries(c.tasks || {})) {
      for (const id of (info.taskTopics || {})[k] || []) directHours.set(id, (directHours.get(id) || 0) + task.hours);
    }
    const ids = new Set([...directHours.keys(), ...(info.topicIds || [])]);
    for (const id of ids) {
      let acc = topicAcc.get(id);
      if (!acc) { acc = { codes: new Set(), directHours: 0, directCodes: new Set(), contextCodes: new Set() }; topicAcc.set(id, acc); }
      acc.codes.add(code);
      if (directHours.has(id)) { acc.directHours += directHours.get(id); acc.directCodes.add(code); }
      else acc.contextCodes.add(code);
    }

    projects[code] = {
      name: info.name || c.projectName || code,
      projectId: info.projectId || null,
      hours: round2(c.hours),
      last: c.last,
      tags,
      tasks: Object.values(c.tasks || {})
        .map(t => ({ name: t.name, hours: round2(t.hours) }))
        .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name)),
    };

    for (const [role, h] of Object.entries(c.roles || {})) {
      let r = roleAcc.get(role);
      if (!r) { r = { code: role, hours: 0, last: null, projectCodes: [] }; roleAcc.set(role, r); }
      r.hours += h;
      if (c.last && (!r.last || c.last > r.last)) r.last = c.last;
      r.projectCodes.push(code);
    }
  }

  const share = h => (totalHours > 0 ? round4(h / totalHours) : 0);
  const byHoursThen = (a, b, ka, kb) => b.hours - a.hours || String(ka).localeCompare(String(kb));

  const dimensions = {};
  for (const slug of Object.keys(dims).sort()) {
    const d = dims[slug];
    let untagged = 0;
    for (const code of codes) if (!d.codes.has(code)) untagged += contribByCode[code].hours;
    dimensions[slug] = {
      name: d.name,
      untaggedHours: round2(untagged),
      values: [...d.values.values()]
        .map(v => ({
          value: v.value, itemId: v.itemId, hours: round2(v.hours), share: share(v.hours),
          projects: v.projectCodes.length, last: v.last, projectCodes: v.projectCodes,
        }))
        .sort((a, b) => byHoursThen(a, b, a.value, b.value)),
    };
  }

  const roles = [...roleAcc.values()]
    .map(r => ({
      code: r.code, hours: round2(r.hours), share: share(r.hours),
      projects: r.projectCodes.length, last: r.last, projectCodes: r.projectCodes,
    }))
    .sort((a, b) => byHoursThen(a, b, a.code, b.code));

  const orderedProjects = {};
  for (const code of Object.keys(projects).sort((a, b) => byHoursThen(projects[a], projects[b], a, b))) {
    orderedProjects[code] = projects[code];
  }

  return {
    version: 2,
    computedAt: now.toISOString(),
    totals: { hours: round2(totalHours), projects: codes.length, firstWorked, lastWorked },
    dimensions,
    roles,
    topics: [...topicAcc.entries()]
      .map(([topicId, a]) => ({
        topicId,
        projectCodes: [...a.codes],
        direct: { hours: round2(a.directHours), projectCodes: [...a.directCodes] },
        context: { projectCodes: [...a.contextCodes] },
      }))
      .sort((a, b) => b.projectCodes.length - a.projectCodes.length || String(a.topicId).localeCompare(String(b.topicId))),
    projects: orderedProjects,
  };
}

module.exports = { monthOf, normalizeTask, buildContributions, aggregateProfile };
