// Integrity rule for a version's structure save: a task linked to a project (cg_version_projects.task_ids)
// cannot disappear from the version. Pure function, no I/O; the caller reads the links and the tasks.

// Carried in the body of the 400 this rule produces, so a client can tell it from other errors.
const STRUCTURE_RULE_CODE = 'STRUCTURE_RULE';

const key = id => String(id).toLowerCase();

const nameKey = s => String(s || '').trim().toLowerCase();

// The tasks of currentTasks ({ id, title }) that are linked and absent from the payload.
// A task is linked by its id (linkedTaskIds) or by its title (linkedTaskNames, for a link made by name only);
// it is kept when the payload holds its id or a task with its title.
// A linked id that matches no current task (an orphan) is ignored.
function missingLinkedTasks({ linkedTaskIds, linkedTaskNames = [], currentTasks, payloadTaskIds, payloadTaskNames = [] }) {
  const linked = new Set(linkedTaskIds.map(key));
  const linkedNames = new Set(linkedTaskNames.map(nameKey));
  const kept = new Set(payloadTaskIds.map(key));
  const keptNames = new Set(payloadTaskNames.map(nameKey));
  return currentTasks.filter(t =>
    (linked.has(key(t.id)) || linkedNames.has(nameKey(t.title)))
    && !kept.has(key(t.id)) && !keptNames.has(nameKey(t.title)));
}

module.exports = { missingLinkedTasks, STRUCTURE_RULE_CODE };
