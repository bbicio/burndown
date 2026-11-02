-- B-194: allow special-label POTs. Replaces pots_target_xor (exactly one of client_group_id / client_id)
-- with pots_target_one (exactly one of client_group_id / client_id / special_label), and makes
-- (special_label, year) unique when special_label is set.
-- Re-runnable: every statement drops or guards before it creates.
BEGIN;

ALTER TABLE pots DROP CONSTRAINT IF EXISTS pots_target_xor;

ALTER TABLE pots DROP CONSTRAINT IF EXISTS pots_target_one;
ALTER TABLE pots ADD CONSTRAINT pots_target_one
  CHECK (num_nonnulls(client_group_id, client_id, special_label) = 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pots_special_year
  ON pots(special_label, year) WHERE special_label IS NOT NULL;

COMMIT;
