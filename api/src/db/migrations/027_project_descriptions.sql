-- Profile descriptions cycle: projects and project tasks carry a free-text description.
ALTER TABLE projects      ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';

-- One-shot backfill from the linked proposal (apply once at deploy, like 023): only fills EMPTY fields,
-- so a description typed later is never overwritten. Project description = the version note.
UPDATE projects p
SET description = v.note
FROM cost_grid_versions v
WHERE p.cg_version_id = v.id
  AND p.description = ''
  AND COALESCE(btrim(v.note), '') <> '';

-- Task descriptions: proposal task of the linked version whose normalised title equals the project
-- task's normalised name (trim, collapse spaces, lowercase — same key as the profile engine).
WITH src AS (
  SELECT DISTINCT ON (p.id, k.task_key)
         p.id AS project_id, k.task_key, t.description
  FROM projects p
  JOIN phases ph ON ph.version_id = p.cg_version_id
  JOIN tasks t   ON t.phase_id = ph.id
  CROSS JOIN LATERAL (SELECT lower(regexp_replace(btrim(t.title), '\s+', ' ', 'g')) AS task_key) k
  WHERE p.cg_version_id IS NOT NULL AND btrim(t.description) <> ''
  ORDER BY p.id, k.task_key, ph.sort_order, t.sort_order
)
UPDATE project_tasks pt
SET description = src.description
FROM src
WHERE pt.project_id = src.project_id
  AND lower(regexp_replace(btrim(pt.name), '\s+', ' ', 'g')) = src.task_key
  AND pt.description = '';
