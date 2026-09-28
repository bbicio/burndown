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

// Runs processQueue(trigger) and updates lastRunStartedAt around it: optimistically set to "now"
// before the call (so a concurrent isJobDue check during a slow run doesn't also fire), then
// restored to its previous value if the run did nothing — skipped (another run held the lock) or
// threw (e.g. a DB error before any code was claimed) both mean no run actually happened, so
// neither may count as "the last run": that would push the next attempt back a full interval and
// show a "last run" on the console that never actually ran. Shared by tick() and bootstrap() so a
// future change to this tracking only has to be made in one place.
async function runAndTrackLastStart(trigger) {
  const previousRunStartedAt = lastRunStartedAt;
  lastRunStartedAt = new Date();
  try {
    const r = await processQueue(trigger);
    if (r.skipped) lastRunStartedAt = previousRunStartedAt;
    return r;
  } catch (err) {
    lastRunStartedAt = previousRunStartedAt;
    throw err;
  }
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    if (!bootstrapped) await bootstrap();
    const settings = await readSettings();
    if (!isJobDue(settings, lastRunStartedAt, new Date())) return;
    await runAndTrackLastStart('scheduled');
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
      await runAndTrackLastStart('bootstrap');
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
