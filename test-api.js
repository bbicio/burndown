#!/usr/bin/env node
/**
 * PDash API Integration Tests
 *
 * Usage:
 *   docker compose --profile test run --rm test
 *
 * Environment (set in docker-compose.yml):
 *   API_URL             default: http://api:3000
 *   TEST_ADMIN_EMAIL    default: test-admin@pdash.local
 *   TEST_ADMIN_PASSWORD default: TestAdmin123!
 */
'use strict';

const BASE  = process.env.API_URL             || 'http://api:3000';
const EMAIL = process.env.TEST_ADMIN_EMAIL    || 'test-admin@pdash.local';
const PASS  = process.env.TEST_ADMIN_PASSWORD || 'TestAdmin123!';

// Far-future years unlikely to clash with real data
const TEST_YEAR   = 2099;
const TEST_YEAR_B = 2098;   // used by POT tests (avoids clash with pipeline-years tests)

let passed = 0, failed = 0;
let adminCookie = '';
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
  const r4 = await api('PATCH', `/api/pots/${potId}`, { amount: 200000 }, adminCookie);
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

  // Unknown UUID → 404
  ok((await api('POST', `/api/admin/reset/cost-grid/${FAKE_UUID}`, null, adminCookie)).status === 404,
    'DR-11 POST /api/admin/reset/cost-grid with unknown UUID → 404');

  // Delete the real cost grid
  if (cgId) {
    const rdel = await api('POST', `/api/admin/reset/cost-grid/${cgId}`, null, adminCookie);
    ok(rdel.status === 200, 'DR-10 POST /api/admin/reset/cost-grid/:cgId → 200');
    ok(rdel.data?.ok === true, 'DR-10 response.ok is true');
    // Verify it is gone
    const rcheck = await api('POST', `/api/admin/reset/cost-grid/${cgId}`, null, adminCookie);
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

  // Missing ownerId → 400
  if (cgId) {
    ok((await api('PATCH', `/api/admin/reset/cost-grid/${cgId}/owner`, {}, adminCookie)).status === 400,
      'DR-14 PATCH with missing ownerId → 400');
  }

  // Unknown cgId → 404
  ok((await api('PATCH', `/api/admin/reset/cost-grid/${FAKE_UUID}/owner`,
    { ownerId: adminId || FAKE_UUID }, adminCookie)).status === 404,
    'DR-15 PATCH with unknown cgId → 404');

  // Unknown ownerId → 404
  if (cgId) {
    ok((await api('PATCH', `/api/admin/reset/cost-grid/${cgId}/owner`,
      { ownerId: FAKE_UUID }, adminCookie)).status === 404,
      'DR-15 PATCH with unknown ownerId → 404');
  }

  // Valid reassignment → 200
  if (cgId && adminId) {
    const r = await api('PATCH', `/api/admin/reset/cost-grid/${cgId}/owner`,
      { ownerId: adminId }, adminCookie);
    ok(r.status === 200, 'DR-14 PATCH /api/admin/reset/cost-grid/:cgId/owner → 200');
    ok(r.data?.ok === true, 'DR-14 response.ok is true');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  process.stdout.write(`\n${bold('PDash API Integration Tests')} — ${BASE}\n`);
  process.stdout.write(`Admin: ${EMAIL}\n`);

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
    await testAdminResetProposal();
    await testAdminChangeOwner();
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
