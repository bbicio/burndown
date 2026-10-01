# Project currency lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop a project and the proposal it was generated from from diverging in currency, by locking the currency menus and making the API refuse (except for a sysadmin) every change that creates, unlinks, deletes or re-currencies projects and linked proposals.

**Architecture:** One pure rules module on the server (`api/src/lib/project-rules.js`, `node:test`) called from the project and cost-grid routes after the existing 404/403 checks, with a live (DB-read) sysadmin exception and `400` + message refusals. A twin module in the browser (`js/lib/project-rules.js`, vitest) drives the three UI changes (cost-grid menu, project-config menu + redirect, portfolio button). `test-api.js` gets a new section and the existing tests that create or delete projects move to the sysadmin account.

**Tech Stack:** Node/Express + PostgreSQL (backend), vanilla JS + Vue 3 via CDN (frontend), `node:test`, vitest + jsdom, the isolated Docker test stack (`scripts/run-tests.sh`).

**Spec:** `docs/superpowers/specs/2026-10-01-project-currency-lock-design.md`

## Global Constraints

- No bundler, no build step for the runtime. `js/lib/*.js` are native ES modules loaded with `<script type="module" src="js/lib/…?v=N">`, each with a `window.<name> = <name>` bridge; a bridged global is read only inside a function that runs after `DOMContentLoaded`.
- Every `?v=N` reference to a modified, already-versioned project file is bumped in every page that loads it; the new `js/lib/project-rules.js` starts at `?v=1`. `.html` pages are not versioned (the browser caches them: use a hard reload when testing).
- All user-facing text is in English, no native `alert`/`confirm`. Messages are exactly the approved ones (spec section 6).
- Server refusals are `400 { error: <message> }` (existing business-rule convention); `403` stays for permissions. The sysadmin exception uses the **live** role read from the DB (`liveRole`), never the JWT claim.
- A re-sent identical `currency` / `cgVersionId` value is accepted (the frontend re-sends the whole project on every save).
- "Version has projects" = a `cg_version_projects` row **or** a project with `cg_version_id` = the version.
- No migration, no data change. Backend changes need `pdash-api` restarted after the merge (Gate 4).
- Never run `docker compose` against the main stack (`pdash-*`); use `scripts/run-tests.sh` and `scripts/test-branch.sh` only, never `-v`/`--volumes` anywhere. Do not commit `.env`.
- Out of scope: conversion/rate logic, the deletion feature itself, link-time currency checks, realigning data, sysadmin reset tools, number formatting.

## Review Focus

- **Stale tab re-sending a whole project** (same `currency` and `cgVersionId` every save): must keep saving with 200, not fail. Pinned in Task 1 (rule tests) and Task 2 (PR-04/PR-06 identical values).
- **A missing, empty or `null` `currency`** in a PATCH body: counts as `EUR` and must not be refused as a change from `EUR`. Pinned in Task 1.
- **A `cgVersionId` that is not a valid UUID or in different letter case:** compared case-insensitively and a non-UUID counts as "no proposal" on create. Pinned in Task 1 and Task 2.
- **A sysadmin demoted after login** (JWT still says `sysadmin`): must lose the exception at once, hence `liveRole` from the DB. Pinned by Task 3's use of `liveRole` (code) and Task 2's sysadmin-allowed cases.
- **"Generate project"** (PATCH on a project that does not exist yet, then `POST` with `cgVersionId`, then `POST …/linked-projects`): must keep working for an ordinary admin/editor. Pinned in Task 2 (PR-03).
- **Deleting a project removes its `cg_version_projects` rows** (`ON DELETE CASCADE`) so a version becomes deletable/changeable again after a sysadmin removes its last project. Pinned in Task 2 (PR-09).
- **A page that loses the new module** (silent `window.versionCurrencyLocked is not a function` on one page): pinned by the page guard in Task 5.

---

### Task 0: Worktree setup

**Files:** none modified.

- [ ] **Step 1: Install the frontend toolchain and get a green baseline**

From the worktree root:

```powershell
npm ci
npm test
```

Expected: install completes; all existing vitest tests PASS. If something fails on a clean checkout, stop and report it.

- [ ] **Step 2: Copy the gitignored `.env` for the Docker test stack (Task 7 and Gate 1 need it)**

```powershell
Copy-Item "C:\Users\fafortini\Progetti\burndown\.env" "C:\Users\fafortini\Progetti\burndown\.claude\worktrees\project-currency-lock\.env"
```

Never commit it (`git status` must not list it).

---

### Task 1: Server rules module

**Files:**
- Create: `api/src/lib/project-rules.js`
- Test: `api/src/lib/project-rules.test.js`

**Interfaces:**
- Consumes: nothing (pure).
- Produces (CommonJS exports): `DIRECT_PROJECT_CREATION_ENABLED` (false), `PROJECT_REMOVAL_ENABLED` (false), `MESSAGES`, and the functions below, each returning an error message string or `null`:
  - `projectCreateError({ role, versionId, enabled })`
  - `projectCurrencyChangeError({ role, currentCurrency, newCurrency })`
  - `projectLinkChangeError({ role, currentVersionId, newVersionId })`
  - `versionCurrencyChangeError({ role, currentCurrency, newCurrency, hasProjects })`
  - `projectRemovalError({ role, enabled })`, `linkRemovalError({ role, enabled })` (same rule)
  - `versionRemovalError({ role, hasProjects, enabled })`
  `enabled` defaults to the module constants and exists so tests can exercise the "switched back on" behaviour.

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('./project-rules');

const ADMIN = 'admin';
const SYS = 'sysadmin';
const V1 = '11111111-1111-1111-1111-111111111111';
const V2 = '22222222-2222-2222-2222-222222222222';

test('flags: direct creation and project removal are switched off', () => {
  assert.equal(rules.DIRECT_PROJECT_CREATION_ENABLED, false);
  assert.equal(rules.PROJECT_REMOVAL_ENABLED, false);
});

test('projectCreateError: no proposal is refused for non-sysadmin only', () => {
  assert.equal(rules.projectCreateError({ role: ADMIN, versionId: null }), rules.MESSAGES.createNeedsProposal);
  assert.equal(rules.projectCreateError({ role: 'user', versionId: '' }), rules.MESSAGES.createNeedsProposal);
  assert.equal(rules.projectCreateError({ role: ADMIN, versionId: V1 }), null);
  assert.equal(rules.projectCreateError({ role: SYS, versionId: null }), null);
  assert.equal(rules.projectCreateError({ role: ADMIN, versionId: null, enabled: true }), null);
});

test('projectCurrencyChangeError: a change is refused, an identical or EUR-default value passes', () => {
  const m = rules.MESSAGES.projectCurrency;
  assert.equal(rules.projectCurrencyChangeError({ role: ADMIN, currentCurrency: 'EUR', newCurrency: 'USD' }), m);
  assert.equal(rules.projectCurrencyChangeError({ role: ADMIN, currentCurrency: 'EUR', newCurrency: 'EUR' }), null);
  assert.equal(rules.projectCurrencyChangeError({ role: ADMIN, currentCurrency: 'EUR', newCurrency: '' }), null);
  assert.equal(rules.projectCurrencyChangeError({ role: ADMIN, currentCurrency: null, newCurrency: undefined }), null);
  assert.equal(rules.projectCurrencyChangeError({ role: ADMIN, currentCurrency: 'CHF', newCurrency: '' }), m);
  assert.equal(rules.projectCurrencyChangeError({ role: SYS, currentCurrency: 'EUR', newCurrency: 'USD' }), null);
});

test('projectLinkChangeError: clearing or re-pointing is refused; linking, same value and no link pass', () => {
  const m = rules.MESSAGES.removal;
  assert.equal(rules.projectLinkChangeError({ role: ADMIN, currentVersionId: V1, newVersionId: null }), m);
  assert.equal(rules.projectLinkChangeError({ role: ADMIN, currentVersionId: V1, newVersionId: '' }), m);
  assert.equal(rules.projectLinkChangeError({ role: ADMIN, currentVersionId: V1, newVersionId: V2 }), m);
  assert.equal(rules.projectLinkChangeError({ role: ADMIN, currentVersionId: V1, newVersionId: V1 }), null);
  assert.equal(rules.projectLinkChangeError({ role: ADMIN, currentVersionId: V1, newVersionId: V1.toUpperCase() }), null);
  assert.equal(rules.projectLinkChangeError({ role: ADMIN, currentVersionId: null, newVersionId: V1 }), null);
  assert.equal(rules.projectLinkChangeError({ role: ADMIN, currentVersionId: null, newVersionId: null }), null);
  assert.equal(rules.projectLinkChangeError({ role: SYS, currentVersionId: V1, newVersionId: null }), null);
});

test('versionCurrencyChangeError: only a version with projects is protected', () => {
  const m = rules.MESSAGES.versionCurrency;
  assert.equal(rules.versionCurrencyChangeError({ role: ADMIN, currentCurrency: 'EUR', newCurrency: 'USD', hasProjects: true }), m);
  assert.equal(rules.versionCurrencyChangeError({ role: ADMIN, currentCurrency: 'EUR', newCurrency: 'EUR', hasProjects: true }), null);
  assert.equal(rules.versionCurrencyChangeError({ role: ADMIN, currentCurrency: 'EUR', newCurrency: 'USD', hasProjects: false }), null);
  assert.equal(rules.versionCurrencyChangeError({ role: SYS, currentCurrency: 'EUR', newCurrency: 'USD', hasProjects: true }), null);
});

test('removal rules: refused for non-sysadmin while the flag is off', () => {
  const m = rules.MESSAGES.removal;
  assert.equal(rules.projectRemovalError({ role: ADMIN }), m);
  assert.equal(rules.linkRemovalError({ role: 'user' }), m);
  assert.equal(rules.projectRemovalError({ role: SYS }), null);
  assert.equal(rules.projectRemovalError({ role: ADMIN, enabled: true }), null);
  assert.equal(rules.versionRemovalError({ role: ADMIN, hasProjects: true }), m);
  assert.equal(rules.versionRemovalError({ role: ADMIN, hasProjects: false }), null);
  assert.equal(rules.versionRemovalError({ role: SYS, hasProjects: true }), null);
  assert.equal(rules.versionRemovalError({ role: ADMIN, hasProjects: true, enabled: true }), null);
});

test('a missing role (deleted user) is treated as non-sysadmin', () => {
  assert.equal(rules.projectRemovalError({ role: null }), rules.MESSAGES.removal);
});
```

- [ ] **Step 2: Run it to verify it fails**

```powershell
Set-Location api
node --test src/lib/project-rules.test.js
Set-Location ..
```

Expected: FAIL (`Cannot find module './project-rules'`).

- [ ] **Step 3: Write `api/src/lib/project-rules.js`**

```js
// Rules that keep a project and the proposal it was generated from in the same currency, by inhibiting
// every way to create, unlink, delete or re-currency them (2026-10-01, see
// docs/superpowers/specs/2026-10-01-project-currency-lock-design.md). Pure functions: each returns an
// error message, or null when the action is allowed. A sysadmin (live role, read from the DB by the
// caller) is always allowed. Twin of js/lib/project-rules.js (the browser side).

// Single switch-back points (keep js/lib/project-rules.js in sync for the creation flag).
const DIRECT_PROJECT_CREATION_ENABLED = false;
const PROJECT_REMOVAL_ENABLED = false;

const MESSAGES = {
  versionCurrency: 'Currency cannot be changed: projects are linked to this proposal',
  projectCurrency: 'Currency cannot be changed: amounts are not converted yet',
  createNeedsProposal: 'Projects must be created from a proposal',
  removal: 'Deleting a project or unlinking it from its proposal is temporarily disabled',
};

const isSysadmin = role => role === 'sysadmin';
// The column default: a missing/empty currency means EUR.
const currencyOf = c => (c === undefined || c === null || c === '') ? 'EUR' : String(c);
const idOf = v => (v ? String(v).toLowerCase() : null);

function projectCreateError({ role, versionId, enabled = DIRECT_PROJECT_CREATION_ENABLED }) {
  if (isSysadmin(role) || enabled || versionId) return null;
  return MESSAGES.createNeedsProposal;
}

function projectCurrencyChangeError({ role, currentCurrency, newCurrency }) {
  if (isSysadmin(role)) return null;
  return currencyOf(currentCurrency) === currencyOf(newCurrency) ? null : MESSAGES.projectCurrency;
}

// Clearing the link or pointing it at another version is a removal of the current link; linking an
// unlinked project (null -> version) and re-sending the same id are not.
function projectLinkChangeError({ role, currentVersionId, newVersionId }) {
  if (isSysadmin(role)) return null;
  const current = idOf(currentVersionId);
  if (current && current !== idOf(newVersionId)) return MESSAGES.removal;
  return null;
}

function versionCurrencyChangeError({ role, currentCurrency, newCurrency, hasProjects }) {
  if (isSysadmin(role) || !hasProjects) return null;
  return currencyOf(currentCurrency) === currencyOf(newCurrency) ? null : MESSAGES.versionCurrency;
}

function projectRemovalError({ role, enabled = PROJECT_REMOVAL_ENABLED }) {
  return (isSysadmin(role) || enabled) ? null : MESSAGES.removal;
}
const linkRemovalError = projectRemovalError;

function versionRemovalError({ role, hasProjects, enabled = PROJECT_REMOVAL_ENABLED }) {
  return (isSysadmin(role) || enabled || !hasProjects) ? null : MESSAGES.removal;
}

module.exports = {
  DIRECT_PROJECT_CREATION_ENABLED, PROJECT_REMOVAL_ENABLED, MESSAGES,
  projectCreateError, projectCurrencyChangeError, projectLinkChangeError, versionCurrencyChangeError,
  projectRemovalError, linkRemovalError, versionRemovalError,
};
```

- [ ] **Step 4: Run the tests**

```powershell
Set-Location api
node --test src/lib/project-rules.test.js
Set-Location ..
```

Expected: PASS (all 6 tests, pure lib, no `api/node_modules` needed).

- [ ] **Step 5: Commit**

```powershell
git add api/src/lib/project-rules.js api/src/lib/project-rules.test.js
git commit -m "feat: add project currency/link/removal rules (server, pure)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Integration tests first (new section + adapting the existing ones)

Written before the routes change, so the new section is RED against the current server and the adapted old tests are GREEN against it (a sysadmin may do everything an admin may).

**Files:**
- Modify: `test-api.js`

**Interfaces:**
- Consumes: the existing helpers `api`, `ok`, `section`, `later`, `adminCookie`, `sysadminCookie`, `TEST_YEAR_C`.
- Produces: `testProjectCurrencyLock()` (PR-01..PR-12) called from `main()`.

- [ ] **Step 1: Cleanup runs as the sysadmin**

In `runCleanup()` replace the request line so deletions that are now restricted still work:

```js
    const r = await api(method, path, null, sysadminCookie || adminCookie);
```

(replacing `const r = await api(method, path, null, adminCookie);`).

- [ ] **Step 2: Existing tests that create a project without a proposal use the sysadmin cookie**

In each of these calls replace the last argument `adminCookie` with `sysadminCookie` (the project owner changes to the sysadmin; nothing else in these tests depends on it, see the exception in Step 3):

- `test-api.js:1012` `{ name: '__test_tag_proj__' }`
- `:1062` `{ name: '__test_tag_link_later_proj__' }`
- `:1089` `{ name: '__test_tag_race_proj__' }`
- `:1157` ``{ name: `__test_match_proj_${ts}__`, code }``
- `:1315` ``{ name: `__prof_proj_${code}__`, code }``
- `:1678` `{ name: oddName, code: odd }`
- `:1734` ``{ name: `__pd_${ts}__`, code, description: 'Oncology portal' }`` (the argument is on the next line)
- `:2048` ``{ name: `__plan_${code}__`, code, startDate: '209901', endDate: '209903' }``
- `:2149` `{ name, code, startDate: '209901', endDate: '209903' }`
- `:2327` `{ name: '__test_patch_validation__' }`

Also update the comment above `:2087`-`:2089` (PM-07) so it no longer claims that the demoted test admin owns `pid`: change `// The plain user is the demoted test admin (getPlainUserCookie), who owns \`pid\`; so the project the` to `// The plain user is the demoted test admin (getPlainUserCookie); the project the` (the assertions only use `pid7`).

- [ ] **Step 3: The one test that needs an admin-owned project is linked at creation instead**

`test-api.js:691` (CGR-08 asserts that the project's own owner is the admin). Replace

```js
    const rproj = await api('POST', '/api/projects', { name: '__test_reassign_proj__' }, adminCookie);
```

with

```js
    // Created linked to the version (an admin may do that): a project without a proposal is sysadmin-only,
    // and CGR-08 below needs the admin to be the project's owner.
    const rproj = await api('POST', '/api/projects',
      { name: '__test_reassign_proj__', ...(vId ? { cgVersionId: vId } : {}) }, adminCookie);
```

- [ ] **Step 4: Direct deletion in PJ-10 uses the sysadmin**

`test-api.js:1690`: change `await api('DELETE', \`/api/projects/${oddId}\`, null, adminCookie)` to use `sysadminCookie`.

- [ ] **Step 5: Add the new test section** (before `// ── Version routes are scoped to their grid` or at the end of the file's test functions, before `async function main()`):

```js
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
  ok(direct.status === 400 && direct.data?.error === 'Projects must be created from a proposal',
    `PR-01 admin: project without a proposal → 400 (got ${direct.status})`);
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
}
```

Register it in `main()` right after `await testProjectPatchValidation();`:

```js
    await testProjectCurrencyLock();
```

- [ ] **Step 6: Run the isolated backend suite against the CURRENT server (RED for PR-*, GREEN elsewhere)**

```bash
bash scripts/run-tests.sh
```

Expected: the old tests all pass (the sysadmin does everything the admin did) and the new `PR-01`, `PR-04` (change refused), `PR-05` (refused), `PR-06` (refused), `PR-08` checks FAIL because the server does not refuse anything yet. Read the final `Results:` line and the failing PR-* labels; confirm only PR-* labels fail. If an old test fails, fix the adaptation, not the server.

- [ ] **Step 7: Commit**

```powershell
git add test-api.js
git commit -m "test: integration tests for the project currency lock; project setup/cleanup as sysadmin" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Server wiring (makes Task 2 GREEN)

**Files:**
- Modify: `api/src/middleware/auth.js`, `api/src/routes/projects.js`, `api/src/routes/cost-grids.js`

**Interfaces:**
- Consumes: `project-rules.js` (Task 1).
- Produces: `liveRole(userId)` exported from `auth.js` (role read from the DB, `null` for an unknown user).

- [ ] **Step 1: `liveRole` in `api/src/middleware/auth.js`**

Add before `module.exports` and export it:

```js
// The role of a user read from the database, not from the JWT claim. The project rules let only a
// sysadmin through, so a sysadmin demoted after login loses the exception at once.
async function liveRole(userId) {
  const { rows } = await query('SELECT role FROM users WHERE id = $1', [userId]);
  return rows[0] ? rows[0].role : null;
}

module.exports = { requireAuth, requireAdmin, requireSysAdmin, liveRole };
```

- [ ] **Step 2: `api/src/routes/projects.js` — imports**

```js
const { requireAuth, liveRole } = require('../middleware/auth');
const rules = require('../lib/project-rules');
```

(replacing the existing `const { requireAuth } = require('../middleware/auth');`, and adding the second line next to the other `require`s).

- [ ] **Step 3: `POST /api/projects`** — right after the `safeCgVersionId` line and before the `INSERT`:

```js
    const createErr = rules.projectCreateError({ role: await liveRole(req.user.id), versionId: safeCgVersionId });
    if (createErr) return res.status(400).json({ error: createErr });
```

- [ ] **Step 4: `PATCH /api/projects/:id`** — after the `for (const key of ['cgVersionId', 'clientId'])` validation loop and before `const allowed = [...]`:

```js
    if (req.body.currency !== undefined || req.body.cgVersionId !== undefined) {
      const { rows: [stored] } = await query('SELECT currency, cg_version_id FROM projects WHERE id = $1', [req.params.id]);
      if (stored) {
        const role = await liveRole(req.user.id);
        if (req.body.currency !== undefined) {
          const err = rules.projectCurrencyChangeError({ role, currentCurrency: stored.currency, newCurrency: req.body.currency });
          if (err) return res.status(400).json({ error: err });
        }
        if (req.body.cgVersionId !== undefined) {
          const err = rules.projectLinkChangeError({ role, currentVersionId: stored.cg_version_id, newVersionId: req.body.cgVersionId });
          if (err) return res.status(400).json({ error: err });
        }
      }
    }
```

(A project that does not exist yet falls through to the existing 404; this is the first attempt of "Generate project".)

- [ ] **Step 5: `DELETE /api/projects/:id`** — right after the `canEdit` check, before the timesheets count:

```js
    const delErr = rules.projectRemovalError({ role: await liveRole(req.user.id) });
    if (delErr) return res.status(400).json({ error: delErr });
```

- [ ] **Step 6: `api/src/routes/cost-grids.js` — imports and helpers**

```js
const { requireAuth, liveRole } = require('../middleware/auth');
const rules = require('../lib/project-rules');
```

(replacing `const { requireAuth } = require('../middleware/auth');`), and next to `canAccess`/`canEdit`:

```js
// A version "has projects" when a cg_version_projects row or a project's cg_version_id points at it.
async function versionHasProjects(versionId) {
  const { rows } = await query(
    `SELECT (EXISTS (SELECT 1 FROM cg_version_projects WHERE cost_grid_version_id = $1)
          OR EXISTS (SELECT 1 FROM projects WHERE cg_version_id = $1)) AS has`, [versionId]);
  return rows[0].has;
}
async function gridHasProjects(gridId) {
  const { rows } = await query(
    `SELECT EXISTS (
       SELECT 1 FROM cost_grid_versions v
       WHERE v.cost_grid_id = $1
         AND (EXISTS (SELECT 1 FROM cg_version_projects cvp WHERE cvp.cost_grid_version_id = v.id)
           OR EXISTS (SELECT 1 FROM projects p WHERE p.cg_version_id = v.id))) AS has`, [gridId]);
  return rows[0].has;
}
```

- [ ] **Step 7: `PATCH /api/cost-grids/:id/versions/:vId`** — extend the locked/pipeline read to include the stored currency and add the rule after the body is destructured:

```js
    const locked = await query('SELECT locked, pipeline AS old_pipeline, currency AS old_currency FROM cost_grid_versions WHERE id = $1', [req.params.vId]);
```

and, right after `const { label, pipeline, startDate, endDate, currency, currencyRate, note, ratecardId, clientId, projectName } = req.body;`:

```js
    if (currency !== undefined) {
      const err = rules.versionCurrencyChangeError({
        role: await liveRole(req.user.id),
        currentCurrency: locked.rows[0]?.old_currency,
        newCurrency: currency,
        hasProjects: await versionHasProjects(req.params.vId),
      });
      if (err) return res.status(400).json({ error: err });
    }
```

- [ ] **Step 8: Deletions in `cost-grids.js`**

`DELETE /:id/versions/:vId` — after the `Only Draft versions can be deleted` check, before the `DELETE`:

```js
    const delErr = rules.versionRemovalError({ role: await liveRole(req.user.id), hasProjects: await versionHasProjects(req.params.vId) });
    if (delErr) return res.status(400).json({ error: delErr });
```

`DELETE /:id` (the proposal) — after the `nonDraft` check, before the `DELETE`:

```js
    const delErr = rules.versionRemovalError({ role: await liveRole(req.user.id), hasProjects: await gridHasProjects(req.params.id) });
    if (delErr) return res.status(400).json({ error: delErr });
```

`DELETE /:id/versions/:vId/linked-projects/:projectId` — after the `canEdit` check, before the `DELETE FROM cg_version_projects`:

```js
    const unlinkErr = rules.linkRemovalError({ role: await liveRole(req.user.id) });
    if (unlinkErr) return res.status(400).json({ error: unlinkErr });
```

- [ ] **Step 9: Syntax check, then run the isolated backend suite (GREEN expected)**

```powershell
node --check api/src/routes/projects.js
node --check api/src/routes/cost-grids.js
node --check api/src/middleware/auth.js
```

```bash
bash scripts/run-tests.sh
```

Expected: no syntax errors; the final line `Results: N/N passed — all passed ✓`, including every `PR-*` check. If a check fails, read its label and fix the route, not the test (unless the test is wrong about the spec: then record why).

- [ ] **Step 10: Commit**

```powershell
git add api/src/middleware/auth.js api/src/routes/projects.js api/src/routes/cost-grids.js
git commit -m "feat: enforce the project currency lock and the temporary creation/removal ban on the API" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Dev seed helper note

**Files:**
- Modify: `api/src/scripts/seed-planning-golden.js` (header comment only)

- [ ] **Step 1: Document the new requirement**

Replace the first usage comment line block so it reads:

```js
// Seeds the Planning parity dataset through the public API. DEV TOOL — isolated stacks only.
//   SEED_URL=http://localhost:8081 SEED_EMAIL=... SEED_PASSWORD=... node seed-planning-golden.js [--remove]
// SEED_EMAIL must be a SYSADMIN account: creating a project without a proposal and deleting a project are
// restricted to sysadmins (project currency lock, 2026-10-01).
// Everything is created with the GOLD- prefix and removed again by --remove.
```

- [ ] **Step 2: Commit**

```powershell
git add api/src/scripts/seed-planning-golden.js
git commit -m "docs: seed-planning-golden needs a sysadmin account now" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Browser rules module and its guard (TDD)

**Files:**
- Create: `js/lib/project-rules.js`
- Test: `js/lib/project-rules.test.js`, `js/lib/project-rules-guard.test.js`

**Interfaces:**
- Produces (ES exports, also on `window`): `DIRECT_PROJECT_CREATION_ENABLED`, `PROJECT_RULE_MESSAGES = { costgridCurrency, projectConfigCurrency, directCreation }`, `versionCurrencyLocked(linkedProjects) -> boolean`.

- [ ] **Step 1: Write the failing tests**

`js/lib/project-rules.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { DIRECT_PROJECT_CREATION_ENABLED, PROJECT_RULE_MESSAGES, versionCurrencyLocked } from './project-rules.js';

describe('versionCurrencyLocked', () => {
  it('is locked as soon as a project is linked', () => {
    expect(versionCurrencyLocked([{ projectId: 'p1' }])).toBe(true);
    expect(versionCurrencyLocked([{ projectId: 'p1' }, { projectId: 'p2' }])).toBe(true);
  });
  it('is not locked without projects, or when the list is missing', () => {
    expect(versionCurrencyLocked([])).toBe(false);
    expect(versionCurrencyLocked(undefined)).toBe(false);
    expect(versionCurrencyLocked(null)).toBe(false);
  });
});

describe('flags and messages', () => {
  it('direct project creation is switched off', () => {
    expect(DIRECT_PROJECT_CREATION_ENABLED).toBe(false);
  });
  it('carries the approved texts', () => {
    expect(PROJECT_RULE_MESSAGES.costgridCurrency).toBe('Currency is locked: a project has already been generated from this proposal.');
    expect(PROJECT_RULE_MESSAGES.projectConfigCurrency).toBe('Currency cannot be changed here: amounts are not converted yet. Contact a sysadmin if it must be corrected.');
    expect(PROJECT_RULE_MESSAGES.directCreation).toBe('Projects are created from a proposal (Generate project). Creating a project directly is temporarily disabled.');
  });
  it('is bridged onto window for the classic page code', () => {
    expect(window.versionCurrencyLocked).toBe(versionCurrencyLocked);
    expect(window.DIRECT_PROJECT_CREATION_ENABLED).toBe(false);
    expect(window.PROJECT_RULE_MESSAGES).toBe(PROJECT_RULE_MESSAGES);
  });
});
```

`js/lib/project-rules-guard.test.js` (the three pages must load the module and use it; written now, it fails until Task 6 wires the pages):

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = f => readFileSync(f, 'utf8');

describe('project rules are wired into the pages', () => {
  for (const page of ['costgrid.html', 'project-config.html', 'portfolio.html']) {
    it(`${page} loads js/lib/project-rules.js`, () => {
      expect(read(page)).toMatch(/js\/lib\/project-rules\.js\?v=\d+/);
    });
  }

  it('costgrid.html disables the currency menu with the version lock', () => {
    const t = read('costgrid.html');
    expect(t).toMatch(/id="cgCurrency"[^>]*:disabled="currencyLocked"/);
    expect(t).toMatch(/versionCurrencyLocked\(/);
  });

  it('project-config.html keeps the currency menu read-only and redirects the new-project form', () => {
    const t = read('project-config.html');
    expect(t).toMatch(/v-model="project\.currency"[^>]*disabled/);
    expect(t).toMatch(/DIRECT_PROJECT_CREATION_ENABLED/);
  });

  it('portfolio.html no longer links straight to the creation form', () => {
    const t = read('portfolio.html');
    expect(t).not.toMatch(/onclick="window\.location\.href='\/project-config\.html'"/);
    expect(t).toMatch(/DIRECT_PROJECT_CREATION_ENABLED/);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```powershell
npx vitest run js/lib/project-rules.test.js js/lib/project-rules-guard.test.js
```

Expected: both files FAIL (module not found; page checks fail).

- [ ] **Step 3: Write `js/lib/project-rules.js`**

```js
// js/lib/project-rules.js
// Browser side of the project currency lock (2026-10-01, docs/superpowers/specs/2026-10-01-project-currency-lock-design.md).
// Loaded as a native ES module and bridged onto `window` for the Vue pages (read the bridges only inside
// functions that run after DOMContentLoaded). Twin of api/src/lib/project-rules.js: the server is the
// authority, this only drives what the UI shows. Keep DIRECT_PROJECT_CREATION_ENABLED in sync by hand.

// Single switch-back point for the UI: set to true (and the server flag too) to allow projects
// without a proposal again.
export const DIRECT_PROJECT_CREATION_ENABLED = false;

export const PROJECT_RULE_MESSAGES = {
  costgridCurrency: 'Currency is locked: a project has already been generated from this proposal.',
  projectConfigCurrency: 'Currency cannot be changed here: amounts are not converted yet. Contact a sysadmin if it must be corrected.',
  directCreation: 'Projects are created from a proposal (Generate project). Creating a project directly is temporarily disabled.',
};

// A version's currency is locked as soon as it has a linked project (draft.linkedProjects).
export function versionCurrencyLocked(linkedProjects) {
  return Array.isArray(linkedProjects) && linkedProjects.length > 0;
}

if (typeof window !== 'undefined') {
  window.DIRECT_PROJECT_CREATION_ENABLED = DIRECT_PROJECT_CREATION_ENABLED;
  window.PROJECT_RULE_MESSAGES = PROJECT_RULE_MESSAGES;
  window.versionCurrencyLocked = versionCurrencyLocked;
}
```

- [ ] **Step 4: Run the unit test (the guard stays red until Task 6)**

```powershell
npx vitest run js/lib/project-rules.test.js
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit** (the guard test is committed with Task 6, when it can pass; commit only the module and its unit test now)

```powershell
git add js/lib/project-rules.js js/lib/project-rules.test.js
git commit -m "feat: add the browser side of the project rules (version currency lock, messages, flag)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: UI wiring

**Files:**
- Modify: `costgrid.html`, `project-config.html`, `portfolio.html`
- Test: `js/lib/project-rules-guard.test.js` (written in Task 5)

**Interfaces:**
- Consumes: `window.versionCurrencyLocked`, `window.DIRECT_PROJECT_CREATION_ENABLED`, `window.PROJECT_RULE_MESSAGES` (Task 5).

- [ ] **Step 1: Load the module on the three pages**

In each of `costgrid.html`, `project-config.html`, `portfolio.html`, add right after the `money.js` tag (`<script type="module" src="js/lib/money.js?v=1"></script>`):

```html
<script type="module" src="js/lib/project-rules.js?v=1"></script>
```

- [ ] **Step 2: `costgrid.html` — the menu lock**

Computed properties, right after `isLocked() { return this.lockState.locked; },` (line ~777):

```js
    currencyLocked() { return this.isLocked || window.versionCurrencyLocked(this.draft?.linkedProjects); },
    currencyLockTitle() { return window.versionCurrencyLocked(this.draft?.linkedProjects) ? window.PROJECT_RULE_MESSAGES.costgridCurrency : ''; },
```

The select (line 104) becomes:

```html
              <select class="form-select" id="cgCurrency" v-model="draft.currency" @change="onCurrencyChange" :disabled="currencyLocked" :title="currencyLockTitle">
```

- [ ] **Step 3: `project-config.html` — read-only menu with a hint, and the redirect**

The Currency `<select>` at line 80 becomes disabled for everyone, with a hint below it (replace the whole `<div class="col-sm-3 col-md-2">…</div>` of the Currency field):

```html
          <div class="col-sm-3 col-md-2"><label class="form-label small mb-1">Currency</label><select class="form-select form-select-sm" v-model="project.currency" disabled><option v-for="cu in currencyOptions" :key="cu.code" :value="cu.code">{{ cu.symbol }} {{ cu.name }}</option></select><div class="form-text" style="font-size:.72rem">{{ currencyHint }}</div></div>
```

Computed, next to `currencyOptions()`:

```js
      currencyHint() { return window.PROJECT_RULE_MESSAGES.projectConfigCurrency; },
```

In `resolveProject()`, the new-project branch (`if (!projectId) {`) starts with the redirect:

```js
        if (!projectId) {
          if (!window.DIRECT_PROJECT_CREATION_ENABLED) {
            window.location.replace('/portfolio.html?notice=direct-creation-disabled');
            return;
          }
          this.project = BLANK_PROJECT();
```

(the lines that follow stay unchanged, so re-enabling is the flag only).

- [ ] **Step 4: `portfolio.html` — the button, the empty state and the redirect notice**

Replace the button at line 34 (which has an inline `onclick`) with a wrapper that carries the tooltip (a disabled button does not always show its own `title`) and a Vue handler:

```html
        <span :title="directCreationEnabled ? '' : directCreationMessage"><button class="btn btn-primary btn-sm" :disabled="!directCreationEnabled" @click="goNewProject">＋ New project</button></span>
```

and the empty state (line 38) plus a notice for the redirect:

```html
    <div v-if="notice" class="alert alert-info">{{ notice }}</div>
    <div v-if="!projects.length" class="alert alert-info">{{ directCreationEnabled ? 'No projects configured. Click ＋ New project to add one.' : 'No projects configured. Projects are created from a proposal (Generate project).' }}</div>
```

Vue data (after `refreshTick: 0, …` at the end of the `data()` object):

```js
        notice: '',
        directCreationEnabled: window.DIRECT_PROJECT_CREATION_ENABLED,
        directCreationMessage: window.PROJECT_RULE_MESSAGES.directCreation,
```

A method (next to the other methods, e.g. before `fmtVar`):

```js
      goNewProject() { if (this.directCreationEnabled) window.location.href = '/project-config.html'; },
```

and the redirect notice, in the same async init right after `if (!user) return;`:

```js
      if (new URLSearchParams(window.location.search).get('notice') === 'direct-creation-disabled') {
        this.notice = window.PROJECT_RULE_MESSAGES.directCreation;
        window.history.replaceState(null, '', window.location.pathname);
      }
```

- [ ] **Step 5: Run the whole frontend suite**

```powershell
npm test
```

Expected: PASS, including the three page checks of `js/lib/project-rules-guard.test.js`.

- [ ] **Step 6: Commit**

```powershell
git add costgrid.html project-config.html portfolio.html js/lib/project-rules-guard.test.js
git commit -m "feat: lock the currency menus and switch off direct project creation in the UI" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Verification in the browser (branch stack)

No code unless a defect is found (fix it in the task that owns it, with a test when testable). Follow `CLAUDE.md`: never `docker compose` on the main stack; use the isolated script only; do not tear the stack down yourself (only after the user's own "yes" in `/finish-cycle` Gate 2).

- [ ] **Step 1: Start the isolated stack** (`.env` was copied in Task 0)

```bash
bash scripts/test-branch.sh up
```

Create a throwaway admin and a throwaway sysadmin **in the branch stack's database only**:

```powershell
docker exec pdash-api-project-currency-lock node /app/src/create-admin.js qa-lock@example.test '<a throwaway password>' QA Lock
docker exec pdash-api-project-currency-lock node /app/src/promote-sysadmin.js qa-lock@example.test
```

(the container name is `pdash-api-<branch-env-name>`; check with `docker ps`). Hard reload every page you open (the `.html` pages are cached by the browser).

- [ ] **Step 2: Check each scenario and record the result**

- `costgrid.html`, a proposal with no generated project: the Currency menu is enabled. Generate a project from it: the menu becomes disabled right away (tooltip = message 1), stays disabled after a reload, in any pipeline stage you can reach.
- `project-config.html?projectId=<any>`: the Currency menu is disabled for every project, the hint is shown under it.
- `portfolio.html`: `＋ New project` is disabled with the tooltip; the empty-state/notice text is right; opening `project-config.html` without `projectId` redirects to the portfolio with the notice, which disappears on reload.
- "Generate project" still creates the project and links it (as an admin, not sysadmin).
- With the browser console or `fetch`: as admin, `PATCH /api/projects/<linked>` with another `currency`, `cgVersionId: null`, `DELETE /api/projects/<id>`, `POST /api/projects` without `cgVersionId` → `400` with the approved messages; as the sysadmin each → success.
- No console errors on `portfolio`, `costgrid`, `project-config`.

- [ ] **Step 3: Report** the outcome (pass/fail per bullet, defects and fix commits) for `/finish-cycle`.

---

## Self-review (run after writing; results)

- **Spec coverage:** rules + flags (Task 1), enforcement points `POST/PATCH/DELETE /api/projects`, `PATCH`/`DELETE` versions, `DELETE` proposal, `DELETE linked-projects`, `liveRole` (Task 3), client twin + messages (Task 5), costgrid/project-config/portfolio UI + redirect (Task 6), tests (Tasks 1, 2, 5, 6), seed helper note (Task 4), browser verification (Task 7). The "link-time currency check" is NOT built (user decision). No migration. Docs (`CLAUDE.md`, `PRD.md`, `TEST_CASES.md`, page docs) are written by `/sync-docs` in `/finish-cycle`, not here.
- **Placeholders:** none; every code step carries the code. The one deliberate runtime value, the QA password, is chosen by the executor and never written to a file or chat.
- **Type consistency:** rule names and parameters are identical in Tasks 1 and 3 (`projectCreateError({ role, versionId })`, `projectCurrencyChangeError({ role, currentCurrency, newCurrency })`, `projectLinkChangeError({ role, currentVersionId, newVersionId })`, `versionCurrencyChangeError({ role, currentCurrency, newCurrency, hasProjects })`, `projectRemovalError`/`linkRemovalError({ role })`, `versionRemovalError({ role, hasProjects })`); `window.versionCurrencyLocked`, `window.DIRECT_PROJECT_CREATION_ENABLED`, `window.PROJECT_RULE_MESSAGES` identical in Tasks 5 and 6; PR-* messages match `MESSAGES` strings.
- **Existing tests:** `PV-04`/`PV-05` (`cgVersionId` null/empty on an unlinked project) stay green by design (no change from null); VS-08 keeps its 404 because the version scope middleware runs first; the TAG tests that link later by PATCH (null → version) stay allowed; CGR-08 keeps an admin-owned project (Task 2, Step 3).
- **Review Focus:** each line maps to a test (Task 1 rule cases, Task 2 PR-03/PR-04/PR-06/PR-09, Task 5 guard).
