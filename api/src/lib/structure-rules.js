// Integrity rule for a version's structure save: a task linked to a project (cg_version_projects.task_ids)
// cannot disappear from the version. Pure function, no I/O; the caller reads the links and the tasks.

// Carried in the body of the 400 this rule produces, so a client can tell it from other errors.
const STRUCTURE_RULE_CODE = 'STRUCTURE_RULE';

const key = id => String(id).toLowerCase();

// The tasks of currentTasks ({ id, title }) that are linked and absent from the payload.
// A linked id that matches no current task (an orphan) is ignored.
function missingLinkedTasks({ linkedTaskIds, currentTasks, payloadTaskIds }) {
  const linked = new Set(linkedTaskIds.map(key));
  const kept = new Set(payloadTaskIds.map(key));
  return currentTasks.filter(t => linked.has(key(t.id)) && !kept.has(key(t.id)));
}

module.exports = { missingLinkedTasks, STRUCTURE_RULE_CODE };
