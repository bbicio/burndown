-- Two-step cycle 2: email code as the second login step, trusted devices.
-- Re-runnable: every statement is guarded. No CHECK on the method: the allowed values live in
-- api/src/lib/two-step.js (TWO_STEP_METHODS).
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS two_step_method TEXT NOT NULL DEFAULT 'email';

CREATE TABLE IF NOT EXISTS login_challenges (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL UNIQUE,
  method          TEXT NOT NULL,
  code_hash       TEXT NOT NULL,
  code_expires_at TIMESTAMPTZ NOT NULL,
  code_sent_at    TIMESTAMPTZ,
  attempts        INT NOT NULL DEFAULT 0,
  sends           INT NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_challenges_user ON login_challenges(user_id);

CREATE TABLE IF NOT EXISTS trusted_devices (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  label        TEXT NOT NULL,
  kind         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON trusted_devices(user_id);

COMMIT;
