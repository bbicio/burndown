'use strict';
// DB loading + orchestration for the team assistant (spec 2026-09-29-planning-team-assistant §6-§8).
// All ranking/availability rules live in api/src/lib/team-*.js; the per-person load comes from the
// planning model (`owner` projection) via computePlanningModel — no calculation is repeated here.
const { query } = require('../db/client');
const { getPlanningData } = require('./planning-data');
const { loadVocabulary } = require('./topic-extraction');
const { finalTopic, resolveProfileTopics } = require('../lib/topic-extract');
const { computePlanningModel } = require('../lib/planning-compute');
const { buildMatchContext, matchOwner } = require('../lib/match-resource');
const { isoDate, dateKey } = require('../lib/planning-calendar');
const { resolveExcluded, checkTags } = require('../lib/team-params');
const { buildRequirement } = require('../lib/team-requirement');
const { loadWindow, unionWindow, loadByResource } = require('../lib/team-load');
const { rankTeam, explainResource } = require('../lib/team-ranking');

const fail = (status, message, fields) => Object.assign(new Error(message), { status, fields });
const lc = s => String(s || '').trim().toLowerCase();

async function prepare({ projectId }) {
  const data = await getPlanningData();
  const project = data.projects.get(projectId);
  if (!project) throw fail(404, 'Project not found');

  const [tagsRes, linksRes, resRes, vocab, listsRes] = await Promise.all([
    query(`SELECT al.slug, al.name AS list_name, ali.id AS item_id, ali.label
           FROM project_tags pt
           JOIN attribute_list_items ali ON ali.id = pt.item_id
           JOIN attribute_lists al ON al.id = ali.list_id
           WHERE pt.project_id = $1`, [projectId]),
    query('SELECT task_key, topic_id FROM description_topic_links WHERE project_id = $1', [projectId]),
    query(`SELECT r.id, r.first_name, r.last_name, r.status, ro.code AS role_code, r.profile
           FROM resources r JOIN roles ro ON ro.id = r.role_id`),
    loadVocabulary(),
    query(`SELECT al.slug, al.name AS list_name, ali.label
           FROM attribute_lists al LEFT JOIN attribute_list_items ali ON ali.list_id = al.id
           ORDER BY al.name, ali.label`),
  ]);

  const listMap = new Map();
  for (const r of listsRes.rows) {
    if (!listMap.has(r.slug)) listMap.set(r.slug, { slug: r.slug, name: r.list_name, items: [] });
    if (r.label != null) listMap.get(r.slug).items.push(r.label);
  }

  const topicOf = id => {
    const t = finalTopic(id, vocab.topicsById);
    return t && t.status === 'approved' ? { id: t.id, name: t.name } : null;
  };
  const projectTopics = [];
  const taskTopics = {};
  for (const l of linksRes.rows) {
    const t = topicOf(l.topic_id);
    if (!t) continue;
    if (l.task_key === '') projectTopics.push(t);
    else (taskTopics[l.task_key] = taskTopics[l.task_key] || []).push(t);
  }

  const resources = resRes.rows.map(r => ({
    id: r.id, firstName: r.first_name, lastName: r.last_name, roleCode: r.role_code, status: r.status,
    profile: r.profile ? { ...r.profile, topics: resolveProfileTopics(r.profile.topics, vocab.topicsById) } : null,
  }));

  return {
    data, project, projectId,
    tags: tagsRes.rows.map(t => ({ slug: t.slug, listName: t.list_name, itemId: t.item_id, label: t.label })),
    projectTopics, taskTopics, resources, attributeLists: [...listMap.values()],
    matchCtx: buildMatchContext(data.resources, data.aliases),
    actuals: data.actuals.get(projectId) || [],
  };
}

// Requirement only (no planning-model call): used alone by /chat for the context block.
function describe(ctx, { params, asOf }) {
  const asOfDate = isoDate(asOf);
  const windowOverride = params.window ? { from: isoDate(params.window.from), to: isoDate(params.window.to) } : null;
  const requirement = buildRequirement({
    project: ctx.project, actuals: ctx.actuals, tags: ctx.tags,
    projectTopics: ctx.projectTopics, taskTopics: ctx.taskTopics, asOf: asOfDate, windowOverride,
  });
  if (!requirement.roles.length) throw fail(422, 'This project has no role with planned hours: nothing to allocate');
  return { asOf: asOfDate, requirement };
}

// Shared by rank/explain: requirement + excluded ids + loads + hours already on the project.
function compute(ctx, { params, asOfStr }) {
  const { asOf, requirement } = describe(ctx, { params, asOf: asOfStr });

  const fields = {};
  if (params.roles) {
    const known = new Set(requirement.roles.map(r => lc(r.code)));
    const unknown = params.roles.filter(r => !known.has(lc(r)));
    if (unknown.length) fields.roles = `Not required by this project: ${unknown.join(', ')}. Required roles: ${requirement.roles.map(r => r.code).join(', ')}`;
  }
  const excluded = resolveExcluded(params.excludeResources, ctx.data.resources);
  if (excluded.errors.length) fields.excludeResources = excluded.errors.join('; ');
  for (const k of ['requireTags', 'preferTags']) {
    const errs = params[k] ? checkTags(params[k], ctx.attributeLists) : [];
    if (errs.length) fields[k] = errs.join('; ');
  }
  if (Object.keys(fields).length) throw fail(400, 'Invalid request', fields);

  // One planning-model call for everybody: every project "as Planning sees it", minus the target.
  // The window covers ALL requirement roles (explain_resource may ask about a role outside params.roles)
  // and is memoized on ctx, so one request runs at most one projection per distinct window.
  const lw = loadWindow(unionWindow(requirement.roles), asOf);
  const memoKey = `${dateKey(lw.to)}|${dateKey(asOf)}`;
  if (!ctx.loadsMemo) ctx.loadsMemo = new Map();
  let loads = ctx.loadsMemo.get(memoKey);
  if (!loads) {
    const projectIds = [...ctx.data.projects.values()]
      .filter(p => p.id !== ctx.projectId && p.pipeline !== 'Canceled' && p.status !== 'Completed')
      .map(p => p.id);
    const model = computePlanningModel(ctx.data, null, {
      view: 'owner', projectIds, teams: [], from: lw.from, to: lw.to, asOf, pulse: false,
    });
    loads = loadByResource(model.ownerMap, ctx.matchCtx);
    ctx.loadsMemo.set(memoKey, loads);
  }

  const projectHours = new Map();
  for (const a of ctx.actuals) {
    const m = matchOwner(a.owner, ctx.matchCtx);
    if (m.kind === 'alias' || m.kind === 'matched') projectHours.set(m.resourceId, (projectHours.get(m.resourceId) || 0) + a.hours);
  }
  return { asOf, requirement, loads, projectHours, excludedIds: excluded.ids };
}

function summarize(requirement) {
  return {
    projectId: requirement.projectId, name: requirement.name,
    tags: requirement.tags.map(t => ({ list: t.listName, value: t.label })),
    roles: requirement.roles.map(r => ({
      code: r.code, tasks: r.tasks, soldHours: r.soldHours, neededHours: r.neededHours,
      window: r.window ? { from: dateKey(r.window.from), to: dateKey(r.window.to) } : null,
    })),
  };
}

function rank(ctx, { params, asOf }) {
  const c = compute(ctx, { params, asOfStr: asOf });
  const tables = rankTeam({
    requirement: c.requirement, resources: ctx.resources, loads: c.loads, asOf: c.asOf,
    params, excludedIds: c.excludedIds, projectHours: c.projectHours,
  });
  return { requirement: summarize(c.requirement), tables, params };
}

function explain(ctx, { name, role, params, asOf }) {
  const c = compute(ctx, { params, asOfStr: asOf });
  return explainResource({
    requirement: c.requirement, resources: ctx.resources, loads: c.loads, asOf: c.asOf,
    params, projectHours: c.projectHours, excludedIds: c.excludedIds, name, roleCode: role,
  });
}

module.exports = { prepare, describe, rank, explain, summarize, compute, fail };
