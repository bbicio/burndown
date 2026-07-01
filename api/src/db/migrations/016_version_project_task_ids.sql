-- Migration 016: add task_ids to cg_version_projects
-- Tracks which cost grid tasks are mapped to each linked project,
-- enabling the "Generate Project" button to correctly detect free tasks across sessions.

ALTER TABLE cg_version_projects
  ADD COLUMN IF NOT EXISTS task_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
