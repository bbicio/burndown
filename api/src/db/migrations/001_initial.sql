-- PDash initial schema migration

-- ── EXTENSIONS ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── USERS ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email            VARCHAR(255) UNIQUE NOT NULL,
  first_name       VARCHAR(100) NOT NULL,
  last_name        VARCHAR(100) NOT NULL,
  role             VARCHAR(20)  NOT NULL DEFAULT 'user'
                   CHECK (role IN ('admin', 'user')),
  status           VARCHAR(20)  NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'active', 'disabled')),
  password_hash    VARCHAR(255),
  invite_token     VARCHAR(255),
  invite_expires   TIMESTAMPTZ,
  reset_token      VARCHAR(255),
  reset_expires    TIMESTAMPTZ,
  invited_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── CLIENTS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PROGRAMS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS programs (
  id         VARCHAR(100) PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── ROLES ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label       VARCHAR(255) NOT NULL,
  code        VARCHAR(100) NOT NULL UNIQUE,
  team        VARCHAR(100),
  hourly_rate DECIMAL(10,2),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── RATECARDS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ratecards (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id  UUID REFERENCES clients(id) ON DELETE SET NULL,
  name       VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ratecard_entries (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ratecard_id UUID NOT NULL REFERENCES ratecards(id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  hourly_rate DECIMAL(10,2) NOT NULL,
  UNIQUE (ratecard_id, role_id)
);

-- ── COST GRIDS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cost_grids (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       VARCHAR(255) NOT NULL,
  owner_id   UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cost_grid_versions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cost_grid_id UUID NOT NULL REFERENCES cost_grids(id) ON DELETE CASCADE,
  label        VARCHAR(255) NOT NULL,
  pipeline     VARCHAR(50) CHECK (pipeline IN
               ('SIP','Expected','Anticipated','Committed','Canceled')),
  start_date   DATE,
  end_date     DATE,
  currency     CHAR(3) NOT NULL DEFAULT 'EUR',
  note         TEXT,
  locked       BOOLEAN NOT NULL DEFAULT FALSE,
  ratecard_id  UUID REFERENCES ratecards(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS phases (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version_id UUID NOT NULL REFERENCES cost_grid_versions(id) ON DELETE CASCADE,
  title      VARCHAR(255) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phase_id   UUID NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  title      VARCHAR(255) NOT NULL,
  ptc        DECIMAL(10,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS task_roles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id       UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  role_id       UUID NOT NULL REFERENCES roles(id),
  days          DECIMAL(6,2),
  rate_override DECIMAL(10,2),
  months        JSONB
);

-- ── PROJECTS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255) NOT NULL,
  program_id    VARCHAR(100) REFERENCES programs(id) ON DELETE SET NULL,
  client_id     UUID REFERENCES clients(id) ON DELETE SET NULL,
  start_date    CHAR(6),
  end_date      CHAR(6),
  currency      CHAR(3) NOT NULL DEFAULT 'EUR',
  pipeline      VARCHAR(50),
  status        VARCHAR(50),
  owner_id      UUID NOT NULL REFERENCES users(id),
  cg_version_id UUID REFERENCES cost_grid_versions(id) ON DELETE SET NULL,
  phasing       JSONB,
  ptc           JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_tasks (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id           UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name                 VARCHAR(255) NOT NULL,
  billable             BOOLEAN NOT NULL DEFAULT TRUE,
  completed            BOOLEAN NOT NULL DEFAULT FALSE,
  start_date           CHAR(6),
  end_date             CHAR(6),
  monthly_distribution JSONB,
  resources            JSONB,
  sort_order           INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cg_version_projects (
  cost_grid_version_id UUID NOT NULL REFERENCES cost_grid_versions(id) ON DELETE CASCADE,
  project_id           UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_name         VARCHAR(255),
  PRIMARY KEY (cost_grid_version_id, project_id)
);

-- ── SHARING ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resource_shares (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource_type VARCHAR(20) NOT NULL CHECK (resource_type IN ('cost_grid', 'project')),
  resource_id   UUID NOT NULL,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission    VARCHAR(20) NOT NULL CHECK (permission IN ('owner', 'editor', 'viewer')),
  shared_by     UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (resource_type, resource_id, user_id)
);

-- ── TIMESHEETS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timesheets (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_code VARCHAR(100) NOT NULL,
  data         JSONB NOT NULL,
  uploaded_by  UUID REFERENCES users(id),
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── INDEXES ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cost_grids_owner      ON cost_grids(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner        ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_resource_shares_res   ON resource_shares(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_resource_shares_user  ON resource_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_code       ON timesheets(project_code);
CREATE INDEX IF NOT EXISTS idx_cgv_cost_grid         ON cost_grid_versions(cost_grid_id);
CREATE INDEX IF NOT EXISTS idx_phases_version        ON phases(version_id);
CREATE INDEX IF NOT EXISTS idx_tasks_phase           ON tasks(phase_id);
