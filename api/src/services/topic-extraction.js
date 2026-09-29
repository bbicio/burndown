// DB-bound half of the topic-extraction feature. Pure logic lives in ../lib/topic-extract.js.
// Called by the profile engine right BEFORE a project code is processed, never inside a request
// and never inside the per-code transaction (no row lock is held during the LLM call).
const { pool, query } = require('../db/client');
const {
  buildVocabulary, buildItems, buildPrompt, parseExtraction, resolveCandidates, hashText, isExtractable,
  normalizeTopicName, finalTopic, chunk,
} = require('../lib/topic-extract');

const LLM_TIMEOUT_MS = 30000;
const BATCH_SIZE = 10;

async function loadVocabulary(q = query) {
  const [topics, lists] = await Promise.all([
    q('SELECT id, name, name_normalized, status, merged_into FROM topics'),
    q(`SELECT al.name AS list_name, ali.label
       FROM attribute_lists al
       LEFT JOIN attribute_list_items ali ON ali.list_id = al.id AND ali.status = 'active'`),
  ]);
  return buildVocabulary(topics.rows, lists.rows);
}

async function isExtractionEnabled() {
  const { rows } = await query("SELECT value FROM app_settings WHERE key = 'topic_extraction_enabled'");
  return !rows[0] || rows[0].value !== 'false';
}

// One Messages API call. Error messages never include the response body (it may echo project text).
async function callAnthropic({ system, user }) {
  const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '');
  const res = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      system,
      messages: [{ role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`LLM request failed (HTTP ${res.status})`);
  let data;
  try { data = await res.json(); } catch { throw new Error('LLM answer is not JSON'); }
  if (data.stop_reason === 'max_tokens') throw new Error('LLM answer truncated');
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  if (!text) throw new Error('LLM answer was empty');
  return text;
}

async function markFailed(projectId, items, message) {
  const msg = String(message || 'extraction failed').slice(0, 500);
  for (const it of items) {
    await query(
      `INSERT INTO description_topic_state (project_id, task_key, last_error) VALUES ($1, $2, $3)
       ON CONFLICT (project_id, task_key) DO UPDATE SET last_error = EXCLUDED.last_error`,
      [projectId, it.key, msg]
    ).catch(err => console.warn('[topics] markFailed:', err.message));
  }
}

// Extract topics for the OLDEST project that owns `code` (same rule as the profile engine).
async function extractForCode(code) {
  if (!(await isExtractionEnabled())) return { status: 'skipped', reason: 'disabled' };
  if (!process.env.ANTHROPIC_API_KEY) return { status: 'skipped', reason: 'no-key' };

  const proj = await query(
    'SELECT id, description FROM projects WHERE code = $1 ORDER BY created_at, id LIMIT 1', [code]);
  if (!proj.rows[0]) return { status: 'skipped', reason: 'no-project' };
  const projectId = proj.rows[0].id;
  const taskRows = (await query('SELECT name, description FROM project_tasks WHERE project_id = $1', [projectId])).rows;
  const items = buildItems(proj.rows[0].description, taskRows);
  const stateRows = (await query(
    'SELECT task_key, text_hash, last_error FROM description_topic_state WHERE project_id = $1', [projectId]
  )).rows;
  const state = new Map(stateRows.map(r => [r.task_key, r.text_hash]));
  const staleErrorKeys = stateRows.filter(r => r.last_error).map(r => r.task_key);

  const keys = new Set(items.map(i => i.key));
  const gone = [...state.keys()].filter(k => !keys.has(k));
  const todo = [];              // extractable and changed → LLM
  const unchangedWithError = [];  // hash unchanged but a stale last_error remains → clear it
  const cleared = [];           // changed but too short/empty → drop links, remember the hash
  for (const it of items) {
    const h = hashText(it.text);
    if (state.get(it.key) === h) {
      if (staleErrorKeys.includes(it.key)) unchangedWithError.push(it.key);
      continue;
    }
    if (!state.has(it.key) && !it.text) continue;       // never had text, still none
    it.hash = h;
    (isExtractable(it.text) ? todo : cleared).push(it);
  }

  if (unchangedWithError.length) {
    await query('UPDATE description_topic_state SET last_error = NULL WHERE project_id = $1 AND task_key = ANY($2::text[])',
      [projectId, unchangedWithError]);
  }
  for (const k of gone) {
    await query('DELETE FROM description_topic_links WHERE project_id = $1 AND task_key = $2', [projectId, k]);
    await query('DELETE FROM description_topic_state WHERE project_id = $1 AND task_key = $2', [projectId, k]);
  }
  for (const it of cleared) {
    await query('DELETE FROM description_topic_links WHERE project_id = $1 AND task_key = $2', [projectId, it.key]);
    await query(
      `INSERT INTO description_topic_state (project_id, task_key, text_hash, extracted_at, last_error)
       VALUES ($1, $2, $3, now(), NULL)
       ON CONFLICT (project_id, task_key) DO UPDATE SET text_hash = EXCLUDED.text_hash, extracted_at = now(), last_error = NULL`,
      [projectId, it.key, it.hash]
    );
  }
  if (!todo.length) return { status: 'done', extracted: 0 };

  let candidatesByRef;
  try {
    candidatesByRef = new Map();
    for (const batch of chunk(todo, BATCH_SIZE)) {
      const vocab = await loadVocabulary();
      const { system, user } = buildPrompt({ items: batch, vocab });
      const raw = await callAnthropic({ system, user });
      for (const [ref, cands] of parseExtraction(raw, new Set(batch.map(i => i.ref)))) candidatesByRef.set(ref, cands);
    }
  } catch (err) {
    await markFailed(projectId, todo, err.name === 'TimeoutError' ? 'LLM request timed out' : err.message);
    return { status: 'error', error: err.message };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const q = client.query.bind(client);
    let vocab = await loadVocabulary(q);
    const resolved = new Map(todo.map(it => [it.ref, resolveCandidates(candidatesByRef.get(it.ref) || [], vocab)]));
    const newNames = new Map();                          // normalised → display name
    for (const list of resolved.values()) for (const r of list) if (r.newName) newNames.set(normalizeTopicName(r.newName), r.newName);
    for (const [norm, name] of newNames) {
      await q(`INSERT INTO topics (name, name_normalized, status) VALUES ($1, $2, 'proposed')
               ON CONFLICT (name_normalized) DO NOTHING`, [name, norm]);
    }
    if (newNames.size) vocab = await loadVocabulary(q);
    for (const it of todo) {
      const ids = new Set();
      for (const r of resolved.get(it.ref)) {
        const target = r.topicId
          ? finalTopic(r.topicId, vocab.topicsById)
          : finalTopic(vocab.topicsByNorm.get(normalizeTopicName(r.newName))?.id, vocab.topicsById);
        if (target && target.status !== 'rejected') ids.add(target.id);
      }
      await q('DELETE FROM description_topic_links WHERE project_id = $1 AND task_key = $2', [projectId, it.key]);
      if (ids.size) {
        await q(`INSERT INTO description_topic_links (project_id, task_key, topic_id)
                 SELECT $1, $2, x FROM unnest($3::uuid[]) x ON CONFLICT DO NOTHING`, [projectId, it.key, [...ids]]);
      }
      await q(
        `INSERT INTO description_topic_state (project_id, task_key, text_hash, extracted_at, last_error)
         VALUES ($1, $2, $3, now(), NULL)
         ON CONFLICT (project_id, task_key) DO UPDATE SET text_hash = EXCLUDED.text_hash, extracted_at = now(), last_error = NULL`,
        [projectId, it.key, it.hash]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    await markFailed(projectId, todo, err.message);
    return { status: 'error', error: err.message };
  } finally {
    client.release();
  }
  return { status: 'done', extracted: todo.length };
}

module.exports = { loadVocabulary, isExtractionEnabled, callAnthropic, extractForCode };
