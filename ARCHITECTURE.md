# PDash — Architecture Document

**Version:** 1.0
**Date:** 2026-06-25
**Status:** Approved

---

## 1. Overview

PDash evolves from a single-user localStorage SPA into a multi-user web application with authentication, role-based access control, a REST API backend, and a PostgreSQL database.

The frontend remains Vanilla JS in the short term. New pages (login, account activation, password recovery) are built in **Vue 3** (CDN, no build step). Existing PDash views migrate to Vue incrementally.

---

## 2. Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Vanilla JS (multi-page) | No build step; each page is a self-contained HTML file |
| Backend | Node.js + Express | Same language as frontend; mature auth/email ecosystem |
| Database | PostgreSQL | Relational + JSONB; scales well for analytical queries |
| Auth | JWT + httpOnly cookies | Stateless; protected from XSS |
| Email | Nodemailer + SMTP | Self-hosted; no external service dependency |
| Containerisation | Docker Compose | Local dev parity with future VPS deployment |

---

## 3. User Roles and Permissions

### 3.1 Roles

| Role | Description |
|---|---|
| `admin` | Full access to all data and configuration |
| `user` | Scoped access — owns and sees only their own resources |

### 3.2 Permission Matrix

| Action | Admin | User |
|---|---|---|
| Invite users | ✅ | ❌ |
| Disable / re-enable users | ✅ | ❌ |
| Manage clients | ✅ | read-only |
| Manage programs | ✅ | read-only |
| Manage roles + rates | ✅ | read-only |
| View ratecards | ✅ | ✅ |
| Create / edit / delete ratecards | ✅ | ❌ |
| View all cost grids | ✅ | own + shared |
| View all projects | ✅ | own + shared |
| View all planning | ✅ | own + shared |
| Share cost grid / project | ✅ | own only |
| Upload timesheet | ✅ | own projects only |

### 3.3 Ownership and Sharing

- The creator of a cost grid or project is its **exclusive owner** by default.
- Owner or admin can share with specific users by selecting from a searchable dropdown of active, non-admin platform members (`GET /api/users/active-list`). Free-text email entry is not supported.
- Sharing triggers an email notification with a direct link.
- Sharing permissions: `owner` | `editor` | `viewer`. Permission on an existing share can be changed at any time via the same modal (uses `ON CONFLICT DO UPDATE`).
- The calling user's own permission level (`my_permission`) is returned on `GET /api/cost-grids` and `GET /api/projects` responses so the frontend can conditionally show/hide editing controls without an extra round-trip.
- **Viewer enforcement** (UI-only; backend always enforces via `resource_shares.permission`): editors/viewers see different UI surfaces — viewers have Edit, Clone, Delete, Configure, Load Actuals, and Reforecast controls hidden; project-config.html enters a read-only banner mode.
- Disabling a user does **not** delete their resources. Ownership remains and can be reassigned by an admin.

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
  role              VARCHAR NOT NULL CHECK (role IN ('admin','user')),
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
-- Seeded rows: 'terms_version' (integer string), 'terms_content' (HTML)
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
  currency      CHAR(3) DEFAULT 'EUR',
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
  task_names_direct    JSONB NOT NULL DEFAULT '[]'::jsonb,  -- migration 017: task names assigned via "Add to project"
  PRIMARY KEY (cost_grid_version_id, project_id)
)
```

### 5.4 Projects

```sql
projects (
  id            UUID PRIMARY KEY,
  name          VARCHAR NOT NULL,
  program_id    VARCHAR REFERENCES programs(id),
  client_id     UUID REFERENCES clients(id),
  start_date    CHAR(6),            -- YYYYMM
  end_date      CHAR(6),            -- YYYYMM
  currency      CHAR(3) DEFAULT 'EUR',
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
  start_date           CHAR(6),
  end_date             CHAR(6),
  monthly_distribution JSONB,       -- { "YYYYMM": percent }
  resources            JSONB,       -- [{ role, soldHours, hourlyRate }]
  sort_order           INTEGER DEFAULT 0
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
  "projectName": "Name"
}
```

---

## 6. API Reference

### Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /api/auth/login | — | Login email + password |
| POST | /api/auth/logout | ✅ | Clear JWT cookie |
| GET | /api/auth/me | ✅ | Current user profile |
| POST | /api/auth/invite | admin | Invite new user |
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
| PATCH | /api/users/:id | admin | Update role or status |
| DELETE | /api/users/:id | admin | Disable user (soft delete) |
| POST | /api/users/:id/anonymize | admin | Permanently replace personal data with anonymous values (name → "[Deleted] User", email → `anon_<uuid>@deleted.local`); clears password hash and tokens; preserves operational records |

### Configuration

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET/POST | /api/clients | admin | List / create |
| PATCH/DELETE | /api/clients/:id | admin | Update / delete |
| GET/POST | /api/programs | admin | List / create |
| PATCH/DELETE | /api/programs/:id | admin | Update / delete |
| GET/POST | /api/roles | admin | List / create — `GET` returns `rate_overrides` JSONB field |
| PATCH/DELETE | /api/roles/:id | admin | Update / delete — `PATCH` accepts `rateOverrides` body field (saved to `rate_overrides` column) |
| GET | /api/ratecards | ✅ | List (all authenticated users) |
| POST | /api/ratecards | admin | Create |
| GET | /api/ratecards/:id | ✅ | Detail (all authenticated users) |
| POST | /api/ratecards/clone | admin | Clone global → per client |
| PATCH | /api/ratecards/:id/entries | admin | Bulk update entries |
| DELETE | /api/ratecards/:id | admin | Delete |

**Ratecard integration in the cost grid editor**

- Client-specific rates are set via the **💲 Costgrid** button on each client row in `config.html` → Clients tab. The modal lists all roles; custom rates override the agency default for that client.
- The cost grid version form has a **Rate card** dropdown. When a ratecard is selected, `costgrid.js` populates `_cgActiveRatecardMap` (roleId → rate) via `cgUpdateActiveRatecardMap()` (backed by the `loadRatecardsForDropdown()` cache in `ratecards.js`).
- Rate cells in the grid use this map as the **baseline**: a cell is only marked yellow (`✎ custom`) when the user manually enters a value that differs from the ratecard rate. Clearing the cell restores the ratecard rate (not the bare agency default).
- The **👥 Add role** modal applies the same map: roles with a custom ratecard entry are highlighted with an indigo badge (`✦ rate €/h`) and a light purple row background. The rate stored in `_cgDraft.roles` on add is the ratecard rate, so no false positive "custom" flag on first render.
- `_cgActiveRatecardMap` is refreshed on: version open → `cgPopulateRatecardDropdown()`, ratecard dropdown change, and "Add role" modal open.

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
| GET/POST/DELETE | /api/cost-grids/:id/shares | owner/admin | Manage sharing |

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
| GET/POST/DELETE | /api/projects/:id/shares | owner/admin | Manage sharing |

### Timesheet + Reporting

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/timesheets | ✅ | List uploaded timesheets (summary) |
| GET | /api/timesheets/all-data | ✅ | All timesheet rows merged (for dashboard seed) |
| POST | /api/timesheets/upload | ✅ | Upload XLS file; rejects the entire file (400, no partial writes) if any row's date cannot be resolved to a valid calendar date |
| DELETE | /api/timesheets/:projectCode | owner/admin | Remove timesheet data |
| GET | /api/reporting/portfolio | ✅ | Portfolio budget overview |
| GET | /api/reporting/projects/:id | ✅ | Single project reporting |
| GET | /api/reporting/planning | ✅ | Resource planning aggregates |
| GET | /api/reporting/pipeline | ✅ | Pipeline kanban data |

### Exports (CSV via email)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /api/exports/portfolio | ✅ | CSV of all accessible projects → emailed as attachment |
| POST | /api/exports/cost-grids | ✅ | Pivoted CSV of all accessible cost grids (one row per task, role-code columns) → emailed |
| POST | /api/exports/ratecards | admin | Pivoted CSV of all ratecards (roles × clients) → emailed |

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

### App Settings

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/app-settings/terms | ✅ | Returns `{ version, content, updatedAt, updatedBy }` — used by `terms.html` and admin editor |
| PUT | /api/app-settings/terms | admin | Save T&C content; `publishNewVersion: true` increments `terms_version` (forces all users to re-accept) |

### Admin — Bulk Reset

Scopes: `proposals`, `projects`, `clients`, `ratecards`, `actuals`, `pipelines`, `notifications`. Each runs inside a DB transaction.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/admin/reset/scopes | admin | List all available scopes with human-readable labels |
| POST | /api/admin/reset/:scope | admin | Delete all data for the given scope; returns `{ ok, scope, deleted }` |
| POST | /api/admin/reset/cost-grid/:cgId | admin | Delete one cost grid + all its versions + linked projects (transactional); 404 on unknown cgId |
| PATCH | /api/admin/reset/cost-grid/:cgId/owner | admin | Reassign cost grid `owner_id` to an active user; body: `{ ownerId }`; 400 if `ownerId` missing; 404 if cgId or userId unknown |

---

## 7. Docker Compose

```yaml
version: '3.9'

services:

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-pdash}
      POSTGRES_USER: ${POSTGRES_USER:-pdash}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  api:
    build: ./api
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

  nginx:
    image: nginx:alpine
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

### Directory structure

```
burndown/
  api/                    ← Node.js + Express backend
    src/
      routes/             ← auth, users, config, cost-grids, projects, timesheets, reporting, exports, notifications, reset
      lib/                ← pure functions extracted for unit testing (node:test, run via `npm test`/`node --test`),
                            mirroring the frontend's js/lib/ convention; date-parse.js — parseFlexibleDate(a, b, year):
                            disambiguates day/month order (unambiguous when one value is >12; falls back to the
                            source's known MM/DD convention only when genuinely ambiguous), validates the result
                            against real calendar/leap-year arithmetic, throws on an invalid date
      middleware/         ← auth guard (requireAuth, requireAdmin)
      db/                 ← PostgreSQL pool client, migrations/
      services/           ← email (nodemailer), jwt
      create-admin.js     ← CLI bootstrap: create/reset admin user
    Dockerfile
    package.json
  css/
    tokens.css            ← design tokens (single source of truth)
    style.css
  js/
    api.js                ← Api.* namespace, apiFetch wrapper
    api-sync.js           ← in-memory ↔ API sync helpers (config.projects, timesheetData; `_cgStore` itself lives in costgrid.js — this file's `cgSyncFromApi` populates it); `_pushProjectToApi` maps currency symbol → ISO code (`'€'→'EUR'`, `'$'→'USD'`, `'£'→'GBP'`) before PATCH to satisfy `currencies` FK; `_apiProjectToLocal` maps ISO code → symbol for the form select; `costGridRef.cgId` is read directly from `GET /api/projects`'s server-resolved `cg_id` (a JOIN to `cost_grid_versions`), not from `_cgStore` — fixed 2026-07 after `_resolveCgIdForVersion()`/`_cgStore` (only declared in costgrid.js) threw on pages that don't load that script (`portfolio.html`, `project-config.html`), silently emptying `config.projects` there
    core.js               ← state, in-memory helpers (loadConfig/persistConfig no-ops), shared helpers; `statusBadge()` small style for pipeline cards; `statusBadgeLarge()` same as `pipelineBadge` style — used only in linked-project chips
    nav.js                ← navbar injection, initNav(); injects settings, change-pwd, and "My Profile" modals; T&C gate (redirects to /terms.html if user.terms_version < current_terms_version); calls initNotifications()
    shares.js             ← generic share modal
    notifications.js      ← SSE client, bell badge, notification dropdown panel
    costgrid.js           ← cost grid editor; non-EUR role rate fallback chain: ratecard override → `role.rateOverrides[currency]` → EUR rate × currency factor; both `cgSyncRoleRatesToBaseline` and `cgPreviewRateChange` use this chain; `effectiveRate` in role select modal also updated; linked-project chips use `statusBadgeLarge()` for project status badges; `_cgCompactHeader` (localStorage `PDash_cgCompactHeader`) toggles compact/normal header mode via ⊟/⊞ button in the "Phase / Task" sticky cell — compact hides role move/change/dup/remove buttons and reduces header font to 10px; **task assignment (R1–R5)**: `cgGetAssignedTaskIds()` + `cgGetAssignedTaskNames()` perform dual UUID+name check — assigned tasks show no ✕ button; `cgDoAddTasksToProject` and `cgDoGenerateProject` send `taskNames` alongside `taskIds`; Generate Project button hidden when all tasks are already mapped; `_cgEnsureAddToProjectModal()` creates a singleton modal appended to `document.body` (z-index:10500, created once and reused)
    portfolio.js          ← portfolio dashboard
    dashboard.js          ← per-project KPI/burndown
    config-form.js        ← project config form; hours parsing/formatting/rounding delegated to js/lib/cfg-parse.js
    lib/                  ← pure functions extracted for unit testing (vitest + jsdom), each an ES module
                            (`export function ...`) with a `window.<name> = <name>` bridge for classic-script
                            callers; cfg-parse.js — cfgParseHours, cfgFmtHours, roundToQuarterHour (moved from
                            config-form.js), distributeHoursExact(total, rawValues, grid=0.25) — largest-remainder
                            rounding, guarantees the returned values sum to exactly roundToQuarterHour(total);
                            used by cfgDerivePhasing/cfgReforecast so the confirmation modal's total always
                            matches the saved grid (fixes prior modal-vs-save divergence and per-month rounding
                            drift); pipeline-calc.js — pbGetVersionBudget/pbComputeColumnTotals (take
                            cgComputeGrandTotals/getPipelineBudget as parameters, DI-style, matching
                            portfolio-calc.js's precedent), pbFmtMoney/pbFmtDate/pbFmtTaskDate/
                            pbComputePotPercentages; extracted from the former js/pipeline-board.js
    roles.js              ← roles management modal; `loadRolesFromApi` maps `rateOverrides: r.rate_overrides || {}` on each role — role shape: `{ id, label, code, rate, rateOverrides }`
    ratecards.js          ← rate cards admin modal; exports loadRatecardsForDropdown() (cached) used by costgrid.js; `_rcRenderEntries` pre-populates non-EUR column placeholders with agency default from `_rcRoles[rid].rate_overrides[currency]`; `_rcSaveEntries` collects per-role `rateOverrides` and sends them to the API
    upload.js             ← XLS parsing
    settings.js           ← settings modal logic (openSettingsModal, stgExport, downloadFullBackup)
    ai.js                 ← AI sidebar
    clients.js / programs.js
  index.html              ← redirect → pipeline.html
  pipeline.html           ← kanban pipeline board, Vue 3 (CDN, no build step, same pattern as portfolio.html/
                            project-config.html); folds in the former js/pipeline-board.js (760 lines, now
                            deleted — confirmed exclusive to this page); adds js/lib/pipeline-calc.js;
                            js/costgrid.js/js/core.js and the 4 shared static modals stay unmodified Vanilla,
                            called as globals (costgrid.html/planning.html still depend on them as-is)
  portfolio.html          ← portfolio overview + per-project dashboard, Vue 3 (CDN, no build step, same pattern as project-config.html); folds in the former js/portfolio.js + js/dashboard.js; adds js/lib/portfolio-calc.js (KPI/burndown math extraction, vitest-covered); no longer loads js/roles.js or js/config-form.js (the latter only served this page's own now-removed, previously-unreachable #configModal + nested CRUD modals)
  planning.html
  costgrid.html
  timesheets.html
  config.html             ← admin config (clients, programs, roles, pipelines & POTs); Role edit form shows per-currency rate fields populated from `rateOverrides`; "Proposal Phasing" view (was "Phasing") excludes Canceled/Draft stages; monthly cells show local amount + EUR equivalent for non-EUR proposals; `phasingTableHtml` adds Total column and removes collapsible detail; `openClientRatecard` fixed filter and shows agency default per-currency placeholder
  project-config.html     ← full-page project config form, Vue 3 (CDN, no build step, same pattern as admin.html); manages a single reactive project object (not an array — the original's hidden multi-project dropdown/New/Delete machinery was confirmed dead on this page); unknown ?projectId= shows an explicit not-found state
  admin.html              ← user management; "🗑 Anonymize" button on disabled non-anonymized users; T&C editor (admin: view version, edit HTML, save draft / publish new version)
  terms.html              ← standalone T&C acceptance page (no initNav), Vue 3 (CDN, no build step, same pattern as login.html); shown by gate in initNav() when user.terms_version < current; loaded from /api/app-settings/terms; POST /api/auth/accept-terms on confirm
  login.html / activate.html / reset-password.html
  _db-reset.html          ← admin-only hidden page for bulk DB data deletion by scope, Vue 3 (CDN, no build step, same pattern as admin.html), now with navbar (initNav(null, ...), no nav-tab entry)
  nginx.conf              ← denies dev-only toolchain artifacts (node_modules/, package.json, package-lock.json,
                            vitest.config.js, *.test.js, *.spec.js) even though it bind-mounts the repo root
  docker-compose.yml
  .env.example
  .gitattributes          ← pins *.sh to LF line endings on checkout regardless of local core.autocrlf
  package.json            ← dev-only vitest + jsdom test toolchain for js/lib/ (never bundled, never served)
  vitest.config.js
  scripts/
    test-branch.sh        ← isolated Docker Compose stack (`up`/`down`/`status`) for testing the current feature
                             branch before merge; distinct container names/ports from the main stack (safe to run
                             alongside it); `status` reports "up"/"down" by querying Docker directly (no persisted
                             state) — consumed by `/finish-cycle`'s Gate 2 to detect a branch environment already
                             running from an earlier attempt and offer reuse-vs-rebuild instead of asking to spin
                             up again; clones data from the running main stack via pg_dump/pg_restore when
                             available, else applies all migrations to a fresh DB + bootstraps a test admin;
                             reads `.env` via a manual line-by-line parser mirroring create-admin.js's approach
                             (never source/eval — real `.env` values here contain shell-special characters like
                             `$$`, which naive sourcing would corrupt)
```

---

## 8. Migration Strategy

**Status: Complete.** The localStorage → API migration has been completed. **localStorage is no longer used for server data.**

The `migration.html` tool was used for the one-time migration of existing localStorage data into the PostgreSQL database. It has been removed from the repo (`docs/superpowers/plans/2026-07-14-vue-migration-roadmap.md`) — the migration itself is long complete and the tool was already unreachable from the UI before this removal.

New users start fresh: an admin creates an account via the invite flow, then uses the app directly against the API.

**Current localStorage usage** (only genuinely client-side keys remain):
- `PDash_settings` — AI provider API keys (Anthropic/OpenAI/Gemini), stored per-device
- `PDash_summary` — portfolio summary project selection (UI preference)
- `reforecast_snapshot_<projectId>` — no longer written; `project-config.html`'s Vue 3 rewrite confirmed the rollback/snapshot feature was already unreachable on that page (no rollback button existed in its markup) and did not port it. The mechanism still exists in `js/config-form.js` (unchanged); `portfolio.html`'s own copy of that config modal was confirmed unreachable dead code and dropped entirely in its own Vue migration, but `js/config-form.js` remains loaded by `planning.html` — whether it's actually reachable there was not investigated and remains an open question.

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
- `013_role_rate_overrides.sql` — adds `rate_overrides JSONB NOT NULL DEFAULT '{}'` to `roles` table for per-currency agency default rates
- `014_terms_accepted.sql` — adds `terms_version INTEGER` and `terms_accepted_at TIMESTAMPTZ` to `users` for T&C acceptance tracking
- `015_app_settings.sql` — creates `app_settings` key/value table; seeds `terms_version` (1) and `terms_content` (default HTML notice)
- `017_task_names_direct.sql` — adds `task_names_direct JSONB NOT NULL DEFAULT '[]'::jsonb` to `cg_version_projects`; backfills from `project_tasks` name matching

---

## 9. Security Notes

- JWT stored in **httpOnly cookie** — not accessible from JavaScript (XSS protection)
- Password reset and invite endpoints always return 200 — never reveal if an email exists
- All tokens (invite, reset) are **single-use** and time-limited
- Locked cost grid versions are enforced at API level, not just UI
- Soft-delete only — no data is permanently deleted from the database
- **GDPR compliance** (internal tool): T&C acceptance gated at login (versioned; re-acceptance forced on publish); profile self-rectification via "My Profile" modal (`PATCH /api/auth/profile`); admin anonymization (`POST /api/users/:id/anonymize`) replaces all personal data while preserving operational records
- All user-facing errors use generic messages for auth failures
