-- Add monthly hour planning and functional role groups to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS planning JSONB,
  ADD COLUMN IF NOT EXISTS groups   JSONB;
