// Pure scheduling helpers for the profile worker (Cycle 3c) and its console (Cycle 3d).
// No DB, no timers.
const DEFAULT_INTERVAL_MIN = 10;
const MIN_INTERVAL = 1;
const MAX_INTERVAL = 1440;
const MAX_ERROR_LENGTH = 500;

// rows: [{ key, value }] read from app_settings.
function parseJobSettings(rows) {
  const map = {};
  for (const r of rows || []) map[r.key] = r.value;
  let intervalMin = parseInt(map.profile_job_interval_min, 10);
  if (!Number.isFinite(intervalMin) || intervalMin < MIN_INTERVAL || intervalMin > MAX_INTERVAL) intervalMin = DEFAULT_INTERVAL_MIN;
  const enabled = String(map.profile_job_enabled ?? 'true').trim().toLowerCase() !== 'false';
  return { enabled, intervalMin };
}

// Is a scheduled run due? A disabled job never is; a job that never ran always is.
function isJobDue(settings, lastRunStartedAt, now = new Date()) {
  if (!settings.enabled) return false;
  if (!lastRunStartedAt) return true;
  return now.getTime() - new Date(lastRunStartedAt).getTime() >= settings.intervalMin * 60000;
}

// The error text stored in profile_job_runs.error (null when the run had no error).
function composeRunError(errors) {
  return errors && errors.length ? errors.join('; ').slice(0, MAX_ERROR_LENGTH) : null;
}

// Should this run get a profile_job_runs row? Manual runs always; scheduled/bootstrap runs only
// when they processed something, or failed with an error DIFFERENT from the last recorded run
// (a permanently failing code would otherwise flush the 50-row history, one row per interval).
function shouldRecordRun({ trigger, projects, errors, lastRunError }) {
  if (trigger === 'manual') return true;
  if (projects > 0) return true;
  const composed = composeRunError(errors);
  if (!composed) return false;
  return composed !== (lastRunError ?? null);
}

// When will the worker next start a scheduled run? Same rule as isJobDue: due once
// now >= last + interval. lastRunStartedAt is the worker's in-memory value (null after a restart).
function nextRunInfo(settings, lastRunStartedAt, now = new Date()) {
  if (!settings || !settings.enabled) return { state: 'paused', nextRunAt: null };
  const last = lastRunStartedAt ? new Date(lastRunStartedAt) : null;
  if (!last || Number.isNaN(last.getTime())) return { state: 'due', nextRunAt: null };
  const next = new Date(last.getTime() + settings.intervalMin * 60000);
  if (next.getTime() <= now.getTime()) return { state: 'due', nextRunAt: null };
  return { state: 'scheduled', nextRunAt: next };
}

// Validates the PUT /api/profile-jobs/settings body. Strict JSON types: no numeric strings,
// no "true"/"false" strings, no floats. Returns an error message or null.
function jobSettingsError(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Body must be an object with enabled and intervalMin';
  }
  if (typeof body.enabled !== 'boolean') return 'enabled must be true or false';
  const n = body.intervalMin;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < MIN_INTERVAL || n > MAX_INTERVAL) {
    return `intervalMin must be a whole number of minutes between ${MIN_INTERVAL} and ${MAX_INTERVAL}`;
  }
  return null;
}

// Row status for the console list.
function deriveProjectStatus(row) {
  if (row.last_error) return 'error';
  if (row.queued_at) return 'queued';
  if (row.last_processed_at) return 'updated';
  return 'unprocessed';
}

module.exports = {
  DEFAULT_INTERVAL_MIN, parseJobSettings, isJobDue,
  composeRunError, shouldRecordRun, nextRunInfo, jobSettingsError, deriveProjectStatus,
};
