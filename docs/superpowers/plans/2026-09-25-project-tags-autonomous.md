# Project Tags Autonomous (Cycle 3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a project's tags be edited directly from the project page even when it is linked to a proposal, seeding them once from the proposal, and harden the tag routes.

**Architecture:** `project_tags` becomes the only source of project tags. When a project first gets a `cg_version_id` (on `POST /api/projects` or a null → value `PATCH`), a single-statement helper copies the version's tags into `project_tags` only if the project has none. The 409 guard and the frontend read-only/proposal-read paths are removed. The cost-grid tag routes verify that `:vId` belongs to `:id`, and both replace-all routes use `unnest($n::uuid[])`. A one-shot idempotent migration backfills already-linked projects.

**Tech Stack:** Node.js/Express, PostgreSQL 16, Vue 3 (CDN, no build), integration tests in `test-api.js` run via `scripts/run-tests.sh`.

**Spec:** `docs/superpowers/specs/2026-09-25-resource-profile-design.md` §3 (sub-cycle 3a).

## Global Constraints

- No bundler/build step; runtime files served as-is.
- All user-facing text in English.
- Migration numbered after `022` → `023_backfill_project_tags.sql`.
- Any modified file that carries a `?v=N` reference must have every reference bumped. This plan modifies **no** `js/*.js`, `js/lib/*.js` or `css/*.css` file (only `project-config.html`, `api/src/**`, `test-api.js`, a migration), so **no `?v=N` bump is needed** — re-verify with a grep before merging.
- `project_tags` is the sole source of project tags; `cost_grid_version_tags` is read only by the copy helper, the backfill, and `costgrid.html`.
- Never run `docker compose` against the main stack (see `CLAUDE.md` "Infrastructure safety"); verify only via `scripts/run-tests.sh` and `scripts/test-branch.sh`. Copy the gitignored `.env` into the worktree before `test-branch.sh up`.

**Deviation from the spec (decided while planning):** the spec says the copy runs "in the same transaction". The project write endpoints (`POST`/`PATCH /api/projects`) are not transactional today, and the frontend (`js/api-sync.js:264-269`) treats a failed `PATCH` as "project missing" and falls back to `POST`, so a copy failure must not surface as an error after the project write succeeded. The helper is therefore one atomic SQL statement, best-effort (logged, never thrown); a missed copy is repaired by re-running the copy statement by hand for that one project (not by re-running migration 023, which would also refill deliberately cleared projects). Code review round 1 also made the `PATCH` read-and-write of `cg_version_id` a single locked transaction (`SELECT … FOR UPDATE`) so overlapping saves cannot both seed (test TAG-19). Update the spec's §3 wording accordingly in Task 2.

## Review Focus

- **Re-save must not resurrect cleared tags.** The frontend pushes `cgVersionId` on *every* project save (`js/api-sync.js:249`), so the copy must trigger only on a null → value transition, not whenever `cgVersionId` is present. Pinned by TAG-16.
- **Linking must not overwrite manual tags.** A standalone project already tagged by hand that is later linked keeps its own tags. Pinned by TAG-15.
- **Foreign `:vId`.** `GET`/`PUT /api/cost-grids/:id/versions/:vId/tags` with a version belonging to a different grid must 404, not read/write the other grid's tags. Pinned by TAG-17.
- **Malformed `itemIds`.** A non-UUID entry must return 400, not 500, on both replace-all routes (the `::uuid[]` cast now raises `22P02`). Pinned by TAG-18.
- **Empty `itemIds`.** `unnest('{}'::uuid[])` inserts nothing, so `[]` must still clear all tags. Pinned by TAG-06 (revised).

---

### Task 1: Backfill migration

**Files:**
- Create: `api/src/db/migrations/023_backfill_project_tags.sql`

**Interfaces:**
- Consumes: `projects.cg_version_id`, `cost_grid_version_tags`, `project_tags` (migration `022`).
- Produces: `project_tags` rows for linked projects that had none. Nothing later depends on it except the manual check in Task 5.

- [ ] **Step 1: Write the migration**

```sql
-- Cycle 3a: project tags are now autonomous from the linked proposal. Seed
-- project_tags once for projects that are already linked to a proposal version
-- and have no tags of their own yet. Idempotent (re-running only fills projects
-- that still have none). Apply once at deploy: a project whose tags were
-- deliberately cleared afterwards would be re-seeded by a second run.
INSERT INTO project_tags (project_id, item_id)
SELECT p.id, cvt.item_id
FROM projects p
JOIN cost_grid_version_tags cvt ON cvt.version_id = p.cg_version_id
WHERE p.cg_version_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM project_tags pt WHERE pt.project_id = p.id)
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Confirm `scripts/run-tests.sh` applies it without error**

Run: `bash scripts/run-tests.sh` (full run happens in Task 5; here only confirm no SQL error is printed during migration application).
Expected: migration loop completes; no `ERROR` from `023_backfill_project_tags.sql`.

- [ ] **Step 3: Commit**

```bash
git add api/src/db/migrations/023_backfill_project_tags.sql
git commit -m "feat: backfill project_tags from linked proposal versions"
```

---

### Task 2: Backend — copy helper, remove 409, unnest, UUID handling (projects.js)

**Files:**
- Modify: `api/src/routes/projects.js` (helpers block near line 33; `POST /` ~113-140; `PATCH /:id` ~143-174; `PUT /:id/tags` ~441-476)
- Modify: `test-api.js` (`testTagLinking`, ~lines 886-956)
- Modify: `docs/superpowers/specs/2026-09-25-resource-profile-design.md` (§3 wording, see Deviation)

**Interfaces:**
- Consumes: `query`, `pool` (already imported in `projects.js`), `cost_grid_version_tags`, `project_tags`.
- Produces: `copyVersionTagsToProject(projectId, versionId): Promise<void>` — module-local in `projects.js`, best-effort. Called by `POST /` and `PATCH /:id`.

- [ ] **Step 1: Update and extend the tests (they must fail first)**

In `test-api.js`, inside `testTagLinking`, replace everything from the `// TAG-05` comment through the end of the `// TAG-06` block (the code from `const rProj = await api('POST', '/api/projects', { name: '__test_tag_proj__' }, adminCookie);` down to the closing `}` of the final `else { ok(false, 'TAG-06 skipped — cost grid version unavailable'); }`) with:

```js
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

  // TAG-18 (project half): a non-UUID itemId is a 400, not a 500
  if (standaloneProjId) {
    ok((await api('PUT', `/api/projects/${standaloneProjId}/tags`, { itemIds: ['not-a-uuid'] }, adminCookie)).status === 400,
      'TAG-18 PUT project tags with a non-UUID itemId → 400');
  }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bash scripts/run-tests.sh`
Expected: FAIL — `TAG-06 PUT tags on a linked project → 200` still 409, `TAG-13` gets no tags, `TAG-18` gets 500.

- [ ] **Step 3: Add the copy helper**

In `api/src/routes/projects.js`, after `canEdit(...)` (line 33) and before `// ── PROJECTS`, add:

```js
// Copies a cost grid version's tags onto a project, only when the project has none yet.
// One atomic statement. Best-effort: the project write it follows has already succeeded
// (and js/api-sync.js treats a failed PATCH as "project missing"), so a failure here is
// logged, not surfaced — re-running migration 023's statement heals a missed copy.
async function copyVersionTagsToProject(projectId, versionId) {
  try {
    await query(
      `INSERT INTO project_tags (project_id, item_id)
       SELECT $1::uuid, cvt.item_id
       FROM cost_grid_version_tags cvt
       WHERE cvt.version_id = $2::uuid
         AND NOT EXISTS (SELECT 1 FROM project_tags pt WHERE pt.project_id = $1::uuid)
       ON CONFLICT DO NOTHING`,
      [projectId, versionId]
    );
  } catch (err) {
    console.warn('[projects] copyVersionTagsToProject:', err.message);
  }
}
```

- [ ] **Step 4: Call it from `POST /`**

In `POST /`, after the `resource_shares` insert and before `res.status(201).json(rows[0]);`, add:

```js
    if (safeCgVersionId) await copyVersionTagsToProject(rows[0].id, safeCgVersionId);
```

- [ ] **Step 5: Call it from `PATCH /:id` on a null → value transition only**

In `PATCH /:id`, after the `if (!fields.length) return ...400` line and before `params.push(req.params.id);`, add:

```js
    const cgTouched = req.body.cgVersionId !== undefined;
    let prevCgVersionId = null;
    if (cgTouched) {
      const prev = await query('SELECT cg_version_id FROM projects WHERE id = $1', [req.params.id]);
      prevCgVersionId = prev.rows[0]?.cg_version_id ?? null;
    }
```

Then after `if (!rows[0]) return res.status(404).json({ error: 'Project not found' });` and before `res.json(rows[0]);`, add:

```js
    // Only the first link seeds tags; js/api-sync.js re-sends cgVersionId on every save.
    if (cgTouched && !prevCgVersionId && req.body.cgVersionId) {
      await copyVersionTagsToProject(req.params.id, req.body.cgVersionId);
    }
```

- [ ] **Step 6: Rewrite `PUT /:id/tags`**

Replace the whole `PUT /:id/tags` handler (comment line through the closing `});`) with:

```js
// PUT /api/projects/:id/tags — replace-all. Project tags are autonomous from the linked
// proposal (Cycle 3a): they are seeded once by copyVersionTagsToProject, then edited here.
router.put('/:id/tags', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { rows: projRows } = await query('SELECT 1 FROM projects WHERE id = $1', [req.params.id]);
    if (!projRows[0]) return res.status(404).json({ error: 'Project not found' });

    const { itemIds = [] } = req.body;
    if (!Array.isArray(itemIds)) return res.status(400).json({ error: 'itemIds must be an array' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM project_tags WHERE project_id = $1', [req.params.id]);
      await client.query(
        `INSERT INTO project_tags (project_id, item_id)
         SELECT $1::uuid, unnest($2::uuid[]) ON CONFLICT DO NOTHING`,
        [req.params.id, itemIds]
      );
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err.code === '23503') return res.status(400).json({ error: 'One or more tag items do not exist' });
      if (err.code === '22P02') return res.status(400).json({ error: 'itemIds must be valid UUIDs' });
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});
```

- [ ] **Step 7: Update the spec wording**

In `docs/superpowers/specs/2026-09-25-resource-profile-design.md` §3, replace the bullet `- nella stessa transazione della modifica.` with `- una sola istruzione SQL atomica, best-effort (errore loggato, mai propagato: la scrittura del progetto è già riuscita e \`js/api-sync.js\` tratta un PATCH fallito come "progetto mancante"); un copy mancato si ripara rieseguendo l'istruzione idempotente della migrazione di backfill.`

- [ ] **Step 8: Run the tests to verify they pass**

Run: `bash scripts/run-tests.sh`
Expected: `TAG-05`, `TAG-06`, `TAG-13`–`TAG-16` and the project half of `TAG-18` pass; all other tests still pass (`TAG-17` and the version half of `TAG-18` are added in Task 3).

- [ ] **Step 9: Commit**

```bash
git add api/src/routes/projects.js test-api.js docs/superpowers/specs/2026-09-25-resource-profile-design.md
git commit -m "feat: seed project tags from linked proposal and make them directly editable"
```

---

### Task 3: Backend — harden the cost-grid tag routes

**Files:**
- Modify: `api/src/routes/cost-grids.js` (TAGS section, ~lines 919-970)
- Modify: `test-api.js` (`testTagLinking`, append before the closing `}` of the function)

**Interfaces:**
- Consumes: `query`, `pool`, `canAccess`, `canEdit` (already in `cost-grids.js`).
- Produces: `versionInGrid(cgId, vId): Promise<boolean>` — module-local, used only by the two tag routes.

- [ ] **Step 1: Write the failing tests**

At the end of `testTagLinking` (just before its final `}` — after the TAG-18 project-half block from Task 2), add:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bash scripts/run-tests.sh`
Expected: FAIL — `TAG-17` returns 200, `TAG-18` (version half) returns 500.

- [ ] **Step 3: Rewrite the two routes**

In `api/src/routes/cost-grids.js`, replace everything from the line `// GET /api/cost-grids/:id/versions/:vId/tags` through the end of the `PUT .../tags` handler (just above `module.exports = router;`) with:

```js
// True when the version belongs to the cost grid named in the URL.
async function versionInGrid(cgId, vId) {
  const { rows } = await query(
    'SELECT 1 FROM cost_grid_versions WHERE id = $1 AND cost_grid_id = $2', [vId, cgId]
  );
  return rows.length > 0;
}

// GET /api/cost-grids/:id/versions/:vId/tags
router.get('/:id/versions/:vId/tags', requireAuth, async (req, res, next) => {
  try {
    if (!await canAccess(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!await versionInGrid(req.params.id, req.params.vId)) {
      return res.status(404).json({ error: 'Version not found' });
    }
    const { rows } = await query(
      `SELECT ali.id AS item_id, ali.label, ali.status, al.id AS list_id, al.name AS list_name, al.slug AS list_slug
       FROM cost_grid_version_tags cvt
       JOIN attribute_list_items ali ON ali.id = cvt.item_id
       JOIN attribute_lists al ON al.id = ali.list_id
       WHERE cvt.version_id = $1
       ORDER BY al.name, ali.label`,
      [req.params.vId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// PUT /api/cost-grids/:id/versions/:vId/tags — replace-all
router.put('/:id/versions/:vId/tags', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const ver = await query(
      'SELECT locked FROM cost_grid_versions WHERE id = $1 AND cost_grid_id = $2',
      [req.params.vId, req.params.id]
    );
    if (!ver.rows[0]) return res.status(404).json({ error: 'Version not found' });
    if (ver.rows[0].locked) return res.status(400).json({ error: 'Version is locked' });

    const { itemIds = [] } = req.body;
    if (!Array.isArray(itemIds)) return res.status(400).json({ error: 'itemIds must be an array' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM cost_grid_version_tags WHERE version_id = $1', [req.params.vId]);
      await client.query(
        `INSERT INTO cost_grid_version_tags (version_id, item_id)
         SELECT $1::uuid, unnest($2::uuid[]) ON CONFLICT DO NOTHING`,
        [req.params.vId, itemIds]
      );
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err.code === '23503') return res.status(400).json({ error: 'One or more tag items do not exist' });
      if (err.code === '22P02') return res.status(400).json({ error: 'itemIds must be valid UUIDs' });
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bash scripts/run-tests.sh`
Expected: all `TAG-*` pass including `TAG-17`/`TAG-18`; total count = previous 151 minus the removed TAG-06 assertion plus the new ones, zero failures.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/cost-grids.js test-api.js
git commit -m "fix: verify version belongs to grid on tag routes, use unnest bulk insert"
```

---

### Task 4: Frontend — project page reads and edits its own tags

**Files:**
- Modify: `project-config.html` (note at line 284; `tagsReadOnly` at line 445; `loadTags` at lines 544-553)

**Interfaces:**
- Consumes: `Api.projects.tags.list(projectId)` / `Api.projects.tags.replace(projectId, itemIds)` (already in `js/api.js`).
- Produces: nothing consumed by later tasks.

There is no frontend test harness for `project-config.html` (Vue page, no vitest coverage); it is verified manually in Task 5.

- [ ] **Step 1: Remove the "managed from the linked proposal" note**

Delete line 284 entirely:

```html
  <p v-if="pipelineLocked" class="text-muted small mb-2">Managed from the linked proposal — <a :href="'/costgrid.html?cgId=' + project.costGridRef.cgId + '&verId=' + project.costGridRef.versionId">open it to edit</a>.</p>
```

- [ ] **Step 2: Make read-only depend only on the viewer role**

Replace line 445:

```js
      tagsReadOnly() { return this.isViewer || this.pipelineLocked; },
```

with:

```js
      tagsReadOnly() { return this.isViewer; },
```

(`pipelineLocked` stays defined — it is used by other parts of the page.)

- [ ] **Step 3: Always read tags from the project**

Replace the `loadTags` method body:

```js
      async loadTags() {
        try {
          this.projectTags = await Api.projects.tags.list(this.project.id);
        } catch (e) {
          console.warn('[project-config] loadTags:', e.message);
          this.projectTags = [];
        }
      },
```

- [ ] **Step 4: Confirm no versioned file changed**

Run: `git diff --name-only main -- js css` (from the feature branch)
Expected: no output → no `?v=N` bump required.

- [ ] **Step 5: Commit**

```bash
git add project-config.html
git commit -m "feat: project page edits its own tags even when linked to a proposal"
```

---

### Task 5: Verification

**Files:** none modified (fixes found here go back to the owning task).

- [ ] **Step 1: Full test suite**

Run: `npm test` then `bash scripts/run-tests.sh`
Expected: vitest green (unchanged); integration suite green, zero failures.

- [ ] **Step 2: Isolated branch stack with cloned data**

Run: `scripts/test-branch.sh up` (copy the gitignored `.env` into the worktree first).
Expected: `scripts/test-branch.sh status` → up.

- [ ] **Step 3: Verify the backfill against real-shaped data**

Against the **branch** DB only (never `pdash-db`), compare before/after for linked projects with no tags. Use the branch stack's DB container name printed by `test-branch.sh` (`<branch-db>`):

```bash
docker exec <branch-db> psql -U pdash -d pdash -c "SELECT count(*) FROM projects p WHERE p.cg_version_id IS NOT NULL AND EXISTS (SELECT 1 FROM cost_grid_version_tags c WHERE c.version_id = p.cg_version_id) AND NOT EXISTS (SELECT 1 FROM project_tags t WHERE t.project_id = p.id);"
```

Expected: after `test-branch.sh up` applied `023`, the count is `0`. (A non-zero count means the migration was not applied to the branch DB — apply `023_backfill_project_tags.sql` there and re-check.)

- [ ] **Step 2b: Manual UI check on the branch stack**

1. Open `project-config.html?projectId=<linked project>`: Section 8 shows the proposal's tags, checkboxes enabled, no "Managed from the linked proposal" note.
2. Toggle a tag → persists after reload; `costgrid.html` for the linked proposal is unchanged.
3. As a viewer-shared user: checkboxes stay disabled.
4. Clear all tags, save the project (change any field), reload → tags stay empty (TAG-16 in the UI).

- [ ] **Step 3: Tear down only after the user's own confirmation**

Per project rules, `scripts/test-branch.sh down` is run only after the user's explicit "yes" in `/finish-cycle` Gate 2, not by the implementer.

- [ ] **Step 4: Hand off to `/finish-cycle`**

`/finish-cycle` is the terminal step (never `finishing-a-development-branch`). Its `/sync-docs` pass must also update, for the removed 409: `TEST_CASES.md` and `test-cases.html` (TAG-06 now expects 200; new TAG-13…TAG-18; the "Managed from the linked proposal" wording in the project-page case), `docs/pages/project-config.md`, `docs/pages/costgrid.md`, `PRD.md` §16.9 and the migration table in `CLAUDE.md` (add `023`).
