// Resolves the hourly rate for a (taskName, role) pair against a project's task list.
// Mirrors js/core.js's findRate() so a snapshotted `fee` matches what the frontend
// would compute live from the same project configuration. Never throws, never
// returns null — an unresolved rate is 0, matching the "no data" display convention
// used for Fee/Spent throughout the Timesheets page.
function resolveFee(tasks, taskName, role) {
  const tName = (taskName || '').toLowerCase();
  const rName = (role || '').toLowerCase();
  for (const task of (tasks || [])) {
    if ((task.name || '').toLowerCase() !== tName) continue;
    const resources = task.resources || [];
    for (const res of resources) {
      if ((res.role || '').toLowerCase() === rName) return res.hourlyRate || 0;
    }
    if (resources.length) return resources[0].hourlyRate || 0;
  }
  return 0;
}

module.exports = { resolveFee };
