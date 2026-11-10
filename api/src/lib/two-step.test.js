const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('./two-step');

const NOW = Date.parse('2026-11-10T12:00:00Z');

test('constants', () => {
  assert.equal(T.CODE_TTL_MS, 600000);
  assert.equal(T.RESEND_COOLDOWN_MS, 60000);
  assert.equal(T.MAX_ATTEMPTS, 5);
  assert.equal(T.CHALLENGE_TTL_MS, 1800000);
  assert.equal(T.MAX_SENDS, 5);
  assert.equal(T.TRUST_DAYS, 30);
  assert.deepEqual(T.TWO_STEP_METHODS, ['email']);
});

test('generateCode is always six digits, leading zeros kept', () => {
  for (let i = 0; i < 1000; i++) assert.match(T.generateCode(), /^\d{6}$/);
});

test('normalizeCode keeps digits only', () => {
  assert.equal(T.normalizeCode(' 123-456 '), '123456');
  assert.equal(T.normalizeCode('123 456'), '123456');
  assert.equal(T.normalizeCode(null), '');
  assert.equal(T.normalizeCode(undefined), '');
});

test('hashCode is stable and bound to secret and challenge id', () => {
  const h = T.hashCode('s', 'id', '123456');
  assert.equal(h, T.hashCode('s', 'id', '123456'));
  assert.notEqual(h, T.hashCode('s', 'id2', '123456'));
  assert.notEqual(h, T.hashCode('t', 'id', '123456'));
  assert.match(h, /^[0-9a-f]{64}$/);
});

test('hashToken / newToken', () => {
  assert.match(T.hashToken('abc'), /^[0-9a-f]{64}$/);
  assert.match(T.newToken(), /^[0-9a-f]{64}$/);
  assert.notEqual(T.newToken(), T.newToken());
});

test('verifyOutcome', () => {
  const fresh = { attempts: 1, code_expires_at: new Date(NOW + 1000) };
  assert.deepEqual(T.verifyOutcome(fresh, NOW, true), { result: 'ok' });
  assert.deepEqual(T.verifyOutcome(fresh, NOW, false), { result: 'wrong', attemptsLeft: 4 });
  assert.deepEqual(T.verifyOutcome({ ...fresh, attempts: 5 }, NOW, false), { result: 'locked' });
  const old = { attempts: 1, code_expires_at: new Date(NOW - 1) };
  assert.deepEqual(T.verifyOutcome(old, NOW, true), { result: 'expired' });
  assert.deepEqual(T.verifyOutcome(old, NOW, false), { result: 'expired' });
});

test('resendWait', () => {
  assert.equal(T.resendWait({ code_sent_at: new Date(NOW - 10000), sends: 1 }, NOW), 50000);
  assert.equal(T.resendWait({ code_sent_at: new Date(NOW - 61000), sends: 1 }, NOW), 0);
  assert.equal(T.resendWait({ code_sent_at: null, sends: 1 }, NOW), 0);
  assert.equal(T.resendWait({ code_sent_at: null, sends: 5 }, NOW), 'exhausted');
});

test('maskEmail', () => {
  assert.equal(T.maskEmail('fabrizio@eversana.com'), 'f•••@eversana.com');
  assert.equal(T.maskEmail('a@b.it'), 'a•••@b.it');
});

test('deviceLabel', () => {
  const chromeWin = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const edgeWin = chromeWin + ' Edg/120.0.0.0';
  const safariIphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const chromeAndroid = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
  const firefoxMac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0';
  assert.deepEqual(T.deviceLabel(chromeWin), { label: 'Chrome on Windows', kind: 'desktop' });
  assert.deepEqual(T.deviceLabel(edgeWin), { label: 'Edge on Windows', kind: 'desktop' });
  assert.deepEqual(T.deviceLabel(safariIphone), { label: 'Safari on iPhone', kind: 'mobile' });
  assert.equal(T.deviceLabel(chromeAndroid).kind, 'mobile');
  assert.equal(T.deviceLabel(chromeAndroid).label, 'Chrome on Android');
  assert.deepEqual(T.deviceLabel(firefoxMac), { label: 'Firefox on macOS', kind: 'desktop' });
  assert.deepEqual(T.deviceLabel(''), { label: 'Unknown browser on Unknown device', kind: 'desktop' });
  assert.deepEqual(T.deviceLabel(undefined), { label: 'Unknown browser on Unknown device', kind: 'desktop' });
});

test('deviceTrusted', () => {
  const user = { id: 'u1', password_changed_at: new Date(NOW - 5 * 86400000) };
  const dev = { user_id: 'u1', created_at: new Date(NOW - 86400000), expires_at: new Date(NOW + 86400000) };
  assert.equal(T.deviceTrusted(dev, user, NOW), true);
  assert.equal(T.deviceTrusted({ ...dev, user_id: 'u2' }, user, NOW), false);
  assert.equal(T.deviceTrusted({ ...dev, expires_at: new Date(NOW - 1) }, user, NOW), false);
  assert.equal(T.deviceTrusted({ ...dev, created_at: new Date(NOW - 6 * 86400000) }, user, NOW), false);
  assert.equal(T.deviceTrusted(dev, { ...user, password_changed_at: null }, NOW), true);
  assert.equal(T.deviceTrusted(null, user, NOW), false);
});
