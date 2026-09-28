// Pure helpers for profile-jobs.html (Cycle 3d, 2026-09). No DOM, no Vue: unit-tested with vitest
// and bridged to window.* for the page's inline module script.

const STATUS_LABELS = { error: 'Error', queued: 'Queued', updated: 'Updated', unprocessed: 'Not processed' };
const STATUS_RANK = { error: 0, queued: 1, unprocessed: 2, updated: 3 };
const NEXT_TICK = 'On the next tick (within 60 s)';

function fold(s) {
  return String(s ?? '').normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().trim();
}

// Case/accent-insensitive, numeric-aware ("ABC.9" before "ABC.10").
function cmp(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base', numeric: true });
}

// Date | ISO string → epoch ms, or null when empty/invalid.
function toTime(value) {
  if (value === null || value === undefined || value === '') return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

const byCode = (a, b) => cmp(a.project_code, b.project_code);
const byStatus = (a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);

export function filterJobProjects(list, { search = '', status = 'all' } = {}) {
  const tokens = fold(search).split(/\s+/).filter(Boolean);
  return (list || []).filter(p => {
    if (status && status !== 'all' && p.status !== status) return false;
    if (!tokens.length) return true;
    const hay = fold(`${p.project_code} ${p.project_name}`);
    return tokens.every(t => hay.includes(t));
  });
}

// Returns a NEW array. Ties fall back to code ascending, then to the input order, whatever `dir`.
export function sortJobProjects(list, key = 'code', dir = 'asc') {
  const sign = dir === 'desc' ? -1 : 1;
  return (list || [])
    .map((item, index) => ({ item, index }))
    .sort((x, y) => {
      const a = x.item;
      const b = y.item;
      if (key === 'lastProcessed') {
        const ta = toTime(a.last_processed_at);
        const tb = toTime(b.last_processed_at);
        if (ta === null && tb !== null) return 1;           // never processed: always last
        if (tb === null && ta !== null) return -1;
        if (ta !== null && tb !== null && ta !== tb) return (ta - tb) * sign;
      } else {
        const primary = key === 'status' ? byStatus : byCode;
        const d = primary(a, b) * sign;
        if (d) return d;
      }
      return byCode(a, b) || x.index - y.index;
    })
    .map(entry => entry.item);
}

export function jobStatusLabel(status) {
  return STATUS_LABELS[status] || String(status ?? '');
}

export function jobStatusClass(status) {
  return `job-st job-st-${STATUS_LABELS[status] ? status : 'unprocessed'}`;
}

// Local time, 'YYYY-MM-DD HH:MM'.
export function formatDateTime(value) {
  const t = toTime(value);
  if (t === null) return '—';
  const d = new Date(t);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// schedule: GET /api/profile-jobs → schedule. With a project row, a row that is not queued has
// no next processing ('—'); a queued row follows the job schedule.
export function describeNextRun(schedule, project) {
  if (project && !project.queued_at) return '—';
  const s = schedule || {};
  if (s.state === 'paused') return 'Paused';
  if (s.state === 'scheduled' && toTime(s.nextRunAt) !== null) return formatDateTime(s.nextRunAt);
  return NEXT_TICK;
}

export function formatDuration(startedAt, finishedAt) {
  const a = toTime(startedAt);
  const b = toTime(finishedAt);
  if (a === null || b === null || b < a) return '—';
  const ms = b - a;
  if (ms < 1000) return '< 1 s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

window.filterJobProjects = filterJobProjects;
window.sortJobProjects = sortJobProjects;
window.jobStatusLabel = jobStatusLabel;
window.jobStatusClass = jobStatusClass;
window.describeNextRun = describeNextRun;
window.formatDateTime = formatDateTime;
window.formatDuration = formatDuration;
