// DB-bound half of Cycle 3c: process queued project codes into per-resource contributions and
// rebuild the affected resources' profiles. Pure logic lives in ../lib/resource-profile.js.
const { pool, query } = require('../db/client');
const { needsFreshContext } = require('../lib/job-schedule');
const { buildMatchContext } = require('../lib/match-resource');
const { buildContributions, aggregateProfile } = require('../lib/resource-profile');
const { refreshUnmatched } = require('./resource-matching');

const MAX_RUNS_KEPT = 50;

// ── Queue ─────────────────────────────────────────────────────────────────────────────────────

async function enqueueProjects(codes) {
  const list = [...new Set((codes || []).map(c => String(c ?? '').trim()).filter(Boolean))];
  if (!list.length) return;
  await query(
    `INSERT INTO profile_project_state (project_code, queued_at)
     SELECT c, now() FROM unnest($1::text[]) AS c
     ON CONFLICT (project_code) DO UPDATE
       SET queued_at = COALESCE(profile_project_state.queued_at, EXCLUDED.queued_at)`,
    [list]
  );
}

// Every code that has actuals, plus every code already tracked (so deleted actuals get cleaned up).
async function enqueueAll() {
  await query(
    `INSERT INTO profile_project_state (project_code, queued_at)
     SELECT c.project_code, now()
     FROM (SELECT project_code FROM timesheets UNION SELECT project_code FROM profile_project_state) c
     ON CONFLICT (project_code) DO UPDATE
       SET queued_at = COALESCE(profile_project_state.queued_at, EXCLUDED.queued_at)`
  );
}

// Route hooks must never fail (or slow down noticeably) the request that triggered them.
async function quiet(label, fn) {
  try { await fn(); } catch (err) { console.warn(`[profile] ${label}:`, err.message); }
}
const enqueueProjectsQuiet = codes => quiet('enqueueProjects', () => enqueueProjects(codes));
const enqueueAllQuiet = () => quiet('enqueueAll', enqueueAll);

// ── Processing ────────────────────────────────────────────────────────────────────────────────

// Returns { ctx, builtAt } — builtAt is DATABASE time taken just before the reads, so it can be
// compared with queued_at (also DB time) without JS-clock skew.
async function loadMatchContext(client) {
  const builtAt = (await client.query('SELECT clock_timestamp() AS t')).rows[0].t;
  const [resources, aliases] = await Promise.all([
    client.query('SELECT id, first_name, last_name, status FROM resources'),
    client.query('SELECT alias_normalized, resource_id FROM resource_aliases'),
  ]);
  return { ctx: buildMatchContext(resources.rows, aliases.rows), builtAt };
}

// Rebuild ONE resource's profile from all of its contributions (NULL when it has none).
async function rebuildProfile(client, resourceId) {
  const contribs = await client.query(
    'SELECT project_code, data FROM resource_project_contributions WHERE resource_id = $1', [resourceId]);
  if (!contribs.rows.length) {
    await client.query('UPDATE resources SET profile = NULL, profile_computed_at = now() WHERE id = $1', [resourceId]);
    return;
  }
  const contribByCode = {};
  for (const r of contribs.rows) contribByCode[r.project_code] = r.data;
  const codes = Object.keys(contribByCode);

  // A code resolves to its OLDEST project (projects.code is not unique); tags come from project_tags.
  const info = await client.query(
    `WITH pj AS (SELECT DISTINCT ON (code) code, id, name FROM projects
                 WHERE code = ANY($1::text[]) ORDER BY code, created_at, id)
     SELECT pj.code, pj.id AS project_id, pj.name,
            al.slug, al.name AS list_name, ali.id AS item_id, ali.label
     FROM pj
     LEFT JOIN project_tags pt ON pt.project_id = pj.id
     LEFT JOIN attribute_list_items ali ON ali.id = pt.item_id
     LEFT JOIN attribute_lists al ON al.id = ali.list_id`,
    [codes]
  );
  const projectsByCode = {};
  for (const r of info.rows) {
    if (!projectsByCode[r.code]) projectsByCode[r.code] = { projectId: r.project_id, name: r.name, tags: [] };
    if (r.item_id) projectsByCode[r.code].tags.push({ slug: r.slug, listName: r.list_name, itemId: r.item_id, label: r.label });
  }

  const profile = aggregateProfile(contribByCode, projectsByCode, new Date());
  await client.query('UPDATE resources SET profile = $2::jsonb, profile_computed_at = now() WHERE id = $1',
    [resourceId, JSON.stringify(profile)]);
}

// Inside an open transaction: replace only this code's contributions, rebuild the affected profiles.
async function processCode(client, code, matchCtx) {
  const ctx = matchCtx || (await loadMatchContext(client)).ctx;
  const ts = await client.query(
    `SELECT e FROM timesheets t
     CROSS JOIN LATERAL jsonb_array_elements(
       CASE WHEN jsonb_typeof(t.data) = 'array' THEN t.data ELSE '[]'::jsonb END) e
     WHERE t.project_code = $1`,
    [code]
  );
  const rows = ts.rows.map(r => r.e);
  const proj = await client.query(
    'SELECT name FROM projects WHERE code = $1 ORDER BY created_at, id LIMIT 1', [code]);
  const fromActuals = rows.map(r => String(r.projectName ?? '').trim()).find(Boolean);
  const projectName = proj.rows[0]?.name || fromActuals || code;

  const contribs = buildContributions(rows, ctx, projectName);
  const prev = await client.query(
    'SELECT resource_id FROM resource_project_contributions WHERE project_code = $1', [code]);
  await client.query('DELETE FROM resource_project_contributions WHERE project_code = $1', [code]);
  if (contribs.size) {
    const ids = [...contribs.keys()];
    await client.query(
      `INSERT INTO resource_project_contributions (resource_id, project_code, data, computed_at)
       SELECT t.a, $2, t.b::jsonb, now() FROM unnest($1::uuid[], $3::text[]) AS t(a, b)`,
      [ids, code, ids.map(id => JSON.stringify(contribs.get(id)))]
    );
  }
  const affected = new Set([...prev.rows.map(r => r.resource_id), ...contribs.keys()]);
  for (const rid of affected) await rebuildProfile(client, rid);
  return { rows: rows.length, resources: contribs.size };
}

// One queued code per transaction. Returns null when the queue is empty, { code, resources } on
// success, { code, error } when that code failed (it goes to the back of the queue with last_error).
async function processNext(exclude, holder) {
  const client = await pool.connect();
  let code = null;
  try {
    await client.query('BEGIN');
    const claim = await client.query(
      `WITH c AS (SELECT project_code, queued_at FROM profile_project_state
                  WHERE queued_at IS NOT NULL AND project_code <> ALL($1::text[])
                  ORDER BY queued_at, project_code FOR UPDATE SKIP LOCKED LIMIT 1)
       UPDATE profile_project_state s SET queued_at = NULL
       FROM c WHERE s.project_code = c.project_code
       RETURNING s.project_code, c.queued_at AS claimed_queued_at`,
      [exclude]
    );
    if (!claim.rows[0]) { await client.query('COMMIT'); return null; }
    code = claim.rows[0].project_code;
    // Work re-queued after the context was built (e.g. an alias/resource added mid-run) needs a fresh one.
    if (needsFreshContext(claim.rows[0].claimed_queued_at, holder.builtAt)) {
      Object.assign(holder, await loadMatchContext(client));
    }
    const out = await processCode(client, code, holder.ctx);
    await client.query(
      `UPDATE profile_project_state
       SET last_processed_at = now(), last_error = NULL, last_rows = $2, last_resources = $3
       WHERE project_code = $1`,
      [code, out.rows, out.resources]
    );
    await client.query('COMMIT');
    // Keep the "Unmatched names" list for this code current (own transaction; best-effort).
    await quiet('refreshUnmatched', () => refreshUnmatched([code]));
    return { code, resources: out.resources };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (!code) throw err;                       // failure before a code was claimed
    const message = String(err.message || err).slice(0, 500);
    await query('UPDATE profile_project_state SET last_error = $2, queued_at = now() WHERE project_code = $1',
      [code, message]).catch(() => {});
    return { code, error: message };
  } finally {
    client.release();
  }
}

async function recordRun(trigger, startedAt, projects, resources, errors) {
  await query(
    `INSERT INTO profile_job_runs (started_at, finished_at, trigger_type, projects, resources, error)
     VALUES ($1, now(), $2, $3, $4, $5)`,
    [startedAt, trigger, projects, resources, errors.length ? errors.join('; ').slice(0, 500) : null]
  );
  await query(
    `DELETE FROM profile_job_runs WHERE id NOT IN (SELECT id FROM profile_job_runs ORDER BY id DESC LIMIT ${MAX_RUNS_KEPT})`);
}

// Drain the queue. A session-level advisory lock keeps two runs (or two API instances) apart.
// Scheduled/bootstrap runs are recorded only if they did something; manual runs always.
async function processQueue(trigger = 'scheduled') {
  const lockClient = await pool.connect();
  const startedAt = new Date();
  try {
    const { rows } = await lockClient.query("SELECT pg_try_advisory_lock(hashtext('profile_engine')) AS ok");
    if (!rows[0].ok) return { skipped: true, projects: 0, resources: 0, errors: [] };
    let projects = 0;
    let resources = 0;
    const errors = [];
    const failed = [];
    // Built once per run (a bulk rebuild queued before the run reuses it), and reloaded only when a
    // claimed code was re-queued after the build (see needsFreshContext). A code that failed in this
    // run is re-queued with queued_at = now() but sits in `failed`, so it is never claimed again here.
    const holder = await loadMatchContext(lockClient);
    for (;;) {
      const r = await processNext(failed, holder);
      if (!r) break;
      if (r.error) { failed.push(r.code); errors.push(`${r.code}: ${r.error}`); continue; }
      projects += 1;
      resources += r.resources;
    }
    if (trigger === 'manual' || projects > 0 || errors.length) {
      await recordRun(trigger, startedAt, projects, resources, errors);
    }
    if (projects > 0) {
      // "a run has passed since this resource was created": unmatched resources keep profile NULL
      await query('UPDATE resources SET profile_computed_at = now() WHERE profile_computed_at IS NULL');
    }
    return { skipped: false, projects, resources, errors };
  } finally {
    let unlockFailed = false;
    try {
      await lockClient.query("SELECT pg_advisory_unlock(hashtext('profile_engine'))");
    } catch (_) { unlockFailed = true; }
    lockClient.release(unlockFailed ? true : undefined);
  }
}

module.exports = {
  enqueueProjects, enqueueAll, enqueueProjectsQuiet, enqueueAllQuiet, processQueue,
};
