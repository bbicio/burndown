-- Security cycle 3 (S-03): the database keeps only the sha256 of an invite or reset token, never the token.
-- Pending tokens are carried over as their hash (the mailed link keeps working); the old columns are dropped.
-- Re-runnable: the copy and the drop run only while the old column exists, so a second run hashes nothing twice.
-- The hash is the same as api/src/lib/two-step.js hashToken: sha256 of the UTF-8 token, lowercase hex.
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token_hash VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash  VARCHAR(64);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'invite_token') THEN
    UPDATE users SET invite_token_hash = encode(sha256(convert_to(invite_token, 'UTF8')), 'hex')
     WHERE invite_token IS NOT NULL;
    ALTER TABLE users DROP COLUMN invite_token;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'reset_token') THEN
    UPDATE users SET reset_token_hash = encode(sha256(convert_to(reset_token, 'UTF8')), 'hex')
     WHERE reset_token IS NOT NULL;
    ALTER TABLE users DROP COLUMN reset_token;
  END IF;
END $$;

COMMIT;
