const PLURAL_PARTS = new Set(['project', 'tasks', 'groups']);

const PART_LABELS = {
  project: 'project details',
  tasks: 'tasks',
  phasing: 'phasing',
  ptc: 'PTC',
  planning: 'monthly planning',
  groups: 'role groups',
};

const REASON_CODES = new Set(['DATE_RULE', 'PROJECT_RULE', 'STRUCTURE_RULE']);

// Turns the `failed` list returned by _pushProjectToApiDetailed() (js/api-sync.js) into
// { ok, message } for project-config.html's onSave.
export function summarizePushResult(failed) {
  if (!failed || !failed.length) return { ok: true, message: '' };
  const labels = failed.map(f => PART_LABELS[f.part] || f.part);
  const list = labels.length === 1
    ? labels[0]
    : labels.slice(0, -1).join(', ') + ' and ' + labels[labels.length - 1];
  const verb = failed.length === 1 && !PLURAL_PARTS.has(failed[0].part) ? 'was' : 'were';
  let message = `Save failed: ${list} ${verb} not saved. Fix the issue and press Save again.`;
  const refused = failed.find(f => REASON_CODES.has(f.code) && f.reason);
  if (refused) message += ` Reason: ${refused.reason}`;
  return { ok: false, message };
}

window.summarizePushResult = summarizePushResult;
