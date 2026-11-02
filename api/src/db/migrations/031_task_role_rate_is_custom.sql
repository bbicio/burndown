-- Currency cycle f3: a task role's rate can be marked Custom (written by hand).
-- rate_is_custom = true when the rate in rate_override was typed by a person; no backfill, existing rows start non-Custom.
-- Idempotent. Applied by hand.
ALTER TABLE task_roles ADD COLUMN IF NOT EXISTS rate_is_custom BOOLEAN NOT NULL DEFAULT false;
