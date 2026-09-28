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
let bootstrapped = false;
let bootstrapping = false;

async function readSettings() {
  const { rows } = await query(
    "SELECT key, value FROM app_settings WHERE key IN ('profile_job_interval_min', 'profile_job_enabled')");
  return parseJobSettings(rows);
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    if (!bootstrapped) await bootstrap();
    const settings = await readSettings();
    if (!isJobDue(settings, lastRunStartedAt, new Date())) return;
    const previousRunStartedAt = lastRunStartedAt;
    lastRunStartedAt = new Date();
    const r = await processQueue('scheduled');
    // Another run (e.g. a console action) held the lock: this tick did nothing, so it must not
    // count as "the last scheduled run" — that would push the next one back a full interval and
    // show a "last scheduled run" that never actually ran.
    if (r.skipped) lastRunStartedAt = previousRunStartedAt;
  } catch (err) {
    console.warn('[profile-worker] tick:', err.message);
  } finally {
    busy = false;
  }
}

// After a deploy the profiles start empty: if no contribution exists yet but actuals do, queue
// every code and run once, whatever the on/off switch says (it is a one-time build).
async function bootstrap() {
  if (bootstrapped || bootstrapping) return;
  bootstrapping = true;
  try {
    const { rows } = await query(
      `SELECT (SELECT count(*) FROM resource_project_contributions) AS contribs,
              (SELECT count(*) FROM timesheets) AS sheets`);
    if (Number(rows[0].contribs) === 0 && Number(rows[0].sheets) > 0) {
      await enqueueAll();
      const previousRunStartedAt = lastRunStartedAt;
      lastRunStartedAt = new Date();
      const r = await processQueue('bootstrap');
      // Same guard as tick(): losing the advisory-lock race means this bootstrap did no work, so
      // it must not count as "the last run" either.
      if (r.skipped) lastRunStartedAt = previousRunStartedAt;
    }
    bootstrapped = true;
  } catch (err) {
    console.warn('[profile-worker] bootstrap:', err.message);
  } finally {
    bootstrapping = false;
  }
}

function start() {
  setTimeout(() => { bootstrap().catch(() => {}); }, BOOTSTRAP_DELAY_MS).unref();
  setInterval(() => { tick().catch(() => {}); }, TICK_MS).unref();
  console.log('[profile-worker] started (tick every 60 s)');
}

// For the job console (same process as the API): the last scheduled/bootstrap start, in memory
// only — null after a restart. Manual runs never set it, so they do not move the next run.
function getLastRunStartedAt() {
  return lastRunStartedAt;
}

module.exports = { start, readSettings, getLastRunStartedAt };
