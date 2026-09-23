# Team + Attribute Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone resource registry (`team.html`) and a generic, admin-managed tag/taxonomy system (`attribute-lists.html`), the first of four planned cycles toward AI-assisted resource allocation.

**Architecture:** Three new Postgres tables (`resources`, `attribute_lists`, `attribute_list_items`) behind two new Express route files, each gated `requireAuth, requireAdmin`. Two new full-page Vue 3 (CDN, no build step) pages, same structural pattern as `admin.html`, linked from the existing "⚙ Admin" dropdown in `js/nav.js`. No existing page's behavior changes.

**Tech Stack:** Node.js/Express, PostgreSQL 16, Vue 3 (CDN), Bootstrap 5, `node:test` for backend unit tests.

**Spec:** [docs/superpowers/specs/2026-09-23-team-attribute-lists-design.md](../specs/2026-09-23-team-attribute-lists-design.md)

## Global Constraints

- Both new pages are accessible only to `role === 'admin' || role === 'sysadmin'` (same gate as `admin.html`), enforced both client-side (page gate) and server-side (`requireAdmin`, already extended to admin+sysadmin).
- `attribute_lists` and `attribute_list_items` support **no physical delete** in this cycle — only `status` toggle (`active`/`inactive`) — to avoid breaking future references from proposal/project tagging (Ciclo 2). `resources` supports physical delete, since nothing references it yet.
- `attribute_lists.slug` is generated once at creation (slugify of `name`) and never changes after, even if `name` is renamed later.
- `resources.job_title` is free text (not an FK) — the CRUD form offers a `<select>` of existing `roles.label` values plus an "Other…" option that unlocks a free-text input, but the stored value is always a plain string.
- All user-facing text is in English (per `CLAUDE.md`'s language constraint).
- `js/nav.js` is a shared, versioned file (`?v=N` cache-busting) — bumping its content requires bumping **every** `nav.js?v=N` reference across all pages that load it in the same task, not just the new ones.
- No native `alert()`/`confirm()` — use `showConfirm()`/`showInfo()` from `js/core.js` for confirmations and error/info messages, consistent with the rest of the Vue-migrated pages.

---

### Task 1: Database migration

**Files:**
- Create: `api/src/db/migrations/020_resources_attribute_lists.sql`

**Interfaces:**
- Produces: tables `resources(id, first_name, last_name, email, job_title, job_description, user_id, status, created_at)`, `attribute_lists(id, name, slug, created_at)`, `attribute_list_items(id, list_id, label, status, created_at)`, consumed by Tasks 3 and 4.

- [ ] **Step 1: Write the migration file**

```sql
CREATE TABLE IF NOT EXISTS resources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name      VARCHAR(255) NOT NULL,
  last_name       VARCHAR(255) NOT NULL,
  email           VARCHAR(255) NOT NULL,
  job_title       VARCHAR(255) NOT NULL,
  job_description TEXT,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attribute_lists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(100) NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attribute_list_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id     UUID NOT NULL REFERENCES attribute_lists(id) ON DELETE CASCADE,
  label       VARCHAR(255) NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attribute_list_items_list_id ON attribute_list_items(list_id);

INSERT INTO attribute_lists (name, slug) VALUES
  ('Market', 'market'),
  ('Brand', 'brand'),
  ('Therapeutic Area', 'therapeutic-area'),
  ('Service Type', 'service-type')
ON CONFLICT (slug) DO NOTHING;
```

- [ ] **Step 2: Apply the migration to the running dev stack**

Run: `docker exec -i pdash-db psql -U pdash -d pdash < api/src/db/migrations/020_resources_attribute_lists.sql`
Expected: `CREATE TABLE` x3, `CREATE INDEX`, `INSERT 0 4` (or fewer if re-run, due to `ON CONFLICT DO NOTHING`).

- [ ] **Step 3: Verify the tables and seed rows exist**

Run: `docker exec pdash-db psql -U pdash -d pdash -c "SELECT name, slug FROM attribute_lists ORDER BY name;"`
Expected: 4 rows — Brand/brand, Market/market, Service Type/service-type, Therapeutic Area/therapeutic-area.

- [ ] **Step 4: Commit**

```bash
git add api/src/db/migrations/020_resources_attribute_lists.sql
git commit -m "feat: add resources and attribute_lists schema"
```

---

### Task 2: `slugify` pure function (backend)

**Files:**
- Create: `api/src/lib/slugify.js`
- Test: `api/src/lib/slugify.test.js`

**Interfaces:**
- Produces: `slugify(name: string): string` — lowercase, ASCII-only, hyphen-separated slug, or `''` if the input has no alphanumeric characters. Consumed by Task 3.

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { slugify } = require('./slugify');

test('slugify: simple single word lowercases', () => {
  assert.equal(slugify('Market'), 'market');
});

test('slugify: multi-word name becomes hyphen-separated', () => {
  assert.equal(slugify('Therapeutic Area'), 'therapeutic-area');
});

test('slugify: leading/trailing whitespace is trimmed', () => {
  assert.equal(slugify('  Service Type  '), 'service-type');
});

test('slugify: accented characters are normalized to ASCII', () => {
  assert.equal(slugify('Café Brand'), 'cafe-brand');
});

test('slugify: punctuation collapses into single hyphens', () => {
  assert.equal(slugify('R&D / Ops!!'), 'r-d-ops');
});

test('slugify: empty or whitespace-only input returns empty string', () => {
  assert.equal(slugify(''), '');
  assert.equal(slugify('   '), '');
});

test('slugify: null/undefined input returns empty string', () => {
  assert.equal(slugify(null), '');
  assert.equal(slugify(undefined), '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec pdash-api node --test src/lib/slugify.test.js`
Expected: FAIL — `Cannot find module './slugify'`.

- [ ] **Step 3: Write the implementation**

```js
// Turns a display name into a stable, URL/identifier-safe slug. Used once,
// at attribute_lists creation time — the slug is stored and never
// regenerated, so this function's output for a given input must never
// change once anything relies on it.
function slugify(name) {
  return String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = { slugify };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec pdash-api node --test src/lib/slugify.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/slugify.js api/src/lib/slugify.test.js
git commit -m "feat: add slugify pure function for attribute list slugs"
```

---

### Task 3: `attribute-lists` API route

**Files:**
- Create: `api/src/routes/attribute-lists.js`
- Modify: `api/src/index.js`

**Interfaces:**
- Consumes: `slugify(name)` from Task 2 (`../lib/slugify`); `requireAuth, requireAdmin` from `../middleware/auth`; `query` from `../db/client`.
- Produces: `GET/POST /api/attribute-lists`, `PATCH /api/attribute-lists/:id`, `GET/POST /api/attribute-lists/:id/items`, `PATCH /api/attribute-lists/:id/items/:itemId` — consumed by Task 7 (`attribute-lists.html`).

- [ ] **Step 1: Write the route file**

```js
const express = require('express');
const { query } = require('../db/client');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { slugify } = require('../lib/slugify');

const router = express.Router();

router.use(requireAuth, requireAdmin);

// GET /api/attribute-lists — all lists with their active item count
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT al.id, al.name, al.slug, al.created_at,
              COUNT(ali.id) FILTER (WHERE ali.status = 'active')::int AS active_item_count
       FROM attribute_lists al
       LEFT JOIN attribute_list_items ali ON ali.list_id = al.id
       GROUP BY al.id
       ORDER BY al.name`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/attribute-lists
router.post('/', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const slug = slugify(name);
    if (!slug) return res.status(400).json({ error: 'name must contain at least one letter or number' });
    const { rows } = await query(
      `INSERT INTO attribute_lists (name, slug) VALUES ($1, $2) RETURNING id, name, slug, created_at`,
      [name.trim(), slug]
    );
    res.status(201).json({ ...rows[0], active_item_count: 0 });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A list with this name already exists' });
    next(err);
  }
});

// PATCH /api/attribute-lists/:id — rename only, slug is immutable
router.patch('/:id', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const { rows } = await query(
      `UPDATE attribute_lists SET name = $1 WHERE id = $2 RETURNING id, name, slug, created_at`,
      [name.trim(), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'List not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/attribute-lists/:id/items
router.get('/:id/items', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, list_id, label, status, created_at FROM attribute_list_items WHERE list_id = $1 ORDER BY label`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/attribute-lists/:id/items
router.post('/:id/items', async (req, res, next) => {
  try {
    const { label } = req.body;
    if (!label?.trim()) return res.status(400).json({ error: 'label is required' });
    const { rows } = await query(
      `INSERT INTO attribute_list_items (list_id, label) VALUES ($1, $2) RETURNING id, list_id, label, status, created_at`,
      [req.params.id, label.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23503') return res.status(404).json({ error: 'List not found' });
    next(err);
  }
});

// PATCH /api/attribute-lists/:id/items/:itemId
router.patch('/:id/items/:itemId', async (req, res, next) => {
  try {
    const { label, status } = req.body;
    const fields = [];
    const values = [];
    let i = 1;
    if (label !== undefined) {
      if (!label.trim()) return res.status(400).json({ error: 'label cannot be empty' });
      fields.push(`label = $${i++}`); values.push(label.trim());
    }
    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
      fields.push(`status = $${i++}`); values.push(status);
    }
    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.params.itemId, req.params.id);
    const { rows } = await query(
      `UPDATE attribute_list_items SET ${fields.join(', ')} WHERE id = $${i} AND list_id = $${i + 1}
       RETURNING id, list_id, label, status, created_at`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: 'Item not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 2: Mount the route in `api/src/index.js`**

Add the import after `const appSettingsRoutes = require('./routes/app-settings');` (index.js:20):

```js
const attributeListsRoutes = require('./routes/attribute-lists');
```

Add the mount after `app.use('/api/app-settings', appSettingsRoutes);` (index.js:56):

```js
app.use('/api/attribute-lists', attributeListsRoutes);
```

- [ ] **Step 3: Restart the API container to pick up the new route**

Run: `docker compose restart pdash-api`
Expected: container restarts cleanly (`docker compose logs pdash-api --tail 20` shows the Express server listening, no stack trace).

- [ ] **Step 4: Manually verify the endpoints with an authenticated admin session**

Run (replace `<cookie>` with a valid session cookie from an admin login):
```bash
curl -s -b "<cookie>" http://localhost/api/attribute-lists | head -c 500
```
Expected: JSON array with 4 entries (Brand, Market, Service Type, Therapeutic Area), each with `active_item_count: 0`.

```bash
curl -s -b "<cookie>" -X POST http://localhost/api/attribute-lists/<market-id>/items -H "Content-Type: application/json" -d '{"label":"EU"}'
```
Expected: 201, JSON with `label: "EU"`, `status: "active"`.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/attribute-lists.js api/src/index.js
git commit -m "feat: add attribute-lists API routes"
```

---

### Task 4: `resources` API route

**Files:**
- Create: `api/src/routes/resources.js`
- Modify: `api/src/index.js`

**Interfaces:**
- Consumes: `requireAuth, requireAdmin` from `../middleware/auth`; `query` from `../db/client`.
- Produces: `GET/POST /api/resources`, `PATCH /api/resources/:id`, `DELETE /api/resources/:id` — consumed by Task 6 (`team.html`).

- [ ] **Step 1: Write the route file**

```js
const express = require('express');
const { query } = require('../db/client');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireAdmin);

// GET /api/resources — all resources (active + inactive), with linked user resolved
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT r.id, r.first_name, r.last_name, r.email, r.job_title, r.job_description,
              r.user_id, r.status, r.created_at,
              u.first_name AS linked_user_first_name,
              u.last_name  AS linked_user_last_name,
              u.email      AS linked_user_email
       FROM resources r
       LEFT JOIN users u ON u.id = r.user_id
       ORDER BY r.last_name, r.first_name`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/resources
router.post('/', async (req, res, next) => {
  try {
    const { firstName, lastName, email, jobTitle, jobDescription, userId } = req.body;
    if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !jobTitle?.trim()) {
      return res.status(400).json({ error: 'firstName, lastName, email and jobTitle are required' });
    }
    const { rows } = await query(
      `INSERT INTO resources (first_name, last_name, email, job_title, job_description, user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, first_name, last_name, email, job_title, job_description, user_id, status, created_at`,
      [firstName.trim(), lastName.trim(), email.trim(), jobTitle.trim(), jobDescription?.trim() || null, userId || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ error: 'Linked user not found' });
    next(err);
  }
});

// PATCH /api/resources/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { firstName, lastName, email, jobTitle, jobDescription, userId, status } = req.body;
    const fields = [];
    const values = [];
    let i = 1;
    if (firstName !== undefined)      { fields.push(`first_name = $${i++}`);      values.push(firstName.trim()); }
    if (lastName !== undefined)       { fields.push(`last_name = $${i++}`);       values.push(lastName.trim()); }
    if (email !== undefined)          { fields.push(`email = $${i++}`);           values.push(email.trim()); }
    if (jobTitle !== undefined)       { fields.push(`job_title = $${i++}`);       values.push(jobTitle.trim()); }
    if (jobDescription !== undefined) { fields.push(`job_description = $${i++}`); values.push(jobDescription?.trim() || null); }
    if (userId !== undefined)         { fields.push(`user_id = $${i++}`);         values.push(userId || null); }
    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
      fields.push(`status = $${i++}`); values.push(status);
    }
    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.params.id);
    const { rows } = await query(
      `UPDATE resources SET ${fields.join(', ')} WHERE id = $${i}
       RETURNING id, first_name, last_name, email, job_title, job_description, user_id, status, created_at`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: 'Resource not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ error: 'Linked user not found' });
    next(err);
  }
});

// DELETE /api/resources/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await query('DELETE FROM resources WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Resource not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 2: Mount the route in `api/src/index.js`**

Add the import after the `attributeListsRoutes` import from Task 3:

```js
const resourcesRoutes = require('./routes/resources');
```

Add the mount after `app.use('/api/attribute-lists', attributeListsRoutes);`:

```js
app.use('/api/resources', resourcesRoutes);
```

- [ ] **Step 3: Restart the API container**

Run: `docker compose restart pdash-api`
Expected: clean restart, no stack trace in `docker compose logs pdash-api --tail 20`.

- [ ] **Step 4: Manually verify the endpoints**

```bash
curl -s -b "<cookie>" -X POST http://localhost/api/resources -H "Content-Type: application/json" \
  -d '{"firstName":"Jane","lastName":"Doe","email":"jane.doe@example.com","jobTitle":"Project Manager"}'
```
Expected: 201, JSON with `status: "active"`, `user_id: null`.

```bash
curl -s -b "<cookie>" http://localhost/api/resources
```
Expected: JSON array containing the row just created.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/resources.js api/src/index.js
git commit -m "feat: add resources API routes"
```

---

### Task 5: Navigation integration

**Files:**
- Modify: `js/nav.js`
- Modify (cache-bust bump `nav.js?v=8` → `nav.js?v=9`): `admin.html`, `costgrid.html`, `config.html`, `_terms-editor.html`, `_db-reset.html`, `portfolio.html`, `planning.html`, `pipeline.html`, `project-config.html`, `timesheets.html`

**Interfaces:**
- Produces: two new links in the existing "⚙ Admin" dropdown — `/team.html` and `/attribute-lists.html` — visible to `admin`/`sysadmin`, consumed by Tasks 6 and 7's pages via `activeTab` values `'team'` and `'attributelists'`.

- [ ] **Step 1: Add the two new admin page ids and dropdown entries**

In `js/nav.js`, change:

```js
const adminPageIds = ['config', 'timesheets', 'admin'];
const adminHtml = (user.role === 'admin' || user.role === 'sysadmin')
    ? `<span style="border-left:1px solid rgba(255,255,255,.15);margin:8px 6px;align-self:stretch"></span>` +
      `<div class="dropdown">
        <a class="nav-main-tab nav-role-menu-trigger dropdown-toggle${adminPageIds.includes(activeTab) ? ' active' : ''}"
           href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">⚙ Admin</a>
        <ul class="dropdown-menu">
          <li><a class="dropdown-item${activeTab === 'config'     ? ' active' : ''}" href="/config.html">⚙ Config</a></li>
          <li><a class="dropdown-item${activeTab === 'timesheets' ? ' active' : ''}" href="/timesheets.html">📂 Actuals Repository</a></li>
          <li><a class="dropdown-item${activeTab === 'admin'      ? ' active' : ''}" href="/admin.html">👤 User Admin</a></li>
        </ul>
      </div>`
    : '';
```

to:

```js
const adminPageIds = ['config', 'timesheets', 'admin', 'team', 'attributelists'];
const adminHtml = (user.role === 'admin' || user.role === 'sysadmin')
    ? `<span style="border-left:1px solid rgba(255,255,255,.15);margin:8px 6px;align-self:stretch"></span>` +
      `<div class="dropdown">
        <a class="nav-main-tab nav-role-menu-trigger dropdown-toggle${adminPageIds.includes(activeTab) ? ' active' : ''}"
           href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">⚙ Admin</a>
        <ul class="dropdown-menu">
          <li><a class="dropdown-item${activeTab === 'config'          ? ' active' : ''}" href="/config.html">⚙ Config</a></li>
          <li><a class="dropdown-item${activeTab === 'timesheets'      ? ' active' : ''}" href="/timesheets.html">📂 Actuals Repository</a></li>
          <li><a class="dropdown-item${activeTab === 'admin'           ? ' active' : ''}" href="/admin.html">👤 User Admin</a></li>
          <li><a class="dropdown-item${activeTab === 'team'            ? ' active' : ''}" href="/team.html">👥 Team</a></li>
          <li><a class="dropdown-item${activeTab === 'attributelists'  ? ' active' : ''}" href="/attribute-lists.html">🏷 Attribute Lists</a></li>
        </ul>
      </div>`
    : '';
```

- [ ] **Step 2: Bump the `nav.js` cache-bust version everywhere it's referenced**

Run this to find every reference (should list all 10 files below plus any new ones added later):
```bash
grep -rn 'nav\.js?v=8' *.html
```

In each of `admin.html`, `costgrid.html`, `config.html`, `_terms-editor.html`, `_db-reset.html`, `portfolio.html`, `planning.html`, `pipeline.html`, `project-config.html`, `timesheets.html`, change:

```html
<script defer src="js/nav.js?v=8"></script>
```

to:

```html
<script defer src="js/nav.js?v=9"></script>
```

- [ ] **Step 3: Verify no stale reference remains**

Run: `grep -rn 'nav\.js?v=8' *.html`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add js/nav.js admin.html costgrid.html config.html _terms-editor.html _db-reset.html portfolio.html planning.html pipeline.html project-config.html timesheets.html
git commit -m "feat: add Team and Attribute Lists links to admin nav menu"
```

---

### Task 6: `team.html` page

**Files:**
- Create: `team.html`

**Interfaces:**
- Consumes: `GET/POST /api/resources`, `PATCH/DELETE /api/resources/:id` (Task 4); `GET /api/roles` (existing, returns `[{id, label, code, team, hourly_rate, rate_overrides}]`); `GET /api/users/active-list` (existing, returns `[{id, email, first_name, last_name, role}]`); `initNav('team', ...)`, `esc()`, `showConfirm()` from `js/core.js`/`js/nav.js` (Task 5's updated `nav.js?v=9`).

- [ ] **Step 1: Write `team.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PDash — Team</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css">
  <link rel="stylesheet" href="css/tokens.css?v=7">
  <link rel="stylesheet" href="css/style.css?v=11">
  <style>
    body { background: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .page { margin: 2rem auto; }
    .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
    .page-header h1 { font-size: 2.5rem; font-weight: 700; margin: 0; color: var(--brand-navy); }
    .card { border: 1px solid #e5e7eb; border-radius: 10px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
    .card-body { padding: 0; }
    .table { margin: 0; font-size: 0.875rem; }
    .table thead th { background: #f9fafb; border-bottom: 1px solid #e5e7eb;
                      font-size: 0.78rem; font-weight: 600; text-transform: uppercase;
                      letter-spacing: 0.04em; color: #6b7280; padding: 0.75rem 1rem; }
    .table tbody td { padding: 0.85rem 1rem; vertical-align: middle; border-bottom: 1px solid #f3f4f6; }
    .table tbody tr:last-child td { border-bottom: none; }
    .table tbody tr:hover td { background: #fafafa; }
    .badge-st-active   { background: #dcfce7; color: #166534; font-size: 0.75rem; padding: 0.25rem 0.6rem; border-radius: 999px; font-weight: 600; }
    .badge-st-inactive { background: #f3f4f6; color: #9ca3af; font-size: 0.75rem; padding: 0.25rem 0.6rem; border-radius: 999px; font-weight: 600; }
    .btn-primary { background: var(--brand-magenta); border: none; color: #fff; font-weight: 600; font-size: 0.875rem; }
    .btn-primary:hover:not(:disabled) { background: #d01f6a; color: #fff; }
    .btn-primary:disabled { opacity: 0.65; color: #fff; }
    .btn-action { font-size: 0.78rem; padding: 0.25rem 0.6rem; }
    .form-label { font-size: 0.82rem; font-weight: 600; color: #374151; margin-bottom: 0.3rem; }
    .form-control, .form-select { font-size: 0.875rem; border-color: #e5e7eb; }
    .form-control:focus, .form-select:focus { border-color: var(--brand-magenta); box-shadow: 0 0 0 3px rgba(240,40,122,0.12); }
    .empty { text-align: center; padding: 3rem 1rem; color: #9ca3af; font-size: 0.875rem; }
    .alert-sm { font-size: 0.83rem; padding: 0.5rem 0.75rem; }
  </style>
</head>
<body>

<div id="nav-container"></div>

  <div id="app" v-cloak>

    <div class="page app-container" v-if="ready">

      <div class="page-header">
        <h1>Team <span class="text-muted fw-normal" style="font-size:1rem">({{ resources.length }})</span></h1>
        <button class="btn btn-primary" @click="openCreate">+ New resource</button>
      </div>

      <div v-if="globalError" class="alert alert-danger alert-sm mb-3">{{ globalError }}</div>

      <div class="d-flex gap-2 mb-3 align-items-center">
        <input v-model="filterText" type="text" class="form-control form-control-sm" style="max-width:280px"
               placeholder="Search name or email…">
        <div class="form-check ms-2">
          <input class="form-check-input" type="checkbox" id="showInactive" v-model="showInactive">
          <label class="form-check-label" for="showInactive" style="font-size:.85rem">Show inactive</label>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <table class="table table-hover" v-if="filteredResources.length">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Job title</th>
                <th>Linked user</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in filteredResources" :key="r.id">
                <td class="fw-semibold">{{ r.first_name }} {{ r.last_name }}</td>
                <td class="text-muted">{{ r.email }}</td>
                <td>{{ r.job_title }}</td>
                <td class="text-muted">
                  <span v-if="r.user_id">{{ r.linked_user_first_name }} {{ r.linked_user_last_name }}</span>
                  <span v-else>—</span>
                </td>
                <td><span :class="'badge-st-' + r.status">{{ r.status }}</span></td>
                <td class="text-end" style="white-space:nowrap">
                  <button class="btn btn-outline-secondary btn-action me-1" :disabled="!!r._loading" @click="openEdit(r)">Edit</button>
                  <button class="btn btn-outline-secondary btn-action me-1" :disabled="!!r._loading" @click="toggleStatus(r)">
                    {{ r.status === 'active' ? 'Deactivate' : 'Activate' }}
                  </button>
                  <button class="btn btn-outline-danger btn-action" :disabled="!!r._loading" @click="confirmDelete(r)">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="empty" v-else>No resources match the current filter.</div>
        </div>
      </div>
    </div>

    <div v-else-if="!accessDenied" class="d-flex align-items-center justify-content-center" style="height:60vh">
      <div class="spinner-border text-secondary"></div>
    </div>
    <div v-else class="d-flex align-items-center justify-content-center" style="height:60vh">
      <div class="text-center text-muted">
        <div style="font-size:2rem">🔒</div>
        <p class="mt-2">Admin access required.</p>
        <a href="/" class="btn btn-outline-secondary btn-sm">Go to app</a>
      </div>
    </div>

    <!-- ── CREATE/EDIT MODAL ────────────────────────────────── -->
    <div class="modal fade" id="resourceModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header border-0 pb-0">
            <h5 class="modal-title fw-bold">{{ form.id ? 'Edit resource' : 'New resource' }}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form @submit.prevent="submitForm" novalidate>
            <div class="modal-body">
              <div v-if="form.error" class="alert alert-danger alert-sm mb-3">{{ form.error }}</div>
              <div class="row g-3">
                <div class="col-6">
                  <label class="form-label">First name</label>
                  <input v-model="form.firstName" type="text" class="form-control" required>
                </div>
                <div class="col-6">
                  <label class="form-label">Last name</label>
                  <input v-model="form.lastName" type="text" class="form-control" required>
                </div>
                <div class="col-12">
                  <label class="form-label">Email</label>
                  <input v-model="form.email" type="email" class="form-control" required>
                </div>
                <div class="col-12">
                  <label class="form-label">Job title</label>
                  <select v-model="form.jobTitleSelect" class="form-select">
                    <option v-for="role in roles" :key="role.id" :value="role.label">{{ role.label }}</option>
                    <option value="__other__">Other…</option>
                  </select>
                  <input v-if="form.jobTitleSelect === '__other__'" v-model="form.jobTitleOther"
                         type="text" class="form-control mt-2" placeholder="Enter a custom job title" required>
                </div>
                <div class="col-12">
                  <label class="form-label">Job description</label>
                  <textarea v-model="form.jobDescription" class="form-control" rows="3"></textarea>
                </div>
                <div class="col-12">
                  <label class="form-label">Linked PDash user (optional)</label>
                  <select v-model="form.userId" class="form-select">
                    <option :value="null">— None —</option>
                    <option v-for="u in users" :key="u.id" :value="u.id">{{ u.first_name }} {{ u.last_name }} ({{ u.email }})</option>
                  </select>
                </div>
              </div>
            </div>
            <div class="modal-footer border-0 pt-0">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>
              <button type="submit" class="btn btn-primary" :disabled="form.loading">
                <span v-if="form.loading" class="spinner-border spinner-border-sm me-2"></span>
                {{ form.id ? 'Save' : 'Create' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Confirm -->
    <div class="modal fade" id="confirmModal" tabindex="-1" data-bs-backdrop="static">
      <div class="modal-dialog modal-dialog-centered" style="max-width:460px">
        <div class="modal-content shadow-lg">
          <div class="modal-header border-0 pb-1">
            <h6 class="modal-title fw-bold" id="confirmModalTitle">⚠️ Confirm</h6>
          </div>
          <div class="modal-body pt-1">
            <p id="confirmModalMessage" class="mb-0" style="white-space:pre-line;font-size:.92rem"></p>
          </div>
          <div class="modal-footer border-0 pt-2">
            <button class="btn btn-secondary" id="confirmModalCancel" data-bs-dismiss="modal">Cancel</button>
            <button class="btn btn-danger" id="confirmModalOk">Confirm</button>
          </div>
        </div>
      </div>
    </div>

  </div><!-- #app -->

  <script defer src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
  <script defer src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
  <script defer src="js/api.js?v=6"></script>
  <script defer src="js/core.js?v=5"></script>
  <script defer src="js/settings.js"></script>
  <script type="module" src="js/lib/notif-browser.js?v=2"></script>
  <script defer src="js/notifications.js?v=2"></script>
  <script defer src="js/nav.js?v=9"></script>
  <script type="module">
    Vue.createApp({
      data() {
        return {
          ready: false,
          accessDenied: false,
          me: {},
          resources: [],
          roles: [],
          users: [],
          filterText: '',
          showInactive: false,
          globalError: null,
          form: this.blankForm(),
          _resourceModal: null,
        };
      },
      computed: {
        filteredResources() {
          const q = this.filterText.trim().toLowerCase();
          return this.resources.filter(r => {
            if (!this.showInactive && r.status !== 'active') return false;
            if (!q) return true;
            const hay = `${r.first_name} ${r.last_name} ${r.email}`.toLowerCase();
            return hay.includes(q);
          });
        },
      },
      async created() {
        const user = await initNav('team', { breadcrumbs: [
          { label: 'Home', href: '/pipeline.html' },
          { label: 'Team' },
        ]});
        if (!user) return;
        this.me = user;
        if (!['admin', 'sysadmin'].includes(user.role)) { this.accessDenied = true; return; }
        await Promise.all([this.loadResources(), this.loadRoles(), this.loadUsers()]);
        this.ready = true;
      },
      mounted() {
        this._resourceModal = new bootstrap.Modal(document.getElementById('resourceModal'));
      },
      methods: {
        blankForm() {
          return { id: null, firstName: '', lastName: '', email: '', jobTitleSelect: '', jobTitleOther: '',
                    jobDescription: '', userId: null, status: 'active', loading: false, error: null };
        },
        async loadResources() {
          const res = await fetch('/api/resources', { credentials: 'same-origin' });
          this.resources = await res.json();
        },
        async loadRoles() {
          const res = await fetch('/api/roles', { credentials: 'same-origin' });
          this.roles = await res.json();
        },
        async loadUsers() {
          const res = await fetch('/api/users/active-list', { credentials: 'same-origin' });
          this.users = await res.json();
        },

        openCreate() {
          this.form = this.blankForm();
          this._resourceModal.show();
        },
        openEdit(r) {
          const knownLabel = this.roles.some(role => role.label === r.job_title);
          this.form = {
            id: r.id, firstName: r.first_name, lastName: r.last_name, email: r.email,
            jobTitleSelect: knownLabel ? r.job_title : '__other__',
            jobTitleOther: knownLabel ? '' : r.job_title,
            jobDescription: r.job_description || '', userId: r.user_id, status: r.status,
            loading: false, error: null,
          };
          this._resourceModal.show();
        },

        async submitForm() {
          this.form.loading = true;
          this.form.error = null;
          const jobTitle = this.form.jobTitleSelect === '__other__' ? this.form.jobTitleOther.trim() : this.form.jobTitleSelect;
          if (!jobTitle) { this.form.error = 'Job title is required'; this.form.loading = false; return; }
          const payload = {
            firstName: this.form.firstName, lastName: this.form.lastName, email: this.form.email,
            jobTitle, jobDescription: this.form.jobDescription, userId: this.form.userId,
          };
          try {
            const url = this.form.id ? `/api/resources/${this.form.id}` : '/api/resources';
            const method = this.form.id ? 'PATCH' : 'POST';
            const res = await fetch(url, {
              method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
              body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) { this.form.error = data.error || 'Save failed'; return; }
            this._resourceModal.hide();
            await this.loadResources();
          } catch {
            this.form.error = 'Network error. Please try again.';
          } finally {
            this.form.loading = false;
          }
        },

        async toggleStatus(r) {
          r._loading = true;
          this.globalError = null;
          try {
            const newStatus = r.status === 'active' ? 'inactive' : 'active';
            const res = await fetch(`/api/resources/${r.id}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
              body: JSON.stringify({ status: newStatus }),
            });
            const data = await res.json();
            if (!res.ok) { this.globalError = data.error; return; }
            r.status = data.status;
          } catch {
            this.globalError = 'Network error.';
          } finally {
            r._loading = false;
          }
        },

        confirmDelete(r) {
          showConfirm(`Delete resource "${r.first_name} ${r.last_name}"?\n\nThis cannot be undone.`, () => this.deleteResource(r));
        },
        async deleteResource(r) {
          r._loading = true;
          this.globalError = null;
          try {
            const res = await fetch(`/api/resources/${r.id}`, { method: 'DELETE', credentials: 'same-origin' });
            const data = await res.json();
            if (!res.ok) { this.globalError = data.error; return; }
            await this.loadResources();
          } catch {
            this.globalError = 'Network error.';
          } finally {
            r._loading = false;
          }
        },
      },
    }).mount('#app');
  </script>
</body>
</html>
```

- [ ] **Step 2: Visually verify in the browser**

Log in as an admin, navigate to `/team.html` via the ⚙ Admin dropdown. Create a resource with a dropdown job title, create one with "Other…" + a custom title, edit one, deactivate one (confirm it disappears from the default view but reappears with "Show inactive" checked), delete one via the confirm modal.
Expected: all actions succeed with no console errors; page matches `admin.html`'s visual style.

- [ ] **Step 3: Commit**

```bash
git add team.html
git commit -m "feat: add Team resource registry page"
```

---

### Task 7: `attribute-lists.html` page

**Files:**
- Create: `attribute-lists.html`

**Interfaces:**
- Consumes: `GET/POST /api/attribute-lists`, `PATCH /api/attribute-lists/:id`, `GET/POST /api/attribute-lists/:id/items`, `PATCH /api/attribute-lists/:id/items/:itemId` (Task 3); `initNav('attributelists', ...)`, `showConfirm()`/`showInfo()` are not required here (no delete action exists for lists/items in this cycle) but `showInfo()` could surface validation errors — this page relies on inline modal error text instead, consistent with `team.html`.

- [ ] **Step 1: Write `attribute-lists.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PDash — Attribute Lists</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css">
  <link rel="stylesheet" href="css/tokens.css?v=7">
  <link rel="stylesheet" href="css/style.css?v=11">
  <style>
    body { background: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .page { margin: 2rem auto; }
    .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
    .page-header h1 { font-size: 2.5rem; font-weight: 700; margin: 0; color: var(--brand-navy); }
    .card { border: 1px solid #e5e7eb; border-radius: 10px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
    .card-body { padding: 0; }
    .table { margin: 0; font-size: 0.875rem; }
    .table thead th { background: #f9fafb; border-bottom: 1px solid #e5e7eb;
                      font-size: 0.78rem; font-weight: 600; text-transform: uppercase;
                      letter-spacing: 0.04em; color: #6b7280; padding: 0.75rem 1rem; }
    .table tbody td { padding: 0.85rem 1rem; vertical-align: middle; border-bottom: 1px solid #f3f4f6; }
    .table tbody tr:last-child td { border-bottom: none; }
    .table tbody tr:hover td { background: #fafafa; cursor: pointer; }
    .badge-st-active   { background: #dcfce7; color: #166534; font-size: 0.75rem; padding: 0.25rem 0.6rem; border-radius: 999px; font-weight: 600; }
    .badge-st-inactive { background: #f3f4f6; color: #9ca3af; font-size: 0.75rem; padding: 0.25rem 0.6rem; border-radius: 999px; font-weight: 600; }
    .btn-primary { background: var(--brand-magenta); border: none; color: #fff; font-weight: 600; font-size: 0.875rem; }
    .btn-primary:hover:not(:disabled) { background: #d01f6a; color: #fff; }
    .btn-primary:disabled { opacity: 0.65; color: #fff; }
    .btn-action { font-size: 0.78rem; padding: 0.25rem 0.6rem; }
    .form-label { font-size: 0.82rem; font-weight: 600; color: #374151; margin-bottom: 0.3rem; }
    .form-control, .form-select { font-size: 0.875rem; border-color: #e5e7eb; }
    .form-control:focus { border-color: var(--brand-magenta); box-shadow: 0 0 0 3px rgba(240,40,122,0.12); }
    .empty { text-align: center; padding: 3rem 1rem; color: #9ca3af; font-size: 0.875rem; }
    .alert-sm { font-size: 0.83rem; padding: 0.5rem 0.75rem; }
    .slug-code { font-size: .78rem; color: #9ca3af; }
  </style>
</head>
<body>

<div id="nav-container"></div>

  <div id="app" v-cloak>

    <div class="page app-container" v-if="ready">

      <!-- ── LIST-OF-LISTS VIEW ────────────────────────────── -->
      <template v-if="!currentList">
        <div class="page-header">
          <h1>Attribute Lists <span class="text-muted fw-normal" style="font-size:1rem">({{ lists.length }})</span></h1>
          <button class="btn btn-primary" @click="openNewList">+ New list</button>
        </div>

        <div v-if="globalError" class="alert alert-danger alert-sm mb-3">{{ globalError }}</div>

        <div class="card">
          <div class="card-body">
            <table class="table table-hover" v-if="lists.length">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Active items</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="l in lists" :key="l.id" @click="openList(l)">
                  <td class="fw-semibold">{{ l.name }}</td>
                  <td class="slug-code">{{ l.slug }}</td>
                  <td>{{ l.active_item_count }}</td>
                  <td class="text-end" @click.stop>
                    <button class="btn btn-outline-secondary btn-action" @click="openRenameList(l)">Rename</button>
                  </td>
                </tr>
              </tbody>
            </table>
            <div class="empty" v-else>No attribute lists yet.</div>
          </div>
        </div>
      </template>

      <!-- ── LIST DRILL-IN VIEW ───────────────────────────── -->
      <template v-else>
        <div class="page-header">
          <div>
            <button class="btn btn-outline-secondary btn-sm mb-2" @click="backToLists">← All lists</button>
            <h1>{{ currentList.name }} <span class="text-muted fw-normal" style="font-size:1rem">{{ currentList.slug }}</span></h1>
          </div>
          <button class="btn btn-primary" @click="openNewItem">+ New item</button>
        </div>

        <div v-if="globalError" class="alert alert-danger alert-sm mb-3">{{ globalError }}</div>

        <div class="form-check mb-3">
          <input class="form-check-input" type="checkbox" id="showInactiveItems" v-model="showInactiveItems">
          <label class="form-check-label" for="showInactiveItems" style="font-size:.85rem">Show inactive</label>
        </div>

        <div class="card">
          <div class="card-body">
            <table class="table table-hover" v-if="filteredItems.length">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="it in filteredItems" :key="it.id">
                  <td>{{ it.label }}</td>
                  <td><span :class="'badge-st-' + it.status">{{ it.status }}</span></td>
                  <td class="text-end" style="white-space:nowrap">
                    <button class="btn btn-outline-secondary btn-action me-1" :disabled="!!it._loading" @click="openEditItem(it)">Edit</button>
                    <button class="btn btn-outline-secondary btn-action" :disabled="!!it._loading" @click="toggleItemStatus(it)">
                      {{ it.status === 'active' ? 'Deactivate' : 'Activate' }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <div class="empty" v-else>No items match the current filter.</div>
          </div>
        </div>
      </template>
    </div>

    <div v-else-if="!accessDenied" class="d-flex align-items-center justify-content-center" style="height:60vh">
      <div class="spinner-border text-secondary"></div>
    </div>
    <div v-else class="d-flex align-items-center justify-content-center" style="height:60vh">
      <div class="text-center text-muted">
        <div style="font-size:2rem">🔒</div>
        <p class="mt-2">Admin access required.</p>
        <a href="/" class="btn btn-outline-secondary btn-sm">Go to app</a>
      </div>
    </div>

    <!-- ── NEW/RENAME LIST MODAL ────────────────────────────── -->
    <div class="modal fade" id="listModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header border-0 pb-0">
            <h5 class="modal-title fw-bold">{{ listForm.id ? 'Rename list' : 'New list' }}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form @submit.prevent="submitListForm" novalidate>
            <div class="modal-body">
              <div v-if="listForm.error" class="alert alert-danger alert-sm mb-3">{{ listForm.error }}</div>
              <label class="form-label">Name</label>
              <input v-model="listForm.name" type="text" class="form-control" required>
            </div>
            <div class="modal-footer border-0 pt-0">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>
              <button type="submit" class="btn btn-primary" :disabled="listForm.loading">
                <span v-if="listForm.loading" class="spinner-border spinner-border-sm me-2"></span>
                {{ listForm.id ? 'Save' : 'Create' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- ── NEW/EDIT ITEM MODAL ─────────────────────────────── -->
    <div class="modal fade" id="itemModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header border-0 pb-0">
            <h5 class="modal-title fw-bold">{{ itemForm.id ? 'Edit item' : 'New item' }}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form @submit.prevent="submitItemForm" novalidate>
            <div class="modal-body">
              <div v-if="itemForm.error" class="alert alert-danger alert-sm mb-3">{{ itemForm.error }}</div>
              <label class="form-label">Label</label>
              <input v-model="itemForm.label" type="text" class="form-control" required>
            </div>
            <div class="modal-footer border-0 pt-0">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>
              <button type="submit" class="btn btn-primary" :disabled="itemForm.loading">
                <span v-if="itemForm.loading" class="spinner-border spinner-border-sm me-2"></span>
                {{ itemForm.id ? 'Save' : 'Create' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

  </div><!-- #app -->

  <script defer src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
  <script defer src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
  <script defer src="js/api.js?v=6"></script>
  <script defer src="js/core.js?v=5"></script>
  <script defer src="js/settings.js"></script>
  <script type="module" src="js/lib/notif-browser.js?v=2"></script>
  <script defer src="js/notifications.js?v=2"></script>
  <script defer src="js/nav.js?v=9"></script>
  <script type="module">
    Vue.createApp({
      data() {
        return {
          ready: false,
          accessDenied: false,
          me: {},
          lists: [],
          currentList: null,
          items: [],
          showInactiveItems: false,
          globalError: null,
          listForm: { id: null, name: '', loading: false, error: null },
          itemForm: { id: null, label: '', loading: false, error: null },
          _listModal: null,
          _itemModal: null,
        };
      },
      computed: {
        filteredItems() {
          return this.showInactiveItems ? this.items : this.items.filter(it => it.status === 'active');
        },
      },
      async created() {
        const user = await initNav('attributelists', { breadcrumbs: [
          { label: 'Home', href: '/pipeline.html' },
          { label: 'Attribute Lists' },
        ]});
        if (!user) return;
        this.me = user;
        if (!['admin', 'sysadmin'].includes(user.role)) { this.accessDenied = true; return; }
        await this.loadLists();
        this.ready = true;
      },
      mounted() {
        this._listModal = new bootstrap.Modal(document.getElementById('listModal'));
        this._itemModal = new bootstrap.Modal(document.getElementById('itemModal'));
      },
      methods: {
        async loadLists() {
          const res = await fetch('/api/attribute-lists', { credentials: 'same-origin' });
          this.lists = await res.json();
        },
        async openList(l) {
          this.currentList = l;
          const res = await fetch(`/api/attribute-lists/${l.id}/items`, { credentials: 'same-origin' });
          this.items = await res.json();
        },
        backToLists() {
          this.currentList = null;
          this.items = [];
          this.loadLists();
        },

        openNewList() {
          this.listForm = { id: null, name: '', loading: false, error: null };
          this._listModal.show();
        },
        openRenameList(l) {
          this.listForm = { id: l.id, name: l.name, loading: false, error: null };
          this._listModal.show();
        },
        async submitListForm() {
          this.listForm.loading = true;
          this.listForm.error = null;
          try {
            const url = this.listForm.id ? `/api/attribute-lists/${this.listForm.id}` : '/api/attribute-lists';
            const method = this.listForm.id ? 'PATCH' : 'POST';
            const res = await fetch(url, {
              method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
              body: JSON.stringify({ name: this.listForm.name }),
            });
            const data = await res.json();
            if (!res.ok) { this.listForm.error = data.error || 'Save failed'; return; }
            this._listModal.hide();
            await this.loadLists();
          } catch {
            this.listForm.error = 'Network error. Please try again.';
          } finally {
            this.listForm.loading = false;
          }
        },

        openNewItem() {
          this.itemForm = { id: null, label: '', loading: false, error: null };
          this._itemModal.show();
        },
        openEditItem(it) {
          this.itemForm = { id: it.id, label: it.label, loading: false, error: null };
          this._itemModal.show();
        },
        async submitItemForm() {
          this.itemForm.loading = true;
          this.itemForm.error = null;
          try {
            const url = this.itemForm.id
              ? `/api/attribute-lists/${this.currentList.id}/items/${this.itemForm.id}`
              : `/api/attribute-lists/${this.currentList.id}/items`;
            const method = this.itemForm.id ? 'PATCH' : 'POST';
            const res = await fetch(url, {
              method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
              body: JSON.stringify({ label: this.itemForm.label }),
            });
            const data = await res.json();
            if (!res.ok) { this.itemForm.error = data.error || 'Save failed'; return; }
            this._itemModal.hide();
            await this.openList(this.currentList);
            await this.loadLists();
          } catch {
            this.itemForm.error = 'Network error. Please try again.';
          } finally {
            this.itemForm.loading = false;
          }
        },

        async toggleItemStatus(it) {
          it._loading = true;
          this.globalError = null;
          try {
            const newStatus = it.status === 'active' ? 'inactive' : 'active';
            const res = await fetch(`/api/attribute-lists/${this.currentList.id}/items/${it.id}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
              body: JSON.stringify({ status: newStatus }),
            });
            const data = await res.json();
            if (!res.ok) { this.globalError = data.error; return; }
            it.status = data.status;
            await this.loadLists();
          } catch {
            this.globalError = 'Network error.';
          } finally {
            it._loading = false;
          }
        },
      },
    }).mount('#app');
  </script>
</body>
</html>
```

- [ ] **Step 2: Visually verify in the browser**

Log in as an admin, navigate to `/attribute-lists.html`. Confirm the 4 seeded lists (Brand, Market, Service Type, Therapeutic Area) appear with slug and `0` active items. Click into "Market", add an item "EU", edit its label to "EU/EEA", deactivate it (confirm it disappears from the default view, count on the list-of-lists screen drops to 0), re-activate it, rename the "Market" list itself and confirm the slug stays `market`.
Expected: all actions succeed with no console errors.

- [ ] **Step 3: Commit**

```bash
git add attribute-lists.html
git commit -m "feat: add Attribute Lists taxonomy admin page"
```

---

### Task 8: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `docker exec pdash-api node --test src/lib/*.test.js src/routes/*.test.js`
Expected: all tests pass, including the new `slugify.test.js`, with no regressions in existing suites.

- [ ] **Step 2: Confirm non-admin users are blocked**

Log in as a plain `user`-role account, navigate directly to `/team.html` and `/attribute-lists.html`.
Expected: "Admin access required" screen on both, and the ⚙ Admin dropdown (and its Team/Attribute Lists entries) is absent from the navbar entirely.

- [ ] **Step 3: Confirm no existing page regressed**

Spot-check `pipeline.html`, `admin.html`, and `config.html` load normally (navbar renders, no console errors) — these all load the bumped `nav.js?v=9`.

- [ ] **Step 4: Final review commit (if any fixups were needed)**

If Steps 1-3 required any fixes, commit them:
```bash
git add -A
git commit -m "fix: address end-to-end verification findings for Team/Attribute Lists"
```
