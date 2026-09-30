'use strict';
// Experience score S(resource, role) in [0,100] (spec 2026-09-29-planning-team-assistant §7).
// Weights/saturations/thresholds are INITIAL values, to be tuned with real data at /finish-cycle
// Gate 2; retuning is a code change here, nothing else.
const { normalizeName } = require('./match-resource');
const { slugify } = require('./slugify');

const WEIGHTS = { role: 30, tag: 30, task: 25, topic: 15 };
const SATURATION = { role: 200, tag: 100, task: 100 };              // k in 1 - e^(-x/k)
const DIMENSION_WEIGHTS = { 'therapeutic-area': 3, brand: 3, market: 2, 'service-type': 2 }; // others 1
const TOPIC_DIRECT = 1.0;
const TOPIC_CONTEXT = 0.4;
const TASK_JACCARD_MIN = 0.5;
const MIN_ALT_SCORE = 30;
const LOW_SCORE = 10;
const NO_TASK = '(no task)';

const lc = s => String(s || '').trim().toLowerCase();
const sat = (x, k) => 1 - Math.exp(-x / k);
const round1 = n => Math.round(n * 10) / 10;
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

function tokens(name) {
  const n = normalizeName(name);
  return n ? new Set(n.split(' ')) : new Set();
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

// A requirement/param tag { slug?, list, itemId?, label } → the profile dimension it names (by slug or list name).
function dimensionOf(profile, tag) {
  const want = slugify(tag.slug || tag.list);
  for (const [slug, d] of Object.entries((profile && profile.dimensions) || {})) {
    if (slugify(slug) === want || slugify(d.name) === want) return { slug, dim: d };
  }
  return null;
}
function matchedValue(profile, tag) {
  const hit = dimensionOf(profile, tag);
  if (!hit) return null;
  const v = (hit.dim.values || []).find(x => (tag.itemId ? x.itemId === tag.itemId : lc(x.value) === lc(tag.label)));
  return v ? { listName: hit.dim.name, value: v.value, hours: v.hours } : null;
}
function matchedTagHours(profile, tag) {
  const v = matchedValue(profile, tag);
  return v ? v.hours : 0;
}

function tagComponent(profile, reqTags) {
  const groups = new Map();                              // dimension key → tags
  for (const t of reqTags) {
    const key = slugify(t.slug || t.list);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  let weighted = 0, weightSum = 0;
  const matches = [];
  for (const [key, list] of groups) {
    let hours = 0;
    for (const t of list) {
      const v = matchedValue(profile, t);
      if (v) { hours += v.hours; if (v.hours > 0) matches.push({ list: v.listName, value: v.value, hours: round2(v.hours) }); }
    }
    const w = DIMENSION_WEIGHTS[key] || 1;
    weighted += w * sat(hours, SATURATION.tag);
    weightSum += w;
  }
  return { value: weightSum ? weighted / weightSum : 0, matches };
}

function taskComponent(profile, roleTasks) {
  const wanted = (roleTasks || []).filter(n => n && n !== NO_TASK).map(tokens).filter(s => s.size);
  let hours = 0;
  const tasks = [];
  const perProject = new Map();
  for (const p of Object.values(profile.projects || {})) {
    for (const t of p.tasks || []) {
      if (!t.name || t.name === NO_TASK) continue;
      const tt = tokens(t.name);
      if (!wanted.some(w => jaccard(w, tt) >= TASK_JACCARD_MIN)) continue;
      hours += t.hours;
      tasks.push({ name: t.name, project: p.name, hours: round2(t.hours) });
      perProject.set(p.name, (perProject.get(p.name) || 0) + t.hours);
    }
  }
  tasks.sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
  const projects = [...perProject.entries()].map(([name, h]) => ({ name, hours: round2(h) }))
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
  return { value: sat(hours, SATURATION.task), tasks: tasks.slice(0, 5), projects: projects.slice(0, 3) };
}

function topicComponent(profile, roleTopics) {
  const byId = new Map((profile.topics || []).map(t => [t.id, t]));
  let sum = 0, provenanceMissing = false;
  const topics = [];
  for (const rt of roleTopics) {
    const t = byId.get(rt.id);
    if (!t) continue;
    let kind;
    if (!t.direct) { kind = 'context'; provenanceMissing = true; }
    else kind = t.direct.projectCodes && t.direct.projectCodes.length ? 'direct' : 'context';
    sum += kind === 'direct' ? TOPIC_DIRECT : TOPIC_CONTEXT;
    topics.push({ id: rt.id, name: rt.name, kind, hours: kind === 'direct' ? t.direct.hours : 0 });
  }
  return { value: Math.min(1, sum / roleTopics.length), topics, provenanceMissing };
}

// profile: resources.profile with topics already resolved (id/name); role: requirement role;
// reqTags: project tags + preferred tags. includeRole=false is the "alternative team" variant.
function scoreResource(profile, role, reqTags, { includeRole = true } = {}) {
  const evidence = { roleHours: 0, tags: [], tasks: [], projects: [], topics: [], topicProvenanceMissing: false };
  if (!profile) return { score: 0, noProfile: true, components: {}, evidence };

  const comps = {};
  const roleEntry = (profile.roles || []).find(r => lc(r.code) === lc(role.code));
  evidence.roleHours = roleEntry ? roleEntry.hours : 0;
  if (includeRole) comps.role = { weight: WEIGHTS.role, value: sat(evidence.roleHours, SATURATION.role) };

  if (reqTags && reqTags.length) {
    const t = tagComponent(profile, reqTags);
    comps.tag = { weight: WEIGHTS.tag, value: t.value };
    evidence.tags = t.matches.sort((a, b) => b.hours - a.hours || a.value.localeCompare(b.value));
  }
  const k = taskComponent(profile, role.tasks);
  comps.task = { weight: WEIGHTS.task, value: k.value };
  evidence.tasks = k.tasks;
  evidence.projects = k.projects;

  if (role.topics && role.topics.length) {
    const t = topicComponent(profile, role.topics);
    comps.topic = { weight: WEIGHTS.topic, value: t.value };
    evidence.topics = t.topics;
    evidence.topicProvenanceMissing = t.provenanceMissing;
  }

  let weighted = 0, weightSum = 0;
  for (const c of Object.values(comps)) { weighted += c.weight * c.value; weightSum += c.weight; }
  return { score: weightSum ? round1(100 * weighted / weightSum) : 0, noProfile: false, components: comps, evidence };
}

module.exports = {
  WEIGHTS, SATURATION, DIMENSION_WEIGHTS, TOPIC_DIRECT, TOPIC_CONTEXT, TASK_JACCARD_MIN, MIN_ALT_SCORE, LOW_SCORE,
  scoreResource, matchedTagHours,
};
