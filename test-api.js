#!/usr/bin/env node
/**
 * PDash API Integration Tests
 *
 * Usage:
 *   docker compose --profile test run --rm test
 *
 * Environment (set in docker-compose.yml):
 *   API_URL             default: http://api:3000
 *   TEST_ADMIN_EMAIL       default: test-admin@pdash.local
 *   TEST_ADMIN_PASSWORD    default: TestAdmin123!
 *   TEST_SYSADMIN_EMAIL    default: test-sysadmin@pdash.local
 *   TEST_SYSADMIN_PASSWORD default: TestSysAdmin123!
 */
'use strict';

const http = require('http');
const BASE = process.env.API_URL             || 'http://api:3000';
const EMAIL = process.env.TEST_ADMIN_EMAIL    || 'test-admin@pdash.local';
const PASS  = process.env.TEST_ADMIN_PASSWORD || 'TestAdmin123!';

// Sysadmin test account — bootstrapped separately (docker-compose.yml's `test`
// service runs create-admin.js + promote-sysadmin.js for this email). Used
// only for the admin/reset/* endpoints, which are sysadmin-exclusive.
const SYSADMIN_EMAIL = process.env.TEST_SYSADMIN_EMAIL    || 'test-sysadmin@pdash.local';
const SYSADMIN_PASS  = process.env.TEST_SYSADMIN_PASSWORD || 'TestSysAdmin123!';

// Far-future years unlikely to clash with real data
const TEST_YEAR   = 2099;
const TEST_YEAR_B = 2098;   // used by POT tests (avoids clash with pipeline-years tests)
const TEST_YEAR_D = 2093;   // pipeline year carried by Drafts (PYP-*), active
const TEST_YEAR_E = 2092;   // PYP-*, created inactive

let passed = 0, failed = 0;
let adminCookie = '';
let sysadminCookie = '';
const cleanupQueue = [];    // { method, path } — executed in reverse at the end

// ── Utilities ─────────────────────────────────────────────────────────────────

const green = s => `\x1b[32m${s}\x1b[0m`;
const red   = s => `\x1b[31m${s}\x1b[0m`;
const bold  = s => `\x1b[1m${s}\x1b[0m`;

function pass(label) { process.stdout.write(`  ${green('✓')} ${label}\n`); passed++; }
function fail(label) { process.stdout.write(`  ${red('✗')} ${label}\n`); failed++; }
function ok(cond, label) { cond ? pass(label) : fail(label); return !!cond; }
function section(name) { process.stdout.write(`\n${bold('── ' + name + ' ──')}\n`); }
function later(method, path) { cleanupQueue.push({ method, path }); }

async function api(method, path, body, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
    let data;
    try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data, headers: res.headers };
  } catch (e) {
    fail(`FETCH ERROR ${method} ${path}: ${e.message}`);
    return { status: 0, data: null, headers: new Headers() };
  }
}

// A throw-away role for resource tests. Registered for cleanup; because cleanup runs in reverse,
// call this BEFORE creating the resources that use it so they are deleted first (roles that a
// resource references cannot be deleted).
async function makeTestRole(tag) {
  const code = `TESTROLE${tag}`;
  const label = `__test_role_${tag}__`;
  const r = await api('POST', '/api/roles', { label, code }, adminCookie);
  if (r.data?.id) later('DELETE', `/api/roles/${r.data.id}`);
  return { id: r.data?.id, label, code };
}

// A version's currency must be active (EUR always is): the suite activates USD and CHF once and
// keeps their live rates here; NOK stays inactive and is the suite's inactive currency.
const testRates = {};
async function ensureTestCurrencies() {
  section('Currencies setup');
  for (const [code, rate] of [['USD', 1.3], ['CHF', 0.8]]) {
    const r = await api('POST', `/api/currencies/${code}/activate`, { rate }, adminCookie);
    ok([200, 409].includes(r.status), `CUR-setup ${code} active (got ${r.status})`);
  }
  const list = (await api('GET', '/api/currencies', null, adminCookie)).data || [];
  for (const code of ['USD', 'CHF']) testRates[code] = parseFloat(list.find(c => c.code === code)?.current_rate);
  ok(list.some(c => c.code === 'NOK' && !c.active), 'CUR-setup NOK is inactive (used as the inactive currency)');
  return testRates;
}

// Direct SQL, for the states no route can build (an inactive currency on an existing version, a
// stored rate the server would never write). The test container installs `pg` under /tmp and
// carries DATABASE_URL (docker-compose.yml, service `test`). Answers null, and records one failure,
// when that is not available, so the caller skips its checks instead of aborting the suite.
let _pgPool = null;
async function sql(text, params = []) {
  try {
    if (!_pgPool) {
      const { Pool } = require('/tmp/node_modules/pg');
      _pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
    }
    return (await _pgPool.query(text, params)).rows;
  } catch (e) {
    fail(`direct SQL unavailable (${e.message}) — skipping the checks that need it`);
    return null;
  }
}

// Multipart CSV upload (the suite's api() helper only speaks JSON). xlsx parses CSV buffers too.
async function uploadCsv(path, csvText, cookie) {
  const form = new FormData();
  form.append('file', new Blob([csvText], { type: 'text/csv' }), 'ts.csv');
  try {
    const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { Cookie: cookie }, body: form });
    let data; try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data };
  } catch (e) {
    fail(`FETCH ERROR POST ${path}: ${e.message}`);
    return { status: 0, data: null };
  }
}

function extractCookie(headers) {
  const sc = headers.get('set-cookie') || '';
  const m  = sc.match(/pdash_token=[^;]+/);
  return m ? m[0] : '';
}

// ── Two-step helpers ──────────────────────────────────────────────────────────
// The suite signs in as the two test accounts with a trusted device minted by the CLI (the code step
// is not bypassed anywhere in the server); the TS-* tests go through the real code step, taking the
// code from the emergency CLI. Both CLIs run inside this container (`pg` under /tmp, JWT_SECRET set).
const { execFileSync } = require('child_process');

// stdout of `node <script> <args>`, trimmed; throws on a non-zero exit.
function cli(script, ...args) {
  return execFileSync('node', [script, ...args], {
    env: { ...process.env, NODE_PATH: '/tmp/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString().trim();
}

// `name=value` of a cookie the response sets, '' when absent or cleared.
function cookieValue(headers, name) {
  const c = (headers.getSetCookie ? headers.getSetCookie() : []).find(h => h.startsWith(`${name}=`));
  const pair = c ? c.split(';')[0] : '';
  return pair === `${name}=` ? '' : pair;
}

const joinCookies = (...c) => c.filter(Boolean).join('; ');

// A fresh trusted-device cookie for an account, and its row id for assertions.
const deviceCookie = email => `pdash_device=${cli('src/trust-device.js', email)}`;

// Password, then the code the CLI prints, then verify → the pdash_token cookie.
async function loginWithCode(email, password) {
  const login = await api('POST', '/api/auth/login', { email, password });
  const challenge = cookieValue(login.headers, 'pdash_challenge');
  if (!challenge) return '';
  const verify = await api('POST', '/api/auth/two-step/verify', { code: cli('src/two-step-code.js', email) }, challenge);
  return extractCookie(verify.headers);
}

let ADMIN_DEVICE = '';
let SYSADMIN_DEVICE = '';

async function runCleanup() {
  if (!cleanupQueue.length) return;
  section('Cleanup');
  for (const { method, path } of [...cleanupQueue].reverse()) {
    const r = await api(method, path, null, sysadminCookie || adminCookie);
    const success = [200, 204, 404].includes(r.status);
    process.stdout.write(`  ${success ? green('✓') : red('✗')} ${method} ${path} → ${r.status}\n`);
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function testAuth() {
  section('Auth');

  try {
    ADMIN_DEVICE = deviceCookie(EMAIL);
    SYSADMIN_DEVICE = deviceCookie(SYSADMIN_EMAIL);
  } catch (e) {
    fail(`trust-device.js unavailable (${e.message}) — cannot sign in`);
    return false;
  }
  const r1 = await api('POST', '/api/auth/login', { email: EMAIL, password: PASS }, ADMIN_DEVICE);
  if (!ok(r1.status === 200, 'A-01 valid login → 200')) return false;

  adminCookie = extractCookie(r1.headers);
  ok(!!adminCookie, 'A-01 JWT cookie is set');

  ok((await api('POST', '/api/auth/login', { email: EMAIL, password: 'wrong' })).status === 401,
    'A-02 wrong password → 401');

  ok((await api('POST', '/api/auth/login', { email: 'nobody@nowhere.com', password: 'x' })).status === 401,
    'A-04 unknown email → 401');

  ok((await api('GET', '/api/auth/me')).status === 401,
    'A-05 /me without cookie → 401');

  const me = await api('GET', '/api/auth/me', null, adminCookie);
  ok(me.status === 200,           'A-me authenticated → 200');
  ok(me.data?.role === 'admin',   'A-me role = admin');
  ok(['created_at', 'terms_accepted_at', 'password_changed_at'].every(k => me.data && k in me.data),
    'A-me-2 /me carries created_at, terms_accepted_at, password_changed_at');

  // Sysadmin test account — needed for admin/reset/* (sysadmin-exclusive).
  const r2 = await api('POST', '/api/auth/login', { email: SYSADMIN_EMAIL, password: SYSADMIN_PASS }, SYSADMIN_DEVICE);
  if (!ok(r2.status === 200, 'A-06 sysadmin login → 200')) return false;
  sysadminCookie = extractCookie(r2.headers);
  ok(!!sysadminCookie, 'A-06 sysadmin JWT cookie is set');
  const sysMe = await api('GET', '/api/auth/me', null, sysadminCookie);
  ok(sysMe.data?.role === 'sysadmin', 'A-06 sysadmin role = sysadmin');

  ok((await api('GET', '/api/auth/admin-check')).status === 401, 'A-07 admin-check without session → 401');
  ok((await api('GET', '/api/auth/admin-check', null, adminCookie)).status === 204, 'A-07 admin-check as admin → 204');
  ok((await api('GET', '/api/auth/admin-check', null, sysadminCookie)).status === 204, 'A-07 admin-check as sysadmin → 204');
  const plainForCheck = await getPlainUserCookie();
  ok((await api('GET', '/api/auth/admin-check', null, plainForCheck)).status === 403, 'A-07 admin-check as user → 403');

  return true;
}

// ── Two-step login ────────────────────────────────────────────────────────────

const TS_PASS = 'TsPass123!';

// A throw-away active user with a known password (cleanup disables it).
async function makeTsUser(tag) {
  let bcrypt = null;
  try { bcrypt = require('/tmp/node_modules/bcryptjs'); } catch (e) { fail(`bcryptjs unavailable (${e.message})`); return null; }
  const email = `__test_ts_${tag}_${Date.now()}@pdash.local`;
  const rows = await sql(
    `INSERT INTO users (email, first_name, last_name, role, status, password_hash)
     VALUES ($1, 'Two', 'Step', 'user', 'active', $2) RETURNING id`, [email, bcrypt.hashSync(TS_PASS, 4)]);
  if (!rows) return null;
  later('DELETE', `/api/users/${rows[0].id}`);
  return { id: rows[0].id, email };
}

// A code that is not `code`.
const wrongCodeFor = code => String((Number(code) + 1) % 1000000).padStart(6, '0');

// Login without a device → the challenge cookie (and the response).
async function openChallenge(user) {
  const r = await api('POST', '/api/auth/login', { email: user.email, password: TS_PASS });
  return { r, cookie: cookieValue(r.headers, 'pdash_challenge') };
}

async function testTwoStep() {
  section('Two-step login');
  const VERIFY = '/api/auth/two-step/verify';
  const u1 = await makeTsUser('a');
  if (!u1) return;

  // TS-01..04: the challenge, a wrong code, the lock. In this stack the SMTP server may be
  // unreachable (sendFailed) — nothing below depends on the mail, the code comes from the CLI.
  const c1 = await openChallenge(u1);
  ok(c1.r.status === 200 && c1.r.data?.twoStep?.method === 'email'
    && /•••@/.test(c1.r.data.twoStep.destination || '') && !extractCookie(c1.r.headers) && !!c1.cookie,
    `TS-01 login without a device → twoStep, masked destination, challenge cookie, no pdash_token (got ${c1.r.status})`);
  ok((await api('GET', '/api/auth/me', null, c1.cookie)).status === 401, 'TS-02 /me with only the challenge cookie → 401');

  const code1 = cli('src/two-step-code.js', u1.email);
  const bad = wrongCodeFor(code1);
  const w1 = await api('POST', VERIFY, { code: bad }, c1.cookie);
  ok(w1.status === 400 && w1.data?.code === 'WRONG_CODE' && w1.data?.attemptsLeft === 4,
    `TS-03 wrong code → 400 WRONG_CODE, 4 attempts left (got ${w1.status}, ${w1.data?.attemptsLeft})`);
  let left = [];
  for (let i = 0; i < 3; i++) left.push((await api('POST', VERIFY, { code: bad }, c1.cookie)).data?.attemptsLeft);
  ok(left.join() === '3,2,1', `TS-04 three more wrong codes count down to 1 (got ${left.join()})`);
  const w5 = await api('POST', VERIFY, { code: bad }, c1.cookie);
  ok(w5.status === 423 && w5.data?.code === 'LOCKED', `TS-04 the fifth wrong code → 423 LOCKED (got ${w5.status})`);
  const after = await api('POST', VERIFY, { code: code1 }, c1.cookie);
  ok(after.status === 401 && after.data?.code === 'NO_CHALLENGE', `TS-04 a locked challenge is gone → 401 NO_CHALLENGE (got ${after.status})`);

  // TS-05/06: the right code opens the session, also pasted with a space.
  const c2 = await openChallenge(u1);
  const v2 = await api('POST', VERIFY, { code: cli('src/two-step-code.js', u1.email) }, c2.cookie);
  const session = extractCookie(v2.headers);
  ok(v2.status === 200 && !!session, `TS-05 the right code → 200 with pdash_token (got ${v2.status})`);
  const me = await api('GET', '/api/auth/me', null, session);
  ok(me.status === 200 && me.data?.two_step?.method === 'email' && /•••@/.test(me.data.two_step.destination || ''),
    'TS-05 /me carries two_step { method, destination }');
  const c3 = await openChallenge(u1);
  const spaced = cli('src/two-step-code.js', u1.email).replace(/^(\d{3})(\d{3})$/, '$1 $2');
  const v3 = await api('POST', VERIFY, { code: spaced }, c3.cookie);
  ok(v3.status === 200 && !!extractCookie(v3.headers), `TS-06 a code typed as "123 456" → 200 (got ${v3.status})`);

  // TS-07/08: resend. code_sent_at is set by hand (a failed mail leaves it NULL).
  const c4 = await openChallenge(u1);
  await sql('UPDATE login_challenges SET code_sent_at = NOW() WHERE user_id = $1', [u1.id]);
  const rs1 = await api('POST', '/api/auth/two-step/resend', null, c4.cookie);
  ok(rs1.status === 429 && rs1.data?.code === 'COOLDOWN' && rs1.data?.retryIn >= 1 && rs1.data?.retryIn <= 60,
    `TS-07 resend within the cooldown → 429 COOLDOWN (got ${rs1.status}, retryIn ${rs1.data?.retryIn})`);
  const old4 = cli('src/two-step-code.js', u1.email);
  await sql(`UPDATE login_challenges SET code_sent_at = NOW() - interval '61 seconds' WHERE user_id = $1`, [u1.id]);
  const rs2 = await api('POST', '/api/auth/two-step/resend', null, c4.cookie);
  // 502 when the SMTP server is unreachable: the new code is stored all the same.
  ok([200, 502].includes(rs2.status), `TS-08 resend after the cooldown → 200 (502 if the mail fails) (got ${rs2.status})`);
  const o4 = await api('POST', VERIFY, { code: old4 }, c4.cookie);
  ok(o4.status === 400 && o4.data?.code === 'WRONG_CODE', `TS-08 the previous code no longer works → 400 (got ${o4.status})`);
  const n4 = await api('POST', VERIFY, { code: cli('src/two-step-code.js', u1.email) }, c4.cookie);
  ok(n4.status === 200, `TS-08 the new code works → 200 (got ${n4.status})`);

  // TS-09: an expired code.
  const c5 = await openChallenge(u1);
  const code5 = cli('src/two-step-code.js', u1.email);
  await sql(`UPDATE login_challenges SET code_expires_at = NOW() - interval '1 second' WHERE user_id = $1`, [u1.id]);
  const e5 = await api('POST', VERIFY, { code: code5 }, c5.cookie);
  ok(e5.status === 410 && e5.data?.code === 'CODE_EXPIRED', `TS-09 an expired code → 410 CODE_EXPIRED (got ${e5.status})`);

  // TS-10: "Back to sign in" in another tab drops the challenge; the next verify says it is gone.
  const c6 = await openChallenge(u1);
  const open0 = await sql('SELECT count(*)::int AS n FROM login_challenges WHERE user_id = $1', [u1.id]);
  const del = await api('DELETE', '/api/auth/two-step', null, c6.cookie);
  const open1 = await sql('SELECT count(*)::int AS n FROM login_challenges WHERE user_id = $1', [u1.id]);
  ok(del.status === 200 && open0 && open1 && open1[0].n === open0[0].n - 1, `TS-10 DELETE /two-step removes the challenge (got ${del.status})`);
  const gone = await api('POST', VERIFY, { code: '123456' }, c6.cookie);
  ok(gone.status === 401 && gone.data?.code === 'NO_CHALLENGE', `TS-10 a verify after it → 401 NO_CHALLENGE (got ${gone.status})`);

  // TS-11..14: trusted devices.
  const u2 = await makeTsUser('b');
  if (u2) {
    const d1 = await openChallenge(u2);
    const t1 = await api('POST', VERIFY, { code: cli('src/two-step-code.js', u2.email), trustDevice: true }, d1.cookie);
    const dev1 = cookieValue(t1.headers, 'pdash_device');
    const sess2 = extractCookie(t1.headers);
    ok(t1.status === 200 && !!dev1, `TS-11 trustDevice → pdash_device cookie (got ${t1.status})`);
    const again = await api('POST', '/api/auth/login', { email: u2.email, password: TS_PASS }, dev1);
    ok(again.status === 200 && !again.data?.twoStep && !!extractCookie(again.headers),
      'TS-11 the next login with that cookie skips the code');

    const onAdmin = await api('POST', '/api/auth/login', { email: EMAIL, password: PASS }, dev1);
    ok(onAdmin.status === 200 && !!onAdmin.data?.twoStep && !extractCookie(onAdmin.headers),
      "TS-12 another user's device cookie does not skip the admin's code");
    await api('DELETE', '/api/auth/two-step', null, cookieValue(onAdmin.headers, 'pdash_challenge'));

    const list = await api('GET', '/api/auth/trusted-devices', null, joinCookies(sess2, dev1));
    ok(list.status === 200 && list.data?.length === 1 && list.data[0].current === true && list.data[0].label
      && 'expires_at' in list.data[0], 'TS-13 GET /trusted-devices → one device, current: true');
    const adminDev = await sql('SELECT d.id FROM trusted_devices d JOIN users u ON u.id = d.user_id WHERE u.email = $1 LIMIT 1', [EMAIL]);
    if (adminDev?.[0]) {
      const foreign = await api('DELETE', `/api/auth/trusted-devices/${adminDev[0].id}`, null, sess2);
      ok(foreign.status === 404, `TS-13 removing another user's device → 404 (got ${foreign.status})`);
    }
    const rm = await api('DELETE', `/api/auth/trusted-devices/${list.data?.[0]?.id}`, null, joinCookies(sess2, dev1));
    ok(rm.status === 200, `TS-13 DELETE /trusted-devices/:id → 200 (got ${rm.status})`);
    const afterRm = await api('POST', '/api/auth/login', { email: u2.email, password: TS_PASS }, dev1);
    ok(afterRm.status === 200 && !!afterRm.data?.twoStep, 'TS-13 the removed device asks for the code again');

    cli('src/trust-device.js', u2.email);
    cli('src/trust-device.js', u2.email);
    const many = await api('GET', '/api/auth/trusted-devices', null, sess2);
    const rmAll = await api('DELETE', '/api/auth/trusted-devices', null, sess2);
    const none = await api('GET', '/api/auth/trusted-devices', null, sess2);
    ok(many.data?.length === 2 && rmAll.status === 200 && Array.isArray(none.data) && none.data.length === 0,
      'TS-14 DELETE /trusted-devices removes them all');
  }

  // TS-15: the login limiter counts failures only (10 per email).
  const ghost = `__test_ts_ghost_${Date.now()}@pdash.local`;
  const statuses = [];
  for (let i = 0; i < 10; i++) statuses.push((await api('POST', '/api/auth/login', { email: ghost, password: 'x' })).status);
  const limited = await api('POST', '/api/auth/login', { email: ghost, password: 'x' });
  ok(statuses.every(s => s === 401) && limited.status === 429 && limited.data?.code === 'RATE_LIMITED' && limited.data?.retryIn > 0,
    `TS-15 the 11th failed login → 429 RATE_LIMITED with retryIn (got ${limited.status})`);

  // TS-15b: the slot is taken before the password is checked, so a parallel burst cannot all get through.
  const ghost2 = `__test_ts_burst_${Date.now()}@pdash.local`;
  const burst = await Promise.all(Array.from({ length: 25 }, () => api('POST', '/api/auth/login', { email: ghost2, password: 'x' })));
  const n401 = burst.filter(r => r.status === 401).length;
  const n429 = burst.filter(r => r.status === 429).length;
  // At most 10 are tried (fewer when this IP's own limit was already partly used by an earlier run on a reused stack).
  ok(n401 >= 1 && n401 <= 10 && n401 + n429 === 25, `TS-15b 25 parallel failed logins: at most 10 are tried, the rest refused (got ${n401} × 401, ${n429} × 429)`);

  // TS-15c: a body that is not two strings is refused before any slot is reserved or bcrypt is reached.
  const odd = await Promise.all([{ email: EMAIL, password: 123 }, { email: 5, password: 'x' }, { email: EMAIL, password: { a: 1 } }]
    .map(b => api('POST', '/api/auth/login', b)));
  ok(odd.every(r => r.status === 400), `TS-15c a non-string email or password → 400 (got ${odd.map(r => r.status).join(', ')})`);

  // TS-16: two challenges of one user coexist, one per cookie; the CLI code is for the latest.
  const u3 = await makeTsUser('c');
  if (u3) {
    const first = await openChallenge(u3);
    const second = await openChallenge(u3);
    const code = cli('src/two-step-code.js', u3.email);
    const onFirst = await api('POST', VERIFY, { code }, first.cookie);
    ok(onFirst.status === 400 && onFirst.data?.code === 'WRONG_CODE', `TS-16 the latest code does not open the first challenge (got ${onFirst.status})`);
    const onSecond = await api('POST', VERIFY, { code }, second.cookie);
    ok(onSecond.status === 200, `TS-16 …and opens the second (got ${onSecond.status})`);
  }

  // TS-29: a row written by a request that read the user before a credential change is refused. The
  // guard is exercised on the service itself, in a child process (the race cannot be provoked over HTTP).
  const u5 = await makeTsUser('e');
  if (u5) {
    const probe = guard => JSON.parse(execFileSync('node', ['-e',
      "const s=require('./src/services/two-step');const {pool}=require('./src/db/client');const g=JSON.parse(process.argv[1]);" +
      "(async()=>{try{const o={guard:{email:g.email,passwordChangedAt:g.pca}};const c=await s.createChallenge(g.id,o);" +
      "const d=await s.trustDevice(g.id,'',o);console.log(JSON.stringify({c:!!c,d:!!d}));}finally{await pool.end();}})();",
      JSON.stringify({ id: u5.id, email: u5.email, pca: guard })], {
      env: { ...process.env, NODE_PATH: '/tmp/node_modules' }, stdio: ['ignore', 'pipe', 'pipe'],
    }).toString().trim());
    const fresh = probe(null);
    ok(fresh.c && fresh.d, 'TS-29 a guard that matches the user lets the challenge and the device in');
    await sql('UPDATE users SET password_changed_at = NOW() WHERE id = $1', [u5.id]);
    const stale = probe(null);
    ok(!stale.c && !stale.d, 'TS-29 a password change since the read → no challenge, no device');
    const cur = (await sql('SELECT password_changed_at FROM users WHERE id = $1', [u5.id]))?.[0]?.password_changed_at;
    const now = probe(cur && cur.toISOString());
    ok(now.c && now.d, 'TS-29 the guard carrying the new password_changed_at matches again');
    await sql('UPDATE users SET email = $2 WHERE id = $1', [u5.id, `__test_ts_moved2_${Date.now()}@pdash.local`]);
    const moved = probe(cur && cur.toISOString());
    ok(!moved.c && !moved.d, 'TS-29 an email change since the read → refused');
  }

  // TS-17: no open challenge → the CLI refuses.
  const u4 = await makeTsUser('d');
  if (u4) {
    let refused = false;
    try { cli('src/two-step-code.js', u4.email); } catch { refused = true; }
    ok(refused, 'TS-17 two-step-code.js exits non-zero without an open challenge');
  }
}

// ── Two-step revocation ───────────────────────────────────────────────────────

// A throw-away user with one trusted device and one open challenge: the state every credential change
// must wipe. `session` is a signed-in cookie taken before the challenge that stays open.
async function armedUser(tag) {
  const u = await makeTsUser(`rev${tag}`);
  if (!u) return null;
  const session = await loginWithCode(u.email, TS_PASS);
  const device = `pdash_device=${cli('src/trust-device.js', u.email)}`;
  const { cookie: challenge } = await openChallenge(u);
  return { ...u, session, device, challenge };
}

async function twoStepRows(userId) {
  const d = await sql('SELECT count(*)::int AS n FROM trusted_devices WHERE user_id = $1', [userId]);
  const c = await sql('SELECT count(*)::int AS n FROM login_challenges WHERE user_id = $1', [userId]);
  return d && c ? { devices: d[0].n, challenges: c[0].n } : null;
}

async function expectWiped(label, userId) {
  const rows = await twoStepRows(userId);
  ok(rows && rows.devices === 0 && rows.challenges === 0, `${label} no trusted device and no challenge left (got ${JSON.stringify(rows)})`);
}

async function testTwoStepRevocation() {
  section('Two-step revocation');
  const U = id => `/api/users/${id}`;

  const a = await armedUser('a');
  if (a) {
    const before = await twoStepRows(a.id);
    ok(before && before.devices === 1 && before.challenges === 1, `TS-20 setup: one device, one challenge (got ${JSON.stringify(before)})`);
    const r = await api('POST', '/api/auth/change-password',
      { currentPassword: TS_PASS, newPassword: TS_PASS + 'x', newPasswordConfirm: TS_PASS + 'x' }, joinCookies(a.session, a.device));
    ok(r.status === 200, `TS-20 change-password → 200 (got ${r.status})`);
    await expectWiped('TS-20', a.id);
    ok((r.headers.getSetCookie?.() || []).some(h => /^pdash_device=;/.test(h)), 'TS-20 the response clears the pdash_device cookie');
  }

  const b = await armedUser('b');
  if (b) {
    const tok = `__test_ts_reset_${Date.now()}__`;
    await sql(`UPDATE users SET reset_token = $2, reset_expires = NOW() + interval '1 hour' WHERE id = $1`, [b.id, tok]);
    const r = await api('POST', '/api/auth/reset-password', { token: tok, password: 'ResetPass123!', passwordConfirm: 'ResetPass123!' });
    ok(r.status === 200, `TS-21 reset-password → 200 (got ${r.status})`);
    await expectWiped('TS-21', b.id);
  }

  const c = await armedUser('c');
  if (c) {
    const r = await api('PATCH', U(c.id), { email: `__test_ts_moved_${Date.now()}@pdash.local` }, adminCookie);
    ok(r.status === 200, `TS-22 an admin changes the email → 200 (got ${r.status})`);
    await expectWiped('TS-22', c.id);
    const v = await api('POST', '/api/auth/two-step/verify', { code: '123456' }, c.challenge);
    ok(v.status === 401 && v.data?.code === 'NO_CHALLENGE', `TS-22 the old challenge is gone → 401 NO_CHALLENGE (got ${v.status})`);
  }

  const d = await armedUser('d');
  const e = await armedUser('e');
  if (d && e) {
    const r1 = await api('PATCH', U(d.id), { status: 'disabled' }, adminCookie);
    ok(r1.status === 200, `TS-23 disabling a user → 200 (got ${r1.status})`);
    await expectWiped('TS-23 (disable)', d.id);
    const r2 = await api('DELETE', U(e.id), null, adminCookie);
    ok(r2.status === 200, `TS-23 DELETE /users/:id → 200 (got ${r2.status})`);
    await expectWiped('TS-23 (delete)', e.id);
  }

  const f = await armedUser('f');
  if (f) {
    const r = await api('POST', `${U(f.id)}/anonymize`, null, sysadminCookie);
    ok(r.status === 200, `TS-24 anonymize → 200 (got ${r.status})`);
    await expectWiped('TS-24', f.id);
  }

  // TS-26 (B-397): an export goes to the address on file, not to the one the session was signed with.
  const g = await armedUser('g');
  if (g) {
    const moved = `__test_ts_export_${Date.now()}@pdash.local`;
    await api('PATCH', U(g.id), { email: moved }, adminCookie);
    const r = await api('POST', '/api/exports/portfolio', null, g.session);
    ok(r.status === 200 && r.data?.email === moved, `TS-26 the export answers with the new address (got ${r.status}, ${r.data?.email})`);
  }

  // TS-27 (B-409): invite validates like an admin's edit of a user's details.
  const inv = (over = {}) => api('POST', '/api/auth/invite',
    { email: `__test_ts_inv_${Date.now()}@pdash.local`, firstName: 'Inv', lastName: 'Ited', role: 'user', ...over }, adminCookie);
  const longName = await inv({ firstName: 'x'.repeat(101) });
  ok(longName.status === 400, `TS-27 a first name of 101 characters → 400 (got ${longName.status})`);
  const reserved = await inv({ email: 'anon_x@deleted.local' });
  ok(reserved.status === 400, `TS-27 the reserved anonymized address → 400 (got ${reserved.status})`);

  // TS-28: the emergency reset locks out whoever held the old password.
  const h = await armedUser('h');
  if (h) {
    cli('src/create-admin.js', h.email, 'ResetPass123!', 'Two', 'Step');
    const row = await sql('SELECT password_changed_at FROM users WHERE id = $1', [h.id]);
    ok(row && row[0].password_changed_at !== null, 'TS-28 create-admin.js sets password_changed_at');
    await expectWiped('TS-28', h.id);
  }
}

// ── Session revocation ────────────────────────────────────────────────────────

// A pdash_token signed with the suite's JWT_SECRET, for the claims no route would sign.
function handSignedToken(claims) {
  const crypto = require('crypto');
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ ...claims, iat, exp: iat + 3600 })}`;
  const sig = crypto.createHmac('sha256', process.env.JWT_SECRET).update(body).digest('base64url');
  return `pdash_token=${body}.${sig}`;
}

async function testSessionRevocation() {
  section('Session revocation');
  const U = id => `/api/users/${id}`;
  const me = c => api('GET', '/api/auth/me', null, c);
  const signedIn = async tag => {
    const u = await makeTsUser(`se${tag}`);
    return u && { ...u, session: await loginWithCode(u.email, TS_PASS) };
  };

  const a = await signedIn('a');
  if (a) {
    await api('DELETE', U(a.id), null, sysadminCookie);
    const r = await me(a.session);
    ok(r.status === 401, `SE-01 a disabled user's open session → 401 (got ${r.status})`);
  }

  const b = await signedIn('b');
  if (b) {
    await api('PATCH', U(b.id), { status: 'disabled' }, sysadminCookie);
    const r = await me(b.session);
    ok(r.status === 401, `SE-01b PATCH status disabled ends the open session → 401 (got ${r.status})`);
  }

  const c = await signedIn('c');
  if (c) {
    await api('POST', `${U(c.id)}/anonymize`, null, sysadminCookie);
    const r = await me(c.session);
    ok(r.status === 401, `SE-02 an anonymized user's open session → 401 (got ${r.status})`);
  }

  const d = await signedIn('d');
  if (d) {
    const other = await loginWithCode(d.email, TS_PASS);
    const cp = await api('POST', '/api/auth/change-password',
      { currentPassword: TS_PASS, newPassword: TS_PASS + 'x', newPasswordConfirm: TS_PASS + 'x' }, d.session);
    const rb = await me(other);
    ok(cp.status === 200 && rb.status === 401, `SE-03 change-password ends the other session → 401 (got ${cp.status}, ${rb.status})`);
    const ra = await me(extractCookie(cp.headers));
    ok(ra.status === 200, `SE-03 the session that changed the password keeps the reissued cookie → 200 (got ${ra.status})`);
  }

  const e = await makeTsUser('see');
  if (e) {
    await sql(`UPDATE users SET role = 'admin' WHERE id = $1`, [e.id]);
    const session = await loginWithCode(e.email, TS_PASS);
    await api('PATCH', U(e.id), { role: 'user' }, sysadminCookie);
    const r = await api('GET', '/api/users', null, session);
    ok(r.status === 403, `SE-04 a demoted admin's old session on an admin route → 403 (got ${r.status})`);
  }

  const f = await makeTsUser('sef');
  if (f) {
    const claims = { id: f.id, email: f.email, role: 'user' };
    const r5 = await me(handSignedToken(claims));
    ok(r5.status === 401, `SE-05 a token without the pwd claim → 401 (got ${r5.status})`);
    const row = await sql('SELECT floor(extract(epoch FROM password_changed_at)*1000)::bigint AS pwd FROM users WHERE id = $1', [f.id]);
    if (row) {
      const pwd = row[0].pwd === null ? null : Number(row[0].pwd);
      const r6 = await me(handSignedToken({ ...claims, pwd }));
      ok(r6.status === 200, `SE-06 the same token with the right pwd claim → 200 (got ${r6.status})`);
    }
  }

  const g = await signedIn('g');
  if (g) {
    const moved = `__test_se_moved_${Date.now()}@pdash.local`;
    await api('PATCH', U(g.id), { email: moved }, sysadminCookie);
    const cp = await api('POST', '/api/auth/change-password',
      { currentPassword: TS_PASS, newPassword: TS_PASS + 'x', newPasswordConfirm: TS_PASS + 'x' }, g.session);
    const jwt = extractCookie(cp.headers).replace(/^pdash_token=/, '');
    let payload = null;
    try { payload = JSON.parse(Buffer.from(jwt.split('.')[1] || '', 'base64url').toString()); } catch { payload = null; }
    ok(cp.status === 200 && payload?.email === moved,
      `SE-07 the token reissued by change-password carries the current email (got ${cp.status}, ${payload?.email})`);
  }
}

// ── SSE revocation ────────────────────────────────────────────────────────────

// An open notification stream: `status` on the response, `ended` when the server ends it, `heartbeat` on
// the first heartbeat.
function openStream(cookie) {
  let req;
  const s = {};
  s.status = new Promise(resolveStatus => {
    s.ended = new Promise(resolveEnd => {
      s.heartbeat = new Promise(resolveBeat => {
        req = http.get(`${BASE}/api/notifications/stream`, { headers: { Cookie: cookie } }, res => {
          resolveStatus(res.statusCode);
          res.on('data', chunk => { if (String(chunk).includes(': heartbeat')) resolveBeat(); });
          res.on('end', resolveEnd);
        });
        req.on('error', () => resolveStatus(0));
      });
    });
  });
  s.close = () => req.destroy();
  return s;
}

// true when `p` settles within `ms`.
const within = (p, ms) => new Promise(r => {
  const t = setTimeout(() => r(false), ms);
  p.then(() => { clearTimeout(t); r(true); });
});

async function testSseRevocation() {
  section('SSE revocation');
  const signedIn = async tag => {
    const u = await makeTsUser(tag);
    return u && { ...u, session: await loginWithCode(u.email, TS_PASS) };
  };
  const a = await signedIn('ssa');
  const b = await signedIn('ssb');
  const d = await signedIn('ssd');
  if (!a || !b || !d) return;
  const d2 = await loginWithCode(d.email, TS_PASS);

  const sa = openStream(a.session), sb = openStream(b.session), sd = openStream(d2);
  const opened = await Promise.all([sa.status, sb.status, sd.status]);
  if (!ok(opened.every(s => s === 200), `SSE-00 the three streams open → 200 (got ${opened})`)) {
    for (const s of [sa, sb, sd]) s.close();
    return;
  }
  await api('DELETE', `/api/users/${a.id}`, null, sysadminCookie);
  const cp = await api('POST', '/api/auth/change-password',
    { currentPassword: TS_PASS, newPassword: TS_PASS + 'x', newPasswordConfirm: TS_PASS + 'x' }, d.session);
  const sr = openStream(extractCookie(cp.headers));

  const [aEnded, dEnded, bBeat] = await Promise.all([
    within(sa.ended, 40000), within(sd.ended, 40000), within(sb.heartbeat, 40000),
  ]);
  const bEnded = await within(sb.ended, 0);
  ok(aEnded, "SSE-01 a disabled user's open stream ends within a heartbeat");
  ok(bBeat && !bEnded, "SSE-02 an active user's stream stays open and gets a heartbeat");
  ok(cp.status === 200 && dEnded, `SSE-03 change-password ends the other session's stream (got ${cp.status})`);
  const rs = await sr.status;
  ok(rs === 200, `SSE-03 a stream opened with the reissued cookie → 200 (got ${rs})`);
  for (const s of [sa, sb, sd, sr]) s.close();
}

// ── Profile ───────────────────────────────────────────────────────────────────

async function testProfile() {
  section('Profile');

  const before = (await api('GET', '/api/auth/me', null, adminCookie)).data;
  const p = await api('PATCH', '/api/auth/profile', { firstName: 'Hacked' }, adminCookie);
  ok(p.status === 404, `PR-OF-01 PATCH /auth/profile no longer exists → 404 (got ${p.status})`);
  const after = (await api('GET', '/api/auth/me', null, adminCookie)).data;
  ok(after?.first_name === before?.first_name, 'PR-OF-01 first_name unchanged');

  const RR = '/api/auth/rectification-request';
  ok((await api('POST', RR, { message: 'x' })).status === 401, 'RR-01 without cookie → 401');
  ok((await api('POST', RR, { message: '   ' }, adminCookie)).status === 400, 'RR-02 blank message → 400');
  ok((await api('POST', RR, { message: 'x'.repeat(2001) }, adminCookie)).status === 400, 'RR-03 2001 characters → 400');

  const msg = `__test_rr_${Date.now()}__ my last name is misspelt`;
  const r4 = await api('POST', RR, { message: msg }, adminCookie);
  ok(r4.status === 201 && r4.data?.ok === true, `RR-04 valid message → 201 (got ${r4.status})`);
  const notifs = (await api('GET', '/api/notifications', null, sysadminCookie)).data;
  const list = Array.isArray(notifs) ? notifs : (notifs?.notifications || []);
  ok(list.some(n => n.title === `Profile change requested by ${before?.first_name} ${before?.last_name}` && n.body === msg),
    'RR-04 the sysadmin receives the notification');
  const rows = await sql('SELECT count(*)::int AS n FROM rectification_requests WHERE message = $1', [msg]);
  if (rows) ok(rows[0].n === 1, 'RR-04 the request is recorded in rectification_requests');
  const unlinked = await sql('SELECT count(*)::int AS n FROM notifications WHERE body = $1 AND rectification_request_id IS NULL', [msg]);
  if (unlinked) ok(unlinked[0].n === 0, 'RR-04 every notification of the request is linked to it (anonymize can delete it)');

  ok((await api('POST', RR, { message: '<b>x</b>' }, adminCookie)).status === 201, 'RR-05 HTML message → 201');

  const limited = await makeTsUser('rr6');
  if (limited) {
    const session = await loginWithCode(limited.email, TS_PASS);
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await api('POST', RR, { message: `__test_rr6_${i}__` }, session)).status);
    const sixth = await api('POST', RR, { message: '__test_rr6_5__' }, session);
    ok(statuses.every(s => s === 201) && sixth.status === 429 && sixth.data?.code === 'RATE_LIMITED' && sixth.data?.retryIn > 0,
      `RR-06 the sixth request in an hour → 429 RATE_LIMITED with retryIn (got ${statuses.join(',')} then ${sixth.status} ${sixth.data?.code})`);
  }

  const lone = await makeTsUser('rr7');
  if (lone) {
    await sql(`UPDATE users SET role = 'admin' WHERE id = $1`, [lone.id]);
    const session = await loginWithCode(lone.email, TS_PASS);
    const others = await sql(
      `UPDATE users SET status = 'disabled' WHERE status = 'active' AND role IN ('admin','sysadmin') AND id <> $1 RETURNING id`, [lone.id]);
    try {
      const r = await api('POST', RR, { message: '__test_rr7__' }, session);
      const rows = await sql('SELECT count(*)::int AS n FROM rectification_requests WHERE user_id = $1', [lone.id]);
      ok(r.status === 409 && r.data?.code === 'NO_RECIPIENT' && rows?.[0]?.n === 0,
        `RR-07 no other active admin → 409 NO_RECIPIENT, nothing recorded (got ${r.status} ${r.data?.code}, ${rows?.[0]?.n} rows)`);
    } finally {
      if (others?.length) await sql(`UPDATE users SET status = 'active' WHERE id = ANY($1::uuid[])`, [others.map(o => o.id)]);
    }
  }

  ok((await api('GET', '/api/app-settings/privacy-contact')).status === 401, 'PC-01 privacy-contact without cookie → 401');
  const pc = await api('GET', '/api/app-settings/privacy-contact', null, adminCookie);
  ok(pc.status === 200 && pc.data && 'name' in pc.data && 'email' in pc.data, 'PC-01 privacy-contact → 200 { name, email }');

  const CP = '/api/auth/change-password';
  // A password change ends every older session and reissues this one: carry the new cookie on.
  const w1 = await api('POST', CP, { currentPassword: PASS, newPassword: PASS + 'x', newPasswordConfirm: PASS + 'x' }, adminCookie);
  adminCookie = extractCookie(w1.headers) || adminCookie;
  const w2 = await api('POST', CP, { currentPassword: PASS + 'x', newPassword: PASS, newPasswordConfirm: PASS }, adminCookie);
  adminCookie = extractCookie(w2.headers) || adminCookie;
  ok(w1.status === 200 && w2.status === 200, `PW-01 change-password and back → 200, 200 (got ${w1.status}, ${w2.status})`);
  const pw = (await api('GET', '/api/auth/me', null, adminCookie)).data;
  ok(!!pw?.password_changed_at, 'PW-01 /me.password_changed_at is set');

  // A wrong current password is a refused field, not an expired session: a 401 would make the
  // shared client (js/api.js) redirect to the login page.
  const w3 = await api('POST', CP, { currentPassword: 'wrong-' + PASS, newPassword: PASS + 'y', newPasswordConfirm: PASS + 'y' }, adminCookie);
  ok(w3.status === 400 && w3.data?.field === 'currentPassword' && w3.data?.error === 'Current password is incorrect',
    `PW-02 wrong current password → 400 field currentPassword (got ${w3.status})`);
  ADMIN_DEVICE = deviceCookie(EMAIL);   // a password change removes the trusted devices
  ok((await api('POST', '/api/auth/login', { email: EMAIL, password: PASS }, ADMIN_DEVICE)).status === 200, 'PW-02 the password is unchanged');
}

// ── Security ─────────────────────────────────────────────────────────────────

async function testSecurity() {
  section('Security — unauthenticated → 401');
  for (const [m, p] of [
    ['GET', '/api/users'],
    ['GET', '/api/clients'],
    ['GET', '/api/client-groups'],
    ['GET', '/api/pipeline-years'],
    ['GET', '/api/pots'],
    ['GET', '/api/cost-grids'],
    ['GET', '/api/projects'],
    ['GET', '/api/ratecards'],       // requireAuth — unauthenticated still gets 401
  ]) {
    ok((await api(m, p)).status === 401, `SEC-01 ${m} ${p} → 401`);
  }

  // SEC-10: ratecard reads are requireAuth (GET → 401 unauthenticated); writes are admin-only
  for (const [m, p, b] of [
    ['POST',   '/api/ratecards',           { name: '__sec_test__', clientId: null }],
    ['PATCH',  '/api/ratecards/fake-id',   [{ roleId: 'x', hourlyRate: 1 }]],
    ['DELETE', '/api/ratecards/fake-id',   null],
  ]) {
    // Unauthenticated → 401; non-admin → 403 requires a second user (manual)
    ok((await api(m, p, b)).status === 401, `SEC-10 ${m} ${p} without cookie → 401`);
  }
}

// ── Pipeline Years ────────────────────────────────────────────────────────────

async function testPipelineYears() {
  section('Pipeline Years');

  // List
  const r1 = await api('GET', '/api/pipeline-years', null, adminCookie);
  ok(r1.status === 200 && Array.isArray(r1.data), 'PY-01 GET list → 200 array');

  // Create
  const r2 = await api('POST', '/api/pipeline-years', { year: TEST_YEAR }, adminCookie);
  ok(r2.status === 201, `PY-02 POST year ${TEST_YEAR} → 201`);
  const pyId = r2.data?.id;
  ok(!!pyId,                    'PY-02 response has id');
  ok(r2.data?.active === true,  'PY-02 new year is active by default');
  if (pyId) later('DELETE', `/api/pipeline-years/${pyId}`);

  // Duplicate → 409
  ok((await api('POST', '/api/pipeline-years', { year: TEST_YEAR }, adminCookie)).status === 409,
    'PY-03 duplicate year → 409');

  // Invalid year → 400
  ok((await api('POST', '/api/pipeline-years', { year: 1800 }, adminCookie)).status === 400,
    'PY-04 year < 2000 → 400');

  if (!pyId) return;

  // Deactivate
  const r5 = await api('PATCH', `/api/pipeline-years/${pyId}`, { active: false }, adminCookie);
  ok(r5.status === 200 && r5.data?.active === false, 'PY-05 deactivate → active=false');

  // Inactive year → 403 on cost-grids
  ok((await api('GET', `/api/cost-grids?year=${TEST_YEAR}`, null, adminCookie)).status === 403,
    'PY-05b inactive year on GET /cost-grids → 403');

  // Reactivate
  const r7 = await api('PATCH', `/api/pipeline-years/${pyId}`, { active: true }, adminCookie);
  ok(r7.status === 200 && r7.data?.active === true, 'PY-06 reactivate → active=true');

  // Active year → 200 on cost-grids
  ok((await api('GET', `/api/cost-grids?year=${TEST_YEAR}`, null, adminCookie)).status === 200,
    'PY-06b active year on GET /cost-grids → 200');

  // Unknown year → 404
  ok((await api('GET', '/api/cost-grids?year=9998', null, adminCookie)).status === 404,
    'PY-07 unknown year on GET /cost-grids → 404');

  // ── offers count per year (PY-10..PY-14) ──
  const rowsAll = (await api('GET', '/api/pipeline-years', null, adminCookie)).data || [];
  ok(rowsAll.length > 0 && rowsAll.every(r => Number.isInteger(r.offers) && r.offers >= 0),
    'PY-10 every row has an integer offers >= 0');

  // publish always stamps the current calendar year, so that is the year the fixtures land in.
  const offYear = new Date().getFullYear();
  if (!rowsAll.find(r => r.year === offYear)) {
    const ry = await api('POST', '/api/pipeline-years', { year: offYear }, adminCookie);
    if (ry.data?.id) later('DELETE', `/api/pipeline-years/${ry.data.id}`);
  }
  const offersFor = async (cookie, year) =>
    ((await api('GET', '/api/pipeline-years', null, cookie)).data || []).find(r => r.year === year)?.offers;

  const { id: plainId, cookie: plain } = await getPlainUser();
  const base = { admin: await offersFor(adminCookie, offYear), plain: await offersFor(plain, offYear) };

  // Fixtures are owned by the sysadmin so the plain user is neither owner nor shared.
  const mkCg = async (tag, published = true) => {
    const g = await api('POST', '/api/cost-grids', { name: `__test_py_offers_${tag}__` }, sysadminCookie);
    const cgId = g.data?.id;
    if (cgId) later('POST', `/api/admin/reset/cost-grid/${cgId}`);
    const v = await api('POST', `/api/cost-grids/${cgId}/versions`, { label: 'v1' }, sysadminCookie);
    const vId = v.data?.id;
    if (published) await api('POST', `/api/cost-grids/${cgId}/versions/${vId}/publish`, null, sysadminCookie);
    return { cgId, vId };
  };
  const cancel = (c, vId) =>
    api('PATCH', `/api/cost-grids/${c.cgId}/versions/${vId}`, { pipeline: 'Canceled' }, sysadminCookie);

  const A = await mkCg('a');
  const B = await mkCg('b'); await cancel(B, B.vId);
  await mkCg('c', false);
  const D = await mkCg('d');
  const d2 = await api('POST', `/api/cost-grids/${D.cgId}/versions`, { label: 'v2' }, sysadminCookie);
  await api('POST', `/api/cost-grids/${D.cgId}/versions/${d2.data?.id}/publish`, null, sysadminCookie);
  await cancel(D, d2.data?.id);

  ok((await offersFor(adminCookie, offYear)) - base.admin === 1,
    'PY-11 admin offers delta = 1 (Canceled / Draft-only / Canceled display version not counted)');
  ok((await offersFor(plain, offYear)) - base.plain === 0,
    'PY-12 plain user offers delta = 0 for CGs neither owned nor shared');
  const sh = await api('POST', `/api/cost-grids/${A.cgId}/shares`,
    { userId: plainId, permission: 'viewer' }, sysadminCookie);
  ok(sh.status === 200 || sh.status === 201, 'PY-13 setup share to plain user');
  ok((await offersFor(plain, offYear)) - base.plain === 1,
    'PY-13 plain user offers delta = 1 after the proposal is shared with them');

  const emptyYear = 2096;   // unused elsewhere (2097 is TEST_YEAR_C)
  const re = await api('POST', '/api/pipeline-years', { year: emptyYear }, adminCookie);
  if (re.data?.id) later('DELETE', `/api/pipeline-years/${re.data.id}`);
  ok((await offersFor(adminCookie, emptyYear)) === 0, 'PY-14 year with no proposals has offers = 0');
}

// ── Clients ───────────────────────────────────────────────────────────────────

async function testClients() {
  section('Clients');
  const name = `__test_client_${Date.now()}__`;

  const r1 = await api('GET', '/api/clients', null, adminCookie);
  ok(r1.status === 200 && Array.isArray(r1.data), 'CL-01 GET list → 200 array');

  const r2 = await api('POST', '/api/clients', { name }, adminCookie);
  ok(r2.status === 201, 'CL-02 POST create → 201');
  const id = r2.data?.id;
  ok(!!id, 'CL-02 response has id');
  if (id) later('DELETE', `/api/clients/${id}`);

  // Duplicate name → 409
  ok((await api('POST', '/api/clients', { name }, adminCookie)).status === 409,
    'CL-04 duplicate name → 409');

  // Rename
  if (id) {
    ok((await api('PATCH', `/api/clients/${id}`, { name: name + '_renamed' }, adminCookie)).status === 200,
      'CL-03 PATCH rename → 200');
  }
}

// ── Client Groups ─────────────────────────────────────────────────────────────

async function testClientGroups() {
  section('Client Groups');

  // Supporting client
  const rc = await api('POST', '/api/clients', { name: '__test_cg_client__' }, adminCookie);
  const clientId = rc.data?.id;
  if (clientId) later('DELETE', `/api/clients/${clientId}`);

  // Create group
  const r1 = await api('POST', '/api/client-groups', { name: '__test_group__' }, adminCookie);
  ok(r1.status === 201, 'CG-G-01 POST create group → 201');
  const gid = r1.data?.id;
  ok(!!gid, 'CG-G-01 response has id');
  if (gid) later('DELETE', `/api/client-groups/${gid}`);

  // List includes new group
  const r2 = await api('GET', '/api/client-groups', null, adminCookie);
  ok(r2.status === 200 && Array.isArray(r2.data), 'CG-G-02 GET list → 200 array');
  ok(Array.isArray(r2.data) && r2.data.some(g => g.id === gid), 'CG-G-02 new group in list');

  if (gid && clientId) {
    // Assign client — PUT /api/client-groups/:id/clients/:clientId
    const r3 = await api('PUT', `/api/client-groups/${gid}/clients/${clientId}`, null, adminCookie);
    ok([200, 201].includes(r3.status), 'CG-G-04 assign client → 200/201');

    // Remove client — DELETE /api/client-groups/:id/clients/:clientId
    const r4 = await api('DELETE', `/api/client-groups/${gid}/clients/${clientId}`, null, adminCookie);
    ok([200, 204].includes(r4.status), 'CG-G-05 remove client → 200/204');
  }

  // CG-POT — a group with a POT cannot be deleted; GET lists its POT years
  const potYear = 2098;
  const rpg = await api('POST', '/api/client-groups', { name: '__test_cg_pot_group__' }, adminCookie);
  const pgid = rpg.data?.id;
  if (pgid) later('DELETE', `/api/client-groups/${pgid}`);
  const rpp = pgid ? await api('POST', '/api/pots', { clientGroupId: pgid, year: potYear, amount: 1000 }, adminCookie) : null;
  const potId = rpp?.data?.id;
  if (potId) later('DELETE', `/api/pots/${potId}`);
  if (pgid && potId) {
    const rd = await api('DELETE', `/api/client-groups/${pgid}`, null, adminCookie);
    ok(rd.status === 409 && rd.data?.code === 'GROUP_HAS_POT', 'CG-POT-01 DELETE group with a POT → 409 GROUP_HAS_POT');
    const rl = await api('GET', '/api/client-groups', null, adminCookie);
    const g = (rl.data || []).find(x => x.id === pgid);
    ok(!!g, 'CG-POT-01 group still listed after refused delete');
    ok(Array.isArray(g?.pots) && g.pots.length === 1 && g.pots[0].id === potId && g.pots[0].year === potYear,
      'CG-POT-02 GET group lists pots [{ id, year }]');
  } else {
    fail('CG-POT: group/POT setup failed — skipping');
  }
  // CG-POT-04 — the POT years are for admins: a plain user's list carries no pots field
  if (pgid) {
    const plain = await getPlainUserCookie();
    if (plain) {
      const rp = await api('GET', '/api/client-groups', null, plain);
      const gp = (rp.data || []).find(x => x.id === pgid);
      ok(rp.status === 200 && !!gp && !('pots' in gp), 'CG-POT-04 a plain user sees the group but no pots field');
    } else {
      fail('CG-POT-04: no plain-user session — skipping');
    }
  }
  const rng = await api('POST', '/api/client-groups', { name: '__test_cg_nopot_group__' }, adminCookie);
  const ngid = rng.data?.id;
  if (ngid) {
    later('DELETE', `/api/client-groups/${ngid}`);
    const rl2 = await api('GET', '/api/client-groups', null, adminCookie);
    const g2 = (rl2.data || []).find(x => x.id === ngid);
    ok(Array.isArray(g2?.pots) && g2.pots.length === 0, 'CG-POT-03 group without a POT has pots = []');
    const rd2 = await api('DELETE', `/api/client-groups/${ngid}`, null, adminCookie);
    ok(rd2.status === 200, 'CG-POT-03 DELETE group without a POT → 200');
  }
}

// ── Roles ─────────────────────────────────────────────────────────────────────

async function testRoles() {
  section('Roles');

  // List — verify rate_overrides field is returned
  const r1 = await api('GET', '/api/roles', null, adminCookie);
  ok(r1.status === 200 && Array.isArray(r1.data), 'RL-01 GET /roles → 200 array');

  if (!Array.isArray(r1.data) || r1.data.length === 0) {
    ok(true, 'RL-01 rate_overrides field present — skipped (no roles in system)');
    ok(true, 'RL-01 PATCH rateOverrides saved and returned — skipped (no roles in system)');
    return;
  }

  // Verify GET returns rate_overrides on each role
  ok(r1.data.every(r => 'rate_overrides' in r || r.rate_overrides !== undefined || Object.prototype.hasOwnProperty.call(r, 'rate_overrides')),
    'RL-01 GET /roles: every role has rate_overrides field');

  // PATCH a role with rateOverrides — use first available role
  const role = r1.data[0];
  const testOverrides = { USD: 200, GBP: 180 };
  const r2 = await api('PATCH', `/api/roles/${role.id}`, { rateOverrides: testOverrides }, adminCookie);
  ok(r2.status === 200, 'RL-01 PATCH /roles/:id with rateOverrides → 200');

  // Verify GET returns the saved overrides
  const r3 = await api('GET', '/api/roles', null, adminCookie);
  const updated = Array.isArray(r3.data) ? r3.data.find(r => r.id === role.id) : null;
  ok(updated !== null, 'RL-01 updated role found in GET /roles after PATCH');
  ok(
    updated && Number(updated.rate_overrides?.USD) === 200 && Number(updated.rate_overrides?.GBP) === 180,
    'RL-01 rate_overrides.USD and GBP saved correctly and returned by GET /roles'
  );

  // Restore original overrides (clean up — set back to original or empty)
  const origOverrides = role.rate_overrides || {};
  await api('PATCH', `/api/roles/${role.id}`, { rateOverrides: origOverrides }, adminCookie);
}

// ── Ratecards ─────────────────────────────────────────────────────────────────

async function testRatecards() {
  section('Ratecards');

  // Need at least one role for the entries test
  const rolesRes = await api('GET', '/api/roles', null, adminCookie);
  const roles = Array.isArray(rolesRes.data) ? rolesRes.data : [];

  // List
  const r1 = await api('GET', '/api/ratecards', null, adminCookie);
  ok(r1.status === 200 && Array.isArray(r1.data), 'RC-01 GET /ratecards → 200 array');

  // Create a ratecard (a client is required)
  const rc2ClientRes = await api('POST', '/api/clients', { name: `__test_rc2_client_${Date.now()}__` }, adminCookie);
  const rc2ClientId = rc2ClientRes.data?.id;
  if (rc2ClientId) later('DELETE', `/api/clients/${rc2ClientId}`);
  const rcName = `__test_rc_${Date.now()}__`;
  const r2 = await api('POST', '/api/ratecards', { name: rcName, clientId: rc2ClientId }, adminCookie);
  ok(r2.status === 201, 'RC-02 POST create ratecard for a client → 201');
  const rcId = r2.data?.id;
  ok(!!rcId, 'RC-02 response has id');
  if (rcId) later('DELETE', `/api/ratecards/${rcId}`);

  // Get by id
  if (rcId) {
    const r3 = await api('GET', `/api/ratecards/${rcId}`, null, adminCookie);
    ok(r3.status === 200, 'RC-03 GET /ratecards/:id → 200');
    ok(r3.data?.id === rcId, 'RC-03 returned ratecard matches id');
  }

  // Create per-client ratecard (auto-create path used by Costgrid modal)
  const rcClientRes = await api('POST', '/api/clients', { name: `__test_rc_client_${Date.now()}__` }, adminCookie);
  const rcClientId = rcClientRes.data?.id;
  if (rcClientId) later('DELETE', `/api/clients/${rcClientId}`);

  if (rcClientId) {
    const r4 = await api('POST', '/api/ratecards', { name: `__test_rc_per_client__`, clientId: rcClientId }, adminCookie);
    ok(r4.status === 201, 'RC-04 POST per-client ratecard → 201');
    ok(r4.data?.client_id === rcClientId, 'RC-04 ratecard linked to correct client');
    const rcPerClientId = r4.data?.id;
    let rcVer = r4.data?.version;
    // Entries PATCH carrying the card's version; follows the version the server returns
    const putEntries = async body => {
      const r = await api('PATCH', `/api/ratecards/${rcPerClientId}/entries`, { version: rcVer, entries: body }, adminCookie);
      if (r.status === 200 && typeof r.data?.version === 'number') rcVer = r.data.version;
      return r;
    };
    if (rcPerClientId) later('DELETE', `/api/ratecards/${rcPerClientId}`);

    // Update entries (PATCH /api/ratecards/:id/entries) — core of Costgrid modal save
    // Own roles, so the entries checks run on any database (the ephemeral test DB has none)
    const rcTag = String(Date.now());
    const rcRoles = rcPerClientId ? [await makeTestRole('RCA' + rcTag), await makeTestRole('RCB' + rcTag)].filter(r => r.id) : [];
    if (rcPerClientId && rcRoles.length === 2) {
      const entries = [{ roleId: rcRoles[0].id, hourlyRate: 150 }];
      const r5 = await putEntries(entries);
      ok(r5.status === 200, 'RC-05 PATCH /ratecards/:id/entries → 200');

      // Verify the entry is persisted
      const r6 = await api('GET', `/api/ratecards/${rcPerClientId}`, null, adminCookie);
      ok(
        Array.isArray(r6.data?.entries) && r6.data.entries.some(e =>
          String(e.roleId || e.role_id) === String(rcRoles[0].id) &&
          Number(e.hourlyRate || e.hourly_rate) === 150
        ),
        'RC-05 entry persisted with correct rate'
      );

      // Clear entries (empty array = fall back to agency default)
      const r7 = await putEntries([]);
      ok(r7.status === 200, 'RC-06 PATCH entries with empty array → 200 (clear all custom rates)');
      const entriesOf = async () => {
        const g = await api('GET', `/api/ratecards/${rcPerClientId}`, null, adminCookie);
        return (g.data?.entries || []).filter(e => (e.roleId || e.role_id));
      };
      const rid = e => String(e.roleId || e.role_id);
      const rate = e => (e.hourlyRate !== undefined ? e.hourlyRate : e.hourly_rate);
      const ovr = e => e.rateOverrides || e.rate_overrides || {};
      ok((await entriesOf()).length === 0, 'RC-06 no entry left after the empty-array PATCH');

      {
        await ensureTestCurrencies();
        const A = rcRoles[0].id, B = rcRoles[1].id;
        const r8 = await putEntries([{ roleId: A, hourlyRate: null, rateOverrides: { USD: 175.5 } }]);
        const eA = (await entriesOf()).filter(e => rid(e) === String(A));
        ok(r8.status === 200 && eA.length === 1 && rate(eA[0]) === null && Number(ovr(eA[0]).USD) === 175.5
          && !eA.some(e => rate(e) !== null && Number(rate(e)) === 0),
          'RC-07 null EUR rate + USD override saved; EUR reads back null, not 0');
        const before = JSON.stringify(await entriesOf());
        const r9 = await putEntries([{ roleId: A, hourlyRate: null, rateOverrides: {} }]);
        ok(r9.status === 400 && r9.data?.code === 'MONEY_RULE' && JSON.stringify(await entriesOf()) === before,
          'RC-08 empty entry → 400 MONEY_RULE, no write');
        const r10 = await putEntries([{ roleId: A, hourlyRate: 0 }, { roleId: B, hourlyRate: 120 }]);
        const e2 = await entriesOf();
        const a2 = e2.find(e => rid(e) === String(A)), b2 = e2.find(e => rid(e) === String(B));
        ok(r10.status === 200 && a2 && Number(rate(a2)) === 0 && b2 && Number(rate(b2)) === 120,
          'RC-09 hourlyRate 0 stored as 0, other role at 120');
        const r11 = await putEntries([{ roleId: B, hourlyRate: 120 }]);
        const e3 = await entriesOf();
        ok(r11.status === 200 && !e3.some(e => rid(e) === String(A)) && e3.some(e => rid(e) === String(B) && Number(rate(e)) === 120),
          'RC-10 role omitted from the body loses its entry');

        const r12 = await api('PATCH', '/api/ratecards/not-a-uuid/entries', { version: 0, entries: [] }, adminCookie);
        ok(r12.status === 400, 'RC-11 malformed ratecard id → 400, not 500');
        const r13 = await api('PATCH', '/api/ratecards/00000000-0000-4000-8000-000000000000/entries', { version: 0, entries: [] }, adminCookie);
        ok(r13.status === 404, 'RC-12 unknown ratecard id → 404');
        const r14 = await putEntries([{ roleId: 'not-a-uuid', hourlyRate: 1 }]);
        const e4 = await entriesOf();
        ok(r14.status === 400 && e4.some(e => rid(e) === String(B) && Number(rate(e)) === 120),
          'RC-13 malformed roleId → 400, entries unchanged');
        const unknownRole = '00000000-0000-4000-8000-000000000000';
        const r15 = await putEntries([{ roleId: unknownRole, hourlyRate: 1 }]);
        const e5 = await entriesOf();
        ok(r15.status === 200 && !e5.some(e => rid(e) === unknownRole) && !e5.some(e => rid(e) === String(B)),
          'RC-13b unknown (valid uuid) roleId → 200, dropped; the role omitted from the body loses its entry');
      }
    } else if (rcPerClientId) {
      ok(true, 'RC-05 skipped — role creation failed');
      ok(true, 'RC-05 entry persisted with correct rate — skipped');
      ok(true, 'RC-06 PATCH entries with empty array — skipped');
    }
  }
}

// ── Server validation (cycle 2) ───────────────────────────────────────────────
// A plain sequence of checks; later tasks of the cycle append to it.

async function testServerValidation() {
  section('Server validation (cycle 2)');
  const someUuid = '00000000-0000-4000-8000-000000000001';

  // POT summary: malformed query values are a 400, not a database error
  const s1 = await api('GET', '/api/pots/summary?year=2026&clientId=not-a-uuid', null, adminCookie);
  ok(s1.status === 400, `SV-01 pots summary with a non-UUID clientId → 400 (got ${s1.status})`);
  const s2 = await api('GET', '/api/pots/summary?year=2026&clientGroupId=not-a-uuid', null, adminCookie);
  ok(s2.status === 400, `SV-02 pots summary with a non-UUID clientGroupId → 400 (got ${s2.status})`);
  const s3 = await api('GET', `/api/pots/summary?year=abc&clientId=${someUuid}`, null, adminCookie);
  ok(s3.status === 400, `SV-03 pots summary with a non-integer year → 400 (got ${s3.status})`);
  const s3b = await api('GET', `/api/pots/summary?year=%20&clientId=${someUuid}`, null, adminCookie);
  ok(s3b.status === 400, `SV-03b pots summary with a blank year → 400 (got ${s3b.status})`);

  // POT creation: a special label must be one of the known labels, exactly
  const p1 = await api('POST', '/api/pots', { specialLabel: 'New Biz ', year: 2097, amount: 1 }, adminCookie);
  if (p1.data?.id) later('DELETE', `/api/pots/${p1.data.id}`);
  const pl = await api('GET', '/api/pots?year=2097', null, adminCookie);
  ok(p1.status === 400 && Array.isArray(pl.data) && !pl.data.some(p => p.special_label === 'New Biz '),
    `SV-04 POST pots with an unknown special label → 400, nothing stored (got ${p1.status})`);

  // Currency rates: outside 0.000001 … 9999.999999 is a 400 and changes nothing
  const rateMsg = 'Rate must be between 0.000001 and 9999.999999';
  const curList = async () => (await api('GET', '/api/currencies', null, adminCookie)).data || [];
  const before = (await curList()).find(c => c.code === 'USD');
  for (const bad of [0.0000001, 16500]) {
    const r = await api('PATCH', '/api/currencies/USD/rate', { rate: bad }, adminCookie);
    ok(r.status === 400 && r.data?.error === rateMsg, `SV-05 PATCH rate ${bad} → 400 with the range message (got ${r.status})`);
  }
  const after = (await curList()).find(c => c.code === 'USD');
  ok(!!before && !!after && parseFloat(after.current_rate) === parseFloat(before.current_rate),
    'SV-05 the stored USD rate is unchanged after the refusals');
  for (const bad of [0.0000001, 16500]) {
    const r = await api('POST', '/api/currencies/NOK/activate', { rate: bad }, adminCookie);
    ok(r.status === 400 && r.data?.error === rateMsg, `SV-06 activate with rate ${bad} → 400 with the range message (got ${r.status})`);
  }
  const nok = (await curList()).find(c => c.code === 'NOK');
  ok(!!nok && nok.active === false, 'SV-06 NOK is still inactive after the refusals');

  // NUMERIC columns reach the client as JSON numbers (B-193)
  const roleCode = `TESTROLESV${Date.now()}`;
  const sr = await api('POST', '/api/roles', { label: `__test_role_sv_${Date.now()}__`, code: roleCode, hourlyRate: 123.45 }, adminCookie);
  if (sr.data?.id) later('DELETE', `/api/roles/${sr.data.id}`);
  const roles = (await api('GET', '/api/roles', null, adminCookie)).data || [];
  const myRole = roles.find(r => r.code === roleCode);
  ok(!!myRole && typeof myRole.hourly_rate === 'number' && myRole.hourly_rate === 123.45,
    `SV-07 GET roles → hourly_rate is a number (got ${typeof myRole?.hourly_rate})`);
  const sp = await api('POST', '/api/pots', { specialLabel: 'New Biz', year: 2096, amount: 750.5 }, adminCookie);
  if (sp.data?.id) later('DELETE', `/api/pots/${sp.data.id}`);
  const spl = (await api('GET', '/api/pots?year=2096', null, adminCookie)).data || [];
  const myPot = spl.find(p => p.id === sp.data?.id);
  ok(!!myPot && typeof myPot.amount === 'number' && myPot.amount === 750.5,
    `SV-08 GET pots → amount is a number (got ${typeof myPot?.amount})`);

  // Project writes on a project that does not exist, or with a malformed id (B-189, B-191, B-192)
  const ghost = '00000000-0000-4000-8000-0000000000aa';
  const g1 = await api('PATCH', `/api/projects/${ghost}/phasing`, { phasing: { '2026-01': 10 } }, adminCookie);
  ok(g1.status === 404 && g1.data?.error === 'Project not found', `SV-10 PATCH phasing on a missing project → 404 (got ${g1.status})`);
  const g2 = await api('PATCH', `/api/projects/${ghost}/ptc`, { ptc: [{ amount: 10 }] }, adminCookie);
  ok(g2.status === 404 && g2.data?.error === 'Project not found', `SV-11 PATCH ptc on a missing project → 404 (got ${g2.status})`);
  const g3 = await api('PUT', `/api/projects/${ghost}/tasks`, [], adminCookie);
  ok(g3.status === 404, `SV-12 PUT tasks on a missing project → 404 (got ${g3.status})`);
  const g4 = await api('PATCH', '/api/projects/not-a-uuid/phasing', { phasing: {} }, adminCookie);
  ok(g4.status === 400, `SV-13 PATCH phasing with a non-UUID id → 400 (got ${g4.status})`);
  const g5 = await api('PUT', '/api/projects/not-a-uuid/tasks', [], adminCookie);
  ok(g5.status === 400, `SV-13b PUT tasks with a non-UUID id → 400 (got ${g5.status})`);
  const g6 = await api('PATCH', '/api/projects/not-a-uuid/ptc', { ptc: [] }, adminCookie);
  ok(g6.status === 400, `SV-13c PATCH ptc with a non-UUID id → 400 (got ${g6.status})`);

  // Cost grid structure PUT (B-189, B-192, B-229)
  const sg = await api('POST', '/api/cost-grids', { name: '__test_sv_structure__' }, adminCookie);
  const sgId = sg.data?.id;
  if (sgId) later('POST', `/api/admin/reset/cost-grid/${sgId}`);
  const sgv = sgId ? await api('POST', `/api/cost-grids/${sgId}/versions`, { label: 'sv', currency: 'EUR' }, adminCookie) : null;
  const svId = sgv?.data?.id;
  if (!ok(!!svId && !!myRole, `SV-20 setup: grid, version and role (got ${sgv?.status})`)) {
    // fall through to the project checks
  } else {
    const putS = (vid, body) => api('PUT', `/api/cost-grids/${sgId}/versions/${vid}/structure`, body, adminCookie);
    const s20 = await putS(someUuid, { phases: [], roles: [{ roleCode: 'X', rate: 10 }] });
    ok(s20.status === 404 && s20.data?.error === 'Version not found', `SV-20 structure PUT on a missing version → 404 (got ${s20.status})`);
    const s21 = await putS('not-a-uuid', { phases: [], roles: [] });
    ok(s21.status === 404 && s21.data?.error === 'Version not found', `SV-21 structure PUT with a non-UUID version id → 404 from the versionScope middleware (got ${s21.status})`);
    const task = { taskName: 'T1', hours: { [myRole.code]: 8 } };
    const s22 = await putS(svId, { phases: [{ phaseName: 'P1', tasks: [task] }], roles: [{ roleCode: myRole.code, rate: null, rateIsCustom: true }] });
    ok(s22.status === 200, `SV-22 structure PUT with a custom flag and no rate → 200 (got ${s22.status}: ${s22.data?.error})`);
    const st = (await api('GET', `/api/cost-grids/${sgId}/versions/${svId}/structure`, null, adminCookie)).data;
    const tr = st?.phases?.[0]?.tasks?.[0]?.roles?.find(r => r.code === myRole.code);
    ok(!!tr && tr.rate_is_custom === false, `SV-22 the stored role has rate_is_custom false (got ${tr?.rate_is_custom})`);
    const s22b = await putS(svId, { phases: [{ phaseName: 'P1', tasks: [task] }], roles: [{ roleCode: myRole.code, rate: 50, rateIsCustom: true }] });
    ok(s22b.status === 200, `SV-22 a valid structure PUT afterwards → 200 (got ${s22b.status})`);
    const s23 = await putS(svId, { phases: [{ phaseName: 'P1', tasks: [task] }], roles: [{ roleCode: myRole.code, rate: -1 }] });
    ok(s23.status === 400 && s23.data?.code === 'MONEY_RULE', `SV-23 structure PUT with rate -1 → 400 MONEY_RULE (got ${s23.status})`);
    const s23b = await putS(svId, { phases: [{ phaseName: 'P1', tasks: [task] }], roles: [{ roleCode: myRole.code, rate: 60 }] });
    ok(s23b.status === 200, `SV-23 a valid structure PUT right after the refusal → 200 (got ${s23b.status}: ${s23b.data?.error})`);
  }

  // Rate cards: a client is required, clone is gone, stale saves are refused by version
  const svRcClient = await api('POST', '/api/clients', { name: `__test_sv_rc_client_${Date.now()}__` }, adminCookie);
  if (svRcClient.data?.id) later('DELETE', `/api/clients/${svRcClient.data.id}`);
  const s30 = await api('POST', '/api/ratecards', { name: '__test_sv_rc__' }, adminCookie);
  ok(s30.status === 400, `SV-30 POST ratecard without clientId → 400 (got ${s30.status})`);
  const s31 = await api('POST', '/api/ratecards', { name: '__test_sv_rc__', clientId: '00000000-0000-4000-8000-0000000000aa' }, adminCookie);
  ok(s31.status === 400, `SV-31 POST ratecard with an unknown clientId → 400 (got ${s31.status})`);
  const s32 = await api('POST', '/api/ratecards/clone', { clientId: svRcClient.data?.id, name: 'x' }, adminCookie);
  ok(s32.status === 404, `SV-32 POST /ratecards/clone → 404 (got ${s32.status})`);
  const svRc = await api('POST', '/api/ratecards', { name: '__test_sv_rc__', clientId: svRcClient.data?.id }, adminCookie);
  const svRcId = svRc.data?.id;
  if (svRcId) later('DELETE', `/api/ratecards/${svRcId}`);
  const svRole1 = await makeTestRole('SVA' + Date.now());
  const svRole2 = await makeTestRole('SVB' + Date.now());
  if (svRcId && svRole1.id && svRole2.id) {
    const svEntries = async () => (await api('GET', `/api/ratecards/${svRcId}`, null, adminCookie)).data?.entries || [];
    const svPatch = body => api('PATCH', `/api/ratecards/${svRcId}/entries`, body, adminCookie);
    const s33 = await svPatch([{ roleId: svRole1.id, hourlyRate: 10 }]);
    ok(s33.status === 409 && s33.data?.code === 'RATECARD_STALE' && (await svEntries()).length === 0,
      `SV-33 entries PATCH with a bare array → 409 RATECARD_STALE, entries unchanged (got ${s33.status})`);
    const s34 = await svPatch({ version: 0, entries: [{ roleId: svRole1.id, hourlyRate: 10 }] });
    ok(s34.status === 200 && s34.data?.version === 1, `SV-34 version 0 on a fresh card → 200 { version: 1 } (got ${s34.status}, ${JSON.stringify(s34.data)})`);
    const afterS34 = JSON.stringify(await svEntries());
    const s35 = await svPatch({ version: 0, entries: [{ roleId: svRole2.id, hourlyRate: 20 }] });
    ok(s35.status === 409 && s35.data?.code === 'RATECARD_STALE' && JSON.stringify(await svEntries()) === afterS34,
      `SV-35 version 0 again → 409, entries as after SV-34 (got ${s35.status})`);
    const s36 = await svPatch({ version: 1, entries: [{ roleId: svRole1.id, hourlyRate: 10 }, { roleId: svRole1.id, hourlyRate: 11 }] });
    ok(s36.status === 400 && JSON.stringify(await svEntries()) === afterS34, `SV-36 duplicate roleId → 400, entries unchanged (got ${s36.status})`);
    await api('DELETE', `/api/roles/${svRole2.id}`, null, adminCookie);
    const s37 = await svPatch({ version: 1, entries: [{ roleId: svRole1.id, hourlyRate: 12 }, { roleId: svRole2.id, hourlyRate: 20 }] });
    const s37e = await svEntries();
    ok(s37.status === 200 && s37e.length === 1 && String(s37e[0].roleId) === String(svRole1.id),
      `SV-37 an entry whose role was deleted → 200, that role absent (got ${s37.status}, ${s37e.length} entries)`);
  } else ok(false, 'SV-33..37 setup failed');

  // Pipeline years: admins see the proposals that use a year, Drafts included (B-297)
  const hidYear = 2093;
  const hidPy = await api('POST', '/api/pipeline-years', { year: hidYear }, adminCookie);
  if (hidPy.data?.id) later('DELETE', `/api/pipeline-years/${hidPy.data.id}`);
  const hidCg = await api('POST', '/api/cost-grids', { name: '__test_sv_hidden_proposal__' }, adminCookie);
  if (hidCg.data?.id) later('POST', `/api/admin/reset/cost-grid/${hidCg.data.id}`);
  const hidV = await api('POST', `/api/cost-grids/${hidCg.data?.id}/versions`, { label: 'v1', pipelineYear: hidYear }, adminCookie);
  if (ok(!!hidPy.data?.id && !!hidCg.data?.id && !!hidV.data?.id, `SV-40 setup: year, grid and Draft version (got ${hidPy.status}, ${hidCg.status}, ${hidV.status})`)) {
    const pyRows = (await api('GET', '/api/pipeline-years', null, adminCookie)).data || [];
    const hidRow = pyRows.find(r => r.year === hidYear);
    ok(pyRows.length > 0 && pyRows.every(r => Number.isInteger(r.proposals)),
      'SV-40 admin GET pipeline-years: every row has a numeric proposals');
    ok(!!hidRow && hidRow.offers === 0 && hidRow.proposals === 1,
      `SV-40 a year with only a Draft version → offers 0, proposals 1 (got ${hidRow?.offers}, ${hidRow?.proposals})`);
    const { cookie: svPlain } = await getPlainUser();
    const plainRows = (await api('GET', '/api/pipeline-years', null, svPlain)).data || [];
    ok(Array.isArray(plainRows) && plainRows.every(r => !('proposals' in r)),
      'SV-41 a plain user GET pipeline-years: no proposals key');
  }

  // client-groups: the pots subquery runs for admins only
  {
    const { cookie: svPlain2 } = await getPlainUser();
    const cgPlain = await api('GET', '/api/client-groups', null, svPlain2);
    ok(cgPlain.status === 200 && Array.isArray(cgPlain.data) && cgPlain.data.every(g => !('pots' in g)),
      `SV-45 a plain user GET client-groups: no row has pots (got ${cgPlain.status})`);
    const cgAdmin = await api('GET', '/api/client-groups', null, adminCookie);
    ok(cgAdmin.status === 200 && Array.isArray(cgAdmin.data) && cgAdmin.data.every(g => Array.isArray(g.pots)),
      `SV-45 an admin GET client-groups: every row has an array pots (got ${cgAdmin.status})`);
  }

  // Review round 1 additions
  // Structure PUT: a malformed body is a 400 and writes nothing
  {
    const g = await api('POST', '/api/cost-grids', { name: '__test_sv_structure__' }, adminCookie);
    if (g.data?.id) later('POST', `/api/admin/reset/cost-grid/${g.data.id}`);
    const gv = await api('POST', `/api/cost-grids/${g.data?.id}/versions`, { label: 'v1' }, adminCookie);
    if (ok(!!g.data?.id && !!gv.data?.id, `SV-46 setup: grid and version (got ${g.status}, ${gv.status})`)) {
      const stPath = `/api/cost-grids/${g.data.id}/versions/${gv.data.id}/structure`;
      const good = await api('PUT', stPath, { phases: [{ title: 'SV keep phase', tasks: [] }], roles: [] }, adminCookie);
      const titles = async () => ((await api('GET', stPath, null, adminCookie)).data?.phases || []).map(p => p.title).join('|');
      ok(good.status === 200 && await titles() === 'SV keep phase', `SV-46 setup: a valid structure PUT → 200 (got ${good.status})`);
      const b1 = await api('PUT', stPath, { phases: 'abc' }, adminCookie);
      ok(b1.status === 400 && await titles() === 'SV keep phase', `SV-46 structure PUT with phases 'abc' → 400, phases unchanged (got ${b1.status})`);
      const b2 = await api('PUT', stPath, { roles: [null] }, adminCookie);
      ok(b2.status === 400, `SV-47 structure PUT with roles [null] → 400 (got ${b2.status})`);
      const b3 = await api('PUT', stPath, { phases: {} }, adminCookie);
      ok(b3.status === 400, `SV-47 structure PUT with phases {} → 400 (got ${b3.status})`);
      const b4 = await api('PUT', stPath, { phases: [{ tasks: [{ roles: {} }] }] }, adminCookie);
      ok(b4.status === 400 && await titles() === 'SV keep phase', `SV-47 structure PUT with task roles {} → 400, phases unchanged (got ${b4.status})`);
    }
  }

  // Rate card per client: a second POST for the same client returns the first card
  {
    const rcC = await api('POST', '/api/clients', { name: `__test_sv_rc_once_${Date.now()}__` }, adminCookie);
    if (rcC.data?.id) later('DELETE', `/api/clients/${rcC.data.id}`);
    if (ok(!!rcC.data?.id, `SV-48 setup: client (got ${rcC.status})`)) {
      const [a, b] = await Promise.all([
        api('POST', '/api/ratecards', { name: '__test_sv_rc_once__', clientId: rcC.data.id }, adminCookie),
        api('POST', '/api/ratecards', { name: '__test_sv_rc_once__', clientId: rcC.data.id }, adminCookie),
      ]);
      if (a.data?.id) later('DELETE', `/api/ratecards/${a.data.id}`);
      if (b.data?.id && b.data.id !== a.data?.id) later('DELETE', `/api/ratecards/${b.data.id}`);
      ok(!!a.data?.id && a.data?.id === b.data?.id, `SV-48 two concurrent POST ratecards for one client → the same id (got ${a.status}/${b.status})`);
      const svOnceRole = await makeTestRole('SVO' + Date.now());
      if (svOnceRole.id) {
        const pe = await api('PATCH', `/api/ratecards/${a.data?.id}/entries`, { version: a.data?.version ?? 0, entries: [{ roleId: svOnceRole.id, hourlyRate: 77 }] }, adminCookie);
        ok(pe.status === 200, `SV-48 setup: an entry put on the card (got ${pe.status})`);
      }
      const c = await api('POST', '/api/ratecards', { name: '__test_sv_rc_once__', clientId: rcC.data.id }, adminCookie);
      ok(c.status === 200 && c.data?.id === a.data?.id && typeof c.data?.version === 'number', `SV-48 a later POST → 200 with the existing card (got ${c.status})`);
      ok(!svOnceRole.id || (Array.isArray(c.data?.entries) && c.data.entries.some(e => e.roleId === svOnceRole.id && Number(e.hourlyRate) === 77)),
        'SV-48 the later POST response carries the existing card entries');
      ok(Array.isArray(a.data?.entries) || Array.isArray(b.data?.entries), 'SV-48 a create response carries entries');
      const all = (await api('GET', '/api/ratecards', null, adminCookie)).data || [];
      ok(all.filter(r => r.client_id === rcC.data.id).length === 1, 'SV-48 GET ratecards shows one card for that client');
      const bv = await api('PATCH', `/api/ratecards/${a.data?.id}/entries`, { version: '3', entries: [] }, adminCookie);
      ok(bv.status === 400 && bv.data?.error === 'version must be an integer', `SV-49 entries PATCH with version '3' → 400 (got ${bv.status})`);
      const bv2 = await api('PATCH', `/api/ratecards/${a.data?.id}/entries`, { entries: [] }, adminCookie);
      ok(bv2.status === 400, `SV-49 entries PATCH without a version → 400 (got ${bv2.status})`);
    }
  }

  // POT routes: malformed ids and values are a 400
  {
    const pc = await api('POST', '/api/pots', { clientId: 'x', year: 2097, amount: 1 }, adminCookie);
    if (pc.data?.id) later('DELETE', `/api/pots/${pc.data.id}`);
    ok(pc.status === 400, `SV-50 POST pots with clientId 'x' → 400 (got ${pc.status})`);
    const pg = await api('POST', '/api/pots', { clientGroupId: 'x', year: 2097, amount: 1 }, adminCookie);
    if (pg.data?.id) later('DELETE', `/api/pots/${pg.data.id}`);
    ok(pg.status === 400, `SV-50 POST pots with clientGroupId 'x' → 400 (got ${pg.status})`);
    const py = await api('POST', '/api/pots', { specialLabel: 'New Biz', year: 'abc', amount: 1 }, adminCookie);
    if (py.data?.id) later('DELETE', `/api/pots/${py.data.id}`);
    ok(py.status === 400, `SV-50 POST pots with year 'abc' → 400 (got ${py.status})`);
    for (const [m, p] of [['GET', '/api/pots/not-a-uuid/history'], ['GET', '/api/pots/not-a-uuid/details?year=2026'],
      ['PATCH', '/api/pots/not-a-uuid'], ['DELETE', '/api/pots/not-a-uuid']]) {
      const r = await api(m, p, m === 'PATCH' ? { amount: 1, note: 'x' } : null, adminCookie);
      ok(r.status === 400, `SV-51 ${m} ${p} → 400 (got ${r.status})`);
    }
    const dm = await api('DELETE', `/api/pots/${someUuid}`, null, adminCookie);
    ok(dm.status === 404, `SV-51 DELETE of a valid but missing POT id → 404 (got ${dm.status})`);
    const ps = await api('GET', '/api/pots/pipeline-summary?year=abc', null, adminCookie);
    ok(ps.status === 400, `SV-51 pipeline-summary with year 'abc' → 400 (got ${ps.status})`);
  }

  // Currency rate must be a JSON number
  {
    const uBefore = ((await api('GET', '/api/currencies', null, adminCookie)).data || []).find(c => c.code === 'USD');
    const rs = await api('PATCH', '/api/currencies/USD/rate', { rate: '1.2abc' }, adminCookie);
    ok(rs.status === 400, `SV-52 PATCH rate '1.2abc' → 400 (got ${rs.status})`);
    const rs2 = await api('PATCH', '/api/currencies/USD/rate', { rate: '1.2' }, adminCookie);
    ok(rs2.status === 400, `SV-52 PATCH rate as a string '1.2' → 400 (got ${rs2.status})`);
    const ra = await api('POST', '/api/currencies/NOK/activate', { rate: '1.2abc' }, adminCookie);
    ok(ra.status === 400, `SV-52 activate with rate '1.2abc' → 400 (got ${ra.status})`);
    const uAfter = ((await api('GET', '/api/currencies', null, adminCookie)).data || []).find(c => c.code === 'USD');
    ok(!!uBefore && !!uAfter && parseFloat(uAfter.current_rate) === parseFloat(uBefore.current_rate), 'SV-52 the stored USD rate is unchanged');
  }

  // On a real project: an empty resource entry is a 400 and does not leak the pool client
  if (!sysadminCookie) { ok(false, 'SV-14 sysadmin account unavailable'); return; }
  const tp = await api('POST', '/api/projects', { name: '__test_sv_project__' }, sysadminCookie);
  const tpId = tp.data?.id;
  if (tpId) later('DELETE', `/api/projects/${tpId}`);
  if (!ok(!!tpId, `SV-14 setup: project created (got ${tp.status})`)) return;
  const e1 = await api('PUT', `/api/projects/${tpId}/tasks`, [{ name: 'T', resources: [null] }], adminCookie);
  ok(e1.status === 400 && e1.data?.error === 'Task "T" has an empty resource entry.',
    `SV-14 PUT tasks with a null resource → 400 (got ${e1.status}: ${e1.data?.error})`);
  const e2 = await api('PUT', `/api/projects/${tpId}/tasks`, [{ name: 'T', resources: [{ role: 'R', hourlyRate: 10 }] }], adminCookie);
  ok(e2.status === 200, `SV-14 a valid PUT tasks right after the refusal → 200 (got ${e2.status}: ${e2.data?.error})`);

  const phasingOf = async () => ((await api('GET', '/api/projects', null, adminCookie)).data || []).find(p => p.id === tpId)?.phasing;
  const phBefore = JSON.stringify(await phasingOf());
  const bp = await api('PATCH', `/api/projects/${tpId}/phasing`, { phasing: { '2026-01': -1 } }, adminCookie);
  ok(bp.status === 400, `SV-15 PATCH phasing with an invalid amount → 400 (got ${bp.status})`);
  ok(JSON.stringify(await phasingOf()) === phBefore, 'SV-15 the stored phasing is unchanged after the refusal');
  const t1 = await api('PUT', `/api/projects/${tpId}/tasks`, [{ name: 'T', resources: {} }], adminCookie);
  ok(t1.status === 400, `SV-53 PUT tasks with resources {} → 400 (got ${t1.status})`);
  const t2 = await api('PUT', `/api/projects/${tpId}/tasks`, [null], adminCookie);
  ok(t2.status === 400, `SV-53 PUT tasks with [null] → 400 (got ${t2.status})`);
}

// ── POT Targets ───────────────────────────────────────────────────────────────

async function testPots() {
  section('POT Targets');

  // Setup: pipeline year + client (use TEST_YEAR_B to avoid conflicts with PY tests)
  const rpy = await api('POST', '/api/pipeline-years', { year: TEST_YEAR_B }, adminCookie);
  const pyId = rpy.data?.id;
  if (pyId) later('DELETE', `/api/pipeline-years/${pyId}`);

  const rc = await api('POST', '/api/clients', { name: '__test_pot_client__' }, adminCookie);
  const clientId = rc.data?.id;
  if (clientId) later('DELETE', `/api/clients/${clientId}`);

  if (!clientId || !pyId) { fail('POT: setup failed — skipping section'); return; }

  // Create
  const r1 = await api('POST', '/api/pots', { clientId, year: TEST_YEAR_B, amount: 100000 }, adminCookie);
  ok(r1.status === 201, 'POT-01 POST create → 201');
  const potId = r1.data?.id;
  ok(!!potId, 'POT-01 response has id');
  ok(Number(r1.data?.amount) === 100000, 'POT-01 amount matches');
  if (potId) later('DELETE', `/api/pots/${potId}`);

  // List with year filter
  const r2 = await api('GET', `/api/pots?year=${TEST_YEAR_B}`, null, adminCookie);
  ok(r2.status === 200 && Array.isArray(r2.data), 'POT-02 GET list?year → 200 array');
  ok(Array.isArray(r2.data) && r2.data.some(p => p.id === potId), 'POT-02 new POT in list');

  // Duplicate → 409
  ok((await api('POST', '/api/pots', { clientId, year: TEST_YEAR_B, amount: 999 }, adminCookie)).status === 409,
    'POT-07 duplicate POT (same client+year) → 409');

  // POT-29 — special target (B-194): created once per label + year
  const rs = await api('POST', '/api/pots', { specialLabel: 'New Biz', year: 2099, amount: 500 }, adminCookie);
  ok(rs.status === 201 && rs.data?.special_label === 'New Biz', `POT-29 special POT → 201 (got ${rs.status})`);
  if (rs.data?.id) later('DELETE', `/api/pots/${rs.data.id}`);
  const rs2 = await api('POST', '/api/pots', { specialLabel: 'New Biz', year: 2098, amount: 500 }, adminCookie);
  if (rs2.data?.id) later('DELETE', `/api/pots/${rs2.data.id}`);
  ok(rs2.status === 201, `POT-29 same label, other year → 201 (got ${rs2.status})`);
  const rs3 = await api('POST', '/api/pots', { specialLabel: 'New Biz', year: 2099, amount: 1 }, adminCookie);
  if (rs3.data?.id) later('DELETE', `/api/pots/${rs3.data.id}`);
  ok(rs3.status === 409, 'POT-29 duplicate special POT (same label+year) → 409');

  if (!potId) return;

  // Update amount
  const r4 = await api('PATCH', `/api/pots/${potId}`, { amount: 200000, note: 'test update' }, adminCookie);
  ok(r4.status === 200,                         'POT-03 PATCH update amount → 200');
  ok(Number(r4.data?.amount) === 200000,        'POT-03 amount updated to 200000');

  // History
  const r5 = await api('GET', `/api/pots/${potId}/history`, null, adminCookie);
  ok(r5.status === 200 && Array.isArray(r5.data), 'POT-04 GET history → 200 array');
  ok((r5.data?.length ?? 0) >= 1,               'POT-04 at least one history entry');
  ok(Number(r5.data?.[0]?.new_value) === 200000, 'POT-04 history records new_value=200000');

  // Pipeline summary (5 stage cards)
  const rps = await api('GET', `/api/pots/pipeline-summary?year=${TEST_YEAR_B}`, null, adminCookie);
  ok(rps.status === 200 && Array.isArray(rps.data), 'POT-05 GET pipeline-summary → 200 array');
  ok(rps.data?.length === 5, 'POT-05 pipeline-summary always returns all 5 stages');
  const STAGES = ['SIP', 'Expected', 'Anticipated', 'Committed', 'Canceled'];
  ok(STAGES.every(s => rps.data?.some(r => r.pipeline === s)),
    'POT-05 all 5 stage names present (SIP/Expected/Anticipated/Committed/Canceled)');
  ok(rps.data?.every(r => 'count' in r && 'total' in r),
    'POT-05 each stage entry has count and total fields');
  ok(rps.data?.every(r => typeof r.total === 'number'),
    'POT-05 total is numeric (professional fees, no PTC)');

  // Missing year → 400
  ok((await api('GET', '/api/pots/pipeline-summary', null, adminCookie)).status === 400,
    'POT-05b pipeline-summary without year param → 400');

  // POT details
  const rd = await api('GET', `/api/pots/${potId}/details?year=${TEST_YEAR_B}`, null, adminCookie);
  ok(rd.status === 200, 'POT-06 GET pots/:id/details → 200');
  ok(rd.data?.pot?.id === potId, 'POT-06 details.pot has correct id');
  ok(Array.isArray(rd.data?.history), 'POT-06 details.history is array');
  ok((rd.data?.history?.length ?? 0) >= 1, 'POT-06 details.history has at least one entry (from update)');
  ok(Array.isArray(rd.data?.proposals), 'POT-06 details.proposals is array');
  ok('committed_total' in (rd.data ?? {}), 'POT-06 details has committed_total field');
  ok(typeof rd.data?.committed_total === 'number', 'POT-06 committed_total is numeric');

  // Missing year → 400
  ok((await api('GET', `/api/pots/${potId}/details`, null, adminCookie)).status === 400,
    'POT-06b details without year param → 400');

  // Non-existent POT → 404
  ok((await api('GET', `/api/pots/00000000-0000-0000-0000-000000000000/details?year=${TEST_YEAR_B}`, null, adminCookie)).status === 404,
    'POT-06c details for unknown POT id → 404');

  await testPotSummaryExtended();
  await testPotMasterDataFields();
  await testPotReferenceVersion();
}

// POT-08..POT-11 — GET /api/pots/summary: expected/SIP totals + per-proposal value/client_name
async function testPotSummaryExtended() {
  const CLIENT_NAME = '__test_pot_summary_client__';
  const year = new Date().getFullYear();   // publish stamps the current calendar year

  const role = await makeTestRole(`PS${Date.now()}`);
  const rpy = await api('POST', '/api/pipeline-years', { year }, adminCookie);
  if (rpy.data?.id) later('DELETE', `/api/pipeline-years/${rpy.data.id}`);
  const rc = await api('POST', '/api/clients', { name: CLIENT_NAME }, adminCookie);
  const clientId = rc.data?.id;
  if (clientId) later('DELETE', `/api/clients/${clientId}`);
  if (!role.id || !clientId) { fail('POT-08..11: setup failed — skipping'); return; }
  const rp = await api('POST', '/api/pots', { clientId, year, amount: 1000000 }, adminCookie);
  if (rp.data?.id) later('DELETE', `/api/pots/${rp.data.id}`);

  async function makeProposal(name, stage, days) {
    const g = await api('POST', '/api/cost-grids', { name }, adminCookie);
    const cgId = g.data?.id;
    if (!cgId) return null;
    later('POST', `/api/admin/reset/cost-grid/${cgId}`);
    const v = await api('POST', `/api/cost-grids/${cgId}/versions`,
      { label: 'v1', clientId, currency: 'EUR', currencyRate: 1 }, adminCookie);
    const vId = v.data?.id;
    if (!vId) return null;
    if (days) {
      await api('PUT', `/api/cost-grids/${cgId}/versions/${vId}/structure`, {
        phases: [{ title: 'P1', tasks: [{ title: 'T1', roles: [{ roleId: role.id, days, rateOverride: 100 }] }] }],
      }, adminCookie);
    }
    if (stage) {
      await api('POST', `/api/cost-grids/${cgId}/versions/${vId}/publish`, null, adminCookie);
      await api('PATCH', `/api/cost-grids/${cgId}/versions/${vId}`, { pipeline: stage }, adminCookie);
    }
    return { cgId, vId, stage };
  }

  const defs = [['SIP', 1], ['Expected', 2], ['Anticipated', 3], ['Committed', 4]];
  const made = [];
  for (const [stage, days] of defs) made.push(await makeProposal(`__test_pot_sum_${stage}__`, stage, days));
  const draft = await makeProposal('__test_pot_sum_draft__', null, 5);
  if (made.some(m => !m) || !draft) { fail('POT-08..11: proposal setup failed — skipping'); return; }

  const rs = await api('GET', `/api/pots/summary?year=${year}&clientId=${clientId}`, null, adminCookie);
  ok(rs.status === 200, 'POT-08 summary → 200');
  ok(typeof rs.data?.expected_total === 'number' && typeof rs.data?.sip_total === 'number',
    'POT-08 expected_total and sip_total are numbers');

  const rows = rs.data?.proposals || [];
  ok(rows.length > 0 && rows.every(r => typeof r.value === 'number' && r.client_name === CLIENT_NAME),
    'POT-09 every proposal has numeric value and client_name');

  const sumOf = st => rows.filter(r => r.pipeline === st).reduce((a, r) => a + r.value, 0);
  const totals = { SIP: rs.data?.sip_total, Expected: rs.data?.expected_total,
                   Anticipated: rs.data?.anticipated_total, Committed: rs.data?.committed_total };
  for (const st of Object.keys(totals)) {
    ok(totals[st] > 0 && Math.abs(totals[st] - sumOf(st)) < 0.01,
      `POT-10 ${st} total equals sum of its rows and is > 0`);
  }

  ok(!rows.some(r => r.cg_id === draft.cgId), 'POT-11 Draft-only proposal absent from proposals');

  // POT-12 — client-group target: two clients, one published proposal each
  const rg = await api('POST', '/api/client-groups', { name: '__test_pot_group__' }, adminCookie);
  const gid = rg.data?.id;
  if (gid) later('DELETE', `/api/client-groups/${gid}`);
  const gClients = [];
  for (const n of ['__test_pot_grp_c1__', '__test_pot_grp_c2__']) {
    const c = await api('POST', '/api/clients', { name: n }, adminCookie);
    if (c.data?.id) {
      later('DELETE', `/api/clients/${c.data.id}`);
      await api('PUT', `/api/client-groups/${gid}/clients/${c.data.id}`, null, adminCookie);
      gClients.push(c.data.id);
    }
  }
  if (!gid || gClients.length !== 2) { fail('POT-12: group setup failed — skipping'); return; }
  const rgp = await api('POST', '/api/pots', { clientGroupId: gid, year, amount: 500000 }, adminCookie);
  if (rgp.data?.id) later('DELETE', `/api/pots/${rgp.data.id}`);

  const gMade = [];
  for (const [i, cid] of gClients.entries()) {
    const g = await api('POST', '/api/cost-grids', { name: `__test_pot_grp_prop${i}__` }, adminCookie);
    const cgId = g.data?.id;
    if (!cgId) continue;
    later('POST', `/api/admin/reset/cost-grid/${cgId}`);
    const v = await api('POST', `/api/cost-grids/${cgId}/versions`,
      { label: 'v1', clientId: cid, currency: 'EUR', currencyRate: 1 }, adminCookie);
    const vId = v.data?.id;
    if (!vId) continue;
    await api('PUT', `/api/cost-grids/${cgId}/versions/${vId}/structure`, {
      phases: [{ title: 'P1', tasks: [{ title: 'T1', roles: [{ roleId: role.id, days: i + 2, rateOverride: 100 }] }] }],
    }, adminCookie);
    await api('POST', `/api/cost-grids/${cgId}/versions/${vId}/publish`, null, adminCookie);
    await api('PATCH', `/api/cost-grids/${cgId}/versions/${vId}`, { pipeline: 'Committed' }, adminCookie);
    gMade.push({ cgId, vId });
  }
  if (gMade.length !== 2) { fail('POT-12: proposal setup failed — skipping'); return; }

  const rgs = await api('GET', `/api/pots/summary?year=${year}&clientGroupId=${gid}`, null, adminCookie);
  const gRows = rgs.data?.proposals || [];
  const gSum = gRows.filter(r => r.pipeline === 'Committed').reduce((a, r) => a + r.value, 0);
  ok(rgs.status === 200 && gRows.length === 2 && gMade.every(m => gRows.some(r => r.cg_id === m.cgId)) &&
     gSum > 0 && Math.abs(rgs.data.committed_total - gSum) < 0.01,
    'POT-12 client-group summary returns both proposals and totals equal to the sum of their values');
}

// POT-13..POT-17 — Master Data fields: original currency in /:id/details, Expected/SIP totals
// (informative, never in achieved_total) in /:id/details, GET / and /year-totals.
async function testPotMasterDataFields() {
  const year = new Date().getFullYear();   // publish stamps the current calendar year
  const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 0.01;

  const role = await makeTestRole(`PMD${Date.now()}`);
  const rpy = await api('POST', '/api/pipeline-years', { year }, adminCookie);
  if (rpy.data?.id) later('DELETE', `/api/pipeline-years/${rpy.data.id}`);
  const rc = await api('POST', '/api/clients', { name: '__test_pot_md_client__' }, adminCookie);
  const clientId = rc.data?.id;
  if (clientId) later('DELETE', `/api/clients/${clientId}`);
  if (!role.id || !clientId) { fail('POT-13..17: setup failed — skipping'); return; }
  const rp = await api('POST', '/api/pots', { clientId, year, amount: 1000000 }, adminCookie);
  const potId = rp.data?.id;
  if (potId) later('DELETE', `/api/pots/${potId}`);
  if (!potId) { fail('POT-13..17: POT setup failed — skipping'); return; }

  async function makeProposal(name, stage, days, currency) {
    const g = await api('POST', '/api/cost-grids', { name }, adminCookie);
    const cgId = g.data?.id;
    if (!cgId) return null;
    later('POST', `/api/admin/reset/cost-grid/${cgId}`);
    const v = await api('POST', `/api/cost-grids/${cgId}/versions`,
      { label: 'v1', clientId, currency }, adminCookie);
    const vId = v.data?.id;
    if (!vId) return null;
    await api('PUT', `/api/cost-grids/${cgId}/versions/${vId}/structure`, {
      phases: [{ title: 'P1', tasks: [{ title: 'T1', roles: [{ roleId: role.id, days, rateOverride: 100 }] }] }],
    }, adminCookie);
    await api('POST', `/api/cost-grids/${cgId}/versions/${vId}/publish`, null, adminCookie);
    await api('PATCH', `/api/cost-grids/${cgId}/versions/${vId}`, { pipeline: stage }, adminCookie);
    return { cgId, vId };
  }

  const eur = await makeProposal('__test_pot_md_eur__', 'Committed', 4, 'EUR');
  const chf = await makeProposal('__test_pot_md_chf__', 'Committed', 10, 'CHF');
  const exp = await makeProposal('__test_pot_md_exp__', 'Expected', 2, 'EUR');
  const sip = await makeProposal('__test_pot_md_sip__', 'SIP', 1, 'EUR');
  if (![eur, chf, exp, sip].every(Boolean)) { fail('POT-13..17: proposal setup failed — skipping'); return; }

  const rd = await api('GET', `/api/pots/${potId}/details?year=${year}`, null, adminCookie);
  const rows = rd.data?.proposals || [];
  const rowOf = m => rows.find(r => r.cg_id === m.cgId);
  ok(rd.status === 200 && rows.length >= 4 &&
     rows.every(r => typeof r.currency === 'string' && typeof r.value_original === 'number'),
    'POT-13 every details row has currency (string) and value_original (number)');
  ok(rowOf(eur)?.currency === 'EUR' && near(rowOf(eur)?.value_original, 400) &&
     rowOf(eur)?.value_original === rowOf(eur)?.value,
    'POT-13 EUR row: value_original === value (400)');

  const chfRow = rowOf(chf);
  const chfEur = 1000 / testRates.CHF;
  ok(chfRow?.currency === 'CHF' && near(chfRow?.value_original, 1000) && near(chfRow?.value, chfEur),
    `POT-14 CHF row: value_original ≈ 1000 CHF, value ≈ ${chfEur.toFixed(2)} EUR (rate ${testRates.CHF})`);
  const committedSum = rows.filter(r => r.pipeline === 'Committed').reduce((a, r) => a + r.value, 0);
  ok(near(rd.data?.committed_total, committedSum) && near(rd.data?.committed_total, 400 + chfEur),
    'POT-14 committed_total is the sum of the EUR values, not of the originals');

  ok(near(rd.data?.expected_total, 200) && near(rd.data?.sip_total, 100),
    'POT-15 details expected_total ≈ 200, sip_total ≈ 100');

  const rl = await api('GET', `/api/pots?year=${year}`, null, adminCookie);
  const lp = (rl.data || []).find(p => p.id === potId);
  ok(rl.status === 200 && near(lp?.expected_total, 200) && near(lp?.sip_total, 100) && near(lp?.committed_total, 400 + chfEur) &&
     near(lp?.achieved_total, lp?.committed_total + lp?.anticipated_total),
    'POT-16 GET /api/pots: expected_total ≈ 200, sip_total ≈ 100, achieved_total = C+A');
  const rlB = await api('GET', `/api/pots?year=${TEST_YEAR_B}`, null, adminCookie);
  const lpB = (rlB.data || []).find(p => p.client_name === '__test_pot_client__');
  ok(lpB?.expected_total === 0 && lpB?.sip_total === 0,
    'POT-16 a POT with no Expected/SIP proposals has expected_total === 0 and sip_total === 0');

  const ry = await api('GET', '/api/pots/year-totals', null, adminCookie);
  const yt = ry.data?.[year];
  ok(ry.status === 200 && typeof yt?.expected_total === 'number' && typeof yt?.sip_total === 'number' &&
     yt.expected_total >= 200 - 0.01 && yt.sip_total >= 100 - 0.01,
    'POT-17 year-totals: expected_total ≥ 200 and sip_total ≥ 100, numeric');
  ok(near(yt?.achieved_total, yt?.committed_total + yt?.anticipated_total),
    'POT-17 year-totals: achieved_total = C+A');
  const ytB = ry.data?.[TEST_YEAR_B];
  ok(ytB?.expected_total === 0 && ytB?.sip_total === 0,
    'POT-17 a year with only a POT has expected_total === 0 and sip_total === 0');
}

// MR-01..MR-06 — the structure PUT validates role rates in the version's currency; 0 is a rate.
async function testMoneyRules() {
  section('Money rules');
  const year = new Date().getFullYear();
  const isMoneyRefusal = r => r.status === 400 && r.data?.code === 'MONEY_RULE';

  const code = `TESTROLEMR${Date.now()}`;
  const rr = await api('POST', '/api/roles', { label: `__test_role_mr_${Date.now()}__`, code, hourlyRate: 100 }, adminCookie);
  const mrRole = { id: rr.data?.id, code };
  if (mrRole.id) later('DELETE', `/api/roles/${mrRole.id}`);
  const rpy = await api('POST', '/api/pipeline-years', { year }, adminCookie);
  if (rpy.data?.id) later('DELETE', `/api/pipeline-years/${rpy.data.id}`);
  const g = await api('POST', '/api/cost-grids', { name: '__test_mr_cg__' }, adminCookie);
  const cgId = g.data?.id;
  if (cgId) later('POST', `/api/admin/reset/cost-grid/${cgId}`);
  const eurV = cgId ? (await api('POST', `/api/cost-grids/${cgId}/versions`, { label: 'eur', currency: 'EUR' }, adminCookie)).data?.id : null;
  const usdV = cgId ? (await api('POST', `/api/cost-grids/${cgId}/versions`, { label: 'usd', currency: 'USD' }, adminCookie)).data?.id : null;
  if (!mrRole.id || !eurV || !usdV) { fail('MR-setup: role/proposal/versions failed — skipping'); return; }

  const putRate = (vId, rate) => api('PUT', `/api/cost-grids/${cgId}/versions/${vId}/structure`, {
    phases: [{ phaseName: 'P1', tasks: [{ taskName: 'T1', hours: { [mrRole.code]: 2 } }] }],
    roles: [{ roleCode: mrRole.code, rate }],
  }, adminCookie);
  const storedRate = async vId => (await api('GET', `/api/cost-grids/${cgId}/versions/${vId}/structure`, null, adminCookie))
    .data?.phases?.[0]?.tasks?.[0]?.roles?.[0]?.rate_override;
  const fee = async vId => (await api('GET', '/api/cost-grids/budgets', null, adminCookie)).data?.[vId]?.fee;

  const r1 = await putRate(eurV, 120);
  ok(r1.status === 200, `MR-01 EUR rate 120 → 200 (got ${r1.status})`);
  const r2 = await putRate(eurV, -1);
  ok(isMoneyRefusal(r2) && Number(await storedRate(eurV)) === 120, `MR-02 EUR rate -1 → MONEY_RULE, stored rate still 120 (got ${r2.status})`);
  const r3 = await putRate(eurV, '150');
  ok(isMoneyRefusal(r3) && Number(await storedRate(eurV)) === 120, `MR-03 EUR rate "150" → MONEY_RULE, stored rate still 120 (got ${r3.status})`);
  const r4 = await putRate(eurV, 0);
  const s4 = await storedRate(eurV);
  ok(r4.status === 200 && s4 !== null && Number(s4) === 0 && Number(await fee(eurV)) === 0,
    `MR-04 EUR rate 0 → 200, stored as 0 (not the role default 100), fee 0 (got ${r4.status}, rate_override ${s4})`);
  const r5 = await putRate(eurV, null);
  ok(r5.status === 200 && (await storedRate(eurV)) === null, `MR-05 EUR rate null → 200, stored as NULL (got ${r5.status})`);
  const r6a = await putRate(usdV, 175.555);
  const r6b = await putRate(usdV, 175.55);
  ok(isMoneyRefusal(r6a) && r6b.status === 200, `MR-06 USD 175.555 → MONEY_RULE, 175.55 → 200 (got ${r6a.status}, ${r6b.status})`);

  // Project tasks PUT: resource hourly rate (project created as sysadmin — the project currency lock).
  const rpj = await api('POST', '/api/projects', { name: '__test_mr_project__', currency: 'EUR' }, sysadminCookie);
  const mrProj = rpj.data?.id;
  if (mrProj) later('DELETE', `/api/projects/${mrProj}`);
  if (!mrProj) fail(`MR-07/08: project setup failed (got ${rpj.status}) — skipping`);
  if (mrProj) {
  const putTaskRate = hourlyRate => api('PUT', `/api/projects/${mrProj}/tasks`,
    [{ name: 'T1', resources: [{ role: 'R', hourlyRate, soldHours: 1 }] }], sysadminCookie);
  const storedTaskRate = async () => (await api('GET', `/api/projects/${mrProj}/tasks`, null, sysadminCookie)).data?.[0]?.resources?.[0]?.hourlyRate;
  const t1 = await putTaskRate(150);
  ok(t1.status === 200 && Number(await storedTaskRate()) === 150, `MR-07a project resource rate 150 → 200 (got ${t1.status})`);
  const t2 = await putTaskRate('');
  ok(t2.status === 200 && Number(await storedTaskRate()) === 0, `MR-07b project resource rate '' → 200, read back 0 (got ${t2.status})`);
  await putTaskRate(150);
  const t3 = await putTaskRate(-1);
  const t4 = await putTaskRate('abc');
  ok(isMoneyRefusal(t3) && isMoneyRefusal(t4) && Number(await storedTaskRate()) === 150,
    `MR-08 project resource rate -1 and 'abc' → MONEY_RULE, stored rate still 150 (got ${t3.status}, ${t4.status})`);

  // MR-18 / MR-19 — project phasing and PTC amounts
  const patchPhasing = (id, phasing) => api('PATCH', `/api/projects/${id}/phasing`, { phasing }, sysadminCookie);
  const patchPtc = (id, ptc) => api('PATCH', `/api/projects/${id}/ptc`, { ptc }, sysadminCookie);
  const readProj = async (id, field) => (await api('GET', `/api/projects/${id}`, null, sysadminCookie)).data?.[field];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const ph1 = await patchPhasing(mrProj, { '202601': 1000.5 });
  const ph1s = await readProj(mrProj, 'phasing');
  const ph2 = await patchPhasing(mrProj, {});
  ok(ph1.status === 200 && same(ph1s, { '202601': 1000.5 }) && ph2.status === 200,
    `MR-18a phasing {'202601': 1000.5} → 200, read back equal; {} → 200 (got ${ph1.status}, ${JSON.stringify(ph1s)}, ${ph2.status})`);

  await patchPhasing(mrProj, { '202601': 1000.5 });
  const badPhasing = [{ '202601': -1 }, { '202601': '5' }, { '202601': 1120.304347826087 }, { '202601': 1e12 }, [], null];
  const badPhRes = [];
  for (const b of badPhasing) badPhRes.push(await patchPhasing(mrProj, b));
  const phAfter = await readProj(mrProj, 'phasing');
  ok(badPhRes.every(isMoneyRefusal) && same(phAfter, { '202601': 1000.5 }),
    `MR-18b phasing -1 / '5' / 1120.304347826087 / 1e12 / [] / null → MONEY_RULE, read back unchanged (got ${badPhRes.map(r => r.status).join(',')}, ${JSON.stringify(phAfter)})`);

  const jpy = await api('POST', '/api/projects', { name: '__test_mr_project_jpy__', currency: 'JPY' }, sysadminCookie);
  const jpyProj = jpy.data?.id;
  if (jpyProj) later('DELETE', `/api/projects/${jpyProj}`);
  if (jpyProj) {
    const j1 = await patchPhasing(jpyProj, { '202601': 1.5 });
    const j2 = await patchPhasing(jpyProj, { '202601': 1500 });
    ok(isMoneyRefusal(j1) && j2.status === 200,
      `MR-18c JPY phasing 1.5 → MONEY_RULE, 1500 → 200 (got ${j1.status}, ${j2.status})`);
  } else fail(`MR-18c: JPY project setup failed (got ${jpy.status}) — skipping`);

  const ptcRow = amount => ({ note: '', month: '202601', title: 'T', amount });
  const pc1 = await patchPtc(mrProj, [ptcRow(100)]);
  const pc1s = await readProj(mrProj, 'ptc');
  const pc2 = await patchPtc(mrProj, []);
  ok(pc1.status === 200 && Array.isArray(pc1s) && pc1s.length === 1 && pc2.status === 200,
    `MR-19a project PTC one row → 200, read back; [] → 200 (got ${pc1.status}, ${JSON.stringify(pc1s)}, ${pc2.status})`);

  await patchPtc(mrProj, [ptcRow(100)]);
  const ptcBefore = await readProj(mrProj, 'ptc');
  const badPtc2 = [[ptcRow(-1)], [ptcRow('100')], [ptcRow(100.555)], {}, [5]];
  const badPcRes = [];
  for (const b of badPtc2) badPcRes.push(await patchPtc(mrProj, b));
  const ptcAfter = await readProj(mrProj, 'ptc');
  ok(badPcRes.every(isMoneyRefusal) && same(ptcAfter, ptcBefore),
    `MR-19b project PTC -1 / '100' / 100.555 / {} / [5] → MONEY_RULE, read back unchanged (got ${badPcRes.map(r => r.status).join(',')})`);
  }

  // Roles (M-05) and ratecard entries (M-07).
  const roleCode = `TESTROLEMR9${Date.now()}`;
  const r9 = await api('POST', '/api/roles', { label: `__test_role_mr9_${Date.now()}__`, code: roleCode, hourlyRate: 0, rateOverrides: { USD: 120 } }, adminCookie);
  const r9Id = r9.data?.id;
  if (r9Id) later('DELETE', `/api/roles/${r9Id}`);
  const readRole = async id => ((await api('GET', '/api/roles', null, adminCookie)).data || []).find(x => x.id === id);
  const rr9 = r9Id ? await readRole(r9Id) : null;
  ok(r9.status === 201 && rr9 && Number(rr9.hourly_rate) === 0 && rr9.rate_overrides?.USD === 120,
    `MR-09 role create with hourlyRate 0 and rateOverrides → 201, both stored (got ${r9.status}, ${rr9?.hourly_rate}, ${JSON.stringify(rr9?.rate_overrides)})`);

  const c10 = `TESTROLEMR10${Date.now()}`;
  const r10a = await api('POST', '/api/roles', { label: '__test_role_mr10a__', code: c10, hourlyRate: -1 }, adminCookie);
  const r10b = await api('POST', '/api/roles', { label: '__test_role_mr10b__', code: c10, rateOverrides: { USD: 'x' } }, adminCookie);
  const leaked = ((await api('GET', '/api/roles', null, adminCookie)).data || []).find(x => x.code === c10.toUpperCase());
  if (leaked?.id) later('DELETE', `/api/roles/${leaked.id}`);
  ok(isMoneyRefusal(r10a) && isMoneyRefusal(r10b) && !leaked,
    `MR-10 role create with hourlyRate -1 / rateOverrides USD 'x' → MONEY_RULE, no role created (got ${r10a.status}, ${r10b.status})`);

  if (r9Id) {
    const r11a = await api('PATCH', `/api/roles/${r9Id}`, { hourlyRate: '100' }, adminCookie);
    const r11b = await api('PATCH', `/api/roles/${r9Id}`, { rateOverrides: [1] }, adminCookie);
    const after = await readRole(r9Id);
    ok(isMoneyRefusal(r11a) && isMoneyRefusal(r11b) && Number(after?.hourly_rate) === 0 && after?.rate_overrides?.USD === 120,
      `MR-11 role PATCH hourlyRate "100" / rateOverrides [1] → MONEY_RULE, role unchanged (got ${r11a.status}, ${r11b.status})`);
  } else fail('MR-11: MR-09 role missing — skipping');

  const mrRcClient = await api('POST', '/api/clients', { name: `__test_mr_rc_client_${Date.now()}__` }, adminCookie);
  if (mrRcClient.data?.id) later('DELETE', `/api/clients/${mrRcClient.data.id}`);
  const rc = await api('POST', '/api/ratecards', { name: `__test_mr_rc_${Date.now()}__`, clientId: mrRcClient.data?.id }, adminCookie);
  const rcId = rc.data?.id;
  let mrVer = rc.data?.version;
  if (rcId) later('DELETE', `/api/ratecards/${rcId}`);
  if (rcId && r9Id) {
    const patchEntries = async body => {
      const r = await api('PATCH', `/api/ratecards/${rcId}/entries`, { version: mrVer, entries: body }, adminCookie);
      if (r.status === 200 && typeof r.data?.version === 'number') mrVer = r.data.version;
      return r;
    };
    const entryRate = async () => ((await api('GET', `/api/ratecards/${rcId}`, null, adminCookie)).data?.entries || [])
      .find(e => e.roleId === mrRole.id)?.hourlyRate;
    const e0 = await patchEntries([{ roleId: mrRole.id, hourlyRate: 80, rateOverrides: {} }]);
    const e1 = await patchEntries([{ roleId: mrRole.id, hourlyRate: 90 }, { roleId: r9Id, hourlyRate: -1 }]);
    const e2 = await patchEntries([{ roleId: mrRole.id }]);
    const e3 = await patchEntries([{ roleId: mrRole.id, hourlyRate: 90, rateOverrides: { USD: 1.234 } }]);
    ok(e0.status === 200 && isMoneyRefusal(e1) && isMoneyRefusal(e2) && isMoneyRefusal(e3) && Number(await entryRate()) === 80,
      `MR-12 ratecard entries: valid → 200; invalid second entry / absent rate / USD 1.234 → MONEY_RULE, first entry still 80 (got ${e0.status}, ${e1.status}, ${e2.status}, ${e3.status})`);
  } else fail('MR-12: ratecard or role setup failed — skipping');

  // MR-13 / MR-14 — POT amounts
  // (a client target is used)
  const mrCl = await api('POST', '/api/clients', { name: '__test_mr_pot_client__' }, adminCookie);
  if (mrCl.data?.id) later('DELETE', `/api/clients/${mrCl.data.id}`);
  const rpot = await api('POST', '/api/pots', { clientId: mrCl.data?.id, year: 2099, amount: 1000 }, adminCookie);
  const mrPotId = rpot.data?.id;
  if (mrPotId) later('DELETE', `/api/pots/${mrPotId}`);
  if (rpot.status === 201 && mrPotId) {
    const n1 = await api('POST', '/api/pots', { clientId: mrCl.data.id, year: 2099, amount: -5 }, adminCookie);
    const n2 = await api('POST', '/api/pots', { clientId: mrCl.data.id, year: 2099, amount: 'abc' }, adminCookie);
    ok(isMoneyRefusal(n1) && isMoneyRefusal(n2),
      `MR-13 POT create: -5 and 'abc' → MONEY_RULE (got ${n1.status}, ${n2.status})`);
    const potAmount = async () => Number(((await api('GET', '/api/pots?year=2099', null, adminCookie)).data || []).find(p => p.id === mrPotId)?.amount);
    const histLen = async () => ((await api('GET', `/api/pots/${mrPotId}/history`, null, adminCookie)).data || []).length;
    const h0 = await histLen();
    const u1 = await api('PATCH', `/api/pots/${mrPotId}`, { amount: 'abc', note: 'x' }, adminCookie);
    const u2 = await api('PATCH', `/api/pots/${mrPotId}`, { amount: 1.234, note: 'x' }, adminCookie);
    const a1 = await potAmount(), h1 = await histLen();
    ok(isMoneyRefusal(u1) && isMoneyRefusal(u2) && a1 === 1000 && h1 === h0,
      `MR-14 POT update: 'abc' and 1.234 → MONEY_RULE, amount still 1000, history unchanged (got ${u1.status}, ${u2.status}, amount ${a1}, history ${h0}→${h1})`);
  } else fail('MR-13/14: POT setup failed — skipping');

  // MR-15a / MR-15b — column bound (DECIMAL(10,2) for a role rate, NUMERIC(14,2) for a POT amount)
  const b0 = await putRate(eurV, 120);
  const b1 = await putRate(eurV, 100000000);
  ok(b0.status === 200 && isMoneyRefusal(b1) && Number(await storedRate(eurV)) === 120,
    `MR-15a structure PUT rate 100000000 → MONEY_RULE, stored rate still 120 (got ${b0.status}, ${b1.status})`);
  if (rpot.status === 201 && mrPotId) {
    const potAmountNow = async () => Number(((await api('GET', '/api/pots?year=2099', null, adminCookie)).data || []).find(p => p.id === mrPotId)?.amount);
    const p1 = await api('PATCH', `/api/pots/${mrPotId}`, { amount: 1e12, note: 'x' }, adminCookie);
    const pa1 = await potAmountNow();
    const p2 = await api('PATCH', `/api/pots/${mrPotId}`, { amount: 999999999999.99, note: 'x' }, adminCookie);
    const pa2 = await potAmountNow();
    await api('PATCH', `/api/pots/${mrPotId}`, { amount: 1000, note: 'x' }, adminCookie);
    ok(isMoneyRefusal(p1) && pa1 === 1000 && p2.status === 200 && pa2 === 999999999999.99,
      `MR-15b POT update: 1e12 → MONEY_RULE, amount still 1000; 999999999999.99 → 200 (got ${p1.status}, amount ${pa1}; ${p2.status}, amount ${pa2})`);
  } else fail('MR-15b: POT setup failed — skipping');

  // MR-16 — task PTC on the structure PUT (version currency, DECIMAL(10,2)); 0 / null / absent store 0
  const putPtc = (vId, ptc, withPtc = true) => api('PUT', `/api/cost-grids/${cgId}/versions/${vId}/structure`, {
    phases: [{ phaseName: 'P1', tasks: [{ taskName: 'T1', hours: { [mrRole.code]: 2 }, ...(withPtc ? { ptc } : {}) }] }],
    roles: [{ roleCode: mrRole.code, rate: 100 }],
  }, adminCookie);
  const storedPtc = async vId => (await api('GET', `/api/cost-grids/${cgId}/versions/${vId}/structure`, null, adminCookie))
    .data?.phases?.[0]?.tasks?.[0]?.ptc;
  const q1 = await putPtc(eurV, 500);
  const q1s = await storedPtc(eurV);
  const q2 = await putPtc(eurV, 0), q2s = await storedPtc(eurV);
  await putPtc(eurV, 500);
  const q3 = await putPtc(eurV, null), q3s = await storedPtc(eurV);
  await putPtc(eurV, 500);
  const q4 = await putPtc(eurV, undefined, false), q4s = await storedPtc(eurV);
  ok(q1.status === 200 && q1s === 500 && q2.status === 200 && q2s === 0 && q3.status === 200 && q3s === 0 && q4.status === 200 && q4s === 0,
    `MR-16a task PTC 500 → stored 500; 0 / null / absent → 200, stored 0 (got ${q1.status}/${q1s}, ${q2.status}/${q2s}, ${q3.status}/${q3s}, ${q4.status}/${q4s})`);
  await putPtc(eurV, 500);
  const badPtc = [];
  for (const v of [-1, '500', 500.555, 100000000]) badPtc.push(await putPtc(eurV, v));
  const afterBad = await storedPtc(eurV);
  ok(badPtc.every(isMoneyRefusal) && afterBad === 500,
    `MR-16b task PTC -1, '500', 500.555, 100000000 → MONEY_RULE, stored still 500 (got ${badPtc.map(r => r.status).join(',')}, stored ${afterBad})`);
  const u1 = await putPtc(usdV, 175.555), u2 = await putPtc(usdV, 175.55);
  ok(isMoneyRefusal(u1) && u2.status === 200,
    `MR-16c USD task PTC 175.555 → MONEY_RULE, 175.55 → 200 (got ${u1.status}, ${u2.status})`);

  // MR-17 — second body shape: roles[].rateOverride (0 is a rate override, absent is NULL)
  const putShape2 = (vId, rateOverride, withOverride = true) => api('PUT', `/api/cost-grids/${cgId}/versions/${vId}/structure`, {
    phases: [{ title: 'P1', tasks: [{ title: 'T1', roles: [{ roleId: mrRole.id, days: 2, ...(withOverride ? { rateOverride } : {}) }] }] }],
  }, adminCookie);
  const w1 = await putShape2(eurV, 0), w1s = await storedRate(eurV);
  const w2 = await putShape2(eurV, undefined, false), w2s = await storedRate(eurV);
  await putShape2(eurV, 75);
  const w3 = await putShape2(eurV, -1), w3s = await storedRate(eurV);
  ok(w1.status === 200 && w1s !== null && Number(w1s) === 0 && w2.status === 200 && w2s === null && isMoneyRefusal(w3) && Number(w3s) === 75,
    `MR-17 second shape rateOverride 0 → stored 0 (not null); absent → null; -1 → MONEY_RULE, stored still 75 (got ${w1.status}/${w1s}, ${w2.status}/${w2s}, ${w3.status}/${w3s})`);
}

// POT-18..POT-26 — every POT route counts a proposal once, through its reference version (non-Draft,
// with projects first, then the newest); the version rate is decided by the server only.
async function testPotReferenceVersion() {
  section('POT reference version');
  const year = new Date().getFullYear();   // publish stamps the current calendar year
  const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 0.01;

  const role = await makeTestRole(`PRV${Date.now()}`);
  const rpy = await api('POST', '/api/pipeline-years', { year }, adminCookie);
  if (rpy.data?.id) later('DELETE', `/api/pipeline-years/${rpy.data.id}`);
  const rc = await api('POST', '/api/clients', { name: '__test_pot_ref_client__' }, adminCookie);
  const clientId = rc.data?.id;
  if (clientId) later('DELETE', `/api/clients/${clientId}`);
  if (!role.id || !clientId) { fail('POT-18..26: setup failed — skipping'); return; }
  const rp = await api('POST', '/api/pots', { clientId, year, amount: 1000000 }, adminCookie);
  const potId = rp.data?.id;
  if (potId) later('DELETE', `/api/pots/${potId}`);
  if (!potId) { fail('POT-18..26: POT setup failed — skipping'); return; }

  const structure = days => ({ phases: [{ title: 'P1', tasks: [{ title: 'T1', roles: [{ roleId: role.id, days, rateOverride: 100 }] }] }] });
  // A version created by `cookie`, given `days`, published and moved to `stage`.
  async function publishedVersion(cgId, label, stage, days, cookie) {
    const v = await api('POST', `/api/cost-grids/${cgId}/versions`, { label, clientId, currency: 'EUR' }, cookie);
    const vId = v.data?.id;
    if (!vId) return null;
    await api('PUT', `/api/cost-grids/${cgId}/versions/${vId}/structure`, structure(days), adminCookie);
    await api('POST', `/api/cost-grids/${cgId}/versions/${vId}/publish`, null, adminCookie);
    await api('PATCH', `/api/cost-grids/${cgId}/versions/${vId}`, { pipeline: stage }, adminCookie);
    return vId;
  }
  // v1 in stage A, then (optionally) v2 in stage B, created by the sysadmin: a published proposal
  // takes no new version otherwise.
  async function proposal(name, [stageA, daysA], [stageB, daysB] = []) {
    const g = await api('POST', '/api/cost-grids', { name }, adminCookie);
    const cgId = g.data?.id;
    if (!cgId) return null;
    later('POST', `/api/admin/reset/cost-grid/${cgId}`);
    const v1 = await publishedVersion(cgId, 'v1', stageA, daysA, adminCookie);
    const v2 = stageB ? await publishedVersion(cgId, 'v2', stageB, daysB, sysadminCookie) : null;
    if (!v1 || (stageB && !v2)) return null;
    return { cgId, v1, v2 };
  }
  const details = async () => (await api('GET', `/api/pots/${potId}/details?year=${year}`, null, adminCookie)).data || {};
  const yearTotals = async () => (await api('GET', '/api/pots/year-totals', null, adminCookie)).data?.[year] || {};
  const stageCount = async st => ((await api('GET', `/api/pots/pipeline-summary?year=${year}`, null, adminCookie)).data || [])
    .find(s => s.pipeline === st)?.count || 0;
  const offers = async (cookie = adminCookie) => ((await api('GET', '/api/pipeline-years', null, cookie)).data || [])
    .find(y => Number(y.year) === year)?.offers || 0;
  // A non-admin; POT-20 makes it the owner of its proposal.
  const { id: plainId, cookie: plain } = await getPlainUser();

  // POT-18 / POT-19 — v1 Expected (200), v2 Committed (400): counted once, in Committed
  const ytBefore = await yearTotals();
  const expBefore = await stageCount('Expected');
  const comBefore = await stageCount('Committed');
  const p18 = await proposal('__test_pot_ref_18__', ['Expected', 2], ['Committed', 4]);
  if (!p18) { fail('POT-18: proposal setup failed — skipping'); return; }
  const d18 = await details();
  const rows18 = (d18.proposals || []).filter(r => r.cg_id === p18.cgId);
  ok(rows18.length === 1 && rows18[0].pipeline === 'Committed' && rows18[0].version_id === p18.v2 &&
     near(d18.committed_total, 400) && near(d18.expected_total, 0),
    'POT-18 /:id/details lists the proposal once, in Committed (≈ 400), expected_total ≈ 0');
  const lp = ((await api('GET', `/api/pots?year=${year}`, null, adminCookie)).data || []).find(p => p.id === potId);
  ok(near(lp?.committed_total, 400) && near(lp?.expected_total, 0), 'POT-18 GET /api/pots: committed ≈ 400, expected ≈ 0');
  const sm = (await api('GET', `/api/pots/summary?year=${year}&clientId=${clientId}`, null, adminCookie)).data || {};
  ok((sm.proposals || []).filter(r => r.cg_id === p18.cgId).length === 1 && near(sm.expected_total, 0) && near(sm.committed_total, 400),
    'POT-18 /summary lists the proposal once, expected_total ≈ 0');
  const ytAfter = await yearTotals();
  ok(near((ytAfter.expected_total || 0) - (ytBefore.expected_total || 0), 0) &&
     near((ytAfter.committed_total || 0) - (ytBefore.committed_total || 0), 400),
    'POT-19 /year-totals: expected does not grow, committed grows by 400');
  ok(await stageCount('Expected') === expBefore && await stageCount('Committed') === comBefore + 1,
    'POT-19 /pipeline-summary: Expected count unchanged, Committed count +1');

  // POT-20 — v1 Committed linked only through projects.cg_version_id, v2 Anticipated newer: v1 is the reference
  const offersBefore = await offers();
  const plainBefore = plain ? await offers(plain) : null;
  const p20 = await proposal('__test_pot_ref_20__', ['Committed', 3], ['Anticipated', 5]);
  if (!p20) { fail('POT-20: proposal setup failed — skipping'); return; }
  if (plainId) await sql('UPDATE cost_grids SET owner_id = $1 WHERE id = $2', [plainId, p20.cgId]);
  const pj = await api('POST', '/api/projects', { name: '__test_pot_ref_20_project__', cgVersionId: p20.v1, currency: 'EUR' }, sysadminCookie);
  if (pj.data?.id) later('DELETE', `/api/projects/${pj.data.id}`);
  ok(pj.status === 201, `POT-20 setup: project linked to v1 → 201 (got ${pj.status})`);
  const row20 = ((await details()).proposals || []).filter(r => r.cg_id === p20.cgId);
  ok(row20.length === 1 && row20[0].pipeline === 'Committed' && row20[0].version_id === p20.v1,
    'POT-20 /:id/details shows the proposal through v1 (Committed), the version with a project');
  ok(await offers() === offersBefore + 1, 'POT-20 GET /api/pipeline-years: offers grows by exactly 1');
  ok(!!plain && await offers(plain) === plainBefore + 1,
    'POT-20 GET /api/pipeline-years as a non-admin owner: offers grows by exactly 1');

  // POT-21 — reference version Canceled: out of the modal, still in the Canceled card
  const canBefore = await stageCount('Canceled');
  const p21 = await proposal('__test_pot_ref_21__', ['Canceled', 1]);
  if (!p21) { fail('POT-21: proposal setup failed — skipping'); return; }
  ok(!((await details()).proposals || []).some(r => r.cg_id === p21.cgId), 'POT-21 a Canceled proposal is absent from /:id/details');
  ok(await stageCount('Canceled') === canBefore + 1, 'POT-21 /pipeline-summary Canceled count +1');

  // POT-22..POT-26 — the version rate is decided by the server
  const budgetRate = async vId => (await api('GET', '/api/cost-grids/budgets', null, adminCookie)).data?.[vId]?.currencyRate;
  const g = await api('POST', '/api/cost-grids', { name: '__test_pot_ref_rate__' }, adminCookie);
  const cgId = g.data?.id;
  if (cgId) later('POST', `/api/admin/reset/cost-grid/${cgId}`);
  const usd = cgId ? await api('POST', `/api/cost-grids/${cgId}/versions`, { label: 'usd', currency: 'USD', currencyRate: 9 }, adminCookie) : null;
  const vId = usd?.data?.id;
  if (!vId) { fail('POT-22..26: version setup failed — skipping'); return; }
  const vPath = `/api/cost-grids/${cgId}/versions/${vId}`;
  ok(near(parseFloat(usd.data.currency_rate), testRates.USD), 'POT-22 setup: a USD version takes the live USD rate, not the body');

  await api('PATCH', vPath, { currencyRate: 2.5 }, adminCookie);
  const p22 = await api('PATCH', vPath, { label: 'x', currencyRate: 2.5 }, adminCookie);
  ok(p22.status === 200 && near(await budgetRate(vId), testRates.USD), 'POT-22 PATCH with currencyRate (no currency) → rate unchanged');

  const p23a = await api('PATCH', vPath, { currency: 'EUR', currencyRate: 2.5 }, adminCookie);
  ok(p23a.status === 200 && parseFloat(p23a.data?.currency_rate) === 1, 'POT-23 PATCH to EUR → currency_rate 1');
  const p23b = await api('PATCH', vPath, { currency: 'USD' }, adminCookie);
  ok(p23b.status === 200 && near(parseFloat(p23b.data?.currency_rate), testRates.USD), 'POT-23 PATCH to USD → the live USD rate');

  const p24 = await api('PATCH', vPath, { currency: 'NOK' }, adminCookie);
  const after24 = ((await api('GET', `/api/cost-grids/${cgId}/versions`, null, adminCookie)).data || []).find(v => v.id === vId);
  ok(p24.status === 400 && p24.data?.code === 'CURRENCY_RULE' && after24?.currency === 'USD' && near(await budgetRate(vId), testRates.USD),
    `POT-24 PATCH to an inactive currency → 400 CURRENCY_RULE, nothing written (got ${p24.status})`);
  const p24b = await api('POST', `/api/cost-grids/${cgId}/versions`, { label: 'nok', currency: 'NOK' }, adminCookie);
  ok(p24b.status === 400 && p24b.data?.code === 'CURRENCY_RULE', `POT-24 POST a version in an inactive currency → 400 CURRENCY_RULE (got ${p24b.status})`);

  const eur = await api('POST', `/api/cost-grids/${cgId}/versions`, { label: 'eur', currency: 'EUR', currencyRate: 3 }, adminCookie);
  if (eur.data?.id) {
    ok(eur.status === 201 && parseFloat(eur.data.currency_rate) === 1, 'POT-25 POST a EUR version with currencyRate 3 → currency_rate 1');
    const rr = await api('POST', `/api/cost-grids/${cgId}/versions/${eur.data.id}/refresh-rate`, null, adminCookie);
    ok(rr.status === 200 && rr.data?.currency_rate === 1 && (await budgetRate(eur.data.id)) === 1, 'POT-25 refresh-rate on a EUR version → 1, saved');
  } else {
    fail(`POT-25 setup: EUR version (got ${eur.status})`);
  }

  // POT-26 — same currency re-sent after the live rate moved: the version keeps its rate
  const moved = await api('PATCH', '/api/currencies/USD/rate', { rate: testRates.USD + 0.5 }, adminCookie);
  const p26 = await api('PATCH', vPath, { currency: 'USD' }, adminCookie);
  ok(moved.status === 200 && p26.status === 200 && near(parseFloat(p26.data?.currency_rate), testRates.USD),
    'POT-26 PATCH with the same currency → 200, rate unchanged after the live rate moved');
  await api('PATCH', '/api/currencies/USD/rate', { rate: testRates.USD }, adminCookie);

  // POT-25b — refresh-rate on a EUR version whose stored rate is not 1 (no route writes one) saves 1
  if (eur.data?.id && await sql('UPDATE cost_grid_versions SET currency_rate = 1.7 WHERE id = $1', [eur.data.id])) {
    const rr = await api('POST', `/api/cost-grids/${cgId}/versions/${eur.data.id}/refresh-rate`, null, adminCookie);
    ok(rr.status === 200 && rr.data?.currency_rate === 1 && (await budgetRate(eur.data.id)) === 1,
      'POT-25b refresh-rate on a EUR version stored at 1.7 → 1, saved');
  }

  // POT-26b / POT-27 — a version whose currency was deactivated after creation
  const chf = await api('POST', `/api/cost-grids/${cgId}/versions`, { label: 'chf', currency: 'CHF' }, adminCookie);
  const chfId = chf.data?.id;
  if (!chfId) { fail(`POT-26b setup: CHF version (got ${chf.status})`); return; }
  if (await sql("UPDATE currencies SET active = false WHERE code = 'CHF'")) try {
    const p26b = await api('PATCH', `/api/cost-grids/${cgId}/versions/${chfId}`, { label: 'chf2', currency: 'CHF' }, adminCookie);
    ok(p26b.status === 200 && near(parseFloat(p26b.data?.currency_rate), testRates.CHF),
      `POT-26b autosave with the same, since deactivated, currency → 200, rate kept (got ${p26b.status})`);
    const p27 = await api('POST', `/api/cost-grids/${cgId}/versions/${chfId}/refresh-rate`, null, adminCookie);
    ok(p27.status === 400 && p27.data?.code === 'CURRENCY_RULE' && near(await budgetRate(chfId), testRates.CHF),
      `POT-27 refresh-rate on a version in an inactive currency → 400 CURRENCY_RULE, rate kept (got ${p27.status})`);
  } finally {
    await sql("UPDATE currencies SET active = true WHERE code = 'CHF'");
  }

  // POT-28 — a currency PATCH on a version that does not exist → 404, whatever the currency
  const p28 = await api('PATCH', `/api/cost-grids/${cgId}/versions/00000000-0000-0000-0000-000000000000`, { currency: 'NOK' }, adminCookie);
  ok(p28.status === 404, `POT-28 currency PATCH on an unknown version → 404 (got ${p28.status})`);
}

// ── Cost Grid Budgets ─────────────────────────────────────────────────────────

async function testCostGridBudgets() {
  section('Cost Grid Budgets');

  // Unauthenticated → 401
  ok((await api('GET', '/api/cost-grids/budgets')).status === 401,
    'CGB-01 GET /api/cost-grids/budgets without auth → 401');

  // Authenticated → 200 with object
  const r = await api('GET', '/api/cost-grids/budgets', null, adminCookie);
  ok(r.status === 200, 'CGB-02 GET /api/cost-grids/budgets as admin → 200');
  ok(r.data !== null && typeof r.data === 'object' && !Array.isArray(r.data),
    'CGB-02 response is a plain object (map of versionId → {fee, ptc})');

  // Verify shape of any returned entries
  const entries = Object.values(r.data || {});
  if (entries.length > 0) {
    const first = entries[0];
    ok(typeof first.fee === 'number', 'CGB-03 budget entry fee is a number (not string)');
    ok(typeof first.ptc === 'number', 'CGB-03 budget entry ptc is a number (not string)');
  }
}

// ── Users ─────────────────────────────────────────────────────────────────────

async function testUsers() {
  section('Users');

  const r1 = await api('GET', '/api/users', null, adminCookie);
  ok(r1.status === 200 && Array.isArray(r1.data), 'AD-01 GET /users → 200 array');
  ok(Array.isArray(r1.data) && r1.data.some(u => u.email === EMAIL), 'AD-01 test admin in user list');

  // Edit details (name / email) — admin-managed since the My profile page.
  const users = async () => (await api('GET', '/api/users', null, sysadminCookie)).data || [];
  const byEmail = async e => (await users()).find(u => u.email === e);
  const admin = await byEmail(EMAIL);
  const sys = await byEmail(SYSADMIN_EMAIL);
  if (!ok(admin && sys, 'AD-ED setup: test admin and sysadmin found')) return;
  const U = id => `/api/users/${id}`;
  const same = async () => {
    const now = await byEmail(EMAIL);
    return now && now.first_name === admin.first_name && now.last_name === admin.last_name;
  };

  const e1 = await api('PATCH', U(admin.id), { firstName: 'Tested' }, sysadminCookie);
  ok(e1.status === 200 && e1.data?.first_name === 'Tested', `AD-ED-01 sysadmin renames the admin → 200 (got ${e1.status})`);
  const e1b = await api('PATCH', U(admin.id), { firstName: admin.first_name }, sysadminCookie);
  ok(e1b.status === 200 && (await same()), 'AD-ED-01 and back → 200');

  const e2 = await api('PATCH', U(admin.id), { email: 'test-admin-ed@pdash.local' }, sysadminCookie);
  const e2b = await api('PATCH', U(admin.id), { email: EMAIL }, sysadminCookie);
  ADMIN_DEVICE = deviceCookie(EMAIL);   // an email change removes the trusted devices
  ok(e2.status === 200 && e2.data?.email === 'test-admin-ed@pdash.local' && e2b.status === 200 && !!(await byEmail(EMAIL)),
    `AD-ED-02 sysadmin changes the admin's email and back → 200, 200 (got ${e2.status}, ${e2b.status})`);

  const e3 = await api('PATCH', U(admin.id), { lastName: '  ' }, sysadminCookie);
  ok(e3.status === 400 && e3.data?.field === 'lastName' && (await same()), `AD-ED-03 blank last name → 400 field lastName (got ${e3.status})`);

  const e4 = await api('PATCH', U(admin.id), { email: ` ${SYSADMIN_EMAIL.toUpperCase()} ` }, sysadminCookie);
  ok(e4.status === 409 && e4.data?.field === 'email' && !!(await byEmail(EMAIL)), `AD-ED-04 duplicate email (case, spaces) → 409 field email (got ${e4.status})`);

  const e5 = await api('PATCH', U(admin.id), { firstName: 'Self' }, adminCookie);
  ok(e5.status === 400 && (await same()), `AD-ED-05 admin edits own details → 400 (got ${e5.status})`);

  const sysBefore = sys.first_name;
  const e6 = await api('PATCH', U(sys.id), { firstName: 'Nope' }, adminCookie);
  ok(e6.status === 403 && (await byEmail(SYSADMIN_EMAIL))?.first_name === sysBefore, `AD-ED-06 admin edits a sysadmin → 403 (got ${e6.status})`);

  const e7 = await api('PATCH', U(admin.id), { firstName: 'Ok', email: 'not-an-email' }, sysadminCookie);
  ok(e7.status === 400 && e7.data?.field === 'email' && (await same()), `AD-ED-07 one invalid field refuses the whole request (got ${e7.status})`);

  // A throw-away user built by SQL (an invite needs SMTP): anonymizing it deletes its rectification
  // requests, and an anonymized user's details can no longer be edited.
  const tmp = await sql(
    `INSERT INTO users (email, first_name, last_name, role, status)
     VALUES ($1, 'Temp', 'Person', 'user', 'disabled') RETURNING id`, [`__test_anon_${Date.now()}@pdash.local`]);
  if (tmp) {
    const tid = tmp[0].id;
    await sql(`INSERT INTO rectification_requests (user_id, message) VALUES ($1, 'my name is Temp Person')`, [tid]);
    const an = await api('POST', `${U(tid)}/anonymize`, null, sysadminCookie);
    const left = await sql('SELECT count(*)::int AS n FROM rectification_requests WHERE user_id = $1', [tid]);
    ok(an.status === 200 && left && left[0].n === 0, `AD-ED-08 anonymize deletes the user's rectification requests (got ${an.status}, ${left?.[0]?.n} left)`);
    const e9 = await api('PATCH', U(tid), { firstName: 'Back' }, sysadminCookie);
    ok(e9.status === 400, `AD-ED-09 an anonymized user's details cannot be edited → 400 (got ${e9.status})`);
  }

  // A requester that can sign in (SQL user with a bcrypt hash): the admins' notifications of its
  // request go with the anonymization too.
  let bcrypt = null;
  try { bcrypt = require('/tmp/node_modules/bcryptjs'); } catch (e) { fail(`bcryptjs unavailable (${e.message})`); }
  const reqEmail = `__test_req_${Date.now()}@pdash.local`;
  const reqRow = bcrypt && await sql(
    `INSERT INTO users (email, first_name, last_name, role, status, password_hash)
     VALUES ($1, 'Req', 'Uester', 'user', 'active', $2) RETURNING id`, [reqEmail, bcrypt.hashSync('ReqPass123!', 4)]);
  if (reqRow) {
    const rid = reqRow[0].id;
    const reqCookie = await loginWithCode(reqEmail, 'ReqPass123!');
    const msg = `__test_rr_anon_${Date.now()}__`;
    const sent = await api('POST', '/api/auth/rectification-request', { message: msg }, reqCookie);
    const before = await sql('SELECT count(*)::int AS n FROM notifications WHERE body = $1', [msg]);

    // A demoted admin whose JWT still says admin cannot edit details (account takeover via email).
    const down = await api('PATCH', U(admin.id), { role: 'user' }, sysadminCookie);
    try {
      const stale = await api('PATCH', U(rid), { email: 'stale-admin-takeover@pdash.local' }, adminCookie);
      const row = await sql('SELECT email FROM users WHERE id = $1', [rid]);
      ok(down.status === 200 && stale.status === 403 && row?.[0]?.email === reqEmail,
        `AD-ED-11 a demoted admin with a stale token cannot edit details → 403 (got ${stale.status})`);
    } finally {
      const back = await api('PATCH', U(admin.id), { role: 'admin' }, sysadminCookie);
      ok(back.status === 200, 'AD-ED-11 the test admin is restored to role admin');
    }

    await sql(`UPDATE users SET status = 'disabled', password_changed_at = NOW() WHERE id = $1`, [rid]);
    const an = await api('POST', `${U(rid)}/anonymize`, null, sysadminCookie);
    const after = await sql('SELECT count(*)::int AS n FROM notifications WHERE body = $1', [msg]);
    ok(sent.status === 201 && before?.[0]?.n > 0 && an.status === 200 && after?.[0]?.n === 0,
      `AD-ED-10 anonymize deletes the admins' notifications of the user's requests (got ${before?.[0]?.n} → ${after?.[0]?.n})`);
    const pc = await sql('SELECT password_changed_at FROM users WHERE id = $1', [rid]);
    ok(pc?.[0] && pc[0].password_changed_at === null, 'AD-ED-10 anonymize clears password_changed_at');
    const idx = await sql(`SELECT 1 FROM pg_indexes WHERE tablename = 'notifications' AND indexdef LIKE '%(rectification_request_id)%'`);
    if (idx) ok(idx.length === 1, 'AD-ED-15 notifications.rectification_request_id is indexed (the anonymize cascade)');
  }

  // A pending user's invite went to the old address: changing the email voids it (Resend invite issues a new one).
  const pend = await sql(
    `INSERT INTO users (email, first_name, last_name, role, status, invite_token, invite_expires)
     VALUES ($1, 'Pen', 'Ding', 'user', 'pending', $2, NOW() + interval '48 hours') RETURNING id`,
    [`__test_pending_${Date.now()}@pdash.local`, `tok_${Date.now()}`]);
  if (pend) {
    const pid = pend[0].id;
    const e12 = await api('PATCH', U(pid), { email: `__test_pending_fixed_${Date.now()}@pdash.local` }, sysadminCookie);
    const tok = await sql('SELECT invite_token, invite_expires FROM users WHERE id = $1', [pid]);
    ok(e12.status === 200 && tok?.[0]?.invite_token === null && tok?.[0]?.invite_expires === null,
      `AD-ED-12 changing a pending user's email voids the invite sent to the old address (got ${e12.status}, token ${tok?.[0]?.invite_token === null ? 'cleared' : 'kept'})`);
    const e13 = await api('PATCH', U(pid), { email: 'anon_x@deleted.local' }, sysadminCookie);
    ok(e13.status === 400 && e13.data?.field === 'email', `AD-ED-13 the anonymized-address pattern is refused → 400 (got ${e13.status})`);
    // Any user: a reset link sent to the old address must not reset the corrected account.
    await sql(`UPDATE users SET status = 'active', reset_token = $2, reset_expires = NOW() + interval '2 hours' WHERE id = $1`, [pid, `rst_${Date.now()}`]);
    const e14 = await api('PATCH', U(pid), { email: `__test_reset_fixed_${Date.now()}@pdash.local` }, sysadminCookie);
    const rst = await sql('SELECT reset_token, reset_expires FROM users WHERE id = $1', [pid]);
    ok(e14.status === 200 && rst?.[0]?.reset_token === null && rst?.[0]?.reset_expires === null,
      `AD-ED-14 changing an email voids a reset link sent to the old address (got ${e14.status}, token ${rst?.[0]?.reset_token === null ? 'cleared' : 'kept'})`);
    await sql('DELETE FROM users WHERE id = $1', [pid]);
  }

  // Two admins give the same new address to two users at once: the loser gets the 409 of the duplicate
  // check, never the 500 of the unique constraint.
  const race = [];
  for (let i = 0; i < 10; i++) {
    const [x, y] = [await makeTsUser(`race${i}x`), await makeTsUser(`race${i}y`)];
    if (!x || !y) break;
    const email = `__test_race_${i}_${Date.now()}@pdash.local`;
    const rs = await Promise.all([x, y].map(u => api('PATCH', U(u.id), { email }, sysadminCookie)));
    race.push(rs.map(r => r.status === 409 ? `409${r.data?.field === 'email' ? '' : '!'}` : String(r.status)).sort().join('/'));
  }
  ok(race.length === 10 && race.every(p => p === '200/409'),
    `AD-ED-16 concurrent PATCHes to one new email → one 200 and one 409 field email, never 500 (got ${race.join(' ')})`);
}

// ── Programs ───────────────────────────────────────────────────────────────────

async function testPrograms() {
  section('Programs');

  const id = '__test_prg_' + Date.now();
  const name = '__test program__';

  ok((await api('POST', '/api/programs', { id, name })).status === 401,
    'PRG-01 POST /programs without auth → 401');

  ok((await api('POST', '/api/programs', { name }, adminCookie)).status === 400,
    'PRG-02 POST /programs with missing id → 400');

  // requireAuth, not requireAdmin — project-config.html's own "+ New program" button (and
  // costgrid.html's Generate Project flow) are reachable by any non-viewer, not just admins;
  // adminCookie here only proves the route isn't broken, not that a plain user can reach it too
  // (this suite has no non-admin test account) — that half is covered by manual verification.
  const r = await api('POST', '/api/programs', { id, name }, adminCookie);
  ok(r.status === 201, 'PRG-03 POST /programs as admin → 201');
  if (r.status === 201) later('DELETE', `/api/programs/${id}`);

  ok((await api('POST', '/api/programs', { id, name }, adminCookie)).status === 409,
    'PRG-04 POST /programs with a duplicate id → 409');
}

// ── Admin Reset — single proposal ─────────────────────────────────────────────

const TEST_YEAR_C = 2097;   // dedicated year for admin-reset tests

async function testAdminResetProposal() {
  section('Admin Reset — Single Proposal');

  const FAKE_UUID = '00000000-0000-0000-0000-000000000000';

  // Setup: pipeline year + cost grid to delete
  const rpy = await api('POST', '/api/pipeline-years', { year: TEST_YEAR_C }, adminCookie);
  const pyId = rpy.data?.id;
  if (pyId) later('DELETE', `/api/pipeline-years/${pyId}`);

  let cgId = null;
  if (pyId) {
    const rcg = await api('POST', '/api/cost-grids',
      { name: '__test_reset_cg__', pipelineYear: TEST_YEAR_C }, adminCookie);
    ok(rcg.status === 201, 'DR-10 POST cost grid for deletion test → 201');
    cgId = rcg.data?.id;
  } else {
    ok(false, 'DR-10 POST cost grid for deletion test → skipped (pipeline year creation failed)');
  }

  // Unauthenticated → 401
  ok((await api('POST', `/api/admin/reset/cost-grid/${FAKE_UUID}`)).status === 401,
    'DR-10 POST /api/admin/reset/cost-grid without auth → 401');

  // admin/reset/* is sysadmin-exclusive — a plain admin must be rejected
  ok((await api('POST', `/api/admin/reset/cost-grid/${FAKE_UUID}`, null, adminCookie)).status === 403,
    'DR-10b POST /api/admin/reset/cost-grid as plain admin → 403 (sysadmin-only)');

  // Unknown UUID → 404 (as sysadmin)
  ok((await api('POST', `/api/admin/reset/cost-grid/${FAKE_UUID}`, null, sysadminCookie)).status === 404,
    'DR-11 POST /api/admin/reset/cost-grid with unknown UUID → 404');

  // Delete the real cost grid (as sysadmin)
  if (cgId) {
    const rdel = await api('POST', `/api/admin/reset/cost-grid/${cgId}`, null, sysadminCookie);
    ok(rdel.status === 200, 'DR-10 POST /api/admin/reset/cost-grid/:cgId → 200');
    ok(rdel.data?.ok === true, 'DR-10 response.ok is true');
    // Verify it is gone
    const rcheck = await api('POST', `/api/admin/reset/cost-grid/${cgId}`, null, sysadminCookie);
    ok(rcheck.status === 404, 'DR-10 second delete of same cgId → 404 (already deleted)');
  }
}

// ── Admin Reset — change owner ─────────────────────────────────────────────────

async function testAdminChangeOwner() {
  section('Admin Reset — Change Proposal Owner');

  const FAKE_UUID = '00000000-0000-0000-0000-000000000000';

  // Need the admin user's own id for the owner reassignment
  const me = await api('GET', '/api/auth/me', null, adminCookie);
  const adminId = me.data?.id;

  // Setup: reuse TEST_YEAR_C (already created by testAdminResetProposal; skip if 409)
  const rpy2 = await api('POST', '/api/pipeline-years', { year: TEST_YEAR_C }, adminCookie);
  const pyId2 = rpy2.data?.id;
  if (pyId2) later('DELETE', `/api/pipeline-years/${pyId2}`);
  const havePy = [201, 409].includes(rpy2.status);   // 409 = year exists from previous test

  let cgId = null;
  if (havePy) {
    const rcg = await api('POST', '/api/cost-grids',
      { name: '__test_owner_cg__', pipelineYear: TEST_YEAR_C }, adminCookie);
    ok(rcg.status === 201, 'DR-14 POST cost grid for owner change test → 201');
    cgId = rcg.data?.id;
    if (cgId) later('DELETE', `/api/cost-grids/${cgId}`);
  } else {
    ok(false, 'DR-14 POST cost grid for owner change test → skipped (pipeline year unavailable)');
  }

  // Unauthenticated → 401
  ok((await api('PATCH', `/api/admin/reset/cost-grid/${FAKE_UUID}/owner`, { ownerId: FAKE_UUID })).status === 401,
    'DR-14 PATCH /api/admin/reset/cost-grid/.../owner without auth → 401');

  // admin/reset/* is sysadmin-exclusive — a plain admin must be rejected
  if (cgId) {
    ok((await api('PATCH', `/api/admin/reset/cost-grid/${cgId}/owner`,
      { ownerId: adminId || FAKE_UUID }, adminCookie)).status === 403,
      'DR-14b PATCH .../owner as plain admin → 403 (sysadmin-only)');
  }

  // Missing ownerId → 400 (as sysadmin)
  if (cgId) {
    ok((await api('PATCH', `/api/admin/reset/cost-grid/${cgId}/owner`, {}, sysadminCookie)).status === 400,
      'DR-14 PATCH with missing ownerId → 400');
  }

  // Unknown cgId → 404 (as sysadmin)
  ok((await api('PATCH', `/api/admin/reset/cost-grid/${FAKE_UUID}/owner`,
    { ownerId: adminId || FAKE_UUID }, sysadminCookie)).status === 404,
    'DR-15 PATCH with unknown cgId → 404');

  // Unknown ownerId → 404 (as sysadmin)
  if (cgId) {
    ok((await api('PATCH', `/api/admin/reset/cost-grid/${cgId}/owner`,
      { ownerId: FAKE_UUID }, sysadminCookie)).status === 404,
      'DR-15 PATCH with unknown ownerId → 404');
  }

  // Valid reassignment → 200 (as sysadmin, reassigning ownership to the plain admin)
  if (cgId && adminId) {
    const r = await api('PATCH', `/api/admin/reset/cost-grid/${cgId}/owner`,
      { ownerId: adminId }, sysadminCookie);
    ok(r.status === 200, 'DR-14 PATCH /api/admin/reset/cost-grid/:cgId/owner → 200');
    ok(r.data?.ok === true, 'DR-14 response.ok is true');
  }

  // resource_shares sync: cgId is currently owned by adminId (the creator — the reassignment
  // above was a no-op, same owner). Reassign to a genuinely different user (sysadmin) and
  // confirm resource_shares actually follows cost_grids.owner_id, not just the response body.
  if (cgId && adminId) {
    const meSys = await api('GET', '/api/auth/me', null, sysadminCookie);
    const sysadminId = meSys.data?.id;
    if (sysadminId) {
      const r2 = await api('PATCH', `/api/admin/reset/cost-grid/${cgId}/owner`,
        { ownerId: sysadminId }, sysadminCookie);
      ok(r2.status === 200, 'DR-16 PATCH reassign to a different user → 200');

      const shares = await api('GET', `/api/cost-grids/${cgId}/shares`, null, sysadminCookie);
      const rows = shares.data || [];
      const oldOwnerRow = rows.find(s => s.user_id === adminId);
      const newOwnerRow = rows.find(s => s.user_id === sysadminId);
      ok(!oldOwnerRow, 'DR-16 previous owner no longer has a resource_shares row');
      ok(newOwnerRow?.permission === 'owner', 'DR-16 new owner has a resource_shares row with permission=owner');
      ok(rows.filter(s => s.permission === 'owner').length === 1,
        'DR-16 exactly one owner row remains after reassignment');
    }
  }
}

// ── Cost grid — admin/sysadmin owner reassignment (with linked-project editor grant) ──────

async function testCostGridReassignOwner() {
  section('Cost Grid — Reassign Owner (admin/sysadmin)');

  const FAKE_UUID = '00000000-0000-0000-0000-000000000000';

  const meAdmin = await api('GET', '/api/auth/me', null, adminCookie);
  const adminId = meAdmin.data?.id;
  const meSys = await api('GET', '/api/auth/me', null, sysadminCookie);
  const sysadminId = meSys.data?.id;

  // Setup: pipeline year + cost grid (owned by admin) + a version + a project linked to it
  const rpy = await api('POST', '/api/pipeline-years', { year: TEST_YEAR_C }, adminCookie);
  const pyId = rpy.data?.id;
  if (pyId) later('DELETE', `/api/pipeline-years/${pyId}`);
  const havePy = [201, 409].includes(rpy.status);

  let cgId = null, vId = null, projId = null;
  if (havePy) {
    const rcg = await api('POST', '/api/cost-grids',
      { name: '__test_reassign_cg__', pipelineYear: TEST_YEAR_C }, adminCookie);
    ok(rcg.status === 201, 'CGR-01 POST cost grid for reassign test → 201');
    cgId = rcg.data?.id;
    if (cgId) later('DELETE', `/api/cost-grids/${cgId}`);

    if (cgId) {
      const rv = await api('POST', `/api/cost-grids/${cgId}/versions`, { label: 'v1' }, adminCookie);
      vId = rv.data?.id;
    }

    // Created linked to the version (an admin may do that): a project without a proposal is sysadmin-only,
    // and CGR-08 below needs the admin to be the project's owner.
    const rproj = await api('POST', '/api/projects',
      { name: '__test_reassign_proj__', ...(vId ? { cgVersionId: vId } : {}) }, adminCookie);
    projId = rproj.data?.id;
    if (projId) later('DELETE', `/api/projects/${projId}`);

    if (vId && projId) {
      const rlink = await api('POST', `/api/cost-grids/${cgId}/versions/${vId}/linked-projects`,
        { projectId: projId, taskIds: [], taskNames: [] }, adminCookie);
      ok(rlink.status === 201, 'CGR-01 link project to cost grid version → 201');
    }
  } else {
    ok(false, 'CGR-01 POST cost grid for reassign test → skipped (pipeline year unavailable)');
  }

  // Unauthenticated → 401
  ok((await api('PATCH', `/api/cost-grids/${FAKE_UUID}/reassign-owner`, { ownerId: FAKE_UUID })).status === 401,
    'CGR-02 PATCH /reassign-owner without auth → 401');

  // Missing ownerId → 400 (as admin)
  if (cgId) {
    ok((await api('PATCH', `/api/cost-grids/${cgId}/reassign-owner`, {}, adminCookie)).status === 400,
      'CGR-03 PATCH with missing ownerId → 400');
  }

  // Unknown cgId → 404 (as admin)
  ok((await api('PATCH', `/api/cost-grids/${FAKE_UUID}/reassign-owner`,
    { ownerId: sysadminId || FAKE_UUID }, adminCookie)).status === 404,
    'CGR-04 PATCH with unknown cgId → 404');

  // Unknown ownerId → 404 (as admin)
  if (cgId) {
    ok((await api('PATCH', `/api/cost-grids/${cgId}/reassign-owner`,
      { ownerId: FAKE_UUID }, adminCookie)).status === 404,
      'CGR-05 PATCH with unknown ownerId → 404');
  }

  // Valid reassignment → 200 (as admin, reassigning to sysadmin — a genuinely different user)
  if (cgId && sysadminId) {
    const r = await api('PATCH', `/api/cost-grids/${cgId}/reassign-owner`, { ownerId: sysadminId }, adminCookie);
    ok(r.status === 200, 'CGR-06 PATCH /reassign-owner as admin → 200');
    ok(r.data?.ok === true, 'CGR-06 response.ok is true');
  }

  // resource_shares sync on the cost grid itself: old owner (admin) loses the owner row,
  // new owner (sysadmin) gets exactly one.
  if (cgId && adminId && sysadminId) {
    const shares = await api('GET', `/api/cost-grids/${cgId}/shares`, null, adminCookie);
    const rows = shares.data || [];
    ok(!rows.find(s => s.user_id === adminId && s.permission === 'owner'),
      'CGR-07 previous owner no longer has an owner row on the cost grid');
    ok(rows.find(s => s.user_id === sysadminId)?.permission === 'owner',
      'CGR-07 new owner has an owner row on the cost grid');
  }

  // resource_shares grant on the linked project: new owner gets 'editor'. The project's own
  // owner (admin, from POST /api/projects's own owner registration) is a DIFFERENT resource
  // than the cost grid — reassigning the cost grid's owner must never touch it.
  if (projId && adminId && sysadminId) {
    const pshares = await api('GET', `/api/projects/${projId}/shares`, null, adminCookie);
    const prows = pshares.data || [];
    ok(prows.find(s => s.user_id === sysadminId)?.permission === 'editor',
      'CGR-08 new owner has an editor share on the linked project');
    ok(prows.find(s => s.user_id === adminId)?.permission === 'owner',
      'CGR-08 the project\'s own owner (unrelated to the cost grid reassignment) is untouched');
  }

  // CGR-09: reassigning to a user who ALREADY owns the linked project must never downgrade
  // that project's own owner row from 'owner' to 'editor' (regression coverage for the round-1
  // fix to the ON CONFLICT clause).
  if (havePy) {
    const rproj2 = await api('POST', '/api/projects', { name: '__test_reassign_proj2__' }, sysadminCookie);
    const proj2Id = rproj2.data?.id;
    if (proj2Id) later('DELETE', `/api/projects/${proj2Id}`);

    const rcg2 = await api('POST', '/api/cost-grids',
      { name: '__test_reassign_cg2__', pipelineYear: TEST_YEAR_C }, adminCookie);
    const cg2Id = rcg2.data?.id;
    if (cg2Id) later('DELETE', `/api/cost-grids/${cg2Id}`);

    let v2Id = null;
    if (cg2Id) {
      const rv2 = await api('POST', `/api/cost-grids/${cg2Id}/versions`, { label: 'v1' }, adminCookie);
      v2Id = rv2.data?.id;
    }

    if (v2Id && proj2Id) {
      await api('POST', `/api/cost-grids/${cg2Id}/versions/${v2Id}/linked-projects`,
        { projectId: proj2Id, taskIds: [], taskNames: [] }, adminCookie);
    }

    if (cg2Id && proj2Id && sysadminId) {
      const r2 = await api('PATCH', `/api/cost-grids/${cg2Id}/reassign-owner`, { ownerId: sysadminId }, adminCookie);
      ok(r2.status === 200, 'CGR-09 PATCH /reassign-owner to a user who already owns the linked project → 200');

      const p2shares = await api('GET', `/api/projects/${proj2Id}/shares`, null, adminCookie);
      const p2rows = p2shares.data || [];
      ok(p2rows.find(s => s.user_id === sysadminId)?.permission === 'owner',
        'CGR-09 the linked project\'s existing owner keeps permission=owner (not downgraded to editor)');
    }
  }
}

// ── Resources & Attribute Lists (2026-09) ─────────────────────────────────────

async function testResourcesAndAttributeLists() {
  section('Resources & Attribute Lists');

  // ── Resources ──
  ok((await api('GET', '/api/resources')).status === 401,
    'TM-02 GET /api/resources without auth → 401');

  const tsR = Date.now();
  const roleA = await makeTestRole(`${tsR}A`);
  const roleB = await makeTestRole(`${tsR}B`);
  ok(!!roleA.id && !!roleB.id, 'TM-setup two test roles created');

  const email = `__test_resource_${tsR}@example.test`;
  const rCreate = await api('POST', '/api/resources',
    { firstName: 'Test', lastName: 'Resource', email, roleId: roleA.id }, adminCookie);
  ok(rCreate.status === 201 && rCreate.data?.status === 'active',
    'TM-04 POST /api/resources as admin (with roleId) → 201, status active');
  const resourceId = rCreate.data?.id;
  if (resourceId) later('DELETE', `/api/resources/${resourceId}`);

  // TM-12: roleId validation on POST
  const base = { firstName: 'X', lastName: 'Y', email: `__x_${tsR}@example.test` };
  ok((await api('POST', '/api/resources', base, adminCookie)).status === 400,
    'TM-12 POST without roleId → 400');
  ok((await api('POST', '/api/resources', { ...base, roleId: 'not-a-uuid' }, adminCookie)).status === 400,
    'TM-12 POST with a non-UUID roleId → 400');
  const rUnknownRole = await api('POST', '/api/resources',
    { ...base, roleId: '00000000-0000-0000-0000-000000000000' }, adminCookie);
  ok(rUnknownRole.status === 400 && /role/i.test(rUnknownRole.data?.error || ''),
    'TM-12 POST with an unknown roleId → 400 "Role not found"');
  const rUnknownUser = await api('POST', '/api/resources',
    { ...base, roleId: roleA.id, userId: '00000000-0000-0000-0000-000000000000' }, adminCookie);
  ok(rUnknownUser.status === 400 && /user/i.test(rUnknownUser.data?.error || ''),
    'TM-12 POST with an unknown linked userId → 400 about the user, not the role');

  if (resourceId) {
    const rEmpty = await api('PATCH', `/api/resources/${resourceId}`, { firstName: '' }, adminCookie);
    ok(rEmpty.status === 400, 'TM-10 PATCH /api/resources/:id with empty firstName → 400');

    const rNull = await api('PATCH', `/api/resources/${resourceId}`, { firstName: null }, adminCookie);
    ok(rNull.status === 400, 'TM-10 PATCH /api/resources/:id with null firstName → 400 (not a 500)');

    const rGet = await api('GET', '/api/resources', null, adminCookie);
    const row = (rGet.data || []).find(r => r.id === resourceId);
    ok(row?.first_name === 'Test', 'TM-10 rejected PATCH left first_name unchanged');

    const rValid = await api('PATCH', `/api/resources/${resourceId}`, { firstName: 'Updated' }, adminCookie);
    ok(rValid.status === 200 && rValid.data?.first_name === 'Updated',
      'TM-10 valid PATCH still succeeds after the empty/null rejections above');

    // TM-13: rows carry the role resolved by id
    ok(row?.role_id === roleA.id && row?.role_code === roleA.code && row?.role_label === roleA.label
        && !('job_title' in row),
      'TM-13 GET /api/resources returns role_id, role_label and role_code (and no job_title)');

    // TM-14: change the role; bad roleId values on PATCH
    const rSwap = await api('PATCH', `/api/resources/${resourceId}`, { roleId: roleB.id }, adminCookie);
    ok(rSwap.status === 200 && rSwap.data?.role_id === roleB.id, 'TM-14 PATCH roleId changes the role');
    ok((await api('PATCH', `/api/resources/${resourceId}`, { roleId: '' }, adminCookie)).status === 400,
      'TM-14 PATCH with an empty roleId → 400');
    ok((await api('PATCH', `/api/resources/${resourceId}`, { roleId: 'not-a-uuid' }, adminCookie)).status === 400,
      'TM-14 PATCH with a non-UUID roleId → 400');
    ok((await api('PATCH', `/api/resources/${resourceId}`, { roleId: '00000000-0000-0000-0000-000000000000' }, adminCookie)).status === 400,
      'TM-14 PATCH with an unknown roleId → 400');

    // TM-15: renaming the role propagates (the link is by id, not by string)
    const newLabel = `__renamed_${tsR}__`;
    const newCode = `TESTROLE${tsR}C`;
    await api('PATCH', `/api/roles/${roleB.id}`, { label: newLabel, code: newCode }, adminCookie);
    const rowAfter = ((await api('GET', '/api/resources', null, adminCookie)).data || []).find(r => r.id === resourceId);
    ok(rowAfter?.role_label === newLabel && rowAfter?.role_code === newCode,
      'TM-15 renaming a role\'s label/code shows on the resource with no other action');

    // TM-16: a role assigned to a resource cannot be deleted (400 with a clear message, not a 500)
    const rDelBlocked = await api('DELETE', `/api/roles/${roleB.id}`, null, adminCookie);
    ok(rDelBlocked.status === 400 && /team resource/i.test(rDelBlocked.data?.error || ''),
      'TM-16 DELETE a role assigned to a team resource → 400 with a clear message');
    const rMoveOff = await api('PATCH', `/api/resources/${resourceId}`, { roleId: roleA.id }, adminCookie);
    ok(rMoveOff.status === 200, 'TM-16 setup: resource moved off the role');
    ok((await api('DELETE', `/api/roles/${roleB.id}`, null, adminCookie)).status === 200,
      'TM-16 the role can be deleted once no resource uses it');
  }

  // ── Attribute Lists ──
  ok((await api('GET', '/api/attribute-lists')).status === 401,
    'TM-03 GET /api/attribute-lists without auth → 401');

  const rLists = await api('GET', '/api/attribute-lists', null, adminCookie);
  ok(rLists.status === 200 && ['market', 'brand', 'therapeutic-area', 'service-type']
    .every(slug => rLists.data?.some(l => l.slug === slug)),
    'AL-01 GET /api/attribute-lists → 200, all 4 seeded slugs present');

  const listName = `__test list ${Date.now()}`;
  const rListCreate = await api('POST', '/api/attribute-lists', { name: listName }, adminCookie);
  ok(rListCreate.status === 201 && typeof rListCreate.data?.slug === 'string' && rListCreate.data.slug.length > 0,
    'AL-02 POST /api/attribute-lists as admin → 201 with a generated slug');
  const listId = rListCreate.data?.id;
  const originalSlug = rListCreate.data?.slug;
  // No DELETE endpoint exists for attribute_lists (by design — see api/src/routes/attribute-lists.js) —
  // nothing to register with later() here; the ephemeral test DB is discarded after this run regardless.

  if (listId) {
    const rRename = await api('PATCH', `/api/attribute-lists/${listId}`, { name: listName + ' renamed' }, adminCookie);
    ok(rRename.status === 200 && rRename.data?.slug === originalSlug,
      'AL-03 PATCH rename leaves slug unchanged');

    const longName = 'A '.repeat(60).trim();
    ok((await api('POST', '/api/attribute-lists', { name: longName }, adminCookie)).status === 400,
      'AL-04 POST with a name producing a slug over 100 chars → 400');

    const rItemCreate = await api('POST', `/api/attribute-lists/${listId}/items`, { label: 'Test item' }, adminCookie);
    ok(rItemCreate.status === 201 && rItemCreate.data?.status === 'active',
      'AL-06 POST /api/attribute-lists/:id/items as admin → 201, status active');
    const itemId = rItemCreate.data?.id;

    if (itemId) {
      const rItemEmpty = await api('PATCH', `/api/attribute-lists/${listId}/items/${itemId}`, { label: '' }, adminCookie);
      ok(rItemEmpty.status === 400, 'AL-07 PATCH item with empty label → 400');

      const rItemNull = await api('PATCH', `/api/attribute-lists/${listId}/items/${itemId}`, { label: null }, adminCookie);
      ok(rItemNull.status === 400, 'AL-07 PATCH item with null label → 400 (not a 500)');

      const rItemToggle = await api('PATCH', `/api/attribute-lists/${listId}/items/${itemId}`, { status: 'inactive' }, adminCookie);
      ok(rItemToggle.status === 200 && rItemToggle.data?.status === 'inactive',
        'AL-06 PATCH item status toggle → 200, status inactive');

      const rDup = await api('POST', `/api/attribute-lists/${listId}/items`, { label: 'Test item' }, adminCookie);
      ok(rDup.status === 409,
        'AL-08 duplicate label within the same list → 409');

      const rDupCase = await api('POST', `/api/attribute-lists/${listId}/items`, { label: 'TEST ITEM' }, adminCookie);
      ok(rDupCase.status === 409,
        'AL-08 duplicate label is case-insensitive → 409');
    }
  }
}

// ── Tag Linking (2026-09, Cycle 2) ──────────────────────────────────────────────

async function testTagLinking() {
  section('Tag Linking');

  const rpy = await api('POST', '/api/pipeline-years', { year: TEST_YEAR_C }, adminCookie);
  const havePy = [201, 409].includes(rpy.status);

  let cgId = null, vId = null, itemId = null;

  if (havePy) {
    const rcg = await api('POST', '/api/cost-grids',
      { name: '__test_tag_cg__', pipelineYear: TEST_YEAR_C }, adminCookie);
    cgId = rcg.data?.id;
    if (cgId) later('DELETE', `/api/cost-grids/${cgId}`);
    if (cgId) {
      const rv = await api('POST', `/api/cost-grids/${cgId}/versions`, { label: 'v1' }, adminCookie);
      vId = rv.data?.id;
    }
  } else {
    ok(false, 'TAG-setup pipeline year unavailable, cost grid setup skipped');
  }

  // A Market-list item to tag with (seeded list from Cycle 1)
  const rLists = await api('GET', '/api/attribute-lists', null, adminCookie);
  const marketList = (rLists.data || []).find(l => l.slug === 'market');
  if (marketList) {
    const rItem = await api('POST', `/api/attribute-lists/${marketList.id}/items`,
      { label: `__test_tag_item_${Date.now()}__` }, adminCookie);
    itemId = rItem.data?.id;
  }
  ok(!!itemId, 'TAG-setup test item created in the seeded Market list');

  // TAG-01/02: assign, then remove, a tag on the proposal
  if (cgId && vId && itemId) {
    const rSet = await api('PUT', `/api/cost-grids/${cgId}/versions/${vId}/tags`, { itemIds: [itemId] }, adminCookie);
    ok(rSet.status === 200 && rSet.data?.ok === true, 'TAG-01 PUT version tags → 200');

    const rGet = await api('GET', `/api/cost-grids/${cgId}/versions/${vId}/tags`, null, adminCookie);
    ok(rGet.status === 200 && (rGet.data || []).some(t => t.item_id === itemId),
      'TAG-01 GET version tags includes the assigned item');

    const rClear = await api('PUT', `/api/cost-grids/${cgId}/versions/${vId}/tags`, { itemIds: [] }, adminCookie);
    ok(rClear.status === 200, 'TAG-02 PUT version tags with empty array → 200');

    const rGet2 = await api('GET', `/api/cost-grids/${cgId}/versions/${vId}/tags`, null, adminCookie);
    ok(rGet2.status === 200 && (rGet2.data || []).length === 0, 'TAG-02 GET version tags is empty after clearing');
  } else {
    ok(false, 'TAG-01/02 skipped — cost grid version or test item unavailable');
  }

  // TAG-07: unknown item id rejected with 400, not 500
  if (cgId && vId) {
    const FAKE_UUID = '00000000-0000-0000-0000-000000000000';
    ok((await api('PUT', `/api/cost-grids/${cgId}/versions/${vId}/tags`, { itemIds: [FAKE_UUID] }, adminCookie)).status === 400,
      'TAG-07 PUT version tags with an unknown itemId → 400');
  }

  // TAG-10: duplicating a version copies its tags
  if (cgId && vId && itemId) {
    await api('PUT', `/api/cost-grids/${cgId}/versions/${vId}/tags`, { itemIds: [itemId] }, adminCookie);
    const rDup = await api('POST', `/api/cost-grids/${cgId}/versions/${vId}/duplicate`, { label: 'tag copy' }, adminCookie);
    const newVId = rDup.data?.id;
    if (newVId) {
      const rDupTags = await api('GET', `/api/cost-grids/${cgId}/versions/${newVId}/tags`, null, adminCookie);
      ok(rDupTags.status === 200 && (rDupTags.data || []).some(t => t.item_id === itemId),
        'TAG-10 duplicated version carries the source version\'s tags');
    } else {
      ok(false, 'TAG-10 duplicate did not return a new version id');
    }
  }

  // A second Market-list item, to tell a manually assigned tag apart from a copied one
  let itemId2 = null;
  if (marketList) {
    const rItem2 = await api('POST', `/api/attribute-lists/${marketList.id}/items`,
      { label: `__test_tag_item2_${Date.now()}__` }, adminCookie);
    itemId2 = rItem2.data?.id;
  }

  // TAG-05: a standalone project (no linked proposal) has its own directly-editable tags
  const rProj = await api('POST', '/api/projects', { name: '__test_tag_proj__' }, sysadminCookie);
  const standaloneProjId = rProj.data?.id;
  if (standaloneProjId) later('DELETE', `/api/projects/${standaloneProjId}`);

  if (standaloneProjId && itemId2) {
    const rSetP = await api('PUT', `/api/projects/${standaloneProjId}/tags`, { itemIds: [itemId2] }, adminCookie);
    ok(rSetP.status === 200 && rSetP.data?.ok === true, 'TAG-05 PUT standalone project tags → 200');

    const rGetP = await api('GET', `/api/projects/${standaloneProjId}/tags`, null, adminCookie);
    ok(rGetP.status === 200 && (rGetP.data || []).some(t => t.item_id === itemId2),
      'TAG-05 GET standalone project tags includes the assigned item');
  } else {
    ok(false, 'TAG-05 skipped — standalone project or test item unavailable');
  }

  // TAG-13: creating a project already linked to a proposal copies the version's tags
  let linkedProjId = null;
  if (cgId && vId && itemId) {
    await api('PUT', `/api/cost-grids/${cgId}/versions/${vId}/tags`, { itemIds: [itemId] }, adminCookie);
    const rLinked = await api('POST', '/api/projects',
      { name: '__test_tag_linked_proj__', cgVersionId: vId }, adminCookie);
    linkedProjId = rLinked.data?.id;
    if (linkedProjId) later('DELETE', `/api/projects/${linkedProjId}`);
    const rCopied = linkedProjId
      ? await api('GET', `/api/projects/${linkedProjId}/tags`, null, adminCookie) : null;
    ok(rCopied?.status === 200 && (rCopied.data || []).length === 1 && rCopied.data[0].item_id === itemId,
      'TAG-13 project created with cgVersionId gets the version\'s tags copied');
  } else {
    ok(false, 'TAG-13 skipped — cost grid version or test item unavailable');
  }

  // TAG-06 (revised, Cycle 3a): a linked project's tags are directly editable — no more 409
  if (linkedProjId) {
    const rClearLinked = await api('PUT', `/api/projects/${linkedProjId}/tags`, { itemIds: [] }, adminCookie);
    ok(rClearLinked.status === 200, 'TAG-06 PUT tags on a linked project → 200 (no longer 409)');
    const rEmpty = await api('GET', `/api/projects/${linkedProjId}/tags`, null, adminCookie);
    ok(rEmpty.status === 200 && (rEmpty.data || []).length === 0,
      'TAG-06 linked project tags can be cleared independently of the proposal');

    // TAG-16: re-saving the link (the frontend sends cgVersionId on every save) must not re-seed
    await api('PATCH', `/api/projects/${linkedProjId}`, { cgVersionId: vId }, adminCookie);
    const rStill = await api('GET', `/api/projects/${linkedProjId}/tags`, null, adminCookie);
    ok(rStill.status === 200 && (rStill.data || []).length === 0,
      'TAG-16 re-sending the same cgVersionId does not resurrect cleared tags');
  } else {
    ok(false, 'TAG-06/16 skipped — linked project unavailable');
  }

  // TAG-14: linking an existing, untagged project (null → version) copies the version's tags
  if (cgId && vId && itemId) {
    const rEmptyProj = await api('POST', '/api/projects', { name: '__test_tag_link_later_proj__' }, sysadminCookie);
    const laterProjId = rEmptyProj.data?.id;
    if (laterProjId) later('DELETE', `/api/projects/${laterProjId}`);
    if (laterProjId) {
      await api('PATCH', `/api/projects/${laterProjId}`, { cgVersionId: vId }, adminCookie);
      const rLater = await api('GET', `/api/projects/${laterProjId}/tags`, null, adminCookie);
      ok(rLater.status === 200 && (rLater.data || []).some(t => t.item_id === itemId),
        'TAG-14 PATCH linking an untagged project copies the version\'s tags');
    } else {
      ok(false, 'TAG-14 skipped — project could not be created');
    }
  }

  // TAG-15: linking a project that already has manual tags must not overwrite them
  if (standaloneProjId && itemId && itemId2 && cgId && vId) {
    await api('PATCH', `/api/projects/${standaloneProjId}`, { cgVersionId: vId }, adminCookie);
    const rKeep = await api('GET', `/api/projects/${standaloneProjId}/tags`, null, adminCookie);
    const keepIds = (rKeep.data || []).map(t => t.item_id);
    ok(rKeep.status === 200 && keepIds.length === 1 && keepIds[0] === itemId2,
      'TAG-15 linking a project with its own tags keeps them (no overwrite)');
  } else {
    ok(false, 'TAG-15 skipped — prerequisites unavailable');
  }

  // TAG-19: two overlapping first-link saves both succeed and seed the tags exactly once
  // (concurrency smoke test — the row lock in PATCH makes only one request see "no link yet")
  if (cgId && vId && itemId) {
    const rRace = await api('POST', '/api/projects', { name: '__test_tag_race_proj__' }, sysadminCookie);
    const raceProjId = rRace.data?.id;
    if (raceProjId) later('DELETE', `/api/projects/${raceProjId}`);
    if (raceProjId) {
      const [pa, pb] = await Promise.all([
        api('PATCH', `/api/projects/${raceProjId}`, { cgVersionId: vId }, adminCookie),
        api('PATCH', `/api/projects/${raceProjId}`, { cgVersionId: vId }, adminCookie),
      ]);
      const rRaceTags = await api('GET', `/api/projects/${raceProjId}/tags`, null, adminCookie);
      ok(pa.status === 200 && pb.status === 200 && rRaceTags.status === 200
        && (rRaceTags.data || []).length === 1 && rRaceTags.data[0].item_id === itemId,
        'TAG-19 overlapping first-link PATCHes both succeed and seed the tags once');
    } else {
      ok(false, 'TAG-19 skipped — project could not be created');
    }
  }

  // TAG-18 (project half): a non-UUID itemId is a 400, not a 500
  if (standaloneProjId) {
    ok((await api('PUT', `/api/projects/${standaloneProjId}/tags`, { itemIds: ['not-a-uuid'] }, adminCookie)).status === 400,
      'TAG-18 PUT project tags with a non-UUID itemId → 400');
  }

  // TAG-17: a :vId that belongs to a different cost grid is rejected with 404 (GET and PUT)
  if (cgId && vId) {
    const rcg2 = await api('POST', '/api/cost-grids',
      { name: '__test_tag_cg2__', pipelineYear: TEST_YEAR_C }, adminCookie);
    const cgId2 = rcg2.data?.id;
    if (cgId2) later('DELETE', `/api/cost-grids/${cgId2}`);
    if (cgId2) {
      ok((await api('GET', `/api/cost-grids/${cgId2}/versions/${vId}/tags`, null, adminCookie)).status === 404,
        'TAG-17 GET tags with a version from another grid → 404');
      ok((await api('PUT', `/api/cost-grids/${cgId2}/versions/${vId}/tags`, { itemIds: [] }, adminCookie)).status === 404,
        'TAG-17 PUT tags with a version from another grid → 404');
    } else {
      ok(false, 'TAG-17 skipped — second cost grid could not be created');
    }

    // TAG-18 (version half): a non-UUID itemId is a 400, not a 500
    ok((await api('PUT', `/api/cost-grids/${cgId}/versions/${vId}/tags`, { itemIds: ['not-a-uuid'] }, adminCookie)).status === 400,
      'TAG-18 PUT version tags with a non-UUID itemId → 400');
  }
}

// ── Resource Matching (2026-09, Cycle 3b) ───────────────────────────────────────

async function testResourceMatching() {
  section('Resource Matching');

  ok((await api('GET', '/api/resources/unmatched')).status === 401, 'MA-01 GET /api/resources/unmatched without auth → 401');
  ok((await api('GET', '/api/resources/aliases')).status === 401, 'MA-01 GET /api/resources/aliases without auth → 401');

  const ts = Date.now();
  const last = `Zzmatch${ts}`;                 // unique so a fresh DB has no namesake
  const unknownName = `Luca Sconosciuto${ts}`;
  const unknownKey  = `luca sconosciuto${ts}`.split(' ').sort().join(' ');
  const code = `TMATCH${ts}`;
  const roundName = `Arrotondo${ts}`;
  const roundKey = roundName.toLowerCase();

  // Setup: a resource, and a project with a matching task/role so the upload passes validation
  const matchRole = await makeTestRole(`M${ts}`);
  const rRes = await api('POST', '/api/resources',
    { firstName: 'Mario', lastName: last, email: `mario.${ts}@test.local`, roleId: matchRole.id }, adminCookie);
  const resId = rRes.data?.id;
  if (resId) later('DELETE', `/api/resources/${resId}`);
  ok(!!resId, 'MA-setup resource created');

  const rProj = await api('POST', '/api/projects', { name: `__test_match_proj_${ts}__`, code }, sysadminCookie);
  const projId = rProj.data?.id;
  if (projId) later('DELETE', `/api/projects/${projId}`);
  if (projId) {
    await api('PUT', `/api/projects/${projId}/tasks`,
      [{ name: 'Analysis', resources: [{ role: 'Consultant', soldHours: 8 }] }], adminCookie);
  }
  later('DELETE', `/api/timesheets/${code}`);

  // MA-02: input validation on POST /aliases
  ok((await api('POST', '/api/resources/aliases', { name: 'X Y' }, adminCookie)).status === 400,
    'MA-02 alias with neither resourceId nor ignore → 400');
  ok((await api('POST', '/api/resources/aliases', { name: 'X Y', resourceId: resId, ignore: true }, adminCookie)).status === 400,
    'MA-02 alias with both resourceId and ignore → 400');
  ok((await api('POST', '/api/resources/aliases', { name: '  ', ignore: true }, adminCookie)).status === 400,
    'MA-02 alias with an empty name → 400');
  ok((await api('POST', '/api/resources/aliases', { name: '.,-', ignore: true }, adminCookie)).status === 400,
    'MA-02 alias with a punctuation-only name → 400');
  ok((await api('POST', '/api/resources/aliases', { name: 'X Y', resourceId: 'not-a-uuid' }, adminCookie)).status === 400,
    'MA-02 alias with a non-UUID resourceId → 400');
  ok((await api('POST', '/api/resources/aliases', { name: 'X Y', resourceId: '00000000-0000-0000-0000-000000000000' }, adminCookie)).status === 400,
    'MA-02 alias with an unknown resourceId → 400');

  if (!projId || !resId) { ok(false, 'MA-04… skipped — project or resource setup failed'); return; }

  // Upload: an inverted-order match for Mario, an unknown person, and a blank-owner row
  const csv = [
    'projectId,date,task,role,owner,hours',
    `${code},2026-01-15,Analysis,Consultant,${last.toUpperCase()}  Mario,4`,
    `${code},2026-01-16,Analysis,Consultant,${unknownName},6`,
    `${code},2026-01-17,Analysis,Consultant,,2`,
    `${code},2026-01-18,Analysis,Consultant,${roundName},0.1`,
    `${code},2026-01-19,Analysis,Consultant,${roundName},0.2`,
  ].join('\n');
  const rUp = await uploadCsv('/api/timesheets/upload', csv, adminCookie);
  ok(rUp.status === 201, `MA-04 CSV timesheet upload → 201 (got ${rUp.status}${rUp.data?.error ? ': ' + rUp.data.error : ''})`);

  const listUnmatched = async () => (await api('GET', '/api/resources/unmatched', null, adminCookie)).data || [];
  let un = await listUnmatched();
  const marioKey = `${last} Mario`.toLowerCase().split(' ').sort().join(' ');
  ok(!un.some(u => u.name_normalized === marioKey),
    'MA-05 inverted-order, differently-cased owner auto-matches the resource (not queued)');
  const unknownRow = un.find(u => u.name_normalized === unknownKey);
  ok(!!unknownRow && Number(unknownRow.hours) === 6 && unknownRow.projects === 1,
    'MA-05 unknown owner is queued with its hours and project count');
  ok(!!unknownRow && Array.isArray(unknownRow.project_list) && unknownRow.project_list.length === 1
    && unknownRow.project_list[0].code === code && unknownRow.project_list[0].name === `__test_match_proj_${ts}__`,
    'MA-05b unmatched row carries its project_list (code + resolved name)');
  ok(!un.some(u => u.name_normalized === ''), 'MA-05 blank owner never enters the queue');
  const roundRow = un.find(u => u.name_normalized === roundKey);
  ok(!!roundRow && roundRow.hours === 0.3, `MA-14 summed hours carry no floating-point noise (got ${roundRow?.hours})`);

  // MA-06: assign → leaves the queue, listed as an alias
  const rAlias = await api('POST', '/api/resources/aliases', { name: unknownName, resourceId: resId }, adminCookie);
  const aliasId = rAlias.data?.id;
  ok(rAlias.status === 201 && !!aliasId, 'MA-06 POST alias → 201');
  un = await listUnmatched();
  ok(!un.some(u => u.name_normalized === unknownKey), 'MA-06 assigned name leaves the queue');
  const rAliases = await api('GET', '/api/resources/aliases', null, adminCookie);
  ok((rAliases.data || []).some(a => a.id === aliasId && a.resource_id === resId),
    'MA-06 GET aliases lists the new alias with its resource');
  ok((rAliases.data || []).some(a => a.id === aliasId && a.display_name === unknownName),
    'MA-12 the alias keeps the name as the admin saw it, not only the normalized key');

  // MA-03: the same alias twice upserts, no 500 — and reports an update (200), not a create
  const rAlias2 = await api('POST', '/api/resources/aliases', { name: unknownName.toUpperCase(), resourceId: resId }, adminCookie);
  ok(rAlias2.status === 200, `MA-03 re-adding the same alias (different case) → 200 update, not 201/500 (got ${rAlias2.status})`);
  const dupes = ((await api('GET', '/api/resources/aliases', null, adminCookie)).data || [])
    .filter(a => a.alias_normalized === unknownKey);
  ok(dupes.length === 1, 'MA-03 still exactly one alias row for that normalized name');

  // MA-13: a re-assignment by another admin is recorded — created_by stays, updated_by changes
  const rAlias3 = await api('POST', '/api/resources/aliases', { name: unknownName, resourceId: resId }, sysadminCookie);
  const audited = ((await api('GET', '/api/resources/aliases', null, adminCookie)).data || [])
    .find(a => a.alias_normalized === unknownKey);
  ok(rAlias3.status === 200 && !!audited && !!audited.created_by && !!audited.updated_by
      && audited.created_by !== audited.updated_by,
    'MA-13 re-assignment by another admin updates updated_by and leaves created_by unchanged');

  // MA-07: removing the alias returns the name to the queue
  ok((await api('DELETE', `/api/resources/aliases/${dupes[0]?.id}`, null, adminCookie)).status === 200,
    'MA-07 DELETE alias → 200');
  un = await listUnmatched();
  ok(un.some(u => u.name_normalized === unknownKey), 'MA-07 removed alias returns the name to the queue');
  ok((await api('DELETE', `/api/resources/aliases/${dupes[0]?.id}`, null, adminCookie)).status === 404,
    'MA-07 DELETE alias that no longer exists → 404');

  // MA-08: ignore a name
  const rIgn = await api('POST', '/api/resources/aliases', { name: unknownName, ignore: true }, adminCookie);
  const ignId = rIgn.data?.id;
  if (ignId) later('DELETE', `/api/resources/aliases/${ignId}`);
  un = await listUnmatched();
  ok(rIgn.status === 201 && !un.some(u => u.name_normalized === unknownKey),
    'MA-08 ignored name leaves the queue');
  if (ignId) await api('DELETE', `/api/resources/aliases/${ignId}`, null, adminCookie);

  // MA-09: an inactive resource still matches by name when no active namesake exists (history is kept)
  await api('PATCH', `/api/resources/${resId}`, { status: 'inactive' }, adminCookie);
  un = await listUnmatched();
  ok(!un.some(u => u.name_normalized === marioKey), 'MA-09 deactivated resource: its name stays matched (not queued)');

  // MA-11: a leaver's name can still be assigned to the (inactive) resource explicitly
  const rInact = await api('POST', '/api/resources/aliases', { name: `${last} Mario`, resourceId: resId }, adminCookie);
  const inactAliasId = rInact.data?.id;
  un = await listUnmatched();
  ok(rInact.status === 201 && !un.some(u => u.name_normalized === marioKey),
    'MA-11 alias to an inactive resource → 201 and the name leaves the queue');
  if (inactAliasId) await api('DELETE', `/api/resources/aliases/${inactAliasId}`, null, adminCookie);

  await api('PATCH', `/api/resources/${resId}`, { status: 'active' }, adminCookie);
  un = await listUnmatched();
  ok(!un.some(u => u.name_normalized === marioKey), 'MA-09 reactivated resource: its name matches again');

  // MA-10: deleting the resource re-queues its names; rescan endpoint works
  ok((await api('DELETE', `/api/resources/${resId}`, null, adminCookie)).status === 200, 'MA-10 DELETE resource → 200');
  un = await listUnmatched();
  ok(un.some(u => u.name_normalized === marioKey), 'MA-10 deleting the resource returns its name to the queue');
  const rScan = await api('POST', '/api/resources/unmatched/rescan', null, adminCookie);
  ok(rScan.status === 200 && rScan.data?.ok === true, 'MA-10 POST /unmatched/rescan → 200');
}

// ── Profile Engine (2026-09, Cycle 3c) ──────────────────────────────────────────

// Drain the profile queue. A concurrent worker run makes the endpoint answer 409 — retry briefly.
async function runProfileJobs() {
  for (let i = 0; i < 10; i++) {
    const r = await api('POST', '/api/profile-jobs/run', null, adminCookie);
    if (r.status !== 409) return r;
    await new Promise(res => setTimeout(res, 500));
  }
  return { status: 409, data: null };
}

async function getProfile(resourceId) {
  const r = await api('GET', `/api/resources/${resourceId}/profile`, null, adminCookie);
  return r.data;
}

// rows: [[projectCode, date, owner, hours], ...] — task/role are fixed to match the test projects' config.
function profileCsv(rows) {
  return ['projectId,date,task,role,owner,hours',
    ...rows.map(([code, date, owner, hours]) => `${code},${date},Analysis,Consultant,${owner},${hours}`)].join('\n');
}

let _fixtureSeq = 0;

// Shared setup: one resource, two projects (task/role valid for CSV uploads) and a Market list value.
// Cleanup order matters (runs in reverse): role first registered → deleted last.
async function profileFixture() {
  const ts = `${Date.now()}${++_fixtureSeq}`;
  const f = { ts, code1: `TPROF1${ts}`, code2: `TPROF2${ts}`, person: `Prof Tester${ts}` };
  f.role = await makeTestRole(`P${ts}`);
  const rRes = await api('POST', '/api/resources',
    { firstName: 'Prof', lastName: `Tester${ts}`, email: `prof.${ts}@test.local`, roleId: f.role.id }, adminCookie);
  f.resId = rRes.data?.id;
  if (f.resId) later('DELETE', `/api/resources/${f.resId}`);

  const mkProject = async (code) => {
    const r = await api('POST', '/api/projects', { name: `__prof_proj_${code}__`, code }, sysadminCookie);
    const id = r.data?.id;
    if (id) {
      later('DELETE', `/api/projects/${id}`);
      await api('PUT', `/api/projects/${id}/tasks`,
        [{ name: 'Analysis', resources: [{ role: 'Consultant', soldHours: 8 }] }], adminCookie);
    }
    return id;
  };
  f.p1 = await mkProject(f.code1);
  f.p2 = await mkProject(f.code2);
  later('DELETE', `/api/timesheets/${f.code1}`);   // registered after the projects → runs before their deletion
  later('DELETE', `/api/timesheets/${f.code2}`);

  const lists = (await api('GET', '/api/attribute-lists', null, adminCookie)).data || [];
  f.market = lists.find(l => l.slug === 'market');
  f.itemLabel = `__prof_item_${ts}__`;
  const rItem = f.market
    ? await api('POST', `/api/attribute-lists/${f.market.id}/items`, { label: f.itemLabel }, adminCookie)
    : { data: null };
  f.itemId = rItem.data?.id;
  f.ok = !!(f.resId && f.p1 && f.p2 && f.itemId);
  return f;
}

async function testProfileEngine() {
  section('Profile Engine');

  const NIL = '00000000-0000-0000-0000-000000000000';
  ok((await api('POST', '/api/profile-jobs/run')).status === 401, 'PE-01 POST /api/profile-jobs/run without auth → 401');
  ok((await api('GET', `/api/resources/${NIL}/profile`)).status === 401, 'PE-01 GET profile without auth → 401');
  ok((await api('GET', `/api/resources/${NIL}/profile`, null, adminCookie)).status === 404, 'PE-02 GET profile of an unknown resource → 404');
  ok((await api('GET', '/api/resources/not-a-uuid/profile', null, adminCookie)).status === 404, 'PE-02 GET profile with a non-UUID id → 404');

  const f = await profileFixture();
  ok(f.ok, 'PE-setup resource, two projects and a Market value created');
  if (!f.ok) return;
  const { ts, code1, code2, person, resId, p1, itemId, itemLabel } = f;
  await api('PUT', `/api/projects/${p1}/tags`, { itemIds: [itemId] }, adminCookie);   // a tag on P1 only

  // PE-03: upload → run → profile
  const rUp = await uploadCsv('/api/timesheets/upload', profileCsv([
    [code1, '2026-01-15', person, 4],
    [code1, '2026-02-10', person, 6],
    [code1, '2026-02-11', `Nobody${ts}`, 2],
    [code2, '2026-03-05', person, 3],
  ]), adminCookie);
  ok(rUp.status === 201, `PE-03 upload of actuals for two project codes → 201 (got ${rUp.status}${rUp.data?.error ? ': ' + rUp.data.error : ''})`);
  const rRun = await runProfileJobs();
  ok(rRun.status === 200 && rRun.data?.ok === true, `PE-03 POST /api/profile-jobs/run → 200 (got ${rRun.status})`);

  let prof = await getProfile(resId);
  ok(!!prof?.profile && !!prof.profile_computed_at, 'PE-03 the resource has a profile after the run');
  const p = prof?.profile;
  ok(p?.totals?.hours === 13 && p?.totals?.projects === 2 && p?.totals?.firstWorked === '2026-01' && p?.totals?.lastWorked === '2026-03',
    'PE-03 totals: 13 h over 2 projects, 2026-01 → 2026-03 (the unmatched owner is excluded)');
  ok(p?.dimensions?.market?.name === 'Market' && p.dimensions.market.values[0]?.value === itemLabel
      && p.dimensions.market.values[0]?.hours === 10 && p.dimensions.market.untaggedHours === 3,
    'PE-04 Market dimension: tagged project P1 = 10 h, untagged P2 = 3 h');
  ok(p?.projects?.[code1]?.tasks?.[0]?.name === 'Analysis' && p.projects[code1].tasks[0].hours === 10
      && p?.roles?.[0]?.code === 'Consultant' && p.roles[0].hours === 13,
    'PE-05 tasks are per project and roles are the actuals\' role codes');

  // PE-06: isolation — re-uploading P1 must not disturb P2
  const p2Before = JSON.stringify(p?.projects?.[code2]);
  await uploadCsv(`/api/timesheets/upload?projectCode=${code1}`, profileCsv([[code1, '2026-04-01', person, 2]]), adminCookie);
  await runProfileJobs();
  prof = await getProfile(resId);
  ok(prof?.profile?.totals?.hours === 5 && JSON.stringify(prof.profile.projects[code2]) === p2Before,
    'PE-06 re-processing P1 (10 h → 2 h) leaves P2 untouched: total 5 h, P2 entry identical');

  // PE-09: deleting a code's actuals removes its hours
  ok((await api('DELETE', `/api/timesheets/${code2}`, null, adminCookie)).status === 200, 'PE-09 DELETE the actuals of P2 → 200');
  await runProfileJobs();
  prof = await getProfile(resId);
  ok(prof?.profile?.totals?.projects === 1 && prof.profile.projects[code2] === undefined && prof.profile.totals.hours === 2,
    'PE-09 P2\'s hours disappear from the profile (1 project, 2 h left)');

  // PE-13: a resource matching no actuals is stamped computed (UI: "No actuals matched"), profile stays null
  const rLone = await api('POST', '/api/resources',
    { firstName: 'Lone', lastName: `Nomatch${ts}`, email: `lone.${ts}@test.local`, roleId: f.role.id }, adminCookie);
  if (rLone.data?.id) later('DELETE', `/api/resources/${rLone.data.id}`);
  await uploadCsv(`/api/timesheets/upload?projectCode=${code1}`, profileCsv([[code1, '2026-05-01', person, 1]]), adminCookie);
  await runProfileJobs();
  const lone = await getProfile(rLone.data?.id);
  ok(!!lone && lone.profile === null && !!lone.profile_computed_at,
    'PE-13 a resource with no matching actuals has profile null and a non-null profile_computed_at after a run');
}

async function testProfileEngineHooks() {
  section('Profile Engine — enqueue hooks');

  const f = await profileFixture();
  ok(f.ok, 'PE-setup (hooks) resource, two projects and a Market value created');
  if (!f.ok) return;
  const { ts, code1, code2, person, resId, p1, p2, itemId, itemLabel } = f;
  await api('PUT', `/api/projects/${p1}/tags`, { itemIds: [itemId] }, adminCookie);

  const aliasName = `Alias Person${ts}`;
  await uploadCsv('/api/timesheets/upload', profileCsv([
    [code1, '2026-01-15', person, 4], [code1, '2026-01-16', aliasName, 1], [code2, '2026-03-05', person, 3],
  ]), adminCookie);
  await runProfileJobs();
  let prof = await getProfile(resId);
  ok(prof?.profile?.totals?.hours === 7 && prof.profile.dimensions.market.values[0].hours === 4
      && prof.profile.dimensions.market.untaggedHours === 3,
    'PE-07 baseline: 7 h; Market covers P1 (4 h), P2 (3 h) is untagged');

  // PE-07: tagging P2 as well re-queues its code
  await api('PUT', `/api/projects/${p2}/tags`, { itemIds: [itemId] }, adminCookie);
  await runProfileJobs();
  prof = await getProfile(resId);
  ok(prof?.profile?.dimensions?.market?.values?.[0]?.hours === 7 && prof.profile.dimensions.market.untaggedHours === 0,
    'PE-07 tagging P2 as well: the Market value now covers 7 h and nothing is untagged');

  // PE-08: assigning an alias queues every code
  ok(prof?.profile?.totals?.hours === 7, 'PE-08 before the alias the extra name adds nothing (still 7 h)');
  const rAlias = await api('POST', '/api/resources/aliases', { name: aliasName, resourceId: resId }, adminCookie);
  if (rAlias.data?.id) later('DELETE', `/api/resources/aliases/${rAlias.data.id}`);
  await runProfileJobs();
  prof = await getProfile(resId);
  ok(prof?.profile?.totals?.hours === 8, 'PE-08 after assigning the alias the extra name counts: 8 h');

  // PE-10: a resource change re-queues everything and the rebuilt profile is identical
  const shape = pr => JSON.stringify({ t: pr.totals, d: pr.dimensions, r: pr.roles, p: pr.projects });
  const before = shape(prof.profile);
  await api('PATCH', `/api/resources/${resId}`, { firstName: 'Prof' }, adminCookie);
  await runProfileJobs();
  prof = await getProfile(resId);
  ok(shape(prof.profile) === before, 'PE-10 re-queuing everything and re-running reproduces the same profile');

  // PE-11: a deactivated person keeps their history by name match alone (no alias needed)
  const leaverName = `Old Timer${ts}`;
  const role2 = await makeTestRole(`L${ts}`);
  const rLeaver = await api('POST', '/api/resources',
    { firstName: 'Old', lastName: `Timer${ts}`, email: `old.${ts}@test.local`, roleId: role2.id }, adminCookie);
  const leaverId = rLeaver.data?.id;
  if (leaverId) later('DELETE', `/api/resources/${leaverId}`);
  await api('PATCH', `/api/resources/${leaverId}`, { status: 'inactive' }, adminCookie);
  await uploadCsv(`/api/timesheets/upload?projectCode=${code1}`, profileCsv([
    [code1, '2026-01-15', person, 4], [code1, '2026-01-16', aliasName, 1], [code1, '2026-05-01', leaverName, 5],
  ]), adminCookie);
  await runProfileJobs();
  prof = await getProfile(leaverId);
  ok(prof?.profile?.totals?.hours === 5 && prof.profile.totals.lastWorked === '2026-05',
    'PE-11 an inactive resource is still matched by name: 5 h, last worked 2026-05, no alias');

  // PE-11b: a resource with a computed profile keeps the same hours after being deactivated and re-run
  await api('PATCH', `/api/resources/${resId}`, { status: 'inactive' }, adminCookie);
  await runProfileJobs();
  const deact = await getProfile(resId);
  ok(deact?.profile?.totals?.hours === 8 && deact.profile.totals.hours > 0,
    'PE-11b profile then deactivate then run: the hours are still there (8 h)');
  await api('PATCH', `/api/resources/${resId}`, { status: 'active' }, adminCookie);
  await runProfileJobs();

  // PE-12: renaming a list value re-labels the profile; changing a project's code does not crash the run
  const newLabel = `__prof_item_renamed_${ts}__`;
  await api('PATCH', `/api/attribute-lists/${f.market.id}/items/${itemId}`, { label: newLabel }, adminCookie);
  await runProfileJobs();
  prof = await getProfile(resId);
  ok(prof?.profile?.dimensions?.market?.values?.[0]?.value === newLabel && newLabel !== itemLabel,
    'PE-12 renaming a list value shows the new label in the profile after the next run');
  const rCode = await api('PATCH', `/api/projects/${p1}`, { code: `${code1}B` }, adminCookie);
  const rRun = await runProfileJobs();
  ok(rCode.status === 200 && rRun.status === 200 && rRun.data?.errors?.length === 0,
    'PE-12 changing a project\'s code queues both codes and the run completes without errors');
  await api('PATCH', `/api/projects/${p1}`, { code: code1 }, adminCookie);   // restore for cleanup

  // PE-14: renaming a project re-queues its code so the cached profile shows the new name
  await runProfileJobs();
  const newName = `__prof_proj_renamed_${ts}__`;
  await api('PATCH', `/api/projects/${p1}`, { name: newName }, adminCookie);
  await runProfileJobs();
  prof = await getProfile(resId);
  const pj = prof?.profile?.projects;
  const entry = Array.isArray(pj) ? pj.find(x => x.code === code1) : pj?.[code1];
  ok(entry?.name === newName, 'PE-14 renaming a project shows the new name in the profile after the next run');
}

// ── Profile Jobs Console (2026-09, Cycle 3d) ────────────────────────────────────

// A plain-user session for the 403 checks. The suite has no non-admin account and invites need an
// emailed token, so makeTsUser builds one by SQL (cleanup disables it).
// A throw-away user with role user, signed in. Not the test admin demoted and restored: the session
// carries the role in the database, so a cookie taken while demoted is an admin's again once restored.
async function getPlainUser() {
  const u = await makeTsUser('plain');
  return u ? { id: u.id, cookie: await loginWithCode(u.email, TS_PASS) } : { id: null, cookie: '' };
}

async function getPlainUserCookie() {
  return (await getPlainUser()).cookie;
}

// GET the console state, with the project rows indexed by code.
async function getConsole() {
  const r = await api('GET', '/api/profile-jobs', null, adminCookie);
  const byCode = {};
  for (const p of r.data?.projects || []) byCode[p.project_code] = p;
  return { status: r.status, data: r.data, byCode };
}

// POST with the same 409 retry as runProfileJobs (a worker run may briefly hold the lock).
async function postRetry(path) {
  for (let i = 0; i < 10; i++) {
    const r = await api('POST', path, null, adminCookie);
    if (r.status !== 409) return r;
    await new Promise(res => setTimeout(res, 500));
  }
  return { status: 409, data: null };
}

async function testProfileJobsConsole() {
  section('Profile Jobs Console');

  const routes = [
    ['GET', '/api/profile-jobs', null],
    ['PUT', '/api/profile-jobs/settings', { enabled: true, intervalMin: 10 }],
    ['POST', '/api/profile-jobs/run', null],
    ['POST', '/api/profile-jobs/rebuild', null],
    ['POST', '/api/profile-jobs/projects/NOPE/process', null],
    ['DELETE', '/api/profile-jobs/projects/NOPE/queue', null],
    ['GET', '/api/profile-jobs/runs', null],
  ];
  for (const [m, p, b] of routes) {
    ok((await api(m, p, b)).status === 401, `PJ-01 ${m} ${p} without auth → 401`);
  }
  const userCookie = await getPlainUserCookie();
  ok(!!userCookie, 'PJ-02 setup: a plain-user session was obtained');
  if (userCookie) {
    for (const [m, p, b] of routes) {
      ok((await api(m, p, b, userCookie)).status === 403, `PJ-02 ${m} ${p} as a plain user → 403`);
    }
  }

  // PJ-03: shape of the console state
  const g = await getConsole();
  const d = g.data;
  ok(g.status === 200 && typeof d?.settings?.enabled === 'boolean' && Number.isInteger(d?.settings?.intervalMin)
      && ['paused', 'due', 'scheduled'].includes(d?.schedule?.state)
      && 'lastRunAt' in (d?.schedule || {}) && 'nextRunAt' in (d?.schedule || {})
      && Number.isInteger(d?.queuedCount) && Array.isArray(d?.projects),
    'PJ-03 GET /api/profile-jobs → settings, schedule { state, lastRunAt, nextRunAt }, queuedCount, projects');
  ok(d?.queuedCount === (d?.projects || []).filter(p => p.queued_at).length,
    'PJ-03 queuedCount equals the number of rows with queued_at');
  const sample = (d?.projects || [])[0];
  ok(!sample || ['project_code', 'project_name', 'row_count', 'resource_count', 'queued_at', 'last_processed_at', 'last_error', 'status']
      .every(k => k in sample),
    'PJ-03 each project row carries code, name, row/resource counts, queue state, last error and status');

  const original = d?.settings
    ? { enabled: d.settings.enabled, intervalMin: d.settings.intervalMin }
    : { enabled: true, intervalMin: 10 };

  try {
    // PJ-04: strict validation (Review Focus 3)
    const bad = [
      [{ enabled: 'true', intervalMin: 10 }, 'enabled as the string "true"'],
      [{ enabled: 1, intervalMin: 10 }, 'enabled as a number'],
      [{ enabled: true, intervalMin: '10' }, 'intervalMin as a numeric string'],
      [{ enabled: true, intervalMin: 10.5 }, 'a non-integer intervalMin'],
      [{ enabled: true, intervalMin: 0 }, 'intervalMin 0'],
      [{ enabled: true, intervalMin: 1441 }, 'intervalMin 1441'],
      [{ enabled: true, intervalMin: null }, 'intervalMin null'],
      [{ enabled: true }, 'intervalMin missing'],
      [{ intervalMin: 10 }, 'enabled missing'],
      [{}, 'an empty body'],
    ];
    for (const [body, label] of bad) {
      ok((await api('PUT', '/api/profile-jobs/settings', body, adminCookie)).status === 400, `PJ-04 PUT settings with ${label} → 400`);
    }
    ok(JSON.stringify((await getConsole()).data?.settings) === JSON.stringify(original),
      'PJ-04 rejected PUTs leave the stored settings unchanged');

    // PJ-05: canonical writes at both bounds; switching off pauses the schedule. The worker stays OFF
    // for the rest of this section so no scheduled run can race the assertions below.
    let w = await api('PUT', '/api/profile-jobs/settings', { enabled: true, intervalMin: 1440 }, adminCookie);
    ok(w.status === 200 && w.data?.enabled === true && w.data?.intervalMin === 1440,
      'PJ-05 PUT { enabled: true, intervalMin: 1440 } → 200 and echoes the saved settings (upper bound)');
    w = await api('PUT', '/api/profile-jobs/settings', { enabled: false, intervalMin: 1 }, adminCookie);
    ok(w.status === 200 && w.data?.enabled === false && w.data?.intervalMin === 1,
      'PJ-05 PUT { enabled: false, intervalMin: 1 } → 200 (lower bound)');
    const g2 = await getConsole();
    ok(g2.data?.settings?.enabled === false && g2.data?.settings?.intervalMin === 1 && g2.data?.schedule?.state === 'paused'
        && g2.data?.schedule?.nextRunAt === null,
      'PJ-05 GET reads the values back (enabled stored as "false") and the schedule is paused');
    await runProfileJobs();   // wait out a scheduled run that may have started before the switch-off

    // PJ-06 / PJ-07 / PJ-13 need two queued codes with actuals
    const f = await profileFixture();
    ok(f.ok, 'PJ-setup resource, two projects and a Market value created');
    if (f.ok) {
      const { code1, code2, person, resId } = f;
      await runProfileJobs();   // creating the projects queued their codes: drain them first
      const up = await uploadCsv('/api/timesheets/upload', profileCsv([
        [code1, '2026-01-15', person, 4],
        [code2, '2026-02-10', person, 3],
      ]), adminCookie);
      ok(up.status === 201, `PJ-06 upload actuals for two codes → 201 (got ${up.status})`);
      let c = await getConsole();
      ok(!!c.byCode[code1]?.queued_at && !!c.byCode[code2]?.queued_at, 'PJ-06 both uploaded codes are queued');

      const pr = await postRetry(`/api/profile-jobs/projects/${encodeURIComponent(code1)}/process`);
      ok(pr.status === 200 && pr.data?.ok === true && pr.data?.projects === 1 && pr.data?.errors?.length === 0,
        `PJ-06 POST .../projects/:code/process → 200, exactly one project processed (got ${pr.status}, ${pr.data?.projects})`);
      c = await getConsole();
      ok(c.byCode[code1]?.queued_at === null && !!c.byCode[code1]?.last_processed_at && c.byCode[code1]?.status === 'updated',
        'PJ-06 the processed code left the queue and is "updated"');
      ok(!!c.byCode[code2]?.queued_at && c.byCode[code2]?.status === 'queued', 'PJ-06 the other code is still queued');
      ok(c.byCode[code1]?.row_count === 1 && c.byCode[code1]?.resource_count === 1,
        'PJ-06 list counts for the processed code: 1 actuals row, 1 matched resource');
      const runs1 = await api('GET', '/api/profile-jobs/runs', null, adminCookie);
      ok(runs1.data?.[0]?.trigger_type === 'manual' && runs1.data[0].projects === 1,
        'PJ-06 the single-code run is recorded as manual with 1 project');

      // PJ-07: removing from the queue leaves the computed profile alone
      const before = await getProfile(resId);
      const rm = await api('DELETE', `/api/profile-jobs/projects/${encodeURIComponent(code2)}/queue`, null, adminCookie);
      ok(rm.status === 200 && rm.data?.ok === true, 'PJ-07 DELETE .../projects/:code/queue → 200');
      c = await getConsole();
      ok(c.byCode[code2]?.queued_at === null, 'PJ-07 the code is no longer queued');
      const after = await getProfile(resId);
      ok(JSON.stringify(after) === JSON.stringify(before) && after?.profile?.totals?.hours === 4,
        'PJ-07 the profile is untouched (still 4 h, from the processed code only)');

      // PJ-13: concurrent actions never fail with 500 (Review Focus 4; timing-tolerant)
      await uploadCsv(`/api/timesheets/upload?projectCode=${code1}`, profileCsv([[code1, '2026-03-01', person, 2]]), adminCookie);
      const [ra, rb] = await Promise.all([
        api('POST', '/api/profile-jobs/rebuild', null, adminCookie),
        api('POST', `/api/profile-jobs/projects/${encodeURIComponent(code1)}/process`, null, adminCookie),
      ]);
      const okOr409 = r => r.status === 200
        || (r.status === 409 && /already running/.test(r.data?.error || '') && /queued/.test(r.data?.error || ''));
      ok(okOr409(ra) && okOr409(rb),
        `PJ-13 concurrent rebuild + process → each 200, or 409 saying the job is running and the codes stay queued (got ${ra.status}/${rb.status})`);
      await runProfileJobs();   // whatever the race left queued
    }

    // PJ-08: code validation and unknown codes
    const unknown = `NOPE${Date.now()}`;
    ok((await api('POST', `/api/profile-jobs/projects/${unknown}/process`, null, adminCookie)).status === 404,
      'PJ-08 process an unknown code → 404');
    ok((await api('DELETE', `/api/profile-jobs/projects/${unknown}/queue`, null, adminCookie)).status === 404,
      'PJ-08 remove an unknown code from the queue → 404');
    ok((await getConsole()).byCode[unknown] === undefined, 'PJ-08 an unknown code is not added to the list');
    ok((await api('POST', '/api/profile-jobs/projects/%20%20/process', null, adminCookie)).status === 400,
      'PJ-08 a blank code → 400');
    ok((await api('DELETE', `/api/profile-jobs/projects/${'X'.repeat(101)}/queue`, null, adminCookie)).status === 400,
      'PJ-08 a code longer than 100 characters → 400');

    // PJ-09 / PJ-10: a code with dots and a space, then the same code once only profile_project_state knows it
    const oddTs = Date.now();
    const odd = `PJ.${oddTs} X.001`;
    const oddName = `__pj_odd_${oddTs}__`;
    const rp = await api('POST', '/api/projects', { name: oddName, code: odd }, sysadminCookie);   // creation queues the code
    const oddId = rp.data?.id;
    if (oddId) later('DELETE', `/api/projects/${oddId}`);
    ok(!!oddId, 'PJ-09 setup: a project whose code has dots and a space');
    if (oddId) {
      const pr = await postRetry(`/api/profile-jobs/projects/${encodeURIComponent(odd)}/process`);
      ok(pr.status === 200 && pr.data?.projects === 1, `PJ-09 process a URL-encoded code with dots and a space → 200, 1 project (got ${pr.status})`);
      let c = await getConsole();
      const row = c.byCode[odd];
      ok(row?.project_name === oddName && row?.row_count === 0 && row?.resource_count === 0 && row?.status === 'updated',
        'PJ-09 listed under its exact code, with the project name, 0 rows, status "updated"');

      ok((await api('DELETE', `/api/projects/${oddId}`, null, sysadminCookie)).status === 200,
        'PJ-10 setup: delete the project (no actuals) — the delete hook re-queues its code');
      c = await getConsole();
      const orphan = c.byCode[odd];
      ok(!!orphan && orphan.project_name === odd && orphan.row_count === 0 && !!orphan.queued_at,
        'PJ-10 a code known only to profile_project_state is listed with its code as name, 0 rows, queued');
      ok((await api('DELETE', `/api/profile-jobs/projects/${encodeURIComponent(odd)}/queue`, null, adminCookie)).status === 200,
        'PJ-10 the orphan code can be removed from the queue → 200');
      ok((await postRetry(`/api/profile-jobs/projects/${encodeURIComponent(odd)}/process`)).status === 200,
        'PJ-10 the orphan code can still be processed → 200');
    }

    // PJ-11: rebuild queues everything and drains it in one recorded manual run
    const runsBefore = await api('GET', '/api/profile-jobs/runs', null, adminCookie);
    const topBefore = Number(runsBefore.data?.[0]?.id ?? 0);
    const rbAll = await postRetry('/api/profile-jobs/rebuild');
    ok(rbAll.status === 200 && rbAll.data?.ok === true && rbAll.data.projects > 0 && rbAll.data.errors?.length === 0,
      `PJ-11 POST /rebuild → 200, projects processed, no errors (got ${rbAll.status})`);
    ok((await getConsole()).data?.queuedCount === 0, 'PJ-11 after a rebuild the queue is empty');
    const runsAfter = await api('GET', '/api/profile-jobs/runs', null, adminCookie);
    ok(Number(runsAfter.data?.[0]?.id) > topBefore && runsAfter.data[0].trigger_type === 'manual'
        && runsAfter.data[0].projects === rbAll.data?.projects,
      'PJ-11 the rebuild is recorded as a manual run with the same project count');

    // PJ-12: history is capped at 50, newest first (manual runs are always recorded)
    for (let i = 0; i < 51; i++) await runProfileJobs();
    const rr = (await api('GET', '/api/profile-jobs/runs', null, adminCookie)).data || [];
    ok(rr.length === 50 && rr.every((r, i) => i === 0 || Number(rr[i - 1].id) > Number(r.id)),
      `PJ-12 GET /runs → exactly 50 rows after 51 more runs, newest first (got ${rr.length})`);
    ok(['id', 'started_at', 'finished_at', 'trigger_type', 'projects', 'resources', 'error'].every(k => rr[0] && k in rr[0]),
      'PJ-12 run rows carry id, started_at, finished_at, trigger_type, projects, resources, error');
  } finally {
    const back = await api('PUT', '/api/profile-jobs/settings', original, adminCookie);
    ok(back.status === 200 && back.data?.enabled === original.enabled && back.data?.intervalMin === original.intervalMin,
      'PJ-cleanup the original worker settings are restored');
  }
}

// ── Project descriptions (2026-09, profile descriptions cycle) ──────────────────

async function testProjectDescriptions() {
  section('Project descriptions');
  const ts = Date.now();
  const code = `TPD${ts}`;
  const r = await api('POST', '/api/projects',
    { name: `__pd_${ts}__`, code, description: 'Oncology portal' }, sysadminCookie);
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
  ok((await api('POST', `/api/topics/${b.data.id}/merge`, { targetId: String(b.data.id).toUpperCase() }, adminCookie)).status === 400
    && ((await api('GET', '/api/topics', null, adminCookie)).data || []).some(t => t.id === b.data.id),
    'TP-07 merge into itself via an UPPERCASE id → 400, topic intact');
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

// ── Topic extraction (LLM stubbed) ──────────────────────────────────────────────
// Only runs in the isolated stack (scripts/run-tests.sh sets LLM_STUB_ENABLED and points the api's
// ANTHROPIC_BASE_URL at this process). Text markers drive the stub: [[Topic]] = a normal candidate,
// ((Name)) = flagged equivalentToListValue, <<Name>> = candidate that is NOT flagged (server must still
// neutralise it when it equals an attribute-list value).

let stubMode = 'ok';                 // 'ok' | 'http500' | 'garbage' | 'html200'
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
        if (stubMode === 'html200') { res.setHeader('content-type', 'text/html'); res.end('<html>secret project text</html>'); return; }
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
    } else {
      ok(false, 'PT-02..05 prerequisites missing (topics not proposed)');
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
    } else {
      ok(false, 'PT-06 prerequisite missing (second resource)');
    }

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

    // TX-10: a persistent extraction failure is counted once, not on every run
    stubMode = 'http500';
    await api('PATCH', `/api/projects/${p1}`, { description: `Retry description for the persistent failure [[Retry topic ${ts}]]` }, adminCookie);
    const run1 = await runProfileJobs();
    ok(run1.data?.projects >= 1, 'TX-10 the first failed extraction is counted as work');
    const run2 = await runProfileJobs();
    const run3 = await runProfileJobs();
    ok(run2.data?.projects === 0 && run3.data?.projects === 0, 'TX-10 repeated retries of the same failure are not counted as work');
    ok((run2.data?.errors || []).length === 0 && (run3.data?.errors || []).length === 0, 'TX-10 repeated retries do not add run errors');
    stubMode = 'ok';
    const run4 = await runProfileJobs();
    ok(run4.status === 200 && (run4.data?.errors || []).length === 0, 'TX-10 a later successful run completes cleanly');

    // failures never block: 500 and garbage answers
    for (const mode of ['http500', 'garbage', 'html200']) {
      stubMode = mode;
      const longer = `Fresh description for failure ${mode} [[Failure topic ${mode} ${ts}]]`;
      ok((await api('PATCH', `/api/projects/${p1}`, { description: longer }, adminCookie)).status === 200,
        `TX-07 saving a description while the LLM answers "${mode}" still works`);
      const r = await runProfileJobs();
      ok(r.status === 200 && (r.data?.errors || []).length === 0, `TX-07 the run does not fail because of "${mode}"`);
      const st = (await api('GET', '/api/profile-jobs', null, adminCookie)).data;
      const topicError = st?.projects?.find(p => p.project_code === code1)?.topic_error;
      ok(!!topicError, `TX-07 the console reports the extraction error for "${mode}"`);
      if (mode === 'html200') ok(!String(topicError || '').includes('secret project text'), 'TX-07 the reported error does not echo the response body');
    }
    stubMode = 'ok';
    await runProfileJobs();                                   // retry succeeds and clears the error
    const st2 = (await api('GET', '/api/profile-jobs', null, adminCookie)).data;
    ok(!st2?.projects?.find(p => p.project_code === code1)?.topic_error, 'TX-08 a later successful run clears the error');
    const again = (await api('GET', '/api/topics?status=proposed', null, adminCookie)).data || [];
    ok(again.some(t => t.name === `Failure topic html200 ${ts}`), 'TX-08 the retried text produced its topics');

    // kill switch
    await api('PUT', '/api/profile-jobs/topic-settings', { enabled: false }, adminCookie);
    const n = stubBodies.length;
    await api('PATCH', `/api/projects/${p1}`, { description: `Another long description [[Disabled ${ts}]]` }, adminCookie);
    await runProfileJobs();
    ok(stubBodies.length === n, 'TX-09 with extraction switched off the LLM is not called');
    await api('PUT', '/api/profile-jobs/topic-settings', { enabled: true }, adminCookie);
    await runProfileJobs();
    ok(stubSaw(`Disabled ${ts}`), 'TX-09 re-enabling extraction re-queues texts changed while it was off');

    // TX-11: an approved topic cannot be merged into a non-approved target
    const guardApproved = await api('POST', '/api/topics', { name: `Merge guard ${ts}` }, adminCookie);
    const guardProposed = (await api('GET', '/api/topics?status=proposed', null, adminCookie)).data || [];
    const proposedTarget = guardProposed.find(t => t.name === `Failure topic html200 ${ts}`) || guardProposed[0];
    if (!guardApproved.data?.id || !proposedTarget) {
      ok(false, 'TX-11 setup: an approved topic and a proposed topic must both exist');
    } else {
      const blocked = await api('POST', `/api/topics/${guardApproved.data.id}/merge`, { targetId: proposedTarget.id }, adminCookie);
      ok(blocked.status === 409, 'TX-11 merging an approved topic into a proposed one is refused with 409');
      const stillApproved = (await api('GET', '/api/topics?status=approved', null, adminCookie)).data || [];
      ok(stillApproved.some(t => t.id === guardApproved.data.id), 'TX-11 the approved topic is still present after the refused merge');
      const reverse = await api('POST', `/api/topics/${proposedTarget.id}/merge`, { targetId: guardApproved.data.id }, adminCookie);
      ok(reverse.status === 200, 'TX-11 merging a proposed topic into an approved one is allowed');
    }
    void resId;
  } finally {
    stubMode = 'ok';
    await api('PUT', '/api/profile-jobs/topic-settings', { enabled: true }, adminCookie);
    server.close();
  }
}

async function testPlanningModel() {
  section('Planning model');
  const ts = `${Date.now()}${++_fixtureSeq}`;
  const code = `TPLAN${ts}`;
  const body = (over = {}) => ({ view: 'role', projectIds: [], teams: [], from: '2099-01-01', to: '2099-03-31', asOf: '2099-01-10', pulse: false, ...over });

  ok((await api('POST', '/api/planning/model', body())).status === 401, 'PM-01 POST /api/planning/model without auth → 401');
  const bad = await api('POST', '/api/planning/model', { ...body(), view: 'nope', from: 'x' }, adminCookie);
  ok(bad.status === 400 && bad.data?.fields?.view && bad.data?.fields?.from, 'PM-02 invalid view/from → 400 with per-field errors');

  const rP = await api('POST', '/api/projects', { name: `__plan_${code}__`, code, startDate: '209901', endDate: '209903' }, sysadminCookie);
  const pid = rP.data?.id;
  if (!ok(!!pid, 'PM-setup project created')) return;
  later('DELETE', `/api/projects/${pid}`);
  await api('PUT', `/api/projects/${pid}/tasks`,
    [{ name: 'Analysis', startDate: '20990105', endDate: '20990329', resources: [{ role: 'Consultant', soldHours: 100 }] }], adminCookie);
  later('DELETE', `/api/timesheets/${code}`);
  const csv = ['projectId,date,task,role,owner,hours',
    `${code},2099-01-05,Analysis,Consultant,Plan Tester${ts},10`].join('\n');
  ok((await uploadCsv('/api/timesheets/upload', csv, adminCookie)).status === 201, 'PM-setup actuals uploaded');

  // PM-03: role view — actuals in the past week, residual spread over the future weeks
  const r = await api('POST', '/api/planning/model', body({ projectIds: [pid, pid, '00000000-0000-0000-0000-000000000000'] }), adminCookie);
  const role = r.data?.roles?.find(x => x.role === 'Consultant');
  ok(r.status === 200 && r.data?.view === 'role' && !!role, 'PM-03 role view returns the Consultant role (duplicate and unknown ids ignored)');
  ok(role?.sold === 100 && role?.actuals === 10, 'PM-03 sold 100, actuals 10');
  ok(Object.keys(role?.cells || {}).length > 1, 'PM-03 cells cover several weeks');
  const totalPlanned = Object.values(role?.cells || {}).filter(c => !c.isPast).reduce((s, c) => s + c.hours, 0);
  ok(Math.abs(totalPlanned - 90) < 1e-6, `PM-03 planned hours add up to the residual (got ${totalPlanned})`);

  // PM-04: project and owner views
  const rp = await api('POST', '/api/planning/model', body({ view: 'project', projectIds: [pid] }), adminCookie);
  ok(rp.status === 200 && rp.data?.projects?.[0]?.id === pid && rp.data.projects[0].tasks[0]?.roles?.[0]?.consumed === 10, 'PM-04 project view returns the task/role tree');
  const ro = await api('POST', '/api/planning/model', body({ view: 'owner', projectIds: [pid] }), adminCookie);
  ok(ro.status === 200 && !!ro.data?.ownerMap?.[`Plan Tester${ts}`], 'PM-04 owner view returns the owner map');
  ok(ro.data?.ownerStatus?.[`Plan Tester${ts}`] === 'active', 'PM-04 owner status is included (unmatched = active)');

  // PM-05: team filter is a server input
  const rt = await api('POST', '/api/planning/model', body({ teams: ['NoSuchTeam'], projectIds: [pid] }), adminCookie);
  ok(rt.status === 200 && (rt.data?.roles || []).length === 0, 'PM-05 a team filter that matches no role gives no roles');

  // PM-06: cache is invalidated by a write (new actuals appear immediately)
  const csv2 = ['projectId,date,task,role,owner,hours',
    `${code},2099-01-05,Analysis,Consultant,Plan Tester${ts},10`,
    `${code},2099-01-06,Analysis,Consultant,Plan Tester${ts},5`].join('\n');
  await uploadCsv(`/api/timesheets/upload?projectCode=${code}`, csv2, adminCookie);
  const r2 = await api('POST', '/api/planning/model', body({ projectIds: [pid] }), adminCookie);
  ok(r2.data?.roles?.find(x => x.role === 'Consultant')?.actuals === 15, 'PM-06 a new upload is visible right away (cache invalidated)');

  // PM-07: a non-admin who neither owns nor was shared the project gets an empty result, not an error
  // The plain user comes from getPlainUserCookie; the project the
  // plain user must NOT see is created by the sysadmin (a different account) with its own actuals.
  const code7 = `TPLANX${ts}`;
  const r7 = sysadminCookie ? await api('POST', '/api/projects', { name: `__plan_${code7}__`, code: code7, startDate: '209901', endDate: '209903' }, sysadminCookie) : null;
  const pid7 = r7?.data?.id;
  if (!ok(!!pid7, 'PM-07 setup: a project owned by another account was created')) return;
  later('DELETE', `/api/projects/${pid7}`);
  await api('PUT', `/api/projects/${pid7}/tasks`,
    [{ name: 'Analysis', startDate: '20990105', endDate: '20990329', resources: [{ role: 'Consultant', soldHours: 100 }] }], sysadminCookie);
  later('DELETE', `/api/timesheets/${code7}`);
  const csv7 = ['projectId,date,task,role,owner,hours', `${code7},2099-01-05,Analysis,Consultant,Secret Owner${ts},10`].join('\n');
  ok((await uploadCsv('/api/timesheets/upload', csv7, sysadminCookie)).status === 201, 'PM-07 setup: actuals uploaded for the other account\'s project');
  const asAdmin7 = await api('POST', '/api/planning/model', body({ projectIds: [pid7] }), adminCookie);
  ok((asAdmin7.data?.roles || []).length === 1, 'PM-07 setup: an admin does see that project');

  const plainCookie = await getPlainUserCookie();
  if (!ok(!!plainCookie, 'PM-07 setup: a plain-user session was obtained')) return;
  const p7r = await api('POST', '/api/planning/model', body({ projectIds: [pid7] }), plainCookie);
  ok(p7r.status === 200 && Array.isArray(p7r.data?.roles) && p7r.data.roles.length === 0, 'PM-07 plain user, foreign project, role view → 200 with roles []');
  ok(JSON.stringify(p7r.data?.ownerStatus) === '{}', 'PM-07 ownerStatus is {} (no owner name leaks)');
  const p7p = await api('POST', '/api/planning/model', body({ view: 'project', projectIds: [pid7] }), plainCookie);
  ok(p7p.status === 200 && Array.isArray(p7p.data?.projects) && p7p.data.projects.length === 0, 'PM-07 project view → projects []');
  const p7o = await api('POST', '/api/planning/model', body({ view: 'owner', projectIds: [pid7] }), plainCookie);
  ok(p7o.status === 200 && JSON.stringify(p7o.data?.ownerMap) === '{}' && JSON.stringify(p7o.data?.ownerStatus) === '{}', 'PM-07 owner view → ownerMap {} and ownerStatus {}');
}

function startAssistantStub(port, state) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        let parsed = {};
        try { parsed = JSON.parse(body); } catch { /* ignore */ }
        state.bodies.push(parsed);
        if (state.mode === 'http500') { res.statusCode = 500; res.end('secret'); return; }
        res.setHeader('content-type', 'application/json');
        const sawResult = JSON.stringify(parsed.messages || []).includes('tool_result');
        if (state.mode === 'toolThen500' && sawResult) { res.statusCode = 500; res.end('secret'); return; }
        if ((state.mode === 'tool' || state.mode === 'toolThen500') && !sawResult) {
          res.end(JSON.stringify({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu1', name: 'rank_team', input: state.input || { topN: 2 } }] }));
        } else {
          res.end(JSON.stringify({ content: [{ type: 'text', text: 'Summary: the suggested team is ready.' }] }));
        }
      });
    });
    server.listen(port, '0.0.0.0', () => resolve(server));
  });
}

async function testPlanningAssistant() {
  section('Planning assistant');
  const ts = `${Date.now()}${++_fixtureSeq}`;
  const role = await makeTestRole(`PA${ts}`);                       // registered first → deleted last
  const person = `Assist Tester${ts}`;
  const rRes = await api('POST', '/api/resources',
    { firstName: 'Assist', lastName: `Tester${ts}`, email: `assist.${ts}@test.local`, roleId: role.id }, adminCookie);
  const resId = rRes.data?.id;
  if (resId) later('DELETE', `/api/resources/${resId}`);

  const mkProject = async (code, name, tasks, startDate = '209901') => {
    const r = await api('POST', '/api/projects', { name, code, startDate, endDate: '209903' }, sysadminCookie);
    const id = r.data?.id;
    if (id) { later('DELETE', `/api/projects/${id}`); await api('PUT', `/api/projects/${id}/tasks`, tasks, adminCookie); }
    return id;
  };
  const task = (name, sold, dates = ['20990105', '20990329']) => [{ name, startDate: dates[0], endDate: dates[1], resources: [{ role: role.code, soldHours: sold }] }];
  const csv = rows => ['projectId,date,task,role,owner,hours', ...rows.map(([c, d, t, h]) => `${c},${d},${t},${role.code},${person},${h}`)].join('\n');

  const histCode = `TPAH${ts}`, targetCode = `TPAT${ts}`, loadCode = `TPAL${ts}`;
  // the history project ended long ago: it feeds the profile but must not add planned load in 2099
  const hist = await mkProject(histCode, `__pa_hist_${ts}__`, task('Data analysis', 100, ['20980105', '20980630']), '209801');
  const target = await mkProject(targetCode, `__pa_target_${ts}__`, task('Data analysis', 120));
  later('DELETE', `/api/timesheets/${histCode}`);
  if (!ok(!!(resId && hist && target), 'PA-setup resource and projects created')) return;
  ok((await uploadCsv('/api/timesheets/upload', csv([[histCode, '2098-06-02', 'Data analysis', 50]]), adminCookie)).status === 201, 'PA-setup history uploaded');
  await runProfileJobs();

  const rank = (body, cookie = adminCookie) => api('POST', '/api/planning-assistant/rank', { projectId: target, asOf: '2099-01-10', params: {}, ...body }, cookie);

  ok((await api('POST', '/api/planning-assistant/rank', { projectId: target, asOf: '2099-01-10' })).status === 401, 'PA-01 rank without auth → 401');
  const plain = await getPlainUserCookie();
  if (plain) ok((await rank({}, plain)).status === 403, 'PA-02 a plain user gets 403');

  const badParams = await rank({ params: { topN: 99, bogus: 1 } });
  ok(badParams.status === 400 && badParams.data?.fields?.topN && badParams.data?.fields?.bogus, 'PA-03 invalid params → 400 with per-field errors');
  ok((await rank({ asOf: 'x' })).status === 400, 'PA-03 invalid asOf → 400');
  ok((await rank({ projectId: '00000000-0000-0000-0000-000000000000' })).status === 404, 'PA-04 unknown project → 404');
  const bare = await mkProject(`TPAB${ts}`, `__pa_bare_${ts}__`, [{ name: 'Nothing', resources: [] }]);
  ok((await rank({ projectId: bare })).status === 422, 'PA-04 project without roles/hours → 422');

  const r1 = await rank({});
  const best1 = r1.data?.tables?.best?.find(s => s.role === role.code)?.rows || [];
  const me = best1.find(x => x.resourceId === resId);
  ok(r1.status === 200 && !!me, 'PA-05 the registered person with history is in the best team');
  ok(me && me.score > 0 && me.roleHours === 50, 'PA-05 score > 0 and 50 h on the role');
  ok(me && Math.abs(me.freeAvg - 32) < 1e-6, 'PA-06 nobody else loads the person: 32 free hours/week');
  ok(r1.data?.requirement?.roles?.[0]?.code === role.code, 'PA-05 requirement summary lists the role');

  // load from another project: actuals in the past + a big residual spread over the future weeks
  const loaded = await mkProject(loadCode, `__pa_load_${ts}__`, task('Other work', 1000));
  later('DELETE', `/api/timesheets/${loadCode}`);
  await uploadCsv('/api/timesheets/upload', csv([[loadCode, '2099-01-05', 'Other work', 10]]), adminCookie);
  const r2 = await rank({});
  const me2 = r2.data?.tables?.available?.find(s => s.role === role.code)?.rows?.find(x => x.resourceId === resId);
  ok(me2 && me2.freeAvg < 1, `PA-06 a loaded person has almost no free hours (got ${me2?.freeAvg})`);
  ok(me2 && me2.rank < me2.score, 'PA-06 availability lowers the rank in the available table');
  void loaded;

  // the target project is excluded from the load (its own planned hours must not reduce availability)
  const r3 = await rank({ params: { excludeResources: [`Assist Tester${ts}`] } });
  const all3 = ['best', 'alternative', 'available'].flatMap(k => r3.data?.tables?.[k] || []).flatMap(s => s.rows);
  ok(r3.status === 200 && !all3.some(x => x.resourceId === resId), 'PA-07 excluded resource is in no table');
  const r4 = await rank({ params: { excludeResources: ['Nobody Named Like This'] } });
  ok(r4.status === 400 && r4.data?.fields?.excludeResources, 'PA-07 unknown excluded name → 400 with a field error');
  const r5 = await rank({ params: { roles: ['NOPE'] } });
  ok(r5.status === 400 && r5.data?.fields?.roles, 'PA-07 unknown role → 400 with a field error');
  const market = ((await api('GET', '/api/attribute-lists', null, adminCookie)).data || []).find(l => l.slug === 'market');
  if (market) {
    const r6 = await rank({ params: { requireTags: [{ list: 'Market', value: '__no_such_value__' }] } });
    ok(r6.status === 400 && typeof r6.data?.fields?.requireTags === 'string', 'PA-12 unknown tag value → 400 with fields.requireTags');
    const r7 = await rank({ params: { preferTags: [{ list: '__no_such_list__', value: 'x' }] } });
    ok(r7.status === 400 && /Unknown list/.test(r7.data?.fields?.preferTags || ''), 'PA-12 unknown tag list → 400 with fields.preferTags');
  } else pass('PA-12 no "market" attribute list seeded — skipped');

  // ── /chat (LLM stub) ──
  const chatBody = (over = {}) => ({ projectId: target, asOf: '2099-01-10', params: {}, messages: [{ role: 'user', content: 'Who is the best team?' }], ...over });
  ok((await api('POST', '/api/planning-assistant/chat', chatBody())).status === 401, 'PA-08 chat without auth → 401');
  ok((await api('POST', '/api/planning-assistant/chat', chatBody({ messages: [] }), adminCookie)).status === 400, 'PA-08 empty messages → 400');
  ok((await api('POST', '/api/planning-assistant/chat', chatBody({ messages: [{ role: 'assistant', content: 'hi' }] }), adminCookie)).status === 400, 'PA-08 last message must be from the user → 400');
  const longText = 'x'.repeat(4500);
  const longUser = await api('POST', '/api/planning-assistant/chat', chatBody({ messages: [{ role: 'user', content: longText }] }), adminCookie);
  ok(longUser.status === 400 && longUser.data?.fields?.messages, 'PA-08 a user message over 4000 chars → 400 fields.messages');
  const longAsst = await api('POST', '/api/planning-assistant/chat', chatBody({ messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: longText }, { role: 'user', content: 'again' }] }), adminCookie);
  ok(longAsst.status !== 400, 'PA-08 an over-long assistant message is truncated, not rejected');

  if (process.env.LLM_STUB_ENABLED !== '1') { pass('PA-09 LLM stub not enabled (run via scripts/run-tests.sh) — chat cases skipped'); return; }
  const state = { mode: 'tool', bodies: [], input: { topN: 2 } };
  const server = await startAssistantStub(4010, state);
  try {
    const c1 = await api('POST', '/api/planning-assistant/chat', chatBody(), adminCookie);
    ok(c1.status === 200 && /suggested team/.test(c1.data?.reply || ''), 'PA-09 chat returns the model summary');
    ok(c1.data?.params?.topN === 2, 'PA-09 params come from the validated tool call');
    ok(Array.isArray(c1.data?.tables?.best) && c1.data.tables.best.length > 0, 'PA-09 tables come from the backend ranking, not from the text');
    ok(state.bodies.length === 2 && JSON.stringify(state.bodies[1].messages).includes('tool_result'), 'PA-09 the tool result was fed back to the model');
    ok(JSON.stringify(state.bodies[0].system).includes('<project_data>') && JSON.stringify(state.bodies[0].system).includes(`__pa_target_${ts}__`), 'PA-09 the project summary is sent inside the data block');
    ok(JSON.stringify(state.bodies[0].system).includes('current_params'), 'PA-09 the current params are sent inside the data block');

    state.bodies.length = 0; state.input = { topN: 99 };            // invalid tool params → error goes back to the model
    const c2 = await api('POST', '/api/planning-assistant/chat', chatBody(), adminCookie);
    ok(c2.status === 200 && c2.data?.tables === null, 'PA-10 invalid tool params: no tables, conversation continues');
    ok(JSON.stringify(state.bodies[1]?.messages || []).includes('Invalid parameters'), 'PA-10 the model is told which parameter was invalid');

    state.mode = 'http500';
    const c3 = await api('POST', '/api/planning-assistant/chat', chatBody(), adminCookie);
    ok(c3.status === 503 && c3.data?.error === 'Assistant unavailable' && !JSON.stringify(c3.data).includes('secret'), 'PA-11 LLM failure → 503 without the response body');
    ok((await rank({})).status === 200, 'PA-11 /rank keeps working while the assistant is down');

    state.mode = 'toolThen500'; state.input = { topN: 2 };          // ranking computed, then the model fails
    const c4 = await api('POST', '/api/planning-assistant/chat', chatBody(), adminCookie);
    ok(c4.status === 200 && Array.isArray(c4.data?.tables?.best) && /could not finish/.test(c4.data?.reply || ''), 'PA-11 LLM failure after a ranking → 200 with the tables and a fallback reply');
  } finally { server.close(); }
}

// ── Version routes are scoped to their grid (2026-09-30 hardening) ──────────────

async function testVersionScope() {
  section('Version scope');
  const FAKE = '00000000-0000-0000-0000-000000000000';

  const rpy = await api('POST', '/api/pipeline-years', { year: TEST_YEAR_C }, adminCookie);
  if (![201, 409].includes(rpy.status)) { ok(false, 'VS-setup pipeline year unavailable'); return; }
  if (rpy.status === 201 && rpy.data?.id) later('DELETE', `/api/pipeline-years/${rpy.data.id}`);

  const mk = async (name, label) => {
    const g = await api('POST', '/api/cost-grids', { name, pipelineYear: TEST_YEAR_C }, adminCookie);
    if (g.data?.id) later('DELETE', `/api/cost-grids/${g.data.id}`);
    const v = g.data?.id
      ? await api('POST', `/api/cost-grids/${g.data.id}/versions`, { label }, adminCookie)
      : { data: null };
    return { cgId: g.data?.id, vId: v.data?.id };
  };
  const A = await mk('__test_vs_a__', 'vA');
  const B = await mk('__test_vs_b__', 'vB');
  if (!(A.cgId && A.vId && B.cgId && B.vId)) { ok(false, 'VS-setup two grids with one version each'); return; }

  const cross = `/api/cost-grids/${A.cgId}/versions/${B.vId}`; // grid A's id, grid B's version
  const cases = [
    ['VS-01 PATCH version',            'PATCH',  cross,                              { label: 'hijack' }],
    ['VS-03 POST duplicate',           'POST',   `${cross}/duplicate`,               null],
    ['VS-04 GET structure',            'GET',    `${cross}/structure`,               null],
    ['VS-05 PUT structure',            'PUT',    `${cross}/structure`,               { phases: [] }],
    ['VS-06 GET linked-projects',      'GET',    `${cross}/linked-projects`,         null],
    ['VS-07 POST linked-projects',     'POST',   `${cross}/linked-projects`,         { projectId: FAKE }],
    ['VS-08 DELETE linked-projects',   'DELETE', `${cross}/linked-projects/${FAKE}`, null],
    ['VS-09 POST refresh-rate',        'POST',   `${cross}/refresh-rate`,            null],
    ['VS-14 POST publish',             'POST',   `${cross}/publish`,                 null],
    ['VS-15 GET tags',                 'GET',    `${cross}/tags`,                    null],
    ['VS-16 PUT tags',                 'PUT',    `${cross}/tags`,                    { itemIds: [] }],
  ];
  for (const [label, method, path, body] of cases) {
    const r = await api(method, path, body, adminCookie);
    ok(r.status === 404, `${label} with another grid's version → 404 (got ${r.status})`);
  }

  // The 404s must also have changed nothing
  const listB = await api('GET', `/api/cost-grids/${B.cgId}/versions`, null, adminCookie);
  const listA = await api('GET', `/api/cost-grids/${A.cgId}/versions`, null, adminCookie);
  ok(listB.status === 200 && listB.data?.length === 1 && listB.data[0].id === B.vId && listB.data[0].label === 'vB',
    "VS-10 grid B's version still exists, same label");
  ok(listA.status === 200 && listA.data?.length === 1, 'VS-10 grid A did not gain a duplicated version');

  // Destructive cross-grid DELETE goes last, so every case above ran while vB still existed
  const rDel = await api('DELETE', cross, null, adminCookie);
  ok(rDel.status === 404, `VS-02 DELETE version with another grid's version → 404 (got ${rDel.status})`);
  const listB2 = await api('GET', `/api/cost-grids/${B.cgId}/versions`, null, adminCookie);
  ok(listB2.status === 200 && listB2.data?.length === 1 && listB2.data[0].id === B.vId,
    "VS-02 grid B's version still exists after the cross-grid DELETE");

  // Same-grid requests keep working
  const okPatch = await api('PATCH', `/api/cost-grids/${A.cgId}/versions/${A.vId}`, { label: 'vA2' }, adminCookie);
  ok(okPatch.status === 200 && okPatch.data?.label === 'vA2', 'VS-11 PATCH with the version of the same grid → 200');
  ok((await api('GET', `/api/cost-grids/${A.cgId}/versions/${A.vId}/structure`, null, adminCookie)).status === 200,
    'VS-11 GET structure with the version of the same grid → 200');

  // Malformed ids never reach Postgres
  ok((await api('GET', `/api/cost-grids/${A.cgId}/versions/not-a-uuid/structure`, null, adminCookie)).status === 404,
    'VS-12 malformed :vId → 404, not 500');
  ok((await api('GET', `/api/cost-grids/not-a-uuid/versions/${A.vId}/structure`, null, adminCookie)).status === 404,
    'VS-12 malformed :id → 404, not 500');

  // Auth is checked before the scope guard
  ok((await api('GET', `${cross}/structure`, null, '')).status === 401, 'VS-13 no session → 401, not 404');
}

// ── PATCH /api/projects/:id input validation (2026-09-30 hardening) ─────────────

async function testProjectPatchValidation() {
  section('Project PATCH validation');
  const r = await api('POST', '/api/projects', { name: '__test_patch_validation__' }, sysadminCookie);
  const id = r.data?.id;
  if (!id) { ok(false, 'PV-setup project created'); return; }
  later('DELETE', `/api/projects/${id}`);

  const bad1 = await api('PATCH', `/api/projects/${id}`, { cgVersionId: 'not-a-uuid' }, adminCookie);
  ok(bad1.status === 400 && /cgVersionId/.test(bad1.data?.error || ''), `PV-01 non-UUID cgVersionId → 400 (got ${bad1.status})`);
  const bad2 = await api('PATCH', `/api/projects/${id}`, { clientId: 'not-a-uuid' }, adminCookie);
  ok(bad2.status === 400 && /clientId/.test(bad2.data?.error || ''), `PV-02 non-UUID clientId → 400 (got ${bad2.status})`);
  const bad3 = await api('PATCH', `/api/projects/${id}`, { cgVersionId: 12345 }, adminCookie);
  ok(bad3.status === 400, `PV-03 non-string cgVersionId → 400 (got ${bad3.status})`);

  ok((await api('PATCH', `/api/projects/${id}`, { cgVersionId: null }, adminCookie)).status === 200,
    'PV-04 cgVersionId null still unlinks → 200');
  ok((await api('PATCH', `/api/projects/${id}`, { cgVersionId: '', clientId: '' }, adminCookie)).status === 200,
    "PV-04 empty string still unlinks → 200");
  ok((await api('PATCH', `/api/projects/${id}`, { name: '__test_patch_validation_2__' }, adminCookie)).status === 200,
    'PV-05 an ordinary field update is unchanged → 200');
}

// ── GET /api/timesheets/:projectCode without actuals (2026-09-30 hardening) ─────

async function testTimesheetsNoActuals() {
  section('Timesheets without actuals');
  const code = '__NO_SUCH_CODE_HD__';

  const a = await api('GET', `/api/timesheets/${code}`, null, adminCookie);
  ok(a.status === 200 && Array.isArray(a.data) && a.data.length === 0,
    `TS-01 admin, code without actuals → 200 [] (got ${a.status})`);

  const userCookie = await getPlainUserCookie();
  if (userCookie) {
    const u = await api('GET', `/api/timesheets/${code}`, null, userCookie);
    ok(u.status === 403, `TS-02 plain user, code not visible to them → 403 (got ${u.status})`);
  } else {
    ok(false, 'TS-02 skipped — plain-user session unavailable');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

// ── Project currency lock (2026-10-01) ─────────────────────────────────────────

// PUT …/structure on a version with a project-linked task. SR-01..03 characterize what is accepted today and
// must stay accepted (rename, reorder, move between phases).
async function testStructureRule() {
  section('Structure rule (linked tasks)');

  const rpy = await api('POST', '/api/pipeline-years', { year: TEST_YEAR_C }, adminCookie);
  if (![201, 409].includes(rpy.status)) { ok(false, 'SR-setup pipeline year unavailable'); return; }
  if (rpy.status === 201 && rpy.data?.id) later('DELETE', `/api/pipeline-years/${rpy.data.id}`);

  // Registered first, so cleanup (reverse order) deletes the project before the proposal.
  const rcg = await api('POST', '/api/cost-grids', { name: '__test_sr_cg__', pipelineYear: TEST_YEAR_C }, adminCookie);
  const cgId = rcg.data?.id;
  if (cgId) later('DELETE', `/api/cost-grids/${cgId}`);
  const vId = cgId ? (await api('POST', `/api/cost-grids/${cgId}/versions`, { label: 'v1' }, adminCookie)).data?.id : null;
  if (!ok(!!(cgId && vId), 'SR-setup proposal with one version created')) return;
  const base = `/api/cost-grids/${cgId}/versions/${vId}`;
  const putStructure = phases => api('PUT', `${base}/structure`, { phases }, adminCookie);

  const first = await putStructure([
    { title: 'P1', tasks: [{ title: 'T1' }, { title: 'T2' }] },
    { title: 'P2', tasks: [] },
  ]);
  const st = (await api('GET', `${base}/structure`, null, adminCookie)).data;
  const idT1 = st?.phases?.[0]?.tasks?.find(t => t.title === 'T1')?.id;
  const idT2 = st?.phases?.[0]?.tasks?.find(t => t.title === 'T2')?.id;
  if (!ok(first.status === 200 && !!idT1 && !!idT2, 'SR-setup structure with two tasks saved')) return;

  const gen = await api('POST', '/api/projects', { name: '__test_sr_linked__', cgVersionId: vId, currency: 'EUR' }, adminCookie);
  const pId = gen.data?.id;
  if (pId) later('DELETE', `/api/projects/${pId}`);
  const lnk = pId ? await api('POST', `${base}/linked-projects`, { projectId: pId, taskIds: [idT1], taskNames: ['T1'] }, adminCookie) : null;
  if (!ok(lnk?.status === 201, 'SR-setup project linked to T1')) return;

  const t1 = { id: idT1, title: 'T1' };
  const t2 = { id: idT2, title: 'T2' };

  const r1 = await putStructure([{ title: 'P1', tasks: [{ ...t1, title: 'T1b' }, t2] }, { title: 'P2', tasks: [] }]);
  ok(r1.status === 200, `SR-01 rename of a linked task → 200 (got ${r1.status})`);

  const r2 = await putStructure([{ title: 'P1', tasks: [t2, t1] }, { title: 'P2', tasks: [] }]);
  ok(r2.status === 200, `SR-02 reorder → 200 (got ${r2.status})`);

  const r3 = await putStructure([{ title: 'P1', tasks: [t2] }, { title: 'P2', tasks: [t1] }]);
  ok(r3.status === 200, `SR-03 move to another phase → 200 (got ${r3.status})`);

  // SR-04/05: dropping the linked task is refused, and the DB keeps both tasks
  const r4 = await putStructure([{ title: 'P1', tasks: [t2] }, { title: 'P2', tasks: [] }]);
  ok(r4.status === 400 && r4.data?.code === 'STRUCTURE_RULE',
    `SR-04 payload without the linked task → 400 STRUCTURE_RULE (got ${r4.status})`);
  ok(/"T1"/.test(r4.data?.error || ''), 'SR-04 the error names the missing task');
  const after = (await api('GET', `${base}/structure`, null, adminCookie)).data;
  const titles = (after?.phases || []).flatMap(p => p.tasks.map(t => t.title)).sort().join(',');
  ok(titles === 'T1,T2', `SR-05 the refused save left T1 and T2 in the DB (got "${titles}")`);

  // SR-06: a link to a task that does not exist is ignored
  const orphan = '00000000-0000-4000-8000-000000000000';
  const lnk2 = await api('POST', `${base}/linked-projects`, { projectId: pId, taskIds: [idT1, orphan], taskNames: ['T1'] }, adminCookie);
  ok(lnk2.status === 201, 'SR-06 setup: link carries an orphan task id');
  const r6 = await putStructure([{ title: 'P1', tasks: [t2] }, { title: 'P2', tasks: [t1] }]);
  ok(r6.status === 200, `SR-06 a save keeping T1 with an orphan id in the link → 200 (got ${r6.status})`);
}

// ── Date rule (2026-10-24) ─────────────────────────────────────────────────────

// DATE_RULE on version, project and task date writes. DT-08..DT-10 pin the tolerant paths (Review Focus 1-3).
async function testDateRule() {
  section('Date rule (periods and task dates)');

  const rpy = await api('POST', '/api/pipeline-years', { year: TEST_YEAR_C }, adminCookie);
  if (![201, 409].includes(rpy.status)) { ok(false, 'DT-setup pipeline year unavailable'); return; }
  if (rpy.status === 201 && rpy.data?.id) later('DELETE', `/api/pipeline-years/${rpy.data.id}`);

  // Registered first, so cleanup (reverse order) deletes the project before the proposals.
  const rcg = await api('POST', '/api/cost-grids', { name: '__test_dt_cg__', pipelineYear: TEST_YEAR_C }, adminCookie);
  const cgId = rcg.data?.id;
  if (cgId) later('DELETE', `/api/cost-grids/${cgId}`);
  const rcg2 = await api('POST', '/api/cost-grids', { name: '__test_dt_cg2__', pipelineYear: TEST_YEAR_C }, adminCookie);
  const cg2Id = rcg2.data?.id;
  if (cg2Id) later('DELETE', `/api/cost-grids/${cg2Id}`);
  const mk = async (id, label) => (id ? (await api('POST', `/api/cost-grids/${id}/versions`, { label }, adminCookie)).data?.id : null);
  const vId = await mk(cgId, 'v1');
  if (!ok(!!(cgId && cg2Id && vId), 'DT-setup two proposals, one with a version')) return;
  const base = `/api/cost-grids/${cgId}/versions/${vId}`;
  const isRule = r => r.status === 400 && r.data?.code === 'DATE_RULE';

  // DT-01: version POST with an inverted period, nothing is created
  const bad = await api('POST', `/api/cost-grids/${cg2Id}/versions`, { label: 'bad', startDate: '202609', endDate: '202607' }, adminCookie);
  ok(isRule(bad), `DT-01 version POST with end before start → 400 DATE_RULE (got ${bad.status})`);
  const list2 = await api('GET', `/api/cost-grids/${cg2Id}/versions`, null, adminCookie);
  ok(Array.isArray(list2.data) && list2.data.length === 0, 'DT-01 the refused POST created no version');

  // DT-02 / DT-03: version PATCH
  const p2 = await api('PATCH', base, { startDate: '2026-05' }, adminCookie);
  ok(isRule(p2), `DT-02 version PATCH with a malformed month → 400 DATE_RULE (got ${p2.status})`);
  const vper = async () => {
    const v = ((await api('GET', `/api/cost-grids/${cgId}/versions`, null, adminCookie)).data || []).find(x => x.id === vId);
    return `${String(v?.start_date || '').trim()}|${String(v?.end_date || '').trim()}`;
  };
  ok(await vper() === '|', 'DT-02 the refused PATCH left the version period empty');
  const p3 = await api('PATCH', base, { startDate: '202602', endDate: '202612' }, adminCookie);
  ok(p3.status === 200, `DT-03 version PATCH with a valid period → 200 (got ${p3.status})`);
  const p3b = await api('PATCH', base, { endDate: '202601' }, adminCookie);
  ok(isRule(p3b), `DT-03 PATCH moving end before the stored start → 400 DATE_RULE (got ${p3b.status})`);
  const vlist = (await api('GET', `/api/cost-grids/${cgId}/versions`, null, adminCookie)).data || [];
  ok(String(vlist.find(v => v.id === vId)?.end_date || '').trim() === '202612', 'DT-03 the refused PATCH left the end date at 202612');

  // DT-16: version POST with an impossible month, the list is unchanged
  const j16 = await api('POST', `/api/cost-grids/${cg2Id}/versions`, { label: 'bad2', startDate: '202613' }, adminCookie);
  ok(isRule(j16), `DT-16 version POST with an impossible month → 400 DATE_RULE (got ${j16.status})`);
  const list16 = await api('GET', `/api/cost-grids/${cg2Id}/versions`, null, adminCookie);
  ok(Array.isArray(list16.data) && list16.data.length === 0, 'DT-16 the refused POST created no version');

  // DT-08: re-sending an empty period against an empty period is "unchanged"
  const emptyV = await mk(cgId, 'v-empty');
  const p8 = await api('PATCH', `/api/cost-grids/${cgId}/versions/${emptyV}`, { startDate: null, endDate: null }, adminCookie);
  ok(p8.status === 200, `DT-08 version PATCH re-sending null/null on a version without period → 200 (got ${p8.status})`);

  // The linked project, with a stored period
  const gen = await api('POST', '/api/projects', { name: '__test_dt_proj__', cgVersionId: vId, currency: 'EUR', startDate: '202601', endDate: '202612' }, adminCookie);
  const pId = gen.data?.id;
  if (pId) later('DELETE', `/api/projects/${pId}`);
  if (!ok(gen.status === 201 && !!pId, `DT-setup project created with a period (got ${gen.status})`)) return;

  // DT-04 / DT-09: project PATCH
  const j4 = await api('PATCH', `/api/projects/${pId}`, { startDate: '202609', endDate: '202607' }, adminCookie);
  ok(isRule(j4), `DT-04 project PATCH with end before start → 400 DATE_RULE (got ${j4.status})`);
  const projects = async () => (await api('GET', '/api/projects', null, adminCookie)).data || [];
  const period = async () => {
    const p = (await projects()).find(x => x.id === pId);
    return `${String(p?.start_date || '').trim()}|${String(p?.end_date || '').trim()}`;
  };
  ok(await period() === '202601|202612', 'DT-04 the refused PATCH left the project period unchanged');
  const j9 = await api('PATCH', `/api/projects/${pId}`, { name: '__test_dt_proj_renamed__' }, adminCookie);
  ok(j9.status === 200, `DT-09 project PATCH touching only the name → 200 (got ${j9.status})`);

  // DT-14 / DT-15: project PATCH, malformed month and end-only before the stored start
  const j14 = await api('PATCH', `/api/projects/${pId}`, { startDate: '2026-05' }, adminCookie);
  ok(isRule(j14), `DT-14 project PATCH with a malformed month → 400 DATE_RULE (got ${j14.status})`);
  const j15 = await api('PATCH', `/api/projects/${pId}`, { endDate: '202512' }, adminCookie);
  ok(isRule(j15), `DT-15 project PATCH with end before the stored start → 400 DATE_RULE (got ${j15.status})`);
  ok(await period() === '202601|202612', 'DT-14/15 the refused PATCHes left the project period unchanged');

  // DT-12 / DT-13: project POST, inverted and malformed periods, nothing is created
  const countNamed = async n => (await projects()).filter(x => x.name === n).length;
  const j12 = await api('POST', '/api/projects', { name: '__test_dt_inv__', cgVersionId: vId, currency: 'EUR', startDate: '202609', endDate: '202607' }, adminCookie);
  ok(isRule(j12), `DT-12 project POST with end before start → 400 DATE_RULE (got ${j12.status})`);
  ok(await countNamed('__test_dt_inv__') === 0, 'DT-12 the refused POST created no project');
  const j13 = await api('POST', '/api/projects', { name: '__test_dt_mal__', cgVersionId: vId, currency: 'EUR', startDate: '2026-05' }, adminCookie);
  ok(isRule(j13), `DT-13 project POST with a malformed month → 400 DATE_RULE (got ${j13.status})`);
  ok(await countNamed('__test_dt_mal__') === 0, 'DT-13 the refused POST created no project');

  // DT-05 / DT-06: PUT structure
  const put = phases => api('PUT', `${base}/structure`, { phases }, adminCookie);
  const titles = async () => ((await api('GET', `${base}/structure`, null, adminCookie)).data?.phases || [])
    .flatMap(p => p.tasks.map(t => t.title)).sort().join(',');
  const s0 = await put([{ title: 'P1', tasks: [{ title: 'Keep' }] }]);
  ok(s0.status === 200 && await titles() === 'Keep', 'DT-setup structure with one task saved');
  const r5 = await put([{ title: 'P1', tasks: [{ title: 'T1', taskStartDate: '2026-04-31' }] }]);
  ok(isRule(r5), `DT-05 structure with an impossible task date → 400 DATE_RULE (got ${r5.status})`);
  ok(await titles() === 'Keep', 'DT-05 the refused structure left the stored one unchanged');
  const r6 = await put([{ title: 'P1', tasks: [{ title: 'T1', taskStartDate: '2026-05-10', taskEndDate: '2026-05-01' }] }]);
  ok(isRule(r6), `DT-06 structure with a task ending before it starts → 400 DATE_RULE (got ${r6.status})`);
  ok(await titles() === 'Keep', 'DT-06 the refused structure left the stored one unchanged');

  // DT-07: PUT project tasks
  const tasksPath = `/api/projects/${pId}/tasks`;
  const t0 = await api('PUT', tasksPath, [{ name: 'Keep' }], adminCookie);
  const names = async () => ((await api('GET', tasksPath, null, adminCookie)).data || []).map(t => t.name).sort().join(',');
  ok(t0.status === 200 && await names() === 'Keep', 'DT-setup project tasks saved');
  const r7 = await api('PUT', tasksPath, [{ name: 'X', startDate: '20260510', endDate: '20260501' }], adminCookie);
  ok(isRule(r7), `DT-07 project tasks with end before start → 400 DATE_RULE (got ${r7.status})`);
  ok(await names() === 'Keep', 'DT-07 the refused PUT left the project tasks unchanged');
  const r17 = await api('PUT', tasksPath, [{ name: 'X', startDate: '20260431' }], adminCookie);
  ok(isRule(r17), `DT-17 project tasks with an impossible day → 400 DATE_RULE (got ${r17.status})`);
  ok(await names() === 'Keep', 'DT-17 the refused PUT left the project tasks unchanged');

  // DT-10: a task with only one date is accepted
  const r10 = await put([{ title: 'P1', tasks: [{ title: 'T1', taskStartDate: '2026-05-10' }] }]);
  ok(r10.status === 200, `DT-10 structure with a start-only task → 200 (got ${r10.status})`);
  const r10b = await api('PUT', tasksPath, [{ name: 'X', startDate: '20260510' }], adminCookie);
  ok(r10b.status === 200, `DT-10 project tasks with a start-only task → 200 (got ${r10b.status})`);

  // DT-11: the timesheet ingest refuses an impossible ISO date, naming the row
  const csv11 = ['projectId,date,task,role,owner,hours', 'DT11,2026-13-45,Analysis,Consultant,Nobody,1'].join('\n');
  const r11 = await uploadCsv('/api/timesheets/upload', csv11, adminCookie);
  ok(r11.status === 400 && /row 2/.test(r11.data?.error || '') && /not a valid calendar date/.test(r11.data?.error || ''),
    `DT-11 timesheet upload with date 2026-13-45 → 400 naming row 2 and the invalid date (got ${r11.status}: ${r11.data?.error})`);
}

// ── Task dates inside the period (2026-10-26) ──────────────────────────────────

// TD-01..TD-06: a task date outside the version/project period is refused, and so is a period change that pushes a task out.
async function testTaskPeriod() {
  section('Task dates inside the period');

  const rpy = await api('POST', '/api/pipeline-years', { year: TEST_YEAR_C }, adminCookie);
  if (![201, 409].includes(rpy.status)) { ok(false, 'TD-setup pipeline year unavailable'); return; }
  if (rpy.status === 201 && rpy.data?.id) later('DELETE', `/api/pipeline-years/${rpy.data.id}`);

  // Registered first, so cleanup (reverse order) deletes the project before the proposal.
  const rcg = await api('POST', '/api/cost-grids', { name: '__test_tp_cg__', pipelineYear: TEST_YEAR_C }, adminCookie);
  const cgId = rcg.data?.id;
  if (cgId) later('DELETE', `/api/cost-grids/${cgId}`);
  const mk = async label => (cgId ? (await api('POST', `/api/cost-grids/${cgId}/versions`, { label }, adminCookie)).data?.id : null);
  const vId = await mk('v1');
  if (!ok(!!(cgId && vId), 'TD-setup proposal with a version')) return;
  const base = `/api/cost-grids/${cgId}/versions/${vId}`;
  const isRule = r => r.status === 400 && r.data?.code === 'DATE_RULE';
  const setPeriod = await api('PATCH', base, { startDate: '202604', endDate: '202612' }, adminCookie);
  if (!ok(setPeriod.status === 200, `TD-setup version period 202604-202612 (got ${setPeriod.status})`)) return;

  const gen = await api('POST', '/api/projects', { name: '__test_tp_proj__', cgVersionId: vId, currency: 'EUR', startDate: '202604', endDate: '202612' }, adminCookie);
  const pId = gen.data?.id;
  if (pId) later('DELETE', `/api/projects/${pId}`);
  if (!ok(gen.status === 201 && !!pId, `TD-setup project with period 202604-202612 (got ${gen.status})`)) return;

  const put = (b, phases) => api('PUT', `${b}/structure`, { phases }, adminCookie);
  const titles = async () => ((await api('GET', `${base}/structure`, null, adminCookie)).data?.phases || [])
    .flatMap(p => p.tasks.map(t => t.title)).sort().join(',');
  const vPeriod = async () => {
    const v = ((await api('GET', `/api/cost-grids/${cgId}/versions`, null, adminCookie)).data || []).find(x => x.id === vId);
    return `${String(v?.start_date || '').trim()}|${String(v?.end_date || '').trim()}`;
  };

  // TD-01 / TD-02: PUT structure
  const s0 = await put(base, [{ title: 'P1', tasks: [{ title: 'Keep' }] }]);
  ok(s0.status === 200 && await titles() === 'Keep', 'TD-setup structure with one task saved');
  const r1 = await put(base, [{ title: 'P1', tasks: [{ title: 'Early', taskStartDate: '2026-03-31' }] }]);
  ok(isRule(r1), `TD-01 structure with a task before the version period → 400 DATE_RULE (got ${r1.status})`);
  ok(await titles() === 'Keep', 'TD-01 the refused structure left the stored one unchanged');
  const r2 = await put(base, [{ title: 'P1', tasks: [{ title: 'NoDates' }, { title: 'Edge', taskStartDate: '2026-04-01', taskEndDate: '2026-12-31' }] }]);
  ok(r2.status === 200, `TD-02 structure with an undated task and one on the period edges → 200 (got ${r2.status})`);

  // TD-03: PUT project tasks
  const tasksPath = `/api/projects/${pId}/tasks`;
  const names = async () => ((await api('GET', tasksPath, null, adminCookie)).data || []).map(t => t.name).sort().join(',');
  const t0 = await api('PUT', tasksPath, [{ name: 'Keep' }], adminCookie);
  ok(t0.status === 200 && await names() === 'Keep', 'TD-setup project tasks saved');
  const r3 = await api('PUT', tasksPath, [{ name: 'Late', startDate: '20270105' }], adminCookie);
  ok(isRule(r3), `TD-03 project tasks with a task after the project period → 400 DATE_RULE (got ${r3.status})`);
  ok(await names() === 'Keep', 'TD-03 the refused PUT left the project tasks unchanged');
  const r3b = await api('PUT', tasksPath, [{ name: 'Inside', startDate: '20260410' }, { name: 'Aug', startDate: '20260801' }], adminCookie);
  ok(r3b.status === 200, `TD-03 project tasks inside the project period → 200 (got ${r3b.status})`);

  // TD-04: version PATCH shrinking the period under a task (the TD-02 task starts on 2026-04-01)
  const p4 = await api('PATCH', base, { startDate: '202605', endDate: '202612' }, adminCookie);
  ok(isRule(p4), `TD-04 version PATCH pushing a task out of the period → 400 DATE_RULE (got ${p4.status})`);
  ok(await vPeriod() === '202604|202612', 'TD-04 the refused PATCH left the version period unchanged');
  const p4b = await api('PATCH', base, { startDate: '202603', endDate: '202612' }, adminCookie);
  ok(p4b.status === 200, `TD-04 version PATCH widening the period → 200 (got ${p4b.status})`);
  const p4c = await api('PATCH', base, { startDate: '202603', endDate: '202612' }, adminCookie);
  ok(p4c.status === 200, `TD-04 version PATCH re-sending the same period → 200 (got ${p4c.status})`);

  // TD-05: project PATCH shrinking the period under a task (the TD-03 task on 2026-08-01)
  const p5 = await api('PATCH', `/api/projects/${pId}`, { endDate: '202605' }, adminCookie);
  ok(isRule(p5), `TD-05 project PATCH pushing a task out of the period → 400 DATE_RULE (got ${p5.status})`);
  const pp = (await api('GET', '/api/projects', null, adminCookie)).data?.find(x => x.id === pId);
  ok(`${String(pp?.start_date || '').trim()}|${String(pp?.end_date || '').trim()}` === '202604|202612', 'TD-05 the refused PATCH left the project period unchanged');
  const p5b = await api('PATCH', `/api/projects/${pId}`, { endDate: '202701' }, adminCookie);
  ok(p5b.status === 200, `TD-05 project PATCH widening the period → 200 (got ${p5b.status})`);

  // TD-06: a version without a period has no limits; giving it one that excludes a task is refused
  const v6 = await mk('v-noperiod');
  if (!ok(!!v6, 'TD-setup version without period')) return;
  const base6 = `/api/cost-grids/${cgId}/versions/${v6}`;
  const s6 = await put(base6, [{ title: 'P1', tasks: [{ title: 'July', taskStartDate: '2026-07-01' }] }]);
  ok(s6.status === 200, `TD-06 setup: a task on a version without period → 200 (got ${s6.status})`);
  const p6 = await api('PATCH', base6, { startDate: '202608', endDate: '202612' }, adminCookie);
  ok(isRule(p6), `TD-06 first period that excludes a task → 400 DATE_RULE (got ${p6.status})`);
  const p6b = await api('PATCH', base6, { startDate: '202607', endDate: '202612' }, adminCookie);
  ok(p6b.status === 200, `TD-06 first period that includes the task → 200 (got ${p6b.status})`);
}

// ── Date and period rules, cycle 3 (2026-11-13) ────────────────────────────────

// DR-01..DR-08: one merge/check for every period write, month keys inside the project period, name-only links.
// The case "a task already saved outside its period, or invalid" is not reachable from the API (every route
// refuses it), so the unit tests of taskDatesError (api/src/lib/dates.test.js) are what prove it.
async function testDateRulesC3() {
  section('Date and period rules (cycle 3)');

  const rpy = await api('POST', '/api/pipeline-years', { year: TEST_YEAR_C }, adminCookie);
  if (![201, 409].includes(rpy.status)) { ok(false, 'DR-setup pipeline year unavailable'); return; }
  if (rpy.status === 201 && rpy.data?.id) later('DELETE', `/api/pipeline-years/${rpy.data.id}`);

  // Registered first, so cleanup (reverse order) deletes the projects before the proposal.
  const rcg = await api('POST', '/api/cost-grids', { name: '__test_dr_cg__', pipelineYear: TEST_YEAR_C }, adminCookie);
  const cgId = rcg.data?.id;
  if (cgId) later('DELETE', `/api/cost-grids/${cgId}`);
  const mk = async label => (cgId ? (await api('POST', `/api/cost-grids/${cgId}/versions`, { label }, adminCookie)).data?.id : null);
  const vId = await mk('v1');
  const v2Id = await mk('v2-noperiod');
  if (!ok(!!(cgId && vId && v2Id), 'DR-setup proposal with two versions')) return;
  const base = `/api/cost-grids/${cgId}/versions/${vId}`;
  const isRule = r => r.status === 400 && r.data?.code === 'DATE_RULE';
  const setPeriod = await api('PATCH', base, { startDate: '202604', endDate: '202612' }, adminCookie);
  if (!ok(setPeriod.status === 200, `DR-setup version period 202604-202612 (got ${setPeriod.status})`)) return;

  const gen = await api('POST', '/api/projects', { name: '__test_dr_proj__', cgVersionId: vId, currency: 'EUR', startDate: '202604', endDate: '202612' }, adminCookie);
  const pId = gen.data?.id;
  if (pId) later('DELETE', `/api/projects/${pId}`);
  if (!ok(gen.status === 201 && !!pId, `DR-setup project with period 202604-202612 (got ${gen.status})`)) return;
  const gen2 = await api('POST', '/api/projects', { name: '__test_dr_proj2__', cgVersionId: v2Id, currency: 'EUR' }, adminCookie);
  const p2Id = gen2.data?.id;
  if (p2Id) later('DELETE', `/api/projects/${p2Id}`);
  if (!ok(gen2.status === 201 && !!p2Id, `DR-setup project without period (got ${gen2.status})`)) return;

  const put = (phases, period) => api('PUT', `${base}/structure`, period === undefined ? { phases } : { phases, period }, adminCookie);
  const vPeriod = async () => {
    const v = ((await api('GET', `/api/cost-grids/${cgId}/versions`, null, adminCookie)).data || []).find(x => x.id === vId);
    return `${String(v?.start_date || '').trim()}|${String(v?.end_date || '').trim()}`;
  };
  const one = (title, s, e) => [{ title: 'P1', tasks: [{ title, taskStartDate: s, taskEndDate: e }] }];

  // DR-01: the same period reduction gets the same refusal from the version PATCH and the structure PUT
  const s0 = await put(one('Early', '2026-04-10', '2026-04-20'));
  ok(s0.status === 200, `DR-setup structure with a task on 2026-04-10 (got ${s0.status})`);
  const e1 = await api('PATCH', base, { startDate: '202605', endDate: '202612' }, adminCookie);
  const e1b = await put(one('Early', '2026-04-10', '2026-04-20'), { startDate: '202605', endDate: '202612' });
  ok(isRule(e1) && isRule(e1b) && e1.data.error === e1b.data.error,
    `DR-01 version PATCH and structure PUT refuse the same reduction with the same text (got ${e1.status}: ${e1.data?.error} | ${e1b.status}: ${e1b.data?.error})`);

  // DR-02: a renamed task is an edited task: checked in full
  const e2 = await put(one('Renamed', '2026-03-01', '2026-03-05'));
  ok(isRule(e2), `DR-02 structure with a renamed task outside the period → 400 DATE_RULE (got ${e2.status})`);
  const tasksPath = `/api/projects/${pId}/tasks`;
  const e2b = await api('PUT', tasksPath, [{ name: 'Renamed', startDate: '20260301', endDate: '20260305' }], adminCookie);
  ok(isRule(e2b), `DR-02 project tasks with a task outside the period → 400 DATE_RULE (got ${e2b.status})`);

  // DR-03: the same tasks and the same period change nothing
  const r3 = await put(one('Early', '2026-04-10', '2026-04-20'), { startDate: '202604', endDate: '202612' });
  ok(r3.status === 200 && await vPeriod() === '202604|202612',
    `DR-03 structure re-sending tasks and period → 200, period unchanged (got ${r3.status}: ${r3.data?.error})`);

  // DR-04 / DR-05: project tasks inside the period; a re-sent identical period is accepted
  const r4 = await api('PUT', tasksPath, [{ name: 'Mid', startDate: '20260601', endDate: '20260630' }], adminCookie);
  ok(r4.status === 200, `DR-04 project tasks inside the period → 200 (got ${r4.status}: ${r4.data?.error})`);
  const r5 = await api('PATCH', `/api/projects/${pId}`, { startDate: '202604', endDate: '202612' }, adminCookie);
  ok(r5.status === 200, `DR-05 project PATCH re-sending the same period with a task in it → 200 (got ${r5.status}: ${r5.data?.error})`);

  // DR-06: month keys must sit inside the project period; a stored key is tolerated
  const ph = body => api('PATCH', `/api/projects/${pId}/phasing`, { phasing: body }, adminCookie);
  const pt = rows => api('PATCH', `/api/projects/${pId}/ptc`, { ptc: rows }, adminCookie);
  const pl = body => api('PATCH', `/api/projects/${pId}/planning`, { planning: body }, adminCookie);
  ok(isRule(await ph({ '202601': 1 })), 'DR-06 phasing with a month before the period → 400 DATE_RULE');
  ok(isRule(await pt([{ month: '202601', amount: 1 }])), 'DR-06 PTC row with a month before the period → 400 DATE_RULE');
  ok(isRule(await pl({ '202701': 8 })), 'DR-06 planning with a month after the period → 400 DATE_RULE');
  const in6 = [await ph({ '202611': 5 }), await pt([{ month: '202611', amount: 1 }]), await pl({ '202611': 8 })];
  ok(in6.every(r => r.status === 200), `DR-06 phasing, PTC and planning with a month inside the period → 200 (got ${in6.map(r => r.status)})`);
  // Shrink the period under the stored keys (no task is pushed out), then re-send them with a new key.
  const shrink = await api('PATCH', `/api/projects/${pId}`, { endDate: '202610' }, adminCookie);
  ok(shrink.status === 200, `DR-06 setup: period shrunk under the stored month keys → 200 (got ${shrink.status}: ${shrink.data?.error})`);
  const keep6 = [await ph({ '202611': 5, '202610': 1 }), await pt([{ month: '202611', amount: 1 }, { month: '202610', amount: 2 }]), await pl({ '202611': 8, '202610': 4 })];
  ok(keep6.every(r => r.status === 200), `DR-06 re-sending a stored key outside the period with a new one inside → 200 (got ${keep6.map(r => r.status)})`);
  ok(isRule(await ph({ '202611': 5, '202612': 1 })), 'DR-06 a new key outside the period next to a stored one → 400 DATE_RULE');

  // DR-07: a project without a period has no limits; planning on a missing project is a 404
  const q = [
    await api('PATCH', `/api/projects/${p2Id}/phasing`, { phasing: { '202601': 1 } }, adminCookie),
    await api('PATCH', `/api/projects/${p2Id}/ptc`, { ptc: [{ month: '', amount: 1 }, { month: '202601', amount: 1 }] }, adminCookie),
    await api('PATCH', `/api/projects/${p2Id}/planning`, { planning: { '202601': 3 } }, adminCookie),
  ];
  ok(q.every(r => r.status === 200), `DR-07 project without period accepts any month, blank included (got ${q.map(r => r.status)})`);
  const r7 = await api('PATCH', '/api/projects/00000000-0000-4000-8000-000000000000/planning', { planning: {} }, adminCookie);
  ok(r7.status === 404, `DR-07 planning on a missing project → 404 (got ${r7.status})`);

  // DR-08: a task linked to a project by name only cannot be dropped, nor lost by a rename that keeps its id
  const s8 = await put([{ title: 'P1', tasks: [{ title: 'Linked' }, { title: 'Other' }] }], { startDate: '202604', endDate: '202612' });
  ok(s8.status === 200, `DR-08 setup: two tasks (got ${s8.status}: ${s8.data?.error})`);
  const linked = ((await api('GET', `${base}/structure`, null, adminCookie)).data?.phases || []).flatMap(p => p.tasks).find(t => t.title === 'Linked');
  const lnk = await api('POST', `${base}/linked-projects`, { projectId: pId, taskIds: [], taskNames: ['Linked'] }, adminCookie);
  ok(lnk.status === 201 && !!linked?.id, `DR-08 setup: project linked by name only (got ${lnk.status})`);
  const d8 = await put([{ title: 'P1', tasks: [{ title: 'Other' }] }]);
  ok(d8.status === 400 && d8.data?.code === 'STRUCTURE_RULE', `DR-08 dropping a task linked by name only → 400 STRUCTURE_RULE (got ${d8.status}: ${d8.data?.error})`);
  const k8 = await put([{ title: 'P1', tasks: [{ taskId: linked?.id, title: 'Linked renamed' }, { title: 'Other' }] }]);
  ok(k8.status === 200, `DR-08 renaming the linked task under the same id → 200 (got ${k8.status}: ${k8.data?.error})`);

  // DR-09: a period the project already has is not written; a month key must be a YYYYMM month
  const same9 = await api('PATCH', `/api/projects/${pId}`, { startDate: '202604', endDate: '202610' }, adminCookie);
  ok(same9.status === 200 && same9.data?.id === pId, `DR-09 PATCH re-sending the same period → 200 with the project id (got ${same9.status}: ${same9.data?.error})`);
  const ren9 = await api('PATCH', `/api/projects/${pId}`, { name: '__test_dr_proj_renamed__', startDate: '202604', endDate: '202610' }, adminCookie);
  const after9 = ((await api('GET', '/api/projects', null, adminCookie)).data || []).find(x => x.id === pId);
  ok(ren9.status === 200 && after9?.name === '__test_dr_proj_renamed__' && `${String(after9?.start_date || '').trim()}|${String(after9?.end_date || '').trim()}` === '202604|202610',
    `DR-09 PATCH renaming with the same period → 200, name changed, period unchanged (got ${ren9.status})`);
  const key9 = await pt([{ month: '2026-07', amount: 1 }]);
  ok(isRule(key9) && /is not a valid month/.test(key9.data?.error || ''), `DR-09 PTC row with a month that is not YYYYMM → 400 DATE_RULE naming the format (got ${key9.status}: ${key9.data?.error})`);
}

// ── Period travels with the tasks (2026-10-27) ─────────────────────────────────

// PS-01..: PUT structure may carry the version period; both are checked and written in one transaction.
async function testPeriodWithTasks() {
  section('Period saved together with the tasks');

  const rpy = await api('POST', '/api/pipeline-years', { year: TEST_YEAR_C }, adminCookie);
  if (![201, 409].includes(rpy.status)) { ok(false, 'PS-setup pipeline year unavailable'); return; }
  if (rpy.status === 201 && rpy.data?.id) later('DELETE', `/api/pipeline-years/${rpy.data.id}`);

  // Registered first, so cleanup (reverse order) deletes the project before the proposal.
  const rcg = await api('POST', '/api/cost-grids', { name: '__test_ps_cg__', pipelineYear: TEST_YEAR_C }, adminCookie);
  const cgId = rcg.data?.id;
  if (cgId) later('DELETE', `/api/cost-grids/${cgId}`);
  const vId = cgId ? (await api('POST', `/api/cost-grids/${cgId}/versions`, { label: 'v1' }, adminCookie)).data?.id : null;
  if (!ok(!!(cgId && vId), 'PS-setup proposal with a version')) return;
  const base = `/api/cost-grids/${cgId}/versions/${vId}`;
  const isRule = r => r.status === 400 && r.data?.code === 'DATE_RULE';
  const setPeriod = await api('PATCH', base, { startDate: '202604', endDate: '202612' }, adminCookie);
  if (!ok(setPeriod.status === 200, `PS-setup version period 202604-202612 (got ${setPeriod.status})`)) return;

  const gen = await api('POST', '/api/projects', { name: '__test_ps_proj__', cgVersionId: vId, currency: 'EUR', startDate: '202604', endDate: '202612' }, adminCookie);
  const pId = gen.data?.id;
  if (pId) later('DELETE', `/api/projects/${pId}`);
  if (!ok(gen.status === 201 && !!pId, `PS-setup project with period 202604-202612 (got ${gen.status})`)) return;

  const put = (phases, period) => api('PUT', `${base}/structure`, period === undefined ? { phases } : { phases, period }, adminCookie);
  const titles = async () => ((await api('GET', `${base}/structure`, null, adminCookie)).data?.phases || [])
    .flatMap(p => p.tasks.map(t => t.title)).sort().join(',');
  const vPeriod = async () => {
    const v = ((await api('GET', `/api/cost-grids/${cgId}/versions`, null, adminCookie)).data || []).find(x => x.id === vId);
    return `${String(v?.start_date || '').trim()}|${String(v?.end_date || '').trim()}`;
  };
  const one = (title, s, e) => [{ title: 'P1', tasks: [{ title, taskStartDate: s, taskEndDate: e }] }];

  // PS-01: a widened period and a task that needs it, in one request
  const r1 = await put(one('Nov', '2026-11-02', '2026-11-06'), { startDate: '202606', endDate: '202701' });
  ok(r1.status === 200, `PS-01 structure with a task and the period that contains it → 200 (got ${r1.status}: ${r1.data?.error})`);
  ok(await vPeriod() === '202606|202701', 'PS-01 the version period was written');
  ok(await titles() === 'Nov', 'PS-01 the task was saved');

  // PS-02: the task is outside the new period: nothing is written
  const r2 = await put(one('May', '2026-05-04', '2026-05-08'), { startDate: '202606', endDate: '202612' });
  ok(isRule(r2), `PS-02 task outside the new period → 400 DATE_RULE (got ${r2.status})`);
  ok(await vPeriod() === '202606|202701', 'PS-02 the refused request left the version period unchanged');
  ok(await titles() === 'Nov', 'PS-02 the refused request left the tasks unchanged');

  // PS-03: without period the stored one still applies
  const r3 = await put(one('May', '2026-05-04', '2026-05-08'));
  ok(isRule(r3), `PS-03 structure without period and a task outside the stored period → 400 DATE_RULE (got ${r3.status})`);

  // PS-07: a task inverted and before the period start: the period wording wins over the order message
  const r7 = await put(one('Inverted', '2026-12-10', '2026-03-02'), { startDate: '202606', endDate: '202612' });
  ok(isRule(r7) && /before/.test(r7.data?.error || '') && /version period/.test(r7.data?.error || ''),
    `PS-07 inverted task before the period → 400 DATE_RULE with the period wording (got ${r7.status}: ${r7.data?.error})`);

  // PS-09: clearing the period lifts every limit
  const r9 = await put(one('Old', '2025-01-06', '2025-01-10'), { startDate: '', endDate: '' });
  ok(r9.status === 200, `PS-09 empty period with a task of any date → 200 (got ${r9.status}: ${r9.data?.error})`);
  ok(await vPeriod() === '|', 'PS-09 the version period is empty');

  // PS-12: a side left out keeps its stored value
  const r12s = await put(one('Nov', '2026-11-02', '2026-11-06'), { startDate: '202606', endDate: '202701' });
  ok(r12s.status === 200, `PS-12 setup: period 202606-202701 saved (got ${r12s.status})`);
  const r12 = await put([{ title: 'P1', tasks: [{ title: 'Nov' }] }], { endDate: '202703' });
  ok(r12.status === 200, `PS-12 period with only the end date → 200 (got ${r12.status}: ${r12.data?.error})`);
  ok(await vPeriod() === '202606|202703', 'PS-12 the start was kept and the end written');

  // ── project side: PUT /api/projects/:id/tasks carries the project period ──
  const pBase = `/api/projects/${pId}`;
  const pPut = (tasks, period) => api('PUT', `${pBase}/tasks`, period === undefined ? tasks : { tasks, period }, adminCookie);
  const pTitles = async () => ((await api('GET', `${pBase}/tasks`, null, adminCookie)).data || []).map(t => t.name).sort().join(',');
  const pPeriod = async () => {
    const p = ((await api('GET', '/api/projects', null, adminCookie)).data || []).find(x => x.id === pId);
    return `${String(p?.startDate || p?.start_date || '').trim()}|${String(p?.endDate || p?.end_date || '').trim()}`;
  };
  const pOne = (name, s, e) => [{ name, startDate: s, endDate: e }];

  // PS-04: a widened project period and a task that needs it, in one request
  const r4 = await pPut(pOne('Nov', '2026-11-02', '2026-11-06'), { startDate: '202606', endDate: '202701' });
  ok(r4.status === 200, `PS-04 project tasks with the period that contains them → 200 (got ${r4.status}: ${r4.data?.error})`);
  ok(await pPeriod() === '202606|202701', 'PS-04 the project period was written');
  ok(await pTitles() === 'Nov', 'PS-04 the project task was saved');

  // PS-05: final state invalid: nothing is written
  const r5 = await pPut(pOne('May', '2026-05-04', '2026-05-08'), { startDate: '202606', endDate: '202612' });
  ok(isRule(r5), `PS-05 project task outside the new period → 400 DATE_RULE (got ${r5.status})`);
  ok(await pPeriod() === '202606|202701', 'PS-05 the refused request left the project period unchanged');
  ok(await pTitles() === 'Nov', 'PS-05 the refused request left the project tasks unchanged');

  // PS-06: today's array body still works
  const r6 = await pPut(pOne('Dec', '2026-12-01', '2026-12-04'));
  ok(r6.status === 200, `PS-06 array body with an in-period task → 200 (got ${r6.status}: ${r6.data?.error})`);
  ok(await pTitles() === 'Dec', 'PS-06 the array body saved the task');

  // PS-08: inverted task outside the period: the period wording wins
  const r8 = await pPut(pOne('Inverted', '2026-12-10', '2026-03-02'), { startDate: '202606', endDate: '202612' });
  ok(isRule(r8) && /before/.test(r8.data?.error || '') && /project period/.test(r8.data?.error || ''),
    `PS-08 inverted project task before the period → 400 DATE_RULE with the period wording (got ${r8.status}: ${r8.data?.error})`);

  // PS-10: clearing the project period lifts every limit
  const r10 = await pPut(pOne('Old', '2025-01-06', '2025-01-10'), { startDate: '', endDate: '' });
  ok(r10.status === 200, `PS-10 empty project period with a task of any date → 200 (got ${r10.status}: ${r10.data?.error})`);
  ok(await pPeriod() === '|', 'PS-10 the project period is empty');
}

async function testProjectCurrencyLock() {
  section('Project currency lock');
  if (!sysadminCookie) { ok(false, 'PR-setup sysadmin account unavailable'); return; }

  const rpy = await api('POST', '/api/pipeline-years', { year: TEST_YEAR_C }, adminCookie);
  if (![201, 409].includes(rpy.status)) { ok(false, 'PR-setup pipeline year unavailable'); return; }
  if (rpy.status === 201 && rpy.data?.id) later('DELETE', `/api/pipeline-years/${rpy.data.id}`);

  // Registered first, so cleanup (reverse order) deletes the projects before the proposal.
  const rcg = await api('POST', '/api/cost-grids', { name: '__test_pr_cg__', pipelineYear: TEST_YEAR_C }, adminCookie);
  const cgId = rcg.data?.id;
  if (cgId) later('DELETE', `/api/cost-grids/${cgId}`);
  const mkVersion = async label => (cgId ? (await api('POST', `/api/cost-grids/${cgId}/versions`, { label }, adminCookie)).data?.id : null);
  const vId = await mkVersion('v1');     // will get a project
  const v2Id = await mkVersion('v2');    // stays without projects
  if (!ok(!!(cgId && vId && v2Id), 'PR-setup proposal with two versions created')) return;
  const verPath = id => `/api/cost-grids/${cgId}/versions/${id}`;

  // PR-01 / PR-02: a project without a proposal
  const direct = await api('POST', '/api/projects', { name: '__test_pr_direct__' }, adminCookie);
  ok(direct.status === 400 && direct.data?.error === 'Projects must be created from a proposal' && direct.data?.code === 'PROJECT_RULE',
    `PR-01 admin: project without a proposal → 400 with the PROJECT_RULE code (got ${direct.status})`);
  const directSys = await api('POST', '/api/projects', { name: '__test_pr_direct_sys__' }, sysadminCookie);
  ok(directSys.status === 201, `PR-02 sysadmin: project without a proposal → 201 (got ${directSys.status})`);
  const dId = directSys.data?.id;
  if (dId) later('DELETE', `/api/projects/${dId}`);

  // PR-03: what "Generate project" does (POST with cgVersionId, then POST linked-projects) is allowed for an admin
  const gen = await api('POST', '/api/projects', { name: '__test_pr_linked__', cgVersionId: vId, currency: 'EUR' }, adminCookie);
  ok(gen.status === 201, `PR-03 admin: project created with a proposal → 201 (got ${gen.status})`);
  const pId = gen.data?.id;
  if (pId) later('DELETE', `/api/projects/${pId}`);
  if (!pId) return;
  const lnk = await api('POST', `${verPath(vId)}/linked-projects`, { projectId: pId, taskIds: [], taskNames: [] }, adminCookie);
  ok(lnk.status === 201, `PR-03 admin: link the generated project → 201 (got ${lnk.status})`);

  // PR-04: project currency
  const curPatch = (cookie, currency) => api('PATCH', `/api/projects/${pId}`, { currency }, cookie);
  const c1 = await curPatch(adminCookie, 'USD');
  ok(c1.status === 400 && c1.data?.error === 'Currency cannot be changed: amounts are not converted yet',
    `PR-04 admin: change the project currency → 400 (got ${c1.status})`);
  ok((await curPatch(adminCookie, 'EUR')).status === 200, 'PR-04 admin: re-sending the same currency → 200');
  ok((await api('PATCH', `/api/projects/${pId}`, { currency: 'EUR', cgVersionId: vId, name: '__test_pr_linked__' }, adminCookie)).status === 200,
    'PR-04 admin: a whole-project re-save with unchanged currency and link → 200');
  ok((await curPatch(sysadminCookie, 'USD')).status === 200, 'PR-04 sysadmin: change the project currency → 200');
  ok((await curPatch(sysadminCookie, 'EUR')).status === 200, 'PR-04 sysadmin: restore it → 200');

  // PR-05: version currency
  const vc = (cookie, id, currency) => api('PATCH', verPath(id), { currency }, cookie);
  const v1 = await vc(adminCookie, vId, 'USD');
  ok(v1.status === 400 && v1.data?.error === 'Currency cannot be changed: projects are linked to this proposal',
    `PR-05 admin: change the currency of a version with projects → 400 (got ${v1.status})`);
  ok((await vc(adminCookie, vId, 'EUR')).status === 200, 'PR-05 admin: re-sending the same version currency → 200');
  ok((await vc(adminCookie, v2Id, 'USD')).status === 200, 'PR-05 admin: a version without projects can change currency → 200');
  ok((await vc(adminCookie, v2Id, 'EUR')).status === 200, 'PR-05 admin: restore it → 200');
  ok((await vc(sysadminCookie, vId, 'USD')).status === 200, 'PR-05 sysadmin: change the currency of a version with projects → 200');
  ok((await vc(sysadminCookie, vId, 'EUR')).status === 200, 'PR-05 sysadmin: restore it → 200');

  // PR-06: unlinking / re-pointing
  const lp = (cookie, cgVersionId) => api('PATCH', `/api/projects/${pId}`, { cgVersionId }, cookie);
  const u1 = await lp(adminCookie, null);
  ok(u1.status === 400 && u1.data?.error === 'Deleting a project or unlinking it from its proposal is temporarily disabled',
    `PR-06 admin: clearing cgVersionId → 400 (got ${u1.status})`);
  ok((await lp(adminCookie, '')).status === 400, 'PR-06 admin: empty cgVersionId → 400');
  ok((await lp(adminCookie, v2Id)).status === 400, 'PR-06 admin: pointing the project at another version → 400');
  ok((await lp(adminCookie, vId)).status === 200, 'PR-06 admin: re-sending the same cgVersionId → 200');
  ok((await lp(adminCookie, vId.toUpperCase())).status === 200, 'PR-06 admin: same id in another letter case → 200');
  ok((await lp(sysadminCookie, v2Id)).status === 200, 'PR-06 sysadmin: re-pointing → 200');
  ok((await lp(sysadminCookie, vId)).status === 200, 'PR-06 sysadmin: restore → 200');

  // PR-07: linking a project that has no proposal is still allowed
  if (dId) ok((await api('PATCH', `/api/projects/${dId}`, { cgVersionId: v2Id }, adminCookie)).status === 200,
    'PR-07 admin: linking an unlinked project to a version → 200');

  // PR-10..PR-13: a project and its version must share the currency at link time; an unknown version is refused
  const v3Id = await mkVersion('v3');   // no projects: an admin may set its currency
  ok((await vc(adminCookie, v3Id, 'USD')).status === 200, 'PR-10 setup: version v3 in USD');
  const NOVER = '00000000-0000-0000-0000-000000000001';
  const mism = await api('POST', '/api/projects', { name: '__test_pr_mismatch__', cgVersionId: v3Id, currency: 'EUR' }, adminCookie);
  ok(mism.status === 400 && mism.data?.error === 'The project and the proposal must have the same currency' && mism.data?.code === 'PROJECT_RULE',
    `PR-10 admin: POST a EUR project linked to a USD version → 400 (got ${mism.status})`);
  if (mism.data?.id) later('DELETE', `/api/projects/${mism.data.id}`);
  const match = await api('POST', '/api/projects', { name: '__test_pr_match__', cgVersionId: v3Id, currency: 'USD' }, adminCookie);
  ok(match.status === 201, `PR-10 admin: POST a USD project linked to the USD version → 201 (got ${match.status})`);
  const xId = match.data?.id;
  if (xId) later('DELETE', `/api/projects/${xId}`);
  const sysMism = await api('POST', '/api/projects', { name: '__test_pr_mismatch_sys__', cgVersionId: v3Id, currency: 'EUR' }, sysadminCookie);
  ok(sysMism.status === 201, `PR-10 sysadmin: the same mismatch is allowed → 201 (got ${sysMism.status})`);
  if (sysMism.data?.id) later('DELETE', `/api/projects/${sysMism.data.id}`);

  const nov = await api('POST', '/api/projects', { name: '__test_pr_nover__', cgVersionId: NOVER, currency: 'EUR' }, adminCookie);
  ok(nov.status === 400 && nov.data?.error === 'Proposal version not found', `PR-11 admin: POST with an unknown cgVersionId → 400 (got ${nov.status})`);
  const novSys = await api('POST', '/api/projects', { name: '__test_pr_nover_sys__', cgVersionId: NOVER }, sysadminCookie);
  ok(novSys.status === 400 && novSys.data?.error === 'Proposal version not found', `PR-11 sysadmin: an unknown version is refused too → 400 (got ${novSys.status})`);

  const d2 = await api('POST', '/api/projects', { name: '__test_pr_direct2__' }, sysadminCookie);
  const d2Id = d2.data?.id;
  if (d2Id) later('DELETE', `/api/projects/${d2Id}`);
  if (d2Id) {
    const pm = await api('PATCH', `/api/projects/${d2Id}`, { cgVersionId: v3Id }, adminCookie);
    ok(pm.status === 400 && pm.data?.error === 'The project and the proposal must have the same currency',
      `PR-12 admin: PATCH linking a EUR project to a USD version → 400 (got ${pm.status})`);
    const pn = await api('PATCH', `/api/projects/${d2Id}`, { cgVersionId: NOVER }, adminCookie);
    ok(pn.status === 400 && pn.data?.error === 'Proposal version not found', `PR-12 admin: PATCH linking to an unknown version → 400 (got ${pn.status})`);
    const lm = await api('POST', `${verPath(v3Id)}/linked-projects`, { projectId: d2Id, taskIds: [], taskNames: [] }, adminCookie);
    ok(lm.status === 400 && lm.data?.error === 'The project and the proposal must have the same currency',
      `PR-13 admin: POST linked-projects between a EUR project and a USD version → 400 (got ${lm.status})`);
    ok((await api('PATCH', `/api/projects/${d2Id}`, { cgVersionId: v3Id }, sysadminCookie)).status === 200,
      'PR-12 sysadmin: the same link is allowed → 200');
  }
  if (xId) ok((await api('POST', `${verPath(v3Id)}/linked-projects`, { projectId: xId, taskIds: [], taskNames: [] }, adminCookie)).status === 201,
    'PR-13 admin: POST linked-projects between a USD project and the USD version → 201');

  // PR-08: removals are refused for an admin
  const del = await api('DELETE', `/api/projects/${pId}`, null, adminCookie);
  ok(del.status === 400 && /temporarily disabled/.test(del.data?.error || ''), `PR-08 admin: DELETE project → 400 (got ${del.status})`);
  const unl = await api('DELETE', `${verPath(vId)}/linked-projects/${pId}`, null, adminCookie);
  ok(unl.status === 400, `PR-08 admin: DELETE linked-projects → 400 (got ${unl.status})`);
  const dv = await api('DELETE', verPath(vId), null, adminCookie);
  ok(dv.status === 400, `PR-08 admin: DELETE a version that has projects → 400 (got ${dv.status})`);
  const dg = await api('DELETE', `/api/cost-grids/${cgId}`, null, adminCookie);
  ok(dg.status === 400, `PR-08 admin: DELETE a proposal that has projects → 400 (got ${dg.status})`);

  // PR-09: the sysadmin may; deleting a project removes its link rows, so the version is free again
  ok((await api('DELETE', `${verPath(vId)}/linked-projects/${pId}`, null, sysadminCookie)).status === 200, 'PR-09 sysadmin: DELETE linked-projects → 200');
  ok((await api('DELETE', `/api/projects/${pId}`, null, sysadminCookie)).status === 200, 'PR-09 sysadmin: DELETE project → 200');
  if (dId) ok((await api('DELETE', `/api/projects/${dId}`, null, sysadminCookie)).status === 200, 'PR-09 sysadmin: DELETE the other project → 200');
  ok((await vc(adminCookie, vId, 'USD')).status === 200, 'PR-09 admin: with no project left the version currency can change again → 200');
  ok((await vc(adminCookie, vId, 'EUR')).status === 200, 'PR-09 admin: restore it → 200');
  ok((await api('DELETE', verPath(v2Id), null, adminCookie)).status === 200, 'PR-09 admin: a version without projects can be deleted → 200');
  ok((await api('DELETE', verPath(vId), null, adminCookie)).status === 200, 'PR-09 admin: so can the former project version → 200');

  // PR-14: concurrency smoke test. A currency change and a link to the same version, fired together, must
  // never leave a project and its version in different currencies (the per-version lock serialises them).
  // Either order is legal: the project is created and the change is refused, or the change wins and the link is refused.
  let violations = 0, rounds = 0;
  for (let i = 0; i < 6; i++) {
    const rv = await api('POST', `/api/cost-grids/${cgId}/versions`, { label: `race${i}` }, adminCookie);
    const rId = rv.data?.id;
    if (!rId) continue;
    rounds++;
    const [pa, pb] = await Promise.all([
      api('PATCH', verPath(rId), { currency: 'USD' }, adminCookie),
      api('POST', '/api/projects', { name: `__test_pr_race_${i}__`, cgVersionId: rId, currency: 'EUR' }, adminCookie),
    ]);
    if (pb.data?.id) later('DELETE', `/api/projects/${pb.data.id}`);
    const list = (await api('GET', `/api/cost-grids/${cgId}/versions`, null, adminCookie)).data || [];
    const cur = list.find(v => v.id === rId)?.currency;
    const consistent = pb.status === 201
      ? (cur === 'EUR' && pa.status === 400)
      : (pb.status === 400 && pa.status === 200 && cur === 'USD');
    if (!consistent) { violations++; process.stdout.write(`    race ${i}: PATCH ${pa.status}, POST ${pb.status}, version currency ${cur}\n`); }
  }
  ok(rounds > 0 && violations === 0, `PR-14 a currency change and a link fired together never diverge (${rounds} rounds, ${violations} violations)`);
}

// ── Version creation refused once a proposal has a published version (2026-10-07) ──

async function testVersionRule() {
  section('Version rule (no new version once published)');

  const rpy = await api('POST', '/api/pipeline-years', { year: TEST_YEAR_C }, adminCookie);
  if (![201, 409].includes(rpy.status)) { ok(false, 'VR-setup pipeline year unavailable'); return; }
  if (rpy.status === 201 && rpy.data?.id) later('DELETE', `/api/pipeline-years/${rpy.data.id}`);

  // Published proposal: create, add a version, publish it (stamps the current year).
  const g1 = await api('POST', '/api/cost-grids', { name: '__test_vr_published__', pipelineYear: TEST_YEAR_C }, adminCookie);
  const cg1Id = g1.data?.id;
  if (cg1Id) later('POST', `/api/admin/reset/cost-grid/${cg1Id}`);
  const v1 = cg1Id ? await api('POST', `/api/cost-grids/${cg1Id}/versions`, { label: 'v1' }, adminCookie) : null;
  const v1Id = v1?.data?.id;
  if (!(cg1Id && v1Id)) { ok(false, 'VR-setup published grid+version'); return; }
  const pub = await api('POST', `/api/cost-grids/${cg1Id}/versions/${v1Id}/publish`, null, adminCookie);
  ok(pub.status === 200, 'VR-setup publish → 200');

  // VR-01: admin cannot create a new version on a published proposal
  const vr01 = await api('POST', `/api/cost-grids/${cg1Id}/versions`, { label: 'v2' }, adminCookie);
  ok(vr01.status === 400 && vr01.data?.code === 'VERSION_RULE', 'VR-01 admin POST /versions on published proposal → 400 VERSION_RULE');

  // VR-02: admin cannot duplicate a version on a published proposal
  const vr02 = await api('POST', `/api/cost-grids/${cg1Id}/versions/${v1Id}/duplicate`, { label: 'v2' }, adminCookie);
  ok(vr02.status === 400 && vr02.data?.code === 'VERSION_RULE', 'VR-02 admin POST /duplicate on published proposal → 400 VERSION_RULE');

  // VR-02b: the same published state keeps an admin from deleting the proposal (message unchanged)
  const vr02b = await api('DELETE', `/api/cost-grids/${cg1Id}`, null, adminCookie);
  ok(vr02b.status === 400 && vr02b.data?.error === 'Cannot delete a proposal that has been published to the pipeline',
    `VR-02b admin DELETE of a published proposal → 400 (got ${vr02b.status})`);

  // VR-03: sysadmin is exempt
  const vr03 = await api('POST', `/api/cost-grids/${cg1Id}/versions`, { label: 'v9' }, sysadminCookie);
  ok(vr03.status === 201, 'VR-03 sysadmin POST /versions on published proposal → 201');

  // VR-04: a Draft-only proposal is unaffected
  const g2 = await api('POST', '/api/cost-grids', { name: '__test_vr_draft_only__', pipelineYear: TEST_YEAR_C }, adminCookie);
  const cg2Id = g2.data?.id;
  if (cg2Id) later('POST', `/api/admin/reset/cost-grid/${cg2Id}`);
  if (cg2Id) {
    const vr04 = await api('POST', `/api/cost-grids/${cg2Id}/versions`, { label: 'v2' }, adminCookie);
    ok(vr04.status === 201, 'VR-04 admin POST /versions on Draft-only proposal → 201');
  } else {
    ok(false, 'VR-04 setup: draft-only grid');
  }
}

// ── "New version" is a full copy of the source version (2026-10-01) ─────────────

async function testRateIsCustom() {
  section('Custom rate flag (f3)');
  const year = new Date().getFullYear();
  const A = await makeTestRole('RCA');
  const B = await makeTestRole('RCB');
  const rpy = await api('POST', '/api/pipeline-years', { year }, adminCookie);
  if (rpy.data?.id) later('DELETE', `/api/pipeline-years/${rpy.data.id}`);
  const g = await api('POST', '/api/cost-grids', { name: '__test_rc_cg__' }, adminCookie);
  const cgId = g.data?.id;
  if (cgId) later('POST', `/api/admin/reset/cost-grid/${cgId}`);
  const vId = cgId ? (await api('POST', `/api/cost-grids/${cgId}/versions`, { label: 'eur', currency: 'EUR' }, adminCookie)).data?.id : null;
  if (!A.id || !B.id || !vId) { fail('CF-setup: roles/proposal/version failed — skipping'); return; }

  const flags = async id => {
    const roles = (await api('GET', `/api/cost-grids/${cgId}/versions/${id}/structure`, null, adminCookie))
      .data?.phases?.[0]?.tasks?.[0]?.roles || [];
    return Object.fromEntries(roles.map(r => [r.code, r.rate_is_custom]));
  };
  const putHours = roles => api('PUT', `/api/cost-grids/${cgId}/versions/${vId}/structure`, {
    phases: [{ phaseName: 'P1', tasks: [{ taskName: 'T1', hours: { [A.code]: 2, [B.code]: 3 } }] }],
    roles,
  }, adminCookie);
  const rc01Body = [{ roleCode: A.code, rate: 150, rateIsCustom: true }, { roleCode: B.code, rate: 80, rateIsCustom: false }];

  const r1 = await putHours(rc01Body);
  const f1 = await flags(vId);
  ok(r1.status === 200 && f1[A.code] === true && f1[B.code] === false,
    `CF-01 hours PUT stores rate_is_custom true/false (got ${r1.status}, ${JSON.stringify(f1)})`);

  await putHours([{ roleCode: A.code, rate: 150, rateIsCustom: 'true' }, { roleCode: B.code, rate: 80, rateIsCustom: 1 }]);
  const f2a = await flags(vId);
  await putHours([{ roleCode: A.code, rate: 150 }, { roleCode: B.code, rate: 80 }]);
  const f2b = await flags(vId);
  ok(f2a[A.code] === false && f2a[B.code] === false && f2b[A.code] === false && f2b[B.code] === false,
    `CF-02 'true', 1 and an absent flag are stored false (got ${JSON.stringify(f2a)}, ${JSON.stringify(f2b)})`);

  await putHours(rc01Body);
  const d = await api('POST', `/api/cost-grids/${cgId}/versions/${vId}/duplicate`, { label: 'copy' }, adminCookie);
  const f3 = d.data?.id ? await flags(d.data.id) : {};
  ok(d.status === 201 && f3[A.code] === true && f3[B.code] === false,
    `CF-03 "+ New version" copies rate_is_custom (got ${d.status}, ${JSON.stringify(f3)})`);

  const r4 = await api('PUT', `/api/cost-grids/${cgId}/versions/${vId}/structure`, {
    phases: [{ title: 'P1', tasks: [{ title: 'T1', roles: [
      { roleId: A.id, days: 2, rateOverride: 90, rateIsCustom: true },
      { roleId: B.id, days: 1 },
    ] }] }],
  }, adminCookie);
  const f4 = await flags(vId);
  ok(r4.status === 200 && f4[A.code] === true && f4[B.code] === false,
    `CF-04 array-shape PUT stores rate_is_custom true/false (got ${r4.status}, ${JSON.stringify(f4)})`);
}

async function testVersionDuplicate() {
  section('Version duplicate (full copy)');

  const rpy = await api('POST', '/api/pipeline-years', { year: TEST_YEAR_C }, adminCookie);
  if (![201, 409].includes(rpy.status)) { ok(false, 'ND-setup pipeline year unavailable'); return; }
  if (rpy.status === 201 && rpy.data?.id) later('DELETE', `/api/pipeline-years/${rpy.data.id}`);

  const role = await makeTestRole('ND');
  const g = await api('POST', '/api/cost-grids', { name: '__test_nd__', pipelineYear: TEST_YEAR_C }, adminCookie);
  const cgId = g.data?.id;
  if (cgId) later('DELETE', `/api/cost-grids/${cgId}`);
  const v = cgId ? await api('POST', `/api/cost-grids/${cgId}/versions`,
    { label: 'v1', currency: 'EUR', note: 'source note', projectName: 'Source project', startDate: '202601', endDate: '202612' }, adminCookie) : null;
  const srcId = v?.data?.id;
  if (!(cgId && srcId && role.id)) { ok(false, 'ND-setup grid, version and role'); return; }

  // Source content: 1 phase, 2 tasks, one with a custom rate override
  const put = await api('PUT', `/api/cost-grids/${cgId}/versions/${srcId}/structure`, {
    phases: [{ title: 'Phase A', tasks: [
      { title: 'Task 1', description: 'first', start_date: '2026-02-01', end_date: '2026-03-15', ptc: 123.5,
        roles: [{ roleId: role.id, days: 10.5, rateOverride: 77 }] },
      { title: 'Task 2', ptc: 0, roles: [{ roleId: role.id, days: 4 }] },
    ] }],
  }, adminCookie);
  ok(put.status === 200, 'ND-setup source structure saved');

  const list = await api('GET', '/api/attribute-lists', null, adminCookie);
  const marketList = (list.data || []).find(l => l.slug === 'market') || (list.data || [])[0];
  let itemId = null;
  if (marketList) {
    const ri = await api('POST', `/api/attribute-lists/${marketList.id}/items`, { label: `__test_nd_item_${Date.now()}__` }, adminCookie);
    itemId = ri.data?.id;
  }
  if (itemId) await api('PUT', `/api/cost-grids/${cgId}/versions/${srcId}/tags`, { itemIds: [itemId] }, adminCookie);

  // Give the source a non-EUR currency, so its rate snapshot is not 1
  await api('PATCH', `/api/cost-grids/${cgId}/versions/${srcId}`, { currency: 'USD' }, adminCookie);

  const srcStructBefore = (await api('GET', `/api/cost-grids/${cgId}/versions/${srcId}/structure`, null, adminCookie)).data;

  // ND-01: label is required
  const r0 = await api('POST', `/api/cost-grids/${cgId}/versions/${srcId}/duplicate`, null, adminCookie);
  ok(r0.status === 400, `ND-01 duplicate without a label → 400 (got ${r0.status})`);
  const r0b = await api('POST', `/api/cost-grids/${cgId}/versions/${srcId}/duplicate`, { label: '   ' }, adminCookie);
  ok(r0b.status === 400, `ND-01 duplicate with a blank label → 400 (got ${r0b.status})`);
  const countAfter400 = (await api('GET', `/api/cost-grids/${cgId}/versions`, null, adminCookie)).data?.length;
  ok(countAfter400 === 1, 'ND-01 a refused duplicate left no version behind');

  // ND-02: full copy
  const r = await api('POST', `/api/cost-grids/${cgId}/versions/${srcId}/duplicate`, { label: ' v2 ' }, adminCookie);
  ok(r.status === 201 && !!r.data?.id && r.data.id !== srcId, 'ND-02 duplicate with a label → 201 and a new id');
  const newId = r.data?.id;
  if (!newId) return;

  const versions = (await api('GET', `/api/cost-grids/${cgId}/versions`, null, adminCookie)).data || [];
  const nv = versions.find(x => x.id === newId);
  ok(nv && nv.label === 'v2', 'ND-02 new version has the trimmed label');
  ok(nv && nv.pipeline === 'Draft' && !nv.pipeline_year && nv.locked === false, 'ND-03 new version is a Draft, no pipeline year, unlocked');
  ok(nv && nv.project_name === 'Source project' && nv.note === 'source note' && nv.currency === 'USD'
     && nv.start_date === '202601' && nv.end_date === '202612', 'ND-04 header info copied (project name, note, currency, dates)');
  const budgets = (await api('GET', '/api/cost-grids/budgets', null, adminCookie)).data || {};
  ok(budgets[newId] && Math.abs(budgets[newId].currencyRate - testRates.USD) < 1e-6, 'ND-05 the exchange-rate snapshot of the source is inherited');

  const st = (await api('GET', `/api/cost-grids/${cgId}/versions/${newId}/structure`, null, adminCookie)).data;
  const ph = st?.phases?.[0];
  ok(st?.phases?.length === 1 && ph.title === 'Phase A' && ph.tasks.length === 2, 'ND-06 phases and tasks copied');
  const t1 = ph?.tasks?.[0];
  ok(t1 && t1.title === 'Task 1' && t1.description === 'first' && t1.start_date === '2026-02-01'
     && t1.end_date === '2026-03-15' && t1.ptc === 123.5, 'ND-07 task title, description, dates and PTC copied');
  const r1 = t1?.roles?.[0];
  ok(r1 && r1.role_id === role.id && parseFloat(r1.days) === 10.5 && parseFloat(r1.rate_override) === 77, 'ND-08 role hours and custom rate copied');
  const r2 = ph?.tasks?.[1]?.roles?.[0];
  ok(r2 && parseFloat(r2.days) === 4, 'ND-08 second task role hours copied');
  const newTaskIds = ph.tasks.map(t => t.id);
  const srcTaskIds = srcStructBefore.phases[0].tasks.map(t => t.id);
  ok(newTaskIds.every(id => !srcTaskIds.includes(id)), 'ND-09 the copy has fresh task ids');

  if (itemId) {
    const tg = (await api('GET', `/api/cost-grids/${cgId}/versions/${newId}/tags`, null, adminCookie)).data || [];
    ok(tg.some(t => t.item_id === itemId), 'ND-10 tags copied');
  }

  // ND-11: source untouched
  const srcStructAfter = (await api('GET', `/api/cost-grids/${cgId}/versions/${srcId}/structure`, null, adminCookie)).data;
  ok(JSON.stringify(srcStructAfter) === JSON.stringify(srcStructBefore), 'ND-11 the source structure is unchanged');
  const srcAfter = versions.find(x => x.id === srcId);
  ok(srcAfter && srcAfter.label === 'v1', 'ND-11 the source label is unchanged');
}

async function testPipelineYearDraft() {
  section('Pipeline year on the Draft');

  const mkYear = async (year, active) => {
    const r = await api('POST', '/api/pipeline-years', { year }, adminCookie);
    if (![201, 409].includes(r.status)) return false;
    // 409: left over by an earlier run — reuse it, but force the wanted state and clean it up too.
    let id = r.data?.id;
    if (r.status === 409) {
      const list = await api('GET', '/api/pipeline-years', null, adminCookie);
      id = (Array.isArray(list.data) ? list.data : []).find(py => py.year === year)?.id;
    }
    if (!id) return false;
    later('DELETE', `/api/pipeline-years/${id}`);
    const p = await api('PATCH', `/api/pipeline-years/${id}`, { active }, adminCookie);
    return p.status === 200;
  };
  if (!(await mkYear(TEST_YEAR_D, true)) || !(await mkYear(TEST_YEAR_E, false))) { ok(false, 'PYP-setup pipeline years unavailable'); return; }

  const role = await makeTestRole('PYP');
  const mkGrid = async () => {
    const g = await api('POST', '/api/cost-grids', { name: '__test_pyp__' }, adminCookie);
    // Published proposals cannot be deleted with DELETE; the sysadmin reset removes any of them.
    if (g.data?.id) later('POST', `/api/admin/reset/cost-grid/${g.data.id}`);
    return g.data?.id;
  };
  const mkDraft = async (cgId, extra = {}) => {
    const v = await api('POST', `/api/cost-grids/${cgId}/versions`,
      { label: 'v1', currency: 'EUR', startDate: `${TEST_YEAR_D}01`, endDate: `${TEST_YEAR_D}12`, ...extra }, adminCookie);
    return v;
  };
  const cgId = await mkGrid();
  if (!cgId || !role.id) { ok(false, 'PYP-setup grid and role'); return; }
  const thisYear = new Date().getFullYear();

  // PYP-01: the year is stored on the Draft; absent means none
  const withYear = await mkDraft(cgId, { pipelineYear: TEST_YEAR_D });
  ok(withYear.status === 201 && withYear.data?.pipeline === 'Draft' && withYear.data?.pipeline_year === TEST_YEAR_D,
    `PYP-01 Draft created with pipelineYear keeps it (got ${withYear.status}, ${withYear.data?.pipeline_year})`);
  const cg2 = await mkGrid();
  const noYear = await mkDraft(cg2);
  ok(noYear.status === 201 && noYear.data?.pipeline_year == null, 'PYP-01 Draft created without pipelineYear has none');

  // PYP-02: a bad, unknown or inactive year is refused and nothing is created
  const countVersions = async id => ((await api('GET', `/api/cost-grids/${id}/versions`, null, adminCookie)).data || []).length;
  const cg3 = await mkGrid();
  for (const [label, py] of [['not an integer', 'abc'], ['unknown', 2091], ['inactive', TEST_YEAR_E]]) {
    const r = await mkDraft(cg3, { pipelineYear: py });
    ok(r.status === 400 && !!r.data?.error, `PYP-02 pipelineYear ${label} → 400 (got ${r.status})`);
  }
  ok(await countVersions(cg3) === 0, 'PYP-02 refused creations left no version behind');

  // PYP-03: publish keeps the Draft's year
  const pub = await api('POST', `/api/cost-grids/${cgId}/versions/${withYear.data.id}/publish`, null, adminCookie);
  ok(pub.status === 200 && pub.data?.pipeline === 'SIP' && pub.data?.pipeline_year === TEST_YEAR_D && TEST_YEAR_D !== thisYear,
    `PYP-03 publish keeps the Draft's year (got ${pub.data?.pipeline_year})`);

  // PYP-04: a Draft with no year is published in the current year
  const pub0 = await api('POST', `/api/cost-grids/${cg2}/versions/${noYear.data.id}/publish`, null, adminCookie);
  ok(pub0.status === 200 && pub0.data?.pipeline_year === thisYear, `PYP-04 publish without a Draft year uses the current year (got ${pub0.data?.pipeline_year})`);

  // PYP-05: duplicate copies the year from a Draft only
  const cg4 = await mkGrid();
  const d1 = await mkDraft(cg4, { pipelineYear: TEST_YEAR_D });
  const dup1 = await api('POST', `/api/cost-grids/${cg4}/versions/${d1.data?.id}/duplicate`, { label: 'v2' }, adminCookie);
  ok(dup1.status === 201, `PYP-05 duplicate of a Draft with a year → 201 (got ${dup1.status})`);
  const vs4 = (await api('GET', `/api/cost-grids/${cg4}/versions`, null, adminCookie)).data || [];
  ok(vs4.find(x => x.id === dup1.data?.id)?.pipeline_year === TEST_YEAR_D, 'PYP-05 duplicate of a Draft copies its year');
  const cg5 = await mkGrid();
  const d2 = await mkDraft(cg5);
  const dup2 = await api('POST', `/api/cost-grids/${cg5}/versions/${d2.data?.id}/duplicate`, { label: 'v2' }, adminCookie);
  const vs5 = (await api('GET', `/api/cost-grids/${cg5}/versions`, null, adminCookie)).data || [];
  ok(dup2.status === 201 && vs5.find(x => x.id === dup2.data?.id)?.pipeline_year == null, 'PYP-05 duplicate of a Draft without a year has none');

  // PYP-06: the monthly phasing report does not count a Draft that carries a year
  const cg6 = await mkGrid();
  const d6 = await mkDraft(cg6, { pipelineYear: TEST_YEAR_D });
  const vId6 = d6.data?.id;
  const put = vId6 ? await api('PUT', `/api/cost-grids/${cg6}/versions/${vId6}/structure`, {
    phases: [{ title: 'Phase A', tasks: [{ title: 'Task 1', roles: [{ roleId: role.id, days: 12 }] }] }],
  }, adminCookie) : null;
  ok(put?.status === 200, 'PYP-06 setup: Draft structure saved');
  const rep = async () => ((await api('GET', `/api/reporting/phasing?year=${TEST_YEAR_D}`, null, adminCookie)).data?.projects || []).map(p => p.versionId);
  ok(!(await rep()).includes(vId6), 'PYP-06 a Draft with a year is not in the phasing report');
  await api('POST', `/api/cost-grids/${cg6}/versions/${vId6}/publish`, null, adminCookie);
  ok((await rep()).includes(vId6), 'PYP-06 once published, the same version is in the report');
}

// ── Mail failures (B-416, B-432) ──────────────────────────────────────────────
// The stack's mail goes to Mailpit (scripts/run-tests.sh override); its chaos API makes SMTP refuse
// every recipient, so each route answers as if the mail server were down.

async function mailpit(method, path, body) {
  try {
    const res = await fetch(`${process.env.MAILPIT_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    let data; try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data };
  } catch (e) {
    fail(`FETCH ERROR ${method} MAILPIT ${path}: ${e.message}`);
    return { status: 0, data: null };
  }
}

const chaos = on => mailpit('PUT', '/api/v1/chaos', { Recipient: { ErrorCode: 451, Probability: on ? 100 : 0 } });

async function testMailFailures() {
  section('Mail failures');
  if (!process.env.MAILPIT_URL) { fail('MAILPIT_URL unset — the stack does not send mail to Mailpit'); return; }
  if (!sysadminCookie) { ok(false, 'MAIL-setup sysadmin account unavailable'); return; }

  // MAIL-01: an export reaches Mailpit, addressed to the admin
  await mailpit('DELETE', '/api/v1/messages');
  const ex = await api('POST', '/api/exports/portfolio', null, adminCookie);
  const box = (await mailpit('GET', '/api/v1/messages')).data?.messages || [];
  ok(ex.status === 200 && box.some(m => m.To?.[0]?.Address === EMAIL),
    `MAIL-01 an export is delivered to Mailpit for ${EMAIL} (got ${ex.status}, ${box.length} message(s))`);

  // Fixtures, registered so that cleanup (reverse order) removes the project, then the proposal, then the program.
  const target = await makeTsUser('mail');
  const prgId = `__test_mail_prg_${Date.now()}`;
  const prg = await api('POST', '/api/programs', { id: prgId, name: '__test_mail_program__' }, sysadminCookie);
  if (prg.status === 201) later('DELETE', `/api/programs/${prgId}`);
  const cg = await api('POST', '/api/cost-grids', { name: '__test_mail_cg__' }, sysadminCookie);
  const cgId = cg.data?.id;
  if (cgId) later('POST', `/api/admin/reset/cost-grid/${cgId}`);
  const vId = cgId ? (await api('POST', `/api/cost-grids/${cgId}/versions`, { label: 'v1' }, sysadminCookie)).data?.id : null;
  const proj = vId ? await api('POST', '/api/projects',
    { name: '__test_mail_project__', cgVersionId: vId, currency: 'EUR', programId: prgId }, sysadminCookie) : null;
  const pId = proj?.data?.id;
  if (pId) later('DELETE', `/api/projects/${pId}`);
  if (!ok(!!(target && prg.status === 201 && cgId && vId && pId), 'MAIL-setup user, program, proposal and project created')) return;

  const shareRow = async (type, id) =>
    ((await sql('SELECT 1 FROM resource_shares WHERE resource_type = $1 AND resource_id = $2 AND user_id = $3',
      [type, id, target.id])) || []).length === 1;
  const inviteEmail = `__test_mail_inv_${Date.now()}@pdash.local`;

  const on = await chaos(true);
  try {
    if (!ok(on.status === 200, `MAIL-setup Mailpit chaos on (got ${on.status})`)) return;

    const s1 = await api('POST', `/api/cost-grids/${cgId}/shares`, { userId: target.id, permission: 'viewer' }, sysadminCookie);
    ok(s1.status === 201 && s1.data?.emailSent === false && await shareRow('cost_grid', cgId),
      `MAIL-02 cost grid share with the mail refused → 201, emailSent false, share stored (got ${s1.status}, ${JSON.stringify(s1.data)})`);

    const s2 = await api('POST', `/api/projects/${pId}/shares`, { userId: target.id, permission: 'viewer' }, sysadminCookie);
    ok(s2.status === 201 && s2.data?.emailSent === false && await shareRow('project', pId),
      `MAIL-03 project share with the mail refused → 201, emailSent false, share stored (got ${s2.status}, ${JSON.stringify(s2.data)})`);

    const s3 = await api('POST', `/api/programs/${prgId}/share`, { userId: target.id, permission: 'editor' }, sysadminCookie);
    ok(s3.status === 201 && s3.data?.emailSent === false,
      `MAIL-04 program share with the mail refused → 201, emailSent false (got ${s3.status}, ${JSON.stringify(s3.data)})`);

    const inv = await api('POST', '/api/auth/invite',
      { email: inviteEmail, firstName: 'Mail', lastName: 'Refused', role: 'user' }, adminCookie);
    const invId = inv.data?.id;
    if (invId) later('DELETE', `/api/users/${invId}`);
    const pending = invId ? await sql(`SELECT 1 FROM users WHERE id = $1 AND status = 'pending'`, [invId]) : null;
    ok(inv.status === 201 && inv.data?.emailSent === false && pending?.length === 1,
      `MAIL-05 invite with the mail refused → 201, emailSent false, pending user stored (got ${inv.status}, ${JSON.stringify(inv.data)})`);

    const re = invId ? await api('POST', `/api/auth/${invId}/resend-invite`, null, adminCookie) : { status: 0, data: null };
    ok(re.status === 502 && re.data?.code === 'SEND_FAILED',
      `MAIL-06 resend invite with the mail refused → 502 SEND_FAILED (got ${re.status}, ${JSON.stringify(re.data)})`);

    const ex2 = await api('POST', '/api/exports/portfolio', null, adminCookie);
    ok(ex2.status === 502 && ex2.data?.code === 'SEND_FAILED',
      `MAIL-07 export with the mail refused → 502 SEND_FAILED (got ${ex2.status}, ${JSON.stringify(ex2.data)})`);

    const fp = await api('POST', '/api/auth/forgot-password', { email: EMAIL });
    ok(fp.status === 200, `MAIL-08 forgot-password with the mail refused → 200 (got ${fp.status})`);
  } finally {
    const off = await chaos(false);
    ok(off.status === 200, `MAIL-setup Mailpit chaos off (got ${off.status})`);
  }
}

async function main() {
  process.stdout.write(`\n${bold('PDash API Integration Tests')} — ${BASE}\n`);
  process.stdout.write(`Admin: ${EMAIL}\n`);
  process.stdout.write(`Sysadmin: ${SYSADMIN_EMAIL}\n`);

  try {
    const authed = await testAuth();
    if (!authed) {
      process.stdout.write(red('\nLogin failed — cannot continue. Run create-admin.js first.\n'));
      process.exit(1);
    }
    await testTwoStep();
    await testTwoStepRevocation();
    await testSessionRevocation();
    await testSseRevocation();
    await testProfile();
    await ensureTestCurrencies();
    await testSecurity();
    await testPipelineYears();
    await testClients();
    await testClientGroups();
    await testRoles();
    await testRatecards();
    await testServerValidation();
    await testPots();
    await testCostGridBudgets();
    await testUsers();
    await testPrograms();
    await testAdminResetProposal();
    await testAdminChangeOwner();
    await testCostGridReassignOwner();
    await testResourcesAndAttributeLists();
    await testResourceMatching();
    await testProfileEngine();
    await testProfileEngineHooks();
    await testProfileJobsConsole();
    await testTagLinking();
    await testVersionScope();
    await testVersionRule();
    await testVersionDuplicate();
    await testPipelineYearDraft();
    await testProjectPatchValidation();
    await testProjectCurrencyLock();
    await testStructureRule();
    await testDateRule();
    await testTaskPeriod();
    await testDateRulesC3();
    await testPeriodWithTasks();
    await testMoneyRules();
    await testRateIsCustom();
    await testTimesheetsNoActuals();
    await testProjectDescriptions();
    await testTopicsApi();
    await testTopicExtraction();
    await testPlanningModel();
    await testPlanningAssistant();
    await testMailFailures();
  } catch (e) {
    process.stdout.write(red(`\nUnexpected error: ${e.message}\n`));
    console.error(e.stack);
    failed++;
  } finally {
    await runCleanup();
  }

  const total = passed + failed;
  process.stdout.write(`\n${'─'.repeat(44)}\n`);
  if (failed === 0) {
    process.stdout.write(`${bold('Results:')} ${green(`${passed}/${total} passed — all passed ✓`)}\n\n`);
  } else {
    process.stdout.write(`${bold('Results:')} ${passed}/${total} passed ${red(`— ${failed} failed ✗`)}\n\n`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

main();
