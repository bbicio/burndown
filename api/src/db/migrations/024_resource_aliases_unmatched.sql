-- Cycle 3b: link free-text owner names in uploaded actuals to resources.
CREATE TABLE IF NOT EXISTS resource_aliases (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_normalized TEXT NOT NULL UNIQUE,   -- lowercased, accent-stripped, tokens sorted: the match key
  display_name     TEXT NOT NULL,          -- the name as the admin saw/typed it, for the UI
  resource_id      UUID REFERENCES resources(id) ON DELETE CASCADE,  -- NULL = ignored name (not a person)
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID REFERENCES users(id) ON DELETE SET NULL,     -- last (re)assignment
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Owner names that could not be matched (or matched ambiguously), per project code.
-- Keyed by project_code, not project id: timesheets are keyed by project_code and
-- projects.code is not unique. Rebuilt by api/src/services/resource-matching.js.
CREATE TABLE IF NOT EXISTS profile_unmatched (
  project_code           VARCHAR(100) NOT NULL,
  name_normalized        TEXT NOT NULL,
  display_name           TEXT NOT NULL,
  hours                  NUMERIC NOT NULL DEFAULT 0,
  candidate_resource_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (project_code, name_normalized)
);

CREATE INDEX IF NOT EXISTS idx_profile_unmatched_name ON profile_unmatched(name_normalized);
