// Pure name-matching helpers for linking free-text actuals owners to `resources`
// (Cycle 3b). No DB access — api/src/services/resource-matching.js feeds it rows.

// Lowercase, strip accents, drop everything that isn't a letter/digit, and compare as a
// SORTED token set so "Rossi Mario" and "mario rossi" are the same name. '' if nothing is left.
function normalizeName(input) {
  if (input == null) return '';
  const tokens = String(input)
    .normalize('NFD').replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter(Boolean);
  return tokens.sort().join(' ');
}

// resources: [{ id, first_name, last_name, status }]; aliases: [{ alias_normalized, resource_id }]
// (resource_id null = "ignore this name"). Only ACTIVE resources take part in automatic matching.
function buildMatchContext(resources, aliases) {
  const aliasByKey = new Map();
  for (const a of aliases || []) aliasByKey.set(a.alias_normalized, a.resource_id ?? null);
  const activeByKey = new Map();
  for (const r of resources || []) {
    if (r.status !== 'active') continue;
    const key = normalizeName(`${r.first_name} ${r.last_name}`);
    if (!key) continue;
    if (!activeByKey.has(key)) activeByKey.set(key, []);
    activeByKey.get(key).push(r.id);
  }
  return { aliasByKey, activeByKey };
}

function matchOwner(name, ctx) {
  const key = normalizeName(name);
  if (!key) return { kind: 'empty' };
  if (ctx.aliasByKey.has(key)) {
    const resourceId = ctx.aliasByKey.get(key);
    return resourceId ? { kind: 'alias', resourceId } : { kind: 'ignored' };
  }
  const candidates = ctx.activeByKey.get(key) || [];
  if (candidates.length === 1) return { kind: 'matched', resourceId: candidates[0] };
  if (candidates.length > 1) return { kind: 'ambiguous', candidates: [...candidates] };
  return { kind: 'unmatched', candidates: [] };
}

// rowsByCode: { [projectCode]: [{ owner, hours }] } → the names that need an admin's attention.
function aggregateUnmatched(rowsByCode, ctx) {
  const acc = new Map();
  for (const code of Object.keys(rowsByCode)) {
    for (const row of rowsByCode[code] || []) {
      const m = matchOwner(row.owner, ctx);
      if (m.kind !== 'unmatched' && m.kind !== 'ambiguous') continue;
      const nameNormalized = normalizeName(row.owner);
      const key = `${code}\u0000${nameNormalized}`;
      const hours = Number(row.hours);
      let entry = acc.get(key);
      if (!entry) {
        entry = {
          projectCode: code, nameNormalized, displayName: String(row.owner).trim(),
          hours: 0, candidateResourceIds: m.candidates,
        };
        acc.set(key, entry);
      }
      entry.hours += Number.isFinite(hours) ? hours : 0;
    }
  }
  // Hours are summed as floats: round to 2 decimals so 0.1 + 0.2 reads 0.3, not 0.30000000000000004.
  for (const entry of acc.values()) entry.hours = Math.round((entry.hours + Number.EPSILON) * 100) / 100;
  return [...acc.values()].sort((a, b) =>
    a.projectCode < b.projectCode ? -1 : a.projectCode > b.projectCode ? 1
      : a.nameNormalized < b.nameNormalized ? -1 : a.nameNormalized > b.nameNormalized ? 1 : 0);
}

module.exports = { normalizeName, buildMatchContext, matchOwner, aggregateUnmatched };
