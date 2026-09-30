# Hardening — open findings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the open findings on the cost-grid, project and timesheet routes and the two `costgrid.js`/`project-config` follow-ups, without changing any permission rule.

**Architecture:** One router-level guard in `api/src/routes/cost-grids.js` scopes every `/:id/versions/:vId/...` route to its grid; two small input/response fixes in `projects.js` and `timesheets.js`; a `skipEmpty` option on the sync push used only by `costgrid.js`; a one-line guard in `costgrid.html`'s `toggleTag`.

**Tech Stack:** Node/Express + PostgreSQL (`api/`), Vue 3 via CDN (no build step), vitest (frontend), the integration suite `test-api.js` run by `scripts/run-tests.sh`.

**Spec:** `docs/superpowers/specs/2026-09-30-hardening-open-findings-design.md`

## Global Constraints

- No build step, no new dependencies, no migrations.
- User-facing text in English; no native `alert`/`confirm`.
- Order of a version-route request: 401 (`requireAuth`) → 404 (version not in grid) → 403 (`canEdit`/`canAccess` in the handler).
- `programId` is `VARCHAR(100)` and must NOT be UUID-validated.
- Every file with a `?v=N` query string that is edited gets that `N` bumped in every reference in the repo (grep first): `js/api-sync.js` `?v=18` → `?v=19` (costgrid.html, pipeline.html, planning.html, portfolio.html, project-config.html); `js/costgrid.js` `?v=33` → `?v=34` (costgrid.html, pipeline.html). `costgrid.html`'s inline script needs no bump.
- `api/` changes: `scripts/run-tests.sh` must pass and `pdash-api` must be restarted after merge (confirm-first, `/finish-cycle` Gate 4). Never run `docker compose` against the main stack from this plan.
- Work in a worktree (`EnterWorktree`, name `hardening-open-findings`), copy the gitignored `.env` from the main checkout first; close with `/finish-cycle`, never merge by hand.
- Git in a worktree session: run `git -C <worktree path> ...` from PowerShell (a bare `git` in Bash is refused).

## Review Focus

- Malformed `:vId`/`:id` (not a UUID) on a version route: expected 404, never 500 (Task 1 test).
- Unauthenticated request on a version route: expected 401, not 404 (Task 1 test).
- A version of another grid must not be changed, deleted, duplicated or linked (Task 1 tests check the DB afterwards, not only the status).
- `PATCH /projects` with `cgVersionId: null` or `''`: expected to keep unlinking (200), not 400 (Task 2 test).
- Admin asking for a project code with no actuals: expected `200 []`; a plain user for a code they cannot see: 403 (Task 3 tests).
- `project-config.html` must still be able to clear a section (PC-27): `skipEmpty` is opt-in only (Task 4 test).

---

### Task 1: Scope every version route to its grid

**Files:**
- Modify: `api/src/routes/cost-grids.js` (add `versionScope` + `router.use` before the first `:vId` route, l. ~319)
- Test: `test-api.js` (new `testVersionScope()`, called from `main()` after `testTagLinking()`)

**Interfaces:**
- Produces: middleware `versionScope(req, res, next)` mounted on `/:id/versions/:vId`; 404 `{ error: 'Version not found' }` when `:id`/`:vId` is not a UUID or the version is not in that grid.

- [ ] **Step 1: Write the failing integration test**

Add to `test-api.js` (before `async function main()`):

```js
// ── Version routes are scoped to their grid (2026-09-30 hardening) ──────────────

async function testVersionScope() {
  section('Version scope');
  const FAKE = '00000000-0000-0000-0000-000000000000';

  const rpy = await api('POST', '/api/pipeline-years', { year: TEST_YEAR_C }, adminCookie);
  if (![201, 409].includes(rpy.status)) { ok(false, 'VS-setup pipeline year unavailable'); return; }

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
    ['VS-02 DELETE version',           'DELETE', cross,                              null],
    ['VS-03 POST duplicate',           'POST',   `${cross}/duplicate`,               null],
    ['VS-04 GET structure',            'GET',    `${cross}/structure`,               null],
    ['VS-05 PUT structure',            'PUT',    `${cross}/structure`,               { phases: [] }],
    ['VS-06 GET linked-projects',      'GET',    `${cross}/linked-projects`,         null],
    ['VS-07 POST linked-projects',     'POST',   `${cross}/linked-projects`,         { projectId: FAKE }],
    ['VS-08 DELETE linked-projects',   'DELETE', `${cross}/linked-projects/${FAKE}`, null],
    ['VS-09 POST refresh-rate',        'POST',   `${cross}/refresh-rate`,            null],
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
```

Register it in `main()` right after `await testTagLinking();`:

```js
    await testVersionScope();
```

- [ ] **Step 2: Run the suite to verify the new cases fail**

Run: `bash scripts/run-tests.sh` (builds the isolated stack; takes a few minutes).
Expected: `VS-01..VS-09` FAIL (status 200/403/…, not 404) and `VS-10` FAIL for the grid-B checks (the unguarded PATCH/DELETE/duplicate changed grid B or A); `VS-13` PASS.

- [ ] **Step 3: Add the guard**

In `api/src/routes/cost-grids.js`, just before `// GET /api/cost-grids/:id/versions` (the first route using `:vId`), add:

```js
// Every /:id/versions/:vId/... route is scoped to its grid: a version that is not in grid :id answers 404,
// whatever the handler below does (2026-09-30 hardening; closes the tag-cycle ":vId not checked against :id"
// finding for structure, linked-projects, duplicate, patch, delete and refresh-rate). Registered after
// requireAuth so an anonymous request still gets 401; canEdit/canAccess stay in each handler.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function versionScope(req, res, next) {
  try {
    const { id, vId } = req.params;
    if (!UUID_RE.test(id) || !UUID_RE.test(vId)) return res.status(404).json({ error: 'Version not found' });
    const { rows } = await query(
      'SELECT 1 FROM cost_grid_versions WHERE id = $1 AND cost_grid_id = $2', [vId, id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Version not found' });
    next();
  } catch (err) { next(err); }
}
router.use('/:id/versions/:vId', requireAuth, versionScope);
```

- [ ] **Step 4: Re-run the suite**

Run: `bash scripts/run-tests.sh`
Expected: all `VS-*` PASS and no regression elsewhere (especially `TAG-*`, `Cost grid reassign owner`, `Admin reset proposal`).

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/cost-grids.js test-api.js
git commit -m "fix: scope every cost-grid version route to its grid (404 otherwise)"
```

---

### Task 2: Validate `cgVersionId` / `clientId` on `PATCH /api/projects/:id`

**Files:**
- Modify: `api/src/routes/projects.js:182-186` (after the `canEdit` check)
- Test: `test-api.js` (new `testProjectPatchValidation()`, called from `main()` after `testVersionScope()`)

**Interfaces:**
- Produces: `400 { error: '<field> must be a valid UUID' }` for a non-UUID `cgVersionId` or `clientId`; `null`/`''` stay valid.

- [ ] **Step 1: Write the failing test**

```js
// ── PATCH /api/projects/:id input validation (2026-09-30 hardening) ─────────────

async function testProjectPatchValidation() {
  section('Project PATCH validation');
  const r = await api('POST', '/api/projects', { name: '__test_patch_validation__' }, adminCookie);
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
```

Register after `await testVersionScope();` in `main()`: `await testProjectPatchValidation();`

- [ ] **Step 2: Run to verify it fails**

Run: `bash scripts/run-tests.sh`
Expected: `PV-01`, `PV-02`, `PV-03` FAIL (status 500); `PV-04`/`PV-05` PASS.

- [ ] **Step 3: Add the validation**

In `api/src/routes/projects.js`, in `router.patch('/:id', ...)`, right after the `canEdit` block and before `const allowed = [...]`:

```js
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const key of ['cgVersionId', 'clientId']) {
      const v = req.body[key];
      if (v && (typeof v !== 'string' || !uuidRe.test(v))) {
        return res.status(400).json({ error: `${key} must be a valid UUID` });
      }
    }
```

(`programId` is deliberately not checked: `projects.program_id` is `VARCHAR(100)`.)

- [ ] **Step 4: Re-run**

Run: `bash scripts/run-tests.sh` — Expected: all `PV-*` PASS, no regression.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/projects.js test-api.js
git commit -m "fix: PATCH /api/projects/:id answers 400 for a non-UUID cgVersionId/clientId"
```

---

### Task 3: Admin gets `200 []` for a project without actuals

**Files:**
- Modify: `api/src/routes/timesheets.js:101-106`
- Test: `test-api.js` (new `testTimesheetsNoActuals()`, called after `testProjectPatchValidation()`)

**Interfaces:**
- Consumes: `getPlainUserCookie()` (already in `test-api.js`, returns `''` when unavailable).

- [ ] **Step 1: Write the failing test**

```js
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
```

Register after `await testProjectPatchValidation();`: `await testTimesheetsNoActuals();`

- [ ] **Step 2: Run to verify it fails**

Run: `bash scripts/run-tests.sh` — Expected: `TS-01` FAIL (403); `TS-02` PASS.

- [ ] **Step 3: Implement**

In `api/src/routes/timesheets.js`, replace the check at the top of `router.get('/:projectCode', ...)`:

```js
    // An admin may ask for any code: no actuals means an empty list, not "access denied". visibleCodes() only
    // lists codes that already have timesheets for an admin, so it cannot be the gate for them (2026-09-30).
    if (!isAdminRole(req.user.role)) {
      const codes = await visibleCodes(req.user.id, req.user.role);
      if (!codes.includes(req.params.projectCode)) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
```

- [ ] **Step 4: Re-run**

Run: `bash scripts/run-tests.sh` — Expected: `TS-01`, `TS-02` PASS, and the existing timesheet tests unchanged.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/timesheets.js test-api.js
git commit -m "fix: GET /api/timesheets/:code answers 200 [] for an admin when no actuals exist"
```

---

### Task 4: `skipEmpty` for the `costgrid.js` callers

**Files:**
- Modify: `js/api-sync.js` (`_pushProjectToApiDetailed`, `_pushProjectToApi`), `js/costgrid.js:1073` and `:1276`
- Modify (version bumps): `costgrid.html`, `pipeline.html`, `planning.html`, `portfolio.html`, `project-config.html` (`api-sync.js?v=18` → `19`); `costgrid.html`, `pipeline.html` (`costgrid.js?v=33` → `34`)
- Test: `js/api-sync.test.js`

**Interfaces:**
- Produces: `_pushProjectToApiDetailed(project, { skipEmpty } = {})` and `_pushProjectToApi(project, opts)` (same boolean contract); with `skipEmpty: true` empty sections are not pushed, non-empty ones are.

- [ ] **Step 1: Write the failing tests**

Append to `js/api-sync.test.js`. First change `loadSync()`'s return so both functions are exposed (it already returns both). Then add:

```js
describe('skipEmpty', () => {
  beforeEach(() => { calls = []; failing = new Set(); });

  it('does not push empty sections, but still pushes non-empty ones', async () => {
    const { _pushProjectToApiDetailed } = loadSync();
    const r = await _pushProjectToApiDetailed(
      { ...base, tasks: [{ name: 't' }], phasing: {}, ptc: [], planning: { '2026-09': 5 }, groups: [] },
      { skipEmpty: true });
    expect(r.ok).toBe(true);
    expect(calls).toEqual(['update', 'saveTasks', 'planning']);
  });

  it('pushes empty sections when the option is absent (project-config clearing a section)', async () => {
    const { _pushProjectToApiDetailed } = loadSync();
    await _pushProjectToApiDetailed({ ...base, tasks: [], phasing: {}, ptc: [], planning: {}, groups: [] });
    expect(calls).toEqual(['update', 'saveTasks', 'phasing', 'ptc', 'planning', 'groups']);
  });

  it('_pushProjectToApi forwards the option and keeps its boolean contract', async () => {
    const { _pushProjectToApi } = loadSync();
    expect(await _pushProjectToApi({ ...base, tasks: [], phasing: {} }, { skipEmpty: true })).toBe(true);
    expect(calls).toEqual(['update']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run js/api-sync.test.js` (inside the worktree)
Expected: the `skipEmpty` cases FAIL (empty sections are still pushed).

- [ ] **Step 3: Implement in `js/api-sync.js`**

Change the signature and the steps loop of `_pushProjectToApiDetailed`:

```js
async function _pushProjectToApiDetailed(project, { skipEmpty = false } = {}) {
```

Replace the `steps` block and loop (currently `const steps = [...]` through the `for` loop) with:

```js
  // skipEmpty: costgrid.js callers re-send a whole, possibly stale, in-memory project and never edit these
  // sections, so for them "empty" means "not touched" and must not overwrite the server's data (2026-09-30).
  const nonEmpty = v => Array.isArray(v) ? v.length > 0 : v != null && typeof v === 'object' && Object.keys(v).length > 0;
  const present  = v => Array.isArray(v) || (v != null && typeof v === 'object');
  const wanted   = v => skipEmpty ? nonEmpty(v) : present(v);
  const failed = [];
  const steps = [
    ['tasks',    tasks,    () => Api.projects.saveTasks(project.id, tasks)],
    ['phasing',  phasing,  () => Api.projects.phasing(project.id, phasing)],
    ['ptc',      ptc,      () => Api.projects.ptc(project.id, ptc)],
    ['planning', planning, () => Api.projects.planning(project.id, planning)],
    ['groups',   groups,   () => Api.projects.groups(project.id, groups)],
  ];
  for (const [part, value, run] of steps) {
    if (!wanted(value)) continue;
    try { await run(); }
    catch (e) {
      console.warn(`[sync] ${part} save failed:`, e.message);
      failed.push({ part, error: e.message });
    }
  }
  return { ok: failed.length === 0, failed };
```

(Keep the long comment about "a section is pushed whenever the project object carries it" above the block; adjust its last sentence to mention `skipEmpty`.) Update the wrapper:

```js
async function _pushProjectToApi(project, opts) {
  const { failed } = await _pushProjectToApiDetailed(project, opts);
  return !failed.some(f => f.part === 'project');
}
```

In `js/costgrid.js` change both calls:

```js
  await _pushProjectToApi(proj, { skipEmpty: true }).catch(e => console.warn('[sync] addTasksToProject failed:', e.message));
```
```js
    pushedOk = await _pushProjectToApi(newProject, { skipEmpty: true });
```

Bump the `?v=` numbers named under **Files** (`sed` across the five/two pages, then `grep -rn "api-sync.js?v\|costgrid.js?v" --include=*.html .` and confirm every hit shows 19 / 34).

- [ ] **Step 4: Run the whole frontend suite**

Run: `npm test` — Expected: all pass (281 before this task plus the 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add js/api-sync.js js/api-sync.test.js js/costgrid.js costgrid.html pipeline.html planning.html portfolio.html project-config.html
git commit -m "fix: costgrid.js pushes projects with skipEmpty so a stale copy cannot wipe sections"
```

---

### Task 5: `toggleTag` rollback only for the version it was sent for

**Files:**
- Modify: `costgrid.html` (`toggleTag`, l. ~1129-1156; inline script, no `?v=` bump)

There is no unit-testable seam (inline Vue method); it is covered by the browser check in Task 6.

- [ ] **Step 1: Implement**

In `toggleTag`, add the capture next to the snapshot and guard the rollback:

```js
      const prevItemIds = [...this.versionTagItemIds];
      const prevRows = [...this.versionTagRows];
      const savingForVerId = this.verId;   // the rollback below must not paint this version's tags on another one
```

```js
      } catch (e) {
        console.warn('[costgrid] saveTags:', e.message);
        if (this.verId === savingForVerId) {
          this.versionTagItemIds = prevItemIds;
          this.versionTagRows = prevRows;
        }
      } finally {
```

- [ ] **Step 2: Run the frontend suite (nothing should change)**

Run: `npm test` — Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add costgrid.html
git commit -m "fix: costgrid toggleTag rolls back only while the same version is open"
```

---

### Task 6: Test cases, docs and manual verification

**Files:**
- Modify: `TEST_CASES.md` and `test-cases.html` (mirror, same ids), `docs/pages/costgrid.md`, `docs/pages/project-config.md`, `docs/api/timesheets.md`
- (CLAUDE.md / ARCHITECTURE.md / memory are handled by `/sync-docs` in `/finish-cycle`.)

- [ ] **Step 1: Add the test cases**

Read the tail of `TEST_CASES.md` and of `test-cases.html` (section array format), then add a section "27. Hardening (2026-09-30)" to both with: `HD-01` the nine cross-grid routes → 404 (automated `VS-01..VS-13`, Auto ✓); `HD-02` PATCH project non-UUID → 400 (automated `PV-01..PV-05` ✓); `HD-03` admin no actuals → `200 []`, plain user → 403 (automated `TS-01/02` ✓); `HD-04` (manual) tag `PUT` fails after a version switch: open a version with a tag, in the console make `PUT .../tags` answer 500 after a 2-second delay (`fetch` override), click a tag, switch to another version within 2 s → the other version's tags and checkboxes stay as loaded; `HD-05` (manual) `project-config.html` for a project without actuals → no 403 in the console for an admin; `HD-06` (manual) two-tab stale copy: tab 1 `costgrid.html`, tab 2 `project-config.html` sets a phasing and saves, tab 1 "Add tasks to project" → the phasing is still there after reopening `project-config.html`; `HD-07` (manual) regression walk of `costgrid.html`: open, switch versions, duplicate, link a project, delete a Draft version, refresh rate, add tasks, Generate project — all work.

- [ ] **Step 2: Update the page docs**

- `docs/pages/costgrid.md`: a short dated section: the version routes are scoped to their grid (404), `toggleTag` rollback guard, `skipEmpty` callers.
- `docs/pages/project-config.md`: add the decision that `config.projects` is a page-level cache that a failed save does not roll back (D7), and that the admin's 403 on missing actuals is gone.
- `docs/api/timesheets.md`: `GET /:projectCode` admin rule.

- [ ] **Step 3: Full verification**

Run, in order: `npm test`; `bash scripts/run-tests.sh` (all green); `bash scripts/test-branch.sh up`, then the manual cases `HD-04..HD-07` on `http://localhost:8081`. Leave the branch stack running: it is torn down only after the user's own "yes" at `/finish-cycle` Gate 2.

- [ ] **Step 4: Commit and close**

```bash
git add TEST_CASES.md test-cases.html docs/pages/costgrid.md docs/pages/project-config.md docs/api/timesheets.md
git commit -m "docs: test cases and notes for the hardening cycle"
```

Then run `/finish-cycle`.
