'use strict';
// What the target project needs, per job title (roles.code), for the team assistant (spec §7).
const { matchesTaskRole, computeResidual } = require('./planning-distribution');
const { taskKey } = require('./topic-extract');
const { roleWindow, capWindow } = require('./team-load');

const lc = s => String(s || '').trim().toLowerCase();

// project: { id, name, startDate, endDate, tasks }; actuals: normalized target actuals;
// tags: [{ slug, listName, itemId, label }]; projectTopics: [{ id, name }];
// taskTopics: { [taskKey]: [{ id, name }] }; windowOverride: { from, to } | null (calendar Dates).
function buildRequirement({ project, actuals, tags, projectTopics, taskTopics, asOf, windowOverride }) {
  const byKey = new Map();
  for (const task of project.tasks || []) {
    if (task.completed) continue;
    for (const res of task.resources || []) {
      const code = String(res.role || '').trim();
      if (!code) continue;
      let r = byKey.get(lc(code));
      if (!r) {
        r = { code, tasks: [], taskRows: [], soldHours: 0, consumedHours: 0, topics: new Map() };
        for (const t of projectTopics || []) r.topics.set(t.id, t);
        byKey.set(lc(code), r);
      }
      if (!r.tasks.includes(task.name)) r.tasks.push(task.name);
      r.taskRows.push(task);
      r.soldHours += Number(res.soldHours) || 0;
      for (const a of actuals || []) if (matchesTaskRole(a, task.name, code)) r.consumedHours += a.hours;
      for (const t of (taskTopics || {})[taskKey(task.name)] || []) r.topics.set(t.id, t);
    }
  }
  const roles = [...byKey.values()].map(r => ({
    code: r.code,
    tasks: r.tasks,
    soldHours: r.soldHours,
    consumedHours: r.consumedHours,
    neededHours: computeResidual(r.soldHours, r.consumedHours),
    window: windowOverride ? capWindow(windowOverride) : roleWindow(r.taskRows, project, asOf),
    topics: [...r.topics.values()],
  }));
  return { projectId: project.id, name: project.name, tags: tags || [], roles };
}

module.exports = { buildRequirement };
