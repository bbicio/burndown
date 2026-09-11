# Terms & Conditions Version History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an append-only, immutable version-history table for Terms & Conditions, and separate "what `terms.html` shows" (latest published version) from "what the sysadmin editor is currently working on" (the draft) — closing a gap where publishing a new version today permanently destroys the previous version's text.

**Architecture:** A new `terms_versions` table holds one immutable row per published version (never `UPDATE`d/`DELETE`d by application code after insertion). The existing `app_settings.terms_content`/`terms_version` mechanism is kept but repurposed as pure draft storage — no longer read by `terms.html`'s acceptance gate. `GET /api/app-settings/terms` (the public/gate-facing endpoint) switches to reading the latest `terms_versions` row instead of `app_settings`. Two new sysadmin-only endpoints (`GET /terms/draft`, `GET /terms/versions`, `GET /terms/versions/:version`) let `_terms-editor.html` load the draft separately and browse/view past published versions.

**Tech Stack:** Node.js/Express backend (no new dependencies), plain PostgreSQL migration, Vue 3 via CDN frontend (no build step) for `_terms-editor.html`.

**Spec:** `docs/superpowers/specs/2026-09-11-terms-version-history-design.md`

## Global Constraints

- `GET /api/app-settings/terms`'s response shape must stay exactly `{ version, content, updatedAt, updatedBy }` — `terms.html` is an unrelated, unmodified consumer of this endpoint and must keep working without any change on its side.
- No DB-level immutability enforcement (trigger/constraint) on `terms_versions` — enforced only by application code never issuing `UPDATE`/`DELETE` against it.
- No transactional guard against a concurrent double-publish race — pre-existing risk class (today's `app_settings.terms_version` read-then-increment has the identical race), out of scope to fix here.
- No recovery of version text already lost before this change ships — the migration preserves only the current live content as the first row.
- No changes to `users.terms_version`/`terms_accepted_at` or to `terms.html` itself.
- All user-facing text in English (project-wide rule).

---

## Task 1: Database migration — `terms_versions` table + backfill

**Files:**
- Create: `api/src/db/migrations/019_terms_versions.sql`

**Interfaces:**
- Produces: a `terms_versions` table (`id UUID PK`, `version INTEGER UNIQUE NOT NULL`, `content TEXT NOT NULL`, `published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `published_by UUID REFERENCES users(id)`), with exactly one row after migration — the current live `app_settings.terms_content`/`terms_version` value, unchanged.

- [ ] **Step 1: Write the migration file**

```sql
-- Migration 019: append-only Terms & Conditions version history.
-- terms_versions is never UPDATEd/DELETEd by application code after a row
-- is inserted — see api/src/routes/app-settings.js. app_settings.terms_content/
-- terms_version remain in use as draft-only storage (see that file).
CREATE TABLE terms_versions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version       INTEGER NOT NULL UNIQUE,
  content       TEXT NOT NULL,
  published_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_by  UUID REFERENCES users(id)
);

-- Backfill: the current live draft becomes version 1 of the history (or
-- whatever terms_version already is) — the only text still recoverable.
INSERT INTO terms_versions (version, content, published_at, published_by)
SELECT
  (SELECT value::int FROM app_settings WHERE key = 'terms_version'),
  (SELECT value FROM app_settings WHERE key = 'terms_content'),
  (SELECT updated_at FROM app_settings WHERE key = 'terms_content'),
  (SELECT updated_by FROM app_settings WHERE key = 'terms_content')
WHERE EXISTS (SELECT 1 FROM app_settings WHERE key = 'terms_content');
```

The `WHERE EXISTS (...)` guard makes the backfill a no-op (inserts zero rows) on a database that has never had a `terms_content` row at all — matches this migration file's own "apply to any environment" convention (other migrations in this repo don't assume seed data exists).

- [ ] **Step 2: Apply it to the running dev DB**

```powershell
docker exec -i pdash-db psql -U pdash -d pdash < api/src/db/migrations/019_terms_versions.sql
```

- [ ] **Step 3: Verify the table and backfill**

```powershell
docker exec pdash-db psql -U pdash -d pdash -c "SELECT version, LEFT(content, 40) AS content_preview, published_at, published_by FROM terms_versions;"
```

Expected: exactly one row, whose `version` matches whatever `app_settings.terms_version` held before this migration ran, and whose `content_preview` is a recognizable prefix of the current live T&C text.

- [ ] **Step 4: Commit**

```bash
git add api/src/db/migrations/019_terms_versions.sql
git commit -m "$(cat <<'EOF'
feat: add terms_versions table for immutable T&C version history

New append-only table, never UPDATEd/DELETEd by application code after
insert. Backfills the current live app_settings.terms_content/terms_version
as its first row -- the only text still recoverable, since every earlier
version was already overwritten by the pre-existing single-row storage.
EOF
)"
```

---

## Task 2: Backend — read endpoints (`GET /terms`, `GET /terms/draft`, `GET /terms/versions`, `GET /terms/versions/:version`)

**Files:**
- Modify: `api/src/routes/app-settings.js`

**Interfaces:**
- Consumes: `terms_versions` table from Task 1.
- Produces: `GET /api/app-settings/terms` → `{ version, content, updatedAt, updatedBy }` (latest published version — **response shape unchanged**, consumers unaffected). `GET /api/app-settings/terms/draft` → same shape, draft content. `GET /api/app-settings/terms/versions` → `[{ version, publishedAt, publishedBy }, ...]` DESC by version, no `content`. `GET /api/app-settings/terms/versions/:version` → `{ version, content, publishedAt, publishedBy }`, 404 if unknown. All four consumed by Task 4 (frontend).

- [ ] **Step 1: Replace `GET /terms` to read from `terms_versions`, add the three new read routes**

```js
// before (api/src/routes/app-settings.js, the existing GET /terms handler):
// GET /api/app-settings/terms — any authenticated user (needed by terms.html)
router.get('/terms', requireAuth, async (req, res, next) => {
  try {
    const [versionRow, contentRow, metaRow] = await Promise.all([
      query("SELECT value FROM app_settings WHERE key = 'terms_version'"),
      query("SELECT value FROM app_settings WHERE key = 'terms_content'"),
      query("SELECT updated_at, u.first_name, u.last_name FROM app_settings s LEFT JOIN users u ON u.id = s.updated_by WHERE s.key = 'terms_content'"),
    ]);
    res.json({
      version:   parseInt(versionRow.rows[0]?.value || '1'),
      content:   contentRow.rows[0]?.value || '',
      updatedAt: metaRow.rows[0]?.updated_at || null,
      updatedBy: metaRow.rows[0] ? `${metaRow.rows[0].first_name} ${metaRow.rows[0].last_name}`.trim() : null,
    });
  } catch (err) { next(err); }
});

// after:
// GET /api/app-settings/terms — any authenticated user (needed by terms.html)
// Returns the latest PUBLISHED version from terms_versions (not the draft in
// app_settings — see GET /terms/draft for that). Response shape unchanged.
router.get('/terms', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT tv.version, tv.content, tv.published_at, u.first_name, u.last_name
       FROM terms_versions tv
       LEFT JOIN users u ON u.id = tv.published_by
       ORDER BY tv.version DESC
       LIMIT 1`
    );
    const row = rows[0];
    res.json({
      version:   row?.version || 1,
      content:   row?.content || '',
      updatedAt: row?.published_at || null,
      updatedBy: row ? (`${row.first_name || ''} ${row.last_name || ''}`.trim() || null) : null,
    });
  } catch (err) { next(err); }
});

// GET /api/app-settings/terms/draft — sysadmin only; the in-progress draft
// (app_settings.terms_content), never shown to terms.html. Same shape/query
// as the old GET /terms handler above -- this route is that handler's logic,
// relocated verbatim.
router.get('/terms/draft', requireSysAdmin, async (req, res, next) => {
  try {
    const [versionRow, contentRow, metaRow] = await Promise.all([
      query("SELECT value FROM app_settings WHERE key = 'terms_version'"),
      query("SELECT value FROM app_settings WHERE key = 'terms_content'"),
      query("SELECT updated_at, u.first_name, u.last_name FROM app_settings s LEFT JOIN users u ON u.id = s.updated_by WHERE s.key = 'terms_content'"),
    ]);
    res.json({
      version:   parseInt(versionRow.rows[0]?.value || '1'),
      content:   contentRow.rows[0]?.value || '',
      updatedAt: metaRow.rows[0]?.updated_at || null,
      updatedBy: metaRow.rows[0] ? `${metaRow.rows[0].first_name} ${metaRow.rows[0].last_name}`.trim() : null,
    });
  } catch (err) { next(err); }
});

// GET /api/app-settings/terms/versions — sysadmin only; list of published
// versions (no content -- a list row doesn't need the full text).
router.get('/terms/versions', requireSysAdmin, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT tv.version, tv.published_at, u.first_name, u.last_name
       FROM terms_versions tv
       LEFT JOIN users u ON u.id = tv.published_by
       ORDER BY tv.version DESC`
    );
    res.json(rows.map(r => ({
      version:     r.version,
      publishedAt: r.published_at,
      publishedBy: `${r.first_name || ''} ${r.last_name || ''}`.trim() || null,
    })));
  } catch (err) { next(err); }
});

// GET /api/app-settings/terms/versions/:version — sysadmin only; full text
// of one past published version, read-only. :version is the integer version
// number (not the row's UUID) -- matches how the frontend already thinks
// about versions.
router.get('/terms/versions/:version', requireSysAdmin, async (req, res, next) => {
  try {
    const versionNum = parseInt(req.params.version, 10);
    if (!Number.isInteger(versionNum)) return res.status(400).json({ error: 'Invalid version' });
    const { rows } = await query(
      `SELECT tv.version, tv.content, tv.published_at, u.first_name, u.last_name
       FROM terms_versions tv
       LEFT JOIN users u ON u.id = tv.published_by
       WHERE tv.version = $1`,
      [versionNum]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Version not found' });
    const row = rows[0];
    res.json({
      version:     row.version,
      content:     row.content,
      publishedAt: row.published_at,
      publishedBy: `${row.first_name || ''} ${row.last_name || ''}`.trim() || null,
    });
  } catch (err) { next(err); }
});
```

Place the three new routes directly after the rewritten `GET /terms`, before the existing `PUT /terms` (which Task 3 touches next). Route ordering has no conflicts to worry about here: `/terms/draft` and `/terms/versions` are distinct literal path segments, and `/terms/versions/:version` is a 3-segment path nested under the 2-segment `/terms/versions` — Express matches by full path shape, not prefix, so none of these shadow each other or the existing `/terms` regardless of declaration order.

- [ ] **Step 2: Manual verification via curl**

Use the project's isolated test stack so this doesn't touch the main dev DB's real T&C content:

```bash
scripts/test-branch.sh up
```

Log in as the bootstrapped test admin, promote to sysadmin via SQL (same pattern used throughout this project's sysadmin-role work), then:

```bash
# (after logging in and saving the cookie, and promoting that account to sysadmin in the isolated DB)
curl -b cookies.txt http://localhost:8081/api/app-settings/terms
# Expected: 200, { version: 1, content: "<the seeded T&C text>", updatedAt: ..., updatedBy: ... }

curl -b cookies.txt http://localhost:8081/api/app-settings/terms/draft
# Expected: 200, same shape, same content (nothing has diverged yet)

curl -b cookies.txt http://localhost:8081/api/app-settings/terms/versions
# Expected: 200, [{ version: 1, publishedAt: ..., publishedBy: ... }]

curl -b cookies.txt http://localhost:8081/api/app-settings/terms/versions/1
# Expected: 200, { version: 1, content: "<the seeded T&C text>", publishedAt: ..., publishedBy: ... }

curl -b cookies.txt http://localhost:8081/api/app-settings/terms/versions/999
# Expected: 404, { error: "Version not found" }
```

Tear down when done: `scripts/test-branch.sh down`.

- [ ] **Step 3: Commit**

```bash
git add api/src/routes/app-settings.js
git commit -m "$(cat <<'EOF'
feat: GET /api/app-settings/terms reads from terms_versions; add draft/versions read endpoints

GET /terms now returns the latest row from terms_versions instead of
app_settings.terms_content -- response shape unchanged, so terms.html
needs no changes. The old app_settings-reading logic moves, unchanged,
to a new sysadmin-only GET /terms/draft. Two more new sysadmin-only
routes: GET /terms/versions (list, no content) and
GET /terms/versions/:version (single version's full text, 404 if unknown).
EOF
)"
```

---

## Task 3: Backend — `PUT /terms` writes to `terms_versions` on publish

**Files:**
- Modify: `api/src/routes/app-settings.js`

**Interfaces:**
- Consumes: `terms_versions` table (Task 1); this route sits alongside the four read routes from Task 2 in the same file.
- Produces: `PUT /api/app-settings/terms` — same request/response shape as before (`{ content, publishNewVersion }` → `{ ok: true, newVersion }`), now the only place `terms_versions` gets new rows. Nothing later in this plan consumes this route directly (Task 4's frontend calls it, unchanged call shape).

- [ ] **Step 1: Replace the version-bumping logic to insert into `terms_versions`**

```js
// before (api/src/routes/app-settings.js, the existing PUT /terms handler):
// PUT /api/app-settings/terms — sysadmin only; bumps version when publishNewVersion=true
router.put('/terms', requireSysAdmin, async (req, res, next) => {
  try {
    const { content, publishNewVersion } = req.body;
    if (content === undefined) return res.status(400).json({ error: 'content is required' });

    await query(
      "INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('terms_content', $1, NOW(), $2) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW(), updated_by = $2",
      [content, req.user.id]
    );

    let newVersion = null;
    if (publishNewVersion) {
      const cur = await query("SELECT value FROM app_settings WHERE key = 'terms_version'");
      newVersion = (parseInt(cur.rows[0]?.value || '1')) + 1;
      await query(
        "INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('terms_version', $1, NOW(), $2) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW(), updated_by = $2",
        [String(newVersion), req.user.id]
      );
    }

    res.json({ ok: true, newVersion });
  } catch (err) { next(err); }
});

// after:
// PUT /api/app-settings/terms — sysadmin only. publishNewVersion=false saves
// only the draft (app_settings.terms_content/terms_version, unaffected by
// terms.html's GET /terms). publishNewVersion=true additionally inserts an
// immutable row into terms_versions -- the new source of truth for "what's
// the latest published version" -- and syncs the draft to match, so the next
// edit starts from what was just published.
router.put('/terms', requireSysAdmin, async (req, res, next) => {
  try {
    const { content, publishNewVersion } = req.body;
    if (content === undefined) return res.status(400).json({ error: 'content is required' });

    let newVersion = null;
    if (publishNewVersion) {
      const cur = await query('SELECT COALESCE(MAX(version), 0) AS max_version FROM terms_versions');
      newVersion = cur.rows[0].max_version + 1;
      await query(
        'INSERT INTO terms_versions (version, content, published_at, published_by) VALUES ($1, $2, NOW(), $3)',
        [newVersion, content, req.user.id]
      );
    }

    await query(
      "INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('terms_content', $1, NOW(), $2) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW(), updated_by = $2",
      [content, req.user.id]
    );
    if (publishNewVersion) {
      await query(
        "INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('terms_version', $1, NOW(), $2) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW(), updated_by = $2",
        [String(newVersion), req.user.id]
      );
    }

    res.json({ ok: true, newVersion });
  } catch (err) { next(err); }
});
```

- [ ] **Step 2: Manual verification via curl**

Continuing in the same isolated stack as Task 2 (`scripts/test-branch.sh up` if torn down):

```bash
# Save a draft (publishNewVersion: false) -- must NOT create a new terms_versions row
curl -b cookies.txt -X PUT http://localhost:8081/api/app-settings/terms \
  -H "Content-Type: application/json" \
  -d '{"content":"<p>Draft edit, not yet published</p>","publishNewVersion":false}'
# Expected: 200, { ok: true, newVersion: null }

curl -b cookies.txt http://localhost:8081/api/app-settings/terms
# Expected: still version 1, ORIGINAL content -- unaffected by the draft save above (this is the key behavior this plan exists to fix)

curl -b cookies.txt http://localhost:8081/api/app-settings/terms/draft
# Expected: version 1, content = "<p>Draft edit, not yet published</p>" -- the draft DID change

# Publish
curl -b cookies.txt -X PUT http://localhost:8081/api/app-settings/terms \
  -H "Content-Type: application/json" \
  -d '{"content":"<p>Draft edit, not yet published</p>","publishNewVersion":true}'
# Expected: 200, { ok: true, newVersion: 2 }

curl -b cookies.txt http://localhost:8081/api/app-settings/terms
# Expected: NOW version 2, content = "<p>Draft edit, not yet published</p>"

curl -b cookies.txt http://localhost:8081/api/app-settings/terms/versions
# Expected: two entries, version 2 then version 1 (DESC order)

curl -b cookies.txt http://localhost:8081/api/app-settings/terms/versions/1
# Expected: still the ORIGINAL seeded content -- version 1 is immutable, unaffected by the later publish
```

Tear down when done: `scripts/test-branch.sh down`.

- [ ] **Step 3: Commit**

```bash
git add api/src/routes/app-settings.js
git commit -m "$(cat <<'EOF'
feat: PUT /api/app-settings/terms inserts an immutable row on publish

publishNewVersion=true now computes the next version from
MAX(terms_versions.version)+1 and inserts a new, never-again-modified row
there, instead of only bumping a single overwritten app_settings row. The
draft (app_settings.terms_content/terms_version) is still written on every
call (draft or publish) so GET /terms/draft always reflects the latest save,
and stays in sync with what was just published after a publish.
EOF
)"
```

---

## Task 4: Frontend — `_terms-editor.html` draft/history split + version browsing UI

**Files:**
- Modify: `_terms-editor.html`

**Interfaces:**
- Consumes: `GET /api/app-settings/terms/draft`, `GET /api/app-settings/terms/versions`, `GET /api/app-settings/terms/versions/:version`, `PUT /api/app-settings/terms` (Tasks 2-3).
- Produces: nothing consumed by a later task — this is the plan's last task.

- [ ] **Step 1: Rename `loadTerms()` to `loadDraft()`, point it at the new endpoint**

```js
// before:
      async loadTerms() {
        try {
          const res = await fetch('/api/app-settings/terms', { credentials: 'same-origin' });
          const d = await res.json();
          if (!res.ok) { this.terms.msg = d.error || 'Failed to load terms.'; this.terms.msgOk = false; return; }
          this.terms.version   = d.version;
          this.terms.content   = d.content;
          this.terms.updatedAt = d.updatedAt;
          this.terms.updatedBy = d.updatedBy;
        } catch {
          this.terms.msg = 'Network error.'; this.terms.msgOk = false;
        }
      },

// after:
      async loadDraft() {
        try {
          const res = await fetch('/api/app-settings/terms/draft', { credentials: 'same-origin' });
          const d = await res.json();
          if (!res.ok) { this.terms.msg = d.error || 'Failed to load draft.'; this.terms.msgOk = false; return; }
          this.terms.version   = d.version;
          this.terms.content   = d.content;
          this.terms.updatedAt = d.updatedAt;
          this.terms.updatedBy = d.updatedBy;
        } catch {
          this.terms.msg = 'Network error.'; this.terms.msgOk = false;
        }
      },
```

- [ ] **Step 2: Add version-history state to `data()`**

```js
// before:
      return {
        ready: false,
        accessDenied: false,
        me: {},
        terms: { version: 1, content: '', updatedAt: null, updatedBy: null, saving: false, msg: null, msgOk: true },
      };

// after:
      return {
        ready: false,
        accessDenied: false,
        me: {},
        terms: { version: 1, content: '', updatedAt: null, updatedBy: null, saving: false, msg: null, msgOk: true },
        versions: [],
        versionsLoading: false,
        versionsError: null,
        viewingVersion: null,
        viewVersionError: null,
      };
```

- [ ] **Step 3: Load both draft and version history in `created()`**

```js
// before:
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

// after:
    async created() {
      const user = await initNav('termseditor', { breadcrumbs: [
        { label: 'Home', href: '/pipeline.html' },
        { label: 'Terms & Conditions' },
      ]});
      if (!user) return;
      this.me = user;
      if (user.role !== 'sysadmin') { this.accessDenied = true; return; }
      await Promise.all([this.loadDraft(), this.loadVersions()]);
      this.ready = true;
    },
```

- [ ] **Step 4: Refresh version history after every save, add `loadVersions()`/`viewVersion()` methods**

```js
// before (saveTerms, unchanged parts omitted -- only the success branch changes):
          if (!res.ok) { this.terms.msg = d.error || 'Save failed'; this.terms.msgOk = false; return; }
          if (publishNewVersion && d.newVersion) this.terms.version = d.newVersion;
          this.terms.updatedAt = new Date().toISOString();
          this.terms.updatedBy = this.me.first_name + ' ' + this.me.last_name;
          this.terms.msg   = publishNewVersion
            ? `Published as v${this.terms.version} — all users will be asked to re-accept at next login.`
            : 'Draft saved.';
          this.terms.msgOk = true;

// after:
          if (!res.ok) { this.terms.msg = d.error || 'Save failed'; this.terms.msgOk = false; return; }
          if (publishNewVersion && d.newVersion) this.terms.version = d.newVersion;
          this.terms.updatedAt = new Date().toISOString();
          this.terms.updatedBy = this.me.first_name + ' ' + this.me.last_name;
          this.terms.msg   = publishNewVersion
            ? `Published as v${this.terms.version} — all users will be asked to re-accept at next login.`
            : 'Draft saved.';
          this.terms.msgOk = true;
          await this.loadVersions();
```

Then add these two new methods right after `saveTerms()` and before `fmtDate()`:

```js
      async loadVersions() {
        this.versionsLoading = true;
        this.versionsError = null;
        try {
          const res = await fetch('/api/app-settings/terms/versions', { credentials: 'same-origin' });
          const d = await res.json();
          if (!res.ok) { this.versionsError = d.error || 'Failed to load version history.'; return; }
          this.versions = d;
        } catch {
          this.versionsError = 'Network error.';
        } finally {
          this.versionsLoading = false;
        }
      },
      async viewVersion(version) {
        this.viewVersionError = null;
        this.viewingVersion = null;
        try {
          const res = await fetch(`/api/app-settings/terms/versions/${version}`, { credentials: 'same-origin' });
          const d = await res.json();
          if (!res.ok) { this.viewVersionError = d.error || 'Failed to load version.'; return; }
          this.viewingVersion = d;
          bootstrap.Modal.getOrCreateInstance(document.getElementById('versionViewModal')).show();
        } catch {
          this.viewVersionError = 'Network error.';
        }
      },
```

- [ ] **Step 5: Add the Version History card markup, after the existing editor card**

```html
<!-- before (end of the existing <template v-else> block): -->
          <textarea v-model="terms.content" class="form-control font-monospace" rows="18" style="font-size:.78rem;resize:vertical"></textarea>
        </div>
      </div>
    </template>
  </div>

<!-- after: -->
          <textarea v-model="terms.content" class="form-control font-monospace" rows="18" style="font-size:.78rem;resize:vertical"></textarea>
        </div>
      </div>

      <!-- ── VERSION HISTORY ───────────────────────────────── -->
      <div class="card mt-4">
        <div class="card-body p-4">
          <h5 class="fw-bold mb-3">📜 Version History</h5>
          <div v-if="versionsError" class="alert alert-danger alert-sm mb-3" style="font-size:.85rem">{{ versionsError }}</div>
          <div v-if="versionsLoading" class="text-muted" style="font-size:.85rem">Loading…</div>
          <table v-else class="table table-sm align-middle mb-0" style="font-size:.85rem">
            <thead>
              <tr><th>Version</th><th>Published</th><th>By</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="v in versions" :key="v.version">
                <td>v{{ v.version }}</td>
                <td>{{ fmtDate(v.publishedAt) }}</td>
                <td>{{ v.publishedBy || '—' }}</td>
                <td class="text-end"><button class="btn btn-outline-secondary btn-sm" @click="viewVersion(v.version)">👁 View</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
```

- [ ] **Step 6: Add the read-only version-view modal**

```html
<!-- before: -->
  <div v-else class="d-flex align-items-center justify-content-center" style="height:60vh">
    <div class="spinner-border text-secondary"></div>
  </div>

</div>

<!-- after: -->
  <div v-else class="d-flex align-items-center justify-content-center" style="height:60vh">
    <div class="spinner-border text-secondary"></div>
  </div>

  <!-- ── VERSION VIEW MODAL ───────────────────────────────── -->
  <div class="modal fade" id="versionViewModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-scrollable modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h6 class="modal-title fw-bold" v-if="viewingVersion">v{{ viewingVersion.version }} — published {{ fmtDate(viewingVersion.publishedAt) }} by {{ viewingVersion.publishedBy || '—' }}</h6>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <div v-if="viewVersionError" class="alert alert-danger alert-sm mb-3" style="font-size:.85rem">{{ viewVersionError }}</div>
          <textarea v-if="viewingVersion" class="form-control font-monospace" rows="18" style="font-size:.78rem" readonly :value="viewingVersion.content"></textarea>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Close</button>
        </div>
      </div>
    </div>
  </div>

</div>
```

Note: the textarea uses `:value="viewingVersion.content"` (one-way attribute binding), not `{{ viewingVersion.content }}` mustache interpolation inside the tag — Vue's own guidance is that mustache interpolation inside `<textarea>` doesn't reactively update reliably; `:value` is the correct one-way-readonly binding here (no `v-model` since this is never edited).

- [ ] **Step 7: Manual verification in the browser**

Using the same isolated stack as Tasks 2-3 (`scripts/test-branch.sh up`, logged in as the sysadmin test account, `http://localhost:8081/_terms-editor.html`):

1. Page loads with the draft content in the textarea and a "Version History" card below showing at least one row (the seeded version 1).
2. Click "👁 View" on version 1 — modal opens showing that version's exact text, header line with version/date/publisher, "Close" dismisses it.
3. Edit the textarea, click "Save draft" — content saves (existing behavior), Version History list is unchanged (no new row).
4. Open `/terms.html` in another tab (or reload) — still shows the OLD published content, not the unsaved draft edit.
5. Back in the editor, click "Publish new version" — success message shows the new version number, Version History list now shows two rows, newest first.
6. Reload `/terms.html` — now shows the newly published content.
7. Click "👁 View" on version 1 again — still shows the original seeded text, unaffected by the publish.

Tear down when done: `scripts/test-branch.sh down`.

- [ ] **Step 8: Commit**

```bash
git add _terms-editor.html
git commit -m "$(cat <<'EOF'
feat: _terms-editor.html loads the draft separately, browses version history

loadTerms() -> loadDraft(), now hitting GET /terms/draft instead of
GET /terms, so the editor always shows the in-progress draft rather than
the last published version. New "Version History" card lists every
published version (GET /terms/versions); "View" opens a read-only modal
with that version's full text (GET /terms/versions/:version). The list
refreshes after every save (draft or publish).
EOF
)"
```
