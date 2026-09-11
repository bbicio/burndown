-- Migration 019: append-only Terms & Conditions version history.
-- terms_versions is never UPDATEd/DELETEd by application code after a row
-- is inserted — see api/src/routes/app-settings.js. app_settings.terms_content/
-- terms_version remain in use as draft-only storage (see that file).
CREATE TABLE terms_versions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version       INTEGER NOT NULL UNIQUE,
  content       TEXT NOT NULL,
  published_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_by  UUID REFERENCES users(id)
);

-- Backfill: the current live draft becomes version 1 of the history (or
-- whatever terms_version already is) — the only text still recoverable.
INSERT INTO terms_versions (version, content, published_at, published_by)
SELECT
  COALESCE((SELECT value::int FROM app_settings WHERE key = 'terms_version'), 1),
  (SELECT value FROM app_settings WHERE key = 'terms_content'),
  (SELECT updated_at FROM app_settings WHERE key = 'terms_content'),
  (SELECT updated_by FROM app_settings WHERE key = 'terms_content')
WHERE EXISTS (SELECT 1 FROM app_settings WHERE key = 'terms_content');
