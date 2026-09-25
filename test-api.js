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

const BASE  = process.env.API_URL             || 'http://api:3000';
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
    const r = await api(method, path, null, adminCookie);
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

    const rproj = await api('POST', '/api/projects', { name: '__test_reassign_proj__' }, adminCookie);
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
    const rDup = await api('POST', `/api/cost-grids/${cgId}/versions/${vId}/duplicate`, null, adminCookie);
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
  const rProj = await api('POST', '/api/projects', { name: '__test_tag_proj__' }, adminCookie);
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
    const rEmptyProj = await api('POST', '/api/projects', { name: '__test_tag_link_later_proj__' }, adminCookie);
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
    const rRace = await api('POST', '/api/projects', { name: '__test_tag_race_proj__' }, adminCookie);
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

  const rProj = await api('POST', '/api/projects', { name: `__test_match_proj_${ts}__`, code }, adminCookie);
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
    const r = await api('POST', '/api/projects', { name: `__prof_proj_${code}__`, code }, adminCookie);
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

// ── Main ──────────────────────────────────────────────────────────────────────

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
    await testTagLinking();
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
