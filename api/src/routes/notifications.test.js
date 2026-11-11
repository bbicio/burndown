const test = require('node:test');
const { mock } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

// The session check reads `query` and the JWT secret when its modules load: both are set first. `answer`
// is what the next users query does.
process.env.JWT_SECRET = 'test-secret';
const client = require('../db/client');
let answer;
let queries = 0;
client.query = (...args) => { queries++; return answer(...args); };
const { router, pushToUser } = require('./notifications');

const layer = router.stack.find(l => l.route && l.route.path === '/stream');
const handler = layer.route.stack[layer.route.stack.length - 1].handle;
const HEARTBEAT = ': heartbeat\n\n';
const row = (status, pwd = null) => async () => ({ rows: [{ status, role: 'user', pwd }] });
const settle = () => new Promise(r => setImmediate(r));

// A stream as the handler sees it: res.end() closes the request, as the socket does.
function open(userId = 'u') {
  const req = new EventEmitter();
  req.user = { id: userId, email: 'e', role: 'user', pwd: null };
  const res = {
    writes: [], ends: 0,
    setHeader() {}, flushHeaders() {},
    write(s) { this.writes.push(s); },
    end() { this.ends++; req.emit('close'); },
  };
  handler(req, res);
  return { req, res };
}
// pushToUser writes to a response only while it is registered.
const registered = (res, userId = 'u') => {
  const before = res.writes.length;
  pushToUser(userId, { x: 1 });
  return res.writes.length > before;
};
async function tick() { mock.timers.tick(25000); await settle(); }

test.beforeEach(() => { queries = 0; mock.timers.enable({ apis: ['setInterval'] }); });
test.afterEach(() => mock.timers.reset());

test('a disabled row ends the stream', async () => {
  answer = row('disabled');
  const { res } = open();
  await tick();
  assert.equal(res.ends, 1);
  assert.ok(!res.writes.includes(HEARTBEAT));
  assert.equal(registered(res), false);
});

test('a changed password ends the stream', async () => {
  answer = row('active', '1700000000000');
  const { res } = open();
  await tick();
  assert.equal(res.ends, 1);
});

test('an active row keeps the stream', async () => {
  answer = row('active');
  const { req, res } = open();
  await tick();
  assert.ok(res.writes.includes(HEARTBEAT));
  assert.equal(res.ends, 0);
  assert.equal(registered(res), true);
  req.emit('close');
});

test('a failed check keeps the stream', async () => {
  const warn = mock.method(console, 'warn', () => {});
  answer = async () => { throw new Error('db down'); };
  const { req, res } = open();
  await tick();
  assert.ok(res.writes.includes(HEARTBEAT));
  assert.equal(res.ends, 0);
  assert.equal(warn.mock.callCount(), 1);
  warn.mock.restore();
  req.emit('close');
});

test('pending: a check still running starts no second one', async () => {
  answer = () => new Promise(() => {});
  const { req } = open();
  await tick();
  await tick();
  assert.equal(queries, 1);
  req.emit('close');
});

test('result after close: a check that ends after the client left neither writes nor ends', async () => {
  let resolve;
  answer = () => new Promise(r => { resolve = r; });
  const { req, res } = open();
  await tick();
  req.emit('close');
  const writes = res.writes.length;
  resolve({ rows: [{ status: 'disabled', role: 'user', pwd: null }] });
  await settle();
  assert.equal(res.writes.length, writes);
  assert.equal(res.ends, 0);
});

test('close after end: the ended stream runs no further check', async () => {
  answer = row('disabled');
  open();
  await tick();
  assert.equal(queries, 1);
  await tick();
  assert.equal(queries, 1);
});

test('only this connection: the other stream of the same user stays registered', async () => {
  const answers = [row('disabled'), row('active')];
  answer = (...a) => answers.shift()(...a);
  const first = open();
  const second = open();
  await tick();
  assert.equal(first.res.ends, 1);
  assert.equal(second.res.ends, 0);
  assert.equal(registered(second.res), true);
  second.req.emit('close');
});
