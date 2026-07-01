-- Migration 017: store task names directly in cg_version_projects
-- so assignment checks are robust against UUID changes from DELETE+INSERT on save.
ALTER TABLE cg_version_projects
  ADD COLUMN IF NOT EXISTS task_names_direct JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill from project_tasks name matching (same logic as the JS backfill)
UPDATE cg_version_projects cvp
SET task_names_direct = COALESCE((
  SELECT to_jsonb(json_agg(pt.name ORDER BY pt.name))
  FROM project_tasks pt
  JOIN tasks t ON lower(regexp_replace(trim(t.title), '\s+', ' ', 'g'))
               = lower(regexp_replace(trim(pt.name),  '\s+', ' ', 'g'))
  JOIN phases ph ON ph.id = t.phase_id
  WHERE ph.version_id = cvp.cost_grid_version_id
    AND pt.project_id = cvp.project_id
), '[]'::jsonb);
