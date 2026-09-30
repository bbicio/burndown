const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { parsePlanningRequest } = require('../lib/planning-request');
const { computePlanningModel } = require('../lib/planning-compute');
const { getPlanningData, visibleProjectIds } = require('../services/planning-data');

const router = express.Router();

// POST /api/planning/model — the calculation behind planning.html's three views (spec §14).
// Body: { view: 'role'|'project'|'owner', projectIds, teams?, from, to, asOf, pulse }.
// Unknown or not-visible project ids are ignored silently (no information leak).
router.post('/model', requireAuth, async (req, res, next) => {
  try {
    const parsed = parsePlanningRequest(req.body);
    if (!parsed.ok) return res.status(400).json({ error: 'Invalid request', fields: parsed.errors });
    const [data, visible] = await Promise.all([getPlanningData(), visibleProjectIds(req.user)]);
    res.json(computePlanningModel(data, visible, parsed.value));
  } catch (err) { next(err); }
});

module.exports = router;
