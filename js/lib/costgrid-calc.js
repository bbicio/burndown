export function versionHasFreeTasks(ver) {
  const assignedIds = new Set();
  const assignedNames = new Set();
  (ver.linkedProjects || []).forEach(lp => {
    (lp.taskIds || []).forEach(id => assignedIds.add(id));
    (lp.taskNames || []).forEach(n => { if (n?.trim()) assignedNames.add(n.trim().toLowerCase()); });
  });
  return (ver.phases || []).flatMap(ph => ph.tasks || []).some(t =>
    t.taskName?.trim() && !assignedIds.has(t.taskId) && !assignedNames.has(t.taskName.trim().toLowerCase())
  );
}

export function isVersionCommittedLocked(ver) {
  return ver?.pipeline === 'Committed' && !versionHasFreeTasks(ver);
}

window.versionHasFreeTasks = versionHasFreeTasks;
window.isVersionCommittedLocked = isVersionCommittedLocked;
