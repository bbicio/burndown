'use strict';
// One interface for the team assistant's LLM: chat({ system, messages, tools, toolChoice, signal }) → { text, toolCalls }.
// Today a single backend (Anthropic Messages API with tool use, plain fetch, no dependency); a local
// model (LM Studio) is a later second backend behind the same interface. Error messages never
// include the response body (it may echo project text).
const LLM_TIMEOUT_MS = 30_000;

const llmError = (message, code = 'LLM_ERROR') => Object.assign(new Error(message), { code });
const isConfigured = () => !!process.env.ANTHROPIC_API_KEY;

// Neutral messages → Anthropic blocks. Consecutive tool results become ONE user turn.
function toAnthropicMessages(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === 'tool') {
      const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content };
      const last = out[out.length - 1];
      if (last && last.role === 'user' && Array.isArray(last.content) && last.content[0] && last.content[0].type === 'tool_result') last.content.push(block);
      else out.push({ role: 'user', content: [block] });
    } else if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length) {
      const blocks = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const c of m.toolCalls) blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: c.input || {} });
      out.push({ role: 'assistant', content: blocks });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

function fromAnthropicResponse(data) {
  const blocks = (data && data.content) || [];
  return {
    text: blocks.filter(b => b.type === 'text').map(b => b.text).join(''),
    toolCalls: blocks.filter(b => b.type === 'tool_use').map(b => ({ id: b.id, name: b.name, input: b.input || {} })),
  };
}

// A caller signal (e.g. the route's overall deadline) is ADDED to the per-call timeout.
const composeSignal = (signal, ms = LLM_TIMEOUT_MS) => (signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms));

async function chat({ system, messages, tools, toolChoice, signal }) {
  if (!isConfigured()) throw llmError('LLM is not configured', 'LLM_NOT_CONFIGURED');
  const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '');
  const body = {
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    system,
    messages: toAnthropicMessages(messages),
  };
  if (tools && tools.length) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;
  let res;
  try {
    res = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
      signal: composeSignal(signal),
    });
  } catch (err) {
    throw llmError(err && (err.name === 'TimeoutError' || err.name === 'AbortError') ? 'LLM request timed out' : 'LLM request failed');
  }
  if (!res.ok) throw llmError(`LLM request failed (HTTP ${res.status})`);
  let data;
  try { data = await res.json(); } catch { throw llmError('LLM answer is not JSON'); }
  return fromAnthropicResponse(data);
}

module.exports = { isConfigured, chat, composeSignal, toAnthropicMessages, fromAnthropicResponse };
