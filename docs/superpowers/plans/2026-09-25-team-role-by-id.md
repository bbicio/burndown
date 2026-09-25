# Team Role by ID Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link each team resource to its role by `roles.id` (replacing the free-text `job_title`), so the dropdown stores the right thing and role changes propagate.

**Architecture:** Migration `025` adds `resources.role_id → roles.id` (RESTRICT), backfills from `job_title` (by `roles.code`, then `roles.label`), fails loudly on any unmatched row, then sets `NOT NULL` and drops `job_title`. `resources.js` takes/returns the role by id; `DELETE /api/roles/:id` gains a guard for roles assigned to a resource; `team.html` shows `label (code)` in a select whose value is the role id.

**Tech Stack:** Node.js/Express, PostgreSQL 16, Vue 3 (CDN, no build), integration tests in `test-api.js` via `scripts/run-tests.sh`.

**Spec:** `docs/superpowers/specs/2026-09-25-team-role-by-id-design.md`.

## Global Constraints

- No bundler/build step; all user-facing text in English.
- Migration numbered after `024` → `025_resource_role_id.sql`; must be re-runnable (a second run is a no-op).
- `?v=N` rule: this plan modifies **no** `js/*.js`, `js/lib/*.js` or `css/*.css` file (only `team.html`, `api/src/**`, `test-api.js`, a migration) — **no bump needed**; re-verify with `git diff --name-only main -- js css`.
- The XLS-role ↔ `roles.code` match in the timesheet upload stays string-based (unchanged); only resource ↔ role goes by id.
- Permissions unchanged: all `/api/resources*` routes stay `requireAdmin`.
- Never run `docker compose` against the main stack (see `CLAUDE.md` "Infrastructure safety"); verify with `scripts/run-tests.sh` / `scripts/test-branch.sh`. In a worktree copy the gitignored `.env` in first, run repo scripts with Git Bash (`& "C:\Program Files\Git\bin\bash.exe" scripts/...`), and remember `test-branch.sh up` does **not** apply a new migration to the cloned DB (apply `025` by hand to the branch DB container only).

## Review Focus

- **Migration with an unmatched `job_title`** must abort with an explicit error and change nothing — not silently null the role. Verified manually in Task 4 (needs DB access the HTTP suite lacks).
- **Migration re-run** must be a no-op once `job_title` is gone. Verified manually in Task 4.
- **Malformed / empty / unknown `roleId`** on `POST` and `PATCH` → 400, never 500. Pinned by TM-12 and TM-14.
- **Deleting a role that a resource uses** → 400 with a clear message, not a 500 from the FK. Pinned by TM-16.
- **Renaming a role's label/code** shows on the resource with no other action (by-id link). Pinned by TM-15.
- **A linked-user FK error must not be reported as a role error** (both are `23503`). Pinned by TM-12's unknown-user case.

---

### Task 1: Migration and `resources.js` (role by id)

**Files:**
- Create: `api/src/db/migrations/025_resource_role_id.sql`
- Modify: `api/src/routes/resources.js` (`GET /`, `POST /`, `PATCH /:id`)
- Modify: `test-api.js` (`testResourcesAndAttributeLists`, `testResourceMatching`)

**Interfaces:**
- Consumes: `roles(id, label, code)`, `resources` (migration `020`).
- Produces: column `resources.role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT`; `job_title` gone. `GET /api/resources` rows: `role_id`, `role_label`, `role_code` (no `job_title`). `POST`/`PATCH` bodies use `roleId`. A helper `makeTestRole(tag)` in `test-api.js` returning `{ id, label, code }` (used here and by later tests).

- [ ] **Step 1: Update and extend the tests (they must fail first)**

In `test-api.js`, add this helper next to `uploadCsv()`:

```js
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
```

In `testResourcesAndAttributeLists`, replace the block from `const email = ...` through the end of the `if (resourceId) { ... }` block (just before `// ── Attribute Lists ──`) with:

```js
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
  }
```

In `testResourceMatching`, replace the resource creation call (the `api('POST', '/api/resources', { firstName: 'Mario', lastName: last, email: ..., jobTitle: 'Consultant' }, adminCookie)`) with:

```js
  const matchRole = await makeTestRole(`M${ts}`);
  const rRes = await api('POST', '/api/resources',
    { firstName: 'Mario', lastName: last, email: `mario.${ts}@test.local`, roleId: matchRole.id }, adminCookie);
```

(the line `const rRes = await api('POST', '/api/resources', ...)` is the only place `jobTitle` remains in `test-api.js`; afterwards `grep -n jobTitle test-api.js` must return nothing).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `& "C:\Program Files\Git\bin\bash.exe" scripts/run-tests.sh`
Expected: FAIL — `TM-04` (the API still requires `jobTitle` → 400), `TM-12…TM-15`, and every `MA-*` test that needs a resource fail.

- [ ] **Step 3: Write the migration**

```sql
-- Team resource → role by id (was free-text job_title, which the UI filled with roles.label
-- although the role strings in uploaded actuals are roles.code). Re-runnable: once job_title is
-- gone the DO block does nothing.
ALTER TABLE resources ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id) ON DELETE RESTRICT;

DO $$
DECLARE
  unmatched INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'resources' AND column_name = 'job_title'
  ) THEN
    UPDATE resources r SET role_id = COALESCE(
      (SELECT ro.id FROM roles ro WHERE lower(btrim(ro.code)) = lower(btrim(r.job_title)) LIMIT 1),
      (SELECT ro.id FROM roles ro WHERE lower(btrim(ro.label)) = lower(btrim(r.job_title)) ORDER BY ro.code LIMIT 1)
    )
    WHERE r.role_id IS NULL;

    SELECT count(*) INTO unmatched FROM resources WHERE role_id IS NULL;
    IF unmatched > 0 THEN
      RAISE EXCEPTION 'Migration 025: % resource(s) have a job_title that matches no roles.code or roles.label — create the role or fix/delete those resources, then re-run', unmatched;
    END IF;

    ALTER TABLE resources ALTER COLUMN role_id SET NOT NULL;
    ALTER TABLE resources DROP COLUMN job_title;
  END IF;
END $$;
```

- [ ] **Step 4: Update `resources.js`**

Replace the `GET /` handler's query with:

```js
    const { rows } = await query(
      `SELECT r.id, r.first_name, r.last_name, r.email, r.job_description,
              r.role_id, ro.label AS role_label, ro.code AS role_code,
              r.user_id, r.status, r.created_at,
              u.first_name AS linked_user_first_name,
              u.last_name  AS linked_user_last_name,
              u.email      AS linked_user_email
       FROM resources r
       JOIN roles ro ON ro.id = r.role_id
       LEFT JOIN users u ON u.id = r.user_id
       ORDER BY r.last_name, r.first_name`
    );
```

Add this small helper near `rescanAll()` (top of the file):

```js
// Both role_id and user_id are FKs on `resources`; tell them apart by constraint name.
function fkErrorMessage(err) {
  return /role_id/.test(err.constraint || '') ? 'Role not found' : 'Linked user not found';
}
```

Replace the `POST /` handler with:

```js
router.post('/', async (req, res, next) => {
  try {
    const { firstName, lastName, email, roleId, jobDescription, userId } = req.body;
    if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !roleId) {
      return res.status(400).json({ error: 'firstName, lastName, email and roleId are required' });
    }
    const { rows } = await query(
      `INSERT INTO resources (first_name, last_name, email, role_id, job_description, user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, first_name, last_name, email, role_id, job_description, user_id, status, created_at`,
      [firstName.trim(), lastName.trim(), email.trim(), roleId, jobDescription?.trim() || null, userId || null]
    );
    await rescanAll();
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ error: fkErrorMessage(err) });
    if (err.code === '22P02') return res.status(400).json({ error: 'roleId and userId must be valid UUIDs' });
    next(err);
  }
});
```

In `PATCH /:id`: change the destructuring to `const { firstName, lastName, email, roleId, jobDescription, userId, status } = req.body;`, replace the `jobTitle` block with:

```js
    if (roleId !== undefined) {
      if (!roleId) return res.status(400).json({ error: 'roleId cannot be empty' });
      fields.push(`role_id = $${i++}`); values.push(roleId);
    }
```

change its `RETURNING` list to `id, first_name, last_name, email, role_id, job_description, user_id, status, created_at`, and replace its `catch` with:

```js
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ error: fkErrorMessage(err) });
    if (err.code === '22P02') return res.status(400).json({ error: 'roleId and userId must be valid UUIDs' });
    next(err);
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `& "C:\Program Files\Git\bin\bash.exe" scripts/run-tests.sh`
Expected: all `TM-*` and `MA-*` assertions pass and the whole suite is green (no `jobTitle` left in `test-api.js`).

- [ ] **Step 6: Commit**

```bash
git add api/src/db/migrations/025_resource_role_id.sql api/src/routes/resources.js test-api.js
git commit -m "feat: link team resources to roles by id (migration 025)"
```

---

### Task 2: Guard role deletion

**Files:**
- Modify: `api/src/routes/config.js` (`DELETE /roles/:id`, ~line 265)
- Modify: `test-api.js` (`testResourcesAndAttributeLists`, inside the `if (resourceId)` block after TM-15)

**Interfaces:**
- Consumes: `resources.role_id` (Task 1).
- Produces: `DELETE /api/roles/:id` → 400 `{ error: 'Cannot delete role assigned to a team resource' }` while any resource references the role.

- [ ] **Step 1: Write the failing test**

Add after the TM-15 assertion (still inside `if (resourceId) { ... }`):

```js
    // TM-16: a role assigned to a resource cannot be deleted (400 with a clear message, not a 500)
    const rDelBlocked = await api('DELETE', `/api/roles/${roleB.id}`, null, adminCookie);
    ok(rDelBlocked.status === 400 && /team resource/i.test(rDelBlocked.data?.error || ''),
      'TM-16 DELETE a role assigned to a team resource → 400 with a clear message');
    const rMoveOff = await api('PATCH', `/api/resources/${resourceId}`, { roleId: roleA.id }, adminCookie);
    ok(rMoveOff.status === 200, 'TM-16 setup: resource moved off the role');
    ok((await api('DELETE', `/api/roles/${roleB.id}`, null, adminCookie)).status === 200,
      'TM-16 the role can be deleted once no resource uses it');
```

- [ ] **Step 2: Run to verify it fails**

Run: `& "C:\Program Files\Git\bin\bash.exe" scripts/run-tests.sh`
Expected: FAIL — `TM-16` first assertion gets 500 (FK violation), not 400.

- [ ] **Step 3: Implement the guard**

Replace the `DELETE /roles/:id` handler in `api/src/routes/config.js` with:

```js
router.delete('/roles/:id', requireAdmin, async (req, res, next) => {
  try {
    const linked = await query(
      'SELECT COUNT(*) FROM task_roles WHERE role_id = $1',
      [req.params.id]
    );
    if (parseInt(linked.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete role used in cost grids' });
    }
    const assigned = await query(
      'SELECT COUNT(*) FROM resources WHERE role_id = $1',
      [req.params.id]
    );
    if (parseInt(assigned.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete role assigned to a team resource' });
    }
    await query('DELETE FROM roles WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    // A resource assigned to this role between the check and the delete: same answer, not a 500.
    if (err.code === '23503') return res.status(400).json({ error: 'Cannot delete role assigned to a team resource' });
    next(err);
  }
});
```

- [ ] **Step 4: Run to verify it passes**

Run: `& "C:\Program Files\Git\bin\bash.exe" scripts/run-tests.sh`
Expected: `TM-16` assertions pass; suite green.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/config.js test-api.js
git commit -m "fix: block deleting a role assigned to a team resource"
```

---

### Task 3: `team.html` — role select

**Files:**
- Modify: `team.html` (table header/cell at lines ~43/53; modal select at ~164-173; `filteredResources`; `blankForm`; `openEdit`; `submitForm`)

**Interfaces:**
- Consumes: `GET /api/resources` rows with `role_id`/`role_label`/`role_code`; `GET /api/roles` rows `{ id, label, code }` (already loaded into `roles`); `POST`/`PATCH` with `roleId` (Task 1).
- Produces: nothing consumed elsewhere. No versioned file changes.

There is no frontend test harness for this page; it is verified manually in Task 4.

- [ ] **Step 1: Table column and search**

Change the header `<th>Job title</th>` to `<th>Role</th>` and the cell `<td>{{ r.job_title }}</td>` to:

```html
                <td>{{ r.role_label }} <span class="text-muted small">({{ r.role_code }})</span></td>
```

In `filteredResources`, extend the haystack: 

```js
            const hay = `${r.first_name} ${r.last_name} ${r.email} ${r.role_label} ${r.role_code}`.toLowerCase();
```

- [ ] **Step 2: Modal select**

Replace the whole "Job title" `<div class="col-12">` block (the `<label>Job title</label>`, the `<select v-model="form.jobTitleSelect">…` and the `Other…` `<input>`) with:

```html
                <div class="col-12">
                  <label class="form-label">Role</label>
                  <select v-model="form.roleId" class="form-select" required>
                    <option value="" disabled>Select a role…</option>
                    <option v-for="role in roles" :key="role.id" :value="role.id">{{ role.label }} ({{ role.code }})</option>
                  </select>
                </div>
```

- [ ] **Step 3: Form state, edit and submit**

`blankForm()` becomes:

```js
        blankForm() {
          return { id: null, firstName: '', lastName: '', email: '', roleId: '',
                    jobDescription: '', userId: null, status: 'active', loading: false, error: null };
        },
```

`openEdit(r)` becomes:

```js
        openEdit(r) {
          this.form = {
            id: r.id, firstName: r.first_name, lastName: r.last_name, email: r.email,
            roleId: r.role_id,
            jobDescription: r.job_description || '', userId: r.user_id, status: r.status,
            loading: false, error: null,
          };
          this._resourceModal.show();
        },
```

In `submitForm()`, replace the two lines that compute/validate `jobTitle` and the `payload` with:

```js
          if (!this.form.roleId) { this.form.error = 'Role is required'; this.form.loading = false; return; }
          const payload = {
            firstName: this.form.firstName, lastName: this.form.lastName, email: this.form.email,
            roleId: this.form.roleId, jobDescription: this.form.jobDescription, userId: this.form.userId,
          };
```

- [ ] **Step 4: Confirm nothing stale remains and no versioned file changed**

Run: `grep -n "jobTitle\|job_title\|__other__" team.html` (Grep tool) — expected: no matches. Run `git diff --name-only main -- js css` — expected: no output.

- [ ] **Step 5: Commit**

```bash
git add team.html
git commit -m "feat: team page selects the role by id (label + code)"
```

---

### Task 4: Verification and handoff

**Files:** none modified (fixes go back to the owning task).

- [ ] **Step 1: Full suites**

Run: `npm test`, `node --test (Get-ChildItem api/src/lib/*.test.js | ForEach-Object { $_.FullName })`, then `& "C:\Program Files\Git\bin\bash.exe" scripts/run-tests.sh`.
Expected: all green.

- [ ] **Step 2: Migration behavior on a throw-away DB (Review Focus)**

Use the isolated branch stack (`scripts/test-branch.sh up`; **apply `025` by hand to the branch DB container only** — it is not applied automatically). Before applying, against the branch DB:
1. Insert a resource with a matching `job_title` (e.g. copy a real `roles.code`) and one with a non-matching one; apply `025` → expected: `ERROR: Migration 025: 1 resource(s) have a job_title that matches no roles.code or roles.label…`, `job_title` still present.
2. Delete the non-matching row and re-apply → expected: success, the remaining row has its `role_id`, `job_title` is gone.
3. Apply `025` again → expected: no error, no change.

- [ ] **Step 3: Manual UI check (`team.html`)**

Create a resource with the role select (options read `label (code)`, no "Other…"); the table shows label with the code beside it; edit → the current role is preselected; save without a role → "Role is required"; in Config → Roles rename that role's label → Team shows the new label; try to delete that role in Config → error message "Cannot delete role assigned to a team resource".

- [ ] **Step 4: Before merge, on the real DB**

`/finish-cycle` Gate 4 applies `025` to the real `pdash-db`. First confirm `SELECT count(*) FROM resources` (expected 0). If it is not 0, the migration may abort with the explicit error above — stop and resolve the rows, do not force it.

- [ ] **Step 5: Hand off to `/finish-cycle`**

`/sync-docs` must cover: `CLAUDE.md` (migration `025`; the `resources.js` entry), `ARCHITECTURE.md` (`resources` schema comment, the resources endpoint rows, migration list), `docs/api/resources.md` and `docs/pages/team.md` (the "known defect" paragraphs become resolved), `TEST_CASES.md`/`test-cases.html` (`TM-04…TM-07` rewritten: role select instead of job title, `TM-05` "custom job title" removed, new `TM-12…TM-16`), `PRD.md` §16.7 (job title → role by id, no "Other…") and the operational-manual skill's §16.7 reference.
