# PDash — Architecture Document

**Version:** 1.0
**Date:** 2026-06-09
**Status:** Approved

---

## 1. Overview

PDash evolves from a single-user localStorage SPA into a multi-user web application with authentication, role-based access control, a REST API backend, and a PostgreSQL database.

The frontend remains Vanilla JS in the short term. New pages (login, account activation, password recovery) are built in **Vue 3** (CDN, no build step). Existing PDash views migrate to Vue incrementally.

---

## 2. Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend (new pages) | Vue 3 (CDN) | Component model for auth/profile pages; low migration cost |
| Frontend (existing views) | Vanilla JS → Vue 3 (incremental) | No big-bang rewrite |
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
| Create / edit ratecards | ✅ | ❌ |
| View all cost grids | ✅ | own + shared |
| View all projects | ✅ | own + shared |
| View all planning | ✅ | own + shared |
| Share cost grid / project | ✅ | own only |
| Upload timesheet | ✅ | own projects only |

### 3.3 Ownership and Sharing

- The creator of a cost grid or project is its **exclusive owner** by default.
- Owner or admin can share with specific users by selecting from the registered user list.
- Sharing triggers an email notification with a direct link.
- Sharing permissions: `owner` | `editor` | `viewer`.
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

---

## 5. Database Schema

### 5.1 Auth

```sql
users (
  id               UUID PRIMARY KEY,
  email            VARCHAR UNIQUE NOT NULL,
  first_name       VARCHAR NOT NULL,
  last_name        VARCHAR NOT NULL,
  role             VARCHAR NOT NULL CHECK (role IN ('admin','user')),
  status           VARCHAR NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','active','disabled')),
  password_hash    VARCHAR,
  invite_token     VARCHAR,
  invite_expires   TIMESTAMPTZ,
  reset_token      VARCHAR,
  reset_expires    TIMESTAMPTZ,
  invited_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
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
  id          UUID PRIMARY KEY,
  label       VARCHAR NOT NULL,
  code        VARCHAR NOT NULL UNIQUE,
  team        VARCHAR,
  hourly_rate DECIMAL(10,2),
  created_at  TIMESTAMPTZ DEFAULT NOW()
)

ratecards (
  id         UUID PRIMARY KEY,
  client_id  UUID REFERENCES clients(id),  -- NULL = global default
  name       VARCHAR NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

ratecard_entries (
  id          UUID PRIMARY KEY,
  ratecard_id UUID NOT NULL REFERENCES ratecards(id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES roles(id),
  hourly_rate DECIMAL(10,2) NOT NULL,
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
  id           UUID PRIMARY KEY,
  cost_grid_id UUID NOT NULL REFERENCES cost_grids(id) ON DELETE CASCADE,
  label        VARCHAR NOT NULL,
  pipeline     VARCHAR CHECK (pipeline IN
               ('SIP','Expected','Anticipated','Committed','Canceled')),
  start_date   DATE,
  end_date     DATE,
  currency     CHAR(3) DEFAULT 'EUR',
  note         TEXT,
  locked       BOOLEAN DEFAULT FALSE,
  ratecard_id  UUID REFERENCES ratecards(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
)

phases (
  id         UUID PRIMARY KEY,
  version_id UUID NOT NULL REFERENCES cost_grid_versions(id) ON DELETE CASCADE,
  title      VARCHAR NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
)

tasks (
  id         UUID PRIMARY KEY,
  phase_id   UUID NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  title      VARCHAR NOT NULL,
  ptc        DECIMAL(10,2) DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
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

### 5.5 Sharing

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

### 5.6 Timesheets

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

### Users

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/users | admin | List all users |
| GET | /api/users/:id | admin | Get user detail |
| PATCH | /api/users/:id | admin | Update role or status |
| DELETE | /api/users/:id | admin | Disable user (soft delete) |

### Configuration

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET/POST | /api/clients | admin | List / create |
| PATCH/DELETE | /api/clients/:id | admin | Update / delete |
| GET/POST | /api/programs | admin | List / create |
| PATCH/DELETE | /api/programs/:id | admin | Update / delete |
| GET/POST | /api/roles | admin | List / create |
| PATCH/DELETE | /api/roles/:id | admin | Update / delete |
| GET/POST | /api/ratecards | admin | List / create |
| GET | /api/ratecards/:id | admin | Detail |
| POST | /api/ratecards/clone | admin | Clone global → per client |
| PATCH | /api/ratecards/:id/entries | admin | Bulk update entries |
| DELETE | /api/ratecards/:id | admin | Delete |

### Cost Grid

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET/POST | /api/cost-grids | ✅ | List / create |
| PATCH/DELETE | /api/cost-grids/:id | owner/admin | Update / delete |
| GET/POST | /api/cost-grids/:id/versions | ✅ | List / create version |
| PATCH/DELETE | /api/cost-grids/:id/versions/:vId | owner/admin | Update / delete version |
| POST | /api/cost-grids/:id/versions/:vId/duplicate | owner/admin | Duplicate version |
| GET/PUT | /api/cost-grids/:id/versions/:vId/structure | owner/admin | Get / save bulk structure |
| GET/POST/DELETE | /api/cost-grids/:id/versions/:vId/linked-projects | owner/admin | Manage linked projects |
| GET/POST/DELETE | /api/cost-grids/:id/shares | owner/admin | Manage sharing |

### Projects

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET/POST | /api/projects | ✅ | List / create |
| PATCH/DELETE | /api/projects/:id | owner/admin | Update / delete |
| GET/PUT | /api/projects/:id/tasks | owner/admin | Get / save bulk tasks |
| PATCH | /api/projects/:id/phasing | owner/admin | Update phasing |
| PATCH | /api/projects/:id/ptc | owner/admin | Update PTC |
| GET/POST/DELETE | /api/projects/:id/shares | owner/admin | Manage sharing |

### Timesheet + Reporting

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/timesheets | ✅ | List uploaded timesheets |
| POST | /api/timesheets/upload | ✅ | Upload XLS file |
| DELETE | /api/timesheets/:projectCode | owner/admin | Remove timesheet data |
| GET | /api/reporting/portfolio | ✅ | Portfolio budget overview |
| GET | /api/reporting/projects/:id | ✅ | Single project reporting |
| GET | /api/reporting/planning | ✅ | Resource planning aggregates |
| GET | /api/reporting/pipeline | ✅ | Pipeline kanban data |

---

## 7. Docker Compose

```yaml
version: '3.9'

services:

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: pdash
      POSTGRES_USER: pdash
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  api:
    build: ./api
    environment:
      DATABASE_URL: postgres://pdash:${DB_PASSWORD}@db:5432/pdash
      JWT_SECRET: ${JWT_SECRET}
      SMTP_HOST: ${SMTP_HOST}
      SMTP_PORT: ${SMTP_PORT}
      SMTP_USER: ${SMTP_USER}
      SMTP_PASS: ${SMTP_PASS}
      APP_URL: ${APP_URL}
    ports:
      - "3000:3000"
    depends_on:
      - db

  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./:/usr/share/nginx/html
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
      routes/             ← auth, users, clients, cost-grids, projects, ...
      middleware/         ← auth guard, role check, ownership check
      db/                 ← PostgreSQL client, migrations
      services/           ← email, jwt, ratecard clone, ...
    Dockerfile
    package.json
  css/
  js/
  index.html
  nginx.conf
  docker-compose.yml
  .env.example
```

---

## 8. Migration Strategy

The current app stores all data in localStorage under `PDash_*` keys. Migration happens in two phases:

### Phase 1 — Backend + Auth (parallel run)

- Build backend API and DB schema
- Add login page and JWT auth layer
- Existing PDash views continue reading from localStorage
- New admin pages (users, ratecards) read from API

### Phase 2 — Frontend migration (view by view)

Replace localStorage reads/writes with API calls, one view at a time:

1. Config (clients, programs, roles) → `/api/clients`, `/api/programs`, `/api/roles`
2. Cost Grid editor → `/api/cost-grids`
3. Pipeline Board → `/api/reporting/pipeline`
4. Resource Planning → `/api/reporting/planning`
5. Project Reporting → `/api/reporting/portfolio`
6. Timesheet upload → `/api/timesheets/upload`

Each view can be migrated independently. localStorage data can be exported via the existing backup function and imported into the DB via a one-time migration script.

---

## 9. Security Notes

- JWT stored in **httpOnly cookie** — not accessible from JavaScript (XSS protection)
- Password reset and invite endpoints always return 200 — never reveal if an email exists
- All tokens (invite, reset) are **single-use** and time-limited
- Locked cost grid versions are enforced at API level, not just UI
- Soft-delete only — no data is permanently deleted from the database
- All user-facing errors use generic messages for auth failures
