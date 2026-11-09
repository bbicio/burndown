-- Two-step cycle 1: My profile page. The user's details are managed by an admin; a user sends a
-- rectification request instead, recorded here. password_changed_at feeds "Last changed on".
-- Re-runnable: every statement is guarded.
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS rectification_requests (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rectification_requests_user ON rectification_requests(user_id);

-- The admins' notifications of a request carry its text: they go when the request goes (anonymize).
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS rectification_request_id UUID
  REFERENCES rectification_requests(id) ON DELETE CASCADE;

COMMIT;
