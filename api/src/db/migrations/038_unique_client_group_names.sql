-- Client and client-group names are unique without regard to case. Pre-existing duplicates (possible
-- before this migration, since only the route checked for clients and nothing for groups) are renamed
-- first so the unique indexes below never fail to create: the oldest row per lower(name) keeps its
-- name, later duplicates are suffixed — admins can rename them via the existing UI.
-- Safe to re-run: with the indexes in place no duplicate is left to rename.
BEGIN;

WITH duplicates AS (
  SELECT id, name,
         ROW_NUMBER() OVER (PARTITION BY lower(name) ORDER BY created_at, id) AS rn
  FROM clients
)
UPDATE clients c
SET name = left(c.name, 255 - length(' (duplicate ' || duplicates.rn || ')')) || ' (duplicate ' || duplicates.rn || ')'
FROM duplicates
WHERE c.id = duplicates.id AND duplicates.rn > 1;

WITH duplicates AS (
  SELECT id, name,
         ROW_NUMBER() OVER (PARTITION BY lower(name) ORDER BY created_at, id) AS rn
  FROM client_groups
)
UPDATE client_groups g
SET name = left(g.name, 255 - length(' (duplicate ' || duplicates.rn || ')')) || ' (duplicate ' || duplicates.rn || ')'
FROM duplicates
WHERE g.id = duplicates.id AND duplicates.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_name_lower ON clients (lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_groups_name_lower ON client_groups (lower(name));
COMMIT;
