const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { query } = require('../db/client');
const {
  MAX_RUNS_KEPT, processQueue, enqueueAll, enqueueProjects, dequeueProject, isKnownProjectCode,
} = require('../services/profile-engine');
const { readSettings, getLastRunStartedAt } = require('../services/profile-worker');
const { nextRunInfo, jobSettingsError, deriveProjectStatus } = require('../lib/job-schedule');

const router = express.Router();

router.use(requireAuth, requireAdmin);

const BUSY = 'A profile job is already running — try again in a moment.';
const MAX_CODE_LENGTH = 100;

// One row per project code with actuals or tracked by the engine, in ONE query. This read is the
// only table access in this file that does not go through the engine (spec §7).
// Name: the code's OLDEST project (projects.code is not unique), else the code itself.
// row_count: actuals elements, guarded like the engine (non-array data counts 0).
const PROJECTS_SQL = `
  WITH codes AS (
    SELECT project_code FROM timesheets
    UNION
    SELECT project_code FROM profile_project_state
  ),
  ts AS (
    SELECT project_code,
           SUM(CASE WHEN jsonb_typeof(data) = 'array' THEN jsonb_array_length(data) ELSE 0 END)::int AS row_count
    FROM timesheets
    GROUP BY project_code
  ),
  pj AS (
    SELECT DISTINCT ON (code) code, name
    FROM projects
    WHERE code IS NOT NULL
    ORDER BY code, created_at, id
  ),
  rc AS (
    SELECT project_code, COUNT(DISTINCT resource_id)::int AS resource_count
    FROM resource_project_contributions
    GROUP BY project_code
  )
  SELECT c.project_code,
         COALESCE(pj.name, c.project_code) AS project_name,
         COALESCE(ts.row_count, 0)         AS row_count,
         COALESCE(rc.resource_count, 0)    AS resource_count,
         s.queued_at, s.last_processed_at, s.last_error
  FROM codes c
  LEFT JOIN ts ON ts.project_code = c.project_code
  LEFT JOIN pj ON pj.code = c.project_code
  LEFT JOIN rc ON rc.project_code = c.project_code
  LEFT JOIN profile_project_state s ON s.project_code = c.project_code
  ORDER BY c.project_code`;

// :code (already URL-decoded by Express) → trimmed code, or null when blank or too long.
function codeParam(req) {
  const code = String(req.params.code ?? '').trim();
  return code && code.length <= MAX_CODE_LENGTH ? code : null;
}

const runResult = r => ({ ok: true, projects: r.projects, resources: r.resources, errors: r.errors });

// GET /api/profile-jobs — settings, next-run estimate, queue size and the per-code list
router.get('/', async (req, res, next) => {
  try {
    const [settings, list] = await Promise.all([readSettings(), query(PROJECTS_SQL)]);
    const lastRunAt = getLastRunStartedAt();
    const info = nextRunInfo(settings, lastRunAt, new Date());
    const projects = list.rows.map(r => ({ ...r, status: deriveProjectStatus(r) }));
    res.json({
      settings,
      schedule: {
        state: info.state,
        lastRunAt: lastRunAt ? new Date(lastRunAt).toISOString() : null,
        nextRunAt: info.nextRunAt ? info.nextRunAt.toISOString() : null,
      },
      queuedCount: projects.filter(p => p.queued_at).length,
      projects,
    });
  } catch (err) { next(err); }
});

// PUT /api/profile-jobs/settings — { enabled: boolean, intervalMin: 1..1440 }, strict JSON types.
// The worker re-reads app_settings on every 60 s tick, so no restart is needed.
router.put('/settings', async (req, res, next) => {
  try {
    const error = jobSettingsError(req.body);
    if (error) return res.status(400).json({ error });
    const { enabled, intervalMin } = req.body;
    await query(
      `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES
         ('profile_job_enabled', $1, NOW(), $3),
         ('profile_job_interval_min', $2, NOW(), $3)
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
      [enabled ? 'true' : 'false', String(intervalMin), req.user.id]
    );
    res.json(await readSettings());
  } catch (err) { next(err); }
});

// POST /api/profile-jobs/run — drain the profile queue now (also used by the tests).
// 409 when another run holds the lock.
router.post('/run', async (req, res, next) => {
  try {
    const r = await processQueue('manual');
    if (r.skipped) return res.status(409).json({ error: 'A profile job is already running' });
    res.json({ ok: true, projects: r.projects, resources: r.resources, errors: r.errors });
  } catch (err) { next(err); }
});

// POST /api/profile-jobs/rebuild — queue every code, then drain. On 409 the codes stay queued.
router.post('/rebuild', async (req, res, next) => {
  try {
    await enqueueAll();
    const r = await processQueue('manual');
    if (r.skipped) {
      return res.status(409).json({
        error: `${BUSY} All project codes have been queued and will be processed by the running job or the next one.`,
      });
    }
    res.json(runResult(r));
  } catch (err) { next(err); }
});

// POST /api/profile-jobs/projects/:code/process — queue and process only this code.
router.post('/projects/:code/process', async (req, res, next) => {
  try {
    const code = codeParam(req);
    if (!code) return res.status(400).json({ error: 'Invalid project code' });
    if (!await isKnownProjectCode(code)) return res.status(404).json({ error: 'Project code not found' });
    await enqueueProjects([code]);
    const r = await processQueue('manual', { only: code });
    if (r.skipped) {
      return res.status(409).json({
        error: `${BUSY} This project code has been queued and will be processed by the running job or the next one.`,
      });
    }
    res.json(runResult(r));
  } catch (err) { next(err); }
});

// DELETE /api/profile-jobs/projects/:code/queue — take the code out of the queue; the profile
// already computed does not change until the code is processed again.
router.delete('/projects/:code/queue', async (req, res, next) => {
  try {
    const code = codeParam(req);
    if (!code) return res.status(400).json({ error: 'Invalid project code' });
    if (!await dequeueProject(code)) return res.status(404).json({ error: 'Project code not tracked' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/profile-jobs/runs — the latest runs, newest first
router.get('/runs', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, started_at, finished_at, trigger_type, projects, resources, error
       FROM profile_job_runs ORDER BY id DESC LIMIT $1`,
      [MAX_RUNS_KEPT]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
