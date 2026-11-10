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

test('refund gives back one slot, never below zero, and ignores an unknown key', () => {
  const l = createLimiter({ windowMs: 1000, max: 2 });
  l.hit('k', 0);
  l.hit('k', 0);
  assert.equal(l.hit('k', 1).allowed, false);
  l.refund('k', 2);
  assert.equal(l.hit('k', 3).allowed, true);
  assert.equal(l.hit('k', 4).allowed, false);
  l.refund('nobody', 5);
  for (let i = 0; i < 5; i++) l.refund('k', 6);
  assert.equal(l.hit('k', 7).allowed, true);
  assert.equal(l.hit('k', 8).allowed, true);
  assert.equal(l.hit('k', 9).allowed, false);
});

test('a refund aimed at an earlier window does not touch the current one', () => {
  const l = createLimiter({ windowMs: 1000, max: 2 });
  const first = l.hit('k', 0);
  assert.equal(typeof first.window, 'number');
  const second = l.hit('k', 1500);
  assert.equal(second.allowed, true);
  l.refund('k', 1600, first.window);
  l.hit('k', 1700);
  assert.equal(l.hit('k', 1800).allowed, false);
  l.refund('k', 1900, second.window);
  assert.equal(l.hit('k', 1950).allowed, true);
});
