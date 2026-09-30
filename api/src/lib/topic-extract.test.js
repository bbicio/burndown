const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTask } = require('./resource-profile');
const {
  MIN_TEXT_CHARS, MAX_TOPICS_PER_TEXT, normalizeTopicName, cleanTopicName, taskKey, hashText, isExtractable,
  descriptionsSignature, buildItems, chunk, buildVocabulary, buildPrompt, parseExtraction, finalTopic,
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

test('chunk: empty, exact multiple, remainder, size <= 0 gives one chunk', () => {
  assert.deepEqual(chunk([], 10), []);
  assert.deepEqual(chunk([1, 2, 3, 4], 2), [[1, 2], [3, 4]]);
  assert.deepEqual(chunk(Array.from({ length: 23 }, (_, i) => i), 10).map(c => c.length), [10, 10, 3]);
  assert.deepEqual(chunk([1, 2, 3], 0), [[1, 2, 3]]);
  assert.deepEqual(chunk([1, 2, 3], -5), [[1, 2, 3]]);
});

test('resolveProfileTopics: provenance is carried only when present, merged topics combine, direct wins over context', () => {
  const out = resolveProfileTopics([
    { topicId: 't1', projectCodes: ['A'], direct: { hours: 6, projectCodes: ['A'] }, context: { projectCodes: [] } },
    { topicId: 't4', projectCodes: ['A', 'B'], direct: { hours: 0, projectCodes: [] }, context: { projectCodes: ['A', 'B'] } },
  ], vocab.topicsById);                                   // t4 is merged into t1
  assert.deepEqual(out, [{
    id: 't1', name: 'Medical writing', projectCodes: ['A', 'B'],
    direct: { hours: 6, projectCodes: ['A'] }, context: { projectCodes: ['B'] },
  }]);
});
