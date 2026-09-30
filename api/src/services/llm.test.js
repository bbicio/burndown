const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const llm = require('./llm');

test('toAnthropicMessages: tool calls become tool_use blocks, tool results become one user tool_result turn', () => {
  const out = llm.toAnthropicMessages([
    { role: 'user', content: 'rank it' },
    { role: 'assistant', content: 'sure', toolCalls: [{ id: 'c1', name: 'rank_team', input: { topN: 2 } }, { id: 'c2', name: 'explain_resource', input: {} }] },
    { role: 'tool', toolCallId: 'c1', content: '{"a":1}' },
    { role: 'tool', toolCallId: 'c2', content: '{"b":2}' },
  ]);
  assert.equal(out.length, 3);
  assert.deepEqual(out[1].content, [
    { type: 'text', text: 'sure' },
    { type: 'tool_use', id: 'c1', name: 'rank_team', input: { topN: 2 } },
    { type: 'tool_use', id: 'c2', name: 'explain_resource', input: {} },
  ]);
  assert.equal(out[2].role, 'user');
  assert.deepEqual(out[2].content.map(b => [b.type, b.tool_use_id]), [['tool_result', 'c1'], ['tool_result', 'c2']]);
});

test('fromAnthropicResponse: text blocks joined, tool_use blocks extracted', () => {
  const r = llm.fromAnthropicResponse({ content: [{ type: 'text', text: 'Hi ' }, { type: 'text', text: 'there' },
    { type: 'tool_use', id: 'x', name: 'rank_team', input: { topN: 1 } }] });
  assert.equal(r.text, 'Hi there');
  assert.deepEqual(r.toolCalls, [{ id: 'x', name: 'rank_team', input: { topN: 1 } }]);
});

test('isConfigured follows ANTHROPIC_API_KEY; chat without a key fails with LLM_NOT_CONFIGURED', async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(llm.isConfigured(), false);
  await assert.rejects(llm.chat({ system: 's', messages: [{ role: 'user', content: 'x' }], tools: [] }), e => e.code === 'LLM_NOT_CONFIGURED');
  if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
});

async function withStub(handler, fn) {
  const server = http.createServer((req, res) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => handler(JSON.parse(b), res)); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const saved = { k: process.env.ANTHROPIC_API_KEY, u: process.env.ANTHROPIC_BASE_URL };
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  try { await fn(); } finally {
    server.close();
    if (saved.k === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved.k;
    if (saved.u === undefined) delete process.env.ANTHROPIC_BASE_URL; else process.env.ANTHROPIC_BASE_URL = saved.u;
  }
}

test('chat: posts system/messages/tools and parses the answer', async () => {
  let seen;
  await withStub((body, res) => {
    seen = body;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }));
  }, async () => {
    const r = await llm.chat({ system: 'SYS', messages: [{ role: 'user', content: 'hello' }],
      tools: [{ name: 't', description: 'd', input_schema: { type: 'object', properties: {} } }] });
    assert.equal(r.text, 'ok');
    assert.deepEqual(r.toolCalls, []);
  });
  assert.equal(seen.system, 'SYS');
  assert.equal(seen.messages[0].content, 'hello');
  assert.equal(seen.tools[0].name, 't');
});

test('chat: HTTP errors and non-JSON answers fail with LLM_ERROR and never echo the body', async () => {
  await withStub((_b, res) => { res.statusCode = 500; res.end('secret project text'); }, async () => {
    await assert.rejects(llm.chat({ system: 's', messages: [{ role: 'user', content: 'x' }], tools: [] }),
      e => e.code === 'LLM_ERROR' && !/secret/.test(e.message));
  });
  await withStub((_b, res) => { res.end('<html>secret project text</html>'); }, async () => {
    await assert.rejects(llm.chat({ system: 's', messages: [{ role: 'user', content: 'x' }], tools: [] }),
      e => e.code === 'LLM_ERROR' && !/secret/.test(e.message));
  });
});

test('chat: an empty tools list omits the tools field', async () => {
  let seen;
  await withStub((body, res) => { seen = body; res.end(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] })); }, async () => {
    await llm.chat({ system: 's', messages: [{ role: 'user', content: 'x' }], tools: [] });
  });
  assert.equal(seen.tools, undefined);
});

test('chat: tool_choice is sent only when requested', async () => {
  const seen = [];
  await withStub((body, res) => { seen.push(body); res.end(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] })); }, async () => {
    const tools = [{ name: 't', description: 'd', input_schema: { type: 'object', properties: {} } }];
    await llm.chat({ system: 's', messages: [{ role: 'user', content: 'x' }], tools });
    await llm.chat({ system: 's', messages: [{ role: 'user', content: 'x' }], tools, toolChoice: { type: 'none' } });
  });
  assert.equal(seen[0].tool_choice, undefined);
  assert.deepEqual(seen[1].tool_choice, { type: 'none' });
  assert.equal(seen[1].tools.length, 1);
});

test('chat: a passed signal is added to the per-call timeout, not a replacement', async () => {
  await withStub((_b, res) => { setTimeout(() => res.end('{}'), 300); }, async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 30);
    await assert.rejects(llm.chat({ system: 's', messages: [{ role: 'user', content: 'x' }], tools: [], signal: ac.signal }), e => e.code === 'LLM_ERROR');
  });
  assert.equal(typeof llm.composeSignal(new AbortController().signal, 1000).aborted, 'boolean');
});
