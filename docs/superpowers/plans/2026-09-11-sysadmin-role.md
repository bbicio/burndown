# Sysadmin Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a third user role, `sysadmin`, sitting above `admin` — a sysadmin inherits every existing admin-only capability, plus two privileges that move out of the admin tier entirely: access to `_db-reset.html` and the ability to edit/publish Terms & Conditions (moved to a new dedicated page, `_terms-editor.html`). Both new pages are reachable only from a new, sysadmin-only navbar menu block.

**Architecture:** `users.role` becomes a 3-value enum (`user`/`admin`/`sysadmin`) instead of 2. The existing `requireAdmin` backend middleware is widened to accept `sysadmin` too (so every route that already gates on admin keeps working unchanged); a new `requireSysAdmin` middleware is exclusive to the top tier and replaces `requireAdmin` only on the two routes being carved out (`reset.js`, `PUT /app-settings/terms`). A new pure function, `roleChangeError()`, centralizes the validation rules for role transitions (who can promote/demote to/from `sysadmin`, and the two-step `user→admin→sysadmin` promotion path) so the rules are unit-testable in isolation from Express/Postgres, consistent with this codebase's existing `api/src/lib/` convention (e.g. `rate-resolve.js`, `date-parse.js`).

**Tech Stack:** Node.js/Express backend (`node:test` for the one pure lib function this plan adds — routes/middleware themselves have no existing test harness in this codebase and this plan follows that established pattern, verifying them manually via `curl`/browser instead of inventing new test infrastructure), Vue 3 via CDN (no build step) for `admin.html` and the new `_terms-editor.html`, plain PostgreSQL migration.

**Spec:** `docs/superpowers/specs/2026-09-11-sysadmin-role-design.md`

## Global Constraints

- All user-facing text must be in English (`CLAUDE.md`).
- No bundler/build step for the frontend — `js/`/`css/`/`*.html` are served by nginx exactly as they are on disk.
- Every Vue-mounted page's root element carries `v-cloak` (paired with `css/tokens.css`'s `[v-cloak]{display:none}` rule) — the new `_terms-editor.html` must follow this.
- Any modification to a shared classic script loaded via a `?v=N` cache-busting query string (`js/nav.js`) requires bumping that query string on **every** page that loads it, per this session's established convention.
- No native `alert()`/`confirm()` for anything this plan touches beyond what already exists (`admin.html`'s existing `confirmAnonymize()` uses `confirm()` already — out of scope, not touched).
- Never run destructive `docker compose` commands against the main stack without explicit user confirmation, a prior `pg_dump`, and never with `-v`/`--volumes` (`CLAUDE.md` "Infrastructure safety").

---

## Task 1: Database migration — widen the `role` check constraint

**Files:**
- Create: `api/src/db/migrations/018_sysadmin_role.sql`

**Interfaces:**
- Produces: a `users.role` column that accepts `'admin' | 'user' | 'sysadmin'` (previously only `'admin' | 'user'`). No existing row changes value — this is purely a constraint widening.

- [ ] **Step 1: Write the migration file**

```sql
-- Migration 018: allow role = 'sysadmin' on users (third tier above 'admin')
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user', 'sysadmin'));
```

- [ ] **Step 2: Apply it to the running dev DB**

```powershell
docker exec -i pdash-db psql -U pdash -d pdash < api/src/db/migrations/018_sysadmin_role.sql
```

- [ ] **Step 3: Verify the constraint was actually replaced**

```powershell
docker exec pdash-db psql -U pdash -d pdash -c "\d users" 
```

Expected: the `Check constraints` section for `users` shows `users_role_check CHECK (role::text = ANY (ARRAY['admin'::text, 'user'::text, 'sysadmin'::text]))` (exact array order/casing may vary by Postgres version — what matters is `'sysadmin'` is present).

- [ ] **Step 4: Commit**

```bash
git add api/src/db/migrations/018_sysadmin_role.sql
git commit -m "$(cat <<'EOF'
feat: add sysadmin as a third users.role value

Widens the role CHECK constraint from ('admin','user') to
('admin','user','sysadmin'). No existing rows change value — this
is a pure constraint widening, first step of the sysadmin role rollout.
EOF
)"
```

---

## Task 2: Pure role-transition validation (`api/src/lib/role-transition.js`)

**Files:**
- Create: `api/src/lib/role-transition.js`
- Test: `api/src/lib/role-transition.test.js`

**Interfaces:**
- Consumes: nothing (pure function, no dependencies).
- Produces: `roleChangeError(actorRole, targetCurrentRole, requestedRole)` — returns `null` when the transition is allowed, or a human-readable error `string` when it is not. Used by Task 3's `PATCH /api/users/:id` handler.

Rules encoded (from the spec, §2):
1. Any transition that **requests** `'sysadmin'` or that **touches a row currently `'sysadmin'`** (promoting away from it, or demoting it) requires the actor to already be `'sysadmin'`.
2. Promoting to `'sysadmin'` is only valid from a target currently `'admin'` (two-step: `user→admin` first, then `admin→sysadmin`) — direct `user→sysadmin` is rejected even when the actor is `sysadmin`.
3. Every other transition (`user↔admin`) is unrestricted, exactly as today.

- [ ] **Step 1: Write the failing tests**

```js
// api/src/lib/role-transition.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { roleChangeError } = require('./role-transition');

test('roleChangeError: admin actor promoting a user to admin is allowed (unchanged existing behavior)', () => {
  assert.equal(roleChangeError('admin', 'user', 'admin'), null);
});

test('roleChangeError: admin actor demoting an admin to user is allowed (unchanged existing behavior)', () => {
  assert.equal(roleChangeError('admin', 'admin', 'user'), null);
});

test('roleChangeError: admin actor cannot promote an admin to sysadmin', () => {
  assert.equal(
    roleChangeError('admin', 'admin', 'sysadmin'),
    'Only a sysadmin can grant or revoke sysadmin'
  );
});

test('roleChangeError: admin actor cannot change a sysadmin row at all (e.g. demote to admin)', () => {
  assert.equal(
    roleChangeError('admin', 'sysadmin', 'admin'),
    'Only a sysadmin can grant or revoke sysadmin'
  );
});

test('roleChangeError: sysadmin actor can promote an admin to sysadmin', () => {
  assert.equal(roleChangeError('sysadmin', 'admin', 'sysadmin'), null);
});

test('roleChangeError: sysadmin actor can demote a sysadmin back to admin', () => {
  assert.equal(roleChangeError('sysadmin', 'sysadmin', 'admin'), null);
});

test('roleChangeError: even a sysadmin actor cannot jump a user directly to sysadmin (two-step rule)', () => {
  assert.equal(
    roleChangeError('sysadmin', 'user', 'sysadmin'),
    'Only an admin can be promoted to sysadmin'
  );
});

test('roleChangeError: sysadmin actor can still perform ordinary user<->admin changes', () => {
  assert.equal(roleChangeError('sysadmin', 'user', 'admin'), null);
  assert.equal(roleChangeError('sysadmin', 'admin', 'user'), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd api && node --test src/lib/role-transition.test.js
```

Expected: fails with `Cannot find module './role-transition'`.

- [ ] **Step 3: Write the minimal implementation**

```js
// api/src/lib/role-transition.js
// Validates a requested users.role change beyond the simple "is it a known
// role" check already done by the caller. Pure — no DB/Express dependency —
// so the sysadmin promotion rules are testable in isolation.
function roleChangeError(actorRole, targetCurrentRole, requestedRole) {
  const touchesSysAdmin = requestedRole === 'sysadmin' || targetCurrentRole === 'sysadmin';
  if (touchesSysAdmin && actorRole !== 'sysadmin') {
    return 'Only a sysadmin can grant or revoke sysadmin';
  }
  if (requestedRole === 'sysadmin' && targetCurrentRole !== 'admin') {
    return 'Only an admin can be promoted to sysadmin';
  }
  return null;
}

module.exports = { roleChangeError };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd api && node --test src/lib/role-transition.test.js
```

Expected: `8 pass, 0 fail`.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/role-transition.js api/src/lib/role-transition.test.js
git commit -m "$(cat <<'EOF'
feat: add roleChangeError() — pure validation for sysadmin role transitions

Encodes: only a sysadmin can grant/revoke sysadmin; promotion to
sysadmin is only valid from an existing admin (two-step user→admin→
sysadmin, no direct jump). node:test-covered, no DB/Express dependency,
consumed by PATCH /api/users/:id in a following task.
EOF
)"
```

---

## Task 3: Backend permission wiring

**Files:**
- Modify: `api/src/middleware/auth.js`
- Modify: `api/src/routes/reset.js`
- Modify: `api/src/routes/app-settings.js`
- Modify: `api/src/routes/users.js`
- Modify: `api/src/routes/client-groups.js`
- Modify: `api/src/routes/currencies.js`
- Modify: `api/src/routes/pipeline-years.js`
- Modify: `api/src/routes/pots.js`

**Interfaces:**
- Consumes: `roleChangeError` from Task 2 (`require('../lib/role-transition')`).
- Produces: `requireAdmin` (now accepts `admin` or `sysadmin`) and a new `requireSysAdmin` (exclusive to `sysadmin`), both exported from `api/src/middleware/auth.js`, consumed by every route file this task touches and by every other route file already importing `requireAdmin` from that shared module (they need zero changes — this is exactly the point of widening the shared middleware instead of touching each call site).

- [ ] **Step 1: Widen `requireAdmin`, add `requireSysAdmin`**

Edit `api/src/middleware/auth.js` — replace the whole file:

```js
const { verifyToken } = require('../services/jwt');

function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.pdash_token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin' && req.user.role !== 'sysadmin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

function requireSysAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'sysadmin') {
      return res.status(403).json({ error: 'Sysadmin access required' });
    }
    next();
  });
}

module.exports = { requireAuth, requireAdmin, requireSysAdmin };
```

- [ ] **Step 2: Carve out `reset.js` to sysadmin-only**

Edit `api/src/routes/reset.js` lines 3 and 8:

```js
// before:
const { requireAuth, requireAdmin } = require('../middleware/auth');
// ...
// All endpoints require admin
router.use(requireAuth, requireAdmin);

// after:
const { requireAuth, requireSysAdmin } = require('../middleware/auth');
// ...
// All endpoints require sysadmin
router.use(requireAuth, requireSysAdmin);
```

- [ ] **Step 3: Carve out `PUT /api/app-settings/terms` to sysadmin-only**

Edit `api/src/routes/app-settings.js` line 3 and line 30:

```js
// before:
const { requireAuth, requireAdmin } = require('../middleware/auth');
// ...
// PUT /api/app-settings/terms — admin only; bumps version when publishNewVersion=true
router.put('/terms', requireAdmin, async (req, res, next) => {

// after:
const { requireAuth, requireSysAdmin } = require('../middleware/auth');
// ...
// PUT /api/app-settings/terms — sysadmin only; bumps version when publishNewVersion=true
router.put('/terms', requireSysAdmin, async (req, res, next) => {
```

`GET /terms` (line 13, `requireAuth`) is untouched.

- [ ] **Step 4: Apply `roleChangeError` in `PATCH /api/users/:id`**

Edit `api/src/routes/users.js`:

```js
// add near the top, after the existing requires:
const { roleChangeError } = require('../lib/role-transition');
```

```js
// before (lines 76-103):
router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { role, status } = req.body;

    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot modify your own account' });
    }

    const allowed = { role: ['admin', 'user'], status: ['active', 'disabled'] };
    if (role && !allowed.role.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    if (status && !allowed.status.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const fields = [];
    const params = [];
    if (role)   { params.push(role);   fields.push(`role = $${params.length}`); }
    if (status) { params.push(status); fields.push(`status = $${params.length}`); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${params.length}
       RETURNING id, email, first_name, last_name, role, status`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// after:
router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { role, status } = req.body;

    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot modify your own account' });
    }

    const allowed = { role: ['admin', 'user', 'sysadmin'], status: ['active', 'disabled'] };
    if (role && !allowed.role.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    if (status && !allowed.status.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    if (role) {
      const { rows: [target] } = await query('SELECT role FROM users WHERE id = $1', [req.params.id]);
      if (!target) return res.status(404).json({ error: 'User not found' });
      const roleErr = roleChangeError(req.user.role, target.role, role);
      if (roleErr) return res.status(403).json({ error: roleErr });
    }

    const fields = [];
    const params = [];
    if (role)   { params.push(role);   fields.push(`role = $${params.length}`); }
    if (status) { params.push(status); fields.push(`status = $${params.length}`); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${params.length}
       RETURNING id, email, first_name, last_name, role, status`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});
```

- [ ] **Step 5: Deduplicate the 4 local `requireAdmin` copies**

Each of these 4 files currently has its own local `requireAdmin`, identical in all four:

```js
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
  next();
}
```

For **each** of `api/src/routes/client-groups.js`, `api/src/routes/currencies.js`, `api/src/routes/pipeline-years.js`, `api/src/routes/pots.js`:

1. Delete the local `function requireAdmin(req, res, next) { ... }` block (lines 7-10 in every one of the four files).
2. Change the top import line from:
   ```js
   const { requireAuth } = require('../middleware/auth');
   ```
   to:
   ```js
   const { requireAuth, requireAdmin } = require('../middleware/auth');
   ```

No other line in any of these 4 files changes — every `router.xxx('/...', requireAuth, requireAdmin, ...)` call site keeps working unchanged, now backed by the shared (sysadmin-aware) implementation instead of a local admin-only duplicate.

- [ ] **Step 6: Run the existing backend test suite to confirm nothing broke**

```bash
docker exec pdash-api node --test src/lib/role-transition.test.js src/lib/date-parse.test.js src/lib/sold-hours.test.js src/lib/rate-resolve.test.js src/routes/timesheets.test.js
```

Expected: all pass, 0 fail (this repo's full available `node:test` coverage — confirms Task 2's new test still passes inside the container and nothing else regressed).

- [ ] **Step 7: Manual verification — bootstrap a real sysadmin and confirm the gates**

```powershell
# Bootstrap (or reuse) an admin account, then promote it to sysadmin directly via SQL
# (the UI-driven promotion path is verified in Task 4 — this is backend-only verification)
docker exec pdash-api node /app/src/create-admin.js sysadmin-test@example.com Test1234! Sys Admin
docker exec pdash-db psql -U pdash -d pdash -c "UPDATE users SET role='sysadmin' WHERE email='sysadmin-test@example.com';"
```

Log in via curl, keeping cookies, then confirm `_db-reset.html`'s backend is reachable and a plain admin is not:

```powershell
curl -c cookies.txt -s -X POST http://localhost/api/auth/login -H "Content-Type: application/json" -d '{"email":"sysadmin-test@example.com","password":"Test1234!"}'
curl -b cookies.txt -s http://localhost/api/admin/reset/scopes
# Expected: 200, a JSON list of scopes (sysadmin can reach it)

curl -c cookies2.txt -s -X POST http://localhost/api/auth/login -H "Content-Type: application/json" -d '{"email":"<an existing plain-admin account>","password":"<its password>"}'
curl -b cookies2.txt -s -o /dev/null -w "%{http_code}\n" http://localhost/api/admin/reset/scopes
# Expected: 403 (plain admin can no longer reach it)
```

Clean up the test account afterward:

```powershell
docker exec pdash-db psql -U pdash -d pdash -c "DELETE FROM users WHERE email='sysadmin-test@example.com';"
```

- [ ] **Step 8: Commit**

```bash
git add api/src/middleware/auth.js api/src/routes/reset.js api/src/routes/app-settings.js api/src/routes/users.js api/src/routes/client-groups.js api/src/routes/currencies.js api/src/routes/pipeline-years.js api/src/routes/pots.js
git commit -m "$(cat <<'EOF'
feat: wire sysadmin permissions into the backend

- requireAdmin (middleware/auth.js) now accepts sysadmin too, so every
  route already gated on it (client-groups, currencies, pipeline-years,
  pots, config, exports, auth invite, users) keeps working unchanged
- new requireSysAdmin, exclusive to the top tier, replaces requireAdmin
  on reset.js (all routes) and PUT /api/app-settings/terms — the two
  privileges being carved out of the plain admin tier
- PATCH /api/users/:id applies roleChangeError() before persisting a
  role change: only a sysadmin can touch the sysadmin tier, and
  promotion to sysadmin is only valid from an existing admin
- deduplicated 4 identical local requireAdmin copies (client-groups.js,
  currencies.js, pipeline-years.js, pots.js) that bypassed the shared
  middleware entirely — they now import the shared, sysadmin-aware one
EOF
)"
```

---

## Task 4: `admin.html` — sysadmin toggle, drop the Terms & Conditions card

**Files:**
- Modify: `admin.html`

**Interfaces:**
- Consumes: `PATCH /api/users/:id` (Task 3) — same endpoint the existing `toggleRole()` already calls, now also used by the new `toggleSysAdmin()`.
- Produces: nothing consumed by later tasks (leaf UI change).

- [ ] **Step 1: Add the sysadmin badge style**

In the `<style>` block, right after the existing `.badge-role-user` line:

```css
/* before: */
    .badge-role-admin  { background: #ede9fe; color: #5b21b6; font-size: 0.75rem; padding: 0.25rem 0.6rem; border-radius: 999px; font-weight: 600; }
    .badge-role-user   { background: #e0f2fe; color: #0369a1; font-size: 0.75rem; padding: 0.25rem 0.6rem; border-radius: 999px; font-weight: 600; }

/* after: */
    .badge-role-admin  { background: #ede9fe; color: #5b21b6; font-size: 0.75rem; padding: 0.25rem 0.6rem; border-radius: 999px; font-weight: 600; }
    .badge-role-sysadmin { background: #fee2e2; color: #991b1b; font-size: 0.75rem; padding: 0.25rem 0.6rem; border-radius: 999px; font-weight: 600; }
    .badge-role-user   { background: #e0f2fe; color: #0369a1; font-size: 0.75rem; padding: 0.25rem 0.6rem; border-radius: 999px; font-weight: 600; }
```

- [ ] **Step 2: Widen the page access gate**

```js
// before (line 286):
if (user.role !== 'admin') { this.accessDenied = true; return; }

// after:
if (!['admin', 'sysadmin'].includes(user.role)) { this.accessDenied = true; return; }
```

- [ ] **Step 3: Hide the base role toggle on sysadmin rows, add the sysadmin toggle**

```html
<!-- before (lines 111-116): -->
                    <!-- Toggle role -->
                    <button class="btn btn-outline-secondary btn-action me-1"
                            :disabled="!!u._loading"
                            @click="toggleRole(u)">
                      Make {{ u.role === 'admin' ? 'user' : 'admin' }}
                    </button>

<!-- after: -->
                    <!-- Toggle role (user <-> admin only — sysadmin rows are managed by the dedicated toggle below) -->
                    <button v-if="u.role !== 'sysadmin'"
                            class="btn btn-outline-secondary btn-action me-1"
                            :disabled="!!u._loading"
                            @click="toggleRole(u)">
                      Make {{ u.role === 'admin' ? 'user' : 'admin' }}
                    </button>
                    <!-- Grant/Revoke sysadmin — only a sysadmin viewer can touch this, and only on an admin/sysadmin row -->
                    <button v-if="me.role === 'sysadmin' && u.role !== 'user'"
                            class="btn btn-outline-danger btn-action me-1"
                            :disabled="!!u._loading"
                            @click="toggleSysAdmin(u)">
                      {{ u.role === 'sysadmin' ? '⬇ Revoke sysadmin' : '⬆ Grant sysadmin' }}
                    </button>
```

(Both toggles stay inside the existing `<template v-if="u.id !== me.id">` wrapper at line 110 — no change needed there, self-exclusion is already automatic.)

- [ ] **Step 4: Remove the Terms & Conditions card**

Delete the whole block (lines 164-189):

```html
    <!-- ── TERMS & CONDITIONS ───────────────────────────────── -->
    <div class="card mt-4" v-if="ready">
      <div class="card-body p-4">
        <div class="d-flex align-items-center justify-content-between mb-3">
          <div>
            <h5 class="fw-bold mb-0">📄 Terms &amp; Conditions</h5>
            <div class="text-muted mt-1" style="font-size:.82rem">
              Current version: <strong>v{{ terms.version }}</strong>
              <span v-if="terms.updatedAt"> · Last updated {{ fmtDate(terms.updatedAt) }}</span>
              <span v-if="terms.updatedBy"> by {{ terms.updatedBy }}</span>
            </div>
          </div>
          <div class="d-flex gap-2">
            <a href="/terms.html" target="_blank" class="btn btn-outline-secondary btn-sm">👁 Preview</a>
            <button class="btn btn-primary btn-sm" style="background:var(--brand-navy);border-color:var(--brand-navy)"
                    @click="saveTerms(false)" :disabled="terms.saving">Save draft</button>
            <button class="btn btn-warning btn-sm" @click="saveTerms(true)" :disabled="terms.saving">
              🚀 Publish new version
            </button>
          </div>
        </div>
        <div v-if="terms.msg" class="alert alert-sm mb-3" :class="terms.msgOk ? 'alert-success' : 'alert-danger'" style="font-size:.85rem">{{ terms.msg }}</div>
        <div class="text-muted mb-2" style="font-size:.78rem">Edit HTML content below. "Save draft" saves without bumping the version. "Publish new version" increments the version — all users will be asked to re-accept at next login.</div>
        <textarea v-model="terms.content" class="form-control font-monospace" rows="18" style="font-size:.78rem;resize:vertical"></textarea>
      </div>
    </div>

```

(Delete the whole block including its trailing blank line, so `<!-- ── INVITE MODAL ────... -->` directly follows the closing `</div>` of the loading/access-denied block above it.)

- [ ] **Step 5: Drop `terms` state, `loadTerms()`/`saveTerms()` methods, and the `Promise.all` call**

```js
// before (data(), one line among others):
          terms: { version: 1, content: '', updatedAt: null, updatedBy: null, saving: false, msg: null, msgOk: true },

// after: delete this line entirely
```

```js
// before (created()):
        await Promise.all([this.loadUsers(), this.loadTerms()]);

// after:
        await this.loadUsers();
```

```js
// before (methods, two whole methods to delete):
        async loadTerms() {
          const res = await fetch('/api/app-settings/terms', { credentials: 'same-origin' });
          const d = await res.json();
          this.terms.version   = d.version;
          this.terms.content   = d.content;
          this.terms.updatedAt = d.updatedAt;
          this.terms.updatedBy = d.updatedBy;
        },

        async saveTerms(publishNewVersion) {
          this.terms.saving = true;
          this.terms.msg    = null;
          try {
            const res = await fetch('/api/app-settings/terms', {
              method: 'PUT',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: this.terms.content, publishNewVersion }),
            });
            const d = await res.json();
            if (!res.ok) { this.terms.msg = d.error || 'Save failed'; this.terms.msgOk = false; return; }
            if (publishNewVersion && d.newVersion) this.terms.version = d.newVersion;
            this.terms.updatedAt = new Date().toISOString();
            this.terms.updatedBy = this.me.first_name + ' ' + this.me.last_name;
            this.terms.msg   = publishNewVersion
              ? `Published as v${this.terms.version} — all users will be asked to re-accept at next login.`
              : 'Draft saved.';
            this.terms.msgOk = true;
          } catch {
            this.terms.msg = 'Network error.'; this.terms.msgOk = false;
          } finally {
            this.terms.saving = false;
          }
        },

// after: delete both methods entirely (keep fmtDate(), still used for u.created_at in the table)
```

- [ ] **Step 6: Add the `toggleSysAdmin()` method**

Right after the existing `toggleRole()` method:

```js
        async toggleSysAdmin(user) {
          const newRole = user.role === 'sysadmin' ? 'admin' : 'sysadmin';
          user._loading = true;
          this.globalError = null;
          try {
            const res = await fetch(`/api/users/${user.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({ role: newRole }),
            });
            const data = await res.json();
            if (!res.ok) { this.globalError = data.error; return; }
            user.role = data.role;
          } catch {
            this.globalError = 'Network error.';
          } finally {
            user._loading = false;
          }
        },
```

- [ ] **Step 7: Manual verification in the browser**

1. Log in as a plain admin (not the sysadmin from Task 3's Step 7, or promote/demote as needed): `admin.html` no longer shows the Terms & Conditions card, and no "Grant sysadmin"/"Revoke sysadmin" button appears on any row.
2. Log in as the sysadmin test account: both toggles are visible on admin/sysadmin rows (not on user rows), clicking "⬆ Grant sysadmin" on an admin row turns their badge red ("sysadmin") and the row's base role toggle disappears; clicking "⬇ Revoke sysadmin" reverses it.
3. Confirm the sysadmin's own row still shows only "you" — no toggle at all (existing self-exclusion, unchanged).

- [ ] **Step 8: Commit**

```bash
git add admin.html
git commit -m "$(cat <<'EOF'
feat: admin.html — sysadmin grant/revoke toggle, drop Terms & Conditions card

- New "Grant sysadmin"/"Revoke sysadmin" toggle, visible only to a
  sysadmin viewer, only on admin/sysadmin rows — the base role toggle
  is hidden on sysadmin rows for everyone else
- Page access gate now admits sysadmin alongside admin
- Terms & Conditions card, its state and methods removed — moved to
  the new dedicated _terms-editor.html (sysadmin-only)
EOF
)"
```

---

## Task 5: New page `_terms-editor.html`

**Files:**
- Create: `_terms-editor.html`

**Interfaces:**
- Consumes: `GET`/`PUT /api/app-settings/terms` (unchanged `GET`, now-sysadmin-only `PUT` from Task 3), `initNav()` from `js/nav.js` (Task 6 adds the nav tab that links here).
- Produces: nothing consumed by later tasks (leaf page), other than being the link target Task 6's new nav tab points to.

- [ ] **Step 1: Create the file**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PDash — Terms & Conditions</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css">
  <link rel="stylesheet" href="css/tokens.css?v=7">
  <link rel="stylesheet" href="css/style.css?v=6">
  <style>
    body { background: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .page { margin: 3rem auto; }
    .card { border: 1px solid #e5e7eb; border-radius: 10px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
    .alert-sm { font-size: 0.83rem; padding: 0.5rem 0.75rem; }
  </style>
</head>
<body>

<!-- Navbar (injected by nav.js) -->
<div id="nav-container"></div>

<div id="app" v-cloak>

  <div v-if="ready || accessDenied" class="page app-container">
    <div v-if="accessDenied" class="alert alert-danger">Access denied — sysadmin only.</div>

    <template v-else>
      <!-- ── TERMS & CONDITIONS ───────────────────────────────── -->
      <div class="card">
        <div class="card-body p-4">
          <div class="d-flex align-items-center justify-content-between mb-3">
            <div>
              <h5 class="fw-bold mb-0">📄 Terms &amp; Conditions</h5>
              <div class="text-muted mt-1" style="font-size:.82rem">
                Current version: <strong>v{{ terms.version }}</strong>
                <span v-if="terms.updatedAt"> · Last updated {{ fmtDate(terms.updatedAt) }}</span>
                <span v-if="terms.updatedBy"> by {{ terms.updatedBy }}</span>
              </div>
            </div>
            <div class="d-flex gap-2">
              <a href="/terms.html" target="_blank" class="btn btn-outline-secondary btn-sm">👁 Preview</a>
              <button class="btn btn-primary btn-sm" style="background:var(--brand-navy);border-color:var(--brand-navy)"
                      @click="saveTerms(false)" :disabled="terms.saving">Save draft</button>
              <button class="btn btn-warning btn-sm" @click="saveTerms(true)" :disabled="terms.saving">
                🚀 Publish new version
              </button>
            </div>
          </div>
          <div v-if="terms.msg" class="alert alert-sm mb-3" :class="terms.msgOk ? 'alert-success' : 'alert-danger'" style="font-size:.85rem">{{ terms.msg }}</div>
          <div class="text-muted mb-2" style="font-size:.78rem">Edit HTML content below. "Save draft" saves without bumping the version. "Publish new version" increments the version — all users will be asked to re-accept at next login.</div>
          <textarea v-model="terms.content" class="form-control font-monospace" rows="18" style="font-size:.78rem;resize:vertical"></textarea>
        </div>
      </div>
    </template>
  </div>

  <div v-else class="d-flex align-items-center justify-content-center" style="height:60vh">
    <div class="spinner-border text-secondary"></div>
  </div>

</div>

<script defer src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script defer src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script defer src="js/api.js?v=4"></script>
<script defer src="js/core.js?v=3"></script>
<script defer src="js/settings.js"></script>
<script defer src="js/notifications.js"></script>
<script defer src="js/nav.js?v=5"></script>
<script type="module">
  Vue.createApp({
    data() {
      return {
        ready: false,
        accessDenied: false,
        me: {},
        terms: { version: 1, content: '', updatedAt: null, updatedBy: null, saving: false, msg: null, msgOk: true },
      };
    },
    async created() {
      const user = await initNav('termseditor', { breadcrumbs: [
        { label: 'Home', href: '/pipeline.html' },
        { label: 'Terms & Conditions' },
      ]});
      if (!user) return;
      this.me = user;
      if (user.role !== 'sysadmin') { this.accessDenied = true; return; }
      await this.loadTerms();
      this.ready = true;
    },
    methods: {
      async loadTerms() {
        const res = await fetch('/api/app-settings/terms', { credentials: 'same-origin' });
        const d = await res.json();
        this.terms.version   = d.version;
        this.terms.content   = d.content;
        this.terms.updatedAt = d.updatedAt;
        this.terms.updatedBy = d.updatedBy;
      },
      async saveTerms(publishNewVersion) {
        this.terms.saving = true;
        this.terms.msg    = null;
        try {
          const res = await fetch('/api/app-settings/terms', {
            method: 'PUT',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: this.terms.content, publishNewVersion }),
          });
          const d = await res.json();
          if (!res.ok) { this.terms.msg = d.error || 'Save failed'; this.terms.msgOk = false; return; }
          if (publishNewVersion && d.newVersion) this.terms.version = d.newVersion;
          this.terms.updatedAt = new Date().toISOString();
          this.terms.updatedBy = this.me.first_name + ' ' + this.me.last_name;
          this.terms.msg   = publishNewVersion
            ? `Published as v${this.terms.version} — all users will be asked to re-accept at next login.`
            : 'Draft saved.';
          this.terms.msgOk = true;
        } catch {
          this.terms.msg = 'Network error.'; this.terms.msgOk = false;
        } finally {
          this.terms.saving = false;
        }
      },
      fmtDate(iso) {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      },
    },
  }).mount('#app');
</script>
</body>
</html>
```

Note: `js/nav.js?v=5` is referenced here already — Task 6 is the one that actually bumps `js/nav.js` to that version and rolls the same bump out to every other page. The version number is just a cache key; there's no ordering dependency between creating this file and Task 6 landing.

- [ ] **Step 2: Manual verification in the browser**

1. Log in as a plain admin (or plain user): navigating directly to `/_terms-editor.html` shows "Access denied — sysadmin only." and nothing else.
2. Log in as the sysadmin test account (Task 3, Step 7 — recreate it if already cleaned up): the page loads the current Terms & Conditions content, "Save draft" and "Publish new version" behave exactly as they did inside `admin.html` before this change (same network calls, same success/error messaging).

- [ ] **Step 3: Commit**

```bash
git add _terms-editor.html
git commit -m "$(cat <<'EOF'
feat: add _terms-editor.html — sysadmin-only Terms & Conditions console

Same card, state, and methods that used to live inside admin.html,
now on its own page gated on role === 'sysadmin' exclusively (not
admin-or-sysadmin — this is one of the two privileges carved out of
the plain admin tier). Linked from the new sysadmin nav menu (next task).
EOF
)"
```

---

## Task 6: Sysadmin navbar menu, remaining admin-or-sysadmin gates, `js/nav.js` cache-bust rollout

**Files:**
- Modify: `js/nav.js`
- Modify: `_db-reset.html`
- Modify: `config.html`
- Modify: `timesheets.html`
- Modify: `pipeline.html`
- Modify: `js/settings.js`
- Modify: `js/shares.js`
- Modify (cache-bust only, `?v=4` → `?v=5`): `admin.html`, `costgrid.html`, `pipeline.html`, `timesheets.html`, `planning.html`, `project-config.html`, `portfolio.html`, `config.html`

**Interfaces:**
- Consumes: nothing new (all changes are one-liners against already-established `window.__navUser`/`user.role` patterns).
- Produces: nothing consumed by later tasks — this is the last task.

- [ ] **Step 1: Add the sysadmin-only nav block**

Edit `js/nav.js` — widen the existing admin gate and add the new sysadmin block right after it:

```js
// before (lines 35-40):
  const adminHtml = user.role === 'admin'
    ? `<span style="border-left:1px solid rgba(255,255,255,.15);margin:8px 6px;align-self:stretch"></span>` +
      `<a class="nav-main-tab nav-admin-tab${activeTab === 'config'     ? ' active' : ''}" href="/config.html">⚙ Config</a>` +
      `<a class="nav-main-tab nav-admin-tab${activeTab === 'timesheets' ? ' active' : ''}" href="/timesheets.html">📂 Actuals Repository</a>` +
      `<a class="nav-main-tab nav-admin-tab${activeTab === 'admin'      ? ' active' : ''}" href="/admin.html">👤 User Admin</a>`
    : '';

// after:
  const adminHtml = (user.role === 'admin' || user.role === 'sysadmin')
    ? `<span style="border-left:1px solid rgba(255,255,255,.15);margin:8px 6px;align-self:stretch"></span>` +
      `<a class="nav-main-tab nav-admin-tab${activeTab === 'config'     ? ' active' : ''}" href="/config.html">⚙ Config</a>` +
      `<a class="nav-main-tab nav-admin-tab${activeTab === 'timesheets' ? ' active' : ''}" href="/timesheets.html">📂 Actuals Repository</a>` +
      `<a class="nav-main-tab nav-admin-tab${activeTab === 'admin'      ? ' active' : ''}" href="/admin.html">👤 User Admin</a>`
    : '';

  const sysAdminHtml = user.role === 'sysadmin'
    ? `<span style="border-left:1px solid rgba(255,255,255,.15);margin:8px 6px;align-self:stretch"></span>` +
      `<a class="nav-main-tab nav-admin-tab${activeTab === 'dbreset'     ? ' active' : ''}" href="/_db-reset.html">🗄 DB Reset</a>` +
      `<a class="nav-main-tab nav-admin-tab${activeTab === 'termseditor' ? ' active' : ''}" href="/_terms-editor.html">📄 Terms &amp; Conditions</a>`
    : '';
```

- [ ] **Step 2: Inject `sysAdminHtml` into the navbar template**

```js
// before (lines 90-91):
        ${tabsHtml}
        ${adminHtml}

// after:
        ${tabsHtml}
        ${adminHtml}
        ${sysAdminHtml}
```

- [ ] **Step 3: Widen the broadcast-notification gate**

```js
// before (line 566):
        targetSel.innerHTML = (window.__navUser?.role === 'admin' ? '<option value="">All users (broadcast)</option>' : '') + opts;

// after:
        targetSel.innerHTML = (['admin','sysadmin'].includes(window.__navUser?.role) ? '<option value="">All users (broadcast)</option>' : '') + opts;
```

- [ ] **Step 4: Bump `js/nav.js`'s own version comment/tag is not needed — proceed to rolling the cache-bust query string**

(No version constant inside `nav.js` itself — the cache-busting is purely the `?v=N` query string on the `<script>` tag in every page that loads it.)

- [ ] **Step 5: Widen `_db-reset.html`'s access gate and give it a nav-tab id**

```js
// before (line 176):
      if (user.role !== 'admin') { this.accessDenied = true; return; }

// after:
      if (user.role !== 'sysadmin') { this.accessDenied = true; return; }
```

```js
// before (line 170):
      const user = await initNav(null, { breadcrumbs: [

// after:
      const user = await initNav('dbreset', { breadcrumbs: [
```

Also update the page's own copy (line 43) for accuracy:

```html
<!-- before: -->
      <p class="text-muted">Admin-only. Each action is irreversible. Data deleted here cannot be recovered.</p>

<!-- after: -->
      <p class="text-muted">Sysadmin-only. Each action is irreversible. Data deleted here cannot be recovered.</p>
```

And the access-denied message (line 46), for consistency with the new exclusivity:

```html
<!-- before: -->
    <div v-if="accessDenied" class="alert alert-danger">Access denied — admin only.</div>

<!-- after: -->
    <div v-if="accessDenied" class="alert alert-danger">Access denied — sysadmin only.</div>
```

- [ ] **Step 6: Widen the remaining admin-or-sysadmin gates**

```js
// config.html, before (line 1246):
    if (user.role !== 'admin') { this.accessDenied = true; return; }
// after:
    if (!['admin', 'sysadmin'].includes(user.role)) { this.accessDenied = true; return; }
```

```js
// timesheets.html, before (line 266):
      if (user.role !== 'admin') { window.location.href = '/pipeline.html'; return; }
// after:
      if (!['admin', 'sysadmin'].includes(user.role)) { window.location.href = '/pipeline.html'; return; }
```

```js
// pipeline.html, before (line 523):
      const isAdmin = window.__navUser?.role === 'admin';
// after:
      const isAdmin = ['admin', 'sysadmin'].includes(window.__navUser?.role);
```

```js
// js/settings.js, before (line 22):
  const isAdmin = user?.role === 'admin';
// after:
  const isAdmin = ['admin', 'sysadmin'].includes(user?.role);
```

```js
// js/shares.js, before (line 356):
  _shareAllUsers = (allUsers || []).filter(u => u.role !== 'admin' && u.id !== self);
// after:
  _shareAllUsers = (allUsers || []).filter(u => !['admin', 'sysadmin'].includes(u.role) && u.id !== self);
```

- [ ] **Step 7: Bump `js/nav.js?v=4` → `js/nav.js?v=5` on every page that loads it**

One-line edit, same pattern, in each of these 9 files (the `<script defer src="js/nav.js?v=4"></script>` tag is the only occurrence in each):

- `config.html`
- `admin.html`
- `costgrid.html`
- `_db-reset.html`
- `pipeline.html`
- `timesheets.html`
- `planning.html`
- `project-config.html`
- `portfolio.html`

```html
<!-- before: -->
<script defer src="js/nav.js?v=4"></script>
<!-- after: -->
<script defer src="js/nav.js?v=5"></script>
```

(`_terms-editor.html`, created in Task 5, already references `js/nav.js?v=5` — no change needed there.)

- [ ] **Step 8: Manual verification in the browser**

1. Log in as a plain user: no admin/sysadmin nav tabs at all (unchanged from today).
2. Log in as a plain admin: sees Config/Actuals Repository/User Admin tabs, does **not** see "DB Reset"/"Terms & Conditions" tabs; direct navigation to either URL shows "Access denied — sysadmin only." The Send Notification modal's "All users (broadcast)" option is unaffected by this plan (a plain admin already had it, still does) — confirm it **is** present for the plain admin, and confirm a plain `user` role still does **not** see it.
3. Log in as the sysadmin test account: sees all 5 tabs (Config, Actuals Repository, User Admin, DB Reset, Terms & Conditions), both new pages load their content instead of "Access denied," Send Notification's broadcast option is present, the Share modal's user picker excludes both admin and sysadmin accounts from the selectable list, and (currency versions only, if a non-EUR proposal is open) the "rate stale" warning in `pipeline.html` still behaves as it did for plain admins.
4. Hard-refresh (or open in a private window) to confirm `js/nav.js?v=5` is actually the version being served (check the Network tab) — this catches any missed `?v=4` reference from Step 7.

- [ ] **Step 9: Clean up the sysadmin test account from Task 3, if not already done**

```powershell
docker exec pdash-db psql -U pdash -d pdash -c "DELETE FROM users WHERE email='sysadmin-test@example.com';"
```

(Skip if you plan to keep it as a real, permanent sysadmin for the deployment — in that case just confirm with the user which real account(s) should be promoted to sysadmin post-deploy, since the migration in Task 1 deliberately promotes no one automatically.)

- [ ] **Step 10: Commit**

```bash
git add js/nav.js _db-reset.html config.html timesheets.html pipeline.html js/settings.js js/shares.js admin.html costgrid.html planning.html project-config.html portfolio.html
git commit -m "$(cat <<'EOF'
feat: sysadmin navbar menu (DB Reset + Terms & Conditions), extend remaining admin gates

- New sysadmin-only nav block, two tabs: DB Reset, Terms & Conditions
- _db-reset.html gate narrowed from admin to sysadmin-exclusive (was
  already admin-only; now carved out of the plain admin tier per design)
- Six remaining role==='admin' checks (config.html, timesheets.html,
  pipeline.html's rate-stale warning, js/settings.js's admin-only
  Settings sections, js/shares.js's share-picker exclusion, and
  nav.js's own broadcast-notification option) now also admit sysadmin
- js/nav.js?v=4 -> ?v=5 rolled out to every page that loads it, per
  this project's cache-busting convention for shared classic scripts
EOF
)"
```

---

## Post-implementation note (not a task — informational)

After this plan lands, no user in the database has `role='sysadmin'` (Task 1 is a pure constraint widening, no backfill, by design). Promote at least one real account via `admin.html` (log in as an existing admin, then — since only a sysadmin can grant sysadmin per `roleChangeError()` — the very first promotion must be done directly via SQL, exactly as Task 3 Step 7 and Task 6 Step 9 demonstrate for the test account: `UPDATE users SET role='sysadmin' WHERE email='...';`). Document who holds the role somewhere the team can find it — this plan does not include that as it's an operational decision, not a code change.
