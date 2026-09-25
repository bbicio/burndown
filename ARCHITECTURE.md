# PDash — Architecture Document

**Version:** 1.0
**Date:** 2026-06-25
**Status:** Approved

---

## 1. Overview

PDash evolves from a single-user localStorage SPA into a multi-user web application with authentication, role-based access control, a REST API backend, and a PostgreSQL database.

The frontend migration to **Vue 3** (CDN, no build step) completed 2026-08-05 — every page is now Vue 3 except the 10-line `index.html` redirect. A handful of shared library files remain classic (non-Vue) scripts, loaded as globals by the Vue pages that still need them (see the file-by-file notes in §7 below).

---

## 2. Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Vue 3 (CDN, multi-page) | No build step; each page is a self-contained HTML file with an inline `Vue.createApp(...)` |
| Backend | Node.js + Express | Same language as frontend; mature auth/email ecosystem |
| Database | PostgreSQL | Relational + JSONB; scales well for analytical queries |
| Auth | JWT + httpOnly cookies | Stateless; protected from XSS |
| Email | Nodemailer + SMTP | Self-hosted; no external service dependency |
| Containerisation | Docker Compose | Local dev parity with future VPS deployment |

---

## 3. User Roles and Permissions

### 3.1 Roles

Three tiers (2026-09, `018_sysadmin_role.sql` widened the `role` CHECK constraint from `('admin','user')`) — a sysadmin inherits every admin capability, plus two capabilities carved out of the plain admin tier:

| Role | Description |
|---|---|
| `sysadmin` | Everything `admin` has, plus exclusive access to `_db-reset.html` (bulk/targeted destructive DB operations) and Terms & Conditions editing (`_terms-editor.html`, `PUT /api/app-settings/terms`) |
| `admin` | Full access to all data and configuration (see matrix below) — no longer includes DB Reset or T&C editing |
| `user` | Scoped access — owns and sees only their own resources |

No user is promoted to `sysadmin` automatically — the migration is a pure constraint widening with no backfill. The first sysadmin must be set directly via SQL (`UPDATE users SET role='sysadmin' WHERE ...`) or the `api/src/promote-sysadmin.js` CLI script; every subsequent promotion goes through `admin.html`'s "⬆ Grant sysadmin" toggle (sysadmin viewers only). Promotion is two-step by design: `user → admin` (any admin/sysadmin) then `admin → sysadmin` (sysadmin only) — never a direct `user → sysadmin` jump, and demotion mirrors it (`sysadmin → admin` only, never straight to `user`), enforced by `api/src/lib/role-transition.js`'s `roleChangeError()`.

Backend authorization has two middleware tiers (`api/src/middleware/auth.js`): `requireAdmin` (`role === 'admin' || role === 'sysadmin'`, trusts the JWT's role claim for its full session lifetime — same JWT-caching behavior as before this change) and `requireSysAdmin` (`role === 'sysadmin'` exclusive, re-reads the role from the DB on every call rather than trusting the token — used only for `reset.js` and `PUT /api/app-settings/terms`, where an up-to-8h stale revocation window on irreversible bulk-deletion routes was judged unacceptable). A shared `isAdminRole(role)` helper (`api/src/lib/is-admin.js`) backs every route-local `role === 'admin'` check that isn't behind the `requireAdmin` middleware itself (cost-grids, projects, timesheets, exports, reporting, notifications, pipeline-years) — added after a live-verified gap where several such literals were missed by the initial sysadmin rollout, leaving a real sysadmin account unable to see any projects/grids/timesheets.

### 3.2 Permission Matrix

| Action | Sysadmin | Admin | User |
|---|---|---|---|
| Access DB Reset (`_db-reset.html`) | ✅ | ❌ | ❌ |
| Edit/publish Terms & Conditions | ✅ | ❌ | ❌ |
| Grant/revoke sysadmin | ✅ | ❌ | ❌ |
| Invite users | ✅ | ✅ | ❌ |
| Disable / re-enable users | ✅ | ✅ (not on a sysadmin account — see below) | ❌ |
| Anonymize users | ✅ | ✅ (not on a sysadmin account) | ❌ |
| Modify a sysadmin's role/status, or anonymize/disable them | ✅ | ❌ | ❌ |
| Manage clients | ✅ | ✅ | read-only |
| Manage programs | ✅ | ✅ | read-only |
| Manage roles + rates | ✅ | ✅ | read-only |
| View ratecards | ✅ | ✅ | ✅ |
| Create / edit / delete ratecards | ✅ | ✅ | ❌ |
| View all cost grids | ✅ | ✅ | own + shared |
| View all projects | ✅ | ✅ | own + shared |
| View all planning | ✅ | ✅ | own + shared |
| Share cost grid / project | ✅ | ✅ | own only |
| Upload timesheet | ✅ | ✅ | own projects only |
| Broadcast notification | ✅ | ✅ | ❌ |
| Manage resource registry / attribute lists (`team.html`/`attribute-lists.html`, 2026-09) | ✅ | ✅ | ❌ |
| Read attribute lists (assign tags on a proposal/project one has access to, 2026-09 Cycle 2) | ✅ | ✅ | ✅ |

"Modify a sysadmin" mutations (`PATCH /api/users/:id`, `POST /:id/anonymize`, `DELETE /:id`) are guarded by `sysAdminTargetError()` (`api/src/routes/users.js`), checked against the actor's *live* DB role (not the JWT-cached one `requireAdmin` reads elsewhere) — closing the same stale-token window `requireSysAdmin` closes for the DB-wipe routes, applied here because these routes can also grant/revoke sysadmin itself.

### 3.3 Ownership and Sharing

- The creator of a cost grid or project is its **exclusive owner** by default.
- Owner or admin can share with specific users by selecting from a searchable dropdown of active, non-admin platform members (`GET /api/users/active-list`). Free-text email entry is not supported.
- Sharing triggers an email notification with a direct link.
- Sharing permissions: `owner` | `editor` | `viewer`. Permission on an existing share can be changed at any time via the same modal (uses `ON CONFLICT DO UPDATE`).
- The calling user's own permission level (`my_permission`) is returned on `GET /api/cost-grids` and `GET /api/projects` responses so the frontend can conditionally show/hide editing controls without an extra round-trip.
- **Viewer enforcement** (UI-only; backend always enforces via `resource_shares.permission`): editors/viewers see different UI surfaces — viewers have Edit, Clone, Delete, Configure, Load Actuals, and Reforecast controls hidden; project-config.html enters a read-only banner mode.
- Disabling a user does **not** delete their resources. Ownership remains and can be reassigned by a sysadmin via `_db-reset.html`'s "Change proposal owner" widget (`PATCH /api/admin/reset/cost-grid/:cgId/owner`), which keeps `cost_grids.owner_id` and `resource_shares` in sync as a single transaction (2026-09 fix — see the API Reference table entry for that route).
- **Owner reassignment from within the editor (2026-09)**: any admin or sysadmin can also reassign a cost grid's owner directly from `costgrid.html` itself (not just `_db-reset.html`), via a new `PATCH /api/cost-grids/:id/reassign-owner` route — see its own API Reference table entry. Unlike the `_db-reset.html` route above, this one also grants the new owner an `editor` `resource_shares` row on every project linked to any version of the cost grid (never downgrading a project the new owner already owns outright to `editor`), and emails the new owner a notification listing those linked projects. Both routes keep `resource_shares.shared_by` set to the actor performing the reassignment, not the new owner.
- **Inline share visibility (2026-09)**: beyond the `#shareModal` add/edit/remove UI, both `pipeline.html`'s sliding detail panel and `costgrid.html`'s full-page editor show a read-only-at-a-glance, remove-capable share list inline (`js/share-list-component.js`, a reusable Vue component registered on both pages' apps), so a viewer doesn't need to open the modal just to see who has access. Removal still goes through the same `DELETE /:id/shares/:userId` route and its owner-removal guard; adding a share remains exclusive to the modal. Sharing a cost grid does **not** grant access to its linked project(s) — `resource_type` scopes `resource_shares` rows independently per resource, with no cascade between `cost_grid` and `project` shares.

---

## 4. Auth Flows

### 4.1 User Invitation

```
Admin fills: firstName, lastName, email, role
  → system creates user (status = pending)
  → system sends email with invite link + instructions
      link contains: invite_token (expires 48h)

User clicks link
  → page validates token (GET /api/auth/invite/:token)
  → user sets password (two fields + confirm)
  → POST /api/auth/activate { token, password, passwordConfirm }
  → status → active, token invalidated
  → redirect to tool
```

### 4.2 Login

```
User submits email + password
  → POST /api/auth/login
  → server validates credentials
  → if ok: sets httpOnly JWT cookie, returns user profile
  → if error: 401 generic message (no distinction email/password)
  → if disabled: 403
```

### 4.3 Password Recovery

```
User submits email
  → POST /api/auth/forgot-password
  → server always returns 200 (does not reveal if email exists)
  → if email found: sends email with reset link (expires 2h)

User clicks link
  → GET /api/auth/reset-password/:token (validates token)
  → user sets new password + confirm
  → POST /api/auth/reset-password { token, password, passwordConfirm }
  → password updated, token invalidated
  → redirect to login
```

### 4.4 Change Password (authenticated)

```
POST /api/auth/change-password
  body: { currentPassword, newPassword, newPasswordConfirm }
```

### 4.5 Logout

```
POST /api/auth/logout → clears JWT cookie
```

### 4.6 Profile Rectification (GDPR Art. 16)

```
User opens account dropdown → "👤 My Profile"
  → modal pre-filled with first_name, last_name, email from window.__navUser
  → PATCH /api/auth/profile { firstName, lastName, email }
  → server validates email format + uniqueness
  → user row updated; navbar name updates immediately without reload
```

### 4.7 Terms & Conditions Acceptance (GDPR)

```
initNav() calls GET /api/auth/me
  → response includes current_terms_version (from app_settings.terms_version)
  → if user.terms_version < current_terms_version (or null):
      redirect to /terms.html?next=<current-page>

terms.html (standalone — no navbar, no initNav):
  → GET /api/app-settings/terms → loads version + HTML content
  → confirm bar with checkbox (disabled button until ticked)
  → POST /api/auth/accept-terms → records version + timestamp on user row
  → redirect to ?next
```

---

## 5. Database Schema

### 5.1 Auth

```sql
users (
  id                UUID PRIMARY KEY,
  email             VARCHAR UNIQUE NOT NULL,
  first_name        VARCHAR NOT NULL,
  last_name         VARCHAR NOT NULL,
  role              VARCHAR NOT NULL CHECK (role IN ('admin','user','sysadmin')),  -- 018_sysadmin_role.sql
  status            VARCHAR NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','active','disabled')),
  password_hash     VARCHAR,
  invite_token      VARCHAR,
  invite_expires    TIMESTAMPTZ,
  reset_token       VARCHAR,
  reset_expires     TIMESTAMPTZ,
  invited_by        UUID REFERENCES users(id),
  terms_version     INTEGER,          -- migration 014: last accepted T&C version (NULL = never accepted)
  terms_accepted_at TIMESTAMPTZ,      -- migration 014: timestamp of last acceptance
  created_at        TIMESTAMPTZ DEFAULT NOW()
)

app_settings (                        -- migration 015: generic key/value store for admin-managed config
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT         NOT NULL,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by UUID         REFERENCES users(id) ON DELETE SET NULL
)
-- Seeded rows: 'terms_version' (integer string), 'terms_content' (HTML) — now repurposed as
-- pure draft storage (migration 019, see terms_versions below); no longer read by the
-- acceptance gate or by GET /api/auth/me's current_terms_version.

terms_versions (                      -- migration 019: immutable, append-only, never UPDATEd/DELETEd
  id           UUID PRIMARY KEY,
  version      INTEGER UNIQUE NOT NULL,
  content      TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_by UUID REFERENCES users(id)
)
```

### 5.2 Configuration

```sql
clients (
  id         UUID PRIMARY KEY,
  name       VARCHAR NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

programs (
  id         VARCHAR PRIMARY KEY,   -- user-defined string e.g. "PROG_01"
  name       VARCHAR NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

roles (
  id             UUID PRIMARY KEY,
  label          VARCHAR NOT NULL,
  code           VARCHAR NOT NULL UNIQUE,
  team           VARCHAR,
  hourly_rate    DECIMAL(10,2),
  rate_overrides JSONB NOT NULL DEFAULT '{}',  -- migration 013: per-currency agency defaults e.g. {"USD": 140}
  created_at     TIMESTAMPTZ DEFAULT NOW()
)

ratecards (
  id         UUID PRIMARY KEY,
  client_id  UUID REFERENCES clients(id),  -- NULL = global default
  name       VARCHAR NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

ratecard_entries (
  id             UUID PRIMARY KEY,
  ratecard_id    UUID NOT NULL REFERENCES ratecards(id) ON DELETE CASCADE,
  role_id        UUID NOT NULL REFERENCES roles(id),
  hourly_rate    DECIMAL(10,2) NOT NULL,
  rate_overrides JSONB NOT NULL DEFAULT '{}',  -- per-currency overrides for this client e.g. {"USD": 120}
  UNIQUE (ratecard_id, role_id)
)

currencies (                          -- migration 012: master table, seeded with 20 codes
  code         VARCHAR(10)   PRIMARY KEY,
  symbol       VARCHAR(10)   NOT NULL,
  name         VARCHAR(100)  NOT NULL,
  locale       VARCHAR(20)   NOT NULL,
  active       BOOLEAN       NOT NULL DEFAULT false,  -- EUR is always active and locked at 1:1
  current_rate DECIMAL(10,6) NOT NULL DEFAULT 1.0,
  updated_at   TIMESTAMP     NOT NULL DEFAULT NOW()
)

currency_rates (                      -- migration 012: append-only rate-change history log
  id            SERIAL PRIMARY KEY,
  currency_code VARCHAR(10)   NOT NULL REFERENCES currencies(code),
  rate          DECIMAL(10,6) NOT NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT NOW(),
  created_by    UUID          REFERENCES users(id)
)

resources (                           -- migration 020: standalone resource registry, first of four
                                       -- planned resource-allocation cycles (see docs/superpowers/
                                       -- specs/2026-09-23-team-attribute-lists-design.md)
  id              UUID PRIMARY KEY,
  first_name      VARCHAR NOT NULL,
  last_name       VARCHAR NOT NULL,
  email           VARCHAR NOT NULL,
  job_title       VARCHAR NOT NULL,   -- free text, not an FK to roles
  job_description TEXT,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,  -- optional link to a PDash account
  status          VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

attribute_lists (                     -- migration 020: generic, agnostic tag/taxonomy system —
                                       -- seeded with 4 empty lists (Market, Brand, Therapeutic Area,
                                       -- Service Type); admin can create more via attribute-lists.html
  id          UUID PRIMARY KEY,
  name        VARCHAR NOT NULL,       -- rename-able display name
  slug        VARCHAR(100) NOT NULL UNIQUE,  -- generated once at creation, immutable thereafter
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

attribute_list_items (                -- migration 020: no physical DELETE anywhere in the API —
                                       -- only active/inactive, so a tag applied elsewhere can never
                                       -- vanish out from under it in a future cycle
  id          UUID PRIMARY KEY,
  list_id     UUID NOT NULL REFERENCES attribute_lists(id) ON DELETE CASCADE,
  label       VARCHAR NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (list_id, lower(label))       -- migration 021: case-insensitive per-list uniqueness
)
```

### 5.3 Cost Grid

```sql
cost_grids (
  id         UUID PRIMARY KEY,
  name       VARCHAR NOT NULL,
  owner_id   UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
)

cost_grid_versions (
  id            UUID PRIMARY KEY,
  cost_grid_id  UUID NOT NULL REFERENCES cost_grids(id) ON DELETE CASCADE,
  label         VARCHAR NOT NULL,
  pipeline      VARCHAR CHECK (pipeline IN
                ('Draft','SIP','Expected','Anticipated','Committed','Canceled')),
  pipeline_year INTEGER,              -- year bucket (FK enforced at app level via pipeline_years)
  start_date    VARCHAR(6),           -- YYYYMM (migration 007 changed from DATE)
  end_date      VARCHAR(6),           -- YYYYMM (migration 007 changed from DATE)
  currency      VARCHAR(10) NOT NULL DEFAULT 'EUR' REFERENCES currencies(code),  -- migration 012
  currency_rate DECIMAL(10,6) NOT NULL DEFAULT 1.0,                              -- migration 012
  note          TEXT,
  locked        BOOLEAN DEFAULT FALSE,
  ratecard_id   UUID REFERENCES ratecards(id),
  client_id     UUID REFERENCES clients(id) ON DELETE SET NULL,  -- migration 008
  project_name  VARCHAR(255) NOT NULL DEFAULT '',                -- migration 009
  created_at    TIMESTAMPTZ DEFAULT NOW()
)

phases (
  id         UUID PRIMARY KEY,
  version_id UUID NOT NULL REFERENCES cost_grid_versions(id) ON DELETE CASCADE,
  title      VARCHAR NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
)

tasks (
  id          UUID PRIMARY KEY,
  phase_id    UUID NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  title       VARCHAR NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  start_date  VARCHAR(8)  NOT NULL DEFAULT '',   -- YYYYMMDD
  end_date    VARCHAR(8)  NOT NULL DEFAULT '',   -- YYYYMMDD
  ptc         DECIMAL(10,2) DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0
)

task_roles (
  id            UUID PRIMARY KEY,
  task_id       UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  role_id       UUID NOT NULL REFERENCES roles(id),
  days          DECIMAL(6,2),
  rate_override DECIMAL(10,2),      -- per-task rate override
  months        JSONB               -- { "YYYYMM": days }
)

cg_version_projects (
  cost_grid_version_id UUID NOT NULL REFERENCES cost_grid_versions(id) ON DELETE CASCADE,
  project_id           UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_name         VARCHAR,     -- snapshot at link time
  task_ids             JSONB NOT NULL DEFAULT '[]'::jsonb,  -- migration 016: cost-grid task IDs mapped to this project
  task_names_direct    JSONB NOT NULL DEFAULT '[]'::jsonb,  -- migration 017: task names assigned via "Add to project"
  PRIMARY KEY (cost_grid_version_id, project_id)
)

cost_grid_version_tags (              -- migration 022: attribute_lists tags assigned to a proposal —
                                       -- Cycle 2 of the resource-allocation initiative. No cascade on
                                       -- item_id: items are never physically deleted (Cycle 1 design).
  version_id UUID NOT NULL REFERENCES cost_grid_versions(id) ON DELETE CASCADE,
  item_id    UUID NOT NULL REFERENCES attribute_list_items(id),
  PRIMARY KEY (version_id, item_id)
)
```

### 5.4 Projects

```sql
projects (
  id            UUID PRIMARY KEY,
  name          VARCHAR NOT NULL,
  code          VARCHAR(100),       -- migration 012: D365 Project ID, separate from the internal UUID
  program_id    VARCHAR REFERENCES programs(id),
  client_id     UUID REFERENCES clients(id),
  start_date    CHAR(6),            -- YYYYMM
  end_date      CHAR(6),            -- YYYYMM
  currency      VARCHAR(10) NOT NULL DEFAULT 'EUR' REFERENCES currencies(code),  -- migration 012
  pipeline      VARCHAR,
  status        VARCHAR,
  owner_id      UUID NOT NULL REFERENCES users(id),
  cg_version_id UUID REFERENCES cost_grid_versions(id),
  phasing       JSONB,              -- { "YYYYMM": amount }
  ptc           JSONB,              -- [{ label, amount, month }]
  planning      JSONB,              -- { "YYYYMM": hours } monthly hour planning
  groups        JSONB,              -- [{ name, roles[] }] functional role groups
  created_at    TIMESTAMPTZ DEFAULT NOW()
)

project_tasks (
  id                   UUID PRIMARY KEY,
  project_id           UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name                 VARCHAR NOT NULL,
  billable             BOOLEAN DEFAULT TRUE,
  completed            BOOLEAN DEFAULT FALSE,
  start_date           CHAR(8),     -- YYYYMMDD (migration 012 widened from CHAR(6)/YYYYMM)
  end_date             CHAR(8),     -- YYYYMMDD (migration 012 widened from CHAR(6)/YYYYMM)
  monthly_distribution JSONB,       -- { "YYYYMM": percent }
  resources            JSONB,       -- [{ role, soldHours, hourlyRate }]
  sort_order           INTEGER DEFAULT 0
)

project_tags (                        -- migration 022: attribute_lists tags of a project. Since Cycle 3a
                                       -- (2026-09-25) this is the SOLE source of a project's tags, linked
                                       -- to a proposal or not: seeded once from cost_grid_version_tags on
                                       -- the first null -> value cg_version_id transition (only if the
                                       -- project has no tags yet), then edited independently. Migration
                                       -- 023 backfilled already-linked projects.
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_id    UUID NOT NULL REFERENCES attribute_list_items(id),
  PRIMARY KEY (project_id, item_id)
)
```

### 5.5 Client Groups and POT Targets

```sql
client_groups (
  id         UUID PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

-- clients.group_id UUID REFERENCES client_groups(id) ON DELETE SET NULL  (added in migration 005)

pots (
  id              UUID PRIMARY KEY,
  client_group_id UUID REFERENCES client_groups(id) ON DELETE CASCADE,
  client_id       UUID REFERENCES clients(id) ON DELETE CASCADE,
  special_label   VARCHAR(255),              -- migration 010: virtual target (e.g. "New Biz")
  year            INTEGER NOT NULL,
  amount          NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- CONSTRAINT: exactly one of client_group_id / client_id / special_label must be set (enforced at app level)
)

pot_history (
  id         UUID PRIMARY KEY,
  pot_id     UUID NOT NULL REFERENCES pots(id) ON DELETE CASCADE,
  old_value  NUMERIC(14,2),
  new_value  NUMERIC(14,2) NOT NULL,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note       VARCHAR(500)               -- migration 011: optional change justification
)

pipeline_years (
  id         UUID PRIMARY KEY,
  year       INTEGER NOT NULL UNIQUE,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

### 5.6 Sharing

```sql
resource_shares (
  id            UUID PRIMARY KEY,
  resource_type VARCHAR NOT NULL CHECK (resource_type IN ('cost_grid','project')),
  resource_id   UUID NOT NULL,
  user_id       UUID NOT NULL REFERENCES users(id),
  permission    VARCHAR NOT NULL CHECK (permission IN ('owner','editor','viewer')),
  shared_by     UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (resource_type, resource_id, user_id)
)
```

### 5.7 Notifications

```sql
notifications (
  id         UUID PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(50)  NOT NULL DEFAULT 'info',
  title      VARCHAR(255) NOT NULL,
  body       TEXT,
  url        VARCHAR(500),          -- optional deep-link inside the app
  url_label  VARCHAR(100),
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

### 5.8 Timesheets

```sql
timesheets (
  id           UUID PRIMARY KEY,
  project_code VARCHAR NOT NULL,    -- D365 Project ID
  data         JSONB NOT NULL,      -- array of parsed XLS rows
  uploaded_by  UUID REFERENCES users(id),
  uploaded_at  TIMESTAMPTZ DEFAULT NOW()
)
```

`data` JSONB row shape:
```json
{
  "date": "YYYY-MM-DD",
  "role": "CODE - LABEL",
  "owner": "Name",
  "hours": 8.0,
  "task": "Task name",
  "notes": "",
  "projectId": "D365ID",
  "projectName": "Name",
  "fee": 65.0
}
```

`fee` is resolved once at upload time (`POST /api/timesheets/upload`) by matching `task`+`role` against the linked project's `project_tasks.resources[].hourlyRate` (same case-insensitive, first-resource-fallback logic as `js/core.js`'s `findRate()`, ported to the backend as `api/src/lib/rate-resolve.js`'s `resolveFee()`), never recomputed later — a rate change after upload never retroactively alters a stored `fee`. Rows uploaded before this field existed have no `fee` key; every consumer treats that identically to a resolved `fee` of `0`. Since `projects.code` has no uniqueness constraint (`012_project_code.sql`), the project used for this lookup — and for `GET /api/timesheets`'s `client_name`/`project_name`/`currency`/`pipeline_year` columns (below) — is resolved via a `LEFT JOIN LATERAL (... ORDER BY created_at LIMIT 1)` scoped to the calling user's own visibility (owner or `resource_shares`), so a duplicate code never leaks another user's inaccessible project's name or rates; the predicate is factored into one shared `projectVisibilityPredicate()` helper in `api/src/routes/timesheets.js`, reused by `visibleCodes()` and both LATERAL joins.

---

## 6. API Reference

### Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /api/auth/login | — | Login email + password |
| POST | /api/auth/logout | ✅ | Clear JWT cookie |
| GET | /api/auth/me | ✅ | Current user profile |
| POST | /api/auth/invite | admin | Invite new user |
| POST | /api/auth/:id/resend-invite | admin | Resend activation email to a pending user with a fresh 48h token |
| GET | /api/auth/invite/:token | — | Validate invite token |
| POST | /api/auth/activate | — | Set password, activate account |
| POST | /api/auth/forgot-password | — | Request password reset |
| GET | /api/auth/reset-password/:token | — | Validate reset token |
| POST | /api/auth/reset-password | — | Set new password |
| POST | /api/auth/change-password | ✅ | Change password (authenticated) |
| PATCH | /api/auth/profile | ✅ | Update own first name, last name, email (validates format + uniqueness) |
| POST | /api/auth/accept-terms | ✅ | Record current T&C version acceptance (writes `terms_version` + `terms_accepted_at`) |

### Users

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/users/search?email= | ✅ | Exact-email lookup of one active user |
| GET | /api/users/active-list | ✅ | List of all active users (id/email/firstName/lastName/role) — used by share modal and notification target picker; returns `role` so frontend can filter out admins |
| GET | /api/users | admin | List all users |
| GET | /api/users/:id | admin | Get user detail |
| PATCH | /api/users/:id | admin* | Update role or status. `role` accepts `admin`/`user`/`sysadmin` (2026-09) subject to `roleChangeError()`'s two-step promotion/demotion rules. *Mutating a target already `role='sysadmin'` — any field — additionally requires the actor to be sysadmin (`sysAdminTargetError()`, live DB role) |
| DELETE | /api/users/:id | admin* | Disable user (soft delete). *Same sysadmin-target protection as PATCH above |
| POST | /api/users/:id/anonymize | admin* | Permanently replace personal data with anonymous values (name → "[Deleted] User", email → `anon_<uuid>@deleted.local`); clears password hash and tokens; preserves operational records. *Same sysadmin-target protection as PATCH above |

### Configuration

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET/POST | /api/clients | admin | List / create |
| PATCH/DELETE | /api/clients/:id | admin | Update / delete |
| GET | /api/programs | ✅ | List (all authenticated users) |
| POST | /api/programs | ✅ | Create (2026-09: relaxed from admin — a non-admin proposal owner/editor can establish a program via costgrid.html's Generate Project flow) |
| PATCH | /api/programs/:id | ✅ | Update name (2026-09: relaxed from admin, same reason; if the program already has ≥1 linked project, caller must be admin or owner/editor on at least one of them) |
| DELETE | /api/programs/:id | admin | Delete (blocked while any project is still linked) |
| POST | /api/programs/:id/share | ✅ | Share every project in a program with a user; caller must be admin or owner/editor on at least one of the program's projects (2026-09 — this pre-existing route previously had no ownership check at all) |
| GET/POST | /api/roles | admin | List / create — `GET` returns `rate_overrides` JSONB field |
| PATCH/DELETE | /api/roles/:id | admin | Update / delete — `PATCH` accepts `rateOverrides` body field (saved to `rate_overrides` column) |
| GET | /api/ratecards | ✅ | List (all authenticated users) |
| POST | /api/ratecards | admin | Create |
| GET | /api/ratecards/:id | ✅ | Detail (all authenticated users) |
| POST | /api/ratecards/clone | admin | Clone global → per client |
| PATCH | /api/ratecards/:id/entries | admin | Bulk update entries |
| DELETE | /api/ratecards/:id | admin | Delete |

### Resources & Attribute Lists (2026-09)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET/POST | /api/resources | admin | List / create resource registry entries |
| PATCH/DELETE | /api/resources/:id | admin | Update (validates non-empty on any of `firstName`/`lastName`/`email`/`jobTitle` present in the body, matching POST) / hard delete |
| GET | /api/attribute-lists | ✅ | List (with active-item counts). 2026-09 (Cycle 2): relaxed from `admin` — `costgrid.html`/`project-config.html`'s Tags UI is used by non-admin editors, and the previous blanket admin-only guard silently broke it for them |
| POST | /api/attribute-lists | admin | Create a taxonomy list — `slug` is generated once via `slugify()` and rejected with 400 if it would exceed 100 characters |
| PATCH | /api/attribute-lists/:id | admin | Rename only — `slug` is never touched |
| GET | /api/attribute-lists/:id/items | ✅ | List items within a list. Relaxed to `✅` alongside the list-level `GET` above, same reason |
| POST | /api/attribute-lists/:id/items | admin | Create an item within a list — label unique per list, case-insensitively; 409 on a duplicate |
| PATCH | /api/attribute-lists/:id/items/:itemId | admin | Update `label` and/or `active`/`inactive` `status` — 409 if the new label duplicates another item in the same list |

No `DELETE` exists for lists or items — see `resources` vs `attribute_lists`/`attribute_list_items` in §5.2 for why.

**Ratecard integration in the cost grid editor**

- Client-specific rates are set via the **💲 Costgrid** button on each client row in `config.html` → Clients tab. The modal lists all roles; custom rates override the agency default for that client.
- The cost grid version form has a **Rate card** dropdown. When a ratecard is selected, `costgrid.js` populates `_cgActiveRatecardMap` (roleId → rate) via `cgUpdateActiveRatecardMap()` (backed by the `loadRatecardsForDropdown()` cache in `ratecards.js`).
- Rate cells in the grid use this map as the **baseline**: a cell is only marked yellow (`✎ custom`) when the user manually enters a value that differs from the ratecard rate. Clearing the cell restores the ratecard rate (not the bare agency default).
- The **👥 Add role** modal applies the same map: roles with a custom ratecard entry are highlighted with an indigo badge (`✦ rate €/h`) and a light purple row background. The rate stored in `_cgDraft.roles` on add is the ratecard rate, so no false positive "custom" flag on first render.
- `_cgActiveRatecardMap` is refreshed on: version open → `cgPopulateRatecardDropdown()`, ratecard dropdown change, and "Add role" modal open.

### Currencies

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/currencies/active | ✅ | Active currencies (dropdowns, money formatting) |
| GET | /api/currencies | admin | All currencies (active + inactive) plus last rate-update timestamp |
| POST | /api/currencies/:code/activate | admin | Activate a currency with an initial exchange rate; logs to `currency_rates` |
| PATCH | /api/currencies/:code/rate | admin | Update the exchange rate for an active non-EUR currency; logs to `currency_rates` |
| GET | /api/currencies/:code/history | admin | Chronological rate-change history for one currency |

### Cost Grid

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET/POST | /api/cost-grids | ✅ | List / create — list response includes `my_permission` computed for the calling user |
| GET | /api/cost-grids/budgets | ✅ | Pre-computed fee + PTC totals per version (all visible versions) |
| PATCH/DELETE | /api/cost-grids/:id | owner/admin | Update / delete |
| GET/POST | /api/cost-grids/:id/versions | ✅ | List / create version — both accept `clientId` |
| PATCH/DELETE | /api/cost-grids/:id/versions/:vId | owner/admin | Update / delete version — PATCH accepts `clientId`, `ratecardId`, `label`, `pipeline`, `startDate`, `endDate`, `note` |
| POST | /api/cost-grids/:id/versions/:vId/duplicate | owner/admin | Duplicate version |
| GET/PUT | /api/cost-grids/:id/versions/:vId/structure | owner/admin | Get / save bulk structure |
| GET/POST/DELETE | /api/cost-grids/:id/versions/:vId/linked-projects | owner/admin | Manage linked projects |
| GET/POST/DELETE | /api/cost-grids/:id/shares | owner/admin | Manage sharing; `POST` (grant) emails and in-app-notifies the recipient (2026-09: in-app notification added — was email-only before); `DELETE` (revoke) still sends neither, unlike the equivalent project-share revoke |
| PATCH | /api/cost-grids/:id/reassign-owner | admin/sysadmin | Reassign the proposal's owner (2026-09); also grants the new owner `editor` on every linked project and both emails and in-app-notifies them (2026-09: in-app notification added — was email-only before) — see its own note above |
| GET/PUT | /api/cost-grids/:id/versions/:vId/tags | owner/admin | (2026-09, Cycle 2) Get / replace-all the version's `attribute_lists` tags — `PUT` body `{ itemIds: string[] }`, rejects with 400 if the version is `locked`, and with 400 (not 500) if an `itemId` doesn't exist (translated from the FK violation) or isn't a UUID. Since Cycle 3a both routes return **404** when `:vId` doesn't belong to `:id` (`versionInGrid` / `cost_grid_id = :id`), and `PUT` uses a bulk `unnest($2::uuid[])` insert |

### Projects

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET/POST | /api/projects | ✅ | List / create — list response includes `my_permission` computed for the calling user |
| PATCH/DELETE | /api/projects/:id | owner/admin | Update / delete |
| GET/PUT | /api/projects/:id/tasks | owner/admin | Get / save bulk tasks |
| PATCH | /api/projects/:id/phasing | owner/admin | Update phasing |
| PATCH | /api/projects/:id/ptc | owner/admin | Update PTC |
| PATCH | /api/projects/:id/planning | owner/admin | Update monthly hour planning |
| PATCH | /api/projects/:id/groups | owner/admin | Update functional role groups |
| GET/POST/DELETE | /api/projects/:id/shares | owner/admin | Manage sharing; both `POST` (grant) and `DELETE` (revoke) email + in-app-notify the affected user (2026-09: `DELETE` previously sent neither) |
| GET/PUT | /api/projects/:id/tags | owner/admin | (2026-09, Cycle 2) Get / replace-all the project's own `attribute_lists` tags — `PUT` body `{ itemIds: string[] }`. **Since Cycle 3a (2026-09-25) a linked project's tags are directly editable — the former 409 is gone** — `project_tags` is the sole source of a project's tags, seeded once by `copyVersionTagsToProject` (see `POST`/`PATCH /api/projects`). Bulk `unnest($2::uuid[])` insert; 400 on an unknown `itemId` (FK `23503`) or a non-UUID one (`22P02`) |

### Timesheet + Reporting

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/timesheets | ✅ | List uploaded timesheets (summary), one row per `project_code`; each row also carries `client_name`, `project_name`, `currency`, `pipeline_year` (visibility-scoped, see §5.8) |
| GET | /api/timesheets/all-data | ✅ | All timesheet rows merged (for dashboard seed) |
| POST | /api/timesheets/upload | ✅ | Upload XLS file; rejects the entire file (400, no partial writes) if any row's date cannot be resolved to a valid calendar date |
| DELETE | /api/timesheets/:projectCode | owner/admin | Remove timesheet data |
| GET | /api/reporting/portfolio | ✅ | Portfolio budget overview |
| GET | /api/reporting/projects/:id | ✅ | Single project reporting |
| GET | /api/reporting/planning | ✅ | Resource planning aggregates |
| GET | /api/reporting/pipeline | ✅ | Pipeline kanban data |
| GET | /api/reporting/phasing?year= | admin | Monthly hours+amount breakdown for all versions in the year (all pipeline stages) |
| GET | /api/reporting/project-phasing?year= | admin | Same breakdown read directly from `projects.phasing` (reflects Reforecast if run+saved); excludes Draft and Canceled |

### Exports

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /api/exports/portfolio | ✅ | CSV of all accessible projects → emailed as attachment + self-notified in-app (2026-09) |
| POST | /api/exports/cost-grids | ✅ | Pivoted CSV of all accessible cost grids (one row per task, role-code columns) → emailed + self-notified in-app (2026-09) |
| POST | /api/exports/ratecards | admin | Pivoted CSV of all ratecards (roles × clients) → emailed + self-notified in-app (2026-09) |
| GET | /api/exports/phasing?year= | admin | Direct XLS download (not emailed) of the phasing breakdown for a pipeline year |

### Pipeline Years

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/pipeline-years | ✅ | List years (admin: all; user: active only) |
| POST | /api/pipeline-years | admin | Create year (2000–2100) |
| PATCH | /api/pipeline-years/:id | admin | Toggle active/inactive |
| DELETE | /api/pipeline-years/:id | admin | Delete (blocked if versions reference it) |

### Client Groups

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/client-groups | admin | List all groups with member clients |
| POST | /api/client-groups | admin | Create group |
| PATCH | /api/client-groups/:id | admin | Rename group |
| DELETE | /api/client-groups/:id | admin | Delete group |
| POST | /api/client-groups/:id/members | admin | Assign client to group |
| DELETE | /api/client-groups/:id/members/:clientId | admin | Remove client from group |

### POT Targets

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/pots | admin | List POTs (filter: `?year=`); includes `special_label`, `committed_total`, `anticipated_total`, `achieved_total` fields |
| POST | /api/pots | admin | Create POT — exactly one of `clientGroupId`, `clientId`, or `specialLabel` + `year` + `amount` |
| PATCH | /api/pots/:id | admin | Update amount (logs to pot_history) |
| DELETE | /api/pots/:id | admin | Delete POT |
| GET | /api/pots/:id/history | admin | Amount change history |
| GET | /api/pots/summary | ✅ | Aggregated pipeline value vs. POT target for a client/group + year; returns `committed_total` and `anticipated_total` computed server-side across **all** proposals (regardless of caller visibility), so every user sees the same POT progress |
| GET | /api/pots/pipeline-summary?year= | admin | Per-stage count + professional-fee total for a pipeline year (all 5 stages, Draft excluded) |
| GET | /api/pots/year-totals | admin | `{ year: { pot_total, committed_total, anticipated_total, achieved_total } }` for all years — achieved = committed + anticipated |
| GET | /api/pots/:id/details?year= | admin | POT metadata + change history + `committed_total` + `anticipated_total` + all scoped proposals (matched via `cgv.client_id`; Canceled included, Draft excluded) |

### Notifications

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/notifications/stream | ✅ | SSE stream — real-time push for the current user |
| GET | /api/notifications | ✅ | Last 50 notifications for current user |
| GET | /api/notifications/unread-count | ✅ | `{ count: N }` |
| PATCH | /api/notifications/read-all | ✅ | Mark all as read |
| PATCH | /api/notifications/:id/read | ✅ | Mark one as read |
| POST | /api/notifications | ✅ | Create notification(s); `userId` targets one user (any authenticated user), omit `userId` to broadcast to all (admin only); `channels: ['push','email']` selects delivery channel(s), default `['push']` |

### App Settings — Terms & Conditions (version history, 2026-09)

`terms_versions` is a new, immutable, append-only table (`id`, `version` INTEGER UNIQUE, `content`, `published_at`, `published_by`) — application code never `UPDATE`s/`DELETE`s a row once inserted. `app_settings.terms_content`/`terms_version` (the old single-row storage) is repurposed as pure **draft** storage — never read by `terms.html`'s acceptance gate or by `GET /api/auth/me`'s `current_terms_version` after this change; both now read `MAX(terms_versions.version)`.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/app-settings/terms | ✅ | Returns `{ version, content, updatedAt, updatedBy }` for the **latest published** version (from `terms_versions`) — used by `terms.html`'s acceptance gate. Response shape unchanged from before this feature |
| GET | /api/app-settings/terms/draft | **sysadmin** | The in-progress draft (`app_settings.terms_content`/`terms_version`), same response shape as above — what `_terms-editor.html` loads into its textarea |
| GET | /api/app-settings/terms/versions | **sysadmin** | List of published versions, no `content` field: `[{ version, publishedAt, publishedBy }, ...]` DESC by version |
| GET | /api/app-settings/terms/versions/:version | **sysadmin** | Full text of one past published version; 404 if unknown |
| PUT | /api/app-settings/terms | **sysadmin** | `{ content, publishNewVersion }`. `false` writes only the draft (unaffected by `terms.html`). `true` additionally computes `newVersion = MAX(terms_versions.version)+1`, inserts a new immutable row, and syncs the draft to match. No transactional guard against a concurrent double-publish race — a pre-existing risk class carried over from the old single-row storage's identical read-then-increment race, explicitly descoped (`docs/superpowers/specs/2026-09-11-terms-version-history-design.md`) |

### Admin — Bulk Reset

Scopes: `proposals`, `projects`, `clients`, `ratecards`, `actuals`, `pipelines`, `notifications`. Each runs inside a DB transaction. All four endpoints below were `admin`-gated before 2026-09; now **sysadmin**-exclusive (`requireSysAdmin`, re-reads role from the DB rather than trusting the JWT — see §3.1).

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/admin/reset/scopes | **sysadmin** | List all available scopes with human-readable labels |
| POST | /api/admin/reset/:scope | **sysadmin** | Delete all data for the given scope; returns `{ ok, scope, deleted }` |
| POST | /api/admin/reset/cost-grid/:cgId | **sysadmin** | Delete one cost grid + all its versions + linked projects (transactional); 404 on unknown cgId |
| PATCH | /api/admin/reset/cost-grid/:cgId/owner | **sysadmin** | Reassign a cost grid's owner to an active user (transactional); body: `{ ownerId }`; 400 if `ownerId` missing; 404 if cgId or userId unknown. Updates `cost_grids.owner_id` **and** keeps `resource_shares` in sync (2026-09 fix): removes the previous owner's `owner`-permission row and upserts one for the new owner — both the share modal and the inline share list read `resource_shares`, not `cost_grids.owner_id`, for "who has access" |

---

## 7. Docker Compose

```yaml
version: '3.9'

services:

  db:
    image: postgres:16-alpine
    container_name: pdash-db
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-pdash}
      POSTGRES_USER: ${POSTGRES_USER:-pdash}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-pdash}"]
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    build: ./api
    container_name: pdash-api
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER:-pdash}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-pdash}
      JWT_SECRET: ${JWT_SECRET}
      JWT_EXPIRES_IN: ${JWT_EXPIRES_IN:-8h}
      SMTP_HOST: ${SMTP_HOST}
      SMTP_PORT: ${SMTP_PORT:-587}
      SMTP_USER: ${SMTP_USER}
      SMTP_PASS: ${SMTP_PASS}
      APP_URL: ${APP_URL:-http://localhost}
      NODE_ENV: ${NODE_ENV:-development}
    ports:
      - "3000:3000"
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - ./api/src:/app/src   # hot reload in development
    healthcheck:
      test: ["CMD-SHELL", "node -e \"...GET /api/auth/me, exit 0 if status < 500...\""]
      interval: 10s
      timeout: 5s
      retries: 8
      start_period: 20s

  # ── Integration test runner (docker compose --profile test run --rm test) ──────
  # Not started by a plain `docker compose up` (profiles: ["test"]). Installs pg/bcryptjs,
  # bootstraps a test admin + a test sysadmin via create-admin.js/promote-sysadmin.js, then
  # runs test-api.js against the live api service. Exit 0 = all tests pass.
  test:
    image: node:24-alpine
    profiles: ["test"]
    depends_on:
      api:
        condition: service_healthy
    volumes:
      - ./api/src:/app/src
      - ./test-api.js:/app/test-api.js

  adminer:
    image: adminer:latest
    container_name: pdash-adminer
    ports:
      - "8080:8080"
    depends_on:
      - db

  nginx:
    image: nginx:alpine
    container_name: pdash-nginx
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./:/usr/share/nginx/html:ro
    ports:
      - "80:80"
    depends_on:
      - api

volumes:
  pgdata:
```

**Docker main-stack safety.** Commands run directly against this main stack (`pdash-db`/`pdash-api`/`pdash-nginx`/`pdash-adminer`, as opposed to the isolated stacks `scripts/test-branch.sh`/`scripts/run-tests.sh` create) are subject to a permanent operational guardrail — no `-v`/`--volumes` ever, a `pg_dump` snapshot before any lifecycle operation, and explicit human confirmation even for a plain restart. The rule exists because of a real 2026-08-05 incident that wiped the `pgdata` volume; see CLAUDE.md's "Infrastructure safety" section (top of file) for the full, binding text — this note is informational only, CLAUDE.md is the source of truth.

### Directory structure

```
burndown/
  api/                    ← Node.js + Express backend
    src/
      routes/             ← auth, users, config, cost-grids, projects, timesheets, reporting, exports, notifications, reset, attribute-lists, resources
      lib/                ← pure functions extracted for unit testing (node:test), mirroring the frontend's js/lib/
                            convention. Full narrative: docs/api/lib.md
      middleware/         ← auth guard (requireAuth, requireAdmin, requireSysAdmin — see §3.1)
      db/                 ← PostgreSQL pool client, migrations/
      services/           ← email (nodemailer), jwt
      create-admin.js     ← CLI bootstrap: create/reset admin user (always role='admin')
      promote-sysadmin.js ← CLI: promote an existing user to role='sysadmin'
    Dockerfile
    package.json
  css/
    tokens.css            ← design tokens (single source of truth); also carries `[v-cloak] { display: none; }`
                            (2026-07, repo-wide FOUC fix) — see CLAUDE.md's "v-cloak" section for the full rationale
    style.css             ← includes `.pb-board-root` (2026-07) — extracted from pipeline.html's former inline
                            style so the `[v-cloak]` rule above could win via cascade without `!important`;
                            `.tag-pill`/`.tag-group`/`.tag-pill--inactive`/`.tags-section--readonly` (2026-09,
                            Cycle 2) — the tag-pill/chip component shared by costgrid.html/project-config.html's
                            Tags sections. Full narrative: docs/pages/costgrid.md's "Tags" section
    admin-crud.css        ← shared layout for simple admin CRUD pages (page-header/card/table/badges/
                            btn-primary/form-*/empty/alert-sm), extracted 2026-09 from duplicated inline
                            `<style>` blocks in admin.html/team.html/attribute-lists.html
  js/
    api.js                ← Api.* namespace, apiFetch wrapper
    api-sync.js           ← in-memory ↔ API sync helpers (config.projects, timesheetData). Full narrative: docs/js/api-sync.md
    core.js               ← state, in-memory helpers (loadConfig/persistConfig no-ops), shared helpers, showConfirm()/showInfo() modal idioms, findRate(). Full narrative: docs/js/core.md
    nav.js                ← navbar injection, initNav(); injects settings, change-pwd, and "My Profile" modals; T&C gate; calls initNotifications(). Full narrative: docs/js/nav.md
    shares.js             ← generic share modal
    notifications.js      ← SSE client, bell badge, notification dropdown panel; also drives browser/desktop notifications. Full narrative: docs/js/notifications.md
    costgrid.js           ← shared cost-grid business-logic library, loaded unmodified by `pipeline.html` as globals, and by `costgrid.html`'s own Vue rewrite via the bridge pattern; decided 2026-07 this file is a permanent shared Vanilla service layer, not migration debt — see `docs/superpowers/specs/2026-07-27-costgrid-js-fate-design.md`. Full narrative: docs/js/costgrid.md
    portfolio.js          ← mostly dead code since portfolio.html's Vue rewrite folded its rendering logic in directly; only 2 exports remain reachable — `fmtProjectTitle`/`getMonthRangeFromCfg`, both consumed by planning.html
    lib/                  ← pure functions extracted for unit testing (vitest + jsdom), each an ES module
                            (`export function ...`) with a `window.<name> = <name>` bridge for classic-script
                            callers; modules: cfg-parse.js, planning-calc.js, status-rules.js, costgrid-calc.js,
                            portfolio-calc.js, pipeline-calc.js, notif-browser.js. Full narrative: docs/js/lib.md
    roles.js              ← `loadRolesFromApi`/`saveRoles` (no-op)/`getRoles` only — its former roles-management modal UI was confirmed unreachable and deleted in the 2026-08 dead-code cleanup; `loadRolesFromApi` maps `rateOverrides: r.rate_overrides || {}` on each role — role shape: `{ id, label, code, rate, rateOverrides }`
    ratecards.js          ← rate cards admin modal; exports loadRatecardsForDropdown() (cached) used by costgrid.js; `_rcRenderEntries` pre-populates non-EUR column placeholders with agency default from `_rcRoles[rid].rate_overrides[currency]`; `_rcSaveEntries` collects per-role `rateOverrides` and sends them to the API
    upload.js             ← XLS parsing
    settings.js           ← settings modal logic (openSettingsModal, stgExport, downloadFullBackup)
    ai.js                 ← AI sidebar chat + project analysis. Full narrative: docs/js/ai.md
    tags.js                ← (2026-09, Cycle 2) `loadActiveAttributeListsForTagging()`, shared by
                            costgrid.html/project-config.html's Tags sections; fetches lists + active items
                            in parallel via raw fetch() (not Api.*), matching attribute-lists.html's own
                            call style for these endpoints. Full narrative: docs/pages/costgrid.md's "Tags" section
    clients.js / programs.js
  index.html              ← redirect → pipeline.html
  pipeline.html           ← kanban pipeline board, Vue 3 (CDN, no build step, same pattern as portfolio.html/
                            project-config.html). Full narrative: docs/pages/pipeline.md
  portfolio.html          ← portfolio overview + per-project dashboard, Vue 3 (CDN, no build step, same pattern as project-config.html); folds in the former js/portfolio.js + js/dashboard.js; adds js/lib/portfolio-calc.js (KPI/burndown math extraction, vitest-covered); no longer loads js/roles.js or js/config-form.js (the latter only served this page's own now-removed, previously-unreachable #configModal + nested CRUD modals); overview list-view project cards restructured (2026-09) to show identity + a Duration/Sold/Spent/Variance stats row (no monthly table) and a single always-enabled entry button into the detail page, laid out in a 2-column Bootstrap grid; list-view filter row (2026-09) also gained a free-text search input (matches project name/code/client name) and a Status multi-select dropdown, plus a `⚙️ Configure` button back on each card (a prior "detail-only" decision from the card-restructure cycle, since reversed) — full implementation narrative: `docs/pages/portfolio.md`
  planning.html           ← resource planning (filters, By Role/By Project/By Owner grouping views,
                            monthly/weekly interval, monthly pulse, rounded-hours toggle, XLS
                            export/upload, AI Planning Sidebar), Vue 3 (CDN, no build step, same
                            pattern as pipeline.html/costgrid.html). Full narrative: docs/pages/planning.md
  costgrid.html           ← cost grid editor (phase/task/role table, phasing panel, version tabs,
                            toolbar), Vue 3 (CDN, no build step, same pattern as pipeline.html/
                            portfolio.html). Full narrative: docs/pages/costgrid.md
  timesheets.html          ← admin-only timesheet upload management, Vue 3 (CDN, no build step). Full narrative: docs/pages/timesheets.md
  config.html             ← admin config (clients, programs, roles, pipelines & POTs); Role edit form shows per-currency rate fields populated from `rateOverrides`; "Proposal Phasing" view (was "Phasing") excludes Canceled/Draft stages; monthly cells show local amount + EUR equivalent for non-EUR proposals; `phasingTableHtml` adds Total column and removes collapsible detail; `openClientRatecard` fixed filter and shows agency default per-currency placeholder
  project-config.html     ← full-page project config form, Vue 3 (CDN, no build step, same pattern as admin.html); manages a single reactive project object (not an array — the original's hidden multi-project dropdown/New/Delete machinery was confirmed dead on this page); unknown ?projectId= shows an explicit not-found state. Full narrative: docs/pages/project-config.md
  admin.html              ← user management; "🗑 Anonymize" button on disabled non-anonymized users; role toggle (admin↔user) + sysadmin grant/revoke toggle (sysadmin viewers only). T&C editor moved out (2026-09) to _terms-editor.html
  terms.html              ← standalone T&C acceptance page (no initNav), Vue 3 (CDN, no build step, same pattern as login.html); shown by gate in initNav() when user.terms_version < current; loaded from /api/app-settings/terms; POST /api/auth/accept-terms on confirm
  login.html / activate.html / reset-password.html
  _db-reset.html          ← sysadmin-exclusive (2026-09, was admin-only) hidden page for bulk DB data deletion by scope, Vue 3 (CDN, no build step, same pattern as admin.html), linked from the sysadmin-only navbar menu (initNav('dbreset', ...))
  _terms-editor.html      ← sysadmin-exclusive hidden page — Terms & Conditions editor, moved out of admin.html; linked from the sysadmin-only navbar menu (initNav('termseditor', ...)) — see §5's App Settings section. Full narrative: docs/pages/terms-editor.md
  team.html               ← resource registry CRUD, Vue 3 (CDN, no build step, same pattern as admin.html), admin or sysadmin, linked from the ⚙ Admin dropdown (2026-09). First of four planned resource-allocation cycles — see docs/superpowers/specs/2026-09-23-team-attribute-lists-design.md
  attribute-lists.html    ← generic, agnostic tag/taxonomy admin console (lists + items, no physical delete), Vue 3 (CDN, no build step, same pattern as admin.html), admin or sysadmin, linked from the ⚙ Admin dropdown (2026-09). As of Cycle 2 (2026-09), its lists/items are consumed by costgrid.html/project-config.html's Tags sections via js/tags.js
  nginx.conf              ← denies dev-only toolchain artifacts (node_modules/, package.json, package-lock.json,
                            vitest.config.js, *.test.js, *.spec.js) even though it bind-mounts the repo root
  docker-compose.yml
  .env.example
  .gitattributes          ← pins *.sh to LF line endings on checkout regardless of local core.autocrlf
  package.json            ← dev-only vitest + jsdom test toolchain for js/lib/ (never bundled, never served)
  vitest.config.js
  scripts/
    test-branch.sh        ← isolated Docker Compose stack (`up`/`down`/`status`) for testing the current feature branch before merge; distinct container names/ports from the main stack. Full narrative: docs/scripts/test-branch.md
    run-tests.sh           ← ephemeral, fully isolated stack (distinct `-p pdash_test` project name, no host ports) for the `docker-compose.yml` integration-test profile; always applies all migrations to a fresh DB; is `/finish-cycle` Gate 1's documented test command. Full narrative: docs/scripts/run-tests.md
    backup-db.sh          ← pg_dump -Fc snapshot of the main stack's pdash-db into backups/ (gitignored), timestamped to the second, keeps only the 3 most recent dumps; non-blocking (warns + exits 0 if pdash-db isn't running). Run standalone, or automatically by /finish-cycle Gate 4 right after merge — see "Docker main-stack safety" above for the incident this exists to guard against
```

---

## 8. Migration Strategy

**Status: Complete.** The localStorage → API migration has been completed. **localStorage is no longer used for server data.**

The `migration.html` tool was used for the one-time migration of existing localStorage data into the PostgreSQL database. It has been removed from the repo (`docs/superpowers/plans/2026-07-14-vue-migration-roadmap.md`) — the migration itself is long complete and the tool was already unreachable from the UI before this removal.

New users start fresh: an admin creates an account via the invite flow, then uses the app directly against the API.

**Current localStorage usage** (only genuinely client-side keys remain):
- `PDash_settings` — AI provider API keys (Anthropic/OpenAI/Gemini), stored per-device
- `PDash_summary` — portfolio summary project selection (UI preference)
- `reforecast_snapshot_<projectId>` — no longer written; `project-config.html`'s Vue 3 rewrite confirmed the rollback/snapshot feature was already unreachable on that page (no rollback button existed in its markup) and did not port it. The mechanism still exists in `js/config-form.js` (unchanged); `portfolio.html`'s own copy of that config modal was confirmed unreachable dead code and dropped entirely in its own Vue migration, and `planning.html`'s own Vue migration confirmed `js/config-form.js` was dead there too (no reachable `#configModal`) and dropped its `<script>` tag — no page in the repo loads `js/config-form.js` reachably anymore, though the file itself is kept for reference.

All server data (cost grids, projects, clients, programs, roles, timesheets) is fetched from the API on every page load into in-memory variables. No stale cross-session data is possible.

### DB migrations

Numbered SQL files in `api/src/db/migrations/`. Apply individually via:

```powershell
docker exec pdash-db psql -U pdash -d pdash -c "$(Get-Content api/src/db/migrations/002_add_project_extra.sql -Raw)"
```

Current migrations:
- `001_initial.sql` — full schema (users, projects, cost grids, shares, timesheets, ratecards, etc.)
- `002_add_project_extra.sql` — adds `planning` and `groups` JSONB columns to `projects`
- `003_add_task_description_dates.sql` — adds `description`, `start_date`, `end_date` to `tasks`
- `004_add_notifications.sql` — adds `notifications` table + indexes
- `005_drafts_pipeline_year_pot.sql` — adds `Draft` pipeline stage; `pipeline_year` column on `cost_grid_versions`; `client_groups`; `pots` + `pot_history`
- `006_pipeline_years.sql` — adds `pipeline_years` table (admin-managed visible years) with seed row for current year
- `007_version_date_varchar.sql` — converts `cost_grid_versions.start_date` and `end_date` from `DATE` to `VARCHAR(6)` (`YYYYMM`)
- `008_version_client.sql` — adds `client_id UUID` to `cost_grid_versions` (stored directly on the version, independently of linked projects)
- `009_version_project_name.sql` — adds `project_name VARCHAR(255)` to `cost_grid_versions` (display name shown on pipeline cards and used as default when generating a linked project)
- `010_pots_special_label.sql` — adds `special_label VARCHAR(255)` to `pots` for virtual targets ("Unassigned / To be Identified", "New Biz") that are not tied to a specific client or group
- `011_pot_history_note.sql` — adds `note VARCHAR(500)` to `pot_history` for optional change justification text
- `012_currencies.sql` — creates `currencies` (master table, seeded with 20 codes, EUR always active/locked at 1:1) and `currency_rates` (append-only rate-change history); converts `cost_grid_versions.currency`/`projects.currency` from bare `CHAR(3)` to `VARCHAR(10) REFERENCES currencies(code)`; adds `cost_grid_versions.currency_rate DECIMAL(10,6)`; adds `ratecard_entries.rate_overrides JSONB` if not already present
- `012_project_code.sql` — adds `projects.code VARCHAR(100)` (D365 Project ID, separate from the internal UUID primary key)
- `012_project_task_date_char8.sql` — widens `project_tasks.start_date`/`end_date` from `CHAR(6)` to `CHAR(8)` (YYYYMM → YYYYMMDD), padding existing 6-char values to `YYYYMM01`
- `013_role_rate_overrides.sql` — adds `rate_overrides JSONB NOT NULL DEFAULT '{}'` to `roles` table for per-currency agency default rates
- `014_terms_accepted.sql` — adds `terms_version INTEGER` and `terms_accepted_at TIMESTAMPTZ` to `users` for T&C acceptance tracking
- `015_app_settings.sql` — creates `app_settings` key/value table; seeds `terms_version` (1) and `terms_content` (default HTML notice)
- `016_version_project_task_ids.sql` — adds `task_ids JSONB NOT NULL DEFAULT '[]'::jsonb` to `cg_version_projects`, tracking which cost-grid tasks are mapped to each linked project so Generate Project can detect free tasks across sessions
- `017_task_names_direct.sql` — adds `task_names_direct JSONB NOT NULL DEFAULT '[]'::jsonb` to `cg_version_projects`; backfills from `project_tasks` name matching
- `018_sysadmin_role.sql` — widens `users.role`'s CHECK constraint to add `sysadmin` as a third value; no backfill
- `019_terms_versions.sql` — new immutable, append-only `terms_versions` table; backfills one row from the then-current `app_settings.terms_content`/`terms_version` (the only text still recoverable)
- `020_resources_attribute_lists.sql` — creates `resources`, `attribute_lists`, `attribute_list_items` (see §5.2); seeds 4 empty `attribute_lists` rows (Market, Brand, Therapeutic Area, Service Type)
- `021_attribute_list_items_unique_label.sql` — case-insensitive unique index on `attribute_list_items(list_id, lower(label))`; disambiguates any pre-existing duplicate labels first so the index can never fail to create
- `022_version_project_tags.sql` — creates `cost_grid_version_tags` and `project_tags` join tables (see §5.3/§5.4), each a composite-PK pair with a supporting index on `item_id`; Cycle 2 of the resource-allocation initiative
- `023_backfill_project_tags.sql` — one-shot idempotent backfill: copies a version's tags into `project_tags` for every project with `cg_version_id` set and no tags (Cycle 3a, 2026-09-25); apply once, since a rerun would also refill deliberately cleared projects

---

## 9. Security Notes

- JWT stored in **httpOnly cookie** — not accessible from JavaScript (XSS protection)
- Password reset and invite endpoints always return 200 — never reveal if an email exists
- All tokens (invite, reset) are **single-use** and time-limited
- Locked cost grid versions are enforced at API level, not just UI
- Soft-delete only — no data is permanently deleted from the database
- **GDPR compliance** (internal tool): T&C acceptance gated at login (versioned; re-acceptance forced on publish); profile self-rectification via "My Profile" modal (`PATCH /api/auth/profile`); admin anonymization (`POST /api/users/:id/anonymize`) replaces all personal data while preserving operational records
- All user-facing errors use generic messages for auth failures
