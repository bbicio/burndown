'use strict';
// The three team tables (best / alternative / available) and the per-row rationale
// (spec 2026-09-29-planning-team-assistant §7, §11). Pure: everything it needs is passed in.
const { getCalendarWeeks } = require('./planning-calendar');
const { availabilityForWindow, currentLoad } = require('./team-load');
const { scoreResource, matchedTagHours, MIN_ALT_SCORE, LOW_SCORE } = require('./team-scoring');
const { normalizeName } = require('./match-resource');

const lc = s => String(s || '').trim().toLowerCase();
const round1 = n => Math.round(n * 10) / 10;
const nameOf = r => `${r.firstName} ${r.lastName}`.trim();
const byName = (a, b) => a.name.localeCompare(b.name);

function rationale(row) {
  const parts = [];
  if (row.roleHours > 0) parts.push(`${Math.round(row.roleHours)} h as ${row.roleCode}`);
  for (const f of row.flags || []) parts.push(f);
  if (row.tags && row.tags.length) parts.push(`tags: ${row.tags.slice(0, 3).map(t => `${t.value} (${Math.round(t.hours)} h)`).join(', ')}`);
  if (row.projects && row.projects.length) parts.push(`similar projects: ${row.projects.slice(0, 3).map(p => `${p.name} (${Math.round(p.hours)} h)`).join(', ')}`);
  for (const t of (row.topics || []).slice(0, 3)) {
    parts.push(`topic '${t.name}' (${t.kind === 'direct' ? `direct, ${Math.round(t.hours)} h` : 'context'})`);
  }
  parts.push(row.freeAvg == null ? 'availability not computable' : `${Math.round(row.freeAvg)} h/week free`);
  return parts.join('; ');
}

// Shared by rankTeam and explainResource so both always score and filter the same way.
function scoringTags(requirement, params) {
  const preferTags = ((params && params.preferTags) || []).map(t => ({ list: t.list, label: t.value }));
  return [...requirement.tags.map(t => ({ slug: t.slug, list: t.listName, itemId: t.itemId, label: t.label })), ...preferTags];
}
function poolPredicate(params, excludedIds) {
  const mustHave = ((params && params.requireTags) || []).map(t => ({ list: t.list, label: t.value }));
  return { mustHave, excludedIds: excludedIds || new Set() };
}
// null when the resource is in the pool, otherwise the reason it is not.
function poolReason(r, { mustHave, excludedIds }) {
  if (r.status !== 'active') return 'inactive';
  if (excludedIds.has(r.id)) return 'excluded';
  if (!mustHave.every(t => r.profile && matchedTagHours(r.profile, t) > 0)) return 'does not match requireTags';
  return null;
}

function rankTeam({ requirement, resources, loads, asOf, params, excludedIds, projectHours }) {
  const topN = params.topN || 3;
  const wantRoles = params.roles ? new Set(params.roles.map(lc)) : null;
  const roles = requirement.roles.filter(r => !wantRoles || wantRoles.has(lc(r.code)));
  const reqTags = scoringTags(requirement, params);
  const inPool = poolPredicate(params, excludedIds);
  const pool = resources.filter(r => !poolReason(r, inPool));

  const out = { best: [], alternative: [], available: [] };
  for (const role of roles) {
    const weeks = role.window ? getCalendarWeeks(role.window.from, role.window.to, asOf) : [];
    const futureWeeks = weeks.filter(w => !w.isPast).length;
    const neededPerWeek = futureWeeks ? role.neededHours / futureWeeks : 0;

    const makeRow = (r, sc, rankValue) => {
      const av = availabilityForWindow(loads.get(r.id), weeks);
      const flags = [];
      if (sc.noProfile) flags.push('no actuals matched');
      else if (lc(r.roleCode) === lc(role.code) && sc.score < LOW_SCORE) flags.push('no relevant experience');
      if (sc.evidence.topicProvenanceMissing) flags.push('topic provenance not available, recalculate profiles');
      const row = {
        resourceId: r.id, name: nameOf(r), roleCode: r.roleCode, score: sc.score, rank: rankValue == null ? sc.score : rankValue,
        roleHours: sc.evidence.roleHours, tags: sc.evidence.tags, projects: sc.evidence.projects, tasks: sc.evidence.tasks,
        topics: sc.evidence.topics, freeAvg: av ? av.freeAvg : null, freeMin: av ? av.freeMin : null,
        currentLoad: currentLoad(loads.get(r.id), asOf), hoursOnProject: projectHours.get(r.id) || 0, flags,
      };
      row.rationale = rationale(row);
      return { row, av };
    };

    const same = pool.filter(r => lc(r.roleCode) === lc(role.code));
    const other = pool.filter(r => lc(r.roleCode) !== lc(role.code));

    // 1. best: same role, with the role component
    const sameScored = same.map(r => ({ r, sc: scoreResource(r.profile, role, reqTags, { includeRole: true }) }));
    const bestRows = sameScored.map(x => makeRow(x.r, x.sc).row).sort((a, b) => b.score - a.score || byName(a, b)).slice(0, topN);
    out.best.push({ role: role.code, rows: bestRows,
      note: same.length ? null : 'No active resource has this role.' });

    // 2. alternative: other roles, role component excluded
    const altScored = other.filter(r => r.profile)
      .map(r => ({ r, sc: scoreResource(r.profile, role, reqTags, { includeRole: false }) }))
      .filter(x => x.sc.score >= MIN_ALT_SCORE);
    const altRows = params.includeAlternatives === false ? []
      : altScored.map(x => makeRow(x.r, x.sc).row).sort((a, b) => b.score - a.score || byName(a, b)).slice(0, topN);
    out.alternative.push({ role: role.code, rows: altRows,
      note: params.includeAlternatives === false ? 'Alternatives are switched off.' : (altRows.length ? null : 'No alternative with relevant experience.') });

    // 3. available: same-role (with a profile) ∪ qualifying alternatives, ordered by score × availability factor
    const candidates = [...sameScored.filter(x => !x.sc.noProfile), ...(params.includeAlternatives === false ? [] : altScored)];
    let availRows = candidates.map(x => {
      const av = availabilityForWindow(loads.get(x.r.id), weeks);
      const factor = neededPerWeek <= 0.01 || !av ? 1 : Math.min(1, av.freeAvg / neededPerWeek);
      return makeRow(x.r, x.sc, round1(x.sc.score * factor)).row;
    });
    if (typeof params.minFreeHoursPerWeek === 'number') {
      availRows = availRows.filter(r => r.freeAvg != null && r.freeAvg >= params.minFreeHoursPerWeek);
    }
    availRows.sort((a, b) => b.rank - a.rank || (b.freeAvg ?? -1) - (a.freeAvg ?? -1) || byName(a, b));
    out.available.push({ role: role.code, rows: availRows.slice(0, topN),
      note: availRows.length ? null : 'Nobody matches these constraints.' });
  }
  return out;
}

// Why is X (not) among the best for a role? Returns the score breakdown and availability.
function explainResource({ requirement, resources, loads, asOf, params, projectHours, name, roleCode, excludedIds = new Set() }) {
  params = params || {};
  const role = requirement.roles.find(r => lc(r.code) === lc(roleCode));
  if (!role) return { error: `Role "${roleCode}" is not required by this project` };
  const key = normalizeName(name);
  const found = resources.filter(r => normalizeName(nameOf(r)) === key);
  if (found.length === 0) return { error: `No resource named "${name}"` };
  if (found.length > 1) return { error: `"${name}" matches more than one resource` };
  const r = found[0];
  const reqTags = scoringTags(requirement, params);
  const inPool = poolPredicate(params, excludedIds);
  const notInPool = poolReason(r, inPool);
  const sc =scoreResource(r.profile, role, reqTags, { includeRole: true });
  const alt = scoreResource(r.profile, role, reqTags, { includeRole: false });
  const weeks = role.window ? getCalendarWeeks(role.window.from, role.window.to, asOf) : [];
  const av = availabilityForWindow(loads.get(r.id), weeks);
  const sameRole = lc(r.roleCode) === lc(role.code);
  const ranked = resources
    .filter(x => !poolReason(x, inPool) && lc(x.roleCode) === lc(role.code))
    .map(x => ({ id: x.id, score: scoreResource(x.profile, role, reqTags, { includeRole: true }).score, n: nameOf(x) }))
    .sort((a, b) => b.score - a.score || a.n.localeCompare(b.n));
  const pos = ranked.findIndex(x => x.id === r.id);
  return {
    name: nameOf(r), role: role.code, status: r.status, resourceRole: r.roleCode, sameRole,
    score: sc.score, scoreWithoutRole: alt.score, noProfile: sc.noProfile,
    positionInBest: sameRole && !notInPool && pos >= 0 ? pos + 1 : null,
    ...(notInPool ? { notInPool } : {}),
    components: Object.entries(sc.components).map(([component, c]) => ({ component, weight: c.weight, value: Math.round(c.value * 1000) / 1000 })),
    evidence: sc.evidence,
    freeAvg: av ? av.freeAvg : null, freeMin: av ? av.freeMin : null,
    currentLoad: currentLoad(loads.get(r.id), asOf), hoursOnProject: projectHours.get(r.id) || 0,
  };
}

module.exports = { rationale, rankTeam, explainResource };
