const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = 'x';
const { cookieSecure, cookieOptions, setAuthCookie, clearAuthCookie } = require('./jwt');

function withNodeEnv(value, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, 'NODE_ENV');
  const saved = process.env.NODE_ENV;
  if (value === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = value;
  try { return fn(); } finally {
    if (had) process.env.NODE_ENV = saved;
    else delete process.env.NODE_ENV;
  }
}

test('cookieSecure is false only for NODE_ENV=development', () => {
  assert.equal(withNodeEnv('development', cookieSecure), false);
  for (const v of ['production', 'test', 'Development', ' development', undefined]) {
    assert.equal(withNodeEnv(v, cookieSecure), true, `NODE_ENV=${JSON.stringify(v)}`);
  }
});

test('setAuthCookie uses cookieSecure', () => {
  const res = { cookie(name, value, opts) { this.opts = opts; } };
  withNodeEnv('production', () => setAuthCookie(res, { id: 1 }));
  assert.equal(res.opts.secure, true);
  withNodeEnv('development', () => setAuthCookie(res, { id: 1 }));
  assert.equal(res.opts.secure, false);
});

test('cookieOptions adds httpOnly and the current Secure flag to the given options', () => {
  assert.deepEqual(withNodeEnv('production', () => cookieOptions({ sameSite: 'lax', path: '/x' })),
    { httpOnly: true, secure: true, sameSite: 'lax', path: '/x' });
  assert.equal(withNodeEnv('development', () => cookieOptions({})).secure, false);
});

test('clearAuthCookie clears with the attributes the cookie was set with, minus maxAge', () => {
  const res = { clearCookie(name, opts) { this.name = name; this.opts = opts; } };
  withNodeEnv('production', () => clearAuthCookie(res));
  assert.equal(res.name, 'pdash_token');
  assert.deepEqual(res.opts, { httpOnly: true, secure: true, sameSite: 'lax' });
});
