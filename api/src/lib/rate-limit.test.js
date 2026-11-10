const test = require('node:test');
const assert = require('node:assert/strict');
const { createLimiter } = require('./rate-limit');

test('allows max hits per window, then refuses with retryInMs', () => {
  const l = createLimiter({ windowMs: 1000, max: 3 });
  for (let i = 0; i < 3; i++) assert.equal(l.hit('k', 0).allowed, true);
  const r = l.hit('k', 100);
  assert.equal(r.allowed, false);
  assert.ok(r.retryInMs > 0 && r.retryInMs <= 1000);
});

test('window expiry allows again', () => {
  const l = createLimiter({ windowMs: 1000, max: 3 });
  for (let i = 0; i < 4; i++) l.hit('k', 0);
  assert.equal(l.hit('k', 1001).allowed, true);
});

test('keys are independent', () => {
  const l = createLimiter({ windowMs: 1000, max: 1 });
  l.hit('a', 0);
  assert.equal(l.hit('a', 1).allowed, false);
  assert.equal(l.hit('b', 1).allowed, true);
});

test('peek does not count', () => {
  const l = createLimiter({ windowMs: 1000, max: 1 });
  for (let i = 0; i < 5; i++) assert.equal(l.peek('k', 0).allowed, true);
  l.hit('k', 0);
  assert.equal(l.peek('k', 1).allowed, false);
});

test('reset clears a key', () => {
  const l = createLimiter({ windowMs: 1000, max: 1 });
  l.hit('k', 0);
  l.hit('k', 1);
  l.reset('k');
  assert.equal(l.hit('k', 2).allowed, true);
});

test('expired keys are purged on hit', () => {
  const l = createLimiter({ windowMs: 1000, max: 1 });
  l.hit('old', 0);
  l.hit('new', 5000);
  assert.equal(l.size(), 1);
});
