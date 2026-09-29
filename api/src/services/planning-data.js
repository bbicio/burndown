'use strict';
// Loads everything the planning model needs (projects + tasks, actuals, resources/aliases) and
// caches the slim result in-process for CACHE_MS. One in-flight load is shared by concurrent
// callers. invalidatePlanningData() is called by a write-middleware (index.js) after any
// successful write under the project/timesheet/resource/reset routes; the TTL bounds staleness
// if a write path is ever missed.
const { query } = require('../db/client');
const { isAdminRole } = require('../lib/is-admin');
const { groupActualsByProject } = require('../lib/planning-model');

const CACHE_MS = 30_000;
let cache = null;      // { data, at }
let inflight = null;   // Promise<data>
let generation = 0;    // bumped on invalidate so a load that started before it is not cached

async function load() {
  const [projectsRes, sheetsRes, resourcesRes, aliasesRes] = await Promise.all([
    query(`SELECT p.id, p.code, p.name, p.start_date AS "startDate", p.end_date AS "endDate",
                  COALESCE((SELECT json_agg(json_build_object(
                      'name', pt.name, 'completed', pt.completed,
                      'startDate', pt.start_date, 'endDate', pt.end_date,
                      'monthlyDistribution', pt.monthly_distribution, 'resources', pt.resources
                    ) ORDER BY pt.sort_order)
                    FROM project_tasks pt WHERE pt.project_id = p.id), '[]'::json) AS tasks
           FROM projects p`),
    query('SELECT project_code, data FROM timesheets'),
    query('SELECT id, first_name, last_name, status FROM resources'),
    query('SELECT alias_normalized, resource_id FROM resource_aliases'),
  ]);
  const projects = new Map(projectsRes.rows.map(p => [p.id, { ...p, tasks: Array.isArray(p.tasks) ? p.tasks : [] }]));
  const actuals = groupActualsByProject(projectsRes.rows, sheetsRes.rows);
  return { projects, actuals, resources: resourcesRes.rows, aliases: aliasesRes.rows };
}

async function getPlanningData() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  if (inflight) return inflight;
  const startedAt = generation;
  const p = load().then(data => {
    if (startedAt === generation) cache = { data, at: Date.now() };
    return data;
  });
  inflight = p;
  // Only clear our own slot (an invalidate may have started a newer load); swallow here so the
  // finally-branch never surfaces an unhandled rejection - callers still get p's rejection.
  p.then(() => {}, () => {}).then(() => { if (inflight === p) inflight = null; });
  return p;
}

function invalidatePlanningData() {
  generation++;
  cache = null;
  inflight = null;
}

// Same visibility rule as GET /api/projects: admins/sysadmins see everything, others their own
// or shared projects. null = no restriction.
async function visibleProjectIds(user) {
  if (isAdminRole(user.role)) return null;
  const { rows } = await query(
    `SELECT p.id FROM projects p
     WHERE p.owner_id = $1 OR EXISTS(
       SELECT 1 FROM resource_shares rs
       WHERE rs.resource_type = 'project' AND rs.resource_id = p.id AND rs.user_id = $1)`,
    [user.id]
  );
  return new Set(rows.map(r => r.id));
}

module.exports = { getPlanningData, invalidatePlanningData, visibleProjectIds };
