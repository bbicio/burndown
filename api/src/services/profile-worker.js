// Self-scheduling profile worker (Cycle 3c). Every 60 s it asks whether a run is due according to
// the settings stored in app_settings (so they change without restarting the API), then drains
// the queue. The session advisory lock in profile-engine keeps overlapping runs apart.
const { query } = require('../db/client');
const { parseJobSettings, isJobDue } = require('../lib/job-schedule');
const { processQueue, enqueueAll } = require('./profile-engine');

const TICK_MS = 60 * 1000;
const BOOTSTRAP_DELAY_MS = 5 * 1000;

let lastRunStartedAt = null;
let busy = false;

async function readSettings() {
  const { rows } = await query(
    "SELECT key, value FROM app_settings WHERE key IN ('profile_job_interval_min', 'profile_job_enabled')");
  return parseJobSettings(rows);
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const settings = await readSettings();
    if (!isJobDue(settings, lastRunStartedAt, new Date())) return;
    lastRunStartedAt = new Date();
    await processQueue('scheduled');
  } catch (err) {
    console.warn('[profile-worker] tick:', err.message);
  } finally {
    busy = false;
  }
}

// After a deploy the profiles start empty: if no contribution exists yet but actuals do, queue
// every code and run once, whatever the on/off switch says (it is a one-time build).
async function bootstrap() {
  try {
    const { rows } = await query(
      `SELECT (SELECT count(*) FROM resource_project_contributions) AS contribs,
              (SELECT count(*) FROM timesheets) AS sheets`);
    if (Number(rows[0].contribs) === 0 && Number(rows[0].sheets) > 0) {
      await enqueueAll();
      lastRunStartedAt = new Date();
      await processQueue('bootstrap');
    }
  } catch (err) {
    console.warn('[profile-worker] bootstrap:', err.message);
  }
}

function start() {
  setTimeout(() => { bootstrap().catch(() => {}); }, BOOTSTRAP_DELAY_MS).unref();
  setInterval(() => { tick().catch(() => {}); }, TICK_MS).unref();
  console.log('[profile-worker] started (tick every 60 s)');
}

module.exports = { start };
