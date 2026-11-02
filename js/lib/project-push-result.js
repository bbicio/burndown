const PLURAL_PARTS = new Set(['project', 'tasks', 'groups']);

const PART_LABELS = {
  project: 'project details',
  tasks: 'tasks',
  phasing: 'phasing',
  ptc: 'PTC',
  planning: 'monthly planning',
  groups: 'role groups',
};

const REASON_CODES = new Set(['DATE_RULE', 'PROJECT_RULE', 'STRUCTURE_RULE', 'MONEY_RULE']);

function reasonOf(failed) {
  const refused = failed.find(f => REASON_CODES.has(f.code) && f.reason);
  return refused ? ` Reason: ${refused.reason}` : '';
}

// "tasks, PTC and role groups" plus the verb agreeing with it ("was" | "were").
function listAndVerb(labels, failed) {
  const list = labels.length === 1
    ? labels[0]
    : labels.slice(0, -1).join(', ') + ' and ' + labels[labels.length - 1];
  const verb = failed.length === 1 && !PLURAL_PARTS.has(failed[0].part) ? 'was' : 'were';
  return { list, verb };
}

// Turns the `failed` list returned by _pushProjectToApiDetailed() (js/api-sync.js) into
// { ok, message } for project-config.html's onSave.
export function summarizePushResult(failed) {
  if (!failed || !failed.length) return { ok: true, message: '' };
  if (failed.length === 1 && failed[0].part === 'project') {
    return { ok: false, message: 'Save failed: project details were not saved, so tasks, phasing, PTC, monthly planning and role groups were not attempted. Fix the issue and press Save again.' + reasonOf(failed) };
  }
  const labels = failed.map(f => (f.part === 'tasks' && f.withPeriod) ? 'tasks and the project period' : (PART_LABELS[f.part] || f.part));
  const { list, verb } = listAndVerb(labels, failed);
  let message = `Save failed: ${list} ${verb} not saved. Fix the issue and press Save again.`;
  message += reasonOf(failed);
  return { ok: false, message };
}

// Message for "Generate project" (js/costgrid.js): the project exists, so a failed `project`
// part is not reported; '' when nothing else failed.
export function summarizeGenerateResult(projectName, failed) {
  const rest = (failed || []).filter(f => f.part !== 'project');
  if (!rest.length) return '';
  const labels = rest.map(f => PART_LABELS[f.part] || f.part);
  const { list, verb } = listAndVerb(labels, rest);
  return `Project "${projectName}" was created, but its ${list} ${verb} not saved.` + reasonOf(rest);
}

window.summarizePushResult = summarizePushResult;
window.summarizeGenerateResult = summarizeGenerateResult;
