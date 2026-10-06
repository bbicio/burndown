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

  const r1 = await api('POST', '/api/auth/login', { email: EMAIL, password: PASS });
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

  // Sysadmin test account — needed for admin/reset/* (sysadmin-exclusive).
  const r2 = await api('POST', '/api/auth/login', { email: SYSADMIN_EMAIL, password: SYSADMIN_PASS });
  if (!ok(r2.status === 200, 'A-06 sysadmin login → 200')) return false;
  sysadminCookie = extractCookie(r2.headers);
  ok(!!sysadminCookie, 'A-06 sysadmin JWT cookie is set');
  const sysMe = await api('GET', '/api/auth/me', null, sysadminCookie);
  ok(sysMe.data?.role === 'sysadmin', 'A-06 sysadmin role = sysadmin');

  return true;
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

  const me = await api('GET', '/api/auth/me', null, adminCookie);
  const plain = await getPlainUserCookie();
  const base = { admin: await offersFor(adminCookie, offYear), plain: await offersFor(plain, offYear) };

  // Fixtures are owned by the sysadmin so the (demoted) test admin is neither owner nor shared.
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
    { userId: me.data?.id, permission: 'viewer' }, sysadminCookie);
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

  // Create global ratecard
  const rcName = `__test_rc_${Date.now()}__`;
  const r2 = await api('POST', '/api/ratecards', { name: rcName, clientId: null }, adminCookie);
  ok(r2.status === 201, 'RC-02 POST create global ratecard → 201');
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
    if (rcPerClientId) later('DELETE', `/api/ratecards/${rcPerClientId}`);

    // Update entries (PATCH /api/ratecards/:id/entries) — core of Costgrid modal save
    if (rcPerClientId && roles.length) {
      const entries = [{ roleId: roles[0].id, hourlyRate: 150 }];
      const r5 = await api('PATCH', `/api/ratecards/${rcPerClientId}/entries`, entries, adminCookie);
      ok(r5.status === 200, 'RC-05 PATCH /ratecards/:id/entries → 200');

      // Verify the entry is persisted
      const r6 = await api('GET', `/api/ratecards/${rcPerClientId}`, null, adminCookie);
      ok(
        Array.isArray(r6.data?.entries) && r6.data.entries.some(e =>
          String(e.roleId || e.role_id) === String(roles[0].id) &&
          Number(e.hourlyRate || e.hourly_rate) === 150
        ),
        'RC-05 entry persisted with correct rate'
      );

      // Clear entries (empty array = fall back to agency default)
      const r7 = await api('PATCH', `/api/ratecards/${rcPerClientId}/entries`, [], adminCookie);
      ok(r7.status === 200, 'RC-06 PATCH entries with empty array → 200 (clear all custom rates)');
    } else if (rcPerClientId) {
      ok(true, 'RC-05 skipped — no roles configured in system');
      ok(true, 'RC-05 entry persisted with correct rate — skipped');
      ok(true, 'RC-06 PATCH entries with empty array — skipped');
    }
  }
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
// emailed token, so the sysadmin demotes the test admin to 'user', we log in (JWT role = user) and
// the admin is promoted back at once. requireAdmin trusts the JWT role claim, so the existing
// adminCookie keeps working throughout; the run-tests.sh stack is disposable.
async function getPlainUserCookie() {
  const me = await api('GET', '/api/auth/me', null, adminCookie);
  const adminId = me.data?.id;
  if (!adminId || !sysadminCookie) return '';
  let cookie = '';
  try {
    const down = await api('PATCH', `/api/users/${adminId}`, { role: 'user' }, sysadminCookie);
    if (down.status !== 200) return '';
    const login = await api('POST', '/api/auth/login', { email: EMAIL, password: PASS });
    cookie = login.status === 200 && login.data?.role === 'user' ? extractCookie(login.headers) : '';
  } finally {
    const back = await api('PATCH', `/api/users/${adminId}`, { role: 'admin' }, sysadminCookie);
    ok(back.status === 200 && back.data?.role === 'admin', 'PJ-setup the test admin is restored to role admin');
  }
  return cookie;
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
  // The plain user is the demoted test admin (getPlainUserCookie); the project the
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

  const mkProject = async (code, name, tasks) => {
    const r = await api('POST', '/api/projects', { name, code, startDate: '209901', endDate: '209903' }, sysadminCookie);
    const id = r.data?.id;
    if (id) { later('DELETE', `/api/projects/${id}`); await api('PUT', `/api/projects/${id}/tasks`, tasks, adminCookie); }
    return id;
  };
  const task = (name, sold, dates = ['20990105', '20990329']) => [{ name, startDate: dates[0], endDate: dates[1], resources: [{ role: role.code, soldHours: sold }] }];
  const csv = rows => ['projectId,date,task,role,owner,hours', ...rows.map(([c, d, t, h]) => `${c},${d},${t},${role.code},${person},${h}`)].join('\n');

  const histCode = `TPAH${ts}`, targetCode = `TPAT${ts}`, loadCode = `TPAL${ts}`;
  // the history project ended long ago: it feeds the profile but must not add planned load in 2099
  const hist = await mkProject(histCode, `__pa_hist_${ts}__`, task('Data analysis', 100, ['20980105', '20980630']));
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

  // Give the source a frozen rate snapshot different from the live one
  await api('PATCH', `/api/cost-grids/${cgId}/versions/${srcId}`, { currencyRate: 1.2345 }, adminCookie);

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
  ok(nv && nv.project_name === 'Source project' && nv.note === 'source note' && nv.currency === 'EUR'
     && nv.start_date === '202601' && nv.end_date === '202612', 'ND-04 header info copied (project name, note, currency, dates)');
  const budgets = (await api('GET', '/api/cost-grids/budgets', null, adminCookie)).data || {};
  ok(budgets[newId] && Math.abs(budgets[newId].currencyRate - 1.2345) < 1e-6, 'ND-05 the exchange-rate snapshot of the source is inherited');

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
    await testSecurity();
    await testPipelineYears();
    await testClients();
    await testClientGroups();
    await testRoles();
    await testRatecards();
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
    await testProjectPatchValidation();
    await testProjectCurrencyLock();
    await testTimesheetsNoActuals();
    await testProjectDescriptions();
    await testTopicsApi();
    await testTopicExtraction();
    await testPlanningModel();
    await testPlanningAssistant();
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
