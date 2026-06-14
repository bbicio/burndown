-- Migration 008: add client_id to cost_grid_versions
-- Stores the client directly on the version so it persists independently
-- of whether the version is linked to a project.

ALTER TABLE cost_grid_versions
  ADD COLUMN client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
