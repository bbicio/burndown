-- Cycle 3c: profile engine (per-project contributions, project queue/state, run history, cached profile).
CREATE TABLE IF NOT EXISTS resource_project_contributions (
  resource_id  UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  project_code VARCHAR(100) NOT NULL,
  data         JSONB NOT NULL,
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (resource_id, project_code)
);
CREATE INDEX IF NOT EXISTS idx_rpc_project_code ON resource_project_contributions(project_code);

-- One row per project code that has (or had) actuals. In queue = queued_at IS NOT NULL.
CREATE TABLE IF NOT EXISTS profile_project_state (
  project_code      VARCHAR(100) PRIMARY KEY,
  queued_at         TIMESTAMPTZ,
  last_processed_at TIMESTAMPTZ,
  last_error        TEXT,
  last_rows         INTEGER,
  last_resources    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_pps_queued ON profile_project_state(queued_at) WHERE queued_at IS NOT NULL;

-- History of worker/manual runs, pruned to the latest 50 by the engine.
CREATE TABLE IF NOT EXISTS profile_job_runs (
  id           BIGSERIAL PRIMARY KEY,
  started_at   TIMESTAMPTZ NOT NULL,
  finished_at  TIMESTAMPTZ,
  trigger_type VARCHAR(20) NOT NULL CHECK (trigger_type IN ('scheduled', 'manual', 'bootstrap')),
  projects     INTEGER NOT NULL DEFAULT 0,
  resources    INTEGER NOT NULL DEFAULT 0,
  error        TEXT
);

ALTER TABLE resources ADD COLUMN IF NOT EXISTS profile JSONB;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS profile_computed_at TIMESTAMPTZ;

-- Worker settings (edited from the job console in 3d; the worker re-reads them on every tick).
INSERT INTO app_settings (key, value) VALUES
  ('profile_job_interval_min', '10'),
  ('profile_job_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
