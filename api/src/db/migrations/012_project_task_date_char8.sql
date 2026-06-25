-- Migration 012: widen project_tasks date columns from CHAR(6) to CHAR(8)
-- YYYYMM → YYYYMMDD; existing 6-char values are padded to YYYYMM01 (first of month)
ALTER TABLE project_tasks
  ALTER COLUMN start_date TYPE CHAR(8) USING CASE WHEN length(trim(start_date)) = 6 THEN trim(start_date) || '01' ELSE trim(start_date) END,
  ALTER COLUMN end_date   TYPE CHAR(8) USING CASE WHEN length(trim(end_date))   = 6 THEN trim(end_date)   || '01' ELSE trim(end_date)   END;
