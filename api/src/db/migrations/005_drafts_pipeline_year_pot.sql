-- ── Migration 005: Drafts, Pipeline Year, Client Groups, POT ─────────────────

-- ── 1. pipeline_year on cost_grid_versions ────────────────────────────────────
ALTER TABLE cost_grid_versions
  ADD COLUMN IF NOT EXISTS pipeline_year INTEGER;

-- ── 2. Add 'Draft' to the pipeline CHECK constraint ──────────────────────────
ALTER TABLE cost_grid_versions
  DROP CONSTRAINT IF EXISTS cost_grid_versions_pipeline_check;

ALTER TABLE cost_grid_versions
  ADD CONSTRAINT cost_grid_versions_pipeline_check
  CHECK (pipeline IN ('Draft','SIP','Expected','Anticipated','Committed','Canceled'));

-- ── 3. client_groups ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_groups (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. group_id on clients ────────────────────────────────────────────────────
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES client_groups(id) ON DELETE SET NULL;

-- ── 5. pots ───────────────────────────────────────────────────────────────────
-- One POT per target (either a client_group OR a standalone client) per year.
-- Exactly one of client_group_id / client_id must be set.
CREATE TABLE IF NOT EXISTS pots (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_group_id UUID REFERENCES client_groups(id) ON DELETE CASCADE,
  client_id       UUID REFERENCES clients(id) ON DELETE CASCADE,
  year            INTEGER NOT NULL,
  amount          NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pots_target_xor CHECK (
    (client_group_id IS NOT NULL AND client_id IS NULL) OR
    (client_group_id IS NULL     AND client_id IS NOT NULL)
  )
);

-- Prevent duplicate POTs for the same target + year
CREATE UNIQUE INDEX IF NOT EXISTS idx_pots_group_year
  ON pots(client_group_id, year)
  WHERE client_group_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pots_client_year
  ON pots(client_id, year)
  WHERE client_id IS NOT NULL;

-- ── 6. pot_history ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pot_history (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pot_id     UUID NOT NULL REFERENCES pots(id) ON DELETE CASCADE,
  old_value  NUMERIC(14,2),
  new_value  NUMERIC(14,2) NOT NULL,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 7. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cgv_pipeline_year  ON cost_grid_versions(pipeline_year);
CREATE INDEX IF NOT EXISTS idx_cgv_pipeline       ON cost_grid_versions(pipeline);
CREATE INDEX IF NOT EXISTS idx_clients_group      ON clients(group_id);
CREATE INDEX IF NOT EXISTS idx_pot_history_pot    ON pot_history(pot_id);
