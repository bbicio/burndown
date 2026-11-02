-- Round the stored float noise in projects.phasing ({ "YYYYMM": amount }) to 2 decimals.
-- EUR only. Aborts if a non-EUR project has noise (needs a decision, not a blind rounding).
-- Re-runnable: once rounded, no row matches and the UPDATE touches 0 rows.
BEGIN;

DO $$
DECLARE
  bad INTEGER;
BEGIN
  SELECT count(*) INTO bad
  FROM projects p
  WHERE p.currency <> 'EUR'
    AND EXISTS (
      SELECT 1
      FROM jsonb_each_text(CASE WHEN jsonb_typeof(p.phasing) = 'object' THEN p.phasing ELSE '{}'::jsonb END) e(k, v)
      WHERE v::numeric <> round(v::numeric, 2)
    );
  IF bad > 0 THEN
    RAISE EXCEPTION 'Migration 030: % non-EUR project(s) have phasing values with more than 2 decimals — decide how to round them, then re-run', bad;
  END IF;
END $$;

UPDATE projects
SET phasing = (
  SELECT jsonb_object_agg(k, round(v::numeric, 2))
  FROM jsonb_each_text(CASE WHEN jsonb_typeof(phasing) = 'object' THEN phasing ELSE '{}'::jsonb END) e(k, v)
)
WHERE currency = 'EUR'
  AND phasing IS NOT NULL
  AND jsonb_typeof(phasing) = 'object'
  AND EXISTS (
    SELECT 1
    FROM jsonb_each_text(CASE WHEN jsonb_typeof(phasing) = 'object' THEN phasing ELSE '{}'::jsonb END) e(k, v)
    WHERE v::numeric <> round(v::numeric, 2)
  );

COMMIT;
