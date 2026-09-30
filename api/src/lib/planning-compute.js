'use strict';
// The calculation behind POST /api/planning/model, as a pure function so the route and the team
// assistant (Cycle B) share ONE implementation (spec 2026-09-29-planning-team-assistant §6).
// data: getPlanningData() result; visible: Set<projectId> | null (no restriction);
// req: parsePlanningRequest(body).value (from/to/asOf are calendar Dates).
const { getCalendarWeeks } = require('./planning-calendar');
const { uniqueOwnerNames, buildProjection } = require('./planning-model');
const { resolveOwnerStatuses } = require('./match-resource');

function computePlanningModel(data, visible, req) {
  const { view, projectIds, teams, from, to, asOf, pulse } = req;
  const projects = projectIds
    .filter(id => data.projects.has(id) && (!visible || visible.has(id)))
    .map(id => data.projects.get(id));
  const weeks = getCalendarWeeks(from, to, asOf);
  const ownerStatus = resolveOwnerStatuses(uniqueOwnerNames(projects, data.actuals), data.resources, data.aliases);
  const projection = buildProjection(view, {
    projects, actuals: data.actuals, weeks, today: asOf, pulse, teams: new Set(teams), ownerStatus,
  });
  return { view, ownerStatus, ...projection };
}

module.exports = { computePlanningModel };
