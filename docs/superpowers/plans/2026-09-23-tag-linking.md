# Cycle 2: Tag Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin/editor assign `attribute_lists` tags (Market, Brand, Therapeutic Area, Service Type, or any future list) to a proposal (cost grid version) in `costgrid.html`, with a project generated from that proposal always reflecting the same tags read-only; a project with no linked proposal gets its own directly-editable tags in `project-config.html`.

**Architecture:** Two new join tables (`cost_grid_version_tags`, `project_tags`), each a simple `(parent_id, item_id)` pair with no extra columns. Two new replace-all route pairs (`GET`/`PUT .../tags`) added to the existing `cost-grids.js` and `projects.js` route files — no new route file, same permission helpers (`canAccess`/`canEdit`) those files already have. A new shared frontend helper (`js/tags.js`) loads the active tag catalog once per page; `costgrid.html` and `project-config.html` each get a new "🏷 Tags" section using it. No propagation job and no tag data duplicated onto `projects`/`cost_grid_versions` rows — a linked project always reads its tags live from its cost grid version, so there is nothing to keep in sync.

**Tech Stack:** Node.js/Express, PostgreSQL 16, Vue 3 (CDN), Bootstrap 5.

**Spec:** [docs/superpowers/specs/2026-09-23-tag-linking-design.md](../specs/2026-09-23-tag-linking-design.md)

## Global Constraints

- Write access to a version's/project's tags requires the same permission the resource's other writes already require: `canEdit()` (owner or `editor`/`owner` share) in `cost-grids.js`/`projects.js`, admin/sysadmin always allowed. Read access requires `canAccess()` (owner, any share, or admin/sysadmin).
- `PUT /api/projects/:id/tags` must return **409** when the project has `cg_version_id` set — tags for a linked project are never writable directly, only via the linked proposal.
- Replace-all semantics only: both `PUT .../tags` endpoints accept `{ itemIds: string[] }` and replace the full set in one call, matching the existing `PUT .../structure` pattern — no incremental add/remove endpoint.
- An `item_id` that doesn't exist in `attribute_list_items` must produce **400**, not a 500 — rely on the FK constraint violation (`23503`) and translate it, the same pattern `attribute-lists.js` already uses for its own FK errors.
- All user-facing text is in English (per `CLAUDE.md`'s language constraint).
- `js/api.js` and any newly created `js/*.js` file are shared, versioned files (`?v=N` cache-busting) — bumping content requires bumping **every** `?v=N` reference to that exact file across every page that loads it, not just the pages touched by this plan. Task 4 lists every current `js/api.js?v=6` reference that must become `?v=7`.
- Never run a destructive Docker command (`down -v`, `down --volumes`) against the main stack. Every verification step in this plan targets the **isolated branch stack** (`scripts/test-branch.sh up`), never `pdash-db`/`pdash-api` directly — per `CLAUDE.md`'s "Infrastructure safety" section.
- No native `alert()`/`confirm()` — this feature doesn't need any blocking dialog, but if a step ever needs to surface an error to the user, use `showInfo()`/`showConfirm()` from `js/core.js`, consistent with the rest of the Vue-migrated pages.

---

### Task 1: Database migration

**Files:**
- Create: `api/src/db/migrations/022_version_project_tags.sql`

**Interfaces:**
- Produces: tables `cost_grid_version_tags(version_id, item_id)` and `project_tags(project_id, item_id)`, consumed by Tasks 2 and 3.

- [ ] **Step 1: Write the migration file**

```sql
CREATE TABLE IF NOT EXISTS cost_grid_version_tags (
  version_id UUID NOT NULL REFERENCES cost_grid_versions(id) ON DELETE CASCADE,
  item_id    UUID NOT NULL REFERENCES attribute_list_items(id),
  PRIMARY KEY (version_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_cost_grid_version_tags_item_id ON cost_grid_version_tags(item_id);

CREATE TABLE IF NOT EXISTS project_tags (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_id    UUID NOT NULL REFERENCES attribute_list_items(id),
  PRIMARY KEY (project_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_project_tags_item_id ON project_tags(item_id);
```

- [ ] **Step 2: Start (or confirm) the isolated branch stack**

Run: `scripts/test-branch.sh up`
Expected: build + start completes, both containers report Docker-healthy (script prints the DB/API container names it created — note them, e.g. `pdash-db-<sanitized-branch>` / `pdash-api-<sanitized-branch>`, where `<sanitized-branch>` is the current branch name with `/` and spaces replaced by `_`).

- [ ] **Step 3: Apply the migration to the branch stack's database**

Run (substitute the actual DB container name from Step 2):
```bash
docker exec -i pdash-db-<sanitized-branch> psql -U pdash -d pdash < api/src/db/migrations/022_version_project_tags.sql
```
Expected: `CREATE TABLE` x2, `CREATE INDEX` x2.

- [ ] **Step 4: Verify the tables exist**

Run: `docker exec pdash-db-<sanitized-branch> psql -U pdash -d pdash -c "\d cost_grid_version_tags" -c "\d project_tags"`
Expected: both tables listed with their composite primary key and FK constraints.

- [ ] **Step 5: Commit**

```bash
git add api/src/db/migrations/022_version_project_tags.sql
git commit -m "feat: add cost_grid_version_tags and project_tags schema"
```

---

### Task 2: Cost grid version tags API routes

**Files:**
- Modify: `api/src/routes/cost-grids.js` — insert before `module.exports = router;` (end of file, currently line 911)

**Interfaces:**
- Consumes: `canAccess(userId, role, cgId)`, `canEdit(userId, role, cgId)`, `query`, `pool` — all already imported/defined in this file.
- Produces: `GET /api/cost-grids/:id/versions/:vId/tags`, `PUT /api/cost-grids/:id/versions/:vId/tags` — consumed by Task 4 (`js/api.js`) and Task 6 (`costgrid.html`).

- [ ] **Step 1: Write the routes**

Insert immediately before the final `module.exports = router;` line:

```js
// ── TAGS ──────────────────────────────────────────────────────────────────────

// GET /api/cost-grids/:id/versions/:vId/tags
router.get('/:id/versions/:vId/tags', requireAuth, async (req, res, next) => {
  try {
    if (!await canAccess(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
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
  if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const { itemIds = [] } = req.body;
  if (!Array.isArray(itemIds)) return res.status(400).json({ error: 'itemIds must be an array' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM cost_grid_version_tags WHERE version_id = $1', [req.params.vId]);
    for (const itemId of itemIds) {
      await client.query(
        'INSERT INTO cost_grid_version_tags (version_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [req.params.vId, itemId]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23503') return res.status(400).json({ error: 'One or more tag items do not exist' });
    next(err);
  } finally {
    client.release();
  }
});
```

- [ ] **Step 2: Restart the branch API container to pick up the new routes**

Run: `docker restart pdash-api-<sanitized-branch>`
Expected: container restarts cleanly (`docker logs pdash-api-<sanitized-branch> --tail 20` shows the Express server listening, no stack trace).

- [ ] **Step 3: Manually verify the endpoints with an authenticated admin session**

Run (replace `<cookie>` with a valid session cookie from an admin login on the branch stack, `<cgId>`/`<verId>` with a real draft version's ids, `<itemId>` with a real `attribute_list_items.id`, e.g. one from the seeded Market list):
```bash
curl -s -b "<cookie>" -X PUT http://localhost:8081/api/cost-grids/<cgId>/versions/<verId>/tags \
  -H "Content-Type: application/json" -d '{"itemIds":["<itemId>"]}'
```
Expected: `{"ok":true}`.
```bash
curl -s -b "<cookie>" http://localhost:8081/api/cost-grids/<cgId>/versions/<verId>/tags
```
Expected: JSON array with one row, `item_id` matching `<itemId>`.

- [ ] **Step 4: Commit**

```bash
git add api/src/routes/cost-grids.js
git commit -m "feat: add cost grid version tags API routes"
```

---

### Task 3: Project tags API routes

**Files:**
- Modify: `api/src/routes/projects.js:1` (imports) and `:418` (insert before `module.exports = router;`)

**Interfaces:**
- Consumes: `canAccess(userId, role, projectId)`, `canEdit(userId, role, projectId)`, `query` — already defined/imported in this file; `pool`, added in Step 1 below.
- Produces: `GET /api/projects/:id/tags`, `PUT /api/projects/:id/tags` (409 when `cg_version_id` is set) — consumed by Task 4 (`js/api.js`) and Task 7 (`project-config.html`).

- [ ] **Step 1: Add the `pool` import**

`projects.js` currently only imports `query` from `../db/client`. Change line 2 from:

```js
const { query } = require('../db/client');
```

to:

```js
const { query, pool } = require('../db/client');
```

- [ ] **Step 2: Write the routes**

Insert immediately before the final `module.exports = router;` line:

```js
// ── TAGS ──────────────────────────────────────────────────────────────────────

// GET /api/projects/:id/tags
router.get('/:id/tags', requireAuth, async (req, res, next) => {
  try {
    if (!await canAccess(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { rows } = await query(
      `SELECT ali.id AS item_id, ali.label, ali.status, al.id AS list_id, al.name AS list_name, al.slug AS list_slug
       FROM project_tags pt
       JOIN attribute_list_items ali ON ali.id = pt.item_id
       JOIN attribute_lists al ON al.id = ali.list_id
       WHERE pt.project_id = $1
       ORDER BY al.name, ali.label`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// PUT /api/projects/:id/tags — replace-all; rejected when the project has a linked cost grid version
router.put('/:id/tags', requireAuth, async (req, res, next) => {
  try {
    if (!await canEdit(req.user.id, req.user.role, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { rows: projRows } = await query('SELECT cg_version_id FROM projects WHERE id = $1', [req.params.id]);
    if (!projRows[0]) return res.status(404).json({ error: 'Project not found' });
    if (projRows[0].cg_version_id) {
      return res.status(409).json({ error: 'Tags for this project are managed from its linked proposal' });
    }

    const { itemIds = [] } = req.body;
    if (!Array.isArray(itemIds)) return res.status(400).json({ error: 'itemIds must be an array' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM project_tags WHERE project_id = $1', [req.params.id]);
      for (const itemId of itemIds) {
        await client.query(
          'INSERT INTO project_tags (project_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [req.params.id, itemId]
        );
      }
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err.code === '23503') return res.status(400).json({ error: 'One or more tag items do not exist' });
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});
```

- [ ] **Step 3: Restart the branch API container**

Run: `docker restart pdash-api-<sanitized-branch>`
Expected: clean restart, no stack trace in `docker logs pdash-api-<sanitized-branch> --tail 20`.

- [ ] **Step 4: Manually verify, including the 409 case**

Run (replace `<cookie>`, `<itemId>` as in Task 2; `<projId>` a project with no `cg_version_id`; `<linkedProjId>` one generated from a proposal):
```bash
curl -s -b "<cookie>" -X PUT http://localhost:8081/api/projects/<projId>/tags \
  -H "Content-Type: application/json" -d '{"itemIds":["<itemId>"]}'
```
Expected: `{"ok":true}`.
```bash
curl -s -o /dev/null -w "%{http_code}" -b "<cookie>" -X PUT http://localhost:8081/api/projects/<linkedProjId>/tags \
  -H "Content-Type: application/json" -d '{"itemIds":["<itemId>"]}'
```
Expected: `409`.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/projects.js
git commit -m "feat: add project tags API routes"
```

---

### Task 4: Frontend API client

**Files:**
- Modify: `js/api.js`
- Modify (cache-bust bump only, `?v=6` → `?v=7`): `costgrid.html:637`, `planning.html:222`, `pipeline.html:413`, `admin.html:199`, `config.html:995`, `project-config.html:364`, `portfolio.html:507`, `attribute-lists.html:173`, `team.html:166`, `timesheets.html:203`, `_db-reset.html:125`, `_terms-editor.html:106`

**Interfaces:**
- Produces: `Api.costGrids.versions.tags.list(cgId, vId)`, `Api.costGrids.versions.tags.replace(cgId, vId, itemIds)`, `Api.projects.tags.list(id)`, `Api.projects.tags.replace(id, itemIds)` — consumed by Task 6 (`costgrid.html`) and Task 7 (`project-config.html`).

- [ ] **Step 1: Add `tags` under `Api.costGrids.versions`**

In `js/api.js`, inside the `versions: { ... }` block (currently ending with `linkedProjects: { ... }`), add a sibling key:

```js
      tags: {
        list:    (cgId, vId)           => apiFetch(`/cost-grids/${cgId}/versions/${vId}/tags`),
        replace: (cgId, vId, itemIds)  => apiFetch(`/cost-grids/${cgId}/versions/${vId}/tags`, { method: 'PUT', body: JSON.stringify({ itemIds }) }),
      },
```

- [ ] **Step 2: Add `tags` under `Api.projects`**

In the same file, inside the `projects: { ... }` block (currently ending with the `shares: { ... }` sub-object), add a sibling key:

```js
    tags: {
      list:    (id)          => apiFetch(`/projects/${id}/tags`),
      replace: (id, itemIds) => apiFetch(`/projects/${id}/tags`, { method: 'PUT', body: JSON.stringify({ itemIds }) }),
    },
```

- [ ] **Step 3: Bump every `js/api.js?v=6` reference to `?v=7`**

In each of the 12 files listed above, change `src="js/api.js?v=6"` to `src="js/api.js?v=7"`. Verify no reference was missed:

Run: `grep -rn 'js/api\.js?v=6' *.html`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add js/api.js costgrid.html planning.html pipeline.html admin.html config.html project-config.html portfolio.html attribute-lists.html team.html timesheets.html _db-reset.html _terms-editor.html
git commit -m "feat: add tags API client methods for cost grid versions and projects"
```

---

### Task 5: Shared attribute-list lookup helper

**Files:**
- Create: `js/tags.js`
- Modify: `costgrid.html`, `project-config.html` (add the new `<script>` tag)

**Interfaces:**
- Produces: `async function loadActiveAttributeListsForTagging()` → `Promise<Array<{ id, name, slug, items: Array<{ id, label }> }>>`, only active items included. Consumed by Task 6 (`costgrid.html`) and Task 7 (`project-config.html`).

- [ ] **Step 1: Write `js/tags.js`**

```js
// Loads every attribute list with its active items, shaped for a tag-assignment UI.
// Talks to /api/attribute-lists directly with fetch (not the Api.* wrapper), matching
// how attribute-lists.html itself already calls these same endpoints. Not cached —
// each consumer page calls this once per page load, same as its own clients/programs lists.
async function loadActiveAttributeListsForTagging() {
  const listsRes = await fetch('/api/attribute-lists', { credentials: 'same-origin' });
  if (!listsRes.ok) throw new Error('Failed to load attribute lists');
  const lists = await listsRes.json();

  const result = [];
  for (const list of lists) {
    const itemsRes = await fetch(`/api/attribute-lists/${list.id}/items`, { credentials: 'same-origin' });
    if (!itemsRes.ok) throw new Error(`Failed to load items for list "${list.name}"`);
    const items = await itemsRes.json();
    result.push({
      id: list.id,
      name: list.name,
      slug: list.slug,
      items: items.filter(i => i.status === 'active'),
    });
  }
  return result;
}
```

- [ ] **Step 2: Add the script tag to `costgrid.html`**

After the line `<script defer src="js/api-sync.js?v=15"></script>` (line 648), add:

```html
<script defer src="js/tags.js?v=1"></script>
```

- [ ] **Step 3: Add the script tag to `project-config.html`**

After the line `<script defer src="js/api-sync.js?v=15"></script>` (line 374), add:

```html
<script defer src="js/tags.js?v=1"></script>
```

- [ ] **Step 4: Commit**

```bash
git add js/tags.js costgrid.html project-config.html
git commit -m "feat: add shared attribute-list lookup helper for tag assignment UI"
```

---

### Task 6: `costgrid.html` Tags section

**Files:**
- Modify: `costgrid.html`

**Interfaces:**
- Consumes: `loadActiveAttributeListsForTagging()` (Task 5), `Api.costGrids.versions.tags.list/replace` (Task 4).

- [ ] **Step 1: Add the collapsible section markup**

Insert a new `section-card` between the closing `</div>` of "Offer details" (line 164) and the "Sharing" `<!-- Sharing -->` comment (line 166):

```html
<!-- Tags -->
<div class="section-card mb-3">
  <div class="section-header d-flex align-items-center" style="cursor:pointer;user-select:none" @click="tagsCollapsed = !tagsCollapsed">
    <span style="font-size:var(--text-sm);margin-right:6px;color:var(--text-muted)">{{ tagsCollapsed ? '▶' : '▼' }}</span>
    <span>🏷 Tags</span>
  </div>
  <div v-show="!tagsCollapsed" class="p-3">
    <div v-if="!attributeLists.length" class="text-muted" style="font-size:var(--text-sm)">No tag lists configured yet.</div>
    <div v-for="list in attributeLists" :key="list.id" class="mb-2">
      <div class="small fw-semibold text-muted mb-1">{{ list.name }}</div>
      <div v-if="!list.items.length" class="text-muted" style="font-size:var(--text-xs)">No active items in this list.</div>
      <div class="d-flex flex-wrap gap-2">
        <label v-for="item in list.items" :key="item.id" class="d-flex align-items-center gap-1" style="font-size:var(--text-sm);cursor:pointer">
          <input type="checkbox" class="form-check-input" :checked="versionTagItemIds.includes(item.id)" :disabled="isLocked || cg?.myPermission === 'viewer'" @change="toggleTag(item.id)">
          {{ item.label }}
        </label>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add the new `data()` fields**

Change line 691 from:

```js
      offerDetailsCollapsed: false, summaryCollapsed: false, sharingCollapsed: false,
```

to:

```js
      offerDetailsCollapsed: false, summaryCollapsed: false, sharingCollapsed: false, tagsCollapsed: false,
      attributeLists: [], versionTagItemIds: [],
```

- [ ] **Step 3: Load the attribute-list catalog once, in `created()`**

In the `created()` method, immediately after the `try { await cgSyncFromApi(); } catch (...) { ... }` block (line 1421), add:

```js
    this.attributeLists = await loadActiveAttributeListsForTagging().catch(e => { console.warn('[costgrid] loadActiveAttributeListsForTagging:', e.message); return []; });
```

- [ ] **Step 4: Load this version's tags in `openVersion()`**

In the `openVersion(cgId, versionId)` method, immediately after `this.selectionMode = false; this.selectedTaskIds = new Set();` (line 1057), add:

```js
      try {
        const tagRows = await Api.costGrids.versions.tags.list(cgId, resolvedVerId);
        this.versionTagItemIds = tagRows.map(r => r.item_id);
      } catch (e) {
        console.warn('[costgrid] load version tags failed:', e.message);
        this.versionTagItemIds = [];
      }
```

- [ ] **Step 5: Add the `toggleTag` method**

In the `methods: { ... }` block, immediately after `onHeaderFieldChange() { cgScheduleAutoSave(); },` (line 1090), add:

```js
    toggleTag(itemId) {
      if (this.isLocked || this.cg?.myPermission === 'viewer') return;
      const idx = this.versionTagItemIds.indexOf(itemId);
      if (idx === -1) this.versionTagItemIds.push(itemId);
      else this.versionTagItemIds.splice(idx, 1);
      Api.costGrids.versions.tags.replace(this.cgId, this.verId, this.versionTagItemIds)
        .catch(e => console.warn('[costgrid] saveTags:', e.message));
    },
```

- [ ] **Step 6: Manual verification against the branch stack**

Open `http://localhost:8081/costgrid.html?cgId=<cgId>&verId=<verId>` for an existing draft proposal (owner/editor permission), expand the new "🏷 Tags" section, check one item under "Market" and one under "Brand". Reload the page.
Expected: both checkboxes remain checked after reload (confirms the `PUT`/`GET` round-trip). Open the same version as a viewer-permission user (or with `isLocked` true, e.g. a Committed version).
Expected: checkboxes render disabled.

- [ ] **Step 7: Commit**

```bash
git add costgrid.html
git commit -m "feat: add Tags section to costgrid.html"
```

---

### Task 7: `project-config.html` Tags section

**Files:**
- Modify: `project-config.html`

**Interfaces:**
- Consumes: `loadActiveAttributeListsForTagging()` (Task 5), `Api.costGrids.versions.tags.list` and `Api.projects.tags.list/replace` (Task 4), `this.pipelineLocked` (existing computed, line 415-417).

- [ ] **Step 1: Add the section markup**

Insert a new `cfg-section` after the closing `</div>` of "7. Functional Groups" (line 281) and before the outer container's closing `</div>` (line 282):

```html
<div class="cfg-section" v-if="!isNewProject">
  <div class="d-flex justify-content-between align-items-center cfg-section-title"><span>8. Tags <span class="fw-normal text-muted">(optional)</span></span></div>
  <p v-if="pipelineLocked" class="text-muted small mb-2">Managed from the linked proposal — <a :href="'/costgrid.html?cgId=' + project.costGridRef.cgId + '&verId=' + project.costGridRef.versionId">open it to edit</a>.</p>
  <div v-if="!attributeLists.length" class="text-muted small">No tag lists configured yet.</div>
  <div v-for="list in attributeLists" :key="list.id" class="mb-2">
    <div class="small fw-semibold text-muted mb-1">{{ list.name }}</div>
    <div v-if="!list.items.length" class="text-muted" style="font-size:.75rem">No active items in this list.</div>
    <div class="d-flex flex-wrap gap-2">
      <label v-for="item in list.items" :key="item.id" class="d-flex align-items-center gap-1" style="font-size:.85rem;cursor:pointer">
        <input type="checkbox" class="form-check-input" :checked="isTagChecked(item.id)" :disabled="tagsReadOnly" @change="toggleTag(item.id)">
        {{ item.label }}
      </label>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add `data()` fields**

Change the `data()` return object (line 396-409) to add two fields — after `jsonError: '',` (line 400), add:

```js
        attributeLists: [],
        projectTags: [],
```

- [ ] **Step 3: Add the `tagsReadOnly` computed**

In the `computed: { ... }` block, immediately after `pipelineLocked() { return !!(this.project?.costGridRef?.cgId); },` (line 415-417), add:

```js
      tagsReadOnly() { return this.isViewer || this.pipelineLocked; },
```

- [ ] **Step 4: Load the attribute-list catalog and this project's tags in `created()`**

Change the block:

```js
      this.resolveProject();
      if (this.project && !this.notFound) this.sanitizeStatus();
      if (this.project && !this.notFound) await this.updateReforecastVisibility();
      if (this.project && !this.notFound) await this.loadActuals();
      this.ready = true;
```

to:

```js
      this.resolveProject();
      if (this.project && !this.notFound) this.sanitizeStatus();
      if (this.project && !this.notFound) await this.updateReforecastVisibility();
      if (this.project && !this.notFound) await this.loadActuals();
      if (this.project && !this.notFound && !this.isNewProject) {
        this.attributeLists = await loadActiveAttributeListsForTagging().catch(e => { console.warn('[project-config] loadActiveAttributeListsForTagging:', e.message); return []; });
        await this.loadTags();
      }
      this.ready = true;
```

- [ ] **Step 5: Add `loadTags`, `isTagChecked`, `toggleTag` methods**

In the `methods: { ... }` block, immediately after the `resolveProject() { ... },` method closes (line 511), add:

```js
      async loadTags() {
        try {
          this.projectTags = this.pipelineLocked
            ? await Api.costGrids.versions.tags.list(this.project.costGridRef.cgId, this.project.costGridRef.versionId)
            : await Api.projects.tags.list(this.project.id);
        } catch (e) {
          console.warn('[project-config] loadTags:', e.message);
          this.projectTags = [];
        }
      },
      isTagChecked(itemId) {
        return this.projectTags.some(t => t.item_id === itemId);
      },
      async toggleTag(itemId) {
        if (this.tagsReadOnly) return;
        const newIds = this.isTagChecked(itemId)
          ? this.projectTags.filter(t => t.item_id !== itemId).map(t => t.item_id)
          : [...this.projectTags.map(t => t.item_id), itemId];
        try {
          await Api.projects.tags.replace(this.project.id, newIds);
          await this.loadTags();
        } catch (e) {
          console.warn('[project-config] toggleTag:', e.message);
        }
      },
```

- [ ] **Step 6: Manual verification against the branch stack**

Open `project-config.html?projectId=<linkedProjId>` for a project generated from the proposal tagged in Task 6, Step 6.
Expected: "8. Tags" section shows the same Market/Brand items checked, disabled, with the "Managed from the linked proposal" note and a working link back to `costgrid.html`. Open `project-config.html?projectId=<standaloneProjId>` for a project with no linked proposal, check a Therapeutic Area item, reload.
Expected: checkbox editable, stays checked after reload.

- [ ] **Step 7: Commit**

```bash
git add project-config.html
git commit -m "feat: add Tags section to project-config.html"
```

---

### Task 8: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm the full round trip described in the spec's testing section**

On the branch stack: assign a tag to a proposal in `costgrid.html` → confirm it appears read-only on the project generated from that proposal in `project-config.html` → remove the tag from the proposal → reload the project's page → confirm the tag is gone there too.

- [ ] **Step 2: Confirm the 409 guard holds end-to-end through the UI**

Attempt to check a tag on a linked project's Tags section directly (e.g. via browser devtools calling `Api.projects.tags.replace` on a linked project's id, since the UI itself never exposes an editable checkbox there).
Expected: request fails with 409, the UI's own `console.warn` fires, nothing in the UI silently succeeds.

- [ ] **Step 3: Confirm no existing page regressed**

Spot-check `pipeline.html` and `portfolio.html` load normally (navbar renders, no console errors) — both load the bumped `js/api.js?v=7`, neither was otherwise touched by this plan.

- [ ] **Step 4: Final review commit (if any fixups were needed)**

If Steps 1-3 required any fixes, commit them:
```bash
git add -A
git commit -m "fix: address end-to-end verification findings for tag linking"
```
