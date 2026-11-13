// Pure helpers for team.html (Team UX cycle, 2026-09). No DOM, no Vue: unit-tested with vitest and
// bridged to window.* for the page's inline module script.

import { formatMonthText, formatDayText } from './dates.js?v=7';

// Case/accent-insensitive, numeric-aware string comparison; null/undefined count as ''.
function cmp(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base', numeric: true });
}

const nameCmp = (a, b) => cmp(a.last_name, b.last_name) || cmp(a.first_name, b.first_name);
const statusRank = r => (r.status === 'active' ? 0 : 1);

const KEY_COMPARATORS = {
  name: nameCmp,
  email: (a, b) => cmp(a.email, b.email),
  role: (a, b) => cmp(a.role_label, b.role_label) || cmp(a.role_code, b.role_code),
  status: (a, b) => statusRank(a) - statusRank(b),
};

// Returns a NEW array. Ties always fall back to name ascending, then to the original position,
// whatever `dir` is — so switching direction never shuffles rows that compare equal.
export function sortResources(list, key, dir = 'asc') {
  const sign = dir === 'desc' ? -1 : 1;
  const primary = KEY_COMPARATORS[key] || nameCmp;
  return list
    .map((item, index) => ({ item, index }))
    .sort((x, y) => (primary(x.item, y.item) * sign) || nameCmp(x.item, y.item) || (x.index - y.index))
    .map(entry => entry.item);
}

// items: any array. Clamps `page` into [1, totalPages] (an empty list has exactly one, empty,
// page — never zero, so callers never divide by zero or show "Page 1 of 0"). Does not mutate.
export function paginate(items, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const start = (clampedPage - 1) * pageSize;
  return { pageItems: items.slice(start, start + pageSize), totalPages, page: clampedPage };
}

const UNMATCHED_COMPARATORS = {
  name: (a, b) => cmp(a.display_name, b.display_name),
  hours: (a, b) => (Number(a.hours) || 0) - (Number(b.hours) || 0),
  projects: (a, b) => (Number(a.projects) || 0) - (Number(b.projects) || 0),
};

// Same shape/stability contract as sortResources (new array, ties fall back to name ascending
// then original position), over the /api/resources/unmatched row shape instead of a resource.
export function sortUnmatched(list, key, dir = 'asc') {
  const sign = dir === 'desc' ? -1 : 1;
  const primary = UNMATCHED_COMPARATORS[key] || UNMATCHED_COMPARATORS.hours;
  return list
    .map((item, index) => ({ item, index }))
    .sort((x, y) => (primary(x.item, y.item) * sign) || cmp(x.item.display_name, y.item.display_name) || (x.index - y.index))
    .map(entry => entry.item);
}

export function fold(s) {
  return String(s ?? '').normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().trim();
}

// options: [{ id, label }]. Keeps an option when EVERY whitespace-separated token of the query is a
// substring of its label (case- and accent-insensitive), so "rossi mario" finds "Mario Rossi".
// A blank query returns a copy of all options; the input order is preserved.
export function filterComboOptions(options, query) {
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return options.slice();
  return options.filter(o => {
    const label = fold(o.label);
    return tokens.every(t => label.includes(t));
  });
}

// Turns a stored profile (resources.profile) into the nested structure the Experience profile tab
// renders: dimension → value → project → task, plus roles → project. Pure; never mutates the input.
export function buildProfileTree(profile, roles = []) {
  if (!profile || !profile.totals) return null;
  const projects = profile.projects || {};
  const labelByCode = new Map((roles || []).map(r => [r.code, r.label]));

  const node = (code) => {
    const p = projects[code];
    return p
      ? { code, name: p.name, hours: p.hours, last: p.last, tasks: (p.tasks || []).map(t => ({ ...t, topics: t.topics || [] })) }
      : { code, name: code, hours: 0, last: null, tasks: [] };
  };
  const children = (codes) => (codes || []).map(node)
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));

  const dimensions = Object.entries(profile.dimensions || {})
    .map(([slug, d]) => ({
      slug,
      name: d.name,
      untaggedHours: d.untaggedHours || 0,
      values: (d.values || [])
        .map(v => ({
          key: v.itemId || v.value, label: v.value, hours: v.hours, share: v.share, last: v.last,
          projectCount: v.projects, projects: children(v.projectCodes),
        }))
        .sort((a, b) => b.hours - a.hours || a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Under a role the project shows the person's hours and tasks in THAT role (v3 byProject); a profile
  // without byProject (v2) keeps the project total and no tasks.
  const roleProjects = (r) => (r.projectCodes || []).map(code => {
    const base = node(code);
    const bp = (r.byProject || {})[code];
    if (!bp) return { ...base, tasks: [] };
    return { ...base, hours: bp.hours, tasks: (bp.tasks || []).map(t => ({ ...t, topics: t.topics || [] })) };
  }).sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));

  const roleNodes = (profile.roles || []).map(r => ({
    code: r.code, label: labelByCode.get(r.code) || r.code, hours: r.hours, share: r.share, last: r.last,
    projectCount: r.projects, projects: roleProjects(r),
  }));

  const topicNodes = (profile.topics || [])
    .map(t => ({
      id: t.id, name: t.name, projectCount: (t.projectCodes || []).length, projects: children(t.projectCodes),
      hasProvenance: !!t.direct,
      directHours: t.direct ? t.direct.hours : 0,
      direct: children(t.direct && t.direct.projectCodes),
      context: children(t.context && t.context.projectCodes),
    }))
    .sort((a, b) => b.projectCount - a.projectCount || a.name.localeCompare(b.name));

  const topicGroups = {
    direct: topicNodes.filter(t => t.hasProvenance && t.direct.length),
    context: topicNodes.filter(t => t.hasProvenance && t.context.length),
    legacy: topicNodes.filter(t => !t.hasProvenance),
  };

  return { totals: profile.totals, computedAt: profile.computedAt, dimensions, roles: roleNodes, topics: topicNodes, topicGroups };
}

// ── Redesign helpers (2026-11-08) ──

export function resourceCounts(resources) {
  const list = resources || [];
  const active = list.filter(r => r.status === 'active').length;
  return { total: list.length, active, inactive: list.length - active };
}

// Same text rule as the page's former filteredResources: case-insensitive, no accent folding.
export function filterResources(resources, { status = 'active', roleId = '', linked = 'any', text = '' } = {}) {
  const q = String(text ?? '').trim().toLowerCase();
  return (resources || []).filter(r => {
    if (status !== 'all' && r.status !== status) return false;
    if (roleId && r.role_id !== roleId) return false;
    if (linked === 'linked' && !r.user_id) return false;
    if (linked === 'unlinked' && r.user_id) return false;
    if (!q) return true;
    return `${r.first_name} ${r.last_name} ${r.email} ${r.role_label} ${r.role_code}`.toLowerCase().includes(q);
  });
}

export function sessionProgress(resolved, queueLength) {
  const total = resolved + queueLength;
  return { resolved, total, pct: total > 0 ? Math.round((resolved / total) * 100) : 0 };
}

export function hoursBarPct(hours, maxHours) {
  if (!(maxHours > 0)) return 0;
  return Math.min(100, Math.max(0, Math.round(((Number(hours) || 0) / maxHours) * 100)));
}

const YM_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

// True when ym ('YYYY-MM') is today's month or one of the (months - 1) before it.
export function isRecentMonth(ym, today = new Date(), months = 3) {
  const m = YM_RE.exec(String(ym ?? ''));
  if (!m) return false;
  const idx = Number(m[1]) * 12 + Number(m[2]) - 1;
  const now = today.getFullYear() * 12 + today.getMonth();
  return idx <= now && idx > now - months;
}

export function profileMonthText(ym) {
  if (!YM_RE.test(String(ym ?? ''))) return '—';
  return formatMonthText(ym.replace('-', '')) || '—';
}

// A profile's computed_at timestamp in local time: 'Nov 4, 2026, 22:30' (day text from dates.js).
export function profileCalcText(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  const pad = n => String(n).padStart(2, '0');
  const day = formatDayText(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  return `${day}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// aliases: /api/resources/aliases rows. Adds the resolved resource (role code and status come from
// the loaded resources, the API does not send them); resolves 'any' | 'resource' | 'ignored'.
export function aliasRows(aliases, resources, { text = '', resolves = 'any' } = {}) {
  const byId = new Map((resources || []).map(r => [r.id, r]));
  const q = fold(text);
  return (aliases || [])
    .map(a => {
      const r = a.resource_id ? byId.get(a.resource_id) : null;
      const name = r ? `${r.first_name} ${r.last_name}`
        : (a.resource_id ? `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim() : '');
      return { ...a, resource: a.resource_id ? { id: a.resource_id, name, role_code: r ? r.role_code : '', status: r ? r.status : '' } : null };
    })
    .filter(a => resolves === 'any' || (resolves === 'ignored' ? !a.resource : !!a.resource))
    .filter(a => !q || fold(a.display_name).includes(q) || (a.resource && fold(a.resource.name).includes(q)));
}

export function candidateChips(unmatchedRow, resources) {
  const byId = new Map((resources || []).map(r => [r.id, r]));
  return ((unmatchedRow && unmatchedRow.candidate_resource_ids) || [])
    .map(id => byId.get(id))
    .filter(Boolean)
    .map(r => ({ id: r.id, name: `${r.first_name} ${r.last_name}`, role_code: r.role_code }));
}

export function topTopicIds(directTopics, n = 2) {
  return (directTopics || []).slice()
    .sort((a, b) => (Number(b.hours) || 0) - (Number(a.hours) || 0) || cmp(a.name, b.name))
    .slice(0, n)
    .map(t => t.id);
}

export function deleteSummary(resource, aliases) {
  const names = (aliases || []).filter(a => resource && a.resource_id === resource.id)
    .map(a => a.display_name).sort(cmp);
  return { count: names.length, names };
}

window.sortResources = sortResources;
window.buildProfileTree = buildProfileTree;
window.filterComboOptions = filterComboOptions;
window.paginate = paginate;
window.sortUnmatched = sortUnmatched;
window.foldText = fold;
window.resourceCounts = resourceCounts;
window.filterResources = filterResources;
window.sessionProgress = sessionProgress;
window.hoursBarPct = hoursBarPct;
window.isRecentMonth = isRecentMonth;
window.profileMonthText = profileMonthText;
window.aliasRows = aliasRows;
window.candidateChips = candidateChips;
window.topTopicIds = topTopicIds;
window.deleteSummary = deleteSummary;
window.profileCalcText = profileCalcText;
