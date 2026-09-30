const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { isoDate } = require('../lib/planning-calendar');
const { parseParams } = require('../lib/team-params');
const { SYSTEM_PROMPT, TOOLS, buildContextBlock, compactRankResult, runChat, normalizeMessages } = require('../lib/assistant-chat');
const svc = require('../services/planning-assistant');

const CHAT_DEADLINE_MS = 80_000;   // whole /chat request; each LLM call also keeps its own 30 s timeout

function makeRouter(deps = {}) {
  const llm = deps.llm || require('../services/llm');
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

  // POST /api/planning-assistant/chat — { projectId, asOf, messages, params } → { reply, params, tables, requirement }
  router.post('/chat', async (req, res, next) => {
    try {
      const base = parseBase(req.body);
      if (base.error) return res.status(400).json(base.error);
      const p = parseParams(req.body.params);
      if (!p.ok) return res.status(400).json({ error: 'Invalid request', fields: p.errors });
      const norm = normalizeMessages(req.body.messages);
      if (!norm.messages) return res.status(400).json({ error: 'Invalid request', fields: { messages: norm.error } });
      const msgs = norm.messages;
      if (!llm.isConfigured()) return res.status(503).json({ error: 'Assistant unavailable' });

      const ctx = await svc.prepare({ projectId: base.projectId });
      const summary = svc.summarize(svc.describe(ctx, { params: p.value, asOf: base.asOf }).requirement);

      let params = p.value;
      let lastRank = null;
      const fallback = () => ({
        reply: 'The assistant could not finish, but the team tables below are up to date.',
        params, tables: lastRank.tables, requirement: lastRank.requirement,
      });
      const runTool = async (name, input) => {
        if (name === 'rank_team') {
          // Constraints persist across turns because the system prompt tells the model to repeat all of them on every call.
          const parsed = parseParams(input);
          if (!parsed.ok) return { content: JSON.stringify({ error: 'Invalid parameters', fields: parsed.errors }) };
          try {
            lastRank = svc.rank(ctx, { params: parsed.value, asOf: base.asOf });
            params = parsed.value;
            return { content: JSON.stringify(compactRankResult(lastRank)) };
          } catch (err) {
            if (err && err.status === 400) return { content: JSON.stringify({ error: err.message, fields: err.fields }) };
            throw err;
          }
        }
        if (name === 'explain_resource') {
          if (typeof input.name !== 'string' || typeof input.role !== 'string') return { content: JSON.stringify({ error: 'name and role are required' }) };
          return { content: JSON.stringify(svc.explain(ctx, { name: input.name, role: input.role, params, asOf: base.asOf })) };
        }
        return { content: JSON.stringify({ error: `Unknown tool ${name}` }) };
      };

      const system = `${SYSTEM_PROMPT}\n\n${buildContextBlock(summary, p.value)}`;
      let reply;
      try {
        ({ reply } = await runChat({ llm, system, history: msgs, tools: TOOLS, runTool, signal: AbortSignal.timeout(CHAT_DEADLINE_MS) }));
      } catch (err) {
        // A ranking already computed is still valid: keep the tables even though the model failed afterwards.
        if (lastRank && err && (err.code === 'LLM_ERROR' || err.code === 'LLM_NOT_CONFIGURED')) return res.json(fallback());
        throw err;
      }
      res.json({
        reply: reply || 'I could not produce an answer. Please rephrase or use "Calculate team".',
        params, tables: lastRank ? lastRank.tables : null, requirement: lastRank ? lastRank.requirement : summary,
      });
    } catch (err) {
      if (err && (err.code === 'LLM_ERROR' || err.code === 'LLM_NOT_CONFIGURED')) return res.status(503).json({ error: 'Assistant unavailable' });
      sendError(res, next, err);
    }
  });

  return router;
}

module.exports = makeRouter();
module.exports.makeRouter = makeRouter;
