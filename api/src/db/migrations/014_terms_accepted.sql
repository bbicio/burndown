-- Migration 014: T&C acceptance tracking
-- terms_version: the version the user last accepted (NULL = never accepted)
-- terms_accepted_at: timestamp of last acceptance

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS terms_version    INTEGER,
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
