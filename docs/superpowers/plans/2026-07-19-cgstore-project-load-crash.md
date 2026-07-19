# Fix `_cgStore` ReferenceError Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `_apiProjectToLocal()` from crashing `loadConfigFromApi()` on any page that doesn't load `js/costgrid.js` (currently `portfolio.html`, `project-config.html`), by resolving `cg_id` server-side instead of via the client-side `_cgStore` global.

**Architecture:** `GET /api/projects` gains a `LEFT JOIN` to `cost_grid_versions` and returns `cg_id` directly in its response. `_apiProjectToLocal()` reads `p.cg_id` instead of calling `_resolveCgIdForVersion()`. No new files, no new endpoint, no schema change.

**Tech Stack:** Express + `pg` (raw SQL, no ORM), vanilla JS classic scripts (no build step).

## Global Constraints

- No DB schema change — `cost_grid_versions.cost_grid_id` is an existing FK.
- No new `js/lib/*` module — this is a query change + a mapper simplification, not complex pure logic worth its own extraction/test module.
- `_resolveCgIdForVersion()`/`_cgStore` (`js/api-sync.js:202-209`, `js/costgrid.js:9`) are NOT modified — they remain for their original callers (`pipeline-board.js`, `planning.js`, the cost-grid editor), all of which correctly load `js/costgrid.js`.
- `_apiProjectToLocal()` uses `p.cg_id` directly with no client-side fallback to `_resolveCgIdForVersion` — single source of truth (confirmed decision, not a defense-in-depth dual path).
- `costGridRef`'s object shape (`{ cgId, versionId } | null`) is unchanged — only the source of `cgId` changes.
- `cardData()`'s use of `costGridRef.versionId` (`portfolio.html:1025`) is untouched — that field already comes from `p.cg_version_id` directly, not from the buggy path.

---

## File Structure

- Modify: `api/src/routes/projects.js:37-87` (`GET /api/projects` — add JOIN + field)
- Modify: `js/api-sync.js:212-234` (`_apiProjectToLocal` — read `p.cg_id` instead of calling `_resolveCgIdForVersion`)

---

### Task 1: Backend — resolve `cg_id` via JOIN in `GET /api/projects`

**Files:**
- Modify: `api/src/routes/projects.js:37-87`

**Interfaces:**
- Consumes: existing `cost_grid_versions` table, column `cost_grid_id` (confirmed via `\d cost_grid_versions`: `cost_grid_id | uuid | not null`).
- Produces: `GET /api/projects`'s JSON response array now includes a `cg_id` field (string UUID or `null`) per project, alongside the existing `cg_version_id` field. Task 2 consumes this field by name.

- [ ] **Step 1: Add the JOIN and the `cg_id` field to the query**

Open `api/src/routes/projects.js`. Find the `GET /api/projects` handler (starts at line 37, the `router.get('/', requireAuth, ...)` block). Replace the `query(...)` call's SQL (currently lines 56-83) with:

```js
    const { rows } = await query(
      `SELECT p.id, p.code, p.name, p.program_id, p.client_id, p.pipeline, p.status,
              p.start_date, p.end_date, p.currency, p.cg_version_id, cgv.cost_grid_id AS cg_id, p.created_at,
              p.owner_id, p.phasing, p.ptc, p.planning, p.groups,
              ${myPermCol}
              u.first_name || ' ' || u.last_name AS owner_name,
              c.name AS client_name,
              pr.name AS program_name,
              COALESCE(
                (SELECT json_agg(json_build_object(
                   'name',                 pt.name,
                   'billable',             pt.billable,
                   'completed',            pt.completed,
                   'startDate',            pt.start_date,
                   'endDate',              pt.end_date,
                   'monthlyDistribution',  pt.monthly_distribution,
                   'resources',            pt.resources
                 ) ORDER BY pt.sort_order)
                 FROM project_tasks pt WHERE pt.project_id = p.id),
                '[]'::json
              ) AS tasks
       FROM projects p
       JOIN users u ON u.id = p.owner_id
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN programs pr ON pr.id = p.program_id
       LEFT JOIN cost_grid_versions cgv ON cgv.id = p.cg_version_id
       WHERE 1=1 ${visibilityClause}
       ORDER BY p.name`,
      isAdmin ? [] : [req.user.id]
    );
```

The only changes from the current code: `cgv.cost_grid_id AS cg_id` added to the `SELECT` list (right after `p.cg_version_id`), and `LEFT JOIN cost_grid_versions cgv ON cgv.id = p.cg_version_id` added to the `FROM` chain (after the `programs` join, before `WHERE`). Everything else — `visibilityClause`, `myPermCol`, the `tasks` subquery, `ORDER BY`, the parameter array — is unchanged.

- [ ] **Step 2: Restart the API container and verify the response shape**

```bash
docker compose restart api
```

Wait for it to report healthy:
```bash
docker inspect pdash-api --format '{{.State.Health.Status}}'
```
Expected: `healthy` (poll a few seconds apart if not immediately healthy).

- [ ] **Step 3: Verify against the live DB — every project's `cg_id` resolves correctly**

Run this to confirm the JOIN logic is correct, independent of the API:

```bash
docker exec pdash-db psql -U pdash -d pdash -c "
SELECT p.id, p.name, p.cg_version_id, cgv.cost_grid_id AS cg_id
FROM projects p
LEFT JOIN cost_grid_versions cgv ON cgv.id = p.cg_version_id
ORDER BY p.name;
"
```

Expected: every row where `cg_version_id` is non-null has a matching non-null `cg_id`; every row where `cg_version_id` is null has `cg_id` as null too. No row should show a non-null `cg_version_id` with a null `cg_id` (that would mean an orphaned version reference — investigate before proceeding if this occurs, but is not expected given the FK).

- [ ] **Step 4: Verify the live HTTP endpoint returns `cg_id`**

Mint a short-lived test JWT using the running container's own secret (safe — expires in 5 minutes, never stored) and hit the real endpoint through nginx:

```bash
TOKEN=$(docker exec pdash-api node -e "
const jwt = require('jsonwebtoken');
console.log(jwt.sign({ id: 'ADMIN_USER_ID', email: 'test@test.local', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '5m' }));
")
curl -s --cookie "pdash_token=$TOKEN" http://localhost/api/projects | node -e "
let data = '';
process.stdin.on('data', d => data += d);
process.stdin.on('end', () => {
  const rows = JSON.parse(data);
  console.log('Total projects:', rows.length);
  console.log('Sample cg_id values:', rows.slice(0, 3).map(r => ({ id: r.id, cg_version_id: r.cg_version_id, cg_id: r.cg_id })));
});
"
```

Replace `ADMIN_USER_ID` with a real admin user's `id` (query `SELECT id FROM users WHERE role='admin' LIMIT 1;` if needed, or reuse whichever admin user you tested with previously). Expected: the response includes a `cg_id` field on each row, matching what Step 3's direct SQL query showed for the same project IDs.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/projects.js
git commit -m "fix(api): resolve cg_id via JOIN in GET /api/projects

Adds a LEFT JOIN to cost_grid_versions so the client can read a
project's linked cost-grid ID directly from the API response,
instead of resolving it from the in-memory _cgStore global (which
is only populated on pages that load js/costgrid.js)."
```

---

### Task 2: Frontend — `_apiProjectToLocal` reads `p.cg_id` directly

**Files:**
- Modify: `js/api-sync.js:212-234`

**Interfaces:**
- Consumes: `p.cg_id` (Task 1's new field), `p.cg_version_id` (already existed).
- Produces: `config.projects[].costGridRef` shape unchanged (`{ cgId, versionId } | null`); no longer throws for any project on a page without `js/costgrid.js` loaded.

- [ ] **Step 1: Read the current `_apiProjectToLocal` function**

Open `js/api-sync.js`, lines 212-234:

```js
function _apiProjectToLocal(p) {
  const versionId = p.cg_version_id || null;
  const cgId      = versionId ? _resolveCgIdForVersion(versionId) : null;
  return {
    id:         p.id,
    code:       p.code         || '',
    name:       p.name         || '',
    programId:  p.programId    || p.program_id  || '',
    clientId:   p.clientId     || p.client_id   || '',
    startDate:  p.startDate    || p.start_date  || '',
    endDate:    p.endDate      || p.end_date    || '',
    currency:   ({ EUR: '€', USD: '$', GBP: '£' }[p.currency] || p.currency || '€'),
    pipeline:   p.pipeline     || '',
    status:     p.status       || '',
    tasks:      Array.isArray(p.tasks) ? p.tasks : [],
    phasing:    p.phasing      || {},
    planning:   p.planning     || {},
    ptc:        p.ptc          || [],
    groups:     p.groups       || [],
    costGridRef:  versionId ? { cgId, versionId } : null,
    my_permission: p.my_permission || 'owner',
  };
}
```

- [ ] **Step 2: Replace the `cgId` line to read the server-provided field**

Change:
```js
  const versionId = p.cg_version_id || null;
  const cgId      = versionId ? _resolveCgIdForVersion(versionId) : null;
```
to:
```js
  const versionId = p.cg_version_id || null;
  const cgId      = p.cg_id || null;
```

The rest of the function (the `return { ... }` block, including `costGridRef: versionId ? { cgId, versionId } : null`) is unchanged — `cgId` is still the same local variable name, now sourced differently.

- [ ] **Step 3: Confirm `_resolveCgIdForVersion` has no other callers that would be affected**

```bash
grep -n "_resolveCgIdForVersion" js/*.js
```

Expected: only its own definition (`js/api-sync.js:203`) remains as a match — confirming this was its only call site, and `js/api-sync.js`'s own file no longer calls it (the function itself stays defined and unused within this file, since removing the function definition entirely is out of scope per this plan's Global Constraints — it's not this task's job to determine whether it's fully dead code elsewhere; leave the function in place).

- [ ] **Step 4: Run the full frontend test suite**

```bash
npm test
```

Expected: all existing tests still pass (this change touches no `js/lib/*` file, so no test file is expected to need updates — if any test fails, investigate before proceeding, since this change should be a no-op for every existing test).

- [ ] **Step 5: Manual verification — confirm `portfolio.html` loads real projects**

This requires Task 1's backend fix to already be live (container restarted, Step 2 of Task 1 done). Open `http://localhost/portfolio.html` in a browser. Expected: the overview shows real project cards (not "No projects configured"). Open the browser console and run:
```js
config.projects.length
```
Expected: matches the real project count (9, per the live DB at the time this plan was written — re-verify the current count if projects have been added/removed since).

- [ ] **Step 6: Manual verification — confirm `project-config.html` resolves a real project**

Navigate to `http://localhost/project-config.html?projectId=<a-real-project-id-with-a-cost-grid-link>` (use one of the IDs from Task 1 Step 3's query output where `cg_id` is non-null). Expected: the form loads with the project's real data, not "Project not found". Confirm the Pipeline `<select>` is disabled (locked) for this cost-grid-linked project.

- [ ] **Step 7: Commit**

```bash
git add js/api-sync.js
git commit -m "fix(frontend): _apiProjectToLocal reads cg_id from the API response

Removes the dependency on _cgStore/_resolveCgIdForVersion, which
threw a ReferenceError on any page that doesn't load js/costgrid.js
(portfolio.html, project-config.html), silently emptying
config.projects on those pages for every project with a
cg_version_id."
```

---

## Self-Review Notes

- **Spec coverage:** the design's two components (backend JOIN, frontend field read) each map to one task. The design's "no fallback to `_resolveCgIdForVersion`" decision is reflected in Task 2 Step 2 (`_resolveCgIdForVersion` is not called anywhere in the new code). The design's backward-compatibility claims (pipeline.html/planning.html/costgrid.html unaffected; `project-config.html`'s `pipelineLocked` restored) are covered by Task 2 Steps 3 and 6.
- **Placeholder scan:** no TBD/TODO; every step has exact code or exact commands with expected output.
- **Type consistency:** `costGridRef: { cgId, versionId } | null` — the shape and field names are identical before and after this fix; only Task 2's `cgId` computation changes. `cg_id` (Task 1's new API field) is read verbatim by name in Task 2 — confirmed matching.
- **Scope:** two small, independently-committable tasks touching one backend file and one frontend file — no decomposition into separate plans needed.
