-- Migration 007: change cost_grid_versions start_date/end_date from DATE to VARCHAR(6)
-- The app stores YYYYMM (month granularity), not a full calendar date.
-- USING clause converts any existing DATE values to YYYYMM format.
ALTER TABLE cost_grid_versions
  ALTER COLUMN start_date TYPE VARCHAR(6) USING to_char(start_date, 'YYYYMM'),
  ALTER COLUMN end_date   TYPE VARCHAR(6) USING to_char(end_date,   'YYYYMM');
