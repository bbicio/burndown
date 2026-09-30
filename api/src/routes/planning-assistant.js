const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { isoDate } = require('../lib/planning-calendar');
const { parseParams } = require('../lib/team-params');
const svc = require('../services/planning-assistant');

function makeRouter() {
  const router = express.Router();
  router.use(requireAuth, requireAdmin);

  // Shared request validation for /rank and /chat. Returns { error } (a ready 400 body) or { projectId, asOf }.
  function parseBase(body) {
    const fields = {};
    if (!body || typeof body !== 'object') return { error: { error: 'Invalid request', fields: { body: 'must be an object' } } };
    if (typeof body.projectId !== 'string' || !body.projectId || body.projectId.length > 64) fields.projectId = 'is required';
    if (!isoDate(body.asOf)) fields.asOf = 'must be a YYYY-MM-DD date';
    return Object.keys(fields).length ? { error: { error: 'Invalid request', fields } } : { projectId: body.projectId, asOf: body.asOf.slice(0, 10) };
  }

  function sendError(res, next, err) {
    if (err && err.status) return res.status(err.status).json({ error: err.message, ...(err.fields ? { fields: err.fields } : {}) });
    if (err && err.code === '22P02') return res.status(404).json({ error: 'Project not found' });   // malformed UUID
    return next(err);
  }

  // POST /api/planning-assistant/rank — { projectId, asOf, params } → { requirement, tables, params }
  router.post('/rank', async (req, res, next) => {
    try {
      const base = parseBase(req.body);
      if (base.error) return res.status(400).json(base.error);
      const p = parseParams(req.body.params);
      if (!p.ok) return res.status(400).json({ error: 'Invalid request', fields: p.errors });
      const ctx = await svc.prepare({ projectId: base.projectId });
      res.json(svc.rank(ctx, { params: p.value, asOf: base.asOf }));
    } catch (err) { sendError(res, next, err); }
  });

  return router;
}

module.exports = makeRouter();
module.exports.makeRouter = makeRouter;
