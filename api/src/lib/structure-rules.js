// Integrity rule for a version's structure save: a task linked to a project (cg_version_projects.task_ids)
// cannot disappear from the version. Pure function, no I/O; the caller reads the links and the tasks.

// Carried in the body of the 400 this rule produces, so a client can tell it from other errors.
const STRUCTURE_RULE_CODE = 'STRUCTURE_RULE';

const key = id => String(id).toLowerCase();

const nameKey = s => String(s || '').trim().toLowerCase();

// The tasks of currentTasks ({ id, title }) that are linked and absent from the payload.
// A task is linked by its id (linkedTaskIds) or by its title (linkedTaskNames, for a link made by name only).
// An id-linked task is kept only by its id; a name-only linked task is kept by its id or by a task with its title.
// A linked id that matches no current task (an orphan) is ignored.
function missingLinkedTasks({ linkedTaskIds, linkedTaskNames = [], currentTasks, payloadTaskIds, payloadTaskNames = [] }) {
  const linked = new Set(linkedTaskIds.map(key));
  const linkedNames = new Set(linkedTaskNames.map(nameKey));
  const kept = new Set(payloadTaskIds.map(key));
  const keptNames = new Set(payloadTaskNames.map(nameKey));
  // A task linked by id must keep its id; only a task linked by name alone may also be kept by its title.
  return currentTasks.filter(t => {
    if (linked.has(key(t.id))) return !kept.has(key(t.id));
    return linkedNames.has(nameKey(t.title)) && !kept.has(key(t.id)) && !keptNames.has(nameKey(t.title));
  });
}

// The title a task is saved with: trimmed, 'New Task' when blank. Every place that compares a payload task
// with a saved one (the unchanged-task match, the linked-by-name check) uses this, so both sides agree.
function taskTitle(tk) {
  return (tk?.taskName || tk?.title || '').trim() || 'New Task';
}

module.exports = { missingLinkedTasks, taskTitle, STRUCTURE_RULE_CODE };
