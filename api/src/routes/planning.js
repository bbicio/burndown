const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { parsePlanningRequest } = require('../lib/planning-request');
const { getCalendarWeeks } = require('../lib/planning-calendar');
const { uniqueOwnerNames, buildProjection } = require('../lib/planning-model');
const { resolveOwnerStatuses } = require('../lib/match-resource');
const { getPlanningData, visibleProjectIds } = require('../services/planning-data');

const router = express.Router();

// POST /api/planning/model — the calculation behind planning.html's three views (spec §14).
// Body: { view: 'role'|'project'|'owner', projectIds, teams?, from, to, asOf, pulse }.
// Unknown or not-visible project ids are ignored silently (no information leak).
router.post('/model', requireAuth, async (req, res, next) => {
  try {
    const parsed = parsePlanningRequest(req.body);
    if (!parsed.ok) return res.status(400).json({ error: 'Invalid request', fields: parsed.errors });
    const { view, projectIds, teams, from, to, asOf, pulse } = parsed.value;

    const [data, visible] = await Promise.all([getPlanningData(), visibleProjectIds(req.user)]);
    const projects = projectIds
      .filter(id => data.projects.has(id) && (!visible || visible.has(id)))
      .map(id => data.projects.get(id));

    const weeks = getCalendarWeeks(from, to, asOf);
    const ownerStatus = resolveOwnerStatuses(uniqueOwnerNames(projects, data.actuals), data.resources, data.aliases);
    const projection = buildProjection(view, {
      projects, actuals: data.actuals, weeks, today: asOf, pulse, teams: new Set(teams), ownerStatus,
    });
    res.json({ view, ownerStatus, ...projection });
  } catch (err) { next(err); }
});

module.exports = router;
