-- 006_pipeline_years.sql
-- Admin-managed pipeline years. Only active years appear on the pipeline board.

CREATE TABLE IF NOT EXISTS pipeline_years (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  year       INTEGER     NOT NULL UNIQUE,
  active     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_years_year ON pipeline_years(year DESC);

-- Seed the current calendar year as the first active pipeline
INSERT INTO pipeline_years (year, active)
VALUES (EXTRACT(YEAR FROM now())::INTEGER, true)
ON CONFLICT (year) DO NOTHING;
