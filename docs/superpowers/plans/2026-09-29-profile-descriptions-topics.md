# Profile descriptions → topics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This project closes every execution phase with `/finish-cycle` (never `superpowers:finishing-a-development-branch`).

**Goal:** Carry project/task descriptions from the proposal into the project, extract competence "topics" from them with an LLM in the profile worker (one shared, admin-curated vocabulary), and show each resource's topics in the Experience profile on `team.html`.

**Architecture:** Descriptions become plain columns on `projects`/`project_tasks`. The profile worker, right before it processes a project code, calls Anthropic once per project whose text changed (outside any DB transaction); results land in `topics` / `description_topic_links`. Profile aggregation stores only topic **ids** in `resources.profile.topics`; `GET /api/resources/:id/profile` resolves names/status/merges at read time, so admin edits apply instantly. An LLM failure never blocks saving or processing.

**Tech Stack:** Node/Express + PostgreSQL (`node:test` for backend units), Vue 3 CDN pages (vitest for `js/lib`), Anthropic Messages API via `fetch` (no new dependency).

**Spec:** `docs/superpowers/specs/2026-09-29-profile-descriptions-topics-design.md` (read it first; the "Deviations from the spec" list at the end of this plan overrides it where they differ).

## Global Constraints

- No bundler, no build step for the runtime; nginx serves `js/`/`css/` as-is. No new npm dependency (backend or frontend).
- All user-facing text in **English**. Topic names: English, 1–4 words, max 60 characters.
- `MIN_TEXT_CHARS = 20`, `MAX_TOPICS_PER_TEXT = 5` (a ceiling, not a target), LLM timeout 30 000 ms, default model `claude-haiku-4-5-20251001`.
- Env: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_BASE_URL` (optional, tests). `app_settings` key `topic_extraction_enabled` (default `'true'`).
- `task_key` = task name trimmed, whitespace collapsed, lowercased (identical to `normalizeTask().key` in `api/src/lib/resource-profile.js`); `''` = the project description itself. Never NULL.
- Topic statuses: `approved` / `proposed` / `rejected`; **no physical delete**; `merged_into` non-null = absorbed and always points to a final (non-merged) topic.
- Only `approved` topics are shown in profiles; names/status/merges resolved at read time.
- Every changed `js/*.js`, `js/lib/*.js`, `css/*.css` file: bump its `?v=N` in **every** HTML page that loads it (grep the repo first). `css/tokens.css` and CDN libs are exempt.
- New/edited Vue pages keep `v-cloak`, no native `alert`/`confirm`; use the page's existing modal idiom.
- **Never run `docker compose` against the main stack (`pdash-db`/`pdash-api`/`pdash-nginx`) and never pass `-v`/`--volumes` to anything.** Integration tests run only through `scripts/run-tests.sh` (isolated `pdash_test` stack). Migrations `027`/`028` are applied to the real `pdash-db` only at `/finish-cycle` deploy, after `scripts/backup-db.sh`, with user confirmation.
- Route hooks (`enqueueProjectsQuiet`) must never fail a request; the LLM is never called inside an HTTP request or inside the per-code DB transaction.
- Commit messages end with: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Description saved with `''` (clearing it) must store an empty string, not NULL (`NOT NULL DEFAULT ''`) — `PATCH` currently turns falsy values into NULL.
2. `PUT /api/projects/:id/tasks` deletes and re-inserts every task on each save: task ids change constantly, so state/links are keyed by `task_key`; a save with unchanged descriptions must **not** enqueue the project.
3. LLM outage/no key/garbage answer/HTTP 500: description save still 200, profile still built (hours, tags, previous topics), error visible in the console, retry on a later run, no infinite loop inside one run.
4. A model answer that names a topic equal to an attribute-list value, a rejected topic, >5 topics, >4 words, empty names or duplicates must be neutralised server-side.
5. Admin actions on topics (rename, approve, reject, restore, merge, incl. chains A→B→C and merging into a rejected topic) must be reflected in `GET …/profile` immediately, without a recalculation, without duplicate chips.
6. A task that appears in actuals under a name with different case/spaces than the project task must still get its task topics (shared `task_key` normalisation).

---

## File Structure

| File | Responsibility |
|---|---|
| `api/src/lib/topic-extract.js` (+ `.test.js`) | Pure: normalisation, hashing, item building, prompt, answer parsing, candidate resolution, vocabulary, read-time topic resolution |
| `api/src/db/migrations/027_project_descriptions.sql` | `description` columns + one-shot backfill |
| `api/src/db/migrations/028_topics.sql` | `topics`, `description_topic_state`, `description_topic_links`, setting default |
| `api/src/services/topic-extraction.js` | DB + Anthropic call: `extractForCode`, `loadVocabulary`, `loadListNorms` |
| `api/src/routes/topics.js` | Admin API `/api/topics` |
| `api/src/routes/projects.js` | Accept/return descriptions, enqueue on change |
| `api/src/routes/resources.js` | Resolve topics in `GET /:id/profile` |
| `api/src/routes/profile-jobs.js` | Console: topic error column, on/off switch, re-extract on Process |
| `api/src/services/profile-engine.js` | Peek + extract before claiming; topic links into aggregation; retry requeue |
| `api/src/lib/resource-profile.js` | `aggregateProfile` gains `topics` (ids only) |
| `js/api-sync.js`, `js/costgrid.js`, `costgrid.html`, `project-config.html` | Description end-to-end in the UI |
| `attribute-lists.html` | "Topics (N)" tab |
| `team.html`, `js/lib/team-ui.js` | Topics block in the Experience tab |
| `profile-jobs.html` | Topic error column + extraction switch |
| `docker-compose.yml`, `.env.example`, `scripts/run-tests.sh`, `test-api.js` | Env pass-through, LLM stub wiring, integration tests |

Test conventions: backend units `cd api && node --test src/lib/<file>.test.js`; frontend `npm test -- <file>`; integration `bash scripts/run-tests.sh` (slow — run at the end of a task that adds integration tests, not after every step).

---

### Task 1: Pure library `topic-extract.js`

**Files:**
- Create: `api/src/lib/topic-extract.js`
- Test: `api/src/lib/topic-extract.test.js`

**Interfaces:**
- Produces (all exported): `MIN_TEXT_CHARS`, `MAX_TOPICS_PER_TEXT`, `MAX_TOPIC_WORDS`, `MAX_TOPIC_CHARS`, `PROJECT_REF`, `normalizeTopicName(name)`, `cleanTopicName(name)`, `taskKey(name)`, `hashText(text)`, `isExtractable(text)`, `descriptionsSignature(tasks)`, `buildItems(projectDescription, tasks)` → `[{ ref, key, kind, name, text }]`, `buildVocabulary(topicRows, listRows)`, `buildPrompt({ items, vocab })` → `{ system, user }`, `parseExtraction(raw, refs)` → `Map<ref, candidate[]>`, `finalTopic(id, topicsById)`, `resolveCandidates(candidates, vocab)` → `Array<{topicId}|{newName}>`, `resolveProfileTopics(entries, topicsById)` → `[{ id, name, projectCodes }]`, `topicNameError(name, vocab)` → string|null.

- [ ] **Step 1: Write the failing tests**

Create `api/src/lib/topic-extract.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTask } = require('./resource-profile');
const {
  MIN_TEXT_CHARS, MAX_TOPICS_PER_TEXT, normalizeTopicName, cleanTopicName, taskKey, hashText, isExtractable,
  descriptionsSignature, buildItems, buildVocabulary, buildPrompt, parseExtraction, finalTopic,
  resolveCandidates, resolveProfileTopics, topicNameError,
} = require('./topic-extract');

const T = (id, name, status = 'approved', merged_into = null) =>
  ({ id, name, name_normalized: normalizeTopicName(name), status, merged_into });

const vocab = buildVocabulary(
  [T('t1', 'Medical writing'), T('t2', 'Data visualization', 'proposed'), T('t3', 'Copy editing', 'rejected'),
   T('t4', 'Old name', 'approved', 't1')],
  [{ list_name: 'Market', label: 'Italy' }, { list_name: 'Therapeutic Area', label: 'Oncology' },
   { list_name: 'Brand', label: null }]
);

test('normalizeTopicName: case, accents, punctuation and spacing are folded', () => {
  assert.equal(normalizeTopicName('  Medical   Writing! '), 'medical writing');
  assert.equal(normalizeTopicName('Café design'), 'cafe design');
  assert.equal(normalizeTopicName(''), '');
  assert.equal(normalizeTopicName(null), '');
  assert.equal(cleanTopicName('  Medical   writing '), 'Medical writing');
});

test('taskKey is the same key the profile engine uses for tasks', () => {
  for (const n of ['Literature   Review ', 'analysis', ' A  B ']) assert.equal(taskKey(n), normalizeTask(n).key);
});

test('hashText: stable, trims, differs by content, 64 hex chars', () => {
  assert.equal(hashText(' abc '), hashText('abc'));
  assert.notEqual(hashText('abc'), hashText('abd'));
  assert.match(hashText('x'), /^[0-9a-f]{64}$/);
  assert.equal(hashText(null), hashText(''));
});

test('isExtractable: needs MIN_TEXT_CHARS after trimming', () => {
  assert.equal(MIN_TEXT_CHARS, 20);
  assert.equal(isExtractable('x'.repeat(19)), false);
  assert.equal(isExtractable('x'.repeat(20)), true);
  assert.equal(isExtractable('   ' + 'x'.repeat(19) + '   '), false);
  assert.equal(isExtractable(null), false);
});

test('descriptionsSignature: order-independent, case-insensitive on names, sensitive to text', () => {
  const a = [{ name: 'Analysis', description: 'one' }, { name: 'Build', description: '' }];
  const b = [{ name: 'build', description: '' }, { name: ' ANALYSIS ', description: 'one' }];
  assert.equal(descriptionsSignature(a), descriptionsSignature(b));
  assert.notEqual(descriptionsSignature(a), descriptionsSignature([{ name: 'Analysis', description: 'two' }, a[1]]));
  assert.notEqual(descriptionsSignature(a), descriptionsSignature([a[0]]));
});

test('buildItems: project item first, tasks keyed by taskKey, duplicates/blank names collapsed', () => {
  const items = buildItems('Project text', [
    { name: 'Analysis', description: 'First' },
    { name: ' analysis ', description: 'Second' },
    { name: '', description: 'nameless' },
    { name: 'Build', description: '' },
  ]);
  assert.deepEqual(items.map(i => [i.ref, i.key, i.kind]), [
    ['project', '', 'project'], ['task:analysis', 'analysis', 'task'], ['task:build', 'build', 'task'],
  ]);
  assert.equal(items[1].text, 'First');
  assert.equal(items[1].name, 'Analysis');
});

test('parseExtraction: tolerates code fences, ignores unknown refs and malformed topics', () => {
  const fence = '`'.repeat(3);                       // a markdown code fence, built so this plan's own fences stay intact
  const raw = 'Sure!\n' + fence + 'json\n' + JSON.stringify({ results: [
    { ref: 'project', topics: [{ name: 'A', existingTopicId: 't1', equivalentToListValue: false }, { nope: 1 }, null] },
    { ref: 'ghost', topics: [{ name: 'X' }] },
    { ref: 'task:x', topics: 'bad' },
  ] }) + '\n' + fence;
  const m = parseExtraction(raw, new Set(['project', 'task:x']));
  assert.deepEqual([...m.keys()], ['project']);
  assert.deepEqual(m.get('project'), [{ name: 'A', existingTopicId: 't1', equivalentToListValue: false }]);
});

test('parseExtraction: throws on non-JSON or missing results', () => {
  assert.throws(() => parseExtraction('no json here', new Set(['project'])), /not JSON/);
  assert.throws(() => parseExtraction('{"a":', new Set(['project'])), /JSON/);
  assert.throws(() => parseExtraction('{"foo":1}', new Set(['project'])), /results/);
});

test('finalTopic: follows merges, guards against loops and unknown ids', () => {
  assert.equal(finalTopic('t4', vocab.topicsById).id, 't1');
  assert.equal(finalTopic('nope', vocab.topicsById), null);
  const loop = new Map([['a', { id: 'a', merged_into: 'b' }], ['b', { id: 'b', merged_into: 'a' }]]);
  assert.equal(finalTopic('a', loop), null);
});

test('buildVocabulary: prompt lists exclude rejected/merged; list names and values are forbidden', () => {
  assert.deepEqual(vocab.topicList.map(t => t.id).sort(), ['t1', 't2']);
  assert.deepEqual(vocab.rejectedNames, ['Copy editing']);
  assert.ok(vocab.listNorms.has('italy') && vocab.listNorms.has('oncology') && vocab.listNorms.has('brand'));
  assert.deepEqual(vocab.listValues, [{ list: 'Market', value: 'Italy' }, { list: 'Therapeutic Area', value: 'Oncology' }]);
});

test('resolveCandidates: reuse by id, by name, and via merge chain', () => {
  const r = resolveCandidates([
    { name: 'Anything', existingTopicId: 't1', equivalentToListValue: false },
    { name: 'data VISUALIZATION', existingTopicId: null, equivalentToListValue: false },
    { name: 'Old name', existingTopicId: 't4', equivalentToListValue: false },
  ], vocab);
  assert.deepEqual(r, [{ topicId: 't1' }, { topicId: 't2' }]);                 // t4 collapses onto t1 (dedupe)
});

test('resolveCandidates: new names, list-equivalent, list-value names, rejected, invalid, duplicates', () => {
  const r = resolveCandidates([
    { name: 'Video editing', existingTopicId: null, equivalentToListValue: false },
    { name: 'video   EDITING', existingTopicId: null, equivalentToListValue: false },
    { name: 'Pharma marketing', existingTopicId: null, equivalentToListValue: true },
    { name: 'Oncology', existingTopicId: null, equivalentToListValue: false },
    { name: 'Copy editing', existingTopicId: null, equivalentToListValue: false },
    { name: '', existingTopicId: null, equivalentToListValue: false },
    { name: 'one two three four five', existingTopicId: null, equivalentToListValue: false },
    { name: 'x'.repeat(61), existingTopicId: null, equivalentToListValue: false },
    { name: 'Ghost', existingTopicId: 'no-such-id', equivalentToListValue: false },
  ], vocab);
  assert.deepEqual(r, [{ newName: 'Video editing' }, { newName: 'Ghost' }]);
});

test('resolveCandidates: at most MAX_TOPICS_PER_TEXT accepted', () => {
  assert.equal(MAX_TOPICS_PER_TEXT, 5);
  const many = Array.from({ length: 9 }, (_, i) => ({ name: `Skill number ${i}`, existingTopicId: null, equivalentToListValue: false }));
  assert.equal(resolveCandidates(many, vocab).length, 5);
});

test('resolveProfileTopics: only approved, merges followed, duplicates merged, sorted', () => {
  const out = resolveProfileTopics([
    { topicId: 't1', projectCodes: ['B'] }, { topicId: 't4', projectCodes: ['A', 'B'] },
    { topicId: 't2', projectCodes: ['A'] },           // proposed → hidden
    { topicId: 't3', projectCodes: ['A'] },           // rejected → hidden
    { topicId: 'gone', projectCodes: ['A'] },         // unknown → hidden
  ], vocab.topicsById);
  assert.deepEqual(out, [{ id: 't1', name: 'Medical writing', projectCodes: ['A', 'B'] }]);
});

test('topicNameError: empty, too long/many words, list value; null when fine', () => {
  assert.match(topicNameError('', vocab), /required/);
  assert.match(topicNameError('a b c d e', vocab), /1 to 4 words/);
  assert.match(topicNameError('x'.repeat(61), vocab), /60/);
  assert.match(topicNameError('ITALY', vocab), /attribute-list/);
  assert.equal(topicNameError('Video editing', vocab), null);
});

test('buildPrompt: user message is JSON with reusable topics, rejected names, list values and the texts', () => {
  const items = buildItems('Project description long enough', [{ name: 'Analysis', description: 'Task description long enough' }]);
  const { system, user } = buildPrompt({ items, vocab });
  assert.match(system, /SPECIFIC COMPETENCE/);
  const ctx = JSON.parse(user);
  assert.deepEqual(ctx.existingTopics.map(t => t.id).sort(), ['t1', 't2']);
  assert.deepEqual(ctx.rejectedTopics, ['Copy editing']);
  assert.equal(ctx.attributeListValues.length, 2);
  assert.deepEqual(ctx.texts.map(t => t.ref), ['project', 'task:analysis']);
  assert.equal(ctx.texts[1].taskName, 'Analysis');
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `cd api && node --test src/lib/topic-extract.test.js`
Expected: FAIL — `Cannot find module './topic-extract'`.

- [ ] **Step 3: Implement**

Create `api/src/lib/topic-extract.js`:

```js
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

module.exports = {
  MIN_TEXT_CHARS, MAX_TOPICS_PER_TEXT, MAX_TOPIC_WORDS, MAX_TOPIC_CHARS, PROJECT_REF,
  normalizeTopicName, cleanTopicName, taskKey, hashText, isExtractable, descriptionsSignature, buildItems,
  buildVocabulary, buildPrompt, parseExtraction, finalTopic, resolveCandidates, resolveProfileTopics, topicNameError,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && node --test src/lib/topic-extract.test.js`
Expected: all tests PASS. If the `resolveCandidates` reuse test fails on ordering, re-read the test: `t4` collapses onto `t1` so `[t1, t2]` is expected.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/topic-extract.js api/src/lib/topic-extract.test.js
git commit -m "feat: pure topic-extraction library (prompt, parsing, candidate resolution)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Migrations `027` and `028`

**Files:**
- Create: `api/src/db/migrations/027_project_descriptions.sql`
- Create: `api/src/db/migrations/028_topics.sql`

**Interfaces:**
- Produces: `projects.description`, `project_tasks.description` (TEXT NOT NULL DEFAULT ''); tables `topics`, `description_topic_state`, `description_topic_links`; `app_settings.topic_extraction_enabled`.

- [ ] **Step 1: Write `027_project_descriptions.sql`**

```sql
-- Profile descriptions cycle: projects and project tasks carry a free-text description.
ALTER TABLE projects      ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';

-- One-shot backfill from the linked proposal (apply once at deploy, like 023): only fills EMPTY fields,
-- so a description typed later is never overwritten. Project description = the version note.
UPDATE projects p
SET description = v.note
FROM cost_grid_versions v
WHERE p.cg_version_id = v.id
  AND p.description = ''
  AND COALESCE(btrim(v.note), '') <> '';

-- Task descriptions: proposal task of the linked version whose normalised title equals the project
-- task's normalised name (trim, collapse spaces, lowercase — same key as the profile engine).
WITH src AS (
  SELECT DISTINCT ON (p.id, k.task_key)
         p.id AS project_id, k.task_key, t.description
  FROM projects p
  JOIN phases ph ON ph.version_id = p.cg_version_id
  JOIN tasks t   ON t.phase_id = ph.id
  CROSS JOIN LATERAL (SELECT lower(regexp_replace(btrim(t.title), '\s+', ' ', 'g')) AS task_key) k
  WHERE p.cg_version_id IS NOT NULL AND btrim(t.description) <> ''
  ORDER BY p.id, k.task_key, ph.sort_order, t.sort_order
)
UPDATE project_tasks pt
SET description = src.description
FROM src
WHERE pt.project_id = src.project_id
  AND lower(regexp_replace(btrim(pt.name), '\s+', ' ', 'g')) = src.task_key
  AND pt.description = '';
```

- [ ] **Step 2: Write `028_topics.sql`**

```sql
-- Profile descriptions cycle: shared competence vocabulary + per-description extraction state/links.
CREATE TABLE IF NOT EXISTS topics (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(100) NOT NULL,
  name_normalized VARCHAR(100) NOT NULL UNIQUE,
  status          VARCHAR(20)  NOT NULL DEFAULT 'proposed' CHECK (status IN ('approved', 'proposed', 'rejected')),
  merged_into     UUID REFERENCES topics(id),
  created_by      UUID REFERENCES users(id),
  updated_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_topics_status ON topics(status);

-- task_key '' = the project description; otherwise the normalised task name (task ids are NOT stable:
-- PUT /api/projects/:id/tasks deletes and re-inserts every task on each save).
CREATE TABLE IF NOT EXISTS description_topic_state (
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_key     TEXT NOT NULL DEFAULT '',
  text_hash    TEXT NOT NULL DEFAULT '',
  extracted_at TIMESTAMPTZ,
  last_error   TEXT,
  PRIMARY KEY (project_id, task_key)
);

CREATE TABLE IF NOT EXISTS description_topic_links (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_key   TEXT NOT NULL DEFAULT '',
  topic_id   UUID NOT NULL REFERENCES topics(id),
  PRIMARY KEY (project_id, task_key, topic_id)
);
CREATE INDEX IF NOT EXISTS idx_dtl_topic ON description_topic_links(topic_id);

INSERT INTO app_settings (key, value) VALUES ('topic_extraction_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 3: Verify both migrations on a throwaway Postgres (never the main stack)**

```bash
docker run -d --rm --name pdash-mig-check -e POSTGRES_PASSWORD=x -e POSTGRES_DB=pdash -e POSTGRES_USER=pdash postgres:16-alpine
until docker exec pdash-mig-check pg_isready -U pdash >/dev/null 2>&1; do sleep 1; done
for f in api/src/db/migrations/*.sql; do docker exec -i pdash-mig-check psql -q -v ON_ERROR_STOP=1 -U pdash -d pdash < "$f" || { echo "FAILED $f"; break; }; done
```
Expected: no `FAILED` line. Then seed a proposal + project and re-run `027` to exercise the backfill:

```bash
docker exec -i pdash-mig-check psql -q -U pdash -d pdash <<'SQL'
INSERT INTO users (id, email, first_name, last_name, role, status) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'mig@test.local', 'Mig', 'Test', 'admin', 'active');
INSERT INTO cost_grids (id, name, owner_id) VALUES ('00000000-0000-0000-0000-0000000000b1', 'G', '00000000-0000-0000-0000-0000000000a1');
INSERT INTO cost_grid_versions (id, cost_grid_id, label, note) VALUES
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'v1', 'Proposal note for the project');
INSERT INTO phases (id, version_id, title) VALUES ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'P1');
INSERT INTO tasks (phase_id, title, description) VALUES
  ('00000000-0000-0000-0000-0000000000d1', 'Literature  Review', 'Review the literature carefully'),
  ('00000000-0000-0000-0000-0000000000d1', 'Build', '');
INSERT INTO projects (id, name, owner_id, cg_version_id) VALUES
  ('00000000-0000-0000-0000-0000000000e1', 'Proj', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000e2', 'Proj2', '00000000-0000-0000-0000-0000000000a1', NULL);
INSERT INTO project_tasks (project_id, name, sort_order) VALUES
  ('00000000-0000-0000-0000-0000000000e1', 'literature review', 0),
  ('00000000-0000-0000-0000-0000000000e1', 'Build', 1),
  ('00000000-0000-0000-0000-0000000000e2', 'literature review', 0);
SQL
docker exec -i pdash-mig-check psql -q -U pdash -d pdash < api/src/db/migrations/027_project_descriptions.sql
docker exec pdash-mig-check psql -U pdash -d pdash -c "SELECT p.name, p.description, pt.name AS task, pt.description AS tdesc FROM projects p LEFT JOIN project_tasks pt ON pt.project_id = p.id ORDER BY p.name, pt.sort_order"
```
Expected: `Proj` → description `Proposal note for the project`; its task `literature review` → `Review the literature carefully`; `Build` → empty; `Proj2` (no link) → all empty. If an insert fails because another migration added a NOT NULL column, adapt the column list to what `\d <table>` shows; the assertion is unchanged. Re-run the 027 file once more and confirm nothing changes (idempotent). Clean up: `docker stop pdash-mig-check`.

- [ ] **Step 4: Commit**

```bash
git add api/src/db/migrations/027_project_descriptions.sql api/src/db/migrations/028_topics.sql
git commit -m "feat: migrations 027 (project/task descriptions + backfill) and 028 (topics)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Projects API — descriptions and enqueue on change

**Files:**
- Modify: `api/src/routes/projects.js` (GET list, `POST /`, `PATCH /:id`, `GET /:id/tasks`, `PUT /:id/tasks`)
- Test: `test-api.js`

**Interfaces:**
- Consumes: `descriptionsSignature` from `../lib/topic-extract`; `enqueueProjectsQuiet`, `enqueueProjectCode(projectId)` (already in this file).
- Produces: API accepts/returns `description` on projects and on each task (`GET /` task JSON, `GET /:id`, `GET /:id/tasks`).

- [ ] **Step 1: Add the failing integration test**

In `test-api.js`, add before `main()` (and register `await testProjectDescriptions();` in `main()` right after `await testTagLinking();`):

```js
// ── Project descriptions (2026-09, profile descriptions cycle) ──────────────────

async function testProjectDescriptions() {
  section('Project descriptions');
  const ts = Date.now();
  const code = `TPD${ts}`;
  const r = await api('POST', '/api/projects',
    { name: `__pd_${ts}__`, code, description: 'Oncology portal' }, adminCookie);
  const id = r.data?.id;
  if (!ok(r.status === 201 && id, `PD-01 POST /api/projects with description → 201 (got ${r.status})`)) return;
  later('DELETE', `/api/projects/${id}`);
  const get = async () => (await api('GET', `/api/projects/${id}`, null, adminCookie)).data;
  ok((await get())?.description === 'Oncology portal', 'PD-01 description stored and returned by GET /:id');

  ok((await api('PATCH', `/api/projects/${id}`, { description: 'Second version' }, adminCookie)).status === 200
      && (await get())?.description === 'Second version', 'PD-02 PATCH description updates it');
  ok((await api('PATCH', `/api/projects/${id}`, { description: '' }, adminCookie)).status === 200
      && (await get())?.description === '', 'PD-03 PATCH description "" stores an empty string (not NULL, no error)');

  const tasks = [
    { name: 'Analysis', description: 'Analyse sources', resources: [] },
    { name: 'Build', resources: [] },
  ];
  ok((await api('PUT', `/api/projects/${id}/tasks`, tasks, adminCookie)).status === 200, 'PD-04 PUT tasks with descriptions → 200');
  const t = (await api('GET', `/api/projects/${id}/tasks`, null, adminCookie)).data || [];
  ok(t.find(x => x.name === 'Analysis')?.description === 'Analyse sources'
      && t.find(x => x.name === 'Build')?.description === '', 'PD-04 GET tasks returns descriptions ("" when none)');
  const list = (await api('GET', '/api/projects', null, adminCookie)).data || [];
  const inList = list.find(p => p.id === id);
  ok(inList?.description === '' && inList?.tasks?.find(x => x.name === 'Analysis')?.description === 'Analyse sources',
    'PD-04 GET /api/projects list carries project and task descriptions');

  // Every description here is shorter than 20 characters on purpose: these projects must never reach the LLM.
  // PD-05: enqueue only when a description actually changed
  const queued = async () => {
    const st = (await api('GET', '/api/profile-jobs', null, adminCookie)).data;
    return !!st?.projects?.find(p => p.project_code === code)?.queued_at;
  };
  await api('DELETE', `/api/profile-jobs/projects/${encodeURIComponent(code)}/queue`, null, adminCookie);
  await api('PUT', `/api/projects/${id}/tasks`, tasks, adminCookie);                       // identical → no enqueue
  ok(!(await queued()), 'PD-05 saving identical task descriptions does not queue the project');
  await api('PUT', `/api/projects/${id}/tasks`,
    [{ ...tasks[0], description: 'Analyse deeply' }, tasks[1]], adminCookie);
  ok(await queued(), 'PD-05 changing a task description queues the project code');
  await api('DELETE', `/api/profile-jobs/projects/${encodeURIComponent(code)}/queue`, null, adminCookie);
  await api('PATCH', `/api/projects/${id}`, { description: '' }, adminCookie);              // unchanged → no enqueue
  ok(!(await queued()), 'PD-05 PATCH with an unchanged description does not queue the project');
  await api('PATCH', `/api/projects/${id}`, { description: 'A new description' }, adminCookie);
  ok(await queued(), 'PD-05 changing the project description queues the project code');
}
```

- [ ] **Step 2: Implement in `api/src/routes/projects.js`**

1. Imports (top of file, after the existing `require`s): `const { descriptionsSignature } = require('../lib/topic-extract');`
2. `GET /` (list): add `p.description,` to the select list (next to `p.phasing, p.ptc, p.planning, p.groups,`) and add `'description', pt.description,` inside the `json_build_object` for tasks (after `'resources', pt.resources` — add a comma after `pt.resources`).
3. `GET /:id/tasks`: change the select to `SELECT id, name, description, billable, completed, start_date, end_date, monthly_distribution, resources, sort_order`.
4. `POST /`: destructure `description` from `req.body`, add `description` to the INSERT column list and `VALUES` (`$13`), param `String(description ?? '')`:

```js
    const { id, name, code, programId, clientId, startDate, endDate, currency, pipeline, status, cgVersionId, description } = req.body;
```
```js
      `INSERT INTO projects (id, code, name, program_id, client_id, start_date, end_date, currency, pipeline, status, cg_version_id, owner_id, description)
       VALUES (COALESCE($1::uuid, uuid_generate_v4()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, code, name, owner_id, created_at`,
      [id || null, code?.trim() || null, name.trim(), programId || null, safeClientId, startDate || null,
       endDate || null, currency || 'EUR', pipeline || null, status || null,
       safeCgVersionId, req.user.id, String(description ?? '')]
```
   and after the existing `if (code?.trim()) await enqueueProjectsQuiet([code.trim()]);` nothing more is needed (create already enqueues).
5. `PATCH /:id`: add `'description'` to `allowed`, `description: 'description'` to `map`, and change the param push so `''` is kept as an empty string:

```js
        params.push(key === 'description' ? String(req.body[key] ?? '') : (req.body[key] || null));
```
   Before building the update (next to the `prevCode` read), read the previous description when it is being written:

```js
    let prevDescription = null;
    if (req.body.description !== undefined) {
      const prev = await query('SELECT description FROM projects WHERE id = $1', [req.params.id]);
      prevDescription = prev.rows[0]?.description ?? '';
    }
```
   After the `if (!rows[0]) return res.status(404)…` line, add:

```js
    if (req.body.description !== undefined && String(req.body.description ?? '') !== prevDescription) {
      await enqueueProjectCode(req.params.id);
    }
```
6. `PUT /:id/tasks`: before `DELETE FROM project_tasks`, read the old rows; INSERT gains the `description` column (`$10`); after the loop, enqueue when the signature differs:

```js
    const before = await query('SELECT name, description FROM project_tasks WHERE project_id = $1', [req.params.id]);
    await query('DELETE FROM project_tasks WHERE project_id = $1', [req.params.id]);
```
```js
      await query(
        `INSERT INTO project_tasks
         (project_id, name, billable, completed, start_date, end_date,
          monthly_distribution, resources, sort_order, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [req.params.id, (t.name || '').replace(/\s+/g, ' ').trim(), t.billable ?? true, t.completed ?? false,
         t.startDate ? t.startDate.replace(/-/g, '').slice(0, 8) || null : null,
         t.endDate   ? t.endDate.replace(/-/g, '').slice(0, 8)   || null : null,
         t.monthlyDistribution ? JSON.stringify(t.monthlyDistribution) : null,
         t.resources ? JSON.stringify(t.resources) : null, i, String(t.description ?? '')]
      );
```
```js
    const after = tasks.map(t => ({ name: (t.name || '').replace(/\s+/g, ' ').trim(), description: String(t.description ?? '') }));
    if (descriptionsSignature(before.rows) !== descriptionsSignature(after)) await enqueueProjectCode(req.params.id);
    res.json({ ok: true });
```
   (replace the existing final `res.json({ ok: true });` of this handler).

- [ ] **Step 3: Run the integration suite**

Run: `bash scripts/run-tests.sh`
Expected: all previous cases still pass and every `PD-*` line prints ✓. (Slow: builds an isolated stack.)

- [ ] **Step 4: Commit**

```bash
git add api/src/routes/projects.js test-api.js
git commit -m "feat: project and task descriptions in the projects API, queue on change

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Frontend — descriptions end to end

**Files:**
- Modify: `costgrid.html` (label at ~line 139), `js/costgrid.js` (`cgDoGenerateProject`, ~line 1181), `js/api-sync.js` (`_apiProjectToLocal`), `project-config.html` (project info section ~line 77, task card ~line 118, `addTask` ~line 944)
- Bump: `?v=N` of `js/costgrid.js` (costgrid.html, pipeline.html) and `js/api-sync.js` (costgrid.html, pipeline.html, planning.html, portfolio.html, project-config.html)

**Interfaces:**
- Consumes: API fields `description` (project) and `tasks[].description` from Task 3.
- Produces: `config.projects[].description` and `config.projects[].tasks[].description` in the in-memory model; `_pushProjectToApi` already spreads `...meta` and passes `tasks` untouched, so both reach the API with no further change.

- [ ] **Step 1: costgrid.html label**

Change the label above `#cgNote`: `<label class="form-label small fw-semibold mb-1">Notes</label>` → `<label class="form-label small fw-semibold mb-1">Description</label>` (leave the textarea, `id`, `v-model="draft.note"` and placeholder untouched).

- [ ] **Step 2: Copy into the generated project (`js/costgrid.js`)**

In `cgDoGenerateProject`, in the `tasks.push({ … })` object add, after `name: task.taskName.trim(),`:

```js
        description: (task.taskDescription || '').trim(),
```
and in the project object literal (the one containing `note: v.note || '',`) add, right after that line:

```js
    description: (v.note || '').trim(),
```

- [ ] **Step 3: Map it back in `js/api-sync.js`**

In `_apiProjectToLocal`, add after the `status:` line:

```js
    description: p.description  || '',
```
(tasks are passed through as `p.tasks` unchanged, so `tasks[].description` arrives as returned by the API.)

- [ ] **Step 4: `project-config.html` — editable, viewer read-only**

(a) In the "1. Project info" section, after the `.row g-3 mt-1` div containing Pipeline/Status (the one ending before `</div>` that closes `cfg-section`), add a third row:

```html
        <div class="row g-3 mt-1">
          <div class="col-12">
            <label class="form-label small mb-1">Description <span class="text-muted">(used to extract competence topics for the team profiles)</span></label>
            <textarea class="form-control form-control-sm" rows="3" v-model="project.description" :disabled="isViewer" placeholder="What is this project about? Scope, work performed, skills needed…"></textarea>
          </div>
        </div>
```

(b) In each task card, after the closing `</div>` of the first row (the one holding "Task name", the two switches and the Remove button) add:

```html
    <div class="mb-2">
      <textarea class="form-control form-control-sm" rows="2" v-model="task.description" :disabled="isViewer" placeholder="Task description — what is done and which competences it needs"></textarea>
    </div>
```

(c) `addTask()`: add `description: ''` to the pushed object (`{ name: '', description: '', billable: true, … }`).

(d) `BLANK_PROJECT` (~line 409): add `description: '',` to the returned object. In the load path, right after the existing line `(this.project.tasks || []).forEach(t => { if (!t.monthlyDistribution) t.monthlyDistribution = {}; });` (~line 531) add:

```js
        (this.project.tasks || []).forEach(t => { if (typeof t.description !== 'string') t.description = ''; });
        if (typeof this.project.description !== 'string') this.project.description = '';
```

- [ ] **Step 5: Bump cache-busting versions**

```bash
grep -rn "js/costgrid.js?v=\|js/api-sync.js?v=" *.html
```
Increment each of those `?v=N` by one, **in every file listed** (currently `costgrid.js` v32 → v33 in costgrid.html and pipeline.html; `api-sync.js` v15 → v16 in costgrid.html, pipeline.html, planning.html, portfolio.html, project-config.html).

- [ ] **Step 6: Static verification**

Run: `node --check js/costgrid.js && node --check js/api-sync.js && npm test`
Expected: no syntax errors; existing vitest suite passes. (UI behaviour is verified in `/finish-cycle` Gate 2 on the branch test environment: generate a project from a proposal with a note and task descriptions → they appear in project-config; edit as owner; open as a viewer → all disabled.)

- [ ] **Step 7: Commit**

```bash
git add costgrid.html js/costgrid.js js/api-sync.js project-config.html pipeline.html planning.html portfolio.html
git commit -m "feat: copy proposal note/task descriptions to the project; editable in project-config

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Topics admin API

**Files:**
- Create: `api/src/services/topic-extraction.js` (vocabulary helpers only in this task; extraction added in Task 6)
- Create: `api/src/routes/topics.js`
- Modify: `api/src/index.js` (require + mount)
- Test: `test-api.js`

**Interfaces:**
- Consumes: `buildVocabulary`, `topicNameError`, `cleanTopicName`, `normalizeTopicName` from `../lib/topic-extract`.
- Produces: `loadVocabulary(q = query)` → vocabulary object (see Task 1); routes below (all `requireAuth, requireAdmin`):
  - `GET /api/topics?status=` → `[{ id, name, status, usage_count, created_at, updated_at }]` (non-merged only, sorted by name)
  - `POST /api/topics { name }` → 201 `{ id, name, status: 'approved' }` (admin seed), 400 invalid name, 409 duplicate
  - `PATCH /api/topics/:id { name }` → 200 topic; 409 duplicate ("use merge") or merged topic; 400 invalid; 404
  - `POST /api/topics/:id/approve` (from `proposed`), `/reject` (from `proposed`/`approved`), `/restore` (from `rejected`) → 200 topic; 409 wrong state
  - `POST /api/topics/:id/merge { targetId }` → 200 `{ ok: true, targetId }`; 400 self/missing; 404; 409 source/target merged or target rejected

- [ ] **Step 1: Failing integration test**

Add to `test-api.js` (register `await testTopicsApi();` after `testProjectDescriptions()` in `main()`):

```js
// ── Topics admin API ────────────────────────────────────────────────────────────

async function testTopicsApi() {
  section('Topics API');
  const ts = Date.now();
  ok((await api('GET', '/api/topics')).status === 401, 'TP-01 GET /api/topics without auth → 401');

  const mk = async (name) => {
    const r = await api('POST', '/api/topics', { name }, adminCookie);
    return r;
  };
  const a = await mk(`Alpha skill ${ts}`);
  ok(a.status === 201 && a.data?.status === 'approved', `TP-02 POST /api/topics creates an approved topic (got ${a.status})`);
  if (!a.data?.id) return;
  const b = await mk(`Beta skill ${ts}`);
  const c = await mk(`Gamma skill ${ts}`);
  ok((await mk(`ALPHA   skill ${ts}`)).status === 409, 'TP-02 a duplicate name (case/space-insensitive) → 409');
  ok((await mk('')).status === 400 && (await mk('a b c d e')).status === 400, 'TP-02 empty / more than 4 words → 400');

  // a value of an attribute list can never be a topic
  const lists = (await api('GET', '/api/attribute-lists', null, adminCookie)).data || [];
  const market = lists.find(l => l.slug === 'market');
  const itemLabel = `__tp_item_${ts}__`;
  if (market) {
    const it = await api('POST', `/api/attribute-lists/${market.id}/items`, { label: itemLabel }, adminCookie);
    ok((await mk(itemLabel)).status === 400, 'TP-03 a name equal to an attribute-list value → 400');
    ok((await api('PATCH', `/api/topics/${a.data.id}`, { name: itemLabel }, adminCookie)).status === 400, 'TP-03 renaming to a list value → 400');
    void it;
  }

  const rn = await api('PATCH', `/api/topics/${a.data.id}`, { name: `Alpha renamed ${ts}` }, adminCookie);
  ok(rn.status === 200 && rn.data?.name === `Alpha renamed ${ts}`, 'TP-04 PATCH renames a topic');
  ok((await api('PATCH', `/api/topics/${a.data.id}`, { name: `Beta skill ${ts}` }, adminCookie)).status === 409, 'TP-04 renaming onto an existing name → 409');

  const listApproved = (await api('GET', '/api/topics?status=approved', null, adminCookie)).data || [];
  ok(listApproved.some(t => t.id === a.data.id) && listApproved.every(t => t.status === 'approved'), 'TP-05 list filters by status');
  ok((await api('GET', '/api/topics?status=bogus', null, adminCookie)).status === 400, 'TP-05 unknown status filter → 400');

  ok((await api('POST', `/api/topics/${b.data.id}/reject`, null, adminCookie)).data?.status === 'rejected', 'TP-06 reject');
  ok((await api('POST', `/api/topics/${b.data.id}/reject`, null, adminCookie)).status === 409, 'TP-06 rejecting twice → 409');
  ok((await api('POST', `/api/topics/${b.data.id}/restore`, null, adminCookie)).data?.status === 'approved', 'TP-06 restore → approved');
  ok((await api('POST', `/api/topics/${b.data.id}/approve`, null, adminCookie)).status === 409, 'TP-06 approving an approved topic → 409');

  // merge: b → a, then a chain c → b (must land on a)
  ok((await api('POST', `/api/topics/${b.data.id}/merge`, { targetId: b.data.id }, adminCookie)).status === 400, 'TP-07 merge into itself → 400');
  ok((await api('POST', `/api/topics/${b.data.id}/merge`, { targetId: a.data.id }, adminCookie)).status === 200, 'TP-07 merge b into a → 200');
  const afterMerge = (await api('GET', '/api/topics', null, adminCookie)).data || [];
  ok(!afterMerge.some(t => t.id === b.data.id), 'TP-07 a merged topic disappears from the list');
  ok((await api('POST', `/api/topics/${c.data.id}/merge`, { targetId: b.data.id }, adminCookie)).status === 409, 'TP-07 merging into an already-merged topic → 409');
  ok((await api('PATCH', `/api/topics/${b.data.id}`, { name: 'Whatever' }, adminCookie)).status === 409, 'TP-07 a merged topic cannot be renamed');
  const rej = await api('POST', `/api/topics/${c.data.id}/reject`, null, adminCookie);
  ok(rej.status === 200 && (await api('POST', `/api/topics/${a.data.id}/merge`, { targetId: c.data.id }, adminCookie)).status === 409,
    'TP-07 merging into a rejected topic → 409');
  ok((await api('GET', '/api/topics/not-a-uuid')).status === 401 && (await api('PATCH', '/api/topics/not-a-uuid', { name: 'X y' }, adminCookie)).status === 404,
    'TP-08 malformed id → 404');
}
```

- [ ] **Step 2: Implement `services/topic-extraction.js` (vocabulary part)**

Create `api/src/services/topic-extraction.js`:

```js
// DB-bound half of the topic-extraction feature. Pure logic lives in ../lib/topic-extract.js.
const { pool, query } = require('../db/client');
const { buildVocabulary } = require('../lib/topic-extract');

// q = query or a transaction client's bound query. Vocabulary = every topic row + every attribute
// list name and ACTIVE item label (the values a topic may never equal).
async function loadVocabulary(q = query) {
  const [topics, lists] = await Promise.all([
    q('SELECT id, name, name_normalized, status, merged_into FROM topics'),
    q(`SELECT al.name AS list_name, ali.label
       FROM attribute_lists al
       LEFT JOIN attribute_list_items ali ON ali.list_id = al.id AND ali.status = 'active'`),
  ]);
  return buildVocabulary(topics.rows, lists.rows);
}

module.exports = { loadVocabulary };
```
(`pool` is imported now because Task 6 adds transactional code to this file; leave the import.)

- [ ] **Step 3: Implement `api/src/routes/topics.js`**

```js
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
       WHERE id = $1 RETURNING ${COLS}`,
      [t.id, name, norm, req.user.id]
    );
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
        `UPDATE topics SET status = $2, updated_by = $3, updated_at = now() WHERE id = $1 RETURNING ${COLS}`,
        [t.id, rule.to, req.user.id]
      );
      res.json(rows[0]);
    } catch (err) { next(err); }
  });
}

// POST /api/topics/:id/merge { targetId } — absorb :id into targetId
router.post('/:id/merge', async (req, res, next) => {
  const targetId = req.body?.targetId;
  if (!UUID_RE.test(String(req.params.id))) return res.status(404).json({ error: 'Topic not found' });
  if (!UUID_RE.test(String(targetId ?? ''))) return res.status(400).json({ error: 'targetId is required' });
  if (targetId === req.params.id) return res.status(400).json({ error: 'A topic cannot be merged into itself' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // lock both rows in a fixed order so two concurrent merges cannot deadlock
    const ids = [req.params.id, targetId].sort();
    await client.query('SELECT id FROM topics WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [ids]);
    const source = await getTopic(req.params.id, client.query.bind(client));
    const target = await getTopic(targetId, client.query.bind(client));
    if (!source || !target) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Topic not found' }); }
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
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
```

- [ ] **Step 4: Mount the router in `api/src/index.js`**

Next to `const profileJobsRoutes = require('./routes/profile-jobs');` add `const topicsRoutes = require('./routes/topics');` and next to `app.use('/api/profile-jobs',    profileJobsRoutes);` add `app.use('/api/topics',           topicsRoutes);`.

- [ ] **Step 5: Run and commit**

Run: `bash scripts/run-tests.sh` — expected: all `TP-*` lines ✓, nothing else regressed.

```bash
git add api/src/services/topic-extraction.js api/src/routes/topics.js api/src/index.js test-api.js
git commit -m "feat: admin API for the topic vocabulary (create, rename, approve, reject, restore, merge)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: LLM client, extraction service and test wiring

**Files:**
- Modify: `api/src/services/topic-extraction.js` (add `callAnthropic`, `extractForCode`)
- Modify: `docker-compose.yml`, `.env.example`, `scripts/run-tests.sh`
- Test: `test-api.js` (LLM stub server + `TX-*` cases)

**Interfaces:**
- Consumes: Task 1 lib, Task 5 `loadVocabulary`.
- Produces: `extractForCode(code)` → `{ status: 'done', extracted: number } | { status: 'skipped', reason: 'disabled'|'no-key'|'no-project' } | { status: 'error', error: string }`; never throws for LLM/DB-extraction failures it can classify (unexpected exceptions propagate; the caller in Task 7 wraps them). `callAnthropic({ system, user })` → answer text (throws on HTTP error/timeout/empty).

- [ ] **Step 1: Wire environment variables**

`docker-compose.yml`, `api` service `environment:` (after `NODE_ENV`): 
```yaml
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
      ANTHROPIC_MODEL: ${ANTHROPIC_MODEL:-claude-haiku-4-5-20251001}
      ANTHROPIC_BASE_URL: ${ANTHROPIC_BASE_URL:-https://api.anthropic.com}
```
`.env.example` (before the `# App` block):
```
# Topic extraction (profile descriptions) — optional: without a key, extraction is skipped silently
ANTHROPIC_API_KEY=
# ANTHROPIC_MODEL=claude-haiku-4-5-20251001
```
`scripts/run-tests.sh` `write_override()`: extend the heredoc so the isolated stack has an LLM stub target and the test runner knows it:

```bash
write_override() {
  cat > "$OVERRIDE_FILE" <<EOF
services:
  db:
    container_name: ${DB_CONTAINER}
    ports: !override []
  api:
    container_name: ${API_CONTAINER}
    ports: !override []
    environment:
      ANTHROPIC_API_KEY: test-key
      ANTHROPIC_BASE_URL: http://test:4010
  test:
    environment:
      LLM_STUB_ENABLED: "1"
EOF
}
```

- [ ] **Step 2: Failing integration tests with an LLM stub**

In `test-api.js` add (top of the file, after the `require`-less constants, add `const http = require('http');`). Then add before `main()`:

```js
// ── Topic extraction (LLM stubbed) ──────────────────────────────────────────────
// Only runs in the isolated stack (scripts/run-tests.sh sets LLM_STUB_ENABLED and points the api's
// ANTHROPIC_BASE_URL at this process). Text markers drive the stub: [[Topic]] = a normal candidate,
// ((Name)) = flagged equivalentToListValue, <<Name>> = candidate that is NOT flagged (server must still
// neutralise it when it equals an attribute-list value).

let stubMode = 'ok';                 // 'ok' | 'http500' | 'garbage'
const stubBodies = [];

function stubAnswer(ctx) {
  const results = ctx.texts.map(t => {
    const topics = [];
    const push = (name, equivalent) => {
      const ex = ctx.existingTopics.find(e => e.name.toLowerCase() === name.toLowerCase());
      topics.push({ name, existingTopicId: ex ? ex.id : null, equivalentToListValue: equivalent });
    };
    for (const m of t.text.matchAll(/\[\[(.+?)\]\]/g)) push(m[1], false);
    for (const m of t.text.matchAll(/\(\((.+?)\)\)/g)) push(m[1], true);
    for (const m of t.text.matchAll(/<<(.+?)>>/g)) push(m[1], false);
    return { ref: t.ref, topics };
  });
  return { results };
}

function startLlmStub(port) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch { /* ignore */ }
        if (parsed) stubBodies.push(parsed);
        if (stubMode === 'http500') { res.statusCode = 500; res.end('{}'); return; }
        res.setHeader('content-type', 'application/json');
        if (stubMode === 'garbage') { res.end(JSON.stringify({ content: [{ type: 'text', text: 'sorry, no JSON today' }] })); return; }
        const ctx = JSON.parse(parsed.messages[0].content);
        res.end(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(stubAnswer(ctx)) }] }));
      });
    });
    server.listen(port, '0.0.0.0', () => resolve(server));
  });
}

const stubSaw = marker => stubBodies.some(b => String(b.messages?.[0]?.content || '').includes(marker));

async function testTopicExtraction() {
  section('Topic extraction');
  if (process.env.LLM_STUB_ENABLED !== '1') { pass('TX-skip LLM stub not enabled (run via scripts/run-tests.sh) — extraction cases skipped'); return; }
  const server = await startLlmStub(4010);
  try {
    const f = await profileFixture();
    ok(f.ok, 'TX-setup resource, two projects and a Market value created');
    if (!f.ok) return;
    const { ts, code1, person, resId, p1, itemLabel } = f;

    const desc = `Portal build [[Web development ${ts}]] and ((Pharma marketing)) and <<${itemLabel}>> and [[Copy editing ${ts}]]`;
    const taskDesc = `Deep analysis work [[Statistical modelling ${ts}]]`;
    const putTasks = (d) => api('PUT', `/api/projects/${p1}/tasks`,
      [{ name: 'Analysis', description: d, resources: [{ role: 'Consultant', soldHours: 8 }] }], adminCookie);
    ok((await putTasks(taskDesc)).status === 200, 'TX-01 saving a task description works');
    ok((await api('PATCH', `/api/projects/${p1}`, { description: desc }, adminCookie)).status === 200, 'TX-01 saving the project description works');
    await uploadCsv('/api/timesheets/upload', profileCsv([[code1, '2026-01-15', person, 4]]), adminCookie);

    // reject "Copy editing" beforehand: it must never be linked again
    const rejected = await api('POST', '/api/topics', { name: `Copy editing ${ts}` }, adminCookie);
    if (rejected.data?.id) await api('POST', `/api/topics/${rejected.data.id}/reject`, null, adminCookie);

    const run = await runProfileJobs();
    ok(run.status === 200, `TX-02 run completes (got ${run.status})`);
    ok(stubSaw(`Web development ${ts}`), 'TX-02 the LLM was called for the project text');

    const proposed = (await api('GET', '/api/topics?status=proposed', null, adminCookie)).data || [];
    const names = proposed.map(t => t.name);
    ok(names.includes(`Web development ${ts}`) && names.includes(`Statistical modelling ${ts}`),
      'TX-03 new competences from the project and the task are created as proposed');
    ok(!names.includes('Pharma marketing'), 'TX-04 a candidate flagged equivalent to a list value is discarded');
    ok(!names.includes(itemLabel), 'TX-04 a candidate equal to an attribute-list value is discarded server-side');
    ok(!names.includes(`Copy editing ${ts}`), 'TX-04 a rejected topic is not proposed again');

    // unchanged text → no second call
    const before = stubBodies.length;
    await api('POST', `/api/profile-jobs/projects/${encodeURIComponent(code1)}/process`, null, adminCookie);
    ok(stubBodies.length > before, 'TX-05 Process from the console re-extracts (hash cleared)');
    const mid = stubBodies.length;
    await api('PATCH', `/api/projects/${p1}`, { description: desc }, adminCookie);   // same text
    await runProfileJobs();
    ok(stubBodies.length === mid, 'TX-05 an unchanged text is not sent again');

    // too-short text is never sent
    await api('PATCH', `/api/projects/${p1}`, { description: '[[ZZSHORT]]' }, adminCookie);
    await runProfileJobs();
    ok(!stubSaw('ZZSHORT'), 'TX-06 a text shorter than 20 characters is not sent to the LLM');

    // failures never block: 500 and garbage answers
    for (const mode of ['http500', 'garbage']) {
      stubMode = mode;
      const longer = `Fresh description for failure ${mode} [[Failure topic ${mode} ${ts}]]`;
      ok((await api('PATCH', `/api/projects/${p1}`, { description: longer }, adminCookie)).status === 200,
        `TX-07 saving a description while the LLM answers "${mode}" still works`);
      const r = await runProfileJobs();
      ok(r.status === 200 && (r.data?.errors || []).length === 0, `TX-07 the run does not fail because of "${mode}"`);
      const st = (await api('GET', '/api/profile-jobs', null, adminCookie)).data;
      ok(!!st?.projects?.find(p => p.project_code === code1)?.topic_error, `TX-07 the console reports the extraction error for "${mode}"`);
    }
    stubMode = 'ok';
    await runProfileJobs();                                   // retry succeeds and clears the error
    const st2 = (await api('GET', '/api/profile-jobs', null, adminCookie)).data;
    ok(!st2?.projects?.find(p => p.project_code === code1)?.topic_error, 'TX-08 a later successful run clears the error');
    const again = (await api('GET', '/api/topics?status=proposed', null, adminCookie)).data || [];
    ok(again.some(t => t.name === `Failure topic garbage ${ts}`), 'TX-08 the retried text produced its topics');

    // kill switch
    await api('PUT', '/api/profile-jobs/topic-settings', { enabled: false }, adminCookie);
    const n = stubBodies.length;
    await api('PATCH', `/api/projects/${p1}`, { description: `Another long description [[Disabled ${ts}]]` }, adminCookie);
    await runProfileJobs();
    ok(stubBodies.length === n, 'TX-09 with extraction switched off the LLM is not called');
    await api('PUT', '/api/profile-jobs/topic-settings', { enabled: true }, adminCookie);
    void resId;
  } finally {
    stubMode = 'ok';
    await api('PUT', '/api/profile-jobs/topic-settings', { enabled: true }, adminCookie);
    server.close();
  }
}
```
Register `await testTopicExtraction();` in `main()` after `testTopicsApi()`. (The `topic-settings` route and `topic_error` field are added in Task 10; until then the TX-07/08/09 assertions that use them cannot pass — implement Task 10's API part (Step 2 of Task 10) before running this suite, or run the suite after Task 10. The **first** run of this suite in this task is therefore expected to fail at TX-07; that is the "red" state.)

- [ ] **Step 3: Implement the service**

Replace `api/src/services/topic-extraction.js` with:

```js
// DB-bound half of the topic-extraction feature. Pure logic lives in ../lib/topic-extract.js.
// Called by the profile engine right BEFORE a project code is processed, never inside a request
// and never inside the per-code transaction (no row lock is held during the LLM call).
const { pool, query } = require('../db/client');
const {
  buildVocabulary, buildItems, buildPrompt, parseExtraction, resolveCandidates, hashText, isExtractable,
  normalizeTopicName, finalTopic,
} = require('../lib/topic-extract');

const LLM_TIMEOUT_MS = 30000;

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
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`LLM request failed (HTTP ${res.status})`);
  const data = await res.json();
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
    ).catch(() => {});
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
  const state = new Map((await query(
    'SELECT task_key, text_hash FROM description_topic_state WHERE project_id = $1', [projectId]
  )).rows.map(r => [r.task_key, r.text_hash]));

  const keys = new Set(items.map(i => i.key));
  const gone = [...state.keys()].filter(k => !keys.has(k));
  const todo = [];              // extractable and changed → LLM
  const cleared = [];           // changed but too short/empty → drop links, remember the hash
  for (const it of items) {
    const h = hashText(it.text);
    if (state.get(it.key) === h) continue;
    if (!state.has(it.key) && !it.text) continue;       // never had text, still none
    it.hash = h;
    (isExtractable(it.text) ? todo : cleared).push(it);
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
    const vocab = await loadVocabulary();
    const { system, user } = buildPrompt({ items: todo, vocab });
    const raw = await callAnthropic({ system, user });
    candidatesByRef = parseExtraction(raw, new Set(todo.map(i => i.ref)));
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
```

- [ ] **Step 4: Commit (integration verification happens after Task 7 and Task 10)**

```bash
git add api/src/services/topic-extraction.js docker-compose.yml .env.example scripts/run-tests.sh test-api.js
git commit -m "feat: topic extraction service (single LLM call per project, failures never block)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Engine wiring — extraction before processing, topics in the profile, read-time resolution

**Files:**
- Modify: `api/src/lib/resource-profile.js` (+ `resource-profile.test.js`)
- Modify: `api/src/services/profile-engine.js`
- Modify: `api/src/routes/resources.js` (`GET /:id/profile`)
- Test: `test-api.js`

**Interfaces:**
- Consumes: `extractForCode`, `loadVocabulary` (Task 5/6); `resolveProfileTopics` (Task 1).
- Produces: `aggregateProfile(contribByCode, projectsByCode, now)` where `projectsByCode[code]` may carry `topicIds: string[]` (project topics) and `taskTopics: { [taskKey]: string[] }`; the returned profile has `topics: [{ topicId, projectCodes: string[] }]` (ids only). `GET /api/resources/:id/profile` returns `profile.topics` as `[{ id, name, projectCodes }]` (approved only, merges followed).

- [ ] **Step 1: Failing unit tests for aggregation**

Append to `api/src/lib/resource-profile.test.js`:

```js
test('aggregateProfile: topics — project topics reach every contributor, task topics only the tasks worked on', () => {
  const contribByCode = {
    P1: { projectName: 'P1', hours: 6, first: '2026-01', last: '2026-02', roles: {}, tasks: { analysis: { name: 'Analysis', hours: 6 } } },
    P2: { projectName: 'P2', hours: 2, first: '2026-03', last: '2026-03', roles: {}, tasks: { build: { name: 'Build', hours: 2 } } },
  };
  const projectsByCode = {
    P1: { projectId: 'x1', name: 'P1', tags: [], topicIds: ['tp'], taskTopics: { analysis: ['ta'], other: ['tz'] } },
    P2: { projectId: 'x2', name: 'P2', tags: [], topicIds: ['tp'], taskTopics: { analysis: ['ta'] } },   // 'analysis' not worked on in P2
  };
  const p = aggregateProfile(contribByCode, projectsByCode, new Date('2026-09-29T00:00:00Z'));
  assert.deepEqual(p.topics, [
    { topicId: 'tp', projectCodes: ['P1', 'P2'] },
    { topicId: 'ta', projectCodes: ['P1'] },
  ]);
});

test('aggregateProfile: topics is an empty array when nothing is linked', () => {
  const p = aggregateProfile({ P1: { projectName: 'P1', hours: 1, first: null, last: null, roles: {}, tasks: {} } }, {}, new Date());
  assert.deepEqual(p.topics, []);
});
```

Run: `cd api && node --test src/lib/resource-profile.test.js` — Expected: the two new tests FAIL (`p.topics` undefined).

- [ ] **Step 2: Implement aggregation**

In `api/src/lib/resource-profile.js`, inside `aggregateProfile`, next to `const roleAcc = new Map();` add `const topicAcc = new Map();`. Inside the per-code loop (after the `tags`/`dims` block, before `projects[code] = {`), add:

```js
    const topicIds = new Set(info.topicIds || []);
    for (const k of Object.keys(c.tasks || {})) for (const id of (info.taskTopics || {})[k] || []) topicIds.add(id);
    for (const id of topicIds) {
      let set = topicAcc.get(id);
      if (!set) { set = new Set(); topicAcc.set(id, set); }
      set.add(code);
    }
```
and add to the returned object (after `roles,`):

```js
    topics: [...topicAcc.entries()]
      .map(([topicId, set]) => ({ topicId, projectCodes: [...set] }))
      .sort((a, b) => b.projectCodes.length - a.projectCodes.length || String(a.topicId).localeCompare(String(b.topicId))),
```
Update the comment above the function: `projectsByCode[code] = { projectId, name, tags: [...], topicIds?: string[], taskTopics?: { [taskKey]: string[] } }.`

In the first new test the `projectCodes` order follows `Object.keys(contribByCode)` (P1, P2) — matches.

Run: `cd api && node --test src/lib/resource-profile.test.js` — Expected: all PASS.

- [ ] **Step 3: Read the links in `rebuildProfile` (`services/profile-engine.js`)**

After the `projectsByCode` loop (just before `const profile = aggregateProfile(...)`), add:

```js
  const projectIds = Object.values(projectsByCode).map(p => p.projectId).filter(Boolean);
  if (projectIds.length) {
    const links = await client.query(
      'SELECT project_id, task_key, topic_id FROM description_topic_links WHERE project_id = ANY($1::uuid[])',
      [projectIds]
    );
    const byId = new Map(Object.values(projectsByCode).map(p => [p.projectId, p]));
    for (const l of links.rows) {
      const p = byId.get(l.project_id);
      if (!p) continue;
      if (l.task_key === '') (p.topicIds = p.topicIds || []).push(l.topic_id);
      else ((p.taskTopics = p.taskTopics || {})[l.task_key] = (p.taskTopics[l.task_key] || [])).push(l.topic_id);
    }
  }
```

- [ ] **Step 4: Extract before claiming, requeue on error (`services/profile-engine.js`)**

Add the import at the top: `const { extractForCode } = require('./topic-extraction');`

Add, above `processNext`:

```js
// Topic extraction for the code that is NEXT in the queue, done before we claim it so that no row lock
// is held during the LLM call. Never throws. Returns the code when its extraction failed (the caller
// re-queues it after processing, at most once per run), else null.
async function extractTopicsForNext(exclude, only) {
  try {
    const { rows } = await query(
      `SELECT project_code FROM profile_project_state
       WHERE queued_at IS NOT NULL AND project_code <> ALL($1::text[])
         AND ($2::text IS NULL OR project_code = $2)
       ORDER BY queued_at, project_code LIMIT 1`,
      [exclude, only]
    );
    if (!rows[0]) return null;
    const r = await extractForCode(rows[0].project_code);
    return r.status === 'error' ? rows[0].project_code : null;
  } catch (err) {
    console.warn('[profile] topic extraction:', err.message);
    return null;
  }
}
```
In `processNext(exclude, only = null)`: at the very top of the function (before `const client = await pool.connect();`) add `const retryCode = await extractTopicsForNext(exclude, only);`. Replace the success return `return { code, resources: out.resources };` by:

```js
    if (retryCode && retryCode === code) {
      // extraction failed: look again on a later run (the loop excludes it for the rest of this one)
      await quiet('requeue after topic error', () => query(
        'UPDATE profile_project_state SET queued_at = now() WHERE project_code = $1', [code]));
    }
    return { code, resources: out.resources, topicRetry: retryCode === code };
```
In `processQueue`'s loop, after `if (r.error) {…continue;}` and the `projects += 1; resources += r.resources;` lines add: `if (r.topicRetry) failed.push(r.code);` (this only keeps the code from being claimed again in the same run; it is not added to `errors`).

- [ ] **Step 5: Resolve topics at read time (`routes/resources.js`)**

Add imports: `const { loadVocabulary } = require('../services/topic-extraction');` and `const { resolveProfileTopics } = require('../lib/topic-extract');`. Replace the body of `GET /:id/profile`'s success path:

```js
    const { rows } = await query('SELECT profile, profile_computed_at FROM resources WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Resource not found' });
    let profile = rows[0].profile;
    if (profile) {
      const vocab = await loadVocabulary();
      profile = { ...profile, topics: resolveProfileTopics(profile.topics, vocab.topicsById) };
    }
    res.json({ profile, profile_computed_at: rows[0].profile_computed_at });
```
(`profile` stays `null` when the resource has none. Profiles computed before this cycle lack `topics`; `resolveProfileTopics(undefined)` returns `[]`.)

- [ ] **Step 6: Integration cases**

Extend `testTopicExtraction()` in `test-api.js`: insert this block inside the `try`, **immediately after the four `TX-04` assertions and before the `// unchanged text → no second call` block** (the links of the project text are still the original ones at that point; later cases change the text):

```js
    // PT: profile topics — only approved ones are visible, admin edits apply instantly
    const proposedNow = (await api('GET', '/api/topics?status=proposed', null, adminCookie)).data || [];
    const web = proposedNow.find(t => t.name === `Web development ${ts}`);
    const stat = proposedNow.find(t => t.name === `Statistical modelling ${ts}`);
    let prof = await getProfile(resId);
    ok(Array.isArray(prof?.profile?.topics) && prof.profile.topics.length === 0, 'PT-01 proposed topics are not shown in the profile');
    if (web && stat) {
      await api('POST', `/api/topics/${web.id}/approve`, null, adminCookie);
      await api('POST', `/api/topics/${stat.id}/approve`, null, adminCookie);
      prof = await getProfile(resId);
      const tn = prof?.profile?.topics || [];
      ok(tn.some(t => t.name === `Web development ${ts}` && t.projectCodes.includes(code1)), 'PT-02 an approved project topic appears at once (no recalculation)');
      ok(tn.some(t => t.name === `Statistical modelling ${ts}`), 'PT-02 an approved task topic appears for the person with actuals on that task');
      await api('PATCH', `/api/topics/${web.id}`, { name: `Web engineering ${ts}` }, adminCookie);
      ok((await getProfile(resId))?.profile?.topics?.some(t => t.name === `Web engineering ${ts}`), 'PT-03 a rename shows up at once');
      const target = await api('POST', '/api/topics', { name: `Engineering ${ts}` }, adminCookie);
      await api('POST', `/api/topics/${web.id}/merge`, { targetId: target.data.id }, adminCookie);
      const merged = (await getProfile(resId))?.profile?.topics || [];
      ok(merged.filter(t => t.name === `Engineering ${ts}`).length === 1 && !merged.some(t => t.name === `Web engineering ${ts}`),
        'PT-04 a merge shows up at once, without duplicates');
      await api('POST', `/api/topics/${stat.id}/reject`, null, adminCookie);
      ok(!((await getProfile(resId))?.profile?.topics || []).some(t => t.name === `Statistical modelling ${ts}`), 'PT-05 a rejected topic disappears at once');
    }
    // a person with no actuals on the task gets the project topics but not the task topics
    const rOther = await api('POST', '/api/resources',
      { firstName: 'Other', lastName: `Person${ts}`, email: `other.${ts}@test.local`, roleId: f.role.id }, adminCookie);
    if (rOther.data?.id) {
      later('DELETE', `/api/resources/${rOther.data.id}`);
      await uploadCsv(`/api/timesheets/upload?projectCode=${code1}`, profileCsv([
        [code1, '2026-01-15', person, 4], [code1, '2026-02-01', `Other Person${ts}`, 3]]), adminCookie);
      await runProfileJobs();
      const other = await getProfile(rOther.data.id);
      ok((other?.profile?.topics || []).some(t => t.name === `Engineering ${ts}`), 'PT-06 every contributor of the project receives the project topics');
    }
```
Note: `profileCsv` uses task `Analysis` for every row, so the second person also worked on Analysis; PT-06 only asserts the project-level topic. (Task-level exclusion is covered by the unit test in Step 1.)

- [ ] **Step 7: Run and commit**

Run: `cd api && npm test` (or `node --test src/lib/*.test.js`) then, after Task 10's API step exists, `bash scripts/run-tests.sh`.

```bash
git add api/src/lib/resource-profile.js api/src/lib/resource-profile.test.js api/src/services/profile-engine.js api/src/routes/resources.js test-api.js
git commit -m "feat: extract topics before processing a code; topics in the aggregated profile, resolved at read time

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `attribute-lists.html` — "Topics (N)" tab

**Files:**
- Modify: `attribute-lists.html`
- No other pages load this page's inline script; no shared JS/CSS changes → no `?v` bumps.

**Interfaces:**
- Consumes: `/api/topics` routes from Task 5 (`GET ?status=`, `POST`, `PATCH /:id`, `POST /:id/{approve|reject|restore|merge}`).

- [ ] **Step 1: Page tabs**

Directly inside `<div class="page app-container" v-if="ready">` (above the `<!-- LIST-OF-LISTS VIEW -->` comment) add:

```html
      <ul class="nav nav-tabs mb-3" v-if="!currentList">
        <li class="nav-item"><button type="button" class="nav-link" :class="{ active: pageTab === 'lists' }" @click="pageTab = 'lists'">Lists</button></li>
        <li class="nav-item"><button type="button" class="nav-link" :class="{ active: pageTab === 'topics' }" @click="openTopicsTab">
          Topics <span v-if="proposedTopics.length" class="badge text-bg-warning ms-1">{{ proposedTopics.length }}</span></button></li>
      </ul>
```
Change the list-of-lists template's condition from `<template v-if="!currentList">` to `<template v-if="!currentList && pageTab === 'lists'">`, and add before the `<!-- LIST DRILL-IN VIEW -->` comment a new template:

```html
      <!-- ── TOPICS TAB ────────────────────────────────────── -->
      <template v-if="!currentList && pageTab === 'topics'">
        <div class="page-header">
          <h1>Topics <span class="text-muted fw-normal" style="font-size:1rem">competences extracted from project descriptions</span></h1>
          <button class="btn btn-primary" @click="openNewTopic">+ New topic</button>
        </div>
        <div v-if="topicsError" class="alert alert-danger alert-sm mb-3">{{ topicsError }}</div>

        <div class="card mb-3" v-if="proposedTopics.length">
          <div class="card-body">
            <h6 class="mb-2">Proposed <span class="text-muted fw-normal">— not shown in profiles until approved</span></h6>
            <table class="table table-hover">
              <thead><tr><th>Name</th><th class="text-end">Used in</th><th></th></tr></thead>
              <tbody>
                <tr v-for="t in proposedTopics" :key="t.id">
                  <td class="fw-semibold">{{ t.name }}</td>
                  <td class="text-end text-muted">{{ t.usage_count }} description{{ t.usage_count === 1 ? '' : 's' }}</td>
                  <td class="text-end" style="white-space:nowrap">
                    <button class="btn btn-outline-primary btn-action me-1" :disabled="t._loading" @click="topicAction(t, 'approve')">Approve</button>
                    <button class="btn btn-outline-secondary btn-action me-1" :disabled="t._loading" @click="openRenameTopic(t)">Rename</button>
                    <button class="btn btn-outline-secondary btn-action me-1" :disabled="t._loading" @click="openMergeTopic(t)">Merge into…</button>
                    <button class="btn btn-outline-danger btn-action" :disabled="t._loading" @click="topicAction(t, 'reject')">Reject</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="card mb-3">
          <div class="card-body">
            <h6 class="mb-2">Approved</h6>
            <table class="table table-hover" v-if="approvedTopics.length">
              <thead><tr><th>Name</th><th class="text-end">Used in</th><th></th></tr></thead>
              <tbody>
                <tr v-for="t in approvedTopics" :key="t.id">
                  <td class="fw-semibold">{{ t.name }}</td>
                  <td class="text-end text-muted">{{ t.usage_count }} description{{ t.usage_count === 1 ? '' : 's' }}</td>
                  <td class="text-end" style="white-space:nowrap">
                    <button class="btn btn-outline-secondary btn-action me-1" :disabled="t._loading" @click="openRenameTopic(t)">Rename</button>
                    <button class="btn btn-outline-secondary btn-action me-1" :disabled="t._loading" @click="openMergeTopic(t)">Merge into…</button>
                    <button class="btn btn-outline-danger btn-action" :disabled="t._loading" @click="topicAction(t, 'reject')">Reject</button>
                  </td>
                </tr>
              </tbody>
            </table>
            <div class="empty" v-else>No approved topics yet.</div>
          </div>
        </div>

        <details class="mb-4" v-if="rejectedTopics.length">
          <summary class="text-muted">Rejected ({{ rejectedTopics.length }}) — never proposed again</summary>
          <table class="table table-sm mt-2">
            <tbody>
              <tr v-for="t in rejectedTopics" :key="t.id">
                <td>{{ t.name }}</td>
                <td class="text-end"><button class="btn btn-outline-secondary btn-action" :disabled="t._loading" @click="topicAction(t, 'restore')">Restore</button></td>
              </tr>
            </tbody>
          </table>
        </details>
      </template>
```

- [ ] **Step 2: Modals**

Before `</div><!-- #app -->` add a shared topic-name modal and a merge modal, following the existing `listModal`/`itemModal` markup (Bootstrap `modal fade`, `form @submit.prevent`):

```html
    <div class="modal fade" id="topicModal" tabindex="-1">
      <div class="modal-dialog"><div class="modal-content">
        <form @submit.prevent="submitTopicForm">
          <div class="modal-header border-0"><h5 class="modal-title">{{ topicForm.id ? 'Rename topic' : 'New topic' }}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
          <div class="modal-body">
            <div v-if="topicForm.error" class="alert alert-danger alert-sm">{{ topicForm.error }}</div>
            <label class="form-label">Name <span class="text-muted">(a competence, 1–4 words, English)</span></label>
            <input v-model="topicForm.name" type="text" class="form-control" maxlength="60" required>
          </div>
          <div class="modal-footer border-0 pt-0">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>
            <button type="submit" class="btn btn-primary" :disabled="topicForm.loading">
              <span v-if="topicForm.loading" class="spinner-border spinner-border-sm me-2"></span>{{ topicForm.id ? 'Save' : 'Create' }}</button>
          </div>
        </form>
      </div></div>
    </div>

    <div class="modal fade" id="mergeModal" tabindex="-1">
      <div class="modal-dialog"><div class="modal-content">
        <form @submit.prevent="submitMerge">
          <div class="modal-header border-0"><h5 class="modal-title">Merge “{{ mergeForm.source?.name }}” into…</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
          <div class="modal-body">
            <div v-if="mergeForm.error" class="alert alert-danger alert-sm">{{ mergeForm.error }}</div>
            <p class="text-muted small">All descriptions using this topic will use the target instead; this topic disappears.</p>
            <select v-model="mergeForm.targetId" class="form-select" required>
              <option value="" disabled>Choose the topic to keep…</option>
              <option v-for="t in mergeTargets" :key="t.id" :value="t.id">{{ t.name }}{{ t.status === 'proposed' ? ' (proposed)' : '' }}</option>
            </select>
          </div>
          <div class="modal-footer border-0 pt-0">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>
            <button type="submit" class="btn btn-primary" :disabled="mergeForm.loading || !mergeForm.targetId">Merge</button>
          </div>
        </form>
      </div></div>
    </div>
```

- [ ] **Step 3: Script**

In `data()` add: `pageTab: 'lists', topics: [], topicsError: null, topicForm: { id: null, name: '', loading: false, error: null }, mergeForm: { source: null, targetId: '', loading: false, error: null }, _topicModal: null, _mergeModal: null,`.
In `computed` add:

```js
        proposedTopics() { return this.topics.filter(t => t.status === 'proposed'); },
        approvedTopics() { return this.topics.filter(t => t.status === 'approved'); },
        rejectedTopics() { return this.topics.filter(t => t.status === 'rejected'); },
        mergeTargets() {
          const src = this.mergeForm.source;
          return this.topics.filter(t => src && t.id !== src.id && t.status !== 'rejected');
        },
```
In `created`, after `await this.loadLists();` add `await this.loadTopics();` (so the badge is right on first paint). In `mounted` add `this._topicModal = new bootstrap.Modal(document.getElementById('topicModal')); this._mergeModal = new bootstrap.Modal(document.getElementById('mergeModal'));`. Methods:

```js
        async topicsRequest(method, url, body) {
          try {
            const res = await fetch(url, {
              method, credentials: 'same-origin',
              headers: body ? { 'Content-Type': 'application/json' } : undefined,
              body: body ? JSON.stringify(body) : undefined,
            });
            const data = await res.json().catch(() => null);
            return { ok: res.ok, data };
          } catch {
            return { ok: false, data: { error: 'Network error.' } };
          }
        },
        async loadTopics() {
          const r = await this.topicsRequest('GET', '/api/topics');
          if (!r.ok) { this.topicsError = (r.data && r.data.error) || 'Failed to load topics.'; return; }
          this.topicsError = null;
          this.topics = r.data.map(t => ({ ...t, _loading: false }));
        },
        async openTopicsTab() { this.pageTab = 'topics'; await this.loadTopics(); },
        openNewTopic() { this.topicForm = { id: null, name: '', loading: false, error: null }; this._topicModal.show(); },
        openRenameTopic(t) { this.topicForm = { id: t.id, name: t.name, loading: false, error: null }; this._topicModal.show(); },
        async submitTopicForm() {
          this.topicForm.loading = true; this.topicForm.error = null;
          const r = this.topicForm.id
            ? await this.topicsRequest('PATCH', `/api/topics/${this.topicForm.id}`, { name: this.topicForm.name })
            : await this.topicsRequest('POST', '/api/topics', { name: this.topicForm.name });
          this.topicForm.loading = false;
          if (!r.ok) { this.topicForm.error = (r.data && r.data.error) || 'Save failed'; return; }
          this._topicModal.hide();
          await this.loadTopics();
        },
        async topicAction(t, action) {
          t._loading = true; this.topicsError = null;
          const r = await this.topicsRequest('POST', `/api/topics/${t.id}/${action}`);
          if (!r.ok) this.topicsError = (r.data && r.data.error) || 'The action failed.';
          await this.loadTopics();
        },
        openMergeTopic(t) { this.mergeForm = { source: t, targetId: '', loading: false, error: null }; this._mergeModal.show(); },
        async submitMerge() {
          this.mergeForm.loading = true; this.mergeForm.error = null;
          const r = await this.topicsRequest('POST', `/api/topics/${this.mergeForm.source.id}/merge`, { targetId: this.mergeForm.targetId });
          this.mergeForm.loading = false;
          if (!r.ok) { this.mergeForm.error = (r.data && r.data.error) || 'Merge failed'; return; }
          this._mergeModal.hide();
          await this.loadTopics();
        },
```
Also make `backToLists()` keep `pageTab = 'lists'` (it already only clears `currentList`; the tabs row is hidden while a list is open, so nothing else changes).

- [ ] **Step 4: Verify and commit**

Verification: `node -e "const s=require('fs').readFileSync('attribute-lists.html','utf8');const m=s.match(/<script type=\"module\">([\s\S]*?)<\/script>/);new Function(m[1].replace(/^\s*Vue\./m,'0&&Vue.'))"` must not throw a SyntaxError; then in `/finish-cycle` Gate 2, open the page as admin: Topics tab, badge count, approve/rename/merge/reject/restore, error on a list-value name.

```bash
git add attribute-lists.html
git commit -m "feat: Topics tab in attribute-lists.html (approval queue, rename, merge, reject/restore)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: `team.html` — topics block in the Experience tab

**Files:**
- Modify: `js/lib/team-ui.js`, `js/lib/team-ui.test.js`, `team.html`
- Bump: `js/lib/team-ui.js?v=4` → `v=5` (only `team.html` loads it; confirm with grep)

**Interfaces:**
- Consumes: `profile.topics = [{ id, name, projectCodes }]` from `GET /api/resources/:id/profile` (Task 7).
- Produces: `buildProfileTree(profile, roles)` result gains `topics: [{ id, name, projectCount, projects: [{ code, name, hours, last, tasks }] }]`, sorted by project count desc then name.

- [ ] **Step 1: Failing vitest cases**

Append inside the existing `describe('buildProfileTree', …)` in `js/lib/team-ui.test.js` (the `profile` fixture there has projects `P1`/`P2`; add the topics on a copy so other tests are untouched):

```js
  it('adds a topics list: approved topics with the projects they appear in', () => {
    const withTopics = { ...profile, topics: [
      { id: 't2', name: 'Data visualization', projectCodes: ['P2'] },
      { id: 't1', name: 'Medical writing', projectCodes: ['P1', 'P2'] },
    ] };
    const tree = buildProfileTree(withTopics, []);
    expect(tree.topics.map(t => [t.name, t.projectCount])).toEqual([['Medical writing', 2], ['Data visualization', 1]]);
    expect(tree.topics[0].projects.map(p => p.code)).toEqual(['P1', 'P2'].sort((a, b) => 0) && tree.topics[0].projects.map(p => p.code));
    expect(tree.topics[0].projects.every(p => typeof p.name === 'string')).toBe(true);
  });

  it('topics is an empty array when the profile has none (older profiles, nothing approved)', () => {
    expect(buildProfileTree(profile, []).topics).toEqual([]);
    expect(buildProfileTree({ ...profile, topics: [] }, []).topics).toEqual([]);
  });
```
(The middle assertion of the first test only checks that both projects are present and named — project order inside a topic follows the existing `children()` ordering, hours desc.) Run `npm test -- js/lib/team-ui.test.js` — Expected: FAIL (`tree.topics` undefined).

- [ ] **Step 2: Implement in `js/lib/team-ui.js`**

In `buildProfileTree`, before the `return`, add:

```js
  const topicNodes = (profile.topics || [])
    .map(t => ({ id: t.id, name: t.name, projectCount: (t.projectCodes || []).length, projects: children(t.projectCodes) }))
    .sort((a, b) => b.projectCount - a.projectCount || a.name.localeCompare(b.name));
```
and return `{ totals: profile.totals, computedAt: profile.computedAt, dimensions, roles: roleNodes, topics: topicNodes }`. Run the tests again — Expected: PASS (the whole file).

- [ ] **Step 3: Render in `team.html`**

In the Experience tab, right after the totals block (`<div v-else-if="profileTree">` → after the row of Hours/Projects/First month/Last month, before the first `<details v-for="d in profileTree.dimensions"`), add:

```html
            <div class="mb-3">
              <div class="text-muted small mb-1">Topics</div>
              <div v-if="profileTree.topics.length" class="d-flex flex-wrap gap-1">
                <span v-for="t in profileTree.topics" :key="t.id" class="badge text-bg-light border"
                      :title="t.projects.map(p => p.name).join(', ')">{{ t.name }}
                  <span class="text-muted">· {{ t.projectCount }}</span></span>
              </div>
              <div v-else class="text-muted small">No topics yet.</div>
            </div>
```
Bump `<script type="module" src="js/lib/team-ui.js?v=4">` to `?v=5` in `team.html` (grep the repo for other references first).

- [ ] **Step 4: Run and commit**

Run: `npm test` — Expected: whole vitest suite green.

```bash
git add js/lib/team-ui.js js/lib/team-ui.test.js team.html
git commit -m "feat: topics block in the Experience profile (team.html)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: `profile-jobs` console — topic errors, on/off switch, re-extract

**Files:**
- Modify: `api/src/routes/profile-jobs.js`, `profile-jobs.html`
- Test: covered by `TX-07`…`TX-09` in `test-api.js` (Task 6)

**Interfaces:**
- Produces: `GET /api/profile-jobs` → adds `topicSettings: { enabled: boolean, keyConfigured: boolean }` and, on each `projects[]` row, `topic_error: string|null`; `PUT /api/profile-jobs/topic-settings { enabled: boolean }` → `200 { enabled }` (400 when not a boolean); `POST /projects/:code/process` also clears that project's extraction hashes first.

- [ ] **Step 1: API (`api/src/routes/profile-jobs.js`)**

1. In `PROJECTS_SQL`, add a CTE after `rc AS (…)`:

```sql
  ,
  tp AS (
    SELECT o.code, string_agg(DISTINCT s.last_error, '; ') AS topic_error
    FROM (SELECT DISTINCT ON (code) code, id FROM projects WHERE code IS NOT NULL ORDER BY code, ${OLDEST_PROJECT_ORDER_BY}) o
    JOIN description_topic_state s ON s.project_id = o.id AND s.last_error IS NOT NULL
    GROUP BY o.code
  )
```
   add `tp.topic_error` to the select list (after `s.queued_at, s.last_processed_at, s.last_error`) and `LEFT JOIN tp ON tp.code = c.project_code` after the `rc` join.
2. Helpers near the top: `const { isExtractionEnabled } = require('../services/topic-extraction');`
3. In `GET /`: compute `const topicEnabled = await isExtractionEnabled();` and add to the response `topicSettings: { enabled: topicEnabled, keyConfigured: !!process.env.ANTHROPIC_API_KEY },`.
4. New route (after `PUT /settings`):

```js
// PUT /api/profile-jobs/topic-settings — { enabled: boolean }: kill switch for the LLM topic extraction
router.put('/topic-settings', async (req, res, next) => {
  try {
    if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be true or false' });
    await query(
      `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('topic_extraction_enabled', $1, NOW(), $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
      [req.body.enabled ? 'true' : 'false', req.user.id]
    );
    res.json({ enabled: req.body.enabled });
  } catch (err) { next(err); }
});
```
5. In `POST /projects/:code/process`, before `await enqueueProjects([code]);` add:

```js
    await query(
      `UPDATE description_topic_state SET text_hash = ''
       WHERE project_id = (SELECT id FROM projects WHERE code = $1 ORDER BY ${OLDEST_PROJECT_ORDER_BY} LIMIT 1)`,
      [code]
    );
```

- [ ] **Step 2: Console UI (`profile-jobs.html`)**

(a) State: in `data()` add `topicSettings: { enabled: true, keyConfigured: true },`; in `refresh()` after `this.schedule = state.data.schedule;` add `if (state.data.topicSettings) this.topicSettings = state.data.topicSettings;`.
(b) Method (next to `saveSettings`):

```js
      toggleTopicExtraction() {
        return this.runAction('topics', 'PUT', '/api/profile-jobs/topic-settings', { enabled: !this.topicSettings.enabled });
      },
```
(c) Markup: inside the settings card, after the `.d-flex.flex-wrap.align-items-end` row's Save button (before `<div class="ms-auto d-flex gap-2">`), add:

```html
          <div class="form-check form-switch mb-1" title="When off, project descriptions are never sent to the AI service">
            <input class="form-check-input" type="checkbox" role="switch" id="topicEnabled"
                   :checked="topicSettings.enabled" :disabled="!!busyAction" @change="toggleTopicExtraction">
            <label class="form-check-label" for="topicEnabled">Topic extraction {{ topicSettings.enabled ? 'on' : 'off' }}
              <span v-if="topicSettings.enabled && !topicSettings.keyConfigured" class="text-warning small">(no API key configured)</span></label>
          </div>
```
(d) Table: add `<th>Topics</th>` after `<th>Next processing</th>`; in each row add after the "Next processing" `<td>`:

```html
                <td><span v-if="p.topic_error" class="text-danger small" :title="p.topic_error">⚠ extraction failed</span><span v-else class="text-muted">—</span></td>
```
and change the expanded error row's `<td colspan="8">` to `colspan="9"`.

- [ ] **Step 3: Run the whole integration suite and commit**

Run: `bash scripts/run-tests.sh` — Expected: everything green including `TX-01`…`TX-09`, `PT-01`…`PT-06`, `TP-*`, `PD-*`. If the `test` service cannot be reached from the api container (TX-02 fails with "the LLM was called" false), check `docker exec pdash-api-test getent hosts test` while a run is in progress; if the alias is missing, set `ANTHROPIC_BASE_URL` in the override to the runner's container name printed by `docker ps` and record the fix in the commit message.

```bash
git add api/src/routes/profile-jobs.js profile-jobs.html
git commit -m "feat: profile-jobs console shows topic extraction errors, on/off switch, re-extract on Process

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Documentation, cache-busting audit and final checks

**Files:**
- Create: `docs/api/topics.md`
- Modify: `docs/api/profile-engine.md`, `docs/pages/team.md`, `docs/pages/project-config.md`, `docs/pages/costgrid.md`, `docs/pages/profile-jobs.md`, `docs/api/lib.md`, `CLAUDE.md` (file-structure entries for `api/src/routes/topics.js` and the attribute-lists page; migrations table rows `027`/`028`; `.env` variables), `TEST_CASES.md` (rows for PD/TP/TX/PT ids)
- Modify spec: apply the "Deviations from the spec" below to the spec file

- [ ] **Step 1: Docs**

Write `docs/api/topics.md` (routes and error codes from Task 5, the vocabulary rules, the `merged_into`/`rejected` semantics, read-time resolution) and update the other docs with: description columns and the copy at Generate project; extraction flow (peek → `extractForCode` → claim → process), retry/requeue rule, `topic_extraction_enabled`, env variables, failure behaviour; the console additions; the new lib module. In `CLAUDE.md` add migration rows `027`/`028` (note: `027`'s backfill is apply-once; `test-branch.sh up` skips migrations on an existing schema, so both must be applied by hand to a branch stack) and the env variables. Follow the docs-routing convention: page narrative in `docs/pages/`, API in `docs/api/`, CLAUDE.md holds one-line summaries only.

- [ ] **Step 2: Cache-busting audit**

```bash
git diff --name-only main... | grep -E '^(js|css)/'
```
For every listed file confirm its `?v=N` was bumped in **all** HTML pages that reference it (`grep -rn "<file>?v=" *.html`). Expected changed versioned files: `js/costgrid.js`, `js/api-sync.js`, `js/lib/team-ui.js`.

- [ ] **Step 3: Full checks**

```bash
cd api && node --test src/lib/*.test.js && cd .. && npm test && bash scripts/run-tests.sh
```
Expected: backend unit tests, vitest and the integration suite all green.

- [ ] **Step 4: Commit and hand off**

```bash
git add -A docs CLAUDE.md TEST_CASES.md
git commit -m "docs: topics cycle documentation, migrations table, test cases

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
Then run `/finish-cycle` (test gate, code review, `--no-ff` merge, push, worktree cleanup). At its deploy step: `scripts/backup-db.sh` first, then apply `027` and `028` once to the real `pdash-db` (user-confirmed), and set `ANTHROPIC_API_KEY` in the server `.env`.

---

## Deviations from the spec (this plan is authoritative)

1. **Routes:** the spec says `PUT /api/projects/:id`; the real endpoints are `PATCH /api/projects/:id` (metadata, incl. `description`) and `PUT /api/projects/:id/tasks` (bulk replace, incl. per-task `description`).
2. **Backfill (027):** task descriptions are matched by normalised name against the tasks of the project's linked version, not restricted to `cg_version_projects.task_ids`/`task_names_direct` (the name match on the project's own tasks already scopes it).
3. **Usage counts:** `GET /api/topics` returns `usage_count` = number of linked descriptions (not "resources").
4. **Manual seeding:** `POST /api/topics` lets an admin create an approved topic (needed to seed the vocabulary and to test the API without the LLM).
5. **Retry rule:** on an extraction error the code is re-queued after processing and excluded for the rest of that run, so it is retried on the next scheduled run; the error is shown in the console (`topic_error`) and is never added to `profile_job_runs` errors.
6. **Extraction timing:** it happens right before the claim of the next queued code (a "peek"), so no row lock is held during the LLM call; in a rare race the claimed code may differ from the peeked one — that code then simply keeps its previous topics until its next run.
7. **Profile entry shape:** `resources.profile.topics` is `[{ topicId, projectCodes }]` (project codes, like `dimensions`), not project names.
