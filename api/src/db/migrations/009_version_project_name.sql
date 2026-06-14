-- Migration 009: add project_name to cost_grid_versions
-- Stores a display name for the proposal/version independently of the cost grid name.
-- Shown on pipeline cards and used as default when generating a linked project.

ALTER TABLE cost_grid_versions
  ADD COLUMN project_name VARCHAR(255) NOT NULL DEFAULT '';
