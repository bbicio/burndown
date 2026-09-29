const express = require('express');
const { query, pool } = require('../db/client');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { loadVocabulary } = require('../services/topic-extraction');
const { cleanTopicName, normalizeTopicName, topicNameError } = require('../lib/topic-extract');

const router = express.Router();
router.use(requireAuth, requireAdmin);

const STATUSES = ['approved', 'proposed', 'rejected'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLS = 'id, name, status, merged_into, created_at, updated_at';

async function getTopic(id, q = query) {
  if (!UUID_RE.test(String(id))) return null;
  const { rows } = await q(`SELECT ${COLS} FROM topics WHERE id = $1`, [id]);
  return rows[0] || null;
}

// GET /api/topics?status=  — live (non-merged) topics with how many descriptions use each
router.get('/', async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status) : null;
    if (status && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status filter' });
    const { rows } = await query(
      `SELECT t.id, t.name, t.status, t.created_at, t.updated_at,
              (SELECT COUNT(*) FROM description_topic_links l WHERE l.topic_id = t.id)::int AS usage_count
       FROM topics t
       WHERE t.merged_into IS NULL AND ($1::text IS NULL OR t.status = $1)
       ORDER BY lower(t.name)`,
      [status]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/topics { name } — an admin seeds an approved topic
router.post('/', async (req, res, next) => {
  try {
    const vocab = await loadVocabulary();
    const bad = topicNameError(req.body?.name, vocab);
    if (bad) return res.status(400).json({ error: bad });
    const name = cleanTopicName(req.body.name);
    const norm = normalizeTopicName(name);
    if (vocab.topicsByNorm.has(norm)) return res.status(409).json({ error: 'A topic with this name already exists.' });
    const { rows } = await query(
      `INSERT INTO topics (name, name_normalized, status, created_by, updated_by)
       VALUES ($1, $2, 'approved', $3, $3) ON CONFLICT (name_normalized) DO NOTHING
       RETURNING ${COLS}`,
      [name, norm, req.user.id]
    );
    if (!rows[0]) return res.status(409).json({ error: 'A topic with this name already exists.' });
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/topics/:id { name } — rename
router.patch('/:id', async (req, res, next) => {
  try {
    const t = await getTopic(req.params.id);
    if (!t) return res.status(404).json({ error: 'Topic not found' });
    if (t.merged_into) return res.status(409).json({ error: 'This topic was merged into another one.' });
    const vocab = await loadVocabulary();
    const bad = topicNameError(req.body?.name, vocab);
    if (bad) return res.status(400).json({ error: bad });
    const name = cleanTopicName(req.body.name);
    const norm = normalizeTopicName(name);
    const dup = vocab.topicsByNorm.get(norm);
    if (dup && dup.id !== t.id) {
      return res.status(409).json({ error: 'A topic with this name already exists — use merge instead.' });
    }
    const { rows } = await query(
      `UPDATE topics SET name = $2, name_normalized = $3, updated_by = $4, updated_at = now()
       WHERE id = $1 AND merged_into IS NULL RETURNING ${COLS}`,
      [t.id, name, norm, req.user.id]
    );
    if (!rows[0]) return res.status(409).json({ error: 'This topic was merged into another one.' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A topic with this name already exists — use merge instead.' });
    next(err);
  }
});

// approve (proposed → approved), reject (proposed|approved → rejected), restore (rejected → approved)
const TRANSITIONS = {
  approve: { from: ['proposed'], to: 'approved' },
  reject: { from: ['proposed', 'approved'], to: 'rejected' },
  restore: { from: ['rejected'], to: 'approved' },
};
for (const [action, rule] of Object.entries(TRANSITIONS)) {
  router.post(`/:id/${action}`, async (req, res, next) => {
    try {
      const t = await getTopic(req.params.id);
      if (!t) return res.status(404).json({ error: 'Topic not found' });
      if (t.merged_into) return res.status(409).json({ error: 'This topic was merged into another one.' });
      if (!rule.from.includes(t.status)) {
        return res.status(409).json({ error: `A ${t.status} topic cannot be moved to ${rule.to}.` });
      }
      const { rows } = await query(
        `UPDATE topics SET status = $2, updated_by = $3, updated_at = now() WHERE id = $1 AND merged_into IS NULL RETURNING ${COLS}`,
        [t.id, rule.to, req.user.id]
      );
      if (!rows[0]) return res.status(409).json({ error: 'This topic was merged into another one.' });
      res.json(rows[0]);
    } catch (err) { next(err); }
  });
}

// POST /api/topics/:id/merge { targetId } — absorb :id into targetId
router.post('/:id/merge', async (req, res, next) => {
  if (!UUID_RE.test(String(req.params.id))) return res.status(404).json({ error: 'Topic not found' });
  if (!UUID_RE.test(String(req.body?.targetId ?? ''))) return res.status(400).json({ error: 'targetId is required' });
  const srcId = String(req.params.id).toLowerCase();
  const targetId = String(req.body.targetId).toLowerCase();
  if (targetId === srcId) return res.status(400).json({ error: 'A topic cannot be merged into itself' });
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    // lock both rows in a fixed order so two concurrent merges cannot deadlock
    const ids = [srcId, targetId].sort();
    await client.query('SELECT id FROM topics WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [ids]);
    const source = await getTopic(srcId, client.query.bind(client));
    const target = await getTopic(targetId, client.query.bind(client));
    if (!source || !target) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Topic not found' }); }
    if (source.id === target.id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'A topic cannot be merged into itself' });
    }
    if (source.merged_into || target.merged_into) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'A merged topic cannot take part in a merge.' });
    }
    if (target.status === 'rejected') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Cannot merge into a rejected topic — restore it first.' });
    }
    await client.query(
      `INSERT INTO description_topic_links (project_id, task_key, topic_id)
       SELECT project_id, task_key, $2 FROM description_topic_links WHERE topic_id = $1
       ON CONFLICT DO NOTHING`, [source.id, target.id]);
    await client.query('DELETE FROM description_topic_links WHERE topic_id = $1', [source.id]);
    await client.query('UPDATE topics SET merged_into = $2, updated_by = $3, updated_at = now() WHERE id = $1',
      [source.id, target.id, req.user.id]);
    await client.query('UPDATE topics SET merged_into = $2 WHERE merged_into = $1', [source.id, target.id]);
    await client.query('COMMIT');
    res.json({ ok: true, targetId: target.id });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
