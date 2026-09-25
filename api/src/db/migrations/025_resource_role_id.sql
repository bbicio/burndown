-- Team resource → role by id (was free-text job_title, which the UI filled with roles.label
-- although the role strings in uploaded actuals are roles.code). Re-runnable: once job_title is
-- gone the DO block does nothing.
ALTER TABLE resources ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id) ON DELETE RESTRICT;

DO $$
DECLARE
  unmatched INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'resources' AND column_name = 'job_title'
  ) THEN
    UPDATE resources r SET role_id = COALESCE(
      (SELECT ro.id FROM roles ro WHERE lower(btrim(ro.code)) = lower(btrim(r.job_title)) ORDER BY ro.id LIMIT 1),
      (SELECT ro.id FROM roles ro WHERE lower(btrim(ro.label)) = lower(btrim(r.job_title)) ORDER BY ro.code LIMIT 1)
    )
    WHERE r.role_id IS NULL;

    SELECT count(*) INTO unmatched FROM resources WHERE role_id IS NULL;
    IF unmatched > 0 THEN
      RAISE EXCEPTION 'Migration 025: % resource(s) have a job_title that matches no roles.code or roles.label — create the role or fix/delete those resources, then re-run', unmatched;
    END IF;

    ALTER TABLE resources ALTER COLUMN role_id SET NOT NULL;
    ALTER TABLE resources DROP COLUMN job_title;
  END IF;
END $$;
