-- Cycle 3a: project tags are now autonomous from the linked proposal. Seed
-- project_tags once for projects that are already linked to a proposal version
-- and have no tags of their own yet. Idempotent (re-running only fills projects
-- that still have none). Apply once at deploy: a project whose tags were
-- deliberately cleared afterwards would be re-seeded by a second run.
INSERT INTO project_tags (project_id, item_id)
SELECT p.id, cvt.item_id
FROM projects p
JOIN cost_grid_version_tags cvt ON cvt.version_id = p.cg_version_id
WHERE p.cg_version_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM project_tags pt WHERE pt.project_id = p.id)
ON CONFLICT DO NOTHING;
