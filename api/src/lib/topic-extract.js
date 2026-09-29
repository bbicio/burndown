// Pure helpers for the topic-extraction feature (profile descriptions cycle). No DB, no network.
'use strict';
const crypto = require('crypto');

const MIN_TEXT_CHARS = 20;          // shorter texts are never sent to the LLM
const MAX_TOPICS_PER_TEXT = 5;      // a ceiling, never a target
const MAX_TOPIC_WORDS = 4;
const MAX_TOPIC_CHARS = 60;
const PROJECT_REF = 'project';

// Key used for name matching and uniqueness: ascii, lowercase, single spaces.
function normalizeTopicName(name) {
  return String(name ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function cleanTopicName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ');
}

// Identical to normalizeTask().key in resource-profile.js (actuals task keys): trim, collapse, lowercase.
function taskKey(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function hashText(text) {
  return crypto.createHash('sha256').update(String(text ?? '').trim()).digest('hex');
}

function isExtractable(text) {
  return String(text ?? '').trim().length >= MIN_TEXT_CHARS;
}

// Order-independent fingerprint of a project's task names + descriptions, to detect "did anything change".
function descriptionsSignature(tasks) {
  return (tasks || [])
    .map(t => `${taskKey(t.name)}\u0000${String(t.description ?? '').trim()}`)
    .sort()
    .join('\u0001');
}

// The project text plus one item per distinct task (first non-empty description wins for duplicate names).
function buildItems(projectDescription, tasks) {
  const items = [{ ref: PROJECT_REF, key: '', kind: 'project', name: '', text: String(projectDescription ?? '').trim() }];
  const byKey = new Map();
  for (const t of tasks || []) {
    const key = taskKey(t.name);
    if (!key) continue;
    const text = String(t.description ?? '').trim();
    const cur = byKey.get(key);
    if (!cur) byKey.set(key, { ref: `task:${key}`, key, kind: 'task', name: cleanTopicName(t.name), text });
    else if (!cur.text && text) cur.text = text;
  }
  return items.concat([...byKey.values()]);
}

// topicRows: { id, name, name_normalized, status, merged_into }; listRows: { list_name, label|null }
function buildVocabulary(topicRows, listRows) {
  const topicsById = new Map();
  const topicsByNorm = new Map();
  for (const t of topicRows || []) {
    topicsById.set(t.id, t);
    topicsByNorm.set(t.name_normalized, t);
  }
  const listNorms = new Set();
  const listValues = [];
  for (const r of listRows || []) {
    const ln = normalizeTopicName(r.list_name);
    if (ln) listNorms.add(ln);
    if (r.label != null) {
      const n = normalizeTopicName(r.label);
      if (n) listNorms.add(n);
      listValues.push({ list: r.list_name, value: r.label });
    }
  }
  const live = [...topicsById.values()].filter(t => !t.merged_into);
  return {
    topicsById, topicsByNorm, listNorms, listValues,
    topicList: live.filter(t => t.status !== 'rejected').map(t => ({ id: t.id, name: t.name, status: t.status })),
    rejectedNames: live.filter(t => t.status === 'rejected').map(t => t.name),
  };
}

const SYSTEM_PROMPT = [
  "You extract skill topics from project and task descriptions for a consulting company's staffing profiles.",
  'A topic is a SPECIFIC COMPETENCE required to carry out the work (examples: "Medical writing", "Data visualization", "Video editing", "Clinical trial design"). One text may require several competences.',
  'Rules:',
  '1. Topic names are in English, 1 to 4 words, nominal form. Never include names of people, clients, brands or products.',
  '2. Return at most 5 topics per text - a ceiling, not a target. Return only competences the text explicitly supports; return an empty list for vague or content-free text. Never infer anything from a project name or client.',
  '3. Reuse first: if a competence means the same as an entry of existingTopics, return that entry\'s id in existingTopicId (and its name in name). Use a new name only when no existing topic covers the concept. Never return a name listed in rejectedTopics.',
  '4. Never return a market, brand, therapeutic area or service type. attributeListValues lists those values: if a candidate is semantically equivalent to any of them, set equivalentToListValue to true (it will be discarded).',
  '5. Do not return near-duplicates of each other for the same text.',
  'Answer with JSON only, no prose, exactly: {"results":[{"ref":"<ref of the text>","topics":[{"name":"...","existingTopicId":"<uuid or null>","equivalentToListValue":false}]}]}',
  'Include exactly one result per entry of "texts".',
].join('\n');

function buildPrompt({ items, vocab }) {
  const user = JSON.stringify({
    existingTopics: vocab.topicList.map(t => ({ id: t.id, name: t.name })),
    rejectedTopics: vocab.rejectedNames,
    attributeListValues: vocab.listValues,
    texts: items.map(i => ({ ref: i.ref, kind: i.kind, taskName: i.name, text: i.text })),
  });
  return { system: SYSTEM_PROMPT, user };
}

// Model answer → Map(ref → candidates). Throws when the answer is unusable as a whole.
function parseExtraction(raw, refs) {
  const s = String(raw ?? '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Model answer is not JSON');
  let data;
  try { data = JSON.parse(s.slice(start, end + 1)); } catch { throw new Error('Model answer is not valid JSON'); }
  if (!data || !Array.isArray(data.results)) throw new Error('Model answer has no results array');
  const out = new Map();
  for (const r of data.results) {
    if (!r || !refs.has(r.ref) || !Array.isArray(r.topics)) continue;
    const cands = [];
    for (const t of r.topics) {
      if (!t || typeof t.name !== 'string') continue;
      cands.push({
        name: t.name,
        existingTopicId: typeof t.existingTopicId === 'string' ? t.existingTopicId : null,
        equivalentToListValue: t.equivalentToListValue === true,
      });
    }
    out.set(r.ref, cands);
  }
  return out;
}

// The final (non-merged) topic a topic id resolves to, or null (unknown id / broken or looping chain).
function finalTopic(id, topicsById) {
  let t = topicsById.get(id);
  for (let i = 0; t && t.merged_into && i < 20; i++) t = topicsById.get(t.merged_into);
  return t && !t.merged_into ? t : null;
}

// Neutralise a model answer for ONE text. Returns [{ topicId } | { newName }], at most MAX_TOPICS_PER_TEXT.
function resolveCandidates(candidates, vocab) {
  const out = [];
  const seen = new Set();
  for (const c of candidates || []) {
    if (out.length >= MAX_TOPICS_PER_TEXT) break;
    if (!c || c.equivalentToListValue === true) continue;
    const name = cleanTopicName(c.name);
    const norm = normalizeTopicName(name);
    if (!norm || name.length > MAX_TOPIC_CHARS || name.split(' ').length > MAX_TOPIC_WORDS) continue;
    if (vocab.listNorms.has(norm)) continue;
    let target = null;
    if (c.existingTopicId && vocab.topicsById.has(c.existingTopicId)) {
      target = finalTopic(c.existingTopicId, vocab.topicsById);
    } else if (vocab.topicsByNorm.has(norm)) {
      target = finalTopic(vocab.topicsByNorm.get(norm).id, vocab.topicsById);
    }
    if (target) {
      if (target.status === 'rejected') continue;
      const key = `id:${target.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ topicId: target.id });
      continue;
    }
    if (vocab.topicsByNorm.has(norm)) continue;      // dead-end merge chain: never create a duplicate row
    const key = `new:${norm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ newName: name });
  }
  return out;
}

// resources.profile.topics ([{ topicId, projectCodes }]) → what the API returns: approved topics only.
function resolveProfileTopics(entries, topicsById) {
  const byId = new Map();
  for (const e of entries || []) {
    const t = finalTopic(e.topicId, topicsById);
    if (!t || t.status !== 'approved') continue;
    let cur = byId.get(t.id);
    if (!cur) { cur = { id: t.id, name: t.name, projectCodes: new Set() }; byId.set(t.id, cur); }
    for (const c of e.projectCodes || []) cur.projectCodes.add(c);
  }
  return [...byId.values()]
    .map(x => ({ id: x.id, name: x.name, projectCodes: [...x.projectCodes].sort() }))
    .sort((a, b) => b.projectCodes.length - a.projectCodes.length || a.name.localeCompare(b.name));
}

// Validation for names typed by an admin (create / rename). null = fine.
function topicNameError(name, vocab) {
  const clean = cleanTopicName(name);
  const norm = normalizeTopicName(clean);
  if (!norm) return 'name is required';
  if (clean.length > MAX_TOPIC_CHARS) return `name must be at most ${MAX_TOPIC_CHARS} characters`;
  if (clean.split(' ').length > MAX_TOPIC_WORDS) return `name must be 1 to ${MAX_TOPIC_WORDS} words`;
  if (vocab.listNorms.has(norm)) return 'This name matches an attribute-list value and cannot be used as a topic.';
  return null;
}

// Split an array into consecutive chunks of at most `size` items (size <= 0 or invalid: one chunk).
function chunk(array, size) {
  if (!array.length) return [];
  if (!(size > 0)) return [array.slice()];
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

module.exports = {
  chunk,
  MIN_TEXT_CHARS, MAX_TOPICS_PER_TEXT, MAX_TOPIC_WORDS, MAX_TOPIC_CHARS, PROJECT_REF,
  normalizeTopicName, cleanTopicName, taskKey, hashText, isExtractable, descriptionsSignature, buildItems,
  buildVocabulary, buildPrompt, parseExtraction, finalTopic, resolveCandidates, resolveProfileTopics, topicNameError,
};
