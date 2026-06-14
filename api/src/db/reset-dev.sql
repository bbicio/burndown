-- ─────────────────────────────────────────────────────────────────────────────
-- PDash dev-reset script
-- Preserves : users WHERE email = 'bbicio@gmail.com'
--             roles  (all rows — default rate card)
-- Clears    : everything else
--
-- Usage:
--   docker exec -i pdash-db psql -U pdash -d pdash < api/src/db/reset-dev.sql
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. POT history & targets ──────────────────────────────────────────────────
DELETE FROM pot_history;
DELETE FROM pots;

-- ── 2. Notifications ──────────────────────────────────────────────────────────
DELETE FROM notifications;

-- ── 3. Timesheets ─────────────────────────────────────────────────────────────
DELETE FROM timesheets;

-- ── 4. Sharing ────────────────────────────────────────────────────────────────
DELETE FROM resource_shares;

-- ── 5. Project sub-tables ─────────────────────────────────────────────────────
DELETE FROM cg_version_projects;
DELETE FROM project_tasks;
DELETE FROM projects;

-- ── 6. Cost grid sub-tables ───────────────────────────────────────────────────
DELETE FROM task_roles;
DELETE FROM tasks;
DELETE FROM phases;
DELETE FROM cost_grid_versions;
DELETE FROM cost_grids;

-- ── 7. Rate cards ─────────────────────────────────────────────────────────────
DELETE FROM ratecard_entries;
DELETE FROM ratecards;

-- ── 8. Client groups (sets clients.group_id = NULL via FK) ───────────────────
DELETE FROM client_groups;

-- ── 9. Clients ────────────────────────────────────────────────────────────────
DELETE FROM clients;

-- ── 10. Programs ──────────────────────────────────────────────────────────────
DELETE FROM programs;

-- ── 11. Pipeline years ────────────────────────────────────────────────────────
DELETE FROM pipeline_years;

-- ── 12. Users — keep bbicio, drop everyone else ───────────────────────────────
DELETE FROM users WHERE email != 'bbicio@gmail.com';

-- ── roles: intentionally untouched ───────────────────────────────────────────

COMMIT;

-- ── Summary ───────────────────────────────────────────────────────────────────
SELECT 'users'          AS "table", count(*)::text AS remaining FROM users
UNION ALL
SELECT 'roles',                      count(*)::text FROM roles
UNION ALL
SELECT 'clients',                    count(*)::text FROM clients
UNION ALL
SELECT 'programs',                   count(*)::text FROM programs
UNION ALL
SELECT 'pipeline_years',             count(*)::text FROM pipeline_years
UNION ALL
SELECT 'cost_grids',                 count(*)::text FROM cost_grids
UNION ALL
SELECT 'projects',                   count(*)::text FROM projects
UNION ALL
SELECT 'pots',                       count(*)::text FROM pots
ORDER BY "table";
