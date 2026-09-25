// Pure scheduling helpers for the profile worker (Cycle 3c). No DB, no timers.
const DEFAULT_INTERVAL_MIN = 10;

// rows: [{ key, value }] read from app_settings.
function parseJobSettings(rows) {
  const map = {};
  for (const r of rows || []) map[r.key] = r.value;
  let intervalMin = parseInt(map.profile_job_interval_min, 10);
  if (!Number.isFinite(intervalMin) || intervalMin < 1 || intervalMin > 1440) intervalMin = DEFAULT_INTERVAL_MIN;
  const enabled = String(map.profile_job_enabled ?? 'true').trim().toLowerCase() !== 'false';
  return { enabled, intervalMin };
}

// Is a scheduled run due? A disabled job never is; a job that never ran always is.
function isJobDue(settings, lastRunStartedAt, now = new Date()) {
  if (!settings.enabled) return false;
  if (!lastRunStartedAt) return true;
  return now.getTime() - new Date(lastRunStartedAt).getTime() >= settings.intervalMin * 60000;
}

module.exports = { DEFAULT_INTERVAL_MIN, parseJobSettings, isJobDue };
