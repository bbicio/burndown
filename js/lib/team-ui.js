// Pure helpers for team.html (Team UX cycle, 2026-09). No DOM, no Vue: unit-tested with vitest and
// bridged to window.* for the page's inline module script.

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

function fold(s) {
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
      ? { code, name: p.name, hours: p.hours, last: p.last, tasks: (p.tasks || []).map(t => ({ ...t })) }
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

  const roleNodes = (profile.roles || []).map(r => ({
    code: r.code, label: labelByCode.get(r.code) || r.code, hours: r.hours, share: r.share, last: r.last,
    projectCount: r.projects, projects: children(r.projectCodes),
  }));

  return { totals: profile.totals, computedAt: profile.computedAt, dimensions, roles: roleNodes };
}

window.sortResources = sortResources;
window.buildProfileTree = buildProfileTree;
window.filterComboOptions = filterComboOptions;
